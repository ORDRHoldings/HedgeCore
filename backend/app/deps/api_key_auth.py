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
from app.services.api_keys import verify_api_key_header
from app.models.api_key import ApiKey

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
            "status": self.status.value,
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
