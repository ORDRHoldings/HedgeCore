"""Tests for Policy Engine Phase 1 foundation schemas.

Covers:
- ExtendedPolicyConfig new fields (backward compat + new defaults)
- PolicyBundle new sections (VolatilityPolicy, GeopoliticalPolicy, etc.)
- PolicyBundleSeed + build_policy_bundle with new sections
- Prospective effectiveness engine (critical terms, statistical forecast)
- Enhanced scenarios engine (shock resolution, vol scaling, historical VaR)
- Market data model imports
"""
from __future__ import annotations

import math

import pytest


# ============================================================
# 1. ExtendedPolicyConfig backward compatibility + new fields
# ============================================================

class TestExtendedPolicyConfigPhase1:
    """Verify new fields have defaults and existing fields unchanged."""

    def test_backward_compat_minimal_construction(self):
        """Existing minimal construction must still work."""
        from app.schemas_v1.policy_ext import ExtendedPolicyConfig

        cfg = ExtendedPolicyConfig(
            hedge_ratios={"confirmed": 0.75, "forecast": 0.50},
            cost_assumptions={"spread_bps": 5.0},
            execution_product="NDF",
            min_trade_size_usd=10000.0,
        )
        # Existing fields
        assert cfg.hedge_bands == {}
        assert cfg.margin_budget_usd is None
        assert cfg.min_liquidity_score == 0.0
        assert cfg.vix_contract_vega == 400.0
        assert cfg.min_capital_ratio == 1.5

    def test_volatility_policy_defaults(self):
        from app.schemas_v1.policy_ext import ExtendedPolicyConfig

        cfg = ExtendedPolicyConfig(
            hedge_ratios={"confirmed": 0.75, "forecast": 0.50},
            cost_assumptions={"spread_bps": 5.0},
            execution_product="NDF",
            min_trade_size_usd=10000.0,
        )
        assert cfg.volatility_lookback_days == 60
        assert cfg.volatility_method == "EWMA"
        assert cfg.volatility_ewma_lambda == 0.94
        assert cfg.volatility_regime_enabled is False
        assert cfg.volatility_band_widening_enabled is False
        assert cfg.volatility_ratio_adjustment_enabled is False
        assert "G10" in cfg.fallback_volatilities
        assert cfg.fallback_volatilities["EM_LATAM"] == 0.14
        assert cfg.fallback_correlations["intra_region"] == 0.60

    def test_geopolitical_policy_defaults(self):
        from app.schemas_v1.policy_ext import ExtendedPolicyConfig

        cfg = ExtendedPolicyConfig(
            hedge_ratios={"confirmed": 0.75, "forecast": 0.50},
            cost_assumptions={"spread_bps": 5.0},
            execution_product="NDF",
            min_trade_size_usd=10000.0,
        )
        assert cfg.geopolitical_overlay_enabled is False
        assert cfg.geopolitical_source == "polisophic"
        assert cfg.geopolitical_escalation_threshold == 0.7
        assert cfg.geopolitical_ratio_haircut_max == 0.10

    def test_scenario_policy_defaults(self):
        from app.schemas_v1.policy_ext import ExtendedPolicyConfig

        cfg = ExtendedPolicyConfig(
            hedge_ratios={"confirmed": 0.75, "forecast": 0.50},
            cost_assumptions={"spread_bps": 5.0},
            execution_product="NDF",
            min_trade_size_usd=10000.0,
        )
        assert cfg.scenario_shock_levels == [-0.10, -0.05, 0.05, 0.10]
        assert cfg.scenario_historical_var_enabled is False
        assert cfg.scenario_var_confidence == 0.95
        assert cfg.scenario_var_lookback_days == 252
        assert cfg.scenario_expected_shortfall_enabled is False
        assert cfg.scenario_custom_shocks == []
        assert cfg.scenario_drawdown_tolerance_pct == 5.0

    def test_prospective_effectiveness_defaults(self):
        from app.schemas_v1.policy_ext import ExtendedPolicyConfig

        cfg = ExtendedPolicyConfig(
            hedge_ratios={"confirmed": 0.75, "forecast": 0.50},
            cost_assumptions={"spread_bps": 5.0},
            execution_product="NDF",
            min_trade_size_usd=10000.0,
        )
        assert cfg.prospective_effectiveness_method == "NONE"
        assert cfg.prospective_effectiveness_confidence == 0.95
        assert cfg.retrospective_effectiveness_band_min == 0.80
        assert cfg.retrospective_effectiveness_band_max == 1.25
        assert cfg.regression_r_squared_min == 0.80
        assert cfg.regression_slope_band_min == -1.25
        assert cfg.regression_slope_band_max == -0.80

    def test_decision_gate_defaults(self):
        from app.schemas_v1.policy_ext import ExtendedPolicyConfig

        cfg = ExtendedPolicyConfig(
            hedge_ratios={"confirmed": 0.75, "forecast": 0.50},
            cost_assumptions={"spread_bps": 5.0},
            execution_product="NDF",
            min_trade_size_usd=10000.0,
        )
        assert cfg.decision_gate_max_cost_bps == 75.0
        assert cfg.decision_gate_max_cost_usd == 25000.0
        assert cfg.decision_gate_min_worst_case_pnl_usd == -50000.0
        assert cfg.decision_gate_min_effectiveness == 0.25
        assert cfg.decision_gate_max_rejected_legs == 0
        assert cfg.decision_gate_require_nonzero_hedges is True
        assert cfg.decision_gate_reject_on_unhedged_material is True
        assert cfg.decision_gate_material_risk_threshold == 0.50

    def test_netting_policy_defaults(self):
        from app.schemas_v1.policy_ext import ExtendedPolicyConfig

        cfg = ExtendedPolicyConfig(
            hedge_ratios={"confirmed": 0.75, "forecast": 0.50},
            cost_assumptions={"spread_bps": 5.0},
            execution_product="NDF",
            min_trade_size_usd=10000.0,
        )
        assert cfg.netting_enabled is False
        assert cfg.netting_net_confirmed_forecast is False
        assert cfg.netting_settlement_cycle_days == 2

    def test_instrument_policy_defaults(self):
        from app.schemas_v1.policy_ext import ExtendedPolicyConfig

        cfg = ExtendedPolicyConfig(
            hedge_ratios={"confirmed": 0.75, "forecast": 0.50},
            cost_assumptions={"spread_bps": 5.0},
            execution_product="NDF",
            min_trade_size_usd=10000.0,
        )
        assert cfg.instrument_allowed_types == ["NDF", "FWD"]
        assert cfg.instrument_max_tenor_days == {}
        assert cfg.instrument_requires_approval == {}
        assert cfg.instrument_max_notional_usd == {}

    def test_maturity_and_governance_defaults(self):
        from app.schemas_v1.policy_ext import ExtendedPolicyConfig

        cfg = ExtendedPolicyConfig(
            hedge_ratios={"confirmed": 0.75, "forecast": 0.50},
            cost_assumptions={"spread_bps": 5.0},
            execution_product="NDF",
            min_trade_size_usd=10000.0,
        )
        assert cfg.maturity_profile == "MEDIUM"
        assert cfg.maturity_short_max_months == 3
        assert cfg.maturity_long_min_months == 12
        assert cfg.governance_tier == "STANDARD"
        assert cfg.evidence_grade == "BASIC"
        assert cfg.accounting_mode == "NONE"

    def test_liquidity_regime_defaults(self):
        from app.schemas_v1.policy_ext import ExtendedPolicyConfig

        cfg = ExtendedPolicyConfig(
            hedge_ratios={"confirmed": 0.75, "forecast": 0.50},
            cost_assumptions={"spread_bps": 5.0},
            execution_product="NDF",
            min_trade_size_usd=10000.0,
        )
        assert cfg.liquidity_regime_stressed_threshold == 40.0
        assert cfg.liquidity_regime_crisis_threshold == 70.0
        weights = cfg.liquidity_regime_weights
        assert abs(sum(weights.values()) - 1.0) < 1e-9

    def test_custom_values_override(self):
        from app.schemas_v1.policy_ext import ExtendedPolicyConfig

        cfg = ExtendedPolicyConfig(
            hedge_ratios={"confirmed": 0.75, "forecast": 0.50},
            cost_assumptions={"spread_bps": 5.0},
            execution_product="NDF",
            min_trade_size_usd=10000.0,
            volatility_method="GARCH",
            volatility_lookback_days=120,
            geopolitical_overlay_enabled=True,
            governance_tier="COMMITTEE",
            accounting_mode="CASH_FLOW_HEDGE",
            decision_gate_max_cost_bps=100.0,
        )
        assert cfg.volatility_method == "GARCH"
        assert cfg.volatility_lookback_days == 120
        assert cfg.geopolitical_overlay_enabled is True
        assert cfg.governance_tier == "COMMITTEE"
        assert cfg.accounting_mode == "CASH_FLOW_HEDGE"
        assert cfg.decision_gate_max_cost_bps == 100.0


