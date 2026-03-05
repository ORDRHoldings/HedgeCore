# app/core/authz.py
"""
Authorization layer for HedgeCalc (RBAC + Permission middleware).

Integrates JWT authentication with Role-Based Access Control (RBAC)
and granular Permission-Based Access Control (PBAC).

Features:
- Role validation decorator (`require_roles`)
- Permission validation decorator (`require_permission`)
- DataScope dependency for branch-level query scoping
- Hierarchy-based override checking (`can_override`)
- Caching of roles/permissions per request (stored in request.state)
- Strict 403 enforcement with structured error and audit logging

Security:
- Default deny principle (access must be explicitly granted)
- All decisions logged with request_id, user_id, roles, and route
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Awaitable, Callable
from functools import wraps

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.db.session import get_session
from app.services import rbac_service

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------
# Fetch roles for current user
# ---------------------------------------------------------------------
async def get_current_user_roles(
    request: Request,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
) -> list[str]:
    """
    Retrieve roles for the authenticated user and attach them to request.state.
    Cached within request to avoid redundant DB calls.
    """
    if not current_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    if hasattr(request.state, "user_roles"):
        return request.state.user_roles

    roles = await rbac_service.get_roles_by_user(session, current_user.id)
    request.state.user_roles = roles
    logger.debug(f"[AuthZ] user_id={current_user.id} roles={roles}")
    return roles


# ---------------------------------------------------------------------
# Fetch permissions for current user
# ---------------------------------------------------------------------
async def get_current_user_permissions(
    request: Request,
    session: AsyncSession = Depends(get_session),
    current_user=Depends(get_current_user),
) -> list[str]:
    """
    Retrieve permission codenames for the authenticated user.
    Cached within request to avoid redundant DB calls.
    """
    if not current_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    if hasattr(request.state, "user_permissions"):
        return request.state.user_permissions

    permissions = await rbac_service.get_permissions_by_user(session, current_user.id)
    request.state.user_permissions = permissions
    logger.debug(f"[AuthZ] user_id={current_user.id} permissions={permissions}")
    return permissions


# ---------------------------------------------------------------------
# Role enforcement decorator
# ---------------------------------------------------------------------
def require_roles(*allowed_roles: str) -> Callable:
    """
    Decorator for FastAPI route functions to enforce role-based access.

    Example:
        @router.get("/admin/users")
        @require_roles("admin")
        async def list_users(...):
            ...
    """

    allowed = {r.lower() for r in allowed_roles}

    def decorator(func: Callable[..., Awaitable]):
        @wraps(func)
        async def wrapper(
            *args,
            request: Request,
            session: AsyncSession = Depends(get_session),
            current_user=Depends(get_current_user),
            **kwargs,
        ):
            if not current_user:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

            roles = await rbac_service.get_roles_by_user(session, current_user.id)
            request.state.user_roles = roles

            # Decision logging
            intersection = allowed.intersection(set(roles))
            allowed_result = bool(intersection)
            log_msg = (
                f"[AuthZ] Access check: user_id={current_user.id}, "
                f"roles={roles}, required={list(allowed)}, route={request.url.path}, "
                f"decision={'ALLOW' if allowed_result else 'DENY'}"
            )
            if allowed_result:
                logger.info(log_msg)
                return await func(*args, request=request, session=session, current_user=current_user, **kwargs)
            else:
                logger.warning(log_msg)
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: insufficient role privileges",
                )

        return wrapper

    return decorator


# ---------------------------------------------------------------------
# Permission enforcement decorator
# ---------------------------------------------------------------------
def require_permission(*codenames: str) -> Callable:
    """
    Decorator for FastAPI route functions to enforce permission-based access.
    User must have ALL specified permissions (AND logic).

    Example:
        @router.post("/trades")
        @require_permission("trades.create")
        async def create_trade(...):
            ...

        @router.post("/pipeline/approve")
        @require_permission("pipeline.approve")
        async def approve_artifact(...):
            ...
    """

    required = set(codenames)

    def decorator(func: Callable[..., Awaitable]):
        @wraps(func)
        async def wrapper(
            *args,
            request: Request,
            session: AsyncSession = Depends(get_session),
            current_user=Depends(get_current_user),
            **kwargs,
        ):
            if not current_user:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

            # Superusers bypass permission checks
            if getattr(current_user, "is_superuser", False):
                logger.info(
                    f"[AuthZ] Permission bypass: user_id={current_user.id} is_superuser=True, "
                    f"route={request.url.path}"
                )
                return await func(*args, request=request, session=session, current_user=current_user, **kwargs)

            user_perms = await rbac_service.get_permissions_by_user(session, current_user.id)
            request.state.user_permissions = user_perms

            user_perm_set = set(user_perms)
            missing = required - user_perm_set
            allowed = not missing

            log_msg = (
                f"[AuthZ] Permission check: user_id={current_user.id}, "
                f"required={list(required)}, has={user_perms}, "
                f"missing={list(missing)}, route={request.url.path}, "
                f"decision={'ALLOW' if allowed else 'DENY'}"
            )

            if allowed:
                logger.info(log_msg)
                return await func(*args, request=request, session=session, current_user=current_user, **kwargs)
            else:
                logger.warning(log_msg)
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Access denied: missing permissions {list(missing)}",
                )

        return wrapper

    return decorator


# ---------------------------------------------------------------------
# DataScope: branch-level query scoping dependency
# ---------------------------------------------------------------------
class DataScope:
    """
    Resolved data-access scope for the current user.

    Determines which branch(es) the user can access data from.
    Used as a FastAPI dependency to add WHERE clauses to queries.

    Usage:
        @router.get("/trades")
        async def list_trades(scope: DataScope = Depends(DataScope.resolve)):
            if scope.all_branches:
                # query all
            else:
                # filter by scope.branch_id
    """

    def __init__(
        self,
        user_id: uuid.UUID,
        company_id: uuid.UUID | None,
        branch_id: uuid.UUID | None,
        all_branches: bool,
        permissions: list[str],
    ):
        self.user_id = user_id
        self.company_id = company_id
        self.branch_id = branch_id
        self.all_branches = all_branches
        self.permissions = permissions

    def has_permission(self, codename: str) -> bool:
        return codename in self.permissions

    @staticmethod
    async def resolve(
        request: Request,
        session: AsyncSession = Depends(get_session),
        current_user=Depends(get_current_user),
    ) -> DataScope:
        """FastAPI dependency that resolves the current user's data scope."""
        if not current_user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

        permissions = await rbac_service.get_permissions_by_user(session, current_user.id)
        request.state.user_permissions = permissions

        all_branches = "reports.view_all_branches" in permissions or getattr(current_user, "is_superuser", False)

        return DataScope(
            user_id=current_user.id,
            company_id=getattr(current_user, "company_id", None),
            branch_id=getattr(current_user, "branch_id", None),
            all_branches=all_branches,
            permissions=permissions,
        )


