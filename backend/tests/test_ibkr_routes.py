"""Tests for IBKR Gateway integration routes (/v1/ibkr).

Covers:
  - GET /v1/ibkr/status (disabled, no provider, connected)
  - POST /v1/ibkr/connect (disabled, no provider, success, gateway error)
  - POST /v1/ibkr/execute (disabled, no provider, validation, response shape)
  - Auth required on all endpoints
  - Schema validation (quantity > 0)
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from httpx import AsyncClient, ASGITransport

from app.core.security import get_current_user
from app.main import app

# ── Helpers ──────────────────────────────────────────────────────────────────

_BEARER = {"Authorization": "Bearer fake-jwt-for-csrf-bypass"}


def _make_user(*, is_superuser: bool = True):
    user = MagicMock()
    user.id = "aaaaaaaa-0000-0000-0000-000000000001"
    user.email = "trader@example.com"
    user.company_id = "cccccccc-0000-0000-0000-000000000001"
    user.branch_id = "bbbbbbbb-0000-0000-0000-000000000001"
    user.is_active = True
    user.is_superuser = is_superuser
    return user


@pytest.fixture
def authed_client():
    """Client with superuser + Bearer header (bypasses CSRF)."""
    app.dependency_overrides[get_current_user] = lambda: _make_user(is_superuser=True)
    transport = ASGITransport(app=app)

    class _Ctx:
        async def __aenter__(self):
            self._client = AsyncClient(transport=transport, base_url="http://test")
            return await self._client.__aenter__()

        async def __aexit__(self, *args):
            await self._client.__aexit__(*args)
            app.dependency_overrides.clear()

    return _Ctx()


# ── Auth Tests ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_status_requires_auth():
    """GET /v1/ibkr/status without auth -> 401/403."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/api/v1/ibkr/status")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_connect_requires_auth():
    """POST /v1/ibkr/connect without auth -> 401/403."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/v1/ibkr/connect")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_execute_requires_auth():
    """POST /v1/ibkr/execute without auth -> 401/403."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/v1/ibkr/execute", json={
            "proposal_id": str(uuid4()),
            "orders": [{"currency_pair": "USDMXN", "action": "BUY", "quantity": 100000}],
        })
    assert resp.status_code in (401, 403)


# ── GET /v1/ibkr/status ─────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_status_disabled(authed_client):
    """When IBKR_ENABLED=False, status returns connected=False with error."""
    with patch("app.api.routes.v1_ibkr.settings") as mock_settings:
        mock_settings.IBKR_ENABLED = False
        mock_settings.IBKR_HOST = "127.0.0.1"
        mock_settings.IBKR_PORT = 4002
        mock_settings.IBKR_CLIENT_ID = 1

        async with authed_client as client:
            resp = await client.get("/api/v1/ibkr/status", headers=_BEARER)

    assert resp.status_code == 200
    data = resp.json()
    assert data["connected"] is False
    assert data["enabled"] is False
    assert "disabled" in data["error"].lower()


@pytest.mark.asyncio
async def test_status_enabled_no_provider(authed_client):
    """When IBKR_ENABLED=True but provider init fails, returns error."""
    with patch("app.api.routes.v1_ibkr.settings") as mock_settings, \
         patch("app.api.routes.v1_ibkr._get_provider", return_value=None):
        mock_settings.IBKR_ENABLED = True
        mock_settings.IBKR_HOST = "127.0.0.1"
        mock_settings.IBKR_PORT = 4002
        mock_settings.IBKR_CLIENT_ID = 1

        async with authed_client as client:
            resp = await client.get("/api/v1/ibkr/status", headers=_BEARER)

    assert resp.status_code == 200
    data = resp.json()
    assert data["connected"] is False
    assert data["error"] is not None


@pytest.mark.asyncio
async def test_status_connected(authed_client):
    """When provider is connected, returns connected=True."""
    mock_provider = MagicMock()
    mock_provider.is_connected = True

    with patch("app.api.routes.v1_ibkr.settings") as mock_settings, \
         patch("app.api.routes.v1_ibkr._get_provider", return_value=mock_provider):
        mock_settings.IBKR_ENABLED = True
        mock_settings.IBKR_HOST = "127.0.0.1"
        mock_settings.IBKR_PORT = 4002
        mock_settings.IBKR_CLIENT_ID = 1

        async with authed_client as client:
            resp = await client.get("/api/v1/ibkr/status", headers=_BEARER)

    assert resp.status_code == 200
    data = resp.json()
    assert data["connected"] is True
    assert data["enabled"] is True
    assert data["error"] is None


