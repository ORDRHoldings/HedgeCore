"""
tests/test_db_core.py
Validates HedgeCalc database connectivity, metadata, and UUID integrity.
"""

import asyncio
import pytest
from sqlalchemy import text
from app.core.db import async_engine, init_engine, shutdown_engine

pytestmark = pytest.mark.requires_postgres


@pytest.mark.asyncio
async def test_database_connectivity():
    """Ensure async engine can connect to PostgreSQL."""
    await init_engine()
    async with async_engine.begin() as conn:
        result = await conn.execute(text("SELECT 1"))
        value = result.scalar_one()
        assert value == 1, "Database connectivity failed"
    await shutdown_engine()


@pytest.mark.asyncio
async def test_metadata_tables():
    """Verify required tables exist in the current database."""
    await init_engine()
    async with async_engine.connect() as conn:
        res = await conn.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema='public';"
            )
        )
        tables = {row[0] for row in res}
        # Expected core tables
        for table in ("users", "alembic_version"):
            assert table in tables, f"Missing table: {table}"
    await shutdown_engine()


@pytest.mark.asyncio
async def test_uuid_primary_keys():
    """Confirm UUIDs are properly stored as text and valid in Postgres."""
    await init_engine()
    async with async_engine.connect() as conn:
        result = await conn.execute(
            text(
                "SELECT column_name, data_type "
                "FROM information_schema.columns "
                "WHERE table_name='users';"
            )
        )
        column_types = {row[0]: row[1] for row in result}
        assert column_types.get("id") in {"uuid", "character varying"}, \
            f"Unexpected type for user.id: {column_types.get('id')}"
    await shutdown_engine()
