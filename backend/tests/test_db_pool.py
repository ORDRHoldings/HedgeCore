"""Tests for database connection pool configuration."""
from __future__ import annotations
import pytest


def test_pool_settings_have_defaults():
    """Settings must expose DB pool config with production-safe defaults."""
    from app.core.config import Settings
    s = Settings(
        DATABASE_URL="postgresql+asyncpg://user:pass@host/db",
        JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long",
    )
    assert s.DB_POOL_SIZE == 20
    assert s.DB_MAX_OVERFLOW == 10
    assert s.DB_POOL_TIMEOUT == 30
    assert s.DB_POOL_PRE_PING is True


def test_pool_settings_are_configurable():
    """Pool settings must be overridable via environment variables."""
    from app.core.config import Settings
    s = Settings(
        DATABASE_URL="postgresql+asyncpg://user:pass@host/db",
        JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long",
        DB_POOL_SIZE=5,
        DB_MAX_OVERFLOW=2,
        DB_POOL_TIMEOUT=10,
    )
    assert s.DB_POOL_SIZE == 5
    assert s.DB_MAX_OVERFLOW == 2
    assert s.DB_POOL_TIMEOUT == 10


def test_sqlite_url_uses_nullpool(monkeypatch):
    """SQLite DATABASE_URL must produce NullPool engine (required for async SQLite)."""
    import asyncio
    from sqlalchemy.pool import NullPool
    from app.core.db import create_engine_from_url

    engine = create_engine_from_url("sqlite+aiosqlite://")
    assert engine.pool.__class__.__name__ == "NullPool"
    asyncio.get_event_loop().run_until_complete(engine.dispose())
