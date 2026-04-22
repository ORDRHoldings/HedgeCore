"""
app/api/routes/v1_admin_monitor.py

Superuser-only admin monitoring dashboard endpoints.

Endpoints:
  GET  /v1/admin/monitor/health          — comprehensive system health check
  GET  /v1/admin/monitor/services        — service status overview
  GET  /v1/admin/monitor/tables          — database table statistics
  GET  /v1/admin/monitor/engine          — engine_v1 module wiring status
  GET  /v1/admin/monitor/errors          — recent error/failure summary
  POST /v1/admin/monitor/restart/{service} — service restart trigger

All endpoints: superuser only. Non-superusers get 403.
"""
import logging
import os
import platform
import sys
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.dependencies import require_superuser
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/admin/monitor", tags=["v1-admin-monitor"])

# ---------------------------------------------------------------------------
# Module-level uptime tracking
# ---------------------------------------------------------------------------
_START_TIME = time.monotonic()
_START_UTC = datetime.now(UTC)

# ---------------------------------------------------------------------------
# In-memory caches that can be cleared via restart endpoint
# ---------------------------------------------------------------------------
_caches: dict[str, dict] = {}
def register_cache(name: str, cache: dict) -> None:
    """Register an in-memory cache dict so it can be cleared via the admin API."""
    _caches[name] = cache
# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _uptime_seconds() -> float:
    return round(time.monotonic() - _START_TIME, 2)
def _uptime_human(seconds: float) -> str:
    days, rem = divmod(int(seconds), 86400)
    hours, rem = divmod(rem, 3600)
    minutes, secs = divmod(rem, 60)
    parts = []
    if days:
        parts.append(f"{days}d")
    if hours:
        parts.append(f"{hours}h")
    if minutes:
        parts.append(f"{minutes}m")
    parts.append(f"{secs}s")
    return " ".join(parts)
def _get_memory_usage() -> dict | None:
    """Return memory usage dict via psutil, or None if unavailable."""
    try:
        import psutil
        proc = psutil.Process()
        mem = proc.memory_info()
        return {
            "rss_mb": round(mem.rss / 1_048_576, 2),
            "vms_mb": round(mem.vms / 1_048_576, 2),
            "percent": round(proc.memory_percent(), 2),
        }
    except Exception:
        return None
# ---------------------------------------------------------------------------
# 1. GET /health — Comprehensive system health check
# ---------------------------------------------------------------------------

@router.get("/health")
async def monitor_health(
    session: AsyncSession = Depends(get_async_session),
    _su: User = Depends(require_superuser),
) -> dict:
    """Comprehensive system health check. Superuser only."""

    # Database connectivity
    db_ok = False
    db_latency_ms: float | None = None
    active_connections: int | None = None
    try:
        t0 = time.monotonic()
        await session.execute(text("SELECT 1"))
        db_latency_ms = round((time.monotonic() - t0) * 1000, 2)
        db_ok = True

        # Active connections (PostgreSQL-specific)
        try:
            row = await session.execute(
                text("SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active'")
            )
            active_connections = int(row.scalar() or 0)
        except Exception:
            pass
    except Exception as exc:
        logger.warning("Health check DB query failed: %s", exc)

    uptime_secs = _uptime_seconds()

    return {
        "status": "healthy" if db_ok else "degraded",
        "timestamp_utc": datetime.now(UTC).isoformat(),
        "started_at_utc": _START_UTC.isoformat(),
        "uptime_seconds": uptime_secs,
        "uptime_human": _uptime_human(uptime_secs),
        "python_version": platform.python_version(),
        "platform": platform.platform(),
        "database": {
            "reachable": db_ok,
            "latency_ms": db_latency_ms,
            "active_connections": active_connections,
        },
        "memory": _get_memory_usage(),
    }
# ---------------------------------------------------------------------------
# 2. GET /services — Service status overview
# ---------------------------------------------------------------------------

@router.get("/services")
async def monitor_services(
    session: AsyncSession = Depends(get_async_session),
    _su: User = Depends(require_superuser),
) -> dict:
    """Service status overview. Superuser only."""
    now = datetime.now(UTC).isoformat()
    uptime_secs = _uptime_seconds()
    services = []

    # Backend API — always running if we reach this
    services.append({
        "name": "backend_api",
        "status": "running",
        "uptime_seconds": uptime_secs,
        "uptime_human": _uptime_human(uptime_secs),
        "last_check": now,
    })

    # Database
    db_status = "stopped"
    try:
        await session.execute(text("SELECT 1"))
        db_status = "running"
    except Exception:
        db_status = "degraded"
    services.append({
        "name": "database",
        "status": db_status,
        "uptime_seconds": None,
        "uptime_human": None,
        "last_check": now,
    })

    # Redis — check if configured
    redis_url = os.getenv("REDIS_URL")
    redis_status = "stopped"
    if redis_url:
        try:
            import redis.asyncio as aioredis
            r = aioredis.from_url(redis_url, socket_connect_timeout=2)
            pong = await r.ping()
            redis_status = "running" if pong else "degraded"
            await r.aclose()
        except Exception:
            redis_status = "degraded"
    else:
        redis_status = "not_configured"
    services.append({
        "name": "redis",
        "status": redis_status,
        "uptime_seconds": None,
        "uptime_human": None,
        "last_check": now,
    })

    # Celery — check if a worker is reachable
    celery_status = "not_configured"
    broker_url = os.getenv("CELERY_BROKER_URL")
    if broker_url:
        try:
            from celery import Celery
            app = Celery(broker=broker_url)
            inspector = app.control.inspect(timeout=2)
            active = inspector.active()
            celery_status = "running" if active else "stopped"
        except Exception:
            celery_status = "stopped"
    services.append({
        "name": "celery",
        "status": celery_status,
        "uptime_seconds": None,
        "uptime_human": None,
        "last_check": now,
    })

    return {
        "checked_at": now,
        "services": services,
    }
