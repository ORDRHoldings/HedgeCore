"""Tests for engine_v1/credit_duration.py — Credit spread duration mapping."""

import pytest

from app.engine_v1.credit_duration import (
    map_credit_duration,
    CreditDurationResult,
    DEFAULT_EQUITY_VOL,
    DEFAULT_CREDIT_VOL,
)


class TestMapCreditDuration:
    def test_basic_mapping(self):
        result = map_credit_duration(1_000_000, {})
        assert isinstance(result, CreditDurationResult)
        assert result.equity_delta == 1_000_000
        assert result.spread_duration_equiv != 0

    def test_formula(self):
        """spread_duration_equiv = equity_delta * correlation * (equity_vol / credit_vol)."""
        result = map_credit_duration(
            equity_delta=1_000_000,
            policy={"credit_equity_correlation": 0.7},
            equity_vol=0.20,
            credit_vol=0.08,
        )
        expected = 1_000_000 * 0.7 * (0.20 / 0.08)
        assert result.spread_duration_equiv == pytest.approx(expected)

    def test_default_vols(self):
        result = map_credit_duration(1_000_000, {})
        assert result.equity_vol == DEFAULT_EQUITY_VOL
        assert result.credit_vol == DEFAULT_CREDIT_VOL

    def test_custom_correlation(self):
        r1 = map_credit_duration(1_000_000, {"credit_equity_correlation": 0.5})
        r2 = map_credit_duration(1_000_000, {"credit_equity_correlation": 0.9})
        assert abs(r2.spread_duration_equiv) > abs(r1.spread_duration_equiv)

    def test_hyg_lqd_sizing(self):
        """HYG duration ~4y, LQD ~8y. Notional = spread_dur / instrument_dur."""
        result = map_credit_duration(1_000_000, {}, equity_vol=0.20, credit_vol=0.08)
        assert result.hyg_notional_equivalent == pytest.approx(abs(result.spread_duration_equiv) / 4.0)
        assert result.lqd_notional_equivalent == pytest.approx(abs(result.spread_duration_equiv) / 8.0)

    def test_credit_dv01(self):
        """DV01 = |spread_duration_equiv| / 10000."""
        result = map_credit_duration(1_000_000, {})
        assert result.credit_dv01 == pytest.approx(abs(result.spread_duration_equiv) / 10000.0)

    def test_zero_delta(self):
        result = map_credit_duration(0, {})
        assert result.spread_duration_equiv == 0.0
        assert result.hyg_notional_equivalent == 0.0

    def test_negative_delta(self):
        result = map_credit_duration(-1_000_000, {})
        assert result.spread_duration_equiv < 0

    def test_market_vol_override(self):
        """When market has vol_surface, use it instead of defaults."""
        market = {"vol_surface": {"SPX_REALIZED_1M": 0.25, "HYG_SPREAD_VOL": 0.10}}
        result = map_credit_duration(1_000_000, {}, market=market)
        assert result.equity_vol == 0.25
        assert result.credit_vol == 0.10

    def test_to_dict(self):
        result = map_credit_duration(1_000_000, {})
        d = result.to_dict()
        assert "spread_duration_equiv" in d
        assert "hyg_notional_equivalent" in d
        assert "credit_dv01" in d
        assert d["equity_delta"] == 1_000_000
