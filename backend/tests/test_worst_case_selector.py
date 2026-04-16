"""Tests for engine_v1/worst_case_selector.py — Cross-scenario worst-case identification."""

import pytest

from app.engine_v1.worst_case_selector import (
    select_worst_case,
    WorstCaseResult,
    ScenarioLoss,
)


class TestSelectWorstCase:
    def test_empty_inputs(self):
        result = select_worst_case({}, {})
        assert isinstance(result, WorstCaseResult)
        assert result.scenario_count == 0
        assert result.worst_case_scenario == ""

    def test_base_scenarios_totals_list(self):
        base = {
            "totals": [
                {"sigma": -0.10, "total_unhedged_usd": -50_000, "total_hedged_usd": -10_000},
                {"sigma": -0.05, "total_unhedged_usd": -25_000, "total_hedged_usd": -5_000},
                {"sigma": 0.05, "total_unhedged_usd": 25_000, "total_hedged_usd": 5_000},
                {"sigma": 0.10, "total_unhedged_usd": 50_000, "total_hedged_usd": 10_000},
            ]
        }
        result = select_worst_case(base, {})
        assert result.scenario_count == 4
        assert result.worst_case_loss == -10_000  # worst post-hedge
        assert "sigma_-0.1" in result.worst_case_scenario

    def test_extended_scenarios(self):
        extended = {
            "scenarios": [
                {"scenario_name": "Vol Crush", "pre_hedge_loss_usd": -80_000, "post_hedge_loss_usd": -30_000},
                {"scenario_name": "Regime Shift", "pre_hedge_loss_usd": -120_000, "post_hedge_loss_usd": -60_000},
                {"scenario_name": "Funding Squeeze", "pre_hedge_loss_usd": -40_000, "post_hedge_loss_usd": -15_000},
            ]
        }
        result = select_worst_case({}, extended)
        assert result.scenario_count == 3
        assert result.worst_case_scenario == "Regime Shift"
        assert result.worst_case_loss == -60_000
        assert result.pre_hedge_worst_case == -120_000

    def test_combined_base_and_extended(self):
        base = {
            "totals": [
                {"sigma": -0.10, "total_unhedged_usd": -50_000, "total_hedged_usd": -10_000},
            ]
        }
        extended = {
            "scenarios": [
                {"scenario_name": "Regime Shift", "pre_hedge_loss_usd": -120_000, "post_hedge_loss_usd": -60_000},
            ]
        }
        result = select_worst_case(base, extended)
        assert result.scenario_count == 2
        assert result.worst_case_scenario == "Regime Shift"  # -60K is worse than -10K

    def test_delta_improvement(self):
        extended = {
            "scenarios": [
                {"scenario_name": "Test", "pre_hedge_loss_usd": -100_000, "post_hedge_loss_usd": -20_000},
            ]
        }
        result = select_worst_case({}, extended)
        assert result.delta_improvement == pytest.approx(80_000)  # |pre| - |post|

    def test_per_bucket_format(self):
        base = {
            "per_bucket": [
                {
                    "bucket": "2026-04",
                    "shocks": [
                        {"shock": -0.10, "pre_hedge_usd": -30_000, "post_hedge_usd": -5_000},
                        {"shock": 0.10, "pre_hedge_usd": 30_000, "post_hedge_usd": 5_000},
                    ],
                }
            ]
        }
        result = select_worst_case(base, {})
        assert result.scenario_count == 2

    def test_to_dict(self):
        extended = {
            "scenarios": [
                {"scenario_name": "Test", "pre_hedge_loss_usd": -100, "post_hedge_loss_usd": -20},
            ]
        }
        result = select_worst_case({}, extended)
        d = result.to_dict()
        assert "worst_case_scenario" in d
        assert "all_scenarios" in d
        assert isinstance(d["all_scenarios"], list)
        assert d["all_scenarios"][0]["scenario_name"] == "Test"

    def test_delta_improvement_uses_same_scenario(self):
        """
        Regression test: delta_improvement must be pre_hedge - post_hedge for the
        SAME worst-case scenario, not a cross-scenario subtraction.

        Scenario A: small pre-loss (-10K), large post-loss (-50K) → worst post-hedge
        Scenario B: large pre-loss (-200K), small post-loss (-5K)

        Old buggy code selected pre_worst from Scenario B and worst from Scenario A,
        yielding delta_improvement = |−200K| − |−50K| = 150K (cross-scenario nonsense).
        Fixed code: delta_improvement = |−10K| − |−50K| = −40K (hedge made things worse).
        """
        extended = {
            "scenarios": [
                {"scenario_name": "Worst Post", "pre_hedge_loss_usd": -10_000, "post_hedge_loss_usd": -50_000},
                {"scenario_name": "Worst Pre", "pre_hedge_loss_usd": -200_000, "post_hedge_loss_usd": -5_000},
            ]
        }
        result = select_worst_case({}, extended)
        assert result.worst_case_scenario == "Worst Post"
        assert result.worst_case_loss == -50_000
        # pre_hedge_worst_case must come from the same worst-case scenario
        assert result.pre_hedge_worst_case == -10_000
        # delta: |pre| - |post| for the same scenario
        assert result.delta_improvement == pytest.approx(-40_000)
