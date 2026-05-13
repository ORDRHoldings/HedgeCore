"""Policy rule evaluator."""

from __future__ import annotations

from dataclasses import dataclass

from synex_kernel.constants import FLAG_ENABLED


@dataclass(frozen=True)
class PolicyRule:
    rule_id: int
    match_sig: int
    action_sig: int
    priority: int
    budget_cost: int
    flags: int


class PolicyEnforcer:
    """Evaluates exact-match policy signatures."""

    def __init__(self, rules: list[PolicyRule]):
        self.rules = sorted(rules, key=lambda rule: rule.priority)
        self.rule_count = len(rules)

    def evaluate(self, match_sig: int) -> PolicyRule | None:
        enabled = [rule for rule in self.rules if rule.flags & FLAG_ENABLED]
        for rule in enabled:
            if rule.match_sig == match_sig:
                return rule
        default_rules = [rule for rule in enabled if rule.priority >= 100]
        return default_rules[-1] if default_rules else None
