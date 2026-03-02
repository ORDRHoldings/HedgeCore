"""
backend/tests/test_factor_covariance_fallback.py
FIX-03: Structured fallback covariance — not flat 0.01 diagonal.
"""
from __future__ import annotations
import pytest


class TestFallbackCovariance:
    def test_diagonal_differs_by_region(self):
        """G10 variance (0.08²=0.0064) ≠ EM_CEEMEA variance (0.16²=0.0256)."""
        from app.engine_v1.factor_covariance import _build_fallback_covariance
        cov = _build_fallback_covariance(["EURUSD", "USDTRY"])
        eur_var = cov["EURUSD"]["EURUSD"]
        try_var = cov["USDTRY"]["USDTRY"]
        assert abs(eur_var - try_var) > 0.001, (
            f"Diagonal must differ: EURUSD={eur_var:.4f}, USDTRY={try_var:.4f}"
        )

    def test_fallback_not_flat_one_percent(self):
        """Diagonal entries must not all equal 0.01."""
        from app.engine_v1.factor_covariance import _build_fallback_covariance
        cov = _build_fallback_covariance(["USDMXN", "EURUSD", "USDBRL"])
        diagonals = [cov[p][p] for p in ["USDMXN", "EURUSD", "USDBRL"]]
        assert not all(abs(d - 0.01) < 1e-6 for d in diagonals), (
            "Fallback must not produce flat 0.01 diagonal"
        )

    def test_strict_mode_raises_on_missing_factors(self):
        """strict=True raises ValueError when factors not in covariance matrix."""
        from app.engine_v1.factor_covariance import compute_factor_covariance
        with pytest.raises(ValueError, match="strict mode"):
            compute_factor_covariance(
                {"EURUSD": 1_000_000},
                {},
                {"factor_covariance": {"USDMXN": {"USDMXN": 0.01}}},  # EURUSD not in matrix
                strict=True,
            )

    def test_live_feed_hook_returns_none_for_static(self):
        """load_covariance_from_provider returns None for static provider."""
        from app.engine_v1.factor_covariance import load_covariance_from_provider
        result = load_covariance_from_provider(["EURUSD"], provider="static")
        assert result is None

    def test_intra_region_correlation_higher(self):
        """Same-region pairs have higher covariance than cross-region."""
        from app.engine_v1.factor_covariance import _build_fallback_covariance
        # USDMXN + USDBRL (both EM_LATAM) vs USDMXN + EURUSD (cross-region)
        cov = _build_fallback_covariance(["USDMXN", "USDBRL", "EURUSD"])
        intra = cov["USDMXN"]["USDBRL"]   # same region
        inter = cov["USDMXN"]["EURUSD"]   # cross region
        assert intra > inter, f"Intra-region ({intra:.4f}) should exceed inter-region ({inter:.4f})"
