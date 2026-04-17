"""
engine_v1/ir_curve_engine.py
Bootstrap OIS and IRS yield curves from market rate quotes.

Pure computation — no I/O, no state.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date


@dataclass
class RateQuote:
    tenor: str       # "1M","3M","6M","1Y","2Y","5Y","10Y","30Y"
    rate: float      # decimal, e.g. 0.0525 for 5.25%
    instrument: str  # "OIS" | "IRS" | "FRA"
    index: str       # "SOFR" | "EURIBOR" | "SONIA" | "TONAR"


@dataclass
class CurveNode:
    tenor: str
    years: float
    discount_factor: float
    zero_rate: float
    forward_rate: float


@dataclass
class IRCurve:
    index: str
    as_of: date
    nodes: list[CurveNode]

    def discount_factor(self, years: float) -> float:
        """Log-linear interpolation on discount factors."""
        if not self.nodes:
            return 1.0
        if years <= self.nodes[0].years:
            n0 = self.nodes[0]
            return math.exp(math.log(n0.discount_factor) * years / n0.years)
        if years >= self.nodes[-1].years:
            n = self.nodes[-1]
            return math.exp(math.log(n.discount_factor) * years / n.years)
        for i in range(len(self.nodes) - 1):
            n1, n2 = self.nodes[i], self.nodes[i + 1]
            if n1.years <= years <= n2.years:
                w = (years - n1.years) / (n2.years - n1.years)
                log_df = (1 - w) * math.log(n1.discount_factor) + w * math.log(n2.discount_factor)
                return math.exp(log_df)
        return self.nodes[-1].discount_factor


_TENOR_YEARS: dict[str, float] = {
    "1M": 1/12, "3M": 3/12, "6M": 6/12, "9M": 9/12,
    "1Y": 1.0, "2Y": 2.0, "3Y": 3.0, "4Y": 4.0, "5Y": 5.0,
    "7Y": 7.0, "10Y": 10.0, "15Y": 15.0, "20Y": 20.0, "30Y": 30.0,
}


def bootstrap_curve(quotes: list[RateQuote], as_of: date) -> IRCurve:
    """Bootstrap a discount curve from a list of rate quotes.

    Uses simple compounding for short-end (<1Y): df = 1 / (1 + r*t).
    Uses annual compounding for tenors >=1Y: df = 1 / (1 + r)^t.
    Returns nodes sorted by tenor ascending.
    """
    if not quotes:
        return IRCurve(index="UNKNOWN", as_of=as_of, nodes=[])

    index = quotes[0].index
    nodes: list[CurveNode] = []
    prev_df = 1.0
    prev_t = 0.0

    sorted_quotes = sorted(quotes, key=lambda q: _TENOR_YEARS.get(q.tenor, 99.0))

    for q in sorted_quotes:
        t = _TENOR_YEARS.get(q.tenor, 1.0)
        if q.instrument in ("OIS", "FRA") and t < 1.0:
            df = 1.0 / (1.0 + q.rate * t)
        else:
            df = 1.0 / ((1.0 + q.rate) ** t)
        zero_rate = -math.log(df) / t if t > 0 and df > 0 else q.rate
        # Forward rate between prev node and this node
        if t > prev_t and prev_df > 0 and df > 0:
            fwd = (prev_df / df - 1.0) / (t - prev_t)
        else:
            fwd = q.rate
        nodes.append(CurveNode(
            tenor=q.tenor, years=t,
            discount_factor=df, zero_rate=zero_rate, forward_rate=fwd,
        ))
        prev_df = df
        prev_t = t

    return IRCurve(index=index, as_of=as_of, nodes=nodes)
