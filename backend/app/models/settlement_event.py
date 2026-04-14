"""
app/models/settlement_event.py

SettlementEvent — WORM record of hedge settlement outcomes.
Linked 1:1 to a LedgerEntry. Captures actual vs hedge rate, P&L variance.
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import Date, DateTime, Numeric, String, Text, event
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class SettlementStatus(str, Enum):
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    FAILED = "FAILED"
    RECONCILED = "RECONCILED"
    DISPUTED = "DISPUTED"


GENESIS_HASH = "0" * 64


def _compute_event_hash(
    *,
    ledger_entry_id: uuid.UUID,
    hedge_rate: Decimal,
    actual_rate: Decimal,
    hedge_amount: Decimal,
    settlement_date: date,
    settlement_ref: str,
) -> str:
    content = "|".join([
        str(ledger_entry_id),
        str(hedge_rate),
        str(actual_rate),
        str(hedge_amount),
        settlement_date.isoformat(),
        settlement_ref,
    ])
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


class SettlementEvent(Base):
    __tablename__ = "settlement_events"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    ledger_entry_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False, unique=True, index=True
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False, index=True
    )
    hedge_rate: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    actual_rate: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    hedge_amount: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    settlement_amount: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    rate_variance: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    pnl_impact: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    settlement_date: Mapped[date] = mapped_column(Date, nullable=False)
    value_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    settlement_ref: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=SettlementStatus.PENDING.value
    )
    reconciled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reconciled_by: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True
    )
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    event_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    def __repr__(self) -> str:
        return f"<SettlementEvent {self.id} status={self.status}>"


@event.listens_for(SettlementEvent, "before_delete")
def _block_se_delete(mapper, connection, target):
    raise RuntimeError(
        f"SettlementEvent {target.id!r} is WORM — deletes are forbidden."
    )
