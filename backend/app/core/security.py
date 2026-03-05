"""

app/core/security.py

HedgeCalc Security Core - Phase VII (UUID-safe JWT + NBF Claim + Robust Decode Handling)



Enhancements:

- Adds 'nbf' (Not Before) claim for RFC 7519 compliance

- Graceful invalid token handling (DecodeError, malformed header, etc.)

- Consistent 401 responses for all invalid tokens

- Detailed logging for audit without leaking sensitive data



Phase VIII Add-on (API Keys):

- Canonical verify_api_key() enforcing:

  - format HK_live_{keyid}.{secret}

  - status must be active

  - expires_at must be in the future (UTC-safe)

  - secret hash verification (bcrypt)

"""



from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from uuid import UUID

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jwt import DecodeError, ExpiredSignatureError, InvalidTokenError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings

logger = logging.getLogger(__name__)



# -------------------------------------------------------------------

# ? Time helper

# -------------------------------------------------------------------

def _now_utc() -> datetime:

    return datetime.now(UTC)





# -------------------------------------------------------------------

# ? Password Hashing

# -------------------------------------------------------------------

def hash_password(plain_password: str, _skip_length_check: bool = False) -> str:

    if not _skip_length_check and len(plain_password) < settings.PASSWORD_MIN_LENGTH:

        raise ValueError(

            f"Password must be at least {settings.PASSWORD_MIN_LENGTH} characters"

        )

    salt = bcrypt.gensalt()

    hashed = bcrypt.hashpw(plain_password.encode("utf-8"), salt).decode("utf-8")

    logger.debug("Password hashed successfully.")

    return hashed





def verify_password(plain_password: str, hashed_password: str) -> bool:

    try:

        ok = bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

        logger.debug("Password verification result=%s", ok)

        return ok

    except Exception as exc:

        logger.exception("Password verification error: %s", exc)

        return False





# -------------------------------------------------------------------

# ? High-Privilege Session Duration

# -------------------------------------------------------------------

# Roles that receive a shortened access token window for security.
HIGH_PRIVILEGE_ROLES = {"cfo", "head_of_risk", "cro", "board_observer"}
HIGH_PRIVILEGE_SESSION_MINUTES = 15  # 15-min access token (vs standard 30 min)


def get_session_duration_for_roles(role_names: list[str]) -> int:
    """Return access token lifetime in minutes based on highest privilege role.

    Returns HIGH_PRIVILEGE_SESSION_MINUTES (15) if any assigned role is in
    HIGH_PRIVILEGE_ROLES, otherwise returns the configured default (30 min).
    """
    role_set = {r.lower() for r in role_names}
    if role_set & HIGH_PRIVILEGE_ROLES:
        return HIGH_PRIVILEGE_SESSION_MINUTES
    return settings.ACCESS_EXPIRE_MIN


# -------------------------------------------------------------------

# ? JWT Core Helpers

# -------------------------------------------------------------------

