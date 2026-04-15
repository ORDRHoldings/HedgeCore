# backend/tests/test_v1_cash_forecast_routes.py
"""Route tests for /v1/cash/forecast/* via httpx AsyncClient."""
import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.core.db import get_session
from app.core.dependencies import get_current_user


_BEARER = {"Authorization": "Bearer fake-jwt-for-csrf-bypass"}


def _mock_user():
    user = MagicMock()
    user.id = uuid.uuid4()
    user.company_id = uuid.uuid4()
    user.role = "cfo"
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
async def test_get_forecast_entity():
    """GET /v1/cash/forecast/{entity_id} returns 200 with buckets."""
    user = _mock_user()
    entity_id = uuid.uuid4()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_forecast.get_forecast_for_entity",
                   new_callable=AsyncMock, return_value=[
                       {"period_start": "2026-04-13", "period_end": "2026-04-19",
                        "opening_balance": "100000", "inflows": "0", "outflows": "0",
                        "closing_balance": "100000", "confidence_breakdown": {},
                        "liquidity_gap": False, "by_currency": {}}
                   ]):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get(
                    f"/api/v1/cash/forecast/{entity_id}?horizon=13w",
                    headers=_BEARER,
                )
        assert resp.status_code == 200
        data = resp.json()
        assert "buckets" in data
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_consolidated_forecast():
    """GET /v1/cash/forecast/consolidated returns 200."""
    user = _mock_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_forecast.get_consolidated_forecast_data",
                   new_callable=AsyncMock, return_value=[]):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get(
                    "/api/v1/cash/forecast/consolidated",
                    headers=_BEARER,
                )
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_post_scenario():
    """POST /v1/cash/forecast/scenarios returns scenario results."""
    user = _mock_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_forecast.run_scenario_route_helper",
                   new_callable=AsyncMock, return_value=[]):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post(
                    "/api/v1/cash/forecast/scenarios",
                    json={"horizon": "13w", "inflow_shift": "-0.10", "outflow_shift": "0"},
                    headers=_BEARER,
                )
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()
