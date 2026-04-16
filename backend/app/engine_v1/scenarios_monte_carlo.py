"""Monte Carlo Scenario Engine.

Generates N correlated FX rate simulations using Cholesky decomposition
of the factor covariance matrix, then computes hedged vs unhedged P&L
distributions with VaR/CVaR at configurable confidence levels.

Pure computational -- deterministic with seed, no I/O, no state.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np


@dataclass
class VaRResult:
    """VaR/CVaR at a single confidence level."""
    confidence: float
    hedged_var: float
    unhedged_var: float
    hedged_cvar: float
    unhedged_cvar: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "confidence": self.confidence,
            "hedged_var": self.hedged_var,
            "unhedged_var": self.unhedged_var,
            "hedged_cvar": self.hedged_cvar,
            "unhedged_cvar": self.unhedged_cvar,
        }


@dataclass
class MonteCarloResult:
    """Full Monte Carlo simulation result."""
    simulation_count: int = 0
    seed: int | None = None
    var_results: list[VaRResult] = field(default_factory=list)
    percentiles: dict[str, float] = field(default_factory=dict)
    mean_hedged_pnl: float = 0.0
    std_hedged_pnl: float = 0.0
    mean_unhedged_pnl: float = 0.0
    std_unhedged_pnl: float = 0.0
    worst_hedged_pnl: float = 0.0
    worst_unhedged_pnl: float = 0.0
    best_hedged_pnl: float = 0.0
    hedge_benefit_mean: float = 0.0
    hedge_benefit_pct: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "simulation_count": self.simulation_count,
            "seed": self.seed,
            "var_results": [v.to_dict() for v in self.var_results],
            "percentiles": self.percentiles,
            "mean_hedged_pnl": self.mean_hedged_pnl,
            "std_hedged_pnl": self.std_hedged_pnl,
            "mean_unhedged_pnl": self.mean_unhedged_pnl,
            "std_unhedged_pnl": self.std_unhedged_pnl,
            "worst_hedged_pnl": self.worst_hedged_pnl,
            "worst_unhedged_pnl": self.worst_unhedged_pnl,
            "best_hedged_pnl": self.best_hedged_pnl,
            "hedge_benefit_mean": self.hedge_benefit_mean,
            "hedge_benefit_pct": self.hedge_benefit_pct,
        }


# ---------------------------------------------------------------------------
# Default vol estimates (annualized, 1-day scaled = vol / sqrt(252))
# ---------------------------------------------------------------------------

_REGION_ANNUAL_VOL: dict[str, float] = {
    "G10": 0.08,
    "EM_LATAM": 0.14,
    "EM_ASIA": 0.10,
    "EM_CEEMEA": 0.16,
}
_DEFAULT_ANNUAL_VOL = 0.12
_INTRA_REGION_CORR = 0.60
_INTER_REGION_CORR = 0.30


def _get_pair_region(pair: str) -> str:
    """Heuristic region classification.

    Checks the first leg (pair[:3]) before the second leg to guarantee
    deterministic results for cross pairs whose legs span different regions.
    Using a set was non-deterministic for such pairs.
    """
    latam = {"MXN", "BRL", "COP", "CLP", "PEN", "ARS"}
    asia = {"CNY", "CNH", "INR", "KRW", "TWD", "IDR", "PHP", "THB", "MYR", "VND"}
    ceemea = {"TRY", "ZAR", "PLN", "HUF", "CZK", "RON", "ILS", "EGP", "NGN"}
    g10 = {"EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "SEK", "NOK", "DKK"}

    ccys = [pair[:3], pair[3:6]] if len(pair) >= 6 else [pair]
    for ccy in ccys:
        if ccy in latam:
            return "EM_LATAM"
        if ccy in asia:
            return "EM_ASIA"
        if ccy in ceemea:
            return "EM_CEEMEA"
        if ccy in g10:
            return "G10"
    return "G10"


def _build_covariance(
    factors: list[str],
    cov_override: dict[str, dict[str, float]] | None = None,
) -> "np.ndarray[Any, np.dtype[Any]]":
    """Build covariance matrix from override or region-aware fallback."""
    n = len(factors)

    if cov_override:
        matrix = np.zeros((n, n))
        for i, fi in enumerate(factors):
            for j, fj in enumerate(factors):
                matrix[i, j] = cov_override.get(fi, {}).get(fj, 0.0)
        # Ensure positive semi-definite
        eigvals = np.linalg.eigvalsh(matrix)
        if np.any(eigvals < -1e-10):
            # Fix by adding small diagonal
            matrix += np.eye(n) * (abs(eigvals.min()) + 1e-8)
        return matrix

    # Build from region-aware defaults (daily vol)
    daily_vols = []
    regions = []
    for f in factors:
        region = _get_pair_region(f)
        regions.append(region)
        annual_vol = _REGION_ANNUAL_VOL.get(region, _DEFAULT_ANNUAL_VOL)
        daily_vols.append(annual_vol / np.sqrt(252))

    matrix = np.zeros((n, n))
    for i in range(n):
        for j in range(n):
            if i == j:
                matrix[i, j] = daily_vols[i] ** 2
            else:
                rho = _INTRA_REGION_CORR if regions[i] == regions[j] else _INTER_REGION_CORR
                matrix[i, j] = rho * daily_vols[i] * daily_vols[j]
    return matrix


def run_monte_carlo(
    buckets: list[dict[str, Any]],
    market: dict[str, Any],
    num_simulations: int = 10_000,
    seed: int | None = None,
    confidence_levels: list[float] | None = None,
    horizon_days: int = 1,
) -> MonteCarloResult:
    """Run Monte Carlo simulation on hedge plan buckets.

    Parameters
    ----------
    buckets : list[dict]
        Bucket results from hedge plan, each with:
        - commercial_exposure_mxn (or commercial_exposure_local)
        - hedge_position_mxn (or hedge_position_local)
        - residual_mxn (or residual_local)
        - forward_rate
        - pair (optional, defaults to "USDMXN")
    market : dict
        Market snapshot with spot_rate (or spot_usdmxn) and optional
        factor_covariance for multi-currency.
    num_simulations : int
        Number of Monte Carlo paths (default 10,000).
    seed : int | None
        Random seed for deterministic results.
    confidence_levels : list[float]
        VaR/CVaR confidence levels (default [0.95, 0.99]).
    horizon_days : int
        Risk horizon in days (default 1). Multi-day = sqrt(T) scaling.

    Returns
    -------
    MonteCarloResult
    """
    if not buckets:
        return MonteCarloResult()

    if confidence_levels is None:
        confidence_levels = [0.95, 0.99]

    rng = np.random.default_rng(seed)
    num_simulations = max(100, min(num_simulations, 100_000))

    # Extract spot rate
    spot = market.get("spot_rate", market.get("spot_usdmxn", 17.15))

    # Identify unique currency pairs
    pairs = list({b.get("pair", "USDMXN") for b in buckets})
    n_factors = len(pairs)

    # Build covariance matrix
    cov_override = market.get("factor_covariance")
    cov_matrix = _build_covariance(pairs, cov_override)

    # Scale for horizon
    if horizon_days > 1:
        cov_matrix = cov_matrix * horizon_days

    # Cholesky decomposition for correlated sampling
    try:
        L = np.linalg.cholesky(cov_matrix)
    except np.linalg.LinAlgError:
        # Fall back: add small diagonal for positive-definiteness
        cov_matrix += np.eye(n_factors) * 1e-8
        L = np.linalg.cholesky(cov_matrix)

    # Generate correlated shocks: shape (num_simulations, n_factors)
    Z = rng.standard_normal((num_simulations, n_factors))
    shocks = Z @ L.T  # correlated returns

    # Map pair -> column index
    pair_idx = {p: i for i, p in enumerate(pairs)}

    # Pre-compute base values per bucket
    bucket_data = []
    for b in buckets:
        comm_exp = b.get("commercial_exposure_mxn", b.get("commercial_exposure_local", 0.0))
        hedge_pos = b.get("hedge_position_mxn", b.get("hedge_position_local", 0.0))
        residual = b.get("residual_mxn", b.get("residual_local", 0.0))
        fwd = b.get("forward_rate", spot)
        pair = b.get("pair", "USDMXN")
        pair_spot = market.get(f"spot_{pair.lower()}", spot)

        bucket_data.append({
            "comm_exp": comm_exp,
            "hedge_pos": hedge_pos,
            "residual": residual,
            "fwd": fwd,
            "pair_idx": pair_idx.get(pair, 0),
            "pair_spot": pair_spot,
        })

    # Base P&L references: unhedged = all exposure at spot, hedged = hedges at fwd + residual at spot
    base_unhedged = sum(
        bd["comm_exp"] / bd["pair_spot"] for bd in bucket_data if bd["pair_spot"] != 0
    )
    base_hedged = sum(
        (bd["hedge_pos"] / bd["fwd"] if bd["fwd"] != 0 else 0.0)
        + (bd["residual"] / bd["pair_spot"] if bd["pair_spot"] != 0 else 0.0)
        for bd in bucket_data
    )

    # Run simulations
    hedged_pnls = np.zeros(num_simulations)
    unhedged_pnls = np.zeros(num_simulations)

    for sim in range(num_simulations):
        hedged_val = 0.0
        unhedged_val = 0.0

        for bd in bucket_data:
            shock = shocks[sim, bd["pair_idx"]]
            shocked_spot = bd["pair_spot"] * (1.0 + shock)
            if shocked_spot <= 0:
                shocked_spot = bd["pair_spot"] * 0.01  # floor

            # Unhedged: all exposure at shocked spot
            if shocked_spot != 0:
                unhedged_val += bd["comm_exp"] / shocked_spot

            # Hedged: hedge locked at forward rate, only residual floats
            if bd["fwd"] != 0:
                hedged_val += bd["hedge_pos"] / bd["fwd"]
            if shocked_spot != 0:
                hedged_val += bd["residual"] / shocked_spot

        hedged_pnls[sim] = hedged_val - base_hedged
        unhedged_pnls[sim] = unhedged_val - base_unhedged

    # Compute statistics
    var_results = []
    for cl in confidence_levels:
        alpha = 1.0 - cl
        h_var = float(np.percentile(hedged_pnls, alpha * 100))
        u_var = float(np.percentile(unhedged_pnls, alpha * 100))
        # CVaR = mean of losses beyond VaR
        h_tail = hedged_pnls[hedged_pnls <= h_var]
        u_tail = unhedged_pnls[unhedged_pnls <= u_var]
        h_cvar = float(np.mean(h_tail)) if len(h_tail) > 0 else h_var
        u_cvar = float(np.mean(u_tail)) if len(u_tail) > 0 else u_var
        var_results.append(VaRResult(
            confidence=cl,
            hedged_var=h_var,
            unhedged_var=u_var,
            hedged_cvar=h_cvar,
            unhedged_cvar=u_cvar,
        ))

    # Percentile distribution
    pct_levels = [1, 5, 10, 25, 50, 75, 90, 95, 99]
    percentiles = {}
    for p in pct_levels:
        percentiles[f"hedged_p{p:02d}"] = float(np.percentile(hedged_pnls, p))
        percentiles[f"unhedged_p{p:02d}"] = float(np.percentile(unhedged_pnls, p))

    hedge_benefit = hedged_pnls - unhedged_pnls
    mean_benefit = float(np.mean(hedge_benefit))
    mean_unhedged_abs = abs(float(np.mean(unhedged_pnls)))

    return MonteCarloResult(
        simulation_count=num_simulations,
        seed=seed,
        var_results=var_results,
        percentiles=percentiles,
        mean_hedged_pnl=float(np.mean(hedged_pnls)),
        std_hedged_pnl=float(np.std(hedged_pnls)),
        mean_unhedged_pnl=float(np.mean(unhedged_pnls)),
        std_unhedged_pnl=float(np.std(unhedged_pnls)),
        worst_hedged_pnl=float(np.min(hedged_pnls)),
        worst_unhedged_pnl=float(np.min(unhedged_pnls)),
        best_hedged_pnl=float(np.max(hedged_pnls)),
        hedge_benefit_mean=mean_benefit,
        hedge_benefit_pct=(mean_benefit / mean_unhedged_abs * 100) if mean_unhedged_abs > 0 else 0.0,
    )
