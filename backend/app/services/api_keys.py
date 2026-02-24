"""
app/services/api_keys.py
HedgeCalc - Phase VI
FINAL STABLE VERSION
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import secrets
import uuid
from datetime import datetime, timezone
from typing import Iterable, Optional, Tuple, Union

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from sqlalchemy import select, update, cast, String
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Request, HTTPException, status, Depends

from app.core.config import settings
from app.core.db import get_async_session
from app.models.api_key import ApiKey, ApiKeyStatus

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------
# Argon2id configuration
# ---------------------------------------------------------------------
ph = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=2,
    hash_len=32,
    salt_len=16,
)

# ---------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------

def generate_key_pair() -> Tuple[str, str]:
    key_id = secrets.token_urlsafe(16)
    secret = secrets.token_urlsafe(32)
    return key_id, secret


def format_api_token(key_id: str, secret: str) -> str:
    return f"HK_live_{key_id}.{secret}"


def _derive_digest(secret: str) -> str:
    pepper = settings.API_KEY_PEPPER.encode()
    digest = hmac.new(pepper, secret.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def compute_secret_hash(secret: str) -> str:
    return ph.hash(_derive_digest(secret))


def verify_secret_hash(secret: str, stored_hash: str) -> bool:
    try:
        ph.verify(stored_hash, _derive_digest(secret))
        return True
    except VerifyMismatchError:
        return False
    except Exception:
        return False


# ---------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------

async def create_api_key(
    session: AsyncSession,
    *,
    name: Optional[str],
    scopes: Optional[list[str]],
    owner_user_id: Optional[uuid.UUID],
    expires_at: Optional[datetime],
) -> Tuple[ApiKey, str]:

    key_id, secret = generate_key_pair()

    api_key = ApiKey(
        key_id=key_id,
        secret_hash=compute_secret_hash(secret),
        name=name,
        scopes=scopes or [],
        status=ApiKeyStatus.ACTIVE.value,
        owner_user_id=owner_user_id,
        expires_at=expires_at,
    )

    session.add(api_key)
    await session.commit()
    await session.refresh(api_key)

    return api_key, format_api_token(key_id, secret)


async def revoke_api_key(session: AsyncSession, key_id: str) -> Optional[ApiKey]:

    stmt = select(ApiKey).where(ApiKey.key_id == key_id)
    res = await session.execute(stmt)
    api_key = res.scalar_one_or_none()

    if not api_key:
        return None

    api_key.status = ApiKeyStatus.REVOKED.value
    await session.commit()

    return api_key


# ---------------------------------------------------------------------
# Core verification
# ---------------------------------------------------------------------

async def verify_api_key_header(
    session: AsyncSession,
    header_value: Optional[str],
    required_scopes: Optional[Iterable[str]] = None,
) -> Optional[ApiKey]:

    if not header_value or not header_value.startswith("HK_live_"):
        return None

    token = header_value.removeprefix("HK_live_")

    if "." not in token:
        return None

    key_id, secret = token.split(".", 1)

    stmt = select(ApiKey).where(ApiKey.key_id == key_id)
    res = await session.execute(stmt)
    api_key = res.scalar_one_or_none()

    if not api_key:
        return None

    if str(api_key.status).lower() != ApiKeyStatus.ACTIVE.value.lower():
        return None

    if not verify_secret_hash(secret, api_key.secret_hash):
        return None

    if required_scopes and not api_key.has_scopes(required_scopes):
        return None

    await session.execute(
        update(ApiKey)
        .where(ApiKey.id == api_key.id)
        .values(last_used_at=datetime.now(timezone.utc))
    )
    await session.commit()

    return api_key


# ---------------------------------------------------------------------
# FastAPI-facing validator
# ---------------------------------------------------------------------

async def validate_api_key(
    request: Request,
    session: AsyncSession = Depends(get_async_session),
    required_scopes: Optional[Iterable[str]] = None,
) -> ApiKey:

    header_value = request.headers.get("Authorization")

    if not header_value:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header",
        )

    api_key = await verify_api_key_header(
        session=session,
        header_value=header_value,
        required_scopes=required_scopes,
    )

    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
        )

    return api_key
