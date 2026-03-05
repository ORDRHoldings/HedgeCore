# app/api/routes/admin_users.py
"""
Admin & RBAC Management API (Phase III - HedgeCalc)
---------------------------------------------------
Enterprise-grade, Pydantic-v2-safe admin endpoints.
Ensures full OpenAPI stability by:
- Using explicit body dict + Pydantic model validation (no Body() ForwardRefs)
- Using string path parameters for UUIDs with runtime conversion
- Providing local response models for clear, stable OpenAPI schemas
"""

from __future__ import annotations

import logging
from uuid import UUID

from fastapi import (
    APIRouter,
    Body,
    Depends,
    HTTPException,
    Path,
    Query,
    Request,
    status,
)
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.authz import require_roles
from app.core.security import get_current_user
from app.db.session import get_session
from app.models.rbac import Role, UserRole
from app.models.user import User
from app.schemas import admin as admin_schemas
from app.schemas.admin import (
    AssignRoleRequest,
    RemoveRoleRequest,
    RoleResponse,
    UserRoleAssignment,
)
from app.services import rbac_service


# ---------------------------------------------------------------------
# ? Local response models to produce stable, rich OpenAPI
# ---------------------------------------------------------------------
class UserListItem(BaseModel):
    id: UUID = Field(..., description="User UUID")
    email: str = Field(..., description="User email")
    is_active: bool = Field(..., description="Active status")
    roles: list[str] = Field(default_factory=list, description="Assigned role names")

class PaginatedUsersResponse(BaseModel):
    items: list[UserListItem]
    total: int
    page: int
    size: int
    pages: int


# ---------------------------------------------------------------------
# ? Schema Initialization - ensures OpenAPI stability
# ---------------------------------------------------------------------
logger = logging.getLogger("hedgecalc.admin")

for _schema in [
    admin_schemas.AssignRoleRequest,
    admin_schemas.RemoveRoleRequest,
    admin_schemas.RoleResponse,
    admin_schemas.UserRoleAssignment,
    UserListItem,
    PaginatedUsersResponse,
]:
    try:
        _schema.model_rebuild(force=True)  # pydantic v2
        logger.info(f"? Schema {_schema.__name__} rebuilt for OpenAPI stability.")
    except Exception as e:
        logger.warning(f"?? Schema rebuild skipped for {_schema.__name__}: {e}")

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    responses={
        401: {"description": "Unauthorized"},
        403: {"description": "Forbidden"},
        422: {"description": "Validation error"},
    },
)
logger.info("? Admin router initialized.")


# ---------------------------------------------------------------------
# ? Utility Functions
# ---------------------------------------------------------------------
def _clamp_pagination(page: int, size: int, max_size: int = 100) -> tuple[int, int]:
    """Clamp pagination inputs to safe, bounded values."""
    if page < 1:
        page = 1
    if size < 1:
        size = 1
    if size > max_size:
        size = max_size
    return page, size


async def _get_roles_map(session: AsyncSession, user_ids: list[UUID]) -> dict[UUID, list[str]]:
    """Return {user_id: [role_name, ...]} for a batch of user UUIDs."""
    if not user_ids:
        return {}

    stmt = (
        select(UserRole.user_id, Role.name)
        .join(Role, Role.id == UserRole.role_id)
        .where(UserRole.user_id.in_(user_ids))
        .order_by(UserRole.user_id, Role.name)
    )
    rows = (await session.execute(stmt)).all()

    mapping: dict[UUID, list[str]] = {}
    for uid, role_name in rows:
        mapping.setdefault(uid, []).append(role_name)
    return mapping


