"""Tests for scenario engine with hand-calculated values."""

from app.engine.scenarios import SIGMAS, compute_scenarios
from app.schemas.market import MarketSnapshot
from app.schemas.results import BucketResult


def test_scenario_math():
    spot = 17.15
    market = MarketSnapshot(
        as_of="2025-06-15T12:00:00Z",
        spot_usdmxn=spot,
        forward_points_by_month={"2025-07": 0.035},
    )
    bucket = BucketResult(
        bucket="2025-07",
        confirmed_flow_mxn=-10_000_000,
        forecast_flow_mxn=0,
        commercial_exposure_mxn=-10_000_000,
        existing_hedges_mxn=-5_000_000,
        target_signed_mxn=10_000_000,
        action_mxn=15_000_000,
        action_direction="BUY_MXN_SELL_USD",
        forward_rate=17.185,
        carry_note="test",
        action_usd=872854.81,
        friction_usd=291.55,
        suppressed=False,
        hedge_position_mxn=10_000_000,
        residual_mxn=0,
    )

    results = compute_scenarios([bucket], market)

    assert results.sigmas == SIGMAS
    assert len(results.per_bucket) == 4  # 4 sigmas x 1 bucket

    # Check sigma=+10%
    r10 = [r for r in results.per_bucket if r.sigma == 0.10][0]
    shocked = 17.15 * 1.10  # 18.865
    assert abs(r10.shocked_spot - shocked) < 1e-6

    # unhedged = -10M / 18.865
    expected_unhedged = -10_000_000 / shocked
    assert abs(r10.unhedged_usd - expected_unhedged) < 1e-2

    # hedged = (10M / 17.185) + (0 / 18.865)
    expected_hedged = 10_000_000 / 17.185 + 0 / shocked
    assert abs(r10.hedged_usd - expected_hedged) < 1e-2


def test_all_sigmas_present():
    market = MarketSnapshot(
        as_of="2025-06-15T12:00:00Z",
        spot_usdmxn=17.15,
        forward_points_by_month={"2025-07": 0.035},
    )
    bucket = BucketResult(
        bucket="2025-07",
        confirmed_flow_mxn=-10_000_000, forecast_flow_mxn=0,
        commercial_exposure_mxn=-10_000_000, existing_hedges_mxn=0,
        target_signed_mxn=10_000_000, action_mxn=10_000_000,
        action_direction="BUY_MXN_SELL_USD", forward_rate=17.185,
        carry_note="test", action_usd=0, friction_usd=0,
        suppressed=False, hedge_position_mxn=10_000_000, residual_mxn=0,
    )
    results = compute_scenarios([bucket], market)
    assert len(results.totals) == 4
    sigma_vals = {t.sigma for t in results.totals}
    assert sigma_vals == {-0.10, -0.05, 0.05, 0.10}
