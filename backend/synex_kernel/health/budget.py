"""Budget tracking for governance checks."""

from __future__ import annotations


class BudgetExhaustedError(RuntimeError):
    """Raised when a governance epoch has no remaining budget."""


class BudgetTracker:
    """Simple in-memory epoch budget tracker."""

    def __init__(self, epoch_budget: int):
        self.total = int(epoch_budget)
        self.remaining = int(epoch_budget)

    def consume(self, amount: int) -> None:
        cost = max(0, int(amount))
        if cost > self.remaining:
            raise BudgetExhaustedError("Governance budget exhausted")
        self.remaining -= cost

    def reset(self) -> None:
        self.remaining = self.total

