/**
 * hooks/useChartData.ts — Fetches OHLCV chart data from /v1/chart-data/{symbol}
 * Auto-refreshes based on interval (60s for intraday, 5min for daily+).
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import type { Bar } from "@/components/chart/indicators/types";

interface ChartDataResponse {
  symbol: string;
  interval: string;
  bars: Bar[];
  source: string;
  count: number;
}

interface UseChartDataResult {
  bars: Bar[];
  loading: boolean;
  error: string | null;
  source: string;
  refetch: () => void;
}

function getRefreshInterval(interval: string): number {
  if (interval.includes("min")) return 60_000;
  if (interval === "1h" || interval === "4h") return 120_000;
  return 300_000;
}

export function useChartData(
  symbol: string,
  interval: string,
  token: string,
  limit: number = 500,
): UseChartDataResult {
  const [bars, setBars] = useState<Bar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState("—");
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!symbol || !token) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!silent) { setLoading(true); setError(null); }

    try {
      const res = await dashboardFetch(
        `/v1/chart-data/${encodeURIComponent(symbol)}?interval=${interval}&limit=${limit}`,
        token,
        { signal: controller.signal },
      );
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
  }, [symbol, interval, token, limit]);

  // Initial fetch + auto-refresh
  useEffect(() => {
    fetchData(false);

    const ms = getRefreshInterval(interval);
    const timer = window.setInterval(() => fetchData(true), ms);

    return () => {
      window.clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [fetchData, interval]);

  return { bars, loading, error, source, refetch: () => fetchData(false) };
}
