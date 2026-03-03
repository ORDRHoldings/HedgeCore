"""

app/models/user.py

HedgeCalc - User ORM Model (Phase VII, UUID-Stable)

----------------------------------------------------

Fully UUID-based user entity compatible with all dependent models:

- refresh_tokens

- audit_logs

- RBAC and JWT subsystems

"""



from __future__ import annotations



import uuid

from datetime import datetime, timezone

from typing import Optional



from sqlalchemy import (

    String,

    Boolean,

    Integer,

    DateTime,

    ForeignKey,

    Index,

)

from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB

from sqlalchemy.orm import Mapped, mapped_column, relationship



from app.core.db import Base





class User(Base):

    """HedgeCalc core user entity for authentication & authorization."""



    __tablename__ = "users"



    # ----------------------------------------------------------

    # Core Identity

    # ----------------------------------------------------------

    id: Mapped[uuid.UUID] = mapped_column(

        PGUUID(as_uuid=True),

        primary_key=True,

        default=uuid.uuid4,

        unique=True,

        nullable=False,

        index=True,

        doc="Primary UUID identifier for user record.",

    )



    email: Mapped[str] = mapped_column(

        String(255),

        unique=True,

        index=True,

        nullable=False,

        doc="Unique email address (login credential).",

    )



    hashed_password: Mapped[str] = mapped_column(

        String(255),

        nullable=False,

        doc="Bcrypt-hashed password string.",

    )



    full_name: Mapped[Optional[str]] = mapped_column(

        String(255),

        nullable=True,

        doc="Optional user display name.",

    )



    # ----------------------------------------------------------

    # Organization Hierarchy

    # ----------------------------------------------------------

    company_id: Mapped[Optional[uuid.UUID]] = mapped_column(

        PGUUID(as_uuid=True),

        ForeignKey("companies.id", ondelete="SET NULL"),

        nullable=True,

        index=True,

        doc="Company this user belongs to.",

    )



    branch_id: Mapped[Optional[uuid.UUID]] = mapped_column(

        PGUUID(as_uuid=True),

        ForeignKey("branches.id", ondelete="SET NULL"),

        nullable=True,

        index=True,

        doc="Branch assignment within company.",

    )



    department_id: Mapped[Optional[uuid.UUID]] = mapped_column(

        PGUUID(as_uuid=True),

        ForeignKey("departments.id", ondelete="SET NULL"),

        nullable=True,

        index=True,

        doc="Optional department within branch.",

    )



    job_title: Mapped[Optional[str]] = mapped_column(

        String(128),

        nullable=True,

        doc="User's job title (e.g. 'FX Risk Analyst').",

    )



    # ----------------------------------------------------------

    # Status Flags

    # ----------------------------------------------------------

    is_active: Mapped[bool] = mapped_column(

        Boolean,

        default=True,

        nullable=False,

        doc="If False, disables login and token issuance.",

    )



    is_superuser: Mapped[bool] = mapped_column(

        Boolean,

        default=False,

        nullable=False,

        doc="Administrative access flag.",

    )



    token_version: Mapped[int] = mapped_column(

        Integer,

        default=1,

        nullable=False,

        doc="Version counter to invalidate all issued JWT tokens.",

    )



    created_at: Mapped[datetime] = mapped_column(

        DateTime(timezone=True),

        nullable=False,

        default=lambda: datetime.now(timezone.utc),

        doc="User account creation timestamp (UTC).",

    )



    ui_preferences: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True, default=dict,
        doc="User UI preference overrides (show_quickstart, etc.).",
    )



    # ----------------------------------------------------------

    # Relationships

    # ----------------------------------------------------------

    refresh_tokens = relationship(

        "RefreshToken",

        back_populates="user",

        lazy="selectin",

        cascade="all, delete-orphan",

        doc="All refresh tokens associated with this user.",

    )



    # lazy="raise" prevents accidental N+1 queries.
    # Always use selectinload(User.company/branch/department) explicitly in queries
    # that need these fields (e.g. get_current_user, _get_user_or_401).
    company = relationship("Company", foreign_keys=[company_id], lazy="raise")

    branch = relationship("Branch", foreign_keys=[branch_id], lazy="raise")

    department = relationship("Department", foreign_keys=[department_id], lazy="raise")



    # ----------------------------------------------------------

    # Indexes / Table Arguments

    # ----------------------------------------------------------

    __table_args__ = (

        Index("ix_users_email_unique", "email", unique=True),

    )



    # ----------------------------------------------------------

    # Representation

    # ----------------------------------------------------------

    def __repr__(self) -> str:

        return f"<User id={self.id} email={self.email} active={self.is_active}>"