def _encode_jwt(payload: dict[str, Any], expires_in_minutes: int) -> str:

    """

    Encode a JWT with secure defaults and temporal claims.

    Adds `nbf` (Not Before) claim for spec compliance.

    """

    iat = _now_utc()

    exp = iat + timedelta(minutes=expires_in_minutes)

    claims = {

        "iss": settings.TOKEN_ISSUER,

        "aud": settings.TOKEN_AUDIENCE,

        "iat": int(iat.timestamp()),

        "nbf": int(iat.timestamp()),  # ensure token valid immediately

        "exp": int(exp.timestamp()),

        **payload,

    }

    token = jwt.encode(claims, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

    logger.debug(

        "JWT encoded (typ=%s, jti=%s) exp_in=%s min",

        claims.get("typ") or claims.get("type"),

        claims.get("jti"),

        expires_in_minutes,

    )

    return token





def _decode_jwt(token: str) -> dict[str, Any]:

    """Decode JWT safely with explicit error handling for malformed or corrupted tokens."""

    try:

        payload = jwt.decode(

            token,

            settings.JWT_SECRET,

            algorithms=[settings.JWT_ALGORITHM],

            audience=settings.TOKEN_AUDIENCE,

            issuer=settings.TOKEN_ISSUER,

        )

        logger.debug("JWT decoded successfully (jti=%s, typ=%s).", payload.get("jti"), payload.get("typ"))

        return payload

    except ExpiredSignatureError:

        logger.warning("JWT expired.")

        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")

    except (DecodeError, InvalidTokenError, ValueError) as e:

        logger.warning("Malformed or invalid JWT: %s", e)

        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or malformed token")

    except Exception as e:

        logger.exception("Unexpected error decoding JWT: %s", e)

        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")





# -------------------------------------------------------------------

# ? Token Builders (UUID-safe)

# -------------------------------------------------------------------

def _build_claims(

    *,

    sub: str,

    email: str | None,

    token_type: Literal["access", "refresh"],

    token_version: int | None = None,

) -> dict[str, Any]:

    jti = uuid.uuid4().hex

    claims: dict[str, Any] = {

        "sub": sub,  # UUID string

        "jti": jti,

        "typ": token_type,

        "type": token_type,

    }

    if email:

        claims["email"] = email

    if token_version is not None:

        claims["ver"] = int(token_version)

    return claims





def create_access_token(
    sub: str | UUID,
    email: str | None = None,
    token_version: int | None = None,
    mfa_verified: bool = False,
    expires_minutes: int | None = None,
) -> str:

    """Mint short-lived access token (UUID-safe, includes 'nbf').

    Args:
        expires_minutes: Override the default token lifetime in minutes.
                         Used by the login endpoint to apply role-based
                         session duration (e.g. 15 min for high-privilege roles).
                         Defaults to settings.ACCESS_EXPIRE_MIN (30 min).
    """

    sub_str = str(sub)

    claims = _build_claims(sub=sub_str, email=email, token_type="access", token_version=token_version)

    claims["mfa_verified"] = mfa_verified

    duration = expires_minutes if expires_minutes is not None else settings.ACCESS_EXPIRE_MIN

    return _encode_jwt(claims, duration)





def create_refresh_token(

    sub: str | UUID,

    email: str | None = None,

    token_version: int | None = None,

) -> tuple[str, str, datetime]:

    """Mint long-lived refresh token (returns token, jti, expiry)."""

    sub_str = str(sub)

    base_claims = _build_claims(sub=sub_str, email=email, token_type="refresh", token_version=token_version)



    iat = _now_utc()

    exp = iat + timedelta(minutes=settings.REFRESH_EXPIRE_MIN)

    claims = {

        **base_claims,

        "iat": int(iat.timestamp()),

        "nbf": int(iat.timestamp()),  # ensure valid immediately

        "exp": int(exp.timestamp()),

        "iss": settings.TOKEN_ISSUER,

        "aud": settings.TOKEN_AUDIENCE,

    }



    token = jwt.encode(claims, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

    logger.debug("Refresh token created sub=%s jti=%s exp=%s", sub_str, base_claims["jti"], exp.isoformat())

    return token, base_claims["jti"], exp





# -------------------------------------------------------------------

# ? Validation Helpers

# -------------------------------------------------------------------

def decode_token(token: str, expected_type: Literal["access", "refresh"]) -> dict[str, Any]:

    payload = _decode_jwt(token)

    actual_type = payload.get("typ") or payload.get("type")

    if actual_type != expected_type:

        logger.warning("Token type mismatch: expected=%s got=%s", expected_type, actual_type)

        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    return payload





# -------------------------------------------------------------------

# ?? Compatibility Helper

# -------------------------------------------------------------------

def create_token_pair(sub: str | UUID, email: str, token_version: int = 1) -> tuple[str, str]:

    access = create_access_token(sub=sub, email=email, token_version=token_version)

    refresh, _jti, _exp = create_refresh_token(sub=sub, email=email, token_version=token_version)

    logger.info("Issued token pair for user_id=%s version=%s", sub, token_version)

    return access, refresh





# -------------------------------------------------------------------

# ? Convenience Validator

# -------------------------------------------------------------------

def decode_and_validate(token: str, expected_type: str) -> dict[str, Any]:

    return decode_token(token, expected_type=expected_type)  # type: ignore[arg-type]





# -------------------------------------------------------------------

# ? API Key Verification (Canonical)

# -------------------------------------------------------------------

def _redact_key_id(key_id: str) -> str:

    """Redact key_id for logs to avoid leaking full identifiers."""

    if not key_id:

        return "<empty>"

    if len(key_id) <= 8:

        return f"{key_id[:2]}***"

    return f"{key_id[:4]}***{key_id[-4:]}"





def _parse_api_key(raw: str) -> tuple[str, str]:

    """

    Parse HK_live_{keyid}.{secret}

    Returns (key_id, secret).

    """

    if not raw or "." not in raw:

        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key format")



    left, secret = raw.split(".", 1)

    if not left.startswith("HK_live_"):

        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key format")



    key_id = left.strip()

    secret = secret.strip()



    if not key_id or not secret:

        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key format")



    return key_id, secret





async def verify_api_key(raw_api_key: str, db: AsyncSession) -> app.models.api_key.ApiKey:

    """

    Canonical API key verifier.



    Enforces:

    - status == active

    - expires_at is None OR expires_at > now (UTC)

    - secret matches stored hash (bcrypt)



    Returns:

    - ApiKey ORM object if valid



    Raises:

    - 401 for any invalid/expired/revoked key (never 403)

    """

    from app.models.api_key import ApiKey  # local import to avoid circulars



    key_id, secret = _parse_api_key(raw_api_key)



    result = await db.execute(select(ApiKey).where(ApiKey.key_id == key_id))

    key = result.scalars().first()



    if not key:

        logger.warning("API key not found key_id=%s", _redact_key_id(key_id))

        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")



    # Status enforcement

    if getattr(key, "status", None) != "active":

        logger.warning(

            "API key rejected (non-active) key_id=%s status=%s",

            _redact_key_id(key_id),

            getattr(key, "status", None),

        )

        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")



    # Expiry enforcement (UTC-safe)

    expires_at = getattr(key, "expires_at", None)

    if expires_at is not None:

        # Normalize naive timestamps as UTC

        if isinstance(expires_at, datetime) and expires_at.tzinfo is None:

            expires_at = expires_at.replace(tzinfo=UTC)



        if isinstance(expires_at, datetime) and expires_at <= _now_utc():

            logger.warning("API key rejected (expired) key_id=%s", _redact_key_id(key_id))

            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API key expired")



    # Secret verification (bcrypt)

    stored_hash = getattr(key, "secret_hash", None)

    if not stored_hash:

        logger.error("API key missing secret hash key_id=%s", _redact_key_id(key_id))

        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")



    try:

        ok = bcrypt.checkpw(secret.encode("utf-8"), stored_hash.encode("utf-8"))

    except Exception as exc:

        logger.exception("API key secret verification error key_id=%s err=%s", _redact_key_id(key_id), exc)

        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")



    if not ok:

        logger.warning("API key rejected (bad secret) key_id=%s", _redact_key_id(key_id))

        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")



    # Update last_used_at opportunistically (best-effort)

    try:

        key.last_used_at = _now_utc()

        await db.commit()

    except Exception:

        # Never block auth on telemetry

        await db.rollback()

        logger.debug("API key last_used_at update failed (non-fatal) key_id=%s", _redact_key_id(key_id))



    logger.info("API key accepted key_id=%s", _redact_key_id(key_id))

    return key





# -------------------------------------------------------------------

# ? MFA Verified Dependency

# -------------------------------------------------------------------

async def get_mfa_verified(request: Request) -> bool:

    """

    FastAPI dependency: reads mfa_verified claim from Bearer token.

    Returns False (never raises) if token is absent or malformed.

    This allows endpoints to inspect the claim without hard-failing auth.

    """

    auth = request.headers.get("Authorization", "")

    if not auth.startswith("Bearer "):

        return False

    token = auth.split(" ", 1)[1]

    try:

        payload = decode_token(token, expected_type="access")

        return bool(payload.get("mfa_verified", False))

    except Exception:

        return False


# -------------------------------------------------------------------

# ? Current User Dependency

# -------------------------------------------------------------------

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")





async def get_current_user(token: str = Depends(oauth2_scheme)):

    """

    Extract and validate the current user from a JWT access token.

    Handles UUID-safe sub decoding and DB lookup.

    """

    from app.core.db import get_session
    from app.models.user import User



    async for session in get_session():

        if not token:

            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authentication token")



        try:

            payload = decode_token(token, expected_type="access")

        except HTTPException:

            raise  # already structured 401

        except Exception as e:

            logger.warning("Unexpected token validation error: %s", e)

            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")



        sub = payload.get("sub")

        if not sub:

            logger.warning("JWT missing 'sub' claim.")

            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")



        try:

            user_id = UUID(sub)

        except ValueError:

            logger.warning("Invalid UUID in sub: %s", sub)

            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")



        stmt = (

            select(User)

            .where(User.id == user_id)

            .options(

                selectinload(User.company),

                selectinload(User.branch),

                selectinload(User.department),

            )

        )

        result = await session.execute(stmt)

        user = result.scalars().first()



        if not user:

            logger.warning("User not found for ID=%s", user_id)

            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")



        if not user.is_active:

            logger.warning("Inactive user access attempt: %s", user.email)

            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive account")



        logger.debug("Authenticated user: id=%s, email=%s", user.id, user.email)

        return user





oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)





async def get_current_user_optional(token: str | None = Depends(oauth2_scheme_optional)):

    """

    Like get_current_user but returns None instead of raising 401 when no token

    is provided. Used for endpoints that work both authenticated and anonymous

    (e.g., POST /v1/calculate which stores tenant context when available).

    """

    if not token:

        return None

    try:

        from app.core.db import get_session
        from app.models.user import User as _User

        payload = decode_token(token, expected_type="access")

        sub = payload.get("sub")

        if not sub:

            return None

        user_id = UUID(sub)

        async for session in get_session():

            stmt = (

                select(_User)

                .where(_User.id == user_id)

                .options(

                    selectinload(_User.company),

                    selectinload(_User.branch),

                    selectinload(_User.department),

                )

            )

            result = await session.execute(stmt)

            user = result.scalars().first()

            if user and user.is_active:

                return user

        return None

    except Exception:

        return None

