"""
tests/test_positions_coverage.py

Coverage tests for app/api/routes/v1_positions.py

Covers:
- GET  /api/v1/positions          (list_positions)
- POST /api/v1/positions          (create_position)
- PUT  /api/v1/positions/{id}     (update_position)
- DELETE /api/v1/positions/{id}   (delete_position)
- GET  /api/v1/positions/exposure (get_exposure)
- PATCH /api/v1/positions/{id}/assign-policy
- PATCH /api/v1/positions/bulk-assign-policy
- PATCH /api/v1/positions/{id}/ready
- PATCH /api/v1/positions/{id}/execute
- PATCH /api/v1/positions/{id}/reject
- PATCH /api/v1/positions/{id}/reopen
- GET  /api/v1/positions/{id}/lineage
- Auth failures (401)
- Permission failures (403)

Uses app.dependency_overrides to mock DB session and current_user.
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
from app.core.security import get_current_user, create_access_token

_NOW = datetime(2025, 1, 1, tzinfo=timezone.utc)

BASE_URL = "http://test"
POS = "/api/v1/positions"

USER_ID    = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
COMPANY_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
BRANCH_ID  = "cccccccc-cccc-cccc-cccc-cccccccccccc"
POS_ID     = "dddddddd-dddd-dddd-dddd-dddddddddddd"
POLICY_ID  = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_token() -> str:
    return create_access_token(sub=USER_ID, email="test@example.com")


def _make_user(is_superuser: bool = True) -> MagicMock:
    user = MagicMock()
    user.id = UUID(USER_ID)
    user.email = "test@example.com"
    user.is_active = True
    user.is_superuser = is_superuser
    user.company_id = UUID(COMPANY_ID)
    user.branch_id = UUID(BRANCH_ID)
    return user


def _make_position(
    pos_id: str = POS_ID,
    execution_status: str = "NEW",
    record_id: str = "REC-001",
) -> MagicMock:
    pos = MagicMock()
    pos.id = UUID(pos_id)
    pos.record_id = record_id
    pos.entity = "TestCorp"
    pos.flow_type = "AR"
    pos.currency = "EUR"
    pos.amount = 100000.0
    pos.value_date = "2025-06-30"
    pos.status = "CONFIRMED"
    pos.execution_status = execution_status
    pos.is_active = True
    pos.company_id = UUID(COMPANY_ID)
    pos.branch_id = UUID(BRANCH_ID)
    pos.created_by = UUID(USER_ID)
    pos.created_at = _NOW
    pos.updated_at = _NOW
    pos.policy_id = None
    pos.policy_revision_id = None
    pos.last_run_id = None
    pos.hedge_amount = None
    pos.hedge_rate = None
    pos.execution_ref = None
    pos.executed_at = None
    pos.rejection_reason = None
    pos.description = None
    return pos


def _make_db() -> AsyncMock:
    """Return a minimal async mock session that won't raise on execute."""
    db = AsyncMock()
    result = MagicMock()
    scalars = MagicMock()
    scalars.first.return_value = None
    scalars.all.return_value = []
    result.scalars.return_value = scalars
    result.scalar.return_value = 0
    result.scalar_one.return_value = 0
    db.execute = AsyncMock(return_value=result)
    db.commit = AsyncMock()
    db.add = MagicMock()
    db.get = AsyncMock(return_value=None)
    return db


def _override_session(db: AsyncMock):
    async def _dep():
        yield db
    return _dep


def _override_user(user: MagicMock):
    async def _dep():
        return user
    return _dep


@contextlib.contextmanager
def _with_mocks(user: MagicMock | None = None, db: AsyncMock | None = None):
    """Install DB + user overrides, restore after."""
    if db is None:
        db = _make_db()
    if user is None:
        user = _make_user()
    app.dependency_overrides[get_async_session] = _override_session(db)
    app.dependency_overrides[get_current_user] = _override_user(user)
    try:
        yield db, user
    finally:
        app.dependency_overrides.pop(get_async_session, None)
        app.dependency_overrides.pop(get_current_user, None)


# ---------------------------------------------------------------------------
# 1. Auth failures (no token → 401)
# ---------------------------------------------------------------------------

