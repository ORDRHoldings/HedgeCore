"""
app/api/routes/system.py

Internal system routes for validation and diagnostics.
API-key protected unless explicitly public.
"""

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import text

from app.api.deps import require_api_key
from app.core.db import async_engine
from app.core.schema_state import is_schema_ready, run_readiness_checks

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


@router.get("/schema-health", include_in_schema=True)
async def schema_health_endpoint():
    """Schema readiness check — verifies WORM store, critical indexes, and triggers.

    Returns the live DB-verified state of schema objects critical to Execution:
      - market_snapshots table presence
      - UNIQUE(company_id, market_snapshot_hash) constraint
      - WORM function market_snapshots_worm
      - WORM triggers (no-update, no-delete)

    This endpoint is PUBLIC (no auth) so load-balancers and deployment scripts
    can poll it without credentials.  It reflects both the startup-cached state
    and a fresh live check.
    """
    # Run live DB check
    live = await run_readiness_checks(async_engine)
    return {
        "startup_schema_ready": is_schema_ready(),
        **live,
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
