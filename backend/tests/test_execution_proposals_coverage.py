"""
tests/test_execution_proposals_coverage.py

Coverage tests for app/api/routes/v1_execution_proposals.py

Endpoints covered:
  GET    /api/v1/proposals                       - list proposals
  GET    /api/v1/proposals/pending               - pending proposals (checker)
  GET    /api/v1/proposals/position/{id}         - history for position
  GET    /api/v1/proposals/{id}                  - single proposal detail
  POST   /api/v1/proposals                       - create proposal
  PATCH  /api/v1/proposals/{id}/approve          - approve proposal
  PATCH  /api/v1/proposals/{id}/reject           - reject proposal
  PATCH  /api/v1/proposals/{id}/withdraw         - withdraw proposal
  POST   /api/v1/proposals/{id}/execute          - execute proposal
  PATCH  /api/v1/proposals/{id}/second-approve   - second approval
  POST   /api/v1/proposals/batch                 - batch propose

Auth mechanism:
  - get_current_user from app.core.security (depends on OAuth2 Bearer token)
  - get_async_session from app.core.db
  - get_mfa_verified from app.core.security

Route mount: main.py mounts api_router at /api; proposals prefix /v1/proposals.
Full path: /api/v1/proposals/...

Key: APIKeyAuthMiddleware passes any request with Authorization: Bearer <token>.
The actual JWT validation is bypassed via dependency_overrides[get_current_user].
"""

from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite://")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-ci-at-least-32-chars-long")

import contextlib
import pytest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.db import get_async_session
from app.core.security import get_current_user, get_mfa_verified, create_access_token

BASE_URL = "http://test"
PROP = "/api/v1/proposals"

USER_ID     = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
COMPANY_ID  = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
BRANCH_ID   = "cccccccc-cccc-cccc-cccc-cccccccccccc"
PROPOSAL_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd"
POSITION_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_token(user_id: str = USER_ID) -> str:
    return create_access_token(sub=user_id, email="trader@example.com")


def _bearer_headers() -> dict[str, str]:
    """Provides a Bearer token header that passes APIKeyAuthMiddleware.

    The middleware allows any request with 'Authorization: Bearer ' prefix to pass
    through without checking the API key. The actual get_current_user dependency is
    overridden in tests, so the token content doesn't matter for auth.
    """
    return {"Authorization": f"Bearer {_make_token()}"}


def _make_user(
    user_id: str = USER_ID,
    is_superuser: bool = False,
) -> MagicMock:
    user = MagicMock()
    user.id = UUID(user_id)
    user.email = "trader@example.com"
    user.is_active = True
    user.is_superuser = is_superuser
    user.company_id = UUID(COMPANY_ID)
    user.branch_id = UUID(BRANCH_ID)
    branch = MagicMock()
    branch.code = "HQ"
    user.branch = branch
    company = MagicMock()
    company.name = "TestCorp"
    user.company = company
    return user


def _make_proposal(
    proposal_id: str = PROPOSAL_ID,
    status: str = "PROPOSED",
    proposed_by: str = USER_ID,
) -> MagicMock:
    p = MagicMock()
    p.id = UUID(proposal_id)
    p.position_id = UUID(POSITION_ID)
    p.company_id = UUID(COMPANY_ID)
    p.branch_id = UUID(BRANCH_ID)
    p.status = status
    p.proposed_by = UUID(proposed_by)
    p.proposed_by_email = "trader@example.com"
    now = datetime(2025, 1, 1, tzinfo=timezone.utc)
    p.proposed_at = now
    p.created_at = now
    p.proposal_hash = "abc123"
    p.approved_by = None
    p.approved_by_email = None
    p.approved_at = None
    p.approval_notes = None
    p.approval_hash = None
    p.execution_ref = "REF-001"
    p.executed_at = None
    p.rejection_reason = None
    p.second_approver_required = False
    p.second_approver_id = None
    p.second_approver_email = None
    p.second_approved_at = None
    p.second_approval_notes = None
    p.second_approval_hash = None
    p.risk_decision_hash = None
    p.risk_verdict = None
    p.actual_fill_rate = None
    p.actual_fill_notional = None
    p.slippage_bps = None
    p.fill_timestamp = None
    p.fill_hash = None
    p.proposal_payload = {"hedge_amount": 100000.0, "hedge_rate": 1.2345}
    return p


def _make_db_session() -> AsyncMock:
    """Build a generic mock session returning empty results."""
    empty_result = MagicMock()
    empty_scalars = MagicMock()
    empty_scalars.all.return_value = []
    empty_scalars.first.return_value = None
    empty_result.scalars.return_value = empty_scalars
    empty_result.scalar.return_value = None
    empty_result.scalar_one_or_none.return_value = None

    db = AsyncMock()
    db.execute = AsyncMock(return_value=empty_result)
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.add = MagicMock()
    return db


