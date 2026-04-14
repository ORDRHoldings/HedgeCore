# backend/app/models/treasury_transaction.py
"""
app/models/treasury_transaction.py

TreasuryTransaction — strictly WORM audit spine for all financial events.

No column is ever mutated after insert (unlike JournalEntry which permits
status updates). ADR-0013 governs this design.

Hash chain: tx_hash = SHA-256(company_id|tx_type|amount|currency|value_date|
                               source_ref_id|created_at|chain_seq|prev_tx_hash)
chain_seq: SELECT MAX(chain_seq)+1 FOR UPDATE — serialises per-tenant
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import BigInteger, Date, DateTime, Numeric, String, event
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class TxType(str, Enum):
    FX_HEDGE = "FX_HEDGE"
    SETTLEMENT = "SETTLEMENT"
    BANK_RECEIPT = "BANK_RECEIPT"
    BANK_PAYMENT = "BANK_PAYMENT"
    INTERCOMPANY = "INTERCOMPANY"
    JOURNAL_ENTRY = "JOURNAL_ENTRY"
    CASH_POOL_SWEEP = "CASH_POOL_SWEEP"


class TxSourceModule(str, Enum):
    FX_LIFECYCLE = "FX_LIFECYCLE"
    CASH = "CASH"
    GL = "GL"
    PAYMENT = "PAYMENT"
    SETTLEMENT = "SETTLEMENT"


GENESIS_HASH = "0" * 64


def _compute_tx_hash(
    *,
    company_id: uuid.UUID,
    tx_type: str,
    amount: Decimal,
    currency: str,
    value_date: date,
    source_ref_id: uuid.UUID,
    created_at: datetime,
    chain_seq: int,
    prev_tx_hash: str = GENESIS_HASH,
) -> str:
    # amount normalized to 6 decimal places for hash stability
    # prev_tx_hash included so chain reordering is detectable (ADR-0013)
    content = "|".join([
        str(company_id),
        tx_type,
        f"{amount:.6f}",
        currency,
        value_date.isoformat(),
        str(source_ref_id),
        created_at.isoformat(),
        str(chain_seq),
        prev_tx_hash,
    ])
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


class TreasuryTransaction(Base):
    __tablename__ = "treasury_transactions"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False, index=True
    )
    entity_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    tx_type: Mapped[str] = mapped_column(String(32), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    base_amount: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    base_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    fx_rate: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    value_date: Mapped[date] = mapped_column(Date, nullable=False)
    source_module: Mapped[str] = mapped_column(String(32), nullable=False)
    source_ref_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    source_ref_type: Mapped[str] = mapped_column(String(64), nullable=False)
    tx_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    prev_tx_hash: Mapped[str] = mapped_column(
        String(128), nullable=False, default=GENESIS_HASH
    )
    chain_seq: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    def __repr__(self) -> str:
        return f"<TreasuryTransaction {self.id} type={self.tx_type}>"


@event.listens_for(TreasuryTransaction, "before_delete")
def _block_tx_delete(mapper, connection, target):
    raise RuntimeError(
        f"TreasuryTransaction {target.id!r} is WORM — deletes are forbidden (ADR-0013)."
    )


@event.listens_for(TreasuryTransaction, "before_update")
def _block_tx_update(mapper, connection, target):
    raise RuntimeError(
        f"TreasuryTransaction {target.id!r} is WORM — updates are forbidden (ADR-0013)."
    )
