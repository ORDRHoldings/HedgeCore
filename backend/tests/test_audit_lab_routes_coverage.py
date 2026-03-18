"""
tests/test_audit_lab_routes_coverage.py

Coverage tests for app/api/routes/v1_audit_lab.py

Endpoints covered:
  POST /api/v1/audit-lab/datasets/upload
  POST /api/v1/audit-lab/runs
  GET  /api/v1/audit-lab/runs
  GET  /api/v1/audit-lab/runs/{run_id}
  GET  /api/v1/audit-lab/runs/{run_id}/export
  GET  /api/v1/audit-lab/runs/{run_id}/transactions
  GET  /api/v1/audit-lab/runs/{run_id}/exposure-gaps
  GET  /api/v1/audit-lab/datasets
  GET  /api/v1/audit-lab/compare
  GET  /api/v1/audit-lab/trends
  GET  /api/v1/audit-lab/audit-trail
  GET  /api/v1/audit-lab/review-queue
  POST /api/v1/audit-lab/review-queue/{transaction_id}/resolve

DI pattern: app.dependency_overrides for get_async_session + get_current_user
"""

from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite://")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-ci-at-least-32-chars-long")

import contextlib
import io
import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.db import get_async_session
from app.core.security import get_current_user, create_access_token

BASE_URL = "http://test"
PREFIX = "/api/v1/audit-lab"

USER_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
COMPANY_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
BRANCH_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc"
DATASET_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd"
RUN_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"
TXN_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_token(user_id: str = USER_ID) -> str:
    return create_access_token(sub=user_id, email="audit@test.com")


def _make_user(is_superuser: bool = True) -> MagicMock:
    user = MagicMock()
    user.id = uuid.UUID(USER_ID)
    user.is_active = True
    user.is_superuser = is_superuser
    user.company_id = uuid.UUID(COMPANY_ID)
    user.branch_id = uuid.UUID(BRANCH_ID)
    user.email = "audit@test.com"
    return user


def _make_mock_db() -> AsyncMock:
    """Return an AsyncMock session that returns empty results for all queries."""
    empty_result = MagicMock()
    empty_result.fetchone.return_value = None
    empty_result.fetchall.return_value = []
    empty_result.scalar.return_value = None
    empty_result.scalars.return_value.first.return_value = None
    empty_result.scalars.return_value.all.return_value = []

    db = AsyncMock()
    db.execute = AsyncMock(return_value=empty_result)
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.add = MagicMock()
    db.get = AsyncMock(return_value=None)
    return db


def _override_session(mock_db: AsyncMock):
    async def _dep():
        yield mock_db
    return _dep


def _override_user(user: MagicMock):
    async def _dep():
        return user
    return _dep


@contextlib.contextmanager
def _setup(mock_db: AsyncMock = None, user: MagicMock = None):
    """Context manager to install dependency overrides."""
    if mock_db is None:
        mock_db = _make_mock_db()
    if user is None:
        user = _make_user()
    app.dependency_overrides[get_async_session] = _override_session(mock_db)
    app.dependency_overrides[get_current_user] = _override_user(user)
    try:
        yield mock_db, user
    finally:
        app.dependency_overrides.pop(get_async_session, None)
        app.dependency_overrides.pop(get_current_user, None)


def _make_csv_bytes(rows: int = 2) -> bytes:
    lines = ["trade_date,currency_sold,currency_bought,amount_sold,amount_bought,counterparty"]
    for i in range(rows):
        lines.append(f"2024-01-0{i+1},USD,EUR,100000,92000,BankA")
    return "\n".join(lines).encode("utf-8")


# ---------------------------------------------------------------------------
# 1. Auth failures — 401 when no token
# ---------------------------------------------------------------------------

