"""A25: Factor Covariance & Risk Contribution Engine.

Institutional variance decomposition and marginal contribution to risk (MCTR).

Calculations:
    portfolio_variance = w? ? w
    mctr_i = w_i ? (? w)_i / portfolio_variance
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

    def to_dict(self) -> dict:
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

    def to_dict(self) -> dict:
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
    """Compute ? ? w (covariance matrix ? weight vector)."""
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
    """Compute w? ? w."""
    sigma_w = _matrix_vector_multiply(cov, weights, factors)
    var = 0.0
    for f in factors:
        var += weights.get(f, 0.0) * sigma_w.get(f, 0.0)
    return var


def compute_factor_covariance(
    exposures: dict[str, float],
    hedges: dict[str, float],
    market: dict[str, Any],
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
        # No matching factors in covariance matrix -- use simple diagonal
        factors = list(exposures.keys())
        for f in factors:
            cov_matrix.setdefault(f, {})[f] = 0.01  # 1% variance default

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
        else {f: 0.0 for f in factors}
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

    # Diversification ratio: sum(w_i ? vol_i) / portfolio_vol
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
