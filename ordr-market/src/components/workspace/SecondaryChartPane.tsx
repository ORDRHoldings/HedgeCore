'use client';
/**
 * SecondaryChartPane.tsx — Independent chart panel for multi-chart grid
 *
 * Renders a full ChartEngine instance with its own symbol/timeframe state.
 * Dispatches UPDATE_SECONDARY_CHART to persist symbol/TF changes.
 * Strips down to bare minimum — no replay, no alerts, no left-rail wiring.
 */
import React, { useMemo, useCallback, useState, useRef } from 'react';
import { X, ChevronDown, Search } from 'lucide-react';
import { T } from './tokens';
import { useWorkspace } from './WorkspaceProvider';
import ChartEngine from '../chart/ChartEngine';
import { usePublicChartData } from '@/hooks/usePublicChartData';
import { useMarketWebSocket } from '@/hooks/useMarketWebSocket';
import type { Bar } from '../chart/indicators/types';
import { SYMBOL_DATA } from './workspace-data';

// ── Constants ─────────────────────────────────────────────────────────────────

const TF_MAP: Record<string, string> = {
  '1m': '1min', '3m': '3min', '5m': '5min', '15m': '15min', '30m': '30min',
  '1h': '1h', '4h': '4h', 'D': '1day', 'W': '1week',
};

const QUICK_TFS = ['5m', '15m', '30m', '1h', '4h', 'D'];

const QUICK_SYMBOLS = [
  'SPY', 'QQQ', 'AAPL', 'NVDA', 'TSLA',
  'EURUSD', 'GBPUSD', 'USDJPY',
  'BTCUSD', 'ETHUSD',
  'XAUUSD', 'XAGUSD',
];

function barLimit(tf: string): number {
  if (['1m', '3m', '5m'].includes(tf)) return 300;
  if (['15m', '30m'].includes(tf)) return 400;
  return 500;
}

// ── Symbol search dropdown ────────────────────────────────────────────────────

