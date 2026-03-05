"""app/core/schema_state.py

Schema readiness state — shared across the application process.

Responsibilities:
  1. Hold the global _schema_ready flag (set once by lifespan).
  2. Expose run_readiness_checks() — queries the live DB for critical objects.
  3. Expose run_readiness_checks_cached() — TTL-cached wrapper (10 s default).
  4. Expose require_schema_ready() — FastAPI dependency for fail-closed gating.

Governance contract:
  - PostgreSQL: checks information_schema + pg_catalog for market_snapshots
    table, unique constraint, WORM function, and WORM triggers.
  - SQLite (ALLOW_SQLITE_DEMO): all checks skipped — returns ready=True so
    unit tests run without a full PG stack.
  - Advisory lock key: pg_advisory_lock(hashtext('ordr_schema_bootstrap_v1'))
    This constant is declared here as the single source of truth.

Fail-closed behaviour:
  - If _schema_ready is False at request time, require_schema_ready() raises
    HTTP 503 with code=SCHEMA_NOT_READY so the caller can retry.

Attack-surface hardening:
  - run_readiness_checks_cached() enforces a 10-second in-process TTL so that
    unauthenticated callers polling /system/schema-health cannot trigger
    unbounded pg_catalog queries.
  - /system/schema-health returns a REDACTED (booleans-only) response to
    unauthenticated callers; full diagnostics require a valid X-API-Key.
    The permission system.schema.read is the gate for the full response.
"""

from __future__ import annotations

import time as _time
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

# ─────────────────────────────────────────────────────────────────────────────
# Advisory lock key (single source of truth)
# ─────────────────────────────────────────────────────────────────────────────

ADVISORY_LOCK_SQL = "SELECT pg_advisory_lock(hashtext('ordr_schema_bootstrap_v1'))"
ADVISORY_UNLOCK_SQL = "SELECT pg_advisory_unlock(hashtext('ordr_schema_bootstrap_v1'))"

# ─────────────────────────────────────────────────────────────────────────────
# Global schema state flag
# ─────────────────────────────────────────────────────────────────────────────

_schema_ready: bool = False


def set_schema_ready(v: bool) -> None:
    """Called once from lifespan after DDL + readiness checks complete."""
    global _schema_ready
    _schema_ready = v


def is_schema_ready() -> bool:
    """Return current schema readiness state."""
    return _schema_ready


# ─────────────────────────────────────────────────────────────────────────────
# TTL cache — prevents pg_catalog hammering from pollers
# ─────────────────────────────────────────────────────────────────────────────

READINESS_CACHE_TTL_SECONDS: float = 10.0  # exported so tests can verify the constant

_readiness_cache: dict[str, Any] = {}  # {"result": dict, "ts": float}


async def run_readiness_checks_cached(engine: AsyncEngine) -> dict[str, Any]:
    """TTL-cached wrapper around run_readiness_checks().

    Returns a cached result if it is less than READINESS_CACHE_TTL_SECONDS old.
    On cache miss (first call or TTL expired) the live DB check runs and the
    result is stored with a monotonic timestamp.

    Thread-safety: asyncio is single-threaded within a process; no lock needed.
    The worst case for concurrent requests is two simultaneous DB checks on the
    first call — both results are equivalent and the second write wins harmlessly.
    """
    now = _time.monotonic()
    entry = _readiness_cache.get("result")
    if entry is not None and (now - entry["ts"]) < READINESS_CACHE_TTL_SECONDS:
        return entry["data"]

    result = await run_readiness_checks(engine)
    _readiness_cache["result"] = {"data": result, "ts": now}
    return result


def invalidate_readiness_cache() -> None:
    """Force the next call to run_readiness_checks_cached() to hit the DB.

    Used in tests and after schema mutations.
    """
    _readiness_cache.clear()


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI dependency: fail-closed execution gate
# ─────────────────────────────────────────────────────────────────────────────

