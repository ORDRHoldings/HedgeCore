# backend/app/models/journal_entry.py
"""
app/models/journal_entry.py

JournalEntry — WORM record of GL journal entries generated from hedge
effectiveness runs, settlement events, and fair value changes.

WORM semantics (ADR-0009):
  - No DELETE
  - No UPDATE except: status, posted_at, posted_to, posted_ref
  - Every status transition also emits an audit_event (immutable log)
  - SHA-256 hash chain: (chain_seq, entry_hash, prev_entry_hash)
  - chain_seq: SELECT MAX+1 FOR UPDATE to prevent concurrent chain forks

GLAccountMapping — mutable per-tenant chart-of-accounts configuration.
  - Not WORM (tenants must be able to correct mappings)
  - UNIQUE(company_id, entry_type, standard)
"""
from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import BigInteger, Date, DateTime, Numeric, String, UniqueConstraint, event
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.orm.attributes import get_history  # module-level so tests can patch it

from app.core.db import Base


class JournalEntryType(str, Enum):
    OCI_RECOGNITION = "OCI_RECOGNITION"
    PNL_RECLASSIFICATION = "PNL_RECLASSIFICATION"
    INEFFECTIVENESS = "INEFFECTIVENESS"
    SETTLEMENT_VARIANCE = "SETTLEMENT_VARIANCE"
    FAIR_VALUE_CHANGE = "FAIR_VALUE_CHANGE"


class HedgeStandard(str, Enum):
    IFRS_9 = "IFRS_9"
    ASC_815 = "ASC_815"
    IAS_39 = "IAS_39"


class JournalEntryStatus(str, Enum):
    DRAFT = "DRAFT"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    POSTED = "POSTED"
    REJECTED = "REJECTED"


# State machine — keys are FROM states, values are allowed TO states
JOURNAL_ENTRY_TRANSITIONS: dict[JournalEntryStatus, set[JournalEntryStatus]] = {
    JournalEntryStatus.DRAFT: {JournalEntryStatus.PENDING_APPROVAL},
    JournalEntryStatus.PENDING_APPROVAL: {
        JournalEntryStatus.APPROVED,
        JournalEntryStatus.REJECTED,
    },
    JournalEntryStatus.APPROVED: {JournalEntryStatus.POSTED},
    JournalEntryStatus.POSTED: set(),
    JournalEntryStatus.REJECTED: set(),
}

GENESIS_HASH = "0" * 64

# Only these columns may be updated after insert (WORM deviation; ADR-0009)
_MUTABLE_FIELDS = frozenset({"status", "posted_at", "posted_to", "posted_ref"})


def _compute_entry_hash(
    *,
    company_id: uuid.UUID,
    entry_type: str,
    standard: str,
    debit_account: str,
    credit_account: str,
    amount: Decimal,
    currency: str,
    period_date: date,
    created_at: datetime,
    chain_seq: int,
) -> str:
    """SHA-256 over canonical pipe-delimited content string (spec §3.1).

    amount is normalized to 6 decimal places (f"{amount:.6f}") so that
    Decimal("100000") and Decimal("100000.00") produce the same hash.
    """
    content = "|".join([
        str(company_id),
        entry_type,
        standard,
        debit_account,
        credit_account,
        f"{amount:.6f}",
        currency,
        period_date.isoformat(),
        created_at.isoformat(),
        str(chain_seq),
    ])
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False, index=True
    )
    run_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True, index=True
    )
    ledger_entry_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True
    )
    settlement_event_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True
    )
    entry_type: Mapped[str] = mapped_column(String(64), nullable=False)
    standard: Mapped[str] = mapped_column(String(16), nullable=False)
    debit_account: Mapped[str] = mapped_column(String(64), nullable=False)
    credit_account: Mapped[str] = mapped_column(String(64), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    base_amount: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    base_currency: Mapped[str] = mapped_column(String(3), nullable=False)
    fx_rate_used: Mapped[Decimal] = mapped_column(Numeric(20, 8), nullable=False)
    period_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=JournalEntryStatus.DRAFT.value
    )
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    posted_to: Mapped[str | None] = mapped_column(String(64), nullable=True)
    posted_ref: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # Hash chain (spec §3.1, ADR-0009)
    entry_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    prev_entry_hash: Mapped[str] = mapped_column(
        String(128), nullable=False, default=GENESIS_HASH
    )
    chain_seq: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    created_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)

    def __repr__(self) -> str:
        return f"<JournalEntry {self.id} type={self.entry_type} status={self.status}>"


@event.listens_for(JournalEntry, "before_delete")
def _block_je_delete(mapper, connection, target):
    raise RuntimeError(
        f"JournalEntry {target.id!r} is WORM — deletes are forbidden (ADR-0009)."
    )


@event.listens_for(JournalEntry, "before_update")
def _block_je_update(mapper, connection, target):
    """Block updates to all columns except the permitted mutable set."""
    # get_history is imported at module level so tests can patch it
    for col in mapper.columns:
        if col.key in _MUTABLE_FIELDS:
            continue
        hist = get_history(target, col.key)
        if hist.has_changes() and hist.deleted:
            raise RuntimeError(
                f"JournalEntry {target.id!r} is WORM — cannot update "
                f"field '{col.key}' (ADR-0009)."
            )


class GLAccountMapping(Base):
    """Per-tenant chart-of-accounts mapping. Mutable (not WORM)."""

    __tablename__ = "gl_account_mappings"
    __table_args__ = (
        UniqueConstraint(
            "company_id", "entry_type", "standard",
            name="uq_gl_mapping_company_type_standard",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False, index=True
    )
    entry_type: Mapped[str] = mapped_column(String(64), nullable=False)
    standard: Mapped[str] = mapped_column(String(16), nullable=False)
    debit_account: Mapped[str] = mapped_column(String(64), nullable=False)
    credit_account: Mapped[str] = mapped_column(String(64), nullable=False)
    account_label: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    erp_system: Mapped[str] = mapped_column(String(32), nullable=False, default="MANUAL")
    created_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
    updated_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)

    def __repr__(self) -> str:
        return f"<GLAccountMapping {self.company_id} {self.entry_type}/{self.standard}>"


class GLMappingNotConfiguredError(Exception):
    """Raised when JournalEntry generation lacks a GL account mapping."""
