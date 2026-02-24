"""A36: Margin Waterfall Attribution.

Decomposes total margin into institutional components:
- initial: base initial margin
- maintenance: ongoing maintenance margin
- stress_addon: additional margin for stress scenarios
- liquidity_addon: margin add-on for illiquid positions
- concentration_addon: margin add-on for concentrated positions

Pure computational -- all inputs injectable.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class MarginBreakdown:
    """Decomposed margin attribution."""

    initial: float = 0.0
    maintenance: float = 0.0
    stress_addon: float = 0.0
    liquidity_addon: float = 0.0
    concentration_addon: float = 0.0
    total: float = 0.0

    def to_dict(self) -> dict:
        return {
            "initial": self.initial,
            "maintenance": self.maintenance,
            "stress_addon": self.stress_addon,
            "liquidity_addon": self.liquidity_addon,
            "concentration_addon": self.concentration_addon,
            "total": self.total,
        }


def compute_margin_attribution(
    margin_positions: list[dict],
    liquidity_scores: list[dict],
    concentration_data: dict[str, float],
    scenario_stress_multiplier: float = 1.5,
    concentration_threshold: float = 0.25,
) -> MarginBreakdown:
    """Compute margin waterfall attribution.

    Parameters
    ----------
    margin_positions : list[dict]
        Margin data per position (initial_margin, maintenance_margin).
    liquidity_scores : list[dict]
        Liquidity data per position (liquidity_score, bucket).
    concentration_data : dict[str, float]
        Instrument -> concentration percentage.
    scenario_stress_multiplier : float
        Stress margin multiplier.
    concentration_threshold : float
        Threshold above which concentration add-on applies.

    Returns
    -------
    MarginBreakdown
    """
    liq_by_bucket = {l.get("bucket"): l for l in liquidity_scores}

    total_initial = 0.0
    total_maintenance = 0.0
    total_stress = 0.0
    total_liquidity = 0.0

    for pos in margin_positions:
        initial = pos.get("initial_margin", 0.0)
        maintenance = pos.get("maintenance_margin", 0.0)
        bucket = pos.get("bucket", "")

        total_initial += initial
        total_maintenance += maintenance

        # Stress add-on
        stress = initial * (scenario_stress_multiplier - 1.0)
        total_stress += stress

        # Liquidity add-on: inverse of liquidity score
        liq_data = liq_by_bucket.get(bucket, {})
        liq_score = liq_data.get("liquidity_score", 1.0)
        if liq_score < 1.0:
            # Lower liquidity -> higher add-on (up to 50% of initial margin)
            liq_addon = initial * (1.0 - liq_score) * 0.5
            total_liquidity += liq_addon

    # Concentration add-on
    total_concentration = 0.0
    for instrument, conc_pct in concentration_data.items():
        if conc_pct > concentration_threshold:
            # Excess concentration -> additional margin
            excess = conc_pct - concentration_threshold
            conc_addon = total_initial * excess * 0.3  # 30% of initial per excess point
            total_concentration += conc_addon

    total = total_initial + total_stress + total_liquidity + total_concentration

    return MarginBreakdown(
        initial=total_initial,
        maintenance=total_maintenance,
        stress_addon=total_stress,
        liquidity_addon=total_liquidity,
        concentration_addon=total_concentration,
        total=total,
    )
