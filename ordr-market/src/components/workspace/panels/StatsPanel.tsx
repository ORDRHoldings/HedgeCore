'use client';
/**
 * StatsPanel — Symbol Price Statistics
 *
 * Fetches 252 daily bars (≈1 year) via TD proxy and computes:
 *  - 52-week high / low + current price position bar
 *  - ATR(14) absolute + as % of price
 *  - Average daily range over 20 / 50 / 100 bars
 *  - Day-of-week win-rate heatmap (Mon–Fri from last 100 bars)
 *
 * Primary: /api/chart-data/{symbol}?interval=1day&limit=252
 * Fallback: hedgecore /v1/public/chart-data/
 */
import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, TrendingUp } from 'lucide-react';
import { T } from '../tokens';
import { useWorkspace } from '../WorkspaceProvider';
import { formatPrice } from '../workspace-data';

// ── Config ────────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'https://hedgecore.onrender.com';
const LIMIT     = 252;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Bar { t: number; o: number; h: number; l: number; c: number; v?: number }

interface Stats {
  price:     number;
  high52:    number;
  low52:     number;
  atr14:     number;
  atrPct:    number;
  // Average range over N bars (H-L as % of close)
  adr20:     number;
  adr50:     number;
  adr100:    number;
  // Day-of-week win rate (0=Sun…6=Sat, we use 1–5)
  dowWinRate: Record<number, { wins: number; total: number }>;
  // 1-day / 5-day / 20-day change
  chg1d:  number;
  chg5d:  number;
  chg20d: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeATR(bars: Bar[], period = 14): number {
  if (bars.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].h - bars[i].l,
      Math.abs(bars[i].h - bars[i - 1].c),
      Math.abs(bars[i].l - bars[i - 1].c),
    );
    trs.push(tr);
  }
  // Simple average of last `period` TRs (Wilder uses smoothed, but simple is fine here)
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function avgDailyRange(bars: Bar[], n: number): number {
  const slice = bars.slice(-n);
  if (slice.length === 0) return 0;
  const ranges = slice.map(b => b.c > 0 ? ((b.h - b.l) / b.c) * 100 : 0);
  return ranges.reduce((a, b) => a + b, 0) / ranges.length;
}

function dowWinRates(bars: Bar[]): Record<number, { wins: number; total: number }> {
  const result: Record<number, { wins: number; total: number }> = {
    1: { wins: 0, total: 0 },
    2: { wins: 0, total: 0 },
    3: { wins: 0, total: 0 },
    4: { wins: 0, total: 0 },
    5: { wins: 0, total: 0 },
  };
  const slice = bars.slice(-100);
  for (let i = 1; i < slice.length; i++) {
    const d = new Date(slice[i].t * 1000).getDay();
    if (d < 1 || d > 5) continue;
    result[d].total++;
    if (slice[i].c > slice[i - 1].c) result[d].wins++;
  }
  return result;
}

function computeStats(bars: Bar[]): Stats {
  const last = bars[bars.length - 1];
  const price = last.c;
  const highs = bars.map(b => b.h);
  const lows  = bars.map(b => b.l);
  const high52 = Math.max(...highs);
  const low52  = Math.min(...lows);

  const atr14  = computeATR(bars, 14);
  const atrPct = price > 0 ? (atr14 / price) * 100 : 0;

  const adr20  = avgDailyRange(bars, 20);
  const adr50  = avgDailyRange(bars, 50);
  const adr100 = avgDailyRange(bars, 100);

  const chg1d  = bars.length >= 2  ? ((price - bars[bars.length - 2].c)   / bars[bars.length - 2].c)   * 100 : 0;
  const chg5d  = bars.length >= 6  ? ((price - bars[bars.length - 6].c)   / bars[bars.length - 6].c)   * 100 : 0;
  const chg20d = bars.length >= 21 ? ((price - bars[bars.length - 21].c)  / bars[bars.length - 21].c)  * 100 : 0;

  return { price, high52, low52, atr14, atrPct, adr20, adr50, adr100, dowWinRate: dowWinRates(bars), chg1d, chg5d, chg20d };
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

async function fetchStats(symbol: string): Promise<Stats | null> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`/api/chart-data/${encodeURIComponent(symbol)}?interval=1day&limit=${LIMIT}`, { signal: controller.signal });
    clearTimeout(tid);
    if (res.ok) {
      const data = await res.json();
      const bars: Bar[] = data.bars ?? [];
      if (bars.length >= 20) return computeStats(bars);
    }
  } catch { clearTimeout(tid); }

  try {
    const res2 = await fetch(`${API_BASE}/v1/public/chart-data/${encodeURIComponent(symbol)}?interval=1day&limit=${LIMIT}`);
    if (res2.ok) {
      const data = await res2.json();
      const bars: Bar[] = data.bars ?? [];
      if (bars.length >= 20) return computeStats(bars);
    }
  } catch { /* */ }
  return null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

