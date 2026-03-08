"""Tests for netting overlay (Layer 6).

Covers:
  - Inactive overlay parity with v1 (passthrough)
  - Net exposure computation
  - Partial netting
  - Full netting (offsetting legs)
  - Confirmed/forecast cross-netting
  - Savings calculations
"""

import pytest

from app.engine_v1.netting_overlay import (
    apply_netting_overlay,
    compute_net_exposures,
)


class TestInactiveParity:
    """When disabled, exposures pass through unchanged — v1 parity."""

    def test_disabled_by_default(self):
        exposures = [{"pair": "USDMXN", "notional_usd": 1_000_000, "direction": "BUY", "flow_type": "confirmed"}]
        result = apply_netting_overlay({}, exposures)
        assert result["active"] is False
        assert result["net_exposures"] == exposures
        assert result["legs_eliminated"] == 0

    def test_disabled_explicit(self):
        result = apply_netting_overlay({"netting_enabled": False}, [])
        assert result["active"] is False

    def test_empty_exposures(self):
        result = apply_netting_overlay({"netting_enabled": True}, [])
        assert result["active"] is False
        assert result["net_exposures"] == []

    def test_none_exposures(self):
        result = apply_netting_overlay({"netting_enabled": True}, None)
        assert result["active"] is False


class TestNetExposures:
    def test_single_exposure_no_netting(self):
        exposures = [{"pair": "USDMXN", "notional_usd": 1_000_000, "direction": "BUY", "flow_type": "confirmed"}]
        result = compute_net_exposures(exposures)
        assert len(result["net_exposures"]) == 1
        assert result["legs_eliminated"] == 0

    def test_offsetting_exposures_fully_netted(self):
        exposures = [
            {"pair": "USDMXN", "notional_usd": 1_000_000, "direction": "BUY", "flow_type": "confirmed"},
            {"pair": "USDMXN", "notional_usd": 1_000_000, "direction": "SELL", "flow_type": "confirmed"},
        ]
        result = compute_net_exposures(exposures)
        assert len(result["net_exposures"]) == 0
        assert result["legs_eliminated"] == 2

    def test_partial_netting(self):
        exposures = [
            {"pair": "USDMXN", "notional_usd": 1_000_000, "direction": "BUY", "flow_type": "confirmed"},
            {"pair": "USDMXN", "notional_usd": 600_000, "direction": "SELL", "flow_type": "confirmed"},
        ]
        result = compute_net_exposures(exposures)
        assert len(result["net_exposures"]) == 1
        assert result["net_exposures"][0]["notional_usd"] == 400_000
        assert result["net_exposures"][0]["direction"] == "BUY"

    def test_multi_pair_independent(self):
        exposures = [
            {"pair": "USDMXN", "notional_usd": 1_000_000, "direction": "BUY", "flow_type": "confirmed"},
            {"pair": "EURUSD", "notional_usd": 500_000, "direction": "SELL", "flow_type": "confirmed"},
        ]
        result = compute_net_exposures(exposures)
        assert len(result["net_exposures"]) == 2

    def test_cross_netting_confirmed_forecast_disabled(self):
        """Without cross-netting, confirmed and forecast are independent."""
        exposures = [
            {"pair": "USDMXN", "notional_usd": 1_000_000, "direction": "BUY", "flow_type": "confirmed"},
            {"pair": "USDMXN", "notional_usd": 1_000_000, "direction": "SELL", "flow_type": "forecast"},
        ]
        result = compute_net_exposures(exposures, net_confirmed_forecast=False)
        assert len(result["net_exposures"]) == 2  # NOT netted

    def test_cross_netting_confirmed_forecast_enabled(self):
        """With cross-netting, confirmed and forecast net against each other."""
        exposures = [
            {"pair": "USDMXN", "notional_usd": 1_000_000, "direction": "BUY", "flow_type": "confirmed"},
            {"pair": "USDMXN", "notional_usd": 1_000_000, "direction": "SELL", "flow_type": "forecast"},
        ]
        result = compute_net_exposures(exposures, net_confirmed_forecast=True)
        assert len(result["net_exposures"]) == 0  # Fully netted

    def test_savings_calculation(self):
        exposures = [
            {"pair": "USDMXN", "notional_usd": 1_000_000, "direction": "BUY", "flow_type": "confirmed"},
            {"pair": "USDMXN", "notional_usd": 600_000, "direction": "SELL", "flow_type": "confirmed"},
        ]
        result = compute_net_exposures(exposures)
        savings = result["netting_savings"]
        assert savings["gross_notional"] == 1_600_000
        assert savings["net_notional"] == 400_000
        assert savings["savings_pct"] == 75.0


class TestActiveOverlay:
    def test_active_netting(self):
        policy = {"netting_enabled": True, "netting_settlement_cycle_days": 3}
        exposures = [
            {"pair": "USDMXN", "notional_usd": 1_000_000, "direction": "BUY", "flow_type": "confirmed"},
            {"pair": "USDMXN", "notional_usd": 400_000, "direction": "SELL", "flow_type": "confirmed"},
        ]
        result = apply_netting_overlay(policy, exposures)
        assert result["active"] is True
        assert result["settlement_cycle_days"] == 3
        assert len(result["net_exposures"]) == 1
        assert result["net_exposures"][0]["notional_usd"] == 600_000

    def test_grading_label(self):
        result = apply_netting_overlay({})
        assert result["grading"] == "HEURISTIC"
