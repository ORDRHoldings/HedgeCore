"""Route tests for /v1/cash/statements/* via httpx AsyncClient."""
import uuid
from datetime import date, datetime, UTC
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
async def test_list_statements():
    """GET /v1/cash/statements returns 200."""
    user = _mock_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_statements.list_statements_helper",
                   new_callable=AsyncMock, return_value=[]):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/cash/statements/", headers=_BEARER)
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_list_transactions():
    """GET /v1/cash/statements/transactions returns 200."""
    user = _mock_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_statements.list_transactions_helper",
                   new_callable=AsyncMock, return_value=[]):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/cash/statements/transactions", headers=_BEARER)
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()
