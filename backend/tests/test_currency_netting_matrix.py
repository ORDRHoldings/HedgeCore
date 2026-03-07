"""Tests for app.engine_v1.currency_netting_matrix."""

import pytest

from app.engine_v1.currency_netting_matrix import (
    NettingPair,
    CurrencyExposureNet,
    TriangulationCheck,
    NettingResult,
    compute_currency_netting,
    validate_netting_triangulation,
    validate_triangular_consistency,
)


# ---------------------------------------------------------------------------
# Dataclass serialization
# ---------------------------------------------------------------------------

class TestNettingPairToDict:
    def test_to_dict(self):
        np = NettingPair("EURUSD", "USDJPY", "EURJPY", 500_000, 300_000, 300_000, 9_000)
        d = np.to_dict()
        assert d["synthetic_pair"] == "EURJPY"
        assert d["savings_usd"] == 9_000


class TestCurrencyExposureNetToDict:
    def test_to_dict(self):
        ce = CurrencyExposureNet("USD", 1_000_000, 500_000, 500_000)
        d = ce.to_dict()
        assert d["currency"] == "USD"


class TestTriangulationCheckToDict:
    def test_to_dict(self):
        tc = TriangulationCheck("EURUSD", "USDJPY", "EURJPY", 162.0, 161.5, 0.31, "OK")
        d = tc.to_dict()
        assert d["status"] == "OK"


class TestNettingResultToDict:
    def test_to_dict_empty(self):
        r = NettingResult()
        d = r.to_dict()
        assert d["netting_pairs"] == []
        assert d["total_savings_usd"] == 0.0


# ---------------------------------------------------------------------------
# compute_currency_netting
# ---------------------------------------------------------------------------

class TestComputeCurrencyNetting:
    def test_empty_exposures(self):
        result = compute_currency_netting({}, {})
        assert result.netting_pairs == []
        assert result.gross_notional_before == 0.0

    def test_single_pair_no_netting(self):
        exposures = {"USDMXN": 1_000_000}
        result = compute_currency_netting(exposures, {})
        assert result.netting_pairs == []
        assert result.gross_notional_before == 1_000_000

    def test_two_pairs_with_common_currency_netted(self):
        """EURUSD + USDJPY -> common=USD, synthetic=EURJPY."""
        exposures = {"EURUSD": 500_000, "USDJPY": 300_000}
        result = compute_currency_netting(exposures, {})
        assert len(result.netting_pairs) == 1
        np = result.netting_pairs[0]
        assert np.netted_notional == 300_000
        assert np.savings_usd == pytest.approx(300_000 * 0.03)
        assert result.redundant_legs_eliminated == 1

    def test_netting_efficiency_positive(self):
        exposures = {"EURUSD": 500_000, "USDJPY": 300_000}
        result = compute_currency_netting(exposures, {})
        assert result.netting_efficiency_pct > 0

    def test_no_common_currency_no_netting(self):
        """USDMXN and EURGBP have no common currency for netting."""
        exposures = {"USDMXN": 500_000, "EURGBP": 300_000}
        result = compute_currency_netting(exposures, {})
        assert len(result.netting_pairs) == 0

    def test_gross_notional_before_is_sum_of_abs(self):
        exposures = {"USDMXN": 500_000, "EURUSD": -300_000}
        result = compute_currency_netting(exposures, {})
        assert result.gross_notional_before == 800_000

    def test_currency_exposures_populated(self):
        exposures = {"USDMXN": 1_000_000}
        result = compute_currency_netting(exposures, {})
        currencies = {ce.currency for ce in result.currency_exposures}
        assert "USD" in currencies
        assert "MXN" in currencies

    def test_short_pair_string_skipped(self):
        exposures = {"USD": 1_000_000}  # Invalid: < 6 chars
        result = compute_currency_netting(exposures, {})
        assert result.currency_exposures == []

    def test_three_pairs_netting(self):
        exposures = {
            "EURUSD": 500_000,
            "USDJPY": 300_000,
            "USDMXN": 200_000,
        }
        result = compute_currency_netting(exposures, {})
        # At least one netting pair should be found
        assert len(result.netting_pairs) >= 1

    def test_netting_with_existing_synthetic_not_doubled(self):
        """If synthetic pair already exists in exposures, skip netting."""
        exposures = {
            "EURUSD": 500_000,
            "USDJPY": 300_000,
            "EURJPY": 100_000,  # synthetic already exists
        }
        result = compute_currency_netting(exposures, {})
        # EURJPY already exists so EURUSD+USDJPY won't create it
        synthetic_pairs = [np.synthetic_pair for np in result.netting_pairs]
        assert "EURJPY" not in synthetic_pairs

    def test_gross_notional_after_less_than_before(self):
        exposures = {"EURUSD": 500_000, "USDJPY": 300_000}
        result = compute_currency_netting(exposures, {})
        assert result.gross_notional_after < result.gross_notional_before


