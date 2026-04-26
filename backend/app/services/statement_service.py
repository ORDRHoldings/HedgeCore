"""
Statement import service — detect format, parse, dedup, persist, audit.
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import date
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bank_statement import BankStatement, BankTransaction
from app.models.cash import CashAuditEventType
from app.services.cash_audit_service import append_event
from app.services.parsers.bai2_parser import parse_bai2
from app.services.parsers.camt053_parser import parse_camt053
from app.services.parsers.mt940_parser import parse_mt940


def detect_format(content: str) -> str:
    """Auto-detect statement file format from content."""
    stripped = content.strip()
    if stripped.startswith("<?xml") or stripped.startswith("<Document"):
        return "CAMT053"
    if stripped.startswith("01,"):
        return "BAI2"
    return "MT940"


async def import_statement(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    account_id: uuid.UUID,
    content: str,
    filename: str | None,
    created_by: uuid.UUID,
    format_override: str | None = None,
) -> dict[str, Any]:
    """Full import pipeline: detect -> parse -> dedup -> persist -> audit."""
    # 1. Compute source hash for deduplication
    source_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()

    # 2. Check for duplicate
    result = await session.execute(
        select(BankStatement).where(
            BankStatement.source_hash == source_hash,
            BankStatement.company_id == company_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Duplicate statement — file already imported")

    # 3. Detect format and parse
    fmt = format_override or detect_format(content)
    if fmt == "CAMT053":
        parsed_list = parse_camt053(content)
    elif fmt == "BAI2":
        parsed_list = parse_bai2(content)
    else:
        parsed_list = parse_mt940(content)

    if not parsed_list:
        raise HTTPException(status_code=422, detail="No valid statements found in file")

    # 4. Persist — use first parsed statement (most common case: 1 statement per file)
    parsed = parsed_list[0]
    total_tx = sum(len(ps.transactions) for ps in parsed_list)

    stmt = BankStatement(
        company_id=company_id,
        account_id=account_id,
        statement_date=parsed.statement_date,
        opening_balance=float(parsed.opening_balance),
        closing_balance=float(parsed.closing_balance),
        currency=parsed.currency,
        format=fmt,
        source_hash=source_hash,
        transaction_count=total_tx,
        filename=filename,
        created_by=created_by,
    )
    session.add(stmt)
    await session.flush()

    # 5. Persist transactions from all parsed statements
    for ps in parsed_list:
        for tx in ps.transactions:
            bank_tx = BankTransaction(
                statement_id=stmt.id,
                account_id=account_id,
                company_id=company_id,
                tx_date=tx.tx_date,
                value_date=tx.value_date,
                amount=float(tx.amount),
                currency=parsed.currency,
                direction=tx.direction,
                description=tx.description or None,
                reference=tx.reference or None,
                counterparty=tx.counterparty or None,
                tx_code=tx.tx_code or None,
                reconciliation_status="UNMATCHED",
            )
            session.add(bank_tx)

    await session.flush()

    # 6. Audit log
    await append_event(
        session, company_id=company_id,
        event_type=CashAuditEventType.STATEMENT_IMPORTED,
        payload={
            "statement_id": str(stmt.id),
            "format": fmt,
            "transaction_count": total_tx,
            "filename": filename or "",
            "source_hash": source_hash,
        },
        performed_by=created_by,
    )

    return {
        "statement": stmt,
        "transaction_count": total_tx,
        "duplicate": False,
    }


async def list_statements(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    account_id: uuid.UUID | None = None,
) -> list[BankStatement]:
    """List imported statements, optionally filtered by account."""
    stmt = select(BankStatement).where(BankStatement.company_id == company_id)
    if account_id:
        stmt = stmt.where(BankStatement.account_id == account_id)
    stmt = stmt.order_by(BankStatement.created_at.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_statement(
    session: AsyncSession,
    *,
    statement_id: uuid.UUID,
    company_id: uuid.UUID,
) -> BankStatement | None:
    """Get a single statement by ID."""
    result = await session.execute(
        select(BankStatement).where(
            BankStatement.id == statement_id,
            BankStatement.company_id == company_id,
        )
    )
    return result.scalar_one_or_none()


async def list_transactions(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    statement_id: uuid.UUID | None = None,
    account_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    status: str | None = None,
) -> list[BankTransaction]:
    """List transactions with optional filters."""
    stmt = select(BankTransaction).where(BankTransaction.company_id == company_id)
    if statement_id:
        stmt = stmt.where(BankTransaction.statement_id == statement_id)
    if account_id:
        stmt = stmt.where(BankTransaction.account_id == account_id)
    if date_from:
        stmt = stmt.where(BankTransaction.tx_date >= date_from)
    if date_to:
        stmt = stmt.where(BankTransaction.tx_date <= date_to)
    if status:
        stmt = stmt.where(BankTransaction.reconciliation_status == status)
    stmt = stmt.order_by(BankTransaction.tx_date.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())
