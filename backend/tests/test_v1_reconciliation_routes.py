"""Route tests for /v1/cash/reconciliation/* via httpx AsyncClient."""
import uuid
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
async def test_run_reconciliation():
    """POST /v1/cash/reconciliation/run returns 200."""
    user = _mock_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_reconciliation.run_reconciliation_helper",
                   new_callable=AsyncMock,
                   return_value={"matched_count": 3, "exception_count": 0, "unmatched_remaining": 2}):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post("/api/v1/cash/reconciliation/run", headers=_BEARER)
        assert resp.status_code == 200
        assert resp.json()["matched_count"] == 3
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_get_summary():
    """GET /v1/cash/reconciliation/summary returns 200."""
    user = _mock_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_reconciliation.get_summary_helper",
                   new_callable=AsyncMock,
                   return_value={"total_transactions": 10, "matched": 5,
                                 "unmatched": 4, "exceptions": 1, "match_rate_pct": "50.00"}):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.get("/api/v1/cash/reconciliation/summary", headers=_BEARER)
        assert resp.status_code == 200
        assert resp.json()["total_transactions"] == 10
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_manual_match():
    """POST /v1/cash/reconciliation/match returns 200."""
    user = _mock_user()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = _noop_session
    try:
        with patch("app.api.routes.v1_cash_reconciliation.manual_match_helper",
                   new_callable=AsyncMock, return_value=None):
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
                resp = await ac.post("/api/v1/cash/reconciliation/match", headers=_BEARER,
                                     json={"transaction_id": str(uuid.uuid4()),
                                           "match_type": "SETTLEMENT",
                                           "matched_id": str(uuid.uuid4())})
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.clear()
