"""
tests/test_pipeline_routes_coverage.py

Coverage tests for app/api/routes/v1_pipeline.py

Endpoints covered:
  GET  /api/v1/pipeline/staging
  GET  /api/v1/pipeline/staging/{staging_id}
  POST /api/v1/pipeline/staging/{staging_id}/authorize
  GET  /api/v1/pipeline/ledger
  GET  /api/v1/pipeline/ledger/{ledger_id}
  POST /api/v1/pipeline/ledger/{ledger_id}/replay
  GET  /api/v1/pipeline/ledger/{ledger_id}/timeline
  GET  /api/v1/pipeline/ledger/{ledger_id}/export/{fmt}
  GET  /api/v1/pipeline/proposals
  GET  /api/v1/pipeline/proposals/{proposal_id}
  POST /api/v1/pipeline/proposals
  POST /api/v1/pipeline/proposals/{proposal_id}/submit
  POST /api/v1/pipeline/sandbox/calculate

Auth failure cases: 401 when no token.
Permission failure cases: 403 when permission missing.
"""

from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite://")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-ci-at-least-32-chars-long")

import contextlib
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.db import get_session, get_async_session
from app.core.security import create_access_token, get_current_user
from app.core.schema_state import require_schema_ready

BASE_URL = "http://test"
PIPE = "/api/v1/pipeline"

USER_ID = "aaaaaaaa-0000-0000-0000-000000000001"
COMPANY_ID = "bbbbbbbb-0000-0000-0000-000000000002"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_token(user_id: str = USER_ID) -> str:
    return create_access_token(sub=user_id, email="pipe@test.com")


def _make_user(
    user_id: str = USER_ID,
    is_superuser: bool = True,
    company_id: str | None = COMPANY_ID,
) -> MagicMock:
    user = MagicMock()
    user.id = UUID(user_id)
    user.is_active = True
    user.is_superuser = is_superuser
    user.company_id = UUID(company_id) if company_id else None
    return user


def _make_db() -> AsyncMock:
    """Minimal async session mock that returns empty results."""
    empty_result = MagicMock()
    empty_result.scalars.return_value.all.return_value = []
    empty_result.scalars.return_value.first.return_value = None
    empty_result.scalar.return_value = 0

    db = AsyncMock()
    db.execute = AsyncMock(return_value=empty_result)
    return db


def _session_override(mock_db: AsyncMock):
    async def _override():
        yield mock_db
    return _override


@contextlib.contextmanager
def _with_overrides(mock_user: MagicMock, mock_db: AsyncMock | None = None):
    """Override get_current_user + both session deps."""
    db = mock_db or _make_db()

    async def _get_user():
        return mock_user

    async def _schema_ok():
        return None

    app.dependency_overrides[get_current_user] = _get_user
    app.dependency_overrides[get_session] = _session_override(db)
    app.dependency_overrides[get_async_session] = _session_override(db)
    app.dependency_overrides[require_schema_ready] = _schema_ok
    try:
        yield db
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_async_session, None)
        app.dependency_overrides.pop(require_schema_ready, None)


def _auth_header(token: str | None = None) -> dict[str, str]:
    return {"Authorization": f"Bearer {token or _make_token()}"}


# ---------------------------------------------------------------------------
# Auth failure tests (401)
# ---------------------------------------------------------------------------

class TestPipelineAuthRequired:
    """All pipeline endpoints must return 401 when no auth token provided."""

    @pytest.mark.asyncio
    async def test_list_staging_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.get(f"{PIPE}/staging")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_get_staging_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.get(f"{PIPE}/staging/some-id")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_authorize_staging_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.post(f"{PIPE}/staging/some-id/authorize", json={"action": "APPROVE"})
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_list_ledger_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.get(f"{PIPE}/ledger")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_get_ledger_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.get(f"{PIPE}/ledger/some-id")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_replay_ledger_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.post(f"{PIPE}/ledger/some-id/replay")
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_list_proposals_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.get(f"{PIPE}/proposals")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_create_proposal_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.post(f"{PIPE}/proposals", json={"run_id": str(uuid4())})
        assert r.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_sandbox_calculate_no_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
            r = await ac.post(f"{PIPE}/sandbox/calculate", json={})
        assert r.status_code in (401, 403)


