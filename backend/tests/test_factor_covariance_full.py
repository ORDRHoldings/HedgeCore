"""Tests for app.engine_v1.factor_covariance."""

import math

import pytest

from app.engine_v1.factor_covariance import (
    FactorCovarianceResult,
    RiskContribution,
    _build_fallback_covariance,
    _matrix_vector_multiply,
    _portfolio_variance,
    compute_factor_covariance,
    load_covariance_from_provider,
)


# ── Dataclass tests ──────────────────────────────────────────────────────────


class TestRiskContribution:
    def test_to_dict(self):
        rc = RiskContribution(
            factor="USDMXN", weight=0.6,
            marginal_contribution=0.012,
            contribution_pct=60.0,
            variance_contribution=0.008,
        )
        d = rc.to_dict()
        assert d["factor"] == "USDMXN"
        assert d["weight"] == 0.6
        assert d["marginal_contribution"] == 0.012
        assert d["contribution_pct"] == 60.0
        assert d["variance_contribution"] == 0.008


class TestFactorCovarianceResult:
    def test_defaults(self):
        r = FactorCovarianceResult()
        assert r.pre_hedge_variance == 0.0
        assert r.post_hedge_variance == 0.0
        assert r.hedge_effectiveness_ratio == 0.0
        assert r.risk_contributions == []
        assert r.portfolio_volatility == 0.0
        assert r.diversification_ratio == 0.0

    def test_to_dict(self):
        rc = RiskContribution(
            factor="USDMXN", weight=1.0,
            marginal_contribution=1.0,
            contribution_pct=100.0,
            variance_contribution=0.01,
        )
        r = FactorCovarianceResult(
            pre_hedge_variance=0.01,
            post_hedge_variance=0.005,
            hedge_effectiveness_ratio=0.5,
            risk_contributions=[rc],
            portfolio_volatility=0.1,
            diversification_ratio=1.0,
        )
        d = r.to_dict()
        assert d["pre_hedge_variance"] == 0.01
        assert len(d["risk_contributions"]) == 1
        assert d["risk_contributions"][0]["factor"] == "USDMXN"


# ── Private function tests ───────────────────────────────────────────────────


class TestMatrixVectorMultiply:
    def test_identity_like(self):
        cov = {"A": {"A": 1.0, "B": 0.0}, "B": {"A": 0.0, "B": 1.0}}
        weights = {"A": 0.5, "B": 0.5}
        result = _matrix_vector_multiply(cov, weights, ["A", "B"])
        assert result["A"] == pytest.approx(0.5)
        assert result["B"] == pytest.approx(0.5)

    def test_single_factor(self):
        cov = {"X": {"X": 0.04}}
        weights = {"X": 1.0}
        result = _matrix_vector_multiply(cov, weights, ["X"])
        assert result["X"] == pytest.approx(0.04)

    def test_missing_entries_default_zero(self):
        cov = {"A": {}}
        weights = {"A": 1.0}
        result = _matrix_vector_multiply(cov, weights, ["A"])
        assert result["A"] == 0.0

    def test_missing_row_default_zero(self):
        cov = {}
        weights = {"A": 1.0}
        result = _matrix_vector_multiply(cov, weights, ["A"])
        assert result["A"] == 0.0


class TestPortfolioVariance:
    def test_single_factor(self):
        cov = {"A": {"A": 0.04}}
        weights = {"A": 1.0}
        var = _portfolio_variance(cov, weights, ["A"])
        assert var == pytest.approx(0.04)

    def test_two_uncorrelated(self):
        cov = {"A": {"A": 0.04, "B": 0.0}, "B": {"A": 0.0, "B": 0.09}}
        weights = {"A": 0.5, "B": 0.5}
        var = _portfolio_variance(cov, weights, ["A", "B"])
        expected = 0.5**2 * 0.04 + 0.5**2 * 0.09  # = 0.01 + 0.0225 = 0.0325
        assert var == pytest.approx(expected)

    def test_two_correlated(self):
        cov = {"A": {"A": 0.04, "B": 0.02}, "B": {"A": 0.02, "B": 0.04}}
        weights = {"A": 0.5, "B": 0.5}
        var = _portfolio_variance(cov, weights, ["A", "B"])
        expected = 0.5**2 * 0.04 + 2 * 0.5 * 0.5 * 0.02 + 0.5**2 * 0.04
        assert var == pytest.approx(expected)


