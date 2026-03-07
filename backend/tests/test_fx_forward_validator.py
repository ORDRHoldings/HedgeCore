"""Tests for app.engine_v1.fx_forward_validator."""

import pytest

from app.engine_v1.fx_forward_validator import (
    ForwardArbitrageCheck,
    ForwardValidationResult,
    _bucket_to_months,
    _months_to_tenor,
    validate_forward_consistency,
)


# ── Helper dataclass tests ──────────────────────────────────────────────────


class TestForwardArbitrageCheck:
    def test_to_dict(self):
        check = ForwardArbitrageCheck(
            bucket="2025-07",
            actual_forward=0.325,
            theoretical_forward=0.320,
            deviation=0.005,
            deviation_pct=0.0003,
            status="OK",
        )
        d = check.to_dict()
        assert d["bucket"] == "2025-07"
        assert d["actual_forward"] == 0.325
        assert d["theoretical_forward"] == 0.320
        assert d["deviation"] == 0.005
        assert d["deviation_pct"] == 0.0003
        assert d["status"] == "OK"

    def test_to_dict_all_statuses(self):
        for status in ("OK", "WARNING", "VIOLATION"):
            check = ForwardArbitrageCheck(
                bucket="b", actual_forward=0.0, theoretical_forward=0.0,
                deviation=0.0, deviation_pct=0.0, status=status,
            )
            assert check.to_dict()["status"] == status


class TestForwardValidationResult:
    def test_defaults(self):
        r = ForwardValidationResult()
        assert r.checks == []
        assert r.all_consistent is True
        assert r.has_warnings is False
        assert r.has_violations is False
        assert r.max_deviation_pct == 0.0
        assert r.violation_buckets == []

    def test_to_dict_empty(self):
        r = ForwardValidationResult()
        d = r.to_dict()
        assert d["checks"] == []
        assert d["all_consistent"] is True

    def test_to_dict_with_checks(self):
        check = ForwardArbitrageCheck(
            bucket="2025-07", actual_forward=0.5, theoretical_forward=0.3,
            deviation=0.2, deviation_pct=0.012, status="WARNING",
        )
        r = ForwardValidationResult(
            checks=[check], all_consistent=False,
            has_warnings=True, max_deviation_pct=0.012,
        )
        d = r.to_dict()
        assert len(d["checks"]) == 1
        assert d["checks"][0]["status"] == "WARNING"
        assert d["all_consistent"] is False


# ── Private helper tests ────────────────────────────────────────────────────


class TestBucketToMonths:
    def test_standard_bucket(self):
        assert _bucket_to_months("2025-07") == 7

    def test_single_part(self):
        assert _bucket_to_months("bucket") == 3

    def test_non_numeric_second_part(self):
        assert _bucket_to_months("2025-abc") == 3

    def test_empty_string(self):
        assert _bucket_to_months("") == 3

    def test_multiple_dashes(self):
        assert _bucket_to_months("2025-03-15") == 3

    def test_twelve(self):
        assert _bucket_to_months("2025-12") == 12

    def test_one(self):
        assert _bucket_to_months("2025-01") == 1


class TestMonthsToTenor:
    def test_one_month(self):
        assert _months_to_tenor(1) == "1M"

    def test_zero_months(self):
        assert _months_to_tenor(0) == "1M"

    def test_two_months(self):
        assert _months_to_tenor(2) == "3M"

    def test_three_months(self):
        assert _months_to_tenor(3) == "3M"

    def test_four_months(self):
        assert _months_to_tenor(4) == "6M"

    def test_five_months(self):
        assert _months_to_tenor(5) == "6M"

    def test_six_months(self):
        assert _months_to_tenor(6) == "6M"

    def test_seven_months(self):
        assert _months_to_tenor(7) == "12M"

    def test_twelve_months(self):
        assert _months_to_tenor(12) == "12M"

    def test_negative_months(self):
        assert _months_to_tenor(-1) == "1M"


# ── Main function tests ────────────────────────────────────────────────────