# ---------------------------------------------------------------------------
# 3. GET /tables — Database table statistics
# ---------------------------------------------------------------------------

_MONITORED_TABLES = [
    "users",
    "companies",
    "positions",
    "calculation_runs",
    "execution_proposals",
    "audit_events",
    "policy_templates",
    "policy_revisions",
    "ledger_entries",
    "staging_artifacts",
]

# Pre-built SQL statements — table names are from a hardcoded constant, not user input.
_COUNT_STMTS = {t: text("SELECT COUNT(*) FROM %s" % t) for t in _MONITORED_TABLES}
_MAX_CREATED_STMTS = {t: text("SELECT MAX(created_at) FROM %s" % t) for t in _MONITORED_TABLES}
@router.get("/tables")
async def monitor_tables(
    session: AsyncSession = Depends(get_async_session),
    _su: User = Depends(require_superuser),
) -> dict:
    """Database table statistics (row counts and last insert). Superuser only."""
    tables = []
    for table_name in _MONITORED_TABLES:
        row_count: int | None = None
        last_insert: str | None = None
        error: str | None = None
        try:
            res = await session.execute(_COUNT_STMTS[table_name])
            row_count = int(res.scalar() or 0)

            try:
                res2 = await session.execute(_MAX_CREATED_STMTS[table_name])
                ts = res2.scalar()
                last_insert = ts.isoformat() if ts else None
            except Exception:
                last_insert = None
        except Exception as exc:
            error = str(exc)

        tables.append({
            "name": table_name,
            "row_count": row_count,
            "last_insert": last_insert,
            "error": error,
        })

    return {
        "checked_at": datetime.now(UTC).isoformat(),
        "tables": tables,
    }
# ---------------------------------------------------------------------------
# 4. GET /engine — Engine module status
# ---------------------------------------------------------------------------

# Known engine_v1 modules and their expected importers
_ENGINE_V1_MODULES = {
    "audit": "v1_calculate",
    "capital_adequacy": "v1_calculate",
    "concentration_limits": "v1_calculate, v1_risk_analytics",
    "counterparty_risk": "v1_risk_analytics",
    "credit_duration": "v1_risk_analytics",
    "currency_netting_matrix": None,
    "demo_fixtures": "seed",
    "deterministic_rounding": None,
    "factor_covariance": "v1_calculate, v1_risk_analytics",
    "fx_forward_validator": None,
    "fx_roll_engine": None,
    "fx_tensor": None,
    "hasher": None,
    "hedge_accounting": "v1_calculate, v1_risk_analytics",
    "hedge_bands": None,
    "kernel": "v1_calculate",
    "kernel_multi": None,
    "liquidity_model": None,
    "liquidity_regime": None,
    "margin_attribution": None,
    "margin_model": "v1_calculate, v1_risk_analytics",
    "nav_attribution_engine": None,
    "normalizer": "v1_calculate",
    "normalizer_multi": None,
    "pair_registry": "v1_calculate_multi",
    "risk_allocator": None,
    "scenarios": "v1_calculate",
    "scenarios_ext": "v1_risk_analytics",
    "scenarios_monte_carlo": "v1_risk_analytics",
    "scenarios_multi": None,
    "transaction_cost_model": None,
    "validator": "v1_calculate",
    "vol_mapping": "v1_risk_analytics",
    "waterfall": "v1_calculate",
    "worst_case_selector": None,
}
@router.get("/engine")
async def monitor_engine(
    _su: User = Depends(require_superuser),
) -> dict:
    """Engine_v1 module wiring status. Superuser only."""
    engine_dir = Path(__file__).resolve().parent.parent.parent / "engine_v1"
    modules = []

    for mod_name, imported_by in sorted(_ENGINE_V1_MODULES.items()):
        file_exists = (engine_dir / f"{mod_name}.py").is_file()

        # Check if module is already loaded in sys.modules
        full_mod = f"app.engine_v1.{mod_name}"
        is_loaded = full_mod in sys.modules

        # Determine wired status
        if imported_by and is_loaded:
            status = "wired"
        elif imported_by and not is_loaded:
            status = "registered"  # has a known importer but not yet loaded
        elif not imported_by and is_loaded:
            status = "loaded"  # loaded but no known route importer
        else:
            status = "unwired"

        modules.append({
            "name": mod_name,
            "file_exists": file_exists,
            "imported_by": imported_by,
            "is_loaded": is_loaded,
            "status": status,
        })

    return {
        "checked_at": datetime.now(UTC).isoformat(),
        "engine_dir": str(engine_dir),
        "total_modules": len(modules),
        "wired": sum(1 for m in modules if m["status"] == "wired"),
        "unwired": sum(1 for m in modules if m["status"] == "unwired"),
        "modules": modules,
    }
