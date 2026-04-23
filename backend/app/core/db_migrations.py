# backend/app/core/db_migrations.py
"""
Alembic migration runner for startup.

Strategy:
- _ensure_tables() (main.py) handles legacy schema bootstrap (tables, triggers, indexes).
- run_alembic_upgrade() runs Alembic forward migrations (new columns/tables going forward).
- Both are idempotent; both run on every boot.

For existing production DBs built before Alembic full coverage:
  Run once manually: cd backend && alembic stamp 2026_03_24_baseline
"""
import logging
import os

logger = logging.getLogger(__name__)


def run_alembic_upgrade() -> None:
    """
    Run `alembic upgrade head` synchronously at startup.

    Safe to call on every boot -- Alembic is idempotent.
    Skipped if DATABASE_URL contains 'sqlite' (ALLOW_SQLITE_DEMO mode).
    """
    # Use the same resolution logic as the app (db.py) so we don't fall back
    # to the Postgres default in settings.db_url when ALLOW_SQLITE_DEMO is on.
    from app.core.db import DATABASE_URL as _resolved_url

    db_url = (
        os.environ.get("ASYNC_DATABASE_URL", "")
        or os.environ.get("DATABASE_URL", "")
        or _resolved_url
    )

    if "sqlite" in db_url.lower():
        logger.info(
            "Alembic upgrade skipped: SQLite (ALLOW_SQLITE_DEMO) does not support "
            "Alembic migrations. Schema managed by _ensure_tables() in demo mode."
        )
        return

    try:
        from alembic import command as alembic_cmd
        from alembic.config import Config

        # alembic.ini is in backend/ (one level above this file's package)
        ini_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "..", "alembic.ini")
        )

        cfg = Config(ini_path)
        # Override URL from environment -- alembic.ini may have a stale dev URL
        sync_url = (
            db_url
            .replace("+asyncpg", "+psycopg2")
            .replace("+aiosqlite", "")
        )
        cfg.set_main_option("sqlalchemy.url", sync_url)

        alembic_cmd.upgrade(cfg, "head")
        logger.info("Alembic upgrade head: complete")
    except Exception as e:
        # Non-fatal: _ensure_tables() runs next as safety net.
        logger.warning(
            f"Alembic upgrade failed (non-fatal -- _ensure_tables() will follow): {e}"
        )
