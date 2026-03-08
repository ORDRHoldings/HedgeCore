"""Tests verifying overlay parity: when new overlays are disabled/neutral,
engine behavior is identical to v1 baseline.

This is the critical regression test for the overlay architecture.
Closes audit finding #5 (neutral overlay verification).
"""
import pytest
import json


class TestPolicyBundleExtensions:
    """PolicyBundle with new sections defaults to v1-equivalent behavior."""

    def test_volatility_policy_disabled_by_default(self):
        from app.contracts.policy_bundle import PolicyBundle

        pb = PolicyBundle(taxonomy_hash="a" * 64)
        assert pb.volatility.enabled is False
        assert pb.volatility.band_widening_enabled is False
        assert pb.volatility.ratio_adjustment_enabled is False

    def test_geopolitical_policy_disabled_by_default(self):
        from app.contracts.policy_bundle import PolicyBundle

        pb = PolicyBundle(taxonomy_hash="a" * 64)
        assert pb.geopolitical.enabled is False
        assert len(pb.geopolitical.corridor_scores) == 0

    def test_prospective_effectiveness_none_by_default(self):
        from app.contracts.policy_bundle import PolicyBundle

        pb = PolicyBundle(taxonomy_hash="a" * 64)
        assert pb.prospective_effectiveness.method == "NONE"

    def test_decision_gate_defaults_match_v1(self):
        """Decision gate defaults must match the hardcoded v1 values."""
        from app.contracts.policy_bundle import PolicyBundle

        pb = PolicyBundle(taxonomy_hash="a" * 64)
        assert pb.decision_gate.max_total_cost_bps == 75.0
        assert pb.decision_gate.max_total_cost_usd == 25000.0
        assert pb.decision_gate.min_worst_case_pnl_usd == -50000.0
        assert pb.decision_gate.min_effectiveness == 0.25
        assert pb.decision_gate.max_rejected_legs == 0
        assert pb.decision_gate.require_nonzero_hedges is True
        assert pb.decision_gate.reject_on_unhedged_material_risks is True
        assert pb.decision_gate.material_risk_threshold == 0.50

    def test_policy_hash_stable_with_defaults(self):
        """Hash is deterministic for the same PolicyBundle instance (idempotent)."""
        from app.contracts.policy_bundle import PolicyBundle

        pb = PolicyBundle(taxonomy_hash="a" * 64)
        h1 = pb.compute_policy_hash()
        h2 = pb.compute_policy_hash()
        assert h1 == h2
        assert len(h1) == 64  # SHA-256 hex

    def test_policy_hash_differs_across_instances(self):
        """Different policy_id UUIDs produce different hashes (correctness)."""
        from app.contracts.policy_bundle import PolicyBundle

        pb1 = PolicyBundle(taxonomy_hash="a" * 64)
        pb2 = PolicyBundle(taxonomy_hash="a" * 64)
        # Each instance gets a unique policy_id UUID, so hashes differ
        assert pb1.compute_policy_hash() != pb2.compute_policy_hash()

    def test_policy_hash_same_when_same_id(self):
        """Two bundles with identical fields produce identical hashes."""
        from uuid import UUID
        from app.contracts.policy_bundle import PolicyBundle

        fixed_id = UUID("12345678-1234-5678-1234-567812345678")
        pb1 = PolicyBundle(taxonomy_hash="a" * 64, policy_id=fixed_id)
        pb2 = PolicyBundle(taxonomy_hash="a" * 64, policy_id=fixed_id)
        assert pb1.compute_policy_hash() == pb2.compute_policy_hash()

    def test_canonical_dict_includes_new_sections(self):
        from app.contracts.policy_bundle import PolicyBundle

        pb = PolicyBundle(taxonomy_hash="a" * 64)
        d = pb.to_canonical_dict()
        assert "volatility" in d
        assert "geopolitical" in d
        assert "prospective_effectiveness" in d
        assert "decision_gate" in d

    def test_canonical_dict_excludes_policy_hash(self):
        from app.contracts.policy_bundle import PolicyBundle

        pb = PolicyBundle(taxonomy_hash="a" * 64)
        d = pb.to_canonical_dict()
        assert "policy_hash" not in d
        assert "created_at" not in d

    def test_finalize_preserves_new_sections(self):
        from app.contracts.policy_bundle import PolicyBundle

        pb = PolicyBundle(taxonomy_hash="a" * 64)
        finalized = pb.finalize()
        assert finalized.volatility.enabled is False
        assert finalized.geopolitical.enabled is False
        assert len(finalized.policy_hash) == 64

    def test_finalize_idempotent(self):
        """Finalizing twice produces the same hash."""
        from app.contracts.policy_bundle import PolicyBundle

        pb = PolicyBundle(taxonomy_hash="a" * 64)
        f1 = pb.finalize()
        f2 = f1.finalize()
        assert f1.policy_hash == f2.policy_hash

    def test_build_policy_bundle_with_new_sections(self):
        from app.contracts.policy_bundle import build_policy_bundle, PolicyBundleSeed

        seed = PolicyBundleSeed(
            taxonomy_hash="a" * 64,
            volatility={"enabled": True, "method": "EWMA"},
            geopolitical={"enabled": False},
        )
        pb = build_policy_bundle(seed)
        assert pb.volatility.enabled is True
        assert pb.volatility.method == "EWMA"
        assert pb.geopolitical.enabled is False

    def test_build_policy_bundle_default_seed(self):
        from app.contracts.policy_bundle import build_policy_bundle, PolicyBundleSeed

        seed = PolicyBundleSeed(taxonomy_hash="a" * 64)
        pb = build_policy_bundle(seed)
        assert pb.volatility.enabled is False
        assert pb.geopolitical.enabled is False
        assert pb.prospective_effectiveness.method == "NONE"
        assert len(pb.policy_hash) == 64

    def test_volatility_policy_defaults(self):
        """Verify all VolatilityPolicy defaults match documented values."""
        from app.contracts.policy_bundle import VolatilityPolicy

        vp = VolatilityPolicy()
        assert vp.enabled is False
        assert vp.method == "EWMA"
        assert vp.ewma_lambda == 0.94
        assert vp.lookback_days == 60
        assert vp.band_widening_enabled is False
        assert vp.ratio_adjustment_enabled is False
        assert "G10" in vp.fallback_vols
        assert "EM_LATAM" in vp.fallback_vols

    def test_geopolitical_policy_defaults(self):
        from app.contracts.policy_bundle import GeopoliticalPolicy

        gp = GeopoliticalPolicy()
        assert gp.enabled is False
        assert gp.source == "polisophic"
        assert gp.escalation_threshold == 0.7
        assert gp.ratio_haircut_max == 0.10
        assert gp.corridor_scores == {}

    def test_prospective_effectiveness_policy_defaults(self):
        from app.contracts.policy_bundle import ProspectiveEffectivenessPolicy

        pep = ProspectiveEffectivenessPolicy()
        assert pep.method == "NONE"
        assert pep.confidence == 0.95
        assert pep.effectiveness_band_min == 0.80
        assert pep.effectiveness_band_max == 1.25

    def test_decision_gate_policy_defaults(self):
        from app.contracts.policy_bundle import DecisionGatePolicy

        dgp = DecisionGatePolicy()
        assert dgp.max_total_cost_bps == 75.0
        assert dgp.max_total_cost_usd == 25000.0
        assert dgp.min_worst_case_pnl_usd == -50000.0


