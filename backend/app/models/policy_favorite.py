"""
PolicyFavorite ORM model -- per-user bookmarked policy templates.
"""
import uuid as _uuid

from sqlalchemy import Column, DateTime, Index, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID

from app.core.db import Base


class PolicyFavorite(Base):
    """User-specific bookmarks for quick access to frequently used policy templates."""
    __tablename__ = "user_policy_favorites"

    id          = Column(PGUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
    user_id     = Column(PGUUID(as_uuid=True), nullable=False)  # FK -> users.id
    template_id = Column(PGUUID(as_uuid=True), nullable=False)  # FK -> policy_templates.id
    notes       = Column(Text, nullable=True)
    created_at  = Column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    __table_args__ = (
        Index("ix_policy_favorites_user", "user_id", "created_at"),
        Index("ix_policy_favorites_template", "template_id"),
        UniqueConstraint("user_id", "template_id", name="uq_policy_favorites"),
    )
