"""
app/api/routes/auth.py
HedgeCalc Authentication API – Phase V (Final Stable Build)
- JWT + UUID-safe + /me + refresh 401 fix + logout 401 fix
"""

import logging
from typing import Optional
from uuid import UUID

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
import fastapi.security as fastapi_security
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.crud import refresh_token as rt_crud
from app.models.user import User
from app.schemas.auth import RegisterRequest, TokenPair, TokenRefreshRequest
from app.schemas.user import UserPublic, UserMeResponse, CompanyBrief, BranchBrief, DepartmentBrief
from app.services import rbac_service
from app.models.auth_audit_log import (
    record_auth_event,
    AuthEventType,
    AuthEventStatus,
    AuthReasonCode,
)

try:
    from app.main import limiter  # type: ignore
except Exception:
    limiter = None

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


# -------------------------------------------------------------------
# Runtime-resolved callable to bypass ForwardRef under annotations
# -------------------------------------------------------------------
def OAuth2PasswordRequestForm_dependency():
    """Return dependency callable instance at runtime."""
    return Depends(fastapi_security.OAuth2PasswordRequestForm)


# -------------------------------------------------------------------
# Internal helpers
# -------------------------------------------------------------------
def _extract_bearer_token(request: Request) -> str:
    auth_header = request.headers.get("authorization")
    if not auth_header or not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    return auth_header.split(" ", 1)[1].strip()


async def _get_user_or_401(db: AsyncSession, user_id: UUID) -> User:
    res = await db.execute(select(User).where(User.id == user_id))
    user: Optional[User] = res.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return user