# ---------------------------------------------------------------------------
# validate_netting_triangulation
# ---------------------------------------------------------------------------

class TestValidateNettingTriangulation:
    def test_empty_netting_pairs(self):
        checks = validate_netting_triangulation([], {})
        assert checks == []

    def test_ok_when_rates_consistent(self):
        np = NettingPair("EURUSD", "USDJPY", "EURJPY", 500_000, 300_000, 300_000, 9_000)
        # EURUSD=1.08, USDJPY=150 -> synthetic EURJPY = 1.08*150 = 162
        fx_rates = {"EURUSD": 1.08, "USDJPY": 150.0, "EURJPY": 162.0}
        checks = validate_netting_triangulation([np], fx_rates)
        assert len(checks) == 1
        assert checks[0].status == "OK"

    def test_warning_when_deviation_moderate(self):
        np = NettingPair("EURUSD", "USDJPY", "EURJPY", 500_000, 300_000, 300_000, 9_000)
        fx_rates = {"EURUSD": 1.08, "USDJPY": 150.0, "EURJPY": 163.0}
        checks = validate_netting_triangulation([np], fx_rates, tolerance_pct=0.5)
        assert len(checks) == 1
        assert checks[0].status in ("WARNING", "SUSPECT")

    def test_no_check_when_rates_missing(self):
        np = NettingPair("EURUSD", "USDJPY", "EURJPY", 500_000, 300_000, 300_000, 9_000)
        fx_rates = {}
        checks = validate_netting_triangulation([np], fx_rates)
        assert checks == []


# ---------------------------------------------------------------------------
# validate_triangular_consistency
# ---------------------------------------------------------------------------

class TestValidateTriangularConsistency:
    def test_fewer_than_3_rates(self):
        violations = validate_triangular_consistency({"EURUSD": 1.08, "USDJPY": 150.0})
        assert violations == []

    def test_consistent_triplet_no_violation(self):
        rates = {"EURUSD": 1.08, "USDJPY": 150.0, "EURJPY": 162.0}
        violations = validate_triangular_consistency(rates, tolerance_bps=5.0)
        assert violations == []

    def test_inconsistent_triplet_violation(self):
        rates = {"EURUSD": 1.08, "USDJPY": 150.0, "EURJPY": 170.0}  # Should be 162
        violations = validate_triangular_consistency(rates, tolerance_bps=5.0)
        assert len(violations) > 0
        assert "Triangulation breach" in violations[0]

    def test_inverse_pair_handling(self):
        """Should handle both EURUSD and USDEUR."""
        rates = {"USDEUR": 0.9259, "USDJPY": 150.0, "EURJPY": 162.0}
        # USDEUR -> EURUSD = 1/0.9259 ≈ 1.08
        # EURUSD * USDJPY = 1.08 * 150 = 162 ≈ EURJPY
        violations = validate_triangular_consistency(rates, tolerance_bps=50.0)
        # Should find the triplet and check it
        assert isinstance(violations, list)

    def test_custom_tolerance(self):
        rates = {"EURUSD": 1.08, "USDJPY": 150.0, "EURJPY": 162.5}
        # Deviation: |1.08*150 - 162.5| / 162.5 * 10000 ≈ 30.8 bps
        strict = validate_triangular_consistency(rates, tolerance_bps=5.0)
        loose = validate_triangular_consistency(rates, tolerance_bps=50.0)
        assert len(strict) >= len(loose)

    def test_non_standard_pair_length_ignored(self):
        rates = {"XYZ": 1.0, "AB": 2.0, "EURUSD": 1.08}
        violations = validate_triangular_consistency(rates)
        assert violations == []
