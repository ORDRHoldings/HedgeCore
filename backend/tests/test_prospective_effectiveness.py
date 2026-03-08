"""Tests for prospective hedge effectiveness per IFRS 9.6.4.1(c)(iii).

Verifies:
- Critical terms match assessment
- Statistical forecast effectiveness
- Method dispatch
- Edge cases and boundary conditions

Closes audit finding #5 (prospective effectiveness coverage).
"""
import pytest
import json
import math


class TestCriticalTermsMatch:
    """ASC 815-20-25-79: Critical terms match assessment."""

    def test_all_terms_match(self):
        from app.engine_v1.prospective_effectiveness import assess_critical_terms_match

        result = assess_critical_terms_match(
            hedged_item={
                "notional": 1_000_000,
                "currency_pair": "USDMXN",
                "maturity_date": "2026-06-30",
                "underlying": "FX",
                "settlement_type": "NDF",
            },
            hedging_instrument={
                "notional": 1_000_000,
                "currency_pair": "USDMXN",
                "maturity_date": "2026-06-30",
                "underlying": "FX",
                "settlement_type": "NDF",
            },
        )
        assert result.matched is True
        assert result.is_effective is True
        assert len(result.terms_mismatched) == 0
        assert len(result.terms_matched) == 5
        assert "ASC 815" in result.rationale

    def test_notional_within_tolerance(self):
        """5% tolerance for rounding/sizing differences."""
        from app.engine_v1.prospective_effectiveness import assess_critical_terms_match

        result = assess_critical_terms_match(
            hedged_item={
                "notional": 1_000_000,
                "currency_pair": "USDMXN",
                "maturity_date": "2026-06-30",
                "underlying": "FX",
                "settlement_type": "NDF",
            },
            hedging_instrument={
                "notional": 1_040_000,
                "currency_pair": "USDMXN",
                "maturity_date": "2026-06-30",
                "underlying": "FX",
                "settlement_type": "NDF",
            },
        )
        assert result.matched is True  # 4% difference < 5% tolerance

    def test_notional_exceeds_tolerance(self):
        from app.engine_v1.prospective_effectiveness import assess_critical_terms_match

        result = assess_critical_terms_match(
            hedged_item={
                "notional": 1_000_000,
                "currency_pair": "USDMXN",
                "maturity_date": "2026-06-30",
                "underlying": "FX",
                "settlement_type": "NDF",
            },
            hedging_instrument={
                "notional": 1_100_000,
                "currency_pair": "USDMXN",
                "maturity_date": "2026-06-30",
                "underlying": "FX",
                "settlement_type": "NDF",
            },
        )
        assert result.matched is False  # 10% > 5%
        assert "notional" in result.terms_mismatched

    def test_currency_mismatch(self):
        from app.engine_v1.prospective_effectiveness import assess_critical_terms_match

        result = assess_critical_terms_match(
            hedged_item={
                "notional": 1_000_000,
                "currency_pair": "USDMXN",
                "maturity_date": "2026-06-30",
                "underlying": "FX",
                "settlement_type": "NDF",
            },
            hedging_instrument={
                "notional": 1_000_000,
                "currency_pair": "USDBRL",
                "maturity_date": "2026-06-30",
                "underlying": "FX",
                "settlement_type": "NDF",
            },
        )
        assert result.matched is False
        assert "currency_pair" in result.terms_mismatched

    def test_maturity_mismatch(self):
        from app.engine_v1.prospective_effectiveness import assess_critical_terms_match

        result = assess_critical_terms_match(
            hedged_item={
                "notional": 1_000_000,
                "currency_pair": "USDMXN",
                "maturity_date": "2026-06-30",
                "underlying": "FX",
                "settlement_type": "NDF",
            },
            hedging_instrument={
                "notional": 1_000_000,
                "currency_pair": "USDMXN",
                "maturity_date": "2026-09-30",
                "underlying": "FX",
                "settlement_type": "NDF",
            },
        )
        assert result.matched is False
        assert "maturity" in result.terms_mismatched

    def test_settlement_type_mismatch(self):
        from app.engine_v1.prospective_effectiveness import assess_critical_terms_match

        result = assess_critical_terms_match(
            hedged_item={
                "notional": 1_000_000,
                "currency_pair": "USDMXN",
                "maturity_date": "2026-06-30",
                "underlying": "FX",
                "settlement_type": "NDF",
            },
            hedging_instrument={
                "notional": 1_000_000,
                "currency_pair": "USDMXN",
                "maturity_date": "2026-06-30",
                "underlying": "FX",
                "settlement_type": "DELIVERABLE",
            },
        )
        assert result.matched is False
        assert "settlement_type" in result.terms_mismatched

    def test_multiple_mismatches(self):
        """When multiple terms mismatch, all are reported."""
        from app.engine_v1.prospective_effectiveness import assess_critical_terms_match

        result = assess_critical_terms_match(
            hedged_item={
                "notional": 1_000_000,
                "currency_pair": "USDMXN",
                "maturity_date": "2026-06-30",
                "underlying": "FX",
                "settlement_type": "NDF",
            },
            hedging_instrument={
                "notional": 2_000_000,
                "currency_pair": "USDBRL",
                "maturity_date": "2026-09-30",
                "underlying": "FX",
                "settlement_type": "NDF",
            },
        )
        assert result.matched is False
        assert "notional" in result.terms_mismatched
        assert "currency_pair" in result.terms_mismatched
        assert "maturity" in result.terms_mismatched

    def test_underlying_mismatch(self):
        from app.engine_v1.prospective_effectiveness import assess_critical_terms_match

        result = assess_critical_terms_match(
            hedged_item={
                "notional": 1_000_000,
                "currency_pair": "USDMXN",
                "maturity_date": "2026-06-30",
                "underlying": "FX",
                "settlement_type": "NDF",
            },
            hedging_instrument={
                "notional": 1_000_000,
                "currency_pair": "USDMXN",
                "maturity_date": "2026-06-30",
                "underlying": "COMMODITY",
                "settlement_type": "NDF",
            },
        )
        assert result.matched is False
        assert "underlying" in result.terms_mismatched

    def test_to_dict_serializable(self):
        from app.engine_v1.prospective_effectiveness import assess_critical_terms_match

        result = assess_critical_terms_match(
            hedged_item={
                "notional": 1_000_000,
                "currency_pair": "USDMXN",
                "maturity_date": "2026-06-30",
                "underlying": "FX",
                "settlement_type": "NDF",
            },
            hedging_instrument={
                "notional": 1_000_000,
                "currency_pair": "USDMXN",
                "maturity_date": "2026-06-30",
                "underlying": "FX",
                "settlement_type": "NDF",
            },
        )
        serialized = json.dumps(result.to_dict())  # must not raise
        parsed = json.loads(serialized)
        assert parsed["matched"] is True
        assert parsed["method"] == "CRITICAL_TERMS_MATCH"

    def test_terms_checked_always_five(self):
        """Regardless of outcome, five critical terms are always checked."""
        from app.engine_v1.prospective_effectiveness import assess_critical_terms_match

        result = assess_critical_terms_match(
            hedged_item={"notional": 1_000_000, "currency_pair": "USDMXN",
                         "maturity_date": "2026-06-30", "underlying": "FX",
                         "settlement_type": "NDF"},
            hedging_instrument={"notional": 2_000_000, "currency_pair": "USDBRL",
                                "maturity_date": "2026-09-30", "underlying": "COMMODITY",
                                "settlement_type": "DELIVERABLE"},
        )
        assert len(result.terms_checked) == 5
        assert len(result.terms_matched) + len(result.terms_mismatched) == 5

    def test_notional_boundary_exact_5pct(self):
        """Exactly 5% difference should still match (<=0.05)."""
        from app.engine_v1.prospective_effectiveness import assess_critical_terms_match

        result = assess_critical_terms_match(
            hedged_item={"notional": 1_000_000, "currency_pair": "USDMXN",
                         "maturity_date": "2026-06-30", "underlying": "FX",
                         "settlement_type": "NDF"},
            hedging_instrument={"notional": 1_050_000, "currency_pair": "USDMXN",
                                "maturity_date": "2026-06-30", "underlying": "FX",
                                "settlement_type": "NDF"},
        )
        assert result.matched is True  # exactly 5% = within tolerance

    def test_zero_notional_hedged_item(self):
        """Zero notional on hedged item triggers mismatch (division guard)."""
        from app.engine_v1.prospective_effectiveness import assess_critical_terms_match

        result = assess_critical_terms_match(
            hedged_item={"notional": 0, "currency_pair": "USDMXN",
                         "maturity_date": "2026-06-30", "underlying": "FX",
                         "settlement_type": "NDF"},
            hedging_instrument={"notional": 1_000_000, "currency_pair": "USDMXN",
                                "maturity_date": "2026-06-30", "underlying": "FX",
                                "settlement_type": "NDF"},
        )
        assert "notional" in result.terms_mismatched


