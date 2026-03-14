"""
app/models/api_key_audit.py
API Key Audit Log (WORM-intent)
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

# ? CANONICAL Declarative Base
from app.core.db import Base


class ApiKeyAuditLog(Base):
    __tablename__ = "api_key_audit_logs"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    api_key_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        index=True,
        nullable=False,
    )

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        index=True,
        nullable=True,
    )

    method: Mapped[str] = mapped_column(
        String(8),
        nullable=False,
    )

    path: Mapped[str] = mapped_column(
        String(512),
        nullable=False,
    )

    status_code: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    client_ip: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
    )

    latency_ms: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
