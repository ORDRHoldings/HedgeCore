from __future__ import annotations

import os
import logging
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import declarative_base
from sqlalchemy.pool import NullPool
from sqlalchemy import text

logger = logging.getLogger("hedgecalc.db")

# ---------------------------------------------------------------------
# DATABASE URL RESOLUTION (PRODUCTION SAFE)
# ---------------------------------------------------------------------

def resolve_database_url() -> str:
    """
    Determine database URL with strict priority:

    1) DATABASE_URL env var (Render / production)
    2) SQLite demo fallback (if explicitly allowed)
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

    # Optional demo fallback
    demo = os.getenv("ALLOW_SQLITE_DEMO", "false").lower() == "true"
    if demo:
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
# Async Engine
# ---------------------------------------------------------------------
async_engine: AsyncEngine = create_async_engine(
    DATABASE_URL,
    echo=False,
    future=True,
    poolclass=NullPool,
    pool_pre_ping=True,
)

# ---------------------------------------------------------------------
# Session Factory
# ---------------------------------------------------------------------
async_session_maker = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
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
            await session.close()


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        try:
            yield session
        finally:
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
