"""
app/schemas/admin.py
HedgeCalc - Admin & RBAC Schema Models (Phase III)
--------------------------------------------------
Defines validated request/response structures for role assignment,
removal, and user-role inspection.  All models are forward-ref safe
and Pydantic v2 compatible.
"""

from __future__ import annotations
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field


# ------------------------------------------------------------------
# ? Admin Role Management Schemas
# ------------------------------------------------------------------

class AssignRoleRequest(BaseModel):
    """Request payload to assign a role to a user."""
    user_id: UUID = Field(..., description="UUID of the target user.")
    role_id: UUID = Field(..., description="UUID of the role to assign.")
    granted_by: EmailStr | None = Field(
        None,
        description="Admin email performing the assignment (for audit).",
    )

    class Config:
        json_schema_extra = {
            "example": {
                "user_id": "11111111-2222-3333-4444-555555555555",
                "role_id": "66666666-7777-8888-9999-aaaaaaaaaaaa",
                "granted_by": "admin@hedgecalc.ai",
            }
        }


class RemoveRoleRequest(BaseModel):
    """Request payload to remove a role from a user."""
    user_id: UUID = Field(..., description="UUID of the target user.")
    role_id: UUID = Field(..., description="UUID of the role to remove.")
    revoked_by: EmailStr | None = Field(
        None,
        description="Admin email performing the removal (for audit).",
    )

    class Config:
        json_schema_extra = {
            "example": {
                "user_id": "11111111-2222-3333-4444-555555555555",
                "role_id": "66666666-7777-8888-9999-aaaaaaaaaaaa",
                "revoked_by": "admin@hedgecalc.ai",
            }
        }


# ------------------------------------------------------------------
# ? Role Inspection & Responses
# ------------------------------------------------------------------

class RoleResponse(BaseModel):
    """Lightweight role descriptor for admin views."""
    id: UUID
    name: str
    description: str | None = None
    is_active: bool = True


class UserRoleAssignment(BaseModel):
    """Represents a user-role link with metadata."""
    user_id: UUID
    role_id: UUID
    role_name: str
    assigned_at: str
    assigned_by: EmailStr | None = None


# ------------------------------------------------------------------
# ? Rebuild for forward-ref safety
# ------------------------------------------------------------------
AssignRoleRequest.model_rebuild(force=True)
RemoveRoleRequest.model_rebuild(force=True)
RoleResponse.model_rebuild(force=True)
UserRoleAssignment.model_rebuild(force=True)
