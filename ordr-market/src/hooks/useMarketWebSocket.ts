/**
 * hooks/useMarketWebSocket.ts
 *
 * Real-time market data via the backend WebSocket endpoint (/ws/market).
 * Connects once, subscribes to the active symbol, auto-reconnects on drop.
 *
 * Protocol (server messages):
 *   {"type":"tick", "symbol":"EURUSD", "bid":1.082, "ask":1.0821, "mid":1.08205, "ts":1741997400}
 *   {"type":"pong"}
 *   {"type":"subscribed",   "symbol":"EURUSD"}
 *   {"type":"unsubscribed", "symbol":"EURUSD"}
 */
import { useEffect, useRef, useState, useCallback } from 'react';

// Derive WebSocket URL from the HTTP API base URL:
//   http://...  → ws://...
//   https://... → wss://...
const _apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const WS_ENDPOINT =
  _apiBase.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://') + '/ws/market';

const RECONNECT_DELAY_MS = 3_000;

export interface MarketTick {
  symbol: string;
  bid: number | null;
  ask: number | null;
  mid: number;
  ts: number;
}

interface UseMarketWebSocketResult {
  tick: MarketTick | null;
  connected: boolean;
}

export function useMarketWebSocket(symbol: string): UseMarketWebSocketResult {
  const [tick, setTick] = useState<MarketTick | null>(null);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const symbolRef = useRef<string>(symbol);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  const clearReconnect = () => {
    if (reconnectRef.current !== null) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
  };

  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    const ws = new WebSocket(WS_ENDPOINT);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) { ws.close(); return; }
      setConnected(true);
      ws.send(JSON.stringify({ action: 'subscribe', symbol: symbolRef.current }));
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === 'tick' && msg.symbol === symbolRef.current) {
          setTick(msg as MarketTick);
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (unmountedRef.current) return;
      setConnected(false);
      reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
    };

    ws.onerror = () => {
      ws.close(); // triggers onclose → reconnect
    };
  }, []); // stable — doesn't close over symbol (uses symbolRef)

  // Track symbol changes and re-subscribe without full reconnect
  useEffect(() => {
    const prev = symbolRef.current;
    symbolRef.current = symbol;
    setTick(null);
    clearReconnect(); // cancel any pending reconnect with stale symbol

    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      if (prev && prev !== symbol) {
        ws.send(JSON.stringify({ action: 'unsubscribe', symbol: prev }));
      }
      ws.send(JSON.stringify({ action: 'subscribe', symbol }));
    }
  }, [symbol]);

  // Mount: connect; unmount: close
  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      clearReconnect();
      wsRef.current?.close();
    };
  }, [connect]);

  return { tick, connected };
}