class TestAuthFailures:
    @pytest.mark.asyncio
    async def test_list_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.get(f"{POS}")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_create_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.post(f"{POS}", json={})
        # CSRF middleware may return 403 for unauthenticated POST
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_update_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.put(f"{POS}/{POS_ID}", json={})
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_delete_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.delete(f"{POS}/{POS_ID}")
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_exposure_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.get(f"{POS}/exposure")
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_assign_policy_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.patch(f"{POS}/{POS_ID}/assign-policy", json={"policy_instance_id": POLICY_ID})
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_ready_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.patch(f"{POS}/{POS_ID}/ready", json={"run_id": str(uuid4())})
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_execute_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.patch(f"{POS}/{POS_ID}/execute", json={"execution_ref": "REF-001"})
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_reject_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.patch(f"{POS}/{POS_ID}/reject", json={"reason": "bad"})
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_reopen_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.patch(f"{POS}/{POS_ID}/reopen")
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_lineage_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.get(f"{POS}/{POS_ID}/lineage")
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# 2. GET /v1/positions — list positions
# ---------------------------------------------------------------------------

class TestListPositions:
    @pytest.mark.asyncio
    async def test_list_returns_200(self):
        pos = _make_position()
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.view", "reports.view_all_branches"})), \
                 patch("app.api.routes.v1_positions.position_service.list_positions",
                       new=AsyncMock(return_value=[pos])):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(
                        f"{POS}",
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert data["total"] == 1

    @pytest.mark.asyncio
    async def test_list_with_filters(self):
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.view"})), \
                 patch("app.api.routes.v1_positions.position_service.list_positions",
                       new=AsyncMock(return_value=[])):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(
                        f"{POS}?status=CONFIRMED&currency=EUR&flow_type=AR&page=1&size=50",
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 200
        assert r.json()["total"] == 0

    @pytest.mark.asyncio
    async def test_list_superuser_skips_rbac(self):
        """Superuser bypasses permission check."""
        with _with_mocks(user=_make_user(is_superuser=True)) as (db, user):
            with patch("app.api.routes.v1_positions.position_service.list_positions",
                       new=AsyncMock(return_value=[])):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(
                        f"{POS}",
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_list_missing_permission_returns_403(self):
        non_super = _make_user(is_superuser=False)
        with _with_mocks(user=non_super) as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value=set())):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(
                        f"{POS}",
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# 3. POST /v1/positions — create position
# ---------------------------------------------------------------------------

class TestCreatePosition:
    @pytest.mark.asyncio
    async def test_create_returns_201(self):
        pos = _make_position()
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.create"})), \
                 patch("app.api.routes.v1_positions.position_service.create_position",
                       new=AsyncMock(return_value=pos)), \
                 patch("app.api.routes.v1_positions._emit_lifecycle_audit",
                       new=AsyncMock()):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{POS}",
                        json={
                            "record_id": "REC-001",
                            "entity": "TestCorp",
                            "flow_type": "AR",
                            "currency": "EUR",
                            "amount": 100000,
                            "value_date": "2025-06-30",
                        },
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 201

    @pytest.mark.asyncio
    async def test_create_value_error_returns_422(self):
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.create"})), \
                 patch("app.api.routes.v1_positions.position_service.create_position",
                       new=AsyncMock(side_effect=ValueError("duplicate record_id"))):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{POS}",
                        json={
                            "record_id": "REC-001",
                            "entity": "TestCorp",
                            "flow_type": "AR",
                            "currency": "EUR",
                            "amount": 100000,
                            "value_date": "2025-06-30",
                        },
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_create_no_permission_returns_403(self):
        non_super = _make_user(is_superuser=False)
        with _with_mocks(user=non_super) as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value=set())):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{POS}",
                        json={
                            "record_id": "REC-001",
                            "entity": "TestCorp",
                            "flow_type": "AR",
                            "currency": "EUR",
                            "amount": 100000,
                            "value_date": "2025-06-30",
                        },
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# 4. PUT /v1/positions/{id} — update position
# ---------------------------------------------------------------------------

