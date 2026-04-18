"""TransactionCostEstimate — advisory TCA artifact with variance reconciliation.

Not WORM. `actual_cost_usd`, `variance_bps`, `settlement_event_id`, `reconciled_at`
are backfilled by `tca_service.reconcile_actual()`. Audit trail via hash-chain
`audit_events` table with string-literal event_type.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class TransactionCostEstimate(Base):
    __tablename__ = "transaction_cost_estimates"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    estimate_type: Mapped[str] = mapped_column(String(16), nullable=False)  # pre_trade|post_calc
    calculation_run_id: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True
    )
    market_snapshot_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False
    )
    inputs: Mapped[dict] = mapped_column(JSONB, nullable=False)
    outputs: Mapped[dict] = mapped_column(JSONB, nullable=False)
    total_cost_usd: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    total_cost_bps: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    settlement_event_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("settlement_events.id"), nullable=True
    )
    actual_cost_usd: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    variance_bps: Mapped[Decimal | None] = mapped_column(Numeric(10, 4), nullable=True)
    reconciled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        index=True,
    )

    __table_args__ = (
        Index("ix_tca_tenant_created", "tenant_id", "created_at"),
        Index("ix_tca_tenant_type_reconciled", "tenant_id", "estimate_type", "reconciled_at"),
    )