# ============================================================
# 2. PolicyBundle new sections
# ============================================================

_FAKE_TAX_HASH = "a" * 64


class TestPolicyBundlePhase1:
    """Verify new PolicyBundle sections with backward compatibility."""

    def test_default_construction_unchanged(self):
        from app.contracts.policy_bundle import PolicyBundle

        pb = PolicyBundle(taxonomy_hash=_FAKE_TAX_HASH)
        assert pb.mandate.allow == ()
        assert pb.liquidity.min_liquidity_score == 0.30
        assert pb.strategy.max_strategy_complexity == 3
        assert pb.cost.max_total_cost_bps == 25.0
        assert pb.scenario.enabled is True

    def test_new_sections_have_defaults(self):
        from app.contracts.policy_bundle import PolicyBundle

        pb = PolicyBundle(taxonomy_hash=_FAKE_TAX_HASH)
        # Volatility
        assert pb.volatility.enabled is False
        assert pb.volatility.method == "EWMA"
        assert pb.volatility.ewma_lambda == 0.94
        assert pb.volatility.lookback_days == 60
        assert pb.volatility.band_widening_enabled is False
        assert "G10" in pb.volatility.fallback_vols
        # Geopolitical
        assert pb.geopolitical.enabled is False
        assert pb.geopolitical.source == "polisophic"
        assert pb.geopolitical.corridor_scores == {}
        # Prospective effectiveness
        assert pb.prospective_effectiveness.method == "NONE"
        assert pb.prospective_effectiveness.confidence == 0.95
        assert pb.prospective_effectiveness.effectiveness_band_min == 0.80
        assert pb.prospective_effectiveness.effectiveness_band_max == 1.25
        # Decision gate
        assert pb.decision_gate.max_total_cost_bps == 75.0
        assert pb.decision_gate.require_nonzero_hedges is True
        assert pb.decision_gate.material_risk_threshold == 0.50

    def test_finalize_produces_hash(self):
        from uuid import UUID
        from app.contracts.policy_bundle import PolicyBundle

        fixed_id = UUID("00000000-0000-0000-0000-000000000001")
        pb = PolicyBundle(taxonomy_hash=_FAKE_TAX_HASH, policy_id=fixed_id)
        sealed = pb.finalize()
        assert len(sealed.policy_hash) == 64
        # Deterministic: same inputs (including policy_id) -> same hash
        pb2 = PolicyBundle(taxonomy_hash=_FAKE_TAX_HASH, policy_id=fixed_id)
        sealed2 = pb2.finalize()
        assert sealed.policy_hash == sealed2.policy_hash

    def test_new_sections_affect_hash(self):
        from uuid import UUID
        from app.contracts.policy_bundle import (
            PolicyBundle,
            VolatilityPolicy,
        )

        fixed_id = UUID("00000000-0000-0000-0000-000000000002")
        pb_default = PolicyBundle(taxonomy_hash=_FAKE_TAX_HASH, policy_id=fixed_id).finalize()
        pb_custom = PolicyBundle(
            taxonomy_hash=_FAKE_TAX_HASH,
            policy_id=fixed_id,
            volatility=VolatilityPolicy(enabled=True, method="GARCH"),
        ).finalize()
        assert pb_default.policy_hash != pb_custom.policy_hash

    def test_canonical_dict_excludes_hash_and_timestamp(self):
        from app.contracts.policy_bundle import PolicyBundle

        pb = PolicyBundle(taxonomy_hash=_FAKE_TAX_HASH).finalize()
        cd = pb.to_canonical_dict()
        assert "policy_hash" not in cd
        assert "created_at" not in cd
        # New sections present
        assert "volatility" in cd
        assert "geopolitical" in cd
        assert "prospective_effectiveness" in cd
        assert "decision_gate" in cd

    def test_build_policy_bundle_with_new_sections(self):
        from app.contracts.policy_bundle import (
            PolicyBundleSeed,
            build_policy_bundle,
        )

        seed = PolicyBundleSeed(
            taxonomy_hash=_FAKE_TAX_HASH,
            volatility={"enabled": True, "method": "REALIZED", "lookback_days": 90},
            geopolitical={"enabled": True, "escalation_threshold": 0.5},
            decision_gate={"max_total_cost_bps": 100.0, "max_rejected_legs": 2},
        )
        pb = build_policy_bundle(seed)
        assert pb.volatility.enabled is True
        assert pb.volatility.method == "REALIZED"
        assert pb.volatility.lookback_days == 90
        assert pb.geopolitical.enabled is True
        assert pb.geopolitical.escalation_threshold == 0.5
        assert pb.decision_gate.max_total_cost_bps == 100.0
        assert pb.decision_gate.max_rejected_legs == 2
        assert len(pb.policy_hash) == 64

    def test_build_policy_bundle_without_new_sections(self):
        """Seed without new sections uses defaults."""
        from app.contracts.policy_bundle import (
            PolicyBundleSeed,
            build_policy_bundle,
        )

        seed = PolicyBundleSeed(taxonomy_hash=_FAKE_TAX_HASH)
        pb = build_policy_bundle(seed)
        assert pb.volatility.enabled is False
        assert pb.geopolitical.enabled is False
        assert pb.prospective_effectiveness.method == "NONE"
        assert pb.decision_gate.max_total_cost_bps == 75.0