class TestStatisticalForecast:
    """IFRS 9.B6.4.6: Statistical forecast prospective test."""

    def _generate_perfect_hedge_data(self, n: int = 30):
        """Generate synthetic data with perfect negative correlation."""
        import random
        random.seed(42)  # deterministic
        hedged = [random.gauss(0, 0.05) for _ in range(n)]
        instrument = [-h * 1.0 for h in hedged]  # perfect offset
        return hedged, instrument

    def test_perfect_hedge_effective(self):
        from app.engine_v1.prospective_effectiveness import assess_statistical_forecast

        hedged, instrument = self._generate_perfect_hedge_data(30)
        result = assess_statistical_forecast(hedged, instrument)
        assert result.is_effective is True
        assert result.projected_r_squared is not None
        assert result.projected_r_squared > 0.99
        assert result.projected_slope is not None
        assert -1.25 <= result.projected_slope <= -0.80
        assert "PASSED" in result.rationale

    def test_insufficient_data(self):
        from app.engine_v1.prospective_effectiveness import assess_statistical_forecast

        result = assess_statistical_forecast([0.01, 0.02], [-0.01, -0.02])
        assert result.is_effective is False
        assert result.sample_size == 2
        assert "Insufficient" in result.rationale

    def test_minimum_20_points(self):
        """Prospective test requires 20 points (less than retrospective 30)."""
        from app.engine_v1.prospective_effectiveness import assess_statistical_forecast

        hedged, instrument = self._generate_perfect_hedge_data(20)
        result = assess_statistical_forecast(hedged, instrument)
        assert result.sample_size == 20
        assert result.is_effective is True  # 20 points sufficient for prospective

    def test_19_points_insufficient(self):
        from app.engine_v1.prospective_effectiveness import assess_statistical_forecast

        hedged, instrument = self._generate_perfect_hedge_data(19)
        result = assess_statistical_forecast(hedged[:19], instrument[:19])
        assert result.is_effective is False
        assert "Insufficient" in result.rationale

    def test_poor_correlation_fails(self):
        from app.engine_v1.prospective_effectiveness import assess_statistical_forecast

        import random
        random.seed(123)
        hedged = [random.gauss(0, 0.05) for _ in range(30)]
        instrument = [random.gauss(0, 0.05) for _ in range(30)]  # uncorrelated
        result = assess_statistical_forecast(hedged, instrument)
        assert result.is_effective is False

    def test_configurable_thresholds(self):
        from app.engine_v1.prospective_effectiveness import assess_statistical_forecast

        hedged, instrument = self._generate_perfect_hedge_data(30)
        # Very strict R-squared requirement -- should still not error
        result = assess_statistical_forecast(hedged, instrument, r2_min=0.999)
        assert isinstance(result.is_effective, bool)

    def test_to_dict_serializable(self):
        from app.engine_v1.prospective_effectiveness import assess_statistical_forecast

        hedged, instrument = self._generate_perfect_hedge_data(30)
        result = assess_statistical_forecast(hedged, instrument)
        serialized = json.dumps(result.to_dict())
        parsed = json.loads(serialized)
        assert "projected_r_squared" in parsed
        assert "projected_slope" in parsed
        assert parsed["method"] == "STATISTICAL_FORECAST"

    def test_deterministic_output(self):
        """Same inputs must produce identical results (engine_v1 determinism)."""
        from app.engine_v1.prospective_effectiveness import assess_statistical_forecast

        hedged, instrument = self._generate_perfect_hedge_data(30)
        r1 = assess_statistical_forecast(hedged, instrument)
        r2 = assess_statistical_forecast(hedged, instrument)
        assert r1.projected_r_squared == r2.projected_r_squared
        assert r1.projected_slope == r2.projected_slope
        assert r1.is_effective == r2.is_effective

    def test_slope_outside_band_fails(self):
        """Slope outside [-1.25, -0.80] should fail even with high R-squared."""
        from app.engine_v1.prospective_effectiveness import assess_statistical_forecast

        import random
        random.seed(42)
        hedged = [random.gauss(0, 0.05) for _ in range(30)]
        # Slope ~ -0.5 (under-hedged relationship)
        instrument = [-h * 0.5 for h in hedged]
        result = assess_statistical_forecast(hedged, instrument)
        # Slope = -0.5 is outside [-1.25, -0.80] so should fail
        assert result.is_effective is False

    def test_zero_variance_data(self):
        """Constant data has zero variance -- should fail gracefully."""
        from app.engine_v1.prospective_effectiveness import assess_statistical_forecast

        result = assess_statistical_forecast([0.05] * 30, [-0.05] * 30)
        assert result.is_effective is False
        assert "variance" in result.rationale.lower() or "Insufficient" in result.rationale