# ── compute_factor_covariance tests ──────────────────────────────────────────


class TestComputeFactorCovariance:
    def _cov_matrix(self):
        return {
            "USDMXN": {"USDMXN": 0.0156, "EURUSD": -0.0042},
            "EURUSD": {"USDMXN": -0.0042, "EURUSD": 0.0056},
        }

    def test_empty_cov_matrix(self):
        result = compute_factor_covariance(
            exposures={"USDMXN": 1_000_000},
            hedges={},
            market={},
        )
        # Falls through to fallback covariance
        assert isinstance(result, FactorCovarianceResult)

    def test_empty_exposures(self):
        result = compute_factor_covariance(
            exposures={},
            hedges={},
            market={"factor_covariance": self._cov_matrix()},
        )
        assert result.pre_hedge_variance == 0.0

    def test_zero_total_exposure(self):
        result = compute_factor_covariance(
            exposures={"USDMXN": 0.0},
            hedges={},
            market={"factor_covariance": self._cov_matrix()},
        )
        assert result.pre_hedge_variance == 0.0

    def test_single_factor(self):
        market = {"factor_covariance": {"USDMXN": {"USDMXN": 0.0156}}}
        result = compute_factor_covariance(
            exposures={"USDMXN": 1_000_000},
            hedges={},
            market=market,
        )
        assert result.pre_hedge_variance == pytest.approx(0.0156)
        assert result.portfolio_volatility == pytest.approx(math.sqrt(0.0156))

    def test_hedge_reduces_variance_multi_factor(self):
        """Single-factor normalized variance stays the same (weight always 1.0).
        Need multi-factor to see real variance reduction from hedging."""
        cov = {
            "USDMXN": {"USDMXN": 0.0156, "EURUSD": 0.005},
            "EURUSD": {"USDMXN": 0.005, "EURUSD": 0.010},
        }
        market = {"factor_covariance": cov}
        result = compute_factor_covariance(
            exposures={"USDMXN": 1_000_000, "EURUSD": 500_000},
            hedges={"USDMXN": 1_000_000},  # fully hedge USDMXN
            market=market,
        )
        # After hedging USDMXN, only EURUSD remains → post-var drops
        assert result.post_hedge_variance <= result.pre_hedge_variance

    def test_full_hedge_effectiveness(self):
        market = {"factor_covariance": {"USDMXN": {"USDMXN": 0.0156}}}
        result = compute_factor_covariance(
            exposures={"USDMXN": 1_000_000},
            hedges={"USDMXN": 1_000_000},
            market=market,
        )
        # Full hedge -> net exposure = 0 -> post_var = 0
        assert result.hedge_effectiveness_ratio == pytest.approx(1.0, abs=0.01)

    def test_effectiveness_clamped_to_0_1(self):
        market = {"factor_covariance": {"USDMXN": {"USDMXN": 0.0156}}}
        # Over-hedge to test clamping
        result = compute_factor_covariance(
            exposures={"USDMXN": 1_000_000},
            hedges={"USDMXN": 2_000_000},
            market=market,
        )
        assert 0.0 <= result.hedge_effectiveness_ratio <= 1.0

    def test_risk_contributions_sum_to_100(self):
        market = {"factor_covariance": self._cov_matrix()}
        result = compute_factor_covariance(
            exposures={"USDMXN": 600_000, "EURUSD": 400_000},
            hedges={},
            market=market,
        )
        total_pct = sum(rc.contribution_pct for rc in result.risk_contributions)
        assert total_pct == pytest.approx(100.0, abs=1.0)

    def test_diversification_ratio(self):
        market = {"factor_covariance": self._cov_matrix()}
        result = compute_factor_covariance(
            exposures={"USDMXN": 600_000, "EURUSD": 400_000},
            hedges={},
            market=market,
        )
        assert result.diversification_ratio >= 1.0  # With neg corr, should be > 1

    def test_no_matching_factors_uses_fallback(self):
        market = {"factor_covariance": {"GBPUSD": {"GBPUSD": 0.01}}}
        result = compute_factor_covariance(
            exposures={"USDMXN": 1_000_000},
            hedges={},
            market=market,
        )
        # No intersection -> fallback covariance
        assert result.pre_hedge_variance > 0

    def test_strict_mode_raises(self):
        market = {"factor_covariance": {"GBPUSD": {"GBPUSD": 0.01}}}
        with pytest.raises(ValueError, match="strict mode"):
            compute_factor_covariance(
                exposures={"USDMXN": 1_000_000},
                hedges={},
                market=market,
                strict=True,
            )

    def test_mctr_values(self):
        market = {"factor_covariance": self._cov_matrix()}
        result = compute_factor_covariance(
            exposures={"USDMXN": 1_000_000, "EURUSD": 500_000},
            hedges={},
            market=market,
        )
        for rc in result.risk_contributions:
            assert rc.marginal_contribution is not None

    def test_to_dict_round_trip(self):
        market = {"factor_covariance": self._cov_matrix()}
        result = compute_factor_covariance(
            exposures={"USDMXN": 1_000_000},
            hedges={},
            market=market,
        )
        d = result.to_dict()
        assert "pre_hedge_variance" in d
        assert "risk_contributions" in d


