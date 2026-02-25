"""
app/api/deps.py
HedgeCalc - API Dependencies (Phase II -> Phase X)

Provides:
- OAuth2 Bearer dependency
- get_current_user
- get_current_active_user
- require_superuser
- require_api_key (API key gate + audit context attachment)
- require_user_and_api_key (dual gate)

Security:
- JWT access tokens validated via app.core.security.decode_token
- API keys validated via app.core.security.verify_api_key
"""

from __future__ import annotations

import logging
from typing import Optional, Tuple

import jwt
from fastapi import Depends, HTTPException, status, Header, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token, verify_api_key
from app.db.session import get_session
from app.models.user import User

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


# ----------------------------------------------------------------------
# JWT -> Current User
# ----------------------------------------------------------------------
async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_session),
) -> User:
    try:
        payload = decode_token(token, expected_type="access")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Invalid token claims")

    try:
        user_id = int(sub)
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token subject")

    result = await db.execute(select(User).where(User.id == user_id))
    user: Optional[User] = result.scalars().first()

    if not user or not getattr(user, "is_active", True):
        raise HTTPException(status_code=401, detail="Inactive or missing user")

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    return current_user


async def require_superuser(
    current_user: User = Depends(get_current_user),
) -> User:
    if not getattr(current_user, "is_superuser", False):
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return current_user


# ----------------------------------------------------------------------
# API Key -> Canonical Gate + AUDIT CONTEXT
# ----------------------------------------------------------------------
async def require_api_key(
    request: Request,
    x_api_key: str = Header(..., alias="X-API-Key"),
    db: AsyncSession = Depends(get_session),
):
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing X-API-Key header")

    key = await verify_api_key(x_api_key, db)

    # ? Attach audit context (observer-only)
    request.state.api_key_id = getattr(key, "key_id", None)
    request.state.api_key_user_id = getattr(key, "owner_user_id", None)

    logger.debug(
        "API key accepted key_id=%s owner_user_id=%s",
        request.state.api_key_id,
        request.state.api_key_user_id,
    )

    return key


# ----------------------------------------------------------------------
# ? Dual Gate -> User + API Key
# ----------------------------------------------------------------------
async def require_user_and_api_key(
    current_user: User = Depends(get_current_user),
    api_key=Depends(require_api_key),
) -> Tuple[User, object]:
    logger.info(
        "Dual-auth success user_id=%s api_key_id=%s",
        getattr(current_user, "id", None),
        getattr(api_key, "key_id", None),
    )
    return current_user, api_key
