"""
Pure-function reconciliation matching engine.

Deterministic. No DB access. No side effects.
Takes bank transactions + candidate settlements/journals as dicts,
returns exact matches. All-or-nothing: ambiguous matches are skipped.
"""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal


def find_matches(
    transactions: list[dict],
    settlements: list[dict],
    journals: list[dict],
) -> list[dict]:
    """Find exact matches between bank transactions and candidates.

    Priority: settlement matches checked first. If a tx matches a settlement,
    journal matching is skipped for that tx.

    Ambiguity: if multiple candidates match on all fields, the tx is skipped
    (no false positives).

    Each settlement/journal can only be matched to one transaction.
    """
    if not transactions:
        return []

    results: list[dict] = []
    used_settlement_ids: set[uuid.UUID] = set()
    used_journal_ids: set[uuid.UUID] = set()

    for tx in transactions:
        tx_amount = tx["amount"]
        tx_currency = tx["currency"]
        tx_date_val = tx["tx_date"]

        # 1. Try settlement match first
        settlement_match = _find_settlement_match(
            tx_amount, tx_currency, tx_date_val,
            settlements, used_settlement_ids,
        )
        if settlement_match:
            results.append({
                "transaction_id": tx["id"],
                "match_type": "SETTLEMENT",
                "matched_id": settlement_match["id"],
                "match_fields": {
                    "amount": tx_amount,
                    "currency": tx_currency,
                    "date": tx_date_val,
                },
            })
            used_settlement_ids.add(settlement_match["id"])
            continue

        # 2. Try journal match
        journal_match = _find_journal_match(
            tx_amount, tx_currency, tx_date_val,
            journals, used_journal_ids,
        )
        if journal_match:
            results.append({
                "transaction_id": tx["id"],
                "match_type": "JOURNAL",
                "matched_id": journal_match["id"],
                "match_fields": {
                    "amount": tx_amount,
                    "currency": tx_currency,
                    "date": tx_date_val,
                },
            })
            used_journal_ids.add(journal_match["id"])

    return results


def _find_settlement_match(
    amount: Decimal,
    currency: str,
    tx_date: date,
    settlements: list[dict],
    used_ids: set[uuid.UUID],
) -> dict | None:
    """Find exactly one settlement matching amount + currency + date."""
    candidates = []
    for se in settlements:
        if se["id"] in used_ids:
            continue
        if se["settlement_amount"] != amount:
            continue
        if se["currency"] != currency:
            continue
        # Match on settlement_date OR value_date
        if tx_date != se["settlement_date"] and tx_date != se.get("value_date"):
            continue
        candidates.append(se)

    # Exact single match only — ambiguity → skip
    if len(candidates) == 1:
        return candidates[0]
    return None


def _find_journal_match(
    amount: Decimal,
    currency: str,
    tx_date: date,
    journals: list[dict],
    used_ids: set[uuid.UUID],
) -> dict | None:
    """Find exactly one journal entry matching amount + currency + date."""
    candidates = []
    for je in journals:
        if je["id"] in used_ids:
            continue
        if je["amount"] != amount:
            continue
        if je["currency"] != currency:
            continue
        if tx_date != je["period_date"]:
            continue
        candidates.append(je)

    if len(candidates) == 1:
        return candidates[0]
    return None
