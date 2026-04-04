'use client';
/**
 * HeatmapPanel — Market Heatmap (S70 revamp)
 *
 * Fetches 8 daily bars per symbol (7 for sparkline + 1 prior for % change).
 * Renders color-coded tiles with an inline SVG sparkline showing the 7-day
 * price trend, category filter tabs, and sort controls.
 *
 * Primary: TD proxy `/api/chart-data/`
 * Fallback: hedgecore `/v1/public/chart-data/`
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { T } from '../tokens';
import { useWorkspace } from '../WorkspaceProvider';
import { DEFAULT_WATCHLIST, formatPrice } from '../workspace-data';

// ── Config ────────────────────────────────────────────────────────────────────

const API_BASE   = process.env.NEXT_PUBLIC_API_URL ?? 'https://hedgecore.onrender.com';
const REFRESH_MS = 60_000;
const SPARK_BARS = 7; // number of bars shown in sparkline

type SortMode    = 'alpha' | 'gainers' | 'losers';
type CategoryTab = 'All' | 'ETF' | 'Tech' | 'Metals' | 'Crypto';

const CATEGORY_TABS: CategoryTab[] = ['All', 'ETF', 'Tech', 'Metals', 'Crypto'];

// ── Types ─────────────────────────────────────────────────────────────────────

interface HeatTile {
  symbol:    string;
  name:      string;
  category:  string;
  price:     number;
  changePct: number;
  spark:     number[];   // last SPARK_BARS close prices
  loading:   boolean;
  error:     boolean;
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchTileData(symbol: string): Promise<{ price: number; changePct: number; spark: number[] } | null> {
  const limit = SPARK_BARS + 1; // extra bar for % change against prior close
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 8_000);

  // Try TD proxy first
  try {
    const res = await fetch(`/api/chart-data/${encodeURIComponent(symbol)}?interval=1day&limit=${limit}`, { signal: controller.signal });
    clearTimeout(tid);
    if (res.ok) {
      const data = await res.json();
      const bars: { c: number }[] = data.bars ?? [];
      if (bars.length >= 2) {
        const closes = bars.map(b => b.c).filter(v => v > 0);
        const last  = closes[closes.length - 1];
        const prev  = closes[closes.length - 2];
        return { price: last, changePct: prev > 0 ? ((last - prev) / prev) * 100 : 0, spark: closes.slice(-SPARK_BARS) };
      }
    }
  } catch { clearTimeout(tid); }

  // Fallback: hedgecore
  try {
    const res2 = await fetch(`${API_BASE}/v1/public/chart-data/${encodeURIComponent(symbol)}?interval=1day&limit=${limit}`);
    if (res2.ok) {
      const data = await res2.json();
      const bars: { c: number }[] = data.bars ?? [];
      if (bars.length >= 2) {
        const closes = bars.map(b => b.c).filter(v => v > 0);
        const last  = closes[closes.length - 1];
        const prev  = closes[closes.length - 2];
        return { price: last, changePct: prev > 0 ? ((last - prev) / prev) * 100 : 0, spark: closes.slice(-SPARK_BARS) };
      }
    }
  } catch { /* no data */ }
  return null;
}

// ── Sparkline SVG ─────────────────────────────────────────────────────────────

