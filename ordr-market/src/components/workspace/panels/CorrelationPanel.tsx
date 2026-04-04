'use client';
/**
 * CorrelationPanel — FX Pair Correlation Matrix
 *
 * Fetches daily bars for 10 FX pairs and renders a pairwise Pearson
 * correlation matrix.  Cells are color-coded:
 *   +1  → deep green   (co-directional)
 *    0  → neutral grey (uncorrelated)
 *   -1  → deep red     (counter-directional)
 *
 * Diagonal shows 1.00 (self-correlation).
 * Period selector: 20 / 50 / 100 bars.
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { GitBranch, RefreshCw } from 'lucide-react';
import { T } from '../tokens';

// ── Symbols ───────────────────────────────────────────────────────────────────

const FX_PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'NZD/USD', 'USD/CAD', 'EUR/JPY', 'GBP/JPY', 'EUR/GBP'];
const SHORT = ['EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'NZD', 'CAD', 'EURJ', 'GBPJ', 'EURG'];

const PERIODS: { label: string; bars: number }[] = [
  { label: '20', bars: 20 },
  { label: '50', bars: 50 },
  { label: '100', bars: 100 },
];

// ── Math ──────────────────────────────────────────────────────────────────────

function pearson(a: number[], b: number[], n: number): number {
  let sumA = 0, sumB = 0;
  for (let i = 0; i < n; i++) { sumA += a[i]; sumB += b[i]; }
  const mA = sumA / n, mB = sumB / n;
  let num = 0, dA = 0, dB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - mA, db = b[i] - mB;
    num += da * db; dA += da * da; dB += db * db;
  }
  return dA > 0 && dB > 0 ? num / Math.sqrt(dA * dB) : 0;
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'https://hedgecore.onrender.com';

async function fetchCloses(symbol: string, limit: number): Promise<number[]> {
  const tdSymbol = symbol.replace('/', '');
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 8_000);

  // Try TD proxy first
  try {
    const res = await fetch(`/api/chart-data/${encodeURIComponent(tdSymbol)}?interval=1day&limit=${limit}`, { signal: controller.signal });
    clearTimeout(tid);
    if (res.ok) {
      const data = await res.json();
      const bars = data.bars ?? [];
      return bars.map((b: { c: number }) => b.c).filter((v: number) => v > 0);
    }
  } catch { clearTimeout(tid); }

  // Fallback: hedgecore
  try {
    const res2 = await fetch(`${API_BASE}/v1/public/chart-data/${encodeURIComponent(tdSymbol)}?interval=1day&limit=${limit}`);
    if (res2.ok) {
      const data = await res2.json();
      const bars = data.bars ?? [];
      return bars.map((b: { c: number }) => b.c).filter((v: number) => v > 0);
    }
  } catch { /* fall through */ }
  return [];
}

// ── Color ─────────────────────────────────────────────────────────────────────

