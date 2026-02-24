"""
app/tasks/audit_cleanup.py
HedgeCalc - Phase II-B (Automated Audit Retention)

Nightly-capable cleanup that prunes old audit data (>N days) from:
  - audit_logs         (field: ts)
  - auth_audit_logs    (field: created_at)

Uses the same AsyncSession factory as the rest of the app (get_session).
Safe, batched deletes with clear logging.

Env:
  AUDIT_RETENTION_DAYS  -> default: 90
  AUDIT_CLEANUP_BATCH   -> default: 5000
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Literal

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.models.audit_log import AuditLog
from app.models.auth_audit_log import AuthAuditLog

log = logging.getLogger(__name__)

RETENTION_DAYS = int(os.getenv("AUDIT_RETENTION_DAYS", "90"))
BATCH_SIZE = int(os.getenv("AUDIT_CLEANUP_BATCH", "5000"))
RETENTION_DELTA = timedelta(days=RETENTION_DAYS)


async def cleanup_audit_tables() -> None:
    """
    Entry point to prune expired rows from both audit tables.
    """
    cutoff = datetime.now(timezone.utc) - RETENTION_DELTA
    log.info("? Starting audit cleanup (cutoff UTC=%s)", cutoff.isoformat())

    async for session in get_session():
        try:
            deleted_audit = await _delete_old_records(
                session=session,
                model=AuditLog,
                ts_attr="ts",
                cutoff=cutoff,
                name="audit_logs",
            )

            deleted_auth = await _delete_old_records(
                session=session,
                model=AuthAuditLog,
                ts_attr="created_at",
                cutoff=cutoff,
                name="auth_audit_logs",
            )

            log.info(
                "? Audit cleanup complete | audit_logs=%d | auth_audit_logs=%d | cutoff=%s",
                deleted_audit,
                deleted_auth,
                cutoff.isoformat(),
            )

        except Exception:
            log.exception("? Audit cleanup failed -- rolling back")
            await session.rollback()

        break  # single controlled session only


async def _delete_old_records(
    session: AsyncSession,
    model,
    ts_attr: Literal["ts", "created_at"],
    cutoff: datetime,
    name: str,
) -> int:
    """
    Batched delete: selects a page of IDs (<BATCH_SIZE), deletes them, repeats.
    Returns total deleted count.
    """
    total_deleted = 0
    ts_col = getattr(model, ts_attr)

    while True:
        result = await session.execute(
            select(model.id)
            .where(ts_col < cutoff)
            .limit(BATCH_SIZE)
        )

        ids = [row[0] for row in result.fetchall()]
        if not ids:
            break

        await session.execute(delete(model).where(model.id.in_(ids)))
        await session.commit()

        total_deleted += len(ids)
        log.info(
            "? Deleted %d rows from %s (running total=%d)",
            len(ids),
            name,
            total_deleted,
        )

    if total_deleted == 0:
        log.info("?? No expired rows found in %s", name)

    return total_deleted


# -------------------------------------------------------------------
# Optional scheduler (not auto-wired)
# -------------------------------------------------------------------
async def start_audit_cleanup_scheduler():
    """
    Sleeps until next midnight UTC, then runs cleanup every 24h.
    Wire via asyncio.create_task(...) in app startup if desired.
    """
    while True:
        now = datetime.now(timezone.utc)
        next_midnight = (now + timedelta(days=1)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )

        sleep_seconds = (next_midnight - now).total_seconds()
        log.info("? Next audit cleanup in %.2f hours", sleep_seconds / 3600)

        await asyncio.sleep(sleep_seconds)

        try:
            await cleanup_audit_tables()
        except Exception:
            log.exception("Unhandled exception in audit cleanup scheduler")
            await asyncio.sleep(60)
