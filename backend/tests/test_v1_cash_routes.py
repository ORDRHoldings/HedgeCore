# backend/tests/test_v1_cash_routes.py
"""Route tests for v1 cash endpoints via httpx AsyncClient."""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.dependencies import get_current_user, get_session

# Routes are mounted: app.include_router(api_router, prefix="/api")
# Cash router prefixes: /v1/cash/...
# Full paths: /api/v1/cash/...
_CASH = "/api/v1/cash"
_AUTH_HDR = {"Authorization": "Bearer fake-jwt"}


def make_mock_user(role: str = "cfo"):
    user = MagicMock()
    user.id = uuid.uuid4()
    user.company_id = uuid.uuid4()
    user.role = role
    user.plan_tier = "professional"
    return user


@pytest.mark.asyncio
async def test_list_entities_returns_200():
    mock_user = make_mock_user()
    mock_session = AsyncMock()

    with patch("app.api.routes.v1_legal_entities.list_entities", new_callable=AsyncMock, return_value=[]):
        app.dependency_overrides[get_current_user] = lambda: mock_user
        app.dependency_overrides[get_session] = lambda: mock_session
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"{_CASH}/entities", headers=_AUTH_HDR)
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_accounts_returns_200():
    mock_user = make_mock_user()
    mock_session = AsyncMock()

    with patch("app.api.routes.v1_bank_accounts.list_accounts", new_callable=AsyncMock, return_value=[]):
        app.dependency_overrides[get_current_user] = lambda: mock_user
        app.dependency_overrides[get_session] = lambda: mock_session
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"{_CASH}/accounts", headers=_AUTH_HDR)
        app.dependency_overrides.clear()

    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_verify_account_sod_returns_403():
    """SoDViolationError from service -> 403 at route layer."""
    from app.services.bank_account_service import SoDViolationError

    mock_user = make_mock_user()
    mock_session = AsyncMock()

    with patch("app.api.routes.v1_bank_accounts.verify_account",
               new_callable=AsyncMock, side_effect=SoDViolationError()):
        app.dependency_overrides[get_current_user] = lambda: mock_user
        app.dependency_overrides[get_session] = lambda: mock_session
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                f"{_CASH}/accounts/{uuid.uuid4()}/verify",
                headers=_AUTH_HDR,
            )
        app.dependency_overrides.clear()

    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_consolidated_position_returns_200():
    mock_user = make_mock_user()
    mock_session = AsyncMock()

    with patch("app.api.routes.v1_cash_positions.get_consolidated_position",
               new_callable=AsyncMock, return_value=[]):
        app.dependency_overrides[get_current_user] = lambda: mock_user
        app.dependency_overrides[get_session] = lambda: mock_session
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.get(f"{_CASH}/positions/consolidated", headers=_AUTH_HDR)
        app.dependency_overrides.clear()

    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_starter_plan_blocked_from_cash_endpoints():
    """Starter-tier users receive 403 on all cash endpoints (professional plan required)."""
    mock_user = make_mock_user()
    mock_user.plan_tier = "starter"  # override the default "professional"

    app.dependency_overrides[get_current_user] = lambda: mock_user
    app.dependency_overrides[get_session] = lambda: AsyncMock()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get(f"{_CASH}/entities", headers=_AUTH_HDR)
    app.dependency_overrides.clear()

    assert resp.status_code == 403