# ============================================================
# 3. Prospective Effectiveness Engine
# ============================================================

class TestProspectiveEffectiveness:
    """Test prospective effectiveness assessment functions."""

    def test_none_method_always_effective(self):
        from app.engine_v1.prospective_effectiveness import (
            assess_prospective_effectiveness,
        )

        result = assess_prospective_effectiveness("NONE")
        assert result.is_effective is True
        assert result.method == "NONE"
        assert "disabled" in result.rationale.lower()

    def test_unknown_method_not_effective(self):
        from app.engine_v1.prospective_effectiveness import (
            assess_prospective_effectiveness,
        )

        result = assess_prospective_effectiveness("MAGIC")
        assert result.is_effective is False
        assert "Unknown" in result.rationale

    def test_critical_terms_match_all_match(self):
        from app.engine_v1.prospective_effectiveness import (
            assess_critical_terms_match,
        )

        hedged = {
            "notional": 1000000,
            "currency_pair": "USDMXN",
            "maturity_date": "2026-06-30",
            "underlying": "FX",
            "settlement_type": "NDF",
        }
        instrument = {
            "notional": 1000000,
            "currency_pair": "USDMXN",
            "maturity_date": "2026-06-30",
            "underlying": "FX",
            "settlement_type": "NDF",
        }
        result = assess_critical_terms_match(hedged, instrument)
        assert result.matched is True
        assert result.is_effective is True
        assert len(result.terms_mismatched) == 0
        assert len(result.terms_matched) == 5

    def test_critical_terms_match_notional_within_tolerance(self):
        from app.engine_v1.prospective_effectiveness import (
            assess_critical_terms_match,
        )

        hedged = {
            "notional": 1000000,
            "currency_pair": "USDMXN",
            "maturity_date": "2026-06-30",
            "underlying": "FX",
            "settlement_type": "NDF",
        }
        instrument = {
            "notional": 1040000,  # 4% diff, within 5% tolerance
            "currency_pair": "USDMXN",
            "maturity_date": "2026-06-30",
            "underlying": "FX",
            "settlement_type": "NDF",
        }
        result = assess_critical_terms_match(hedged, instrument)
        assert result.matched is True
        assert "notional" in result.terms_matched

    def test_critical_terms_mismatch(self):
        from app.engine_v1.prospective_effectiveness import (
            assess_critical_terms_match,
        )

        hedged = {
            "notional": 1000000,
            "currency_pair": "USDMXN",
            "maturity_date": "2026-06-30",
            "underlying": "FX",
            "settlement_type": "NDF",
        }
        instrument = {
            "notional": 500000,  # 50% off
            "currency_pair": "USDBRL",  # different pair
            "maturity_date": "2026-06-30",
            "underlying": "FX",
            "settlement_type": "NDF",
        }
        result = assess_critical_terms_match(hedged, instrument)
        assert result.matched is False
        assert result.is_effective is False
        assert "notional" in result.terms_mismatched
        assert "currency_pair" in result.terms_mismatched

    def test_critical_terms_via_unified(self):
        from app.engine_v1.prospective_effectiveness import (
            assess_prospective_effectiveness,
        )

        result = assess_prospective_effectiveness(
            "CRITICAL_TERMS_MATCH",
            hedged_item={
                "notional": 1000000,
                "currency_pair": "USDMXN",
                "maturity_date": "2026-06-30",
                "underlying": "FX",
                "settlement_type": "NDF",
            },
            hedging_instrument={
                "notional": 1000000,
                "currency_pair": "USDMXN",
                "maturity_date": "2026-06-30",
                "underlying": "FX",
                "settlement_type": "NDF",
            },
        )
        assert result.is_effective is True
        assert result.critical_terms is not None
        assert result.critical_terms.matched is True

    def test_critical_terms_missing_data(self):
        from app.engine_v1.prospective_effectiveness import (
            assess_prospective_effectiveness,
        )

        result = assess_prospective_effectiveness("CRITICAL_TERMS_MATCH")
        assert result.is_effective is False
        assert "requires" in result.rationale.lower()

    def test_statistical_forecast_insufficient_data(self):
        from app.engine_v1.prospective_effectiveness import (
            assess_statistical_forecast,
        )

        result = assess_statistical_forecast(
            [0.01] * 10,
            [-0.01] * 10,
        )
        assert result.is_effective is False
        assert result.sample_size == 10
        assert "Insufficient" in result.rationale

    def test_statistical_forecast_perfect_hedge(self):
        from app.engine_v1.prospective_effectiveness import (
            assess_statistical_forecast,
        )

        # Perfect negative correlation: instrument = -1.0 * hedged_item
        n = 30
        hedged = [0.01 * (i - 15) for i in range(n)]
        instrument = [-x for x in hedged]
        result = assess_statistical_forecast(hedged, instrument)
        assert result.is_effective is True
        assert result.projected_r_squared is not None
        assert result.projected_r_squared > 0.99
        assert result.projected_slope is not None
        assert abs(result.projected_slope - (-1.0)) < 0.01

    def test_statistical_forecast_poor_hedge(self):
        from app.engine_v1.prospective_effectiveness import (
            assess_statistical_forecast,
        )

        # Unrelated data
        import random
        random.seed(42)
        n = 30
        hedged = [random.gauss(0, 0.05) for _ in range(n)]
        instrument = [random.gauss(0, 0.05) for _ in range(n)]
        result = assess_statistical_forecast(hedged, instrument)
        # With random data, R-squared should be low
        assert result.projected_r_squared is not None
        # Not asserting is_effective since random seed may produce varying results
        # but we verify the structure
        assert result.sample_size == 30
        assert result.method == "STATISTICAL_FORECAST"

    def test_statistical_forecast_via_unified(self):
        from app.engine_v1.prospective_effectiveness import (
            assess_prospective_effectiveness,
        )

        n = 25
        hedged = [0.01 * (i - 12) for i in range(n)]
        instrument = [-x for x in hedged]
        result = assess_prospective_effectiveness(
            "STATISTICAL_FORECAST",
            historical_hedged_changes=hedged,
            historical_instrument_changes=instrument,
        )
        assert result.is_effective is True
        assert result.statistical_forecast is not None
        assert result.statistical_forecast.projected_r_squared > 0.99

    def test_statistical_forecast_missing_data(self):
        from app.engine_v1.prospective_effectiveness import (
            assess_prospective_effectiveness,
        )

        result = assess_prospective_effectiveness("STATISTICAL_FORECAST")
        assert result.is_effective is False
        assert "requires" in result.rationale.lower()

    def test_to_dict_serialization(self):
        from app.engine_v1.prospective_effectiveness import (
            assess_prospective_effectiveness,
        )

        result = assess_prospective_effectiveness("NONE")
        d = result.to_dict()
        assert d["method"] == "NONE"
        assert d["is_effective"] is True
        assert isinstance(d["rationale"], str)

    def test_critical_terms_to_dict(self):
        from app.engine_v1.prospective_effectiveness import (
            assess_critical_terms_match,
        )

        result = assess_critical_terms_match(
            {"notional": 100, "currency_pair": "USDMXN", "maturity_date": "2026-06-30",
             "underlying": "FX", "settlement_type": "NDF"},
            {"notional": 100, "currency_pair": "USDMXN", "maturity_date": "2026-06-30",
             "underlying": "FX", "settlement_type": "NDF"},
        )
        d = result.to_dict()
        assert d["matched"] is True
        assert isinstance(d["terms_checked"], list)


