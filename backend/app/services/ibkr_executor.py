"""
IBKR Order Execution Service -- Paper Trading via IB Gateway.

Places FX orders through ib_insync, tracks fills, returns execution details.
ADR-0005: Broker execution extension for paper/demo environments.
"""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Any

from app.core.config import settings

UTC = timezone.utc
_log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lazy import -- ib_insync is optional (not available on Render)
# ---------------------------------------------------------------------------
_ib_insync = None


def _ensure_ib_insync():
    global _ib_insync
    if _ib_insync is None:
        try:
            import nest_asyncio
            nest_asyncio.apply()
        except ImportError:
            pass
        try:
            import ib_insync as _mod
            _ib_insync = _mod
        except ImportError:
            raise ImportError(
                "ib_insync is required for IBKR executor. "
                "Install with: pip install ib_insync"
            )
    return _ib_insync


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------

class IBKRNotConnectedError(Exception):
    """Raised when an operation is attempted without an active IB Gateway connection."""


class IBKROrderError(Exception):
    """Raised for order-level failures (rejection, timeout, etc.)."""


# ---------------------------------------------------------------------------
# Connection timeout and order fill timeout
# ---------------------------------------------------------------------------
_CONNECT_TIMEOUT_SEC = 15
_MARKET_ORDER_FILL_TIMEOUT_SEC = 30
_LIMIT_ORDER_FILL_TIMEOUT_SEC = 60


# ---------------------------------------------------------------------------
# IBKRExecutor
# ---------------------------------------------------------------------------

