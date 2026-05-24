"""Regression test for RISK-AUTH-RLS-02 — dashboard routes must inject RLS.

`app/api/routes/dashboard.py` uses a local `_resolve_user(request, db)` helper
that decodes the JWT directly instead of depending on `get_current_user`.
Before the fix, this skipped `set_tenant_rls_context`/`inject_tenant_rls`,
so subsequent queries against `positions` and `calculation_runs` (both
RLS-forced by migration 0036) would silently return empty.

This test pins the contract: after `_resolve_user` returns, the request-local
RLS contextvar must hold the user's company_id (or be flagged bypass for
superusers). It uses a mock session so it runs on SQLite in CI.
"""
from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite://")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-ci-at-least-32-chars-long")

from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest
from fastapi import Request

from app.api.routes.dashboard import _resolve_user
from app.core.rls import (
    clear_tenant_rls_context,
    get_tenant_rls_context,
)
from app.core.security import create_access_token

USER_ID = "00000000-0000-0000-0000-000000000001"
COMPANY_ID = "00000000-0000-0000-0000-000000000002"


def _mock_request(token: str) -> Request:
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/api/v1/dashboard/summary",
        "headers": [(b"authorization", f"Bearer {token}".encode())],
    }
    return Request(scope)


def _mock_user(is_superuser: bool = False) -> MagicMock:
    user = MagicMock()
    user.id = UUID(USER_ID)
    user.is_active = True
    user.is_superuser = is_superuser
    user.company_id = UUID(COMPANY_ID)
    user.branch_id = None
    return user


def _mock_db_returning(user: MagicMock) -> AsyncMock:
    user_result = MagicMock()
    user_scalars = MagicMock()
    user_scalars.first.return_value = user
    user_result.scalars.return_value = user_scalars
    db = AsyncMock()
    db.execute = AsyncMock(return_value=user_result)
    db.get_bind = MagicMock(return_value=None)  # non-PG → inject_tenant_rls no-ops
    return db


@pytest.mark.asyncio
async def test_resolve_user_sets_tenant_rls_context_to_company_id():
    clear_tenant_rls_context()
    token = create_access_token(sub=USER_ID, email="t@example.com")
    user = _mock_user(is_superuser=False)
    db = _mock_db_returning(user)

    returned = await _resolve_user(_mock_request(token), db)
    assert returned is user

    tenant_id, bypass = get_tenant_rls_context()
    assert tenant_id == COMPANY_ID
    assert bypass is False
    clear_tenant_rls_context()


@pytest.mark.asyncio
async def test_resolve_user_sets_bypass_for_superuser():
    clear_tenant_rls_context()
    token = create_access_token(sub=USER_ID, email="t@example.com")
    user = _mock_user(is_superuser=True)
    db = _mock_db_returning(user)

    await _resolve_user(_mock_request(token), db)
    tenant_id, bypass = get_tenant_rls_context()
    assert tenant_id == COMPANY_ID
    assert bypass is True
    clear_tenant_rls_context()


@pytest.mark.asyncio
async def test_resolve_user_invalid_user_does_not_set_context():
    """If the user lookup fails (inactive/missing), RLS context must NOT leak
    from a prior request — the 401 path leaves it cleared."""
    clear_tenant_rls_context()
    token = create_access_token(sub=USER_ID, email="t@example.com")

    user_result = MagicMock()
    user_scalars = MagicMock()
    user_scalars.first.return_value = None  # user not found
    user_result.scalars.return_value = user_scalars
    db = AsyncMock()
    db.execute = AsyncMock(return_value=user_result)
    db.get_bind = MagicMock(return_value=None)

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        await _resolve_user(_mock_request(token), db)
    assert exc.value.status_code == 401

    tenant_id, bypass = get_tenant_rls_context()
    assert tenant_id is None
    assert bypass is False
