from uuid import UUID
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, EmailStr, ConfigDict, Field


class UserPublic(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str | None = None
    is_active: bool
    is_superuser: bool
    created_at: datetime

    class Config:
        from_attributes = True


# -------------------------------------------------------------------
# Rich /auth/me response with org context + permissions
# -------------------------------------------------------------------
class CompanyBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    slug: str


class BranchBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    code: str


class DepartmentBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    code: str


class UserMeResponse(BaseModel):
    """Full user context returned by GET /auth/me."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    full_name: Optional[str] = None
    job_title: Optional[str] = None
    is_active: bool
    is_superuser: bool
    created_at: datetime

    # Organization context
    company: Optional[CompanyBrief] = None
    branch: Optional[BranchBrief] = None
    department: Optional[DepartmentBrief] = None

    # RBAC
    roles: List[str] = Field(default_factory=list)
    permissions: List[str] = Field(default_factory=list)
    hierarchy_level: Optional[int] = None
