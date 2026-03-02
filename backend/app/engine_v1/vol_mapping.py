"""A15: Vega-VIX Converter.

Maps portfolio vega exposure to equivalent VIX contract notional.

Formula: equivalent_vix_notional = net_vega / vix_contract_vega

Term structure adjustment via linear interpolation between front/back month VIX.
Pure computational -- accepts injectable vol surface via ExtendedMarketSnapshot.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class VegaMappingResult:
    """Result of vega-to-VIX mapping."""

    net_vega: float
    vix_contract_vega: float
    equivalent_vix_contracts: float
    vix_front_month: float
    vix_back_month: float
    term_adjusted_vega: float
    notional_equivalent_usd: float

    def to_dict(self) -> dict:
        return {
            "net_vega": self.net_vega,
            "vix_contract_vega": self.vix_contract_vega,
            "equivalent_vix_contracts": self.equivalent_vix_contracts,
            "vix_front_month": self.vix_front_month,
            "vix_back_month": self.vix_back_month,
            "term_adjusted_vega": self.term_adjusted_vega,
            "notional_equivalent_usd": self.notional_equivalent_usd,
        }


def map_vega_to_vix(
    portfolio_vega: float,
    market: dict[str, Any],
    policy: dict[str, Any],
    target_tenor_months: int = 3,
) -> VegaMappingResult:
    """Map portfolio vega exposure to VIX contract equivalent.

    Parameters
    ----------
    portfolio_vega : float
        Net portfolio vega ($/vol point).
    market : dict
        ExtendedMarketSnapshot as dict. Uses 'vol_surface'.
    policy : dict
        ExtendedPolicyConfig as dict. Uses 'vix_contract_vega'.
    target_tenor_months : int
        Target maturity for term structure adjustment.

    Returns
    -------
    VegaMappingResult
    """
    vol_surface: dict[str, float] = market.get("vol_surface", {})
    vix_contract_vega = policy.get("vix_contract_vega", 400.0)

    # Front and back month VIX levels
    vix_front = vol_surface.get("VIX_1M", 0.0)
    vix_back = vol_surface.get("VIX_3M", 0.0)

    if vix_front <= 0:
        vix_front = 18.0  # institutional fallback when vol surface absent
    if vix_back <= 0:
        vix_back = 20.0  # institutional fallback when vol surface absent

    # Term structure adjustment: linear interpolation
    # Weight towards back month based on target tenor
    if target_tenor_months <= 1:
        weight = 0.0
    elif target_tenor_months >= 3:
        weight = 1.0
    else:
        weight = (target_tenor_months - 1) / 2.0

    term_structure_ratio = (1.0 - weight) * vix_front + weight * vix_back
    # Adjust vega by term structure vs front month
    adjustment = term_structure_ratio / vix_front if vix_front > 0 else 1.0
    term_adjusted_vega = portfolio_vega * adjustment

    # Equivalent VIX contracts
    equivalent_contracts = term_adjusted_vega / vix_contract_vega if vix_contract_vega > 0 else 0.0

    # VIX contract multiplier is $1000 per point
    vix_multiplier = 1000.0
    notional_equivalent = abs(equivalent_contracts) * vix_multiplier * vix_front

    return VegaMappingResult(
        net_vega=portfolio_vega,
        vix_contract_vega=vix_contract_vega,
        equivalent_vix_contracts=equivalent_contracts,
        vix_front_month=vix_front,
        vix_back_month=vix_back,
        term_adjusted_vega=term_adjusted_vega,
        notional_equivalent_usd=notional_equivalent,
    )
