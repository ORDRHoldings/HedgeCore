"""Counterparty + CreditLimit ORM — scorecard, credit limits, breach detection.

Not WORM. `last_exposure_usd`, `last_pfe_usd`, `risk_level_cached`, `last_scored_at`
are updated by `counterparty_service.compute_exposure()`. Audit trail is via
`audit_events` with event_type string literals.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Counterparty(Base):
    __tablename__ = "counterparties"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    internal_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    legal_entity_name: Mapped[str | None] = mapped_column(String(240), nullable=True)
    lei: Mapped[str | None] = mapped_column(String(20), nullable=True)  # Legal Entity Identifier
    credit_rating: Mapped[str | None] = mapped_column(String(8), nullable=True)  # AAA, AA+, BBB, etc.
    rating_agency: Mapped[str | None] = mapped_column(String(32), nullable=True)  # S&P, Moody's, Fitch
    country_iso: Mapped[str | None] = mapped_column(String(2), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    last_exposure_usd: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    last_pfe_usd: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    risk_level_cached: Mapped[str | None] = mapped_column(String(16), nullable=True)
    last_scored_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_counterparty_tenant_name"),
        Index("ix_counterparty_tenant_active", "tenant_id", "active"),
    )


class CreditLimit(Base):
    __tablename__ = "credit_limits"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    counterparty_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("counterparties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True
    )
    limit_type: Mapped[str] = mapped_column(String(32), nullable=False)  # notional|pfe|settlement|isda_threshold
    limit_amount_usd: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")
    effective_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    expiry_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )

    __table_args__ = (
        Index("ix_credit_limit_cp_active", "counterparty_id", "active"),
        Index("ix_credit_limit_tenant_type", "tenant_id", "limit_type"),
    )