def _override_session(mock_db: AsyncMock):
    async def _gen():
        yield mock_db
    return _gen


def _override_user(user: MagicMock):
    async def _dep():
        return user
    return _dep


def _override_mfa(verified: bool = False):
    async def _dep():
        return verified
    return _dep


@contextlib.contextmanager
def _with_overrides(mock_db: AsyncMock, user: MagicMock, mfa_verified: bool = False):
    """Context manager that installs dependency overrides and tears them down."""
    app.dependency_overrides[get_async_session] = _override_session(mock_db)
    app.dependency_overrides[get_current_user] = _override_user(user)
    app.dependency_overrides[get_mfa_verified] = _override_mfa(mfa_verified)
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_async_session, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_mfa_verified, None)


# ---------------------------------------------------------------------------
# 1. Auth rejection — requests without valid auth headers
# ---------------------------------------------------------------------------

class TestAuthRejection:
    """Requests without auth headers must be rejected by middleware or route auth."""

    @pytest.mark.asyncio
    async def test_list_proposals_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.get(PROP)
        # API key middleware returns 401 when no Bearer and no X-API-Key
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_get_proposal_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.get(f"{PROP}/{PROPOSAL_ID}")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_pending_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.get(f"{PROP}/pending")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_position_history_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.get(f"{PROP}/position/{POSITION_ID}")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_bad_token_rejected(self):
        """A structurally invalid JWT is rejected with 401 after passing middleware."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.get(PROP, headers={"Authorization": "Bearer not.valid.jwt"})
        # Middleware passes Bearer-prefixed requests; get_current_user rejects invalid JWT
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_create_no_bearer_gets_blocked(self):
        """POST without any auth headers is blocked by middleware (401 or 403)."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.post(PROP, json={
                "position_id": POSITION_ID,
                "execution_ref": "REF-001",
            })
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_approve_no_bearer_gets_blocked(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.patch(f"{PROP}/{PROPOSAL_ID}/approve", json={})
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_execute_no_bearer_gets_blocked(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.post(f"{PROP}/{PROPOSAL_ID}/execute")
        assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# 2. GET /api/v1/proposals — list proposals
# ---------------------------------------------------------------------------

class TestListProposals:

    @pytest.mark.asyncio
    async def test_list_no_permission_returns_403(self):
        user = _make_user()
        db = _make_db_session()
        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(PROP, headers=_bearer_headers())
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_list_with_trades_view_returns_200(self):
        user = _make_user()
        db = _make_db_session()

        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(return_value=result)

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.view"]),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(PROP, headers=_bearer_headers())
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    @pytest.mark.asyncio
    async def test_list_empty_when_no_proposals(self):
        user = _make_user()
        db = _make_db_session()

        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(return_value=result)

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.view"]),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(PROP, headers=_bearer_headers())
        assert r.json() == []

    @pytest.mark.asyncio
    async def test_list_superuser_bypasses_permission(self):
        user = _make_user(is_superuser=True)
        db = _make_db_session()

        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(return_value=result)

        with _with_overrides(db, user):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(PROP, headers=_bearer_headers())
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_list_with_proposals_returns_items(self):
        user = _make_user()
        db = _make_db_session()
        proposal = _make_proposal()

        result = MagicMock()
        result.scalars.return_value.all.return_value = [proposal]
        db.execute = AsyncMock(return_value=result)

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.view"]),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(PROP, headers=_bearer_headers())
        assert r.status_code == 200
        data = r.json()
        assert len(data) == 1
        assert data[0]["id"] == PROPOSAL_ID
        assert data[0]["status"] == "PROPOSED"

    @pytest.mark.asyncio
    async def test_list_with_status_filter(self):
        user = _make_user()
        db = _make_db_session()

        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(return_value=result)

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.view"]),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{PROP}?status=PROPOSED", headers=_bearer_headers())
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# 3. GET /api/v1/proposals/pending
# ---------------------------------------------------------------------------

class TestListPendingProposals:

    @pytest.mark.asyncio
    async def test_pending_no_execute_perm_returns_403(self):
        user = _make_user()
        db = _make_db_session()

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{PROP}/pending", headers=_bearer_headers())
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_pending_with_execute_perm_returns_200(self):
        user = _make_user()
        db = _make_db_session()

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.execute"]),
            ),
            patch(
                "app.api.routes.v1_execution_proposals.ep_service.list_pending_proposals",
                new=AsyncMock(return_value=[]),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{PROP}/pending", headers=_bearer_headers())
        assert r.status_code == 200
        assert r.json() == []

    @pytest.mark.asyncio
    async def test_pending_superuser_bypasses_permission(self):
        user = _make_user(is_superuser=True)
        db = _make_db_session()

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.ep_service.list_pending_proposals",
                new=AsyncMock(return_value=[]),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{PROP}/pending", headers=_bearer_headers())
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# 4. GET /api/v1/proposals/{id}
# ---------------------------------------------------------------------------

class TestGetProposal:

    @pytest.mark.asyncio
    async def test_get_proposal_no_permission_returns_403(self):
        user = _make_user()
        db = _make_db_session()

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{PROP}/{PROPOSAL_ID}", headers=_bearer_headers())
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_get_proposal_not_found_returns_404(self):
        user = _make_user()
        db = _make_db_session()

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.view"]),
            ),
            patch(
                "app.services.execution_proposal_service._get_proposal",
                side_effect=ValueError("Proposal not found"),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{PROP}/{PROPOSAL_ID}", headers=_bearer_headers())
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_get_proposal_returns_200_with_data(self):
        user = _make_user()
        db = _make_db_session()
        proposal = _make_proposal()

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.view"]),
            ),
            patch(
                "app.services.execution_proposal_service._get_proposal",
                new=AsyncMock(return_value=proposal),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{PROP}/{PROPOSAL_ID}", headers=_bearer_headers())
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == PROPOSAL_ID
        assert data["status"] == "PROPOSED"
        assert data["execution_ref"] == "REF-001"


# ---------------------------------------------------------------------------
# 5. GET /api/v1/proposals/position/{position_id}
# ---------------------------------------------------------------------------

class TestListProposalsForPosition:

    @pytest.mark.asyncio
    async def test_position_history_no_permission_returns_403(self):
        user = _make_user()
        db = _make_db_session()

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{PROP}/position/{POSITION_ID}", headers=_bearer_headers())
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_position_history_with_permission_returns_list(self):
        user = _make_user()
        db = _make_db_session()

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.view"]),
            ),
            patch(
                "app.api.routes.v1_execution_proposals.ep_service.list_proposals_for_position",
                new=AsyncMock(return_value=[]),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{PROP}/position/{POSITION_ID}", headers=_bearer_headers())
        assert r.status_code == 200
        assert r.json() == []

    @pytest.mark.asyncio
    async def test_position_history_returns_proposals(self):
        user = _make_user()
        db = _make_db_session()
        proposal = _make_proposal()

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.view"]),
            ),
            patch(
                "app.api.routes.v1_execution_proposals.ep_service.list_proposals_for_position",
                new=AsyncMock(return_value=[proposal]),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.get(f"{PROP}/position/{POSITION_ID}", headers=_bearer_headers())
        assert r.status_code == 200
        assert len(r.json()) == 1


# ---------------------------------------------------------------------------
# 6. POST /api/v1/proposals — create proposal
# ---------------------------------------------------------------------------

class TestCreateProposal:

    @pytest.mark.asyncio
    async def test_create_no_permission_returns_403(self):
        user = _make_user()
        db = _make_db_session()

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
            patch("app.api.routes.v1_execution_proposals.enforce_execution_ip_allowlist"),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(PROP, json={
                    "position_id": POSITION_ID,
                    "execution_ref": "REF-001",
                }, headers=_bearer_headers())
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_create_missing_required_field_returns_422(self):
        user = _make_user()
        db = _make_db_session()

        with _with_overrides(db, user):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                # Missing execution_ref (required)
                r = await ac.post(PROP, json={"position_id": POSITION_ID}, headers=_bearer_headers())
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_create_with_permission_calls_service(self):
        user = _make_user()
        db = _make_db_session()
        proposal = _make_proposal()

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.edit"]),
            ),
            patch("app.api.routes.v1_execution_proposals.enforce_execution_ip_allowlist"),
            patch(
                "app.api.routes.v1_execution_proposals.ep_service.propose_execution",
                new=AsyncMock(return_value=proposal),
            ),
            patch(
                "app.api.routes.v1_execution_proposals._emit_proposal_audit",
                new=AsyncMock(),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(PROP, json={
                    "position_id": POSITION_ID,
                    "execution_ref": "REF-001",
                    "hedge_amount": 100000.0,
                    "hedge_rate": 1.2345,
                }, headers=_bearer_headers())
        assert r.status_code == 201
        data = r.json()
        assert data["id"] == PROPOSAL_ID
        assert data["status"] == "PROPOSED"

    @pytest.mark.asyncio
    async def test_create_service_raises_value_error_returns_422(self):
        user = _make_user()
        db = _make_db_session()

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.edit"]),
            ),
            patch("app.api.routes.v1_execution_proposals.enforce_execution_ip_allowlist"),
            patch(
                "app.api.routes.v1_execution_proposals.ep_service.propose_execution",
                side_effect=ValueError("Position not in READY_TO_EXECUTE state"),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(PROP, json={
                    "position_id": POSITION_ID,
                    "execution_ref": "REF-001",
                }, headers=_bearer_headers())
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_create_service_raises_internal_error_returns_500(self):
        user = _make_user()
        db = _make_db_session()

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.edit"]),
            ),
            patch("app.api.routes.v1_execution_proposals.enforce_execution_ip_allowlist"),
            patch(
                "app.api.routes.v1_execution_proposals.ep_service.propose_execution",
                side_effect=RuntimeError("Unexpected DB error"),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(PROP, json={
                    "position_id": POSITION_ID,
                    "execution_ref": "REF-001",
                }, headers=_bearer_headers())
        assert r.status_code == 500


# ---------------------------------------------------------------------------
# 7. PATCH /api/v1/proposals/{id}/approve
# ---------------------------------------------------------------------------

class TestApproveProposal:

    @pytest.mark.asyncio
    async def test_approve_no_permission_returns_403(self):
        user = _make_user()
        db = _make_db_session()

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
            patch("app.api.routes.v1_execution_proposals.enforce_execution_ip_allowlist"),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.patch(f"{PROP}/{PROPOSAL_ID}/approve", json={}, headers=_bearer_headers())
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_approve_with_permission_calls_service(self):
        user = _make_user()
        db = _make_db_session()
        proposal = _make_proposal(status="APPROVED")
        proposal.approved_by = user.id
        proposal.approved_by_email = "checker@example.com"
        proposal.approved_at = datetime(2025, 1, 2, tzinfo=timezone.utc)
        proposal.approval_hash = "approvehash123"

        # MFA check: scalars().first() must return None so gate is not triggered
        mfa_result = MagicMock()
        mfa_result.scalars.return_value.first.return_value = None

        # Company query for governance_mode
        co_mock = MagicMock()
        co_mock.settings = {"governance_mode": "team"}
        company_result = MagicMock()
        company_result.scalar_one_or_none.return_value = co_mock

        # First execute = MFA check, second = company query
        db.execute = AsyncMock(side_effect=[mfa_result, company_result])

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.execute"]),
            ),
            patch("app.api.routes.v1_execution_proposals.enforce_execution_ip_allowlist"),
            patch(
                "app.api.routes.v1_execution_proposals.ep_service.approve_proposal",
                new=AsyncMock(return_value=proposal),
            ),
            patch(
                "app.api.routes.v1_execution_proposals._emit_proposal_audit",
                new=AsyncMock(),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.patch(f"{PROP}/{PROPOSAL_ID}/approve", json={
                    "approval_notes": "Looks good"
                }, headers=_bearer_headers())
        assert r.status_code == 200
        assert r.json()["status"] == "APPROVED"

    @pytest.mark.asyncio
    async def test_approve_sod_violation_returns_403(self):
        user = _make_user()
        db = _make_db_session()

        # First execute = MFA check (returns None), second = company query
        mfa_result = MagicMock()
        mfa_result.scalars.return_value.first.return_value = None

        co_mock = MagicMock()
        co_mock.settings = {"governance_mode": "team"}
        company_result = MagicMock()
        company_result.scalar_one_or_none.return_value = co_mock
        db.execute = AsyncMock(side_effect=[mfa_result, company_result])

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.execute"]),
            ),
            patch("app.api.routes.v1_execution_proposals.enforce_execution_ip_allowlist"),
            patch(
                "app.api.routes.v1_execution_proposals.ep_service.approve_proposal",
                side_effect=ValueError("SoD violation: approver is the same as proposer"),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.patch(f"{PROP}/{PROPOSAL_ID}/approve", json={}, headers=_bearer_headers())
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_approve_wrong_state_returns_409(self):
        user = _make_user()
        db = _make_db_session()

        # First execute = MFA check (returns None), second = company query
        mfa_result = MagicMock()
        mfa_result.scalars.return_value.first.return_value = None

        co_mock = MagicMock()
        co_mock.settings = {}
        company_result = MagicMock()
        company_result.scalar_one_or_none.return_value = co_mock
        db.execute = AsyncMock(side_effect=[mfa_result, company_result])

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.execute"]),
            ),
            patch("app.api.routes.v1_execution_proposals.enforce_execution_ip_allowlist"),
            patch(
                "app.api.routes.v1_execution_proposals.ep_service.approve_proposal",
                side_effect=ValueError("Proposal is not in PROPOSED state"),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.patch(f"{PROP}/{PROPOSAL_ID}/approve", json={}, headers=_bearer_headers())
        assert r.status_code == 409

    @pytest.mark.asyncio
    async def test_approve_solo_mode_uses_solo_service(self):
        user = _make_user()
        db = _make_db_session()
        proposal = _make_proposal(status="APPROVED")

        # First execute = MFA check (returns None), second = company query
        mfa_result = MagicMock()
        mfa_result.scalars.return_value.first.return_value = None

        co_mock = MagicMock()
        co_mock.settings = {"governance_mode": "solo"}
        company_result = MagicMock()
        company_result.scalar_one_or_none.return_value = co_mock
        db.execute = AsyncMock(side_effect=[mfa_result, company_result])

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.execute"]),
            ),
            patch("app.api.routes.v1_execution_proposals.enforce_execution_ip_allowlist"),
            patch(
                "app.api.routes.v1_execution_proposals.ep_service.approve_proposal_solo",
                new=AsyncMock(return_value=proposal),
            ) as mock_solo,
            patch(
                "app.api.routes.v1_execution_proposals._emit_proposal_audit",
                new=AsyncMock(),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.patch(f"{PROP}/{PROPOSAL_ID}/approve", json={}, headers=_bearer_headers())
        assert r.status_code == 200
        mock_solo.assert_awaited_once()


# ---------------------------------------------------------------------------
# 8. PATCH /api/v1/proposals/{id}/reject
# ---------------------------------------------------------------------------

class TestRejectProposal:

    @pytest.mark.asyncio
    async def test_reject_no_permission_returns_403(self):
        user = _make_user()
        db = _make_db_session()

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.patch(f"{PROP}/{PROPOSAL_ID}/reject", json={"reason": "not valid"}, headers=_bearer_headers())
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_reject_missing_reason_returns_422(self):
        user = _make_user()
        db = _make_db_session()

        with _with_overrides(db, user):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.patch(f"{PROP}/{PROPOSAL_ID}/reject", json={}, headers=_bearer_headers())
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_reject_with_permission_returns_200(self):
        user = _make_user()
        db = _make_db_session()
        proposal = _make_proposal(status="REJECTED")
        proposal.rejection_reason = "Market conditions changed"

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.execute"]),
            ),
            patch(
                "app.api.routes.v1_execution_proposals.ep_service.reject_proposal",
                new=AsyncMock(return_value=proposal),
            ),
            patch(
                "app.api.routes.v1_execution_proposals._emit_proposal_audit",
                new=AsyncMock(),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.patch(f"{PROP}/{PROPOSAL_ID}/reject", json={
                    "reason": "Market conditions changed"
                }, headers=_bearer_headers())
        assert r.status_code == 200
        assert r.json()["status"] == "REJECTED"

    @pytest.mark.asyncio
    async def test_reject_sod_violation_returns_403(self):
        user = _make_user()
        db = _make_db_session()

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.execute"]),
            ),
            patch(
                "app.api.routes.v1_execution_proposals.ep_service.reject_proposal",
                side_effect=ValueError("SoD violation: rejector is the same as proposer"),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.patch(f"{PROP}/{PROPOSAL_ID}/reject", json={"reason": "no"}, headers=_bearer_headers())
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_reject_wrong_state_returns_409(self):
        user = _make_user()
        db = _make_db_session()

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.execute"]),
            ),
            patch(
                "app.api.routes.v1_execution_proposals.ep_service.reject_proposal",
                side_effect=ValueError("Cannot reject: proposal is not in PROPOSED state"),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.patch(f"{PROP}/{PROPOSAL_ID}/reject", json={"reason": "no"}, headers=_bearer_headers())
        assert r.status_code == 409


# ---------------------------------------------------------------------------
# 9. PATCH /api/v1/proposals/{id}/withdraw
# ---------------------------------------------------------------------------

class TestWithdrawProposal:

    @pytest.mark.asyncio
    async def test_withdraw_no_permission_returns_403(self):
        user = _make_user()
        db = _make_db_session()

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.patch(f"{PROP}/{PROPOSAL_ID}/withdraw", json={}, headers=_bearer_headers())
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_withdraw_with_permission_returns_200(self):
        user = _make_user()
        db = _make_db_session()
        proposal = _make_proposal(status="WITHDRAWN")

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.edit"]),
            ),
            patch(
                "app.api.routes.v1_execution_proposals.ep_service.withdraw_proposal",
                new=AsyncMock(return_value=proposal),
            ),
            patch(
                "app.api.routes.v1_execution_proposals._emit_proposal_audit",
                new=AsyncMock(),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.patch(f"{PROP}/{PROPOSAL_ID}/withdraw", json={
                    "reason": "Changed my mind"
                }, headers=_bearer_headers())
        assert r.status_code == 200
        assert r.json()["status"] == "WITHDRAWN"

    @pytest.mark.asyncio
    async def test_withdraw_wrong_state_returns_409(self):
        user = _make_user()
        db = _make_db_session()

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.edit"]),
            ),
            patch(
                "app.api.routes.v1_execution_proposals.ep_service.withdraw_proposal",
                side_effect=ValueError("Cannot withdraw: proposal already EXECUTED"),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.patch(f"{PROP}/{PROPOSAL_ID}/withdraw", json={}, headers=_bearer_headers())
        assert r.status_code == 409


# ---------------------------------------------------------------------------
# 10. POST /api/v1/proposals/{id}/execute
# ---------------------------------------------------------------------------

class TestExecuteProposal:

    @pytest.mark.asyncio
    async def test_execute_no_permission_returns_403(self):
        user = _make_user()
        db = _make_db_session()

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
            patch("app.api.routes.v1_execution_proposals.enforce_execution_ip_allowlist"),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(f"{PROP}/{PROPOSAL_ID}/execute", headers=_bearer_headers())
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_execute_with_permission_returns_200(self):
        user = _make_user()
        db = _make_db_session()
        proposal = _make_proposal(status="EXECUTED")
        proposal.executed_at = datetime(2025, 1, 3, tzinfo=timezone.utc)

        position_mock = MagicMock()
        position_mock.record_id = "POS-001"

        check_result = MagicMock()
        check_result.second_approver_required = False
        check_result.second_approver_id = None

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.execute"]),
            ),
            patch("app.api.routes.v1_execution_proposals.enforce_execution_ip_allowlist"),
            patch(
                "app.services.execution_proposal_service._get_proposal",
                new=AsyncMock(return_value=check_result),
            ),
            patch(
                "app.api.routes.v1_execution_proposals.ep_service.execute_approved_proposal",
                new=AsyncMock(return_value=(proposal, position_mock)),
            ),
            patch(
                "app.api.routes.v1_execution_proposals._emit_proposal_audit",
                new=AsyncMock(),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(f"{PROP}/{PROPOSAL_ID}/execute", headers=_bearer_headers())
        assert r.status_code == 200
        assert r.json()["status"] == "EXECUTED"

    @pytest.mark.asyncio
    async def test_execute_dual_key_required_returns_422(self):
        user = _make_user()
        db = _make_db_session()

        check_result = MagicMock()
        check_result.second_approver_required = True
        check_result.second_approver_id = None

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.execute"]),
            ),
            patch("app.api.routes.v1_execution_proposals.enforce_execution_ip_allowlist"),
            patch(
                "app.services.execution_proposal_service._get_proposal",
                new=AsyncMock(return_value=check_result),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(f"{PROP}/{PROPOSAL_ID}/execute", headers=_bearer_headers())
        assert r.status_code == 422
        assert "SECOND_APPROVAL_REQUIRED" in r.json()["detail"]

    @pytest.mark.asyncio
    async def test_execute_terminal_state_returns_409(self):
        user = _make_user()
        db = _make_db_session()

        check_result = MagicMock()
        check_result.second_approver_required = False
        check_result.second_approver_id = None

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.execute"]),
            ),
            patch("app.api.routes.v1_execution_proposals.enforce_execution_ip_allowlist"),
            patch(
                "app.services.execution_proposal_service._get_proposal",
                new=AsyncMock(return_value=check_result),
            ),
            patch(
                "app.api.routes.v1_execution_proposals.ep_service.execute_approved_proposal",
                side_effect=ValueError("Illegal state transition: proposal in terminal state"),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(f"{PROP}/{PROPOSAL_ID}/execute", headers=_bearer_headers())
        assert r.status_code == 409

    @pytest.mark.asyncio
    async def test_execute_with_fill_data_returns_200(self):
        user = _make_user()
        db = _make_db_session()
        proposal = _make_proposal(status="EXECUTED")
        proposal.executed_at = datetime(2025, 1, 3, tzinfo=timezone.utc)
        proposal.proposal_payload = {"hedge_rate": 1.2345}
        proposal.actual_fill_rate = 1.2350
        proposal.slippage_bps = 4.05
        proposal.fill_hash = "fillhash123"

        position_mock = MagicMock()
        position_mock.record_id = "POS-001"

        check_result = MagicMock()
        check_result.second_approver_required = False
        check_result.second_approver_id = None

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.execute"]),
            ),
            patch("app.api.routes.v1_execution_proposals.enforce_execution_ip_allowlist"),
            patch(
                "app.services.execution_proposal_service._get_proposal",
                new=AsyncMock(return_value=check_result),
            ),
            patch(
                "app.api.routes.v1_execution_proposals.ep_service.execute_approved_proposal",
                new=AsyncMock(return_value=(proposal, position_mock)),
            ),
            patch(
                "app.api.routes.v1_execution_proposals._emit_proposal_audit",
                new=AsyncMock(),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(f"{PROP}/{PROPOSAL_ID}/execute", json={
                    "fill_price": 1.2350,
                    "fill_notional": 100000.0,
                    "fill_currency": "USD",
                }, headers=_bearer_headers())
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# 11. PATCH /api/v1/proposals/{id}/second-approve
# ---------------------------------------------------------------------------

class TestSecondApproveProposal:

    @pytest.mark.asyncio
    async def test_second_approve_no_permission_returns_403(self):
        user = _make_user()
        db = _make_db_session()

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.patch(f"{PROP}/{PROPOSAL_ID}/second-approve", json={}, headers=_bearer_headers())
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_second_approve_proposal_not_found_returns_404(self):
        user = _make_user()
        db = _make_db_session()

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.execute"]),
            ),
            patch(
                "app.services.execution_proposal_service._get_proposal",
                side_effect=ValueError("Proposal not found"),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.patch(f"{PROP}/{PROPOSAL_ID}/second-approve", json={}, headers=_bearer_headers())
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_second_approve_wrong_status_returns_409(self):
        user = _make_user()
        db = _make_db_session()
        proposal = _make_proposal(status="PROPOSED")  # Not APPROVED yet
        proposal.second_approver_required = True
        proposal.second_approver_id = None

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.execute"]),
            ),
            patch(
                "app.services.execution_proposal_service._get_proposal",
                new=AsyncMock(return_value=proposal),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.patch(f"{PROP}/{PROPOSAL_ID}/second-approve", json={}, headers=_bearer_headers())
        assert r.status_code == 409

    @pytest.mark.asyncio
    async def test_second_approve_not_required_returns_400(self):
        user = _make_user()
        db = _make_db_session()
        proposal = _make_proposal(status="APPROVED")
        proposal.second_approver_required = False  # Not required
        proposal.second_approver_id = None

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.execute"]),
            ),
            patch(
                "app.services.execution_proposal_service._get_proposal",
                new=AsyncMock(return_value=proposal),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.patch(f"{PROP}/{PROPOSAL_ID}/second-approve", json={}, headers=_bearer_headers())
        assert r.status_code == 400

    @pytest.mark.asyncio
    async def test_second_approve_already_approved_returns_409(self):
        user = _make_user()
        db = _make_db_session()
        proposal = _make_proposal(status="APPROVED")
        proposal.second_approver_required = True
        proposal.second_approver_id = uuid4()  # Already has second approver

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.execute"]),
            ),
            patch(
                "app.services.execution_proposal_service._get_proposal",
                new=AsyncMock(return_value=proposal),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.patch(f"{PROP}/{PROPOSAL_ID}/second-approve", json={}, headers=_bearer_headers())
        assert r.status_code == 409

    @pytest.mark.asyncio
    async def test_second_approve_sod_same_as_proposer_returns_403(self):
        user = _make_user()  # same as proposer
        db = _make_db_session()
        proposal = _make_proposal(status="APPROVED")
        proposal.second_approver_required = True
        proposal.second_approver_id = None
        proposal.proposed_by = user.id  # same user is the proposer
        proposal.approved_by = uuid4()  # different first approver

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.execute"]),
            ),
            patch(
                "app.services.execution_proposal_service._get_proposal",
                new=AsyncMock(return_value=proposal),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.patch(f"{PROP}/{PROPOSAL_ID}/second-approve", json={}, headers=_bearer_headers())
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_second_approve_sod_same_as_first_approver_returns_403(self):
        other_user_id = "ffffffff-ffff-ffff-ffff-ffffffffffff"
        user = _make_user()  # will be the second approver attempt
        db = _make_db_session()
        proposal = _make_proposal(status="APPROVED")
        proposal.second_approver_required = True
        proposal.second_approver_id = None
        proposal.proposed_by = UUID(other_user_id)  # different proposer
        proposal.approved_by = user.id  # same as current user (first approver)

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.execute"]),
            ),
            patch(
                "app.services.execution_proposal_service._get_proposal",
                new=AsyncMock(return_value=proposal),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.patch(f"{PROP}/{PROPOSAL_ID}/second-approve", json={}, headers=_bearer_headers())
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_second_approve_success_returns_200(self):
        approver_id = "11111111-1111-1111-1111-111111111111"
        first_approver_id = "22222222-2222-2222-2222-222222222222"
        proposer_id = "33333333-3333-3333-3333-333333333333"

        user = _make_user(user_id=approver_id)
        db = _make_db_session()
        db.commit = AsyncMock()
        db.refresh = AsyncMock()

        proposal = _make_proposal(status="APPROVED", proposed_by=proposer_id)
        proposal.second_approver_required = True
        proposal.second_approver_id = None
        proposal.proposed_by = UUID(proposer_id)
        proposal.approved_by = UUID(first_approver_id)
        proposal.approval_hash = "firstapprovalhash"
        # After second approval is set (route mutates the mock in-place):
        proposal.second_approver_email = "second@example.com"
        proposal.second_approved_at = datetime(2025, 1, 4, tzinfo=timezone.utc)
        proposal.second_approval_hash = "secondhash"

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.execute"]),
            ),
            patch(
                "app.services.execution_proposal_service._get_proposal",
                new=AsyncMock(return_value=proposal),
            ),
            patch(
                "app.api.routes.v1_execution_proposals._emit_proposal_audit",
                new=AsyncMock(),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.patch(f"{PROP}/{PROPOSAL_ID}/second-approve", json={
                    "notes": "Dual-key confirmed"
                }, headers=_bearer_headers())
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# 12. POST /api/v1/proposals/batch
# ---------------------------------------------------------------------------

class TestBatchProposeExecution:

    @pytest.mark.asyncio
    async def test_batch_no_permission_returns_403(self):
        user = _make_user()
        db = _make_db_session()

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
            patch("app.api.routes.v1_execution_proposals.enforce_execution_ip_allowlist"),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(f"{PROP}/batch", json={
                    "proposals": [
                        {"position_id": POSITION_ID, "execution_ref": "REF-001"}
                    ]
                }, headers=_bearer_headers())
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_batch_empty_list_returns_422(self):
        user = _make_user()
        db = _make_db_session()

        with _with_overrides(db, user):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(f"{PROP}/batch", json={"proposals": []}, headers=_bearer_headers())
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_batch_with_permission_returns_201(self):
        user = _make_user()
        db = _make_db_session()
        proposal = _make_proposal()

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.edit"]),
            ),
            patch("app.api.routes.v1_execution_proposals.enforce_execution_ip_allowlist"),
            patch(
                "app.api.routes.v1_execution_proposals.ep_service.propose_execution",
                new=AsyncMock(return_value=proposal),
            ),
            patch(
                "app.api.routes.v1_execution_proposals._emit_proposal_audit",
                new=AsyncMock(),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(f"{PROP}/batch", json={
                    "proposals": [
                        {"position_id": POSITION_ID, "execution_ref": "REF-001"}
                    ]
                }, headers=_bearer_headers())
        assert r.status_code == 201
        data = r.json()
        assert "created" in data
        assert "failed" in data
        assert len(data["created"]) == 1
        assert len(data["failed"]) == 0

    @pytest.mark.asyncio
    async def test_batch_partial_failure_captured_in_failed(self):
        user = _make_user()
        db = _make_db_session()
        proposal = _make_proposal()
        pos_id_2 = str(uuid4())

        # First succeeds, second fails
        call_count = 0

        async def _propose_side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return proposal
            raise ValueError("Position not found")

        with (
            _with_overrides(db, user),
            patch(
                "app.api.routes.v1_execution_proposals.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["trades.edit"]),
            ),
            patch("app.api.routes.v1_execution_proposals.enforce_execution_ip_allowlist"),
            patch(
                "app.api.routes.v1_execution_proposals.ep_service.propose_execution",
                side_effect=_propose_side_effect,
            ),
            patch(
                "app.api.routes.v1_execution_proposals._emit_proposal_audit",
                new=AsyncMock(),
            ),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                r = await ac.post(f"{PROP}/batch", json={
                    "proposals": [
                        {"position_id": POSITION_ID, "execution_ref": "REF-001"},
                        {"position_id": pos_id_2, "execution_ref": "REF-002"},
                    ]
                }, headers=_bearer_headers())
        assert r.status_code == 201
        data = r.json()
        assert len(data["created"]) == 1
        assert len(data["failed"]) == 1


# ---------------------------------------------------------------------------
# 13. ProposalResponse.from_orm_safe — unit tests
# ---------------------------------------------------------------------------

class TestProposalResponseFromOrmSafe:
    """Test the from_orm_safe class method without HTTP overhead."""

    def test_from_orm_safe_builds_response(self):
        from app.api.routes.v1_execution_proposals import ProposalResponse
        proposal = _make_proposal()
        response = ProposalResponse.from_orm_safe(proposal)

        assert response.id == UUID(PROPOSAL_ID)
        assert response.status == "PROPOSED"
        assert response.execution_ref == "REF-001"
        assert response.hedge_amount == 100000.0
        assert response.hedge_rate == 1.2345

    def test_from_orm_safe_handles_none_proposal_payload(self):
        from app.api.routes.v1_execution_proposals import ProposalResponse
        proposal = _make_proposal()
        proposal.proposal_payload = None
        response = ProposalResponse.from_orm_safe(proposal)
        assert response.hedge_amount is None
        assert response.hedge_rate is None

    def test_from_orm_safe_handles_none_dates(self):
        from app.api.routes.v1_execution_proposals import ProposalResponse
        proposal = _make_proposal()
        proposal.approved_at = None
        proposal.executed_at = None
        response = ProposalResponse.from_orm_safe(proposal)
        assert response.approved_at is None
        assert response.executed_at is None

    def test_from_orm_safe_second_approver_fields_default_to_none(self):
        from app.api.routes.v1_execution_proposals import ProposalResponse
        proposal = _make_proposal()
        response = ProposalResponse.from_orm_safe(proposal)
        assert response.second_approver_required is False
        assert response.second_approver_id is None
        assert response.second_approval_hash is None
