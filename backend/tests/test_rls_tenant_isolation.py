"""
RLS tenant isolation tests.

SQLite-compatible tests verify module structure and interface.
PostgreSQL tests (marked requires_postgres) verify SET LOCAL transaction-scoping
and cross-tenant isolation with pool_size >= 3.
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock

import pytest


class TestRLSModuleStructure:
    def test_rls_module_importable(self):
        from app.core.rls import inject_tenant_rls
        assert callable(inject_tenant_rls)

    def test_rls_uses_transaction_local_scope(self):
        """Source must use transaction-local injection (set_config(...,true) or
        SET LOCAL) — never connection-scoped SET, which would leak across pooled
        connections."""
        import inspect

        from app.core import rls
        src = inspect.getsource(rls)
        # Either the function form (parameterizable, current implementation) or
        # the bare statement form (kept allowed for any future inlined call site).
        assert "set_config(" in src or "SET LOCAL" in src, (
            "RLS must use a transaction-local injection pattern "
            "(set_config(name, value, true) or SET LOCAL)"
        )

    def test_rls_module_does_not_use_connection_scoped_set(self):
        """Plain `SET app.x = ...` (connection-scoped) must never appear, since
        pooled asyncpg connections would leak the value to the next request."""
        import inspect

        from app.core import rls
        src = inspect.getsource(rls)
        for line in src.splitlines():
            stripped = line.strip()
            if "SET app.current_tenant_id" in stripped and "SET LOCAL" not in stripped:
                pytest.fail(
                    f"Found connection-scoped SET on line: {stripped!r}. "
                    f"Must use set_config(..., true) or SET LOCAL."
                )


class TestRLSInjectionInterface:
    @pytest.mark.asyncio
    async def test_inject_tenant_rls_executes_set_local(self):
        from app.core.rls import inject_tenant_rls

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock()

        company_id = uuid.uuid4()
        await inject_tenant_rls(mock_session, str(company_id))

        assert mock_session.execute.call_count == 2
        sql_text = "\n".join(str(call.args[0]) for call in mock_session.execute.call_args_list)
        lower = sql_text.lower()
        assert "set_config(" in lower or "set local" in lower, (
            f"Expected transaction-local injection (set_config or SET LOCAL); got: {sql_text!r}"
        )
        assert "app.current_tenant_id" in sql_text
        assert "app.bypass_tenant_rls" in sql_text

    @pytest.mark.asyncio
    async def test_inject_tenant_rls_with_none_uses_empty_string(self):
        """None company_id must set empty string (not crash)."""
        from app.core.rls import inject_tenant_rls

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock()

        await inject_tenant_rls(mock_session, None)
        assert mock_session.execute.call_count == 2

    def test_context_helpers_round_trip(self):
        from app.core.rls import (
            clear_tenant_rls_context,
            get_tenant_rls_context,
            set_tenant_rls_context,
        )

        company_id = str(uuid.uuid4())
        set_tenant_rls_context(company_id, bypass=True)
        assert get_tenant_rls_context() == (company_id, True)

        clear_tenant_rls_context()
        assert get_tenant_rls_context() == (None, False)


@pytest.mark.requires_postgres
class TestRLSProductionSessionPath:
    """Regression coverage for the 2026-05-16 P1 incident: production
    `TenantRLSAsyncSession.execute()` must successfully issue its
    transaction-local tenant injection against a real PostgreSQL driver.

    The earlier `TestRLSPostgresPoolIsolation` tests bypass the wrapped
    session class and call SET LOCAL directly via f-string, so they
    cannot exercise the bind-parameter path that broke production.
    These tests use the actual production class to close that gap.
    """

    @pytest.mark.asyncio
    async def test_wrapped_session_executes_select_one(self, pg_engine):
        """The canonical health-check query (`SELECT 1`) must succeed through
        TenantRLSAsyncSession. This is the exact failure mode of the
        2026-05-16 incident: SET LOCAL with bind params raised
        asyncpg.exceptions.PostgresSyntaxError before SELECT 1 could run."""
        from sqlalchemy import text
        from sqlalchemy.ext.asyncio import async_sessionmaker

        from app.core.rls import TenantRLSAsyncSession, clear_tenant_rls_context

        Session = async_sessionmaker(
            pg_engine, class_=TenantRLSAsyncSession, expire_on_commit=False
        )
        try:
            async with Session() as s:
                result = await s.execute(text("SELECT 1"))
                assert result.scalar() == 1
        finally:
            clear_tenant_rls_context()

    @pytest.mark.asyncio
    async def test_wrapped_session_sets_tenant_via_set_config(self, pg_engine):
        """With a tenant context set, the wrapped session must inject it such
        that current_setting('app.current_tenant_id') returns the same UUID
        from inside the same transaction."""
        from sqlalchemy import text
        from sqlalchemy.ext.asyncio import async_sessionmaker

        from app.core.rls import (
            TenantRLSAsyncSession,
            clear_tenant_rls_context,
            set_tenant_rls_context,
        )

        Session = async_sessionmaker(
            pg_engine, class_=TenantRLSAsyncSession, expire_on_commit=False
        )
        tenant_id = str(uuid.uuid4())
        set_tenant_rls_context(tenant_id, bypass=False)
        try:
            async with Session() as s:
                result = await s.execute(
                    text("SELECT current_setting('app.current_tenant_id', true)")
                )
                assert result.scalar() == tenant_id
        finally:
            clear_tenant_rls_context()


@pytest.mark.requires_postgres
class TestRLSPostgresPoolIsolation:
    """PostgreSQL-only tests — auto-skip on SQLite."""

    @pytest.mark.asyncio
    async def test_set_local_reverts_after_transaction(self, pg_engine):
        from sqlalchemy import text
        from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

        Session = async_sessionmaker(pg_engine, class_=AsyncSession, expire_on_commit=False)
        company_id = str(uuid.uuid4())

        async with Session() as s1:
            await s1.execute(text(f"SET LOCAL app.current_tenant_id = '{company_id}'"))
            result = await s1.execute(
                text("SELECT current_setting('app.current_tenant_id', true)")
            )
            assert result.scalar() == company_id
            await s1.rollback()

        async with Session() as s2:
            result = await s2.execute(
                text("SELECT current_setting('app.current_tenant_id', true)")
            )
            value = result.scalar()
            assert value in (None, "", "null"), \
                f"SET LOCAL leaked across transactions: got {value!r}"

    @pytest.mark.asyncio
    async def test_concurrent_sessions_no_cross_tenant_leak(self, pg_engine):
        import asyncio

        from sqlalchemy import text
        from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

        Session = async_sessionmaker(pg_engine, class_=AsyncSession, expire_on_commit=False)
        tenant_a = str(uuid.uuid4())
        tenant_b = str(uuid.uuid4())
        tenant_c = str(uuid.uuid4())
        results = {}

        async def run_tenant(name: str, tenant_id: str):
            async with Session() as s:
                await s.execute(text(f"SET LOCAL app.current_tenant_id = '{tenant_id}'"))
                await asyncio.sleep(0.05)
                result = await s.execute(
                    text("SELECT current_setting('app.current_tenant_id', true)")
                )
                results[name] = result.scalar()
                await s.commit()

        await asyncio.gather(
            run_tenant("a", tenant_a),
            run_tenant("b", tenant_b),
            run_tenant("c", tenant_c),
        )

        assert results["a"] == tenant_a
        assert results["b"] == tenant_b
        assert results["c"] == tenant_c