# ---------------------------------------------------------------------------
# GET /v1/pipeline/staging — list
# ---------------------------------------------------------------------------

class TestListStaging:

    @pytest.mark.asyncio
    async def test_list_staging_returns_200_and_pagination(self):
        user = _make_user()
        with _with_overrides(user) as db:
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.list_staging",
                new=AsyncMock(return_value=[]),
            ), patch(
                "app.api.routes.v1_pipeline.pipeline_db.count_staging",
                new=AsyncMock(return_value=0),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(f"{PIPE}/staging", headers=_auth_header())
        assert r.status_code == 200
        body = r.json()
        assert "artifacts" in body
        assert "total" in body
        assert isinstance(body["artifacts"], list)
        assert body["total"] == 0

    @pytest.mark.asyncio
    async def test_list_staging_with_status_filter(self):
        user = _make_user()
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.list_staging",
                new=AsyncMock(return_value=[]),
            ), patch(
                "app.api.routes.v1_pipeline.pipeline_db.count_staging",
                new=AsyncMock(return_value=0),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(
                        f"{PIPE}/staging",
                        params={"status": "PENDING", "limit": 10, "offset": 0},
                        headers=_auth_header(),
                    )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_list_staging_with_artifacts(self):
        user = _make_user()
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.list_staging",
                new=AsyncMock(return_value=[]),
            ), patch(
                "app.api.routes.v1_pipeline.pipeline_db.count_staging",
                new=AsyncMock(return_value=5),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(f"{PIPE}/staging", headers=_auth_header())
        assert r.status_code == 200
        assert r.json()["total"] == 5


# ---------------------------------------------------------------------------
# GET /v1/pipeline/staging/{staging_id} — detail
# ---------------------------------------------------------------------------

class TestGetStaging:

    @pytest.mark.asyncio
    async def test_get_staging_not_found_returns_404(self):
        user = _make_user()
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.get_staging",
                new=AsyncMock(return_value=None),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(
                        f"{PIPE}/staging/nonexistent-id",
                        headers=_auth_header(),
                    )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_get_staging_found_returns_200(self):
        user = _make_user()
        staging_id = str(uuid4())
        artifact = MagicMock()
        artifact.model_dump.return_value = {
            "staging_id": staging_id,
            "status": "PENDING",
        }
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.get_staging",
                new=AsyncMock(return_value=artifact),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(
                        f"{PIPE}/staging/{staging_id}",
                        headers=_auth_header(),
                    )
        assert r.status_code == 200
        assert r.json()["staging_id"] == staging_id


# ---------------------------------------------------------------------------
# POST /v1/pipeline/staging/{staging_id}/authorize
# ---------------------------------------------------------------------------

class TestAuthorizeStaged:

    @pytest.mark.asyncio
    async def test_approve_action_returns_200(self):
        user = _make_user()
        result = MagicMock()
        result.model_dump.return_value = {"staging_id": str(uuid4()), "status": "APPROVED"}
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["pipeline.approve"]),
            ), patch(
                "app.api.routes.v1_pipeline.rbac_service.get_roles_by_user",
                new=AsyncMock(return_value=["supervisor"]),
            ), patch(
                "app.api.routes.v1_pipeline.pipeline_service.authorize_staged",
                new=AsyncMock(return_value=result),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{PIPE}/staging/some-id/authorize",
                        json={"action": "APPROVE"},
                        headers=_auth_header(),
                    )
        assert r.status_code == 200
        assert r.json()["status"] == "APPROVED"

    @pytest.mark.asyncio
    async def test_reject_action_returns_200(self):
        user = _make_user()
        result = MagicMock()
        result.model_dump.return_value = {"staging_id": str(uuid4()), "status": "REJECTED"}
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["pipeline.reject"]),
            ), patch(
                "app.api.routes.v1_pipeline.rbac_service.get_roles_by_user",
                new=AsyncMock(return_value=["supervisor"]),
            ), patch(
                "app.api.routes.v1_pipeline.pipeline_service.authorize_staged",
                new=AsyncMock(return_value=result),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{PIPE}/staging/some-id/authorize",
                        json={"action": "REJECT", "reason": "Bad data"},
                        headers=_auth_header(),
                    )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_authorize_non_superuser_missing_approve_permission_returns_403(self):
        user = _make_user(is_superuser=False)
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{PIPE}/staging/some-id/authorize",
                        json={"action": "APPROVE"},
                        headers=_auth_header(),
                    )
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_authorize_service_raises_value_error_returns_400(self):
        user = _make_user()
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["pipeline.approve"]),
            ), patch(
                "app.api.routes.v1_pipeline.rbac_service.get_roles_by_user",
                new=AsyncMock(return_value=["supervisor"]),
            ), patch(
                "app.api.routes.v1_pipeline.pipeline_service.authorize_staged",
                new=AsyncMock(side_effect=ValueError("SoD violation")),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{PIPE}/staging/some-id/authorize",
                        json={"action": "APPROVE"},
                        headers=_auth_header(),
                    )
        assert r.status_code == 400

    @pytest.mark.asyncio
    async def test_authorize_snapshot_stale_returns_409(self):
        user = _make_user()
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["pipeline.approve"]),
            ), patch(
                "app.api.routes.v1_pipeline.rbac_service.get_roles_by_user",
                new=AsyncMock(return_value=["supervisor"]),
            ), patch(
                "app.api.routes.v1_pipeline.pipeline_service.authorize_staged",
                new=AsyncMock(side_effect=ValueError("SNAPSHOT_STALE: data changed")),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{PIPE}/staging/some-id/authorize",
                        json={"action": "APPROVE"},
                        headers=_auth_header(),
                    )
        assert r.status_code == 409


