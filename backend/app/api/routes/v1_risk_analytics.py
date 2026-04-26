"""
Risk Analytics API -- /api/v1/risk

Exposes the previously-unwired engine_v1 modules as standalone endpoints:
  POST /v1/risk/hedge-effectiveness   -> ASC 815 / IFRS 9 effectiveness test
  POST /v1/risk/margin                -> SIMM-style margin requirements
  POST /v1/risk/concentration         -> Portfolio concentration limits
  POST /v1/risk/monte-carlo           -> Monte Carlo VaR/CVaR simulation
  GET  /v1/risk/summary/{run_id}      -> All risk metrics for a past run

All endpoints require JWT + calculate.run_production permission.
"""
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import get_current_user
from app.models.calculation_run import CalculationRun
from app.models.user import User
from app.services import rbac_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/risk", tags=["v1-risk-analytics"])
# ── Request/Response schemas ─────────────────────────────────────────

class HedgeEffectivenessRequest(BaseModel):
    hedged_item_changes: list[float] = Field(
        ..., min_length=2,
        description="Period-by-period fair value changes of the hedged item",
    )
    instrument_changes: list[float] = Field(
        ..., min_length=2,
        description="Period-by-period fair value changes of the hedging instrument",
    )
    method: str = Field(
        default="auto",
        description="'dollar_offset', 'regression', or 'auto' (picks regression if 30+ points)",
    )

class MarginRequest(BaseModel):
    hedge_actions: list[dict[str, Any]] = Field(
        ..., min_length=1,
        description="Per-bucket hedge actions (bucket, action_usd, instrument)",
    )
    market: dict[str, Any] = Field(default_factory=dict)
    policy: dict[str, Any] = Field(default_factory=dict)

class ConcentrationRequest(BaseModel):
    hedge_actions: list[dict[str, Any]] = Field(
        ..., min_length=1,
        description="Hedge actions with instrument/pair and notional_usd/action_usd",
    )
    policy: dict[str, Any] = Field(default_factory=dict)

class MonteCarloRequest(BaseModel):
    hedge_actions: list[dict[str, Any]] = Field(
        ..., min_length=1,
        description="Bucket results from hedge plan",
    )
    market: dict[str, Any] = Field(default_factory=dict)
    num_simulations: int = Field(default=10_000, ge=100, le=100_000)
    seed: int | None = Field(default=None, description="Random seed for deterministic results")
    confidence_levels: list[float] = Field(default=[0.95, 0.99])
    horizon_days: int = Field(default=1, ge=1, le=30)
# ── Auth helper ──────────────────────────────────────────────────────

async def _check_risk_permission(session: AsyncSession, user: User) -> None:
    if user.is_superuser:
        return
    perms = await rbac_service.get_permissions_by_user(session, user.id)
    if "calculate.run_production" not in perms and "trades.view" not in perms:
        raise HTTPException(status_code=403, detail="Missing permission: calculate.run_production or trades.view")
# ── Routes ───────────────────────────────────────────────────────────