# -------------------------------------------------------------------
# 🧾 Register
# -------------------------------------------------------------------
@router.post("/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
async def register(request: Request, payload: RegisterRequest, db: AsyncSession = Depends(get_session)) -> UserPublic:
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    try:
        existing = await db.execute(select(User).where(User.email == payload.email))
        if existing.scalar_one_or_none():
            msg = "Email already registered"
            await record_auth_event(
                db,
                AuthEventType.REGISTER_FAIL,
                AuthEventStatus.FAIL,
                AuthReasonCode.EMAIL_ALREADY_EXISTS,
                route=request.url.path,
                method=request.method,
                ip_address=ip,
                user_agent=ua,
                message=msg,
            )
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)

        user = User(email=payload.email, hashed_password=hash_password(payload.password), is_active=True)
        db.add(user)
        await db.commit()
        await db.refresh(user)

        await record_auth_event(
            db,
            AuthEventType.REGISTER_SUCCESS,
            AuthEventStatus.SUCCESS,
            AuthReasonCode.OK,
            user_id=user.id,
            route=request.url.path,
            method=request.method,
            ip_address=ip,
            user_agent=ua,
            message="User registered successfully",
        )
        return UserPublic.model_validate(user, from_attributes=True)

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Registration error: %s", exc)
        await record_auth_event(
            db,
            AuthEventType.REGISTER_FAIL,
            AuthEventStatus.FAIL,
            AuthReasonCode.SERVER_ERROR,
            route=request.url.path,
            method=request.method,
            ip_address=ip,
            user_agent=ua,
            message=str(exc),
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Server error")


# -------------------------------------------------------------------
# 🔑 Login
# -------------------------------------------------------------------
def _login_decorator():
    def identity(func):
        return func
    if limiter:
        return limiter.limit("10/minute")
    return identity


@router.post("/login", response_model=TokenPair, summary="Authenticate and obtain access/refresh token pair")
@_login_decorator()
async def login(
    request: Request,
    form_data=OAuth2PasswordRequestForm_dependency(),
    db: AsyncSession = Depends(get_session),
) -> TokenPair:
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    email = form_data.username

    try:
        res = await db.execute(select(User).where(User.email == email))
        user: Optional[User] = res.scalar_one_or_none()

        if not user or not verify_password(form_data.password, user.hashed_password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

        access_token = create_access_token(sub=str(user.id), email=user.email)
        refresh_token, jti, exp_at = create_refresh_token(sub=str(user.id), email=user.email)
        await rt_crud.create(db, jti=jti, user_id=user.id, expires_at=exp_at, ip=ip, user_agent=ua)

        await record_auth_event(
            db,
            AuthEventType.LOGIN_SUCCESS,
            AuthEventStatus.SUCCESS,
            AuthReasonCode.OK,
            user_id=user.id,
            route=request.url.path,
            method=request.method,
            ip_address=ip,
            user_agent=ua,
            message="Login successful",
        )
        return TokenPair(access_token=access_token, refresh_token=refresh_token, token_type="bearer")

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unhandled login error: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Server error")


# -------------------------------------------------------------------
# 🔄 Refresh (fixed to return 401 on invalid/malformed tokens)
# -------------------------------------------------------------------
@router.post("/refresh", response_model=TokenPair)
async def refresh_tokens(request: Request, body: TokenRefreshRequest, db: AsyncSession = Depends(get_session)) -> TokenPair:
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    try:
        payload = decode_token(body.refresh_token, expected_type="refresh")
        jti, sub = payload.get("jti"), payload.get("sub")
        if not jti or not sub:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Malformed refresh token")

        user_id = UUID(str(sub))
        if not await rt_crud.is_valid_for_refresh(db, jti=jti):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token invalid or revoked")

        await rt_crud.revoke_by_jti(db, jti=jti)
        access_token = create_access_token(sub=str(user_id))
        new_refresh, new_jti, new_exp = create_refresh_token(sub=str(user_id))
        await rt_crud.create(db, jti=new_jti, user_id=user_id, expires_at=new_exp, ip=ip, user_agent=ua)
        return TokenPair(access_token=access_token, refresh_token=new_refresh, token_type="bearer")

    except HTTPException as e:
        raise e
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    except Exception as exc:
        logger.error("Unhandled refresh error: %s", exc)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or malformed token")


# -------------------------------------------------------------------
# 🙋 /auth/me — full user context with roles, permissions, org
# -------------------------------------------------------------------
@router.get("/me", response_model=UserMeResponse)
async def read_me(request: Request, db: AsyncSession = Depends(get_session)) -> UserMeResponse:
    try:
        token = _extract_bearer_token(request)
        payload = decode_token(token, expected_type="access")
        sub = payload.get("sub")

        if not sub:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

        user_id = UUID(str(sub))
        user = await _get_user_or_401(db, user_id)

        # Fetch roles, permissions, hierarchy
        roles = await rbac_service.get_roles_by_user(db, user.id)
        permissions = await rbac_service.get_permissions_by_user(db, user.id)
        hierarchy_level = await rbac_service.get_user_hierarchy_level(db, user.id)

        # Build org context from eagerly-loaded relationships
        company_brief = None
        if getattr(user, "company", None):
            company_brief = CompanyBrief.model_validate(user.company, from_attributes=True)

        branch_brief = None
        if getattr(user, "branch", None):
            branch_brief = BranchBrief.model_validate(user.branch, from_attributes=True)

        department_brief = None
        if getattr(user, "department", None):
            department_brief = DepartmentBrief.model_validate(user.department, from_attributes=True)

        return UserMeResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            job_title=getattr(user, "job_title", None),
            is_active=user.is_active,
            is_superuser=user.is_superuser,
            created_at=user.created_at,
            company=company_brief,
            branch=branch_brief,
            department=department_brief,
            roles=roles,
            permissions=permissions,
            hierarchy_level=hierarchy_level,
        )

    except HTTPException as e:
        raise e
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Access token expired")
    except Exception as exc:
        logger.error("Unhandled /me error: %s", exc)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or malformed token")


# -------------------------------------------------------------------
# 🚪 Logout (fixed to correctly return 401 for missing token)
# -------------------------------------------------------------------
@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(request: Request, db: AsyncSession = Depends(get_session)) -> dict:
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    try:
        token = _extract_bearer_token(request)
        payload = decode_token(token, expected_type="access")
        user_id = UUID(str(payload.get("sub")))

        await rt_crud.revoke_all_for_user(db, user_id=user_id)
        return {"detail": "Logged out successfully"}

    except HTTPException as e:
        raise e
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Access token expired")
    except Exception as exc:
        logger.error("Logout error: %s", exc)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing token")
