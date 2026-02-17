"""Tests for kernel computation with hand-calculated values."""

from datetime import date, datetime, timezone

from app.engine.kernel import compute_hedge_plan
from app.engine.normalizer import normalize_hedges, normalize_trades
from app.schemas.hedges import HedgeRow
from app.schemas.market import MarketSnapshot
from app.schemas.policy import PolicyConfig, HedgeRatios, CostAssumptions
from app.schemas.trades import TradeRow


def _setup_simple():
    """Single bucket, single confirmed AP trade, one existing hedge."""
    trades = [
        TradeRow(record_id="T1", entity="E", type="AP", currency="MXN",
                 amount=10_000_000, value_date=date(2025, 7, 15), status="CONFIRMED"),
    ]
    hedges = [
        HedgeRow(hedge_id="H1", instrument="NDF", direction="SELL_MXN_BUY_USD",
                 notional_mxn=5_000_000, value_date=date(2025, 7, 15), status="ACTIVE"),
    ]
    market = MarketSnapshot(
        as_of=datetime(2025, 6, 15, tzinfo=timezone.utc),
        spot_usdmxn=17.15,
        forward_points_by_month={"2025-07": 0.035},
    )
    policy = PolicyConfig(
        hedge_ratios=HedgeRatios(confirmed=1.0, forecast=0.5),
        cost_assumptions=CostAssumptions(spread_bps=5.0),
        execution_product="NDF",
        min_trade_size_usd=50000,
    )
    return trades, hedges, market, policy


def test_single_bucket_kernel():
    trades, hedges, market, policy = _setup_simple()
    trades_df = normalize_trades(trades)
    hedges_df = normalize_hedges(hedges)
    plan, _ = compute_hedge_plan(trades_df, hedges_df, market, policy)

    assert len(plan.buckets) == 1
    b = plan.buckets[0]

    # Hand-calculated:
    # confirmed_flow = -10M (AP)
    assert b.confirmed_flow_mxn == -10_000_000
    # forecast_flow = 0
    assert b.forecast_flow_mxn == 0
    # commercial = -10M
    assert b.commercial_exposure_mxn == -10_000_000
    # existing = -5M (SELL_MXN)
    assert b.existing_hedges_mxn == -5_000_000
    # target = -1 * (-10M * 1.0 + 0 * 0.5) = 10M
    assert b.target_signed_mxn == 10_000_000
    # action = 10M - (-5M) = 15M
    assert b.action_mxn == 15_000_000
    assert b.action_direction == "BUY_MXN_SELL_USD"
    # forward_rate = 17.15 + 0.035 = 17.185
    assert abs(b.forward_rate - 17.185) < 1e-6
    # hedge_position = -5M + 15M = 10M
    assert b.hedge_position_mxn == 10_000_000
    # residual = -10M + 10M = 0
    assert b.residual_mxn == 0


def test_suppression():
    """Trade below min_trade_size_usd should be suppressed."""
    trades = [
        TradeRow(record_id="T1", entity="E", type="AP", currency="MXN",
                 amount=100_000, value_date=date(2025, 7, 15), status="CONFIRMED"),
    ]
    market = MarketSnapshot(
        as_of=datetime(2025, 6, 15, tzinfo=timezone.utc),
        spot_usdmxn=17.15,
        forward_points_by_month={"2025-07": 0.035},
    )
    policy = PolicyConfig(
        hedge_ratios=HedgeRatios(confirmed=1.0, forecast=0.5),
        cost_assumptions=CostAssumptions(spread_bps=5.0),
        execution_product="NDF",
        min_trade_size_usd=50000,
    )
    trades_df = normalize_trades(trades)
    hedges_df = normalize_hedges([])
    plan, traces = compute_hedge_plan(trades_df, hedges_df, market, policy)

    b = plan.buckets[0]
    # action = 100K MXN, USD equiv = 100K/17.15 ≈ 5831 < 50000
    assert b.suppressed is True
    # hedge_position should NOT include the suppressed action
    assert b.hedge_position_mxn == 0
    # trace should log the suppression
    assert any("filtered_small_notional" in str(t.data) for t in traces)


def test_pure_function_determinism():
    trades, hedges, market, policy = _setup_simple()
    trades_df = normalize_trades(trades)
    hedges_df = normalize_hedges(hedges)
    plan1, _ = compute_hedge_plan(trades_df, hedges_df, market, policy)
    plan2, _ = compute_hedge_plan(trades_df, hedges_df, market, policy)
    for b1, b2 in zip(plan1.buckets, plan2.buckets):
        assert b1.model_dump() == b2.model_dump()
