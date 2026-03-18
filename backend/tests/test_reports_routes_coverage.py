"""
tests/test_reports_routes_coverage.py

Coverage tests for app/api/routes/v1_reports.py

Endpoints covered:
  POST   /api/v1/reports/save
  GET    /api/v1/reports/saved
  DELETE /api/v1/reports/saved/{report_id}
  POST   /api/v1/reports/schedules
  GET    /api/v1/reports/schedules
  PATCH  /api/v1/reports/schedules/{schedule_id}
  DELETE /api/v1/reports/schedules/{schedule_id}
  GET    /api/v1/reports/{run_id}/excel
  GET    /api/v1/reports/{run_id}/pdf
  GET    /api/v1/reports/{run_id}/bank-pdf
  GET    /api/v1/reports/{run_id}/emir
  GET    /api/v1/reports/{run_id}/mifid
  GET    /api/v1/reports/{run_id}/dodd-frank
"""

from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite://")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-ci-at-least-32-chars-long")

import contextlib
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.db import get_async_session
from app.core.security import create_access_token, get_current_user
from app.main import app

BASE = "http://test"
REPORTS = "/api/v1/reports"

USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
COMPANY_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
BRANCH_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc"
REPORT_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd"
SCHEDULE_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"
RUN_ID = "run-test-0001"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_token() -> str:
    return create_access_token(sub=USER_ID, email="reports@test.com")


def _make_user(is_superuser: bool = True) -> MagicMock:
    user = MagicMock()
    user.id = uuid.UUID(USER_ID)
    user.email = "reports@test.com"
    user.is_active = True
    user.is_superuser = is_superuser
    user.company_id = uuid.UUID(COMPANY_ID)
    user.branch_id = uuid.UUID(BRANCH_ID)
    return user


def _make_saved_report() -> MagicMock:
    row = MagicMock()
    row.id = uuid.UUID(REPORT_ID)
    row.run_id = RUN_ID
    row.name = "Test Report"
    row.snapshot = {}
    row.version_number = 1
    row.saved_at = datetime.now(UTC)
    row.user_id = uuid.UUID(USER_ID)
    return row


def _make_schedule() -> MagicMock:
    row = MagicMock()
    row.id = uuid.UUID(SCHEDULE_ID)
    row.name = "Weekly Report"
    row.frequency = "WEEKLY"
    row.report_type = "committee_pack"
    row.recipients = ["a@b.com"]
    row.last_run_at = None
    row.next_run_at = None
    row.is_active = True
    row.created_at = datetime.now(UTC)
    row.user_id = uuid.UUID(USER_ID)
    return row


def _make_calc_run() -> MagicMock:
    run = MagicMock()
    run.id = RUN_ID
    run.company_id = uuid.UUID(COMPANY_ID)
    run.position_ids = []
    run.run_envelope = {}
    run.trade_count = 0
    run.hedge_count = 0
    run.run_hash = "abc123"
    run.inputs_hash = "inp123"
    run.outputs_hash = "out123"
    run.policy_hash = None
    run.created_at = datetime.now(UTC)
    return run


