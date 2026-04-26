"""
Reconciliation service — orchestrates matching of bank transactions
against settlement events and journal entries.
"""
from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bank_statement import BankTransaction
from app.models.cash import CashAuditEventType
from app.models.journal_entry import JournalEntry
from app.models.settlement_event import SettlementEvent
from app.services.cash_audit_service import append_event
from app.services.reconciliation_engine import find_matches


async def run_reconciliation(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    account_id: uuid.UUID | None = None,
    performed_by: uuid.UUID,
) -> dict[str, Any]:
    """Load unmatched txs, load candidates, run engine, persist matches, audit."""
    # 1. Load UNMATCHED bank transactions
    tx_query = select(BankTransaction).where(
        BankTransaction.company_id == company_id,
        BankTransaction.reconciliation_status == "UNMATCHED",
    )
    if account_id:
        tx_query = tx_query.where(BankTransaction.account_id == account_id)

    tx_result = await session.execute(tx_query)
    unmatched_txs = list(tx_result.scalars().all())

    if not unmatched_txs:
        return {"matched_count": 0, "exception_count": 0, "unmatched_remaining": 0}

    # Date range for candidate loading
    tx_dates = [tx.tx_date for tx in unmatched_txs]
    date_min = min(tx_dates) - timedelta(days=7)
    date_max = max(tx_dates) + timedelta(days=7)

    # 2. Load settlement candidates (with currency resolved via JournalEntry)
    se_query = (
        select(
            SettlementEvent.id,
            SettlementEvent.settlement_amount,
            SettlementEvent.settlement_date,
            SettlementEvent.value_date,
            SettlementEvent.settlement_ref,
            JournalEntry.currency,
        )
        .join(JournalEntry, JournalEntry.settlement_event_id == SettlementEvent.id)
        .where(
            SettlementEvent.company_id == company_id,
            SettlementEvent.settlement_date >= date_min,
            SettlementEvent.settlement_date <= date_max,
        )
    )
    se_result = await session.execute(se_query)
    settlement_rows = se_result.all()

    settlements = [
        {
            "id": row.id,
            "settlement_amount": row.settlement_amount,
            "currency": row.currency,
            "settlement_date": row.settlement_date,
            "value_date": row.value_date,
            "settlement_ref": row.settlement_ref,
        }
        for row in settlement_rows
    ]

    # 3. Load journal entry candidates (not already matched)
    je_query = (
        select(JournalEntry)
        .where(
            JournalEntry.company_id == company_id,
            JournalEntry.period_date >= date_min,
            JournalEntry.period_date <= date_max,
            JournalEntry.settlement_event_id.is_(None),
        )
    )
    je_result = await session.execute(je_query)
    journal_entries = list(je_result.scalars().all())

    journals = [
        {
            "id": je.id,
            "amount": je.amount,
            "currency": je.currency,
            "period_date": je.period_date,
            "description": je.description,
        }
        for je in journal_entries
    ]

    # 4. Build transaction dicts
    tx_dicts = [
        {
            "id": tx.id,
            "amount": Decimal(str(tx.amount)),
            "currency": tx.currency,
            "tx_date": tx.tx_date,
            "value_date": tx.value_date,
            "direction": tx.direction,
            "reference": tx.reference or "",
        }
        for tx in unmatched_txs
    ]

    # 5. Run engine
    matches = find_matches(tx_dicts, settlements, journals)

    # 6. Apply matches
    tx_by_id = {tx.id: tx for tx in unmatched_txs}
    matched_count = 0
    for match in matches:
        tx = tx_by_id.get(match["transaction_id"])
        if not tx:
            continue
        if match["match_type"] == "SETTLEMENT":
            tx.matched_settlement_id = match["matched_id"]
        else:
            tx.matched_journal_id = match["matched_id"]
        tx.reconciliation_status = "MATCHED"
        matched_count += 1

    await session.flush()

    # 7. Audit log
    unmatched_remaining = len(unmatched_txs) - matched_count
    await append_event(
        session, company_id=company_id,
        event_type=CashAuditEventType.RECONCILIATION_RUN,
        payload={
            "matched_count": matched_count,
            "unmatched_remaining": unmatched_remaining,
            "settlement_candidates": len(settlements),
            "journal_candidates": len(journals),
        },
        performed_by=performed_by,
    )

    return {
        "matched_count": matched_count,
        "exception_count": 0,
        "unmatched_remaining": unmatched_remaining,
    }


async def get_reconciliation_summary(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
) -> dict[str, Any]:
    """Aggregate reconciliation stats for a company."""
    result = await session.execute(
        select(
            func.count().label("total"),
            func.count().filter(BankTransaction.reconciliation_status == "MATCHED").label("matched"),
            func.count().filter(BankTransaction.reconciliation_status == "UNMATCHED").label("unmatched"),
            func.count().filter(BankTransaction.reconciliation_status == "EXCEPTION").label("exceptions"),
        ).where(BankTransaction.company_id == company_id)
    )
    row = result.one()
    total = row.total or 0
    matched = row.matched or 0
    unmatched = row.unmatched or 0
    exceptions = row.exceptions or 0
    rate = Decimal(str(matched * 100 / total)) if total > 0 else Decimal("0")

    return {
        "total_transactions": total,
        "matched": matched,
        "unmatched": unmatched,
        "exceptions": exceptions,
        "match_rate_pct": round(rate, 2),
    }


async def manual_match(
    session: AsyncSession,
    *,
    transaction_id: uuid.UUID,
    company_id: uuid.UUID,
    match_type: str,
    matched_id: uuid.UUID,
    performed_by: uuid.UUID,
) -> None:
    """Manually match a single bank transaction."""
    tx = await _get_transaction(session, transaction_id, company_id)

    if match_type == "SETTLEMENT":
        tx.matched_settlement_id = matched_id
    elif match_type == "JOURNAL":
        tx.matched_journal_id = matched_id
    else:
        raise HTTPException(status_code=400, detail="match_type must be SETTLEMENT or JOURNAL")

    tx.reconciliation_status = "MATCHED"
    await session.flush()


async def mark_exception(
    session: AsyncSession,
    *,
    transaction_id: uuid.UUID,
    company_id: uuid.UUID,
    performed_by: uuid.UUID,
) -> None:
    """Flag a transaction as EXCEPTION for manual review."""
    tx = await _get_transaction(session, transaction_id, company_id)
    tx.reconciliation_status = "EXCEPTION"
    await session.flush()


async def unmatch(
    session: AsyncSession,
    *,
    transaction_id: uuid.UUID,
    company_id: uuid.UUID,
    performed_by: uuid.UUID,
) -> None:
    """Revert a matched transaction back to UNMATCHED."""
    tx = await _get_transaction(session, transaction_id, company_id)
    tx.reconciliation_status = "UNMATCHED"
    tx.matched_settlement_id = None
    tx.matched_journal_id = None
    await session.flush()


async def _get_transaction(
    session: AsyncSession,
    transaction_id: uuid.UUID,
    company_id: uuid.UUID,
) -> BankTransaction:
    """Load a single transaction or raise 404."""
    result = await session.execute(
        select(BankTransaction).where(
            BankTransaction.id == transaction_id,
            BankTransaction.company_id == company_id,
        )
    )
    tx = result.scalar_one_or_none()
    if tx is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return tx
