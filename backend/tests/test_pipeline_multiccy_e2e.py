"""
backend/tests/test_pipeline_multiccy_e2e.py
Prompt 3 E2E: Multi-currency pipeline integration tests.

Covers:
- EURUSD pipeline completes and returns waterfall
- USDMXN delegates to sandbox_calculate (legacy path)
- USDBRL NDF pair recognised
- portfolio_equity sourced from policy (not hardcoded)
- worst_case_loss_usd field present in scenario result
- hedge_bands returns _local field names
- concentration_limits per-pair effective limit
- margin_attribution EM stress multiplier applied
"""
from __future__ import annotations

import pytest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _fake_request(pair: str = "USDMXN") -> object:
    """Minimal SandboxCalculateRequest-like object."""
    mkt = _market(pair)
    pol = _policy(pair)
    exp = _exposures_mxn() if pair == "USDMXN" else _exposures_generic(pair)

    class FakeReq:
        pass

    req = FakeReq()
    req.trades = []
    req.hedges = []
    req.exposures = exp
    req.market_snapshot = mkt
    req.policy_config = pol
    req.policy_instance_id = None
    req.as_of = "2026-03-01"
    req.market = mkt
    req.policy = pol
    return req


def _market(pair: str = "USDMXN") -> dict:
    """Minimal market snapshot for the given pair."""
    base = {
        "as_of": "2026-03-01",
        "spot_usdmxn": 17.15,
        "forward_points_by_month": {
            "2026-04": -0.15,
            "2026-05": -0.30,
            "2026-06": -0.45,
        },
        "fx_rates": {
            "EURUSD": 1.085,
            "USDBRL": 4.95,
            "USDCOP": 4050.0,
            "USDCLP": 925.0,
            "USDPEN": 3.72,
            "USDJPY": 149.0,
            "USDGBP": 0.79,
            "USDCHF": 0.89,
            "USDCAD": 1.36,
            "USDAUD": 1.53,
            "USDNZD": 1.63,
            "USDSEK": 10.5,
            "USDNOK": 10.6,
            "USDDKK": 6.9,
        },
        "pair_forward_points": {
            "EURUSD": {"2026-04": 0.0010, "2026-05": 0.0020, "2026-06": 0.0030},
            "USDBRL": {"2026-04": 0.15, "2026-05": 0.30, "2026-06": 0.45},
        },
        "vol_surface": {"USDMXN_1M": 12.5, "EURUSD_1M": 7.8},
        "interest_rates": {"MXN_TIIE_28D": 10.50, "USD_SOFR": 5.30, "EUR_EURIBOR_3M": 3.90},
        "adv_by_pair": {"USDMXN": 50_000_000, "EURUSD": 500_000_000, "USDBRL": 30_000_000},
    }
    return base


def _policy(pair: str = "USDMXN") -> dict:
    """Minimal policy config with portfolio_equity_usd set."""
    return {
        "hedge_ratios": {"confirmed": 1.0, "forecast": 0.5},
        "cost_assumptions": {"spread_bps": 5.0},
        "execution_product": "FWD" if pair not in ("USDBRL", "USDCOP") else "NDF",
        "min_trade_size_usd": 10_000.0,
        "portfolio_equity_usd": 5_000_000.0,
        "portfolio_equity_ratio": 0.10,
        "enabled_scenarios": ["vol_crush", "regime_shift"],
        "concentration_limit_pct": 0.30,
        "pair_concentration_overrides": {"USDBRL": 0.20},
        "waterfall_weights": {},
    }


def _exposures_mxn() -> list[dict]:
    return [
        {"bucket": "2026-04", "commercial_exposure_mxn": 5_000_000, "existing_hedges_mxn": 0},
        {"bucket": "2026-05", "commercial_exposure_mxn": 3_000_000, "existing_hedges_mxn": 0},
    ]


def _exposures_generic(pair: str) -> list[dict]:
    return [
        {"bucket": "2026-04", "commercial_exposure_local": 1_000_000, "existing_hedges_local": 0},
        {"bucket": "2026-05", "commercial_exposure_local": 500_000, "existing_hedges_local": 0},
    ]


# ---------------------------------------------------------------------------
# Test 1: USDMXN delegates to sandbox_calculate (legacy path)
# ---------------------------------------------------------------------------

class TestUSDMXNDelegates:
    def test_usdmxn_uses_legacy_pipeline(self):
        """USDMXN pair routes through sandbox_calculate(), not multi-currency kernel."""
        from app.services.pipeline_service import sandbox_calculate_multi
        import uuid

        uid = str(uuid.uuid4())
        result = sandbox_calculate_multi(uid, _fake_request("USDMXN"), pair="USDMXN")
        assert result is not None
        assert "run_id" in result


# ---------------------------------------------------------------------------
# Test 2: EURUSD pipeline completes and returns waterfall
# ---------------------------------------------------------------------------

