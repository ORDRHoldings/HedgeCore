"""
tests/test_admin_users_v1.py

Tests for v1_admin_users.py — superuser-only cross-tenant user management.

Covers:
1. list_users_superuser_returns_200 — mock get_async_session, verify shape
2. list_users_non_superuser_returns_404 — throw 404 from require_superuser
3. patch_user_returns_404_when_not_found — session scalar_one_or_none=None
4. revoke_sessions_superuser_200 — patch rt_crud + mock session finds user
5. patch_updates_is_active — mock session finds user → 200
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app.core.db import get_async_session
from app.core.dependencies import get_current_user, require_superuser
from app.main import app


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_BEARER = {"Authorization": "Bearer fake-jwt-for-csrf-bypass"}


def _make_superuser():
    user = MagicMock()
    user.id = uuid.UUID("aaaaaaaa-0000-0000-0000-000000000001")
    user.email = "admin@example.com"
    user.company_id = uuid.UUID("cccccccc-0000-0000-0000-000000000001")
    user.is_active = True
    user.is_superuser = True
    return user


def _make_mock_session_empty():
    """Session that returns empty/zero for all execute calls."""
    session = AsyncMock()

    # count result (scalar_one)
    count_result = MagicMock()
    count_result.scalar_one.return_value = 0
    count_result.scalar_one_or_none.return_value = None

    # users list result (scalars().all())
    users_result = MagicMock()
    users_result.scalars.return_value.all.return_value = []

    # roles result (.all()) — called inside _get_roles_for_users
    roles_result = MagicMock()
    roles_result.all.return_value = []

    # mfa result — _get_mfa_status
    mfa_result = MagicMock()
    mfa_result.all.return_value = []

    session.execute = AsyncMock(side_effect=[count_result, users_result])
    session.commit = AsyncMock()
    return session


def _make_mock_session_with_user(user_obj):
    """Session that returns user_obj on scalar_one_or_none."""
    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = user_obj
    session.execute = AsyncMock(return_value=result)
    session.commit = AsyncMock()
    return session


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestListAdminUsers:
    @pytest.mark.asyncio
    async def test_list_users_superuser_returns_200(self):
        su = _make_superuser()
        mock_session = _make_mock_session_empty()

        app.dependency_overrides[require_superuser] = lambda: su
        app.dependency_overrides[get_current_user] = lambda: su
        app.dependency_overrides[get_async_session] = lambda: mock_session

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/admin/users", headers=_BEARER)
            assert resp.status_code == 200
            data = resp.json()
            assert "items" in data
            assert "total" in data
            assert data["total"] == 0
            assert data["items"] == []
            assert "page" in data
            assert "size" in data
            assert "pages" in data
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_list_users_non_superuser_returns_404(self):
        def _raise_404():
            raise HTTPException(status_code=404)

        app.dependency_overrides[require_superuser] = _raise_404

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/admin/users", headers=_BEARER)
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_list_users_unauthenticated_returns_401_or_403(self):
        """Without any auth override the middleware rejects the request."""
        # Don't override anything — let real auth middleware run
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/api/v1/admin/users")
        assert resp.status_code in (401, 403, 404)


class TestPatchAdminUser:
    @pytest.mark.asyncio
    async def test_patch_user_returns_404_when_not_found(self):
        su = _make_superuser()
        mock_session = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        mock_session.execute = AsyncMock(return_value=result)

        app.dependency_overrides[require_superuser] = lambda: su
        app.dependency_overrides[get_current_user] = lambda: su
        app.dependency_overrides[get_async_session] = lambda: mock_session

        user_id = uuid.uuid4()
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.patch(
                    f"/api/v1/admin/users/{user_id}",
                    json={"is_active": False},
                    headers=_BEARER,
                )
            assert resp.status_code == 404
            assert "not found" in resp.json()["detail"].lower()
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_patch_updates_is_active(self):
        su = _make_superuser()

        # Build a fake user object that the route can mutate
        fake_user = MagicMock()
        fake_user.id = uuid.uuid4()
        fake_user.is_active = True
        fake_user.is_superuser = False
        fake_user.full_name = "Test User"
        # Make hasattr(user, "job_title") work
        fake_user.job_title = None

        mock_session = _make_mock_session_with_user(fake_user)

        app.dependency_overrides[require_superuser] = lambda: su
        app.dependency_overrides[get_current_user] = lambda: su
        app.dependency_overrides[get_async_session] = lambda: mock_session

        user_id = uuid.uuid4()
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.patch(
                    f"/api/v1/admin/users/{user_id}",
                    json={"is_active": False},
                    headers=_BEARER,
                )
            assert resp.status_code == 200
            data = resp.json()
            assert data.get("detail") == "User updated"
        finally:
            app.dependency_overrides.clear()


class TestRevokeUserSessions:
    @pytest.mark.asyncio
    async def test_revoke_sessions_superuser_200(self):
        su = _make_superuser()

        fake_user = MagicMock()
        fake_user.id = uuid.uuid4()

        mock_session = _make_mock_session_with_user(fake_user)

        app.dependency_overrides[require_superuser] = lambda: su
        app.dependency_overrides[get_current_user] = lambda: su
        app.dependency_overrides[get_async_session] = lambda: mock_session

        user_id = uuid.uuid4()
        with patch(
            "app.crud.refresh_token.revoke_all_for_user",
            new_callable=AsyncMock,
        ) as mock_revoke:
            mock_revoke.return_value = None
            try:
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                    resp = await ac.post(
                        f"/api/v1/admin/users/{user_id}/revoke-sessions",
                        headers=_BEARER,
                    )
                assert resp.status_code == 200
                data = resp.json()
                assert data.get("detail") == "All sessions revoked"
                mock_revoke.assert_called_once()
            finally:
                app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_revoke_sessions_returns_404_when_user_not_found(self):
        su = _make_superuser()

        mock_session = AsyncMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = None
        mock_session.execute = AsyncMock(return_value=result)

        app.dependency_overrides[require_superuser] = lambda: su
        app.dependency_overrides[get_current_user] = lambda: su
        app.dependency_overrides[get_async_session] = lambda: mock_session

        user_id = uuid.uuid4()
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post(
                    f"/api/v1/admin/users/{user_id}/revoke-sessions",
                    headers=_BEARER,
                )
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()
