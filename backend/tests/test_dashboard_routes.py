"""
tests/test_dashboard_routes.py

Unit tests for app/api/routes/dashboard.py

Coverage targets:
  - GET /api/v1/dashboard/summary
  - GET /api/v1/dashboard/recent-runs
  - GET /api/v1/dashboard/pending-approvals
  - GET /api/v1/dashboard/team-activity
  - GET /api/v1/dashboard/aggregate

Auth mechanism: Depends(get_current_user) (canonical JWT dep from
                app/core/dependencies.py). It validates the token, loads the
                user, then calls inject_tenant_rls (2 set_config execute calls)
                before the route body runs. Mock sequences must account for
                those 2 slots between the user lookup and the first route query.
DB mocking: app.dependency_overrides[get_session] with an async generator that
            yields the mock AsyncMock session.

Route mount: main.py mounts api_router at /api; dashboard router prefix is /v1/dashboard.
Full path = /api/v1/dashboard/<endpoint>.
"""

from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite://")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-ci-at-least-32-chars-long")

import pytest
import contextlib
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.db import get_session
from app.core.security import create_access_token

BASE_URL = "http://test"

# Routes are mounted: app.include_router(api_router, prefix="/api")
# Dashboard router prefix: /v1/dashboard
# Full path: /api/v1/dashboard/...
DASH = "/api/v1/dashboard"

USER_ID = "00000000-0000-0000-0000-000000000001"
COMPANY_ID = "00000000-0000-0000-0000-000000000002"
BRANCH_ID = "00000000-0000-0000-0000-000000000003"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_token(user_id: str = USER_ID) -> str:
    return create_access_token(sub=user_id, email="test@example.com")


def _make_user(
    user_id: str = USER_ID,
    is_superuser: bool = False,
    has_branch: bool = True,
) -> MagicMock:
    """Return a MagicMock mimicking a User ORM object."""
    user = MagicMock()
    user.id = UUID(user_id)
    user.is_active = True
    user.is_superuser = is_superuser
    user.company_id = UUID(COMPANY_ID)
    user.branch_id = UUID(BRANCH_ID) if has_branch else None

    branch = MagicMock()
    branch.code = "HQ"
    branch.currency = "USD"
    branch.name = "HQ Branch"
    branch.is_active = True
    user.branch = branch

    company = MagicMock()
    company.name = "TestCorp"
    user.company = company

    return user


def _make_db_session_with_user(user: MagicMock) -> AsyncMock:
    """
    AsyncMock session where the FIRST execute call (user lookup in
    get_current_user) returns the given user, and all subsequent calls return
    0 / empty lists. The 40-slot tail covers the 2 set_config execute calls
    from inject_tenant_rls plus every downstream route query under test.
    """
    # First result: user lookup via select(User).where(User.id == user_id)
    user_result = MagicMock()
    user_scalars = MagicMock()
    user_scalars.first.return_value = user
    user_scalars.all.return_value = []
    user_result.scalars.return_value = user_scalars
    user_result.scalar.return_value = 0

    # All subsequent results: count / aggregate / list queries return zero / empty
    empty_result = MagicMock()
    empty_scalars = MagicMock()
    empty_scalars.all.return_value = []
    empty_scalars.first.return_value = None
    empty_result.scalars.return_value = empty_scalars
    empty_result.scalar.return_value = 0

    db = AsyncMock()
    db.execute = AsyncMock(side_effect=[user_result] + [empty_result] * 40)
    return db


def _override_session(mock_db: AsyncMock):
    """
    Return a FastAPI dependency override: an async generator yielding mock_db.
    Use as: app.dependency_overrides[get_session] = _override_session(mock_db)
    """
    async def _override():
        yield mock_db
    return _override


@contextlib.contextmanager
def _with_session(mock_db: AsyncMock):
    """Context manager that installs and cleans up the session dependency override."""
    app.dependency_overrides[get_session] = _override_session(mock_db)
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_session, None)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def token() -> str:
    return _make_token()


@pytest.fixture
def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# 1. Missing / invalid auth → 401
# ---------------------------------------------------------------------------

