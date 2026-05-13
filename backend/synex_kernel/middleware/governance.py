"""Governance context used by TreasuryFX middleware."""

from __future__ import annotations

from synex_kernel.health.budget import BudgetTracker
from synex_kernel.health.kill_switch import KillSwitchReceiver


class GovernanceContext:
    """Coordinates policy, budget, and kill switch checks."""

    def __init__(
        self,
        *,
        limb_id: str,
        enforcer,
        budget: BudgetTracker,
        kill_switch: KillSwitchReceiver,
    ):
        self.limb_id = limb_id
        self.enforcer = enforcer
        self.budget = budget
        self.kill_switch = kill_switch

    def check_all(self, *, match_sig: int | None = None, budget_cost: int = 0) -> None:
        self.kill_switch.check()
        cost = budget_cost
        if match_sig is not None and self.enforcer is not None:
            rule = self.enforcer.evaluate(match_sig)
            if rule is not None and budget_cost <= 0:
                cost = rule.budget_cost
        self.budget.consume(cost)

