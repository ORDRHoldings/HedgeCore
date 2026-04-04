'use client';
/**
 * HeatmapPanel — Market Heatmap
 *
 * Fetches the last 2 daily bars for every DEFAULT_WATCHLIST symbol and
 * renders color-coded tiles ordered by %, A–Z, or losers/gainers.
 * Click any tile to navigate the main chart to that symbol.
 * Auto-refreshes every 60 seconds.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { T } from '../tokens';
import { useWorkspace } from '../WorkspaceProvider';
import { DEFAULT_WATCHLIST, formatPrice } from '../workspace-data';

// ── Config ────────────────────────────────────────────────────────────────────

const API_BASE    = process.env.NEXT_PUBLIC_API_URL ?? 'https://hedgecore.onrender.com';
const REFRESH_MS  = 60_000;

type SortMode = 'alpha' | 'gainers' | 'losers';

// ── Types ─────────────────────────────────────────────────────────────────────

interface HeatTile {
  symbol:    string;
  name:      string;
  price:     number;
  changePct: number;
  loading:   boolean;
  error:     boolean;
}

// ── Fetch helper ──────────────────────────────────────────────────────────────

async function fetchDailyChange(symbol: string): Promise<{ price: number; changePct: number } | null> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 8_000);
  try {
    const url = `${API_BASE}/v1/public/chart-data/${encodeURIComponent(symbol)}?interval=1day&limit=2`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(tid);
    if (!res.ok) return null;
    const data = await res.json();
    const bars = data.bars ?? [];
    if (bars.length < 2) return null;
    const prev = bars[bars.length - 2].c as number;
    const last = bars[bars.length - 1].c as number;
    return { price: last, changePct: prev > 0 ? ((last - prev) / prev) * 100 : 0 };
  } catch {
    clearTimeout(tid);
    return null;
  }
}

// ── Color scale ───────────────────────────────────────────────────────────────

function tileColors(pct: number): { bg: string; fg: string } {
  if (pct >=  3.0) return { bg: 'rgba(27,94,32,0.92)',   fg: '#A5D6A7' };
  if (pct >=  1.5) return { bg: 'rgba(46,125,50,0.82)',  fg: '#C8E6C9' };
  if (pct >=  0.3) return { bg: 'rgba(76,175,80,0.52)',  fg: '#E8F5E9' };
  if (pct > -0.3)  return { bg: 'rgba(50,50,65,0.72)',   fg: '#9E9E9E' };
  if (pct > -1.5)  return { bg: 'rgba(198,40,40,0.52)',  fg: '#FFCDD2' };
  if (pct > -3.0)  return { bg: 'rgba(198,40,40,0.82)',  fg: '#FFCDD2' };
  return               { bg: 'rgba(183,28,28,0.92)',  fg: '#EF9A9A' };
}

// ── Panel ─────────────────────────────────────────────────────────────────────

const INITIAL_TILES: HeatTile[] = DEFAULT_WATCHLIST.map(w => ({
  symbol: w.symbol, name: w.name,
  price: w.price, changePct: w.changePct,
  loading: false, error: false,
}));

export function HeatmapPanel() {
  const { state, dispatch } = useWorkspace();
  const [tiles,     setTiles]     = useState<HeatTile[]>(INITIAL_TILES);
  const [sortMode,  setSortMode]  = useState<SortMode>('alpha');
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt,  setUpdatedAt]  = useState(0);
  const runningRef = useRef(false);

  const runRefresh = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRefreshing(true);

    for (const { symbol } of DEFAULT_WATCHLIST) {
      setTiles(prev => prev.map(t => t.symbol === symbol ? { ...t, loading: true } : t));
      const result = await fetchDailyChange(symbol);
      setTiles(prev => prev.map(t => t.symbol === symbol
        ? { ...t, loading: false, error: !result, price: result?.price ?? t.price, changePct: result?.changePct ?? t.changePct }
        : t
      ));
    }

    runningRef.current = false;
    setRefreshing(false);
    setUpdatedAt(Date.now());
  }, []);

  // Fetch on mount + auto-refresh
  useEffect(() => {
    runRefresh();
    const id = window.setInterval(runRefresh, REFRESH_MS);
    return () => window.clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ────────────────────────────────────────────────────────────────
  const sorted = [...tiles].sort((a, b) => {
    if (sortMode === 'gainers') return b.changePct - a.changePct;
    if (sortMode === 'losers')  return a.changePct - b.changePct;
    return a.symbol.localeCompare(b.symbol);
  });

  const gainers = tiles.filter(t => t.changePct >  0.3).length;
  const losers  = tiles.filter(t => t.changePct < -0.3).length;
  const flat    = tiles.length - gainers - losers;
  const breadthPct = tiles.length > 0 ? (gainers / tiles.length) * 100 : 50;

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
          <span style={{ fontSize: 9, color: T.bull, fontFamily: T.mono }}>▲ {gainers} up</span>
          <span style={{ fontSize: 9, color: T.text3, fontFamily: T.mono }}>— {flat} flat</span>
          <span style={{ fontSize: 9, color: T.bear, fontFamily: T.mono }}>▼ {losers} down</span>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
          {sorted.map(tile => {
            const { bg, fg } = tileColors(tile.changePct);
            const isActive = tile.symbol === state.symbol;
            return (
              <button
                key={tile.symbol}
                onClick={() => dispatch({ type: 'SET_SYMBOL', symbol: tile.symbol })}
                title={`${tile.name}  ${tile.changePct >= 0 ? '+' : ''}${tile.changePct.toFixed(2)}%`}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: 2,
                  padding: '8px 3px', minHeight: 58,
                  borderRadius: 4,
                  border: isActive
                    ? `2px solid ${T.accent}`
                    : '1px solid rgba(255,255,255,0.06)',
                  background: tile.loading ? T.border : bg,
                  opacity: tile.loading ? 0.55 : 1,
                  cursor: 'pointer', outline: 'none',
                  transition: 'transform 0.1s, opacity 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.opacity = '0.85'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = tile.loading ? '0.55' : '1'; }}
              >
                <span style={{ fontSize: 9, fontWeight: 700, color: fg, fontFamily: T.mono, letterSpacing: '0.02em', lineHeight: 1 }}>
                  {tile.symbol.length > 6 ? tile.symbol.slice(0, 6) : tile.symbol}
                </span>
                <span style={{ fontSize: 8, color: fg, fontFamily: T.mono, opacity: 0.8, lineHeight: 1 }}>
                  {formatPrice(tile.price)}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: fg, fontFamily: T.mono, lineHeight: 1,
                  marginTop: 1,
                }}>
                  {tile.changePct >= 0 ? '+' : ''}{tile.changePct.toFixed(2)}%
                </span>
                {tile.error && (
                  <span style={{ fontSize: 7, color: T.bear, fontFamily: T.font, opacity: 0.7 }}>n/a</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '4px 10px', borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
        <span style={{ fontSize: 8, color: T.text3, fontFamily: T.font }}>
          Daily % change · auto-refresh 60s · click tile to navigate
        </span>
      </div>
    </div>
  );
}
