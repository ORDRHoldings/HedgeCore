"""
app/core/rls.py
ORDR Terminal — PostgreSQL Row Level Security tenant injection.

CRITICAL: SET LOCAL is used (not SET) because:
- SET LOCAL is transaction-scoped: reverts when the transaction ends.
- SET is connection-scoped: persists on pooled connections and leaks to next request.
- async connection pooling (asyncpg + SQLAlchemy) reuses connections across requests.
  SET LOCAL is the only safe option.

Usage:
    await inject_tenant_rls(session, str(current_user.company_id))
"""
from __future__ import annotations

import logging
from contextvars import ContextVar
from inspect import isawaitable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)

_current_tenant_id: ContextVar[str | None] = ContextVar("rls_current_tenant_id", default=None)
_current_bypass: ContextVar[bool] = ContextVar("rls_current_bypass", default=False)


def set_tenant_rls_context(tenant_id: str | None, *, bypass: bool = False) -> None:
    """Set the request-local tenant context consumed by DB sessions."""
    _current_tenant_id.set(str(tenant_id) if tenant_id else None)
    _current_bypass.set(bool(bypass))


def clear_tenant_rls_context() -> None:
    """Clear request-local RLS context after a request/session lifecycle."""
    _current_tenant_id.set(None)
    _current_bypass.set(False)


def get_tenant_rls_context() -> tuple[str | None, bool]:
    return _current_tenant_id.get(), _current_bypass.get()


def _is_postgresql_session(session: AsyncSession) -> bool:
    try:
        bind = session.get_bind()
    except Exception:
        # Test doubles do not expose SQLAlchemy binds; keep unit tests meaningful.
        return True
    if isawaitable(bind):
        close = getattr(bind, "close", None)
        if callable(close):
            close()
        return True
    if bind is None:
        return True
    dialect = getattr(bind, "dialect", None)
    if dialect is None:
        return True
    return getattr(dialect, "name", "") == "postgresql"


async def inject_tenant_rls(
    session: AsyncSession,
    tenant_id: str | None,
    *,
    bypass: bool = False,
) -> None:
    """
    Inject tenant ID into current PostgreSQL transaction via SET LOCAL.
    Must be called after a transaction has started.

    None sets empty string — RLS policies treat this as no-match.
    """
    if not _is_postgresql_session(session):
        return

    safe_id = str(tenant_id) if tenant_id else ""
    previous_injecting = getattr(session, "_tenant_rls_injecting", False)
    session._tenant_rls_injecting = True
    try:
        await session.execute(
            text("SET LOCAL app.current_tenant_id = :tenant_id"),
            {"tenant_id": safe_id},
        )
        await session.execute(
            text("SET LOCAL app.bypass_tenant_rls = :bypass"),
            {"bypass": "true" if bypass else "false"},
        )
    finally:
        session._tenant_rls_injecting = previous_injecting
    session._tenant_rls_marker = (safe_id, bool(bypass))
    log.debug(
        "RLS tenant injected: company_id=%s bypass=%s",
        safe_id or "<anonymous>",
        bool(bypass),
    )


async def ensure_session_tenant_rls(session: AsyncSession) -> None:
    """Apply request-local tenant context to a PostgreSQL session once per context."""
    tenant_id, bypass = get_tenant_rls_context()
    marker = (tenant_id or "", bool(bypass))
    if getattr(session, "_tenant_rls_marker", None) == marker:
        return
    await inject_tenant_rls(session, tenant_id, bypass=bypass)
    session._tenant_rls_marker = marker


class TenantRLSAsyncSession(AsyncSession):
    """AsyncSession that applies request-local PostgreSQL RLS context before SQL."""

    async def execute(self, statement, params=None, *, execution_options=None, bind_arguments=None, **kw):
        if not getattr(self, "_tenant_rls_injecting", False):
            await ensure_session_tenant_rls(self)
        return await super().execute(
            statement,
            params=params,
            execution_options=execution_options,
            bind_arguments=bind_arguments,
            **kw,
        )
