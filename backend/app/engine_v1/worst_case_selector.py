"""A38: Cross-Scenario Worst-Case Selector.

Identifies worst-case loss across all 9+ scenarios (4 sigma + 5 institutional + compound).

Outputs:
- worst_case_loss
- worst_case_scenario_name
- pre_hedge_worst_case
- post_hedge_worst_case
- delta_improvement

Mandatory in: ImpactPreview, FreezeArtifact, Replay comparison.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ScenarioLoss:
    """Loss for a single scenario."""

    scenario_name: str
    pre_hedge_loss: float
    post_hedge_loss: float
    improvement: float

    def to_dict(self) -> dict:
        return {
            "scenario_name": self.scenario_name,
            "pre_hedge_loss": self.pre_hedge_loss,
            "post_hedge_loss": self.post_hedge_loss,
            "improvement": self.improvement,
        }


@dataclass
class WorstCaseResult:
    """Worst-case scenario analysis."""

    worst_case_scenario: str = ""
    worst_case_loss: float = 0.0
    pre_hedge_worst_case: float = 0.0
    post_hedge_worst_case: float = 0.0
    delta_improvement: float = 0.0
    all_scenarios: list[ScenarioLoss] = field(default_factory=list)
    scenario_count: int = 0

    def to_dict(self) -> dict:
        return {
            "worst_case_scenario": self.worst_case_scenario,
            "worst_case_loss": self.worst_case_loss,
            "pre_hedge_worst_case": self.pre_hedge_worst_case,
            "post_hedge_worst_case": self.post_hedge_worst_case,
            "delta_improvement": self.delta_improvement,
            "all_scenarios": [s.to_dict() for s in self.all_scenarios],
            "scenario_count": self.scenario_count,
        }


def select_worst_case(
    base_scenario_results: dict[str, Any],
    extended_scenario_results: dict[str, Any],
) -> WorstCaseResult:
    """Identify worst-case loss across all scenarios.

    Parameters
    ----------
    base_scenario_results : dict
        Results from original 4 sigma scenarios.
        Expected: {"per_bucket": [...], "totals": {"pre_hedge_total": ..., ...}, ...}
        Or list of scenario impacts.
    extended_scenario_results : dict
        Results from extended scenarios (A17).
        Expected: {"scenarios": [...], ...}

    Returns
    -------
    WorstCaseResult
    """
    all_losses: list[ScenarioLoss] = []

    # Process base scenarios (4 sigma shocks)
    if isinstance(base_scenario_results, dict):
        # Check for per_bucket format from original engine
        per_bucket = base_scenario_results.get("per_bucket", [])
        if per_bucket:
            for bucket_scenario in per_bucket:
                name = bucket_scenario.get("bucket", "sigma_scenario")
                shocks = bucket_scenario.get("shocks", [])
                for shock in shocks:
                    shock_name = f"{name}_{shock.get('shock', 0)}"
                    pre_loss = (
                        shock.get("pre_hedge_usd", 0.0) or
                        shock.get("pre_hedge_local", 0.0) or
                        shock.get("pre_hedge_mxn", 0.0) or 0.0
                    )
                    post_loss = (
                        shock.get("post_hedge_usd", 0.0) or
                        shock.get("post_hedge_local", 0.0) or
                        shock.get("post_hedge_mxn", 0.0) or 0.0
                    )
                    improvement = abs(pre_loss) - abs(post_loss)
                    all_losses.append(ScenarioLoss(
                        scenario_name=shock_name,
                        pre_hedge_loss=pre_loss,
                        post_hedge_loss=post_loss,
                        improvement=improvement,
                    ))

        # Also check totals (may be a list of ScenarioTotalResult dicts or a dict)
        totals = base_scenario_results.get("totals", [])
        if isinstance(totals, list):
            for entry in totals:
                if isinstance(entry, dict):
                    sigma = entry.get("sigma", 0.0)
                    pre_loss = entry.get("total_unhedged_usd", 0.0)
                    post_loss = entry.get("total_hedged_usd", 0.0)
                    improvement = abs(pre_loss) - abs(post_loss)
                    all_losses.append(ScenarioLoss(
                        scenario_name=f"sigma_{sigma}",
                        pre_hedge_loss=pre_loss,
                        post_hedge_loss=post_loss,
                        improvement=improvement,
                    ))
        elif isinstance(totals, dict):
            for shock_key, impact in totals.items():
                if isinstance(impact, dict):
                    all_losses.append(ScenarioLoss(
                        scenario_name=f"sigma_{shock_key}",
                        pre_hedge_loss=impact.get("pre_hedge_usd", 0.0) or impact.get("pre_hedge_mxn", 0.0) or 0.0,
                        post_hedge_loss=impact.get("post_hedge_usd", 0.0) or impact.get("post_hedge_mxn", 0.0) or 0.0,
                        improvement=abs(impact.get("pre_hedge_usd", 0.0) or impact.get("pre_hedge_mxn", 0.0) or 0.0) -
                                    abs(impact.get("post_hedge_usd", 0.0) or impact.get("post_hedge_mxn", 0.0) or 0.0),
                    ))

    # Process extended scenarios
    if isinstance(extended_scenario_results, dict):
        scenarios = extended_scenario_results.get("scenarios", [])
        for scenario in scenarios:
            name = scenario.get("scenario_name", "unknown")
            pre_loss = scenario.get("pre_hedge_loss_usd", 0.0)
            post_loss = scenario.get("post_hedge_loss_usd", 0.0)
            improvement = abs(pre_loss) - abs(post_loss)
            all_losses.append(ScenarioLoss(
                scenario_name=name,
                pre_hedge_loss=pre_loss,
                post_hedge_loss=post_loss,
                improvement=improvement,
            ))

    if not all_losses:
        return WorstCaseResult()

    # Worst case = largest absolute post-hedge loss
    worst = min(all_losses, key=lambda s: s.post_hedge_loss)
    # Pre-hedge worst
    pre_worst = min(all_losses, key=lambda s: s.pre_hedge_loss)

    return WorstCaseResult(
        worst_case_scenario=worst.scenario_name,
        worst_case_loss=worst.post_hedge_loss,
        pre_hedge_worst_case=pre_worst.pre_hedge_loss,
        post_hedge_worst_case=worst.post_hedge_loss,
        delta_improvement=abs(pre_worst.pre_hedge_loss) - abs(worst.post_hedge_loss),
        all_scenarios=all_losses,
        scenario_count=len(all_losses),
    )
