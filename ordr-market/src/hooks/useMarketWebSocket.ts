/**
 * hooks/useMarketWebSocket.ts
 *
 * Real-time market ticks via Twelve Data WebSocket.
 * Primary:  wss://ws.twelvedata.com/v1/quotes/price?apikey={key}
 * Fallback: HedgeCore backend WebSocket (/api/ws/market)
 *
 * Twelve Data protocol:
 *   subscribe:   {"action":"subscribe","params":{"symbols":"EURUSD"}}
 *   tick:        {"event":"price","symbol":"EURUSD","price":"1.084","bid":"1.083","ask":"1.085","timestamp":...}
 *   heartbeat:   {"event":"heartbeat"}
 */
import { useEffect, useRef, useState, useCallback } from 'react';

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

const TD_WS_KEY     = process.env.NEXT_PUBLIC_TWELVEDATA_WS_KEY ?? '';
const TD_WS_URL     = TD_WS_KEY
  ? `wss://ws.twelvedata.com/v1/quotes/price?apikey=${TD_WS_KEY}`
  : '';

// Fallback: HedgeCore backend WebSocket
const _apiBase      = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const FALLBACK_URL  = _apiBase.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://') + '/api/ws/market';

const RECONNECT_MS  = 5_000;
const USE_TD        = !!TD_WS_KEY;

export function useMarketWebSocket(symbol: string): UseMarketWebSocketResult {
  const [tick,      setTick]      = useState<MarketTick | null>(null);
  const [connected, setConnected] = useState(false);

  const wsRef        = useRef<WebSocket | null>(null);
  const symbolRef    = useRef<string>(symbol);
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

    const url = USE_TD ? TD_WS_URL : FALLBACK_URL;
    const ws  = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) { ws.close(); return; }
      setConnected(true);

      if (USE_TD) {
        ws.send(JSON.stringify({
          action: 'subscribe',
          params: { symbols: symbolRef.current },
        }));
      } else {
        ws.send(JSON.stringify({ action: 'subscribe', symbol: symbolRef.current }));
      }
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string);

        if (USE_TD) {
          // Twelve Data tick: event="price"
          if (msg.event === 'price' && msg.symbol === symbolRef.current) {
            const mid = parseFloat(msg.price as string);
            const bid = msg.bid  ? parseFloat(msg.bid  as string) : null;
            const ask = msg.ask  ? parseFloat(msg.ask  as string) : null;
            if (!isNaN(mid)) {
              setTick({ symbol: msg.symbol as string, bid, ask, mid, ts: msg.timestamp as number ?? Math.floor(Date.now() / 1000) });
            }
          }
          // heartbeat — ignore silently
        } else {
          // HedgeCore protocol
          if (msg.type === 'tick' && msg.symbol === symbolRef.current) {
            setTick(msg as MarketTick);
          }
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
      if (unmountedRef.current) return;
      setConnected(false);
      reconnectRef.current = setTimeout(connect, RECONNECT_MS);
    };

    ws.onerror = () => { ws.close(); };
  }, []); // stable — reads symbolRef, not symbol prop

  // Re-subscribe on symbol change without full reconnect
  useEffect(() => {
    const prev = symbolRef.current;
    symbolRef.current = symbol;
    setTick(null);
    clearReconnect();

    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      if (USE_TD) {
        if (prev && prev !== symbol) {
          ws.send(JSON.stringify({ action: 'unsubscribe', params: { symbols: prev } }));
        }
        ws.send(JSON.stringify({ action: 'subscribe', params: { symbols: symbol } }));
      } else {
        if (prev && prev !== symbol) {
          ws.send(JSON.stringify({ action: 'unsubscribe', symbol: prev }));
        }
        ws.send(JSON.stringify({ action: 'subscribe', symbol }));
      }
    }
  }, [symbol]);

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
