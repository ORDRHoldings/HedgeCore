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
from collections.abc import AsyncGenerator
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.db import get_session
from app.core.rls import inject_tenant_rls, set_tenant_rls_context
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
        tenant_id = str(user.company_id) if user.company_id else None
        bypass_tenant_rls = bool(getattr(user, "is_superuser", False))
        set_tenant_rls_context(tenant_id, bypass=bypass_tenant_rls)
        await inject_tenant_rls(db, tenant_id, bypass=bypass_tenant_rls)

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
    await inject_tenant_rls(db, tenant_id, bypass=bool(getattr(current_user, "is_superuser", False)))
    yield db


# Companion guard to `assert_api_key_routes_safe` (in app/deps/api_key_auth.py).
# Where that guard catches `get_api_key_principal` on non-allowlisted routes,
# this one catches the inverse: any route that has *neither* `get_current_user`
# nor `get_api_key_principal` in its dependant tree must be explicitly listed
# as a no-auth-needed route. This is the structural defense that would have
# caught RISK-AUTH-RLS-02 (dashboard's `_resolve_user` JWT path) at startup
# rather than letting it silently empty RLS-forced tables in production.
#
# Each entry MUST have a justification comment. Reviewers are expected to
# challenge new additions — adding a route here is a security decision.
NO_AUTH_ROUTE_ALLOWLIST: frozenset[str] = frozenset({
    # ── Root + OpenAPI docs ────────────────────────────────────────────────
    "/",
    "/api/docs",
    "/api/redoc",

    # ── Health / system diagnostics (no business data) ─────────────────────
    "/api/health",
    "/api/kernel/health",
    "/api/system/health",
    "/api/system/health/deep",
    "/api/system/schema-health",  # API-key gated via APIKeyAuthMiddleware

    # ── Auth issuance (these endpoints *produce* tokens; cannot require one) ─
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/refresh",
    "/api/auth/register",
    "/api/auth/me",  # decodes JWT directly; safe — does not read RLS-forced tables
    "/api/auth/passwordless/start",
    "/api/auth/passwordless/verify",
    "/api/auth/sso/callback",
    "/api/v1/signup",

    # ── Webhooks (auth via shared secret / signature, not JWT) ─────────────
    "/api/v1/billing/webhook",
    "/api/v1/connectors/oauth/callback",
    "/api/v1/connectors/{provider}/webhook",

    # ── Public market data (read-only quotes; API-key middleware-gated) ────
    "/api/v1/market-data/live/equity-quotes",
    "/api/v1/market-data/live/fx-change",
    "/api/v1/market-data/live/fx-rates",
    "/api/v1/market-data/live/macro",
    "/api/v1/market-data/live/quote",
    "/api/v1/market/fx/rates",
    "/api/v1/market/sectors",
    "/api/v1/public/chart-data/{symbol}",

    # ── Seed / demo-reset (gated by APIKeyAuthMiddleware, X-API-Key) ───────
    "/api/v1/seed/company",
    "/api/v1/seed/demo-reset",
    "/api/v1/seed/migrate-schema",
    "/api/v1/seed/reset-passwords",

    # ── Stateless engine endpoint (no DB write; RBAC enforced internally) ──
    "/api/hedge/run",
})


def assert_routes_have_canonical_auth(
    app,
    allowlist: frozenset[str] = NO_AUTH_ROUTE_ALLOWLIST,
) -> None:
    """Fail closed if any route lacks both canonical auth dependencies.

    Every APIRoute must satisfy one of:
      1. `get_current_user` is in its dependant tree (JWT path), OR
      2. `get_api_key_principal` is in its dependant tree (API-key path), OR
      3. The route's path is in NO_AUTH_ROUTE_ALLOWLIST with justification.

    This is the structural complement to `assert_api_key_routes_safe`. Together
    they pin both ends of the auth surface: API-key auth cannot land on a
    non-diagnostic route (RLS-01), and no route can quietly skip the canonical
    auth path that injects RLS context (RLS-02).
    """
    from fastapi.routing import APIRoute

    from app.deps.api_key_auth import get_api_key_principal

    def _has_dep(dependant, target) -> bool:
        if dependant is None:
            return False
        if dependant.call is target:
            return True
        for sub in dependant.dependencies:
            if _has_dep(sub, target):
                return True
        return False

    violations: list[str] = []
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        dep = getattr(route, "dependant", None)
        if _has_dep(dep, get_current_user) or _has_dep(dep, get_api_key_principal):
            continue
        if route.path in allowlist:
            continue
        methods = sorted(route.methods) if route.methods else []
        violations.append(f"{route.path} {methods}")

    if violations:
        raise RuntimeError(
            "RISK-AUTH-RLS-02 guard: routes lack both canonical auth "
            "dependencies (`get_current_user`, `get_api_key_principal`) and "
            "are not in NO_AUTH_ROUTE_ALLOWLIST. Either wire the canonical "
            "auth dependency, or add the path to NO_AUTH_ROUTE_ALLOWLIST "
            "with a justification comment. Offending routes:\n  "
            + "\n  ".join(violations)
        )
