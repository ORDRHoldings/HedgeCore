/**
 * hooks/usePublicChartData.ts — Fetches OHLCV chart data
 *
 * Primary:  /api/chart-data/{symbol}  (Next.js proxy → Twelve Data, server-side key)
 * Fallback: /api/v1/public/chart-data/{symbol} on HedgeCore backend
 *
 * Auto-refreshes: 60s intraday · 2min hourly · 5min daily+
 */
import { useState, useEffect, useCallback, useRef } from "react";
import type { Bar } from "@/components/chart/indicators/types";

const BACKEND_BASE = process.env.NEXT_PUBLIC_API_URL || "https://hedgecore.onrender.com";

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
  if (interval.includes('m') && !interval.includes('month')) return 60_000;
  if (interval === '1h' || interval === '2h' || interval === '4h') return 120_000;
  return 300_000;
}

export function usePublicChartData(
  symbol: string,
  interval: string,
  limit: number = 500,
): UsePublicChartDataResult {
  const [bars,    setBars]    = useState<Bar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [source,  setSource]  = useState('—');
  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!symbol) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!silent) { setLoading(true); setError(null); }

    const signal = controller.signal;

    // ── Primary: Twelve Data via Next.js proxy ────────────────────────────
    try {
      const url = `/api/chart-data/${encodeURIComponent(symbol)}?interval=${interval}&limit=${limit}`;
      const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
      if (res.ok) {
        const data: ChartDataResponse = await res.json();
        if (!signal.aborted && data.bars?.length) {
          setBars(data.bars);
          setSource(data.source ?? 'TwelveData');
          setLoading(false);
          setError(null);
          return;
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // fall through to backend
    }

    // ── Fallback: HedgeCore backend ───────────────────────────────────────
    try {
      const url = `${BACKEND_BASE}/v1/public/chart-data/${encodeURIComponent(symbol)}?interval=${interval}&limit=${limit}`;
      const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      const data: ChartDataResponse = await res.json();
      if (!signal.aborted) {
        setBars(data.bars);
        setSource(data.source ?? 'backend');
        setLoading(false);
        setError(null);
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (!signal.aborted) {
        setError(err instanceof Error ? err.message : 'Failed to fetch chart data');
        setLoading(false);
      }
    }
  }, [symbol, interval, limit]);

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
