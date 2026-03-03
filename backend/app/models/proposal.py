"""
app/models/proposal.py
Proposal ORM Model -- Frozen sandbox result awaiting staging.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Proposal(Base):
    """A frozen sandbox calculation result that can be submitted to staging."""

    __tablename__ = "proposals"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # Human-readable ID: PROP-XXXXXXXX
    proposal_id: Mapped[str] = mapped_column(
        String(32), unique=True, nullable=False, index=True,
    )

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="DRAFT",
    )

    # Creator (FK to users.id)
    created_by: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False, index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Engine run reference
    run_id: Mapped[str] = mapped_column(String(64), nullable=False)
    engine_version: Mapped[str] = mapped_column(String(16), nullable=False, default="1.0.0")

    # Hashes
    snapshot_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    policy_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    exposure_digest: Mapped[str] = mapped_column(String(128), nullable=False)
    policy_version: Mapped[str] = mapped_column(String(64), nullable=False, default="1.0.0")

    # JSONB payloads
    frozen_inputs: Mapped[dict] = mapped_column(JSONB, nullable=False)
    calculate_response: Mapped[dict] = mapped_column(JSONB, nullable=False)
    waterfall_result: Mapped[dict] = mapped_column(JSONB, nullable=False)
    freeze_artifact: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # Residual risk vector (list of floats per bucket)
    residual_risk_vector: Mapped[dict] = mapped_column(JSONB, nullable=False, default=list)

    # Capability flags
    capability_flags: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    # Optional justification
    justification: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<Proposal {self.proposal_id} status={self.status}>"