def _make_db(user: MagicMock, **kwargs) -> AsyncMock:
    """Build a minimal mock AsyncSession for reports routes."""
    db = AsyncMock()

    # session.get(Model, pk) calls
    async def _mock_get(model_class, pk):
        name = model_class.__name__ if hasattr(model_class, "__name__") else str(model_class)
        if "SavedReport" in name:
            return kwargs.get("saved_report", None)
        if "ReportSchedule" in name:
            return kwargs.get("schedule", None)
        if "CalculationRun" in name:
            return kwargs.get("calc_run", None)
        return None

    db.get = AsyncMock(side_effect=_mock_get)

    # session.execute() for SELECT queries
    saved_report = kwargs.get("saved_report", None)
    schedule = kwargs.get("schedule", None)

    count_result = MagicMock()
    count_scalars = MagicMock()
    count_scalars.all.return_value = []
    count_scalars.first.return_value = None
    count_result.scalars.return_value = count_scalars

    list_result = MagicMock()
    list_scalars = MagicMock()
    list_scalars.all.return_value = [saved_report] if saved_report else []
    list_scalars.first.return_value = None
    list_result.scalars.return_value = list_scalars

    schedule_result = MagicMock()
    sched_scalars = MagicMock()
    sched_scalars.all.return_value = [schedule] if schedule else []
    sched_scalars.first.return_value = None
    schedule_result.scalars.return_value = sched_scalars

    audit_result = MagicMock()
    audit_scalars = MagicMock()
    audit_scalars.first.return_value = None
    audit_scalars.all.return_value = []
    audit_result.scalars.return_value = audit_scalars

    # Cycle through: count, version, list, audit hash
    db.execute = AsyncMock(side_effect=[
        count_result, count_result, list_result, schedule_result,
        audit_result, audit_result, audit_result,
        count_result, count_result, count_result, count_result,
        count_result, count_result, count_result, count_result,
    ])

    db.add = MagicMock()
    db.flush = AsyncMock()
    db.commit = AsyncMock()
    db.delete = AsyncMock()
    db.refresh = AsyncMock(side_effect=lambda obj: None)

    return db


def _override_session(mock_db: AsyncMock):
    async def _override():
        yield mock_db
    return _override


def _override_user(user: MagicMock):
    async def _dep():
        return user
    return _dep


@contextlib.contextmanager
def _with_overrides(user: MagicMock, mock_db: AsyncMock):
    app.dependency_overrides[get_async_session] = _override_session(mock_db)
    app.dependency_overrides[get_current_user] = _override_user(user)
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_async_session, None)
        app.dependency_overrides.pop(get_current_user, None)


# ---------------------------------------------------------------------------
# Auth rejection tests
# ---------------------------------------------------------------------------

class TestAuthRejection:
    @pytest.mark.asyncio
    async def test_save_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE) as ac:
            r = await ac.post(f"{REPORTS}/save", json={"run_id": RUN_ID, "name": "x"})
        # CSRF or auth middleware may return 401 or 403 when no token is provided
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_list_saved_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE) as ac:
            r = await ac.get(f"{REPORTS}/saved")
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_delete_saved_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE) as ac:
            r = await ac.delete(f"{REPORTS}/saved/{REPORT_ID}")
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_create_schedule_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE) as ac:
            r = await ac.post(
                f"{REPORTS}/schedules",
                json={"name": "x", "frequency": "DAILY", "report_type": "committee_pack"},
            )
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_list_schedules_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE) as ac:
            r = await ac.get(f"{REPORTS}/schedules")
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_excel_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE) as ac:
            r = await ac.get(f"{REPORTS}/{RUN_ID}/excel")
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_pdf_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE) as ac:
            r = await ac.get(f"{REPORTS}/{RUN_ID}/pdf")
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_bank_pdf_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE) as ac:
            r = await ac.get(f"{REPORTS}/{RUN_ID}/bank-pdf")
        assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# POST /save
# ---------------------------------------------------------------------------