class IBKRExecutor:
    """Places FX orders via IB Gateway (paper trading).

    Uses a dedicated ``clientId`` (base + 10) to avoid conflicts with the
    market-data provider which shares the same gateway.
    """

    def __init__(
        self,
        host: str | None = None,
        port: int | None = None,
        client_id: int | None = None,
    ) -> None:
        self._host = host or settings.IBKR_HOST
        self._port = port or settings.IBKR_PORT
        # Offset by 10 to avoid collision with market-data provider
        self._client_id = (client_id if client_id is not None
                           else settings.IBKR_CLIENT_ID + 10)
        self._ib: Any = None  # ib_insync.IB instance (lazy)
        self._contract_cache: dict[str, Any] = {}

    # -- Connection management ------------------------------------------------

    async def connect(self) -> None:
        """Connect to IB Gateway. Raises on timeout or gateway unavailable."""
        if self.is_connected:
            return
        ib_mod = _ensure_ib_insync()
        self._ib = ib_mod.IB()
        try:
            await asyncio.wait_for(
                self._ib.connectAsync(
                    self._host, self._port, clientId=self._client_id,
                ),
                timeout=_CONNECT_TIMEOUT_SEC,
            )
            _log.info(
                "IBKR executor connected: %s:%s (client %s)",
                self._host, self._port, self._client_id,
            )
        except asyncio.TimeoutError:
            self._ib = None
            raise ConnectionError(
                f"IBKR Gateway connection timed out after {_CONNECT_TIMEOUT_SEC}s "
                f"({self._host}:{self._port})"
            )
        except Exception as exc:
            self._ib = None
            raise ConnectionError(
                f"IBKR Gateway unavailable at {self._host}:{self._port}: {exc}"
            ) from exc

    async def disconnect(self) -> None:
        """Cleanly disconnect from IB Gateway."""
        if self._ib and self._ib.isConnected():
            self._ib.disconnect()
            _log.info("IBKR executor disconnected")
        self._ib = None

    @property
    def is_connected(self) -> bool:
        """True when the IB Gateway connection is alive."""
        return bool(self._ib and self._ib.isConnected())

    # -- Contract resolution --------------------------------------------------

    def _resolve_fx_contract(self, currency_pair: str) -> Any:
        """Create and qualify an IDEALPRO Forex contract.

        ``currency_pair`` should be a 6-char string like ``"USDMXN"`` or
        ``"EURUSD"``.  The contract is qualified once and then cached.

        Returns an ``ib_insync.Contract`` (Forex) object.
        """
        pair = currency_pair.upper().replace("/", "")
        if pair in self._contract_cache:
            return self._contract_cache[pair]

        ib_mod = _ensure_ib_insync()
        contract = ib_mod.Forex(pair)
        self._contract_cache[pair] = contract
        return contract

    async def _qualify_contract(self, contract: Any) -> Any:
        """Qualify a contract via the gateway (resolves conId, exchange, etc.)."""
        self._ensure_connected()
        qualified = await self._ib.qualifyContractsAsync(contract)
        if not qualified:
            raise IBKROrderError(
                f"Failed to qualify contract: {contract}"
            )
        return qualified[0]

    # -- Order placement ------------------------------------------------------

    async def execute_fx_order(
        self,
        currency_pair: str,
        action: str,
        quantity: float,
        order_type: str = "MKT",
        limit_price: float | None = None,
    ) -> dict:
        """Place a single FX order and wait for fill.

        Parameters
        ----------
        currency_pair : str
            Six-character pair, e.g. ``"USDMXN"``, ``"EURUSD"``.
        action : str
            ``"BUY"`` or ``"SELL"``.
        quantity : float
            Notional in base-currency units.
        order_type : str
            ``"MKT"`` (market, default) or ``"LMT"`` (limit).
        limit_price : float | None
            Required when ``order_type="LMT"``.

        Returns
        -------
        dict
            Execution result with keys: ``order_id``, ``status``,
            ``fill_price``, ``fill_quantity``, ``fill_time``, ``exec_id``,
            ``commission``, ``currency_pair``, ``action``.
        """
        self._ensure_connected()

        action = action.upper()
        if action not in ("BUY", "SELL"):
            raise IBKROrderError(f"Invalid action: {action}. Must be BUY or SELL.")

        order_type = order_type.upper()
        if order_type not in ("MKT", "LMT"):
            raise IBKROrderError(f"Invalid order_type: {order_type}. Must be MKT or LMT.")

        if order_type == "LMT" and limit_price is None:
            raise IBKROrderError("limit_price is required for LMT orders.")

        if quantity <= 0:
            raise IBKROrderError(f"Quantity must be positive, got {quantity}.")

        # Resolve and qualify the contract
        contract = self._resolve_fx_contract(currency_pair)
        contract = await self._qualify_contract(contract)

        # Build the order
        ib_mod = _ensure_ib_insync()
        if order_type == "MKT":
            order = ib_mod.MarketOrder(action, quantity)
        else:
            order = ib_mod.LimitOrder(action, quantity, limit_price)

        # Place and await fill
        trade = self._ib.placeOrder(contract, order)
        _log.info(
            "IBKR order placed: %s %s %s qty=%s type=%s lmt=%s",
            currency_pair, action, order_type, quantity, order_type, limit_price,
        )

        timeout = (
            _MARKET_ORDER_FILL_TIMEOUT_SEC
            if order_type == "MKT"
            else _LIMIT_ORDER_FILL_TIMEOUT_SEC
        )

        return await self._await_fill(trade, currency_pair, action, timeout)

    # -- Batch execution ------------------------------------------------------

    async def execute_batch(self, orders: list[dict]) -> list[dict]:
        """Execute a list of FX orders and collect results.

        Each element of ``orders`` should contain:
        ``{ currency_pair, action, quantity, order_type, limit_price }``.

        Orders are executed sequentially to respect gateway rate limits.
        """
        self._ensure_connected()
        results: list[dict] = []
        for spec in orders:
            try:
                result = await self.execute_fx_order(
                    currency_pair=spec["currency_pair"],
                    action=spec["action"],
                    quantity=spec["quantity"],
                    order_type=spec.get("order_type", "MKT"),
                    limit_price=spec.get("limit_price"),
                )
                results.append(result)
            except Exception as exc:
                results.append({
                    "order_id": None,
                    "status": "ERROR",
                    "reason": str(exc),
                    "currency_pair": spec.get("currency_pair"),
                    "action": spec.get("action"),
                    "fill_price": None,
                    "fill_quantity": 0.0,
                    "fill_time": None,
                    "exec_id": None,
                    "commission": None,
                })
        return results

    # -- Order status query ---------------------------------------------------

    async def get_order_status(self, order_id: int) -> dict:
        """Query the current status of an order by its ``orderId``.

        Returns
        -------
        dict
            ``{ order_id, status, filled_qty, remaining_qty, avg_fill_price }``
        """
        self._ensure_connected()
        for trade in self._ib.trades():
            if trade.order.orderId == order_id:
                return {
                    "order_id": order_id,
                    "status": trade.orderStatus.status,
                    "filled_qty": trade.orderStatus.filled,
                    "remaining_qty": trade.orderStatus.remaining,
                    "avg_fill_price": trade.orderStatus.avgFillPrice,
                }
        return {
            "order_id": order_id,
            "status": "UNKNOWN",
            "filled_qty": 0.0,
            "remaining_qty": 0.0,
            "avg_fill_price": 0.0,
        }

    # -- Internal helpers -----------------------------------------------------

    def _ensure_connected(self) -> None:
        """Guard: raise if not connected."""
        if not self.is_connected:
            raise IBKRNotConnectedError(
                "Not connected to IB Gateway. Call connect() first."
            )

    async def _await_fill(
        self,
        trade: Any,
        currency_pair: str,
        action: str,
        timeout_sec: float,
    ) -> dict:
        """Poll for fill within *timeout_sec* seconds.

        Returns an execution-result dict regardless of outcome.
        """
        deadline = time.monotonic() + timeout_sec
        while time.monotonic() < deadline:
            status = trade.orderStatus.status
            if status == "Filled":
                return self._build_fill_result(trade, currency_pair, action)
            if status in ("Cancelled", "ApiCancelled", "Inactive"):
                reason = getattr(trade.orderStatus, "whyHeld", "") or status
                return {
                    "order_id": trade.order.orderId,
                    "status": "REJECTED",
                    "reason": reason,
                    "currency_pair": currency_pair,
                    "action": action,
                    "fill_price": None,
                    "fill_quantity": 0.0,
                    "fill_time": None,
                    "exec_id": None,
                    "commission": None,
                }
            await asyncio.sleep(0.25)

        # Timed out
        _log.warning(
            "IBKR order fill timeout: %s %s (orderId=%s, waited %ss)",
            action, currency_pair, trade.order.orderId, timeout_sec,
        )
        return {
            "order_id": trade.order.orderId,
            "status": "TIMEOUT",
            "reason": f"Fill not received within {timeout_sec}s",
            "currency_pair": currency_pair,
            "action": action,
            "fill_price": None,
            "fill_quantity": 0.0,
            "fill_time": None,
            "exec_id": None,
            "commission": None,
        }

    @staticmethod
    def _build_fill_result(trade: Any, currency_pair: str, action: str) -> dict:
        """Extract fill details from a completed trade."""
        fills = trade.fills
        exec_id = fills[0].execution.execId if fills else None
        fill_time_raw = fills[0].execution.time if fills else None
        fill_time: str | None = None
        if fill_time_raw:
            if isinstance(fill_time_raw, datetime):
                fill_time = fill_time_raw.replace(tzinfo=UTC).isoformat()
            else:
                fill_time = str(fill_time_raw)

        # Commission: sum across all partial fills
        total_commission = 0.0
        commission_currency = None
        for fill in fills:
            cr = fill.commissionReport
            if cr and cr.commission and cr.commission < 1e9:
                total_commission += cr.commission
                commission_currency = cr.currency

        return {
            "order_id": trade.order.orderId,
            "status": "FILLED",
            "fill_price": trade.orderStatus.avgFillPrice,
            "fill_quantity": trade.orderStatus.filled,
            "fill_time": fill_time,
            "exec_id": exec_id,
            "commission": total_commission if total_commission else None,
            "commission_currency": commission_currency,
            "currency_pair": currency_pair,
            "action": action,
        }


# ---------------------------------------------------------------------------
# Singleton / factory
# ---------------------------------------------------------------------------
_executor: IBKRExecutor | None = None


def get_executor() -> IBKRExecutor:
    """Return the module-level IBKRExecutor singleton.

    Creates a new instance on first call (does NOT auto-connect --
    caller must ``await executor.connect()`` before placing orders).
    """
    global _executor
    if _executor is None:
        _executor = IBKRExecutor()
    return _executor


def reset_executor() -> None:
    """Reset the singleton (for testing)."""
    global _executor
    _executor = None
