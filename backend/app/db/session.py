# app/db/session.py
"""
HedgeCalc - Database Session Manager
Phase IV: Unified Async SQLAlchemy Engine + Session Factory

Responsibilities:
- Initialize global async engine using PostgreSQL (asyncpg)
- Provide async session factory (async_session_maker)
- Supply FastAPI-compatible dependencies (get_db, get_session)
- Enforce safe transaction rollback and structured error logging
- Expose a database health check endpoint utility

Environment:
    settings.db_url
        e.g., postgresql+asyncpg://user:pass@127.0.0.1:5432/hedgecalc
"""

from __future__ import annotations
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.exc import SQLAlchemyError
from app.core.config import settings

# ---------------------------------------------------------------------------
# Engine Configuration
# ---------------------------------------------------------------------------

log = logging.getLogger("hedgecalc.db")

engine = create_async_engine(
    settings.db_url,
    pool_pre_ping=True,
    echo=False,
    future=True,
)

# ---------------------------------------------------------------------------
# Session Factory
# ---------------------------------------------------------------------------

async_session_maker = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    autoflush=False,
    class_=AsyncSession,
)

# ---------------------------------------------------------------------------
# Dependency Injection (for FastAPI)
# ---------------------------------------------------------------------------

@asynccontextmanager
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Provides an AsyncSession to FastAPI routes via dependency injection.
    Ensures proper cleanup and rollback safety on error.

    Yields:
        AsyncSession: Database session for use within request context.
    """
    session = async_session_maker()
    try:
        yield session
        await session.commit()
    except SQLAlchemyError as e:
        await session.rollback()
        log.error("?? DB transaction rolled back due to error", exc_info=e)
        raise
    except Exception as e:
        log.critical("? Unexpected DB session error", exc_info=e)
        await session.rollback()
        raise
    finally:
        await session.close()
        log.debug("? Async DB session closed cleanly.")

# ---------------------------------------------------------------------------
# Alias for Middleware Compatibility
# ---------------------------------------------------------------------------

# Some older modules (like AuditMiddleware) still import get_session
get_session = get_db  # backward-compatible alias

# ---------------------------------------------------------------------------
# Health Check Utility
# ---------------------------------------------------------------------------

async def check_db_health() -> bool:
    """
    Lightweight database connectivity check.
    Used for /health endpoint or internal monitoring systems.
    Returns True if connection succeeds; False otherwise.
    """
    try:
        async with engine.begin() as conn:
            await conn.run_sync(lambda _: None)
        return True
    except Exception as e:
        log.error(f"? DB health check failed: {e}")
        return False
