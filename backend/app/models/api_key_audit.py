"""
app/models/api_key_audit.py
API Key Audit Log (WORM-intent)
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import String, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column

# ✅ CANONICAL Declarative Base
from app.db.base import Base


class ApiKeyAuditLog(Base):
    __tablename__ = "api_key_audit_logs"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    api_key_id: Mapped[int] = mapped_column(
        Integer,
        index=True,
        nullable=False,
    )

    user_id: Mapped[int | None] = mapped_column(
        Integer,
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
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
