# app/core/authz.py
"""
Authorization layer for HedgeCalc (RBAC middleware and utilities).

Integrates JWT authentication with Role-Based Access Control (RBAC).

Features:
- Role validation decorator (`require_roles`)
- Dependency to fetch current user's roles from the DB
- Caching of roles per request (stored in request.state)
- Strict 403 enforcement with structured error and audit logging

Security:
- Default deny principle (access must be explicitly granted)
- All decisions logged with request_id, user_id, roles, and route
"""

from __future__ import annotations

import logging
from functools import wraps
from typing import List, Callable, Awaitable

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
) -> List[str]:
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
# Example: manual check (for services)
# ---------------------------------------------------------------------
async def has_role(user_id: int, session: AsyncSession, role_name: str) -> bool:
    """Utility for internal services to quickly check if user has a specific role."""
    roles = await rbac_service.get_roles_by_user(session, user_id)
    return role_name.lower() in [r.lower() for r in roles]
