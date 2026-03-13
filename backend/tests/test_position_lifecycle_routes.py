"""
Route-level + service-level tests for Position lifecycle.

Tests:
- DELETE /v1/positions/{id} (soft-delete, auth, 404)
- PATCH /reject, /reopen, /assign-policy, /ready, /execute (success + 409)
- Lifecycle state machine (_assert_transition)
- EXECUTION_TRANSITIONS map correctness

Uses dependency overrides for auth and patches service-layer functions.
"""

import uuid
from datetime import datetime, UTC
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

from app.core.security import get_current_user
from app.main import app

# ── Mock helpers ──────────────────────────────────────────────────────────────

_BEARER = {"Authorization": "Bearer fake-jwt-for-csrf-bypass"}
_ROUTE = "app.api.routes.v1_positions"


def _make_user():
    user = MagicMock()
    user.id = uuid.UUID("aaaaaaaa-0000-0000-0000-000000000001")
    user.email = "test@example.com"
    user.company_id = uuid.UUID("cccccccc-0000-0000-0000-000000000001")
    user.branch_id = uuid.UUID("bbbbbbbb-0000-0000-0000-000000000001")
    user.is_active = True
    user.is_superuser = False
    return user


class FakePosition:
    """Mimics a Position SQLAlchemy model for Pydantic from_attributes serialization."""

    def __init__(self, status="NEW", pid=None):
        self.id = pid or uuid.uuid4()
        self.company_id = uuid.UUID("cccccccc-0000-0000-0000-000000000001")
        self.branch_id = uuid.UUID("bbbbbbbb-0000-0000-0000-000000000001")
        self.created_by = uuid.UUID("aaaaaaaa-0000-0000-0000-000000000001")
        self.record_id = "POS-001"
        self.entity = "Acme Corp"
        self.flow_type = "AR"
        self.currency = "EUR"
        self.amount = 100000.0
        self.value_date = "2026-06-30"
        self.status = "CONFIRMED"
        self.description = None
        self.is_active = True
        self.created_at = datetime(2026, 1, 1, tzinfo=UTC)
        self.updated_at = datetime(2026, 1, 1, tzinfo=UTC)
        self.execution_status = status
        self.policy_id = None
        self.last_run_id = None
        self.executed_at = None
        self.execution_ref = None
        self.hedge_amount = None
        self.hedge_rate = None
        self.rejection_reason = None


@pytest.fixture
def authed_client():
    """Client with auth overridden."""
    app.dependency_overrides[get_current_user] = lambda: _make_user()

    class _Ctx:
        async def __aenter__(self):
            self._client = AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test",
            )
            return await self._client.__aenter__()

        async def __aexit__(self, *args):
            await self._client.__aexit__(*args)
            app.dependency_overrides.clear()

    return _Ctx()


# ── DELETE tests ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_requires_auth(client: AsyncClient):
    """DELETE without auth returns 401/403."""
    resp = await client.delete(f"/api/v1/positions/{uuid.uuid4()}")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_delete_success(authed_client):
    """DELETE returns 204 on successful soft-delete."""
    pid = uuid.uuid4()
    pos = FakePosition("REJECTED", pid)

    with patch(f"{_ROUTE}._check_permission", new_callable=AsyncMock), \
         patch(f"{_ROUTE}._resolve_scope", new_callable=AsyncMock, return_value=False), \
         patch(f"{_ROUTE}._emit_lifecycle_audit", new_callable=AsyncMock), \
         patch(f"{_ROUTE}.position_service") as mock_ps:

        mock_ps.get_position = AsyncMock(return_value=pos)
        mock_ps.delete_position = AsyncMock(return_value=None)

        async with authed_client as c:
            resp = await c.delete(f"/api/v1/positions/{pid}", headers=_BEARER)

    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_delete_not_found(authed_client):
    """DELETE on non-existent position returns 404."""
    pid = uuid.uuid4()

    with patch(f"{_ROUTE}._check_permission", new_callable=AsyncMock), \
         patch(f"{_ROUTE}._resolve_scope", new_callable=AsyncMock, return_value=False), \
         patch(f"{_ROUTE}.position_service") as mock_ps:

        mock_ps.get_position = AsyncMock(side_effect=ValueError("not found"))
        mock_ps.delete_position = AsyncMock(side_effect=ValueError("not found"))

        async with authed_client as c:
            resp = await c.delete(f"/api/v1/positions/{pid}", headers=_BEARER)

    assert resp.status_code == 404


# ── REJECT tests ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_reject_success(authed_client):
    """PATCH /reject returns 200 with valid reason."""
    pid = uuid.uuid4()
    pos = FakePosition("REJECTED", pid)
    pos.rejection_reason = "Duplicate entry"

    with patch(f"{_ROUTE}._check_permission", new_callable=AsyncMock), \
         patch(f"{_ROUTE}._resolve_scope", new_callable=AsyncMock, return_value=False), \
         patch(f"{_ROUTE}._emit_lifecycle_audit", new_callable=AsyncMock), \
         patch(f"{_ROUTE}.position_service") as mock_ps:

        mock_ps.reject_position = AsyncMock(return_value=pos)

        async with authed_client as c:
            resp = await c.patch(
                f"/api/v1/positions/{pid}/reject",
                json={"reason": "Duplicate entry"},
                headers=_BEARER,
            )

    assert resp.status_code == 200
    assert resp.json()["execution_status"] == "REJECTED"


