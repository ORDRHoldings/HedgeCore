/**
 * hooks/useChartData.ts — Fetches OHLCV chart data from /v1/chart-data/{symbol}
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

  const fetchData = useCallback(async () => {
    if (!symbol || !token) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

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
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to fetch chart data");
      setLoading(false);
    }
  }, [symbol, interval, token, limit]);

  useEffect(() => {
    fetchData();
    return () => { abortRef.current?.abort(); };
  }, [fetchData]);

  return { bars, loading, error, source, refetch: fetchData };
}
