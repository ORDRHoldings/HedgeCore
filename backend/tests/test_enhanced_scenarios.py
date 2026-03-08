"""Tests for enhanced scenario analysis.

Verifies:
- Shock level resolution
- Vol-scaled shocks
- Historical VaR/ES computation
- Default pack parity with v1 SIGMAS
- Named shock packs

Closes audit finding #9 (enhanced scenario coverage).
"""
import pytest
import json
import math


class TestShockResolution:
    """Shock level resolution from policy config."""

    def test_default_matches_v1_sigmas(self):
        from app.engine_v1.enhanced_scenarios import resolve_shock_levels, DEFAULT_SHOCK_PACK

        name, levels = resolve_shock_levels()
        assert name == "standard"
        assert levels == [-0.10, -0.05, 0.05, 0.10]
        assert levels == DEFAULT_SHOCK_PACK

    def test_named_pack(self):
        from app.engine_v1.enhanced_scenarios import resolve_shock_levels

        name, levels = resolve_shock_levels(named_pack="conservative")
        assert name == "conservative"
        assert len(levels) == 6
        assert -0.15 in levels

    def test_policy_overrides_named(self):
        from app.engine_v1.enhanced_scenarios import resolve_shock_levels

        name, levels = resolve_shock_levels(
            policy_shock_levels=[-0.20, -0.10, 0.10, 0.20],
            named_pack="mild",
        )
        assert name == "policy"
        assert levels == [-0.20, -0.10, 0.10, 0.20]

    def test_custom_overrides_all(self):
        from app.engine_v1.enhanced_scenarios import resolve_shock_levels

        name, levels = resolve_shock_levels(
            policy_shock_levels=[-0.20, 0.20],
            named_pack="mild",
            custom_shocks=[{"shock": -0.30}, {"shock": 0.30}],
        )
        assert name == "custom"
        assert levels == [-0.30, 0.30]

    def test_all_named_packs_valid(self):
        from app.engine_v1.enhanced_scenarios import NAMED_SHOCK_PACKS

        for pack_name, levels in NAMED_SHOCK_PACKS.items():
            assert len(levels) >= 2, f"Pack {pack_name} has fewer than 2 levels"
            assert all(isinstance(lv, float) for lv in levels)
            assert levels == sorted(levels), f"Pack {pack_name} not sorted"

    def test_unknown_named_pack_falls_back(self):
        from app.engine_v1.enhanced_scenarios import resolve_shock_levels

        name, levels = resolve_shock_levels(named_pack="nonexistent")
        assert name == "standard"

    def test_custom_shocks_without_shock_key_ignored(self):
        """Custom shocks entries missing the 'shock' key are filtered out."""
        from app.engine_v1.enhanced_scenarios import resolve_shock_levels

        name, levels = resolve_shock_levels(
            custom_shocks=[{"label": "test"}],
        )
        # No valid shock values, falls through to default
        assert name == "standard"

    def test_empty_policy_shock_levels_falls_back(self):
        from app.engine_v1.enhanced_scenarios import resolve_shock_levels

        name, levels = resolve_shock_levels(policy_shock_levels=[])
        assert name == "standard"

    def test_priority_order_deterministic(self):
        """custom > policy > named > default -- verify the full chain."""
        from app.engine_v1.enhanced_scenarios import resolve_shock_levels

        # Only named
        name1, _ = resolve_shock_levels(named_pack="aggressive")
        assert name1 == "aggressive"

        # Policy overrides named
        name2, _ = resolve_shock_levels(
            policy_shock_levels=[-0.05, 0.05],
            named_pack="aggressive",
        )
        assert name2 == "policy"

        # Custom overrides everything
        name3, _ = resolve_shock_levels(
            policy_shock_levels=[-0.05, 0.05],
            named_pack="aggressive",
            custom_shocks=[{"shock": -0.01}, {"shock": 0.01}],
        )
        assert name3 == "custom"

    def test_shock_levels_always_sorted(self):
        """Resolved levels must always be sorted ascending."""
        from app.engine_v1.enhanced_scenarios import resolve_shock_levels

        _, levels = resolve_shock_levels(
            policy_shock_levels=[0.10, -0.10, 0.05, -0.05],
        )
        assert levels == sorted(levels)


