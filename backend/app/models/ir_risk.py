# backend/app/models/ir_risk.py
"""
IR risk ORM models.

IRSwap         — interest rate derivative instrument
IRVolSnapshot  — IR swaption vol surface
IRHedgeRun     — WORM effectiveness test run, hash-chained
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

GENESIS_HASH = "0" * 64


class IRSwap(Base):
    __tablename__ = "ir_swaps"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    legal_entity_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("legal_entities.id"), nullable=True, index=True)
    linked_facility_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("debt_facilities.id"), nullable=True, index=True)
    instrument_type: Mapped[str] = mapped_column(String(16), nullable=False)
    notional: Mapped[float] = mapped_column(Numeric(20, 6), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    fixed_rate: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True)
    strike: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True)
    float_index: Mapped[str] = mapped_column(String(16), nullable=False)
    start_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    maturity_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    pay_fixed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    day_count: Mapped[str] = mapped_column(String(16), nullable=False, default="ACT365")
    reset_frequency: Mapped[str] = mapped_column(String(16), nullable=False, default="QUARTERLY")
    last_npv: Mapped[float | None] = mapped_column(Numeric(20, 6), nullable=True)
    last_dv01: Mapped[float | None] = mapped_column(Numeric(20, 6), nullable=True)
    last_mtm_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class IRVolSnapshot(Base):
    __tablename__ = "ir_vol_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    index: Mapped[str] = mapped_column(String(16), nullable=False)
    option_expiry: Mapped[str] = mapped_column(String(8), nullable=False)
    swap_tenor: Mapped[str] = mapped_column(String(8), nullable=False)
    strike: Mapped[float] = mapped_column(Numeric(10, 6), nullable=False, default=0.0)
    implied_vol_normal: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True)
    implied_vol_lognormal: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True)
    as_of: Mapped[datetime] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))


class IRHedgeRun(Base):
    """WORM: append-only, hash-chained. Never update or delete."""
    __tablename__ = "ir_hedge_runs"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True)
    swap_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("ir_swaps.id"), nullable=False, index=True)
    facility_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("debt_facilities.id"), nullable=True)
    run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC), server_default="now()")
    method: Mapped[str] = mapped_column(String(32), nullable=False)
    ratio: Mapped[float] = mapped_column(Numeric(10, 6), nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    inputs_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    run_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    prior_run_hash: Mapped[str] = mapped_column(String(64), nullable=False, default=GENESIS_HASH)
    evidence_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    @staticmethod
    def compute_run_hash(inputs_hash: str, prior_run_hash: str) -> str:
        raw = f"{inputs_hash}:{prior_run_hash}"
        return hashlib.sha256(raw.encode()).hexdigest()
