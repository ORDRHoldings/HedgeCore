"""Tests for app.engine_v1.nav_attribution_engine."""

import pytest

from app.engine_v1.nav_attribution_engine import (
    PositionAttribution,
    NavAttributionResult,
    compute_nav_attribution,
    _get_rate,
    _estimate_months,
)


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

class TestEstimateMonths:
    def test_same_year_forward(self):
        # "2026-09" is 6 months from as_of="2026-03"
        assert _estimate_months("2026-09", as_of="2026-03") == 6

    def test_one_year_from_reference(self):
        # "2027-03" is 12 months from as_of="2026-03"
        assert _estimate_months("2027-03", as_of="2026-03") == 12

    def test_two_years_from_reference(self):
        # "2028-03" is 24 months from as_of="2026-03"
        assert _estimate_months("2028-03", as_of="2026-03") == 24

    def test_single_part_defaults_to_3(self):
        assert _estimate_months("bucket") == 3

    def test_non_numeric_defaults_to_3(self):
        assert _estimate_months("abc-xyz") == 3

    def test_empty_defaults_to_3(self):
        assert _estimate_months("") == 3

    def test_same_month_as_reference_clamped_to_1(self):
        # Maturity == as_of → 0 months difference → clamped to 1
        assert _estimate_months("2026-03", as_of="2026-03") == 1

    def test_cross_year_boundary(self):
        # "2027-02" from as_of="2026-11" = 3 months
        assert _estimate_months("2027-02", as_of="2026-11") == 3


class TestGetRate:
    def test_returns_3m_rate(self):
        curves = {"USD": {"3M": 5.25}}
        assert _get_rate(curves, "USD") == 5.25

    def test_missing_currency_returns_zero(self):
        assert _get_rate({}, "EUR") == 0.0

    def test_missing_tenor_returns_zero(self):
        curves = {"USD": {"1M": 5.0}}
        assert _get_rate(curves, "USD") == 0.0


# ---------------------------------------------------------------------------
# Dataclass serialization
# ---------------------------------------------------------------------------

class TestPositionAttributionToDict:
    def test_to_dict(self):
        pa = PositionAttribution(
            position_id="T1", currency="MXN",
            nav_local=100_000, nav_base=5_800,
            fx_contribution=58, carry_contribution=10,
            basis_contribution=5, funding_contribution=2,
            total_pnl=71,
        )
        d = pa.to_dict()
        assert d["position_id"] == "T1"
        assert d["total_pnl"] == 71


class TestNavAttributionResultToDict:
    def test_to_dict_empty(self):
        r = NavAttributionResult()
        d = r.to_dict()
        assert d["positions"] == []
        assert d["base_currency"] == "USD"


# ---------------------------------------------------------------------------
# compute_nav_attribution
# ---------------------------------------------------------------------------