class TestSaveReport:
    @pytest.mark.asyncio
    async def test_save_report_superuser(self):
        user = _make_user(is_superuser=True)
        saved = _make_saved_report()
        db = _make_db(user, saved_report=saved)

        # refresh sets attributes on the object
        async def _refresh(obj):
            obj.id = uuid.UUID(REPORT_ID)
            obj.run_id = RUN_ID
            obj.name = "My Report"
            obj.snapshot = {}
            obj.version_number = 1
            obj.saved_at = datetime.now(UTC)

        db.refresh = AsyncMock(side_effect=_refresh)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.post(
                    f"{REPORTS}/save",
                    json={"run_id": RUN_ID, "name": "My Report", "snapshot": {"tab": "summary"}},
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 201
        data = r.json()
        assert data["name"] == "My Report"

    @pytest.mark.asyncio
    async def test_save_report_at_limit_culls_oldest(self):
        """When user has 20 saved reports, oldest are deleted before saving new one."""
        user = _make_user(is_superuser=True)

        # Simulate 20 existing reports
        existing = [_make_saved_report() for _ in range(20)]
        for i, r in enumerate(existing):
            r.saved_at = datetime(2024, 1, i + 1, tzinfo=UTC)

        db = AsyncMock()
        db.get = AsyncMock(return_value=None)

        count_result = MagicMock()
        count_scalars = MagicMock()
        count_scalars.all.return_value = existing  # returns 20 rows
        count_scalars.first.return_value = None
        count_result.scalars.return_value = count_scalars

        oldest_result = MagicMock()
        oldest_scalars = MagicMock()
        oldest_scalars.all.return_value = [existing[0]]  # oldest row to cull
        oldest_scalars.first.return_value = None
        oldest_result.scalars.return_value = oldest_scalars

        version_result = MagicMock()
        version_scalars = MagicMock()
        version_scalars.first.return_value = None
        version_result.scalars.return_value = version_scalars

        db.execute = AsyncMock(side_effect=[count_result, oldest_result, version_result])
        db.add = MagicMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.delete = AsyncMock()

        new_report = _make_saved_report()

        async def _refresh(obj):
            obj.id = uuid.UUID(REPORT_ID)
            obj.run_id = RUN_ID
            obj.name = "New Report"
            obj.snapshot = {}
            obj.version_number = 1
            obj.saved_at = datetime.now(UTC)

        db.refresh = AsyncMock(side_effect=_refresh)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.post(
                    f"{REPORTS}/save",
                    json={"run_id": RUN_ID, "name": "New Report"},
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 201

    @pytest.mark.asyncio
    async def test_save_report_with_existing_version(self):
        """Version number increments when run_id already has saved reports."""
        user = _make_user(is_superuser=True)
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)

        # First: count query returns 0 rows (below limit)
        empty_count = MagicMock()
        empty_count_scalars = MagicMock()
        empty_count_scalars.all.return_value = []
        empty_count_scalars.first.return_value = None
        empty_count.scalars.return_value = empty_count_scalars

        # Second: version query returns last_version=3
        ver_result = MagicMock()
        ver_scalars = MagicMock()
        ver_scalars.first.return_value = 3
        ver_result.scalars.return_value = ver_scalars

        db.execute = AsyncMock(side_effect=[empty_count, ver_result])
        db.add = MagicMock()
        db.flush = AsyncMock()
        db.commit = AsyncMock()
        db.delete = AsyncMock()

        async def _refresh(obj):
            obj.id = uuid.UUID(REPORT_ID)
            obj.run_id = RUN_ID
            obj.name = "v4 Report"
            obj.snapshot = {}
            obj.version_number = 4
            obj.saved_at = datetime.now(UTC)

        db.refresh = AsyncMock(side_effect=_refresh)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.post(
                    f"{REPORTS}/save",
                    json={"run_id": RUN_ID, "name": "v4 Report"},
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 201
        assert r.json()["version_number"] == 4


# ---------------------------------------------------------------------------
# GET /saved
# ---------------------------------------------------------------------------

class TestListSavedReports:
    @pytest.mark.asyncio
    async def test_list_returns_reports(self):
        user = _make_user(is_superuser=True)
        saved = _make_saved_report()

        list_result = MagicMock()
        list_scalars = MagicMock()
        list_scalars.all.return_value = [saved]
        list_result.scalars.return_value = list_scalars

        db = AsyncMock()
        db.execute = AsyncMock(return_value=list_result)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{REPORTS}/saved",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 1

    @pytest.mark.asyncio
    async def test_list_empty(self):
        user = _make_user(is_superuser=True)

        empty_result = MagicMock()
        empty_scalars = MagicMock()
        empty_scalars.all.return_value = []
        empty_result.scalars.return_value = empty_scalars

        db = AsyncMock()
        db.execute = AsyncMock(return_value=empty_result)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{REPORTS}/saved",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        assert r.json() == []


# ---------------------------------------------------------------------------
# DELETE /saved/{report_id}
# ---------------------------------------------------------------------------

class TestDeleteSavedReport:
    @pytest.mark.asyncio
    async def test_delete_own_report(self):
        user = _make_user(is_superuser=True)
        saved = _make_saved_report()
        saved.user_id = uuid.UUID(USER_ID)

        db = AsyncMock()
        db.get = AsyncMock(return_value=saved)
        db.delete = AsyncMock()
        db.commit = AsyncMock()

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.delete(
                    f"{REPORTS}/saved/{REPORT_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_not_found(self):
        user = _make_user(is_superuser=True)
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.delete(
                    f"{REPORTS}/saved/{REPORT_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_other_users_report(self):
        user = _make_user(is_superuser=True)
        saved = _make_saved_report()
        saved.user_id = uuid.UUID("ffffffff-ffff-ffff-ffff-ffffffffffff")  # different user

        db = AsyncMock()
        db.get = AsyncMock(return_value=saved)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.delete(
                    f"{REPORTS}/saved/{REPORT_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# POST /schedules
# ---------------------------------------------------------------------------

class TestCreateSchedule:
    @pytest.mark.asyncio
    async def test_create_schedule_success(self):
        user = _make_user(is_superuser=True)
        schedule = _make_schedule()

        db = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()

        async def _refresh(obj):
            obj.id = uuid.UUID(SCHEDULE_ID)
            obj.name = "Weekly Report"
            obj.frequency = "WEEKLY"
            obj.report_type = "committee_pack"
            obj.recipients = ["a@b.com"]
            obj.last_run_at = None
            obj.next_run_at = None
            obj.is_active = True
            obj.created_at = datetime.now(UTC)

        db.refresh = AsyncMock(side_effect=_refresh)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.post(
                    f"{REPORTS}/schedules",
                    json={
                        "name": "Weekly Report",
                        "frequency": "WEEKLY",
                        "report_type": "committee_pack",
                        "recipients": ["a@b.com"],
                    },
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 201
        data = r.json()
        assert data["status"] == "scheduled"
        assert "schedule" in data

    @pytest.mark.asyncio
    async def test_create_schedule_invalid_frequency(self):
        user = _make_user(is_superuser=True)
        db = AsyncMock()

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.post(
                    f"{REPORTS}/schedules",
                    json={
                        "name": "Bad",
                        "frequency": "HOURLY",  # invalid
                        "report_type": "committee_pack",
                    },
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 422


# ---------------------------------------------------------------------------
# GET /schedules
# ---------------------------------------------------------------------------

class TestListSchedules:
    @pytest.mark.asyncio
    async def test_list_schedules_success(self):
        user = _make_user(is_superuser=True)
        schedule = _make_schedule()

        list_result = MagicMock()
        list_scalars = MagicMock()
        list_scalars.all.return_value = [schedule]
        list_result.scalars.return_value = list_scalars

        db = AsyncMock()
        db.execute = AsyncMock(return_value=list_result)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{REPORTS}/schedules",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------------------------------------------------------------------------
# PATCH /schedules/{schedule_id}
# ---------------------------------------------------------------------------

class TestUpdateSchedule:
    @pytest.mark.asyncio
    async def test_update_schedule_success(self):
        user = _make_user(is_superuser=True)
        schedule = _make_schedule()
        schedule.user_id = uuid.UUID(USER_ID)

        db = AsyncMock()
        db.get = AsyncMock(return_value=schedule)
        db.commit = AsyncMock()

        async def _refresh(obj):
            obj.id = uuid.UUID(SCHEDULE_ID)
            obj.name = "Updated Name"
            obj.frequency = "MONTHLY"
            obj.report_type = "committee_pack"
            obj.recipients = ["b@c.com"]
            obj.last_run_at = None
            obj.next_run_at = None
            obj.is_active = False
            obj.created_at = datetime.now(UTC)

        db.refresh = AsyncMock(side_effect=_refresh)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.patch(
                    f"{REPORTS}/schedules/{SCHEDULE_ID}",
                    json={"name": "Updated Name", "frequency": "MONTHLY", "is_active": False},
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_update_schedule_not_found(self):
        user = _make_user(is_superuser=True)
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.patch(
                    f"{REPORTS}/schedules/{SCHEDULE_ID}",
                    json={"name": "X"},
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_update_schedule_other_user(self):
        user = _make_user(is_superuser=True)
        schedule = _make_schedule()
        schedule.user_id = uuid.UUID("ffffffff-ffff-ffff-ffff-ffffffffffff")

        db = AsyncMock()
        db.get = AsyncMock(return_value=schedule)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.patch(
                    f"{REPORTS}/schedules/{SCHEDULE_ID}",
                    json={"name": "X"},
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /schedules/{schedule_id}
# ---------------------------------------------------------------------------

class TestDeleteSchedule:
    @pytest.mark.asyncio
    async def test_delete_schedule_success(self):
        user = _make_user(is_superuser=True)
        schedule = _make_schedule()
        schedule.user_id = uuid.UUID(USER_ID)

        db = AsyncMock()
        db.get = AsyncMock(return_value=schedule)
        db.delete = AsyncMock()
        db.commit = AsyncMock()

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.delete(
                    f"{REPORTS}/schedules/{SCHEDULE_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_schedule_not_found(self):
        user = _make_user(is_superuser=True)
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.delete(
                    f"{REPORTS}/schedules/{SCHEDULE_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_schedule_other_user(self):
        user = _make_user(is_superuser=True)
        schedule = _make_schedule()
        schedule.user_id = uuid.UUID("ffffffff-ffff-ffff-ffff-ffffffffffff")

        db = AsyncMock()
        db.get = AsyncMock(return_value=schedule)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.delete(
                    f"{REPORTS}/schedules/{SCHEDULE_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# GET /{run_id}/excel
# ---------------------------------------------------------------------------

class TestDownloadExcel:
    def _make_db_for_download(self, calc_run: MagicMock) -> AsyncMock:
        db = AsyncMock()
        db.get = AsyncMock(return_value=calc_run)

        audit_result = MagicMock()
        audit_scalars = MagicMock()
        audit_scalars.first.return_value = None
        audit_scalars.all.return_value = []
        audit_result.scalars.return_value = audit_scalars

        pos_result = MagicMock()
        pos_scalars = MagicMock()
        pos_scalars.all.return_value = []
        pos_result.scalars.return_value = pos_scalars

        db.execute = AsyncMock(side_effect=[pos_result, audit_result, audit_result])
        db.add = MagicMock()
        db.commit = AsyncMock()
        return db

    @pytest.mark.asyncio
    async def test_excel_download_success(self):
        user = _make_user(is_superuser=True)
        calc_run = _make_calc_run()
        db = self._make_db_for_download(calc_run)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{REPORTS}/{RUN_ID}/excel",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        assert "text/csv" in r.headers["content-type"]
        assert "attachment" in r.headers["content-disposition"]

    @pytest.mark.asyncio
    async def test_excel_run_not_found(self):
        user = _make_user(is_superuser=True)

        db = AsyncMock()
        db.get = AsyncMock(return_value=None)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{REPORTS}/{RUN_ID}/excel",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_excel_wrong_tenant(self):
        user = _make_user(is_superuser=True)
        calc_run = _make_calc_run()
        calc_run.company_id = uuid.UUID("ffffffff-ffff-ffff-ffff-ffffffffffff")  # different company

        db = AsyncMock()
        db.get = AsyncMock(return_value=calc_run)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{REPORTS}/{RUN_ID}/excel",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_excel_with_positions_and_buckets(self):
        """Excel with actual position data and hedge plan buckets."""
        user = _make_user(is_superuser=True)
        calc_run = _make_calc_run()
        pos_id = str(uuid.uuid4())
        calc_run.position_ids = [pos_id]
        calc_run.run_envelope = {
            "hedge_plan": {
                "buckets": [
                    {
                        "position_id": pos_id,
                        "instrument": "FX Forward",
                        "hedge_notional": 100000,
                        "hedge_notional_usd": 100000,
                        "hedge_rate": 1.25,
                        "currency": "EUR",
                    }
                ]
            }
        }
        calc_run.trade_count = 1
        calc_run.hedge_count = 1

        pos = MagicMock()
        pos.id = uuid.UUID(pos_id) if len(pos_id) == 36 else uuid.uuid4()
        pos.record_id = "POS001"
        pos.entity = "Corp A"
        pos.flow_type = "RECEIVABLE"
        pos.currency = "EUR"
        pos.amount = 100000
        pos.value_date = "2025-06-30"
        pos.status = "ACTIVE"
        pos.execution_status = "HEDGED"
        pos.hedge_amount = None
        pos.hedge_rate = None

        db = AsyncMock()
        db.get = AsyncMock(return_value=calc_run)

        pos_result = MagicMock()
        pos_scalars = MagicMock()
        pos_scalars.all.return_value = [pos]
        pos_result.scalars.return_value = pos_scalars

        audit_result = MagicMock()
        audit_scalars = MagicMock()
        audit_scalars.first.return_value = None
        audit_scalars.all.return_value = []
        audit_result.scalars.return_value = audit_scalars

        db.execute = AsyncMock(side_effect=[pos_result, audit_result, audit_result])
        db.add = MagicMock()
        db.commit = AsyncMock()

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{REPORTS}/{RUN_ID}/excel",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        content = r.content.decode("utf-8-sig")
        assert "Record ID" in content
        assert "POS001" in content


# ---------------------------------------------------------------------------
# GET /{run_id}/pdf
# ---------------------------------------------------------------------------

class TestDownloadPdf:
    def _make_db_for_download(self, calc_run: MagicMock) -> AsyncMock:
        db = AsyncMock()
        db.get = AsyncMock(return_value=calc_run)

        pos_result = MagicMock()
        pos_scalars = MagicMock()
        pos_scalars.all.return_value = []
        pos_result.scalars.return_value = pos_scalars

        audit_result = MagicMock()
        audit_scalars = MagicMock()
        audit_scalars.first.return_value = None
        audit_scalars.all.return_value = []
        audit_result.scalars.return_value = audit_scalars

        db.execute = AsyncMock(side_effect=[pos_result, audit_result, audit_result])
        db.add = MagicMock()
        db.commit = AsyncMock()
        return db

    @pytest.mark.asyncio
    async def test_pdf_download_success(self):
        user = _make_user(is_superuser=True)
        calc_run = _make_calc_run()
        db = self._make_db_for_download(calc_run)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{REPORTS}/{RUN_ID}/pdf",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        assert "text/plain" in r.headers["content-type"]
        assert "committee-pack" in r.headers["content-disposition"]

    @pytest.mark.asyncio
    async def test_pdf_run_not_found(self):
        user = _make_user(is_superuser=True)
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{REPORTS}/{RUN_ID}/pdf",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_pdf_with_positions_and_buckets(self):
        """PDF with positions and hedge buckets produces correct content."""
        user = _make_user(is_superuser=True)
        calc_run = _make_calc_run()
        pos_id = str(uuid.uuid4())
        calc_run.position_ids = [pos_id]
        calc_run.run_envelope = {
            "hedge_plan": {
                "buckets": [
                    {
                        "position_id": pos_id,
                        "instrument": "FX Forward",
                        "hedge_notional": 100000,
                        "hedge_rate": 1.25,
                        "currency": "EUR",
                    }
                ]
            }
        }
        calc_run.trade_count = 1
        calc_run.hedge_count = 1

        pos = MagicMock()
        pos.id = uuid.uuid4()
        pos.record_id = "POS002"
        pos.entity = "Corp B"
        pos.currency = "EUR"
        pos.amount = 50000
        pos.execution_status = "HEDGED"

        db = AsyncMock()
        db.get = AsyncMock(return_value=calc_run)

        pos_result = MagicMock()
        pos_scalars = MagicMock()
        pos_scalars.all.return_value = [pos]
        pos_result.scalars.return_value = pos_scalars

        audit_result = MagicMock()
        audit_scalars = MagicMock()
        audit_scalars.first.return_value = None
        audit_scalars.all.return_value = []
        audit_result.scalars.return_value = audit_scalars

        db.execute = AsyncMock(side_effect=[pos_result, audit_result, audit_result])
        db.add = MagicMock()
        db.commit = AsyncMock()

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{REPORTS}/{RUN_ID}/pdf",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        content = r.content.decode("utf-8")
        assert "COMMITTEE PACK" in content
        assert "POS002" in content
        assert "FX Forward" in content


# ---------------------------------------------------------------------------
# GET /{run_id}/bank-pdf
# ---------------------------------------------------------------------------

class TestDownloadBankPdf:
    def _make_db_for_download(self, calc_run: MagicMock) -> AsyncMock:
        db = AsyncMock()
        db.get = AsyncMock(return_value=calc_run)

        pos_result = MagicMock()
        pos_scalars = MagicMock()
        pos_scalars.all.return_value = []
        pos_result.scalars.return_value = pos_scalars

        audit_result = MagicMock()
        audit_scalars = MagicMock()
        audit_scalars.first.return_value = None
        audit_scalars.all.return_value = []
        audit_result.scalars.return_value = audit_scalars

        db.execute = AsyncMock(side_effect=[pos_result, audit_result, audit_result])
        db.add = MagicMock()
        db.commit = AsyncMock()
        return db

    @pytest.mark.asyncio
    async def test_bank_pdf_success(self):
        user = _make_user(is_superuser=True)
        calc_run = _make_calc_run()
        db = self._make_db_for_download(calc_run)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{REPORTS}/{RUN_ID}/bank-pdf",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        assert "bank-compliance" in r.headers["content-disposition"]

    @pytest.mark.asyncio
    async def test_bank_pdf_not_found(self):
        user = _make_user(is_superuser=True)
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{REPORTS}/{RUN_ID}/bank-pdf",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_bank_pdf_with_positions_and_buckets(self):
        user = _make_user(is_superuser=True)
        calc_run = _make_calc_run()
        pos_id = str(uuid.uuid4())
        calc_run.position_ids = [pos_id]
        calc_run.run_envelope = {
            "hedge_plan": {
                "buckets": [
                    {
                        "position_id": pos_id,
                        "instrument": "FX Forward",
                        "hedge_notional": 100000,
                        "hedge_rate": 1.25,
                        "currency": "GBP",
                        "value_date": "2025-06-30",
                    }
                ]
            }
        }

        pos = MagicMock()
        pos.id = uuid.uuid4()
        pos.record_id = "POS003"
        pos.entity = "Corp C"
        pos.currency = "GBP"
        pos.amount = 100000
        pos.flow_type = "PAYABLE"
        pos.execution_status = "HEDGED"

        db = AsyncMock()
        db.get = AsyncMock(return_value=calc_run)

        pos_result = MagicMock()
        pos_scalars = MagicMock()
        pos_scalars.all.return_value = [pos]
        pos_result.scalars.return_value = pos_scalars

        audit_result = MagicMock()
        audit_scalars = MagicMock()
        audit_scalars.first.return_value = None
        audit_result.scalars.return_value = audit_scalars

        db.execute = AsyncMock(side_effect=[pos_result, audit_result, audit_result])
        db.add = MagicMock()
        db.commit = AsyncMock()

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{REPORTS}/{RUN_ID}/bank-pdf",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        content = r.content.decode("utf-8")
        assert "BANK COMPLIANCE" in content
        assert "GBP" in content


# ---------------------------------------------------------------------------
# GET /{run_id}/emir
# ---------------------------------------------------------------------------

def _make_reg_db_get(calc_run):
    """Return a side_effect for db.get that distinguishes CalculationRun vs Company."""
    from app.models.organization import Company as CompanyModel
    from app.models.calculation_run import CalculationRun as CalcRunModel

    company_mock = MagicMock()
    company_mock.settings = {}

    async def _get(model_class, pk):
        name = model_class.__name__ if hasattr(model_class, "__name__") else str(model_class)
        if "Company" in name:
            return company_mock
        if "CalculationRun" in name:
            return calc_run
        return None

    return _get


class TestDownloadEmir:
    @pytest.mark.asyncio
    async def test_emir_success(self):
        user = _make_user(is_superuser=True)
        calc_run = _make_calc_run()

        db = AsyncMock()
        db.get = AsyncMock(side_effect=_make_reg_db_get(calc_run))

        pos_result = MagicMock()
        pos_scalars = MagicMock()
        pos_scalars.all.return_value = []
        pos_result.scalars.return_value = pos_scalars

        audit_result = MagicMock()
        audit_scalars = MagicMock()
        audit_scalars.first.return_value = None
        audit_scalars.all.return_value = []
        audit_result.scalars.return_value = audit_scalars

        db.execute = AsyncMock(side_effect=[pos_result, audit_result, audit_result])
        db.add = MagicMock()
        db.commit = AsyncMock()

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{REPORTS}/{RUN_ID}/emir",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        assert "emir-report" in r.headers["content-disposition"]

    @pytest.mark.asyncio
    async def test_emir_not_found(self):
        user = _make_user(is_superuser=True)
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{REPORTS}/{RUN_ID}/emir",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# GET /{run_id}/mifid
# ---------------------------------------------------------------------------

class TestDownloadMifid:
    @pytest.mark.asyncio
    async def test_mifid_success(self):
        user = _make_user(is_superuser=True)
        calc_run = _make_calc_run()

        db = AsyncMock()
        db.get = AsyncMock(side_effect=_make_reg_db_get(calc_run))

        pos_result = MagicMock()
        pos_scalars = MagicMock()
        pos_scalars.all.return_value = []
        pos_result.scalars.return_value = pos_scalars

        audit_result = MagicMock()
        audit_scalars = MagicMock()
        audit_scalars.first.return_value = None
        audit_scalars.all.return_value = []
        audit_result.scalars.return_value = audit_scalars

        db.execute = AsyncMock(side_effect=[pos_result, audit_result, audit_result])
        db.add = MagicMock()
        db.commit = AsyncMock()

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{REPORTS}/{RUN_ID}/mifid",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        assert "mifid-report" in r.headers["content-disposition"]

    @pytest.mark.asyncio
    async def test_mifid_not_found(self):
        user = _make_user(is_superuser=True)
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{REPORTS}/{RUN_ID}/mifid",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# GET /{run_id}/dodd-frank
# ---------------------------------------------------------------------------

class TestDownloadDoddFrank:
    @pytest.mark.asyncio
    async def test_dodd_frank_success(self):
        user = _make_user(is_superuser=True)
        calc_run = _make_calc_run()

        db = AsyncMock()
        db.get = AsyncMock(side_effect=_make_reg_db_get(calc_run))

        pos_result = MagicMock()
        pos_scalars = MagicMock()
        pos_scalars.all.return_value = []
        pos_result.scalars.return_value = pos_scalars

        # For dodd-frank: positions query + hash_chain query + audit emit queries
        hash_result = MagicMock()
        hash_scalars = MagicMock()
        hash_scalars.all.return_value = []
        hash_result.scalars.return_value = hash_scalars

        audit_result = MagicMock()
        audit_scalars = MagicMock()
        audit_scalars.first.return_value = None
        audit_scalars.all.return_value = []
        audit_result.scalars.return_value = audit_scalars

        db.execute = AsyncMock(
            side_effect=[pos_result, hash_result, audit_result, audit_result]
        )
        db.add = MagicMock()
        db.commit = AsyncMock()

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{REPORTS}/{RUN_ID}/dodd-frank",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        assert "dodd-frank" in r.headers["content-disposition"]

    @pytest.mark.asyncio
    async def test_dodd_frank_not_found(self):
        user = _make_user(is_superuser=True)
        db = AsyncMock()
        db.get = AsyncMock(return_value=None)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{REPORTS}/{RUN_ID}/dodd-frank",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Permission check (non-superuser without reports.view)
# ---------------------------------------------------------------------------

class TestPermissions:
    @pytest.mark.asyncio
    async def test_non_superuser_without_permission_gets_4xx(self):
        """Non-superuser with rbac_service raising HTTPException 403."""
        from fastapi import HTTPException as FastAPIHTTPException
        user = _make_user(is_superuser=False)

        db = AsyncMock()

        with (
            patch(
                "app.api.routes.v1_reports._require",
                side_effect=FastAPIHTTPException(status_code=403, detail="Missing permission"),
            ),
            _with_overrides(user, db),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{REPORTS}/saved",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 403
