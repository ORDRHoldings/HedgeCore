# backend/app/models/intelligence.py
"""
IntelligenceQueryLog — non-WORM audit log for AI queries.

Stores prompt HASH only — never raw prompts (financial data in prompts
is an audit/compliance risk). id is reused as query_id / commentary_id
in API responses.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class IntelligenceQueryLog(Base):
    __tablename__ = "intelligence_query_log"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), nullable=False
    )
    capability: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # "NL_QUERY" | "REPORT_COMMENTARY"
    prompt_hash: Mapped[str] = mapped_column(
        String(64), nullable=False
    )  # SHA-256 hex — not the prompt itself
    tokens_in: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )

    __table_args__ = (
        Index("ix_intelligence_query_log_company_capability", "company_id", "capability"),
    )