class TestValidateForwardConsistency:
    def _base_market(self):
        return {
            "spot_rate": 17.15,
            "forward_points_by_month": {
                "2025-07": 0.325,
                "2025-09": 0.418,
            },
            "interest_curves": {
                "USD": {"1M": 5.33, "3M": 5.40, "6M": 5.35, "12M": 5.10},
                "MXN": {"1M": 11.00, "3M": 11.10, "6M": 10.80, "12M": 10.25},
            },
        }

    def _base_policy(self):
        return {
            "forward_arbitrage_soft_tolerance": 0.005,
            "forward_arbitrage_hard_tolerance": 0.02,
        }

    def test_usdmxn_default_pair(self):
        result = validate_forward_consistency(self._base_market(), self._base_policy())
        assert isinstance(result, ForwardValidationResult)
        assert len(result.checks) == 2

    def test_all_checks_have_valid_status(self):
        result = validate_forward_consistency(self._base_market(), self._base_policy())
        for check in result.checks:
            assert check.status in ("OK", "WARNING", "VIOLATION")

    def test_empty_forward_points(self):
        market = {
            "spot_rate": 17.15,
            "forward_points_by_month": {},
            "interest_curves": {},
        }
        result = validate_forward_consistency(market, self._base_policy())
        assert result.all_consistent is True
        assert len(result.checks) == 0

    def test_non_usdmxn_pair_with_fx_rates(self):
        market = {
            "fx_rates": {"EURUSD": 1.085},
            "pair_forward_points": {
                "EURUSD": {"2025-07": -0.0015},
            },
            "interest_curves": {
                "EUR": {"1M": 3.75, "3M": 3.85, "6M": 3.70, "12M": 3.50},
                "USD": {"1M": 5.33, "3M": 5.40, "6M": 5.35, "12M": 5.10},
            },
        }
        result = validate_forward_consistency(market, self._base_policy(), pair="EURUSD")
        assert len(result.checks) == 1

    def test_non_usdmxn_pair_zero_spot(self):
        market = {"fx_rates": {"GBPUSD": 0.0}}
        result = validate_forward_consistency(market, {}, pair="GBPUSD")
        assert result.all_consistent is True
        assert len(result.checks) == 0

    def test_non_usdmxn_pair_missing_spot(self):
        market = {"fx_rates": {}}
        result = validate_forward_consistency(market, {}, pair="GBPUSD")
        assert result.all_consistent is True

    def test_pair_forward_points_override(self):
        market = {
            "spot_rate": 17.15,
            "pair_forward_points": {
                "USDMXN": {"2025-07": 0.325},
            },
            "forward_points_by_month": {"2025-07": 999.0},
            "interest_curves": {
                "USD": {"1M": 5.33, "3M": 5.40},
                "MXN": {"1M": 11.00, "3M": 11.10},
            },
        }
        result = validate_forward_consistency(market, self._base_policy(), pair="USDMXN")
        assert len(result.checks) == 1
        assert result.checks[0].actual_forward == 0.325

    def test_violation_detected(self):
        market = {
            "spot_rate": 17.15,
            "forward_points_by_month": {
                "2025-07": 5.0,
            },
            "interest_curves": {
                "USD": {"1M": 5.33, "3M": 5.40},
                "MXN": {"1M": 11.00, "3M": 11.10},
            },
        }
        policy = {
            "forward_arbitrage_soft_tolerance": 0.005,
            "forward_arbitrage_hard_tolerance": 0.02,
        }
        result = validate_forward_consistency(market, policy)
        assert result.has_violations is True
        assert result.all_consistent is False
        assert len(result.violation_buckets) > 0
        assert result.checks[0].status == "VIOLATION"

    def test_warning_detected_narrow_soft_tolerance(self):
        """Forward points slightly off with narrow soft tolerance produces warning."""
        spot = 17.15
        r_dom = 5.0
        r_fgn = 11.0
        time_frac = 7 / 12.0
        theoretical_fwd = spot * (1 + r_fgn / 100 * time_frac) / (1 + r_dom / 100 * time_frac)
        theoretical_pts = theoretical_fwd - spot
        # Add a deviation that exceeds soft (0.001) but not hard (0.10)
        actual_pts = theoretical_pts + spot * 0.005  # ~0.5% deviation

        market = {
            "spot_rate": spot,
            "forward_points_by_month": {"2025-07": actual_pts},
            "interest_curves": {
                "USD": {"1M": r_dom, "3M": r_dom, "6M": r_dom, "12M": r_dom},
                "MXN": {"1M": r_fgn, "3M": r_fgn, "6M": r_fgn, "12M": r_fgn},
            },
        }
        policy = {
            "forward_arbitrage_soft_tolerance": 0.001,
            "forward_arbitrage_hard_tolerance": 0.10,
        }
        result = validate_forward_consistency(market, policy)
        assert result.has_warnings is True
        assert result.has_violations is False
        assert result.all_consistent is False

    def test_ok_exact_match(self):
        """Exactly matching forward points yield OK."""
        spot = 17.15
        r_dom = 5.0
        r_fgn = 11.0
        time_frac = 7 / 12.0
        theoretical_fwd = spot * (1 + r_fgn / 100 * time_frac) / (1 + r_dom / 100 * time_frac)
        theoretical_pts = theoretical_fwd - spot

        market = {
            "spot_rate": spot,
            "forward_points_by_month": {"2025-07": theoretical_pts},
            "interest_curves": {
                "USD": {"1M": r_dom, "3M": r_dom, "6M": r_dom, "12M": r_dom},
                "MXN": {"1M": r_fgn, "3M": r_fgn, "6M": r_fgn, "12M": r_fgn},
            },
        }
        result = validate_forward_consistency(market, self._base_policy())
        assert result.all_consistent is True
        assert result.checks[0].status == "OK"
        assert result.checks[0].deviation_pct == pytest.approx(0.0, abs=1e-10)

    def test_default_tolerances(self):
        market = {
            "spot_rate": 17.15,
            "forward_points_by_month": {"2025-07": 0.325},
            "interest_curves": {},
        }
        result = validate_forward_consistency(market, {})
        assert isinstance(result, ForwardValidationResult)

    def test_spot_usdmxn_fallback_key(self):
        market = {
            "spot_usdmxn": 17.20,
            "forward_points_by_month": {"2025-07": 0.325},
            "interest_curves": {},
        }
        result = validate_forward_consistency(market, {})
        assert len(result.checks) == 1

    def test_max_deviation_tracked(self):
        market = {
            "spot_rate": 17.15,
            "forward_points_by_month": {
                "2025-07": 5.0,
                "2025-09": 0.01,
            },
            "interest_curves": {},
        }
        result = validate_forward_consistency(market, self._base_policy())
        assert result.max_deviation_pct > 0

    def test_to_dict_round_trip(self):
        result = validate_forward_consistency(self._base_market(), self._base_policy())
        d = result.to_dict()
        assert "checks" in d
        assert "all_consistent" in d
        assert "has_warnings" in d
        assert "has_violations" in d
        assert "max_deviation_pct" in d
        assert "violation_buckets" in d

    def test_non_usdmxn_no_pair_forward_points(self):
        market = {
            "fx_rates": {"GBPUSD": 1.27},
            "pair_forward_points": {},
            "interest_curves": {},
        }
        result = validate_forward_consistency(market, {}, pair="GBPUSD")
        assert len(result.checks) == 0

    def test_multiple_violation_buckets_tracked(self):
        """Each violating bucket should appear in violation_buckets."""
        market = {
            "spot_rate": 17.15,
            "forward_points_by_month": {
                "2025-07": 10.0,
                "2025-09": 10.0,
            },
            "interest_curves": {},
        }
        policy = {"forward_arbitrage_hard_tolerance": 0.02}
        result = validate_forward_consistency(market, policy)
        assert len(result.violation_buckets) == 2

    def test_deviation_computed_relative_to_spot(self):
        """deviation_pct = deviation / spot."""
        spot = 100.0
        market = {
            "spot_rate": spot,
            "forward_points_by_month": {"2025-03": 2.0},
            "interest_curves": {},
        }
        result = validate_forward_consistency(market, {})
        check = result.checks[0]
        expected_deviation_pct = check.deviation / spot
        assert check.deviation_pct == pytest.approx(expected_deviation_pct)

    def test_no_interest_curves_uses_zero_rates(self):
        """Missing interest curves -> r_dom=0, r_fgn=0 -> theoretical_pts=0."""
        spot = 17.15
        market = {
            "spot_rate": spot,
            "forward_points_by_month": {"2025-03": 0.0},
            "interest_curves": {},
        }
        result = validate_forward_consistency(market, {})
        # theoretical_pts = spot * (1+0)/(1+0) - spot = 0
        # actual_pts = 0, deviation = 0
        assert result.checks[0].deviation == pytest.approx(0.0)
        assert result.checks[0].status == "OK"
