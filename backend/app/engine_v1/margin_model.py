"""A11: Margin & Funding Cost Engine.

Calculates margin requirements and funding costs for hedge positions.

Pure computational -- accepts injectable margin rates via ExtendedMarketSnapshot.
Enforces margin budget constraint when configured.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class PositionMargin:
    """Margin breakdown for a single position."""

    bucket: str
    instrument: str
    notional_usd: float
    initial_margin: float
    maintenance_margin: float
    stress_margin: float
    funding_cost: float

    def to_dict(self) -> dict:
        return {
            "bucket": self.bucket,
            "instrument": self.instrument,
            "notional_usd": self.notional_usd,
            "initial_margin": self.initial_margin,
            "maintenance_margin": self.maintenance_margin,
            "stress_margin": self.stress_margin,
            "funding_cost": self.funding_cost,
        }


@dataclass
class MarginSummary:
    """Portfolio-level margin summary."""

    positions: list[PositionMargin] = field(default_factory=list)
    total_initial_margin: float = 0.0
    total_maintenance_margin: float = 0.0
    total_stress_margin: float = 0.0
    total_funding_cost: float = 0.0
    margin_budget_usd: float | None = None
    margin_utilization_pct: float = 0.0
    budget_exceeded: bool = False

    def to_dict(self) -> dict:
        return {
            "positions": [p.to_dict() for p in self.positions],
            "total_initial_margin": self.total_initial_margin,
            "total_maintenance_margin": self.total_maintenance_margin,
            "total_stress_margin": self.total_stress_margin,
            "total_funding_cost": self.total_funding_cost,
            "margin_budget_usd": self.margin_budget_usd,
            "margin_utilization_pct": self.margin_utilization_pct,
            "budget_exceeded": self.budget_exceeded,
        }


# ---------------------------------------------------------------------------
# Default margin rates (overridden by market.margin_rates)
# ---------------------------------------------------------------------------

_DEFAULT_MARGIN_RATES: dict[str, dict[str, float]] = {
    "FWD": {"initial": 0.03, "maintenance": 0.02},
    "NDF": {"initial": 0.02, "maintenance": 0.015},
}

_DEFAULT_STRESS_MULTIPLIER = 1.5


def compute_margin(
    hedge_actions: list[dict],
    market: dict[str, Any],
    policy: dict[str, Any],
    scenario_max_shock: float = 0.10,
) -> MarginSummary:
    """Calculate margin requirements and funding costs for hedge positions.

    Parameters
    ----------
    hedge_actions : list[dict]
        Per-bucket hedge actions from kernel. Each has 'bucket', 'action_usd',
        and optionally 'instrument'.
    market : dict
        ExtendedMarketSnapshot as dict.
    policy : dict
        ExtendedPolicyConfig as dict.
    scenario_max_shock : float
        Maximum scenario shock (for stress margin calculation).

    Returns
    -------
    MarginSummary
    """
    margin_rates = market.get("margin_rates", _DEFAULT_MARGIN_RATES)
    funding_rate_bps = market.get("funding_rate_bps", 0.0)
    margin_budget = policy.get("margin_budget_usd")

    execution_product = policy.get("execution_product", "FWD")
    positions: list[PositionMargin] = []

    for action in hedge_actions:
        bucket = action.get("bucket", "unknown")
        notional = abs(action.get("action_usd", 0.0))
        instrument = action.get("instrument", execution_product)

        if notional < 1.0:
            continue

        rates = margin_rates.get(instrument, margin_rates.get("FWD", _DEFAULT_MARGIN_RATES["FWD"]))
        initial_pct = rates.get("initial", 0.03)
        maintenance_pct = rates.get("maintenance", 0.02)

        initial_margin = notional * initial_pct
        maintenance_margin = notional * maintenance_pct
        stress_margin = initial_margin * _DEFAULT_STRESS_MULTIPLIER

        # Funding cost: margin ? (funding_rate / 10000) ? (days / 360)
        # Estimate 90 days for average position
        days = _estimate_days(bucket)
        funding_cost = initial_margin * (funding_rate_bps / 10000.0) * (days / 360.0)

        positions.append(PositionMargin(
            bucket=bucket,
            instrument=instrument,
            notional_usd=notional,
            initial_margin=initial_margin,
            maintenance_margin=maintenance_margin,
            stress_margin=stress_margin,
            funding_cost=funding_cost,
        ))

    total_initial = sum(p.initial_margin for p in positions)
    total_maintenance = sum(p.maintenance_margin for p in positions)
    total_stress = sum(p.stress_margin for p in positions)
    total_funding = sum(p.funding_cost for p in positions)

    utilization = 0.0
    exceeded = False
    if margin_budget and margin_budget > 0:
        utilization = (total_initial / margin_budget) * 100.0
        exceeded = total_initial > margin_budget

    return MarginSummary(
        positions=positions,
        total_initial_margin=total_initial,
        total_maintenance_margin=total_maintenance,
        total_stress_margin=total_stress,
        total_funding_cost=total_funding,
        margin_budget_usd=margin_budget,
        margin_utilization_pct=utilization,
        budget_exceeded=exceeded,
    )


def _estimate_days(bucket: str) -> int:
    """Estimate days to maturity from bucket string (YYYY-MM)."""
    try:
        parts = bucket.split("-")
        if len(parts) >= 2:
            month = int(parts[1])
            return max(30, month * 30)
        return 90
    except (ValueError, IndexError):
        return 90
