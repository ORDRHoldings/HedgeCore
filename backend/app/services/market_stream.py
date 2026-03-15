"""Real-time market data streaming via IBKR Gateway.

Maintains a dedicated IB connection (clientId = IBKR_CLIENT_ID + 20) so it
never conflicts with the market-data provider (clientId+0) or the executor
(clientId+10).

On subscription:
  1. Tries IBKR reqMktData streaming (pendingTickersEvent) — true real-time ticks
  2. Falls back to snapshot polling every 1.5s via the orchestrator providers

Broadcasts to WebSocket clients as:
  {"type": "tick", "symbol": "EURUSD", "bid": 1.082, "ask": 1.0821, "mid": 1.08205, "ts": 1741997400}
"""
from __future__ import annotations

import asyncio
import logging
import time
from collections import defaultdict
from typing import Any

from fastapi import WebSocket

from app.core.config import settings

_log = logging.getLogger(__name__)

_STREAM_CLIENT_ID_OFFSET = 20   # ibkr_executor uses +10, so we use +20
_POLL_INTERVAL = 1.5            # fallback polling cadence (seconds)
_RECONNECT_DELAY = 5.0          # retry delay after connection failure


# ─────────────────────────────────────────────────────────────────────────────

class MarketStreamManager:
    """
    Singleton that routes live IBKR ticks (or fallback poll results)
    to WebSocket clients organised by symbol.
    """

    def __init__(self) -> None:
        self._clients: dict[str, set[WebSocket]] = defaultdict(set)
        self._tickers: dict[str, Any] = {}          # symbol → ib_insync Ticker
        self._ib: Any = None
        self._lock = asyncio.Lock()
        self._connected = False
        self._stream_mode = False                    # True = IBKR streaming active
        self._poll_task: asyncio.Task | None = None  # fallback poll loop

    # ── Public interface ──────────────────────────────────────────────────────

    async def subscribe(self, symbol: str, ws: WebSocket) -> None:
        async with self._lock:
            is_new = symbol not in self._tickers
            self._clients[symbol].add(ws)
            if is_new:
                await self._ensure_connected()
                if self._connected and self._stream_mode:
                    await self._start_stream(symbol)

    async def unsubscribe(self, symbol: str, ws: WebSocket) -> None:
        async with self._lock:
            self._clients[symbol].discard(ws)

    async def shutdown(self) -> None:
        if self._poll_task and not self._poll_task.done():
            self._poll_task.cancel()
            try:
                await self._poll_task
            except asyncio.CancelledError:
                pass
        if self._ib and self._connected:
            try:
                self._ib.disconnect()
            except Exception:
                pass
        _log.info("MarketStreamManager shut down")

    # ── Connection management ─────────────────────────────────────────────────

    async def _ensure_connected(self) -> None:
        if self._connected and self._ib and self._ib.isConnected():
            return

        host = settings.IBKR_HOST or "127.0.0.1"
        port = settings.IBKR_PORT or 4002
        client_id = (settings.IBKR_CLIENT_ID or 1) + _STREAM_CLIENT_ID_OFFSET

        try:
            ib_mod = _import_ib_insync()
            self._ib = ib_mod.IB()
            await self._ib.connectAsync(host, port, clientId=client_id)
            self._connected = True
            self._stream_mode = True
            # Hook into ib_insync's event that fires whenever tickers have new data
            self._ib.pendingTickersEvent += self._on_pending_tickers
            _log.info("IBKR stream connected → %s:%s (clientId=%d)", host, port, client_id)
        except Exception as exc:
            _log.warning(
                "IBKR stream connect failed (%s:%s): %s — falling back to polling",
                host, port, exc,
            )
            self._connected = False
            self._stream_mode = False
            self._start_poll_loop()

    async def _start_stream(self, symbol: str) -> None:
        """Open a reqMktData streaming subscription for symbol."""
        try:
            ib_mod = _import_ib_insync()
            contract = _make_contract(symbol, ib_mod)
            await self._ib.qualifyContractsAsync(contract)
            ticker = self._ib.reqMktData(contract, "", False, False)
            self._tickers[symbol] = ticker
            _log.debug("IBKR stream: subscribed %s", symbol)
        except Exception as exc:
            _log.warning("Stream subscription failed for %s: %s", symbol, exc)

    # ── Tick event handler (IBKR streaming) ──────────────────────────────────

    def _on_pending_tickers(self, tickers: set) -> None:
        """
        Called by ib_insync on the asyncio event loop whenever any subscribed
        ticker has received new data.  We map each Ticker back to its symbol
        and broadcast to all WebSocket subscribers.
        """
        for ticker in tickers:
            sym = self._ticker_symbol(ticker)
            if not sym or not self._clients.get(sym):
                continue

            bid = _safe_float(ticker.bid)
            ask = _safe_float(ticker.ask)
            last = _safe_float(ticker.last)
            mid = ((bid + ask) / 2) if (bid and ask) else last

            if mid:
                asyncio.create_task(self._broadcast(sym, {
                    "type": "tick",
                    "symbol": sym,
                    "bid": bid,
                    "ask": ask,
                    "mid": mid,
                    "ts": int(time.time()),
                }))

    def _ticker_symbol(self, ticker: Any) -> str | None:
        for sym, t in self._tickers.items():
            if t is ticker:
                return sym
        return None

    # ── Fallback poll loop ────────────────────────────────────────────────────

    def _start_poll_loop(self) -> None:
        if self._poll_task is None or self._poll_task.done():
            self._poll_task = asyncio.create_task(self._poll_loop())

    async def _poll_loop(self) -> None:
        """Snapshot-poll IBKR (or TwelveData/yfinance) for subscribed symbols."""
        from app.services.market_data import get_orchestrator
        _log.info("WS fallback poll loop started (%.1fs cadence)", _POLL_INTERVAL)

        while True:
            await asyncio.sleep(_POLL_INTERVAL)
            active = [s for s, clients in self._clients.items() if clients]
            if not active:
                continue

            orch = get_orchestrator()
            if not orch or not orch.providers:
                continue

            # Try FX pairs first
            fx = [s for s in active if len(s) == 6 and s.isalpha()]
            non_fx = [s for s in active if s not in fx]

            try:
                if fx:
                    spots = await orch.providers[0].fetch_fx_spot(fx)
                    for spot in spots:
                        await self._broadcast(spot.pair, {
                            "type": "tick",
                            "symbol": spot.pair,
                            "bid": spot.bid,
                            "ask": spot.ask,
                            "mid": spot.mid,
                            "ts": int(time.time()),
                        })
            except Exception as exc:
                _log.debug("Poll FX fetch error: %s", exc)

            try:
                if non_fx:
                    equities = await orch.providers[0].fetch_equity_quotes(non_fx)
                    for eq in equities:
                        await self._broadcast(eq.symbol, {
                            "type": "tick",
                            "symbol": eq.symbol,
                            "bid": None,
                            "ask": None,
                            "mid": eq.price,
                            "ts": int(time.time()),
                        })
            except Exception as exc:
                _log.debug("Poll equity fetch error: %s", exc)

    # ── Broadcast ─────────────────────────────────────────────────────────────

    async def _broadcast(self, symbol: str, data: dict) -> None:
        dead: set[WebSocket] = set()
        for ws in list(self._clients.get(symbol, set())):
            try:
                await ws.send_json(data)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self._clients[symbol].discard(ws)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _import_ib_insync() -> Any:
    try:
        import ib_insync as mod
        return mod
    except ImportError:
        raise ImportError("ib_insync not installed — run: pip install ib_insync")


def _make_contract(symbol: str, ib_mod: Any) -> Any:
    symbol = symbol.upper().replace("/", "")
    if len(symbol) == 6 and symbol.isalpha():
        return ib_mod.Forex(symbol[:3] + symbol[3:])
    return ib_mod.Stock(symbol, "SMART", "USD")


def _safe_float(v: Any) -> float | None:
    try:
        f = float(v)
        return f if f == f and f > 0 else None  # NaN/neg guard
    except (TypeError, ValueError):
        return None


# ── Module-level singleton ────────────────────────────────────────────────────

_manager: MarketStreamManager | None = None


def get_stream_manager() -> MarketStreamManager:
    global _manager
    if _manager is None:
        _manager = MarketStreamManager()
    return _manager
