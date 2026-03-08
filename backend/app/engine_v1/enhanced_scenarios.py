"""Enhanced scenario analysis with configurable shock packs.

Extends the existing scenarios.py (FROZEN) with:
1. Configurable shock levels (policy-driven, not hardcoded)
2. Volatility-scaled shocks (when vol data available)
3. Historical VaR/ES stubs (ready for live data)
4. Scenario pack selection

The original SIGMAS = [-0.10, -0.05, 0.05, 0.10] are preserved as
the DEFAULT_SHOCK_PACK, ensuring parity when no custom config is set.

Justification for default +/-5%/+/-10% shocks:
- EM FX annualized vol ~ 12-18% (BIS Triennial Survey 2022)
- Monthly sigma ~ annualized / sqrt(12) ~ 3.5-5.2%
- +/-5% ~ 1sigma monthly move for typical EM pair
- +/-10% ~ 2sigma monthly move (97.7th percentile)
- Institutional convention: 1sigma and 2sigma stress (BCBS/EBA market risk)
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any


DEFAULT_SHOCK_PACK: list[float] = [-0.10, -0.05, 0.05, 0.10]

NAMED_SHOCK_PACKS: dict[str, list[float]] = {
    "standard": [-0.10, -0.05, 0.05, 0.10],
    "conservative": [-0.15, -0.10, -0.05, 0.05, 0.10, 0.15],
    "aggressive": [-0.20, -0.10, 0.10, 0.20],
    "tail_risk": [-0.25, -0.15, -0.10, -0.05, 0.05, 0.10, 0.15, 0.25],
    "mild": [-0.05, -0.02, 0.02, 0.05],
    "em_stress": [-0.20, -0.15, -0.10, -0.05, 0.05, 0.10],
    "g10_stress": [-0.10, -0.05, -0.03, 0.03, 0.05, 0.10],
}


@dataclass
class HistoricalVaRResult:
    """Historical Value-at-Risk and Expected Shortfall result.

    Computed from empirical return distribution -- no distributional
    assumptions. Deterministic given the same input series.
    """
    var_level: float  # confidence level (e.g., 0.95)
    var_value: float  # VaR in return terms (e.g., -0.08 = 8% loss)
    var_usd: float  # VaR in USD terms
    expected_shortfall: float  # CVaR / ES in return terms
    expected_shortfall_usd: float  # ES in USD terms
    lookback_days: int
    sample_size: int
    method: str = "HISTORICAL"

    def to_dict(self) -> dict[str, Any]:
        return {
            "var_level": self.var_level,
            "var_value": round(self.var_value, 6),
            "var_usd": round(self.var_usd, 2),
            "expected_shortfall": round(self.expected_shortfall, 6),
            "expected_shortfall_usd": round(self.expected_shortfall_usd, 2),
            "lookback_days": self.lookback_days,
            "sample_size": self.sample_size,
            "method": self.method,
        }


@dataclass
class EnhancedScenarioResult:
    """Result from enhanced scenario analysis."""
    shock_pack_used: str  # "standard", "custom", etc.
    shock_levels: list[float]
    scenario_count: int
    vol_scaled: bool = False
    vol_multiplier: float = 1.0
    historical_var: HistoricalVaRResult | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "shock_pack_used": self.shock_pack_used,
            "shock_levels": self.shock_levels,
            "scenario_count": self.scenario_count,
            "vol_scaled": self.vol_scaled,
            "vol_multiplier": round(self.vol_multiplier, 4),
        }
        if self.historical_var is not None:
            d["historical_var"] = self.historical_var.to_dict()
        return d


def resolve_shock_levels(
    *,
    policy_shock_levels: list[float] | None = None,
    named_pack: str | None = None,
    custom_shocks: list[dict[str, float]] | None = None,
) -> tuple[str, list[float]]:
    """Resolve shock levels from policy configuration.

    Priority: custom_shocks > policy_shock_levels > named_pack > default.
    Returns (pack_name, sorted shock levels).
    """
    if custom_shocks:
        levels = [s.get("shock", 0.0) for s in custom_shocks if "shock" in s]
        if levels:
            return "custom", sorted(levels)

    if policy_shock_levels and len(policy_shock_levels) > 0:
        return "policy", sorted(policy_shock_levels)

    if named_pack and named_pack in NAMED_SHOCK_PACKS:
        return named_pack, NAMED_SHOCK_PACKS[named_pack]

    return "standard", DEFAULT_SHOCK_PACK


def compute_vol_scaled_shocks(
    base_shocks: list[float],
    *,
    current_vol: float,
    baseline_vol: float = 0.15,
) -> tuple[list[float], float]:
    """Scale shock levels by current volatility relative to baseline.

    When vol is elevated (e.g., 25% vs 15% baseline), shocks are
    amplified by the ratio (25/15 = 1.67x). When vol is low,
    shocks are dampened. Clamped to [0.5x, 3.0x] range.

    Args:
        base_shocks: Original shock levels
        current_vol: Current annualized volatility
        baseline_vol: Reference volatility (default 15% for EM FX)

    Returns:
        (scaled_shocks, multiplier)
    """
    if baseline_vol <= 0 or current_vol <= 0:
        return base_shocks, 1.0

    multiplier = max(0.5, min(3.0, current_vol / baseline_vol))
    scaled = [round(s * multiplier, 6) for s in base_shocks]
    return scaled, multiplier


def compute_historical_var(
    returns: list[float],
    *,
    confidence: float = 0.95,
    exposure_usd: float = 0.0,
) -> HistoricalVaRResult:
    """Historical (non-parametric) VaR and Expected Shortfall.

    No distributional assumptions -- uses empirical quantile of
    historical returns. Deterministic given the same input series.

    Args:
        returns: Historical log or simple returns (negative = loss)
        confidence: VaR confidence level (e.g., 0.95 for 95th percentile)
        exposure_usd: Notional exposure for USD conversion

    Returns:
        HistoricalVaRResult with VaR and ES values
    """
    n = len(returns)
    if n < 20:
        return HistoricalVaRResult(
            var_level=confidence,
            var_value=0.0,
            var_usd=0.0,
            expected_shortfall=0.0,
            expected_shortfall_usd=0.0,
            lookback_days=n,
            sample_size=n,
        )

    sorted_returns = sorted(returns)
    var_index = max(0, int(math.floor(n * (1 - confidence))) - 1)
    var_value = sorted_returns[var_index]

    # Expected Shortfall = mean of returns below VaR
    tail = sorted_returns[: var_index + 1]
    es_value = sum(tail) / len(tail) if tail else var_value

    return HistoricalVaRResult(
        var_level=confidence,
        var_value=var_value,
        var_usd=abs(var_value) * exposure_usd,
        expected_shortfall=es_value,
        expected_shortfall_usd=abs(es_value) * exposure_usd,
        lookback_days=n,
        sample_size=n,
    )