class TestProspectiveDispatch:
    """Unified dispatch function."""

    def test_none_method_passes(self):
        from app.engine_v1.prospective_effectiveness import assess_prospective_effectiveness

        result = assess_prospective_effectiveness("NONE")
        assert result.is_effective is True
        assert result.method == "NONE"
        assert "disabled" in result.rationale.lower()

    def test_unknown_method_fails(self):
        from app.engine_v1.prospective_effectiveness import assess_prospective_effectiveness

        result = assess_prospective_effectiveness("MAGIC")
        assert result.is_effective is False
        assert "Unknown" in result.rationale

    def test_critical_terms_without_data(self):
        from app.engine_v1.prospective_effectiveness import assess_prospective_effectiveness

        result = assess_prospective_effectiveness("CRITICAL_TERMS_MATCH")
        assert result.is_effective is False

    def test_statistical_without_data(self):
        from app.engine_v1.prospective_effectiveness import assess_prospective_effectiveness

        result = assess_prospective_effectiveness("STATISTICAL_FORECAST")
        assert result.is_effective is False

    def test_critical_terms_dispatch_with_data(self):
        from app.engine_v1.prospective_effectiveness import assess_prospective_effectiveness

        item = {"notional": 1_000_000, "currency_pair": "USDMXN",
                "maturity_date": "2026-06-30", "underlying": "FX",
                "settlement_type": "NDF"}
        result = assess_prospective_effectiveness(
            "CRITICAL_TERMS_MATCH",
            hedged_item=item,
            hedging_instrument=item,
        )
        assert result.is_effective is True
        assert result.critical_terms is not None
        assert result.critical_terms.matched is True

    def test_statistical_dispatch_with_data(self):
        import random
        random.seed(42)
        from app.engine_v1.prospective_effectiveness import assess_prospective_effectiveness

        hedged = [random.gauss(0, 0.05) for _ in range(30)]
        instrument = [-h for h in hedged]
        result = assess_prospective_effectiveness(
            "STATISTICAL_FORECAST",
            historical_hedged_changes=hedged,
            historical_instrument_changes=instrument,
        )
        assert result.is_effective is True
        assert result.statistical_forecast is not None

    def test_result_to_dict_serializable(self):
        from app.engine_v1.prospective_effectiveness import assess_prospective_effectiveness

        result = assess_prospective_effectiveness("NONE")
        serialized = json.dumps(result.to_dict())
        parsed = json.loads(serialized)
        assert parsed["method"] == "NONE"
        assert parsed["is_effective"] is True