class TestVolScaledShocks:
    """Volatility-scaled shock computation."""

    def test_neutral_at_baseline(self):
        from app.engine_v1.enhanced_scenarios import compute_vol_scaled_shocks

        base = [-0.10, -0.05, 0.05, 0.10]
        scaled, mult = compute_vol_scaled_shocks(base, current_vol=0.15, baseline_vol=0.15)
        assert mult == pytest.approx(1.0)
        assert scaled == base

    def test_elevated_vol_amplifies(self):
        from app.engine_v1.enhanced_scenarios import compute_vol_scaled_shocks

        base = [-0.10, 0.10]
        scaled, mult = compute_vol_scaled_shocks(base, current_vol=0.30, baseline_vol=0.15)
        assert mult == pytest.approx(2.0)
        assert scaled[0] == pytest.approx(-0.20)
        assert scaled[1] == pytest.approx(0.20)

    def test_low_vol_dampens(self):
        from app.engine_v1.enhanced_scenarios import compute_vol_scaled_shocks

        base = [-0.10, 0.10]
        scaled, mult = compute_vol_scaled_shocks(base, current_vol=0.075, baseline_vol=0.15)
        assert mult == pytest.approx(0.5)
        assert scaled[0] == pytest.approx(-0.05)

    def test_clamped_at_3x(self):
        from app.engine_v1.enhanced_scenarios import compute_vol_scaled_shocks

        base = [-0.10, 0.10]
        scaled, mult = compute_vol_scaled_shocks(base, current_vol=1.0, baseline_vol=0.15)
        assert mult == pytest.approx(3.0)

    def test_clamped_at_half(self):
        from app.engine_v1.enhanced_scenarios import compute_vol_scaled_shocks

        base = [-0.10, 0.10]
        scaled, mult = compute_vol_scaled_shocks(base, current_vol=0.01, baseline_vol=0.15)
        assert mult == pytest.approx(0.5)

    def test_zero_vol_returns_base(self):
        from app.engine_v1.enhanced_scenarios import compute_vol_scaled_shocks

        base = [-0.10, 0.10]
        scaled, mult = compute_vol_scaled_shocks(base, current_vol=0.0, baseline_vol=0.15)
        assert mult == 1.0
        assert scaled == base

    def test_zero_baseline_vol_returns_base(self):
        from app.engine_v1.enhanced_scenarios import compute_vol_scaled_shocks

        base = [-0.10, 0.10]
        scaled, mult = compute_vol_scaled_shocks(base, current_vol=0.15, baseline_vol=0.0)
        assert mult == 1.0
        assert scaled == base

    def test_scaling_preserves_symmetry(self):
        """Symmetric base shocks remain symmetric after scaling."""
        from app.engine_v1.enhanced_scenarios import compute_vol_scaled_shocks

        base = [-0.10, -0.05, 0.05, 0.10]
        scaled, _ = compute_vol_scaled_shocks(base, current_vol=0.225, baseline_vol=0.15)
        assert scaled[0] == pytest.approx(-scaled[3])
        assert scaled[1] == pytest.approx(-scaled[2])

    def test_deterministic(self):
        """Same inputs produce same outputs (engine_v1 determinism)."""
        from app.engine_v1.enhanced_scenarios import compute_vol_scaled_shocks

        base = [-0.10, 0.10]
        s1, m1 = compute_vol_scaled_shocks(base, current_vol=0.20, baseline_vol=0.15)
        s2, m2 = compute_vol_scaled_shocks(base, current_vol=0.20, baseline_vol=0.15)
        assert s1 == s2
        assert m1 == m2


