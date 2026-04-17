# backend/tests/test_v1_ir_risk_routes.py
"""Route tests for v1_ir_risk — auth, RBAC, happy path.

Uses sync test functions with asyncio.run() to avoid the pytest-asyncio
event_loop source-inspection issue on Windows (pytest-asyncio 0.24.0).

Routes are mounted under /api (see main.py: app.include_router(api_router, prefix="/api")),
so full paths are /api/v1/ir-risk/*.
"""
import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from httpx import ASGITransport, AsyncClient

from app.main import app
from app.core.db import get_session
from app.core.dependencies import get_current_user

BASE = "/api/v1/ir-risk"
# Bearer header bypasses the APIKeyAuthMiddleware; get_current_user is overridden.
_BEARER = {"Authorization": "Bearer fake-jwt-for-test"}


def _make_user(has_ir_read=True, has_ir_write=True):
    user = MagicMock()
    user.id = uuid.uuid4()
    user.company_id = uuid.uuid4()
    user.is_superuser = False
    perms = set()
    if has_ir_read:
        perms.add("ir_risk.read")
    if has_ir_write:
        perms.add("ir_risk.write")
    user.permissions = perms
    user.company = MagicMock()
    user.company.id = user.company_id
    return user


def _make_session_override():
    """Return a dependency override that yields a no-op AsyncMock session."""
    mock_db = AsyncMock()

    async def _override():
        yield mock_db

    return _override


def test_list_swaps_200():
    async def run():
        user = _make_user()
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_session] = _make_session_override()
        try:
            with patch("app.api.routes.v1_ir_risk.list_swaps", new_callable=AsyncMock, return_value=[]):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                    resp = await ac.get(f"{BASE}/swaps", headers=_BEARER)
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    asyncio.run(run())


def test_list_swaps_401_unauthenticated():
    async def run():
        app.dependency_overrides.clear()
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # No Authorization header -> APIKeyAuthMiddleware returns 401
            resp = await ac.get(f"{BASE}/swaps")
        assert resp.status_code == 401

    asyncio.run(run())


def test_list_swaps_403_no_ir_read():
    async def run():
        user = _make_user(has_ir_read=False, has_ir_write=False)
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_session] = _make_session_override()
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get(f"{BASE}/swaps", headers=_BEARER)
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()

    asyncio.run(run())


def test_create_swap_422_invalid_body():
    async def run():
        user = _make_user()
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_session] = _make_session_override()
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post(f"{BASE}/swaps", json={"invalid_field": "bad"}, headers=_BEARER)
            assert resp.status_code == 422
        finally:
            app.dependency_overrides.clear()

    asyncio.run(run())
