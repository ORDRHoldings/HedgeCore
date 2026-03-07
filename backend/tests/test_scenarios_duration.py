"""
backend/tests/test_scenarios_duration.py
FIX-02: DV01-aware rate shock computation from position tenor.
"""
from __future__ import annotations
import pytest


class TestDurationAwareScenarios:
    def test_short_dated_lower_rate_impact(self):
        """1-month positions (0.083yr) have lower rate impact than 12-month (1.0yr)."""
        from app.engine_v1.scenarios_ext import apply_extended_scenarios
        short_durations = [{"notional_usd": 1_000_000, "duration_years": 0.083}]
        long_durations = [{"notional_usd": 1_000_000, "duration_years": 1.0}]
        policy = {"enabled_scenarios": ["regime_shift"]}
        market = {"spot_rate": 17.15}

        result_short = apply_extended_scenarios(
            2_000_000, 1_000_000, market, policy, 0,
            position_durations=short_durations,
        )
        result_long = apply_extended_scenarios(
            2_000_000, 1_000_000, market, policy, 0,
            position_durations=long_durations,
        )
        # Long-dated should have significantly more rate impact
        # regime_shift has rate_shock_bps=200 which drives post_hedge_loss
        short_loss = abs(result_short.scenarios[0].post_hedge_loss_usd)
        long_loss = abs(result_long.scenarios[0].post_hedge_loss_usd)
        assert long_loss > short_loss, "Long-dated positions must have higher rate impact"

    def test_compute_position_durations_basic(self):
        """Duration from value_date: 2 months = ~61/365.25 years."""
        from app.engine_v1.scenarios_ext import compute_position_durations
        actions = [
            {"action_usd": 500_000, "value_date": "2025-08-15"},
            {"action_usd": 500_000, "value_date": "2026-06-15"},
        ]
        durations = compute_position_durations(actions, as_of_date="2025-06-15")
        assert len(durations) == 2
        assert durations[0]["duration_years"] == pytest.approx(61 / 365.25, abs=0.01)
        assert durations[1]["duration_years"] == pytest.approx(365 / 365.25, abs=0.02)

    def test_compute_position_durations_yyyy_mm_bucket(self):
        """YYYY-MM bucket → mid-month estimate."""
        from app.engine_v1.scenarios_ext import compute_position_durations
        actions = [{"action_usd": 100_000, "value_date": "2025-09"}]
        durations = compute_position_durations(actions, as_of_date="2025-06-01")
        assert len(durations) == 1
        # Sep-15 minus Jun-01 = ~106 days ≈ 0.29 years
        assert 0.20 < durations[0]["duration_years"] < 0.40

    def test_backward_compat_no_durations(self):
        """Without position_durations, falls back to duration_fraction (or 0.25)."""
        from app.engine_v1.scenarios_ext import apply_extended_scenarios
        policy = {"enabled_scenarios": ["regime_shift"]}
        result = apply_extended_scenarios(
            2_000_000, 1_000_000, {"spot_rate": 17.15}, policy
        )
        assert result.scenario_count > 0
