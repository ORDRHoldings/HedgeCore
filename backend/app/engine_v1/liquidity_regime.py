"""A39: Liquidity Regime Classifier.

Classifies market liquidity regime using deterministic rule table.

Classification:
    NORMAL  → base slippage, base margin
    STRESSED → 2× slippage, 1.5× margin
    CRISIS  → 5× slippage, 3× margin

Feeds into slippage multiplier, margin add-on, capital adequacy check.
Pure rule table — no stochastic behavior.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class RegimeClassification:
    """Liquidity regime classification result."""

    regime: str  # "NORMAL", "STRESSED", "CRISIS"
    slippage_multiplier: float
    margin_multiplier: float
    adv_ratio: float
    spread_widening: float
    vol_spike: float
    margin_compression: float
    score: float  # 0-100 (higher = more stressed)
    factors: dict[str, str]  # factor → contribution description

    def to_dict(self) -> dict:
        return {
            "regime": self.regime,
            "slippage_multiplier": self.slippage_multiplier,
            "margin_multiplier": self.margin_multiplier,
            "adv_ratio": self.adv_ratio,
            "spread_widening": self.spread_widening,
            "vol_spike": self.vol_spike,
            "margin_compression": self.margin_compression,
            "score": self.score,
            "factors": self.factors,
        }


# Regime thresholds
_STRESSED_THRESHOLD = 40.0
_CRISIS_THRESHOLD = 70.0

# Regime multipliers
_REGIME_PARAMS: dict[str, dict[str, float]] = {
    "NORMAL": {"slippage": 1.0, "margin": 1.0},
    "STRESSED": {"slippage": 2.0, "margin": 1.5},
    "CRISIS": {"slippage": 5.0, "margin": 3.0},
}


def classify_liquidity_regime(
    market: dict[str, Any],
    liquidity_data: dict[str, Any],
) -> RegimeClassification:
    """Classify current market liquidity regime.

    Parameters
    ----------
    market : dict
        ExtendedMarketSnapshot as dict. Uses 'vol_surface', 'adv_data'.
    liquidity_data : dict
        Liquidity model results. Uses 'avg_liquidity_score', 'min_liquidity_score'.

    Returns
    -------
    RegimeClassification
    """
    vol_surface = market.get("vol_surface", {})
    adv_data = market.get("adv_data", {})

    # Factor 1: ADV ratio (participation rate proxy)
    avg_liq_score = liquidity_data.get("avg_liquidity_score", 1.0)
    adv_score = (1.0 - avg_liq_score) * 100.0  # 0 = liquid, 100 = illiquid

    # Factor 2: Spread widening (proxy from liquidity score)
    min_liq_score = liquidity_data.get("min_liquidity_score", 1.0)
    spread_score = (1.0 - min_liq_score) * 100.0

    # Factor 3: Volatility spike
    vix_1m = vol_surface.get("VIX_1M", 18.0)
    # Normal VIX ~15-20, elevated >25, crisis >35
    vol_score = max(0.0, (vix_1m - 15.0) / 25.0 * 100.0)

    # Factor 4: Margin compression (from margin rates)
    margin_rates = market.get("margin_rates", {})
    fwd_initial = margin_rates.get("FWD", {}).get("initial", 0.03)
    # Normal 3%, stressed 5%+, crisis 10%+
    margin_score = max(0.0, (fwd_initial - 0.03) / 0.07 * 100.0)

    # Composite score (weighted average)
    composite = (
        adv_score * 0.25 +
        spread_score * 0.25 +
        vol_score * 0.30 +
        margin_score * 0.20
    )

    # Classify
    if composite >= _CRISIS_THRESHOLD:
        regime = "CRISIS"
    elif composite >= _STRESSED_THRESHOLD:
        regime = "STRESSED"
    else:
        regime = "NORMAL"

    params = _REGIME_PARAMS[regime]
    factors = {}
    if adv_score > 30:
        factors["adv"] = f"Low ADV (score={adv_score:.0f})"
    if spread_score > 30:
        factors["spread"] = f"Wide spreads (score={spread_score:.0f})"
    if vol_score > 30:
        factors["volatility"] = f"Elevated vol VIX={vix_1m:.1f} (score={vol_score:.0f})"
    if margin_score > 30:
        factors["margin"] = f"High margin req (score={margin_score:.0f})"

    return RegimeClassification(
        regime=regime,
        slippage_multiplier=params["slippage"],
        margin_multiplier=params["margin"],
        adv_ratio=avg_liq_score,
        spread_widening=spread_score,
        vol_spike=vol_score,
        margin_compression=margin_score,
        score=composite,
        factors=factors,
    )
