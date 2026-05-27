"""

app/api/routes/auth.py

HedgeCalc Authentication API - Phase V (Final Stable Build)

- JWT + UUID-safe + /me + refresh 401 fix + logout 401 fix

"""



import logging
import os
from uuid import UUID

# Cookie security flags — env-aware so local dev works over HTTP.
# SameSite=None (+ Secure) is required for cross-origin SPA: the Vercel
# frontend (ordr-terminal.vercel.app) calls the Render backend
# (hedgecore.onrender.com), so rt + csrf_token cookies must be sent on
# cross-site requests. SameSite=Strict silently drops them and breaks
# every silent /auth/refresh on page load.
_IS_PRODUCTION = os.getenv("ENV", "dev").strip().lower() == "production"
_RT_COOKIE_SECURE = _IS_PRODUCTION           # False on localhost (HTTP), True in prod (HTTPS)
_RT_COOKIE_SAMESITE = "none" if _IS_PRODUCTION else "lax"
_RT_COOKIE_PATH = "/api/auth/refresh"        # Full path matching the refresh endpoint mount

import fastapi.security as fastapi_security
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.db import get_session
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_session_duration_for_roles,
    hash_password,
    verify_password,
)
from app.crud import refresh_token as rt_crud
from app.middleware.csrf import generate_csrf_token
from app.models.auth_audit_log import (
    AuthEventStatus,
    AuthEventType,
    AuthReasonCode,
    record_auth_event,
)
from app.models.user import User
from app.schemas.auth import RegisterRequest, TokenPair, TokenRefreshRequest
from app.schemas.user import BranchBrief, CompanyBrief, DepartmentBrief, UserMeResponse, UserPublic
from app.services import rbac_service
from app.services.audit_emit import emit_audit

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

    res = await db.execute(

        select(User)

        .where(User.id == user_id)

        .options(

            selectinload(User.company),

            selectinload(User.branch),

            selectinload(User.department),

        )

    )

    user: User | None = res.scalars().first()

    if not user or not user.is_active:

        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    return user





# -------------------------------------------------------------------

# ? Register

# -------------------------------------------------------------------

