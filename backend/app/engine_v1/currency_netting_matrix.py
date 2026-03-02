"""A29: Currency Netting Matrix.

Derives synthetic exposures and eliminates redundant hedge legs.

Process:
1. Build exposure per currency: Exposure[currency]
2. Solve minimal hedge set via matrix reduction
3. Example: EURUSD + USDJPY -> derive EURJPY net exposure

Pure computational -- reduces capital usage where possible.
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
class TriangulationCheck:
    """Triangular arbitrage consistency check for a netting pair (FIX-10)."""

    pair_1: str
    pair_2: str
    synthetic_pair: str
    synthetic_rate: float
    market_rate: "float | None"
    deviation_pct: float
    status: str  # "OK", "WARNING", "SUSPECT"

    def to_dict(self) -> dict:
        return {
            "pair_1": self.pair_1,
            "pair_2": self.pair_2,
            "synthetic_pair": self.synthetic_pair,
            "synthetic_rate": self.synthetic_rate,
            "market_rate": self.market_rate,
            "deviation_pct": self.deviation_pct,
            "status": self.status,
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
    triangulation_checks: "list[TriangulationCheck]" = field(default_factory=list)  # FIX-10
    triangulation_warnings: int = 0  # FIX-10

    def to_dict(self) -> dict:
        return {
            "currency_exposures": [c.to_dict() for c in self.currency_exposures],
            "netting_pairs": [n.to_dict() for n in self.netting_pairs],
            "gross_notional_before": self.gross_notional_before,
            "gross_notional_after": self.gross_notional_after,
            "total_savings_usd": self.total_savings_usd,
            "netting_efficiency_pct": self.netting_efficiency_pct,
            "redundant_legs_eliminated": self.redundant_legs_eliminated,
            "triangulation_checks": [t.to_dict() for t in self.triangulation_checks],
            "triangulation_warnings": self.triangulation_warnings,
        }


def compute_currency_netting(
    exposures: dict[str, float],
    fx_rates: dict[str, float],
) -> NettingResult:
    """Compute optimal currency netting to minimize hedge legs.

    Parameters
    ----------
    exposures : dict[str, float]
        Currency pair -> USD exposure.
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

    # FIX-10: triangulation consistency check
    tri_checks = validate_netting_triangulation(netting_pairs, fx_rates)
    tri_warnings = sum(1 for c in tri_checks if c.status in ("WARNING", "SUSPECT"))

    return NettingResult(
        currency_exposures=currency_exposures,
        netting_pairs=netting_pairs,
        gross_notional_before=gross_before,
        gross_notional_after=gross_after,
        total_savings_usd=total_savings,
        netting_efficiency_pct=efficiency,
        redundant_legs_eliminated=len(netting_pairs),
        triangulation_checks=tri_checks,
        triangulation_warnings=tri_warnings,
    )