# ---------------------------------------------------------------------------
# GET /v1/pipeline/ledger — list
# ---------------------------------------------------------------------------

class TestListLedger:

    @pytest.mark.asyncio
    async def test_list_ledger_superuser_returns_200(self):
        user = _make_user()
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.list_ledger",
                new=AsyncMock(return_value=[]),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(f"{PIPE}/ledger", headers=_auth_header())
        assert r.status_code == 200
        body = r.json()
        assert "entries" in body
        assert "total" in body

    @pytest.mark.asyncio
    async def test_list_ledger_non_superuser_without_permission_returns_403(self):
        user = _make_user(is_superuser=False)
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(f"{PIPE}/ledger", headers=_auth_header())
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_list_ledger_with_permission_returns_200(self):
        user = _make_user(is_superuser=False)
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=["pipeline.approve"]),
            ), patch(
                "app.api.routes.v1_pipeline.pipeline_service.list_ledger",
                new=AsyncMock(return_value=[]),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(f"{PIPE}/ledger", headers=_auth_header())
        assert r.status_code == 200


# ---------------------------------------------------------------------------
# GET /v1/pipeline/ledger/{ledger_id}
# ---------------------------------------------------------------------------

class TestGetLedger:

    @pytest.mark.asyncio
    async def test_get_ledger_not_found_returns_404(self):
        user = _make_user()
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.get_ledger",
                new=AsyncMock(return_value=None),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(
                        f"{PIPE}/ledger/nonexistent-id",
                        headers=_auth_header(),
                    )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_get_ledger_found_returns_200(self):
        user = _make_user()
        ledger_id = str(uuid4())
        entry = MagicMock()
        entry.model_dump.return_value = {"ledger_id": ledger_id, "status": "APPROVED"}
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.get_ledger",
                new=AsyncMock(return_value=entry),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(
                        f"{PIPE}/ledger/{ledger_id}",
                        headers=_auth_header(),
                    )
        assert r.status_code == 200
        assert r.json()["ledger_id"] == ledger_id


# ---------------------------------------------------------------------------
# POST /v1/pipeline/ledger/{ledger_id}/replay
# ---------------------------------------------------------------------------

class TestReplayLedger:

    @pytest.mark.asyncio
    async def test_replay_not_found_returns_404(self):
        user = _make_user()
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.get_ledger",
                new=AsyncMock(return_value=None),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{PIPE}/ledger/nonexistent-id/replay",
                        headers=_auth_header(),
                    )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_replay_success_returns_200(self):
        user = _make_user()
        ledger_id = str(uuid4())
        entry = MagicMock()
        entry.model_dump.return_value = {"ledger_id": ledger_id}

        replay_result = MagicMock()
        replay_result.model_dump.return_value = {
            "ledger_id": ledger_id,
            "hash_match": True,
            "status": "OK",
        }
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.get_ledger",
                new=AsyncMock(return_value=entry),
            ), patch(
                "app.api.routes.v1_pipeline.pipeline_service.replay_ledger",
                new=AsyncMock(return_value=replay_result),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{PIPE}/ledger/{ledger_id}/replay",
                        headers=_auth_header(),
                    )
        assert r.status_code == 200
        assert r.json()["hash_match"] is True

    @pytest.mark.asyncio
    async def test_replay_service_error_returns_400(self):
        user = _make_user()
        entry = MagicMock()
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.get_ledger",
                new=AsyncMock(return_value=entry),
            ), patch(
                "app.api.routes.v1_pipeline.pipeline_service.replay_ledger",
                new=AsyncMock(side_effect=ValueError("Replay mismatch")),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{PIPE}/ledger/some-id/replay",
                        headers=_auth_header(),
                    )
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# GET /v1/pipeline/ledger/{ledger_id}/timeline
# ---------------------------------------------------------------------------