@router.post("/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)

async def register(request: Request, payload: RegisterRequest, db: AsyncSession = Depends(get_session)) -> UserPublic:

    ip = request.client.host if request.client else None

    ua = request.headers.get("user-agent")



    try:

        existing = await db.execute(select(User).where(User.email == payload.email))

        if existing.scalars().first():

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

        # PLAN-05a: audit event — user registered
        await emit_audit(
            session=db,
            user=user,
            event_type="SYSTEM",
            description=f"User registered: {user.email}",
            entity_type="user",
            entity_id=str(user.id),
            payload={"email": user.email, "ip": ip},
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

# ? Login

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

        user: User | None = res.scalars().first()



        if not user or not verify_password(form_data.password, user.hashed_password):

            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")



        # Determine session duration based on assigned roles (high-privilege = 15 min)
        try:
            user_roles = await rbac_service.get_roles_by_user(db, user.id)
            role_names = [r.name for r in user_roles] if user_roles else []
        except Exception:
            role_names = []

        session_minutes = get_session_duration_for_roles(role_names)

        access_token = create_access_token(
            sub=str(user.id),
            email=user.email,
            expires_minutes=session_minutes,
        )

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

            message=f"Login successful (session={session_minutes}min)",

        )

        # Emit SYSTEM audit event for high-privilege logins with shortened session
        if session_minutes < 30:
            try:
                from sqlalchemy import select as _sa_select

                from app.models.audit_event import GENESIS_HASH, AuditEvent, build_audit_event
                _q = (
                    _sa_select(AuditEvent.event_hash)
                    .where(AuditEvent.company_id == user.company_id)
                    .order_by(AuditEvent.created_at.desc())
                    .limit(1)
                )
                _res = await db.execute(_q)
                _prev_hash = _res.scalars().first() or GENESIS_HASH
                _evt = build_audit_event(
                    event_type="SYSTEM",
                    description=f"High-privilege login: session limited to {session_minutes}min",
                    payload={"roles": role_names, "session_minutes": session_minutes},
                    prev_event_hash=_prev_hash,
                    company_id=user.company_id,
                    branch_id=user.branch_id,
                    actor_id=user.id,
                    actor_email=user.email,
                    entity_type="session",
                    entity_id=str(user.id),
                    ip_address=ip,
                )
                db.add(_evt)
                await db.commit()
            except Exception:
                logger.warning("Failed to emit high-privilege login audit event", exc_info=True)

        # PLAN-05b: audit event — all logins (regardless of privilege level)
        await emit_audit(
            session=db,
            user=user,
            event_type="SYSTEM",
            description=f"User login: {user.email} (session={session_minutes}min)",
            entity_type="session",
            entity_id=str(user.id),
            payload={"roles": role_names, "session_minutes": session_minutes, "ip": ip},
        )

        token_pair = TokenPair(access_token=access_token, refresh_token=refresh_token, token_type="bearer")
        # Set CSRF double-submit cookie on successful login
        csrf_token = generate_csrf_token()
        response = JSONResponse(content=token_pair.model_dump())
        response.set_cookie(
            key="csrf_token",
            value=csrf_token,
            httponly=False,   # Must be readable by JS to send as X-CSRF-Token header
            secure=_RT_COOKIE_SECURE,
            samesite=_RT_COOKIE_SAMESITE,
            path="/",
            max_age=7 * 24 * 60 * 60,  # 7 days — matches refresh token lifetime
        )
        # httpOnly refresh-token cookie (XSS-safe — JS cannot read this)
        response.set_cookie(
            key="rt",
            value=refresh_token,
            httponly=True,
            secure=_RT_COOKIE_SECURE,
            samesite=_RT_COOKIE_SAMESITE,
            path=_RT_COOKIE_PATH,
            max_age=7 * 24 * 60 * 60,
        )
        return response



    except HTTPException:

        raise

    except Exception as exc:

        logger.exception("Unhandled login error: %s", exc)

        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Server error")





# -------------------------------------------------------------------

# ? Refresh (fixed to return 401 on invalid/malformed tokens)

# -------------------------------------------------------------------

@router.post("/refresh", response_model=TokenPair)

async def refresh_tokens(request: Request, body: TokenRefreshRequest, db: AsyncSession = Depends(get_session)) -> JSONResponse:

    ip = request.client.host if request.client else None

    ua = request.headers.get("user-agent")

    # Cookie-first: prefer httpOnly rt cookie (XSS-safe); fall back to body for legacy clients
    raw_refresh = request.cookies.get("rt") or (body.refresh_token if body.refresh_token else None)
    if not raw_refresh:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token provided")

    try:

        payload = decode_token(raw_refresh, expected_type="refresh")

        jti, sub = payload.get("jti"), payload.get("sub")

        if not jti or not sub:

            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Malformed refresh token")



        user_id = UUID(str(sub))

        if not await rt_crud.is_valid_for_refresh(db, jti=jti):

            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token invalid or revoked")



        # Verify user still exists and is active before issuing new tokens.
        # Without this check, a deactivated user could continue refreshing
        # tokens for the full 7-day lifetime of their refresh token.
        _user_row = await db.execute(
            select(User).where(User.id == user_id)
        )
        _refresh_user = _user_row.scalars().first()
        if not _refresh_user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        if not _refresh_user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account deactivated")

        await rt_crud.revoke_by_jti(db, jti=jti)

        access_token = create_access_token(sub=str(user_id))

        new_refresh, new_jti, new_exp = create_refresh_token(sub=str(user_id))

        await rt_crud.create(db, jti=new_jti, user_id=user_id, expires_at=new_exp, ip=ip, user_agent=ua)

        token_pair = TokenPair(access_token=access_token, refresh_token=new_refresh, token_type="bearer")
        response = JSONResponse(content=token_pair.model_dump())
        # Re-issue httpOnly rt cookie on each rotation
        response.set_cookie(
            key="rt",
            value=new_refresh,
            httponly=True,
            secure=_RT_COOKIE_SECURE,
            samesite=_RT_COOKIE_SAMESITE,
            path=_RT_COOKIE_PATH,
            max_age=7 * 24 * 60 * 60,
        )
        return response



    except HTTPException as e:

        raise e

    except jwt.ExpiredSignatureError:

        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired")

    except jwt.InvalidTokenError:

        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    except Exception as exc:

        logger.error("Unhandled refresh error [%s]: %s", type(exc).__name__, exc)

        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error")





# -------------------------------------------------------------------

# ? /auth/me -- full user context with roles, permissions, org

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



        # Resolve plan tier from company settings (default: enterprise)
        plan_tier = "enterprise"
        if getattr(user, "company", None) and getattr(user.company, "settings", None):
            plan_tier = (user.company.settings or {}).get("plan_tier", "enterprise")

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

            plan_tier=plan_tier,

        )



    except HTTPException as e:

        raise e

    except jwt.ExpiredSignatureError:

        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Access token expired")

    except Exception as exc:

        exc_type = type(exc).__name__
        logger.error("Unhandled /me error [%s]: %s", exc_type, exc)

        # Return 500 for non-auth errors (DB errors, etc.) so they are
        # distinguishable from JWT failures (which raise HTTPException 401
        # before reaching this handler).
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )





