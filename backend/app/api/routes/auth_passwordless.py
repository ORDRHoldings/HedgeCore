"""
app/api/routes/auth_passwordless.py

Passwordless auth — email OTP for Free-tier users.

Flow:
  POST /auth/passwordless/start   → generates 6-digit code, stores in DB, (would) send email
  POST /auth/passwordless/verify  → validates code, issues JWT pair

In v1: email delivery is NOT implemented (architecture freeze on external calls).
The code is returned in the response for dev/demo purposes.
Production would send via SES/SendGrid before returning.
"""

import logging
import os
import random
import string
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.db import get_session
from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_session_duration_for_roles,
)
from app.middleware.csrf import generate_csrf_token
from app.models.user import User
from app.services import rbac_service
from app.services.audit_emit import emit_audit

logger = logging.getLogger(__name__)

_IS_PRODUCTION = os.getenv("ENV", "dev").strip().lower() == "production"
_RT_COOKIE_SECURE = _IS_PRODUCTION
# SameSite=None for cross-origin Vercel→Render cookie transmission.
# See backend/app/api/routes/auth.py for rationale.
_RT_COOKIE_SAMESITE = "none" if _IS_PRODUCTION else "lax"
_RT_COOKIE_PATH = "/api/auth/refresh"

router = APIRouter(prefix="/auth/passwordless", tags=["auth-passwordless"])

# In-memory OTP store — in production, use Redis with TTL
# Key: email → {code, expires_at, attempts}
_OTP_STORE: dict[str, dict] = {}

OTP_TTL_SECONDS = 300  # 5 minutes
OTP_MAX_ATTEMPTS = 5


def _generate_otp() -> str:
    return "".join(random.choices(string.digits, k=6))


class StartRequest(BaseModel):
    email: EmailStr


class StartResponse(BaseModel):
    message: str
    # In dev/demo: return code directly. In prod: remove this field.
    code: str | None = None
    expires_in: int = OTP_TTL_SECONDS


class VerifyRequest(BaseModel):
    email: EmailStr
    code: str


async def _get_or_create_free_user(
    email: str, db: AsyncSession
) -> User:
    """Get existing user or create a new free-tier account."""
    stmt = (
        select(User)
        .where(User.email == email.lower())
        .options(
            selectinload(User.company),
            selectinload(User.branch),
            selectinload(User.department),
        )
    )
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if user:
        return user

    # Create minimal free-tier user (no company, no branch)
    import uuid

    from app.core.security import hash_password

    new_user = User(
        id=uuid.uuid4(),
        email=email.lower(),
        hashed_password=hash_password(
            "".join(random.choices(string.ascii_letters + string.digits, k=32))
        ),
        full_name=None,
        is_active=True,
        is_superuser=False,
        plan_tier="lite",
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    return new_user


@router.post("/start", response_model=StartResponse)
async def start_passwordless(
    body: StartRequest,
    db: AsyncSession = Depends(get_session),
) -> StartResponse:
    """
    Initiate passwordless login. Generates a 6-digit OTP.
    In production: sends email (not implemented in v1 architecture freeze).
    In dev/demo: returns the code in the response body.
    """
    email = body.email.lower()
    code = _generate_otp()
    expires_at = datetime.now(UTC) + timedelta(seconds=OTP_TTL_SECONDS)

    _OTP_STORE[email] = {
        "code": code,
        "expires_at": expires_at,
        "attempts": 0,
    }

    logger.info(f"[PASSWORDLESS] OTP generated for {email} (dev mode — code in response)")

    # In production: await send_otp_email(email, code)
    # For v1 demo: include code in response
    include_code = not _IS_PRODUCTION

    return StartResponse(
        message=f"Verification code sent to {email}",
        code=code if include_code else None,
        expires_in=OTP_TTL_SECONDS,
    )


@router.post("/verify")
async def verify_passwordless(
    body: VerifyRequest,
    db: AsyncSession = Depends(get_session),
) -> JSONResponse:
    """
    Verify OTP and issue JWT pair. Creates a free-tier account if user doesn't exist.
    """
    email = body.email.lower()
    code = body.code.strip()

    entry = _OTP_STORE.get(email)

    if not entry:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No verification code was requested. Please start again.",
        )

    if entry["attempts"] >= OTP_MAX_ATTEMPTS:
        del _OTP_STORE[email]
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many incorrect attempts. Please request a new code.",
        )

    if datetime.now(UTC) > entry["expires_at"]:
        del _OTP_STORE[email]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code expired. Please request a new code.",
        )

    if entry["code"] != code:
        entry["attempts"] += 1
        remaining = OTP_MAX_ATTEMPTS - entry["attempts"]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid code. {remaining} attempt(s) remaining.",
        )

    # Code valid — consume it
    del _OTP_STORE[email]

    # Get or create user
    user = await _get_or_create_free_user(email, db)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is suspended. Please contact support.",
        )

    # Build roles/permissions
    roles = await rbac_service.get_user_roles(db, user.id)
    role_names = [r.name for r in roles]
    await rbac_service.get_user_permissions(db, user.id)

    session_duration = get_session_duration_for_roles(role_names)
    access_token = create_access_token(
        {"sub": str(user.id), "email": user.email},
        expires_delta=timedelta(minutes=session_duration),
    )
    refresh_token = create_refresh_token({"sub": str(user.id), "email": user.email})

    csrf_token = generate_csrf_token()
    from app.crud import refresh_token as rt_crud
    await rt_crud.create_refresh_token(db, user_id=user.id, token=refresh_token)

    # PLAN-06: audit event — passwordless OTP verify (new or returning user)
    await emit_audit(
        session=db,
        user=user,
        event_type="SYSTEM",
        description=f"Passwordless login: {user.email}",
        entity_type="session",
        entity_id=str(user.id),
        payload={"email": user.email, "plan_tier": getattr(user, "plan_tier", "lite")},
    )

    plan_tier = getattr(user, "plan_tier", "lite") or "lite"

    response_data = {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": session_duration * 60,
        "user": {
            "id": str(user.id),
            "email": user.email,
            "plan_tier": plan_tier,
            "is_superuser": user.is_superuser,
        },
    }

    response = JSONResponse(content=response_data)
    response.set_cookie(
        key="rt",
        value=refresh_token,
        httponly=True,
        secure=_RT_COOKIE_SECURE,
        samesite=_RT_COOKIE_SAMESITE,
        path=_RT_COOKIE_PATH,
        max_age=7 * 24 * 3600,
    )
    response.set_cookie(
        key="csrf_token",
        value=csrf_token,
        httponly=False,
        secure=_RT_COOKIE_SECURE,
        samesite=_RT_COOKIE_SAMESITE,
        path="/",
    )
    return response