# ── _build_fallback_covariance tests ─────────────────────────────────────────


class TestBuildFallbackCovariance:
    def test_single_factor(self):
        cov = _build_fallback_covariance(["USDMXN"])
        assert "USDMXN" in cov
        assert cov["USDMXN"]["USDMXN"] > 0

    def test_diagonal_positive(self):
        factors = ["USDMXN", "EURUSD"]
        cov = _build_fallback_covariance(factors)
        for f in factors:
            assert cov[f][f] > 0

    def test_symmetric(self):
        factors = ["USDMXN", "EURUSD"]
        cov = _build_fallback_covariance(factors)
        assert cov["USDMXN"]["EURUSD"] == pytest.approx(cov["EURUSD"]["USDMXN"])

    def test_off_diagonal_less_than_diagonal(self):
        factors = ["USDMXN", "EURUSD"]
        cov = _build_fallback_covariance(factors)
        assert abs(cov["USDMXN"]["EURUSD"]) < max(
            cov["USDMXN"]["USDMXN"], cov["EURUSD"]["EURUSD"]
        )

    def test_unknown_pair_uses_default_vol(self):
        cov = _build_fallback_covariance(["XYZABC"])
        # Default vol = 0.12 -> variance = 0.0144
        assert cov["XYZABC"]["XYZABC"] == pytest.approx(0.12**2, abs=0.001)

    def test_empty_factors(self):
        cov = _build_fallback_covariance([])
        assert cov == {}


# ── load_covariance_from_provider tests ──────────────────────────────────────


class TestLoadCovarianceFromProvider:
    def test_static_returns_none(self):
        assert load_covariance_from_provider(["USDMXN"], provider="static") is None

    def test_none_provider_returns_none(self):
        assert load_covariance_from_provider(["USDMXN"], provider=None) is None

    def test_unknown_provider_returns_none(self):
        assert load_covariance_from_provider(["USDMXN"], provider="bloomberg") is None

    def test_with_market_dict(self):
        assert load_covariance_from_provider(
            ["USDMXN"], provider="static", market={"some": "data"}
        ) is None
