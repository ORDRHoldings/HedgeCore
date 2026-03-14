# app/api/routes/admin_roles.py
"""
Role & Permission management API - Admin endpoints.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.authz import require_permission
from app.core.db import get_session
from app.core.dependencies import get_current_user
from app.models.permission import Permission, RolePermission
from app.models.rbac import Role
from app.schemas.permission import (
    PermissionGroupOut,
    RoleCreateExtended,
    RolePermissionUpdate,
    RoleWithPermissions,
)
from app.services import rbac_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/admin/roles", tags=["admin-roles"])
# -------------------------------------------------------------------
# Permissions catalog
# -------------------------------------------------------------------
@router.get("/permissions", response_model=list[PermissionGroupOut])
async def list_permissions(
    db: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    """List all available permissions grouped by module."""
    stmt = select(Permission).order_by(Permission.module, Permission.codename)
    result = await db.execute(stmt)
    perms = list(result.scalars().all())

    # Group by module
    groups: dict[str, list] = {}
    for p in perms:
        groups.setdefault(p.module, []).append(p)

    return [
        PermissionGroupOut(module=module, permissions=perms_list)
        for module, perms_list in groups.items()
    ]
# -------------------------------------------------------------------
# Roles CRUD
# -------------------------------------------------------------------
@router.get("", response_model=list[RoleWithPermissions])
async def list_roles(
    db: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    """List all roles with their permissions."""
    stmt = select(Role).order_by(Role.hierarchy_level, Role.name)
    result = await db.execute(stmt)
    roles = list(result.scalars().all())

    out = []
    for role in roles:
        perms = await rbac_service.get_permissions_by_role(db, role.id)
        out.append(
            RoleWithPermissions(
                id=role.id,
                name=role.name,
                description=role.description,
                hierarchy_level=role.hierarchy_level,
                is_system=role.is_system,
                permissions=perms,
            )
        )
    return out
@router.post("", response_model=RoleWithPermissions, status_code=201)
@require_permission("users.assign_roles")
async def create_role(
    payload: RoleCreateExtended,
    request=None,
    db: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    """Create a new custom role with permissions."""
    # Check name uniqueness
    existing = await db.execute(select(Role).where(Role.name == payload.name.lower()))
    if existing.scalars().first():
        raise HTTPException(status_code=409, detail=f"Role '{payload.name}' already exists")

    company_id = getattr(current_user, "company_id", None)

    role = Role(
        name=payload.name.lower(),
        description=payload.description,
        hierarchy_level=payload.hierarchy_level,
        company_id=company_id,
        is_system=False,
    )
    db.add(role)
    await db.flush()

    # Assign permissions
    if payload.permission_codenames:
        await _set_role_permissions(db, role.id, payload.permission_codenames)

    await db.commit()
    await db.refresh(role)

    perms = await rbac_service.get_permissions_by_role(db, role.id)
    logger.info(f"Role '{role.name}' created by user {current_user.id}")
    return RoleWithPermissions(
        id=role.id,
        name=role.name,
        description=role.description,
        hierarchy_level=role.hierarchy_level,
        is_system=role.is_system,
        permissions=perms,
    )
@router.put("/{role_id}/permissions", response_model=RoleWithPermissions)
@require_permission("users.assign_roles")
async def update_role_permissions(
    role_id: int,
    payload: RolePermissionUpdate,
    request=None,
    db: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    """Replace the full set of permissions for a role."""
    role = await db.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    await _set_role_permissions(db, role_id, payload.permission_codenames)
    await db.commit()

    perms = await rbac_service.get_permissions_by_role(db, role.id)
    logger.info(f"Role '{role.name}' permissions updated by user {current_user.id}")
    return RoleWithPermissions(
        id=role.id,
        name=role.name,
        description=role.description,
        hierarchy_level=role.hierarchy_level,
        is_system=role.is_system,
        permissions=perms,
    )
@router.delete("/{role_id}", status_code=204)
@require_permission("users.assign_roles")
async def delete_role(
    role_id: int,
    request=None,
    db: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    """Delete a custom role (system roles cannot be deleted)."""
    role = await db.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.is_system:
        raise HTTPException(status_code=403, detail="Cannot delete system roles")

    await db.delete(role)
    await db.commit()
    logger.info(f"Role '{role.name}' deleted by user {current_user.id}")
# -------------------------------------------------------------------
# Internal helpers
# -------------------------------------------------------------------
async def _set_role_permissions(db: AsyncSession, role_id: int, codenames: list[str]):
    """Replace all permissions for a role with the given codenames."""
    # Clear existing
    await db.execute(
        delete(RolePermission).where(RolePermission.role_id == role_id)
    )

    if not codenames:
        return

    # Look up permission IDs
    stmt = select(Permission).where(Permission.codename.in_(codenames))
    result = await db.execute(stmt)
    perms = list(result.scalars().all())

    found_codenames = {p.codename for p in perms}
    missing = set(codenames) - found_codenames
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown permissions: {list(missing)}",
        )

    for perm in perms:
        db.add(RolePermission(role_id=role_id, permission_id=perm.id))
