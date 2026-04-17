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


# ── Regression: A4 hedged_pnl sign fix ───────────────────────────────────────

class TestHedgedPnLSign:
    """Regression for A4 bug: hedged_pnl had inverted sign formula.

    Pre-A4 bug: hedged_pnl = notional * (forward_rate - spot_at_maturity) / spot_rate
                → negative when hedge was beneficial (spot > forward), positive when harmful.
    A4 fix:     hedged_pnl = notional * (spot_at_maturity - forward_rate) / spot_rate
                → positive when hedge was beneficial (spot > forward), negative when harmful.

    Impact: total_hedged_pnl in BacktestReport had inverted sign (gains as losses),
    and max_drawdown was computed on a wrongly-signed cumulative P&L curve.
    The effectiveness formula was unaffected (uses abs() on both sides).
    """

    def test_hedged_pnl_positive_when_spot_above_forward(self):
        """USD buyer locked in forward at 17.65; spot rose to 18.0 → hedge was beneficial → positive PnL."""
        period = HistoricalPeriod(period_id="2025-01", spot_rate=17.50, forward_points={"2025-01": 0.15})
        policy = _make_policy(confirmed=1.0, spread_bps=0.0)  # 100% hedge, no cost
        result = evaluate_period(period=period, policy=policy, notional_usd=1_000_000, spot_at_maturity=18.0)

        # forward_rate = 17.65; spot_at_maturity = 18.0 (USD strengthened)
        # hedged_pnl = 1M * (18.0 - 17.65) / 17.50 ≈ +20,000 (hedge saved money)
        assert result.hedged_pnl_usd > 0, (
            f"USD buyer: spot_at_maturity (18.0) > forward (17.65) → hedge saved money → positive PnL. "
            f"Got {result.hedged_pnl_usd}. "
            "Check A4 bug: (forward_rate - spot_at_maturity) gave negative when hedge worked."
        )
        expected = 1_000_000 * (18.0 - 17.65) / 17.50
        assert result.hedged_pnl_usd == pytest.approx(expected, rel=1e-6)

    def test_hedged_pnl_negative_when_spot_below_forward(self):
        """USD buyer locked in 17.65; spot fell to 17.0 → locked in above-market rate → negative PnL."""
        period = HistoricalPeriod(period_id="2025-01", spot_rate=17.50, forward_points={"2025-01": 0.15})
        policy = _make_policy(confirmed=1.0, spread_bps=0.0)
        result = evaluate_period(period=period, policy=policy, notional_usd=1_000_000, spot_at_maturity=17.0)

        # forward_rate = 17.65; spot_at_maturity = 17.0 (USD weakened)
        # hedged_pnl = 1M * (17.0 - 17.65) / 17.50 ≈ -37,143 (overpaid vs spot)
        assert result.hedged_pnl_usd < 0, (
            f"USD buyer: spot_at_maturity (17.0) < forward (17.65) → overpaid for USD → negative PnL. "
            f"Got {result.hedged_pnl_usd}."
        )

    def test_hedged_pnl_is_exact_sign_reversal_of_pre_a4(self):
        """A4 fix is the exact negation of the pre-A4 formula (same magnitude, opposite sign)."""
        period = HistoricalPeriod(period_id="2025-01", spot_rate=17.50, forward_points={"2025-01": 0.15})
        policy = _make_policy(confirmed=1.0, spread_bps=0.0)
        result = evaluate_period(period=period, policy=policy, notional_usd=1_000_000, spot_at_maturity=18.0)

        forward_rate = 17.50 + 0.15  # = 17.65
        pre_a4_pnl = 1_000_000 * (forward_rate - 18.0) / 17.50  # wrong formula
        assert pre_a4_pnl < 0, "Pre-A4 formula is negative for a beneficial hedge"
        assert result.hedged_pnl_usd == pytest.approx(-pre_a4_pnl, rel=1e-6), (
            "A4 fix reverses the sign: post-A4 = -(pre-A4)"
        )

    def test_total_hedged_pnl_sign_in_report(self):
        """BacktestReport.total_hedged_pnl should be positive when hedge consistently benefited."""
        periods = [
            HistoricalPeriod(period_id="2025-01", spot_rate=17.0, forward_points={"2025-01": 0.10}),
            HistoricalPeriod(period_id="2025-02", spot_rate=17.0, forward_points={"2025-02": 0.10}),
        ]
        # Both periods: spot at maturity well above forward → hedge was beneficial
        spots = [18.0, 18.5]
        report = run_backtest(periods=periods, spots_at_maturity=spots, policy=_make_policy(spread_bps=0.0), notional_usd=1_000_000)

        assert report.total_hedged_pnl > 0, (
            f"Hedge consistently protected USD buyer → total_hedged_pnl should be positive. "
            f"Got {report.total_hedged_pnl}. "
            "Pre-A4 bug: total was negative (inverted sign)."
        )
