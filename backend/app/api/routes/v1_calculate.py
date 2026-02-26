"""POST /api/v1/calculate -- main pipeline endpoint.

Pipe & Filter: Validate -> Normalize -> Kernel -> Scenarios -> Audit -> Persist -> Response
Fail-closed: any CRITICAL validation error returns 422.

Phase 0: Every run is now persisted to the calculation_runs table (DB-backed).
The in-memory _run_store is kept as a fast cache (bounded to 50 items) but
every run also lands in the DB for permanence, replay, and audit chain.

Sprint 1.0: Every run now pins the active policy_revision_id + policy_hash so
the exact policy governing the calculation is provable for audit/replay.
"""

import logging
import uuid

_log = logging.getLogger(__name__)
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user_optional
from app.engine_v1.audit import build_run_envelope, build_trace_lite
from app.engine_v1.kernel import compute_hedge_plan
from app.engine_v1.normalizer import normalize_hedges, normalize_trades
from app.engine_v1.scenarios import compute_scenarios
from app.engine_v1.validator import validate_all
from app.models.calculation_run import CalculationRun
from app.models.user import User
from app.schemas_v1.hedges import HedgeRow
from app.schemas_v1.market import MarketSnapshot
from app.schemas_v1.policy import PolicyConfig
from app.schemas_v1.results import (
    CalculateRequest,
    CalculateResponse,
    TraceEvent,
)
from app.schemas_v1.trades import TradeRow

router = APIRouter(prefix="/v1", tags=["v1-calculate"])

# In-memory cache (bounded to 50 items) -- supplements DB persistence for fast access
_run_store: dict[str, CalculateResponse] = {}


def get_run(run_id: str) -> CalculateResponse | None:
    return _run_store.get(run_id)


# ?? Response schema for run list ??????????????????????????????????????????????

class RunSummary(BaseModel):
    run_id:       str
    inputs_hash:  str
    outputs_hash: str
    run_hash:     str
    trade_count:  int
    hedge_count:  int
    created_at:   str


class RunListResponse(BaseModel):
    items: list[RunSummary]
    total: int


# ?? Persist helper ????????????????????????????????????????????????????????????

async def _persist_run(
    session: AsyncSession,
    response: CalculateResponse,
    user: Optional[User],
    trades: list[TradeRow],
) -> None:
    """
    Write the run to calculation_runs. Non-fatal: if DB write fails, the
    calculation result is still returned (we log the failure but don't surface it).
    The in-memory cache already has the result.

    Sprint 1.0: Pins the active policy_revision_id + policy_hash onto the run row
    so the exact policy config governing this calculation is provable for audit/replay.
    """
    from app.services.policy_service import get_active_instance
    from app.services.policy_revision_service import get_latest_revision
    from app.models.policy_revision import compute_policy_hash

    envelope = response.run_envelope

    # Resolve active policy revision for this user (non-fatal)
    pinned_revision_id: Optional[str] = None
    pinned_policy_hash: Optional[str] = None
    if user:
        try:
            active_instance = await get_active_instance(session, user)
            if active_instance:
                latest_rev = await get_latest_revision(session, active_instance.id)
                if latest_rev:
                    pinned_revision_id = str(latest_rev.id)
                    pinned_policy_hash = latest_rev.policy_hash
        except Exception:
            _log.warning(
                "Failed to resolve active policy revision for run %s. "
                "policy_revision_id will be NULL for this run.",
                response.run_id, exc_info=True,
            )

    run_row = CalculationRun(
        id                 = response.run_id,
        company_id         = user.company_id if user else None,
        user_id            = user.id         if user else None,
        inputs_hash        = envelope.inputs_hash,
        outputs_hash       = envelope.outputs_hash,
        run_hash           = envelope.run_hash,
        position_ids       = [],   # populated by caller if position IDs are known
        run_envelope       = {
            # BUG-1 fix: persist hash chain + outputs so committee pack can read hedge_plan
            **envelope.model_dump(mode="json"),
            "hedge_plan":       response.hedge_plan.model_dump(mode="json") if response.hedge_plan else None,
            "scenario_results": response.scenario_results.model_dump(mode="json") if response.scenario_results else None,
        },
        trace_lite         = response.trace_lite.model_dump(mode="json") if response.trace_lite else None,
        trade_count        = len(trades),
        hedge_count        = len(response.hedge_plan.buckets) if response.hedge_plan else 0,
        policy_revision_id = pinned_revision_id,   # Sprint 1.0: pinned revision UUID
        policy_hash        = pinned_policy_hash,   # Sprint 1.0: SHA-256 of canonical config
    )
    session.add(run_row)
    await session.commit()