function corrColor(r: number, isDiag: boolean): { bg: string; fg: string } {
  if (isDiag) return { bg: 'rgba(41,98,255,0.18)', fg: '#90CAF9' };
  if (r >= 0.8)  return { bg: 'rgba(27,94,32,0.85)',   fg: '#A5D6A7' };
  if (r >= 0.5)  return { bg: 'rgba(46,125,50,0.55)',  fg: '#C8E6C9' };
  if (r >= 0.2)  return { bg: 'rgba(76,175,80,0.30)',  fg: '#E8F5E9' };
  if (r > -0.2)  return { bg: 'rgba(50,50,65,0.50)',   fg: '#9E9E9E' };
  if (r > -0.5)  return { bg: 'rgba(198,40,40,0.30)',  fg: '#FFCDD2' };
  if (r > -0.8)  return { bg: 'rgba(198,40,40,0.55)',  fg: '#FFCDD2' };
  return               { bg: 'rgba(183,28,28,0.85)',  fg: '#EF9A9A' };
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function CorrelationPanel() {
  const [period,   setPeriod]   = useState(50);
  const [closes,   setCloses]   = useState<Map<string, number[]>>(new Map());
  const [loading,  setLoading]  = useState(false);
  const [loadedAt, setLoadedAt] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    setLoading(true);
    const results = await Promise.all(FX_PAIRS.map(sym => fetchCloses(sym, period + 5)));
    const map = new Map<string, number[]>();
    FX_PAIRS.forEach((sym, i) => { if (results[i].length >= period) map.set(sym, results[i].slice(-period)); });
    setCloses(map);
    setLoadedAt(Date.now());
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  // Compute NxN matrix
  const matrix = useMemo(() => {
    return FX_PAIRS.map(a =>
      FX_PAIRS.map(b => {
        const ca = closes.get(a), cb = closes.get(b);
        if (!ca || !cb || ca.length < 2) return null;
        const n = Math.min(ca.length, cb.length);
        return pearson(ca, cb, n);
      })
    );
  }, [closes]);

  const CELL = 36; // px

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '8px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <GitBranch size={12} color={T.text2} />
        <span style={{ fontSize: 11, fontWeight: 600, color: T.text1, fontFamily: T.font, flex: 1 }}>
          Correlation Matrix
        </span>
        <button
          title="Reload correlation data"
          onClick={load}
          disabled={loading}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: T.text3, lineHeight: 0 }}
        >
          <RefreshCw size={11} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* Period selector */}
      <div style={{ padding: '6px 10px', borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 9, color: T.text3, fontFamily: T.font, marginRight: 4 }}>PERIOD:</span>
        {PERIODS.map(p => (
          <button
            key={p.bars}
            onClick={() => setPeriod(p.bars)}
            style={{
              height: 20, padding: '0 7px', borderRadius: 3,
              border: `1px solid ${period === p.bars ? T.accent : T.border}`,
              background: period === p.bars ? T.accentBg : 'transparent',
              color: period === p.bars ? T.accent : T.text3,
              fontSize: 9, fontWeight: 600, cursor: 'pointer', outline: 'none',
              fontFamily: T.mono,
            }}
          >
            {p.label}d
          </button>
        ))}
        {loadedAt > 0 && (
          <span style={{ fontSize: 8, color: T.text3, fontFamily: T.font, marginLeft: 'auto' }}>
            {new Date(loadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: '8px' }}>
        {loading && closes.size === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 0', color: T.text3, fontSize: 11, fontFamily: T.font }}>
            Loading…
          </div>
        ) : (
          <div>
            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              {[['−1.0', 'rgba(183,28,28,0.85)', '#EF9A9A'],
                ['0.0',  'rgba(50,50,65,0.50)',  '#9E9E9E'],
                ['+1.0', 'rgba(27,94,32,0.85)',  '#A5D6A7']].map(([lbl, bg, fg]) => (
                <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: bg }} />
                  <span style={{ fontSize: 8, color: fg as string, fontFamily: T.mono }}>{lbl}</span>
                </div>
              ))}
              <span style={{ fontSize: 8, color: T.text3, fontFamily: T.font, marginLeft: 'auto' }}>daily</span>
            </div>

            {/* Matrix table */}
            <div style={{ display: 'inline-block' }}>
              {/* Column headers */}
              <div style={{ display: 'flex', marginLeft: CELL + 2 }}>
                {FX_PAIRS.map((sym, ci) => (
                  <div key={ci} style={{
                    width: CELL, textAlign: 'center',
                    fontSize: 7, fontWeight: 700, color: T.text3,
                    fontFamily: T.mono, letterSpacing: '0.03em',
                    marginRight: 2, marginBottom: 2,
                    overflow: 'hidden', whiteSpace: 'nowrap',
                  }}>
                    {SHORT[ci]}
                  </div>
                ))}
              </div>

              {/* Rows */}
              {FX_PAIRS.map((rowSym, ri) => (
                <div key={ri} style={{ display: 'flex', alignItems: 'center', marginBottom: 2 }}>
                  {/* Row label */}
                  <div style={{
                    width: CELL, fontSize: 7, fontWeight: 700, color: T.text2,
                    fontFamily: T.mono, letterSpacing: '0.03em',
                    marginRight: 2, textAlign: 'right', paddingRight: 4,
                    flexShrink: 0,
                  }}>
                    {SHORT[ri]}
                  </div>
                  {/* Cells */}
                  {FX_PAIRS.map((colSym, ci) => {
                    const r = matrix[ri][ci];
                    const isDiag = ri === ci;
                    const { bg, fg } = corrColor(r ?? 0, isDiag);
                    const display = r === null ? '—' : isDiag ? '1.00' : (r >= 0 ? '+' : '') + r.toFixed(2);
                    return (
                      <div
                        key={ci}
                        title={r !== null && !isDiag ? `${rowSym} vs ${colSym}: ${r.toFixed(3)}` : rowSym}
                        style={{
                          width: CELL, height: CELL, borderRadius: 3,
                          background: bg, marginRight: 2,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 8, fontWeight: 700, color: fg,
                          fontFamily: T.mono, cursor: 'default',
                          flexShrink: 0,
                        }}
                      >
                        {display}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Full pair legend */}
            <div style={{ marginTop: 10, borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
              {FX_PAIRS.map((sym, i) => (
                <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 2, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 8, fontWeight: 700, color: T.accent, fontFamily: T.mono, width: 28 }}>{SHORT[i]}</span>
                  <span style={{ fontSize: 8, color: T.text3, fontFamily: T.font }}>{sym}</span>
                  {!closes.has(sym) && (
                    <span style={{ fontSize: 7, color: T.bear, fontFamily: T.font }}>no data</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* CSS keyframes for loading spinner */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