class TestComputeNavAttribution:
    def test_empty_positions(self):
        result = compute_nav_attribution([], {})
        assert result.total_pnl == 0.0
        assert result.positions == []

    def test_single_position_basic(self):
        positions = [{
            "trade_id": "T1",
            "currency": "MXN",
            "amount_local": 100_000,
            "amount_usd": 5_800,
            "maturity": "2026-03",
        }]
        market = {
            "fx_rates": {"USDMXN": 17.24},
            "spot_rate": 17.24,
            "interest_curves": {
                "USD": {"3M": 5.25},
                "MXN": {"3M": 11.0},
            },
            "basis_spreads": {"USDMXN": 5.0},
            "funding_rate_bps": 10.0,
        }
        result = compute_nav_attribution(positions, market)
        assert len(result.positions) == 1
        pa = result.positions[0]
        assert pa.position_id == "T1"
        assert pa.currency == "MXN"
        assert pa.nav_local == 100_000
        assert pa.nav_base == 5_800

    def test_carry_contribution_formula(self):
        """carry = |amount_usd| * (r_local - r_base)/100 * time_frac"""
        positions = [{
            "trade_id": "T1", "currency": "MXN",
            "amount_local": 100_000, "amount_usd": 5_800,
            "maturity": "2026-09",  # 6 months from as_of="2026-03"
        }]
        market = {
            "interest_curves": {
                "USD": {"3M": 5.0},
                "MXN": {"3M": 11.0},
            },
            "as_of": "2026-03",  # explicit reference for deterministic maturity calc
        }
        result = compute_nav_attribution(positions, market)
        pa = result.positions[0]
        expected_carry = 5_800 * (11.0 - 5.0) / 100.0 * (6 / 12.0)
        assert pa.carry_contribution == pytest.approx(expected_carry)

    def test_basis_contribution_formula(self):
        """basis = |amount_usd| * (basis_bps / 10000)"""
        positions = [{
            "trade_id": "T1", "currency": "MXN",
            "amount_local": 0, "amount_usd": 10_000,
            "maturity": "2026-03",
        }]
        market = {
            "basis_spreads": {"USDMXN": 5.0},
        }
        result = compute_nav_attribution(positions, market)
        expected_basis = 10_000 * (5.0 / 10000.0)
        assert result.positions[0].basis_contribution == pytest.approx(expected_basis)

    def test_funding_contribution_formula(self):
        """funding = |amount_usd| * (funding_bps/10000) * time_frac"""
        positions = [{
            "trade_id": "T1", "currency": "MXN",
            "amount_local": 0, "amount_usd": 10_000,
            "maturity": "2027-03",  # 12 months from as_of="2026-03"
        }]
        market = {
            "funding_rate_bps": 20.0,
            "as_of": "2026-03",  # explicit reference for deterministic maturity calc
        }
        result = compute_nav_attribution(positions, market)
        expected_funding = 10_000 * (20.0 / 10000.0) * (12 / 12.0)
        assert result.positions[0].funding_contribution == pytest.approx(expected_funding)

    def test_fx_contribution_with_explicit_delta(self):
        """When fx_delta is provided directly, it's used."""
        positions = [{
            "trade_id": "T1", "currency": "MXN",
            "amount_local": 0, "amount_usd": 10_000,
        }]
        result = compute_nav_attribution(positions, {}, fx_delta=0.02)
        assert result.positions[0].fx_contribution == pytest.approx(200.0)

    def test_fx_contribution_from_fx_deltas_map(self):
        """Uses fx_deltas from market snapshot."""
        positions = [{
            "trade_id": "T1", "currency": "MXN",
            "amount_local": 0, "amount_usd": 10_000,
        }]
        market = {"fx_deltas": {"USDMXN": 0.01}}
        result = compute_nav_attribution(positions, market)
        assert result.positions[0].fx_contribution == pytest.approx(100.0)

    def test_fx_contribution_from_previous_close(self):
        """Falls back to previous_close_rates."""
        positions = [{
            "trade_id": "T1", "currency": "MXN",
            "amount_local": 0, "amount_usd": 10_000,
        }]
        market = {
            "fx_rates": {"USDMXN": 17.30},
            "previous_close_rates": {"USDMXN": 17.15},
        }
        result = compute_nav_attribution(positions, market)
        implied_delta = (17.30 - 17.15) / 17.15
        expected = 10_000 * implied_delta
        assert result.positions[0].fx_contribution == pytest.approx(expected, rel=1e-6)

    def test_same_currency_no_fx_contribution(self):
        """USD position in USD base should have zero FX contribution."""
        positions = [{
            "trade_id": "T1", "currency": "USD",
            "amount_local": 10_000, "amount_usd": 10_000,
        }]
        result = compute_nav_attribution(positions, {})
        assert result.positions[0].fx_contribution == 0.0

    def test_total_pnl_aggregation(self):
        positions = [
            {"trade_id": "T1", "currency": "MXN", "amount_local": 0, "amount_usd": 5_000},
            {"trade_id": "T2", "currency": "EUR", "amount_local": 0, "amount_usd": 3_000},
        ]
        result = compute_nav_attribution(positions, {}, fx_delta=0.01)
        assert result.total_pnl == pytest.approx(
            sum(p.total_pnl for p in result.positions)
        )

    def test_total_nav_base_aggregation(self):
        positions = [
            {"trade_id": "T1", "currency": "MXN", "amount_local": 0, "amount_usd": 5_000},
            {"trade_id": "T2", "currency": "EUR", "amount_local": 0, "amount_usd": 3_000},
        ]
        result = compute_nav_attribution(positions, {})
        assert result.total_nav_base == pytest.approx(8_000)

    def test_base_currency_non_usd(self):
        positions = [{
            "trade_id": "T1", "currency": "MXN",
            "amount_local": 100_000, "amount_usd": 5_800,
        }]
        result = compute_nav_attribution(positions, {}, base_currency="EUR")
        assert result.base_currency == "EUR"

    def test_bucket_fallback_for_position_id(self):
        positions = [{"bucket": "2026-03", "currency": "MXN", "amount_local": 0, "amount_usd": 0}]
        result = compute_nav_attribution(positions, {})
        assert result.positions[0].position_id == "2026-03"

    def test_zero_amount_usd_no_fx_contribution(self):
        positions = [{"trade_id": "T1", "currency": "MXN", "amount_local": 100_000, "amount_usd": 0}]
        result = compute_nav_attribution(positions, {}, fx_delta=0.05)
        assert result.positions[0].fx_contribution == 0.0