@router.post("/hedge-effectiveness")
async def hedge_effectiveness(
    data: HedgeEffectivenessRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    ASC 815 / IFRS 9 hedge effectiveness test.

    Supports two methods:
    - dollar_offset: Ratio test (effective if 0.80-1.25)
    - regression: R-squared + slope test (requires 30+ data points)
    - auto: Uses regression if 30+ points, else dollar_offset

    Returns effectiveness result with is_effective flag.
    """
    await _check_risk_permission(session, current_user)

    if len(data.hedged_item_changes) != len(data.instrument_changes):
        raise HTTPException(status_code=422, detail="hedged_item_changes and instrument_changes must have the same length")

    from app.engine_v1.hedge_accounting import (
        assess_hedge_effectiveness_dollar_offset,
        assess_hedge_effectiveness_regression,
    )

    method = data.method
    if method == "auto":
        method = "regression" if len(data.hedged_item_changes) >= 30 else "dollar_offset"

    if method == "regression":
        result = assess_hedge_effectiveness_regression(data.hedged_item_changes, data.instrument_changes)
    else:
        result = assess_hedge_effectiveness_dollar_offset(data.hedged_item_changes, data.instrument_changes)

    return result.to_dict()
@router.post("/margin")
async def margin_analysis(
    data: MarginRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    SIMM-style margin requirements for hedge positions.

    Returns per-position initial/maintenance/stress margin and funding costs,
    plus portfolio-level totals and margin budget utilization.
    """
    await _check_risk_permission(session, current_user)

    from app.engine_v1.margin_model import compute_margin

    result = compute_margin(data.hedge_actions, data.market, data.policy)
    return result.to_dict()
@router.post("/concentration")
async def concentration_analysis(
    data: ConcentrationRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Portfolio concentration limits check.

    Returns per-instrument concentration percentages with OK/WARNING/BREACH status.
    Breach threshold is 2x the configured max_instrument_concentration_pct.
    """
    await _check_risk_permission(session, current_user)

    from app.engine_v1.concentration_limits import check_concentration_limits

    result = check_concentration_limits(data.hedge_actions, data.policy)
    return result.to_dict()
@router.post("/monte-carlo")
async def monte_carlo_analysis(
    data: MonteCarloRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Monte Carlo VaR/CVaR simulation.

    Generates N correlated FX rate simulations using Cholesky decomposition,
    computes hedged vs unhedged P&L distributions, and returns VaR/CVaR
    at configurable confidence levels.
    """
    await _check_risk_permission(session, current_user)

    from app.engine_v1.scenarios_monte_carlo import run_monte_carlo

    result = run_monte_carlo(
        buckets=data.hedge_actions,
        market=data.market,
        num_simulations=data.num_simulations,
        seed=data.seed,
        confidence_levels=data.confidence_levels,
        horizon_days=data.horizon_days,
    )
    return result.to_dict()
@router.get("/summary/{run_id}")
async def risk_summary_for_run(
    run_id: str,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Compute all risk metrics for a past calculation run.

    Loads the run from DB, extracts hedge plan buckets, and runs:
    - Margin model
    - Concentration limits
    - Hedge effectiveness (dollar-offset)

    Returns a composite risk summary.
    """
    await _check_risk_permission(session, current_user)

    row = await session.get(CalculationRun, run_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")
    if not current_user.is_superuser and row.company_id and row.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail=f"Run {run_id!r} not found")

    envelope = row.run_envelope or {}
    hedge_plan = envelope.get("hedge_plan", {})
    buckets = hedge_plan.get("buckets", [])
    policy_raw = envelope.get("policy", {})
    market_raw = envelope.get("market", {})

    result: dict[str, Any] = {"run_id": run_id}

    # Margin
    try:
        from app.engine_v1.margin_model import compute_margin
        if buckets:
            margin = compute_margin(buckets, market_raw, policy_raw)
            result["margin"] = margin.to_dict()
        else:
            result["margin"] = None
    except Exception as e:
        result["margin"] = None
        logger.warning("margin failed for run %s: %s", run_id, e)

    # Concentration
    try:
        from app.engine_v1.concentration_limits import check_concentration_limits
        if buckets:
            conc = check_concentration_limits(buckets, policy_raw)
            result["concentration"] = conc.to_dict()
        else:
            result["concentration"] = None
    except Exception as e:
        result["concentration"] = None
        logger.warning("concentration failed for run %s: %s", run_id, e)

    # Hedge effectiveness
    try:
        from app.engine_v1.hedge_accounting import assess_hedge_effectiveness_dollar_offset
        if buckets:
            hedged = [b.get("commercial_exposure_mxn", b.get("commercial_exposure_local", 0.0)) for b in buckets]
            instrument = [b.get("hedge_position_mxn", b.get("hedge_position_local", 0.0)) for b in buckets]
            eff = assess_hedge_effectiveness_dollar_offset(hedged, instrument)
            result["hedge_effectiveness"] = eff.to_dict()
        else:
            result["hedge_effectiveness"] = None
    except Exception as e:
        result["hedge_effectiveness"] = None
        logger.warning("hedge_effectiveness failed for run %s: %s", run_id, e)

    # Monte Carlo VaR/CVaR
    try:
        from app.engine_v1.scenarios_monte_carlo import run_monte_carlo
        if buckets:
            mc = run_monte_carlo(buckets, market_raw, num_simulations=10_000, seed=42)
            result["monte_carlo"] = mc.to_dict()
        else:
            result["monte_carlo"] = None
    except Exception as e:
        result["monte_carlo"] = None
        logger.warning("monte_carlo failed for run %s: %s", run_id, e)

    # Extended stress scenarios
    try:
        from app.engine_v1.scenarios_ext import INSTITUTIONAL_SCENARIOS, apply_extended_scenarios
        if buckets:
            exposure_usd = sum(
                abs(b.get("commercial_exposure_mxn", b.get("commercial_exposure_local", 0.0)))
                / max(market_raw.get("spot_rate", market_raw.get("spot_usdmxn", 17.15)), 0.01)
                for b in buckets
            )
            hedge_usd = sum(
                abs(b.get("hedge_position_mxn", b.get("hedge_position_local", 0.0)))
                / max(market_raw.get("spot_rate", market_raw.get("spot_usdmxn", 17.15)), 0.01)
                for b in buckets
            )
            policy_with_all = {**policy_raw, "enabled_scenarios": list(INSTITUTIONAL_SCENARIOS.keys())}
            margin_total = result.get("margin", {}).get("total_initial_margin_usd", 0.0) if result.get("margin") else 0.0
            ext = apply_extended_scenarios(exposure_usd, hedge_usd, market_raw, policy_with_all, margin_total)
            result["stress_scenarios"] = ext.to_dict()
        else:
            result["stress_scenarios"] = None
    except Exception as e:
        result["stress_scenarios"] = None
        logger.warning("stress_scenarios failed for run %s: %s", run_id, e)

    return result
# ── Stress Scenarios (institutional) ─────────────────────────────────

class StressScenariosRequest(BaseModel):
    exposure_usd: float = Field(..., description="Gross exposure in USD")
    hedge_notional_usd: float = Field(..., description="Total hedge notional in USD")
    market: dict[str, Any] = Field(default_factory=dict)
    margin_total: float = Field(default=0.0)
    scenarios: list[str] | None = Field(
        default=None,
        description="List of scenario names to run (null = all 5)",
    )
@router.post("/stress-scenarios")
async def stress_scenarios(
    data: StressScenariosRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Run institutional stress scenarios (Vol Crush, Slow Bleed,
    Margin Compression, Regime Shift, Funding Squeeze).
    """
    await _check_risk_permission(session, current_user)

    from app.engine_v1.scenarios_ext import INSTITUTIONAL_SCENARIOS, apply_extended_scenarios

    if data.scenarios:
        enabled = data.scenarios
    else:
        enabled = list(INSTITUTIONAL_SCENARIOS.keys())

    policy = {"enabled_scenarios": enabled}
    result = apply_extended_scenarios(
        exposure_usd=data.exposure_usd,
        hedge_notional_usd=data.hedge_notional_usd,
        market=data.market,
        policy=policy,
        margin_total=data.margin_total,
    )
    return result.to_dict()
# ── Composite Risk Dashboard ─────────────────────────────────────────

class CompositeRiskRequest(BaseModel):
    hedge_actions: list[dict[str, Any]] = Field(
        ..., min_length=1,
        description="Bucket results from hedge plan",
    )
    market: dict[str, Any] = Field(default_factory=dict)
    policy: dict[str, Any] = Field(default_factory=dict)
    num_simulations: int = Field(default=10_000, ge=100, le=100_000)
    seed: int | None = Field(default=42)
    confidence_levels: list[float] = Field(default=[0.90, 0.95, 0.99, 0.995])
    horizon_days: int = Field(default=1, ge=1, le=30)
@router.post("/composite")
async def composite_risk(
    data: CompositeRiskRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Composite risk analysis: Monte Carlo + Stress Scenarios +
    Factor Covariance in one call.
    """
    await _check_risk_permission(session, current_user)

    result: dict[str, Any] = {}
    spot = data.market.get("spot_rate", data.market.get("spot_usdmxn", 17.15))

    # Monte Carlo VaR/CVaR
    try:
        from app.engine_v1.scenarios_monte_carlo import run_monte_carlo
        mc = run_monte_carlo(
            buckets=data.hedge_actions,
            market=data.market,
            num_simulations=data.num_simulations,
            seed=data.seed,
            confidence_levels=data.confidence_levels,
            horizon_days=data.horizon_days,
        )
        result["monte_carlo"] = mc.to_dict()
    except Exception as e:
        result["monte_carlo"] = None
        logger.warning("composite monte_carlo failed: %s", e)

    # Extended stress scenarios
    try:
        from app.engine_v1.scenarios_ext import INSTITUTIONAL_SCENARIOS, apply_extended_scenarios
        exposure_usd = sum(
            abs(b.get("commercial_exposure_mxn", b.get("commercial_exposure_local", 0.0)))
            / max(spot, 0.01) for b in data.hedge_actions
        )
        hedge_usd = sum(
            abs(b.get("hedge_position_mxn", b.get("hedge_position_local", 0.0)))
            / max(spot, 0.01) for b in data.hedge_actions
        )
        policy_ext = {**data.policy, "enabled_scenarios": list(INSTITUTIONAL_SCENARIOS.keys())}
        ext = apply_extended_scenarios(exposure_usd, hedge_usd, data.market, policy_ext)
        result["stress_scenarios"] = ext.to_dict()
    except Exception as e:
        result["stress_scenarios"] = None
        logger.warning("composite stress_scenarios failed: %s", e)

    # Factor covariance risk decomposition
    try:
        from app.engine_v1.factor_covariance import compute_factor_covariance
        exposures: dict[str, float] = {}
        hedges_map: dict[str, float] = {}
        for b in data.hedge_actions:
            pair = b.get("pair", "USDMXN")
            exp_local = b.get("commercial_exposure_mxn", b.get("commercial_exposure_local", 0.0))
            hdg_local = b.get("hedge_position_mxn", b.get("hedge_position_local", 0.0))
            exposures[pair] = exposures.get(pair, 0.0) + (exp_local / max(spot, 0.01))
            hedges_map[pair] = hedges_map.get(pair, 0.0) + (hdg_local / max(spot, 0.01))
        fcov = compute_factor_covariance(exposures, hedges_map, data.market)
        result["factor_covariance"] = fcov.to_dict()
    except Exception as e:
        result["factor_covariance"] = None
        logger.warning("composite factor_covariance failed: %s", e)

    return result
# ── Counterparty Risk ────────────────────────────────────────────────

class CounterpartyRiskRequest(BaseModel):
    positions: list[dict[str, Any]] = Field(
        ..., min_length=1,
        description="Positions with counterparty_id, counterparty_name, notional_usd, mtm_usd, isda_threshold_usd",
    )
    volatility_annual: float = Field(default=0.10, ge=0.01, le=1.0)
    time_horizon_years: float = Field(default=1.0, ge=0.01, le=10.0)
    confidence: float = Field(default=0.975, ge=0.90, le=0.999)
@router.post("/counterparty")
async def counterparty_risk(
    data: CounterpartyRiskRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Per-counterparty FX exposure and PFE (Potential Future Exposure)
    using Basel simplified approach.
    """
    await _check_risk_permission(session, current_user)

    from app.engine_v1.counterparty_risk import compute_counterparty_exposure

    result = compute_counterparty_exposure(
        positions=data.positions,
        volatility_annual=data.volatility_annual,
        time_horizon_years=data.time_horizon_years,
        confidence=data.confidence,
    )
    return result.to_dict()
# ── Credit Duration Mapping ──────────────────────────────────────────

class CreditDurationRequest(BaseModel):
    equity_delta: float = Field(..., description="Net equity delta exposure in USD")
    market: dict[str, Any] = Field(default_factory=dict)
    policy: dict[str, Any] = Field(default_factory=dict)
    equity_vol: float | None = Field(default=None, ge=0.01, le=2.0)
    credit_vol: float | None = Field(default=None, ge=0.01, le=2.0)
@router.post("/credit-duration")
async def credit_duration(
    data: CreditDurationRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Map equity exposure to credit spread duration equivalent (HYG/LQD sizing).
    """
    await _check_risk_permission(session, current_user)

    from app.engine_v1.credit_duration import map_credit_duration

    result = map_credit_duration(
        equity_delta=data.equity_delta,
        policy=data.policy,
        equity_vol=data.equity_vol,
        credit_vol=data.credit_vol,
        market=data.market,
    )
    return result.to_dict()
# ── Vega-VIX Mapping ────────────────────────────────────────────────

class VegaMappingRequest(BaseModel):
    portfolio_vega: float = Field(..., description="Net portfolio vega ($/vol point)")
    market: dict[str, Any] = Field(default_factory=dict)
    policy: dict[str, Any] = Field(default_factory=dict)
    target_tenor_months: int = Field(default=3, ge=1, le=24)
@router.post("/vega-mapping")
async def vega_mapping(
    data: VegaMappingRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Map portfolio vega exposure to equivalent VIX contract notional
    with term structure adjustment.
    """
    await _check_risk_permission(session, current_user)

    from app.engine_v1.vol_mapping import map_vega_to_vix

    result = map_vega_to_vix(
        portfolio_vega=data.portfolio_vega,
        market=data.market,
        policy=data.policy,
        target_tenor_months=data.target_tenor_months,
    )
    return result.to_dict()
