# app/schemas/organization.py
"""
Pydantic schemas for Organization hierarchy (Company, Branch, Department).
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------
# Company
# ---------------------------------------------------------------------
class CompanyBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-z0-9\-]+$")
    domain: str | None = Field(default=None, max_length=255)
    logo_url: str | None = Field(default=None, max_length=512)
    settings: dict | None = Field(default_factory=dict)


class CompanyCreate(CompanyBase):
    pass


class CompanyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    domain: str | None = Field(default=None, max_length=255)
    logo_url: str | None = Field(default=None, max_length=512)
    settings: dict | None = None


class CompanyOut(CompanyBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    is_active: bool
    created_at: datetime


# ---------------------------------------------------------------------
# Branch
# ---------------------------------------------------------------------
class BranchBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    code: str = Field(..., min_length=1, max_length=32, pattern=r"^[A-Z0-9\-]+$")
    region: str | None = Field(default=None, max_length=128)
    timezone: str | None = Field(default="UTC", max_length=64)


class BranchCreate(BranchBase):
    pass


class BranchUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    region: str | None = Field(default=None, max_length=128)
    timezone: str | None = Field(default=None, max_length=64)
    is_active: bool | None = None


class BranchOut(BranchBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    company_id: UUID
    is_active: bool
    created_at: datetime


# ---------------------------------------------------------------------
# Department
# ---------------------------------------------------------------------
class DepartmentBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    code: str = Field(..., min_length=1, max_length=32, pattern=r"^[A-Z0-9\-]+$")


class DepartmentCreate(DepartmentBase):
    pass


class DepartmentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)


class DepartmentOut(DepartmentBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    branch_id: UUID
    created_at: datetime


# ---------------------------------------------------------------------
# Nested responses
# ---------------------------------------------------------------------
class BranchWithDepartments(BranchOut):
    departments: list[DepartmentOut] = Field(default_factory=list)


class CompanyWithBranches(CompanyOut):
    branches: list[BranchWithDepartments] = Field(default_factory=list)
