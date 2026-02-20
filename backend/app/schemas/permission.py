# app/schemas/permission.py
"""
Pydantic schemas for Permission and Role-Permission management.
"""

from __future__ import annotations
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


# ---------------------------------------------------------------------
# Permission
# ---------------------------------------------------------------------
class PermissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    codename: str
    module: str
    action: str
    description: str


class PermissionGroupOut(BaseModel):
    """Permissions grouped by module for the admin UI."""
    module: str
    permissions: List[PermissionOut]


# ---------------------------------------------------------------------
# Role with permissions
# ---------------------------------------------------------------------
class RoleWithPermissions(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: Optional[str] = None
    hierarchy_level: int
    is_system: bool
    permissions: List[str] = Field(default_factory=list, description="Permission codenames")


class RolePermissionUpdate(BaseModel):
    """Set the full list of permissions for a role."""
    permission_codenames: List[str] = Field(..., description="Complete list of permission codenames to assign")


class RoleCreateExtended(BaseModel):
    """Create a new role with permissions and hierarchy."""
    name: str = Field(..., min_length=2, max_length=64)
    description: Optional[str] = Field(default=None, max_length=255)
    hierarchy_level: int = Field(default=10, ge=0, le=100)
    permission_codenames: List[str] = Field(default_factory=list)