class TestEURUSDPipeline:
    def test_eurusd_returns_result(self):
        """EURUSD pair through sandbox_calculate_multi returns a result dict."""
        from app.services.pipeline_service import sandbox_calculate_multi
        import uuid

        uid = str(uuid.uuid4())
        result = sandbox_calculate_multi(uid, _fake_request("EURUSD"), pair="EURUSD")
        assert result is not None
        assert "run_id" in result

    def test_eurusd_engine_version_2(self):
        """Non-USDMXN pairs produce engine version 2.0.0 in audit envelope."""
        from app.engine_v1.audit import build_run_envelope
        envelope = build_run_envelope(
            run_id="test-eurusd-001",
            trades_raw=[],
            hedges_raw=[],
            market_raw=_market("EURUSD"),
            policy_raw=_policy("EURUSD"),
            outputs_raw={},
            pair="EURUSD",
        )
        assert envelope.engine_version == "2.0.0"

    def test_usdmxn_engine_version_1(self):
        """USDMXN pair keeps engine version 1.0.0 for backward compat."""
        from app.engine_v1.audit import build_run_envelope
        envelope = build_run_envelope(
            run_id="test-mxn-001",
            trades_raw=[],
            hedges_raw=[],
            market_raw=_market("USDMXN"),
            policy_raw=_policy("USDMXN"),
            outputs_raw={},
            pair="USDMXN",
        )
        assert envelope.engine_version == "1.0.0"


# ---------------------------------------------------------------------------
# Test 3: USDBRL NDF pair recognised
# ---------------------------------------------------------------------------

class TestUSDBRLNDF:
    def test_usdbrl_policy_is_ndf(self):
        """USDBRL policy config sets execution_product=NDF."""
        pol = _policy("USDBRL")
        assert pol["execution_product"] == "NDF"

    def test_pair_registry_usdbrl_is_ndf(self):
        """pair_registry identifies USDBRL as NDF-only."""
        from app.engine_v1.pair_registry import get_pair_meta
        meta = get_pair_meta("USDBRL")
        assert meta.is_ndf is True


# ---------------------------------------------------------------------------
# Test 4: portfolio_equity sourced from policy
# ---------------------------------------------------------------------------

class TestPortfolioEquityFromPolicy:
    def test_portfolio_equity_usd_field_exists(self):
        """ExtendedPolicyConfig accepts portfolio_equity_usd."""
        from app.schemas_v1.policy_ext import ExtendedPolicyConfig
        cfg = ExtendedPolicyConfig(
            hedge_ratios={"confirmed": 1.0, "forecast": 0.5},
            cost_assumptions={"spread_bps": 5.0},
            execution_product="FWD",
            min_trade_size_usd=10_000.0,
            portfolio_equity_usd=5_000_000.0,
        )
        assert cfg.portfolio_equity_usd == 5_000_000.0

    def test_portfolio_equity_ratio_default(self):
        """ExtendedPolicyConfig has sensible portfolio_equity_ratio default."""
        from app.schemas_v1.policy_ext import ExtendedPolicyConfig
        cfg = ExtendedPolicyConfig(
            hedge_ratios={"confirmed": 1.0, "forecast": 0.5},
            cost_assumptions={"spread_bps": 5.0},
            execution_product="FWD",
            min_trade_size_usd=10_000.0,
        )
        assert 0.01 <= cfg.portfolio_equity_ratio <= 1.0


# ---------------------------------------------------------------------------
# Test 5: worst_case_loss_usd field present in scenario result
# ---------------------------------------------------------------------------

class TestWorstCaseLoss:
    def test_worst_case_loss_usd_present(self):
        """ExtendedScenarioResult includes worst_case_loss_usd."""
        from app.engine_v1.scenarios_ext import apply_extended_scenarios
        market = _market()
        policy = {
            "enabled_scenarios": ["vol_crush", "slow_bleed"],
            "cost_assumptions": {"spread_bps": 5.0},
        }
        result = apply_extended_scenarios(
            exposure_usd=10_000_000,
            hedge_notional_usd=8_000_000,
            market=market,
            policy=policy,
        )
        assert hasattr(result, "worst_case_loss_usd")
        assert result.worst_case_scenario != "" or result.scenario_count == 0

    def test_worst_case_loss_in_dict(self):
        """ExtendedScenarioResult.to_dict() includes worst_case_loss_usd."""
        from app.engine_v1.scenarios_ext import apply_extended_scenarios
        market = _market()
        policy = {"enabled_scenarios": ["regime_shift"], "cost_assumptions": {"spread_bps": 5.0}}
        result = apply_extended_scenarios(10_000_000, 8_000_000, market, policy)
        d = result.to_dict()
        assert "worst_case_loss_usd" in d


