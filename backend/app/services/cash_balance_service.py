# backend/app/services/cash_balance_service.py
"""
app/services/cash_balance_service.py

Manual and API-pull balance entry, reconciliation, and position queries.
"""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.cash import (
    BankAccount, BankAccountStatus, CashAuditEventType,
    CashBalance, CashBalanceSource, ReconciliationStatus,
)
from app.services.cash_audit_service import append_event


class AccountNotActiveError(HTTPException):
    def __init__(self, account_id: uuid.UUID):
        super().__init__(status_code=422, detail=f"Account {account_id} is not ACTIVE")


class DuplicateBalanceDateError(HTTPException):
    def __init__(self):
        super().__init__(status_code=409, detail="Balance for this account and date already exists")


async def _get_active_account(
    session: AsyncSession, account_id: uuid.UUID, company_id: uuid.UUID
) -> BankAccount:
    from app.models.cash import LegalEntity
    result = await session.execute(
        select(BankAccount)
        .join(LegalEntity, BankAccount.entity_id == LegalEntity.id)
        .where(BankAccount.id == account_id, LegalEntity.company_id == company_id)
    )
    account = result.scalar_one_or_none()
    if account is None:
        raise HTTPException(status_code=404, detail="Account not found")
    if account.status != BankAccountStatus.ACTIVE.value:
        raise AccountNotActiveError(account_id)
    return account


async def enter_balance(
    session: AsyncSession,
    *,
    account_id: uuid.UUID,
    company_id: uuid.UUID,
    payload: dict[str, Any],
    created_by: uuid.UUID,
    source: CashBalanceSource = CashBalanceSource.MANUAL,
) -> CashBalance:
    account = await _get_active_account(session, account_id, company_id)
    balance_date = date.fromisoformat(str(payload["balance_date"]))

    # Check for duplicate
    existing = await session.execute(
        select(CashBalance).where(
            CashBalance.account_id == account_id,
            CashBalance.balance_date == balance_date,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise DuplicateBalanceDateError()

    balance = CashBalance(
        account_id=account_id,
        balance_date=balance_date,
        value_date=date.fromisoformat(str(payload["value_date"])) if payload.get("value_date") else balance_date,
        ledger_balance=Decimal(str(payload["ledger_balance"])),
        available_balance=Decimal(str(payload["available_balance"])),
        value_date_balance=Decimal(str(payload["value_date_balance"])) if payload.get("value_date_balance") else None,
        in_transit_debit=Decimal(str(payload.get("in_transit_debit", "0"))),
        in_transit_credit=Decimal(str(payload.get("in_transit_credit", "0"))),
        currency=payload.get("currency", account.currency),
        source=source.value,
        note=payload.get("note"),
        created_by=created_by,
    )
    session.add(balance)
    await session.flush()
    await append_event(
        session,
        company_id=company_id,
        event_type=CashAuditEventType.BALANCE_ENTERED,
        payload={
            "balance_date": str(balance_date),
            "ledger_balance": str(balance.ledger_balance),
            "currency": balance.currency,
            "source": source.value,
        },
        performed_by=created_by,
        account_id=account_id,
        balance_id=balance.id,
    )
    return balance


async def bulk_enter_balances(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    rows: list[dict[str, Any]],
    created_by: uuid.UUID,
) -> list[CashBalance]:
    """All-or-nothing bulk entry. Rolls back on any failure."""
    results = []
    for row in rows:
        account_id = uuid.UUID(str(row["account_id"]))
        balance = await enter_balance(
            session,
            account_id=account_id,
            company_id=company_id,
            payload=row,
            created_by=created_by,
        )
        results.append(balance)
    return results


_RECONCILE_EVENT_MAP: dict[ReconciliationStatus, CashAuditEventType] = {
    ReconciliationStatus.RECONCILED: CashAuditEventType.BALANCE_RECONCILED,
    ReconciliationStatus.DISPUTED: CashAuditEventType.BALANCE_DISPUTED,
}


async def reconcile_balance(
    session: AsyncSession,
    *,
    balance_id: uuid.UUID,
    company_id: uuid.UUID,
    reconciler_id: uuid.UUID,
    new_status: ReconciliationStatus,
    note: str | None = None,
) -> CashBalance:
    if new_status not in _RECONCILE_EVENT_MAP:
        raise HTTPException(
            status_code=422,
            detail=f"reconcile_balance only accepts RECONCILED or DISPUTED; got {new_status.value}",
        )
    from app.models.cash import LegalEntity
    result = await session.execute(
        select(CashBalance)
        .join(BankAccount, CashBalance.account_id == BankAccount.id)
        .join(LegalEntity, BankAccount.entity_id == LegalEntity.id)
        .where(CashBalance.id == balance_id, LegalEntity.company_id == company_id)
    )
    balance = result.scalar_one_or_none()
    if balance is None:
        raise HTTPException(status_code=404, detail="Balance not found")
    # Only mutable columns allowed by partial WORM trigger
    balance.reconciliation_status = new_status.value
    balance.reconciled_by = reconciler_id
    balance.reconciled_at = datetime.now(UTC)
    event_type = _RECONCILE_EVENT_MAP[new_status]
    await append_event(
        session,
        company_id=company_id,
        event_type=event_type,
        payload={"status": new_status.value, "note": note},
        performed_by=reconciler_id,
        balance_id=balance_id,
    )
    return balance