# ---------------------------------------------------------------------
# GET /admin/users  -> Paginated list of users with roles
# ---------------------------------------------------------------------
@router.get(
    "/users",
    response_model=PaginatedUsersResponse,
    status_code=status.HTTP_200_OK,
    summary="List users with roles (paginated)",
    description="Returns a paginated list of users and their assigned roles. Admin-only.",
)
@require_roles("admin")
async def list_users(
    request: Request,
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    size: int = Query(25, ge=1, le=100, description="Page size (max 100)"),
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    """Paginated list of all users and their assigned roles."""
    page, size = _clamp_pagination(page, size)

    total = (await session.execute(select(func.count()).select_from(User))).scalar_one()
    offset = (page - 1) * size

    users_rows = (
        await session.execute(
            select(User.id, User.email, User.is_active)
            .order_by(User.id.asc())
            .offset(offset)
            .limit(size)
        )
    ).all()

    user_ids = [r[0] for r in users_rows]
    roles_map = await _get_roles_map(session, user_ids)

    items = [
        UserListItem(id=uid, email=email, is_active=is_active, roles=roles_map.get(uid, []))
        for uid, email, is_active in users_rows
    ]
    pages = max(1, (total + size - 1) // size)

    logger.info(
        "[Admin] list_users requester=%s page=%s size=%s total=%s",
        getattr(current_user, "id", None),
        page,
        size,
        total,
    )
    return PaginatedUsersResponse(items=items, total=total, page=page, size=size, pages=pages)


# ---------------------------------------------------------------------
# POST /admin/users/{user_id}/roles  -> Assign role
# ---------------------------------------------------------------------
@router.post(
    "/users/{user_id}/roles",
    response_model=UserRoleAssignment,
    status_code=status.HTTP_201_CREATED,
    summary="Assign role to user",
    description="Idempotently assigns a role to a user by UUID. Admin-only.",
)
@require_roles("admin")
async def assign_role(
    request: Request,
    user_id: str = Path(..., description="User UUID as string"),
    body: dict = Body(..., description="Role assignment payload", embed=True),
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    """Assign a role to a user (safe against duplicates)."""
    try:
        user_uuid = UUID(user_id)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid user UUID")

    try:
        payload = AssignRoleRequest.model_validate(body)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Invalid payload: {e}")

    success = await rbac_service.assign_role_to_user(session, user_uuid, payload.role_id)
    if not success:
        logger.warning(
            "[Admin] assign_role failed user_id=%s role_id=%s by=%s",
            user_uuid, payload.role_id, getattr(current_user, "id", None),
        )
        raise HTTPException(status_code=400, detail="Unable to assign role")

    logger.info(
        "[Admin] assign_role success user_id=%s role_id=%s by=%s",
        user_uuid, payload.role_id, getattr(current_user, "id", None),
    )

    return UserRoleAssignment(
        user_id=user_uuid,
        role_id=payload.role_id,
        role_name="(resolved later)",
        assigned_at="(timestamp generated)",
        assigned_by=getattr(current_user, "email", None),
    )


# ---------------------------------------------------------------------
# DELETE /admin/users/{user_id}/roles  -> Remove role
# ---------------------------------------------------------------------
@router.delete(
    "/users/{user_id}/roles",
    status_code=status.HTTP_200_OK,
    summary="Remove role from user",
    description="Removes a role from a user by UUID. Admin-only.",
)
@require_roles("admin")
async def remove_role(
    request: Request,
    user_id: str = Path(..., description="User UUID as string"),
    body: dict = Body(..., description="Role removal payload", embed=True),
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    """Remove a role from a user."""
    try:
        user_uuid = UUID(user_id)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid user UUID")

    try:
        payload = RemoveRoleRequest.model_validate(body)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Invalid payload: {e}")

    success = await rbac_service.remove_role_from_user(session, user_uuid, payload.role_id)
    if not success:
        logger.warning(
            "[Admin] remove_role failed user_id=%s role_id=%s by=%s",
            user_uuid, payload.role_id, getattr(current_user, "id", None),
        )
        raise HTTPException(status_code=400, detail="Unable to remove role")

    logger.info(
        "[Admin] remove_role success user_id=%s role_id=%s by=%s",
        user_uuid, payload.role_id, getattr(current_user, "id", None),
    )
    return {"detail": "Role removed successfully"}


# ---------------------------------------------------------------------
# GET /admin/roles  -> List all roles
# ---------------------------------------------------------------------
@router.get(
    "/roles",
    response_model=list[RoleResponse],
    status_code=status.HTTP_200_OK,
    summary="List roles",
    description="Lists all roles for administrative tools. Admin-only.",
)
@require_roles("admin")
async def list_roles(
    request: Request,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
):
    """List all roles for administrative tools."""
    roles = await rbac_service.list_roles(session)
    logger.info(
        "[Admin] list_roles requester=%s count=%s",
        getattr(current_user, "id", None),
        len(roles),
    )
    return [RoleResponse.model_validate(r, from_attributes=True) for r in roles]


# ---------------------------------------------------------------------
# ? Final Schema Rebuild for OpenAPI Sanity Check
# ---------------------------------------------------------------------
try:
    AssignRoleRequest.model_rebuild(force=True)
    RemoveRoleRequest.model_rebuild(force=True)
    RoleResponse.model_rebuild(force=True)
    UserRoleAssignment.model_rebuild(force=True)
    UserListItem.model_rebuild(force=True)
    PaginatedUsersResponse.model_rebuild(force=True)
    logger.info("? Admin schemas rebuilt post-router definition.")
except Exception as e:
    logger.warning(f"?? Admin schema rebuild skipped: {e}")
