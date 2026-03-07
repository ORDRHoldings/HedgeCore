"""Tests for app.engine_v1.margin_attribution."""

import pytest

from app.engine_v1.margin_attribution import (
    MarginBreakdown,
    compute_margin_attribution,
)


def _margin_pos(bucket="2026-03", initial=30_000, maintenance=20_000):
    return {"bucket": bucket, "initial_margin": initial, "maintenance_margin": maintenance}


def _liquidity(bucket="2026-03", score=1.0):
    return {"bucket": bucket, "liquidity_score": score}


# ---------------------------------------------------------------------------
# Dataclass serialization
# ---------------------------------------------------------------------------

class TestMarginBreakdownToDict:
    def test_to_dict(self):
        mb = MarginBreakdown(
            initial=30_000, maintenance=20_000, stress_addon=15_000,
            liquidity_addon=5_000, concentration_addon=3_000, total=53_000,
        )
        d = mb.to_dict()
        assert d["initial"] == 30_000
        assert d["total"] == 53_000


# ---------------------------------------------------------------------------
# compute_margin_attribution
# ---------------------------------------------------------------------------

class TestComputeMarginAttribution:
    def test_empty_inputs(self):
        result = compute_margin_attribution([], [], {})
        assert result.initial == 0.0
        assert result.total == 0.0

    def test_initial_margin_summed(self):
        positions = [_margin_pos(initial=30_000), _margin_pos(bucket="2026-06", initial=20_000)]
        result = compute_margin_attribution(positions, [], {})
        assert result.initial == 50_000

    def test_maintenance_margin_summed(self):
        positions = [_margin_pos(maintenance=20_000), _margin_pos(bucket="2026-06", maintenance=10_000)]
        result = compute_margin_attribution(positions, [], {})
        assert result.maintenance == 30_000

    def test_stress_addon_formula(self):
        """stress = initial * (multiplier - 1)"""
        positions = [_margin_pos(initial=100_000)]
        result = compute_margin_attribution(positions, [], {}, scenario_stress_multiplier=1.5)
        assert result.stress_addon == pytest.approx(50_000)

    def test_stress_addon_default_multiplier(self):
        positions = [_margin_pos(initial=100_000)]
        result = compute_margin_attribution(positions, [], {})
        # Default multiplier is 1.5
        assert result.stress_addon == pytest.approx(50_000)

    def test_liquidity_addon_when_low_score(self):
        """liq_addon = initial * (1 - liq_score) * 0.5"""
        positions = [_margin_pos(initial=100_000)]
        liquidity = [_liquidity(score=0.5)]
        result = compute_margin_attribution(positions, liquidity, {})
        expected = 100_000 * (1.0 - 0.5) * 0.5
        assert result.liquidity_addon == pytest.approx(expected)

    def test_no_liquidity_addon_when_full_score(self):
        positions = [_margin_pos(initial=100_000)]
        liquidity = [_liquidity(score=1.0)]
        result = compute_margin_attribution(positions, liquidity, {})
        assert result.liquidity_addon == 0.0

    def test_concentration_addon_when_above_threshold(self):
        """conc_addon = total_initial * excess * 0.3"""
        positions = [_margin_pos(initial=100_000)]
        concentration = {"FWD": 0.50}  # 50% > 25% threshold, excess=0.25
        result = compute_margin_attribution(positions, [], concentration, concentration_threshold=0.25)
        expected = 100_000 * 0.25 * 0.3
        assert result.concentration_addon == pytest.approx(expected)

    def test_no_concentration_addon_when_below_threshold(self):
        positions = [_margin_pos(initial=100_000)]
        concentration = {"FWD": 0.20}  # 20% < 25% threshold
        result = compute_margin_attribution(positions, [], concentration, concentration_threshold=0.25)
        assert result.concentration_addon == 0.0

    def test_total_is_sum_of_components(self):
        """total = initial + stress + liquidity + concentration"""
        positions = [_margin_pos(initial=100_000)]
        liquidity = [_liquidity(score=0.6)]
        concentration = {"FWD": 0.40}
        result = compute_margin_attribution(
            positions, liquidity, concentration,
            scenario_stress_multiplier=2.0,
            concentration_threshold=0.25,
        )
        expected_total = (
            result.initial +
            result.stress_addon +
            result.liquidity_addon +
            result.concentration_addon
        )
        assert result.total == pytest.approx(expected_total)

    def test_multiple_positions_with_different_buckets(self):
        positions = [
            _margin_pos(bucket="2026-03", initial=50_000),
            _margin_pos(bucket="2026-06", initial=30_000),
        ]
        liquidity = [
            _liquidity(bucket="2026-03", score=0.8),
            _liquidity(bucket="2026-06", score=0.5),
        ]
        result = compute_margin_attribution(positions, liquidity, {})
        assert result.initial == 80_000
        # 2026-03: 50k * (1-0.8) * 0.5 = 5k
        # 2026-06: 30k * (1-0.5) * 0.5 = 7.5k
        assert result.liquidity_addon == pytest.approx(12_500)

    def test_multiple_concentration_instruments(self):
        positions = [_margin_pos(initial=100_000)]
        concentration = {"FWD": 0.30, "NDF": 0.35}
        result = compute_margin_attribution(
            positions, [], concentration, concentration_threshold=0.25,
        )
        # FWD: 100k * 0.05 * 0.3 = 1500
        # NDF: 100k * 0.10 * 0.3 = 3000
        assert result.concentration_addon == pytest.approx(4_500)

    def test_custom_stress_multiplier(self):
        positions = [_margin_pos(initial=100_000)]
        result = compute_margin_attribution(positions, [], {}, scenario_stress_multiplier=3.0)
        assert result.stress_addon == pytest.approx(200_000)

    def test_zero_initial_margin(self):
        positions = [_margin_pos(initial=0)]
        result = compute_margin_attribution(positions, [], {})
        assert result.stress_addon == 0.0
        assert result.total == 0.0

    def test_missing_liquidity_bucket_uses_default(self):
        positions = [_margin_pos(bucket="2026-03", initial=100_000)]
        liquidity = [_liquidity(bucket="2026-06", score=0.3)]  # Different bucket
        result = compute_margin_attribution(positions, liquidity, {})
        # No matching liquidity bucket -> default score=1.0 -> no addon
        assert result.liquidity_addon == 0.0
