"""
app/api/routes/system.py

Internal system routes for validation and diagnostics.
API-key protected unless explicitly public.
"""


from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import async_engine, get_async_session
from app.core.schema_state import is_schema_ready, run_readiness_checks_cached
from app.deps.api_key_auth import get_api_key_principal as require_api_key
from app.deps.api_key_auth import require_api_key_scopes
from app.services.api_keys import verify_api_key_header

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/health", include_in_schema=True)
async def system_health():
    """
    Internal health check (used by API + middleware validation).
    """
    governance = {}
    try:
        from app.core.kernel import kernel_health
        governance = kernel_health()
    except Exception:
        pass

    cache_stats = {}
    try:
        from app.core.redis_client import get_cache_stats
        cache_stats = get_cache_stats()
    except Exception:
        pass

    return {
        "status": "ok",
        "component": "api",
        "governance": governance,
        "market_data_cache": cache_stats,
    }


@router.get("/health/deep", include_in_schema=True)
async def deep_health():
    """Deep health probe with dependency checks.

    Verifies:
      - Database connectivity (SELECT 1)
      - Redis availability (ping) — non-fatal (cache is fail-open by design)
      - Schema readiness (WORM tables, critical indexes)

    Returns 200 with `status: "degraded"` when non-critical deps are down,
    500 only when the database itself is unreachable.
    """
    from datetime import UTC, datetime

    from sqlalchemy import text as sql_text

    checks: dict[str, dict] = {}
    degraded = False

    # Database
    try:
        async with async_engine.connect() as conn:
            await conn.execute(sql_text("SELECT 1"))
        checks["database"] = {"ok": True}
    except Exception as exc:
        checks["database"] = {"ok": False, "error": str(exc)[:200]}
        raise HTTPException(
            status_code=503,
            detail={"status": "fail", "checks": checks},
        )

    # Redis (non-fatal — cache is fail-open by design)
    try:
        from app.core.redis_client import get_redis_client
        client = get_redis_client()
        if client is None:
            checks["redis"] = {"ok": False, "reason": "not_configured"}
            degraded = True
        else:
            try:
                # redis-py may expose async or sync depending on wiring
                ping_fn = getattr(client, "ping", None)
                if ping_fn:
                    maybe = ping_fn()
                    if hasattr(maybe, "__await__"):
                        await maybe
                checks["redis"] = {"ok": True}
            except Exception as exc:
                checks["redis"] = {"ok": False, "error": str(exc)[:200]}
                degraded = True
    except Exception as exc:
        checks["redis"] = {"ok": False, "error": str(exc)[:200]}
        degraded = True

    # Schema
    try:
        schema = await run_readiness_checks_cached(async_engine)
        checks["schema"] = {
            "ok": bool(schema.get("schema_ready")),
            "worm_ready": bool(schema.get("worm_ready")),
        }
        if not checks["schema"]["ok"]:
            degraded = True
    except Exception as exc:
        checks["schema"] = {"ok": False, "error": str(exc)[:200]}
        degraded = True

    return {
        "status": "degraded" if degraded else "ok",
        "checked_at": datetime.now(UTC).isoformat(),
        "checks": checks,
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
async def schema_health_endpoint(
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    session: AsyncSession = Depends(get_async_session),
):
    """Schema readiness check — verifies WORM store, critical indexes, and triggers.

    PUBLIC endpoint (no authentication required) — safe for load-balancers and
    deployment scripts to poll continuously.

    Response tiers:
      - Unauthenticated (no X-API-Key): REDACTED — booleans only.
        Returns schema_ready, worm_ready, market_snapshots_ready, checked_at.
        Does NOT return internal object names, missing_items, or checks{}.
        This prevents inadvertent disclosure of DB schema topology.

      - Authenticated (X-API-Key present): FULL diagnostic response including
        startup_schema_ready, missing_items[], checks{} per-object results.
        Requires valid API key; gated by system.schema.read permission (RBAC).

    Rate-limited by the global 60 req/min middleware.
    DB check is TTL-cached (10 s) to prevent pg_catalog hammering.
    """
    live = await run_readiness_checks_cached(async_engine)

    # ── Redacted public response ──────────────────────────────────────────────
    # Booleans only — no object names, no missing_items, no checks{}.
    # Safe for external monitors and load balancers.
    if not x_api_key:
        return {
            "schema_ready": live["schema_ready"],
            "worm_ready": live["worm_ready"],
            "market_snapshots_ready": live["market_snapshots_ready"],
            "checked_at": live["checked_at"],
        }

    # ── Full diagnostic response (authenticated callers only) ─────────────────
    # Schema-health remains publicly pollable for redacted booleans, so this route
    # must verify the key itself before returning internal object names/checks.
    api_key = await verify_api_key_header(session, x_api_key, required_scopes=["system.schema.read"])
    if not api_key:
        raise HTTPException(403, "Invalid API key or missing system.schema.read scope")
    return {
        "startup_schema_ready": is_schema_ready(),
        **live,
    }


@router.get("/db-tables", include_in_schema=False)
async def db_tables(_api_key=Depends(require_api_key_scopes(["system.schema.read"]))):
    """List all tables and their columns for diagnostics."""
    async with async_engine.connect() as conn:
        result = await conn.execute(text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' ORDER BY table_name"
        ))
        tables = [r[0] for r in result.fetchall()]

        cols = {}
        for t in tables:
            cr = await conn.execute(text(
                "SELECT column_name, data_type FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = :tname "
                "ORDER BY ordinal_position"
            ).bindparams(tname=t))
            cols[t] = [{"col": r[0], "type": r[1]} for r in cr.fetchall()]

    return {"tables": tables, "columns": cols}