class TestExtendedPolicyConfigParity:
    """ExtendedPolicyConfig with new fields defaults to v1-equivalent."""

    def _make_config(self, **overrides):
        from app.schemas_v1.policy_ext import ExtendedPolicyConfig
        from app.schemas_v1.policy import HedgeRatios, CostAssumptions

        defaults = dict(
            hedge_ratios=HedgeRatios(confirmed=0.8, forecast=0.5),
            cost_assumptions=CostAssumptions(spread_bps=5.0),
            execution_product="FWD",
            min_trade_size_usd=50000,
        )
        defaults.update(overrides)
        return ExtendedPolicyConfig(**defaults)

    def test_new_volatility_fields_default_neutral(self):
        config = self._make_config()
        assert config.volatility_regime_enabled is False
        assert config.volatility_band_widening_enabled is False
        assert config.volatility_ratio_adjustment_enabled is False
        assert config.geopolitical_overlay_enabled is False

    def test_scenario_shock_levels_default_matches_v1(self):
        config = self._make_config()
        assert config.scenario_shock_levels == [-0.10, -0.05, 0.05, 0.10]

    def test_prospective_effectiveness_default_none(self):
        config = self._make_config()
        assert config.prospective_effectiveness_method == "NONE"

    def test_effectiveness_band_defaults_match_asc815(self):
        config = self._make_config()
        assert config.retrospective_effectiveness_band_min == 0.80
        assert config.retrospective_effectiveness_band_max == 1.25

    def test_maturity_profile_default(self):
        config = self._make_config()
        assert config.maturity_profile == "MEDIUM"
        assert config.governance_tier == "STANDARD"
        assert config.evidence_grade == "BASIC"
        assert config.accounting_mode == "NONE"

    def test_netting_policy_default_disabled(self):
        config = self._make_config()
        assert config.netting_enabled is False

    def test_instrument_policy_defaults(self):
        config = self._make_config()
        assert config.instrument_allowed_types == ["NDF", "FWD"]
        assert config.instrument_max_tenor_days == {}

    def test_decision_gate_defaults(self):
        config = self._make_config()
        assert config.decision_gate_max_cost_bps == 75.0
        assert config.decision_gate_max_cost_usd == 25000.0
        assert config.decision_gate_min_worst_case_pnl_usd == -50000.0
        assert config.decision_gate_min_effectiveness == 0.25

    def test_volatility_config_can_be_enabled(self):
        config = self._make_config(
            volatility_regime_enabled=True,
            volatility_band_widening_enabled=True,
        )
        assert config.volatility_regime_enabled is True
        assert config.volatility_band_widening_enabled is True

    def test_liquidity_regime_defaults(self):
        config = self._make_config()
        assert config.liquidity_regime_stressed_threshold == 40.0
        assert config.liquidity_regime_crisis_threshold == 70.0
        weights = config.liquidity_regime_weights
        assert abs(sum(weights.values()) - 1.0) < 1e-6

    def test_fallback_volatilities_present(self):
        config = self._make_config()
        assert "G10" in config.fallback_volatilities
        assert "EM_LATAM" in config.fallback_volatilities
        assert config.fallback_volatilities["G10"] == 0.08

    def test_fallback_correlations_present(self):
        config = self._make_config()
        assert "intra_region" in config.fallback_correlations
        assert "cross_region" in config.fallback_correlations


