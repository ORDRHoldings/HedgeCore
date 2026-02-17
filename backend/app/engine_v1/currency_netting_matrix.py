"""A29: Currency Netting Matrix.

Derives synthetic exposures and eliminates redundant hedge legs.

Process:
1. Build exposure per currency: Exposure[currency]
2. Solve minimal hedge set via matrix reduction
3. Example: EURUSD + USDJPY → derive EURJPY net exposure

Pure computational — reduces capital usage where possible.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class NettingPair:
    """A pair identified for netting."""

    original_pair_1: str
    original_pair_2: str
    synthetic_pair: str
    original_notional_1: float
    original_notional_2: float
    netted_notional: float
    savings_usd: float

    def to_dict(self) -> dict:
        return {
            "original_pair_1": self.original_pair_1,
            "original_pair_2": self.original_pair_2,
            "synthetic_pair": self.synthetic_pair,
            "original_notional_1": self.original_notional_1,
            "original_notional_2": self.original_notional_2,
            "netted_notional": self.netted_notional,
            "savings_usd": self.savings_usd,
        }


@dataclass
class CurrencyExposureNet:
    """Net exposure per currency after netting."""

    currency: str
    gross_exposure: float
    net_exposure: float
    offset_amount: float

    def to_dict(self) -> dict:
        return {
            "currency": self.currency,
            "gross_exposure": self.gross_exposure,
            "net_exposure": self.net_exposure,
            "offset_amount": self.offset_amount,
        }


@dataclass
class NettingResult:
    """Currency netting analysis result."""

    currency_exposures: list[CurrencyExposureNet] = field(default_factory=list)
    netting_pairs: list[NettingPair] = field(default_factory=list)
    gross_notional_before: float = 0.0
    gross_notional_after: float = 0.0
    total_savings_usd: float = 0.0
    netting_efficiency_pct: float = 0.0
    redundant_legs_eliminated: int = 0

    def to_dict(self) -> dict:
        return {
            "currency_exposures": [c.to_dict() for c in self.currency_exposures],
            "netting_pairs": [n.to_dict() for n in self.netting_pairs],
            "gross_notional_before": self.gross_notional_before,
            "gross_notional_after": self.gross_notional_after,
            "total_savings_usd": self.total_savings_usd,
            "netting_efficiency_pct": self.netting_efficiency_pct,
            "redundant_legs_eliminated": self.redundant_legs_eliminated,
        }


def compute_currency_netting(
    exposures: dict[str, float],
    fx_rates: dict[str, float],
) -> NettingResult:
    """Compute optimal currency netting to minimize hedge legs.

    Parameters
    ----------
    exposures : dict[str, float]
        Currency pair → USD exposure.
        e.g., {"USDMXN": 1_000_000, "EURUSD": -500_000, "USDJPY": -300_000}
    fx_rates : dict[str, float]
        FX rates for conversion.

    Returns
    -------
    NettingResult
    """
    if not exposures:
        return NettingResult()

    # Step 1: Decompose pairs into per-currency exposures
    currency_net: dict[str, float] = {}
    for pair, amount in exposures.items():
        if len(pair) < 6:
            continue
        base = pair[:3]
        quote = pair[3:]
        currency_net[base] = currency_net.get(base, 0.0) + amount
        currency_net[quote] = currency_net.get(quote, 0.0) - amount

    # Step 2: Identify offsetting positions
    gross_before = sum(abs(v) for v in exposures.values())
    currency_exposures: list[CurrencyExposureNet] = []

    for ccy, net in currency_net.items():
        # Gross is sum of all positive/negative contributions
        gross = sum(
            abs(amt) for pair, amt in exposures.items()
            if pair[:3] == ccy or pair[3:] == ccy
        )
        offset = gross - abs(net)
        currency_exposures.append(CurrencyExposureNet(
            currency=ccy,
            gross_exposure=gross,
            net_exposure=net,
            offset_amount=offset,
        ))

    # Step 3: Find synthetic cross pairs
    netting_pairs: list[NettingPair] = []
    pairs = list(exposures.keys())
    used = set()

    for i, pair1 in enumerate(pairs):
        if pair1 in used:
            continue
        base1 = pair1[:3]
        quote1 = pair1[3:]

        for j, pair2 in enumerate(pairs):
            if j <= i or pair2 in used:
                continue
            base2 = pair2[:3]
            quote2 = pair2[3:]

            # Check for common currency that can be netted
            common = None
            if base1 == quote2:
                common = base1
                synthetic = f"{base2}{quote1}"
            elif quote1 == base2:
                common = quote1
                synthetic = f"{base1}{quote2}"
            elif base1 == base2:
                common = base1
                synthetic = f"{quote1}{quote2}"
            elif quote1 == quote2:
                common = quote1
                synthetic = f"{base1}{base2}"

            if common and synthetic not in exposures:
                amt1 = abs(exposures[pair1])
                amt2 = abs(exposures[pair2])
                netted = min(amt1, amt2)
                savings = netted * 0.03  # ~3% margin savings on netted amount

                if savings > 0:
                    netting_pairs.append(NettingPair(
                        original_pair_1=pair1,
                        original_pair_2=pair2,
                        synthetic_pair=synthetic,
                        original_notional_1=amt1,
                        original_notional_2=amt2,
                        netted_notional=netted,
                        savings_usd=savings,
                    ))
                    used.add(pair1)
                    used.add(pair2)
                    break

    gross_after = gross_before - sum(n.savings_usd for n in netting_pairs)
    total_savings = sum(n.savings_usd for n in netting_pairs)
    efficiency = (total_savings / gross_before * 100.0) if gross_before > 0 else 0.0

    return NettingResult(
        currency_exposures=currency_exposures,
        netting_pairs=netting_pairs,
        gross_notional_before=gross_before,
        gross_notional_after=gross_after,
        total_savings_usd=total_savings,
        netting_efficiency_pct=efficiency,
        redundant_legs_eliminated=len(netting_pairs),
    )
