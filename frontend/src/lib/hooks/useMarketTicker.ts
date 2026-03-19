"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Real-time market price ticker via WebSocket.
 * Connects to /ws/market, subscribes to given symbols, returns live tick data.
 * Reconnects automatically on disconnect (3s backoff).
 */

export interface TickData {
  bid: number;
  ask: number;
  mid: number;
  ts: number;
}

export type TickMap = Record<string, TickData>;

function getWsUrl(): string {
  const apiUrl =
    (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) ||
    "https://hedgecore.onrender.com/api";
  // Strip /api suffix, convert http(s) → ws(s)
  const base = apiUrl.replace(/\/api\/?$/, "");
  return base.replace(/^https/, "wss").replace(/^http/, "ws") + "/ws/market";
}

export function useMarketTicker(symbols: string[]): TickMap {
  const [ticks, setTicks] = useState<TickMap>({});
  const wsRef = useRef<WebSocket | null>(null);
  const symbolsRef = useRef<string[]>([]);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const sendIfOpen = (ws: WebSocket, payload: object) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  };

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    let ws: WebSocket;
    try {
      ws = new WebSocket(getWsUrl());
    } catch {
      return; // WS not available (SSR or bad URL)
    }
    wsRef.current = ws;

    ws.onopen = () => {
      for (const sym of symbolsRef.current) {
        sendIfOpen(ws, { action: "subscribe", symbol: sym });
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === "tick" && msg.symbol) {
          setTicks((prev) => ({
            ...prev,
            [msg.symbol as string]: {
              bid: msg.bid as number,
              ask: msg.ask as number,
              mid: msg.mid as number,
              ts: msg.ts as number,
            },
          }));
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      reconnectRef.current = setTimeout(() => connect(), 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  // Sync symbol subscriptions when the list changes
  useEffect(() => {
    const prev = new Set(symbolsRef.current);
    const next = new Set(symbols);
    symbolsRef.current = symbols;

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    for (const sym of next) {
      if (!prev.has(sym)) sendIfOpen(ws, { action: "subscribe", symbol: sym });
    }
    for (const sym of prev) {
      if (!next.has(sym)) sendIfOpen(ws, { action: "unsubscribe", symbol: sym });
    }
  }, [symbols]);

  // Initial connection
  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return ticks;
}
