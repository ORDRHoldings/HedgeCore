"""
app/api/routes/v1_admin_config.py

Superuser-only system configuration (feature flags, rate limits, maintenance mode).

Endpoints:
  GET   /v1/admin/config — read current system config
  PATCH /v1/admin/config — update system config

Config is stored in-memory (survives hot reloads, resets on dyno restart).
In production, extend to persist in Redis or a system_config DB table.

All endpoints: superuser only.
"""
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.dependencies import require_superuser
from app.models.user import User

router = APIRouter(prefix="/v1/admin/config", tags=["v1-admin-config"])

# ---------------------------------------------------------------------------
# In-memory config singleton
# ---------------------------------------------------------------------------
_SYSTEM_CONFIG: dict[str, Any] = {
    "feature_flags": {
        "audit_lab": True,
        "execution_proposals": True,
        "policy_governance": True,
        "api_key_auth": True,
        "mfa_totp": False,
        "sso_saml": False,
        "webhook_events": False,
        "advanced_analytics": False,
    },
    "default_signup_tier": "lite",
    "maintenance_mode": False,
    "maintenance_message": "",
    "rate_limits": {
        "unauthenticated": "20/minute",
        "authenticated": "100/minute",
        "api_key_standard": "200/minute",
        "api_key_enterprise": "1000/minute",
        "login_endpoint": "10/minute",
        "calculate_endpoint": "10/minute",
    },
    "cors_origins": [
        "https://hedgecore.vercel.app",
        "https://ordr-terminal.vercel.app",
        "https://ordr-terminal-v2.vercel.app",
        "http://localhost:3000",
        "http://localhost:3001",
    ],
}
# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ConfigPatch(BaseModel):
    feature_flags: dict[str, bool] | None = None
    default_signup_tier: str | None = None
    maintenance_mode: bool | None = None
    maintenance_message: str | None = None
    rate_limits: dict[str, str] | None = None
    cors_origins: list[str] | None = None
# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("")
async def get_config(
    session: AsyncSession = Depends(get_async_session),
    _su: User = Depends(require_superuser),
) -> dict:
    """Return current system configuration. Superuser only."""
    return _SYSTEM_CONFIG
@router.patch("")
async def update_config(
    data: ConfigPatch,
    session: AsyncSession = Depends(get_async_session),
    _su: User = Depends(require_superuser),
) -> dict:
    """Update system configuration fields. Superuser only."""
    if data.feature_flags is not None:
        _SYSTEM_CONFIG["feature_flags"].update(data.feature_flags)
    if data.default_signup_tier is not None:
        _SYSTEM_CONFIG["default_signup_tier"] = data.default_signup_tier
    if data.maintenance_mode is not None:
        _SYSTEM_CONFIG["maintenance_mode"] = data.maintenance_mode
    if data.maintenance_message is not None:
        _SYSTEM_CONFIG["maintenance_message"] = data.maintenance_message
    if data.rate_limits is not None:
        _SYSTEM_CONFIG["rate_limits"].update(data.rate_limits)
    if data.cors_origins is not None:
        _SYSTEM_CONFIG["cors_origins"] = data.cors_origins

    return _SYSTEM_CONFIG
