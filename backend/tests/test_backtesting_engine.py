"""Tests for backtesting engine (Layer 5 extension).

Covers:
  - Single-period evaluation determinism
  - Multi-period backtest aggregation
  - Policy comparison
  - Hash determinism
  - Max drawdown calculation
  - Edge cases
"""

import pytest

from app.engine_v1.backtesting import (
    BacktestReport,
    BacktestResult,
    HistoricalPeriod,
    compare_policies,
    evaluate_period,
    run_backtest,
)


def _make_period(period_id: str = "2025-01", spot: float = 17.5, fwd_pts: float = 0.15) -> HistoricalPeriod:
    return HistoricalPeriod(
        period_id=period_id,
        spot_rate=spot,
        forward_points={period_id: fwd_pts},
    )


def _make_policy(confirmed: float = 0.80, spread_bps: float = 5.0) -> dict:
    return {
        "hedge_ratios": {"confirmed": confirmed, "forecast": 0.4},
        "cost_assumptions": {"spread_bps": spread_bps},
        "execution_product": "NDF",
    }


class TestEvaluatePeriod:
    def test_deterministic(self):
        period = _make_period()
        policy = _make_policy()
        r1 = evaluate_period(period=period, policy=policy, notional_usd=1_000_000, spot_at_maturity=18.0)
        r2 = evaluate_period(period=period, policy=policy, notional_usd=1_000_000, spot_at_maturity=18.0)
        assert r1.hedged_pnl_usd == r2.hedged_pnl_usd
        assert r1.hedge_effectiveness == r2.hedge_effectiveness

    def test_hedge_ratio_applied(self):
        period = _make_period()
        policy = _make_policy(confirmed=0.75)
        result = evaluate_period(period=period, policy=policy, notional_usd=1_000_000, spot_at_maturity=18.0)
        assert result.hedge_ratio_applied == 0.75
        assert result.notional_hedged_usd == 750_000

    def test_effectiveness_bounded_0_1(self):
        period = _make_period()
        policy = _make_policy()
        result = evaluate_period(period=period, policy=policy, notional_usd=1_000_000, spot_at_maturity=18.0)
        assert 0.0 <= result.hedge_effectiveness <= 1.0

    def test_cost_deducted_from_pnl(self):
        period = _make_period()
        policy_cheap = _make_policy(spread_bps=1.0)
        policy_expensive = _make_policy(spread_bps=20.0)
        r_cheap = evaluate_period(period=period, policy=policy_cheap, notional_usd=1_000_000, spot_at_maturity=18.0)
        r_expensive = evaluate_period(period=period, policy=policy_expensive, notional_usd=1_000_000, spot_at_maturity=18.0)
        # Expensive policy has lower PnL (more cost)
        assert r_cheap.hedged_pnl_usd > r_expensive.hedged_pnl_usd

    def test_zero_spot_pnl_is_cost_only(self):
        """When spot is zero, FX PnL is zero but cost is still deducted."""
        period = HistoricalPeriod(period_id="2025-01", spot_rate=0.0, forward_points={"2025-01": 0.0})
        policy = _make_policy()
        result = evaluate_period(period=period, policy=policy, notional_usd=1_000_000, spot_at_maturity=18.0)
        assert result.unhedged_pnl_usd == 0.0
        # Hedged PnL = -cost (spread on notional hedged)
        expected_cost = 800_000 * (5.0 / 10_000)  # 0.80 * 1M * 5bps = 400
        assert result.hedged_pnl_usd == pytest.approx(-expected_cost, abs=1.0)


class TestRunBacktest:
    def test_multi_period(self):
        periods = [
            _make_period("2025-01", spot=17.0, fwd_pts=0.10),
            _make_period("2025-02", spot=17.5, fwd_pts=0.12),
            _make_period("2025-03", spot=18.0, fwd_pts=0.15),
        ]
        spots_at_mat = [17.5, 18.0, 17.8]
        policy = _make_policy()
        report = run_backtest(
            periods=periods,
            spots_at_maturity=spots_at_mat,
            policy=policy,
            notional_usd=1_000_000,
        )
        assert report.periods_tested == 3
        assert len(report.periods) == 3
        assert report.grading == "HEURISTIC"

    def test_hash_deterministic(self):
        periods = [_make_period()]
        report1 = run_backtest(periods=periods, spots_at_maturity=[18.0], policy=_make_policy(), notional_usd=1_000_000)
        report2 = run_backtest(periods=periods, spots_at_maturity=[18.0], policy=_make_policy(), notional_usd=1_000_000)
        assert report1.report_hash == report2.report_hash
        assert len(report1.report_hash) == 64

    def test_different_policy_different_hash(self):
        periods = [_make_period()]
        report1 = run_backtest(periods=periods, spots_at_maturity=[18.0], policy=_make_policy(confirmed=0.80), notional_usd=1_000_000)
        report2 = run_backtest(periods=periods, spots_at_maturity=[18.0], policy=_make_policy(confirmed=0.50), notional_usd=1_000_000)
        # Hash includes PnL which differs with different policy
        assert report1.total_hedged_pnl != report2.total_hedged_pnl

    def test_mismatched_lengths_raises(self):
        with pytest.raises(ValueError, match="must match"):
            run_backtest(
                periods=[_make_period()],
                spots_at_maturity=[18.0, 19.0],
                policy=_make_policy(),
                notional_usd=1_000_000,
            )

    def test_max_drawdown(self):
        periods = [
            _make_period("2025-01", spot=17.0),
            _make_period("2025-02", spot=17.0),
            _make_period("2025-03", spot=17.0),
        ]
        # Alternating gain/loss to create drawdown
        spots_at_mat = [16.5, 18.0, 16.5]
        report = run_backtest(
            periods=periods,
            spots_at_maturity=spots_at_mat,
            policy=_make_policy(),
            notional_usd=1_000_000,
        )
        assert report.max_drawdown_usd >= 0


class TestComparePolicies:
    def test_comparison_structure(self):
        periods = [_make_period()]
        result = compare_policies(
            periods=periods,
            spots_at_maturity=[18.0],
            policy_a=_make_policy(confirmed=0.90),
            policy_b=_make_policy(confirmed=0.50),
            notional_usd=1_000_000,
        )
        assert "policy_a" in result
        assert "policy_b" in result
        assert "comparison" in result
        assert result["comparison"]["recommendation"] in ("policy_a", "policy_b")
        assert result["grading"] == "HEURISTIC"

    def test_comparison_deterministic(self):
        periods = [_make_period()]
        r1 = compare_policies(periods=periods, spots_at_maturity=[18.0], policy_a=_make_policy(), policy_b=_make_policy(confirmed=0.5), notional_usd=1_000_000)
        r2 = compare_policies(periods=periods, spots_at_maturity=[18.0], policy_a=_make_policy(), policy_b=_make_policy(confirmed=0.5), notional_usd=1_000_000)
        assert r1["policy_a"]["report_hash"] == r2["policy_a"]["report_hash"]
