"""
app/deps/jwt_auth.py

HedgeCalc - Phase V/VI
Dependency layer for JWT-based user authentication & admin guard.

Provides:
- get_current_user(): validates access token, loads user
- get_current_admin_user(): enforces admin role for privileged routes
"""

from __future__ import annotations

import logging
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_async_session
from app.models.user import User
from app.services.auth import get_user_by_id

logger = logging.getLogger(__name__)
bearer_scheme = HTTPBearer(auto_error=False)


# ---------------------------------------------------------------------
# ? Core User Dependency
# ---------------------------------------------------------------------
async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_async_session),
) -> User:
    """
    Validates Authorization: Bearer <JWT> header, returns user.
    Raises 401 if invalid, expired, or user not found.
    """
    if not creds or creds.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header.",
        )

    token = creds.credentials
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,              # ? FIXED
            algorithms=[settings.JWT_ALGORITHM],
            audience="users",
            issuer="hedgecalc",
        )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload.")
    except JWTError as e:
        logger.warning("JWT decode failed: %s", e)
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

    user = await get_user_by_id(session, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found or inactive.")

    return user


# ---------------------------------------------------------------------
# ?? Admin Guard
# ---------------------------------------------------------------------
async def get_current_admin_user(
    user: User = Depends(get_current_user),
) -> User:
    """
    Enforces admin role for protected routes.
    """
    is_admin = bool(getattr(user, "is_superuser", False))
    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required.",
        )
    return user
