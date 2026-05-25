"""Regression test for RISK-AUTH-RLS-02 — JWT auth path must inject RLS context.

Originally `app/api/routes/dashboard.py` carried a local `_resolve_user` helper
that decoded the JWT and skipped `set_tenant_rls_context`/`inject_tenant_rls`,
so subsequent queries against `positions` and `calculation_runs` (both
RLS-forced by migration 0036) silently returned empty. The helper was deleted
after the routes were refactored to `Depends(get_current_user)`; these tests
pin the canonical dep's RLS injection contract so any future regression
(another parallel auth helper, accidental removal of the inject call) trips
the suite instead of leaking to prod.

Tests run against the canonical `get_current_user` from
`app/core/dependencies.py` with a mock AsyncSession on SQLite.
"""
from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite://")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-ci-at-least-32-chars-long")

from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest
from fastapi import Request

from app.core.dependencies import get_current_user
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
    user.token_version = None  # disable token-version check
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
async def test_get_current_user_sets_tenant_rls_context_to_company_id():
    clear_tenant_rls_context()
    token = create_access_token(sub=USER_ID, email="t@example.com")
    user = _mock_user(is_superuser=False)
    db = _mock_db_returning(user)

    returned = await get_current_user(_mock_request(token), db)
    assert returned is user

    tenant_id, bypass = get_tenant_rls_context()
    assert tenant_id == COMPANY_ID
    assert bypass is False
    clear_tenant_rls_context()


@pytest.mark.asyncio
async def test_get_current_user_sets_bypass_for_superuser():
    clear_tenant_rls_context()
    token = create_access_token(sub=USER_ID, email="t@example.com")
    user = _mock_user(is_superuser=True)
    db = _mock_db_returning(user)

    await get_current_user(_mock_request(token), db)
    tenant_id, bypass = get_tenant_rls_context()
    assert tenant_id == COMPANY_ID
    assert bypass is True
    clear_tenant_rls_context()


@pytest.mark.asyncio
async def test_get_current_user_invalid_user_does_not_set_context():
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
        await get_current_user(_mock_request(token), db)
    assert exc.value.status_code == 401

    tenant_id, bypass = get_tenant_rls_context()
    assert tenant_id is None
    assert bypass is False


@pytest.mark.asyncio
async def test_dashboard_routes_depend_on_get_current_user():
    """Structural regression: each /api/v1/dashboard/* route's dependant tree
    must contain `get_current_user`. This is what guarantees the RLS contextvar
    is set before the route body runs — and it's what the RISK-AUTH-RLS-02
    startup guard would also catch, but pinning it here gives a precise unit
    failure if someone reintroduces a parallel auth helper."""
    from fastapi.routing import APIRoute

    from app.main import app

    dashboard_paths = [
        "/api/v1/dashboard/summary",
        "/api/v1/dashboard/recent-runs",
        "/api/v1/dashboard/pending-approvals",
        "/api/v1/dashboard/team-activity",
        "/api/v1/dashboard/branch-comparison",
        "/api/v1/dashboard/pipeline-status",
        "/api/v1/dashboard/aggregate",
    ]

    def _has_dep(dependant, target) -> bool:
        if dependant is None:
            return False
        if dependant.call is target:
            return True
        return any(_has_dep(sub, target) for sub in dependant.dependencies)

    found = {}
    for route in app.routes:
        if isinstance(route, APIRoute) and route.path in dashboard_paths:
            found[route.path] = _has_dep(route.dependant, get_current_user)

    missing = [p for p in dashboard_paths if p not in found]
    assert not missing, f"Dashboard routes missing from app.routes: {missing}"
    failed = [p for p, ok in found.items() if not ok]
    assert not failed, (
        f"Dashboard routes missing Depends(get_current_user): {failed}. "
        "This is exactly the RISK-AUTH-RLS-02 regression class — a parallel "
        "auth helper would silently empty RLS-forced queries in prod."
    )
