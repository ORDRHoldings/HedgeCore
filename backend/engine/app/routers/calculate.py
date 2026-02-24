"""POST /api/v1/calculate -- main pipeline endpoint.

Pipe & Filter: Validate -> Normalize -> Kernel -> Scenarios -> Audit -> Response
Fail-closed: any CRITICAL validation error returns 422.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import ValidationError

from app.engine.audit import build_run_envelope, build_trace_lite
from app.engine.kernel import compute_hedge_plan
from app.engine.normalizer import normalize_hedges, normalize_trades
from app.engine.scenarios import compute_scenarios
from app.engine.validator import validate_all
from app.schemas.hedges import HedgeRow
from app.schemas.market import MarketSnapshot
from app.schemas.policy import PolicyConfig
from app.schemas.results import (
    CalculateRequest,
    CalculateResponse,
    TraceEvent,
)
from app.schemas.trades import TradeRow

router = APIRouter(tags=["calculate"])

# In-memory run store (POC only, no database)
_run_store: dict[str, CalculateResponse] = {}


def get_run(run_id: str) -> CalculateResponse | None:
    return _run_store.get(run_id)


@router.post("/calculate", response_model=CalculateResponse)
def calculate(request: CalculateRequest):
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

    # --- Step 5: Audit ---
    trades_raw = [t.model_dump(mode="json") for t in trades]
    hedges_raw = [h.model_dump(mode="json") for h in hedges]
    market_raw = market.model_dump(mode="json")
    policy_raw = policy.model_dump(mode="json")
    outputs_raw = {
        "hedge_plan": hedge_plan.model_dump(mode="json"),
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
            detail=f"RunEnvelope built. inputs_hash={run_envelope.inputs_hash[:16]}...",
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

    # Store for export endpoints
    _run_store[run_id] = response
    # Keep bounded
    if len(_run_store) > 50:
        oldest = next(iter(_run_store))
        del _run_store[oldest]

    return response
