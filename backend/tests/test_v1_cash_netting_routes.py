# backend/tests/test_v1_cash_netting_routes.py
"""Route tests for /v1/cash/netting/* via httpx AsyncClient."""
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
async def test_list_obligations():
    """GET /v1/cash/netting/obligations returns 200."""
    user = _mock_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_netting.list_obligations_helper",
                   new_callable=AsyncMock, return_value=[]):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/cash/netting/obligations", headers=_BEARER)
        assert resp.status_code == 200
        assert resp.json() == []
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_create_obligation():
    """POST /v1/cash/netting/obligations returns 201."""
    user = _mock_user()
    debtor = uuid.uuid4()
    creditor = uuid.uuid4()

    mock_obl = MagicMock()
    mock_obl.id = uuid.uuid4()
    mock_obl.company_id = user.company_id
    mock_obl.debtor_entity_id = debtor
    mock_obl.creditor_entity_id = creditor
    mock_obl.amount = Decimal("100000")
    mock_obl.currency = "EUR"
    mock_obl.due_date = date(2026, 5, 1)
    mock_obl.reference = "INV-001"
    mock_obl.status = "PENDING"
    mock_obl.created_by = user.id
    mock_obl.created_at = datetime.now(UTC)

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_netting.create_obligation_helper",
                   new_callable=AsyncMock, return_value=mock_obl):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post(
                    "/api/v1/cash/netting/obligations",
                    json={
                        "debtor_entity_id": str(debtor),
                        "creditor_entity_id": str(creditor),
                        "amount": "100000",
                        "currency": "EUR",
                        "due_date": "2026-05-01",
                    },
                    headers=_BEARER,
                )
        assert resp.status_code == 201
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_generate_proposals():
    """POST /v1/cash/netting/proposals/generate returns 200."""
    user = _mock_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_netting.generate_proposals_helper",
                   new_callable=AsyncMock, return_value=[]):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post("/api/v1/cash/netting/proposals/generate", headers=_BEARER)
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_savings():
    """GET /v1/cash/netting/savings returns 200."""
    user = _mock_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_netting.get_savings_helper",
                   new_callable=AsyncMock, return_value={"total_savings": "0", "netting_count": 0, "savings_by_currency": {}}):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/cash/netting/savings", headers=_BEARER)
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()