# ---------------------------------------------------------------------------
# 5. GET /errors — Recent error summary
# ---------------------------------------------------------------------------

@router.get("/errors")
async def monitor_errors(
    hours: int = Query(default=24, ge=1, le=168),
    session: AsyncSession = Depends(get_async_session),
    _su: User = Depends(require_superuser),
) -> dict:
    """Recent error/failure audit events in the last N hours. Superuser only."""
    since = datetime.now(UTC) - timedelta(hours=hours)

    # Group errors by event_type
    rows = await session.execute(
        text("""
            SELECT event_type, COUNT(*) AS cnt,
                   MAX(created_at) AS last_seen
            FROM audit_events
            WHERE (
                LOWER(event_type) LIKE '%error%'
                OR LOWER(event_type) LIKE '%fail%'
            )
            AND created_at >= :since
            GROUP BY event_type
            ORDER BY cnt DESC
        """),
        {"since": since},
    )
    groups = []
    total = 0
    for r in rows.fetchall():
        count = int(r.cnt)
        total += count
        groups.append({
            "event_type": r.event_type,
            "count": count,
            "last_seen": r.last_seen.isoformat() if r.last_seen else None,
        })

    # Also fetch the most recent individual error events (up to 20)
    detail_rows = await session.execute(
        text("""
            SELECT id, event_type, description, actor_email, created_at
            FROM audit_events
            WHERE (
                LOWER(event_type) LIKE '%error%'
                OR LOWER(event_type) LIKE '%fail%'
            )
            AND created_at >= :since
            ORDER BY created_at DESC
            LIMIT 20
        """),
        {"since": since},
    )
    recent = []
    for r in detail_rows.fetchall():
        recent.append({
            "id": str(r.id),
            "event_type": r.event_type,
            "description": r.description,
            "actor_email": r.actor_email,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        })

    return {
        "period_hours": hours,
        "since": since.isoformat(),
        "total_error_events": total,
        "by_type": groups,
        "recent_errors": recent,
    }
# ---------------------------------------------------------------------------
# 6. POST /restart/{service} — Service restart trigger
# ---------------------------------------------------------------------------

_ALLOWED_RESTART_SERVICES = {"cache", "scheduler"}
@router.post("/restart/{service}")
async def restart_service(
    service: str,
    _su: User = Depends(require_superuser),
) -> dict:
    """Restart a managed service component. Superuser only.

    Allowed services:
    - cache: clears all registered in-memory caches
    - scheduler: restarts APScheduler if configured
    """
    if service not in _ALLOWED_RESTART_SERVICES:
        raise HTTPException(
            status_code=400,
            detail=f"Service '{service}' is not restartable. Allowed: {sorted(_ALLOWED_RESTART_SERVICES)}",
        )

    result: dict = {
        "service": service,
        "action": "restart",
        "timestamp_utc": datetime.now(UTC).isoformat(),
    }

    if service == "cache":
        cleared = []
        for name, cache in _caches.items():
            size_before = len(cache)
            cache.clear()
            cleared.append({"name": name, "entries_cleared": size_before})
        result["status"] = "completed"
        result["caches_cleared"] = cleared
        result["message"] = f"Cleared {len(cleared)} registered cache(s)."
        logger.info("Admin cache clear: cleared %d caches", len(cleared))

    elif service == "scheduler":
        try:
            from apscheduler.schedulers.asyncio import AsyncIOScheduler  # noqa: F811

            # Attempt to find a running scheduler in the app
            # This is a best-effort approach; if no scheduler is configured, report that
            scheduler_found = False
            for obj_name, obj in list(sys.modules.items()):
                if hasattr(obj, "scheduler") and isinstance(
                    getattr(obj, "scheduler", None), AsyncIOScheduler
                ):
                    sched = obj.scheduler
                    if sched.running:
                        sched.shutdown(wait=False)
                        sched.start()
                        scheduler_found = True
                        break

            if scheduler_found:
                result["status"] = "completed"
                result["message"] = "APScheduler restarted."
                logger.info("Admin scheduler restart: completed")
            else:
                result["status"] = "not_found"
                result["message"] = "No running APScheduler instance found."
        except ImportError:
            result["status"] = "not_available"
            result["message"] = "APScheduler is not installed."
        except Exception as exc:
            result["status"] = "failed"
            result["message"] = f"Scheduler restart failed: {exc}"
            logger.exception("Admin scheduler restart failed")

    return result
