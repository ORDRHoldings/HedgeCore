"""
tests/test_hedge_effectiveness_coverage.py

Coverage tests for app/api/routes/v1_hedge_effectiveness.py

Endpoints covered:
  POST /api/v1/hedge-effectiveness/datasets           -- create dataset JSON
  POST /api/v1/hedge-effectiveness/datasets/upload    -- CSV upload
  GET  /api/v1/hedge-effectiveness/datasets           -- list datasets
  POST /api/v1/hedge-effectiveness/assess             -- run assessment
  GET  /api/v1/hedge-effectiveness/runs               -- list runs
  GET  /api/v1/hedge-effectiveness/runs/{run_id}      -- get run detail
  GET  /api/v1/hedge-effectiveness/runs/{run_id}/export -- evidence binder
"""

from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite://")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-ci-at-least-32-chars-long")

import contextlib
import json
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.db import get_async_session
from app.core.security import create_access_token, get_current_user
from app.main import app

BASE = "http://test"
HE = "/api/v1/hedge-effectiveness"

USER_ID = "11111111-2222-3333-4444-555555555555"
COMPANY_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
BRANCH_ID = "ffffffff-aaaa-bbbb-cccc-dddddddddddd"
DATASET_ID = "10000000-0000-0000-0000-000000000001"
RUN_ID = "20000000-0000-0000-0000-000000000002"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_token() -> str:
    return create_access_token(sub=USER_ID, email="he@test.com")


def _make_user(is_superuser: bool = True) -> MagicMock:
    user = MagicMock()
    user.id = uuid.UUID(USER_ID)
    user.email = "he@test.com"
    user.is_active = True
    user.is_superuser = is_superuser
    user.company_id = uuid.UUID(COMPANY_ID)
    user.branch_id = uuid.UUID(BRANCH_ID)
    return user


def _make_dataset() -> MagicMock:
    ds = MagicMock()
    ds.id = uuid.UUID(DATASET_ID)
    ds.company_id = uuid.UUID(COMPANY_ID)
    ds.name = "Test Dataset"
    ds.description = "Test"
    ds.currency_pair = "EURUSD"
    ds.hedge_type = "cash_flow"
    ds.designation_date = "2024-01-01"
    ds.source = "manual"
    ds.period_count = 4
    ds.source_hash = "abc123"
    ds.created_at = datetime.now(UTC)
    ds.data_json = [
        {"period_index": 0, "period_date": "2024-01", "hedged_item_fv_change": -100.0, "instrument_fv_change": 98.0},
        {"period_index": 1, "period_date": "2024-02", "hedged_item_fv_change": -200.0, "instrument_fv_change": 195.0},
        {"period_index": 2, "period_date": "2024-03", "hedged_item_fv_change": -150.0, "instrument_fv_change": 148.0},
        {"period_index": 3, "period_date": "2024-04", "hedged_item_fv_change": -120.0, "instrument_fv_change": 118.0},
    ]
    return ds