def validate_netting_triangulation(
    netting_pairs: "list[NettingPair]",
    fx_rates: dict[str, float],
    tolerance_pct: float = 0.5,
) -> "list[TriangulationCheck]":
    """Validate synthetic cross rates against market rates (FIX-10).

    Parameters
    ----------
    netting_pairs : list[NettingPair]
        Netting pairs from compute_currency_netting().
    fx_rates : dict[str, float]
        Market FX rates keyed by pair code.
    tolerance_pct : float
        Maximum acceptable deviation (%). Default 0.5%.

    Returns
    -------
    list[TriangulationCheck]
    """
    checks: list[TriangulationCheck] = []

    for np in netting_pairs:
        rate_1 = fx_rates.get(np.original_pair_1, 0.0)
        rate_2 = fx_rates.get(np.original_pair_2, 0.0)
        market_cross = fx_rates.get(np.synthetic_pair, None)

        if rate_1 <= 0 or rate_2 <= 0:
            continue

        p1_base = np.original_pair_1[:3]
        p1_quote = np.original_pair_1[3:]
        p2_base = np.original_pair_2[:3]
        p2_quote = np.original_pair_2[3:]

        synthetic_rate: float = 0.0
        if p1_quote == p2_base:
            synthetic_rate = rate_1 * rate_2
        elif p1_base == p2_quote:
            synthetic_rate = rate_1 / rate_2 if rate_2 > 0 else 0.0
        elif p1_base == p2_base:
            synthetic_rate = rate_1 / rate_2 if rate_2 > 0 else 0.0
        elif p1_quote == p2_quote:
            synthetic_rate = rate_1 / rate_2 if rate_2 > 0 else 0.0
        else:
            continue

        if synthetic_rate <= 0:
            continue

        deviation_pct = 0.0
        status = "OK"
        if market_cross and market_cross > 0:
            deviation_pct = abs(synthetic_rate - market_cross) / market_cross * 100.0
            if deviation_pct > tolerance_pct * 2:
                status = "SUSPECT"
            elif deviation_pct > tolerance_pct:
                status = "WARNING"

        checks.append(TriangulationCheck(
            pair_1=np.original_pair_1,
            pair_2=np.original_pair_2,
            synthetic_pair=np.synthetic_pair,
            synthetic_rate=synthetic_rate,
            market_rate=market_cross,
            deviation_pct=deviation_pct,
            status=status,
        ))

    return checks



# ──────────────────────────────────────────────────────────────────────────────
# ARCH-02: Cross-rate triangulation validation
# ──────────────────────────────────────────────────────────────────────────────

def validate_triangular_consistency(
    rates: dict[str, float],
    tolerance_bps: float = 5.0,
) -> list[str]:
    """Check triangular arbitrage bounds across all 3-pair combinations.

    For any triplet (AB, BC, AC): |AB × BC − AC| / AC < tolerance_bps / 10_000.
    Returns list of violation descriptions. Empty list = no violations.

    Args:
        rates: Dict of pair → rate, e.g. {"USDEUR": 0.92, "EURGBP": 0.86, "USDGBP": 0.7912}.
               Both "USDEUR" and "EURUSD" forms accepted (inverted automatically).
        tolerance_bps: Maximum allowed triangulation error in basis points. Default 5 bps.

    Returns:
        List of human-readable violation strings (empty = clean).
    """
    violations: list[str] = []
    if len(rates) < 3:
        return violations

    # Build a lookup that handles both directions
    def get_rate(a: str, b: str) -> float | None:
        direct = rates.get(f"{a}{b}")
        if direct is not None:
            return direct
        inverse = rates.get(f"{b}{a}")
        if inverse and inverse != 0.0:
            return 1.0 / inverse
        return None

    # Extract unique currencies
    currencies: set[str] = set()
    for pair in rates:
        if len(pair) == 6:
            currencies.add(pair[:3])
            currencies.add(pair[3:])

    currency_list = sorted(currencies)
    n = len(currency_list)

    for i in range(n):
        for j in range(i + 1, n):
            for k in range(j + 1, n):
                a, b, c = currency_list[i], currency_list[j], currency_list[k]
                ab = get_rate(a, b)
                bc = get_rate(b, c)
                ac = get_rate(a, c)

                if ab is None or bc is None or ac is None:
                    continue  # Incomplete triplet — skip

                if abs(ac) < 1e-10:
                    continue

                implied_ac = ab * bc
                deviation_bps = abs(implied_ac - ac) / abs(ac) * 10_000.0

                if deviation_bps > tolerance_bps:
                    violations.append(
                        f"Triangulation breach: {a}/{b} ({ab:.6f}) × {b}/{c} ({bc:.6f}) "
                        f"= {implied_ac:.6f} vs {a}/{c} = {ac:.6f} "
                        f"({deviation_bps:.1f} bps > {tolerance_bps:.1f} bps tolerance)"
                    )

    return violations
