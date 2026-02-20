"""
app/api/routes/system.py

Internal system routes for validation and diagnostics.
API-key protected unless explicitly public.
"""

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import text

from app.api.deps import require_api_key
from app.core.db import async_engine

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


@router.get("/db-tables", include_in_schema=False)
async def db_tables(x_api_key: str = Header(..., alias="X-API-Key")):
    """List all tables and their columns for diagnostics."""
    if x_api_key != "HC_DEV_KEY_001":
        raise HTTPException(403, "Invalid key")
    async with async_engine.connect() as conn:
        result = await conn.execute(text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' ORDER BY table_name"
        ))
        tables = [r[0] for r in result.fetchall()]

        cols = {}
        for t in tables:
            cr = await conn.execute(text(
                f"SELECT column_name, data_type FROM information_schema.columns "
                f"WHERE table_schema = 'public' AND table_name = '{t}' "
                f"ORDER BY ordinal_position"
            ))
            cols[t] = [{"col": r[0], "type": r[1]} for r in cr.fetchall()]

    return {"tables": tables, "columns": cols}
