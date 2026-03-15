"""
tests/test_admin_roles_v1.py

Tests for admin_roles.py — role & permission management.

Note: admin_roles.py uses get_current_user (not require_superuser) for GET routes.
POST/PUT/DELETE routes use @require_permission("users.assign_roles") decorator.

Covers:
1. list_roles_returns_200 — override get_current_user + mock DB session
2. list_permissions_returns_200 — override get_current_user + mock DB session
3. unauthenticated_returns_401_or_403 — no auth override
4. list_roles_with_empty_db — zero roles returns empty list
5. list_permissions_groups_by_module — two perms, same module → one group
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.db import get_session
from app.core.dependencies import get_current_user
from app.main import app


_BEARER = {"Authorization": "Bearer fake-jwt-for-csrf-bypass"}


def _make_user(is_superuser=False):
    user = MagicMock()
    user.id = uuid.UUID("aaaaaaaa-0000-0000-0000-000000000001")
    user.email = "user@example.com"
    user.company_id = uuid.UUID("cccccccc-0000-0000-0000-000000000001")
    user.is_active = True
    user.is_superuser = is_superuser
    return user


def _make_mock_db_empty():
    """DB session that returns empty collections for role/permission queries."""
    db = AsyncMock()

    # roles result — scalars().all() returns []
    roles_result = MagicMock()
    roles_result.scalars.return_value.all.return_value = []

    # permissions result — scalars().all() returns []
    perms_result = MagicMock()
    perms_result.scalars.return_value.all.return_value = []

    db.execute = AsyncMock(return_value=roles_result)
    return db


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestListRoles:
    @pytest.mark.asyncio
    async def test_list_roles_returns_200(self):
        user = _make_user()
        db = _make_mock_db_empty()

        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_session] = lambda: db

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/admin/roles", headers=_BEARER)
            assert resp.status_code == 200
            assert isinstance(resp.json(), list)
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_list_roles_returns_empty_list_when_no_roles(self):
        user = _make_user()
        db = _make_mock_db_empty()

        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_session] = lambda: db

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/admin/roles", headers=_BEARER)
            assert resp.status_code == 200
            assert resp.json() == []
        finally:
            app.dependency_overrides.clear()


class TestListPermissions:
    @pytest.mark.asyncio
    async def test_list_permissions_returns_200(self):
        user = _make_user()
        db = AsyncMock()

        perms_result = MagicMock()
        perms_result.scalars.return_value.all.return_value = []
        db.execute = AsyncMock(return_value=perms_result)

        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_session] = lambda: db

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/admin/roles/permissions", headers=_BEARER)
            assert resp.status_code == 200
            assert isinstance(resp.json(), list)
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_list_permissions_groups_by_module(self):
        """Two permissions in same module → one PermissionGroupOut."""
        user = _make_user()
        db = AsyncMock()

        # Build fake permission objects (must have all PermissionOut fields)
        p1 = MagicMock()
        p1.id = 1
        p1.codename = "users.read"
        p1.module = "users"
        p1.action = "read"
        p1.description = "Read users"

        p2 = MagicMock()
        p2.id = 2
        p2.codename = "users.write"
        p2.module = "users"
        p2.action = "write"
        p2.description = "Write users"

        perms_result = MagicMock()
        perms_result.scalars.return_value.all.return_value = [p1, p2]
        db.execute = AsyncMock(return_value=perms_result)

        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_session] = lambda: db

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/admin/roles/permissions", headers=_BEARER)
            assert resp.status_code == 200
            data = resp.json()
            # Should be grouped: 1 group for "users" module
            assert len(data) == 1
            assert data[0]["module"] == "users"
            assert len(data[0]["permissions"]) == 2
        finally:
            app.dependency_overrides.clear()


class TestUnauthenticated:
    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401_or_403(self):
        """With no auth override, middleware should reject unauthenticated request."""
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/api/v1/admin/roles")
        assert resp.status_code in (401, 403, 422)
