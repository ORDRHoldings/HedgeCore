"""
v1_ui.py — UI-specific endpoints: onboarding summary + user UI preferences.
Tenant-safe, RBAC-gated, deterministic.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import get_current_user
from app.models.user import User
from app.models.position import Position
from app.models.policy import PolicyInstance
from app.models.calculation_run import CalculationRun
from app.models.execution_proposal import ExecutionProposal

router = APIRouter(prefix="/v1/ui", tags=["ui"])


# ---------------------------------------------------------------------------
# Response / Request schemas
# ---------------------------------------------------------------------------

class OnboardingSummaryResponse(BaseModel):
    exposures_open_count: int
    policy_assigned: bool
    policy_id: Optional[str]
    last_run_id: Optional[str]
    last_run_at: Optional[str]
    pending_proposals_count: int
    pending_approvals_count: int
    net_notional_base: Optional[str]
    net_notional_amount: Optional[float]
    last_run_estimated_cost: Optional[float]
    risk_gate_status: str  # "online" | "offline" | "unknown"


class UiPrefsResponse(BaseModel):
    show_quickstart: bool
    quickstart_dismissed_at: Optional[str]


class UiPrefsUpdate(BaseModel):
    show_quickstart: Optional[bool] = None


# ---------------------------------------------------------------------------
# Exported pure helpers (testable without DB)
# ---------------------------------------------------------------------------

def build_safe_summary_defaults() -> dict:
    return {
        "exposures_open_count": 0,
        "policy_assigned": False,
        "policy_id": None,
        "last_run_id": None,
        "last_run_at": None,
        "pending_proposals_count": 0,
        "pending_approvals_count": 0,
        "net_notional_base": None,
        "net_notional_amount": None,
        "last_run_estimated_cost": None,
        "risk_gate_status": "unknown",
    }


def get_show_quickstart_from_prefs(prefs: Optional[dict]) -> bool:
    if not prefs:
        return True
    return bool(prefs.get("show_quickstart", True))


def apply_prefs_update(existing: dict, *, show_quickstart: Optional[bool] = None) -> dict:
    prefs = dict(existing)
    if show_quickstart is not None:
        prefs["show_quickstart"] = show_quickstart
        if not show_quickstart:
            prefs["quickstart_dismissed_at"] = datetime.now(timezone.utc).isoformat()
    return prefs


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/onboarding-summary", response_model=OnboardingSummaryResponse)
async def get_onboarding_summary(
    request: Request,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> OnboardingSummaryResponse:
    """
    Returns a tenant-scoped snapshot of system readiness for the Quick Start Window.
    All queries are wrapped in try/except; failures return safe zero defaults.
    """
    data = build_safe_summary_defaults()

    company_id = current_user.company_id

    # 1. exposures_open_count
    try:
        open_statuses = ("NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE")
        q = (
            select(func.count())
            .select_from(Position)
            .where(
                Position.company_id == company_id,
                Position.is_active == True,  # noqa: E712
                Position.execution_status.in_(open_statuses),
            )
        )
        result = await db.execute(q)
        data["exposures_open_count"] = result.scalar() or 0
    except Exception:
        pass

    # 2+3. policy_assigned + policy_id
    try:
        q = (
            select(PolicyInstance)
            .where(
                PolicyInstance.company_id == company_id,
                PolicyInstance.is_active == True,  # noqa: E712
            )
            .order_by(PolicyInstance.activated_at.desc())
            .limit(1)
        )
        result = await db.execute(q)
        instance = result.scalars().first()
        if instance:
            data["policy_assigned"] = True
            data["policy_id"] = str(instance.id)
    except Exception:
        pass

    # 4+5. last_run_id + last_run_at
    try:
        q = (
            select(CalculationRun)
            .where(CalculationRun.company_id == company_id)
            .order_by(CalculationRun.created_at.desc())
            .limit(1)
        )
        result = await db.execute(q)
        run = result.scalars().first()
        if run:
            data["last_run_id"] = str(run.id)
            data["last_run_at"] = run.created_at.isoformat() if run.created_at else None
    except Exception:
        pass

    # 6. pending_proposals_count (status = PROPOSED)
    try:
        q = (
            select(func.count())
            .select_from(ExecutionProposal)
            .where(
                ExecutionProposal.company_id == company_id,
                ExecutionProposal.status == "PROPOSED",
            )
        )
        result = await db.execute(q)
        data["pending_proposals_count"] = result.scalar() or 0
    except Exception:
        pass

    # 7. pending_approvals_count (status = APPROVED — awaiting execute)
    try:
        q = (
            select(func.count())
            .select_from(ExecutionProposal)
            .where(
                ExecutionProposal.company_id == company_id,
                ExecutionProposal.status == "APPROVED",
            )
        )
        result = await db.execute(q)
        data["pending_approvals_count"] = result.scalar() or 0
    except Exception:
        pass

    # 8. net_notional_base + net_notional_amount (open positions, USD)
    try:
        open_statuses = ("NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE")
        q = (
            select(func.sum(Position.amount))
            .where(
                Position.company_id == company_id,
                Position.is_active == True,  # noqa: E712
                Position.execution_status.in_(open_statuses),
                Position.currency == "USD",
            )
        )
        result = await db.execute(q)
        total = result.scalar()
        if total is not None:
            data["net_notional_base"] = "USD"
            data["net_notional_amount"] = float(total)
    except Exception:
        pass

    # 9. last_run_estimated_cost: None (complex calc, v1 deferred)
    # 10. risk_gate_status: "unknown" (no live health check in v1)

    # Non-blocking audit event
    try:
        from app.models.audit_event import AuditEvent, build_audit_event, GENESIS_HASH

        _prev_q = (
            select(AuditEvent.event_hash)
            .where(AuditEvent.company_id == company_id)
            .order_by(AuditEvent.created_at.desc())
            .limit(1)
        )
        _prev_result = await db.execute(_prev_q)
        _prev_hash = _prev_result.scalars().first() or GENESIS_HASH

        _evt = build_audit_event(
            event_type="SYSTEM",
            description="UI: onboarding summary fetched",
            payload={},
            prev_event_hash=_prev_hash,
            company_id=company_id,
            branch_id=current_user.branch_id,
            actor_id=current_user.id,
            actor_email=current_user.email,
            entity_type="ui_summary",
            entity_id=None,
        )
        db.add(_evt)
        await db.commit()
    except Exception:
        pass

    return OnboardingSummaryResponse(**data)


@router.get("/prefs", response_model=UiPrefsResponse)
async def get_ui_prefs(
    current_user: User = Depends(get_current_user),
) -> UiPrefsResponse:
    """Returns current user's UI preferences with safe defaults."""
    prefs = current_user.ui_preferences or {}
    return UiPrefsResponse(
        show_quickstart=get_show_quickstart_from_prefs(prefs),
        quickstart_dismissed_at=prefs.get("quickstart_dismissed_at"),
    )


@router.patch("/prefs", response_model=UiPrefsResponse)
async def patch_ui_prefs(
    body: UiPrefsUpdate,
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> UiPrefsResponse:
    """Merges UI preference updates into the user row's JSONB field."""
    existing = dict(current_user.ui_preferences or {})
    updated = apply_prefs_update(existing, show_quickstart=body.show_quickstart)
    current_user.ui_preferences = updated
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    prefs = current_user.ui_preferences or {}
    return UiPrefsResponse(
        show_quickstart=get_show_quickstart_from_prefs(prefs),
        quickstart_dismissed_at=prefs.get("quickstart_dismissed_at"),
    )
