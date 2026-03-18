"""
app/models/ledger.py
Ledger Entry ORM Model -- Immutable record of authorized hedge executions.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, String, event
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class LedgerEntry(Base):
    """Immutable record of an authorized hedge execution.

    Protected by SQLAlchemy ORM event listeners (cross-DB) and PostgreSQL
    trigger (production): BEFORE UPDATE OR DELETE -> RAISE EXCEPTION.
    """

    __tablename__ = "ledger_entries"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # Human-readable IDs
    ledger_id: Mapped[str] = mapped_column(
        String(32), unique=True, nullable=False, index=True,
    )
    order_id: Mapped[str] = mapped_column(
        String(32), unique=True, nullable=False, index=True,
    )

    # Reference to staging artifact
    staging_id: Mapped[str] = mapped_column(
        String(32), nullable=False, index=True,
    )

    # Authorization
    authorized_by: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False,
    )

    authorized_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    signature_hash: Mapped[str] = mapped_column(String(128), nullable=False)

    # Root hash -- SHA256(snapshot_hash + exposure_digest + policy_hash + approval_hash + execution_payload_hash)
    root_hash: Mapped[str] = mapped_column(String(128), nullable=False, default="")

    # Provenance chain (JSONB)
    provenance_chain: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # Frozen artifact (complete snapshot for replay)
    frozen_artifact: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # Replay verification status
    replay_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Tenant isolation: scopes ledger entry to a single company
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), nullable=True, index=True,
    )

    def __repr__(self) -> str:
        return f"<LedgerEntry {self.ledger_id} order={self.order_id}>"


@event.listens_for(LedgerEntry, "before_update")
def _block_ledger_update(mapper, connection, target):
    raise RuntimeError(
        f"LedgerEntry {target.ledger_id!r} is immutable — WORM policy violation: updates are forbidden."
    )


@event.listens_for(LedgerEntry, "before_delete")
def _block_ledger_delete(mapper, connection, target):
    raise RuntimeError(
        f"LedgerEntry {target.ledger_id!r} is immutable — WORM policy violation: deletes are forbidden."
    )


class AnchorHash(Base):
    """Daily Merkle root anchor of all ledger entries for external audit."""

    __tablename__ = "anchor_hashes"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    anchor_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, unique=True, index=True,
    )

    merkle_root: Mapped[str] = mapped_column(String(128), nullable=False)

    entry_count: Mapped[int] = mapped_column(nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    def __repr__(self) -> str:
        return f"<AnchorHash date={self.anchor_date} entries={self.entry_count}>"