@pytest.mark.asyncio
async def test_reject_missing_reason(authed_client):
    """PATCH /reject without reason returns 422."""
    with patch(f"{_ROUTE}._check_permission", new_callable=AsyncMock), \
         patch(f"{_ROUTE}._resolve_scope", new_callable=AsyncMock, return_value=False):

        async with authed_client as c:
            resp = await c.patch(
                f"/api/v1/positions/{uuid.uuid4()}/reject",
                json={},
                headers=_BEARER,
            )

    assert resp.status_code == 422


# ── REOPEN tests ──────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_reopen_success(authed_client):
    """PATCH /reopen from REJECTED -> NEW returns 200."""
    pid = uuid.uuid4()
    pos = FakePosition("NEW", pid)

    with patch(f"{_ROUTE}._check_permission", new_callable=AsyncMock), \
         patch(f"{_ROUTE}._resolve_scope", new_callable=AsyncMock, return_value=False), \
         patch(f"{_ROUTE}._emit_lifecycle_audit", new_callable=AsyncMock), \
         patch(f"{_ROUTE}.position_service") as mock_ps:

        mock_ps.reopen_position = AsyncMock(return_value=pos)

        async with authed_client as c:
            resp = await c.patch(
                f"/api/v1/positions/{pid}/reopen", headers=_BEARER,
            )

    assert resp.status_code == 200
    assert resp.json()["execution_status"] == "NEW"


@pytest.mark.asyncio
async def test_reopen_illegal_transition(authed_client):
    """PATCH /reopen on non-REJECTED position returns 409."""
    with patch(f"{_ROUTE}._check_permission", new_callable=AsyncMock), \
         patch(f"{_ROUTE}._resolve_scope", new_callable=AsyncMock, return_value=False), \
         patch(f"{_ROUTE}.position_service") as mock_ps:

        mock_ps.reopen_position = AsyncMock(
            side_effect=ValueError("Illegal lifecycle transition"))

        async with authed_client as c:
            resp = await c.patch(
                f"/api/v1/positions/{uuid.uuid4()}/reopen", headers=_BEARER,
            )

    assert resp.status_code == 409


# ── ASSIGN-POLICY tests ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_assign_policy_success(authed_client):
    """PATCH /assign-policy returns 200."""
    pid = uuid.uuid4()
    pos = FakePosition("POLICY_ASSIGNED", pid)
    pos.policy_id = uuid.uuid4()

    with patch(f"{_ROUTE}._check_permission", new_callable=AsyncMock), \
         patch(f"{_ROUTE}._resolve_scope", new_callable=AsyncMock, return_value=False), \
         patch(f"{_ROUTE}._emit_lifecycle_audit", new_callable=AsyncMock), \
         patch(f"{_ROUTE}.position_service") as mock_ps:

        mock_ps.assign_policy = AsyncMock(return_value=pos)

        async with authed_client as c:
            resp = await c.patch(
                f"/api/v1/positions/{pid}/assign-policy",
                json={"policy_instance_id": str(uuid.uuid4())},
                headers=_BEARER,
            )

    assert resp.status_code == 200
    assert resp.json()["execution_status"] == "POLICY_ASSIGNED"


@pytest.mark.asyncio
async def test_assign_policy_illegal_transition(authed_client):
    """PATCH /assign-policy on HEDGED returns 409."""
    with patch(f"{_ROUTE}._check_permission", new_callable=AsyncMock), \
         patch(f"{_ROUTE}._resolve_scope", new_callable=AsyncMock, return_value=False), \
         patch(f"{_ROUTE}.position_service") as mock_ps:

        mock_ps.assign_policy = AsyncMock(
            side_effect=ValueError("Illegal lifecycle transition"))

        async with authed_client as c:
            resp = await c.patch(
                f"/api/v1/positions/{uuid.uuid4()}/assign-policy",
                json={"policy_instance_id": str(uuid.uuid4())},
                headers=_BEARER,
            )

    assert resp.status_code == 409


# ── READY tests ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_mark_ready_success(authed_client):
    """PATCH /ready returns 200."""
    pid = uuid.uuid4()
    pos = FakePosition("READY_TO_EXECUTE", pid)
    pos.last_run_id = "run-001"

    with patch(f"{_ROUTE}._check_permission", new_callable=AsyncMock), \
         patch(f"{_ROUTE}._resolve_scope", new_callable=AsyncMock, return_value=False), \
         patch(f"{_ROUTE}._emit_lifecycle_audit", new_callable=AsyncMock), \
         patch(f"{_ROUTE}.position_service") as mock_ps:

        mock_ps.mark_ready = AsyncMock(return_value=pos)

        async with authed_client as c:
            resp = await c.patch(
                f"/api/v1/positions/{pid}/ready",
                json={"run_id": "run-001"},
                headers=_BEARER,
            )

    assert resp.status_code == 200
    assert resp.json()["execution_status"] == "READY_TO_EXECUTE"


