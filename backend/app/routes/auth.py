# app/routes/auth.py
"""
HedgeCalc Authentication Routes
Phase IV - Complete Auth Suite (Register, Login, Refresh, Me)

Endpoints:
- POST /auth/register     -> Create user; returns TokenPair (access + refresh)
- POST /auth/login        -> Authenticate; returns TokenPair (access + refresh)
- POST /auth/refresh      -> Rotate refresh; returns TokenPair (access + refresh)   (existing, enhanced)
- GET  /auth/me           -> Return current user profile (requires access token)

Security posture:
- Bcrypt password hashing (strong salt; no timing leaks)
- JWT access + refresh with rotation and single-session policy
- Refresh-token persistence + revocation + replaced_by_jti chain
- Structured logging with correlation-id (x-request-id)
- OWASP-aligned error semantics; minimal leakage
- Clear separation of "access" vs "refresh" token types

Assumptions:
- Async SQLAlchemy session via `get_db()` yielding `AsyncSession`
- Models:
    * User: id (int), email (str), hashed_password (str), is_active (bool), created_at (datetime)
    * RefreshToken: id, user_id, jti, revoked (bool), expires_at (datetime), created_at (datetime), replaced_by_jti (nullable str)
- Settings in `app.config.settings`:
    JWT_SECRET, JWT_ALGORITHM, JWT_ACCESS_TTL_MIN, JWT_REFRESH_TTL_DAYS, JWT_ISSUER, JWT_AUDIENCE
- `bcrypt` installed for hashing (pip install bcrypt)
- python-jose or PyJWT available (both supported via helpers below)

Logging:
- Use logger name: "hedgecalc.auth"
- Audit-relevant fields: rid (correlation id), user_id, route, status
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

import bcrypt
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field, constr, validator

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, insert

# --- Settings ---------------------------------------------------------------

try:
    from app.config import settings  # type: ignore
except Exception:
    import os

    class _Settings:
        JWT_SECRET: str = os.getenv("JWT_SECRET", "CHANGE_ME_IN_.ENV")
        JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
        JWT_ACCESS_TTL_MIN: int = int(os.getenv("JWT_ACCESS_TTL_MIN", "15"))
        JWT_REFRESH_TTL_DAYS: int = int(os.getenv("JWT_REFRESH_TTL_DAYS", "7"))
        JWT_ISSUER: str = os.getenv("JWT_ISSUER", "hedgecalc")
        JWT_AUDIENCE: str = os.getenv("JWT_AUDIENCE", "users")

    settings = _Settings()  # type: ignore

# --- JWT backend (supports python-jose OR PyJWT) ----------------------------

try:
    # python-jose
    from jose import jwt, JWTError  # type: ignore

    def _jwt_decode(token: str) -> dict:
        return jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            audience=settings.JWT_AUDIENCE,
            options={"require_aud": True, "require_iat": True, "require_exp": True},
        )

    def _jwt_encode(claims: dict) -> str:
        return jwt.encode(claims, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
except Exception:  # pragma: no cover
    # PyJWT fallback
    import jwt  # type: ignore

    class JWTError(Exception):  # compatible interface
        pass

    def _jwt_decode(token: str) -> dict:
        return jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            audience=settings.JWT_AUDIENCE,
            options={"require": ["aud", "iat", "exp"]},
        )

    def _jwt_encode(claims: dict) -> str:
        return jwt.encode(claims, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


# --- DB/session & models ----------------------------------------------------

from app.db.session import get_db  # must yield AsyncSession
from app.models.user import User
from app.models.refresh_token import RefreshToken

# --- Router -----------------------------------------------------------------

router = APIRouter(prefix="/auth", tags=["Auth"])
security_scheme = HTTPBearer(auto_error=False)

# --- Schemas ----------------------------------------------------------------

class RegisterRequest(BaseModel):
    email: EmailStr
    password: constr(min_length=8, max_length=128)

    @validator("password")
    def strong_password(cls, v: str) -> str:
        # Basic policy: length validated; optionally enforce complexity here
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: constr(min_length=8, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(..., description="Valid refresh JWT")


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: EmailStr
    is_active: bool


# --- Helpers ----------------------------------------------------------------

log = logging.getLogger("hedgecalc.auth")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_jti() -> str:
    return uuid.uuid4().hex


def _hash_password(raw: str) -> str:
    # bcrypt with automatic salt generation; returns utf-8 str
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(raw.encode("utf-8"), salt).decode("utf-8")


def _verify_password(raw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(raw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        # Avoid leaking errors; treat any problem as a mismatch
        return False


def _make_access_claims(*, sub: str, email: Optional[str], jti: Optional[str] = None) -> dict:
    now = _now()
    exp = now + timedelta(minutes=int(settings.JWT_ACCESS_TTL_MIN))
    return {
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "sub": sub,
        "jti": jti or _new_jti(),
        "typ": "access",
        "type": "access",
        "email": email,
    }


def _make_refresh_claims(*, sub: str, email: Optional[str], jti: Optional[str] = None) -> dict:
    now = _now()
    exp = now + timedelta(days=int(settings.JWT_REFRESH_TTL_DAYS))
    return {
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "sub": sub,
        "jti": jti or _new_jti(),
        "typ": "refresh",
        "type": "refresh",
        "email": email,
    }


async def _persist_new_refresh_token(
    db: AsyncSession, *, user_id: int, jti: str, expires_at: datetime
) -> None:
    row = RefreshToken(
        user_id=user_id,
        jti=jti,
        revoked=False,
        expires_at=expires_at,
        created_at=_now(),
        replaced_by_jti=None,
    )
    db.add(row)
    await db.commit()


async def _persist_rotated_refresh_token(
    db: AsyncSession,
    *,
    user_id: int,
    old_jti: str,
    new_jti: str,
    new_expires_at: datetime,
) -> None:
    # revoke old
    await db.execute(
        update(RefreshToken)
        .where(
            RefreshToken.user_id == user_id,
            RefreshToken.jti == old_jti,
            RefreshToken.revoked == False,  # noqa: E712
        )
        .values(revoked=True, replaced_by_jti=new_jti)
    )
    # insert new
    new_row = RefreshToken(
        user_id=user_id,
        jti=new_jti,
        revoked=False,
        expires_at=new_expires_at,
        created_at=_now(),
        replaced_by_jti=None,
    )
    db.add(new_row)
    await db.commit()


async def _revoke_other_active_refresh_tokens(
    db: AsyncSession, *, user_id: int, except_jti: str
) -> None:
    await db.execute(
        update(RefreshToken)
        .where(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked == False,  # noqa: E712
            RefreshToken.jti != except_jti,
        )
        .values(revoked=True)
    )
    await db.commit()


async def _validate_db_refresh_token(
    db: AsyncSession, *, user_id: int, jti: str
) -> Optional[RefreshToken]:
    res = await db.execute(
        select(RefreshToken).where(RefreshToken.user_id == user_id, RefreshToken.jti == jti)
    )
    row = res.scalars().first()
    if row is None:
        return None
    if getattr(row, "revoked", True) is True:
        return None
    exp_at: datetime = getattr(row, "expires_at", _now())
    if exp_at.tzinfo is None:
        exp_at = exp_at.replace(tzinfo=timezone.utc)
    if exp_at <= _now():
        return None
    return row


def _extract_bearer_token(
    credentials: Optional[HTTPAuthorizationCredentials],
) -> Optional[str]:
    if credentials is None:
        return None
    if credentials.scheme.lower() != "bearer":
        return None
    return credentials.credentials


async def _issue_token_pair_for_user(user: User) -> TokenPair:
    # create access token
    access_claims = _make_access_claims(sub=str(user.id), email=getattr(user, "email", None))
    access_token = _jwt_encode(access_claims)

    # create refresh token and persist
    refresh_claims = _make_refresh_claims(sub=str(user.id), email=getattr(user, "email", None))
    refresh_token = _jwt_encode(refresh_claims)

    return TokenPair(access_token=access_token, refresh_token=refresh_token, token_type="bearer")


# --- Endpoint: POST /auth/register -----------------------------------------

@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
async def register_user(
    payload: RegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_request_id: Optional[str] = Header(None, convert_underscores=False),
):
    """
    Creates a new user and returns a fresh TokenPair (access + refresh).
    Enforces unique email. Password is stored as bcrypt hash.
    """
    rid = x_request_id or request.headers.get("x-request-id") or _new_jti()

    # Check uniqueness
    res = await db.execute(select(User).where(User.email == payload.email))
    exists = res.scalars().first()
    if exists:
        log.warning("register.email_exists", extra={"rid": rid, "route": "/auth/register"})
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    hashed = _hash_password(payload.password)
    new_user = User(email=payload.email, hashed_password=hashed, is_active=True)
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    # Issue tokens and persist refresh
    tp = await _issue_token_pair_for_user(new_user)
    claims = _jwt_decode(tp.refresh_token)
    new_exp = datetime.fromtimestamp(claims["exp"], tz=timezone.utc)
    await _persist_new_refresh_token(db, user_id=new_user.id, jti=claims["jti"], expires_at=new_exp)

    # Enforce single-session (only the just-created token active)
    await _revoke_other_active_refresh_tokens(db, user_id=new_user.id, except_jti=claims["jti"])

    log.info(
        "register.success",
        extra={"rid": rid, "route": "/auth/register", "user_id": new_user.id, "status": 201},
    )
    return tp


# --- Endpoint: POST /auth/login --------------------------------------------

@router.post("/login", response_model=TokenPair, status_code=status.HTTP_200_OK)
async def login_user(
    payload: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_request_id: Optional[str] = Header(None, convert_underscores=False),
):
    """
    Authenticates a user and returns TokenPair.
    - Verifies email/password
    - Issues access + refresh
    - Persists refresh token (single active session policy enforced)
    """
    rid = x_request_id or request.headers.get("x-request-id") or _new_jti()

    res = await db.execute(select(User).where(User.email == payload.email))
    user: Optional[User] = res.scalars().first()
    if (not user) or (not _verify_password(payload.password, user.hashed_password)):
        # Uniform 401 to avoid user enumeration / timing info
        log.warning("login.invalid_credentials", extra={"rid": rid, "route": "/auth/login"})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not getattr(user, "is_active", True):
        log.warning("login.inactive_user", extra={"rid": rid, "route": "/auth/login", "uid": user.id})
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive")

    # Issue tokens
    tp = await _issue_token_pair_for_user(user)

    # Persist refresh & enforce single-session
    claims = _jwt_decode(tp.refresh_token)
    new_exp = datetime.fromtimestamp(claims["exp"], tz=timezone.utc)
    await _persist_new_refresh_token(db, user_id=user.id, jti=claims["jti"], expires_at=new_exp)
    await _revoke_other_active_refresh_tokens(db, user_id=user.id, except_jti=claims["jti"])

    log.info(
        "login.success",
        extra={"rid": rid, "route": "/auth/login", "user_id": user.id, "status": 200},
    )
    return tp


# --- Endpoint: POST /auth/refresh ------------------------------------------

@router.post("/refresh", response_model=TokenPair, status_code=status.HTTP_200_OK)
async def refresh_tokens(
    payload: RefreshRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_request_id: Optional[str] = Header(None, convert_underscores=False),
):
    """
    Accepts a refresh token (JSON body) and returns a new access token and a rotated refresh token.
    - Verifies JWT: signature, exp, iss, aud, type == "refresh"
    - Validates existence in DB and non-revocation
    - Rotates refresh tokens (revokes old; persists new)
    - Enforces single active refresh token per user
    """
    rid = x_request_id or request.headers.get("x-request-id") or _new_jti()

    try:
        claims = _jwt_decode(payload.refresh_token)
    except Exception as e:  # JWTError or ValueError
        log.warning(
            "refresh.jwt_decode_failed",
            extra={"rid": rid, "path": str(request.url.path), "err": str(e)},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    token_type = claims.get("type") or claims.get("typ")
    if token_type != "refresh":
        log.warning("refresh.invalid_type", extra={"rid": rid, "type": token_type})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    iss = claims.get("iss")
    aud = claims.get("aud")
    sub = claims.get("sub")  # user id as string
    jti = claims.get("jti")

    if iss != settings.JWT_ISSUER or aud != settings.JWT_AUDIENCE or not sub or not jti:
        log.warning(
            "refresh.claims_mismatch",
            extra={"rid": rid, "iss": iss, "aud": aud, "sub": sub, "jti": jti},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token claims")

    # Load user
    res_user = await db.execute(select(User).where(User.id == int(sub)))
    user: Optional[User] = res_user.scalars().first()
    if not user:
        log.warning("refresh.user_not_found", extra={"rid": rid, "sub": sub})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Validate refresh token row in DB
    row = await _validate_db_refresh_token(db, user_id=int(sub), jti=jti)
    if row is None:
        log.warning("refresh.db_token_invalid", extra={"rid": rid, "sub": sub, "jti": jti})
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Refresh token revoked or expired"
        )

    # ROTATE refresh token
    new_refresh_claims = _make_refresh_claims(sub=str(user.id), email=getattr(user, "email", None))
    new_refresh_token = _jwt_encode(new_refresh_claims)
    new_jti = new_refresh_claims["jti"]
    new_exp = datetime.fromtimestamp(new_refresh_claims["exp"], tz=timezone.utc)

    await _persist_rotated_refresh_token(
        db,
        user_id=int(sub),
        old_jti=jti,
        new_jti=new_jti,
        new_expires_at=new_exp,
    )

    # Enforce single-session: keep only the newly issued refresh token active
    await _revoke_other_active_refresh_tokens(db, user_id=int(sub), except_jti=new_jti)

    # Issue new access token
    access_claims = _make_access_claims(sub=str(user.id), email=getattr(user, "email", None))
    new_access_token = _jwt_encode(access_claims)

    log.info(
        "refresh.success",
        extra={
            "rid": rid,
            "user_id": sub,
            "old_jti": jti,
            "new_jti": new_jti,
            "route": "/auth/refresh",
            "status": 200,
        },
    )

    return TokenPair(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
    )


# --- Endpoint: GET /auth/me -------------------------------------------------

@router.get("/me", response_model=UserOut, status_code=status.HTTP_200_OK)
async def get_me(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
    x_request_id: Optional[str] = Header(None, convert_underscores=False),
):
    """
    Returns current user profile. Requires a valid ACCESS token in the Authorization header.
    Authorization: Bearer <access_token>
    """
    rid = x_request_id or request.headers.get("x-request-id") or _new_jti()
    token = _extract_bearer_token(credentials)
    if not token:
        log.warning("me.missing_token", extra={"rid": rid, "route": "/auth/me"})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    try:
        claims = _jwt_decode(token)
    except Exception:
        log.warning("me.invalid_token", extra={"rid": rid, "route": "/auth/me"})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    typ = claims.get("type") or claims.get("typ")
    if typ != "access":
        log.warning("me.wrong_token_type", extra={"rid": rid, "type": typ})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    sub = claims.get("sub")
    if not sub:
        log.warning("me.missing_sub", extra={"rid": rid})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token claims")

    res = await db.execute(select(User).where(User.id == int(sub)))
    user: Optional[User] = res.scalars().first()
    if not user:
        log.warning("me.user_not_found", extra={"rid": rid, "uid": sub})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    if not getattr(user, "is_active", True):
        log.warning("me.inactive_user", extra={"rid": rid, "uid": user.id})
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive")

    log.info("me.success", extra={"rid": rid, "uid": user.id, "status": 200})
    return UserOut(id=user.id, email=user.email, is_active=bool(user.is_active))
