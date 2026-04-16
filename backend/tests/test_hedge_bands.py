"""Tests for app.engine_v1.hedge_bands."""

import pytest

from app.engine_v1.hedge_bands import (
    BandViolation,
    HedgeBandResult,
    check_hedge_bands,
)


class TestBandViolation:
    def test_to_dict(self):
        v = BandViolation(
            bucket="2025-07", confidence="confirmed", effective_ratio=0.30,
            band_min=0.50, band_max=1.00, violation_type="UNDER_HEDGED",
            severity="CRITICAL",
        )
        d = v.to_dict()
        assert d["bucket"] == "2025-07"
        assert d["confidence"] == "confirmed"
        assert d["effective_ratio"] == 0.30
        assert d["band_min"] == 0.50
        assert d["band_max"] == 1.00
        assert d["violation_type"] == "UNDER_HEDGED"
        assert d["severity"] == "CRITICAL"


class TestHedgeBandResult:
    def test_defaults(self):
        r = HedgeBandResult()
        assert r.violations == []
        assert r.buckets_checked == 0
        assert r.buckets_compliant == 0
        assert r.all_compliant is True

    def test_to_dict_empty(self):
        r = HedgeBandResult()
        d = r.to_dict()
        assert d["violations"] == []
        assert d["buckets_checked"] == 0

    def test_to_dict_with_violations(self):
        v = BandViolation(
            bucket="2025-07", confidence="confirmed", effective_ratio=0.2,
            band_min=0.5, band_max=1.0, violation_type="UNDER_HEDGED",
            severity="CRITICAL",
        )
        r = HedgeBandResult(violations=[v], buckets_checked=1, all_compliant=False)
        d = r.to_dict()
        assert len(d["violations"]) == 1
        assert d["all_compliant"] is False