class TestLedgerTimeline:

    @pytest.mark.asyncio
    async def test_timeline_not_found_returns_404(self):
        user = _make_user()
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.get_ledger",
                new=AsyncMock(return_value=None),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(
                        f"{PIPE}/ledger/nonexistent-id/timeline",
                        headers=_auth_header(),
                    )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_timeline_found_returns_200_with_events(self):
        from datetime import datetime, timezone
        from app.schemas_v1.pipeline import TimelineEvent

        user = _make_user()
        ledger_id = str(uuid4())
        staging_id = str(uuid4())
        proposal_id = str(uuid4())

        entry = MagicMock()
        entry.staging_id = staging_id

        staging = MagicMock()
        staging.staging_id = staging_id
        staging.proposal_id = proposal_id

        proposal = MagicMock()
        proposal.proposal_id = proposal_id

        mock_event = TimelineEvent(
            event_type="CREATED",
            timestamp=datetime(2024, 1, 1, tzinfo=timezone.utc),
            actor="user@test.com",
            detail="Created",
        )

        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.get_ledger",
                new=AsyncMock(return_value=entry),
            ), patch(
                "app.api.routes.v1_pipeline.pipeline_service.get_timeline",
                return_value=[mock_event],
            ), patch(
                "app.api.routes.v1_pipeline.pipeline_service.get_staging",
                new=AsyncMock(return_value=staging),
            ), patch(
                "app.api.routes.v1_pipeline.pipeline_service.get_proposal",
                new=AsyncMock(return_value=proposal),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(
                        f"{PIPE}/ledger/{ledger_id}/timeline",
                        headers=_auth_header(),
                    )
        assert r.status_code == 200
        body = r.json()
        assert "events" in body


# ---------------------------------------------------------------------------
# GET /v1/pipeline/ledger/{ledger_id}/export/{fmt}
# ---------------------------------------------------------------------------

class TestExportLedger:

    @pytest.mark.asyncio
    async def test_export_pdf_returns_200(self):
        user = _make_user()
        ledger_id = str(uuid4())
        entry = MagicMock()
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.get_ledger",
                new=AsyncMock(return_value=entry),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(
                        f"{PIPE}/ledger/{ledger_id}/export/pdf",
                        headers=_auth_header(),
                    )
        assert r.status_code == 200
        assert r.json()["format"] == "pdf"

    @pytest.mark.asyncio
    async def test_export_excel_returns_200(self):
        user = _make_user()
        ledger_id = str(uuid4())
        entry = MagicMock()
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.get_ledger",
                new=AsyncMock(return_value=entry),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(
                        f"{PIPE}/ledger/{ledger_id}/export/excel",
                        headers=_auth_header(),
                    )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_export_zip_returns_200(self):
        user = _make_user()
        ledger_id = str(uuid4())
        entry = MagicMock()
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.get_ledger",
                new=AsyncMock(return_value=entry),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(
                        f"{PIPE}/ledger/{ledger_id}/export/zip",
                        headers=_auth_header(),
                    )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_export_invalid_format_returns_400(self):
        user = _make_user()
        ledger_id = str(uuid4())
        entry = MagicMock()
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.get_ledger",
                new=AsyncMock(return_value=entry),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(
                        f"{PIPE}/ledger/{ledger_id}/export/csv",
                        headers=_auth_header(),
                    )
        assert r.status_code == 400

    @pytest.mark.asyncio
    async def test_export_not_found_returns_404(self):
        user = _make_user()
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.get_ledger",
                new=AsyncMock(return_value=None),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(
                        f"{PIPE}/ledger/nonexistent/export/pdf",
                        headers=_auth_header(),
                    )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# GET /v1/pipeline/proposals
# ---------------------------------------------------------------------------

class TestListProposals:

    @pytest.mark.asyncio
    async def test_list_proposals_returns_200(self):
        user = _make_user()
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.list_proposals",
                new=AsyncMock(return_value=[]),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(f"{PIPE}/proposals", headers=_auth_header())
        assert r.status_code == 200
        body = r.json()
        assert "proposals" in body
        assert "total" in body

    @pytest.mark.asyncio
    async def test_list_proposals_non_superuser_forbidden(self):
        user = _make_user(is_superuser=False)
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(f"{PIPE}/proposals", headers=_auth_header())
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# GET /v1/pipeline/proposals/{proposal_id}
# ---------------------------------------------------------------------------

class TestGetProposal:

    @pytest.mark.asyncio
    async def test_get_proposal_not_found(self):
        user = _make_user()
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.get_proposal",
                new=AsyncMock(return_value=None),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(
                        f"{PIPE}/proposals/nonexistent",
                        headers=_auth_header(),
                    )
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_get_proposal_found(self):
        user = _make_user()
        proposal_id = str(uuid4())
        proposal = MagicMock()
        proposal.model_dump.return_value = {"proposal_id": proposal_id, "status": "DRAFT"}
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.get_proposal",
                new=AsyncMock(return_value=proposal),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.get(
                        f"{PIPE}/proposals/{proposal_id}",
                        headers=_auth_header(),
                    )
        assert r.status_code == 200
        assert r.json()["proposal_id"] == proposal_id


# ---------------------------------------------------------------------------
# POST /v1/pipeline/proposals — create
# ---------------------------------------------------------------------------

class TestCreateProposal:

    @pytest.mark.asyncio
    async def test_create_proposal_success(self):
        user = _make_user()
        proposal_id = str(uuid4())
        proposal = MagicMock()
        proposal.model_dump.return_value = {"proposal_id": proposal_id, "status": "DRAFT"}
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.create_proposal",
                new=AsyncMock(return_value=proposal),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{PIPE}/proposals",
                        json={"run_id": str(uuid4())},
                        headers=_auth_header(),
                    )
        assert r.status_code == 200
        assert r.json()["proposal_id"] == proposal_id

    @pytest.mark.asyncio
    async def test_create_proposal_snapshot_stale_returns_409(self):
        user = _make_user()
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.create_proposal",
                new=AsyncMock(side_effect=ValueError("SNAPSHOT_STALE: old")),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{PIPE}/proposals",
                        json={"run_id": str(uuid4())},
                        headers=_auth_header(),
                    )
        assert r.status_code == 409

    @pytest.mark.asyncio
    async def test_create_proposal_generic_error_returns_400(self):
        user = _make_user()
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.create_proposal",
                new=AsyncMock(side_effect=ValueError("No run found")),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{PIPE}/proposals",
                        json={"run_id": str(uuid4())},
                        headers=_auth_header(),
                    )
        assert r.status_code == 400

    @pytest.mark.asyncio
    async def test_create_proposal_non_superuser_forbidden(self):
        user = _make_user(is_superuser=False)
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{PIPE}/proposals",
                        json={"run_id": str(uuid4())},
                        headers=_auth_header(),
                    )
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# POST /v1/pipeline/proposals/{proposal_id}/submit
# ---------------------------------------------------------------------------