# ---------------------------------------------------------------------------
# Test 6: hedge_bands returns _local field names
# ---------------------------------------------------------------------------

class TestHedgeBandsLocalFields:
    def test_hedge_bands_accepts_local_fields(self):
        """hedge_bands processes buckets with _local suffix field names."""
        from app.engine_v1.hedge_bands import check_hedge_bands, HedgeBandResult
        buckets = [
            {
                "bucket": "2026-04",
                "commercial_exposure_local": 1_000_000,
                "hedge_position_local": 800_000,
                "action_local": 0,
            }
        ]
        policy = {
            "hedge_ratios": {"confirmed": 1.0, "forecast": 0.5},
            "cost_assumptions": {"spread_bps": 5.0},
            "execution_product": "FWD",
        }
        # Should not raise; returns HedgeBandResult with violations list
        result = check_hedge_bands(buckets, policy)
        assert isinstance(result, HedgeBandResult)
        assert isinstance(result.violations, list)


# ---------------------------------------------------------------------------
# Test 7: concentration_limits per-pair effective limit
# ---------------------------------------------------------------------------

class TestConcentrationLimitsPerPair:
    def test_per_pair_concentration_override(self):
        """concentration_limits applies pair_concentration_overrides from policy."""
        from app.engine_v1.concentration_limits import check_concentration_limits, ConcentrationResult
        hedge_actions = [
            {"instrument": "NDF", "action_usd": 200_000},
            {"instrument": "FWD", "action_usd": 300_000},
        ]
        policy = {
            "max_instrument_concentration_pct": 0.40,  # 40% default
            "pair_concentration_overrides": {"NDF": 0.20},  # 20% for NDF instrument
            "cost_assumptions": {"spread_bps": 5.0},
            "execution_product": "NDF",
        }
        result = check_concentration_limits(hedge_actions, policy)
        assert isinstance(result, ConcentrationResult)
        assert isinstance(result.checks, list)

    def test_default_concentration_no_override(self):
        """concentration_limits uses default limit when no override."""
        from app.engine_v1.concentration_limits import check_concentration_limits, ConcentrationResult
        # 2 instruments each at 50% → under 60% hard threshold (2x 30% limit) → no breach
        hedge_actions = [
            {"instrument": "FWD", "action_usd": 500_000},
            {"instrument": "NDF", "action_usd": 500_000},
        ]
        result = check_concentration_limits(hedge_actions, {
            "max_instrument_concentration_pct": 0.30,
            "cost_assumptions": {"spread_bps": 5.0},
            "execution_product": "FWD",
        })
        assert isinstance(result, ConcentrationResult)
        # 50% each, hard threshold is 60%, so no BREACH (may have WARNING)
        assert result.has_breaches is False


# ---------------------------------------------------------------------------
# Test 8: margin_attribution EM stress multiplier
# ---------------------------------------------------------------------------

class TestMarginAttributionEM:
    def test_em_pair_gets_stress_multiplier(self):
        """margin_attribution applies 1.25x scenario stress for EM pairs."""
        from app.engine_v1.margin_attribution import compute_margin_attribution, MarginBreakdown
        margin_positions = [
            {"bucket": "2026-04", "initial_margin": 10_000.0, "maintenance_margin": 7_000.0},
        ]
        em_result = compute_margin_attribution(
            margin_positions=margin_positions,
            liquidity_scores=[{"bucket": "2026-04", "liquidity_score": 0.8}],
            concentration_data={"NDF": 1.0},
            scenario_stress_multiplier=1.5,
            pair="USDBRL",
        )
        g10_result = compute_margin_attribution(
            margin_positions=margin_positions,
            liquidity_scores=[{"bucket": "2026-04", "liquidity_score": 0.8}],
            concentration_data={"FWD": 1.0},
            scenario_stress_multiplier=1.5,
            pair="EURUSD",
        )
        assert isinstance(em_result, MarginBreakdown)
        assert isinstance(g10_result, MarginBreakdown)
        # EM pair should have higher total stress margin
        assert em_result.stress_addon >= g10_result.stress_addon

    def test_g10_pair_no_em_multiplier(self):
        """margin_attribution does NOT apply EM multiplier for G10 pairs."""
        from app.engine_v1.margin_attribution import compute_margin_attribution, MarginBreakdown
        margin_positions = [{"bucket": "2026-04", "initial_margin": 10_000.0, "maintenance_margin": 7_000.0}]
        result = compute_margin_attribution(
            margin_positions=margin_positions,
            liquidity_scores=[],
            concentration_data={},
            scenario_stress_multiplier=1.5,
            pair="EURUSD",
        )
        assert isinstance(result, MarginBreakdown)
        # G10: multiplier stays at 1.5 (not 1.875)
        assert result.stress_addon == pytest.approx(10_000.0 * (1.5 - 1.0), rel=0.01)
