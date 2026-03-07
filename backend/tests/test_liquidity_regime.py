"""Tests for app.engine_v1.liquidity_regime."""

import pytest

from app.engine_v1.liquidity_regime import (
    RegimeClassification,
    classify_liquidity_regime,
    _STRESSED_THRESHOLD,
    _CRISIS_THRESHOLD,
    _REGIME_PARAMS,
)


class TestRegimeClassification:
    def test_to_dict(self):
        rc = RegimeClassification(
            regime="NORMAL",
            slippage_multiplier=1.0,
            margin_multiplier=1.0,
            adv_ratio=0.9,
            spread_widening=10.0,
            vol_spike=5.0,
            margin_compression=0.0,
            score=8.0,
            factors={},
        )
        d = rc.to_dict()
        assert d["regime"] == "NORMAL"
        assert d["slippage_multiplier"] == 1.0
        assert d["margin_multiplier"] == 1.0
        assert d["adv_ratio"] == 0.9
        assert d["spread_widening"] == 10.0
        assert d["vol_spike"] == 5.0
        assert d["margin_compression"] == 0.0
        assert d["score"] == 8.0
        assert d["factors"] == {}

    def test_to_dict_with_factors(self):
        rc = RegimeClassification(
            regime="CRISIS",
            slippage_multiplier=5.0,
            margin_multiplier=3.0,
            adv_ratio=0.1,
            spread_widening=90.0,
            vol_spike=80.0,
            margin_compression=70.0,
            score=85.0,
            factors={"adv": "Low ADV (score=90)", "volatility": "Elevated vol"},
        )
        d = rc.to_dict()
        assert d["regime"] == "CRISIS"
        assert len(d["factors"]) == 2


