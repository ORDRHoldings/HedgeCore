# app/schemas/rbac.py
"""
RBAC Pydantic schemas for HedgeCalc.

Covers:
- Role CRUD/reads
- UserRole reads
- Admin requests to assign/remove roles
- Common paginated response helpers

Notes:
- Uses Pydantic v2 style (model_config, from_attributes=True) for ORM compatibility.
- Keep schemas decoupled from ORM models; never import SQLAlchemy models here.
- Validate/normalize role names at the service layer (lowercasing, allowed charset).
"""

from __future__ import annotations

import logging
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------
# Role Schemas
# ---------------------------------------------------------------------
class RoleBase(BaseModel):
    """Base properties shared by role schemas."""
    name: str = Field(..., min_length=2, max_length=64, description="Unique role name (e.g., admin, manager, user)")
    description: str | None = Field(default=None, max_length=255, description="Human-friendly role description")


class RoleCreate(RoleBase):
    """Payload to create a new role (admin-only)."""
    pass


class RoleUpdate(BaseModel):
    """Payload to update a role (admin-only)."""
    description: str | None = Field(default=None, max_length=255, description="Updated description (optional)")


class RoleOut(BaseModel):
    """Role representation returned to clients."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str | None = None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------
# UserRole Schemas
# ---------------------------------------------------------------------
class UserRoleOut(BaseModel):
    """Represents a user->role assignment."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    role_id: int
    created_at: datetime


# ---------------------------------------------------------------------
# Admin API Request Schemas
# ---------------------------------------------------------------------
class AssignRoleRequest(BaseModel):
    """Admin request to assign a role to a user."""
    role_name: str = Field(..., min_length=2, max_length=64, description="Role to assign (e.g., admin)")


class RemoveRoleRequest(BaseModel):
    """Admin request to remove a role from a user."""
    role_name: str = Field(..., min_length=2, max_length=64, description="Role to remove (e.g., admin)")


# ---------------------------------------------------------------------
# Listing / Pagination Helpers
# ---------------------------------------------------------------------
class UserWithRoles(BaseModel):
    """Lightweight user projection for admin listing endpoints."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    is_active: bool
    roles: list[str] = Field(default_factory=list, description="List of role names assigned to the user")


class PaginatedUsersResponse(BaseModel):
    """Standard paginated response for /admin/users."""
    items: list[UserWithRoles]
    total: int = Field(..., ge=0)
    page: int = Field(..., ge=1)
    size: int = Field(..., ge=1)
    pages: int = Field(..., ge=1)


# ---------------------------------------------------------------------
# Misc Convenience Schemas
# ---------------------------------------------------------------------
class RolesListResponse(BaseModel):
    """Simple list wrapper for returning all roles."""
    items: list[RoleOut]


# ---------------------------------------------------------------------
# ? Pydantic v2 Compatibility Rebuild (Enhanced)
# ---------------------------------------------------------------------
# Ensures all models are fully defined before FastAPI OpenAPI generation.
# Fixes: `TypeAdapter[ForwardRef(...)] is not fully defined` errors.

_logger = logging.getLogger("pydantic.rebuild")

# Global rebuild loop
for _cls in list(globals().values()):
    if isinstance(_cls, type) and issubclass(_cls, BaseModel):
        try:
            _cls.model_rebuild()
        except Exception as e:
            _logger.warning(f"?? Skipped model rebuild for {_cls.__name__}: {e}")

# Explicit forced rebuild for critical models
try:
    AssignRoleRequest.model_rebuild(force=True)
    RemoveRoleRequest.model_rebuild(force=True)
    UserWithRoles.model_rebuild(force=True)
    PaginatedUsersResponse.model_rebuild(force=True)
except Exception as e:
    _logger.error(f"?? Forced model rebuild failed: {e}")

_logger.info("? RBAC Pydantic models fully rebuilt.")