function Sparkline({ closes, width, height, color }: { closes: number[]; width: number; height: number; color: string }) {
  if (closes.length < 2) return null;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const step = w / (closes.length - 1);

  const pts = closes.map((v, i) => {
    const x = pad + i * step;
    const y = pad + h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const d = 'M' + pts.join('L');

  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
    </svg>
  );
}

// ── Color scale ───────────────────────────────────────────────────────────────

function tileColors(pct: number): { bg: string; fg: string; spark: string } {
  if (pct >=  3.0) return { bg: 'rgba(27,94,32,0.92)',   fg: '#A5D6A7', spark: '#69F0AE' };
  if (pct >=  1.5) return { bg: 'rgba(46,125,50,0.82)',  fg: '#C8E6C9', spark: '#A5D6A7' };
  if (pct >=  0.3) return { bg: 'rgba(76,175,80,0.52)',  fg: '#E8F5E9', spark: '#81C784' };
  if (pct > -0.3)  return { bg: 'rgba(50,50,65,0.72)',   fg: '#9E9E9E', spark: '#90A4AE' };
  if (pct > -1.5)  return { bg: 'rgba(198,40,40,0.52)',  fg: '#FFCDD2', spark: '#EF9A9A' };
  if (pct > -3.0)  return { bg: 'rgba(198,40,40,0.82)',  fg: '#FFCDD2', spark: '#EF5350' };
  return               { bg: 'rgba(183,28,28,0.92)',  fg: '#EF9A9A', spark: '#E53935' };
}

// ── Panel ─────────────────────────────────────────────────────────────────────

const INITIAL_TILES: HeatTile[] = DEFAULT_WATCHLIST.map(w => ({
  symbol: w.symbol, name: w.name, category: w.category,
  price: w.price, changePct: w.changePct,
  spark: [], loading: false, error: false,
}));

export function HeatmapPanel() {
  const { state, dispatch } = useWorkspace();
  const [tiles,     setTiles]     = useState<HeatTile[]>(INITIAL_TILES);
  const [sortMode,  setSortMode]  = useState<SortMode>('gainers');
  const [catTab,    setCatTab]    = useState<CategoryTab>('All');
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt,  setUpdatedAt]  = useState(0);
  const runningRef = useRef(false);

  const runRefresh = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRefreshing(true);
    setTiles(prev => prev.map(t => ({ ...t, loading: true })));

    const results = await Promise.all(
      DEFAULT_WATCHLIST.map(async ({ symbol }) => ({ symbol, result: await fetchTileData(symbol) }))
    );

    setTiles(prev => prev.map(t => {
      const found = results.find(r => r.symbol === t.symbol);
      if (!found) return { ...t, loading: false };
      const { result } = found;
      return { ...t, loading: false, error: !result,
        price: result?.price ?? t.price,
        changePct: result?.changePct ?? t.changePct,
        spark: result?.spark ?? t.spark,
      };
    }));

    runningRef.current = false;
    setRefreshing(false);
    setUpdatedAt(Date.now());
  }, []);

  useEffect(() => {
    runRefresh();
    const id = window.setInterval(runRefresh, REFRESH_MS);
    return () => window.clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return catTab === 'All' ? tiles : tiles.filter(t => t.category === catTab);
  }, [tiles, catTab]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortMode === 'gainers') return b.changePct - a.changePct;
      if (sortMode === 'losers')  return a.changePct - b.changePct;
      return a.symbol.localeCompare(b.symbol);
    });
  }, [filtered, sortMode]);

  const gainers = filtered.filter(t => t.changePct >  0.3).length;
  const losers  = filtered.filter(t => t.changePct < -0.3).length;
  const flat    = filtered.length - gainers - losers;
  const breadthPct = filtered.length > 0 ? (gainers / filtered.length) * 100 : 50;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ padding: '8px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: T.text1, fontFamily: T.font, flex: 1 }}>
            Market Heatmap
          </span>
          {updatedAt > 0 && (
            <span style={{ fontSize: 8, color: T.text3, fontFamily: T.mono }}>
              {new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={runRefresh}
            disabled={refreshing}
            title="Refresh prices"
            style={{
              display: 'flex', alignItems: 'center', gap: 3,
              padding: '2px 7px', borderRadius: 3,
              border: `1px solid ${T.border}`, background: 'transparent',
              color: refreshing ? T.text3 : T.text2, fontSize: 9,
              cursor: refreshing ? 'not-allowed' : 'pointer',
              fontFamily: T.font, outline: 'none',
            }}
          >
            <RefreshCw size={9} />
            {refreshing ? '…' : 'Refresh'}
          </button>
        </div>

        {/* Breadth bar */}
        <div style={{ height: 4, borderRadius: 2, background: T.border, overflow: 'hidden', marginBottom: 5 }}>
          <div style={{ height: '100%', width: `${breadthPct}%`, background: T.bull, transition: 'width 0.4s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 9, color: T.bull,  fontFamily: T.mono }}>▲ {gainers} up</span>
          <span style={{ fontSize: 9, color: T.text3, fontFamily: T.mono }}>— {flat} flat</span>
          <span style={{ fontSize: 9, color: T.bear,  fontFamily: T.mono }}>▼ {losers} down</span>
        </div>

        {/* Category tabs */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 6, flexWrap: 'wrap' }}>
          {CATEGORY_TABS.map(cat => (
            <button
              key={cat}
              onClick={() => setCatTab(cat)}
              style={{
                padding: '2px 6px', borderRadius: 3, fontSize: 9, fontWeight: 600,
                border: `1px solid ${catTab === cat ? T.accent : T.border}`,
                background: catTab === cat ? T.accentBg : 'transparent',
                color: catTab === cat ? T.accent : T.text3,
                cursor: 'pointer', fontFamily: T.font, outline: 'none',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Sort tabs */}
        <div style={{ display: 'flex', gap: 2 }}>
          {([['alpha', 'A–Z'], ['gainers', '▲ Best'], ['losers', '▼ Worst']] as [SortMode, string][]).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setSortMode(m)}
              style={{
                flex: 1, padding: '3px 0', borderRadius: 3,
                fontSize: 9, fontWeight: 600,
                border: `1px solid ${sortMode === m ? T.accent : T.border}`,
                background: sortMode === m ? T.accentBg : 'transparent',
                color: sortMode === m ? T.accent : T.text3,
                cursor: 'pointer', fontFamily: T.font, outline: 'none',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tile grid ──────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 5 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 5 }}>
          {sorted.map(tile => {
            const { bg, fg, spark: sparkColor } = tileColors(tile.changePct);
            const isActive = tile.symbol === state.symbol;
            const sym = tile.symbol.length > 7 ? tile.symbol.slice(0, 7) : tile.symbol;
            return (
              <button
                key={tile.symbol}
                onClick={() => dispatch({ type: 'SET_SYMBOL', symbol: tile.symbol })}
                title={`${tile.name}  ${tile.changePct >= 0 ? '+' : ''}${tile.changePct.toFixed(2)}%`}
                style={{
                  display: 'flex', flexDirection: 'column',
                  padding: '7px 8px', borderRadius: 5,
                  border: isActive ? `2px solid ${T.accent}` : '1px solid rgba(255,255,255,0.06)',
                  background: tile.loading ? T.border : bg,
                  opacity: tile.loading ? 0.55 : 1,
                  cursor: 'pointer', outline: 'none', textAlign: 'left',
                  transition: 'transform 0.1s, opacity 0.15s',
                  minHeight: 72,
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
                {/* Top row: symbol + % change */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: fg, fontFamily: T.mono, letterSpacing: '0.02em' }}>
                    {sym}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: fg, fontFamily: T.mono }}>
                    {tile.changePct >= 0 ? '+' : ''}{tile.changePct.toFixed(2)}%
                  </span>
                </div>
                {/* Price */}
                <span style={{ fontSize: 8, color: fg, fontFamily: T.mono, opacity: 0.75, marginBottom: 4 }}>
                  {formatPrice(tile.price)}
                </span>
                {/* Sparkline */}
                {tile.spark.length >= 2 && (
                  <Sparkline closes={tile.spark} width={90} height={22} color={sparkColor} />
                )}
                {tile.error && !tile.loading && (
                  <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.4)', fontFamily: T.font, marginTop: 2 }}>n/a</span>
                )}
              </button>
            );
          })}
        </div>
        {sorted.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: T.text3, fontSize: 11, fontFamily: T.font }}>
            No symbols in category
          </div>
        )}
      </div>

      <div style={{ padding: '4px 10px', borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
        <span style={{ fontSize: 8, color: T.text3, fontFamily: T.font }}>
          7-day sparkline · daily % change · auto-refresh 60s
        </span>
      </div>
    </div>
  );
}
