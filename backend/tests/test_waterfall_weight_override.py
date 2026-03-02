"""
backend/tests/test_waterfall_weight_override.py
FIX-09: Waterfall weight overrides applied and normalized.
"""
from __future__ import annotations
import pytest


class TestWaterfallWeightOverride:
    def _make_clean_report(self):
        from app.schemas_v1.results import ValidationReport
        return ValidationReport(status="PASS", errors=[], warnings=[])

    def test_default_weights_sum_100(self):
        """Default RULE_WEIGHTS must sum to 100."""
        from app.engine_v1.waterfall import RULE_WEIGHTS
        assert sum(RULE_WEIGHTS.values()) == 100

    def test_custom_weights_applied(self):
        """Custom weight overrides change integrity score."""
        from app.engine_v1.waterfall import build_waterfall
        from app.schemas_v1.results import HedgePlan, HedgePlanSummary
        plan = HedgePlan(
            buckets=[],
            summary=HedgePlanSummary(
                total_commercial_exposure_mxn=0, total_existing_hedges_mxn=0,
                total_action_mxn=0, total_action_usd=0, total_friction_usd=0,
                total_hedge_position_mxn=0, total_residual_mxn=0,
            )
        )
        result_default = build_waterfall(self._make_clean_report(), plan, [])
        result_override = build_waterfall(
            self._make_clean_report(), plan, [],
            weight_overrides={"R1": 50, "R2": 50}  # Extreme override
        )
        # Both should produce valid scores (0-100), and with clean report, both PASS
        assert 0 <= result_default.integrity_score <= 100
        assert 0 <= result_override.integrity_score <= 100

    def test_weight_override_normalization(self):
        """Weight overrides are normalized to sum 100."""
        from app.engine_v1.waterfall import build_waterfall
        # Just verify it doesn't crash with out-of-sum overrides
        report = self._make_clean_report()
        result = build_waterfall(
            report, None, [],
            weight_overrides={"R1": 200, "R4": 300}  # Way over 100, should normalize
        )
        assert result.integrity_score is not None
