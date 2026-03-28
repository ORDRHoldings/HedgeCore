"""A25: Factor Covariance & Risk Contribution Engine.

Institutional variance decomposition and marginal contribution to risk (MCTR).

Calculations:
    portfolio_variance = w' * Sigma * w
    mctr_i = w_i * (Sigma * w)_i / portfolio_variance
    hedge_effectiveness_ratio = (pre_hedge_var - post_hedge_var) / pre_hedge_var

Pure computational -- covariance matrix injectable via ExtendedMarketSnapshot.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class RiskContribution:
    """Risk contribution for a single factor."""

    factor: str
    weight: float
    marginal_contribution: float     # MCTR
    contribution_pct: float          # % of total portfolio variance
    variance_contribution: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "factor": self.factor,
            "weight": self.weight,
            "marginal_contribution": self.marginal_contribution,
            "contribution_pct": self.contribution_pct,
            "variance_contribution": self.variance_contribution,
        }


@dataclass
class FactorCovarianceResult:
    """Factor covariance analysis result."""

    pre_hedge_variance: float = 0.0
    post_hedge_variance: float = 0.0
    hedge_effectiveness_ratio: float = 0.0
    risk_contributions: list[RiskContribution] = field(default_factory=list)
    portfolio_volatility: float = 0.0
    diversification_ratio: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "pre_hedge_variance": self.pre_hedge_variance,
            "post_hedge_variance": self.post_hedge_variance,
            "hedge_effectiveness_ratio": self.hedge_effectiveness_ratio,
            "risk_contributions": [r.to_dict() for r in self.risk_contributions],
            "portfolio_volatility": self.portfolio_volatility,
            "diversification_ratio": self.diversification_ratio,
        }


def _matrix_vector_multiply(
    cov: dict[str, dict[str, float]],
    weights: dict[str, float],
    factors: list[str],
) -> dict[str, float]:
    """Compute Sigma * w (covariance matrix * weight vector)."""
    result: dict[str, float] = {}
    for i in factors:
        total = 0.0
        row = cov.get(i, {})
        for j in factors:
            total += row.get(j, 0.0) * weights.get(j, 0.0)
        result[i] = total
    return result


def _portfolio_variance(
    cov: dict[str, dict[str, float]],
    weights: dict[str, float],
    factors: list[str],
) -> float:
    """Compute w' * Sigma * w."""
    sigma_w = _matrix_vector_multiply(cov, weights, factors)
    var = 0.0
    for f in factors:
        var += weights.get(f, 0.0) * sigma_w.get(f, 0.0)
    return var


def compute_factor_covariance(
    exposures: dict[str, float],
    hedges: dict[str, float],
    market: dict[str, Any],
    strict: bool = False,
) -> FactorCovarianceResult:
    """Compute variance decomposition and MCTR.

    Parameters
    ----------
    exposures : dict[str, float]
        Factor exposure vector (currency pair -> USD exposure).
        e.g., {"USDMXN": 1_000_000, "EURUSD": -500_000}
    hedges : dict[str, float]
        Hedge positions per factor (currency pair -> USD hedge notional).
    market : dict
        ExtendedMarketSnapshot as dict. Uses 'factor_covariance'.

    Returns
    -------
    FactorCovarianceResult
    """
    cov_matrix: dict[str, dict[str, float]] = market.get("factor_covariance", {})

    if not cov_matrix or not exposures:
        return FactorCovarianceResult()

    factors = list(set(list(exposures.keys()) + list(hedges.keys())) & set(cov_matrix.keys()))
    if not factors:
        # No matching factors in covariance matrix
        factors = list(exposures.keys())
        if strict:
            raise ValueError(
                "Factor covariance requires covariance_matrix in market snapshot — strict mode enabled (RISK-04). "
                f"Exposure factors: {list(exposures.keys())}, Matrix factors: {list(cov_matrix.keys())}."
            )
        # FIX-03: structured region-aware fallback (replaces flat 0.01 diagonal)
        cov_matrix = _build_fallback_covariance(factors)

    # Normalize to weights (fraction of total)
    total_exposure = sum(abs(v) for v in exposures.values())
    if total_exposure == 0:
        return FactorCovarianceResult()

    # Pre-hedge weights
    pre_weights = {f: exposures.get(f, 0.0) / total_exposure for f in factors}

    # Post-hedge weights (exposure - hedge)
    net_exposures = {f: exposures.get(f, 0.0) - hedges.get(f, 0.0) for f in factors}
    total_net = sum(abs(v) for v in net_exposures.values())
    post_weights = (
        {f: net_exposures.get(f, 0.0) / total_net for f in factors}
        if total_net > 0
        else dict.fromkeys(factors, 0.0)
    )

    # Compute variances
    pre_var = _portfolio_variance(cov_matrix, pre_weights, factors)
    post_var = _portfolio_variance(cov_matrix, post_weights, factors)

    # Hedge effectiveness
    effectiveness = (pre_var - post_var) / pre_var if pre_var > 0 else 0.0
    effectiveness = max(0.0, min(1.0, effectiveness))

    # MCTR for pre-hedge
    sigma_w = _matrix_vector_multiply(cov_matrix, pre_weights, factors)
    contributions: list[RiskContribution] = []
    for f in factors:
        w_i = pre_weights.get(f, 0.0)
        sigma_w_i = sigma_w.get(f, 0.0)
        mctr = w_i * sigma_w_i / pre_var if pre_var > 0 else 0.0
        var_contrib = w_i * sigma_w_i
        pct = (var_contrib / pre_var * 100.0) if pre_var > 0 else 0.0

        contributions.append(RiskContribution(
            factor=f,
            weight=w_i,
            marginal_contribution=mctr,
            contribution_pct=pct,
            variance_contribution=var_contrib,
        ))

    # Portfolio volatility
    import math
    port_vol = math.sqrt(pre_var) if pre_var > 0 else 0.0

    # Diversification ratio: sum(w_i * vol_i) / portfolio_vol
    sum_weighted_vol = 0.0
    for f in factors:
        f_var = cov_matrix.get(f, {}).get(f, 0.0)
        sum_weighted_vol += abs(pre_weights.get(f, 0.0)) * math.sqrt(f_var)
    div_ratio = sum_weighted_vol / port_vol if port_vol > 0 else 1.0

    return FactorCovarianceResult(
        pre_hedge_variance=pre_var,
        post_hedge_variance=post_var,
        hedge_effectiveness_ratio=effectiveness,
        risk_contributions=contributions,
        portfolio_volatility=port_vol,
        diversification_ratio=div_ratio,
    )


