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

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

log = logging.getLogger(__name__)


async def inject_tenant_rls(session: AsyncSession, tenant_id: str | None) -> None:
    """
    Inject tenant ID into current PostgreSQL transaction via SET LOCAL.
    Must be called after a transaction has started.

    None sets empty string — RLS policies treat this as no-match.
    """
    safe_id = str(tenant_id) if tenant_id else ""
    await session.execute(
        text("SET LOCAL app.current_tenant_id = :tenant_id"),
        {"tenant_id": safe_id},
    )
    log.debug("RLS tenant injected: company_id=%s", safe_id or "<anonymous>")
