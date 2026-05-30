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

# Auto-discover EVERY module under app.models so Base.metadata reflects the
# full schema. This replaces a hand-maintained _safe_import() list that had
# drifted out of sync with app/models/ (≈15 treasury models — cash*,
# counterparty, journal_entry, payment, settlement_event, treasury_transaction,
# transaction_cost_estimate, regulatory_submission, bank_statement, webhook —
# were missing, so `alembic revision --autogenerate` could emit destructive
# drop/create ops for them). Walking the package keeps autogenerate complete
# for all current and future models. See ADR-0021.
import pkgutil as _pkgutil
import app.models as _models_pkg

for _m in _pkgutil.iter_modules(_models_pkg.__path__):
    if _m.name == "__init__":
        continue
    _safe_import(f"app.models.{_m.name}")

# -------------------------------------------------------------------
# ?? Alembic configuration
# -------------------------------------------------------------------
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Force Alembic to use synchronous psycopg2 driver.
# Prefer DATABASE_URL (set by the runtime + CI) over settings.db_url, which
# reads ASYNC_DATABASE_URL and silently falls back to a default DB_HOST that
# doesn't exist outside docker-compose. CI only ever sets DATABASE_URL.
_alembic_url = os.getenv("DATABASE_URL") or getattr(settings, "db_url", None)
if _alembic_url:
    _alembic_url = _alembic_url.replace("postgresql+asyncpg", "postgresql+psycopg2")
    _alembic_url = _alembic_url.replace("postgres+asyncpg", "postgresql+psycopg2")
    if _alembic_url.startswith("postgres://"):
        _alembic_url = _alembic_url.replace("postgres://", "postgresql+psycopg2://", 1)
    elif _alembic_url.startswith("postgresql://") and "+psycopg2" not in _alembic_url:
        _alembic_url = _alembic_url.replace("postgresql://", "postgresql+psycopg2://", 1)
    config.set_main_option("sqlalchemy.url", _alembic_url)

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
        # Pre-create / widen alembic_version.version_num to VARCHAR(255).
        # Default is VARCHAR(32); several revision IDs in this chain exceed
        # 32 chars (e.g. `0013_add_sso_billing_to_companies` is 33 chars,
        # `0028_tca_permissions` etc fit, but `0027_audit_lab_schema_extensions`
        # is 32 — right at the limit). On fresh Postgres replay, the UPDATE
        # alembic_version SET version_num='...' raises StringDataRightTruncation.
        # Production tolerated this because `run_alembic_upgrade()` swallows
        # the error and the chain heals on subsequent runs; CI advisory job
        # crashes on first such overflow. RISK-CI-PG-02.
        try:
            connection.exec_driver_sql(
                "CREATE TABLE IF NOT EXISTS alembic_version ("
                "version_num VARCHAR(255) NOT NULL, "
                "CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num))"
            )
            connection.exec_driver_sql(
                "ALTER TABLE alembic_version "
                "ALTER COLUMN version_num TYPE VARCHAR(255)"
            )
            connection.commit()
        except Exception as _exc:  # noqa: BLE001
            # SQLite / other dialects don't need this and don't support
            # the ALTER. Failure here is non-fatal — the original
            # alembic-created table will be used.
            _env_log.debug("alembic env.py: alembic_version widen skipped — %s", _exc)
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            # Commit each migration independently so that an upstream
            # crash (e.g. 0028 permissions content bug — RISK-CI-PG-02)
            # does NOT roll back already-applied upstream migrations
            # such as b1f2a3c4d5e6 (pipeline tables: proposals,
            # staging_artifacts, ledger_entries, …). Production tolerates
            # the crash via run_alembic_upgrade() heal-on-retry; CI's
            # advisory bootstrap stamps head after the partial run, so
            # per-migration commits maximize chain reach in one pass.
            transaction_per_migration=True,
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
