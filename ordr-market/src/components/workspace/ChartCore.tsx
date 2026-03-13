'use client';
/**
 * ORDR Market — Chart Core
 *
 * Embeds the full ChartEngine (77 indicators, 7 chart types, drawings,
 * context menu, symbol search) inside the modular workspace layout.
 * Bridges workspace state (symbol, timeframe) to ChartEngine props.
 */
import React, { useMemo } from 'react';
import { useWorkspace } from './WorkspaceProvider';
import ChartEngine from '../chart/ChartEngine';
import type { Bar } from '../chart/indicators/types';

// ── Mock data generator (seeded per symbol for deterministic bars) ───────────
function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}

const PRICE_MAP: Record<string, number> = {
  EURUSD: 1.0825, GBPUSD: 1.2683, USDJPY: 149.41, USDCAD: 1.3645,
  AUDUSD: 0.6542, NZDUSD: 0.6105, USDCHF: 0.8812,
  EURGBP: 0.8534, EURJPY: 161.82, GBPJPY: 189.56, AUDJPY: 97.72,
  XAUUSD: 2318.45, XAGUSD: 27.34,
  BTCUSD: 67842, ETHUSD: 3482, SOLUSD: 142.5, XRPUSD: 0.5824,
  SPX: 5187.67, NDX: 18234.5, DJI: 38742.1, VIX: 14.32,
  AAPL: 178.52, MSFT: 415.60, AMZN: 178.25, TSLA: 175.30,
  GOOGL: 155.72, META: 493.50, NVDA: 878.40, AMD: 162.18,
  NFLX: 612.40, JPM: 198.30, V: 278.60, BA: 184.50,
  SPY: 518.20, QQQ: 445.80, ADAUSD: 0.45, DOGEUSD: 0.082,
  CRUDE_OIL: 78.42, NATURAL_GAS: 2.34, COPPER: 4.12,
};

function intervalMs(iv: string): number {
  const map: Record<string, number> = {
    '1m': 60_000, '3m': 180_000, '5m': 300_000, '15m': 900_000,
    '30m': 1_800_000, '1h': 3_600_000, '4h': 14_400_000,
    'D': 86_400_000, 'W': 604_800_000, 'M': 2_592_000_000,
  };
  return map[iv] ?? 86_400_000;
}

function generateBars(count: number, interval: string, sym: string): Bar[] {
  const base = PRICE_MAP[sym] ?? (50 + (sym.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 400));
  // Include interval in seed so different timeframes produce different patterns
  const symSeed = sym.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
  const ivSeed = interval.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
  const seed = Math.abs(symSeed * 31 + ivSeed) + 1;
  const rand = seededRandom(seed);
  // Scale volatility with timeframe — higher TFs have wider candles
  const ms = intervalMs(interval);
  const tfScale = Math.sqrt(ms / 60_000); // sqrt scaling (1m baseline)
  const vol = base * 0.003 * Math.min(tfScale, 4);
  let price = base;
  const nowSec = Math.floor(Date.now() / 1000); // Seconds (chart engine expects Unix seconds)
  const msSec = Math.floor(ms / 1000); // interval in seconds
  const bars: Bar[] = [];
  for (let i = 0; i < count; i++) {
    const open = price;
    const drift = (rand() - 0.487) * vol;
    const pull = (base - price) * 0.004;
    const close = open + drift + pull;
    const range = Math.abs(drift) * 1.4 + rand() * vol * 0.6;
    const high = Math.max(open, close) + range * (0.4 + rand() * 0.4);
    const low = Math.min(open, close) - range * (0.3 + rand() * 0.4);
    const v = Math.floor(38_000 + rand() * 140_000);
    bars.push({ t: nowSec - (count - i) * msSec, o: +open, h: +high, l: +low, c: +close, v });
    price = close;
  }
  return bars;
}

// ── Main Chart Core ──────────────────────────────────────────────────────────
export function ChartCore() {
  const { state, dispatch } = useWorkspace();

  const bars = useMemo(
    () => generateBars(500, state.timeframe, state.symbol),
    [state.timeframe, state.symbol],
  );

  const handlePairChange = (pair: string) => {
    dispatch({ type: 'SET_SYMBOL', symbol: pair });
  };

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
      <ChartEngine
        bars={bars}
        pair={state.symbol}
        interval={state.timeframe}
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
