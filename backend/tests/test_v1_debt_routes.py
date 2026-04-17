# backend/tests/test_v1_debt_routes.py
"""Route tests for v1_debt — auth, RBAC, happy path.

Uses sync test functions with asyncio.run() to avoid the pytest-asyncio
event_loop source-inspection issue on Windows (pytest-asyncio 0.24.0).

Routes are mounted under /api (see main.py: app.include_router(api_router, prefix="/api")),
so full paths are /api/v1/debt/*.
"""
import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from httpx import ASGITransport, AsyncClient

from app.main import app
from app.core.db import get_session
from app.core.dependencies import get_current_user

BASE = "/api/v1/debt"
# Bearer header bypasses the APIKeyAuthMiddleware; get_current_user is overridden.
_BEARER = {"Authorization": "Bearer fake-jwt-for-test"}


def _make_user(has_debt_read=True, has_debt_write=True):
    user = MagicMock()
    user.id = uuid.uuid4()
    user.company_id = uuid.uuid4()
    user.is_superuser = False
    perms = set()
    if has_debt_read:
        perms.add("debt.read")
    if has_debt_write:
        perms.add("debt.write")
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


def test_list_facilities_200():
    async def run():
        user = _make_user()
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_session] = _make_session_override()
        try:
            with patch("app.api.routes.v1_debt.get_maturity_calendar", new_callable=AsyncMock, return_value=[]):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                    resp = await ac.get(f"{BASE}/maturity-calendar", headers=_BEARER)
            assert resp.status_code == 200
        finally:
            app.dependency_overrides.clear()

    asyncio.run(run())


def test_list_facilities_401_unauthenticated():
    async def run():
        app.dependency_overrides.clear()
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # No Authorization header -> APIKeyAuthMiddleware returns 401
            resp = await ac.get(f"{BASE}/maturity-calendar")
        assert resp.status_code == 401

    asyncio.run(run())


def test_list_facilities_403_no_debt_read():
    async def run():
        user = _make_user(has_debt_read=False, has_debt_write=False)
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_session] = _make_session_override()
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get(f"{BASE}/maturity-calendar", headers=_BEARER)
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()

    asyncio.run(run())


def test_create_facility_200():
    async def run():
        user = _make_user()
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_session] = _make_session_override()
        fake_facility = MagicMock()
        fake_facility.id = uuid.uuid4()
        fake_facility.facility_type = "TERM_LOAN"
        fake_facility.currency = "USD"
        fake_facility.status = "ACTIVE"
        fake_facility.committed_amount = 1_000_000.0
        fake_facility.drawn_amount = 0.0
        fake_facility.maturity_date = "2028-01-01"
        try:
            with patch("app.api.routes.v1_debt.create_facility", new_callable=AsyncMock, return_value=fake_facility):
                async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                    resp = await ac.post(f"{BASE}/facilities", json={
                        "facility_type": "TERM_LOAN", "counterparty": "TestBank",
                        "currency": "USD", "committed_amount": 1_000_000.0,
                        "margin_bps": 150, "rate_index": "SOFR",
                        "maturity_date": "2028-01-01",
                    }, headers=_BEARER)
            assert resp.status_code in (200, 201)
        finally:
            app.dependency_overrides.clear()

    asyncio.run(run())


def test_create_facility_403_no_debt_write():
    async def run():
        user = _make_user(has_debt_write=False)
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_session] = _make_session_override()
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post(f"{BASE}/facilities", json={
                    "facility_type": "TERM_LOAN", "counterparty": "X",
                    "currency": "USD", "committed_amount": 1.0,
                    "maturity_date": "2028-01-01",
                }, headers=_BEARER)
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()

    asyncio.run(run())