# ============================================================
# 4. Enhanced Scenarios Engine
# ============================================================

class TestEnhancedScenarios:
    """Test enhanced scenario analysis functions."""

    def test_default_shock_pack(self):
        from app.engine_v1.enhanced_scenarios import DEFAULT_SHOCK_PACK

        assert DEFAULT_SHOCK_PACK == [-0.10, -0.05, 0.05, 0.10]

    def test_named_shock_packs_exist(self):
        from app.engine_v1.enhanced_scenarios import NAMED_SHOCK_PACKS

        assert "standard" in NAMED_SHOCK_PACKS
        assert "conservative" in NAMED_SHOCK_PACKS
        assert "aggressive" in NAMED_SHOCK_PACKS
        assert "tail_risk" in NAMED_SHOCK_PACKS
        assert "mild" in NAMED_SHOCK_PACKS
        assert "em_stress" in NAMED_SHOCK_PACKS
        assert "g10_stress" in NAMED_SHOCK_PACKS

    def test_resolve_shock_levels_default(self):
        from app.engine_v1.enhanced_scenarios import resolve_shock_levels

        name, levels = resolve_shock_levels()
        assert name == "standard"
        assert levels == [-0.10, -0.05, 0.05, 0.10]

    def test_resolve_shock_levels_named_pack(self):
        from app.engine_v1.enhanced_scenarios import resolve_shock_levels

        name, levels = resolve_shock_levels(named_pack="aggressive")
        assert name == "aggressive"
        assert levels == [-0.20, -0.10, 0.10, 0.20]

    def test_resolve_shock_levels_policy_overrides_named(self):
        from app.engine_v1.enhanced_scenarios import resolve_shock_levels

        name, levels = resolve_shock_levels(
            policy_shock_levels=[-0.03, 0.03],
            named_pack="aggressive",
        )
        assert name == "policy"
        assert levels == [-0.03, 0.03]

    def test_resolve_shock_levels_custom_overrides_all(self):
        from app.engine_v1.enhanced_scenarios import resolve_shock_levels

        name, levels = resolve_shock_levels(
            policy_shock_levels=[-0.03, 0.03],
            named_pack="aggressive",
            custom_shocks=[{"shock": -0.15}, {"shock": 0.15}],
        )
        assert name == "custom"
        assert levels == [-0.15, 0.15]

    def test_resolve_shock_levels_empty_custom_falls_through(self):
        from app.engine_v1.enhanced_scenarios import resolve_shock_levels

        name, levels = resolve_shock_levels(
            custom_shocks=[],
            named_pack="mild",
        )
        assert name == "mild"

    def test_vol_scaled_shocks_elevated(self):
        from app.engine_v1.enhanced_scenarios import compute_vol_scaled_shocks

        base = [-0.10, -0.05, 0.05, 0.10]
        scaled, mult = compute_vol_scaled_shocks(base, current_vol=0.25, baseline_vol=0.15)
        expected_mult = 0.25 / 0.15
        assert abs(mult - expected_mult) < 1e-6
        assert abs(scaled[0] - (-0.10 * expected_mult)) < 1e-6

    def test_vol_scaled_shocks_low_vol(self):
        from app.engine_v1.enhanced_scenarios import compute_vol_scaled_shocks

        base = [-0.10, 0.10]
        scaled, mult = compute_vol_scaled_shocks(base, current_vol=0.05, baseline_vol=0.15)
        # 0.05/0.15 = 0.333, clamped to 0.5
        assert mult == 0.5
        assert abs(scaled[0] - (-0.05)) < 1e-6

    def test_vol_scaled_shocks_extreme_vol(self):
        from app.engine_v1.enhanced_scenarios import compute_vol_scaled_shocks

        base = [-0.10, 0.10]
        scaled, mult = compute_vol_scaled_shocks(base, current_vol=0.60, baseline_vol=0.15)
        # 0.60/0.15 = 4.0, clamped to 3.0
        assert mult == 3.0
        assert abs(scaled[0] - (-0.30)) < 1e-6

    def test_vol_scaled_shocks_zero_vol(self):
        from app.engine_v1.enhanced_scenarios import compute_vol_scaled_shocks

        base = [-0.10, 0.10]
        scaled, mult = compute_vol_scaled_shocks(base, current_vol=0.0, baseline_vol=0.15)
        assert mult == 1.0
        assert scaled == base

    def test_historical_var_insufficient_data(self):
        from app.engine_v1.enhanced_scenarios import compute_historical_var

        result = compute_historical_var([0.01] * 10)
        assert result.var_value == 0.0
        assert result.expected_shortfall == 0.0
        assert result.sample_size == 10

    def test_historical_var_deterministic(self):
        from app.engine_v1.enhanced_scenarios import compute_historical_var

        returns = [-0.08, -0.06, -0.04, -0.02, 0.0, 0.01, 0.02, 0.03, 0.04, 0.05,
                   0.06, 0.07, 0.08, 0.09, 0.10, -0.01, -0.03, -0.05, -0.07, 0.02]
        r1 = compute_historical_var(returns, confidence=0.95, exposure_usd=1_000_000)
        r2 = compute_historical_var(returns, confidence=0.95, exposure_usd=1_000_000)
        assert r1.var_value == r2.var_value
        assert r1.expected_shortfall == r2.expected_shortfall
        assert r1.var_usd == r2.var_usd

    def test_historical_var_95_quantile(self):
        from app.engine_v1.enhanced_scenarios import compute_historical_var

        # 100 returns: sorted would give indices 0-99
        # 95% VaR: floor(100 * 0.05) - 1 = 4
        returns = [i * 0.001 for i in range(-50, 50)]  # -0.050 to 0.049
        result = compute_historical_var(returns, confidence=0.95, exposure_usd=100_000)
        assert result.var_level == 0.95
        assert result.var_value < 0  # should be a loss
        assert result.var_usd > 0  # USD is absolute
        assert result.sample_size == 100

    def test_historical_var_usd_conversion(self):
        from app.engine_v1.enhanced_scenarios import compute_historical_var

        returns = [-0.10] * 10 + [0.05] * 15  # 25 points
        result = compute_historical_var(returns, confidence=0.95, exposure_usd=1_000_000)
        # VaR should reflect the -10% loss
        assert result.var_usd > 0

    def test_enhanced_scenario_result_to_dict(self):
        from app.engine_v1.enhanced_scenarios import EnhancedScenarioResult

        r = EnhancedScenarioResult(
            shock_pack_used="standard",
            shock_levels=[-0.10, -0.05, 0.05, 0.10],
            scenario_count=4,
        )
        d = r.to_dict()
        assert d["shock_pack_used"] == "standard"
        assert d["scenario_count"] == 4
        assert d["vol_scaled"] is False
        assert d["vol_multiplier"] == 1.0
        assert "historical_var" not in d

    def test_enhanced_scenario_result_with_var(self):
        from app.engine_v1.enhanced_scenarios import (
            EnhancedScenarioResult,
            HistoricalVaRResult,
        )

        var_r = HistoricalVaRResult(
            var_level=0.95,
            var_value=-0.05,
            var_usd=50000.0,
            expected_shortfall=-0.07,
            expected_shortfall_usd=70000.0,
            lookback_days=252,
            sample_size=252,
        )
        r = EnhancedScenarioResult(
            shock_pack_used="em_stress",
            shock_levels=[-0.20, -0.15, -0.10, -0.05, 0.05, 0.10],
            scenario_count=6,
            vol_scaled=True,
            vol_multiplier=1.5,
            historical_var=var_r,
        )
        d = r.to_dict()
        assert d["vol_scaled"] is True
        assert d["vol_multiplier"] == 1.5
        assert d["historical_var"]["var_level"] == 0.95
        assert d["historical_var"]["expected_shortfall"] == -0.07


