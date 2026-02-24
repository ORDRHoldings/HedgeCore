"""A35: Stress Capital Adequacy Engine.

Ensures hedged portfolio remains solvent under compound stress.

Calculations:
    stress_loss = scenario_max_loss (from worst-case selector)
    available_capital = portfolio_equity - margin_required
    capital_buffer_ratio = available_capital / stress_loss
    breach_flag = capital_buffer_ratio < policy.min_capital_ratio

Breach blocks staging submission.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class CapitalAdequacyResult:
    """Capital adequacy assessment."""

    portfolio_equity: float
    margin_required: float
    available_capital: float
    stress_loss: float
    capital_buffer_ratio: float
    min_required_ratio: float
    breach_flag: bool
    headroom_usd: float  # available_capital - (stress_loss ? min_ratio)

    def to_dict(self) -> dict:
        return {
            "portfolio_equity": self.portfolio_equity,
            "margin_required": self.margin_required,
            "available_capital": self.available_capital,
            "stress_loss": self.stress_loss,
            "capital_buffer_ratio": self.capital_buffer_ratio,
            "min_required_ratio": self.min_required_ratio,
            "breach_flag": self.breach_flag,
            "headroom_usd": self.headroom_usd,
        }


def assess_capital_adequacy(
    portfolio_equity: float,
    margin_required: float,
    worst_case_loss: float,
    policy: dict[str, Any],
) -> CapitalAdequacyResult:
    """Assess capital adequacy under stress.

    Parameters
    ----------
    portfolio_equity : float
        Total portfolio equity in USD.
    margin_required : float
        Total margin requirement in USD.
    worst_case_loss : float
        Worst-case scenario loss (absolute value, from worst-case selector).
    policy : dict
        ExtendedPolicyConfig as dict.

    Returns
    -------
    CapitalAdequacyResult
    """
    min_ratio = policy.get("min_capital_ratio", 1.5)

    available = portfolio_equity - margin_required
    stress_loss = abs(worst_case_loss) if worst_case_loss != 0 else 1.0

    buffer_ratio = available / stress_loss if stress_loss > 0 else float("inf")
    breach = buffer_ratio < min_ratio

    headroom = available - (stress_loss * min_ratio)

    return CapitalAdequacyResult(
        portfolio_equity=portfolio_equity,
        margin_required=margin_required,
        available_capital=available,
        stress_loss=stress_loss,
        capital_buffer_ratio=buffer_ratio,
        min_required_ratio=min_ratio,
        breach_flag=breach,
        headroom_usd=headroom,
    )
