"""
app/models/audit_log.py
HedgeCalc - Audit Log Model (Async ORM, Phase VI)
-------------------------------------------------
Immutable, privacy-safe record of all HTTP transactions.

Key Improvements:
    - Uses Base from app.core.db (not user model).
    - Fully async-ready (SQLAlchemy 2.x declarative).
    - Safe server defaults for UTC timestamps.
    - Optimized indexes for analytics and cleanup.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class AuditLog(Base):
    """Immutable audit record for every HTTP request handled by HedgeCalc."""

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    ts: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
        doc="UTC timestamp when the request finished.",
    )

    request_id: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        index=True,
        doc="Correlation ID (x-request-id header).",
    )

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        doc="Authenticated user UUID (nullable for anonymous calls).",
    )

    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(256), nullable=True)

    method: Mapped[str] = mapped_column(String(8), nullable=False)
    path: Mapped[str] = mapped_column(String(512), nullable=False)
    status: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)

    user = relationship("User", lazy="raise", viewonly=True)

    __table_args__ = (
        Index("ix_audit_logs_ts", "ts"),
        Index("ix_audit_logs_path", "path"),
        Index("ix_audit_logs_reqid", "request_id"),
        Index("ix_audit_logs_user_ts", "user_id", "ts"),
    )

    def __repr__(self) -> str:
        return (
            f"<AuditLog id={self.id} rid={self.request_id} "
            f"user={self.user_id or '-'} {self.method} {self.path} "
            f"status={self.status} {self.duration_ms}ms>"
        )
