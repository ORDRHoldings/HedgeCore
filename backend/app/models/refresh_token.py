# app/models/refresh_token.py
"""
HedgeCalc - Refresh Token Persistence (Phase VII, UUID-Safe Auth Suite)
-----------------------------------------------------------------------
Server-side refresh token storage using async SQLAlchemy ORM.

Changes:
- user_id now uses UUID(as_uuid=True)
- ForeignKey aligned to users.id (UUID)
- Logging and indexing remain intact
- Relationship explicitly defined (no backref)
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    String,
    Index,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class RefreshToken(Base):
    """Persistent record for refresh tokens bound to a user (UUID-safe)."""

    __tablename__ = "refresh_tokens"

    # Internal numeric key retained for internal ordering/logging (optional)
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Unique token identifier
    jti: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)

    # UUID foreign key to users.id
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
        doc="UUID of the user owning this token.",
    )

    # Expiry and status
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        doc="Absolute UTC expiry timestamp for this refresh token.",
    )

    revoked: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        doc="True when rotated or logged out; prevents reuse.",
    )

    replaced_by_jti: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
        doc="If rotated, JTI of the new token that replaced this one.",
    )

    # Creation metadata
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        doc="UTC timestamp when this token record was created.",
    )

    created_ip: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
        doc="Client IP at token creation.",
    )

    created_user_agent: Mapped[Optional[str]] = mapped_column(
        String(256),
        nullable=True,
        doc="User-Agent string at token creation.",
    )

    # ----------------------------------------------------------
    # Relationship (explicit, no backref)
    # ----------------------------------------------------------
    user = relationship(
        "User",
        back_populates="refresh_tokens",
        lazy="joined",
        doc="Linked User entity.",
    )

    # ----------------------------------------------------------
    # Indexes / Constraints
    # ----------------------------------------------------------
    __table_args__ = (
        Index("ix_refresh_tokens_user_revoked", "user_id", "revoked"),
        Index("ix_refresh_tokens_replaced_by_jti", "replaced_by_jti"),
        UniqueConstraint("jti", name="uq_refresh_tokens_jti"),
    )

    # ----------------------------------------------------------
    # Representation
    # ----------------------------------------------------------
    def __repr__(self) -> str:
        return (
            f"<RefreshToken jti={self.jti} user_id={self.user_id} "
            f"revoked={self.revoked} expires_at={self.expires_at.isoformat()} "
            f"replaced_by_jti={self.replaced_by_jti}>"
        )
