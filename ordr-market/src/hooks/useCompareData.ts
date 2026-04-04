/**
 * hooks/useCompareData.ts
 *
 * Fetches OHLCV bars for an array of comparison symbols in parallel.
 * Uses the same /api/chart-data proxy as usePublicChartData.
 * Returns a stable-reference array of { symbol, bars } pairs.
 */
import { useState, useEffect, useRef } from 'react';
import type { Bar } from '@/components/chart/indicators/types';

const BACKEND_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://hedgecore.onrender.com';

export interface CompareSeriesData {
  symbol: string;
  bars: Bar[];
}

async function fetchBars(symbol: string, interval: string, signal: AbortSignal): Promise<Bar[]> {
  // Primary: TD proxy
  try {
    const url = `/api/chart-data/${encodeURIComponent(symbol)}?interval=${interval}&limit=500`;
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      if (data.bars?.length) return data.bars as Bar[];
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
  }
  // Fallback: hedgecore
  const url = `${BACKEND_BASE}/v1/public/chart-data/${encodeURIComponent(symbol)}?interval=${interval}&limit=500`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.bars ?? []) as Bar[];
}

export function useCompareData(symbols: string[], interval: string): CompareSeriesData[] {
  const [data, setData] = useState<CompareSeriesData[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!symbols.length) { setData([]); return; }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    Promise.all(
      symbols.map(sym =>
        fetchBars(sym, interval, ctrl.signal)
          .then(bars => ({ symbol: sym, bars }))
          .catch(() => ({ symbol: sym, bars: [] as Bar[] }))
      )
    ).then(results => {
      if (!ctrl.signal.aborted) setData(results.filter(r => r.bars.length > 0));
    });

    return () => ctrl.abort();
  }, [symbols.join(','), interval]); // eslint-disable-line react-hooks/exhaustive-deps

  return data;
}
