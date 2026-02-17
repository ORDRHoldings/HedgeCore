"""
app/models/staging.py
Staging Artifact + Approval ORM Models — Governance review layer.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Float, Integer, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class StagingArtifact(Base):
    """A proposal submitted for governance review and authorization."""

    __tablename__ = "staging_artifacts"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # Human-readable staging ID
    staging_id: Mapped[str] = mapped_column(
        String(32), unique=True, nullable=False, index=True,
    )

    # Reference to proposal
    proposal_id: Mapped[str] = mapped_column(
        String(32), nullable=False, index=True,
    )

    # Submitter
    submitted_by: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False, index=True,
    )

    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    justification: Mapped[str] = mapped_column(Text, nullable=False, default="")

    integrity_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    authorization_status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="PENDING",
    )

    # Required approvals (1 or 2 based on dual-control policy)
    required_approvals: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1,
    )

    # Relationships
    approvals: Mapped[list[Approval]] = relationship(
        "Approval",
        back_populates="staging_artifact",
        cascade="all, delete-orphan",
        order_by="Approval.created_at",
    )

    def __repr__(self) -> str:
        return f"<StagingArtifact {self.staging_id} status={self.authorization_status}>"


class Approval(Base):
    """Individual approval/rejection record from an authorized reviewer."""

    __tablename__ = "approvals"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # FK to staging artifact
    staging_artifact_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("staging_artifacts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Approver identity
    approver_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False,
    )
    approver_role: Mapped[str] = mapped_column(String(64), nullable=False)

    # Action taken
    action: Mapped[str] = mapped_column(
        String(20), nullable=False,  # APPROVE, REJECT, RETURN
    )

    signature_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    comment: Mapped[str] = mapped_column(Text, nullable=False, default="")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    staging_artifact: Mapped[StagingArtifact] = relationship(
        "StagingArtifact", back_populates="approvals",
    )

    def __repr__(self) -> str:
        return f"<Approval {self.action} by={self.approver_id}>"
