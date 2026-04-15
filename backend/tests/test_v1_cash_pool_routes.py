"""Route tests for /v1/cash/pools/* via httpx AsyncClient."""
import uuid
from datetime import datetime, UTC
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.core.db import get_session
from app.core.dependencies import get_current_user


_BEARER = {"Authorization": "Bearer fake-jwt-for-csrf-bypass"}


def _mock_user(role="cfo"):
    user = MagicMock()
    user.id = uuid.uuid4()
    user.company_id = uuid.uuid4()
    user.role = role
    user.plan_tier = "professional"
    return user


def _make_mock_session():
    mock = AsyncMock()
    mock.commit = AsyncMock()
    mock.rollback = AsyncMock()
    mock.close = AsyncMock()
    return mock


async def _noop_session():
    yield _make_mock_session()


@pytest.mark.asyncio
async def test_create_entity():
    """POST /v1/cash/pools/entities returns 200."""
    user = _mock_user()

    entity_resp = {
        "id": str(uuid.uuid4()), "company_id": str(user.company_id),
        "name": "ACME UK", "entity_type": "SUBSIDIARY",
        "base_currency": "GBP", "country_code": "GB",
        "erp_ref": None, "parent_entity_id": None,
        "is_active": True, "created_at": datetime.now(UTC).isoformat(),
    }

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_pools.create_entity_helper",
                   new_callable=AsyncMock, return_value=entity_resp):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post("/api/v1/cash/pools/entities", headers=_BEARER,
                                     json={"name": "ACME UK", "base_currency": "GBP",
                                           "country_code": "GB"})
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_entities():
    """GET /v1/cash/pools/entities returns 200."""
    user = _mock_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_pools.list_entities_helper",
                   new_callable=AsyncMock, return_value=[]):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/cash/pools/entities", headers=_BEARER)
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_pool():
    """POST /v1/cash/pools returns 200."""
    user = _mock_user()

    pool_resp = {
        "id": str(uuid.uuid4()), "company_id": str(user.company_id),
        "name": "EUR Pool", "pool_type": "NOTIONAL",
        "header_account_id": str(uuid.uuid4()),
        "currency": "EUR", "base_currency": "EUR",
        "is_active": True, "member_count": 0,
        "created_by": str(user.id),
        "created_at": datetime.now(UTC).isoformat(),
    }

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_pools.create_pool_helper",
                   new_callable=AsyncMock, return_value=pool_resp):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post("/api/v1/cash/pools/", headers=_BEARER,
                                     json={"name": "EUR Pool", "pool_type": "NOTIONAL",
                                           "header_account_id": str(uuid.uuid4()),
                                           "currency": "EUR", "base_currency": "EUR"})
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_pools():
    """GET /v1/cash/pools returns 200."""
    user = _mock_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_pools.list_pools_helper",
                   new_callable=AsyncMock, return_value=[]):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/cash/pools/", headers=_BEARER)
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_pool_detail():
    """GET /v1/cash/pools/{id} returns 200."""
    user = _mock_user()
    pool_id = uuid.uuid4()

    detail = {
        "id": str(pool_id), "company_id": str(user.company_id),
        "name": "EUR Pool", "pool_type": "NOTIONAL",
        "header_account_id": str(uuid.uuid4()),
        "currency": "EUR", "base_currency": "EUR",
        "is_active": True, "member_count": 0,
        "created_by": str(user.id),
        "created_at": datetime.now(UTC).isoformat(),
        "members": [],
    }

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_pools.get_pool_detail_helper",
                   new_callable=AsyncMock, return_value=detail):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get(f"/api/v1/cash/pools/{pool_id}", headers=_BEARER)
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_add_member():
    """POST /v1/cash/pools/{id}/members returns 200."""
    user = _mock_user()
    pool_id = uuid.uuid4()

    member_resp = {
        "id": str(uuid.uuid4()), "pool_id": str(pool_id),
        "account_id": str(uuid.uuid4()), "entity_id": str(uuid.uuid4()),
        "participation_type": "FULL", "target_balance": None,
        "created_at": datetime.now(UTC).isoformat(),
    }

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_pools.add_member_helper",
                   new_callable=AsyncMock, return_value=member_resp):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post(f"/api/v1/cash/pools/{pool_id}/members", headers=_BEARER,
                                     json={"account_id": str(uuid.uuid4()),
                                           "entity_id": str(uuid.uuid4())})
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_pool_balance():
    """GET /v1/cash/pools/{id}/balance returns 200."""
    user = _mock_user()
    pool_id = uuid.uuid4()

    balance = {
        "pool_id": str(pool_id), "pool_type": "NOTIONAL",
        "consolidated_balance": "80000", "header_balance": None,
        "currency": "EUR", "member_balances": [],
    }

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_pools.get_pool_balance_helper",
                   new_callable=AsyncMock, return_value=balance):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get(f"/api/v1/cash/pools/{pool_id}/balance", headers=_BEARER)
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_execute_sweeps():
    """POST /v1/cash/pools/{id}/sweeps/execute returns 200."""
    user = _mock_user()
    pool_id = uuid.uuid4()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_pools.execute_sweeps_helper",
                   new_callable=AsyncMock, return_value={"sweep_count": 2}):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post(f"/api/v1/cash/pools/{pool_id}/sweeps/execute", headers=_BEARER)
        assert resp.status_code == 200
        assert resp.json()["sweep_count"] == 2
    finally:
        app.dependency_overrides.clear()
