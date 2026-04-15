# backend/app/services/netting_engine.py
"""
Pure-function intercompany netting engine.

Deterministic. No DB access. No side effects.
Takes obligations → returns netting proposals.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import UUID


def compute_netting(
    obligations: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Compute bilateral netting proposals from a list of obligations.

    Algorithm:
    1. Group obligations by currency
    2. Within each currency, group by bilateral pair (normalized: sorted tuple of entity IDs)
    3. For each pair+currency, compute gross amounts each direction, net, and savings
    4. Skip pairs where savings == 0 (no netting benefit)

    Args:
        obligations: list of dicts with keys: id, debtor_entity_id, creditor_entity_id, amount, currency

    Returns:
        List of proposal dicts with keys: entity_a_id, entity_b_id, currency,
        gross_payable, gross_receivable, net_amount, net_direction, savings, obligation_ids
    """
    if not obligations:
        return []

    # Step 1+2: Group by (currency, bilateral pair)
    groups: dict[tuple[str, UUID, UUID], list[dict[str, Any]]] = {}
    for obl in obligations:
        ccy = obl["currency"]
        pair = tuple(sorted([obl["debtor_entity_id"], obl["creditor_entity_id"]]))
        key = (ccy, pair[0], pair[1])
        groups.setdefault(key, []).append(obl)

    # Step 3: Compute netting for each group
    proposals: list[dict[str, Any]] = []
    for (ccy, entity_a, entity_b), group_obls in groups.items():
        gross_a_to_b = Decimal("0")
        gross_b_to_a = Decimal("0")
        obligation_ids = []

        for obl in group_obls:
            amount = Decimal(str(obl["amount"]))
            obligation_ids.append(obl["id"])
            if obl["debtor_entity_id"] == entity_a:
                gross_a_to_b += amount
            else:
                gross_b_to_a += amount

        savings = min(gross_a_to_b, gross_b_to_a)

        # Step 4: Skip if no savings
        if savings == Decimal("0"):
            continue

        net_amount = abs(gross_a_to_b - gross_b_to_a)
        net_direction = "A2B" if gross_a_to_b > gross_b_to_a else "B2A"

        proposals.append({
            "entity_a_id": entity_a,
            "entity_b_id": entity_b,
            "currency": ccy,
            "gross_payable": gross_a_to_b,
            "gross_receivable": gross_b_to_a,
            "net_amount": net_amount,
            "net_direction": net_direction,
            "savings": savings,
            "obligation_ids": obligation_ids,
        })

    return proposals
