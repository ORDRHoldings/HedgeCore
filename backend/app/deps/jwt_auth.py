"""
app/deps/jwt_auth.py

HedgeCalc - Phase V/VI
Dependency layer for JWT-based user authentication & admin guard.

Consolidated to use core/security.py (PyJWT) — python-jose removed.
get_current_user is re-exported from core/security for backwards compatibility.
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, status

from app.core.security import get_current_user  # noqa: F401  (re-export)
from app.models.user import User


# ---------------------------------------------------------------------
# 🔐 Admin Guard
# ---------------------------------------------------------------------
async def get_current_admin_user(
    user: User = Depends(get_current_user),
) -> User:
    """
    Enforces superuser/admin role for protected routes.
    Delegates token validation to core/security.get_current_user.
    """
    if not getattr(user, "is_superuser", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required.",
        )
    return user