@pytest.mark.asyncio
async def test_mark_ready_illegal_transition(authed_client):
    """PATCH /ready from NEW returns 409."""
    with patch(f"{_ROUTE}._check_permission", new_callable=AsyncMock), \
         patch(f"{_ROUTE}._resolve_scope", new_callable=AsyncMock, return_value=False), \
         patch(f"{_ROUTE}.position_service") as mock_ps:

        mock_ps.mark_ready = AsyncMock(
            side_effect=ValueError("Illegal lifecycle transition"))

        async with authed_client as c:
            resp = await c.patch(
                f"/api/v1/positions/{uuid.uuid4()}/ready",
                json={"run_id": "run-001"},
                headers=_BEARER,
            )

    assert resp.status_code == 409


# ── EXECUTE tests ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_execute_success(authed_client):
    """PATCH /execute returns 200."""
    pid = uuid.uuid4()
    pos = FakePosition("HEDGED", pid)
    pos.execution_ref = "IBKR-123"
    pos.executed_at = datetime.now(UTC)

    with patch(f"{_ROUTE}._check_permission", new_callable=AsyncMock), \
         patch(f"{_ROUTE}._resolve_scope", new_callable=AsyncMock, return_value=False), \
         patch(f"{_ROUTE}._emit_lifecycle_audit", new_callable=AsyncMock), \
         patch(f"{_ROUTE}.position_service") as mock_ps:

        mock_ps.execute_position = AsyncMock(return_value=pos)

        async with authed_client as c:
            resp = await c.patch(
                f"/api/v1/positions/{pid}/execute",
                json={"execution_ref": "IBKR-123"},
                headers=_BEARER,
            )

    assert resp.status_code == 200
    assert resp.json()["execution_status"] == "HEDGED"


@pytest.mark.asyncio
async def test_execute_illegal_transition(authed_client):
    """PATCH /execute from NEW returns 409."""
    with patch(f"{_ROUTE}._check_permission", new_callable=AsyncMock), \
         patch(f"{_ROUTE}._resolve_scope", new_callable=AsyncMock, return_value=False), \
         patch(f"{_ROUTE}.position_service") as mock_ps:

        mock_ps.execute_position = AsyncMock(
            side_effect=ValueError("Illegal lifecycle transition"))

        async with authed_client as c:
            resp = await c.patch(
                f"/api/v1/positions/{uuid.uuid4()}/execute",
                json={"execution_ref": "IBKR-123"},
                headers=_BEARER,
            )

    assert resp.status_code == 409


# ── Lifecycle state machine unit tests ────────────────────────────────────────

def test_execution_transitions_map():
    """EXECUTION_TRANSITIONS is correct and complete."""
    from app.models.position import EXECUTION_TRANSITIONS

    assert "POLICY_ASSIGNED" in EXECUTION_TRANSITIONS["NEW"]
    assert "REJECTED" in EXECUTION_TRANSITIONS["NEW"]
    assert "READY_TO_EXECUTE" in EXECUTION_TRANSITIONS["POLICY_ASSIGNED"]
    assert "REJECTED" in EXECUTION_TRANSITIONS["POLICY_ASSIGNED"]
    assert "HEDGED" in EXECUTION_TRANSITIONS["READY_TO_EXECUTE"]
    assert "REJECTED" in EXECUTION_TRANSITIONS["READY_TO_EXECUTE"]
    assert "NEW" in EXECUTION_TRANSITIONS["REJECTED"]
    assert EXECUTION_TRANSITIONS.get("HEDGED", set()) == set()


def test_assert_transition_blocks_illegal():
    """Illegal transitions raise ValueError."""
    from app.services.position_service import _assert_transition

    with pytest.raises(ValueError, match="Illegal lifecycle transition"):
        _assert_transition("HEDGED", "NEW", uuid.uuid4())
    with pytest.raises(ValueError, match="Illegal lifecycle transition"):
        _assert_transition("NEW", "HEDGED", uuid.uuid4())
    with pytest.raises(ValueError, match="Illegal lifecycle transition"):
        _assert_transition("NEW", "READY_TO_EXECUTE", uuid.uuid4())


def test_assert_transition_allows_legal():
    """Legal transitions do not raise."""
    from app.services.position_service import _assert_transition

    pid = uuid.uuid4()
    _assert_transition("NEW", "POLICY_ASSIGNED", pid)
    _assert_transition("NEW", "REJECTED", pid)
    _assert_transition("POLICY_ASSIGNED", "READY_TO_EXECUTE", pid)
    _assert_transition("READY_TO_EXECUTE", "HEDGED", pid)
    _assert_transition("REJECTED", "NEW", pid)


def test_hedged_is_terminal():
    """HEDGED has no allowed transitions (terminal state)."""
    from app.models.position import EXECUTION_TRANSITIONS

    assert len(EXECUTION_TRANSITIONS.get("HEDGED", set())) == 0
    # Also verify REJECTED -> NEW is the only reopen path
    assert EXECUTION_TRANSITIONS["REJECTED"] == {"NEW"}
