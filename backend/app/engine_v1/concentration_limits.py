"""A37: Hedge Concentration Limits.

Prevents over-concentration in single instrument/counterparty.

Rule:
    if hedge_notional_per_instrument > policy.max_instrument_concentration:
        add R6 POLICY_WARNING in waterfall
    if breach > hard_threshold (2? limit):
        block STAGING

Pure computational -- threshold injectable via PolicyConfig.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ConcentrationCheck:
    """Concentration check for a single instrument."""

    instrument: str
    notional_usd: float
    total_portfolio_usd: float
    concentration_pct: float
    limit_pct: float
    status: str  # "OK", "WARNING", "BREACH"
    excess_pct: float

    def to_dict(self) -> dict:
        return {
            "instrument": self.instrument,
            "notional_usd": self.notional_usd,
            "total_portfolio_usd": self.total_portfolio_usd,
            "concentration_pct": self.concentration_pct,
            "limit_pct": self.limit_pct,
            "status": self.status,
            "excess_pct": self.excess_pct,
        }


@dataclass
class ConcentrationResult:
    """Portfolio concentration analysis."""

    checks: list[ConcentrationCheck] = field(default_factory=list)
    has_warnings: bool = False
    has_breaches: bool = False
    max_concentration_pct: float = 0.0
    breach_instruments: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "checks": [c.to_dict() for c in self.checks],
            "has_warnings": self.has_warnings,
            "has_breaches": self.has_breaches,
            "max_concentration_pct": self.max_concentration_pct,
            "breach_instruments": self.breach_instruments,
        }

    def get_concentration_data(self) -> dict[str, float]:
        """Get instrument -> concentration_pct mapping for margin attribution."""
        return {c.instrument: c.concentration_pct for c in self.checks}


def check_concentration_limits(
    hedge_actions: list[dict],
    policy: dict[str, Any],
) -> ConcentrationResult:
    """Check hedge concentration limits.

    Parameters
    ----------
    hedge_actions : list[dict]
        Hedge actions with instrument, action_usd/notional_usd.
    policy : dict
        ExtendedPolicyConfig as dict. Uses 'max_instrument_concentration_pct'.

    Returns
    -------
    ConcentrationResult
    """
    max_conc = policy.get("max_instrument_concentration_pct", 0.25)
    hard_threshold = max_conc * 2.0  # 2? limit = hard breach

    # Aggregate by instrument
    instrument_totals: dict[str, float] = {}
    for action in hedge_actions:
        instrument = action.get("instrument", action.get("pair", "UNKNOWN"))
        notional = abs(action.get("action_usd", action.get("notional_usd", 0.0)))
        instrument_totals[instrument] = instrument_totals.get(instrument, 0.0) + notional

    total_portfolio = sum(instrument_totals.values())
    if total_portfolio < 1.0:
        return ConcentrationResult()

    checks: list[ConcentrationCheck] = []
    has_warnings = False
    has_breaches = False
    max_pct = 0.0
    breaches: list[str] = []

    for instrument, notional in instrument_totals.items():
        conc_pct = notional / total_portfolio
        max_pct = max(max_pct, conc_pct)
        excess = max(0.0, conc_pct - max_conc)

        if conc_pct > hard_threshold:
            status = "BREACH"
            has_breaches = True
            breaches.append(instrument)
        elif conc_pct > max_conc:
            status = "WARNING"
            has_warnings = True
        else:
            status = "OK"

        checks.append(ConcentrationCheck(
            instrument=instrument,
            notional_usd=notional,
            total_portfolio_usd=total_portfolio,
            concentration_pct=conc_pct,
            limit_pct=max_conc,
            status=status,
            excess_pct=excess,
        ))

    return ConcentrationResult(
        checks=checks,
        has_warnings=has_warnings,
        has_breaches=has_breaches,
        max_concentration_pct=max_pct,
        breach_instruments=breaches,
    )