class TestSubmitToStaging:

    @pytest.mark.asyncio
    async def test_submit_success(self):
        user = _make_user()
        artifact = MagicMock()
        artifact.model_dump.return_value = {"staging_id": str(uuid4()), "status": "PENDING"}
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.submit_to_staging",
                new=AsyncMock(return_value=artifact),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{PIPE}/proposals/some-id/submit",
                        json={"notes": "Ready for review"},
                        headers=_auth_header(),
                    )
        assert r.status_code == 200

    @pytest.mark.asyncio
    async def test_submit_error_returns_400(self):
        user = _make_user()
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.submit_to_staging",
                new=AsyncMock(side_effect=ValueError("Proposal not found")),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{PIPE}/proposals/bad-id/submit",
                        json={},
                        headers=_auth_header(),
                    )
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# POST /v1/pipeline/sandbox/calculate
# ---------------------------------------------------------------------------

class TestSandboxCalculate:

    @pytest.mark.asyncio
    async def test_sandbox_calculate_success(self):
        user = _make_user()

        validation_report = MagicMock()
        validation_report.model_dump.return_value = {"passed": True}
        waterfall_result = MagicMock()
        waterfall_result.model_dump.return_value = {"total": 1000.0}

        sandbox_result = {
            "run_id": str(uuid4()),
            "validation_report": validation_report,
            "waterfall_result": waterfall_result,
            "calculate_response": None,
            "hedge_plan": None,
            "scenario_results": None,
        }

        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.sandbox_calculate",
                return_value=sandbox_result,
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{PIPE}/sandbox/calculate",
                        json={
                            "trades": [],
                            "hedges": [],
                            "market": {},
                            "policy": {},
                        },
                        headers=_auth_header(),
                    )
        assert r.status_code == 200
        body = r.json()
        assert "run_id" in body
        assert "validation_report" in body
        assert "waterfall_result" in body

    @pytest.mark.asyncio
    async def test_sandbox_calculate_value_error_returns_422(self):
        user = _make_user()
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.sandbox_calculate",
                side_effect=ValueError("Invalid input"),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{PIPE}/sandbox/calculate",
                        json={"trades": [], "hedges": [], "market": {}, "policy": {}},
                        headers=_auth_header(),
                    )
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_sandbox_calculate_with_hedge_plan_and_scenarios(self):
        user = _make_user()

        validation_report = MagicMock()
        validation_report.model_dump.return_value = {"passed": True}
        waterfall_result = MagicMock()
        waterfall_result.model_dump.return_value = {"total": 500.0}
        calculate_response = MagicMock()
        calculate_response.model_dump.return_value = {"result": "ok"}
        hedge_plan = MagicMock()
        hedge_plan.model_dump.return_value = {"buckets": []}
        scenario_results = MagicMock()
        scenario_results.model_dump.return_value = {"scenarios": []}

        sandbox_result = {
            "run_id": str(uuid4()),
            "validation_report": validation_report,
            "waterfall_result": waterfall_result,
            "calculate_response": calculate_response,
            "hedge_plan": hedge_plan,
            "scenario_results": scenario_results,
        }

        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.pipeline_service.sandbox_calculate",
                return_value=sandbox_result,
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{PIPE}/sandbox/calculate",
                        json={"trades": [], "hedges": [], "market": {}, "policy": {}},
                        headers=_auth_header(),
                    )
        assert r.status_code == 200
        body = r.json()
        assert "calculate_response" in body
        assert "hedge_plan" in body
        assert "scenario_results" in body

    @pytest.mark.asyncio
    async def test_sandbox_calculate_non_superuser_forbidden(self):
        user = _make_user(is_superuser=False)
        with _with_overrides(user):
            with patch(
                "app.api.routes.v1_pipeline.rbac_service.get_permissions_by_user",
                new=AsyncMock(return_value=[]),
            ):
                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url=BASE_URL) as ac:
                    r = await ac.post(
                        f"{PIPE}/sandbox/calculate",
                        json={"trades": [], "hedges": [], "market": {}, "policy": {}},
                        headers=_auth_header(),
                    )
        assert r.status_code == 403
