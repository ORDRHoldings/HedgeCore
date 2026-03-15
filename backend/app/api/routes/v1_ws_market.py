"""WebSocket endpoint: ws(s)://{host}/ws/market

Provides real-time market data to the ORDR Market charting application.
No authentication required (public endpoint — read-only price data).

Protocol
--------
Client → server:
    {"action": "subscribe",   "symbol": "EURUSD"}
    {"action": "unsubscribe", "symbol": "EURUSD"}
    {"action": "ping"}

Server → client:
    {"type": "subscribed",   "symbol": "EURUSD"}
    {"type": "unsubscribed", "symbol": "EURUSD"}
    {"type": "tick", "symbol": "EURUSD", "bid": 1.082, "ask": 1.0821, "mid": 1.08205, "ts": 1741997400}
    {"type": "pong"}
    {"type": "error", "message": "..."}

Keepalive: server sends {"type": "pong"} if client is silent for 30 s.
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.market_stream import get_stream_manager

_log = logging.getLogger(__name__)

router = APIRouter(tags=["v1-ws-market"])


@router.websocket("/ws/market")
async def ws_market(websocket: WebSocket) -> None:
    await websocket.accept()
    manager = get_stream_manager()
    subscriptions: set[str] = set()

    try:
        while True:
            # Wait for a client message; ping if silent for 30 s
            try:
                raw = await asyncio.wait_for(websocket.receive_json(), timeout=30.0)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "pong"})
                continue
            except Exception:
                break

            action: str = raw.get("action", "")
            symbol: str = str(raw.get("symbol", "")).upper().replace("/", "")

            if action == "subscribe" and symbol:
                await manager.subscribe(symbol, websocket)
                subscriptions.add(symbol)
                await websocket.send_json({"type": "subscribed", "symbol": symbol})
                _log.debug("WS client subscribed: %s", symbol)

            elif action == "unsubscribe" and symbol:
                await manager.unsubscribe(symbol, websocket)
                subscriptions.discard(symbol)
                await websocket.send_json({"type": "unsubscribed", "symbol": symbol})

            elif action == "ping":
                await websocket.send_json({"type": "pong"})

            else:
                await websocket.send_json({"type": "error", "message": f"Unknown action: {action!r}"})

    except WebSocketDisconnect:
        _log.debug("WS client disconnected cleanly")
    except Exception as exc:
        _log.info("WS client error: %s", exc)
    finally:
        for sym in subscriptions:
            await manager.unsubscribe(sym, websocket)
