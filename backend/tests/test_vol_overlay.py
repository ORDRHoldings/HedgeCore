"""Tests for volatility overlay (Layer 2).

Covers:
  - Inactive overlay parity with v1 (all multipliers = 1.0)
  - Regime classification
  - Band widening calculations
  - Ratio adjustment calculations
  - Fallback vol lookups
  - Active overlay adjustments
"""

import pytest

from app.engine_v1.vol_overlay import (
    BASELINE_VOL,
    FALLBACK_VOLS,
    apply_volatility_overlay,
    classify_regime,
    compute_band_widening,
    compute_ratio_adjustment,
    get_fallback_vol,
    get_region,
)


class TestInactiveParity:
    """When overlay is disabled, v1 parity is guaranteed."""

    def test_disabled_by_default(self):
        result = apply_volatility_overlay({})
        assert result["active"] is False
        assert result["band_multiplier"] == 1.0
        assert result["ratio_multiplier"] == 1.0

    def test_disabled_explicit(self):
        result = apply_volatility_overlay({"volatility_regime_enabled": False})
        assert result["active"] is False

    def test_disabled_no_vol_data(self):
        result = apply_volatility_overlay({"volatility_regime_enabled": True}, vol_data=None)
        assert result["active"] is False
        assert result["band_multiplier"] == 1.0

    def test_all_multipliers_neutral_when_inactive(self):
        result = apply_volatility_overlay({})
        assert result["band_multiplier"] == 1.0
        assert result["ratio_multiplier"] == 1.0
        assert result["regime"] == "NORMAL"
        assert result["adjustments"] == []


class TestRegimeClassification:
    def test_low_vol(self):
        assert classify_regime(0.04) == "LOW"

    def test_normal_vol(self):
        assert classify_regime(0.10) == "NORMAL"

    def test_elevated_vol(self):
        assert classify_regime(0.18) == "ELEVATED"

    def test_crisis_vol(self):
        assert classify_regime(0.30) == "CRISIS"

    def test_boundary_low_normal(self):
        assert classify_regime(0.06) == "NORMAL"

    def test_boundary_normal_elevated(self):
        assert classify_regime(0.14) == "ELEVATED"

    def test_boundary_elevated_crisis(self):
        assert classify_regime(0.22) == "CRISIS"


class TestBandWidening:
    def test_normal_no_widening(self):
        assert compute_band_widening("NORMAL") == 1.0

    def test_elevated_widening(self):
        assert compute_band_widening("ELEVATED") == 1.15

    def test_crisis_widening(self):
        assert compute_band_widening("CRISIS") == 1.30

    def test_low_tighter(self):
        assert compute_band_widening("LOW") == 0.9

    def test_unknown_regime_neutral(self):
        assert compute_band_widening("UNKNOWN") == 1.0


class TestRatioAdjustment:
    def test_baseline_no_adjustment(self):
        result = compute_ratio_adjustment(BASELINE_VOL, BASELINE_VOL)
        assert result == 1.0

    def test_elevated_vol_increases_ratio(self):
        result = compute_ratio_adjustment(0.20, BASELINE_VOL)
        assert result > 1.0

    def test_low_vol_decreases_ratio(self):
        result = compute_ratio_adjustment(0.10, BASELINE_VOL)
        assert result < 1.0

    def test_clamped_max(self):
        result = compute_ratio_adjustment(0.50, BASELINE_VOL)
        assert result == 1.15  # clamp_max

    def test_clamped_min(self):
        result = compute_ratio_adjustment(0.02, BASELINE_VOL)
        assert result == 0.85  # clamp_min

    def test_zero_baseline_returns_1(self):
        result = compute_ratio_adjustment(0.10, 0.0)
        assert result == 1.0


class TestFallbackVols:
    def test_g10_pairs(self):
        assert get_region("EURUSD") == "G10"
        assert get_fallback_vol("EURUSD") == 0.08

    def test_em_latam_pairs(self):
        assert get_region("USDMXN") == "EM_LATAM"
        assert get_fallback_vol("USDMXN") == 0.14

    def test_em_asia_pairs(self):
        assert get_region("USDINR") == "EM_ASIA"
        assert get_fallback_vol("USDINR") == 0.10

    def test_em_ceemea_pairs(self):
        assert get_region("USDTRY") == "EM_CEEMEA"
        assert get_fallback_vol("USDTRY") == 0.16

    def test_unknown_pair_defaults_em_latam(self):
        assert get_region("USDXYZ") == "EM_LATAM"
        assert get_fallback_vol("USDXYZ") == 0.14


class TestActiveOverlay:
    def test_active_with_vol_data(self):
        policy = {
            "volatility_regime_enabled": True,
            "volatility_band_widening_enabled": True,
            "volatility_ratio_adjustment_enabled": True,
        }
        vol_data = {"pair": "USDMXN", "vol_annualized": 0.20, "regime": "ELEVATED"}
        result = apply_volatility_overlay(policy, vol_data)
        assert result["active"] is True
        assert result["regime"] == "ELEVATED"
        assert result["band_multiplier"] == 1.15
        assert result["ratio_multiplier"] > 1.0

    def test_fallback_vol_when_zero(self):
        policy = {"volatility_regime_enabled": True}
        vol_data = {"pair": "USDMXN", "vol_annualized": 0.0}
        result = apply_volatility_overlay(policy, vol_data)
        assert result["active"] is True
        # Should have fallback substitution adjustment
        fb_adj = [a for a in result["adjustments"] if a["name"] == "fallback_vol_substitution"]
        assert len(fb_adj) == 1
        assert fb_adj[0]["fallback_vol"] == 0.14  # EM_LATAM

    def test_grading_label(self):
        result = apply_volatility_overlay({})
        assert result["grading"] == "HEURISTIC"
