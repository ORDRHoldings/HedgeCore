"""UserMFA -- TOTP multi-factor authentication state per user."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID

from app.core.db import Base


class UserMFA(Base):
    __tablename__ = "user_mfa"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    # base32 TOTP secret -- shared key for TOTP algorithm
    totp_secret = Column(String(64), nullable=False)
    is_enabled = Column(Boolean, default=False, nullable=False)
    enrolled_at = Column(DateTime(timezone=True), nullable=True)
    last_verified_at = Column(DateTime(timezone=True), nullable=True)
    # JSON array of hashed backup codes (stored as bcrypt hashes)
    backup_codes = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
