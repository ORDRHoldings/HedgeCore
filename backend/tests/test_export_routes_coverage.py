"""
tests/test_export_routes_coverage.py

Coverage tests for app/api/routes/v1_export.py

Endpoints covered:
  GET /api/v1/export/pdf/{run_id}
  GET /api/v1/export/excel/{run_id}
  GET /api/v1/export/zip/{run_id}
  GET /api/v1/export/committee-pack/{run_id}
  GET /api/v1/export/pdf-section/{run_id}
  GET /api/v1/export/xlsx/{run_id}

DI pattern: app.dependency_overrides for get_async_session + get_current_user
"""

from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite://")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-ci-at-least-32-chars-long")

import contextlib
import uuid
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.db import get_async_session
from app.core.security import get_current_user, create_access_token

BASE_URL = "http://test"
PREFIX = "/api/v1/export"

USER_ID = "11111111-1111-1111-1111-111111111111"
COMPANY_ID = "22222222-2222-2222-2222-222222222222"
BRANCH_ID = "33333333-3333-3333-3333-333333333333"
RUN_ID = "44444444-4444-4444-4444-444444444444"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_token(user_id: str = USER_ID) -> str:
    return create_access_token(sub=user_id, email="export@test.com")


def _make_user(is_superuser: bool = True) -> MagicMock:
    user = MagicMock()
    user.id = uuid.UUID(USER_ID)
    user.is_active = True
    user.is_superuser = is_superuser
    user.company_id = uuid.UUID(COMPANY_ID)
    user.branch_id = uuid.UUID(BRANCH_ID)
    user.email = "export@test.com"
    return user


def _make_mock_db() -> AsyncMock:
    empty_result = MagicMock()
    empty_result.fetchone.return_value = None
    empty_result.fetchall.return_value = []
    empty_result.scalar.return_value = None
    empty_result.scalars.return_value.first.return_value = None

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


def _make_run_row(
    run_id: str = RUN_ID,
    company_id: str = COMPANY_ID,
) -> MagicMock:
    """Build a mock CalculationRun ORM row."""
    row = MagicMock()
    row.id = run_id
    row.company_id = uuid.UUID(company_id)
    row.created_at = datetime(2024, 1, 15, 12, 0, 0)
    row.trade_count = 5
    row.hedge_count = 3
    row.inputs_hash = "inp_hash"
    row.outputs_hash = "out_hash"
    row.run_hash = "run_hash"
    row.policy_hash = "pol_hash"
    row.policy_revision_id = None
    row.position_ids = []
    row.run_envelope = {
        "engine_version": "1.0.0",
        "run_id": run_id,
        "inputs_hash": "inp_hash",
        "outputs_hash": "out_hash",
        "run_hash": "run_hash",
        "outputs": {},
    }
    row.trace_lite = {}
    return row


# ---------------------------------------------------------------------------
# 1. Auth failures — 401 when no token
# ---------------------------------------------------------------------------

