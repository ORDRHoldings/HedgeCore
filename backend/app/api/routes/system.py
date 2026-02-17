"""
app/api/routes/system.py

Internal system routes for validation and diagnostics.
API-key protected unless explicitly public.
"""

from fastapi import APIRouter, Depends

from app.api.deps import require_api_key

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/health", include_in_schema=True)
async def system_health():
    """
    Internal health check (used by API + middleware validation).
    """
    return {
        "status": "ok",
        "component": "api",
    }


@router.get("/whoami/api-key", include_in_schema=True)
async def whoami_api_key(api_key=Depends(require_api_key)):
    """
    Diagnostic endpoint to verify API-key authentication.
    """
    return {
        "key_id": api_key.key_id,
        "status": api_key.status,
        "expires_at": api_key.expires_at,
    }
