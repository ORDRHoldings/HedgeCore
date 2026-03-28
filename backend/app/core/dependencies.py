from __future__ import annotations

"""
app/core/dependencies.py
HedgeCalc Security Dependencies - Phase V (JWT + UUID-safe)

Provides FastAPI dependencies for protected routes:

- get_current_user: Validate access JWT, parse UUID `sub`, load active user.
  * Uses centralized decoding (app.core.security.decode_token)
  * Enforces generic error messages (no oracle leaks)
  * Structured security logging (no secrets)

These dependencies are designed to be injected into any endpoint that requires
an authenticated user, e.g.:

    @router.get("/users/me", response_model=UserPublic)
    async def read_me(current_user: User = Depends(get_current_user)):
        return UserPublic.model_validate(current_user, from_attributes=True)
"""

import logging
from typing import AsyncGenerator
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.db import get_session
from app.core.security import decode_token
from app.models.user import User

logger = logging.getLogger(__name__)


def _extract_bearer_token(request: Request) -> str:
    """
    Extract Bearer token from Authorization header.
    Returns:
        str: JWT string (no validation performed here)
    Raises:
        HTTPException(401) if header is missing or malformed.
    """
    auth_header = request.headers.get("authorization")
    if not auth_header or not auth_header.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )
    return auth_header.split(" ", 1)[1].strip()


async def _load_active_user(db: AsyncSession, user_id: UUID) -> User:
    """
    Fetch an active user by UUID.
    Returns:
        User: ORM entity
    Raises:
        HTTPException(401): if user is missing or inactive.
    """
    res = await db.execute(
        select(User)
        .where(User.id == user_id)
        .options(
            selectinload(User.company),
            selectinload(User.branch),
            selectinload(User.department),
        )
    )
    user = res.scalars().first()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    return user


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_session),
) -> User:
    """
    Dependency: Validates an *access* token and returns the active User.

    Security properties:
    - Generic error messages (no user existence oracle).
    - JWT decoding delegated to app.core.security.decode_token.
    - UUID-safe subject parsing (no int casts).

    Logging:
    - Logs failures at WARNING/ERROR without leaking secrets or token payloads.
    """
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    try:
        token = _extract_bearer_token(request)
        payload = decode_token(token, expected_type="access")

        sub = payload.get("sub")
        if not sub:
            logger.warning(
                "Auth failure: missing sub (access) ip=%s ua=%s path=%s",
                ip, ua, request.url.path
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload",
            )

        try:
            user_id = UUID(str(sub))
        except Exception:
            logger.warning(
                "Auth failure: invalid sub UUID ip=%s ua=%s path=%s",
                ip, ua, request.url.path
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token subject",
            )

        user = await _load_active_user(db, user_id)

        # Token version validation: reject tokens issued before a version bump
        token_ver = payload.get("ver")
        if token_ver is not None and hasattr(user, "token_version"):
            if user.token_version is not None and token_ver != user.token_version:
                logger.warning(
                    "Auth failure: token version mismatch (token=%s, user=%s) ip=%s ua=%s path=%s",
                    token_ver, user.token_version, ip, ua, request.url.path,
                )
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token revoked",
                )

        return user

    except jwt.ExpiredSignatureError:
        logger.warning(
            "Auth failure: expired access token ip=%s ua=%s path=%s",
            ip, ua, request.url.path
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token expired",
        )

    except jwt.InvalidTokenError:
        logger.warning(
            "Auth failure: invalid access token ip=%s ua=%s path=%s",
            ip, ua, request.url.path
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token",
        )

    except HTTPException:
        # Already mapped to appropriate status and logged above.
        raise

    except Exception as exc:
        logger.exception("Auth dependency error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server error",
        )


async def require_superuser(
    current_user: User = Depends(get_current_user),
) -> User:
    """Dependency: requires is_superuser=True. 403 otherwise."""
    if not getattr(current_user, "is_superuser", False):
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return current_user


async def get_session_with_rls(
    db: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> AsyncGenerator[AsyncSession, None]:
    """
    AsyncSession with PostgreSQL RLS tenant context injected via SET LOCAL.
    Drop-in replacement for get_session on routes accessing positions or calculation_runs.
    """
    from app.core.rls import inject_tenant_rls
    tenant_id = str(current_user.company_id) if current_user.company_id else None
    await inject_tenant_rls(db, tenant_id)
    yield db