def _make_he_run() -> MagicMock:
    run = MagicMock()
    run.id = uuid.UUID(RUN_ID)
    run.company_id = uuid.UUID(COMPANY_ID)
    run.dataset_id = uuid.UUID(DATASET_ID)
    run.methodology_version = "1.0.0"
    run.standard = "ASC_815"
    run.method_requested = "both"
    run.dollar_offset_ratio = 0.975
    run.dollar_offset_effective = True
    run.regression_r_squared = 0.995
    run.regression_slope = -0.98
    run.regression_effective = True
    run.regression_method = "ols"
    run.overall_effective = True
    run.run_hash = "run_hash_abc"
    run.inputs_hash = "inp_hash_abc"
    run.outputs_hash = "out_hash_abc"
    run.status = "COMPLETED"
    run.created_at = datetime.now(UTC)
    run.report_json = {"summary": "effective"}
    run.trace_bundle = {"run_id": str(uuid.uuid4()), "events": []}
    return run


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
    async def test_create_dataset_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE) as ac:
            r = await ac.post(
                f"{HE}/datasets",
                json={
                    "name": "x",
                    "periods": [
                        {"hedged_item_fv_change": -100, "instrument_fv_change": 98},
                        {"hedged_item_fv_change": -200, "instrument_fv_change": 195},
                    ],
                },
            )
        # CSRF or auth middleware may return 401 or 403 without a token
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_list_datasets_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE) as ac:
            r = await ac.get(f"{HE}/datasets")
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_assess_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE) as ac:
            r = await ac.post(f"{HE}/assess", json={"dataset_id": DATASET_ID})
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_list_runs_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE) as ac:
            r = await ac.get(f"{HE}/runs")
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_get_run_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE) as ac:
            r = await ac.get(f"{HE}/runs/{RUN_ID}")
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_export_run_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE) as ac:
            r = await ac.get(f"{HE}/runs/{RUN_ID}/export")
        assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# POST /datasets (JSON)
# ---------------------------------------------------------------------------

