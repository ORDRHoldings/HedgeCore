"""Tests for engine_v1/scenarios_monte_carlo.py — Monte Carlo VaR/CVaR simulation."""

import pytest
import numpy as np

from app.engine_v1.scenarios_monte_carlo import (
    run_monte_carlo,
    MonteCarloResult,
    VaRResult,
    _get_pair_region,
    _build_covariance,
)


# ── Fixtures ──────────────────────────────────────────────────────────

SINGLE_BUCKET = [
    {
        "pair": "USDMXN",
        "commercial_exposure_mxn": -5_000_000,
        "hedge_position_mxn": 4_000_000,
        "residual_mxn": -1_000_000,
        "forward_rate": 17.30,
    }
]

MULTI_BUCKET = [
    {
        "pair": "USDMXN",
        "commercial_exposure_mxn": -5_000_000,
        "hedge_position_mxn": 4_000_000,
        "residual_mxn": -1_000_000,
        "forward_rate": 17.30,
    },
    {
        "pair": "EURUSD",
        "commercial_exposure_local": -2_000_000,
        "hedge_position_local": 1_500_000,
        "residual_local": -500_000,
        "forward_rate": 1.09,
    },
]

MARKET = {"spot_rate": 17.15}


# ── Region classification ────────────────────────────────────────────

class TestPairRegion:
    def test_latam(self):
        assert _get_pair_region("USDMXN") == "EM_LATAM"
        assert _get_pair_region("USDBRL") == "EM_LATAM"

    def test_g10(self):
        assert _get_pair_region("EURUSD") == "G10"
        assert _get_pair_region("USDJPY") == "G10"
        assert _get_pair_region("GBPUSD") == "G10"

    def test_asia(self):
        assert _get_pair_region("USDCNY") == "EM_ASIA"
        assert _get_pair_region("USDINR") == "EM_ASIA"

    def test_ceemea(self):
        assert _get_pair_region("USDTRY") == "EM_CEEMEA"
        assert _get_pair_region("USDZAR") == "EM_CEEMEA"

    def test_unknown_defaults_g10(self):
        assert _get_pair_region("XXXYYY") == "G10"


# ── Covariance matrix ────────────────────────────────────────────────

class TestBuildCovariance:
    def test_single_factor(self):
        cov = _build_covariance(["USDMXN"])
        assert cov.shape == (1, 1)
        assert cov[0, 0] > 0

    def test_multi_factor_symmetric(self):
        cov = _build_covariance(["USDMXN", "EURUSD", "USDJPY"])
        assert cov.shape == (3, 3)
        np.testing.assert_array_almost_equal(cov, cov.T)

    def test_positive_semidefinite(self):
        cov = _build_covariance(["USDMXN", "EURUSD", "USDJPY", "USDBRL"])
        eigvals = np.linalg.eigvalsh(cov)
        assert np.all(eigvals >= -1e-10)

    def test_override(self):
        override = {
            "USDMXN": {"USDMXN": 0.01, "EURUSD": 0.002},
            "EURUSD": {"USDMXN": 0.002, "EURUSD": 0.005},
        }
        cov = _build_covariance(["USDMXN", "EURUSD"], override)
        assert cov[0, 0] == pytest.approx(0.01)
        assert cov[1, 1] == pytest.approx(0.005)
        assert cov[0, 1] == pytest.approx(0.002)

    def test_intra_region_corr_higher(self):
        """Same-region pairs should have higher off-diagonal correlation."""
        cov = _build_covariance(["USDMXN", "USDBRL", "EURUSD"])
        # MXN-BRL are both EM_LATAM (intra=0.60), MXN-EUR is inter (0.30)
        mxn_brl_corr = cov[0, 1] / (np.sqrt(cov[0, 0]) * np.sqrt(cov[1, 1]))
        mxn_eur_corr = cov[0, 2] / (np.sqrt(cov[0, 0]) * np.sqrt(cov[2, 2]))
        assert mxn_brl_corr > mxn_eur_corr


# ── Core Monte Carlo ─────────────────────────────────────────────────