function SymbolDropdown({
  symbol,
  onSelect,
  onClose,
}: {
  symbol: string;
  onSelect: (s: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const known = Object.keys(SYMBOL_DATA);
  const filtered = useMemo(() => {
    const query = q.toUpperCase().trim();
    if (!query) return QUICK_SYMBOLS;
    return [...new Set([...known, ...QUICK_SYMBOLS])].filter(s => s.startsWith(query)).slice(0, 12);
  }, [q, known]);

  const commit = useCallback((s: string) => {
    onSelect(s.toUpperCase().trim());
    onClose();
  }, [onSelect, onClose]);

  return (
    <div style={{
      position: 'absolute', top: 28, left: 0, zIndex: 200,
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 4, boxShadow: T.shadowFloat, width: 160, overflow: 'hidden',
    }}>
      <div style={{ padding: '4px 6px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 4 }}>
        <Search size={10} color={T.text3} />
        <input
          ref={inputRef}
          autoFocus
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && q.trim()) commit(q);
            if (e.key === 'Escape') onClose();
          }}
          placeholder="Symbol…"
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 11, color: T.text1, fontFamily: T.mono,
          }}
        />
      </div>
      <div style={{ maxHeight: 180, overflowY: 'auto' }}>
        {filtered.map(s => (
          <div
            key={s}
            onClick={() => commit(s)}
            style={{
              padding: '5px 10px', fontSize: 11, fontFamily: T.mono,
              color: s === symbol ? T.accent : T.text1,
              background: s === symbol ? T.accentBg : 'transparent',
              cursor: 'pointer', fontWeight: s === symbol ? 600 : 400,
            }}
            onMouseEnter={e => { if (s !== symbol) (e.currentTarget as HTMLElement).style.background = T.hover; }}
            onMouseLeave={e => { if (s !== symbol) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── TF dropdown ───────────────────────────────────────────────────────────────

function TFDropdown({
  timeframe,
  onSelect,
  onClose,
}: {
  timeframe: string;
  onSelect: (tf: string) => void;
  onClose: () => void;
}) {
  return (
    <div style={{
      position: 'absolute', top: 28, left: 0, zIndex: 200,
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 4, boxShadow: T.shadowFloat, width: 80, overflow: 'hidden',
    }}>
      {QUICK_TFS.map(tf => (
        <div
          key={tf}
          onClick={() => { onSelect(tf); onClose(); }}
          style={{
            padding: '5px 10px', fontSize: 11, fontFamily: T.mono,
            color: tf === timeframe ? T.accent : T.text1,
            background: tf === timeframe ? T.accentBg : 'transparent',
            cursor: 'pointer', fontWeight: tf === timeframe ? 600 : 400,
          }}
          onMouseEnter={e => { if (tf !== timeframe) (e.currentTarget as HTMLElement).style.background = T.hover; }}
          onMouseLeave={e => { if (tf !== timeframe) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          {tf}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  id: string;
  symbol: string;
  timeframe: string;
}

export function SecondaryChartPane({ id, symbol, timeframe }: Props) {
  const { dispatch, state } = useWorkspace();
  const [showSymDrop, setShowSymDrop] = useState(false);
  const [showTFDrop,  setShowTFDrop]  = useState(false);

  const apiInterval = TF_MAP[timeframe] ?? '1day';
  const limit = barLimit(timeframe);

  const { bars: fetchedBars, loading, error, source } = usePublicChartData(symbol, apiInterval, limit);
  const { tick } = useMarketWebSocket(symbol);

  const bars = useMemo<Bar[]>(() => {
    if (!fetchedBars.length) return fetchedBars;
    if (!tick || !Number.isFinite(tick.mid) || tick.mid <= 0) return fetchedBars;
    const last = fetchedBars[fetchedBars.length - 1];
    const liveBar: Bar = {
      ...last,
      c: tick.mid,
      h: Math.max(last.h, tick.mid),
      l: Math.min(last.l, tick.mid),
    };
    const result = fetchedBars.slice();
    result[result.length - 1] = liveBar;
    return result;
  }, [fetchedBars, tick]);

  const handleSymbolSelect = useCallback((s: string) => {
    dispatch({ type: 'UPDATE_SECONDARY_CHART', id, symbol: s });
  }, [dispatch, id]);

  const handleTFSelect = useCallback((tf: string) => {
    dispatch({ type: 'UPDATE_SECONDARY_CHART', id, timeframe: tf });
  }, [dispatch, id]);

  const handlePairChange = useCallback((pair: string) => {
    dispatch({ type: 'UPDATE_SECONDARY_CHART', id, symbol: pair });
  }, [dispatch, id]);

  const lastBar = bars[bars.length - 1];
  const prevBar = bars[bars.length - 2];
  const chg = lastBar && prevBar ? (lastBar.c - prevBar.c) / prevBar.c * 100 : null;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      width: '100%', height: '100%',
      background: T.bg, overflow: 'hidden',
      border: `1px solid ${T.border}`,
      position: 'relative',
    }}>
      {/* Compact header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        height: 28, padding: '0 6px', flexShrink: 0,
        background: T.surface, borderBottom: `1px solid ${T.border}`,
      }}>
        {/* Symbol selector */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => { setShowSymDrop(v => !v); setShowTFDrop(false); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 3,
              padding: '2px 6px', borderRadius: 3,
              border: `1px solid ${T.border}`, background: T.surfaceAlt,
              color: T.text1, fontSize: 11, fontWeight: 700,
              fontFamily: T.mono, cursor: 'pointer', outline: 'none',
            }}
          >
            {symbol}
            <ChevronDown size={9} color={T.text3} />
          </button>
          {showSymDrop && (
            <SymbolDropdown symbol={symbol} onSelect={handleSymbolSelect} onClose={() => setShowSymDrop(false)} />
          )}
        </div>

        {/* TF selector */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => { setShowTFDrop(v => !v); setShowSymDrop(false); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 3,
              padding: '2px 5px', borderRadius: 3,
              border: `1px solid ${T.border}`, background: T.surfaceAlt,
              color: T.text2, fontSize: 10,
              fontFamily: T.mono, cursor: 'pointer', outline: 'none',
            }}
          >
            {timeframe}
            <ChevronDown size={8} color={T.text3} />
          </button>
          {showTFDrop && (
            <TFDropdown timeframe={timeframe} onSelect={handleTFSelect} onClose={() => setShowTFDrop(false)} />
          )}
        </div>

        {/* Price + change */}
        {lastBar && (
          <>
            <span style={{ fontSize: 11, fontFamily: T.mono, color: T.text1, fontVariantNumeric: 'tabular-nums', marginLeft: 4 }}>
              {lastBar.c < 10 ? lastBar.c.toFixed(5) : lastBar.c < 1000 ? lastBar.c.toFixed(2) : lastBar.c.toFixed(0)}
            </span>
            {chg !== null && (
              <span style={{ fontSize: 9, fontFamily: T.mono, color: chg >= 0 ? T.bull : T.bear }}>
                {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
              </span>
            )}
          </>
        )}

        <div style={{ flex: 1 }} />

        {/* Source badge */}
        {source && !loading && (
          <span style={{ fontSize: 8, color: source === 'mock' ? T.warn : T.text3, fontFamily: T.font }}>
            {source === 'mock' ? 'DEMO' : 'LIVE'}
          </span>
        )}
      </div>

      {/* Chart area */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        {loading && !fetchedBars.length && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: T.bg, color: T.text3, fontSize: 11, fontFamily: T.mono, zIndex: 5,
          }}>
            Loading…
          </div>
        )}
        {error && !fetchedBars.length && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: T.bg, color: T.bear, fontSize: 11, fontFamily: T.mono, zIndex: 5,
          }}>
            Data unavailable
          </div>
        )}
        <ChartEngine
          bars={bars}
          pair={symbol}
          interval={timeframe}
          source={source}
          loading={loading}
          error={error}
          onPairChange={handlePairChange}
          embedded
          externalConfig={{ ema20: true, trendlines: false, sr: false, fvg: false }}
          externalSubPanes={[]}
          syncCrosshair={state.crosshairSyncEnabled}
        />
      </div>
    </div>
  );
}