# ---------------------------------------------------------------------
# Hierarchy-based override check
# ---------------------------------------------------------------------
async def can_override(
    session: AsyncSession,
    actor_id: uuid.UUID,
    target_id: uuid.UUID,
) -> bool:
    """
    Check if actor can override target's decisions.
    Actor must have a lower hierarchy_level (higher authority) AND
    the 'overrides.override_subordinate' permission.

    Returns True if actor outranks target and has override permission.
    """
    actor_level = await rbac_service.get_user_hierarchy_level(session, actor_id)
    target_level = await rbac_service.get_user_hierarchy_level(session, target_id)

    if actor_level is None or target_level is None:
        return False

    if actor_level >= target_level:
        logger.info(
            f"[AuthZ] Override denied: actor={actor_id} level={actor_level} "
            f"cannot override target={target_id} level={target_level}"
        )
        return False

    actor_perms = await rbac_service.get_permissions_by_user(session, actor_id)
    has_override = "overrides.override_subordinate" in actor_perms

    logger.info(
        f"[AuthZ] Override check: actor={actor_id} level={actor_level} "
        f"target={target_id} level={target_level} "
        f"has_override_perm={has_override} decision={'ALLOW' if has_override else 'DENY'}"
    )
    return has_override


# ---------------------------------------------------------------------
# Utility: manual checks (for services)
# ---------------------------------------------------------------------
async def has_role(user_id, session: AsyncSession, role_name: str) -> bool:
    """Utility for internal services to quickly check if user has a specific role."""
    roles = await rbac_service.get_roles_by_user(session, user_id)
    return role_name.lower() in [r.lower() for r in roles]


async def has_permission(user_id, session: AsyncSession, codename: str) -> bool:
    """Utility for internal services to check if user has a specific permission."""
    permissions = await rbac_service.get_permissions_by_user(session, user_id)
    return codename in permissions