class TestAuthRejection:
    """Requests without a valid bearer token must be rejected with 401."""

    @pytest.mark.asyncio
    async def test_summary_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.get(f"{DASH}/summary")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_recent_runs_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.get(f"{DASH}/recent-runs")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_pending_approvals_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.get(f"{DASH}/pending-approvals")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_team_activity_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.get(f"{DASH}/team-activity")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_aggregate_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.get(f"{DASH}/aggregate")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_summary_bad_token(self):
        """A structurally invalid JWT is rejected with 401 by decode_token."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.get(
                f"{DASH}/summary",
                headers={"Authorization": "Bearer this.is.not.valid"},
            )
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_summary_wrong_scheme(self):
        """Non-Bearer Authorization scheme → 401 from _extract_bearer."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.get(
                f"{DASH}/summary",
                headers={"Authorization": "Basic dXNlcjpwYXNz"},
            )
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# 2. GET /api/v1/dashboard/summary — happy path
# ---------------------------------------------------------------------------

class TestDashboardSummary:

    @pytest.mark.asyncio
    async def test_summary_returns_200_with_kpis_key(self, auth_header: dict):
        user = _make_user()
        db = _make_db_session_with_user(user)

        with (
            _with_session(db),
            patch(
                "app.api.routes.dashboard.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "app.api.routes.dashboard.rbac_service.get_roles_by_user",
                new=AsyncMock(return_value=["trader"]),
            ),
            patch(
                "app.api.routes.dashboard.rbac_service.get_user_hierarchy_level",
                new=AsyncMock(return_value=5),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{DASH}/summary", headers=auth_header)

        assert r.status_code == 200
        assert "kpis" in r.json()

    @pytest.mark.asyncio
    async def test_summary_kpis_contain_required_fields(self, auth_header: dict):
        user = _make_user()
        db = _make_db_session_with_user(user)

        with (
            _with_session(db),
            patch(
                "app.api.routes.dashboard.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "app.api.routes.dashboard.rbac_service.get_roles_by_user",
                new=AsyncMock(return_value=["trader"]),
            ),
            patch(
                "app.api.routes.dashboard.rbac_service.get_user_hierarchy_level",
                new=AsyncMock(return_value=5),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{DASH}/summary", headers=auth_header)

        assert r.status_code == 200
        kpis = r.json()["kpis"]
        for key in [
            "active_proposals",
            "pending_approvals",
            "total_exposure_usd",
            "hedge_coverage_pct",
            "open_alerts",
            "team_size",
        ]:
            assert key in kpis, f"Missing KPI key: {key}"

    @pytest.mark.asyncio
    async def test_summary_zero_state_numeric_defaults(self, auth_header: dict):
        """With empty DB, all numeric KPIs should be 0 / 0.0."""
        user = _make_user()
        db = _make_db_session_with_user(user)

        with (
            _with_session(db),
            patch(
                "app.api.routes.dashboard.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "app.api.routes.dashboard.rbac_service.get_roles_by_user",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "app.api.routes.dashboard.rbac_service.get_user_hierarchy_level",
                new=AsyncMock(return_value=None),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{DASH}/summary", headers=auth_header)

        assert r.status_code == 200
        kpis = r.json()["kpis"]
        assert kpis["active_proposals"] == 0
        assert kpis["pending_approvals"] == 0
        assert kpis["total_exposure_usd"] == 0.0
        assert kpis["hedge_coverage_pct"] == 0.0
        assert kpis["open_alerts"] == 0

    @pytest.mark.asyncio
    async def test_summary_superuser_sees_all_branches(self):
        """Superuser flag results in is_company_wide=True in response."""
        token = _make_token()
        user = _make_user(is_superuser=True)
        db = _make_db_session_with_user(user)

        with (
            _with_session(db),
            patch(
                "app.api.routes.dashboard.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "app.api.routes.dashboard.rbac_service.get_roles_by_user",
                new=AsyncMock(return_value=["superuser"]),
            ),
            patch(
                "app.api.routes.dashboard.rbac_service.get_user_hierarchy_level",
                new=AsyncMock(return_value=15),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{DASH}/summary",
                    headers={"Authorization": f"Bearer {token}"},
                )

        assert r.status_code == 200
        assert r.json()["is_company_wide"] is True

    @pytest.mark.asyncio
    async def test_summary_permission_view_all_branches(self, auth_header: dict):
        """User with reports.view_all_branches sees company-wide data."""
        user = _make_user()
        db = _make_db_session_with_user(user)

        with (
            _with_session(db),
            patch(
                "app.api.routes.dashboard.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["reports.view_all_branches"]),
            ),
            patch(
                "app.api.routes.dashboard.rbac_service.get_roles_by_user",
                new=AsyncMock(return_value=["analyst"]),
            ),
            patch(
                "app.api.routes.dashboard.rbac_service.get_user_hierarchy_level",
                new=AsyncMock(return_value=8),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{DASH}/summary", headers=auth_header)

        assert r.status_code == 200
        assert r.json()["is_company_wide"] is True


# ---------------------------------------------------------------------------
# 3. GET /api/v1/dashboard/recent-runs — happy path
# ---------------------------------------------------------------------------

class TestRecentRuns:

    @pytest.mark.asyncio
    async def test_recent_runs_returns_200(self, auth_header: dict):
        user = _make_user()
        db = _make_db_session_with_user(user)

        with _with_session(db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{DASH}/recent-runs", headers=auth_header)

        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_recent_runs_returns_list(self, auth_header: dict):
        user = _make_user()
        db = _make_db_session_with_user(user)

        with _with_session(db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{DASH}/recent-runs", headers=auth_header)

        assert isinstance(r.json(), list)

    @pytest.mark.asyncio
    async def test_recent_runs_empty_when_no_data(self, auth_header: dict):
        """Zero-state DB returns empty list, not an error."""
        user = _make_user()
        db = _make_db_session_with_user(user)

        with _with_session(db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{DASH}/recent-runs", headers=auth_header)

        assert r.json() == []

    @pytest.mark.asyncio
    async def test_recent_runs_with_data_contains_id_key(self, auth_header: dict):
        """When a run exists, the entry must use 'id' key (not 'run_id')."""
        from uuid import uuid4
        from datetime import datetime, timezone

        run = MagicMock()
        run.id = uuid4()
        run.created_at = datetime(2025, 1, 1, tzinfo=timezone.utc)
        run.position_ids = []
        run.trade_count = 2
        run.hedge_count = 1
        run.company_id = UUID(COMPANY_ID)
        run.user_id = UUID(USER_ID)

        user = _make_user()

        # Build the side_effect sequence manually
        user_result = MagicMock()
        user_result.scalars.return_value.first.return_value = user
        user_result.scalars.return_value.all.return_value = []
        user_result.scalar.return_value = 0

        run_result = MagicMock()
        run_result.scalars.return_value.all.return_value = [run]
        run_result.scalar.return_value = 0

        empty_result = MagicMock()
        empty_result.scalars.return_value.all.return_value = []
        empty_result.scalar.return_value = 0

        # Sequence: user lookup → 2 set_config calls from inject_tenant_rls in
        # get_current_user → run query → position query (no positions) → ...
        db = AsyncMock()
        db.execute = AsyncMock(
            side_effect=[user_result, empty_result, empty_result, run_result] + [empty_result] * 10
        )

        with _with_session(db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{DASH}/recent-runs", headers=auth_header)

        assert r.status_code == 200
        items = r.json()
        assert len(items) == 1
        assert "id" in items[0], "Recent runs must use 'id' key, not 'run_id'"
        assert "run_id" not in items[0]
        assert items[0]["status"] == "COMPLETE"


# ---------------------------------------------------------------------------
# 4. GET /api/v1/dashboard/pending-approvals
# ---------------------------------------------------------------------------

class TestPendingApprovals:

    @pytest.mark.asyncio
    async def test_pending_approvals_forbidden_without_permission(self, auth_header: dict):
        """Users without pipeline.approve permission receive 403."""
        user = _make_user()
        db = _make_db_session_with_user(user)

        with (
            _with_session(db),
            patch(
                "app.api.routes.dashboard.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{DASH}/pending-approvals", headers=auth_header)

        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_pending_approvals_200_with_pipeline_approve(self, auth_header: dict):
        """User with pipeline.approve permission receives 200 and a list."""
        user = _make_user()
        db = _make_db_session_with_user(user)

        with (
            _with_session(db),
            patch(
                "app.api.routes.dashboard.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["pipeline.approve"]),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{DASH}/pending-approvals", headers=auth_header)

        assert r.status_code == 200
        assert isinstance(r.json(), list)

    @pytest.mark.asyncio
    async def test_pending_approvals_superuser_bypasses_permission(self):
        """Superuser accesses pending-approvals regardless of explicit permission."""
        token = _make_token()
        user = _make_user(is_superuser=True)
        db = _make_db_session_with_user(user)

        with (
            _with_session(db),
            patch(
                "app.api.routes.dashboard.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),  # no pipeline.approve, but is_superuser=True
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{DASH}/pending-approvals",
                    headers={"Authorization": f"Bearer {token}"},
                )

        assert r.status_code == 200
        assert isinstance(r.json(), list)

    @pytest.mark.asyncio
    async def test_pending_approvals_empty_in_zero_state(self, auth_header: dict):
        """With pipeline.approve permission but no data, returns empty list."""
        user = _make_user()
        db = _make_db_session_with_user(user)

        with (
            _with_session(db),
            patch(
                "app.api.routes.dashboard.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["pipeline.approve"]),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{DASH}/pending-approvals", headers=auth_header)

        assert r.status_code == 200
        assert r.json() == []


# ---------------------------------------------------------------------------
# 5. GET /api/v1/dashboard/team-activity
# ---------------------------------------------------------------------------

class TestTeamActivity:

    @pytest.mark.asyncio
    async def test_team_activity_forbidden_without_permission(self, auth_header: dict):
        """Users without audit.view_branch or audit.view_all receive 403."""
        user = _make_user()
        db = _make_db_session_with_user(user)

        with (
            _with_session(db),
            patch(
                "app.api.routes.dashboard.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{DASH}/team-activity", headers=auth_header)

        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_team_activity_200_with_audit_view_branch(self, auth_header: dict):
        """audit.view_branch grants access; empty scoped users → [] response."""
        user = _make_user()
        db = _make_db_session_with_user(user)

        with (
            _with_session(db),
            patch(
                "app.api.routes.dashboard.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["audit.view_branch"]),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{DASH}/team-activity", headers=auth_header)

        assert r.status_code == 200
        assert isinstance(r.json(), list)

    @pytest.mark.asyncio
    async def test_team_activity_200_with_audit_view_all(self, auth_header: dict):
        """audit.view_all permission grants access."""
        user = _make_user()
        db = _make_db_session_with_user(user)

        with (
            _with_session(db),
            patch(
                "app.api.routes.dashboard.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["audit.view_all"]),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{DASH}/team-activity", headers=auth_header)

        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_team_activity_superuser_bypasses_permission(self):
        """Superuser accesses team-activity without explicit audit permissions."""
        token = _make_token()
        user = _make_user(is_superuser=True)
        db = _make_db_session_with_user(user)

        with (
            _with_session(db),
            patch(
                "app.api.routes.dashboard.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{DASH}/team-activity",
                    headers={"Authorization": f"Bearer {token}"},
                )

        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_team_activity_empty_when_no_scoped_users(self, auth_header: dict):
        """When scoped user_id subquery returns empty list, endpoint returns [] gracefully."""
        user = _make_user()
        db = _make_db_session_with_user(user)
        # Default session returns empty for all queries after user lookup

        with (
            _with_session(db),
            patch(
                "app.api.routes.dashboard.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["audit.view_branch"]),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{DASH}/team-activity", headers=auth_header)

        assert r.status_code == 200
        assert r.json() == []


# ---------------------------------------------------------------------------
# 6. GET /api/v1/dashboard/aggregate
# ---------------------------------------------------------------------------

class TestDashboardAggregate:

    @pytest.mark.asyncio
    async def test_aggregate_returns_200(self, auth_header: dict):
        user = _make_user()
        db = _make_db_session_with_user(user)

        with (
            _with_session(db),
            patch(
                "app.api.routes.dashboard.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "app.api.routes.dashboard.rbac_service.get_roles_by_user",
                new=AsyncMock(return_value=["trader"]),
            ),
            patch(
                "app.api.routes.dashboard.rbac_service.get_user_hierarchy_level",
                new=AsyncMock(return_value=5),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{DASH}/aggregate", headers=auth_header)

        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_aggregate_contains_required_top_level_keys(self, auth_header: dict):
        """Aggregate response must contain summary, recent_runs, pending_approvals."""
        user = _make_user()
        db = _make_db_session_with_user(user)

        with (
            _with_session(db),
            patch(
                "app.api.routes.dashboard.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "app.api.routes.dashboard.rbac_service.get_roles_by_user",
                new=AsyncMock(return_value=["trader"]),
            ),
            patch(
                "app.api.routes.dashboard.rbac_service.get_user_hierarchy_level",
                new=AsyncMock(return_value=5),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{DASH}/aggregate", headers=auth_header)

        data = r.json()
        assert "summary" in data
        assert "recent_runs" in data
        assert "pending_approvals" in data

    @pytest.mark.asyncio
    async def test_aggregate_runs_and_approvals_are_lists(self, auth_header: dict):
        user = _make_user()
        db = _make_db_session_with_user(user)

        with (
            _with_session(db),
            patch(
                "app.api.routes.dashboard.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "app.api.routes.dashboard.rbac_service.get_roles_by_user",
                new=AsyncMock(return_value=[]),
            ),
            patch(
                "app.api.routes.dashboard.rbac_service.get_user_hierarchy_level",
                new=AsyncMock(return_value=None),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{DASH}/aggregate", headers=auth_header)

        data = r.json()
        assert isinstance(data["recent_runs"], list)
        assert isinstance(data["pending_approvals"], list)

    @pytest.mark.asyncio
    async def test_aggregate_pending_approvals_empty_without_permission(self, auth_header: dict):
        """
        Aggregate silently returns [] for pending_approvals when user lacks
        pipeline.approve — graceful degradation, not 403.
        """
        user = _make_user()
        db = _make_db_session_with_user(user)

        with (
            _with_session(db),
            patch(
                "app.api.routes.dashboard.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),  # no pipeline.approve
            ),
            patch(
                "app.api.routes.dashboard.rbac_service.get_roles_by_user",
                new=AsyncMock(return_value=["trader"]),
            ),
            patch(
                "app.api.routes.dashboard.rbac_service.get_user_hierarchy_level",
                new=AsyncMock(return_value=5),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{DASH}/aggregate", headers=auth_header)

        assert r.status_code == 200
        assert r.json()["pending_approvals"] == []

    @pytest.mark.asyncio
    async def test_aggregate_no_auth_returns_401(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.get(f"{DASH}/aggregate")
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# 7. Helper functions — unit tests (no HTTP required)
# ---------------------------------------------------------------------------

class TestHelpers:
    """Verify helper functions in isolation without network overhead."""

    # The dashboard router previously carried its own `_extract_bearer` /
    # `_resolve_user` helpers (RISK-AUTH-RLS-02 — the parallel auth helper
    # that silently skipped RLS injection). Those helpers have been deleted;
    # the equivalent behavior is covered by tests against
    # `app/core/dependencies.py::get_current_user` (the canonical JWT dep).

    def test_get_branch_code_returns_hq_default_when_no_branch(self):
        """_get_branch_code returns 'HQ' when branch is None."""
        from app.api.routes.dashboard import _get_branch_code

        user = MagicMock()
        user.branch = None
        assert _get_branch_code(user) == "HQ"

    def test_get_branch_code_returns_uppercased_code(self):
        """_get_branch_code uppercases the branch code."""
        from app.api.routes.dashboard import _get_branch_code

        user = MagicMock()
        branch = MagicMock()
        branch.code = "lon"
        user.branch = branch
        assert _get_branch_code(user) == "LON"

    def test_get_branch_currency_defaults_to_usd(self):
        """_get_branch_currency returns 'USD' when branch is None."""
        from app.api.routes.dashboard import _get_branch_currency

        user = MagicMock()
        user.branch = None
        assert _get_branch_currency(user) == "USD"

    def test_get_branch_currency_returns_uppercased_currency(self):
        """_get_branch_currency uppercases the currency code."""
        from app.api.routes.dashboard import _get_branch_currency

        user = MagicMock()
        branch = MagicMock()
        branch.currency = "eur"
        branch.currency_code = None
        user.branch = branch
        assert _get_branch_currency(user) == "EUR"

    def test_scoped_user_ids_includes_branch_filter_when_scoped(self):
        """_scoped_user_ids adds branch_id WHERE clause when all_branches=False."""
        from app.api.routes.dashboard import _scoped_user_ids

        user = MagicMock()
        user.company_id = UUID(COMPANY_ID)
        user.branch_id = UUID(BRANCH_ID)

        q = _scoped_user_ids(user, all_branches=False)
        compiled = str(q.compile(compile_kwargs={"literal_binds": True}))
        assert "branch_id" in compiled

    def test_scoped_user_ids_omits_branch_filter_for_all_branches(self):
        """_scoped_user_ids skips branch_id WHERE clause when all_branches=True."""
        from app.api.routes.dashboard import _scoped_user_ids

        user = MagicMock()
        user.company_id = UUID(COMPANY_ID)
        user.branch_id = UUID(BRANCH_ID)

        q = _scoped_user_ids(user, all_branches=True)
        compiled = str(q.compile(compile_kwargs={"literal_binds": True}))
        assert "branch_id" not in compiled