const DOW_LABELS: Record<number, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri' };

function StatRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 10px', borderBottom: `1px solid ${T.border}` }}>
      <span style={{ fontSize: 9, color: T.text3, fontFamily: T.font }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: T.text1, fontFamily: T.mono }}>{value}</span>
        {sub && <span style={{ fontSize: 8, color: T.text3, fontFamily: T.mono, marginLeft: 4 }}>{sub}</span>}
      </div>
    </div>
  );
}

function ChangeChip({ pct }: { pct: number }) {
  const color = pct > 0 ? T.bull : pct < 0 ? T.bear : T.text3;
  return (
    <span style={{ fontSize: 9, fontWeight: 600, color, fontFamily: T.mono }}>
      {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
    </span>
  );
}

function RangeBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ height: 4, borderRadius: 2, background: T.border, overflow: 'hidden', margin: '4px 10px 6px', position: 'relative' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${clamped}%`, background: T.accent }} />
      <div style={{ position: 'absolute', left: `${clamped}%`, top: -2, width: 2, height: 8, background: T.text1, borderRadius: 1 }} />
    </div>
  );
}

function DowHeatmap({ wr }: { wr: Record<number, { wins: number; total: number }> }) {
  return (
    <div style={{ display: 'flex', gap: 3, padding: '6px 10px 8px' }}>
      {([1, 2, 3, 4, 5] as const).map(d => {
        const { wins, total } = wr[d];
        const rate = total > 0 ? wins / total : 0.5;
        const intensity = (rate - 0.5) * 2; // -1..+1
        const bg = intensity > 0
          ? `rgba(38,166,154,${Math.min(0.85, 0.15 + intensity * 0.7)})`
          : `rgba(239,83,80,${Math.min(0.85, 0.15 + Math.abs(intensity) * 0.7)})`;
        return (
          <div
            key={d}
            title={`${DOW_LABELS[d]}: ${wins}/${total} (${(rate * 100).toFixed(0)}%)`}
            style={{ flex: 1, borderRadius: 3, background: total === 0 ? T.border : bg, padding: '5px 2px', textAlign: 'center' }}
          >
            <div style={{ fontSize: 8, fontWeight: 600, color: total === 0 ? T.text3 : '#fff', fontFamily: T.font }}>{DOW_LABELS[d]}</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: total === 0 ? T.text3 : '#fff', fontFamily: T.mono, marginTop: 2 }}>
              {total === 0 ? '—' : `${(rate * 100).toFixed(0)}%`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function StatsPanel() {
  const { state } = useWorkspace();
  const [stats,     setStats]     = useState<Stats | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [loadedSym, setLoadedSym] = useState('');
  const [adPeriod,  setAdPeriod]  = useState<20 | 50 | 100>(20);

  const load = useCallback(async (sym: string) => {
    setLoading(true);
    const s = await fetchStats(sym);
    setStats(s);
    setLoadedSym(sym);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (state.symbol !== loadedSym) load(state.symbol);
  }, [state.symbol, loadedSym, load]);

  const range52Pct = stats && stats.high52 > stats.low52
    ? ((stats.price - stats.low52) / (stats.high52 - stats.low52)) * 100
    : 50;
  const adr = stats ? (adPeriod === 20 ? stats.adr20 : adPeriod === 50 ? stats.adr50 : stats.adr100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '8px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        <TrendingUp size={12} color={T.text2} />
        <span style={{ fontSize: 11, fontWeight: 600, color: T.text1, fontFamily: T.font, flex: 1 }}>
          {state.symbol} Statistics
        </span>
        <button
          onClick={() => load(state.symbol)}
          disabled={loading}
          title="Refresh"
          style={{ border: `1px solid ${T.border}`, background: 'transparent', color: T.text2, borderRadius: 3, padding: '2px 6px', cursor: loading ? 'not-allowed' : 'pointer', outline: 'none', display: 'flex', alignItems: 'center', gap: 3 }}
        >
          <RefreshCw size={9} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: '20px 10px', textAlign: 'center', color: T.text3, fontSize: 10, fontFamily: T.font }}>Loading…</div>
        )}

        {!loading && !stats && (
          <div style={{ padding: '20px 10px', textAlign: 'center', color: T.text3, fontSize: 10, fontFamily: T.font }}>No data available</div>
        )}

        {!loading && stats && (
          <>
            {/* Price + changes */}
            <div style={{ padding: '8px 10px 4px', borderBottom: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.text1, fontFamily: T.mono, marginBottom: 4 }}>
                {formatPrice(stats.price)}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ fontSize: 8, color: T.text3, fontFamily: T.font }}>1D: <ChangeChip pct={stats.chg1d} /></div>
                <div style={{ fontSize: 8, color: T.text3, fontFamily: T.font }}>1W: <ChangeChip pct={stats.chg5d} /></div>
                <div style={{ fontSize: 8, color: T.text3, fontFamily: T.font }}>1M: <ChangeChip pct={stats.chg20d} /></div>
              </div>
            </div>

            {/* 52-week range */}
            <div style={{ borderBottom: `1px solid ${T.border}`, paddingTop: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 10px 2px' }}>
                <span style={{ fontSize: 8, color: T.text3, fontFamily: T.font }}>52-WEEK RANGE</span>
                <span style={{ fontSize: 8, color: T.text3, fontFamily: T.mono }}>{range52Pct.toFixed(0)}% of range</span>
              </div>
              <RangeBar pct={range52Pct} />
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 10px 6px' }}>
                <span style={{ fontSize: 8, color: T.bear, fontFamily: T.mono }}>{formatPrice(stats.low52)}</span>
                <span style={{ fontSize: 8, color: T.bull, fontFamily: T.mono }}>{formatPrice(stats.high52)}</span>
              </div>
            </div>

            {/* ATR */}
            <StatRow label="ATR(14)" value={formatPrice(stats.atr14)} sub={`${stats.atrPct.toFixed(2)}%`} />

            {/* Average Daily Range with period selector */}
            <div style={{ padding: '4px 10px', borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 9, color: T.text3, fontFamily: T.font }}>Avg Daily Range</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  {([20, 50, 100] as const).map(p => (
                    <button key={p} onClick={() => setAdPeriod(p)} style={{
                      padding: '1px 5px', borderRadius: 2, fontSize: 8,
                      border: `1px solid ${adPeriod === p ? T.accent : T.border}`,
                      background: adPeriod === p ? T.accentBg : 'transparent',
                      color: adPeriod === p ? T.accent : T.text3,
                      cursor: 'pointer', fontFamily: T.mono, outline: 'none',
                    }}>{p}d</button>
                  ))}
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.text1, fontFamily: T.mono }}>
                {adr.toFixed(2)}%
              </span>
            </div>

            {/* Day-of-week section */}
            <div style={{ borderBottom: `1px solid ${T.border}`, paddingTop: 6 }}>
              <div style={{ padding: '0 10px 4px' }}>
                <span style={{ fontSize: 8, color: T.text3, fontFamily: T.font, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Day-of-Week Win Rate (last 100 bars)
                </span>
              </div>
              <DowHeatmap wr={stats.dowWinRate} />
            </div>
          </>
        )}
      </div>

      <div style={{ padding: '4px 10px', borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
        <span style={{ fontSize: 8, color: T.text3, fontFamily: T.font }}>252 daily bars · auto-loads on symbol change</span>
      </div>
    </div>
  );
}
