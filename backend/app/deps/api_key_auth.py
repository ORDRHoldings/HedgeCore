"""
app/deps/api_key_auth.py

HedgeCalc - Phase VI
Dependency for verifying X-API-Key headers in FastAPI routes.

Integrates with:
- app.services.api_keys for lookup and verification
- app.middleware.audit for structured logging (if present)

Adds:
- get_api_key_principal() dependency
- Scoped variants for routes (e.g., require_api_key_scopes([...]))
"""

from __future__ import annotations

import logging

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.models.api_key import ApiKey
from app.services.api_keys import verify_api_key_header

logger = logging.getLogger(__name__)


class ServicePrincipal:
    """
    Principal representation for a validated API key (service-to-service identity).
    Attached to request.state for downstream access.
    """

    def __init__(self, api_key: ApiKey):
        self.key_id = api_key.key_id
        self.owner_user_id = api_key.owner_user_id
        self.scopes = list(api_key.scopes or [])
        self.status = api_key.status
        self.expires_at = api_key.expires_at
        self.created_at = api_key.created_at

    def has_scope(self, scope: str) -> bool:
        """Check if principal has a specific scope."""
        return scope in self.scopes

    def has_scopes(self, required: list[str]) -> bool:
        """Check if principal has all required scopes."""
        return set(required).issubset(set(self.scopes))

    def to_dict(self):
        """Return redacted info for logs or audit."""
        return {
            "key_id": self.key_id,
            "owner_user_id": str(self.owner_user_id) if self.owner_user_id else None,
            "scopes": self.scopes,
            "status": self.status.value if hasattr(self.status, "value") else str(self.status),
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
        }


async def get_api_key_principal(
    request: Request,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    session: AsyncSession = Depends(get_async_session),
) -> ServicePrincipal:
    """
    Core dependency:
    - Validates X-API-Key
    - Returns ServicePrincipal if valid
    - Raises 401 if missing/invalid/revoked/expired
    """
    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-API-Key header.",
        )

    api_key = await verify_api_key_header(session, x_api_key, required_scopes=[])
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired API key.",
        )

    principal = ServicePrincipal(api_key)

    # Attach to request for middleware/audit
    request.state.service_principal = principal

    logger.info(
        "Service API key verified",
        extra={
            "audit_event": "service_auth_success",
            "key_id": api_key.key_id,
            "owner_user_id": str(api_key.owner_user_id) if api_key.owner_user_id else None,
            "scopes": api_key.scopes,
            "ip": request.client.host if request.client else None,
            "path": request.url.path,
        },
    )

    return principal


def require_api_key_scopes(required_scopes: list[str]):
    """
    Returns a dependency enforcing scope membership.
    Example:
        @router.get("/data", dependencies=[Depends(require_api_key_scopes(["read:data"]))])
    """

    async def scoped_dependency(
        principal: ServicePrincipal = Depends(get_api_key_principal),
    ) -> ServicePrincipal:
        if not principal.has_scopes(required_scopes):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"API key missing required scopes: {required_scopes}",
            )
        return principal

    return scoped_dependency


# Startup guard for RISK-AUTH-RLS-01. `get_api_key_principal` validates the key
# but does NOT inject the tenant RLS context that `core/dependencies.py::
# get_current_user` injects on the JWT path. With migration 0036 forcing RLS on
# `positions` and `calculation_runs`, any business endpoint that gains this
# dependency would silently return empty results because the RLS policy's
# `current_setting('app.current_tenant_id', true)` would match no tenant.
#
# This allowlist contains the only routes that may use API-key auth without
# RLS injection — diagnostic endpoints that don't read RLS-protected tables.
# Adding API-key auth to any other route requires either (a) extending the
# allowlist with a justification comment, or (b) adding RLS injection to the
# auth path first. See `.claude/state/OPEN_RISKS.md` RISK-AUTH-RLS-01.
API_KEY_AUTH_ALLOWLIST: frozenset[str] = frozenset({
    "/api/system/whoami/api-key",  # returns key metadata only, no DB business query
    "/api/system/db-tables",       # reads information_schema, not RLS-protected
})


def assert_api_key_routes_safe(app, allowlist: frozenset[str] = API_KEY_AUTH_ALLOWLIST) -> None:
    """Fail closed if any route uses API-key auth without being allowlisted.

    Walks every APIRoute's dependant graph for `get_api_key_principal`
    (including nested under `require_api_key_scopes`-style closures). Any
    occurrence on a path not in the allowlist raises RuntimeError, blocking
    startup until the dependency is removed or the path is justified and added
    to the allowlist.
    """
    from fastapi.routing import APIRoute

    def _uses_api_key_auth(dependant) -> bool:
        if dependant is None:
            return False
        if dependant.call is get_api_key_principal:
            return True
        for sub in dependant.dependencies:
            if _uses_api_key_auth(sub):
                return True
        return False

    violations: list[str] = []
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        if _uses_api_key_auth(getattr(route, "dependant", None)):
            if route.path not in allowlist:
                methods = sorted(route.methods) if route.methods else []
                violations.append(f"{route.path} {methods}")

    if violations:
        raise RuntimeError(
            "RISK-AUTH-RLS-01 guard: routes use API-key auth without RLS "
            "injection. Either wire tenant RLS into the auth dependency "
            "first, or extend API_KEY_AUTH_ALLOWLIST with justification. "
            "Offending routes:\n  " + "\n  ".join(violations)
        )