# ── POST /v1/ibkr/connect ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_connect_disabled(authed_client):
    """Connect returns 503 when IBKR is disabled."""
    with patch("app.api.routes.v1_ibkr.settings") as mock_settings:
        mock_settings.IBKR_ENABLED = False

        async with authed_client as client:
            resp = await client.post("/api/v1/ibkr/connect", headers=_BEARER)

    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_connect_no_provider(authed_client):
    """Connect returns 503 when provider unavailable."""
    with patch("app.api.routes.v1_ibkr.settings") as mock_settings, \
         patch("app.api.routes.v1_ibkr._get_provider", return_value=None):
        mock_settings.IBKR_ENABLED = True

        async with authed_client as client:
            resp = await client.post("/api/v1/ibkr/connect", headers=_BEARER)

    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_connect_success(authed_client):
    """Connect succeeds when provider connects."""
    mock_provider = AsyncMock()
    mock_provider.is_connected = True
    mock_provider.connect = AsyncMock()

    with patch("app.api.routes.v1_ibkr.settings") as mock_settings, \
         patch("app.api.routes.v1_ibkr._get_provider", return_value=mock_provider):
        mock_settings.IBKR_ENABLED = True

        async with authed_client as client:
            resp = await client.post("/api/v1/ibkr/connect", headers=_BEARER)

    assert resp.status_code == 200
    data = resp.json()
    assert data["connected"] is True


@pytest.mark.asyncio
async def test_connect_gateway_error(authed_client):
    """Connect returns 502 when gateway connection fails."""
    mock_provider = AsyncMock()
    mock_provider.connect = AsyncMock(side_effect=ConnectionError("Gateway offline"))

    with patch("app.api.routes.v1_ibkr.settings") as mock_settings, \
         patch("app.api.routes.v1_ibkr._get_provider", return_value=mock_provider):
        mock_settings.IBKR_ENABLED = True

        async with authed_client as client:
            resp = await client.post("/api/v1/ibkr/connect", headers=_BEARER)

    assert resp.status_code == 502
    assert "Gateway offline" in resp.json()["detail"]


# ── POST /v1/ibkr/execute ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_execute_disabled(authed_client):
    """Execute returns 503 when IBKR is disabled."""
    with patch("app.api.routes.v1_ibkr.settings") as mock_settings:
        mock_settings.IBKR_ENABLED = False

        async with authed_client as client:
            resp = await client.post("/api/v1/ibkr/execute", headers=_BEARER, json={
                "proposal_id": "test-id",
                "orders": [{"currency_pair": "USDMXN", "action": "SELL", "quantity": 500000}],
            })

    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_execute_no_provider(authed_client):
    """Execute returns 503 when provider unavailable."""
    with patch("app.api.routes.v1_ibkr.settings") as mock_settings, \
         patch("app.api.routes.v1_ibkr._get_provider", return_value=None):
        mock_settings.IBKR_ENABLED = True

        async with authed_client as client:
            resp = await client.post("/api/v1/ibkr/execute", headers=_BEARER, json={
                "proposal_id": "test-id",
                "orders": [{"currency_pair": "USDMXN", "action": "SELL", "quantity": 500000}],
            })

    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_execute_validates_quantity(authed_client):
    """Execute rejects zero/negative quantity (Pydantic gt=0)."""
    with patch("app.api.routes.v1_ibkr.settings") as mock_settings:
        mock_settings.IBKR_ENABLED = True

        async with authed_client as client:
            resp = await client.post("/api/v1/ibkr/execute", headers=_BEARER, json={
                "proposal_id": "test-id",
                "orders": [{"currency_pair": "USDMXN", "action": "SELL", "quantity": 0}],
            })

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_execute_validates_negative_quantity(authed_client):
    """Execute rejects negative quantity."""
    with patch("app.api.routes.v1_ibkr.settings") as mock_settings:
        mock_settings.IBKR_ENABLED = True

        async with authed_client as client:
            resp = await client.post("/api/v1/ibkr/execute", headers=_BEARER, json={
                "proposal_id": "test-id",
                "orders": [{"currency_pair": "USDMXN", "action": "BUY", "quantity": -100}],
            })

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_execute_response_shape(authed_client):
    """Execute response has correct shape fields on successful fill."""
    # Build a mock provider + ib object that simulates a fill
    mock_ib = MagicMock()
    mock_order_status = MagicMock()
    mock_order_status.status = "Filled"
    mock_order_status.avgFillPrice = 17.2345
    mock_order_status.filled = 500000.0

    mock_exec = MagicMock()
    mock_exec.execId = "EXEC-001"
    mock_fill_obj = MagicMock()
    mock_fill_obj.execution = mock_exec

    mock_trade = MagicMock()
    mock_trade.orderStatus = mock_order_status
    mock_trade.fills = [mock_fill_obj]

    mock_ib.placeOrder = MagicMock(return_value=mock_trade)
    mock_ib.qualifyContractsAsync = AsyncMock()

    mock_provider = MagicMock()
    mock_provider.is_connected = True
    mock_provider._ib = mock_ib

    # Mock ib_insync module
    mock_ib_mod = MagicMock()
    mock_ib_mod.Forex = MagicMock(return_value=MagicMock())
    mock_ib_mod.MarketOrder = MagicMock(return_value=MagicMock())

    with patch("app.api.routes.v1_ibkr.settings") as mock_settings, \
         patch("app.api.routes.v1_ibkr._get_provider", return_value=mock_provider), \
         patch("app.api.routes.v1_ibkr._load_ib_insync", return_value=mock_ib_mod), \
         patch("asyncio.sleep", new_callable=AsyncMock):
        mock_settings.IBKR_ENABLED = True

        async with authed_client as client:
            resp = await client.post("/api/v1/ibkr/execute", headers=_BEARER, json={
                "proposal_id": "test-proposal-001",
                "orders": [{"currency_pair": "USDMXN", "action": "SELL", "quantity": 500000}],
            })

    assert resp.status_code == 200
    data = resp.json()
    assert "success" in data
    assert data["proposal_id"] == "test-proposal-001"
    assert "fills" in data
    assert "total_notional" in data
    assert "weighted_avg_price" in data
    assert "message" in data
    assert len(data["fills"]) == 1
    fill = data["fills"][0]
    assert fill["currency_pair"] == "USDMXN"
    assert fill["action"] == "SELL"
    assert fill["fill_price"] == 17.2345
    assert fill["fill_quantity"] == 500000.0
    assert fill["status"] == "Filled"
    assert fill["exec_id"] == "EXEC-001"