class TestHistoricalVaR:
    """Historical VaR and Expected Shortfall computation."""

    def test_basic_var_95(self):
        from app.engine_v1.enhanced_scenarios import compute_historical_var

        # 100 returns: 5 worst are -0.10 each
        returns = [-0.10] * 5 + [0.01] * 95
        result = compute_historical_var(returns, confidence=0.95, exposure_usd=1_000_000)
        assert result.var_value == pytest.approx(-0.10)
        assert result.var_usd == pytest.approx(100_000)
        assert result.expected_shortfall <= result.var_value  # ES <= VaR (more negative)

    def test_insufficient_data(self):
        from app.engine_v1.enhanced_scenarios import compute_historical_var

        result = compute_historical_var([0.01, -0.01], confidence=0.95)
        assert result.var_value == 0.0
        assert result.sample_size == 2

    def test_deterministic(self):
        from app.engine_v1.enhanced_scenarios import compute_historical_var

        import random
        random.seed(42)
        returns = [random.gauss(0, 0.05) for _ in range(100)]
        r1 = compute_historical_var(returns, confidence=0.95)
        r2 = compute_historical_var(returns, confidence=0.95)
        assert r1.var_value == r2.var_value  # same input -> same output

    def test_es_less_than_var(self):
        """Expected shortfall is always <= VaR (more extreme, i.e. more negative)."""
        from app.engine_v1.enhanced_scenarios import compute_historical_var

        import random
        random.seed(42)
        returns = [random.gauss(0, 0.05) for _ in range(252)]
        result = compute_historical_var(returns, confidence=0.95)
        assert result.expected_shortfall <= result.var_value

    def test_to_dict_serializable(self):
        from app.engine_v1.enhanced_scenarios import compute_historical_var

        result = compute_historical_var([0.01] * 30, confidence=0.95)
        serialized = json.dumps(result.to_dict())
        parsed = json.loads(serialized)
        assert "var_value" in parsed
        assert "expected_shortfall" in parsed
        assert parsed["method"] == "HISTORICAL"

    def test_var_usd_scales_with_exposure(self):
        from app.engine_v1.enhanced_scenarios import compute_historical_var

        import random
        random.seed(42)
        returns = [random.gauss(0, 0.05) for _ in range(100)]
        r1 = compute_historical_var(returns, confidence=0.95, exposure_usd=1_000_000)
        r2 = compute_historical_var(returns, confidence=0.95, exposure_usd=2_000_000)
        assert r2.var_usd == pytest.approx(r1.var_usd * 2)

    def test_zero_exposure_zero_usd(self):
        from app.engine_v1.enhanced_scenarios import compute_historical_var

        import random
        random.seed(42)
        returns = [random.gauss(0, 0.05) for _ in range(100)]
        result = compute_historical_var(returns, confidence=0.95, exposure_usd=0.0)
        assert result.var_usd == 0.0
        assert result.expected_shortfall_usd == 0.0

    def test_all_positive_returns(self):
        """When all returns are positive, VaR should be positive (no loss)."""
        from app.engine_v1.enhanced_scenarios import compute_historical_var

        returns = [0.01 + i * 0.001 for i in range(50)]
        result = compute_historical_var(returns, confidence=0.95)
        assert result.var_value > 0

    def test_lookback_days_matches_sample_size(self):
        from app.engine_v1.enhanced_scenarios import compute_historical_var

        returns = [0.01] * 100
        result = compute_historical_var(returns, confidence=0.95)
        assert result.lookback_days == 100
        assert result.sample_size == 100


class TestEnhancedScenarioResult:
    """Result dataclass serialization."""

    def test_result_to_dict(self):
        from app.engine_v1.enhanced_scenarios import EnhancedScenarioResult

        result = EnhancedScenarioResult(
            shock_pack_used="standard",
            shock_levels=[-0.10, -0.05, 0.05, 0.10],
            scenario_count=4,
        )
        d = result.to_dict()
        serialized = json.dumps(d)
        parsed = json.loads(serialized)
        assert parsed["shock_pack_used"] == "standard"
        assert parsed["vol_scaled"] is False
        assert parsed["vol_multiplier"] == 1.0
        assert parsed["scenario_count"] == 4

    def test_result_with_var(self):
        from app.engine_v1.enhanced_scenarios import EnhancedScenarioResult, HistoricalVaRResult

        var_result = HistoricalVaRResult(
            var_level=0.95,
            var_value=-0.08,
            var_usd=80_000,
            expected_shortfall=-0.12,
            expected_shortfall_usd=120_000,
            lookback_days=252,
            sample_size=252,
        )
        result = EnhancedScenarioResult(
            shock_pack_used="aggressive",
            shock_levels=[-0.20, -0.10, 0.10, 0.20],
            scenario_count=4,
            vol_scaled=True,
            vol_multiplier=1.5,
            historical_var=var_result,
        )
        d = result.to_dict()
        assert d["vol_scaled"] is True
        assert d["vol_multiplier"] == 1.5
        assert "historical_var" in d
        assert d["historical_var"]["var_usd"] == 80_000

    def test_result_without_var(self):
        from app.engine_v1.enhanced_scenarios import EnhancedScenarioResult

        result = EnhancedScenarioResult(
            shock_pack_used="mild",
            shock_levels=[-0.05, -0.02, 0.02, 0.05],
            scenario_count=4,
        )
        d = result.to_dict()
        assert "historical_var" not in d