class TestCreateDataset:
    def _make_db(self) -> AsyncMock:
        db = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()

        audit_result = MagicMock()
        audit_scalars = MagicMock()
        audit_scalars.first.return_value = None
        audit_result.scalars.return_value = audit_scalars

        db.execute = AsyncMock(return_value=audit_result)
        return db

    @pytest.mark.asyncio
    async def test_create_dataset_success(self):
        user = _make_user(is_superuser=True)
        db = self._make_db()

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.post(
                    f"{HE}/datasets",
                    json={
                        "name": "EURUSD Hedge Test",
                        "currency_pair": "EURUSD",
                        "hedge_type": "cash_flow",
                        "designation_date": "2024-01-01",
                        "periods": [
                            {"period_date": "2024-01", "hedged_item_fv_change": -100.0, "instrument_fv_change": 98.0},
                            {"period_date": "2024-02", "hedged_item_fv_change": -200.0, "instrument_fv_change": 195.0},
                        ],
                    },
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "EURUSD Hedge Test"
        assert data["period_count"] == 2
        assert "dataset_id" in data
        assert "source_hash" in data

    @pytest.mark.asyncio
    async def test_create_dataset_too_few_periods(self):
        user = _make_user(is_superuser=True)
        db = AsyncMock()

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.post(
                    f"{HE}/datasets",
                    json={
                        "name": "Bad",
                        "periods": [
                            {"hedged_item_fv_change": -100.0, "instrument_fv_change": 98.0},
                        ],
                    },
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_create_dataset_missing_name(self):
        user = _make_user(is_superuser=True)
        db = AsyncMock()

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.post(
                    f"{HE}/datasets",
                    json={
                        "periods": [
                            {"hedged_item_fv_change": -100.0, "instrument_fv_change": 98.0},
                            {"hedged_item_fv_change": -200.0, "instrument_fv_change": 195.0},
                        ],
                    },
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_create_dataset_with_audit_emit(self):
        """Verify the emit_audit path works with a populated audit result."""
        user = _make_user(is_superuser=True)
        db = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()

        prev_hash_result = MagicMock()
        prev_hash_scalars = MagicMock()
        prev_hash_scalars.first.return_value = "prev_hash_value"
        prev_hash_result.scalars.return_value = prev_hash_scalars

        db.execute = AsyncMock(return_value=prev_hash_result)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.post(
                    f"{HE}/datasets",
                    json={
                        "name": "Dataset With Audit",
                        "periods": [
                            {"hedged_item_fv_change": -100.0, "instrument_fv_change": 98.0},
                            {"hedged_item_fv_change": -200.0, "instrument_fv_change": 195.0},
                            {"hedged_item_fv_change": -150.0, "instrument_fv_change": 148.0},
                        ],
                    },
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# POST /datasets/upload (CSV)
# ---------------------------------------------------------------------------

class TestUploadDataset:
    _VALID_CSV = (
        "period_date,hedged_item_fv_change,instrument_fv_change\n"
        "2024-01,-100.0,98.0\n"
        "2024-02,-200.0,195.0\n"
        "2024-03,-150.0,148.0\n"
    ).encode("utf-8")

    def _make_db(self) -> AsyncMock:
        db = AsyncMock()
        db.add = MagicMock()
        db.commit = AsyncMock()

        audit_result = MagicMock()
        audit_scalars = MagicMock()
        audit_scalars.first.return_value = None
        audit_result.scalars.return_value = audit_scalars

        db.execute = AsyncMock(return_value=audit_result)
        return db

    @pytest.mark.asyncio
    async def test_upload_csv_success(self):
        user = _make_user(is_superuser=True)
        db = self._make_db()

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.post(
                    f"{HE}/datasets/upload",
                    files={"file": ("test.csv", self._VALID_CSV, "text/csv")},
                    data={"name": "Uploaded Dataset", "currency_pair": "EURUSD"},
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert data["period_count"] == 3
        assert "dataset_id" in data
        assert "source_hash" in data

    @pytest.mark.asyncio
    async def test_upload_csv_empty_file(self):
        user = _make_user(is_superuser=True)
        db = AsyncMock()

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.post(
                    f"{HE}/datasets/upload",
                    files={"file": ("empty.csv", b"", "text/csv")},
                    data={"name": "Empty"},
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_upload_csv_missing_columns(self):
        """CSV with missing required columns should return 422."""
        user = _make_user(is_superuser=True)
        db = AsyncMock()
        bad_csv = b"date,value\n2024-01,100\n2024-02,200\n"

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.post(
                    f"{HE}/datasets/upload",
                    files={"file": ("bad.csv", bad_csv, "text/csv")},
                    data={"name": "Bad"},
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_upload_csv_too_few_valid_rows(self):
        """CSV with only 1 valid row should return 422."""
        user = _make_user(is_superuser=True)
        db = AsyncMock()
        csv = b"hedged_item_fv_change,instrument_fv_change\n-100,98\n"

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.post(
                    f"{HE}/datasets/upload",
                    files={"file": ("one_row.csv", csv, "text/csv")},
                    data={"name": "One Row"},
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_upload_csv_with_parse_warnings(self):
        """CSV with some bad rows produces parse_warnings in response."""
        user = _make_user(is_superuser=True)
        db = self._make_db()

        csv_with_gaps = (
            "hedged_item_fv_change,instrument_fv_change\n"
            "-100,98\n"
            ",-200\n"        # missing hedged => skipped with warning
            "-150,148\n"
            "bad,row\n"     # non-numeric => skipped with warning
            "-120,118\n"
        ).encode("utf-8")

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.post(
                    f"{HE}/datasets/upload",
                    files={"file": ("partial.csv", csv_with_gaps, "text/csv")},
                    data={"name": "Partial"},
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert data["period_count"] >= 2
        # parse_warnings may be empty or contain warnings
        assert "parse_warnings" in data

    @pytest.mark.asyncio
    async def test_upload_csv_alternate_column_names(self):
        """CSV with alternate column names (hedged_fv / instrument_fv) is accepted."""
        user = _make_user(is_superuser=True)
        db = self._make_db()

        alt_csv = (
            "date,hedged_fv,instrument_fv\n"
            "2024-01,-100,98\n"
            "2024-02,-200,195\n"
        ).encode("utf-8")

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.post(
                    f"{HE}/datasets/upload",
                    files={"file": ("alt.csv", alt_csv, "text/csv")},
                    data={"name": "Alt Columns"},
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# GET /datasets
# ---------------------------------------------------------------------------

class TestListDatasets:
    @pytest.mark.asyncio
    async def test_list_datasets_success(self):
        user = _make_user(is_superuser=True)
        ds = _make_dataset()

        list_result = MagicMock()
        list_scalars = MagicMock()
        list_scalars.all.return_value = [ds]
        list_result.scalars.return_value = list_scalars

        db = AsyncMock()
        db.execute = AsyncMock(return_value=list_result)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{HE}/datasets",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert data["total"] == 1
        assert data["items"][0]["name"] == "Test Dataset"

    @pytest.mark.asyncio
    async def test_list_datasets_empty(self):
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
                    f"{HE}/datasets",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        assert r.json() == {"items": [], "total": 0}

    @pytest.mark.asyncio
    async def test_list_datasets_with_limit(self):
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
                    f"{HE}/datasets?limit=10",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# POST /assess
# ---------------------------------------------------------------------------

class TestRunAssessment:
    def _make_eff_result(self) -> MagicMock:
        """Build a mock EffectivenessResult."""
        dollar_offset = MagicMock()
        dollar_offset.dollar_offset_ratio = 0.975
        dollar_offset.is_effective = True
        dollar_offset.to_dict.return_value = {"dollar_offset_ratio": 0.975, "is_effective": True}

        regression = MagicMock()
        regression.regression_r_squared = 0.995
        regression.regression_slope = -0.98
        regression.is_effective = True
        regression.method = "ols"
        regression.to_dict.return_value = {"r_squared": 0.995, "is_effective": True}

        trace_event = MagicMock()
        trace_event.to_dict.return_value = {"step": "dollar_offset"}

        eff = MagicMock()
        eff.dollar_offset = dollar_offset
        eff.regression = regression
        eff.overall_effective = True
        eff.standard = "ASC_815"
        eff.methodology_version = "1.0.0"
        eff.run_hash = "run_hash_xyz"
        eff.inputs_hash = "inp_xyz"
        eff.outputs_hash = "out_xyz"
        eff.determination_narrative = "Hedge is highly effective."
        eff.compliance_notes = ["Note 1"]
        eff.trace_events = [trace_event]
        eff.to_dict.return_value = {"overall_effective": True}
        return eff

    def _make_assess_db(self, dataset: MagicMock) -> AsyncMock:
        db = AsyncMock()

        ds_result = MagicMock()
        ds_result.scalar_one_or_none.return_value = dataset

        audit_result = MagicMock()
        audit_scalars = MagicMock()
        audit_scalars.first.return_value = None
        audit_result.scalars.return_value = audit_scalars

        db.execute = AsyncMock(side_effect=[ds_result, audit_result])
        db.add = MagicMock()
        db.commit = AsyncMock()
        return db

    @pytest.mark.asyncio
    async def test_assess_success(self):
        user = _make_user(is_superuser=True)
        ds = _make_dataset()
        db = self._make_assess_db(ds)
        eff_result = self._make_eff_result()

        with (
            patch("app.api.routes.v1_hedge_effectiveness.run_hedge_effectiveness", return_value=eff_result),
            _with_overrides(user, db),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.post(
                    f"{HE}/assess",
                    json={"dataset_id": DATASET_ID, "standard": "ASC_815", "method": "both"},
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert data["overall_effective"] is True
        assert data["standard"] == "ASC_815"
        assert "run_id" in data

    @pytest.mark.asyncio
    async def test_assess_dataset_not_found(self):
        user = _make_user(is_superuser=True)

        db = AsyncMock()
        not_found_result = MagicMock()
        not_found_result.scalar_one_or_none.return_value = None
        db.execute = AsyncMock(return_value=not_found_result)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.post(
                    f"{HE}/assess",
                    json={"dataset_id": DATASET_ID},
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_assess_with_ifrs9_standard(self):
        user = _make_user(is_superuser=True)
        ds = _make_dataset()
        db = self._make_assess_db(ds)
        eff_result = self._make_eff_result()
        eff_result.standard = "IFRS_9"

        with (
            patch("app.api.routes.v1_hedge_effectiveness.run_hedge_effectiveness", return_value=eff_result),
            _with_overrides(user, db),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.post(
                    f"{HE}/assess",
                    json={"dataset_id": DATASET_ID, "standard": "IFRS_9", "method": "dollar_offset"},
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_assess_ineffective_result(self):
        """Handles ineffective hedge result without dollar offset ratio."""
        user = _make_user(is_superuser=True)
        ds = _make_dataset()
        db = self._make_assess_db(ds)

        # Build ineffective result without dollar offset
        eff_result = MagicMock()
        eff_result.dollar_offset = None
        eff_result.regression = None
        eff_result.overall_effective = False
        eff_result.standard = "ASC_815"
        eff_result.methodology_version = "1.0.0"
        eff_result.run_hash = "fail_hash"
        eff_result.inputs_hash = "fail_inp"
        eff_result.outputs_hash = "fail_out"
        eff_result.determination_narrative = "Ineffective"
        eff_result.compliance_notes = []
        eff_result.trace_events = []
        eff_result.to_dict.return_value = {"overall_effective": False}

        with (
            patch("app.api.routes.v1_hedge_effectiveness.run_hedge_effectiveness", return_value=eff_result),
            _with_overrides(user, db),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.post(
                    f"{HE}/assess",
                    json={"dataset_id": DATASET_ID},
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        assert r.json()["overall_effective"] is False

    @pytest.mark.asyncio
    async def test_assess_data_json_as_string(self):
        """Handles dataset.data_json stored as JSON string instead of list."""
        user = _make_user(is_superuser=True)
        ds = _make_dataset()
        # Store as string instead of list
        ds.data_json = json.dumps(ds.data_json)

        db = self._make_assess_db(ds)
        eff_result = self._make_eff_result()

        with (
            patch("app.api.routes.v1_hedge_effectiveness.run_hedge_effectiveness", return_value=eff_result),
            _with_overrides(user, db),
        ):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.post(
                    f"{HE}/assess",
                    json={"dataset_id": DATASET_ID},
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# GET /runs
# ---------------------------------------------------------------------------

class TestListRuns:
    @pytest.mark.asyncio
    async def test_list_runs_success(self):
        user = _make_user(is_superuser=True)
        run = _make_he_run()
        ds = _make_dataset()

        list_result = MagicMock()
        list_result.all.return_value = [(run, ds.name, ds.currency_pair)]

        db = AsyncMock()
        db.execute = AsyncMock(return_value=list_result)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{HE}/runs",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["overall_effective"] is True
        assert data[0]["dataset_name"] == "Test Dataset"

    @pytest.mark.asyncio
    async def test_list_runs_empty(self):
        user = _make_user(is_superuser=True)

        empty_result = MagicMock()
        empty_result.all.return_value = []

        db = AsyncMock()
        db.execute = AsyncMock(return_value=empty_result)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{HE}/runs",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        assert r.json() == []

    @pytest.mark.asyncio
    async def test_list_runs_with_null_numeric_fields(self):
        """Handles runs where dollar_offset_ratio and regression fields are None."""
        user = _make_user(is_superuser=True)
        run = _make_he_run()
        run.dollar_offset_ratio = None
        run.regression_r_squared = None
        run.regression_slope = None
        ds = _make_dataset()

        list_result = MagicMock()
        list_result.all.return_value = [(run, ds.name, ds.currency_pair)]

        db = AsyncMock()
        db.execute = AsyncMock(return_value=list_result)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{HE}/runs",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        item = r.json()[0]
        assert item["dollar_offset_ratio"] is None
        assert item["regression_r_squared"] is None


# ---------------------------------------------------------------------------
# GET /runs/{run_id}
# ---------------------------------------------------------------------------

class TestGetRun:
    @pytest.mark.asyncio
    async def test_get_run_success(self):
        user = _make_user(is_superuser=True)
        run = _make_he_run()
        ds = _make_dataset()

        row_result = MagicMock()
        row_result.one_or_none.return_value = (run, ds)

        db = AsyncMock()
        db.execute = AsyncMock(return_value=row_result)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{HE}/runs/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert data["run_id"] == RUN_ID
        assert data["overall_effective"] is True
        assert data["dataset_name"] == "Test Dataset"

    @pytest.mark.asyncio
    async def test_get_run_not_found(self):
        user = _make_user(is_superuser=True)

        row_result = MagicMock()
        row_result.one_or_none.return_value = None

        db = AsyncMock()
        db.execute = AsyncMock(return_value=row_result)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{HE}/runs/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_get_run_report_json_as_string(self):
        """Handles run.report_json stored as JSON string."""
        user = _make_user(is_superuser=True)
        run = _make_he_run()
        run.report_json = json.dumps({"overall_effective": True, "standard": "ASC_815"})
        ds = _make_dataset()

        row_result = MagicMock()
        row_result.one_or_none.return_value = (run, ds)

        db = AsyncMock()
        db.execute = AsyncMock(return_value=row_result)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{HE}/runs/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_get_run_with_null_numeric_fields(self):
        """Handles run where numeric fields are None."""
        user = _make_user(is_superuser=True)
        run = _make_he_run()
        run.dollar_offset_ratio = None
        run.regression_r_squared = None
        run.regression_slope = None
        ds = _make_dataset()

        row_result = MagicMock()
        row_result.one_or_none.return_value = (run, ds)

        db = AsyncMock()
        db.execute = AsyncMock(return_value=row_result)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{HE}/runs/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert data["dollar_offset_ratio"] is None
        assert data["regression_r_squared"] is None


# ---------------------------------------------------------------------------
# GET /runs/{run_id}/export
# ---------------------------------------------------------------------------

class TestExportRun:
    @pytest.mark.asyncio
    async def test_export_run_success(self):
        user = _make_user(is_superuser=True)
        run = _make_he_run()
        ds = _make_dataset()

        row_result = MagicMock()
        row_result.one_or_none.return_value = (run, ds)

        db = AsyncMock()
        db.execute = AsyncMock(return_value=row_result)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{HE}/runs/{RUN_ID}/export",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert data["run_id"] == RUN_ID
        assert data["manifest_version"] == "1.0.0"
        assert data["run_type"] == "hedge_effectiveness"
        assert "dataset" in data
        assert "results" in data

    @pytest.mark.asyncio
    async def test_export_run_not_found(self):
        user = _make_user(is_superuser=True)

        row_result = MagicMock()
        row_result.one_or_none.return_value = None

        db = AsyncMock()
        db.execute = AsyncMock(return_value=row_result)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{HE}/runs/{RUN_ID}/export",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_export_includes_dataset_metadata(self):
        user = _make_user(is_superuser=True)
        run = _make_he_run()
        ds = _make_dataset()

        row_result = MagicMock()
        row_result.one_or_none.return_value = (run, ds)

        db = AsyncMock()
        db.execute = AsyncMock(return_value=row_result)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{HE}/runs/{RUN_ID}/export",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        data = r.json()
        assert data["dataset"]["currency_pair"] == "EURUSD"
        assert data["dataset"]["hedge_type"] == "cash_flow"
        assert data["dataset"]["period_count"] == 4

    @pytest.mark.asyncio
    async def test_export_run_report_json_as_string(self):
        """Handles run.report_json stored as JSON string in export."""
        user = _make_user(is_superuser=True)
        run = _make_he_run()
        run.report_json = json.dumps({"summary": "effective"})
        ds = _make_dataset()

        row_result = MagicMock()
        row_result.one_or_none.return_value = (run, ds)

        db = AsyncMock()
        db.execute = AsyncMock(return_value=row_result)

        with _with_overrides(user, db):
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url=BASE) as ac:
                r = await ac.get(
                    f"{HE}/runs/{RUN_ID}/export",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        assert isinstance(r.json()["report"], dict)
