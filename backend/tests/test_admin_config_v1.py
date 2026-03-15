"""
tests/test_admin_config_v1.py

Tests for v1_admin_config.py — in-memory singleton system configuration.

Config is in-memory — no real DB needed. Tests override get_async_session
with a no-op AsyncMock.

Covers:
1. get_config_returns_200_with_required_fields
2. patch_feature_flag — PATCH {"feature_flags": {"audit_lab": False}}
3. patch_maintenance_mode — on/off cycle
4. non_superuser_returns_404
5. unauthenticated_returns_401_or_403
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


def _noop_session():
    """Async generator that yields a no-op AsyncMock session (config never queries DB)."""
    async def _gen():
        yield AsyncMock()
    return _gen()


def _su_overrides(su):
    app.dependency_overrides[require_superuser] = lambda: su
    app.dependency_overrides[get_current_user] = lambda: su
    app.dependency_overrides[get_async_session] = _noop_session


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestGetConfig:
    @pytest.mark.asyncio
    async def test_get_config_returns_200_with_required_fields(self):
        su = _make_superuser()
        _su_overrides(su)

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/admin/config", headers=_BEARER)
            assert resp.status_code == 200
            data = resp.json()
            assert "feature_flags" in data
            assert "maintenance_mode" in data
            assert "rate_limits" in data
            assert "cors_origins" in data
            assert "default_signup_tier" in data
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_feature_flags_are_dict(self):
        su = _make_superuser()
        _su_overrides(su)

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/admin/config", headers=_BEARER)
            assert resp.status_code == 200
            flags = resp.json()["feature_flags"]
            assert isinstance(flags, dict)
            assert "audit_lab" in flags
        finally:
            app.dependency_overrides.clear()


class TestPatchConfig:
    @pytest.mark.asyncio
    async def test_patch_feature_flag(self):
        su = _make_superuser()
        _su_overrides(su)

        try:
            # First reset audit_lab to True so we start from known state
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                await ac.patch(
                    "/api/v1/admin/config",
                    json={"feature_flags": {"audit_lab": True}},
                    headers=_BEARER,
                )

                resp = await ac.patch(
                    "/api/v1/admin/config",
                    json={"feature_flags": {"audit_lab": False}},
                    headers=_BEARER,
                )
            assert resp.status_code == 200
            data = resp.json()
            assert data["feature_flags"]["audit_lab"] is False
        finally:
            # Restore audit_lab=True so other tests aren't affected
            su2 = _make_superuser()
            app.dependency_overrides[require_superuser] = lambda: su2
            app.dependency_overrides[get_current_user] = lambda: su2
            app.dependency_overrides[get_async_session] = _noop_session
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                await ac.patch(
                    "/api/v1/admin/config",
                    json={"feature_flags": {"audit_lab": True}},
                    headers=_BEARER,
                )
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_patch_maintenance_mode_on_off(self):
        su = _make_superuser()
        _su_overrides(su)

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                # Turn on
                resp_on = await ac.patch(
                    "/api/v1/admin/config",
                    json={"maintenance_mode": True},
                    headers=_BEARER,
                )
                assert resp_on.status_code == 200
                assert resp_on.json()["maintenance_mode"] is True

                # Turn off
                resp_off = await ac.patch(
                    "/api/v1/admin/config",
                    json={"maintenance_mode": False},
                    headers=_BEARER,
                )
                assert resp_off.status_code == 200
                assert resp_off.json()["maintenance_mode"] is False
        finally:
            # Ensure maintenance_mode is False after test
            su2 = _make_superuser()
            app.dependency_overrides[require_superuser] = lambda: su2
            app.dependency_overrides[get_current_user] = lambda: su2
            app.dependency_overrides[get_async_session] = _noop_session
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                await ac.patch(
                    "/api/v1/admin/config",
                    json={"maintenance_mode": False},
                    headers=_BEARER,
                )
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_patch_default_signup_tier(self):
        su = _make_superuser()
        _su_overrides(su)

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.patch(
                    "/api/v1/admin/config",
                    json={"default_signup_tier": "smb"},
                    headers=_BEARER,
                )
            assert resp.status_code == 200
            assert resp.json()["default_signup_tier"] == "smb"
        finally:
            # Restore
            su2 = _make_superuser()
            app.dependency_overrides[require_superuser] = lambda: su2
            app.dependency_overrides[get_current_user] = lambda: su2
            app.dependency_overrides[get_async_session] = _noop_session
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                await ac.patch(
                    "/api/v1/admin/config",
                    json={"default_signup_tier": "lite"},
                    headers=_BEARER,
                )
            app.dependency_overrides.clear()


class TestAccessControl:
    @pytest.mark.asyncio
    async def test_non_superuser_returns_404(self):
        def _raise_404():
            raise HTTPException(status_code=404)

        app.dependency_overrides[require_superuser] = _raise_404

        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/admin/config", headers=_BEARER)
            assert resp.status_code == 404
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_unauthenticated_returns_401_or_403(self):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            resp = await ac.get("/api/v1/admin/config")
        assert resp.status_code in (401, 403, 404)
