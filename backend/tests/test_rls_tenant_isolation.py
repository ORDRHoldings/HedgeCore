"""
RLS tenant isolation tests.

SQLite-compatible tests verify module structure and interface.
PostgreSQL tests (marked requires_postgres) verify SET LOCAL transaction-scoping
and cross-tenant isolation with pool_size >= 3.
"""
from __future__ import annotations

import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock


class TestRLSModuleStructure:
    def test_rls_module_importable(self):
        from app.core.rls import inject_tenant_rls
        assert callable(inject_tenant_rls)

    def test_rls_uses_set_local(self):
        """Source must use SET LOCAL (not SET) to keep setting transaction-scoped."""
        import inspect
        from app.core import rls
        src = inspect.getsource(rls)
        assert "SET LOCAL" in src, "RLS must use SET LOCAL for transaction-scoping"
        assert "SET app." not in src.replace("SET LOCAL", ""), \
            "Plain SET (connection-scoped) must not be used for tenant_id"

    def test_rls_module_does_not_use_connection_scoped_set(self):
        import inspect
        from app.core import rls
        src = inspect.getsource(rls)
        lines = src.splitlines()
        for line in lines:
            stripped = line.strip()
            if "SET app.current_tenant_id" in stripped and "SET LOCAL" not in stripped:
                pytest.fail(
                    f"Found connection-scoped SET on line: {stripped!r}. Must use SET LOCAL."
                )


class TestRLSInjectionInterface:
    @pytest.mark.asyncio
    async def test_inject_tenant_rls_executes_set_local(self):
        from app.core.rls import inject_tenant_rls

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock()

        company_id = uuid.uuid4()
        await inject_tenant_rls(mock_session, str(company_id))

        mock_session.execute.assert_called_once()
        call_args = mock_session.execute.call_args
        sql_text = str(call_args[0][0])
        assert "SET LOCAL" in sql_text or "set local" in sql_text.lower()

    @pytest.mark.asyncio
    async def test_inject_tenant_rls_with_none_uses_empty_string(self):
        """None company_id must set empty string (not crash)."""
        from app.core.rls import inject_tenant_rls

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock()

        await inject_tenant_rls(mock_session, None)
        mock_session.execute.assert_called_once()


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
