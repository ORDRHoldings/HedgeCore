"""app/models/user_watchlist.py

UserWatchlist — user-scoped symbol lists, backend-persisted.

Each user can have multiple named watchlists. Symbols stored as JSON array.
Mutable (not WORM) — intended for user preferences.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    UUID,
    DateTime,
    ForeignKey,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class UserWatchlist(Base):
    __tablename__ = "user_watchlists"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(
        String(255), nullable=False, default="My Watchlist",
    )
    symbols: Mapped[list] = mapped_column(
        JSON, nullable=False, default=list,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uix_user_watchlists_user_name"),
    )

    def __repr__(self) -> str:
        return f"<UserWatchlist id={self.id} user={self.user_id} name={self.name!r} symbols={len(self.symbols or [])}>"