@pytest.mark.asyncio
async def test_execute_order_error_captured(authed_client):
    """When an order throws an exception, it's captured as status=Error in fills."""
    mock_ib = MagicMock()
    mock_ib.qualifyContractsAsync = AsyncMock(side_effect=RuntimeError("Contract not found"))

    mock_provider = MagicMock()
    mock_provider.is_connected = True
    mock_provider._ib = mock_ib

    mock_ib_mod = MagicMock()
    mock_ib_mod.Forex = MagicMock(return_value=MagicMock())

    with patch("app.api.routes.v1_ibkr.settings") as mock_settings, \
         patch("app.api.routes.v1_ibkr._get_provider", return_value=mock_provider), \
         patch("app.api.routes.v1_ibkr._load_ib_insync", return_value=mock_ib_mod):
        mock_settings.IBKR_ENABLED = True

        async with authed_client as client:
            resp = await client.post("/api/v1/ibkr/execute", headers=_BEARER, json={
                "proposal_id": "test-err",
                "orders": [{"currency_pair": "USDMXN", "action": "BUY", "quantity": 100000}],
            })

    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is False
    assert len(data["fills"]) == 1
    assert data["fills"][0]["status"] == "Error"
    assert data["fills"][0]["error"] is not None


# ── Schema Tests ─────────────────────────────────────────────────────────────

def test_order_request_schema():
    """IBKROrderRequest validates fields correctly."""
    from app.api.routes.v1_ibkr import IBKROrderRequest

    order = IBKROrderRequest(currency_pair="USDMXN", action="BUY", quantity=100000)
    assert order.currency_pair == "USDMXN"
    assert order.action == "BUY"
    assert order.quantity == 100000
    assert order.order_type == "MKT"
    assert order.limit_price is None


def test_order_request_limit():
    """IBKROrderRequest accepts LMT order with limit_price."""
    from app.api.routes.v1_ibkr import IBKROrderRequest

    order = IBKROrderRequest(
        currency_pair="EURUSD", action="SELL", quantity=50000,
        order_type="LMT", limit_price=1.0850,
    )
    assert order.order_type == "LMT"
    assert order.limit_price == 1.0850


def test_execute_request_schema():
    """IBKRExecuteRequest validates proposal_id and orders list."""
    from app.api.routes.v1_ibkr import IBKRExecuteRequest, IBKROrderRequest

    req = IBKRExecuteRequest(
        proposal_id="test-prop-123",
        orders=[
            IBKROrderRequest(currency_pair="USDMXN", action="BUY", quantity=100000),
            IBKROrderRequest(currency_pair="EURUSD", action="SELL", quantity=50000),
        ],
    )
    assert len(req.orders) == 2


def test_status_response_schema():
    """IBKRStatusResponse contains required fields."""
    from app.api.routes.v1_ibkr import IBKRStatusResponse

    resp = IBKRStatusResponse(
        connected=True, enabled=True,
        host="127.0.0.1", port=4002, client_id=1,
    )
    assert resp.connected is True
    assert resp.enabled is True


def test_fill_result_schema():
    """IBKRFillResult has all expected fields."""
    from app.api.routes.v1_ibkr import IBKRFillResult

    fill = IBKRFillResult(
        currency_pair="USDMXN", action="SELL",
        fill_price=17.05, fill_quantity=500000,
        status="Filled", exec_id="EX-001",
    )
    assert fill.fill_price == 17.05
    assert fill.exec_id == "EX-001"
    assert fill.error is None
