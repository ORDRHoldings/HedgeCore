"""
app/api/routes/users.py
HedgeCalc - Users API (Phase II)

Route(s):
  - GET /users/me  -> return the current authenticated user's public profile

Notes:
- Requires a valid ACCESS token (typ="access") via Bearer auth.
- User resolution is handled by app.api.deps.get_current_user.
- Response uses UserPublic schema (from_attributes=True).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends

from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.user import UserPublic

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserPublic, summary="Get current authenticated user")
async def read_me(current_user: User = Depends(get_current_user)) -> UserPublic:
    """
    Returns the authenticated user's public profile.
    """
    logger.debug("Users.me requested user_id=%s email=%s", current_user.id, current_user.email)
    return UserPublic.model_validate(current_user)
