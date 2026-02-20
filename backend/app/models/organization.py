"""
app/models/organization.py
HedgeCalc – Organization Hierarchy Models

Defines the multi-level company structure:
  Company → Branch → Department

Design:
- Single company for now, multi-tenant ready (company_id FK on everything)
- Branch represents a physical or logical business unit (office, subsidiary)
- Department is optional granularity within a branch
- All UUIDs, UTC timestamps, soft-delete via is_active flag
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    String,
    Boolean,
    DateTime,
    Text,
    ForeignKey,
    UniqueConstraint,
    Index,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB
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

    domain: Mapped[Optional[str]] = mapped_column(
        String(255), nullable=True,
        doc="Primary email domain for auto-association (e.g. 'acme.com').",
    )

    logo_url: Mapped[Optional[str]] = mapped_column(
        String(512), nullable=True,
        doc="URL to company logo asset.",
    )

    settings: Mapped[Optional[dict]] = mapped_column(
        JSONB, nullable=True, default=dict,
        doc="Company-level configuration (default policy, currency, timezone).",
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False,
        doc="Soft-delete flag. Inactive companies cannot log in.",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    branches: Mapped[list["Branch"]] = relationship(
        "Branch",
        back_populates="company",
        cascade="all, delete-orphan",
        order_by="Branch.name",
    )

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
        index=True,
    )

    name: Mapped[str] = mapped_column(
        String(255), nullable=False,
        doc="Branch display name (e.g. 'Mexico City Office').",
    )

    code: Mapped[str] = mapped_column(
        String(32), nullable=False,
        doc="Short unique code within company (e.g. 'MXC').",
    )

    region: Mapped[Optional[str]] = mapped_column(
        String(128), nullable=True,
        doc="Geographic region (e.g. 'LATAM', 'EMEA').",
    )

    timezone: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, default="UTC",
        doc="Branch timezone (IANA format).",
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    company: Mapped["Company"] = relationship("Company", back_populates="branches")
    departments: Mapped[list["Department"]] = relationship(
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
        index=True,
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
        default=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    branch: Mapped["Branch"] = relationship("Branch", back_populates="departments")

    __table_args__ = (
        UniqueConstraint("branch_id", "code", name="uq_department_branch_code"),
        Index("ix_departments_branch_id", "branch_id"),
    )

    def __repr__(self) -> str:
        return f"<Department {self.code} name={self.name!r}>"
