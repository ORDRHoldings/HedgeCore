"""POST /v1/mfa/* -- TOTP multi-factor authentication management.

Endpoints:
  POST   /v1/mfa/setup     -- Generate TOTP secret for authenticated user
  POST   /v1/mfa/activate  -- Confirm first TOTP code to enable MFA
  POST   /v1/mfa/verify    -- Verify TOTP and receive mfa_verified=True token
  DELETE /v1/mfa/disable   -- Disable MFA (requires valid TOTP to confirm)
  GET    /v1/mfa/status    -- Return current user's MFA status
"""

from __future__ import annotations

import json
import logging
import secrets
from datetime import UTC, datetime

import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import create_access_token, get_current_user
from app.models.user import User
from app.models.user_mfa import UserMFA
from app.services.audit_emit import emit_audit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/mfa", tags=["v1-mfa"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------


class MFASetupResponse(BaseModel):
    provisioning_uri: str
    secret: str
    backup_codes: list[str]


class TOTPCodeRequest(BaseModel):
    totp_code: str = Field(..., min_length=6, max_length=8, description="6-digit TOTP code")


class MFAVerifyResponse(BaseModel):
    access_token: str
    mfa_verified: bool


class MFAStatusResponse(BaseModel):
    is_enabled: bool
    enrolled_at: str | None = None


class MFAMessageResponse(BaseModel):
    message: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _now_utc() -> datetime:
    return datetime.now(UTC)


async def _get_or_none(session: AsyncSession, user_id) -> UserMFA | None:
    """Return the UserMFA row for this user, or None."""
    result = await session.execute(
        select(UserMFA).where(UserMFA.user_id == user_id)
    )
    return result.scalars().first()


def _generate_backup_codes() -> list[str]:
    """Generate 8 one-time backup codes (10-char hex, uppercase)."""
    return [secrets.token_hex(5).upper() for _ in range(8)]


def _totp_verify(secret: str, code: str) -> bool:
    """Verify a 6-digit TOTP code with valid_window=1 (±30 s)."""
    return pyotp.TOTP(secret).verify(code, valid_window=1)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/setup", response_model=MFASetupResponse, status_code=200)
async def mfa_setup(
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Generate a TOTP secret for the authenticated user.
    Returns a provisioning_uri (for QR code display), the raw secret,
    and 8 one-time backup codes.

    If MFA is already enabled, returns 409.
    """
    mfa_row = await _get_or_none(session, current_user.id)

    if mfa_row and mfa_row.is_enabled:
        raise HTTPException(status_code=409, detail="MFA already enabled")

    secret = pyotp.random_base32()
    backup_codes = _generate_backup_codes()

    if mfa_row is None:
        mfa_row = UserMFA(
            user_id=current_user.id,
            totp_secret=secret,
            is_enabled=False,
            backup_codes=json.dumps(backup_codes),
        )
        session.add(mfa_row)
    else:
        # Re-setup: replace secret and reset state
        mfa_row.totp_secret = secret
        mfa_row.is_enabled = False
        mfa_row.enrolled_at = None
        mfa_row.last_verified_at = None
        mfa_row.backup_codes = json.dumps(backup_codes)

    await session.commit()

    provisioning_uri = pyotp.TOTP(secret).provisioning_uri(
        name=current_user.email,
        issuer_name="ORDR Terminal",
    )

    logger.info("MFA setup initiated for user_id=%s", current_user.id)

    return MFASetupResponse(
        provisioning_uri=provisioning_uri,
        secret=secret,
        backup_codes=backup_codes,
    )


@router.post("/activate", response_model=MFAMessageResponse, status_code=200)
async def mfa_activate(
    data: TOTPCodeRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Confirm the first TOTP code to activate MFA.
    User must have called /setup first.
    """
    mfa_row = await _get_or_none(session, current_user.id)
    if not mfa_row:
        raise HTTPException(
            status_code=404,
            detail="MFA not set up. Call POST /v1/mfa/setup first.",
        )

    if mfa_row.is_enabled:
        raise HTTPException(status_code=409, detail="MFA already enabled")

    if not _totp_verify(mfa_row.totp_secret, data.totp_code):
        raise HTTPException(status_code=400, detail="Invalid TOTP code")

    mfa_row.is_enabled = True
    mfa_row.enrolled_at = _now_utc()
    mfa_row.last_verified_at = _now_utc()
    await session.commit()

    logger.info("MFA activated for user_id=%s", current_user.id)

    # PLAN-03a: audit event — MFA activated
    await emit_audit(
        session=session,
        user=current_user,
        event_type="SECURITY",
        description=f"MFA activated for {current_user.email}",
        entity_type="user_mfa",
        entity_id=str(current_user.id),
        payload={"email": current_user.email},
    )

    return MFAMessageResponse(message="MFA activated successfully")


@router.post("/verify", response_model=MFAVerifyResponse, status_code=200)
async def mfa_verify(
    data: TOTPCodeRequest,
    request: Request,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Verify a TOTP code and return a new access token with mfa_verified=True.
    """
    mfa_row = await _get_or_none(session, current_user.id)
    if not mfa_row:
        raise HTTPException(
            status_code=404,
            detail="MFA not set up. Call POST /v1/mfa/setup first.",
        )

    if not mfa_row.is_enabled:
        raise HTTPException(status_code=400, detail="MFA not enabled")

    if not _totp_verify(mfa_row.totp_secret, data.totp_code):
        raise HTTPException(status_code=400, detail="Invalid TOTP code")

    mfa_row.last_verified_at = _now_utc()
    await session.commit()

    new_token = create_access_token(
        sub=current_user.id,
        email=current_user.email,
        token_version=current_user.token_version,
        mfa_verified=True,
    )

    logger.info("MFA verified for user_id=%s", current_user.id)

    return MFAVerifyResponse(access_token=new_token, mfa_verified=True)


@router.delete("/disable", response_model=MFAMessageResponse, status_code=200)
async def mfa_disable(
    data: TOTPCodeRequest,
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """
    Disable MFA. Requires a valid TOTP code to confirm.
    """
    mfa_row = await _get_or_none(session, current_user.id)
    if not mfa_row or not mfa_row.is_enabled:
        raise HTTPException(status_code=400, detail="MFA not enabled")

    if not _totp_verify(mfa_row.totp_secret, data.totp_code):
        raise HTTPException(status_code=400, detail="Invalid TOTP code")

    mfa_row.is_enabled = False
    await session.commit()

    logger.info("MFA disabled for user_id=%s", current_user.id)

    # PLAN-03b: audit event — MFA disabled (security-critical)
    await emit_audit(
        session=session,
        user=current_user,
        event_type="SECURITY",
        description=f"MFA disabled for {current_user.email}",
        entity_type="user_mfa",
        entity_id=str(current_user.id),
        payload={"email": current_user.email},
    )

    return MFAMessageResponse(message="MFA disabled")


@router.get("/status", response_model=MFAStatusResponse, status_code=200)
async def mfa_status(
    session: AsyncSession = Depends(get_async_session),
    current_user: User = Depends(get_current_user),
):
    """Return the current user's MFA enrollment status."""
    mfa_row = await _get_or_none(session, current_user.id)
    if not mfa_row:
        return MFAStatusResponse(is_enabled=False, enrolled_at=None)

    return MFAStatusResponse(
        is_enabled=mfa_row.is_enabled,
        enrolled_at=mfa_row.enrolled_at.isoformat() if mfa_row.enrolled_at else None,
    )
