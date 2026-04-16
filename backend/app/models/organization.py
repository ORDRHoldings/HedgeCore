"""
app/models/organization.py
HedgeCalc - Organization Hierarchy Models

Defines the multi-level company structure:
  Company -> Branch -> Department

Design:
- Single company for now, multi-tenant ready (company_id FK on everything)
- Branch represents a physical or logical business unit (office, subsidiary)
- Department is optional granularity within a branch
- All UUIDs, UTC timestamps, soft-delete via is_active flag
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class Company(Base):
    """Top-level organization entity. Multi-tenant anchor."""

    __tablename__ = "companies"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        doc="Primary company identifier.",
    )

    name: Mapped[str] = mapped_column(
        String(255), nullable=False,
        doc="Company display name.",
    )

    slug: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, index=True,
        doc="URL-safe unique identifier (e.g. 'acme-corp').",
    )

    domain: Mapped[str | None] = mapped_column(
        String(255), nullable=True,
        doc="Primary email domain for auto-association (e.g. 'acme.com').",
    )

    logo_url: Mapped[str | None] = mapped_column(
        String(512), nullable=True,
        doc="URL to company logo asset.",
    )

    settings: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True, default=dict,
        doc="Company-level configuration (default policy, currency, timezone).",
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False,
        doc="Soft-delete flag. Inactive companies cannot log in.",
    )

    # SSO fields
    sso_provider: Mapped[str | None] = mapped_column(
        String(64), nullable=True,
        doc="WorkOS SSO provider type (e.g. 'okta', 'azure', 'google', 'saml', 'oidc').",
    )

    sso_domain: Mapped[str | None] = mapped_column(
        String(255), nullable=True,
        doc="Email domain used for SSO auto-routing (e.g. 'acme.com').",
    )

    # Billing fields
    stripe_customer_id: Mapped[str | None] = mapped_column(
        String(128), nullable=True, unique=True,
        doc="Stripe Customer ID (cus_...).",
    )

    stripe_subscription_id: Mapped[str | None] = mapped_column(
        String(128), nullable=True, unique=True,
        doc="Active Stripe Subscription ID (sub_...).",
    )

    plan_tier: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default="starter",
        doc="Subscription plan tier: starter | professional | enterprise.",
    )

    intelligence_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false",
        doc="Opt-in flag for Intelligence tier features.",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    # Relationships
    branches: Mapped[list[Branch]] = relationship(
        "Branch",
        back_populates="company",
        cascade="all, delete-orphan",
        order_by="Branch.name",
    )

    def __init__(self, **kwargs: object) -> None:
        # Apply Python-side default for plan_tier before mapper __init__.
        kwargs.setdefault("plan_tier", "starter")
        super().__init__(**kwargs)

    def __repr__(self) -> str:
        return f"<Company {self.slug} name={self.name!r}>"


class Branch(Base):
    """Business unit within a company (office, subsidiary, region)."""

    __tablename__ = "branches"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    company_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
    )

    name: Mapped[str] = mapped_column(
        String(255), nullable=False,
        doc="Branch display name (e.g. 'Mexico City Office').",
    )

    code: Mapped[str] = mapped_column(
        String(32), nullable=False,
        doc="Short unique code within company (e.g. 'MXC').",
    )

    region: Mapped[str | None] = mapped_column(
        String(128), nullable=True,
        doc="Geographic region (e.g. 'LATAM', 'EMEA').",
    )

    timezone: Mapped[str | None] = mapped_column(
        String(64), nullable=True, default="UTC",
        doc="Branch timezone (IANA format).",
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    # Relationships
    company: Mapped[Company] = relationship("Company", back_populates="branches")
    departments: Mapped[list[Department]] = relationship(
        "Department",
        back_populates="branch",
        cascade="all, delete-orphan",
        order_by="Department.name",
    )

    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_branch_company_code"),
        Index("ix_branches_company_id", "company_id"),
    )

    def __repr__(self) -> str:
        return f"<Branch {self.code} name={self.name!r}>"


class Department(Base):
    """Optional sub-division within a branch."""

    __tablename__ = "departments"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    branch_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("branches.id", ondelete="CASCADE"),
        nullable=False,
    )

    name: Mapped[str] = mapped_column(
        String(255), nullable=False,
        doc="Department name (e.g. 'FX Desk', 'Treasury Operations').",
    )

    code: Mapped[str] = mapped_column(
        String(32), nullable=False,
        doc="Short code within branch (e.g. 'FXD').",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    # Relationships
    branch: Mapped[Branch] = relationship("Branch", back_populates="departments")

    __table_args__ = (
        UniqueConstraint("branch_id", "code", name="uq_department_branch_code"),
        Index("ix_departments_branch_id", "branch_id"),
    )

    def __repr__(self) -> str:
        return f"<Department {self.code} name={self.name!r}>"