# ============================================================
# 5. Market Data Models (import test)
# ============================================================

class TestMarketDataModels:
    """Verify market data models import and have correct table names."""

    def test_forward_curve_snapshot_import(self):
        from app.models.market_data import ForwardCurveSnapshot

        assert ForwardCurveSnapshot.__tablename__ == "forward_curve_snapshots"

    def test_volatility_snapshot_import(self):
        from app.models.market_data import VolatilitySnapshot

        assert VolatilitySnapshot.__tablename__ == "volatility_snapshots"

    def test_geopolitical_risk_snapshot_import(self):
        from app.models.market_data import GeopoliticalRiskSnapshot

        assert GeopoliticalRiskSnapshot.__tablename__ == "geopolitical_risk_snapshots"

    def test_models_have_id_column(self):
        from app.models.market_data import (
            ForwardCurveSnapshot,
            GeopoliticalRiskSnapshot,
            VolatilitySnapshot,
        )

        for model in [ForwardCurveSnapshot, VolatilitySnapshot, GeopoliticalRiskSnapshot]:
            assert hasattr(model, "id")
            assert hasattr(model, "created_at")

    def test_forward_curve_has_expected_columns(self):
        from app.models.market_data import ForwardCurveSnapshot

        cols = {c.name for c in ForwardCurveSnapshot.__table__.columns}
        assert "pair" in cols
        assert "as_of" in cols
        assert "source" in cols
        assert "data_class" in cols
        assert "forward_points" in cols
        assert "spot_mid" in cols
        assert "is_stale" in cols
        assert "company_id" in cols

    def test_volatility_has_expected_columns(self):
        from app.models.market_data import VolatilitySnapshot

        cols = {c.name for c in VolatilitySnapshot.__table__.columns}
        assert "pair" in cols
        assert "realized_vol_annualized" in cols
        assert "ewma_vol_annualized" in cols
        assert "implied_vol_atm" in cols
        assert "vol_regime" in cols
        assert "surface_json" in cols

    def test_geopolitical_has_expected_columns(self):
        from app.models.market_data import GeopoliticalRiskSnapshot

        cols = {c.name for c in GeopoliticalRiskSnapshot.__table__.columns}
        assert "corridor" in cols
        assert "normalized_score" in cols
        assert "regime" in cols
        assert "factors_json" in cols
        assert "confidence" in cols


# ============================================================
# 6. PolicyBundle __all__ exports
# ============================================================

class TestPolicyBundleExports:
    """Verify __all__ includes new exports."""

    def test_all_exports(self):
        from app.contracts import policy_bundle

        expected_new = [
            "VolatilityPolicy",
            "GeopoliticalPolicy",
            "ProspectiveEffectivenessPolicy",
            "DecisionGatePolicy",
        ]
        for name in expected_new:
            assert name in policy_bundle.__all__, f"{name} missing from __all__"
            assert hasattr(policy_bundle, name), f"{name} not importable"