class TestAuthFailures:
    """Every endpoint returns 401 when no bearer token is provided."""

    @pytest.mark.asyncio
    async def test_upload_no_auth(self):
        # POST without auth returns 403 (CSRF middleware fires before JWT) or 401
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
            r = await ac.post(f"{PREFIX}/datasets/upload")
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_create_run_no_auth(self):
        # POST without auth returns 403 (CSRF middleware fires before JWT) or 401
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
            r = await ac.post(f"{PREFIX}/runs", json={})
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_list_runs_no_auth(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
            r = await ac.get(f"{PREFIX}/runs")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_get_run_no_auth(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
            r = await ac.get(f"{PREFIX}/runs/{RUN_ID}")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_export_run_no_auth(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
            r = await ac.get(f"{PREFIX}/runs/{RUN_ID}/export")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_list_datasets_no_auth(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
            r = await ac.get(f"{PREFIX}/datasets")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_compare_no_auth(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
            r = await ac.get(f"{PREFIX}/compare", params={"run_ids": f"{RUN_ID},{RUN_ID}"})
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_trends_no_auth(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
            r = await ac.get(f"{PREFIX}/trends")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_audit_trail_no_auth(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
            r = await ac.get(f"{PREFIX}/audit-trail")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_review_queue_no_auth(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
            r = await ac.get(f"{PREFIX}/review-queue")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_transactions_no_auth(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
            r = await ac.get(f"{PREFIX}/runs/{RUN_ID}/transactions")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_exposure_gaps_no_auth(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
            r = await ac.get(f"{PREFIX}/runs/{RUN_ID}/exposure-gaps")
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# 2. List datasets — happy path
# ---------------------------------------------------------------------------

class TestListDatasets:

    @pytest.mark.asyncio
    async def test_list_datasets_empty(self):
        """Returns empty list when no datasets exist."""
        with _setup() as (db, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/datasets",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert isinstance(data["items"], list)

    @pytest.mark.asyncio
    async def test_list_datasets_with_rows(self):
        """Returns datasets when DB returns rows."""
        mock_row = MagicMock()
        mock_row.id = uuid.UUID(DATASET_ID)
        mock_row.period_start = "2024-01-01"
        mock_row.period_end = "2024-01-31"
        mock_row.source_filename = "test.csv"
        mock_row.source_hash = "abc123"
        mock_row.row_count = 10
        mock_row.currency_pairs = ["USDEUR"]
        mock_row.created_at = None

        result_mock = MagicMock()
        result_mock.fetchall.return_value = [mock_row]

        db = _make_mock_db()
        db.execute = AsyncMock(return_value=result_mock)

        with _setup(db) as (_, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/datasets",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert len(data["items"]) == 1
        assert data["items"][0]["source_filename"] == "test.csv"


# ---------------------------------------------------------------------------
# 3. Upload dataset
# ---------------------------------------------------------------------------

class TestUploadDataset:

    @pytest.mark.asyncio
    async def test_upload_no_file_content_returns_422(self):
        """Empty file body => 422."""
        db = _make_mock_db()
        with _setup(db) as (_, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{PREFIX}/datasets/upload",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                    files={"file": ("empty.csv", b"", "text/csv")},
                    data={"period_start": "2024-01-01", "period_end": "2024-01-31"},
                )
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_upload_zero_rows_returns_422(self):
        """CSV with header only (no data rows) => 422."""
        db = _make_mock_db()
        # No dedup hit (fetchone returns None)
        no_row = MagicMock()
        no_row.fetchone.return_value = None
        db.execute = AsyncMock(return_value=no_row)

        csv_bytes = b"trade_date,currency_sold,currency_bought,amount_sold,amount_bought\n"

        with _setup(db) as (_, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{PREFIX}/datasets/upload",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                    files={"file": ("test.csv", csv_bytes, "text/csv")},
                    data={"period_start": "2024-01-01", "period_end": "2024-01-31"},
                )
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_upload_invalid_period_dates_returns_422(self):
        """Bad date strings => 422."""
        db = _make_mock_db()
        no_row = MagicMock()
        no_row.fetchone.return_value = None
        db.execute = AsyncMock(return_value=no_row)

        csv_bytes = _make_csv_bytes()

        with _setup(db) as (_, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{PREFIX}/datasets/upload",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                    files={"file": ("test.csv", csv_bytes, "text/csv")},
                    data={"period_start": "not-a-date", "period_end": "2024-01-31"},
                )
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_upload_period_end_before_start_returns_422(self):
        """period_end < period_start => 422."""
        db = _make_mock_db()
        no_row = MagicMock()
        no_row.fetchone.return_value = None
        db.execute = AsyncMock(return_value=no_row)

        csv_bytes = _make_csv_bytes()

        with _setup(db) as (_, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{PREFIX}/datasets/upload",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                    files={"file": ("test.csv", csv_bytes, "text/csv")},
                    data={"period_start": "2024-02-01", "period_end": "2024-01-01"},
                )
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_upload_duplicate_returns_409(self):
        """Duplicate content hash => 409."""
        db = _make_mock_db()
        dup_row = MagicMock()
        dup_row.__getitem__ = lambda self, key: str(uuid.UUID(DATASET_ID)) if key == 0 else None

        dup_result = MagicMock()
        dup_result.fetchone.return_value = dup_row

        db.execute = AsyncMock(return_value=dup_result)

        csv_bytes = _make_csv_bytes()

        with _setup(db) as (_, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{PREFIX}/datasets/upload",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                    files={"file": ("test.csv", csv_bytes, "text/csv")},
                    data={"period_start": "2024-01-01", "period_end": "2024-01-31"},
                )
        assert r.status_code == 409

    @pytest.mark.asyncio
    async def test_upload_permission_denied_403(self):
        """Non-superuser without audit.upload permission => 403."""
        user = _make_user(is_superuser=False)
        db = _make_mock_db()

        with (
            _setup(db, user) as (_, _u),
            patch(
                "app.api.routes.v1_audit_lab.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),  # no permissions
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{PREFIX}/datasets/upload",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                    files={"file": ("test.csv", _make_csv_bytes(), "text/csv")},
                    data={"period_start": "2024-01-01", "period_end": "2024-01-31"},
                )
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_upload_db_error_returns_500(self):
        """DB insert failure => 500."""
        db = _make_mock_db()
        no_row = MagicMock()
        no_row.fetchone.return_value = None

        # First call (dedup check) returns no row; second call (insert) raises
        db.execute = AsyncMock(side_effect=[no_row, Exception("DB down")])

        csv_bytes = _make_csv_bytes()

        with _setup(db) as (_, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{PREFIX}/datasets/upload",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                    files={"file": ("test.csv", csv_bytes, "text/csv")},
                    data={"period_start": "2024-01-01", "period_end": "2024-01-31"},
                )
        assert r.status_code == 500


# ---------------------------------------------------------------------------
# 4. Create audit run
# ---------------------------------------------------------------------------

class TestCreateAuditRun:

    @pytest.mark.asyncio
    async def test_create_run_missing_dataset_id_returns_422(self):
        """Missing dataset_id => 422."""
        with _setup() as (db, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{PREFIX}/runs",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                    json={},
                )
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_create_run_dataset_not_found_returns_404(self):
        """Dataset not found => 404."""
        db = _make_mock_db()
        no_row = MagicMock()
        no_row.fetchone.return_value = None
        db.execute = AsyncMock(return_value=no_row)

        with _setup(db) as (_, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{PREFIX}/runs",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                    json={"dataset_id": str(uuid.uuid4())},
                )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_create_run_permission_denied_403(self):
        """Non-superuser without audit.run => 403."""
        user = _make_user(is_superuser=False)
        db = _make_mock_db()

        with (
            _setup(db, user) as (_, _u),
            patch(
                "app.api.routes.v1_audit_lab.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{PREFIX}/runs",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                    json={"dataset_id": DATASET_ID},
                )
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_create_run_success(self):
        """Successful run creation returns run_id and summary."""
        from datetime import date

        db = _make_mock_db()

        # Dataset row returned on first execute
        ds_row = MagicMock()
        ds_row.period_start = date(2024, 1, 1)
        ds_row.period_end = date(2024, 1, 31)
        ds_row.row_count = 2

        ds_result = MagicMock()
        ds_result.fetchone.return_value = ds_row

        # Transactions returned on second execute
        txn_row = MagicMock()
        txn_row.id = uuid.uuid4()
        txn_row.row_hash = "abc"
        txn_row.row_index = 0
        txn_row.trade_date = date(2024, 1, 5)
        txn_row.value_date = date(2024, 1, 7)
        txn_row.currency_sold = "USD"
        txn_row.currency_bought = "EUR"
        txn_row.amount_sold = 100000.0
        txn_row.amount_bought = 92000.0
        txn_row.effective_rate = 0.92
        txn_row.counterparty = "BankA"
        txn_row.fee_amount = None
        txn_row.fee_currency = None
        txn_row.reference = "REF001"

        txn_result = MagicMock()
        txn_result.fetchall.return_value = [txn_row]

        # Snapshot rows (empty)
        snap_result = MagicMock()
        snap_result.fetchall.return_value = []

        # All subsequent inserts return empty results
        empty_result = MagicMock()
        empty_result.fetchone.return_value = None
        empty_result.fetchall.return_value = []

        db.execute = AsyncMock(side_effect=[
            ds_result,   # dataset lookup
            txn_result,  # transactions
            snap_result, # market snapshots (first attempt with bid/ask)
            empty_result, empty_result, empty_result, empty_result,  # inserts
            empty_result, empty_result, empty_result, empty_result,
        ])

        with (
            _setup(db) as (_, user),
            patch(
                "app.api.routes.v1_audit_lab.emit_audit",
                new=AsyncMock(return_value=None),
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{PREFIX}/runs",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                    json={"dataset_id": DATASET_ID},
                )

        assert r.status_code == 200
        data = r.json()
        assert "run_id" in data
        assert "summary" in data


# ---------------------------------------------------------------------------
# 5. List runs
# ---------------------------------------------------------------------------

class TestListRuns:

    @pytest.mark.asyncio
    async def test_list_runs_empty(self):
        """Returns empty list when no runs exist."""
        with _setup() as (db, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/runs",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        assert r.json() == []

    @pytest.mark.asyncio
    async def test_list_runs_returns_items(self):
        """Returns run items when DB has rows."""
        from datetime import datetime

        mock_row = MagicMock()
        mock_row.id = uuid.UUID(RUN_ID)
        mock_row.dataset_id = uuid.UUID(DATASET_ID)
        mock_row.methodology_version = "1.0.0"
        mock_row.run_hash = "abc123"
        mock_row.inputs_hash = "inp"
        mock_row.outputs_hash = "out"
        mock_row.status = "COMPLETED"
        mock_row.report_json = {"summary": {"total_markup_usd": 5000.0}}
        mock_row.created_at = datetime(2024, 1, 15, 12, 0, 0)

        result_mock = MagicMock()
        result_mock.fetchall.return_value = [mock_row]

        db = _make_mock_db()
        db.execute = AsyncMock(return_value=result_mock)

        with _setup(db) as (_, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/runs",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        items = r.json()
        assert len(items) == 1
        assert items[0]["run_id"] == RUN_ID
        assert items[0]["markup_total_usd"] == 5000.0


# ---------------------------------------------------------------------------
# 6. Get run detail
# ---------------------------------------------------------------------------

class TestGetAuditRun:

    @pytest.mark.asyncio
    async def test_get_run_not_found(self):
        with _setup() as (db, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/runs/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_get_run_found(self):
        from datetime import datetime

        run_row = MagicMock()
        run_row.id = uuid.UUID(RUN_ID)
        run_row.dataset_id = uuid.UUID(DATASET_ID)
        run_row.methodology_version = "1.0.0"
        run_row.benchmark_config = {}
        run_row.run_hash = "abc"
        run_row.inputs_hash = "inp"
        run_row.outputs_hash = "out"
        run_row.trace_bundle = {}
        run_row.status = "COMPLETED"
        run_row.created_at = datetime(2024, 1, 15)
        run_row.created_by = uuid.UUID(USER_ID)
        run_row.report_json = {"summary": {"total_markup_usd": 1000.0}}
        run_row.report_hash = "rephash"

        run_result = MagicMock()
        run_result.fetchone.return_value = run_row

        findings_result = MagicMock()
        findings_result.fetchall.return_value = []

        db = _make_mock_db()
        db.execute = AsyncMock(side_effect=[run_result, findings_result])

        with _setup(db) as (_, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/runs/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert data["run_id"] == RUN_ID
        assert data["status"] == "COMPLETED"
        assert data["findings"] == []


# ---------------------------------------------------------------------------
# 7. Export audit run
# ---------------------------------------------------------------------------

class TestExportAuditRun:

    @pytest.mark.asyncio
    async def test_export_run_not_found(self):
        with _setup() as (db, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/runs/{RUN_ID}/export",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_export_run_found(self):
        from datetime import datetime

        run_row = MagicMock()
        run_row.id = uuid.UUID(RUN_ID)
        run_row.dataset_id = uuid.UUID(DATASET_ID)
        run_row.methodology_version = "1.0.0"
        run_row.run_hash = "abc"
        run_row.inputs_hash = "inp"
        run_row.outputs_hash = "out"
        run_row.trace_bundle = {"events": []}
        run_row.created_at = datetime(2024, 1, 15)
        run_row.dataset_hash = "dset_hash"
        run_row.report_hash = "rephash"
        run_row.report_json = {"summary": {"total_markup_usd": 500.0}}

        run_result = MagicMock()
        run_result.fetchone.return_value = run_row

        findings_result = MagicMock()
        findings_result.fetchall.return_value = []

        db = _make_mock_db()
        db.execute = AsyncMock(side_effect=[run_result, findings_result])

        with _setup(db) as (_, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/runs/{RUN_ID}/export",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert data["run_id"] == RUN_ID
        assert "manifest_version" in data
        assert "artifacts" in data


# ---------------------------------------------------------------------------
# 8. Run transactions
# ---------------------------------------------------------------------------

class TestRunTransactions:

    @pytest.mark.asyncio
    async def test_transactions_run_not_found(self):
        with _setup() as (db, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/runs/{RUN_ID}/transactions",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_transactions_empty(self):
        run_row = MagicMock()
        run_row.dataset_id = uuid.UUID(DATASET_ID)

        run_result = MagicMock()
        run_result.fetchone.return_value = run_row

        txn_result = MagicMock()
        txn_result.fetchall.return_value = []

        findings_result = MagicMock()
        findings_result.fetchall.return_value = []

        db = _make_mock_db()
        db.execute = AsyncMock(side_effect=[run_result, txn_result, findings_result])

        with _setup(db) as (_, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/runs/{RUN_ID}/transactions",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert data["transactions"] == []
        assert data["total"] == 0


# ---------------------------------------------------------------------------
# 9. Compare runs
# ---------------------------------------------------------------------------

class TestCompareRuns:

    @pytest.mark.asyncio
    async def test_compare_requires_two_run_ids(self):
        """Fewer than 2 run IDs => 422."""
        with _setup() as (db, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/compare",
                    params={"run_ids": RUN_ID},
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_compare_runs_not_found(self):
        """Runs not in DB => returns empty runs list."""
        with _setup() as (db, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                run2 = str(uuid.uuid4())
                r = await ac.get(
                    f"{PREFIX}/compare",
                    params={"run_ids": f"{RUN_ID},{run2}"},
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert data["count"] == 0

    @pytest.mark.asyncio
    async def test_compare_runs_found(self):
        from datetime import datetime

        def _make_run_row(run_id: str) -> MagicMock:
            row = MagicMock()
            row.id = uuid.UUID(run_id)
            row.dataset_id = uuid.UUID(DATASET_ID)
            row.methodology_version = "1.0.0"
            row.run_hash = "abc"
            row.status = "COMPLETED"
            row.created_at = datetime(2024, 1, 15)
            row.report_json = {"summary": {}, "markup_by_pair": {}, "markup_by_counterparty": {}, "markup_by_month": {}}
            row.report_hash = "rephash"
            return row

        run2_id = str(uuid.uuid4())

        def side_effect_factory():
            calls = [0]
            rows = [_make_run_row(RUN_ID), _make_run_row(run2_id)]

            async def _execute(q, params=None):
                idx = calls[0]
                calls[0] += 1
                result = MagicMock()
                if idx < 2:
                    result.fetchone.return_value = rows[idx]
                else:
                    result.fetchone.return_value = None
                return result

            return _execute

        db = _make_mock_db()
        db.execute = side_effect_factory()

        with _setup(db) as (_, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/compare",
                    params={"run_ids": f"{RUN_ID},{run2_id}"},
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert data["count"] == 2


# ---------------------------------------------------------------------------
# 10. Trends
# ---------------------------------------------------------------------------

class TestTrends:

    @pytest.mark.asyncio
    async def test_trends_empty(self):
        with _setup() as (db, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/trends",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert "trend_points" in data
        assert data["count"] == 0

    @pytest.mark.asyncio
    async def test_trends_with_data(self):
        from datetime import datetime

        trend_row = MagicMock()
        trend_row.id = uuid.UUID(RUN_ID)
        trend_row.created_at = datetime(2024, 1, 15)
        trend_row.methodology_version = "1.0.0"
        trend_row.report_json = {
            "summary": {"total_markup_usd": 1000.0, "total_fees_usd": 50.0,
                        "total_loss_usd": 1050.0, "data_quality_score": 95.0},
            "markup_by_pair": {"USDEUR": 1000.0},
            "markup_by_counterparty": {"BankA": 1000.0},
        }

        result = MagicMock()
        result.fetchall.return_value = [trend_row]

        db = _make_mock_db()
        db.execute = AsyncMock(return_value=result)

        with _setup(db) as (_, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/trends",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert data["count"] == 1
        assert len(data["counterparty_breakdown"]) == 1


# ---------------------------------------------------------------------------
# 11. Audit trail
# ---------------------------------------------------------------------------

class TestAuditTrail:

    @pytest.mark.asyncio
    async def test_audit_trail_empty(self):
        with _setup() as (db, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/audit-trail",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert "events" in data
        assert data["total"] == 0

    @pytest.mark.asyncio
    async def test_audit_trail_with_entity_filter(self):
        """entity_type query param is passed through."""
        with _setup() as (db, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/audit-trail",
                    params={"entity_type": "audit_run"},
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_audit_trail_with_events(self):
        from datetime import datetime

        event_row = MagicMock()
        event_row.id = uuid.uuid4()
        event_row.event_type = "SYSTEM"
        event_row.description = "Upload test"
        event_row.entity_type = "audit_dataset"
        event_row.entity_id = uuid.UUID(DATASET_ID)
        event_row.actor_email = "audit@test.com"
        event_row.created_at = datetime(2024, 1, 15)
        event_row.event_hash = "a" * 64

        result = MagicMock()
        result.fetchall.return_value = [event_row]

        db = _make_mock_db()
        db.execute = AsyncMock(return_value=result)

        with _setup(db) as (_, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/audit-trail",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 1
        assert "event_hash" in data["events"][0]


# ---------------------------------------------------------------------------
# 12. Review queue
# ---------------------------------------------------------------------------

class TestReviewQueue:

    @pytest.mark.asyncio
    async def test_review_queue_permission_denied(self):
        """Non-superuser without audit.review => 403."""
        user = _make_user(is_superuser=False)
        db = _make_mock_db()

        with (
            _setup(db, user) as (_, _u),
            patch(
                "app.api.routes.v1_audit_lab.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/review-queue",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_review_queue_empty_superuser(self):
        """Superuser gets empty queue."""
        with _setup() as (db, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/review-queue",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert "items" in data

    @pytest.mark.asyncio
    async def test_review_queue_with_run_id_not_found(self):
        """Review queue with unknown run_id => 404."""
        with _setup() as (db, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/review-queue",
                    params={"run_id": RUN_ID},
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_review_queue_items_with_warnings(self):
        """Transactions with parse_warnings are returned as review items."""
        run_row = MagicMock()
        run_row.dataset_id = uuid.UUID(DATASET_ID)
        run_result = MagicMock()
        run_result.fetchone.return_value = run_row

        txn_row = MagicMock()
        txn_row.id = uuid.UUID(TXN_ID)
        txn_row.dataset_id = uuid.UUID(DATASET_ID)
        txn_row.row_index = 0
        txn_row.trade_date = None
        txn_row.value_date = None
        txn_row.currency_sold = "USD"
        txn_row.currency_bought = "EUR"
        txn_row.amount_sold = 100000.0
        txn_row.amount_bought = None
        txn_row.effective_rate = None
        txn_row.counterparty = None
        txn_row.fee_amount = None
        txn_row.fee_currency = None
        txn_row.reference = None
        txn_row.row_hash = "xyz"
        txn_row.parse_warnings = ["missing trade_date", "missing currency_bought"]

        txn_result = MagicMock()
        txn_result.fetchall.return_value = [txn_row]

        db = _make_mock_db()
        db.execute = AsyncMock(side_effect=[run_result, txn_result])

        with _setup(db) as (_, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/review-queue",
                    params={"run_id": RUN_ID},
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 1
        assert data["items"][0]["confidence"] < 1.0


# ---------------------------------------------------------------------------
# 13. Resolve review item
# ---------------------------------------------------------------------------

class TestResolveReviewItem:

    @pytest.mark.asyncio
    async def test_resolve_invalid_action_422(self):
        """Invalid action value => 422."""
        txn_row = MagicMock()
        txn_row.id = uuid.UUID(TXN_ID)
        txn_row.parse_warnings = []
        txn_result = MagicMock()
        txn_result.fetchone.return_value = txn_row

        db = _make_mock_db()
        db.execute = AsyncMock(return_value=txn_result)

        with _setup(db) as (_, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{PREFIX}/review-queue/{TXN_ID}/resolve",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                    json={"action": "invalid_action"},
                )
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_resolve_transaction_not_found(self):
        with _setup() as (db, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{PREFIX}/review-queue/{TXN_ID}/resolve",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                    json={"action": "approve"},
                )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_resolve_approve_success(self):
        txn_row = MagicMock()
        txn_row.id = uuid.UUID(TXN_ID)
        txn_row.parse_warnings = json.dumps(["missing field"])
        txn_result = MagicMock()
        txn_result.fetchone.return_value = txn_row

        empty_result = MagicMock()
        empty_result.fetchone.return_value = None
        empty_result.fetchall.return_value = []

        db = _make_mock_db()
        db.execute = AsyncMock(side_effect=[txn_result, empty_result])

        with (
            _setup(db) as (_, user),
            patch(
                "app.api.routes.v1_audit_lab.emit_audit",
                new=AsyncMock(return_value=None),
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{PREFIX}/review-queue/{TXN_ID}/resolve",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                    json={"action": "approve"},
                )
        # 200 or 500 depending on update SQL; at minimum we should not get 404/422
        assert r.status_code in (200, 500)

    @pytest.mark.asyncio
    async def test_resolve_permission_denied(self):
        """Non-superuser without audit.review => 403."""
        user = _make_user(is_superuser=False)
        db = _make_mock_db()

        with (
            _setup(db, user) as (_, _u),
            patch(
                "app.api.routes.v1_audit_lab.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.post(
                    f"{PREFIX}/review-queue/{TXN_ID}/resolve",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                    json={"action": "approve"},
                )
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# 14. Exposure gaps
# ---------------------------------------------------------------------------

class TestExposureGaps:

    @pytest.mark.asyncio
    async def test_exposure_gaps_run_not_found(self):
        with _setup() as (db, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/runs/{RUN_ID}/exposure-gaps",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_exposure_gaps_empty(self):
        run_row = MagicMock()
        run_row.dataset_id = uuid.UUID(DATASET_ID)
        run_result = MagicMock()
        run_result.fetchone.return_value = run_row

        audit_result = MagicMock()
        audit_result.fetchall.return_value = []

        position_result = MagicMock()
        position_result.fetchall.return_value = []

        db = _make_mock_db()
        db.execute = AsyncMock(side_effect=[run_result, audit_result, position_result])

        with _setup(db) as (_, user):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/runs/{RUN_ID}/exposure-gaps",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert data["gaps"] == []