class TestCheckHedgeBands:
    def _policy_with_bands(self):
        return {
            "hedge_bands": {
                "confirmed": [0.50, 1.00],
                "forecast": [0.30, 0.90],
            }
        }

    def test_no_bands_configured(self):
        buckets = [{"bucket": "2025-07", "confidence": "confirmed"}]
        result = check_hedge_bands(buckets, {})
        assert result.all_compliant is True
        assert result.buckets_checked == 1
        assert result.buckets_compliant == 1

    def test_empty_bands_dict(self):
        result = check_hedge_bands(
            [{"bucket": "2025-07"}],
            {"hedge_bands": {}},
        )
        assert result.all_compliant is True

    def test_compliant_bucket(self):
        buckets = [{
            "bucket": "2025-07", "confidence": "confirmed",
            "hedge_position_local": 700_000,
            "commercial_exposure_local": 1_000_000,
        }]
        result = check_hedge_bands(buckets, self._policy_with_bands())
        assert result.all_compliant is True
        assert result.buckets_checked == 1
        assert result.buckets_compliant == 1
        assert len(result.violations) == 0

    def test_under_hedged_critical(self):
        # ratio=0.20 < 0.50*0.8=0.40 -> CRITICAL
        buckets = [{
            "bucket": "2025-07", "confidence": "confirmed",
            "hedge_position_local": 200_000,
            "commercial_exposure_local": 1_000_000,
        }]
        result = check_hedge_bands(buckets, self._policy_with_bands())
        assert result.all_compliant is False
        assert len(result.violations) == 1
        v = result.violations[0]
        assert v.violation_type == "UNDER_HEDGED"
        assert v.severity == "CRITICAL"

    def test_under_hedged_warning(self):
        # ratio=0.42 >= 0.50*0.8=0.40 -> WARNING
        buckets = [{
            "bucket": "2025-07", "confidence": "confirmed",
            "hedge_position_local": 420_000,
            "commercial_exposure_local": 1_000_000,
        }]
        result = check_hedge_bands(buckets, self._policy_with_bands())
        assert len(result.violations) == 1
        assert result.violations[0].severity == "WARNING"

    def test_over_hedged_warning(self):
        # ratio=1.1 <= 1.0*1.2=1.2 -> WARNING
        buckets = [{
            "bucket": "2025-07", "confidence": "confirmed",
            "hedge_position_local": 1_100_000,
            "commercial_exposure_local": 1_000_000,
        }]
        result = check_hedge_bands(buckets, self._policy_with_bands())
        assert len(result.violations) == 1
        v = result.violations[0]
        assert v.violation_type == "OVER_HEDGED"
        assert v.severity == "WARNING"

    def test_over_hedged_critical(self):
        # ratio=1.5 > 1.0*1.2=1.2 -> CRITICAL
        buckets = [{
            "bucket": "2025-07", "confidence": "confirmed",
            "hedge_position_local": 1_500_000,
            "commercial_exposure_local": 1_000_000,
        }]
        result = check_hedge_bands(buckets, self._policy_with_bands())
        assert len(result.violations) == 1
        assert result.violations[0].severity == "CRITICAL"

    def test_small_exposure_skipped(self):
        buckets = [{
            "bucket": "2025-07", "confidence": "confirmed",
            "hedge_position_local": 0.5,
            "commercial_exposure_local": 0.5,
        }]
        result = check_hedge_bands(buckets, self._policy_with_bands())
        assert result.all_compliant is True
        assert result.buckets_compliant == 1

    def test_forecast_band_used(self):
        buckets = [{
            "bucket": "2025-07", "confidence": "forecast",
            "hedge_position_local": 250_000,
            "commercial_exposure_local": 1_000_000,
        }]
        result = check_hedge_bands(buckets, self._policy_with_bands())
        assert len(result.violations) == 1
        assert result.violations[0].band_min == 0.30

    def test_unknown_confidence_no_band(self):
        buckets = [{
            "bucket": "2025-07", "confidence": "unknown",
            "hedge_position_local": 0,
            "commercial_exposure_local": 1_000_000,
        }]
        result = check_hedge_bands(buckets, self._policy_with_bands())
        assert result.all_compliant is True
        assert result.buckets_compliant == 1

    def test_band_with_less_than_2_elements(self):
        policy = {"hedge_bands": {"confirmed": [0.50]}}
        buckets = [{
            "bucket": "2025-07", "confidence": "confirmed",
            "hedge_position_local": 100,
            "commercial_exposure_local": 1_000_000,
        }]
        result = check_hedge_bands(buckets, policy)
        assert result.all_compliant is True

    def test_multiple_buckets_mixed_compliance(self):
        buckets = [
            {"bucket": "2025-07", "confidence": "confirmed",
             "hedge_position_local": 700_000, "commercial_exposure_local": 1_000_000},
            {"bucket": "2025-08", "confidence": "confirmed",
             "hedge_position_local": 100_000, "commercial_exposure_local": 1_000_000},
        ]
        result = check_hedge_bands(buckets, self._policy_with_bands())
        assert result.all_compliant is False
        assert result.buckets_checked == 2
        assert result.buckets_compliant == 1
        assert len(result.violations) == 1

    def test_fallback_field_names_mxn(self):
        buckets = [{
            "bucket": "2025-07", "confidence": "confirmed",
            "hedge_position_mxn": 700_000,
            "commercial_exposure_mxn": 1_000_000,
        }]
        result = check_hedge_bands(buckets, self._policy_with_bands())
        assert result.all_compliant is True

    def test_fallback_field_names_action(self):
        buckets = [{
            "bucket": "2025-07", "confidence": "confirmed",
            "action_local": 700_000,
            "gross_exposure_local": 1_000_000,
        }]
        result = check_hedge_bands(buckets, self._policy_with_bands())
        assert result.all_compliant is True

    def test_missing_bucket_key(self):
        buckets = [{"confidence": "confirmed", "commercial_exposure_local": 1000}]
        result = check_hedge_bands(buckets, self._policy_with_bands())
        assert result.buckets_checked == 1

    def test_missing_confidence_key(self):
        buckets = [{"bucket": "2025-07", "commercial_exposure_local": 1000}]
        result = check_hedge_bands(buckets, self._policy_with_bands())
        assert result.buckets_checked == 1

    def test_exactly_at_band_min(self):
        # ratio=0.50 == band_min -> compliant
        buckets = [{
            "bucket": "2025-07", "confidence": "confirmed",
            "hedge_position_local": 500_000,
            "commercial_exposure_local": 1_000_000,
        }]
        result = check_hedge_bands(buckets, self._policy_with_bands())
        assert result.all_compliant is True

    def test_exactly_at_band_max(self):
        # ratio=1.0 == band_max -> compliant
        buckets = [{
            "bucket": "2025-07", "confidence": "confirmed",
            "hedge_position_local": 1_000_000,
            "commercial_exposure_local": 1_000_000,
        }]
        result = check_hedge_bands(buckets, self._policy_with_bands())
        assert result.all_compliant is True

    def test_empty_bucket_results(self):
        result = check_hedge_bands([], self._policy_with_bands())
        assert result.all_compliant is True
        assert result.buckets_checked == 0

    def test_effective_ratio_value(self):
        buckets = [{
            "bucket": "2025-07", "confidence": "confirmed",
            "hedge_position_local": 300_000,
            "commercial_exposure_local": 1_000_000,
        }]
        result = check_hedge_bands(buckets, self._policy_with_bands())
        assert result.violations[0].effective_ratio == pytest.approx(0.3)

    def test_negative_hedge_position_uses_abs(self):
        """Negative hedge_position_local should use absolute value."""
        buckets = [{
            "bucket": "2025-07", "confidence": "confirmed",
            "hedge_position_local": -700_000,
            "commercial_exposure_local": 1_000_000,
        }]
        result = check_hedge_bands(buckets, self._policy_with_bands())
        assert result.all_compliant is True

    def test_zero_hedge_position_not_masked_by_action_field(self):
        """
        Regression test: a genuine zero hedge_position_local must be treated as 0.0,
        not fall through to action_local via a falsy `or` chain.

        Old bug: `0.0 or action_local` evaluated action_local because 0.0 is falsy.
        A fully-closed hedge position (hedge_position_local=0) would report the
        *intended action* instead of the actual zero position.
        """
        buckets = [{
            "bucket": "2025-07", "confidence": "confirmed",
            "hedge_position_local": 0.0,      # genuine zero — hedge fully exited
            "action_local": 700_000,           # intended action (must NOT be used)
            "commercial_exposure_local": 1_000_000,
        }]
        result = check_hedge_bands(buckets, self._policy_with_bands())
        # hedge_pos=0, exposure=1M → ratio=0.0 → CRITICAL UNDER_HEDGED
        assert result.all_compliant is False
        assert len(result.violations) == 1
        v = result.violations[0]
        assert v.violation_type == "UNDER_HEDGED"
        assert v.effective_ratio == pytest.approx(0.0)

    def test_zero_exposure_not_masked_by_gross_field(self):
        """
        Parallel regression test for the exposure fallback chain.
        A zero commercial_exposure_local must stop the search; gross_exposure fields
        must not be used as substitute.
        """
        buckets = [{
            "bucket": "2025-07", "confidence": "confirmed",
            "hedge_position_local": 700_000,
            "commercial_exposure_local": 0.0,  # genuine zero
            "gross_exposure_local": 1_000_000, # must NOT be used
        }]
        result = check_hedge_bands(buckets, self._policy_with_bands())
        # exposure < 1.0 threshold (it's 0.0) → skip → compliant
        assert result.all_compliant is True
        assert result.buckets_compliant == 1
