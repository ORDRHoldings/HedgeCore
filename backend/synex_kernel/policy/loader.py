"""Policy artifact serializer for bootstrap rules."""

from __future__ import annotations

import json

from synex_kernel.policy.enforcer import PolicyRule


def build_rule_row(
    *,
    rule_id: int,
    match_sig: int,
    action_sig: int,
    priority: int,
    budget_cost: int,
    flags: int,
) -> bytes:
    """Serialize one policy rule row."""
    row = {
        "rule_id": rule_id,
        "match_sig": match_sig,
        "action_sig": action_sig,
        "priority": priority,
        "budget_cost": budget_cost,
        "flags": flags,
    }
    return (json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


def build_artifact(*, epoch: int, rules_payload: bytes, rule_count: int) -> bytes:
    """Build a self-describing policy artifact."""
    header = json.dumps({"epoch": epoch, "rule_count": rule_count}, sort_keys=True)
    return (header + "\n").encode("utf-8") + rules_payload


def verify_artifact(artifact: bytes) -> tuple[dict, list[PolicyRule]]:
    """Parse and validate a policy artifact."""
    lines = [line for line in artifact.decode("utf-8").splitlines() if line.strip()]
    if not lines:
        raise ValueError("empty policy artifact")
    header = json.loads(lines[0])
    rules = [PolicyRule(**json.loads(line)) for line in lines[1:]]
    if int(header["rule_count"]) != len(rules):
        raise ValueError("policy artifact rule_count mismatch")
    return header, rules

