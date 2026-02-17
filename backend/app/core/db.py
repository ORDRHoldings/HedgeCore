"""
app/core/db.py
HedgeCalc – Async Database Core (Canonical, Alembic-Governed)
------------------------------------------------------------
STRICT POLICY:
- Runtime MUST NOT create or mutate database schema.
- Alembic is the sole authority for tables, indexes, and constraints.
- This module performs connectivity + session lifecycle only.

Optimized for:
- Windows pytest stability
- asyncpg teardown safety
- FastAPI lifespan management
- Multi-worker (Gunicorn) safety
"""

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
# Configuration
# ---------------------------------------------------------------------
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/hedgecalc",
)

# ---------------------------------------------------------------------
# Base ORM class (metadata ONLY, no runtime DDL)
# ---------------------------------------------------------------------
Base = declarative_base()

# ---------------------------------------------------------------------
# Async Engine
# ---------------------------------------------------------------------
# NullPool avoids "event loop closed" errors on teardown in Windows pytest
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
# Dependencies for FastAPI endpoints
# ---------------------------------------------------------------------
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Legacy dependency for FastAPI routes (backward compatible)."""
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Primary dependency for async SQLAlchemy operations in routes/services.
    Explicitly identical to get_session for clarity and future refactors.
    """
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()


# ---------------------------------------------------------------------
# Lifespan Hooks (NO SCHEMA MUTATION)
# ---------------------------------------------------------------------
async def init_engine() -> AsyncEngine:
    """
    Initialize DB engine.

    Responsibilities:
    - Verify database connectivity
    - Log readiness
    - NEVER create tables or indexes
    """
    try:
        async with async_engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info("✅ Database connectivity verified.")
        return async_engine
    except Exception as e:
        logger.error(f"❌ init_engine failed (connectivity): {e}")
        raise


async def shutdown_engine() -> None:
    """Dispose engine cleanly during FastAPI shutdown."""
    try:
        await async_engine.dispose()
        logger.info("✅ Async engine disposed cleanly.")
    except Exception as e:
        logger.error(f"shutdown_engine failed: {e}")
