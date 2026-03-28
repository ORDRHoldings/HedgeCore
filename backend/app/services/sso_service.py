"""
app/services/sso_service.py

WorkOS SSO integration service.

Configuration required:
- WORKOS_API_KEY      — WorkOS API secret key
- WORKOS_CLIENT_ID    — WorkOS client ID

If either is unset, all methods raise WorkOSNotConfiguredError (HTTP 503).
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass

import workos
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.user import User

logger = logging.getLogger(__name__)


class WorkOSNotConfiguredError(RuntimeError):
    """Raised when WORKOS_API_KEY or WORKOS_CLIENT_ID is not set."""


@dataclass
class SSOUserProfile:
    email: str
    full_name: str
    sso_profile_id: str
    organization_id: str | None


def _get_workos_client():
    """Initialise WorkOS client or raise if unconfigured."""
    if not settings.WORKOS_API_KEY or not settings.WORKOS_CLIENT_ID:
        raise WorkOSNotConfiguredError(
            "WorkOS is not configured. Set WORKOS_API_KEY and WORKOS_CLIENT_ID."
        )
    workos.api_key = settings.WORKOS_API_KEY
    workos.client_id = settings.WORKOS_CLIENT_ID
    return workos


async def resolve_or_create_sso_user(
    db: AsyncSession,
    code: str,
) -> User:
    """
    Exchange a WorkOS authorization code for a verified user profile,
    then return the matching ORDR User record (creating a stub if new).
    """
    wos = _get_workos_client()

    auth_response = wos.user_management.authenticate_with_code(
        code=code,
        client_id=settings.WORKOS_CLIENT_ID,
    )
    wos_user = auth_response.user
    org_id = getattr(auth_response, "organization_id", None)

    email = wos_user.email.lower().strip()
    first = getattr(wos_user, "first_name", "") or ""
    last = getattr(wos_user, "last_name", "") or ""
    full_name = f"{first} {last}".strip() or email

    logger.info("SSO authenticate: email=%s org=%s", email, org_id)

    # Look up existing user
    result = await db.execute(
        select(User)
        .where(User.email == email)
        .options(
            selectinload(User.company),
            selectinload(User.branch),
            selectinload(User.department),
        )
    )
    user = result.scalars().first()

    if user:
        logger.info("SSO: returning existing user id=%s", user.id)
        return user

    # Provision stub user — sentinel password cannot match any bcrypt hash
    stub_user = User(
        id=uuid.uuid4(),
        email=email,
        full_name=full_name,
        hashed_password="!sso-no-password!",
        is_active=True,  # auto-activate for SSO users
    )
    db.add(stub_user)
    await db.flush()
    await db.refresh(stub_user)
    logger.info("SSO: created new user id=%s email=%s", stub_user.id, email)
    return stub_user
