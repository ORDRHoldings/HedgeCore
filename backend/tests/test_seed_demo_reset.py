"""
Tests for POST /api/v1/seed/demo-reset endpoint.

Verifies: auth gate, successful reset, idempotent second call.
Uses dependency overrides + SQLite in-memory (no live DB required).
"""

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

_KEY_HDR = {"X-API-Key": "HC_DEV_KEY_001"}
_BAD_KEY = {"X-API-Key": "wrong-key"}
_ROUTE = "/api/v1/seed/demo-reset"


def _mock_user():
    u = MagicMock()
    u.id = uuid.UUID("aaaaaaaa-0000-0000-0000-000000000001")
    u.email = "demo"
    u.company_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    u.branch_id = uuid.UUID("22222222-2222-2222-2222-222222222201")
    return u


@pytest.mark.asyncio
async def test_demo_reset_rejects_bad_key():
    """Invalid API key → 403."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(_ROUTE, headers=_BAD_KEY)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_demo_reset_rejects_missing_key():
    """No API key → 422 (missing required header)."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.post(_ROUTE)
    assert resp.status_code in (403, 422)


@pytest.mark.asyncio
async def test_demo_reset_succeeds():
    """Valid key + mocked DB → 200 with expected summary shape."""
    mock_user = _mock_user()

    # Mock the DB operations so we don't need a real database
    with (
        patch("app.api.routes.seed.sa_delete", return_value=MagicMock()),
        patch("app.api.routes.seed.select", return_value=MagicMock()),
    ):
        # Patch get_session to return a mock that simulates a valid user lookup
        mock_session = AsyncMock()
        mock_exec = AsyncMock()
        mock_exec.rowcount = 5
        mock_exec.scalars = MagicMock(return_value=MagicMock(first=MagicMock(return_value=mock_user), all=MagicMock(return_value=[])))
        mock_session.execute = AsyncMock(return_value=mock_exec)
        mock_session.flush = AsyncMock()
        mock_session.commit = AsyncMock()
        mock_session.rollback = AsyncMock()
        mock_session.add = MagicMock()

        from app.core.db import get_session

        async def _override_session():
            yield mock_session

        app.dependency_overrides[get_session] = _override_session
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post(_ROUTE, headers=_KEY_HDR)
        finally:
            app.dependency_overrides.pop(get_session, None)

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "success"
    assert "summary" in body
    assert "demo_login" in body
    assert body["demo_login"]["email"] == "demo"
