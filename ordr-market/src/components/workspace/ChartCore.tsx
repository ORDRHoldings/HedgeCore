'use client';
/**
 * ORDR Market — Chart Core
 *
 * Embeds the full ChartEngine inside the workspace layout.
 * Data source: IBKR Gateway via backend REST (historical) + WebSocket (live ticks).
 *
 * Historical bars: GET /v1/public/chart-data/{symbol}?interval={apiInterval}&limit={limit}
 * Live ticks:      ws(s)://{host}/ws/market  →  useMarketWebSocket
 */
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useWorkspace } from './WorkspaceProvider';
import ChartEngine from '../chart/ChartEngine';
import type { Bar } from '../chart/indicators/types';
import { usePublicChartData } from '@/hooks/usePublicChartData';
import { useMarketWebSocket } from '@/hooks/useMarketWebSocket';

// ── Timeframe mapping: workspace codes → backend API codes ───────────────────
const TF_MAP: Record<string, string> = {
  '1m': '1min', '3m': '3min', '5m': '5min', '15m': '15min', '30m': '30min',
  '1h': '1h', '4h': '4h', 'D': '1day', 'W': '1week', 'M': '1month',
};

function toApiInterval(tf: string): string {
  return TF_MAP[tf] ?? '1day';
}

function barLimitFor(tf: string): number {
  // More bars for intraday so the chart fills meaningfully
  if (['1m', '3m', '5m'].includes(tf)) return 300;
  if (['15m', '30m'].includes(tf)) return 400;
  return 500;
}

// ── Loading/error overlay ────────────────────────────────────────────────────
function ChartOverlay({ text, isError }: { text: string; isError?: boolean }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-deep, #0a0a0f)',
      color: isError ? '#ef4444' : 'var(--text-muted, #555)',
      fontFamily: 'IBM Plex Mono, monospace', fontSize: 12,
      letterSpacing: '0.05em', zIndex: 10,
      pointerEvents: 'none',
    }}>
      {text}
    </div>
  );
}

// ── Main Chart Core ──────────────────────────────────────────────────────────
export function ChartCore() {
  const { state, dispatch } = useWorkspace();
  const apiInterval = toApiInterval(state.timeframe);
  const limit = barLimitFor(state.timeframe);

  // Historical bars from backend (IBKR or TwelveData)
  const { bars: fetchedBars, loading, error, source } = usePublicChartData(
    state.symbol,
    apiInterval,
    limit,
  );

  // Live tick from WebSocket (updates last bar in real-time)
  const { tick, connected: wsConnected } = useMarketWebSocket(state.symbol);

  // Merge live tick into last bar
  const bars = useMemo<Bar[]>(() => {
    if (!fetchedBars.length) return fetchedBars;
    if (!tick || tick.mid <= 0) return fetchedBars;

    const last = fetchedBars[fetchedBars.length - 1];
    const liveBar: Bar = {
      ...last,
      c: tick.mid,
      h: Math.max(last.h, tick.mid),
      l: Math.min(last.l, tick.mid),
    };
    return [...fetchedBars.slice(0, -1), liveBar];
  }, [fetchedBars, tick]);

  const handlePairChange = (pair: string) => {
    dispatch({ type: 'SET_SYMBOL', symbol: pair });
  };

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
      {loading && !fetchedBars.length && (
        <ChartOverlay text="Loading chart data from IBKR…" />
      )}
      {error && !fetchedBars.length && (
        <ChartOverlay text={`Data unavailable: ${error}`} isError />
      )}

      <ChartEngine
        bars={bars}
        pair={state.symbol}
        interval={state.timeframe}
        source={source}
        loading={loading}
        error={error}
        onPairChange={handlePairChange}
        embedded
        externalConfig={state.chartConfig as any}
        externalSubPanes={state.chartSubPanes}
        externalChartType={state.chartType as any}
        externalDrawingMode={state.drawingMode as any}
        externalMagnetEnabled={state.magnetEnabled}
        externalHideDrawings={state.hideDrawings}
        externalLockDrawings={state.lockDrawings}
        externalDeleteAllDrawings={state.deleteDrawingsCounter}
      />
    </div>
  );
}
