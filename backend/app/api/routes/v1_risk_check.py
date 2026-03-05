"""POST /v1/risk-check -- institutional risk gate endpoint.

Accepts a policy_instance_id, a list of position UUIDs, a market snapshot,
and an optional pre-computed hedge plan. Runs the decision_gate engine and
returns a deterministic verdict (APPROVE | APPROVE_WITH_CONDITIONS | REJECT)
with reasons, conditions, and residual risks.

Every call emits a SYSTEM audit event (non-fatal if DB write fails).
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.engine.decision_gate import decision_gate
from app.models.audit_event import GENESIS_HASH, AuditEvent, build_audit_event
from app.models.position import Position
from app.models.user import User
from app.services import rbac_service


def _canonical_json(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1", tags=["v1-risk-check"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class RiskCheckRequest(BaseModel):
    policy_instance_id: UUID | None = None
    position_ids: list[UUID] = Field(..., min_length=1, max_length=50)
    market_snapshot: dict
    hedge_plan: dict | None = None


class RiskCheckResponse(BaseModel):
    verdict: str  # APPROVE | APPROVE_WITH_CONDITIONS | REJECT
    reasons: list[dict]
    conditions: list[dict]
    residual_risks: list[dict]
    decision_hash: str
    inputs_used: dict | None = None
    checked_at: str  # ISO timestamp
    policy_revision_id: str | None = None
    policy_hash: str | None = None


# ---------------------------------------------------------------------------
# Audit helper
# ---------------------------------------------------------------------------


async def _emit_risk_check_audit(
    session: AsyncSession,
    user: User,
    policy_instance_id: str,
    verdict: str,
    reason_count: int,
    has_hedge_plan: bool,
    position_count: int,
) -> None:
    """Non-fatal audit emission for risk check calls."""
    try:
        q = (
            select(AuditEvent.event_hash)
            .where(AuditEvent.company_id == user.company_id)
            .order_by(AuditEvent.created_at.desc())
            .limit(1)
        )
        result = await session.execute(q)
        prev_hash = result.scalars().first() or GENESIS_HASH

        actor_role = None
        try:
            roles = await rbac_service.get_user_roles(session, user.id) if hasattr(rbac_service, "get_user_roles") else []
            if roles:
                actor_role = sorted(roles, key=lambda r: getattr(r, "hierarchy_level", 99))[0].name
        except Exception:
            pass

        event = build_audit_event(
            event_type="SYSTEM",
            description=f"Risk check: {verdict} — {reason_count} reason(s)",
            payload={
                "verdict": verdict,
                "position_count": position_count,
                "has_hedge_plan": has_hedge_plan,
            },
            prev_event_hash=prev_hash,
            company_id=user.company_id,
            branch_id=user.branch_id,
            actor_id=user.id,
            actor_email=user.email,
            actor_role=actor_role,
            entity_type="risk_check",
            entity_id=policy_instance_id,
        )
        session.add(event)
        await session.commit()
    except Exception:
        logger.warning(
            "Failed to emit audit event for risk check (policy_instance_id=%s)",
            policy_instance_id,
            exc_info=True,
        )


# ---------------------------------------------------------------------------
# POST /v1/risk-check
# ---------------------------------------------------------------------------


@router.post("/risk-check", response_model=RiskCheckResponse)
async def risk_check(
    request: RiskCheckRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Run the decision gate against a policy instance and a set of positions.

    Requires: calculate.recommend permission (superusers bypass).

    Optionally accepts a pre-computed hedge_plan from POST /v1/calculate.
    When no hedge_plan is provided, a zero-cost sentinel plan is used so the
    gate can still evaluate policy-level cost and worst-case thresholds.
    """
    # RBAC check
    if not current_user.is_superuser:
        perms = await rbac_service.get_permissions_by_user(session, current_user.id)
        if "calculate.recommend" not in perms:
            raise HTTPException(
                status_code=403,
                detail="Missing permission: calculate.recommend",
            )

    # --- Resolve active policy revision ---
    from app.services import policy_service as _pol_svc
    from app.services.policy_revision_service import get_latest_revision

    pinned_revision_id: str | None = None
    pinned_policy_hash: str | None = None

    # If policy_instance_id not provided, derive from positions or active policy
    resolved_policy_id = request.policy_instance_id
    if resolved_policy_id is None:
        # Try to derive from positions' policy_id field
        q_pos = select(Position).where(
            Position.id.in_(request.position_ids),
            Position.company_id == current_user.company_id,
        )
        pos_rows = list((await session.execute(q_pos)).scalars().all())
        derived_ids = [p.policy_id for p in pos_rows if p.policy_id is not None]
        if derived_ids:
            resolved_policy_id = derived_ids[0]
        else:
            # Fallback: use active policy instance
            active_inst = await _pol_svc.get_active_instance(session, current_user)
            if active_inst:
                resolved_policy_id = active_inst.id

    if resolved_policy_id is not None:
        latest_rev = await get_latest_revision(session, resolved_policy_id)
        if latest_rev:
            pinned_revision_id = str(latest_rev.id)
            pinned_policy_hash = latest_rev.policy_hash

    # --- Fetch positions (tenant-scoped) ---
    q = select(Position).where(
        Position.id.in_(request.position_ids),
        Position.company_id == current_user.company_id,
    )
    rows = list((await session.execute(q)).scalars().all())

    # --- Build payload for decision_gate ---
    portfolio_notional = sum(float(p.amount) for p in rows)
    payload = {
        "portfolio_notional_usd": portfolio_notional,
        "market_snapshot": request.market_snapshot,
    }

    # --- Normalize hedge_plan from /v1/calculate response format ---
    def _normalize_plan(raw: dict) -> dict:
        """
        Translate a /v1/calculate response into the decision_gate plan format.

        /v1/calculate returns:
          { run_id, hedge_plan: { buckets: [...], summary: {...} },
            scenario_results: { totals: [...] }, ... }

        decision_gate expects:
          { sized_hedges: [{contracts: N}], costs: {total: float},
            summary: { worst_case: {net_pnl_usd: float},
                       hedge_effectiveness: {min: float} } }
        """
        # Already in gate format (no run_id key at top level)
        if "run_id" not in raw and "sized_hedges" in raw:
            return raw

        # Full calculate response — extract inner hedge_plan
        inner = raw.get("hedge_plan", raw)
        scenario_results = raw.get("scenario_results", {})

        # Build sized_hedges from buckets (one synthetic hedge per non-suppressed bucket)
        buckets = inner.get("buckets", [])
        sized_hedges = [
            {"contracts": 1, "action_mxn": b.get("action_mxn", 0)}
            for b in buckets
            if not b.get("suppressed", False) and b.get("action_mxn", 0) != 0
        ]

        # Extract cost from hedge_plan summary
        hp_summary = inner.get("summary", {})
        friction_usd = float(hp_summary.get("total_friction_usd", 0.0) or 0.0)

        # Extract worst case from scenario_results.totals (pick minimum hedged_usd)
        totals = scenario_results.get("totals", [])
        worst_net_pnl: float | None = None
        for t in totals:
            hedged = t.get("hedged_usd")
            if hedged is not None:
                v = float(hedged)
                if worst_net_pnl is None or v < worst_net_pnl:
                    worst_net_pnl = v

        # Compute hedge effectiveness ratio from hedge plan summary
        total_exposure = float(hp_summary.get("total_commercial_exposure_mxn", 0.0) or 0.0)
        total_hedge    = float(hp_summary.get("total_hedge_position_mxn", 0.0) or 0.0)
        eff_ratio: float | None = (
            abs(total_hedge / total_exposure) if total_exposure != 0 else 1.0
        )

        return {
            "sized_hedges": sized_hedges,
            "costs": {"total": friction_usd},
            "summary": {
                "worst_case": {
                    "net_pnl_usd": worst_net_pnl if worst_net_pnl is not None else 0.0,
                    "scenario_id": None,
                },
                "hedge_effectiveness": {"min": eff_ratio},
            },
            "rejections": {},
        }

    # --- Call decision_gate ---
    if request.hedge_plan is not None:
        plan = _normalize_plan(request.hedge_plan)
    else:
        plan = {
            "costs": {"total": 0.0},
            "summary": {
                "worst_case": {"net_pnl_usd": 0.0},
                "hedge_effectiveness": {"min": 1.0},
            },
            "sized_hedges": [],
            "rejections": {},
        }

    result = decision_gate(payload=payload, plan=plan, policy={})

    checked_at = datetime.now(UTC).isoformat()

    # --- Compute endpoint-level decision_hash ---
    # SHA-256 of canonical_json({verdict, reasons, conditions, checked_at})
    # This is distinct from the engine's internal hash and provides a
    # reproducible fingerprint over the response fields + timestamp.
    endpoint_decision_hash = hashlib.sha256(
        _canonical_json({
            "verdict":        result["verdict"],
            "reasons":        result.get("reasons", []),
            "conditions":     result.get("conditions", []),
            "checked_at":     checked_at,
        }).encode("utf-8")
    ).hexdigest()

    # --- Emit audit event (non-fatal) ---
    await _emit_risk_check_audit(
        session=session,
        user=current_user,
        policy_instance_id=str(resolved_policy_id) if resolved_policy_id else "unknown",
        verdict=result["verdict"],
        reason_count=len(result.get("reasons", [])),
        has_hedge_plan=request.hedge_plan is not None,
        position_count=len(request.position_ids),
    )

    # --- Assemble response ---
    return RiskCheckResponse(
        verdict=result["verdict"],
        reasons=result.get("reasons", []),
        conditions=result.get("conditions", []),
        residual_risks=result.get("residual_risks", []),
        decision_hash=endpoint_decision_hash,
        inputs_used=result.get("inputs_used"),
        checked_at=checked_at,
        policy_revision_id=pinned_revision_id,
        policy_hash=pinned_policy_hash,
    )
