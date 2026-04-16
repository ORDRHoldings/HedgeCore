# backend/tests/test_v1_intelligence_routes.py
"""Route tests for /v1/intelligence/* via httpx AsyncClient."""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.core.db import get_session
from app.core.dependencies import get_current_user

_BEARER = {"Authorization": "Bearer fake-jwt-for-csrf-bypass"}


def _mock_user(plan_tier="intelligence", intelligence_enabled=True):
    user = MagicMock()
    user.id = uuid.uuid4()
    user.company_id = uuid.uuid4()
    user.role = "cfo"
    user.plan_tier = plan_tier
    company = MagicMock()
    company.id = user.company_id
    company.plan_tier = plan_tier
    company.intelligence_enabled = intelligence_enabled
    user.company = company
    return user


def _make_mock_session():
    mock = AsyncMock()
    mock.commit = AsyncMock()
    mock.rollback = AsyncMock()
    mock.close = AsyncMock()
    return mock


async def _noop_session():
    yield _make_mock_session()


# ── POST /v1/intelligence/query ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_query_returns_200():
    """POST /v1/intelligence/query returns 200 with answer."""
    user = _mock_user()
    mock_response = MagicMock()
    mock_response.query_id = str(uuid.uuid4())
    mock_response.answer = "EUR net short $2.4M."
    mock_response.data_refs = []
    mock_response.tokens_used = 150
    mock_response.latency_ms = 320

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch(
            "app.api.routes.v1_intelligence.query_intelligence_helper",
            new_callable=AsyncMock,
            return_value=mock_response,
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post(
                    "/api/v1/intelligence/query",
                    json={"q": "What is our EUR exposure?"},
                    headers=_BEARER,
                )
        assert resp.status_code == 200
        data = resp.json()
        assert data["answer"] == "EUR net short $2.4M."
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_query_returns_402_wrong_tier():
    """POST /v1/intelligence/query returns 402 for non-intelligence tier."""
    user = _mock_user(plan_tier="enterprise")

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post(
                "/api/v1/intelligence/query",
                json={"q": "test"},
                headers=_BEARER,
            )
        assert resp.status_code == 402
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_query_returns_402_not_enabled():
    """POST /v1/intelligence/query returns 402 when intelligence not enabled."""
    user = _mock_user(plan_tier="intelligence", intelligence_enabled=False)

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.post(
                "/api/v1/intelligence/query",
                json={"q": "test"},
                headers=_BEARER,
            )
        assert resp.status_code == 402
    finally:
        app.dependency_overrides.clear()


# ── POST /v1/intelligence/commentary ──────────────────────────────────────


@pytest.mark.asyncio
async def test_commentary_returns_200():
    """POST /v1/intelligence/commentary returns 200 with draft."""
    user = _mock_user()
    mock_response = MagicMock()
    mock_response.commentary_id = str(uuid.uuid4())
    mock_response.draft = "Q1 2026 hedge effectiveness remained within IFRS 9 bounds..."
    mock_response.report_type = "hedge_effectiveness"
    mock_response.tokens_used = 280

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch(
            "app.api.routes.v1_intelligence.draft_commentary_helper",
            new_callable=AsyncMock,
            return_value=mock_response,
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post(
                    "/api/v1/intelligence/commentary",
                    json={"report_type": "hedge_effectiveness", "report_id": str(uuid.uuid4())},
                    headers=_BEARER,
                )
        assert resp.status_code == 200
        data = resp.json()
        assert "draft" in data
    finally:
        app.dependency_overrides.clear()


# ── GET /v1/intelligence/settings ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_settings_returns_200():
    """GET /v1/intelligence/settings returns enabled status and usage."""
    user = _mock_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch(
            "app.api.routes.v1_intelligence.get_usage_stats",
            new_callable=AsyncMock,
            return_value={"queries_this_month": 5, "tokens_this_month": 1200},
        ):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/intelligence/settings", headers=_BEARER)
        assert resp.status_code == 200
        data = resp.json()
        assert "enabled" in data
        assert "queries_this_month" in data
    finally:
        app.dependency_overrides.clear()
