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

# Base anchor (all models should extend this)
from app.models.user import Base

# Explicit imports to register models for Alembic autogeneration
import app.models.audit_log          # ? core API audit middleware logs
import app.models.auth_audit_log     # ? structured auth event logs
import app.models.refresh_token      # ? JWT refresh token registry (if present)
import app.models.proposal           # ? pipeline proposals
import app.models.staging            # ? staging artifacts + approvals
import app.models.ledger             # ? ledger entries + anchor hashes
import app.models.audit_lab          # ? audit lab tables (datasets, transactions, runs, findings, reports)

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
