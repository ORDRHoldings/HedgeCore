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
    def test_standard_bucket(self):
        assert _estimate_months("2026-06") == 6

    def test_single_part_defaults_to_3(self):
        assert _estimate_months("bucket") == 3

    def test_non_numeric_defaults_to_3(self):
        assert _estimate_months("abc-xyz") == 3

    def test_empty_defaults_to_3(self):
        assert _estimate_months("") == 3

    def test_zero_month_clamped_to_1(self):
        assert _estimate_months("2026-00") == 1

    def test_twelve_month(self):
        assert _estimate_months("2026-12") == 12


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
            "maturity": "2026-06",  # 6 months
        }]
        market = {
            "interest_curves": {
                "USD": {"3M": 5.0},
                "MXN": {"3M": 11.0},
            },
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
            "maturity": "2026-12",  # 12 months
        }]
        market = {"funding_rate_bps": 20.0}
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
