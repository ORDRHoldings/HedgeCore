"""
app/models/ledger.py
Ledger Entry ORM Model -- Immutable record of authorized hedge executions.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class LedgerEntry(Base):
    """Immutable record of an authorized hedge execution.

    Protected by PostgreSQL trigger: BEFORE UPDATE OR DELETE -> RAISE EXCEPTION.
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
        default=lambda: datetime.now(timezone.utc),
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

    def __repr__(self) -> str:
        return f"<LedgerEntry {self.ledger_id} order={self.order_id}>"


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
        default=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self) -> str:
        return f"<AnchorHash date={self.anchor_date} entries={self.entry_count}>"