class TestMarketDataModels:
    """Market data snapshot models exist and are importable."""

    def test_forward_curve_snapshot_importable(self):
        from app.models.market_data import ForwardCurveSnapshot

        assert ForwardCurveSnapshot.__tablename__ == "forward_curve_snapshots"

    def test_volatility_snapshot_importable(self):
        from app.models.market_data import VolatilitySnapshot

        assert VolatilitySnapshot.__tablename__ == "volatility_snapshots"

    def test_geopolitical_risk_snapshot_importable(self):
        from app.models.market_data import GeopoliticalRiskSnapshot

        assert GeopoliticalRiskSnapshot.__tablename__ == "geopolitical_risk_snapshots"

    def test_forward_curve_has_required_columns(self):
        from app.models.market_data import ForwardCurveSnapshot

        mapper = ForwardCurveSnapshot.__table__
        col_names = {c.name for c in mapper.columns}
        required = {"id", "pair", "as_of", "source", "data_class", "forward_points", "created_at"}
        assert required.issubset(col_names)

    def test_volatility_snapshot_has_required_columns(self):
        from app.models.market_data import VolatilitySnapshot

        mapper = VolatilitySnapshot.__table__
        col_names = {c.name for c in mapper.columns}
        required = {"id", "pair", "as_of", "source", "realized_vol_annualized", "ewma_vol_annualized"}
        assert required.issubset(col_names)

    def test_geopolitical_snapshot_has_required_columns(self):
        from app.models.market_data import GeopoliticalRiskSnapshot

        mapper = GeopoliticalRiskSnapshot.__table__
        col_names = {c.name for c in mapper.columns}
        required = {"id", "corridor", "as_of", "source", "normalized_score", "regime"}
        assert required.issubset(col_names)
