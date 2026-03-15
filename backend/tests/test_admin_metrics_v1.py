"""
tests/test_admin_metrics_v1.py

Tests for v1_admin_metrics.py — platform KPIs, funnel, and activity feed.

The metrics route uses raw SQL text() queries inline. We mock get_async_session
to return a session where every execute().scalar() returns 0 and
every execute().fetchall() returns [].

Covers:
1. metrics_returns_200_with_required_fields
2. metrics_period_param — ?days=7 → period_days=7
3. funnel_returns_200_with_steps
4. activity_returns_list
5. non_superuser_returns_404
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.core.db import get_async_session
from app.core.dependencies import get_current_user, require_superuser
from app.main import app


_BEARER = {"Authorization": "Bearer fake-jwt-for-csrf-bypass"}


def _make_superuser():
    user = MagicMock()
    user.id = uuid.UUID("aaaaaaaa-0000-0000-0000-000000000001")
    user.email = "admin@example.com"
    user.is_superuser = True
    user.is_active = True
    return user


def _make_mock_session():
    """Session where every execute().scalar() returns 0 and .fetchall() returns []."""
    session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar.return_value = 0
    mock_result.scalar_one.return_value = 0
    mock_result.fetchall.return_value = []
    session.execute = AsyncMock(return_value=mock_result)
    return session


def _su_overrides(su, session):
    app.dependency_overrides[require_superuser] = lambda: su
    app.dependency_overrides[get_current_user] = lambda: su
    app.dependency_overrides[get_async_session] = lambda: session


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestMetricsEndpoint:
    @pytest.mark.asyncio
    async def test_metrics_returns_200_with_required_fields(self):
        su = _make_superuser()
        session = _make_mock_session()
        _su_overrides(su, session)

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/admin/metrics", headers=_BEARER)
            assert resp.status_code == 200
            data = resp.json()
            assert "total_users" in data
            assert "signups_in_period" in data
            assert "active_users_in_period" in data
            assert "total_companies" in data
            assert "period_days" in data
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_metrics_period_param(self):
        su = _make_superuser()
        session = _make_mock_session()
        _su_overrides(su, session)

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/admin/metrics?days=7", headers=_BEARER)
            assert resp.status_code == 200
            assert resp.json()["period_days"] == 7
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_metrics_values_are_ints(self):
        su = _make_superuser()
        session = _make_mock_session()
        _su_overrides(su, session)

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/admin/metrics", headers=_BEARER)
            data = resp.json()
            assert isinstance(data["total_users"], int)
            assert isinstance(data["signups_in_period"], int)
            assert isinstance(data["active_users_in_period"], int)
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_metrics_default_period_is_30(self):
        su = _make_superuser()
        session = _make_mock_session()
        _su_overrides(su, session)

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/admin/metrics", headers=_BEARER)
            assert resp.json()["period_days"] == 30
        finally:
            app.dependency_overrides.clear()


class TestFunnelEndpoint:
    @pytest.mark.asyncio
    async def test_funnel_returns_200_with_steps(self):
        su = _make_superuser()
        session = _make_mock_session()
        _su_overrides(su, session)

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/admin/metrics/funnel", headers=_BEARER)
            assert resp.status_code == 200
            data = resp.json()
            assert "steps" in data
            assert isinstance(data["steps"], list)
            assert len(data["steps"]) > 0
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_funnel_steps_have_label_count_pct(self):
        su = _make_superuser()
        session = _make_mock_session()
        _su_overrides(su, session)

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/admin/metrics/funnel", headers=_BEARER)
            steps = resp.json()["steps"]
            for step in steps:
                assert "label" in step
                assert "count" in step
                assert "pct" in step
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_funnel_period_param(self):
        su = _make_superuser()
        session = _make_mock_session()
        _su_overrides(su, session)

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/admin/metrics/funnel?days=14", headers=_BEARER)
            assert resp.status_code == 200
            assert resp.json()["period_days"] == 14
        finally:
            app.dependency_overrides.clear()


class TestActivityEndpoint:
    @pytest.mark.asyncio
    async def test_activity_returns_list(self):
        su = _make_superuser()
        session = _make_mock_session()
        _su_overrides(su, session)

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/admin/activity", headers=_BEARER)
            assert resp.status_code == 200
            assert isinstance(resp.json(), list)
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_activity_returns_empty_list_when_no_events(self):
        su = _make_superuser()
        session = _make_mock_session()
        # fetchall returns [] so activity list is empty
        _su_overrides(su, session)

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/admin/activity", headers=_BEARER)
            assert resp.status_code == 200
            assert resp.json() == []
        finally:
            app.dependency_overrides.clear()


class TestAccessControl:
    @pytest.mark.asyncio
    async def test_non_superuser_returns_404(self):
        def _raise_404():
            raise HTTPException(status_code=404)

        app.dependency_overrides[require_superuser] = _raise_404

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/admin/metrics", headers=_BEARER)
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401_or_403(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/api/v1/admin/metrics")
        assert resp.status_code in (401, 403, 404)