async def require_schema_ready() -> None:
    """FastAPI Depends() guard — raises HTTP 503 if schema not ready.

    Wire to execution endpoints so they refuse to serve until the startup
    schema readiness check passes.  Example:

        @router.post("/v1/calculate")
        async def calculate(
            ...,
            _schema: None = Depends(require_schema_ready),
        ):
    """
    if not _schema_ready:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "SCHEMA_NOT_READY",
                "detail": (
                    "Schema readiness check has not passed. "
                    "The service is starting up or encountered a schema error. "
                    "Retry in a few seconds."
                ),
            },
        )


# ─────────────────────────────────────────────────────────────────────────────
# Live readiness checks (queries the DB)
# ─────────────────────────────────────────────────────────────────────────────

async def run_readiness_checks(engine: AsyncEngine) -> dict[str, Any]:
    """Run live schema readiness checks against the DB.

    Returns a dict suitable for the /system/schema-health response:
        schema_ready          bool — all checks passed
        worm_ready            bool — function + both triggers present
        market_snapshots_ready bool — table + unique constraint present
        missing_items         list[str] — failed check names
        checks                dict[str, bool] — per-check results
        checked_at            ISO-8601 UTC timestamp
    """
    checked_at = datetime.now(UTC).isoformat()

    # ── SQLite shortcut (dev / unit-test mode) ────────────────────────────────
    if "sqlite" in str(engine.url).lower():
        return {
            "schema_ready": True,
            "worm_ready": True,
            "market_snapshots_ready": True,
            "missing_items": [],
            "checks": {},
            "checked_at": checked_at,
            "note": "SQLite mode — PG-specific checks skipped",
        }

    # ── PostgreSQL checks ─────────────────────────────────────────────────────
    checks: dict[str, bool] = {
        "market_snapshots_table": False,
        "market_snapshots_unique_constraint": False,
        "worm_function": False,
        "worm_trigger_update": False,
        "worm_trigger_delete": False,
    }

    try:
        async with engine.connect() as conn:
            # 1. market_snapshots table
            r = await conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_name = 'market_snapshots'"
            ))
            checks["market_snapshots_table"] = (r.scalar() or 0) > 0

            # 2. Unique constraint — accept any unique constraint covering company_id
            # on market_snapshots (named or auto-named by PG inline UNIQUE())
            r = await conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.table_constraints tc "
                "JOIN information_schema.key_column_usage kcu "
                "  ON tc.constraint_name = kcu.constraint_name "
                "  AND tc.table_name = kcu.table_name "
                "WHERE tc.table_name = 'market_snapshots' "
                "  AND tc.constraint_type = 'UNIQUE' "
                "  AND kcu.column_name = 'company_id'"
            ))
            checks["market_snapshots_unique_constraint"] = (r.scalar() or 0) > 0

            # 3. WORM function
            r = await conn.execute(text(
                "SELECT COUNT(*) FROM pg_proc WHERE proname = 'market_snapshots_worm'"
            ))
            checks["worm_function"] = (r.scalar() or 0) > 0

            # 4. WORM triggers (both must be present)
            r = await conn.execute(text(
                "SELECT tgname FROM pg_trigger "
                "WHERE tgname IN "
                "('trg_market_snapshots_no_update', 'trg_market_snapshots_no_delete')"
            ))
            triggers = {row[0] for row in r.fetchall()}
            checks["worm_trigger_update"] = "trg_market_snapshots_no_update" in triggers
            checks["worm_trigger_delete"] = "trg_market_snapshots_no_delete" in triggers

    except Exception as exc:
        return {
            "schema_ready": False,
            "worm_ready": False,
            "market_snapshots_ready": False,
            "missing_items": [f"db_error:{exc!s}"],
            "checks": checks,
            "checked_at": checked_at,
            "error": str(exc),
        }

    missing = [k for k, v in checks.items() if not v]
    worm_ready = (
        checks["worm_function"]
        and checks["worm_trigger_update"]
        and checks["worm_trigger_delete"]
    )
    market_snapshots_ready = (
        checks["market_snapshots_table"]
        and checks["market_snapshots_unique_constraint"]
    )
    schema_ready = len(missing) == 0

    return {
        "schema_ready": schema_ready,
        "worm_ready": worm_ready,
        "market_snapshots_ready": market_snapshots_ready,
        "missing_items": missing,
        "checks": checks,
        "checked_at": checked_at,
    }
