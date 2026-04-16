"""
migrations/env.py
HedgeCalc - Phase II-B (Authentication & Security)
--------------------------------------------------
Alembic environment configuration for database migrations.

Enhancements:
- Enables full model discovery across app.models.*
- Forces psycopg2 URL for Alembic (asyncpg used only at runtime)
- Enables compare_type=True for accurate autogeneration
- Ensures future-proof model imports for all security-related tables
"""

import os
import sys
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

# -------------------------------------------------------------------
# ? Ensure app package is importable
# -------------------------------------------------------------------
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
APP_DIR = os.path.join(BASE_DIR, "app")

for path in (BASE_DIR, APP_DIR):
    if path not in sys.path:
        sys.path.insert(0, path)

# -------------------------------------------------------------------
# ? Import configuration and models
# -------------------------------------------------------------------
from app.core.config import settings

# ── Import ALL models to register full schema with Alembic ──────────────
from app.models.user import Base  # Base anchor

# Import every model module found in app/models/ (except __init__.py and user.py).
# These populate Base.metadata so alembic autogenerate sees the full schema.
# Each import is wrapped in try/except so a single broken module never
# prevents Alembic from running migrations for the rest of the schema.
import logging as _logging
_env_log = _logging.getLogger("alembic.env")

def _safe_import(module_name: str) -> None:
    try:
        __import__(module_name)
    except Exception as _exc:  # noqa: BLE001
        _env_log.warning("alembic env.py: could not import %s — %s", module_name, _exc)

_safe_import("app.models.api_key")
_safe_import("app.models.api_key_audit")
_safe_import("app.models.audit_event")
_safe_import("app.models.audit_lab")
_safe_import("app.models.audit_log")
_safe_import("app.models.auth_audit_log")
_safe_import("app.models.calculation_run")
_safe_import("app.models.connector")
_safe_import("app.models.equity_snapshot")
_safe_import("app.models.execution_proposal")
_safe_import("app.models.hedge_effectiveness")
_safe_import("app.models.intelligence")
_safe_import("app.models.import_batch")
_safe_import("app.models.ledger")
_safe_import("app.models.market_data")
_safe_import("app.models.market_snapshot")
_safe_import("app.models.options_snapshot")
_safe_import("app.models.organization")
_safe_import("app.models.permission")
_safe_import("app.models.policy")
_safe_import("app.models.policy_favorite")
_safe_import("app.models.policy_revision")
_safe_import("app.models.position")
_safe_import("app.models.proposal")
_safe_import("app.models.rbac")
_safe_import("app.models.refresh_token")
_safe_import("app.models.report_schedule")
_safe_import("app.models.saved_report")
_safe_import("app.models.staging")
_safe_import("app.models.support_ticket")
_safe_import("app.models.user_mfa")
_safe_import("app.models.user_watchlist")

# -------------------------------------------------------------------
# ?? Alembic configuration
# -------------------------------------------------------------------
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Force Alembic to use synchronous psycopg2 driver
if getattr(settings, "db_url", None):
    config.set_main_option(
        "sqlalchemy.url",
        settings.db_url.replace("+asyncpg", "+psycopg2")
    )

# Attach all models? metadata
target_metadata = Base.metadata

# -------------------------------------------------------------------
# ? Offline migrations
# -------------------------------------------------------------------
def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (no live DB connection)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()

# -------------------------------------------------------------------
# ? Online migrations
# -------------------------------------------------------------------
def run_migrations_online() -> None:
    """Run migrations in 'online' mode (with active DB connection)."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()

# -------------------------------------------------------------------
# ? Entrypoint
# -------------------------------------------------------------------
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