class TestClassifyLiquidityRegime:
    def test_normal_regime(self):
        market = {
            "vol_surface": {"VIX_1M": 16.0},
            "margin_rates": {"FWD": {"initial": 0.03}},
        }
        liquidity = {"avg_liquidity_score": 0.9, "min_liquidity_score": 0.85}
        result = classify_liquidity_regime(market, liquidity)
        assert result.regime == "NORMAL"
        assert result.slippage_multiplier == 1.0
        assert result.margin_multiplier == 1.0

    def test_stressed_regime(self):
        market = {
            "vol_surface": {"VIX_1M": 30.0},
            "margin_rates": {"FWD": {"initial": 0.06}},
        }
        liquidity = {"avg_liquidity_score": 0.4, "min_liquidity_score": 0.3}
        result = classify_liquidity_regime(market, liquidity)
        assert result.regime == "STRESSED"
        assert result.slippage_multiplier == 2.0
        assert result.margin_multiplier == 1.5

    def test_crisis_regime(self):
        market = {
            "vol_surface": {"VIX_1M": 45.0},
            "margin_rates": {"FWD": {"initial": 0.10}},
        }
        liquidity = {"avg_liquidity_score": 0.1, "min_liquidity_score": 0.05}
        result = classify_liquidity_regime(market, liquidity)
        assert result.regime == "CRISIS"
        assert result.slippage_multiplier == 5.0
        assert result.margin_multiplier == 3.0

    def test_default_market_values(self):
        result = classify_liquidity_regime({}, {})
        assert result.regime in ("NORMAL", "STRESSED", "CRISIS")

    def test_default_liquidity_values(self):
        result = classify_liquidity_regime({}, {})
        # avg=1.0->adv=0, min=1.0->spread=0, VIX=18->vol=12, margin=0.03->margin=0
        assert result.score == pytest.approx(0 * 0.25 + 0 * 0.25 + 12.0 * 0.30 + 0 * 0.20, abs=0.1)

    def test_adv_factor_added(self):
        market = {"vol_surface": {}, "margin_rates": {}}
        liquidity = {"avg_liquidity_score": 0.5, "min_liquidity_score": 0.9}
        result = classify_liquidity_regime(market, liquidity)
        assert "adv" in result.factors

    def test_spread_factor_added(self):
        market = {"vol_surface": {}, "margin_rates": {}}
        liquidity = {"avg_liquidity_score": 0.9, "min_liquidity_score": 0.5}
        result = classify_liquidity_regime(market, liquidity)
        assert "spread" in result.factors

    def test_volatility_factor_added(self):
        market = {"vol_surface": {"VIX_1M": 30.0}, "margin_rates": {}}
        liquidity = {"avg_liquidity_score": 1.0, "min_liquidity_score": 1.0}
        result = classify_liquidity_regime(market, liquidity)
        assert "volatility" in result.factors

    def test_margin_factor_added(self):
        market = {"vol_surface": {}, "margin_rates": {"FWD": {"initial": 0.08}}}
        liquidity = {"avg_liquidity_score": 1.0, "min_liquidity_score": 1.0}
        result = classify_liquidity_regime(market, liquidity)
        assert "margin" in result.factors

    def test_no_factors_when_all_calm(self):
        market = {
            "vol_surface": {"VIX_1M": 15.0},
            "margin_rates": {"FWD": {"initial": 0.03}},
        }
        liquidity = {"avg_liquidity_score": 1.0, "min_liquidity_score": 1.0}
        result = classify_liquidity_regime(market, liquidity)
        assert result.factors == {}

    def test_pair_specific_vol_scoring_g10(self):
        market = {
            "vol_surface": {"VIX_1M": 16.0, "EURUSD_1M": 12.0},
            "margin_rates": {},
        }
        liquidity = {"avg_liquidity_score": 0.9, "min_liquidity_score": 0.85}
        result = classify_liquidity_regime(market, liquidity, pair="EURUSD")
        # EURUSD is G10 -> vol_score = max(0, (12-5)/15*100) ≈ 46.7
        assert result.vol_spike > 0

    def test_pair_specific_vol_em(self):
        market = {
            "vol_surface": {"VIX_1M": 16.0, "USDMXN_1M": 20.0},
            "margin_rates": {},
        }
        liquidity = {"avg_liquidity_score": 0.9, "min_liquidity_score": 0.85}
        result = classify_liquidity_regime(market, liquidity, pair="USDMXN")
        # USDMXN is EM_LATAM -> vol_score = max(0, (20-10)/25*100) = 40
        assert result.vol_spike > 0

    def test_pair_vol_zero_falls_back_to_vix(self):
        market = {
            "vol_surface": {"VIX_1M": 25.0, "EURUSD_1M": 0.0},
            "margin_rates": {},
        }
        liquidity = {"avg_liquidity_score": 0.9, "min_liquidity_score": 0.85}
        result = classify_liquidity_regime(market, liquidity, pair="EURUSD")
        expected_vol_score = max(0, (25 - 15) / 25 * 100)
        assert result.vol_spike == pytest.approx(expected_vol_score, abs=0.1)

    def test_pair_not_in_vol_surface(self):
        market = {
            "vol_surface": {"VIX_1M": 20.0},
            "margin_rates": {},
        }
        liquidity = {"avg_liquidity_score": 0.9, "min_liquidity_score": 0.85}
        result = classify_liquidity_regime(market, liquidity, pair="EURUSD")
        expected_vol_score = max(0, (20 - 15) / 25 * 100)
        assert result.vol_spike == pytest.approx(expected_vol_score, abs=0.1)

    def test_pair_none_uses_vix(self):
        market = {
            "vol_surface": {"VIX_1M": 22.0},
            "margin_rates": {},
        }
        liquidity = {"avg_liquidity_score": 0.9, "min_liquidity_score": 0.85}
        result = classify_liquidity_regime(market, liquidity, pair=None)
        expected_vol_score = max(0, (22 - 15) / 25 * 100)
        assert result.vol_spike == pytest.approx(expected_vol_score, abs=0.1)

    def test_score_is_weighted_composite(self):
        market = {
            "vol_surface": {"VIX_1M": 18.0},
            "margin_rates": {"FWD": {"initial": 0.03}},
        }
        liquidity = {"avg_liquidity_score": 0.8, "min_liquidity_score": 0.7}
        result = classify_liquidity_regime(market, liquidity)
        adv_score = (1 - 0.8) * 100
        spread_score = (1 - 0.7) * 100
        vol_score = max(0, (18 - 15) / 25 * 100)
        margin_score = max(0, (0.03 - 0.03) / 0.07 * 100)
        expected = adv_score * 0.25 + spread_score * 0.25 + vol_score * 0.30 + margin_score * 0.20
        assert result.score == pytest.approx(expected, abs=0.01)

    def test_regime_thresholds_constants(self):
        assert _STRESSED_THRESHOLD == 40.0
        assert _CRISIS_THRESHOLD == 70.0

    def test_regime_params_structure(self):
        assert "NORMAL" in _REGIME_PARAMS
        assert "STRESSED" in _REGIME_PARAMS
        assert "CRISIS" in _REGIME_PARAMS
        assert _REGIME_PARAMS["NORMAL"]["slippage"] == 1.0
        assert _REGIME_PARAMS["STRESSED"]["slippage"] == 2.0
        assert _REGIME_PARAMS["CRISIS"]["slippage"] == 5.0

    def test_boundary_exactly_at_stressed_threshold(self):
        # adv=40, spread=40, vol=40, margin=40 -> composite=40 exactly
        market = {
            "vol_surface": {"VIX_1M": 25.0},
            "margin_rates": {"FWD": {"initial": 0.058}},
        }
        liquidity = {"avg_liquidity_score": 0.6, "min_liquidity_score": 0.6}
        result = classify_liquidity_regime(market, liquidity)
        assert result.regime == "STRESSED"

    def test_adv_ratio_returned(self):
        liquidity = {"avg_liquidity_score": 0.75, "min_liquidity_score": 0.8}
        result = classify_liquidity_regime({}, liquidity)
        assert result.adv_ratio == 0.75

    def test_vol_score_clamps_at_zero_when_vix_below_15(self):
        market = {"vol_surface": {"VIX_1M": 10.0}, "margin_rates": {}}
        result = classify_liquidity_regime(market, {})
        assert result.vol_spike == 0.0

    def test_margin_score_zero_at_base(self):
        """Margin initial of exactly 0.03 should yield zero margin score."""
        market = {"vol_surface": {}, "margin_rates": {"FWD": {"initial": 0.03}}}
        result = classify_liquidity_regime(market, {})
        assert result.margin_compression == 0.0

    def test_missing_margin_rates_key(self):
        """No margin_rates in market should use default 0.03."""
        result = classify_liquidity_regime({"vol_surface": {}}, {})
        assert result.margin_compression == 0.0

    def test_spread_widening_output(self):
        liquidity = {"avg_liquidity_score": 1.0, "min_liquidity_score": 0.5}
        result = classify_liquidity_regime({}, liquidity)
        assert result.spread_widening == pytest.approx(50.0)