# ── Regression: A4 _estimate_months fix ──────────────────────────────────────

class TestEstimateMonthsCorrectness:
    """Regression for A4 bug: _estimate_months returned month-of-year digit
    instead of actual months from reference date to maturity.

    Pre-A4 bug: _estimate_months("2027-03") = int("03") = 3
                (returns March's month digit, not 12 months from 2026-03)
    A4 fix:     _estimate_months("2027-03", as_of="2026-03") = 12
                (correct months-to-maturity; 2-year = 24, etc.)

    Impact: time_frac = maturity_months / 12 was wrong for multi-year tenors.
    "2027-03" (12-month forward) reported time_frac = 0.25 instead of 1.0 →
    carry and funding contributions underestimated by 4×.
    """

    def test_multi_year_tenor_returns_actual_months(self):
        """12-month forward must return 12, not 3 (the March digit)."""
        result = _estimate_months("2027-03", as_of="2026-03")
        assert result == 12, (
            f"'2027-03' from '2026-03' should be 12 months. Got {result}. "
            "Check A4 bug: parts[1] returns month digit (3), not months-to-maturity (12)."
        )

    def test_two_year_tenor_returns_24_months(self):
        """2-year forward must return 24, not 3 (the March digit)."""
        result = _estimate_months("2028-03", as_of="2026-03")
        assert result == 24, (
            f"'2028-03' from '2026-03' should be 24 months. Got {result}. "
            "Pre-A4 would return 3 (same March digit as a 1-year forward)."
        )

    def test_carry_scales_with_maturity_years(self):
        """2-year forward should have exactly 2× the carry of a 1-year forward."""
        market_base = {
            "interest_curves": {"USD": {"3M": 5.0}, "MXN": {"3M": 11.0}},
            "as_of": "2026-03",
        }
        positions_1y = [{"trade_id": "T1", "currency": "MXN", "amount_local": 0, "amount_usd": 100_000, "maturity": "2027-03"}]
        positions_2y = [{"trade_id": "T1", "currency": "MXN", "amount_local": 0, "amount_usd": 100_000, "maturity": "2028-03"}]

        result_1y = compute_nav_attribution(positions_1y, market_base)
        result_2y = compute_nav_attribution(positions_2y, market_base)

        carry_1y = result_1y.positions[0].carry_contribution
        carry_2y = result_2y.positions[0].carry_contribution

        assert carry_2y == pytest.approx(carry_1y * 2, rel=1e-6), (
            f"2-year carry ({carry_2y:.2f}) must be 2× 1-year carry ({carry_1y:.2f}). "
            "Pre-A4 bug: both '2027-03' and '2028-03' returned parts[1]=3, "
            "so both got identical time_frac (3/12=0.25) regardless of year."
        )

    def test_funding_scales_with_maturity_years(self):
        """2-year forward funding cost must be 2× that of a 1-year forward."""
        market_base = {"funding_rate_bps": 30.0, "as_of": "2026-03"}
        positions_1y = [{"trade_id": "T1", "currency": "MXN", "amount_local": 0, "amount_usd": 100_000, "maturity": "2027-03"}]
        positions_2y = [{"trade_id": "T1", "currency": "MXN", "amount_local": 0, "amount_usd": 100_000, "maturity": "2028-03"}]

        result_1y = compute_nav_attribution(positions_1y, market_base)
        result_2y = compute_nav_attribution(positions_2y, market_base)

        fund_1y = result_1y.positions[0].funding_contribution
        fund_2y = result_2y.positions[0].funding_contribution

        assert fund_2y == pytest.approx(fund_1y * 2, rel=1e-6), (
            f"2-year funding ({fund_2y:.2f}) must be 2× 1-year funding ({fund_1y:.2f})."
        )