class TestUpdatePosition:
    @pytest.mark.asyncio
    async def test_update_returns_200(self):
        pos = _make_position()
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.edit", "reports.view_all_branches"})), \
                 patch("app.api.routes.v1_positions.position_service.update_position",
                       new=AsyncMock(return_value=pos)), \
                 patch("app.api.routes.v1_positions._emit_lifecycle_audit",
                       new=AsyncMock()):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.put(
                        f"{POS}/{POS_ID}",
                        json={"amount": 200000},
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_update_not_found_returns_404(self):
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.edit"})), \
                 patch("app.api.routes.v1_positions.position_service.update_position",
                       new=AsyncMock(side_effect=ValueError("Position not found"))):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.put(
                        f"{POS}/{POS_ID}",
                        json={"amount": 200000},
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# 5. DELETE /v1/positions/{id} — delete position
# ---------------------------------------------------------------------------

class TestDeletePosition:
    @pytest.mark.asyncio
    async def test_delete_returns_204(self):
        pos = _make_position()
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.delete", "reports.view_all_branches"})), \
                 patch("app.api.routes.v1_positions.position_service.get_position",
                       new=AsyncMock(return_value=pos)), \
                 patch("app.api.routes.v1_positions.position_service.delete_position",
                       new=AsyncMock(return_value=None)), \
                 patch("app.api.routes.v1_positions._emit_lifecycle_audit",
                       new=AsyncMock()):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.delete(
                        f"{POS}/{POS_ID}",
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_not_found_returns_404(self):
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.delete"})), \
                 patch("app.api.routes.v1_positions.position_service.get_position",
                       new=AsyncMock(return_value=None)), \
                 patch("app.api.routes.v1_positions.position_service.delete_position",
                       new=AsyncMock(side_effect=ValueError("Position not found"))):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.delete(
                        f"{POS}/{POS_ID}",
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_rejected_only_returns_409(self):
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.delete"})), \
                 patch("app.api.routes.v1_positions.position_service.get_position",
                       new=AsyncMock(return_value=None)), \
                 patch("app.api.routes.v1_positions.position_service.delete_position",
                       new=AsyncMock(side_effect=ValueError("Only REJECTED positions may be deleted"))):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.delete(
                        f"{POS}/{POS_ID}",
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 409


# ---------------------------------------------------------------------------
# 6. GET /v1/positions/exposure
# ---------------------------------------------------------------------------

class TestExposure:
    @pytest.mark.asyncio
    async def test_exposure_returns_200(self):
        exposure = MagicMock()
        exposure.currency = "EUR"
        exposure.confirmed_total = 100000
        exposure.forecast_total = 50000
        exposure.net_total = 150000
        exposure.position_count = 2
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.view", "reports.view_all_branches"})), \
                 patch("app.api.routes.v1_positions.position_service.get_exposure_aggregation",
                       new=AsyncMock(return_value=[])):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(
                        f"{POS}/exposure",
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 200
        assert r.json() == []


# ---------------------------------------------------------------------------
# 7. PATCH /v1/positions/{id}/assign-policy
# ---------------------------------------------------------------------------

class TestAssignPolicy:
    @pytest.mark.asyncio
    async def test_assign_policy_returns_200(self):
        pos = _make_position(execution_status="POLICY_ASSIGNED")
        pos.policy_id = UUID(POLICY_ID)
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.edit", "reports.view_all_branches"})), \
                 patch("app.api.routes.v1_positions.position_service.assign_policy",
                       new=AsyncMock(return_value=pos)), \
                 patch("app.api.routes.v1_positions._emit_lifecycle_audit",
                       new=AsyncMock()):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.patch(
                        f"{POS}/{POS_ID}/assign-policy",
                        json={"policy_instance_id": POLICY_ID},
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_assign_policy_illegal_transition_returns_409(self):
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.edit"})), \
                 patch("app.api.routes.v1_positions.position_service.assign_policy",
                       new=AsyncMock(side_effect=ValueError("Illegal lifecycle transition"))):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.patch(
                        f"{POS}/{POS_ID}/assign-policy",
                        json={"policy_instance_id": POLICY_ID},
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 409

    @pytest.mark.asyncio
    async def test_assign_policy_not_found_returns_404(self):
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.edit"})), \
                 patch("app.api.routes.v1_positions.position_service.assign_policy",
                       new=AsyncMock(side_effect=ValueError("Position not found"))):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.patch(
                        f"{POS}/{POS_ID}/assign-policy",
                        json={"policy_instance_id": POLICY_ID},
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# 8. PATCH /v1/positions/bulk-assign-policy
# ---------------------------------------------------------------------------

class TestBulkAssignPolicy:
    @pytest.mark.asyncio
    async def test_bulk_assign_returns_200(self):
        pos = _make_position(execution_status="POLICY_ASSIGNED")
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.edit", "reports.view_all_branches"})), \
                 patch("app.api.routes.v1_positions.position_service.assign_policy",
                       new=AsyncMock(return_value=pos)), \
                 patch("app.api.routes.v1_positions._emit_lifecycle_audit",
                       new=AsyncMock()):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.patch(
                        f"{POS}/bulk-assign-policy",
                        json={
                            "position_ids": [POS_ID],
                            "policy_instance_id": POLICY_ID,
                        },
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 200
        data = r.json()
        assert data["assigned"] == 1
        assert data["skipped"] == 0
        assert data["failed"] == 0

    @pytest.mark.asyncio
    async def test_bulk_assign_skip_on_409(self):
        from fastapi import HTTPException as FastHTTPException
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.edit"})), \
                 patch("app.api.routes.v1_positions.position_service.assign_policy",
                       new=AsyncMock(side_effect=FastHTTPException(status_code=409, detail="conflict"))):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.patch(
                        f"{POS}/bulk-assign-policy",
                        json={
                            "position_ids": [POS_ID],
                            "policy_instance_id": POLICY_ID,
                        },
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 200
        data = r.json()
        assert data["skipped"] == 1

    @pytest.mark.asyncio
    async def test_bulk_assign_fail_on_other_error(self):
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.edit"})), \
                 patch("app.api.routes.v1_positions.position_service.assign_policy",
                       new=AsyncMock(side_effect=Exception("unexpected error"))):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.patch(
                        f"{POS}/bulk-assign-policy",
                        json={
                            "position_ids": [POS_ID],
                            "policy_instance_id": POLICY_ID,
                        },
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 200
        data = r.json()
        assert data["failed"] == 1


# ---------------------------------------------------------------------------
# 9. PATCH /v1/positions/{id}/ready
# ---------------------------------------------------------------------------

class TestMarkReady:
    @pytest.mark.asyncio
    async def test_ready_returns_200(self):
        pos = _make_position(execution_status="READY_TO_EXECUTE")
        run_id = str(uuid4())
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.edit", "reports.view_all_branches"})), \
                 patch("app.api.routes.v1_positions.position_service.mark_ready",
                       new=AsyncMock(return_value=pos)), \
                 patch("app.api.routes.v1_positions._emit_lifecycle_audit",
                       new=AsyncMock()):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.patch(
                        f"{POS}/{POS_ID}/ready",
                        json={"run_id": run_id},
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_ready_illegal_transition_returns_409(self):
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.edit"})), \
                 patch("app.api.routes.v1_positions.position_service.mark_ready",
                       new=AsyncMock(side_effect=ValueError("Illegal lifecycle transition"))):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.patch(
                        f"{POS}/{POS_ID}/ready",
                        json={"run_id": str(uuid4())},
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 409

    @pytest.mark.asyncio
    async def test_ready_not_found_returns_404(self):
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.edit"})), \
                 patch("app.api.routes.v1_positions.position_service.mark_ready",
                       new=AsyncMock(side_effect=ValueError("Position not found"))):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.patch(
                        f"{POS}/{POS_ID}/ready",
                        json={"run_id": str(uuid4())},
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# 10. PATCH /v1/positions/{id}/execute
# ---------------------------------------------------------------------------

class TestExecutePosition:
    @pytest.mark.asyncio
    async def test_execute_returns_200(self):
        pos = _make_position(execution_status="HEDGED")
        pos.execution_ref = "REF-001"
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.execute", "reports.view_all_branches"})), \
                 patch("app.api.routes.v1_positions.position_service.execute_position",
                       new=AsyncMock(return_value=pos)), \
                 patch("app.api.routes.v1_positions._emit_lifecycle_audit",
                       new=AsyncMock()):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.patch(
                        f"{POS}/{POS_ID}/execute",
                        json={"execution_ref": "REF-001"},
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_execute_illegal_transition_returns_409(self):
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.execute"})), \
                 patch("app.api.routes.v1_positions.position_service.execute_position",
                       new=AsyncMock(side_effect=ValueError("Illegal lifecycle transition"))):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.patch(
                        f"{POS}/{POS_ID}/execute",
                        json={"execution_ref": "REF-001"},
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 409

    @pytest.mark.asyncio
    async def test_execute_not_found_returns_404(self):
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.execute"})), \
                 patch("app.api.routes.v1_positions.position_service.execute_position",
                       new=AsyncMock(side_effect=ValueError("Position not found"))):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.patch(
                        f"{POS}/{POS_ID}/execute",
                        json={"execution_ref": "REF-001"},
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# 11. PATCH /v1/positions/{id}/reject
# ---------------------------------------------------------------------------

class TestRejectPosition:
    @pytest.mark.asyncio
    async def test_reject_returns_200(self):
        pos = _make_position(execution_status="REJECTED")
        pos.rejection_reason = "bad trade"
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.edit", "reports.view_all_branches"})), \
                 patch("app.api.routes.v1_positions.position_service.reject_position",
                       new=AsyncMock(return_value=pos)), \
                 patch("app.api.routes.v1_positions._emit_lifecycle_audit",
                       new=AsyncMock()):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.patch(
                        f"{POS}/{POS_ID}/reject",
                        json={"reason": "bad trade"},
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_reject_illegal_transition_returns_409(self):
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.edit"})), \
                 patch("app.api.routes.v1_positions.position_service.reject_position",
                       new=AsyncMock(side_effect=ValueError("Illegal lifecycle transition"))):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.patch(
                        f"{POS}/{POS_ID}/reject",
                        json={"reason": "bad trade"},
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 409


# ---------------------------------------------------------------------------
# 12. PATCH /v1/positions/{id}/reopen
# ---------------------------------------------------------------------------

class TestReopenPosition:
    @pytest.mark.asyncio
    async def test_reopen_returns_200(self):
        pos = _make_position(execution_status="NEW")
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.edit", "reports.view_all_branches"})), \
                 patch("app.api.routes.v1_positions.position_service.reopen_position",
                       new=AsyncMock(return_value=pos)), \
                 patch("app.api.routes.v1_positions._emit_lifecycle_audit",
                       new=AsyncMock()):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.patch(
                        f"{POS}/{POS_ID}/reopen",
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_reopen_illegal_transition_returns_409(self):
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.edit"})), \
                 patch("app.api.routes.v1_positions.position_service.reopen_position",
                       new=AsyncMock(side_effect=ValueError("Illegal lifecycle transition"))):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.patch(
                        f"{POS}/{POS_ID}/reopen",
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 409

    @pytest.mark.asyncio
    async def test_reopen_not_found_returns_404(self):
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.edit"})), \
                 patch("app.api.routes.v1_positions.position_service.reopen_position",
                       new=AsyncMock(side_effect=ValueError("Position not found"))):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.patch(
                        f"{POS}/{POS_ID}/reopen",
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# 13. GET /v1/positions/{id}/lineage
# ---------------------------------------------------------------------------

class TestPositionLineage:
    @pytest.mark.asyncio
    async def test_lineage_not_found_returns_404(self):
        """When position does not exist, lineage returns 404."""
        db = _make_db()
        # Make execute return None for scalars().first()
        result = MagicMock()
        scalars = MagicMock()
        scalars.first.return_value = None
        scalars.all.return_value = []
        result.scalars.return_value = scalars
        db.execute = AsyncMock(return_value=result)

        with _with_mocks(db=db) as (_, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.view", "reports.view_all_branches"})):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(
                        f"{POS}/{POS_ID}/lineage",
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_lineage_found_returns_200(self):
        """When position exists with no linked records, lineage returns summary."""
        db = _make_db()
        pos = _make_position()

        # First execute call: position query
        pos_result = MagicMock()
        pos_scalars = MagicMock()
        pos_scalars.first.return_value = pos
        pos_scalars.all.return_value = []
        pos_result.scalars.return_value = pos_scalars

        # Second execute call: ExecutionProposals query
        ep_result = MagicMock()
        ep_scalars = MagicMock()
        ep_scalars.all.return_value = []
        ep_result.scalars.return_value = ep_scalars

        db.execute = AsyncMock(side_effect=[pos_result, ep_result])

        with _with_mocks(db=db) as (_, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.view", "reports.view_all_branches"})):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(
                        f"{POS}/{POS_ID}/lineage",
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 200
        data = r.json()
        assert "nodes" in data
        assert "edges" in data
        assert "summary" in data
        assert data["position_id"] == POS_ID


# ---------------------------------------------------------------------------
# 14. POST /v1/positions/import — CSV bulk import
# ---------------------------------------------------------------------------

class TestImportPositions:
    @pytest.mark.asyncio
    async def test_import_csv_returns_200(self):
        csv_content = (
            "record_id,entity,flow_type,currency,amount,value_date\n"
            "REC-001,TestCorp,AR,EUR,100000,2025-06-30\n"
        )
        pos = _make_position()
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.create"})), \
                 patch("app.api.routes.v1_positions.position_service.bulk_import",
                       new=AsyncMock(return_value=([pos], []))):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{POS}/import",
                        files={"file": ("test.csv", csv_content.encode(), "text/csv")},
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 200
        data = r.json()
        assert data["created"] == 1
        assert data["total_rows"] == 1

    @pytest.mark.asyncio
    async def test_import_csv_bad_rows_returns_422(self):
        csv_content = (
            "record_id,entity,flow_type,currency,amount,value_date\n"
            "REC-001,TestCorp,AR,EUR,not_a_number,2025-06-30\n"
        )
        with _with_mocks() as (db, user):
            with patch("app.api.routes.v1_positions.rbac_service.get_permissions_by_user",
                       new=AsyncMock(return_value={"trades.create"})):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{POS}/import",
                        files={"file": ("test.csv", csv_content.encode(), "text/csv")},
                        headers={"Authorization": f"Bearer {_make_token()}"},
                    )
        assert r.status_code == 422