class TestExportAuthFailures:

    @pytest.mark.asyncio
    async def test_pdf_no_auth(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
            r = await ac.get(f"{PREFIX}/pdf/{RUN_ID}")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_excel_no_auth(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
            r = await ac.get(f"{PREFIX}/excel/{RUN_ID}")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_zip_no_auth(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
            r = await ac.get(f"{PREFIX}/zip/{RUN_ID}")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_committee_pack_no_auth(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
            r = await ac.get(f"{PREFIX}/committee-pack/{RUN_ID}")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_pdf_section_no_auth(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
            r = await ac.get(f"{PREFIX}/pdf-section/{RUN_ID}")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_xlsx_no_auth(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
            r = await ac.get(f"{PREFIX}/xlsx/{RUN_ID}")
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# 2. PDF export
# ---------------------------------------------------------------------------

class TestPdfExport:

    @pytest.mark.asyncio
    async def test_pdf_run_not_in_db_and_not_in_cache(self):
        """Run not in DB and not in cache => 404."""
        with (
            _setup() as (db, user),
            patch("app.api.routes.v1_export.get_run", return_value=None),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/pdf/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_pdf_run_found_returns_pdf_bytes(self):
        """Run found in cache => returns PDF binary response."""
        fake_result = MagicMock()
        fake_result.run_id = RUN_ID

        with (
            _setup() as (db, user),
            patch("app.api.routes.v1_export.get_run", return_value=fake_result),
            patch(
                "app.api.routes.v1_export.render_bank_pack_pdf",
                return_value=b"%PDF-test-content",
            ),
            patch(
                "app.api.routes.v1_export._write_export_audit",
                new=AsyncMock(return_value=None),
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/pdf/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"
        assert b"%PDF" in r.content

    @pytest.mark.asyncio
    async def test_pdf_permission_denied(self):
        """Non-superuser without reports.export => 403.
        The run must exist in DB (tenant check passes) before permission check fires."""
        user = _make_user(is_superuser=False)
        run_row = _make_run_row()

        db = _make_mock_db()
        # Tenant check: session.get(CalculationRun, run_id) — run belongs to user's company
        db.get = AsyncMock(return_value=run_row)

        with (
            _setup(db, user) as (_, _u),
            patch(
                "app.api.routes.v1_export.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/pdf/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_pdf_cross_tenant_returns_404(self):
        """Run belongs to different company => 404 (tenant isolation)."""
        other_company = "99999999-9999-9999-9999-999999999999"
        run_row = _make_run_row(company_id=other_company)

        user = _make_user(is_superuser=False)  # non-superuser sees tenant isolation
        db = _make_mock_db()
        db.get = AsyncMock(return_value=run_row)

        with (
            _setup(db, user) as (_, _u),
            patch(
                "app.api.routes.v1_export.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["reports.export"]),
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/pdf/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# 3. Excel export
# ---------------------------------------------------------------------------

class TestExcelExport:

    @pytest.mark.asyncio
    async def test_excel_run_not_found(self):
        with (
            _setup() as (db, user),
            patch("app.api.routes.v1_export.get_run", return_value=None),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/excel/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_excel_run_found_returns_xlsx(self):
        fake_result = MagicMock()
        fake_result.run_id = RUN_ID

        xlsx_magic = b"PK\x03\x04"  # ZIP/XLSX magic bytes

        with (
            _setup() as (db, user),
            patch("app.api.routes.v1_export.get_run", return_value=fake_result),
            patch(
                "app.api.routes.v1_export.render_bank_pack_xlsx",
                return_value=xlsx_magic,
            ),
            patch(
                "app.api.routes.v1_export._write_export_audit",
                new=AsyncMock(return_value=None),
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/excel/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        assert "spreadsheetml" in r.headers["content-type"]

    @pytest.mark.asyncio
    async def test_excel_permission_denied(self):
        user = _make_user(is_superuser=False)
        run_row = _make_run_row()

        db = _make_mock_db()
        db.get = AsyncMock(return_value=run_row)

        with (
            _setup(db, user) as (_, _u),
            patch(
                "app.api.routes.v1_export.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/excel/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# 4. ZIP export
# ---------------------------------------------------------------------------

class TestZipExport:

    @pytest.mark.asyncio
    async def test_zip_run_not_found(self):
        with (
            _setup() as (db, user),
            patch("app.api.routes.v1_export.get_run", return_value=None),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/zip/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_zip_run_found_returns_zip(self):
        fake_result = MagicMock()
        fake_result.run_id = RUN_ID

        zip_magic = b"PK\x03\x04"

        with (
            _setup() as (db, user),
            patch("app.api.routes.v1_export.get_run", return_value=fake_result),
            patch(
                "app.api.routes.v1_export.build_audit_zip",
                return_value=zip_magic,
            ),
            patch(
                "app.api.routes.v1_export._write_export_audit",
                new=AsyncMock(return_value=None),
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/zip/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/zip"

    @pytest.mark.asyncio
    async def test_zip_permission_denied(self):
        user = _make_user(is_superuser=False)
        run_row = _make_run_row()

        db = _make_mock_db()
        db.get = AsyncMock(return_value=run_row)

        with (
            _setup(db, user) as (_, _u),
            patch(
                "app.api.routes.v1_export.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/zip/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# 5. Committee pack
# ---------------------------------------------------------------------------

class TestCommitteePack:

    @pytest.mark.asyncio
    async def test_committee_pack_run_not_found_in_db_or_cache(self):
        """Run not in DB or cache => 404."""
        with (
            _setup() as (db, user),
            patch("app.api.routes.v1_export.get_run", return_value=None),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/committee-pack/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_committee_pack_from_db(self):
        """Run found in DB => returns full committee pack JSON."""
        run_row = _make_run_row()

        # session.execute returns run_row via scalars().first()
        exec_result = MagicMock()
        exec_result.scalars.return_value.first.return_value = run_row

        # audit write: select prev_hash + insert
        audit_result = MagicMock()
        audit_result.scalars.return_value.first.return_value = None  # no prev event

        db = _make_mock_db()
        db.execute = AsyncMock(side_effect=[exec_result, audit_result, audit_result])
        db.add = MagicMock()

        with (
            _setup(db) as (_, user),
            patch(
                "app.api.routes.v1_export._write_export_audit",
                new=AsyncMock(return_value=None),
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/committee-pack/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert "meta" in data
        assert "run_envelope" in data
        assert "trace_lite" in data
        assert "hedge_plan" in data
        assert "regulatory" in data

    @pytest.mark.asyncio
    async def test_committee_pack_from_cache_fallback(self):
        """Run not in DB but in cache => pack_from_cache is returned."""
        from unittest.mock import MagicMock

        # DB returns no row
        exec_result = MagicMock()
        exec_result.scalars.return_value.first.return_value = None

        db = _make_mock_db()
        db.execute = AsyncMock(return_value=exec_result)

        # Build a minimal cached result
        cached = MagicMock()
        cached.run_id = RUN_ID

        env = MagicMock()
        env.engine_version = "1.0.0"
        env.timestamp = None
        env.inputs_hash = "inp"
        env.outputs_hash = "out"
        env.run_hash = "rh"
        env.trades_hash = None
        env.hedges_hash = None
        env.market_hash = None
        env.policy_hash = None
        env.run_id = RUN_ID
        cached.run_envelope = env

        tl = MagicMock()
        tl.run_id = RUN_ID
        tl.events = []
        cached.trace_lite = tl
        cached.trades = []
        cached.scenarios = []

        hp = MagicMock()
        hp.buckets = []
        hp.model_dump = MagicMock(return_value={"buckets": [], "summary": {}})
        cached.hedge_plan = hp

        with (
            _setup(db) as (_, user),
            patch("app.api.routes.v1_export.get_run", return_value=cached),
            patch(
                "app.api.routes.v1_export._write_export_audit",
                new=AsyncMock(return_value=None),
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/committee-pack/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert data["meta"]["run_id"] == RUN_ID

    @pytest.mark.asyncio
    async def test_committee_pack_permission_denied(self):
        """Non-superuser without reports.export => 403. Run must be in same company."""
        user = _make_user(is_superuser=False)
        run_row = _make_run_row()

        db = _make_mock_db()
        db.get = AsyncMock(return_value=run_row)

        with (
            _setup(db, user) as (_, _u),
            patch(
                "app.api.routes.v1_export.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/committee-pack/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_committee_pack_with_policy_revision(self):
        """Run with policy_revision_id => fetches and embeds revision data."""
        from unittest.mock import MagicMock

        policy_revision_id = uuid.uuid4()

        run_row = _make_run_row()
        run_row.policy_revision_id = policy_revision_id

        exec_result = MagicMock()
        exec_result.scalars.return_value.first.return_value = run_row

        # Mock policy revision row
        rev_row = MagicMock()
        rev_row.id = policy_revision_id
        rev_row.policy_instance_id = uuid.uuid4()
        rev_row.template_id = uuid.uuid4()
        rev_row.company_id = uuid.UUID(COMPANY_ID)
        rev_row.branch_id = None
        rev_row.revision = 1
        rev_row.policy_hash = "pol_hash"
        rev_row.canonical_policy = {"key": "val"}
        rev_row.created_by = uuid.UUID(USER_ID)
        rev_row.created_by_email = "export@test.com"
        rev_row.change_reason = "Initial"
        rev_row.prev_revision_id = None
        rev_row.created_at = datetime(2024, 1, 10)

        rev_result = MagicMock()
        rev_result.scalars.return_value.first.return_value = rev_row

        db = _make_mock_db()
        db.execute = AsyncMock(side_effect=[exec_result, rev_result])

        with (
            _setup(db) as (_, user),
            patch(
                "app.api.routes.v1_export._write_export_audit",
                new=AsyncMock(return_value=None),
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/committee-pack/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        data = r.json()
        assert data["policy_revision"] is not None
        assert data["policy_revision"]["revision"] == 1

    @pytest.mark.asyncio
    async def test_committee_pack_superuser_bypasses_tenant_check(self):
        """Superuser can access any run regardless of company_id."""
        other_company = "99999999-9999-9999-9999-999999999999"
        run_row = _make_run_row(company_id=other_company)

        exec_result = MagicMock()
        exec_result.scalars.return_value.first.return_value = run_row

        db = _make_mock_db()
        db.execute = AsyncMock(return_value=exec_result)

        with (
            _setup(db) as (_, user),  # user is is_superuser=True by default
            patch(
                "app.api.routes.v1_export._write_export_audit",
                new=AsyncMock(return_value=None),
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/committee-pack/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# 6. PDF section export (RPT-08)
# ---------------------------------------------------------------------------

class TestPdfSectionExport:
    """pdf-section uses rbac_service.require_permission which is patched with create=True."""

    @pytest.mark.asyncio
    async def test_pdf_section_run_not_found(self):
        """Run not in DB => 404."""
        with (
            _setup() as (db, user),
            patch(
                "app.api.routes.v1_export.rbac_service.require_permission",
                new=AsyncMock(return_value=None),
                create=True,
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/pdf-section/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_pdf_section_found_returns_pdf(self):
        """Run found => returns PDF bytes for requested section."""
        run_row = _make_run_row()

        db = _make_mock_db()
        db.get = AsyncMock(return_value=run_row)

        with (
            _setup(db) as (_, user),
            patch(
                "app.api.routes.v1_export.rbac_service.require_permission",
                new=AsyncMock(return_value=None),
                create=True,
            ),
            patch(
                "app.api.routes.v1_export.render_bank_pack_pdf",
                return_value=b"%PDF-section",
            ),
            patch(
                "app.api.routes.v1_export._write_export_audit",
                new=AsyncMock(return_value=None),
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/pdf-section/{RUN_ID}",
                    params={"section": "coverage"},
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"

    @pytest.mark.asyncio
    async def test_pdf_section_cross_tenant_not_found(self):
        """Run from another company => 404 for non-superuser."""
        other_company = "99999999-9999-9999-9999-999999999999"
        run_row = _make_run_row(company_id=other_company)

        user = _make_user(is_superuser=False)
        db = _make_mock_db()
        db.get = AsyncMock(return_value=run_row)

        with (
            _setup(db, user) as (_, _u),
            patch(
                "app.api.routes.v1_export.rbac_service.require_permission",
                new=AsyncMock(return_value=None),
                create=True,
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/pdf-section/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_pdf_section_render_error_returns_500(self):
        """PDF builder raises => 500."""
        run_row = _make_run_row()

        db = _make_mock_db()
        db.get = AsyncMock(return_value=run_row)

        with (
            _setup(db) as (_, user),
            patch(
                "app.api.routes.v1_export.rbac_service.require_permission",
                new=AsyncMock(return_value=None),
                create=True,
            ),
            patch(
                "app.api.routes.v1_export.render_bank_pack_pdf",
                side_effect=RuntimeError("builder failed"),
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/pdf-section/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 500


# ---------------------------------------------------------------------------
# 7. XLSX export (RPT-10)
# ---------------------------------------------------------------------------

class TestXlsxExport:

    @pytest.mark.asyncio
    async def test_xlsx_run_not_found(self):
        with (
            _setup() as (db, user),
            patch(
                "app.api.routes.v1_export.rbac_service.require_permission",
                new=AsyncMock(return_value=None),
                create=True,
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/xlsx/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_xlsx_found_returns_xlsx(self):
        run_row = _make_run_row()

        db = _make_mock_db()
        db.get = AsyncMock(return_value=run_row)

        with (
            _setup(db) as (_, user),
            patch(
                "app.api.routes.v1_export.rbac_service.require_permission",
                new=AsyncMock(return_value=None),
                create=True,
            ),
            patch(
                "app.api.routes.v1_export.render_bank_pack_xlsx",
                return_value=b"PK\x03\x04",
            ),
            patch(
                "app.api.routes.v1_export._write_export_audit",
                new=AsyncMock(return_value=None),
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/xlsx/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 200
        assert "spreadsheetml" in r.headers["content-type"]

    @pytest.mark.asyncio
    async def test_xlsx_cross_tenant_not_found(self):
        other_company = "99999999-9999-9999-9999-999999999999"
        run_row = _make_run_row(company_id=other_company)

        user = _make_user(is_superuser=False)
        db = _make_mock_db()
        db.get = AsyncMock(return_value=run_row)

        with (
            _setup(db, user) as (_, _u),
            patch(
                "app.api.routes.v1_export.rbac_service.require_permission",
                new=AsyncMock(return_value=None),
                create=True,
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/xlsx/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_xlsx_render_error_returns_500(self):
        run_row = _make_run_row()

        db = _make_mock_db()
        db.get = AsyncMock(return_value=run_row)

        with (
            _setup(db) as (_, user),
            patch(
                "app.api.routes.v1_export.rbac_service.require_permission",
                new=AsyncMock(return_value=None),
                create=True,
            ),
            patch(
                "app.api.routes.v1_export.render_bank_pack_xlsx",
                side_effect=RuntimeError("xlsx failed"),
            ),
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url=BASE_URL) as ac:
                r = await ac.get(
                    f"{PREFIX}/xlsx/{RUN_ID}",
                    headers={"Authorization": f"Bearer {_make_token()}"},
                )
        assert r.status_code == 500


# ---------------------------------------------------------------------------
# 8. _write_export_audit helper (indirectly tested via endpoints above,
#    but we exercise it directly with a mock session to ensure coverage)
# ---------------------------------------------------------------------------

class TestWriteExportAuditHelper:

    @pytest.mark.asyncio
    async def test_write_export_audit_handles_exception(self):
        """If audit write fails, the helper swallows the exception (non-fatal)."""
        from app.api.routes.v1_export import _write_export_audit

        db = _make_mock_db()
        db.execute = AsyncMock(side_effect=RuntimeError("audit DB down"))

        user = _make_user()

        # Should not raise
        await _write_export_audit(db, user, RUN_ID, "PDF")

    @pytest.mark.asyncio
    async def test_write_export_audit_happy_path(self):
        """Audit helper writes and commits without error."""
        from app.api.routes.v1_export import _write_export_audit

        no_prev = MagicMock()
        no_prev.scalars.return_value.first.return_value = None

        db = _make_mock_db()
        db.execute = AsyncMock(side_effect=[
            no_prev,  # prev hash query (AuditEvent.event_hash select)
            no_prev,  # get_user_roles query
        ])

        user = _make_user()

        with patch(
            "app.api.routes.v1_export.rbac_service.get_user_roles",
            new=AsyncMock(return_value=[]),
            create=True,
        ):
            await _write_export_audit(db, user, RUN_ID, "EXCEL")

        db.add.assert_called_once()
        db.commit.assert_called_once()
