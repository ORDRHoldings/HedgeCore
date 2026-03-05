# app/models/rbac.py
"""
RBAC models for HedgeCalc.

Defines:
- Role: distinct system role (admin, manager, user, ...)
- UserRole: assignment pivot between users and roles

Conventions:
- SQLAlchemy 2.0 typed mappings
- UTC timestamps
- Strict uniqueness and indexing
- Minimal runtime logging (model modules stay lightweight)

Security Notes:
- Role names are unique and case-insensitive behavior should be enforced at the
  service layer (normalize to lowercase on writes).
- A unique constraint on (user_id, role_id) prevents duplicate assignments.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import (
    Mapped,
    mapped_column,
    relationship,
)

from app.core.db import Base

logger = logging.getLogger(__name__)


class Role(Base):
    """
    System-wide role entity.

    Examples:
        - admin
        - manager
        - user
    """

    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Role name is unique; service layer should normalize to lowercase.
    name: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Company-scoped roles (NULL = system-wide role)
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        doc="Company this role belongs to. NULL = system-level seed role.",
    )

    # Authority hierarchy: 0 = highest (CFO/Admin), higher = less authority
    hierarchy_level: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=10,
        doc="Authority level. 0 = highest (admin/CFO). Higher = less authority.",
    )

    is_system: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        doc="True for seed roles that cannot be deleted by company admins.",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # Reverse relation: role.user_roles -> list of UserRole
    user_roles: Mapped[list[UserRole]] = relationship(
        "UserRole",
        back_populates="role",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    company = relationship("Company", foreign_keys=[company_id], lazy="selectin")

    __table_args__ = (
        Index("ix_roles_name_unique", "name", unique=True),
        Index("ix_roles_company_id", "company_id"),
    )

    def __repr__(self) -> str:  # pragma: no cover - representational
        return f"Role(id={self.id!r}, name={self.name!r})"


class UserRole(Base):
    """
    Assignment of a role to a user.

    Enforces that a (user_id, role_id) pair is unique.
    """

    __tablename__ = "user_roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role_id: Mapped[int] = mapped_column(
        ForeignKey("roles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relations
    role: Mapped[Role] = relationship("Role", back_populates="user_roles")
    # Create a lightweight reverse collection on User without editing the User model now.
    # This requires the User mapper to be configured in the registry.
    user: Mapped[User] = relationship(
        "User",
        backref="user_roles",
        passive_deletes=True,
    )

    __table_args__ = (
        UniqueConstraint("user_id", "role_id", name="uq_user_roles_user_role"),
        Index("ix_user_roles_user_id_role_id", "user_id", "role_id"),
    )

    def __repr__(self) -> str:  # pragma: no cover - representational
        return f"UserRole(id={self.id!r}, user_id={self.user_id!r}, role_id={self.role_id!r})"
