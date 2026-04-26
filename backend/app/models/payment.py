# backend/app/models/payment.py
"""
Payment Initiation models — Phase 2 §4.4

PaymentBeneficiary — tenant-scoped whitelist of approved payment destinations
PaymentInstruction — payment record with 5-state machine + per-record SHA-256 hash
"""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Index,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class PaymentBeneficiary(Base):
    __tablename__ = "payment_beneficiaries"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    bank_name: Mapped[str] = mapped_column(String(255), nullable=False)
    bank_code: Mapped[str] = mapped_column(String(34), nullable=False)
    account_number: Mapped[str] = mapped_column(String(34), nullable=False)
    country_code: Mapped[str] = mapped_column(String(2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    payment_types: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    __table_args__ = (
        UniqueConstraint("company_id", "bank_code", "account_number", name="uq_beneficiary_account"),
        Index("ix_payment_beneficiaries_company_active", "company_id", "is_active"),
    )


class PaymentInstruction(Base):
    __tablename__ = "payment_instructions"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, index=True)
    beneficiary_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    payment_type: Mapped[str] = mapped_column(String(10), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(20, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    execution_date: Mapped[date] = mapped_column(Date, nullable=False)
    reference: Mapped[str] = mapped_column(String(140), nullable=False)
    memo: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDING_APPROVAL")
    created_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejected_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(String, nullable=True)
    transmission_mode: Mapped[str] = mapped_column(String(10), nullable=False, default="paper")
    transmitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    instruction_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_payment_amount_positive"),
        Index("ix_payment_instructions_company_status", "company_id", "status"),
        Index("ix_payment_instructions_company_created", "company_id", "created_at"),
    )