# -------------------------------------------------------------------

# ? Logout (fixed to correctly return 401 for missing token)

# -------------------------------------------------------------------

# ── SSO ─────────────────────────────────────────────────────────────────────

from pydantic import BaseModel as _BaseModel


class SSOCallbackRequest(_BaseModel):
    code: str


@router.post("/sso/callback", response_model=None)
async def sso_callback(
    request: Request,
    body: SSOCallbackRequest,
    db: AsyncSession = Depends(get_session),
):
    """
    WorkOS SSO callback — exchange code for ORDR JWT.

    Flow:
      1. Exchange WorkOS code -> verified user profile
      2. Resolve/create ORDR User
      3. Issue standard ORDR access+refresh tokens
      4. Emit LOGIN audit event
      5. Return TokenPair (same schema as password login)
    """
    from app.services.sso_service import WorkOSNotConfiguredError, resolve_or_create_sso_user

    try:
        user = await resolve_or_create_sso_user(db=db, code=body.code)
    except WorkOSNotConfiguredError as exc:
        raise HTTPException(
            status_code=503,
            detail="SSO is not configured on this instance.",
        ) from exc
    except Exception as exc:
        logger.warning("SSO callback error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="SSO authentication failed.",
        ) from exc

    # Get user roles for session duration calculation
    try:
        user_roles = await rbac_service.get_roles_by_user(db, user.id)
        role_names = [r.name for r in user_roles] if user_roles else []
    except Exception:
        role_names = []

    session_minutes = get_session_duration_for_roles(role_names)
    access_token = create_access_token(
        sub=str(user.id),
        email=user.email,
        expires_minutes=session_minutes,
    )
    refresh_token_val, jti, exp_at = create_refresh_token(sub=str(user.id), email=user.email)

    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    await rt_crud.create(db, jti=jti, user_id=user.id, expires_at=exp_at, ip=ip, user_agent=ua)

    # Emit audit event
    try:
        await emit_audit(
            session=db,
            user=user,
            event_type="SYSTEM",
            description=f"SSO login: {user.email}",
            entity_type="user",
            entity_id=str(user.id),
            payload={"method": "sso", "roles": role_names, "ip": ip},
        )
    except Exception:
        pass  # non-fatal

    await db.commit()

    token_pair = TokenPair(access_token=access_token, refresh_token=refresh_token_val, token_type="bearer")
    csrf = generate_csrf_token()
    response = JSONResponse(content=token_pair.model_dump())
    response.set_cookie(
        key="csrf_token",
        value=csrf,
        httponly=False,
        secure=_RT_COOKIE_SECURE,
        samesite=_RT_COOKIE_SAMESITE,
        path="/",
        max_age=7 * 24 * 60 * 60,
    )
    response.set_cookie(
        key="rt",
        value=refresh_token_val,
        httponly=True,
        secure=_RT_COOKIE_SECURE,
        samesite=_RT_COOKIE_SAMESITE,
        path=_RT_COOKIE_PATH,
        max_age=7 * 24 * 60 * 60,
    )
    return response


@router.post("/logout", status_code=status.HTTP_200_OK)

async def logout(request: Request, db: AsyncSession = Depends(get_session)) -> dict:

    ip = request.client.host if request.client else None

    try:

        token = _extract_bearer_token(request)

        payload = decode_token(token, expected_type="access")

        user_id = UUID(str(payload.get("sub")))



        await rt_crud.revoke_all_for_user(db, user_id=user_id)

        # PLAN-05c: audit event — logout (fetch user for emit_audit)
        try:
            _logout_user = await _get_user_or_401(db, user_id)
            await emit_audit(
                session=db,
                user=_logout_user,
                event_type="SYSTEM",
                description=f"User logout: {_logout_user.email}",
                entity_type="session",
                entity_id=str(user_id),
                payload={"ip": ip},
            )
        except Exception:
            logger.warning("Failed to emit logout audit event for user_id=%s", user_id)

        response = JSONResponse(content={"detail": "Logged out successfully"})
        # Clear httpOnly rt cookie on logout
        response.delete_cookie(
            key="rt",
            path=_RT_COOKIE_PATH,
            httponly=True,
            secure=_RT_COOKIE_SECURE,
            samesite=_RT_COOKIE_SAMESITE,
        )
        return response



    except HTTPException as e:

        raise e

    except jwt.ExpiredSignatureError:

        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Access token expired")

    except Exception as exc:

        logger.error("Logout error [%s]: %s", type(exc).__name__, exc)

        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error")

