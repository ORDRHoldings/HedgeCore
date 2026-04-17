# backend/app/models/debt.py
"""
Debt management ORM models.

DebtFacility    — credit line or loan record
DebtDrawdown    — individual drawdowns against a facility
DebtCovenant    — covenant thresholds and live values
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class DebtFacility(Base):
    __tablename__ = "debt_facilities"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    legal_entity_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("legal_entities.id"), nullable=True, index=True)
    facility_type: Mapped[str] = mapped_column(String(32), nullable=False)
    counterparty: Mapped[str] = mapped_column(String(255), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    committed_amount: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    drawn_amount: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False, default=0.0)
    margin_bps: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rate_index: Mapped[str] = mapped_column(String(16), nullable=False)
    maturity_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    day_count: Mapped[str] = mapped_column(String(16), nullable=False, default="ACT365")
    payment_frequency: Mapped[str] = mapped_column(String(16), nullable=False, default="QUARTERLY")
    repayment_type: Mapped[str] = mapped_column(String(16), nullable=False, default="BULLET")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class DebtDrawdown(Base):
    __tablename__ = "debt_drawdowns"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    facility_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("debt_facilities.id"), nullable=False, index=True)
    drawdown_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    repayment_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    rate_fixed_at: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True)
    drawdown_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))

    @staticmethod
    def compute_hash(facility_id: uuid.UUID, amount: float, drawdown_date: object) -> str:
        raw = f"{facility_id}:{amount}:{drawdown_date}"
        return hashlib.sha256(raw.encode()).hexdigest()


class DebtCovenant(Base):
    __tablename__ = "debt_covenants"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    facility_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("debt_facilities.id"), nullable=False, index=True)
    covenant_type: Mapped[str] = mapped_column(String(32), nullable=False)
    threshold: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    current_value: Mapped[float | None] = mapped_column(Numeric(20, 6), nullable=True)
    headroom_pct: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="COMPLIANT")
    tested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))
