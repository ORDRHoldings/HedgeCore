"""Tests for backend/app/services/ibkr_executor.py.

All tests mock ib_insync so they run without IB Gateway.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Module under test
# ---------------------------------------------------------------------------
from app.services.ibkr_executor import (
    IBKRExecutor,
    IBKRNotConnectedError,
    IBKROrderError,
    _CONNECT_TIMEOUT_SEC,
    _MARKET_ORDER_FILL_TIMEOUT_SEC,
    get_executor,
    reset_executor,
)

UTC = timezone.utc


# ---------------------------------------------------------------------------
# Helpers -- fake ib_insync objects
# ---------------------------------------------------------------------------

def _fake_ib_module():
    """Return a mock that behaves like ib_insync for import purposes."""
    mod = MagicMock()
    mod.Forex = MagicMock(side_effect=lambda pair: SimpleNamespace(
        symbol=pair[:3], secType="CASH", exchange="IDEALPRO", conId=12345,
    ))
    mod.MarketOrder = MagicMock(side_effect=lambda action, qty: SimpleNamespace(
        action=action, totalQuantity=qty, orderType="MKT", orderId=0,
    ))
    mod.LimitOrder = MagicMock(side_effect=lambda action, qty, lmt: SimpleNamespace(
        action=action, totalQuantity=qty, lmtPrice=lmt, orderType="LMT", orderId=0,
    ))
    return mod


def _fake_trade(status: str = "Filled", order_id: int = 42, avg_price: float = 17.15):
    """Build a fake Trade with fills and commission report."""
    cr = SimpleNamespace(commission=1.50, currency="USD")
    execution = SimpleNamespace(execId="exec-001", time=datetime(2026, 3, 14, 12, 0, tzinfo=UTC))
    fill = SimpleNamespace(execution=execution, commissionReport=cr)
    order_status = SimpleNamespace(
        status=status, avgFillPrice=avg_price, filled=100_000.0, remaining=0.0,
        whyHeld="",
    )
    order = SimpleNamespace(orderId=order_id)
    return SimpleNamespace(order=order, orderStatus=order_status, fills=[fill])


def _fake_rejected_trade(order_id: int = 99):
    trade = _fake_trade(status="Cancelled", order_id=order_id)
    trade.orderStatus.whyHeld = "Insufficient margin"
    trade.orderStatus.filled = 0.0
    trade.fills = []
    return trade


def _fake_ib_instance(is_connected: bool = True):
    """Return a mock IB() instance."""
    ib = MagicMock()
    ib.isConnected.return_value = is_connected
    ib.connectAsync = AsyncMock()
    ib.qualifyContractsAsync = AsyncMock(side_effect=lambda c: [c])
    ib.disconnect = MagicMock()
    ib.trades = MagicMock(return_value=[])
    return ib


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _reset_singleton():
    """Ensure each test starts with a clean singleton."""
    reset_executor()
    yield
    reset_executor()


@pytest.fixture
def executor():
    """Pre-configured executor (not connected)."""
    return IBKRExecutor(host="127.0.0.1", port=4002, client_id=11)


# ---------------------------------------------------------------------------
# Connection management
# ---------------------------------------------------------------------------

class TestConnection:
    @pytest.mark.asyncio
    async def test_connect_success(self, executor):
        fake_ib = _fake_ib_instance()
        fake_mod = _fake_ib_module()
        fake_mod.IB.return_value = fake_ib

        with patch("app.services.ibkr_executor._ib_insync", fake_mod):
            await executor.connect()

        assert executor.is_connected is True
        fake_ib.connectAsync.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_connect_already_connected_is_noop(self, executor):
        fake_ib = _fake_ib_instance()
        fake_mod = _fake_ib_module()
        fake_mod.IB.return_value = fake_ib
        executor._ib = fake_ib

        with patch("app.services.ibkr_executor._ib_insync", fake_mod):
            await executor.connect()

        # Should not create a new IB instance
        fake_mod.IB.assert_not_called()

    @pytest.mark.asyncio
    async def test_connect_timeout(self, executor):
        fake_mod = _fake_ib_module()
        fake_ib = MagicMock()
        fake_ib.isConnected.return_value = False

        async def slow_connect(*a, **kw):
            await asyncio.sleep(999)

        fake_ib.connectAsync = slow_connect
        fake_mod.IB.return_value = fake_ib

        with patch("app.services.ibkr_executor._ib_insync", fake_mod):
            with patch("app.services.ibkr_executor._CONNECT_TIMEOUT_SEC", 0.01):
                with pytest.raises(ConnectionError, match="timed out"):
                    await executor.connect()

        assert executor.is_connected is False

    @pytest.mark.asyncio
    async def test_connect_gateway_down(self, executor):
        fake_mod = _fake_ib_module()
        fake_ib = MagicMock()
        fake_ib.isConnected.return_value = False
        fake_ib.connectAsync = AsyncMock(side_effect=OSError("Connection refused"))
        fake_mod.IB.return_value = fake_ib

        with patch("app.services.ibkr_executor._ib_insync", fake_mod):
            with pytest.raises(ConnectionError, match="unavailable"):
                await executor.connect()

        assert executor.is_connected is False

    @pytest.mark.asyncio
    async def test_disconnect(self, executor):
        fake_ib = _fake_ib_instance()
        executor._ib = fake_ib

        await executor.disconnect()

        fake_ib.disconnect.assert_called_once()
        assert executor._ib is None

    @pytest.mark.asyncio
    async def test_disconnect_when_not_connected_is_safe(self, executor):
        await executor.disconnect()  # Should not raise

    def test_is_connected_false_by_default(self, executor):
        assert executor.is_connected is False

    def test_client_id_offset(self):
        """Executor clientId = base + 10 to avoid market-data conflicts."""
        ex = IBKRExecutor(client_id=None)
        # Default settings.IBKR_CLIENT_ID is 1 -> executor uses 11
        assert ex._client_id == 11

    def test_client_id_explicit(self):
        ex = IBKRExecutor(client_id=50)
        assert ex._client_id == 50


# ---------------------------------------------------------------------------
# Contract resolution
# ---------------------------------------------------------------------------

class TestContractResolution:
    def test_resolve_fx_contract_creates_forex(self, executor):
        fake_mod = _fake_ib_module()
        with patch("app.services.ibkr_executor._ib_insync", fake_mod):
            c = executor._resolve_fx_contract("USDMXN")
            assert c.symbol == "USD"

    def test_resolve_caches_contract(self, executor):
        fake_mod = _fake_ib_module()
        with patch("app.services.ibkr_executor._ib_insync", fake_mod):
            c1 = executor._resolve_fx_contract("EURUSD")
            c2 = executor._resolve_fx_contract("EURUSD")
            assert c1 is c2
            # Forex() called only once
            assert fake_mod.Forex.call_count == 1

    def test_resolve_normalizes_pair(self, executor):
        fake_mod = _fake_ib_module()
        with patch("app.services.ibkr_executor._ib_insync", fake_mod):
            executor._resolve_fx_contract("eur/usd")
            fake_mod.Forex.assert_called_with("EURUSD")


# ---------------------------------------------------------------------------
# Order placement
# ---------------------------------------------------------------------------

class TestExecuteFXOrder:
    @pytest.mark.asyncio
    async def test_market_order_filled(self, executor):
        fake_ib = _fake_ib_instance()
        fake_mod = _fake_ib_module()
        trade = _fake_trade(status="Filled", order_id=42, avg_price=17.15)
        fake_ib.placeOrder = MagicMock(return_value=trade)
        executor._ib = fake_ib

        with patch("app.services.ibkr_executor._ib_insync", fake_mod):
            result = await executor.execute_fx_order(
                currency_pair="USDMXN",
                action="BUY",
                quantity=100_000,
                order_type="MKT",
            )

        assert result["status"] == "FILLED"
        assert result["order_id"] == 42
        assert result["fill_price"] == 17.15
        assert result["fill_quantity"] == 100_000.0
        assert result["exec_id"] == "exec-001"
        assert result["commission"] == 1.50
        assert result["currency_pair"] == "USDMXN"
        assert result["action"] == "BUY"

    @pytest.mark.asyncio
    async def test_limit_order_filled(self, executor):
        fake_ib = _fake_ib_instance()
        fake_mod = _fake_ib_module()
        trade = _fake_trade(status="Filled", order_id=55, avg_price=1.0850)
        fake_ib.placeOrder = MagicMock(return_value=trade)
        executor._ib = fake_ib

        with patch("app.services.ibkr_executor._ib_insync", fake_mod):
            result = await executor.execute_fx_order(
                currency_pair="EURUSD",
                action="SELL",
                quantity=50_000,
                order_type="LMT",
                limit_price=1.0850,
            )

        assert result["status"] == "FILLED"
        assert result["order_id"] == 55
        fake_mod.LimitOrder.assert_called_once_with("SELL", 50_000, 1.0850)

    @pytest.mark.asyncio
    async def test_order_rejected(self, executor):
        fake_ib = _fake_ib_instance()
        fake_mod = _fake_ib_module()
        trade = _fake_rejected_trade(order_id=99)
        fake_ib.placeOrder = MagicMock(return_value=trade)
        executor._ib = fake_ib

        with patch("app.services.ibkr_executor._ib_insync", fake_mod):
            result = await executor.execute_fx_order(
                currency_pair="USDMXN",
                action="BUY",
                quantity=100_000,
            )

        assert result["status"] == "REJECTED"
        assert "margin" in result["reason"].lower()

    @pytest.mark.asyncio
    async def test_order_timeout(self, executor):
        fake_ib = _fake_ib_instance()
        fake_mod = _fake_ib_module()
        # Trade stays in "Submitted" forever
        trade = _fake_trade(status="Submitted", order_id=77)
        trade.orderStatus.status = "Submitted"
        fake_ib.placeOrder = MagicMock(return_value=trade)
        executor._ib = fake_ib

        with patch("app.services.ibkr_executor._ib_insync", fake_mod):
            with patch("app.services.ibkr_executor._MARKET_ORDER_FILL_TIMEOUT_SEC", 0.3):
                result = await executor.execute_fx_order(
                    currency_pair="GBPUSD",
                    action="BUY",
                    quantity=25_000,
                )

        assert result["status"] == "TIMEOUT"
        assert result["order_id"] == 77

    @pytest.mark.asyncio
    async def test_not_connected_raises(self, executor):
        with pytest.raises(IBKRNotConnectedError):
            await executor.execute_fx_order(
                currency_pair="EURUSD", action="BUY", quantity=10_000,
            )

    @pytest.mark.asyncio
    async def test_invalid_action_raises(self, executor):
        fake_ib = _fake_ib_instance()
        fake_mod = _fake_ib_module()
        executor._ib = fake_ib

        with patch("app.services.ibkr_executor._ib_insync", fake_mod):
            with pytest.raises(IBKROrderError, match="Invalid action"):
                await executor.execute_fx_order(
                    currency_pair="EURUSD", action="HOLD", quantity=10_000,
                )

    @pytest.mark.asyncio
    async def test_invalid_order_type_raises(self, executor):
        fake_ib = _fake_ib_instance()
        fake_mod = _fake_ib_module()
        executor._ib = fake_ib

        with patch("app.services.ibkr_executor._ib_insync", fake_mod):
            with pytest.raises(IBKROrderError, match="Invalid order_type"):
                await executor.execute_fx_order(
                    currency_pair="EURUSD", action="BUY", quantity=10_000,
                    order_type="STOP",
                )

    @pytest.mark.asyncio
    async def test_limit_without_price_raises(self, executor):
        fake_ib = _fake_ib_instance()
        fake_mod = _fake_ib_module()
        executor._ib = fake_ib

        with patch("app.services.ibkr_executor._ib_insync", fake_mod):
            with pytest.raises(IBKROrderError, match="limit_price is required"):
                await executor.execute_fx_order(
                    currency_pair="EURUSD", action="BUY", quantity=10_000,
                    order_type="LMT",
                )

    @pytest.mark.asyncio
    async def test_zero_quantity_raises(self, executor):
        fake_ib = _fake_ib_instance()
        fake_mod = _fake_ib_module()
        executor._ib = fake_ib

        with patch("app.services.ibkr_executor._ib_insync", fake_mod):
            with pytest.raises(IBKROrderError, match="positive"):
                await executor.execute_fx_order(
                    currency_pair="EURUSD", action="BUY", quantity=0,
                )

    @pytest.mark.asyncio
    async def test_negative_quantity_raises(self, executor):
        fake_ib = _fake_ib_instance()
        fake_mod = _fake_ib_module()
        executor._ib = fake_ib

        with patch("app.services.ibkr_executor._ib_insync", fake_mod):
            with pytest.raises(IBKROrderError, match="positive"):
                await executor.execute_fx_order(
                    currency_pair="EURUSD", action="BUY", quantity=-5000,
                )


# ---------------------------------------------------------------------------
# Batch execution
# ---------------------------------------------------------------------------

class TestBatchExecution:
    @pytest.mark.asyncio
    async def test_batch_all_filled(self, executor):
        fake_ib = _fake_ib_instance()
        fake_mod = _fake_ib_module()

        trade1 = _fake_trade(status="Filled", order_id=1, avg_price=17.15)
        trade2 = _fake_trade(status="Filled", order_id=2, avg_price=1.085)
        call_count = {"n": 0}

        def place_order(contract, order):
            call_count["n"] += 1
            return trade1 if call_count["n"] == 1 else trade2

        fake_ib.placeOrder = MagicMock(side_effect=place_order)
        executor._ib = fake_ib

        orders = [
            {"currency_pair": "USDMXN", "action": "BUY", "quantity": 100_000},
            {"currency_pair": "EURUSD", "action": "SELL", "quantity": 50_000},
        ]

        with patch("app.services.ibkr_executor._ib_insync", fake_mod):
            results = await executor.execute_batch(orders)

        assert len(results) == 2
        assert results[0]["status"] == "FILLED"
        assert results[1]["status"] == "FILLED"

    @pytest.mark.asyncio
    async def test_batch_partial_failure(self, executor):
        fake_ib = _fake_ib_instance()
        fake_mod = _fake_ib_module()

        trade_ok = _fake_trade(status="Filled", order_id=1, avg_price=17.0)
        trade_bad = _fake_rejected_trade(order_id=2)
        call_count = {"n": 0}

        def place_order(contract, order):
            call_count["n"] += 1
            return trade_ok if call_count["n"] == 1 else trade_bad

        fake_ib.placeOrder = MagicMock(side_effect=place_order)
        executor._ib = fake_ib

        orders = [
            {"currency_pair": "USDMXN", "action": "BUY", "quantity": 100_000},
            {"currency_pair": "EURUSD", "action": "BUY", "quantity": 50_000},
        ]

        with patch("app.services.ibkr_executor._ib_insync", fake_mod):
            results = await executor.execute_batch(orders)

        assert results[0]["status"] == "FILLED"
        assert results[1]["status"] == "REJECTED"

    @pytest.mark.asyncio
    async def test_batch_not_connected(self, executor):
        with pytest.raises(IBKRNotConnectedError):
            await executor.execute_batch([
                {"currency_pair": "EURUSD", "action": "BUY", "quantity": 10_000},
            ])

    @pytest.mark.asyncio
    async def test_batch_empty_list(self, executor):
        fake_ib = _fake_ib_instance()
        executor._ib = fake_ib

        results = await executor.execute_batch([])
        assert results == []


# ---------------------------------------------------------------------------
# Order status query
# ---------------------------------------------------------------------------

class TestOrderStatus:
    @pytest.mark.asyncio
    async def test_found_order(self, executor):
        fake_ib = _fake_ib_instance()
        trade = _fake_trade(status="Filled", order_id=42)
        fake_ib.trades.return_value = [trade]
        executor._ib = fake_ib

        status = await executor.get_order_status(42)

        assert status["order_id"] == 42
        assert status["status"] == "Filled"
        assert status["filled_qty"] == 100_000.0

    @pytest.mark.asyncio
    async def test_unknown_order(self, executor):
        fake_ib = _fake_ib_instance()
        fake_ib.trades.return_value = []
        executor._ib = fake_ib

        status = await executor.get_order_status(999)

        assert status["status"] == "UNKNOWN"

    @pytest.mark.asyncio
    async def test_not_connected_raises(self, executor):
        with pytest.raises(IBKRNotConnectedError):
            await executor.get_order_status(42)


# ---------------------------------------------------------------------------
# Singleton / factory
# ---------------------------------------------------------------------------

class TestSingleton:
    def test_get_executor_returns_same_instance(self):
        e1 = get_executor()
        e2 = get_executor()
        assert e1 is e2

    def test_reset_clears_singleton(self):
        e1 = get_executor()
        reset_executor()
        e2 = get_executor()
        assert e1 is not e2

    def test_executor_type(self):
        e = get_executor()
        assert isinstance(e, IBKRExecutor)


# ---------------------------------------------------------------------------
# Fill result builder
# ---------------------------------------------------------------------------

class TestFillResultBuilder:
    def test_build_fill_with_commission(self):
        trade = _fake_trade(status="Filled", order_id=10, avg_price=1.3)
        result = IBKRExecutor._build_fill_result(trade, "GBPUSD", "BUY")

        assert result["status"] == "FILLED"
        assert result["fill_price"] == 1.3
        assert result["commission"] == 1.50
        assert result["commission_currency"] == "USD"
        assert result["exec_id"] == "exec-001"
        assert result["fill_time"] is not None

    def test_build_fill_no_fills(self):
        trade = _fake_trade()
        trade.fills = []
        result = IBKRExecutor._build_fill_result(trade, "EURUSD", "SELL")

        assert result["exec_id"] is None
        assert result["fill_time"] is None
        assert result["commission"] is None

    def test_build_fill_large_commission_ignored(self):
        """Commission > 1e9 is IB's sentinel for 'not yet reported'."""
        trade = _fake_trade()
        trade.fills[0].commissionReport.commission = 1.7976931348623157e+308
        result = IBKRExecutor._build_fill_result(trade, "USDMXN", "BUY")

        assert result["commission"] is None