# ?? POST /v1/calculate ????????????????????????????????????????????????????????

@router.post("/calculate", response_model=CalculateResponse)
async def calculate(
    request: CalculateRequest,
    session: AsyncSession     = Depends(get_async_session),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    run_id = str(uuid.uuid4())
    trace_events: list[TraceEvent] = []

    # --- Step 0: Parse raw dicts into Pydantic models ---
    try:
        trades = [TradeRow(**t) if isinstance(t, dict) else t for t in request.trades]
    except ValidationError as e:
        raise HTTPException(status_code=422, detail={"parse_error": "trades", "errors": e.errors()})

    try:
        hedges = [HedgeRow(**h) if isinstance(h, dict) else h for h in request.hedges]
    except ValidationError as e:
        raise HTTPException(status_code=422, detail={"parse_error": "hedges", "errors": e.errors()})

    try:
        market = MarketSnapshot(**request.market) if isinstance(request.market, dict) else request.market
    except ValidationError as e:
        raise HTTPException(status_code=422, detail={"parse_error": "market", "errors": e.errors()})

    try:
        policy = PolicyConfig(**request.policy) if isinstance(request.policy, dict) else request.policy
    except ValidationError as e:
        raise HTTPException(status_code=422, detail={"parse_error": "policy", "errors": e.errors()})

    trace_events.append(
        TraceEvent(step="PARSE", timestamp=datetime.now(timezone.utc), detail="Input parsing complete.")
    )

    # --- Step 1: Validate (fail-closed) ---
    report = validate_all(trades, hedges, market, policy)
    trace_events.append(
        TraceEvent(
            step="VALIDATE",
            timestamp=datetime.now(timezone.utc),
            detail=f"Validation {report.status}. Errors: {len(report.errors)}, Warnings: {len(report.warnings)}.",
        )
    )

    if report.status == "FAIL":
        raise HTTPException(
            status_code=422,
            detail={"validation_report": report.model_dump(mode="json")},
        )

    # --- Step 2: Normalize ---
    trades_df = normalize_trades(trades)
    hedges_df = normalize_hedges(hedges)
    trace_events.append(
        TraceEvent(
            step="NORMALIZE",
            timestamp=datetime.now(timezone.utc),
            detail=f"Normalized {len(trades_df)} trades, {len(hedges_df)} hedges.",
        )
    )

    # --- Step 3: Kernel ---
    hedge_plan, kernel_traces = compute_hedge_plan(trades_df, hedges_df, market, policy)
    trace_events.extend(kernel_traces)
    trace_events.append(
        TraceEvent(
            step="KERNEL",
            timestamp=datetime.now(timezone.utc),
            detail=f"Hedge plan computed: {len(hedge_plan.buckets)} buckets.",
        )
    )

    # --- Step 4: Scenarios ---
    scenario_results = compute_scenarios(hedge_plan.buckets, market)
    trace_events.append(
        TraceEvent(
            step="SCENARIO",
            timestamp=datetime.now(timezone.utc),
            detail=f"Scenarios computed: {len(scenario_results.sigmas)} shocks x {len(hedge_plan.buckets)} buckets.",
        )
    )

    # --- Step 5: Audit + RunEnvelope ---
    trades_raw   = [t.model_dump(mode="json") for t in trades]
    hedges_raw   = [h.model_dump(mode="json") for h in hedges]
    market_raw   = market.model_dump(mode="json")
    policy_raw   = policy.model_dump(mode="json")
    outputs_raw  = {
        "hedge_plan":       hedge_plan.model_dump(mode="json"),
        "scenario_results": scenario_results.model_dump(mode="json"),
    }

    run_envelope = build_run_envelope(
        run_id=run_id,
        trades_raw=trades_raw,
        hedges_raw=hedges_raw,
        market_raw=market_raw,
        policy_raw=policy_raw,
        outputs_raw=outputs_raw,
    )

    trace_events.append(
        TraceEvent(
            step="AUDIT",
            timestamp=datetime.now(timezone.utc),
            detail=f"RunEnvelope built. inputs_hash={run_envelope.inputs_hash[:16]}... run_hash={run_envelope.run_hash[:16]}...",
        )
    )

    trace_lite = build_trace_lite(run_id, trace_events)

    # --- Assemble response ---
    response = CalculateResponse(
        run_id=run_id,
        validation_report=report,
        hedge_plan=hedge_plan,
        scenario_results=scenario_results,
        run_envelope=run_envelope,
        trace_lite=trace_lite,
    )

    # --- Step 6: Persist to DB (non-fatal) ---
    try:
        await _persist_run(session, response, current_user, trades)
    except Exception:
        # DB write failure is logged but never surfaces to the caller.
        # The in-memory cache still has the result for immediate use.
        import logging
        logging.getLogger(__name__).warning(
            f"Failed to persist run {run_id} to DB -- result still returned to caller",
            exc_info=True,
        )

    # Update in-memory cache (fast lookup for export endpoints)
    _run_store[run_id] = response
    if len(_run_store) > 50:
        oldest = next(iter(_run_store))
        del _run_store[oldest]

    return response


# ?? GET /v1/runs -- list persisted runs ???????????????????????????????????????

@router.get("/runs", response_model=RunListResponse)
async def list_runs(
    limit:        int           = Query(default=50, le=200, ge=1),
    session:      AsyncSession  = Depends(get_async_session),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """
    List calculation runs for the caller's company (or all runs for superusers).
    Returns summary rows (no JSONB payloads) for list rendering.
    """
    q = select(CalculationRun).order_by(CalculationRun.created_at.desc()).limit(limit)
    if current_user and not current_user.is_superuser and current_user.company_id:
        q = q.where(CalculationRun.company_id == current_user.company_id)
    rows = list((await session.execute(q)).scalars().all())

    items = [
        RunSummary(
            run_id       = r.id,
            inputs_hash  = r.inputs_hash,
            outputs_hash = r.outputs_hash,
            run_hash     = r.run_hash,
            trade_count  = r.trade_count,
            hedge_count  = r.hedge_count,
            created_at   = r.created_at.isoformat() if r.created_at else "",
        )
        for r in rows
    ]
    return {"items": items, "total": len(items)}


# ?? GET /v1/runs/{run_id} -- fetch full run detail ????????????????????????????

@router.get("/runs/{run_id}")
async def get_run_detail(
    run_id:       str,
    session:      AsyncSession  = Depends(get_async_session),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    """
    Fetch a single run by ID. Returns the full RunEnvelope + TraceLite JSONB.
    Fast path: checks in-memory cache first, then DB.
    Used for: run replay, audit drill-down, export.
    """
    # Fast path: in-memory cache
    cached = _run_store.get(run_id)
    if cached:
        return cached

    # DB lookup
    row = await session.get(CalculationRun, run_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")

    # Tenant check
    if (
        current_user
        and not current_user.is_superuser
        and row.company_id
        and row.company_id != current_user.company_id
    ):
        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")

    return {
        "run_id":             row.id,
        "run_envelope":       row.run_envelope,
        "trace_lite":         row.trace_lite,
        "trade_count":        row.trade_count,
        "hedge_count":        row.hedge_count,
        "inputs_hash":        row.inputs_hash,
        "outputs_hash":       row.outputs_hash,
        "run_hash":           row.run_hash,
        "policy_revision_id": row.policy_revision_id,   # BUG-2 fix: Sprint 1.0 policy pin
        "policy_hash":        row.policy_hash,           # BUG-2 fix: Sprint 1.0 policy pin
        "created_at":         row.created_at.isoformat() if row.created_at else None,
    }
