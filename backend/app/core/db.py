from __future__ import annotations

import logging
import os
from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import declarative_base
from sqlalchemy.pool import NullPool
from sqlalchemy.types import Uuid

from app.core.rls import TenantRLSAsyncSession, clear_tenant_rls_context


# Teach SQLite how to render PostgreSQL-specific types so
# Base.metadata.create_all() works in ALLOW_SQLITE_DEMO mode.
@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"

@compiles(ARRAY, "sqlite")
def _compile_array_sqlite(type_, compiler, **kw):
    return "JSON"

# Fix UUID binding on SQLite: default Uuid.bind_processor uses value.hex
# which strips hyphens, but our seed data stores UUIDs with hyphens.
# Override so SQLite binds UUIDs as hyphenated strings.
_original_uuid_bind = Uuid.bind_processor

def _uuid_bind_processor(self, dialect):
    if dialect.name == "sqlite":
        if self.as_uuid:
            def process(value):
                if value is not None:
                    value = str(value)
                return value
            return process
        else:
            def process(value):
                if value is not None:
                    value = value.replace("-", "")
                return value
            return process
    return _original_uuid_bind(self, dialect)

Uuid.bind_processor = _uuid_bind_processor

logger = logging.getLogger("hedgecalc.db")

# ---------------------------------------------------------------------
# DATABASE URL RESOLUTION (PRODUCTION SAFE)
# ---------------------------------------------------------------------

def resolve_database_url() -> str:
    """
    Determine database URL with strict priority:

    1) DATABASE_URL env var (Render / production)
    2) SQLite demo fallback (if explicitly allowed via env or .env file)
    3) Fail hard (never silently connect to localhost)
    """

    url = os.getenv("DATABASE_URL")

    if url:
        # Render gives sync postgres URL -> convert to asyncpg
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)

        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

        return url

    # Optional demo fallback — check both os.environ and pydantic-settings
    # so that .env file changes are respected.
    allow_demo = os.getenv("ALLOW_SQLITE_DEMO", "false").lower() == "true"
    if not allow_demo:
        try:
            from app.core.config import settings
            _demo_val = getattr(settings, "ALLOW_SQLITE_DEMO", False)
            if isinstance(_demo_val, bool):
                allow_demo = _demo_val
            else:
                allow_demo = str(_demo_val).lower() == "true"
        except Exception:
            pass

    if allow_demo:
        logger.warning("? Using SQLite demo fallback database")
        return "sqlite+aiosqlite:///./demo.db"

    # HARD FAIL -- prevents accidental localhost usage
    raise RuntimeError(
        "DATABASE_URL not configured. "
        "Set it in environment variables or enable ALLOW_SQLITE_DEMO=true."
    )


DATABASE_URL = resolve_database_url()

# ---------------------------------------------------------------------
# Base ORM class
# ---------------------------------------------------------------------
Base = declarative_base()

# ---------------------------------------------------------------------
# Engine factory (pool-aware)
# ---------------------------------------------------------------------

def create_engine_from_url(database_url: str, **pool_kwargs) -> AsyncEngine:
    """Create async engine with appropriate pool strategy for the given URL.

    SQLite requires NullPool (no connection pooling — async SQLite does not
    support shared connections across coroutines). PostgreSQL uses QueuePool
    with production-safe defaults that are overridable via pool_kwargs.
    """
    if "sqlite" in database_url:
        return create_async_engine(database_url, poolclass=NullPool)
    return create_async_engine(
        database_url,
        pool_size=pool_kwargs.get("pool_size", 20),
        max_overflow=pool_kwargs.get("max_overflow", 10),
        pool_timeout=pool_kwargs.get("pool_timeout", 30),
        pool_pre_ping=pool_kwargs.get("pool_pre_ping", True),
    )


def _build_engine() -> AsyncEngine:
    """Build the module-level engine, pulling pool config from Settings."""
    try:
        from app.core.config import settings  # local import to avoid circular deps
        return create_engine_from_url(
            DATABASE_URL,
            pool_size=settings.DB_POOL_SIZE,
            max_overflow=settings.DB_MAX_OVERFLOW,
            pool_timeout=settings.DB_POOL_TIMEOUT,
            pool_pre_ping=settings.DB_POOL_PRE_PING,
        )
    except Exception:
        # Fallback: use defaults if settings are unavailable at import time
        return create_engine_from_url(DATABASE_URL)


# ---------------------------------------------------------------------
# Async Engine
# ---------------------------------------------------------------------
async_engine: AsyncEngine = _build_engine()

# ---------------------------------------------------------------------
# Session Factory
# ---------------------------------------------------------------------
async_session_maker = async_sessionmaker(
    bind=async_engine,
    class_=TenantRLSAsyncSession,
    expire_on_commit=False,
)

# ---------------------------------------------------------------------
# Dependencies for FastAPI
# ---------------------------------------------------------------------
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            clear_tenant_rls_context()
            await session.close()


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            clear_tenant_rls_context()
            await session.close()


# ---------------------------------------------------------------------
# Lifespan Hooks
# ---------------------------------------------------------------------
async def init_engine() -> AsyncEngine:
    try:
        async with async_engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info("? Database connectivity verified.")
        return async_engine
    except Exception as e:
        logger.error(f"? init_engine failed (connectivity): {e}")
        raise


async def shutdown_engine() -> None:
    try:
        await async_engine.dispose()
        logger.info("? Async engine disposed cleanly.")
    except Exception as e:
        logger.error(f"shutdown_engine failed: {e}")