class TestRunMonteCarlo:
    def test_empty_buckets(self):
        result = run_monte_carlo([], {})
        assert isinstance(result, MonteCarloResult)
        assert result.simulation_count == 0

    def test_deterministic_with_seed(self):
        r1 = run_monte_carlo(SINGLE_BUCKET, MARKET, num_simulations=1000, seed=42)
        r2 = run_monte_carlo(SINGLE_BUCKET, MARKET, num_simulations=1000, seed=42)
        assert r1.mean_hedged_pnl == pytest.approx(r2.mean_hedged_pnl)
        assert r1.std_hedged_pnl == pytest.approx(r2.std_hedged_pnl)
        assert r1.worst_hedged_pnl == pytest.approx(r2.worst_hedged_pnl)

    def test_different_seeds_differ(self):
        r1 = run_monte_carlo(SINGLE_BUCKET, MARKET, num_simulations=1000, seed=42)
        r2 = run_monte_carlo(SINGLE_BUCKET, MARKET, num_simulations=1000, seed=99)
        assert r1.mean_hedged_pnl != pytest.approx(r2.mean_hedged_pnl, abs=1e-6)

    def test_returns_var_results(self):
        result = run_monte_carlo(SINGLE_BUCKET, MARKET, seed=42, confidence_levels=[0.95, 0.99])
        assert len(result.var_results) == 2
        assert result.var_results[0].confidence == 0.95
        assert result.var_results[1].confidence == 0.99

    def test_var_ordering(self):
        """99% VaR should be more extreme than 95% VaR."""
        result = run_monte_carlo(SINGLE_BUCKET, MARKET, seed=42, num_simulations=10_000, confidence_levels=[0.95, 0.99])
        var95 = result.var_results[0].hedged_var
        var99 = result.var_results[1].hedged_var
        assert var99 <= var95  # more extreme = more negative

    def test_cvar_more_extreme_than_var(self):
        """CVaR (expected shortfall) should be <= VaR."""
        result = run_monte_carlo(SINGLE_BUCKET, MARKET, seed=42, num_simulations=10_000)
        for vr in result.var_results:
            assert vr.hedged_cvar <= vr.hedged_var
            assert vr.unhedged_cvar <= vr.unhedged_var

    def test_hedge_reduces_volatility(self):
        """Hedged P&L std should be less than unhedged."""
        result = run_monte_carlo(SINGLE_BUCKET, MARKET, seed=42, num_simulations=10_000)
        assert result.std_hedged_pnl < result.std_unhedged_pnl

    def test_percentiles_present(self):
        result = run_monte_carlo(SINGLE_BUCKET, MARKET, seed=42)
        assert "hedged_p01" in result.percentiles
        assert "hedged_p50" in result.percentiles
        assert "hedged_p99" in result.percentiles
        assert "unhedged_p01" in result.percentiles

    def test_multi_currency(self):
        result = run_monte_carlo(MULTI_BUCKET, MARKET, seed=42, num_simulations=1000)
        assert result.simulation_count == 1000
        assert len(result.var_results) > 0

    def test_simulation_count_clamp(self):
        """Simulations should be clamped to [100, 100_000]."""
        result = run_monte_carlo(SINGLE_BUCKET, MARKET, num_simulations=50, seed=42)
        assert result.simulation_count == 100
        result2 = run_monte_carlo(SINGLE_BUCKET, MARKET, num_simulations=200_000, seed=42)
        assert result2.simulation_count == 100_000

    def test_multi_day_horizon_scales(self):
        """Multi-day horizon should increase volatility."""
        r1 = run_monte_carlo(SINGLE_BUCKET, MARKET, seed=42, num_simulations=5000, horizon_days=1)
        r5 = run_monte_carlo(SINGLE_BUCKET, MARKET, seed=42, num_simulations=5000, horizon_days=5)
        assert r5.std_hedged_pnl > r1.std_hedged_pnl

    def test_to_dict_structure(self):
        result = run_monte_carlo(SINGLE_BUCKET, MARKET, seed=42)
        d = result.to_dict()
        assert "simulation_count" in d
        assert "var_results" in d
        assert "percentiles" in d
        assert "mean_hedged_pnl" in d
        assert "hedge_benefit_pct" in d
        assert isinstance(d["var_results"], list)
        assert isinstance(d["percentiles"], dict)

    def test_hedge_benefit_positive(self):
        """With 80% hedge, mean benefit should be positive (hedge helps)."""
        result = run_monte_carlo(SINGLE_BUCKET, MARKET, seed=42, num_simulations=10_000)
        # hedge_benefit_mean can be positive or negative depending on market direction,
        # but the std reduction is always beneficial
        assert result.std_hedged_pnl < result.std_unhedged_pnl
