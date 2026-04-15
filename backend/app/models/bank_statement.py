# backend/app/models/bank_statement.py
"""
Bank statement import models.

BankStatement   — one row per imported statement file (dedup by source_hash)
BankTransaction — one row per transaction line in the statement
"""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import Date, DateTime, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class BankStatement(Base):
    """An imported bank statement file."""
    __tablename__ = "bank_statements"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    statement_date: Mapped[date] = mapped_column(Date, nullable=False)
    opening_balance: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    closing_balance: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    format: Mapped[str] = mapped_column(String(16), nullable=False)  # MT940, CAMT053, BAI2
    source_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    transaction_count: Mapped[int] = mapped_column(Integer, nullable=False)
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))


class BankTransaction(Base):
    """A single transaction line from an imported bank statement."""
    __tablename__ = "bank_transactions"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    statement_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    company_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    tx_date: Mapped[date] = mapped_column(Date, nullable=False)
    value_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    direction: Mapped[str] = mapped_column(String(6), nullable=False)  # DEBIT or CREDIT
    description: Mapped[str | None] = mapped_column(String(512), nullable=True)
    reference: Mapped[str | None] = mapped_column(String(128), nullable=True)
    counterparty: Mapped[str | None] = mapped_column(String(256), nullable=True)
    tx_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    reconciliation_status: Mapped[str] = mapped_column(String(16), nullable=False, default="UNMATCHED")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
