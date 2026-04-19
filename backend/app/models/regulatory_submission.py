"""RegulatorySubmission ORM — trade-repository submission lifecycle tracking.

Wraps the existing `services/regulatory_export.py` export layer with:
  - UTI (Unique Trade Identifier) per submission
  - Status lifecycle: PENDING → SUBMITTED → ACKNOWLEDGED | REJECTED | FAILED
  - SHA-256 hash of the exported document (tamper-evident)
  - Audit trail via `audit_events` (WORM hash chain)

NOT a WORM table — status mutates. Integrity is via document_hash + audit chain.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


# Allowed frameworks (match regulatory_export.py function names)
FRAMEWORKS = ("EMIR", "MIFID_II", "DODD_FRANK", "ISDA", "FINRA_17A4", "IFRS9")

# Status lifecycle
STATUSES = ("PENDING", "SUBMITTED", "ACKNOWLEDGED", "REJECTED", "FAILED")


class RegulatorySubmission(Base):
    __tablename__ = "regulatory_submissions"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("companies.id"), nullable=False, index=True
    )
    framework: Mapped[str] = mapped_column(String(16), nullable=False)
    uti: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    # Source: which calculation_run produced the underlying trade(s).
    # Nullable — some submissions may be manually triggered (e.g. position reports)
    source_run_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="PENDING",
    )

    document_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    document_hash: Mapped[str] = mapped_column(String(64), nullable=False)  # SHA-256 hex

    submitted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ack_received_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ack_reference: Mapped[str | None] = mapped_column(String(128), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(String(512), nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    __table_args__ = (
        Index("ix_regsub_tenant_status", "tenant_id", "status"),
        Index("ix_regsub_tenant_framework", "tenant_id", "framework"),
        Index("ix_regsub_tenant_created", "tenant_id", "created_at"),
    )
