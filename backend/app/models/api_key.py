"""
app/models/api_key.py

HedgeCalc – Phase VI
Service API Keys & Integration Tokens (ORM Model)

- Guarantees lowercase enum values are always persisted.
- Prevents duplicate table registration (extend_existing=True).
- Fully compatible with async SQLAlchemy and PostgreSQL ENUM.
- Implements robust validation, secure secret handling, and auditing.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Optional

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, validates

from app.core.db import Base


# ---------------------------------------------------------------------
# ENUM definition (PostgreSQL lowercase-safe)
# ---------------------------------------------------------------------
class ApiKeyStatus(str, enum.Enum):
    ACTIVE = "active"
    REVOKED = "revoked"
    EXPIRED = "expired"


# ---------------------------------------------------------------------
# ORM Model for API Keys
# ---------------------------------------------------------------------
class ApiKey(Base):
    """Service API Key ORM model with secure token handling."""

    __tablename__ = "api_keys"
    __table_args__ = (
        CheckConstraint("status in ('active','revoked','expired')", name="ck_api_keys_status_valid"),
        Index("ix_api_keys_status", "status"),
        Index("ix_api_keys_owner", "owner_user_id"),
        Index("ix_api_keys_expires_at", "expires_at"),
        {"extend_existing": True},
    )

    # -----------------------------------------------------------------
    # Core Fields
    # -----------------------------------------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        nullable=False,
    )

    key_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    secret_hash: Mapped[str] = mapped_column(Text, nullable=False)
    scopes: Mapped[Optional[list[str]]] = mapped_column(ARRAY(Text), nullable=True)

    # ✅ Enum ensures lowercase-safe persistence
    status: Mapped[str] = mapped_column(
        SAEnum(
            ApiKeyStatus,
            name="api_key_status",
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=False,
        default=ApiKeyStatus.ACTIVE.value,
        server_default=ApiKeyStatus.ACTIVE.value,
    )

    owner_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL", name="fk_api_keys_owner_user_id_users"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # -----------------------------------------------------------------
    # Validation Hook: Normalizing ENUM values to lowercase
    # -----------------------------------------------------------------
    @validates("status")
    def _normalize_status(self, key: str, value: Any) -> str:
        """Ensure status is saved as a lowercase string."""
        if isinstance(value, enum.Enum):
            return value.value.lower()
        if isinstance(value, str):
            return value.lower()
        return str(value).lower()

    # -----------------------------------------------------------------
    # Computed Properties for API Key State
    # -----------------------------------------------------------------
    @property
    def is_active(self) -> bool:
        """Check if the API key is active and not expired."""
        if str(self.status).lower() != "active":
            return False
        if self.expires_at and datetime.now(timezone.utc) >= self.expires_at:
            return False
        return True

    @property
    def is_expired(self) -> bool:
        """Check if the API key has expired."""
        return bool(self.expires_at and datetime.now(timezone.utc) >= self.expires_at)

    # -----------------------------------------------------------------
    # Helper Methods
    # -----------------------------------------------------------------
    def update_last_used(self) -> None:
        """Update the last used timestamp of the API key."""
        self.last_used_at = datetime.now(timezone.utc)

    def to_public_dict(self) -> Dict[str, Any]:
        """Return a public-safe representation of the API key."""
        return {
            "id": str(self.id),
            "key_id": self.key_id,
            "name": self.name,
            "scopes": list(self.scopes or []),
            "status": str(self.status),
            "owner_user_id": str(self.owner_user_id) if self.owner_user_id else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_used_at": self.last_used_at.isoformat() if self.last_used_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
        }

    def has_scopes(self, required_scopes: Iterable[str]) -> bool:
        """Check if the API key contains all the required scopes."""
        if not required_scopes:
            return True
        return set(required_scopes).issubset(set(self.scopes or []))

    # -----------------------------------------------------------------
    # String Representation
    # -----------------------------------------------------------------
    def __repr__(self) -> str:
        """Return a string representation of the API key instance."""
        return f"<ApiKey id={self.id} key_id='{self.key_id}' status='{self.status}'>"
