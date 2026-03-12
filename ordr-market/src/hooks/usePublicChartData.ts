/**
 * hooks/usePublicChartData.ts — Fetches OHLCV chart data from the PUBLIC endpoint
 *
 * Same pattern as useChartData.ts but without JWT token.
 * Uses raw fetch to /v1/public/chart-data/{symbol} (no Authorization header).
 * Auto-refreshes based on interval (60s for intraday, 5min for daily+).
 */
import { useState, useEffect, useCallback, useRef } from "react";
import type { Bar } from "@/components/chart/indicators/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://hedgecore.onrender.com";

interface ChartDataResponse {
  symbol: string;
  interval: string;
  bars: Bar[];
  source: string;
  count: number;
}

interface UsePublicChartDataResult {
  bars: Bar[];
  loading: boolean;
  error: string | null;
  source: string;
  refetch: () => void;
}

function getRefreshInterval(interval: string): number {
  if (interval.includes("min")) return 60_000;   // 1min for intraday
  if (interval === "1h" || interval === "4h") return 120_000; // 2min for hourly
  return 300_000; // 5min for daily+
}

export function usePublicChartData(
  symbol: string,
  interval: string,
  limit: number = 500,
): UsePublicChartDataResult {
  const [bars, setBars] = useState<Bar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState("\u2014");
  const abortRef = useRef<AbortController | null>(null);
  const isFirstFetch = useRef(true);

  const fetchData = useCallback(async (silent = false) => {
    if (!symbol) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!silent) { setLoading(true); setError(null); }

    try {
      const url = `${API_BASE}/v1/public/chart-data/${encodeURIComponent(symbol)}?interval=${interval}&limit=${limit}`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "Accept": "application/json" },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }

      const data: ChartDataResponse = await res.json();
      if (!controller.signal.aborted) {
        setBars(data.bars);
        setSource(data.source);
        setLoading(false);
        setError(null);
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (!silent) {
        setError(err instanceof Error ? err.message : "Failed to fetch chart data");
        setLoading(false);
      }
    }
  }, [symbol, interval, limit]);

  // Initial fetch + auto-refresh
  useEffect(() => {
    isFirstFetch.current = true;
    fetchData(false);
    isFirstFetch.current = false;

    const ms = getRefreshInterval(interval);
    const timer = window.setInterval(() => fetchData(true), ms);

    return () => {
      window.clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [fetchData, interval]);

  return { bars, loading, error, source, refetch: () => fetchData(false) };
}
