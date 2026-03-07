"""Tests for engine_v1/vol_mapping.py — Vega-VIX conversion."""

import pytest

from app.engine_v1.vol_mapping import (
    map_vega_to_vix,
    VegaMappingResult,
)


class TestMapVegaToVix:
    def test_basic(self):
        result = map_vega_to_vix(10_000, {"vol_surface": {"VIX_1M": 20.0, "VIX_3M": 22.0}}, {})
        assert isinstance(result, VegaMappingResult)
        assert result.net_vega == 10_000

    def test_equivalent_contracts(self):
        """equivalent_contracts = term_adjusted_vega / vix_contract_vega."""
        result = map_vega_to_vix(
            portfolio_vega=4000,
            market={"vol_surface": {"VIX_1M": 20.0, "VIX_3M": 20.0}},
            policy={"vix_contract_vega": 400.0},
            target_tenor_months=1,
        )
        # No term adjustment (front=back=20, weight=0 for 1M target)
        # adjusted_vega = 4000 * (20/20) = 4000
        # contracts = 4000 / 400 = 10
        assert result.equivalent_vix_contracts == pytest.approx(10.0)

    def test_term_structure_adjustment(self):
        """3M target should weight towards back month."""
        market = {"vol_surface": {"VIX_1M": 20.0, "VIX_3M": 25.0}}
        r1 = map_vega_to_vix(10_000, market, {}, target_tenor_months=1)
        r3 = map_vega_to_vix(10_000, market, {}, target_tenor_months=3)
        assert r3.term_adjusted_vega > r1.term_adjusted_vega  # back month higher

    def test_notional_equivalent(self):
        """notional = |contracts| * 1000 * vix_front."""
        result = map_vega_to_vix(
            portfolio_vega=4000,
            market={"vol_surface": {"VIX_1M": 20.0, "VIX_3M": 20.0}},
            policy={"vix_contract_vega": 400.0},
            target_tenor_months=1,
        )
        expected = abs(result.equivalent_vix_contracts) * 1000 * 20.0
        assert result.notional_equivalent_usd == pytest.approx(expected)

    def test_fallback_vix_levels(self):
        """When vol_surface absent, use fallback 18/20."""
        result = map_vega_to_vix(10_000, {}, {})
        assert result.vix_front_month == 18.0
        assert result.vix_back_month == 20.0

    def test_zero_vega(self):
        result = map_vega_to_vix(0, {}, {})
        assert result.equivalent_vix_contracts == 0.0
        assert result.notional_equivalent_usd == 0.0

    def test_negative_vega(self):
        result = map_vega_to_vix(-5000, {}, {})
        assert result.equivalent_vix_contracts < 0

    def test_to_dict(self):
        result = map_vega_to_vix(10_000, {}, {})
        d = result.to_dict()
        assert "net_vega" in d
        assert "equivalent_vix_contracts" in d
        assert "notional_equivalent_usd" in d
        assert d["net_vega"] == 10_000

    def test_custom_contract_vega(self):
        """Different contract vega should scale contracts."""
        r1 = map_vega_to_vix(10_000, {}, {"vix_contract_vega": 400.0})
        r2 = map_vega_to_vix(10_000, {}, {"vix_contract_vega": 200.0})
        assert abs(r2.equivalent_vix_contracts) == pytest.approx(abs(r1.equivalent_vix_contracts) * 2, rel=0.01)
