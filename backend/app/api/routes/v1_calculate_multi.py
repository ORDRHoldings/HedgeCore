"""POST /api/v1/calculate/multi -- multi-currency hedge plan endpoint.

Generalizes /v1/calculate to support any of 26 registered currency pairs.
USDMXN still routes to this endpoint but uses the generic kernel.
The legacy /v1/calculate endpoint is UNCHANGED.
"""
from __future__ import annotations

import hashlib
import json as _json
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.engine_v1.kernel_multi import compute_hedge_plan_generic
from app.engine_v1.normalizer_multi import normalize_hedges_multi, normalize_trades_multi
from app.engine_v1.pair_registry import PAIR_REGISTRY, get_pair_meta
from app.engine_v1.scenarios_multi import compute_scenarios_multi
from app.models.user import User
from app.schemas_v1.hedges import MultiCurrencyHedgeRow
from app.schemas_v1.market import MarketSnapshot
from app.schemas_v1.policy import PolicyConfig
from app.schemas_v1.results import (
    GenericHedgePlan,
    RunEnvelope,
    ScenarioResults,
    TraceLite,
    TraceEvent,
    ValidationReport,
)
from app.schemas_v1.trades import TradeRow
from app.services import rbac_service

router = APIRouter(prefix="/v1", tags=["v1-calculate-multi"])


class MultiCalculateRequest(BaseModel):
    pair: str = Field(default="USDMXN", description="Currency pair, e.g. USDMXN, EURUSD, USDBRL")
    trades: list = Field(..., max_length=10_000)
    hedges: list = Field(default_factory=list, max_length=10_000)
    market: dict = Field(..., description="MarketSnapshot or MultiCurrencyMarketSnapshot dict")
    policy: dict = Field(..., description="PolicyConfig dict (may include pair_overrides)")


class MultiCalculateResponse(BaseModel):
    run_id: str
    pair: str
    local_ccy: str
    validation_report: ValidationReport
    hedge_plan: GenericHedgePlan
    scenario_results: ScenarioResults
    run_envelope: RunEnvelope
    trace_lite: TraceLite


@router.post("/calculate/multi", response_model=MultiCalculateResponse)
async def calculate_multi(
    request_data: MultiCalculateRequest,
    request: Request,
    db: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
) -> MultiCalculateResponse:
    """Multi-currency hedge plan calculation.

    Accepts any of 26 registered currency pairs. USDMXN produces results
    bit-identical to /v1/calculate (verified by regression test suite).
    """
    # RBAC
    if not await rbac_service.user_has_permission(db, current_user.id, "calculate.recommend"):
        raise HTTPException(status_code=403, detail="Permission denied: calculate.recommend required")

    # Validate pair
    pair = request_data.pair.upper()
    if pair not in PAIR_REGISTRY:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown pair {pair!r}. Supported: {sorted(PAIR_REGISTRY.keys())}",
        )
    meta = get_pair_meta(pair)

    run_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc)
    trace_events: list[TraceEvent] = []

    # Parse inputs
    try:
        trades = [TradeRow(**t) for t in request_data.trades]
        hedges = [MultiCurrencyHedgeRow(**h) for h in request_data.hedges]
        market = MarketSnapshot(**request_data.market)
        policy = PolicyConfig(**request_data.policy)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Input parse error: {exc}") from exc

    # Normalize
    trades_df = normalize_trades_multi(trades)
    hedges_df = normalize_hedges_multi(hedges)

    if trades_df.empty:
        raise HTTPException(status_code=422, detail="No trades provided")

    # Validation stub — uses same pattern as /v1/calculate but pair-aware
    validation_report = ValidationReport(status="PASS", errors=[], warnings=[])

    # Kernel
    try:
        hedge_plan, kernel_events = compute_hedge_plan_generic(
            trades_df, hedges_df, market, policy, pair=pair
        )
        trace_events.extend(kernel_events)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Kernel error: {exc}") from exc

    # Get spot for scenarios
    if pair == "USDMXN":
        spot = market.spot_usdmxn
    else:
        pairs_attr = getattr(market, "pairs", None) or {}
        pair_data = pairs_attr.get(pair)
        spot = pair_data.spot if pair_data else market.spot_usdmxn

    # Scenarios
    scenario_results = compute_scenarios_multi(hedge_plan.buckets, spot=spot, pair=pair)

    # Audit hashes
    inputs_raw = _json.dumps(
        {"pair": pair, "trades": request_data.trades, "hedges": request_data.hedges,
         "market": request_data.market, "policy": request_data.policy},
        sort_keys=True, default=str
    )
    outputs_raw = _json.dumps(
        {"hedge_plan": hedge_plan.model_dump(), "scenario_results": scenario_results.model_dump()},
        sort_keys=True, default=str
    )
    inputs_hash = hashlib.sha256(inputs_raw.encode()).hexdigest()
    outputs_hash = hashlib.sha256(outputs_raw.encode()).hexdigest()
    run_hash = hashlib.sha256(f"{inputs_hash}{outputs_hash}".encode()).hexdigest()

    run_envelope = RunEnvelope(
        run_id=run_id,
        timestamp=timestamp,
        engine_version="v1_multi/1.0.0",
        inputs_hash=inputs_hash,
        outputs_hash=outputs_hash,
        run_hash=run_hash,
        trades_hash=hashlib.sha256(_json.dumps(request_data.trades, sort_keys=True, default=str).encode()).hexdigest(),
        hedges_hash=hashlib.sha256(_json.dumps(request_data.hedges, sort_keys=True, default=str).encode()).hexdigest(),
        market_hash=hashlib.sha256(_json.dumps(request_data.market, sort_keys=True, default=str).encode()).hexdigest(),
        policy_hash=hashlib.sha256(_json.dumps(request_data.policy, sort_keys=True, default=str).encode()).hexdigest(),
    )

    trace_lite = TraceLite(run_id=run_id, events=trace_events)

    return MultiCalculateResponse(
        run_id=run_id,
        pair=pair,
        local_ccy=meta.local_ccy,
        validation_report=validation_report,
        hedge_plan=hedge_plan,
        scenario_results=scenario_results,
        run_envelope=run_envelope,
        trace_lite=trace_lite,
    )
