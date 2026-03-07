"""Tests for engine_v1/fx_tensor.py — Multi-currency exposure tensor decomposition."""

import pytest

from app.engine_v1.fx_tensor import (
    compute_exposure_tensor,
    ExposureTensor,
    CurrencyExposure,
    _tenor_to_fraction,
    _months_to_tenor,
)


# ── Helper tests ──────────────────────────────────────────────────────

class TestTenorMapping:
    def test_standard_tenors(self):
        assert _tenor_to_fraction("1M") == pytest.approx(1 / 12)
        assert _tenor_to_fraction("3M") == pytest.approx(3 / 12)
        assert _tenor_to_fraction("6M") == pytest.approx(6 / 12)
        assert _tenor_to_fraction("12M") == pytest.approx(1.0)

    def test_unknown_defaults_3m(self):
        assert _tenor_to_fraction("2Y") == pytest.approx(3 / 12)

    def test_months_to_tenor(self):
        assert _months_to_tenor(1) == "1M"
        assert _months_to_tenor(2) == "3M"
        assert _months_to_tenor(3) == "3M"
        assert _months_to_tenor(4) == "6M"
        assert _months_to_tenor(6) == "6M"
        assert _months_to_tenor(9) == "12M"


# ── Core tensor computation ──────────────────────────────────────────

MARKET = {
    "fx_rates": {"USDMXN": 17.15, "EURUSD": 1.085},
    "interest_curves": {
        "USD": {"1M": 5.25, "3M": 5.30, "6M": 5.20, "12M": 5.00},
        "MXN": {"1M": 11.00, "3M": 11.25, "6M": 11.00, "12M": 10.50},
        "EUR": {"1M": 3.75, "3M": 3.80, "6M": 3.65, "12M": 3.50},
    },
    "basis_spreads": {"USDMXN": 15.0, "EURUSD": 5.0},
    "spot_rate": 17.15,
}


class TestComputeExposureTensor:
    def test_empty_trades(self):
        result = compute_exposure_tensor([], MARKET)
        assert isinstance(result, ExposureTensor)
        assert result.currency_count == 0

    def test_single_trade(self):
        trades = [{"currency": "MXN", "funding_currency": "USD", "amount_usd": 1_000_000, "maturity": "2026-03"}]
        result = compute_exposure_tensor(trades, MARKET)
        assert result.currency_count == 1
        assert result.exposures[0].pair == "USDMXN"
        assert result.exposures[0].gross_notional == pytest.approx(1_000_000)

    def test_carry_component(self):
        """Carry = (r_asset - r_funding) * notional * time_fraction."""
        trades = [{"currency": "MXN", "funding_currency": "USD", "amount_usd": 1_000_000, "maturity": "2026-03"}]
        result = compute_exposure_tensor(trades, MARKET)
        exp = result.exposures[0]
        # r_MXN_3M = 11.25%, r_USD_3M = 5.30%, diff = 5.95%
        # carry = 0.0595 * 1M * 0.25 = 14,875
        assert exp.carry_component == pytest.approx(14_875, rel=0.01)

    def test_basis_component(self):
        """Basis = basis_bps / 10000 * notional."""
        trades = [{"currency": "MXN", "funding_currency": "USD", "amount_usd": 1_000_000}]
        result = compute_exposure_tensor(trades, MARKET)
        # basis = 15bps / 10000 * 1M = 1500
        assert result.exposures[0].basis_component == pytest.approx(1500)

    def test_multi_currency(self):
        trades = [
            {"currency": "MXN", "funding_currency": "USD", "amount_usd": 1_000_000},
            {"currency": "EUR", "funding_currency": "USD", "amount_usd": 500_000},
        ]
        result = compute_exposure_tensor(trades, MARKET)
        assert result.currency_count == 2
        pairs = {e.pair for e in result.exposures}
        assert "USDMXN" in pairs
        assert "USDEUR" in pairs

    def test_netting_same_pair(self):
        """Multiple trades in same pair should aggregate."""
        trades = [
            {"currency": "MXN", "funding_currency": "USD", "amount_usd": 1_000_000},
            {"currency": "MXN", "funding_currency": "USD", "amount_usd": -500_000},
        ]
        result = compute_exposure_tensor(trades, MARKET)
        assert result.currency_count == 1
        exp = result.exposures[0]
        assert exp.gross_notional == pytest.approx(1_500_000)
        assert exp.net_notional == pytest.approx(500_000)

    def test_delta_fx(self):
        """delta_fx = net_notional * fx_rate."""
        trades = [{"currency": "MXN", "funding_currency": "USD", "amount_usd": 1_000_000}]
        result = compute_exposure_tensor(trades, MARKET)
        assert result.exposures[0].delta_fx == pytest.approx(1_000_000 * 17.15)

    def test_to_dict(self):
        trades = [{"currency": "MXN", "funding_currency": "USD", "amount_usd": 1_000_000}]
        result = compute_exposure_tensor(trades, MARKET)
        d = result.to_dict()
        assert "exposures" in d
        assert "total_delta_fx" in d
        assert "currency_count" in d
        assert d["exposures"][0]["pair"] == "USDMXN"

    def test_totals_aggregate(self):
        trades = [
            {"currency": "MXN", "funding_currency": "USD", "amount_usd": 1_000_000},
            {"currency": "EUR", "funding_currency": "USD", "amount_usd": 500_000},
        ]
        result = compute_exposure_tensor(trades, MARKET)
        total_delta = sum(e.delta_fx for e in result.exposures)
        assert result.total_delta_fx == pytest.approx(total_delta)
        total_carry = sum(e.carry_component for e in result.exposures)
        assert result.total_carry == pytest.approx(total_carry)
