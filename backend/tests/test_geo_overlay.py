"""Tests for geopolitical overlay (Layer 3).

Covers:
  - Inactive overlay parity with v1 (zero haircut)
  - Corridor mapping
  - Haircut computation
  - Active overlay with corridor scores
  - Zero-impact proof when disabled
"""

import pytest

from app.engine_v1.geo_overlay import (
    apply_geopolitical_overlay,
    compute_ratio_haircut,
    apply_haircut_to_ratio,
    pair_to_corridor,
)


class TestInactiveParity:
    """When overlay is disabled, zero haircut — v1 parity guaranteed."""

    def test_disabled_by_default(self):
        result = apply_geopolitical_overlay({})
        assert result["active"] is False
        assert result["haircut"] == 0.0

    def test_disabled_explicit(self):
        result = apply_geopolitical_overlay({"geopolitical_overlay_enabled": False})
        assert result["active"] is False
        assert result["haircut"] == 0.0

    def test_disabled_no_corridor_data(self):
        result = apply_geopolitical_overlay(
            {"geopolitical_overlay_enabled": True},
            corridor_scores=None,
        )
        assert result["active"] is False
        assert result["haircut"] == 0.0

    def test_zero_impact_all_fields(self):
        result = apply_geopolitical_overlay({})
        assert result["haircut"] == 0.0
        assert result["score"] == 0.0
        assert result["regime"] == "STABLE"
        assert result["adjustments"] == []


class TestCorridorMapping:
    def test_usdmxn_maps_to_us_mx(self):
        assert pair_to_corridor("USDMXN") == "US-MX"

    def test_eurusd_maps_to_eu_us(self):
        assert pair_to_corridor("EURUSD") == "EU-US"

    def test_unknown_pair_returns_none(self):
        assert pair_to_corridor("XYZABC") is None

    def test_case_insensitive(self):
        assert pair_to_corridor("usdmxn") == "US-MX"


class TestHaircutComputation:
    def test_below_threshold_no_haircut(self):
        assert compute_ratio_haircut(0.5, escalation_threshold=0.7) == 0.0

    def test_at_threshold_no_haircut(self):
        assert compute_ratio_haircut(0.7, escalation_threshold=0.7) == 0.0

    def test_above_threshold_partial_haircut(self):
        haircut = compute_ratio_haircut(0.85, escalation_threshold=0.7, max_haircut=0.10)
        assert 0.0 < haircut < 0.10

    def test_max_score_max_haircut(self):
        haircut = compute_ratio_haircut(1.0, escalation_threshold=0.7, max_haircut=0.10)
        assert haircut == 0.10

    def test_linear_interpolation(self):
        # At midpoint between threshold and 1.0: should be ~50% of max haircut
        haircut = compute_ratio_haircut(0.85, escalation_threshold=0.7, max_haircut=0.10)
        assert abs(haircut - 0.05) < 0.01

    def test_custom_threshold(self):
        assert compute_ratio_haircut(0.4, escalation_threshold=0.5) == 0.0
        assert compute_ratio_haircut(0.6, escalation_threshold=0.5) > 0.0


class TestHaircutApplication:
    def test_no_haircut(self):
        assert apply_haircut_to_ratio(0.80, 0.0) == 0.80

    def test_partial_haircut(self):
        assert apply_haircut_to_ratio(0.80, 0.05) == 0.75

    def test_full_haircut_floors_at_zero(self):
        assert apply_haircut_to_ratio(0.05, 0.10) == 0.0


class TestActiveOverlay:
    def test_active_with_corridor_scores(self):
        policy = {
            "geopolitical_overlay_enabled": True,
            "geopolitical_escalation_threshold": 0.7,
            "geopolitical_ratio_haircut_max": 0.10,
        }
        scores = {"US-MX": 0.85}
        result = apply_geopolitical_overlay(policy, scores, pair="USDMXN")
        assert result["active"] is True
        assert result["corridor"] == "US-MX"
        assert result["score"] == 0.85
        assert result["regime"] == "CRISIS"
        assert result["haircut"] > 0.0

    def test_stable_corridor_no_haircut(self):
        policy = {"geopolitical_overlay_enabled": True}
        scores = {"US-MX": 0.2}
        result = apply_geopolitical_overlay(policy, scores, pair="USDMXN")
        assert result["active"] is True
        assert result["regime"] == "STABLE"
        assert result["haircut"] == 0.0

    def test_missing_corridor_no_impact(self):
        policy = {"geopolitical_overlay_enabled": True}
        scores = {"EU-US": 0.5}  # no US-MX
        result = apply_geopolitical_overlay(policy, scores, pair="USDMXN")
        assert result["active"] is True
        assert result["haircut"] == 0.0
        adj = [a for a in result["adjustments"] if a["name"] == "no_corridor_data"]
        assert len(adj) == 1

    def test_grading_label(self):
        result = apply_geopolitical_overlay({})
        assert result["grading"] == "HEURISTIC"
