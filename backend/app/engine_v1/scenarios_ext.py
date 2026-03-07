"""A17 + A30: Extended Scenarios Engine.

Adds 5 institutional scenario families alongside existing 4 sigma shocks.
A30 extends with compound stress (cross-shock correlation).

Original 4 sigmas always run (backward compat). New scenarios enabled via policy.enabled_scenarios.
Pure computational -- deterministic, no stochastic behavior.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ScenarioShock:
    """A single scenario definition with compound shocks."""

    name: str
    fx_shock: float = 0.0        # e.g., -0.10 = -10%
    rate_shock_bps: float = 0.0  # e.g., 200 = +200bps
    vol_shock: float = 0.0       # e.g., 0.20 = +20%
    margin_shock: float = 0.0    # e.g., 0.50 = +50%
    adv_shock: float = 0.0       # e.g., -0.40 = -40% ADV
    family: str = "institutional"

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "fx_shock": self.fx_shock,
            "rate_shock_bps": self.rate_shock_bps,
            "vol_shock": self.vol_shock,
            "margin_shock": self.margin_shock,
            "adv_shock": self.adv_shock,
            "family": self.family,
        }


@dataclass
class ScenarioImpact:
    """Impact of a scenario on the portfolio."""

    scenario_name: str
    pre_hedge_loss_usd: float
    post_hedge_loss_usd: float
    hedge_effectiveness: float  # (pre - post) / pre
    margin_impact_usd: float
    liquidity_impact_pct: float
    details: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "scenario_name": self.scenario_name,
            "pre_hedge_loss_usd": self.pre_hedge_loss_usd,
            "post_hedge_loss_usd": self.post_hedge_loss_usd,
            "hedge_effectiveness": self.hedge_effectiveness,
            "margin_impact_usd": self.margin_impact_usd,
            "liquidity_impact_pct": self.liquidity_impact_pct,
            "details": self.details,
        }


@dataclass
class ExtendedScenarioResult:
    """Full scenario analysis result."""

    scenarios: list[ScenarioImpact] = field(default_factory=list)
    worst_case_scenario: str = ""
    worst_case_loss_usd: float = 0.0
    scenario_count: int = 0
    compound_scenarios_included: bool = False

    def to_dict(self) -> dict:
        return {
            "scenarios": [s.to_dict() for s in self.scenarios],
            "worst_case_scenario": self.worst_case_scenario,
            "worst_case_loss_usd": self.worst_case_loss_usd,
            "scenario_count": self.scenario_count,
            "compound_scenarios_included": self.compound_scenarios_included,
        }


# ---------------------------------------------------------------------------
# Scenario definitions
# ---------------------------------------------------------------------------

INSTITUTIONAL_SCENARIOS: dict[str, ScenarioShock] = {
    "vol_crush": ScenarioShock(
        name="Vol Crush",
        vol_shock=-0.30,
        family="institutional",
    ),
    "slow_bleed": ScenarioShock(
        name="Slow Bleed (20-day)",
        fx_shock=-0.10,  # -0.5%/day ? 20
        vol_shock=0.10,
        family="institutional",
    ),
    "margin_compression": ScenarioShock(
        name="Margin Compression",
        margin_shock=0.50,
        family="institutional",
    ),
    "regime_shift": ScenarioShock(
        name="Regime Shift",
        fx_shock=-0.10,
        rate_shock_bps=200.0,
        vol_shock=0.20,
        margin_shock=0.25,
        family="compound",
    ),
    "funding_squeeze": ScenarioShock(
        name="Funding Squeeze",
        fx_shock=-0.05,
        rate_shock_bps=300.0,
        vol_shock=0.15,
        margin_shock=1.00,
        adv_shock=-0.40,
        family="compound",
    ),
}


def get_enabled_scenarios(
    policy: dict[str, Any],
) -> list[ScenarioShock]:
    """Get list of enabled institutional scenarios based on policy.

    Parameters
    ----------
    policy : dict
        ExtendedPolicyConfig as dict. Uses 'enabled_scenarios'.

    Returns
    -------
    list[ScenarioShock]
        Enabled scenarios (always includes standard if requested).
    """
    enabled_names: list[str] = policy.get("enabled_scenarios", [])
    if not enabled_names:
        return []

    scenarios = []
    for name in enabled_names:
        key = name.lower().replace(" ", "_").replace("-", "_")
        if key in INSTITUTIONAL_SCENARIOS:
            scenarios.append(INSTITUTIONAL_SCENARIOS[key])

    return scenarios


def apply_extended_scenarios(
    exposure_usd: float,
    hedge_notional_usd: float,
    market: dict[str, Any],
    policy: dict[str, Any],
    margin_total: float = 0.0,
    duration_fraction: float | None = None,
    position_durations: list[dict] | None = None,  # FIX-02: per-position duration data
) -> ExtendedScenarioResult:
    """Run extended scenario analysis.

    Parameters
    ----------
    exposure_usd : float
        Gross exposure in USD.
    hedge_notional_usd : float
        Total hedge notional in USD.
    market : dict
        ExtendedMarketSnapshot as dict.
    policy : dict
        ExtendedPolicyConfig as dict.
    margin_total : float
        Current total margin requirement.

    Returns
    -------
    ExtendedScenarioResult
    """
    scenarios = get_enabled_scenarios(policy)
    if not scenarios:
        return ExtendedScenarioResult()

    spot = market.get("spot_rate", market.get("spot_usdmxn", 17.15))
    impacts: list[ScenarioImpact] = []
    has_compound = False

    for scenario in scenarios:
        if scenario.family == "compound":
            has_compound = True

        # Pre-hedge loss: exposure ? FX shock
        pre_hedge_loss = exposure_usd * scenario.fx_shock if scenario.fx_shock != 0 else 0.0

        # Post-hedge loss: net exposure ? FX shock
        net_exposure = exposure_usd - hedge_notional_usd
        post_hedge_loss = net_exposure * scenario.fx_shock if scenario.fx_shock != 0 else 0.0

        # Rate shock impact (carry cost change)
        rate_impact = 0.0
        if scenario.rate_shock_bps != 0:
            # FIX-02: use actual weighted-average duration if position_durations provided
            if position_durations and len(position_durations) > 0:
                total_notional = sum(abs(p.get("notional_usd", 0)) for p in position_durations)
                if total_notional > 0:
                    weighted_duration = sum(
                        abs(p.get("notional_usd", 0)) * p.get("duration_years", 0.25)
                        for p in position_durations
                    ) / total_notional
                else:
                    weighted_duration = duration_fraction if duration_fraction is not None else 0.25
            elif duration_fraction is not None:
                weighted_duration = duration_fraction  # Legacy: explicit fraction
            else:
                weighted_duration = 0.25  # Conservative fallback
            rate_impact = hedge_notional_usd * (scenario.rate_shock_bps / 10000.0) * weighted_duration

        # Add rate impact to losses (rate shocks always amplify loss magnitude)
        pre_hedge_loss -= abs(rate_impact) * 0.5  # FIX-02: rate shock increases loss
        post_hedge_loss -= abs(rate_impact)        # FIX-02: longer duration = larger impact

        # Margin impact
        margin_impact = margin_total * scenario.margin_shock if scenario.margin_shock else 0.0

        # Liquidity impact
        liquidity_pct = abs(scenario.adv_shock) * 100 if scenario.adv_shock else 0.0

        # Hedge effectiveness
        effectiveness = 0.0
        if abs(pre_hedge_loss) > 0:
            effectiveness = (abs(pre_hedge_loss) - abs(post_hedge_loss)) / abs(pre_hedge_loss)
            effectiveness = max(0.0, min(1.0, effectiveness))

        impacts.append(ScenarioImpact(
            scenario_name=scenario.name,
            pre_hedge_loss_usd=pre_hedge_loss,
            post_hedge_loss_usd=post_hedge_loss,
            hedge_effectiveness=effectiveness,
            margin_impact_usd=margin_impact,
            liquidity_impact_pct=liquidity_pct,
            details=scenario.to_dict(),
        ))

    # Find worst case (largest absolute post-hedge loss)
    worst = min(impacts, key=lambda i: i.post_hedge_loss_usd) if impacts else None

    return ExtendedScenarioResult(
        scenarios=impacts,
        worst_case_scenario=worst.scenario_name if worst else "",
        worst_case_loss_usd=worst.post_hedge_loss_usd if worst else 0.0,
        scenario_count=len(impacts),
        compound_scenarios_included=has_compound,
    )

def compute_position_durations(
    hedge_actions: list[dict],
    as_of_date: str | None = None,
) -> list[dict]:
    """Compute duration_years for each position from value_date.

    FIX-02: Replaces flat 0.25 year assumption with actual tenor-derived duration.

    Parameters
    ----------
    hedge_actions : list[dict]
        Positions with 'value_date' (YYYY-MM-DD or YYYY-MM) and 'action_usd'
        or 'notional_usd'.
    as_of_date : str
        Reference date (YYYY-MM-DD). Defaults to today.

    Returns
    -------
    list[dict]
        Each with 'bucket', 'notional_usd', 'duration_years', 'days_to_maturity'.
    """
    from datetime import date, datetime

    if as_of_date:
        try:
            ref = datetime.strptime(as_of_date[:10], "%Y-%m-%d").date()
        except ValueError:
            ref = date.today()
    else:
        ref = date.today()

    results = []
    for action in hedge_actions:
        notional = abs(action.get("action_usd", action.get("notional_usd", 0.0)))
        vd = action.get("value_date", "")

        if isinstance(vd, date):
            maturity_date = vd
        elif isinstance(vd, str) and len(vd) >= 7:
            try:
                if len(vd) == 7:  # YYYY-MM
                    maturity_date = datetime.strptime(vd + "-15", "%Y-%m-%d").date()
                else:
                    maturity_date = datetime.strptime(vd[:10], "%Y-%m-%d").date()
            except ValueError:
                maturity_date = ref
        else:
            maturity_date = ref

        days = max((maturity_date - ref).days, 1)
        duration_years = days / 365.25

        results.append({
            "bucket": action.get("bucket", ""),
            "notional_usd": notional,
            "duration_years": duration_years,
            "days_to_maturity": days,
        })

    return results