def _build_fallback_covariance(factors: list[str]) -> dict[str, dict[str, float]]:
    """Build a structured fallback covariance matrix when no live data is available.

    FIX-03: Replaces flat 1% diagonal with realistic region-aware estimates.

    Vol estimates by region (annualized, decimal):
      G10: 8%,  EM_LATAM: 14%,  EM_ASIA: 10%,  EM_CEEMEA: 16%

    Correlation structure:
      Same region: rho = 0.60
      Cross-region: rho = 0.30
    """
    try:
        from app.engine_v1.pair_registry import PAIR_REGISTRY
    except ImportError:
        PAIR_REGISTRY = {}

    _REGION_VOL: dict[str, float] = {
        "G10": 0.08,
        "EM_LATAM": 0.14,
        "EM_ASIA": 0.10,
        "EM_CEEMEA": 0.16,
    }
    _DEFAULT_VOL = 0.12
    _INTRA_CORR = 0.60
    _INTER_CORR = 0.30

    def _get_vol(pair: str) -> float:
        meta = PAIR_REGISTRY.get(pair) if PAIR_REGISTRY else None
        if meta:
            return _REGION_VOL.get(meta.iso_region, _DEFAULT_VOL)
        return _DEFAULT_VOL

    def _get_region(pair: str) -> str:
        meta = PAIR_REGISTRY.get(pair) if PAIR_REGISTRY else None
        return meta.iso_region if meta else "UNKNOWN"

    cov: dict[str, dict[str, float]] = {}
    for i in factors:
        cov[i] = {}
        vol_i = _get_vol(i)
        region_i = _get_region(i)
        for j in factors:
            vol_j = _get_vol(j)
            region_j = _get_region(j)
            if i == j:
                cov[i][j] = vol_i ** 2
            else:
                rho = _INTRA_CORR if region_i == region_j else _INTER_CORR
                cov[i][j] = rho * vol_i * vol_j
    return cov


def load_covariance_from_provider(
    factors: list[str],
    provider: str = "static",
    market: dict[str, Any] | None = None,
) -> dict[str, dict[str, float]] | None:
    """Hook for live covariance feed integration (FIX-03).

    Provider implementations:
      - "static": Returns None (use market.factor_covariance or fallback)
      - "bloomberg": Load from Bloomberg MARS (future integration)
      - "refinitiv": Load from Refinitiv Eikon (future integration)

    Returns None if provider is unavailable, triggering _build_fallback_covariance.
    """
    if provider == "static" or provider is None:
        return None

    # Future: Bloomberg integration
    # if provider == "bloomberg":
    #     from app.integrations.bloomberg import fetch_covariance_matrix
    #     return fetch_covariance_matrix(factors)

    # Future: Refinitiv integration
    # if provider == "refinitiv":
    #     from app.integrations.refinitiv import fetch_covariance_matrix
    #     return fetch_covariance_matrix(factors)

    return None
