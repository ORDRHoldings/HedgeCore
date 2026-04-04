'use client';
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Loader, ScanLine, ArrowRight } from 'lucide-react';
import { Bell, X } from 'lucide-react';
import { T } from '../tokens';
import { useWorkspace } from '../WorkspaceProvider';
import { SCREENER_UNIVERSE, type ScreenerCategory } from '../workspace-data';
import { usePublicChartData } from '@/hooks/usePublicChartData';

// ── Scanner API ───────────────────────────────────────────────────────────────

async function fetchFilterBars(symbol: string, interval: string): Promise<Bar[]> {
  try {
    const res = await fetch(`/api/chart-data/${encodeURIComponent(symbol)}?interval=${interval}&limit=150`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.bars ?? [];
  } catch { return []; }
}
import { detectFVG } from '@/components/chart/detection/fvg';
import { detectMarketStructure } from '@/components/chart/detection/market-structure';
import { detectPatterns } from '@/components/chart/detection/patterns';
import { detectDivergence } from '@/components/chart/detection/divergence';
import { emaFromValues } from '@/components/chart/indicators/ema';
import { computeRSI } from '@/components/chart/indicators/rsi';
import { computeMACD } from '@/components/chart/indicators/macd';
import { computeBollinger } from '@/components/chart/indicators/bollinger';
import { computeStochastic } from '@/components/chart/indicators/stochastic';
import type { Bar } from '@/components/chart/indicators/types';

// ── Filter types ──────────────────────────────────────────────────────────────
interface FilterCriteria {
  rsiMin:    number | null;
  rsiMax:    number | null;
  macdDir:   'bull' | 'bear' | 'any';
  emaPos:    'above' | 'below' | 'any';
  bbMax:     number | null;
  bbMin:     number | null;
  stochMax:  number | null;
  stochMin:  number | null;
  structDir: 'bull' | 'bear' | 'any';
  volumeMin: number | null;
}

const EMPTY_CRITERIA: FilterCriteria = {
  rsiMin: null, rsiMax: null, macdDir: 'any', emaPos: 'any',
  bbMax: null, bbMin: null, stochMax: null, stochMin: null,
  structDir: 'any', volumeMin: null,
};

interface FilterSnapshot {
  rsi:       number | null;
  macdHist:  number | null;
  macdDir:   'bull' | 'bear' | 'neutral';
  emaPct:    number | null;
  bbPos:     number | null;
  stochK:    number | null;
  structDir: 'bull' | 'bear' | 'neutral';
  volRatio:  number | null;
}

interface FilterResult extends FilterSnapshot {
  symbol: string;
}

// Preset filter sets
interface FilterPreset {
  id: string; name: string; desc: string; color: string;
  criteria: Partial<FilterCriteria>;
}
const FILTER_PRESETS: FilterPreset[] = [
  {
    id: 'oversold', name: 'Oversold Bounce', color: '#26A69A',
    desc: 'RSI<35 · Stoch<25 · BB<30%',
    criteria: { rsiMax: 35, stochMax: 25, bbMax: 30 },
  },
  {
    id: 'momentum', name: 'Momentum Bull', color: '#2962FF',
    desc: 'EMA above · MACD bull · RSI 45–65',
    criteria: { emaPos: 'above', macdDir: 'bull', rsiMin: 45, rsiMax: 65 },
  },
  {
    id: 'overbought', name: 'Overbought', color: '#EF5350',
    desc: 'RSI>65 · Stoch>75 · BB>70%',
    criteria: { rsiMin: 65, stochMin: 75, bbMin: 70 },
  },
  {
    id: 'bull_structure', name: 'Bull Structure', color: '#9C27B0',
    desc: 'BOS/CHoCH bull · EMA above',
    criteria: { structDir: 'bull', emaPos: 'above' },
  },
  {
    id: 'vol_surge', name: 'Volume Surge', color: '#FF9800',
    desc: 'Volume ≥ 2× 20-bar average',
    criteria: { volumeMin: 2.0 },
  },
  {
    id: 'trend_setup', name: 'Trend Setup', color: '#00BCD4',
    desc: 'RSI 40–60 · EMA above · MACD bull',
    criteria: { rsiMin: 40, rsiMax: 60, emaPos: 'above', macdDir: 'bull' },
  },
];

function computeFilterSnapshot(bars: Bar[]): FilterSnapshot {
  const snap: FilterSnapshot = {
    rsi: null, macdHist: null, macdDir: 'neutral',
    emaPct: null, bbPos: null, stochK: null,
    structDir: 'neutral', volRatio: null,
  };
  if (bars.length < 20) return snap;
  const last = bars[bars.length - 1];
  const lastPrice = last?.c ?? 0;

  try {
    const pts = computeRSI(bars, 14);
    if (pts.length > 0) snap.rsi = pts[pts.length - 1].value;
  } catch { /* skip */ }

  try {
    const pts = computeMACD(bars, 12, 26, 9);
    if (pts.length >= 2) {
      const h = pts[pts.length - 1].histogram;
      const prev = pts[pts.length - 2].histogram;
      snap.macdHist = h;
      snap.macdDir = h > 0 && h > prev ? 'bull' : h < 0 && h < prev ? 'bear' : 'neutral';
    }
  } catch { /* skip */ }

  try {
    const closes = bars.map(b => b.c);
    const ema = emaFromValues(closes, 20);
    if (ema.length > 0) snap.emaPct = ((lastPrice - ema[ema.length - 1]) / ema[ema.length - 1]) * 100;
  } catch { /* skip */ }

  try {
    const pts = computeBollinger(bars, 20, 2);
    if (pts.length > 0) {
      const { upper, lower } = pts[pts.length - 1];
      const range = upper - lower;
      if (range > 0) snap.bbPos = ((lastPrice - lower) / range) * 100;
    }
  } catch { /* skip */ }

  try {
    const pts = computeStochastic(bars, 14, 3);
    if (pts.length > 0) snap.stochK = pts[pts.length - 1].k;
  } catch { /* skip */ }

  try {
    const ms = detectMarketStructure(bars);
    if (ms.events.length > 0) {
      const ev = ms.events[ms.events.length - 1];
      snap.structDir = ev.direction === 'bullish' ? 'bull' : 'bear';
    }
  } catch { /* skip */ }

  if (bars.length >= 21) {
    const avgVol = bars.slice(-21, -1).reduce((s, b) => s + (b.v || 0), 0) / 20;
    if (avgVol > 0) snap.volRatio = (last.v || 0) / avgVol;
  }

  return snap;
}

function matchesCriteria(snap: FilterSnapshot, c: FilterCriteria): boolean {
  if (c.rsiMin  !== null && (snap.rsi    === null || snap.rsi    <  c.rsiMin))  return false;
  if (c.rsiMax  !== null && (snap.rsi    === null || snap.rsi    >  c.rsiMax))  return false;
  if (c.macdDir !== 'any'  && snap.macdDir  !== c.macdDir)  return false;
  if (c.emaPos  === 'above' && (snap.emaPct  === null || snap.emaPct  <= 0))    return false;
  if (c.emaPos  === 'below' && (snap.emaPct  === null || snap.emaPct  >= 0))    return false;
  if (c.bbMax   !== null && (snap.bbPos   === null || snap.bbPos   >  c.bbMax)) return false;
  if (c.bbMin   !== null && (snap.bbPos   === null || snap.bbPos   <  c.bbMin)) return false;
  if (c.stochMax !== null && (snap.stochK  === null || snap.stochK  >  c.stochMax)) return false;
  if (c.stochMin !== null && (snap.stochK  === null || snap.stochK  <  c.stochMin)) return false;
  if (c.structDir !== 'any' && snap.structDir !== c.structDir) return false;
  if (c.volumeMin !== null && (snap.volRatio === null || snap.volRatio < c.volumeMin)) return false;
  return true;
}

// ── Filter TF selector ────────────────────────────────────────────────────────
const FILTER_TFS = [
  { label: '1H', api: '1h' },
  { label: '4H', api: '4h' },
  { label: '1D', api: '1day' },
] as const;
type FilterTF = typeof FILTER_TFS[number]['label'];

// ── Category filter pills ─────────────────────────────────────────────────────
const CAT_ALL = 'All' as const;
type CatFilter = typeof CAT_ALL | ScreenerCategory;
const CAT_OPTIONS: CatFilter[] = ['All', 'FX', 'Stocks', 'ETF', 'Indices', 'Crypto', 'Commodities'];

// ── FilterScan component ──────────────────────────────────────────────────────
function FilterScan() {
  const { dispatch } = useWorkspace();
  const [preset, setPreset]     = useState<string | null>(null);
  const [criteria, setCriteria] = useState<FilterCriteria>(EMPTY_CRITERIA);
  const [tf, setTf]             = useState<FilterTF>('1D');
  const [catFilter, setCatFilter] = useState<CatFilter>('All');
  const [running, setRunning]   = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentSym, setCurrentSym] = useState('');
  const [results, setResults]   = useState<FilterResult[] | null>(null);
  const abortRef = React.useRef(false);

  const universe = React.useMemo(() =>
    catFilter === 'All'
      ? SCREENER_UNIVERSE.map(s => s.symbol)
      : SCREENER_UNIVERSE.filter(s => s.category === catFilter).map(s => s.symbol),
    [catFilter],
  );

  const selectPreset = useCallback((p: FilterPreset) => {
    setPreset(p.id === preset ? null : p.id);
    setCriteria(p.id === preset ? EMPTY_CRITERIA : { ...EMPTY_CRITERIA, ...p.criteria });
    setResults(null);
  }, [preset]);

  const runFilter = useCallback(async () => {
    abortRef.current = false;
    setRunning(true);
    setResults(null);
    setProgress(0);
    const apiTf = FILTER_TFS.find(f => f.label === tf)?.api ?? '1day';
    const found: FilterResult[] = [];
    for (let i = 0; i < universe.length; i++) {
      if (abortRef.current) break;
      const sym = universe[i];
      setCurrentSym(sym);
      setProgress(Math.round((i / universe.length) * 100));
      const bars = await fetchFilterBars(sym, apiTf);
      if (bars.length < 30) continue;
      const snap = computeFilterSnapshot(bars);
      if (matchesCriteria(snap, criteria)) found.push({ symbol: sym, ...snap });
      // Yield every 5 symbols to keep UI responsive
      if (i % 5 === 4) await new Promise(r => setTimeout(r, 10));
    }
    setProgress(100);
    setResults(found);
    setRunning(false);
  }, [criteria, tf, universe]);

  const activeCriteria = Object.entries(criteria).filter(([k, v]) => {
    if (k === 'macdDir' || k === 'emaPos' || k === 'structDir') return v !== 'any';
    return v !== null;
  });

  const fmt1 = (n: number | null) => n != null ? n.toFixed(1) : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Presets */}
      <div style={{ padding: '6px 8px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: T.text3, letterSpacing: '0.06em', fontFamily: T.font, marginBottom: 5 }}>
          PRESETS
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {FILTER_PRESETS.map(p => {
            const active = preset === p.id;
            return (
              <button key={p.id} onClick={() => selectPreset(p)}
                title={p.desc}
                style={{
                  padding: '3px 8px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                  fontFamily: T.font, cursor: 'pointer', outline: 'none',
                  border: `1px solid ${active ? p.color : T.border}`,
                  background: active ? `${p.color}22` : T.surfaceAlt,
                  color: active ? p.color : T.text2,
                  transition: 'all 0.1s',
                }}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active criteria summary */}
      {activeCriteria.length > 0 && (
        <div style={{ padding: '5px 8px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.text3, letterSpacing: '0.06em', fontFamily: T.font, marginBottom: 4 }}>
            ACTIVE CRITERIA ({activeCriteria.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {criteria.rsiMin !== null && (
              <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 2, background: T.surfaceAlt, border: `1px solid ${T.border}`, color: T.text2, fontFamily: "'IBM Plex Mono', monospace" }}>
                RSI≥{criteria.rsiMin}
              </span>
            )}
            {criteria.rsiMax !== null && (
              <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 2, background: T.surfaceAlt, border: `1px solid ${T.border}`, color: T.text2, fontFamily: "'IBM Plex Mono', monospace" }}>
                RSI≤{criteria.rsiMax}
              </span>
            )}
            {criteria.macdDir !== 'any' && (
              <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 2, background: T.surfaceAlt, border: `1px solid ${T.border}`, color: criteria.macdDir === 'bull' ? T.bull : T.bear, fontFamily: "'IBM Plex Mono', monospace" }}>
                MACD {criteria.macdDir}
              </span>
            )}
            {criteria.emaPos !== 'any' && (
              <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 2, background: T.surfaceAlt, border: `1px solid ${T.border}`, color: T.text2, fontFamily: "'IBM Plex Mono', monospace" }}>
                EMA {criteria.emaPos}
              </span>
            )}
            {criteria.bbMax !== null && (
              <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 2, background: T.surfaceAlt, border: `1px solid ${T.border}`, color: T.text2, fontFamily: "'IBM Plex Mono', monospace" }}>
                BB≤{criteria.bbMax}%
              </span>
            )}
            {criteria.bbMin !== null && (
              <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 2, background: T.surfaceAlt, border: `1px solid ${T.border}`, color: T.text2, fontFamily: "'IBM Plex Mono', monospace" }}>
                BB≥{criteria.bbMin}%
              </span>
            )}
            {criteria.stochMax !== null && (
              <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 2, background: T.surfaceAlt, border: `1px solid ${T.border}`, color: T.text2, fontFamily: "'IBM Plex Mono', monospace" }}>
                Stoch≤{criteria.stochMax}
              </span>
            )}
            {criteria.stochMin !== null && (
              <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 2, background: T.surfaceAlt, border: `1px solid ${T.border}`, color: T.text2, fontFamily: "'IBM Plex Mono', monospace" }}>
                Stoch≥{criteria.stochMin}
              </span>
            )}
            {criteria.structDir !== 'any' && (
              <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 2, background: T.surfaceAlt, border: `1px solid ${T.border}`, color: criteria.structDir === 'bull' ? T.bull : T.bear, fontFamily: "'IBM Plex Mono', monospace" }}>
                Struct {criteria.structDir}
              </span>
            )}
            {criteria.volumeMin !== null && (
              <span style={{ fontSize: 9, padding: '2px 5px', borderRadius: 2, background: T.surfaceAlt, border: `1px solid ${T.border}`, color: T.text2, fontFamily: "'IBM Plex Mono', monospace" }}>
                Vol≥{criteria.volumeMin}×
              </span>
            )}
          </div>
        </div>
      )}

      {/* Category filter */}
      <div style={{ padding: '5px 8px', borderBottom: `1px solid ${T.border}`, flexShrink: 0, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {CAT_OPTIONS.map(cat => (
          <button key={cat} onClick={() => { setCatFilter(cat); setResults(null); }}
            style={{
              padding: '2px 7px', borderRadius: 10, fontSize: 9, fontWeight: 600,
              fontFamily: T.font, cursor: 'pointer', outline: 'none',
              border: `1px solid ${catFilter === cat ? T.accent : T.border}`,
              background: catFilter === cat ? T.accentBg : 'transparent',
              color: catFilter === cat ? T.accent : T.text3,
            }}
          >{cat}</button>
        ))}
      </div>

      {/* Controls row */}
      <div style={{ padding: '6px 8px', borderBottom: `1px solid ${T.border}`, flexShrink: 0, display: 'flex', gap: 6, alignItems: 'center' }}>
        {/* TF pills */}
        <div style={{ display: 'flex', gap: 3 }}>
          {FILTER_TFS.map(f => (
            <button key={f.label} onClick={() => setTf(f.label)}
              style={{
                padding: '3px 8px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                fontFamily: "'IBM Plex Mono', monospace", cursor: 'pointer', outline: 'none',
                border: `1px solid ${tf === f.label ? T.accent : T.border}`,
                background: tf === f.label ? T.accentBg : T.surfaceAlt,
                color: tf === f.label ? T.accent : T.text3,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <span style={{ fontSize: 9, color: T.text3, fontFamily: T.font, flex: 1 }}>
          {universe.length} symbols
        </span>

        {running && (
          <button onClick={() => { abortRef.current = true; }}
            style={{ padding: '4px 8px', borderRadius: 3, fontSize: 9, fontWeight: 600, fontFamily: T.font, cursor: 'pointer', outline: 'none', border: `1px solid ${T.border}`, background: T.surfaceAlt, color: T.text2, display: 'flex', alignItems: 'center', gap: 3 }}
          >
            <X size={9} /> Stop
          </button>
        )}

        <button onClick={runFilter} disabled={running || activeCriteria.length === 0}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '5px 10px', borderRadius: 3, fontSize: 10, fontWeight: 600,
            fontFamily: T.font, cursor: running || activeCriteria.length === 0 ? 'not-allowed' : 'pointer',
            outline: 'none', border: 'none',
            background: running || activeCriteria.length === 0 ? T.surfaceAlt : T.accent,
            color: running || activeCriteria.length === 0 ? T.text3 : '#fff',
            opacity: running || activeCriteria.length === 0 ? 0.6 : 1,
          }}
        >
          {running ? <Loader size={10} style={{ animation: 'spin 1s linear infinite' }} /> : <ScanLine size={10} />}
          {running ? 'Scanning…' : 'Scan'}
        </button>
      </div>

      {/* Progress bar */}
      {running && (
        <div style={{ padding: '4px 8px', flexShrink: 0 }}>
          <div style={{ height: 2, borderRadius: 1, background: T.border, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: T.accent, transition: 'width 0.2s', borderRadius: 1 }} />
          </div>
          <div style={{ fontSize: 9, color: T.text3, fontFamily: T.font, marginTop: 3 }}>
            {currentSym} — {progress}%
          </div>
        </div>
      )}

      {/* Results */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
        {results === null && !running && (
          <div style={{ padding: '20px 8px', textAlign: 'center', color: T.text3, fontSize: 11, fontFamily: T.font }}>
            {activeCriteria.length === 0
              ? 'Select a preset or define criteria, then scan'
              : 'Ready — click Scan to search the universe'
            }
          </div>
        )}

        {results !== null && results.length === 0 && (
          <div style={{ padding: '20px 8px', textAlign: 'center', color: T.text3, fontSize: 11, fontFamily: T.font }}>
            No symbols matched the criteria on {tf}
          </div>
        )}

        {results !== null && results.length > 0 && (
          <>
            <div style={{ fontSize: 9, fontWeight: 700, color: T.text3, letterSpacing: '0.06em', fontFamily: T.font, padding: '4px 2px 6px' }}>
              {results.length} MATCH{results.length !== 1 ? 'ES' : ''} — {tf}
            </div>
            {results.map(r => {
              const rsiColor = r.rsi === null ? T.text3 : r.rsi < 35 ? T.bull : r.rsi > 65 ? T.bear : T.text2;
              const macdColor = r.macdDir === 'bull' ? T.bull : r.macdDir === 'bear' ? T.bear : T.text3;
              const emaColor = r.emaPct === null ? T.text3 : r.emaPct > 0 ? T.bull : T.bear;
              const structColor = r.structDir === 'bull' ? T.bull : r.structDir === 'bear' ? T.bear : T.text3;
              return (
                <div key={r.symbol}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 8px', borderRadius: 4, marginBottom: 3,
                    border: `1px solid ${T.border}`, background: T.surfaceAlt,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.panelHover; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = T.surfaceAlt; }}
                  onClick={() => dispatch({ type: 'SET_SYMBOL', symbol: r.symbol })}
                >
                  {/* Symbol */}
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.text1, fontFamily: "'IBM Plex Mono', monospace", minWidth: 52 }}>
                    {r.symbol}
                  </span>

                  {/* Indicator values */}
                  <div style={{ display: 'flex', gap: 4, flex: 1, flexWrap: 'wrap' }}>
                    {r.rsi !== null && (
                      <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 2, background: 'rgba(255,255,255,0.04)', color: rsiColor, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>
                        RSI {r.rsi.toFixed(0)}
                      </span>
                    )}
                    <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 2, background: 'rgba(255,255,255,0.04)', color: macdColor, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>
                      MACD {r.macdDir === 'bull' ? '▲' : r.macdDir === 'bear' ? '▼' : '—'}
                    </span>
                    {r.emaPct !== null && (
                      <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 2, background: 'rgba(255,255,255,0.04)', color: emaColor, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>
                        EMA {r.emaPct >= 0 ? '+' : ''}{fmt1(r.emaPct)}%
                      </span>
                    )}
                    {r.bbPos !== null && (
                      <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 2, background: 'rgba(255,255,255,0.04)', color: T.text2, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>
                        BB {fmt1(r.bbPos)}%
                      </span>
                    )}
                    {r.stochK !== null && (
                      <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 2, background: 'rgba(255,255,255,0.04)', color: T.text2, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>
                        Stoch {r.stochK.toFixed(0)}
                      </span>
                    )}
                    {r.structDir !== 'neutral' && (
                      <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 2, background: 'rgba(255,255,255,0.04)', color: structColor, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>
                        {r.structDir === 'bull' ? 'BOS▲' : 'BOS▼'}
                      </span>
                    )}
                    {r.volRatio !== null && r.volRatio >= 1.5 && (
                      <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 2, background: 'rgba(255,255,255,0.04)', color: T.warn, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>
                        Vol {r.volRatio.toFixed(1)}×
                      </span>
                    )}
                  </div>

                  {/* Alert shortcut */}
                  <button
                    title={`Add alert for ${r.symbol}`}
                    onClick={e => {
                      e.stopPropagation();
                      dispatch({ type: 'ADD_ALERT', alert: { type: 'price', symbol: r.symbol, condition: 'crosses', value: 0, active: true, triggered: false } });
                      dispatch({ type: 'SET_RIGHT_TAB', tab: 'alerts' });
                    }}
                    style={{ padding: 3, border: 'none', background: 'transparent', cursor: 'pointer', color: T.text3, display: 'flex', alignItems: 'center', flexShrink: 0, borderRadius: 3 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = T.warn; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = T.text3; }}
                  >
                    <Bell size={10} />
                  </button>

                  <ArrowRight size={10} style={{ color: T.text3, flexShrink: 0 }} />
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Signal = 'bull' | 'bear' | 'neutral';

interface CellValue {
  signal: Signal;
  label: string; // e.g. "45.2" or "▲" or "—"
}

interface TFSignals {
  rsi: CellValue;
  macd: CellValue;
  ema: CellValue;
  stoch: CellValue;
  bb: CellValue;
  trend: CellValue;
  volume: CellValue;
  bull: number;
  bear: number;
  loaded: boolean;
}

// ── MTF config ─────────────────────────────────────────────────────────────────
const MTF_LIST: { tf: string; api: string; label: string }[] = [
  { tf: '1H',  api: '1h',    label: '1H'  },
  { tf: '4H',  api: '4h',    label: '4H'  },
  { tf: '1D',  api: '1day',  label: '1D'  },
  { tf: '1W',  api: '1week', label: '1W'  },
];

const INDICATOR_ROWS: { id: keyof Omit<TFSignals, 'bull' | 'bear' | 'loaded'>; label: string }[] = [
  { id: 'rsi',    label: 'RSI(14)'    },
  { id: 'macd',   label: 'MACD'       },
  { id: 'ema',    label: 'EMA20'      },
  { id: 'stoch',  label: 'Stoch(14)'  },
  { id: 'bb',     label: 'BB(20)'     },
  { id: 'trend',  label: 'Structure'  },
  { id: 'volume', label: 'Volume'     },
];

// ── Signal computation ────────────────────────────────────────────────────────
function computeSignals(bars: Bar[]): Omit<TFSignals, 'loaded'> {
  const empty: CellValue = { signal: 'neutral', label: '—' };
  let rsi = empty, macd = empty, ema = empty, stoch = empty, bb = empty, trend = empty, volume = empty;
  let bull = 0, bear = 0;

  const lastBar  = bars[bars.length - 1];
  const lastPrice = lastBar?.c ?? 0;

  // RSI
  try {
    const rsiPts = computeRSI(bars, 14);
    if (rsiPts.length > 0) {
      const v = rsiPts[rsiPts.length - 1].value;
      const sig: Signal = v < 35 ? 'bull' : v > 65 ? 'bear' : 'neutral';
      rsi = { signal: sig, label: v.toFixed(1) };
    }
  } catch { /* skip */ }

  // MACD — histogram direction
  try {
    const macdPts = computeMACD(bars, 12, 26, 9);
    if (macdPts.length >= 2) {
      const last = macdPts[macdPts.length - 1];
      const prev = macdPts[macdPts.length - 2];
      const rising = last.histogram > prev.histogram;
      const sig: Signal = last.histogram > 0 ? (rising ? 'bull' : 'neutral') : last.histogram < 0 ? (rising ? 'neutral' : 'bear') : 'neutral';
      macd = { signal: sig, label: last.histogram > 0 ? '▲' : last.histogram < 0 ? '▼' : '—' };
    }
  } catch { /* skip */ }

  // EMA20 — price vs EMA20
  try {
    const closes = bars.map(b => b.c);
    const ema20 = emaFromValues(closes, 20);
    if (ema20.length > 0) {
      const e = ema20[ema20.length - 1];
      const sig: Signal = lastPrice > e * 1.001 ? 'bull' : lastPrice < e * 0.999 ? 'bear' : 'neutral';
      const pct = ((lastPrice - e) / e * 100).toFixed(2);
      ema = { signal: sig, label: `${pct}%` };
    }
  } catch { /* skip */ }

  // Stochastic %K
  try {
    const stPts = computeStochastic(bars, 14, 3);
    if (stPts.length > 0) {
      const k = stPts[stPts.length - 1].k;
      const d = stPts[stPts.length - 1].d;
      const sig: Signal = k < 25 ? 'bull' : k > 75 ? 'bear' : 'neutral';
      const cross = stPts.length >= 2
        ? (stPts[stPts.length - 2].k <= stPts[stPts.length - 2].d && k > d ? '↑' :
           stPts[stPts.length - 2].k >= stPts[stPts.length - 2].d && k < d ? '↓' : '')
        : '';
      stoch = { signal: sig, label: `${k.toFixed(0)}${cross}` };
    }
  } catch { /* skip */ }

  // Bollinger — price position within bands
  try {
    const bbPts = computeBollinger(bars, 20, 2);
    if (bbPts.length > 0) {
      const { upper, lower, middle } = bbPts[bbPts.length - 1];
      const range = upper - lower;
      const pos = range > 0 ? (lastPrice - lower) / range : 0.5;
      const sig: Signal = pos < 0.25 ? 'bull' : pos > 0.75 ? 'bear' : 'neutral';
      bb = { signal: sig, label: `${(pos * 100).toFixed(0)}%` };
      void middle; // used implicitly via pos
    }
  } catch { /* skip */ }

  // Market Structure — last BOS direction
  try {
    const ms = detectMarketStructure(bars);
    if (ms.events.length > 0) {
      const lastEv = ms.events[ms.events.length - 1];
      const sig: Signal = lastEv.direction === 'bullish' ? 'bull' : 'bear';
      trend = { signal: sig, label: `${lastEv.kind} ${lastEv.direction === 'bullish' ? '▲' : '▼'}` };
    }
  } catch { /* skip */ }

  // Volume — last bar vs 20-bar avg, directional
  if (bars.length >= 21) {
    const avgVol = bars.slice(-21, -1).reduce((s, b) => s + (b.v || 0), 0) / 20;
    const lastVol = lastBar.v || 0;
    const ratio = avgVol > 0 ? lastVol / avgVol : 1;
    const isBull = lastBar.c > lastBar.o;
    const sig: Signal = ratio > 1.3 ? (isBull ? 'bull' : 'bear') : 'neutral';
    volume = { signal: sig, label: `${ratio.toFixed(1)}×` };
  }

  // Count
  const all = [rsi, macd, ema, stoch, bb, trend, volume];
  bull = all.filter(c => c.signal === 'bull').length;
  bear = all.filter(c => c.signal === 'bear').length;

  return { rsi, macd, ema, stoch, bb, trend, volume, bull, bear };
}

// ── TF data loader (invisible, just fetches + computes) ───────────────────────
function TFSignalLoader({
  symbol, api, tf, onSignals,
}: {
  symbol: string; api: string; tf: string;
  onSignals: (tf: string, sigs: Omit<TFSignals, 'loaded'>) => void;
}) {
  const { bars } = usePublicChartData(symbol, api, 150);
  useEffect(() => {
    if (bars.length < 30) return;
    onSignals(tf, computeSignals(bars));
  }, [bars, tf, onSignals]);
  return null;
}

// ── Signal cell ───────────────────────────────────────────────────────────────
function Cell({ cell, loading }: { cell: CellValue | undefined; loading: boolean }) {
  if (loading || !cell) {
    return (
      <td style={{ padding: '5px 4px', textAlign: 'center', width: 52 }}>
        <span style={{ display: 'inline-block', width: 32, height: 16, background: T.border, borderRadius: 3, opacity: 0.4 }} />
      </td>
    );
  }
  const bg = cell.signal === 'bull'
    ? 'rgba(38,166,154,0.14)'
    : cell.signal === 'bear'
    ? 'rgba(239,83,80,0.14)'
    : 'rgba(255,255,255,0.04)';
  const fg = cell.signal === 'bull' ? T.bull : cell.signal === 'bear' ? T.bear : T.text3;
  return (
    <td style={{ padding: '4px 3px', textAlign: 'center', width: 52 }}>
      <span style={{
        display: 'inline-block', padding: '2px 5px', borderRadius: 3,
        background: bg, color: fg,
        fontSize: 9, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace",
        whiteSpace: 'nowrap', letterSpacing: '0.02em',
      }}>
        {cell.label}
      </span>
    </td>
  );
}

// ── MTF Matrix component ──────────────────────────────────────────────────────
function MTFMatrix({ symbol }: { symbol: string }) {
  const [matrix, setMatrix] = useState<Record<string, Omit<TFSignals, 'loaded'> & { loaded: boolean }>>({});

  const handleSignals = useCallback((tf: string, sigs: Omit<TFSignals, 'loaded'>) => {
    setMatrix(prev => ({ ...prev, [tf]: { ...sigs, loaded: true } }));
  }, []);

  const totalTFs = MTF_LIST.length;
  const loadedTFs = Object.values(matrix).filter(v => v.loaded).length;
  const allLoaded = loadedTFs === totalTFs;

  // Overall bias
  let totalBull = 0, totalBear = 0;
  for (const v of Object.values(matrix)) { totalBull += v.bull; totalBear += v.bear; }
  const totalSigs = totalBull + totalBear;
  const biasPct = totalSigs > 0 ? Math.round((totalBull / totalSigs) * 100) : 50;
  const biasColor = biasPct > 55 ? T.bull : biasPct < 45 ? T.bear : T.text3;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Invisible data loaders */}
      {MTF_LIST.map(m => (
        <TFSignalLoader key={m.tf} symbol={symbol} api={m.api} tf={m.tf} onSignals={handleSignals} />
      ))}

      {/* Bias bar */}
      <div style={{ padding: '6px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: T.text1, fontFamily: T.font, flex: 1 }}>
            {symbol} — MTF Analysis
          </span>
          {allLoaded && (
            <span style={{ fontSize: 10, fontWeight: 700, color: biasColor, fontFamily: "'IBM Plex Mono', monospace" }}>
              {biasPct > 55 ? '▲' : biasPct < 45 ? '▼' : '◆'} {biasPct}% Bull
            </span>
          )}
          {!allLoaded && (
            <span style={{ fontSize: 9, color: T.text3, fontFamily: T.font }}>
              {loadedTFs}/{totalTFs} loaded…
            </span>
          )}
        </div>
        {/* Bias progress bar */}
        {allLoaded && (
          <div style={{ marginTop: 4, height: 3, borderRadius: 2, background: T.border, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${biasPct}%`, background: biasColor, borderRadius: 2, transition: 'width 0.3s' }} />
          </div>
        )}
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', padding: '6px 6px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          {/* TF header row */}
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '3px 6px', fontSize: 9, fontWeight: 700, color: T.text3, fontFamily: T.font, width: 72 }}>
                INDICATOR
              </th>
              {MTF_LIST.map(m => (
                <th key={m.tf} style={{ textAlign: 'center', padding: '3px 4px', fontSize: 10, fontWeight: 700, color: T.text2, fontFamily: "'IBM Plex Mono', monospace", width: 52 }}>
                  {m.label}
                </th>
              ))}
              <th style={{ textAlign: 'center', padding: '3px 4px', fontSize: 9, fontWeight: 700, color: T.text3, fontFamily: T.font, width: 40 }}>
                ALL
              </th>
            </tr>
          </thead>
          <tbody>
            {INDICATOR_ROWS.map(row => {
              // Count signals for this indicator across TFs
              let rowBull = 0, rowBear = 0;
              for (const m of MTF_LIST) {
                const cell = matrix[m.tf]?.[row.id];
                if (cell?.signal === 'bull') rowBull++;
                else if (cell?.signal === 'bear') rowBear++;
              }
              const rowBias: Signal = rowBull > rowBear ? 'bull' : rowBear > rowBull ? 'bear' : 'neutral';
              const rowBiasColor = rowBias === 'bull' ? T.bull : rowBias === 'bear' ? T.bear : T.text3;

              return (
                <tr key={row.id} style={{ borderBottom: `1px solid ${T.border}` }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <td style={{ padding: '5px 6px', fontSize: 9, fontWeight: 600, color: T.text2, fontFamily: T.font }}>
                    {row.label}
                  </td>
                  {MTF_LIST.map(m => (
                    <Cell key={m.tf} cell={matrix[m.tf]?.[row.id]} loading={!matrix[m.tf]?.loaded} />
                  ))}
                  {/* Row summary */}
                  <td style={{ textAlign: 'center', padding: '4px 3px' }}>
                    {rowBull + rowBear > 0 ? (
                      <span style={{ fontSize: 9, fontWeight: 700, color: rowBiasColor, fontFamily: "'IBM Plex Mono', monospace" }}>
                        {rowBias === 'bull' ? `${rowBull}▲` : rowBias === 'bear' ? `${rowBear}▼` : '◆'}
                      </span>
                    ) : (
                      <span style={{ fontSize: 9, color: T.text3 }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}

            {/* Summary row */}
            <tr style={{ borderTop: `2px solid ${T.border}` }}>
              <td style={{ padding: '5px 6px', fontSize: 9, fontWeight: 700, color: T.text3, fontFamily: T.font, letterSpacing: '0.06em' }}>
                SUMMARY
              </td>
              {MTF_LIST.map(m => {
                const data = matrix[m.tf];
                if (!data?.loaded) {
                  return (
                    <td key={m.tf} style={{ textAlign: 'center', padding: '5px 3px' }}>
                      <Loader size={9} color={T.text3} style={{ animation: 'spin 1s linear infinite' }} />
                    </td>
                  );
                }
                const tfBias: Signal = data.bull > data.bear ? 'bull' : data.bear > data.bull ? 'bear' : 'neutral';
                const tfColor = tfBias === 'bull' ? T.bull : tfBias === 'bear' ? T.bear : T.text3;
                const tfBg = tfBias === 'bull' ? 'rgba(38,166,154,0.12)' : tfBias === 'bear' ? 'rgba(239,83,80,0.12)' : 'rgba(255,255,255,0.04)';
                return (
                  <td key={m.tf} style={{ textAlign: 'center', padding: '4px 3px' }}>
                    <div style={{
                      display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
                      padding: '3px 6px', borderRadius: 4, background: tfBg,
                    }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: tfColor, fontFamily: "'IBM Plex Mono', monospace" }}>
                        {tfBias === 'bull' ? '▲' : tfBias === 'bear' ? '▼' : '◆'}
                      </span>
                      <span style={{ fontSize: 8, color: T.text3, fontFamily: "'IBM Plex Mono', monospace" }}>
                        {data.bull}/{data.bear}
                      </span>
                    </div>
                  </td>
                );
              })}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Gap / Volume-Spike scanner ────────────────────────────────────────────────
type GapScanType = 'gap_up' | 'gap_down' | 'vol_spike';

interface GapResult {
  symbol:   string;
  name:     string;
  category: ScreenerCategory;
  value:    number;   // gap% or vol-ratio
  lastClose: number;
  lastOpen:  number;
}

async function fetchDailyBars(symbol: string): Promise<Bar[]> {
  try {
    const res = await fetch(`/api/chart-data/${encodeURIComponent(symbol)}?interval=1day&limit=10`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.bars ?? [];
  } catch { return []; }
}

function GapScan() {
  const { dispatch } = useWorkspace();
  const [scanType, setScanType]   = useState<GapScanType>('gap_up');
  const [threshold, setThreshold] = useState(0.5);  // % for gap, × for vol
  const [catFilter, setCatFilter] = useState<CatFilter>('All');
  const [running, setRunning]     = useState(false);
  const [progress, setProgress]   = useState(0);
  const [currentSym, setCurrentSym] = useState('');
  const [results, setResults]     = useState<GapResult[] | null>(null);
  const abortRef = React.useRef(false);

  const universe = React.useMemo(() =>
    catFilter === 'All'
      ? SCREENER_UNIVERSE
      : SCREENER_UNIVERSE.filter(s => s.category === catFilter),
    [catFilter],
  );

  const SCAN_LABELS: Record<GapScanType, string> = {
    gap_up:    'Gap Up',
    gap_down:  'Gap Down',
    vol_spike: 'Vol Spike',
  };

  const thresholdLabel = scanType === 'vol_spike' ? '× avg vol' : '% gap';

  const runScan = useCallback(async () => {
    abortRef.current = false;
    setRunning(true);
    setResults(null);
    setProgress(0);
    const found: GapResult[] = [];

    for (let i = 0; i < universe.length; i++) {
      if (abortRef.current) break;
      const sym = universe[i];
      setCurrentSym(sym.symbol);
      setProgress(Math.round((i / universe.length) * 100));

      const bars = await fetchDailyBars(sym.symbol);
      if (bars.length < 2) {
        if (i % 5 === 4) await new Promise(r => setTimeout(r, 10));
        continue;
      }

      const today = bars[bars.length - 1];
      const prev  = bars[bars.length - 2];

      let value = 0;
      let match = false;

      if (scanType === 'gap_up') {
        value = ((today.o - prev.c) / prev.c) * 100;
        match = value >= threshold;
      } else if (scanType === 'gap_down') {
        value = ((prev.c - today.o) / prev.c) * 100;
        match = value >= threshold;
      } else {
        // vol_spike
        if (bars.length >= 6) {
          const avgVol = bars.slice(-6, -1).reduce((s, b) => s + (b.v || 0), 0) / 5;
          value = avgVol > 0 ? (today.v || 0) / avgVol : 0;
          match = value >= threshold;
        }
      }

      if (match) {
        found.push({ symbol: sym.symbol, name: sym.name, category: sym.category, value, lastClose: prev.c, lastOpen: today.o });
      }

      if (i % 5 === 4) await new Promise(r => setTimeout(r, 10));
    }

    found.sort((a, b) => b.value - a.value);
    setProgress(100);
    setResults(found);
    setRunning(false);
  }, [universe, scanType, threshold]);

  const addAlert = useCallback((r: GapResult) => {
    dispatch({ type: 'ADD_ALERT', alert: { type: 'price', symbol: r.symbol, condition: 'crosses', value: r.lastOpen, active: true, triggered: false } });
    dispatch({ type: 'SET_RIGHT_TAB', tab: 'alerts' });
  }, [dispatch]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Scan type selector */}
      <div style={{ padding: '6px 8px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: T.text3, letterSpacing: '0.06em', fontFamily: T.font, marginBottom: 5 }}>SCAN TYPE</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['gap_up', 'gap_down', 'vol_spike'] as GapScanType[]).map(st => {
            const active = scanType === st;
            const color = st === 'gap_up' ? T.bull : st === 'gap_down' ? T.bear : T.warn;
            return (
              <button key={st} onClick={() => { setScanType(st); setResults(null); }}
                style={{
                  padding: '4px 10px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                  fontFamily: T.font, cursor: 'pointer', outline: 'none', flex: 1,
                  border: `1px solid ${active ? color : T.border}`,
                  background: active ? `${color}18` : T.surfaceAlt,
                  color: active ? color : T.text2,
                }}
              >{SCAN_LABELS[st]}</button>
            );
          })}
        </div>
      </div>

      {/* Category filter */}
      <div style={{ padding: '5px 8px', borderBottom: `1px solid ${T.border}`, flexShrink: 0, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {CAT_OPTIONS.map(cat => (
          <button key={cat} onClick={() => { setCatFilter(cat); setResults(null); }}
            style={{
              padding: '2px 7px', borderRadius: 10, fontSize: 9, fontWeight: 600,
              fontFamily: T.font, cursor: 'pointer', outline: 'none',
              border: `1px solid ${catFilter === cat ? T.accent : T.border}`,
              background: catFilter === cat ? T.accentBg : 'transparent',
              color: catFilter === cat ? T.accent : T.text3,
            }}
          >{cat}</button>
        ))}
      </div>

      {/* Threshold + Run */}
      <div style={{ padding: '6px 8px', borderBottom: `1px solid ${T.border}`, flexShrink: 0, display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 9, color: T.text3, fontFamily: T.font }}>Min:</span>
        <input
          type="number"
          value={threshold}
          onChange={e => setThreshold(Math.max(0, parseFloat(e.target.value) || 0))}
          step={scanType === 'vol_spike' ? 0.5 : 0.1}
          style={{
            width: 56, padding: '3px 6px', borderRadius: 3, fontSize: 10,
            fontFamily: "'IBM Plex Mono', monospace", background: T.surfaceAlt,
            border: `1px solid ${T.border}`, color: T.text1, outline: 'none',
          }}
        />
        <span style={{ fontSize: 9, color: T.text3, fontFamily: T.font, flex: 1 }}>{thresholdLabel} · {universe.length} syms</span>

        {running && (
          <button onClick={() => { abortRef.current = true; }}
            style={{ padding: '4px 8px', borderRadius: 3, fontSize: 9, fontWeight: 600, fontFamily: T.font, cursor: 'pointer', outline: 'none', border: `1px solid ${T.border}`, background: T.surfaceAlt, color: T.text2, display: 'flex', alignItems: 'center', gap: 3 }}
          >
            <X size={9} /> Stop
          </button>
        )}

        <button onClick={runScan} disabled={running}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '5px 10px', borderRadius: 3, fontSize: 10, fontWeight: 600,
            fontFamily: T.font, cursor: running ? 'not-allowed' : 'pointer',
            outline: 'none', border: 'none',
            background: running ? T.surfaceAlt : T.accent,
            color: running ? T.text3 : '#fff',
            opacity: running ? 0.6 : 1,
          }}
        >
          {running ? <Loader size={10} style={{ animation: 'spin 1s linear infinite' }} /> : <ScanLine size={10} />}
          {running ? 'Scanning…' : 'Scan'}
        </button>
      </div>

      {/* Progress */}
      {running && (
        <div style={{ padding: '4px 8px', flexShrink: 0 }}>
          <div style={{ height: 2, borderRadius: 1, background: T.border, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: T.accent, transition: 'width 0.2s', borderRadius: 1 }} />
          </div>
          <div style={{ fontSize: 9, color: T.text3, fontFamily: T.font, marginTop: 3 }}>{currentSym} — {progress}%</div>
        </div>
      )}

      {/* Results */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
        {results === null && !running && (
          <div style={{ padding: '20px 8px', textAlign: 'center', color: T.text3, fontSize: 11, fontFamily: T.font }}>
            Choose scan type and threshold, then click Scan
          </div>
        )}
        {results !== null && results.length === 0 && (
          <div style={{ padding: '20px 8px', textAlign: 'center', color: T.text3, fontSize: 11, fontFamily: T.font }}>
            No matches found
          </div>
        )}
        {results !== null && results.length > 0 && (
          <>
            <div style={{ fontSize: 9, fontWeight: 700, color: T.text3, letterSpacing: '0.06em', fontFamily: T.font, padding: '4px 2px 6px' }}>
              {results.length} RESULT{results.length !== 1 ? 'S' : ''} — {SCAN_LABELS[scanType].toUpperCase()}
            </div>
            {results.map(r => {
              const isGapUp   = scanType === 'gap_up';
              const isVolSpike = scanType === 'vol_spike';
              const accentColor = isGapUp ? T.bull : isVolSpike ? T.warn : T.bear;
              const valLabel = isVolSpike
                ? `${r.value.toFixed(2)}×`
                : `${r.value >= 0 ? '+' : ''}${r.value.toFixed(2)}%`;
              return (
                <div key={r.symbol}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px', borderRadius: 4, marginBottom: 3, border: `1px solid ${T.border}`, background: T.surfaceAlt, cursor: 'pointer' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.panelHover; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = T.surfaceAlt; }}
                  onClick={() => dispatch({ type: 'SET_SYMBOL', symbol: r.symbol })}
                >
                  {/* Category badge */}
                  <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 2, background: T.border, color: T.text3, fontFamily: T.font, flexShrink: 0 }}>{r.category}</span>

                  {/* Symbol */}
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.text1, fontFamily: "'IBM Plex Mono', monospace", flex: 1 }}>{r.symbol}</span>

                  {/* Value */}
                  <span style={{ fontSize: 10, fontWeight: 700, color: accentColor, fontFamily: "'IBM Plex Mono', monospace", flexShrink: 0 }}>{valLabel}</span>

                  {/* Alert */}
                  <button
                    title={`Add alert for ${r.symbol}`}
                    onClick={e => { e.stopPropagation(); addAlert(r); }}
                    style={{ padding: 3, border: 'none', background: 'transparent', cursor: 'pointer', color: T.text3, display: 'flex', alignItems: 'center', flexShrink: 0, borderRadius: 3 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = T.warn; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = T.text3; }}
                  >
                    <Bell size={10} />
                  </button>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ── Single-symbol signal scan (original content) ──────────────────────────────
type FilterMode = 'all' | 'bull' | 'bear' | 'active';

function SignalScan({ symbol }: { symbol: string }) {
  const { bars, loading } = usePublicChartData(symbol, '1day', 200);
  const [filter, setFilter] = useState<FilterMode>('all');

  interface ScanEntry {
    id: string; name: string; desc: string;
    count: number; direction: 'bull' | 'bear' | 'neutral'; detail?: string;
  }

  const scans = useMemo<ScanEntry[]>(() => {
    if (bars.length < 10) return [];

    const fvgs    = detectFVG(bars);
    const bullFVG = fvgs.filter(z => z.type === 'bullish');
    const bearFVG = fvgs.filter(z => z.type === 'bearish');

    const ms       = detectMarketStructure(bars);
    const bosUp    = ms.events.filter(e => e.kind === 'BOS'   && e.direction === 'bullish');
    const bosDown  = ms.events.filter(e => e.kind === 'BOS'   && e.direction === 'bearish');
    const chochUp  = ms.events.filter(e => e.kind === 'CHoCH' && e.direction === 'bullish');
    const chochDn  = ms.events.filter(e => e.kind === 'CHoCH' && e.direction === 'bearish');

    const patternData  = detectPatterns(bars);
    const bullPatterns = patternData.patterns.filter(p => p.direction === 'bullish').length;
    const bearPatterns = patternData.patterns.filter(p => p.direction === 'bearish').length;
    const totalPat     = patternData.patterns.length;

    let divBull = 0, divBear = 0;
    try {
      const rsiPts = computeRSI(bars, 14);
      if (rsiPts.length >= 4) {
        const divLines = detectDivergence(bars, rsiPts, 5);
        divBull = divLines.filter(d => d.kind === 'regular' && d.direction === 'bullish').length;
        divBear = divLines.filter(d => d.kind === 'regular' && d.direction === 'bearish').length;
      }
    } catch { /* skip */ }

    let emaCrossDir: 'bull' | 'bear' | null = null;
    const closes = bars.map(b => b.c);
    const ema9   = emaFromValues(closes, 9);
    const ema21  = emaFromValues(closes, 21);
    if (ema9.length >= 2 && ema21.length >= 2) {
      const n = ema9.length - 1, m = ema21.length - 1;
      if (ema9[n - 1] <= ema21[m - 1] && ema9[n] > ema21[m]) emaCrossDir = 'bull';
      else if (ema9[n - 1] >= ema21[m - 1] && ema9[n] < ema21[m]) emaCrossDir = 'bear';
    }

    let volSpike = 0;
    if (bars.length >= 21) {
      const avgVol = bars.slice(-21, -1).reduce((s, b) => s + (b.v || 0), 0) / 20;
      const lastVol = bars[bars.length - 1].v || 0;
      if (avgVol > 0 && lastVol > avgVol * 2) volSpike = 1;
    }

    return [
      { id: 'fvg_bull',   name: 'Bullish FVG',     desc: 'Unfilled bullish fair value gaps',       count: bullFVG.length,  direction: 'bull' },
      { id: 'fvg_bear',   name: 'Bearish FVG',     desc: 'Unfilled bearish fair value gaps',       count: bearFVG.length,  direction: 'bear' },
      { id: 'bos_up',     name: 'BOS Bullish',     desc: 'Break of structure — bullish',           count: bosUp.length,    direction: 'bull' },
      { id: 'bos_down',   name: 'BOS Bearish',     desc: 'Break of structure — bearish',           count: bosDown.length,  direction: 'bear' },
      { id: 'choch_up',   name: 'CHoCH Bullish',   desc: 'Change of character — bullish',          count: chochUp.length,  direction: 'bull' },
      { id: 'choch_down', name: 'CHoCH Bearish',   desc: 'Change of character — bearish',          count: chochDn.length,  direction: 'bear' },
      { id: 'pat_bull',   name: 'Bullish Pattern', desc: `${bullPatterns}/${totalPat} patterns bullish`, count: bullPatterns, direction: 'bull' },
      { id: 'pat_bear',   name: 'Bearish Pattern', desc: `${bearPatterns}/${totalPat} patterns bearish`, count: bearPatterns, direction: 'bear' },
      { id: 'div_bull',   name: 'RSI Div Bull',    desc: 'Regular bullish RSI divergence',         count: divBull,         direction: 'bull' },
      { id: 'div_bear',   name: 'RSI Div Bear',    desc: 'Regular bearish RSI divergence',         count: divBear,         direction: 'bear' },
      { id: 'ema_cross',  name: 'EMA Cross',       desc: 'EMA9 crossed EMA21 on daily',            count: emaCrossDir ? 1 : 0, direction: emaCrossDir ?? 'neutral', detail: emaCrossDir === 'bull' ? 'EMA9 > EMA21' : emaCrossDir === 'bear' ? 'EMA9 < EMA21' : undefined },
      { id: 'vol_spike',  name: 'Volume Spike',    desc: 'Last bar > 2× 20-bar average',           count: volSpike,        direction: 'neutral' },
    ];
  }, [bars]);

  const signalCount = scans.filter(s => s.count > 0).length;

  const visibleScans = scans.filter(s => {
    if (filter === 'bull')   return s.direction === 'bull';
    if (filter === 'bear')   return s.direction === 'bear';
    if (filter === 'active') return s.count > 0;
    return true;
  });

  const FILTERS: { id: FilterMode; label: string }[] = [
    { id: 'all', label: 'All' }, { id: 'bull', label: 'Bull' },
    { id: 'bear', label: 'Bear' }, { id: 'active', label: 'Active' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '6px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: T.text1, fontFamily: T.font, flex: 1 }}>{symbol} — Signals</span>
          {loading ? (
            <Loader size={10} color={T.text3} style={{ animation: 'spin 1s linear infinite' }} />
          ) : (
            <span style={{
              fontSize: 9, padding: '1px 6px', borderRadius: 8, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace",
              background: signalCount > 0 ? T.accentBg : T.surfaceAlt,
              color: signalCount > 0 ? T.accent : T.text3,
            }}>{signalCount} signals</span>
          )}
          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: T.warnBg, color: T.warn, fontWeight: 600 }}>BETA</span>
        </div>
        <p style={{ fontSize: 9, color: T.text3, margin: '3px 0 0', fontFamily: T.font }}>
          Daily bars · {bars.length} loaded
        </p>
      </div>

      <div style={{ display: 'flex', gap: 3, padding: '5px 8px', flexShrink: 0, borderBottom: `1px solid ${T.border}` }}>
        {FILTERS.map(f => {
          const active = filter === f.id;
          const accent = f.id === 'bull' ? T.bull : f.id === 'bear' ? T.bear : T.accent;
          return (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: '2px 8px', borderRadius: 10,
              border: `1px solid ${active ? accent : T.border}`,
              background: active ? (f.id === 'bull' ? 'rgba(38,166,154,0.12)' : f.id === 'bear' ? 'rgba(239,83,80,0.12)' : T.accentBg) : 'transparent',
              color: active ? accent : T.text3,
              fontSize: 9, fontWeight: 600, fontFamily: T.font, cursor: 'pointer', outline: 'none',
            }}>{f.label}</button>
          );
        })}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: T.text3, fontFamily: "'IBM Plex Mono', monospace", alignSelf: 'center' }}>
          {visibleScans.filter(s => s.count > 0).length}/{visibleScans.length}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
        {visibleScans.map(scan => {
          const hit = scan.count > 0;
          const accentColor = scan.direction === 'bull' ? T.bull : scan.direction === 'bear' ? T.bear : T.text2;
          return (
            <div key={scan.id} style={{
              padding: '6px 8px', borderRadius: 4, marginBottom: 4,
              border: `1px solid ${hit ? (scan.direction === 'bull' ? 'rgba(38,166,154,0.3)' : scan.direction === 'bear' ? 'rgba(239,83,80,0.3)' : T.border) : T.border}`,
              background: hit ? (scan.direction === 'bull' ? 'rgba(38,166,154,0.05)' : scan.direction === 'bear' ? 'rgba(239,83,80,0.05)' : T.surfaceAlt) : T.surfaceAlt,
              opacity: hit ? 1 : 0.5, transition: 'opacity 0.15s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: hit ? accentColor : T.text3 }} />
                <span style={{ fontSize: 10, fontWeight: 500, color: T.text1, fontFamily: T.font, flex: 1 }}>{scan.name}</span>
                <span style={{
                  fontSize: 9, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace",
                  padding: '1px 6px', borderRadius: 8,
                  background: hit ? (scan.direction === 'bull' ? 'rgba(38,166,154,0.15)' : scan.direction === 'bear' ? 'rgba(239,83,80,0.15)' : T.surfaceAlt) : T.surfaceAlt,
                  color: hit ? accentColor : T.text3,
                }}>{scan.count}</span>
              </div>
              <div style={{ fontSize: 9, color: T.text3, marginTop: 2, fontFamily: T.font, paddingLeft: 12 }}>
                {scan.detail ?? scan.desc}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Technical Setup Scanner ───────────────────────────────────────────────────

type TechSetupType = 'rsi_os' | 'rsi_ob' | 'golden_x' | 'death_x' | 'hi52w' | 'lo52w';

interface TechResult {
  symbol:    string;
  name:      string;
  category:  ScreenerCategory;
  price:     number;
  value:     number;   // RSI value, EMA diff %, or proximity %
  setupType: TechSetupType;
}

const TECH_LABELS: Record<TechSetupType, { label: string; dir: 'bull' | 'bear' | 'neutral'; desc: string }> = {
  rsi_os:   { label: 'RSI Oversold',   dir: 'bull',    desc: 'RSI(14) < threshold (default 35)' },
  rsi_ob:   { label: 'RSI Overbought', dir: 'bear',    desc: 'RSI(14) > threshold (default 65)' },
  golden_x: { label: 'Golden Cross',   dir: 'bull',    desc: 'EMA9 crossed above EMA21 (last 3 bars)' },
  death_x:  { label: 'Death Cross',    dir: 'bear',    desc: 'EMA9 crossed below EMA21 (last 3 bars)' },
  hi52w:    { label: 'Near 52W High',  dir: 'bull',    desc: 'Price within threshold% of 52-week high' },
  lo52w:    { label: 'Near 52W Low',   dir: 'neutral', desc: 'Price within threshold% of 52-week low' },
};

async function fetchTechBars(symbol: string, limit: number): Promise<Bar[]> {
  try {
    const res = await fetch(`/api/chart-data/${encodeURIComponent(symbol)}?interval=1day&limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.bars ?? [];
  } catch { return []; }
}

function computeSetupValue(bars: Bar[], setupType: TechSetupType, threshold: number): { match: boolean; value: number } {
  const no = { match: false, value: 0 };
  if (bars.length < 2) return no;
  const closes = bars.map(b => b.c);
  const last = closes[closes.length - 1];

  if (setupType === 'rsi_os' || setupType === 'rsi_ob') {
    if (bars.length < 16) return no;
    const rsiPts = computeRSI(bars, 14);
    const rsiVal = rsiPts[rsiPts.length - 1]?.value;
    if (rsiVal == null || !isFinite(rsiVal)) return no;
    if (setupType === 'rsi_os') return { match: rsiVal < threshold, value: rsiVal };
    return { match: rsiVal > threshold, value: rsiVal };
  }

  if (setupType === 'golden_x' || setupType === 'death_x') {
    if (bars.length < 25) return no;
    const ema9  = emaFromValues(closes, 9);
    const ema21 = emaFromValues(closes, 21);
    const n = Math.min(ema9.length, ema21.length);
    if (n < 4) return no;
    // Check for fresh crossover in last 3 bars
    const diff = (i: number) => (ema9[ema9.length - 1 - i] ?? 0) - (ema21[ema21.length - 1 - i] ?? 0);
    const d0 = diff(0), d1 = diff(1), d2 = diff(2), d3 = diff(3);
    const pct = Math.abs(d0 / (last || 1)) * 100;
    if (setupType === 'golden_x') {
      const crossed = (d0 > 0 && (d1 <= 0 || d2 <= 0 || d3 <= 0));
      return { match: crossed, value: pct };
    } else {
      const crossed = (d0 < 0 && (d1 >= 0 || d2 >= 0 || d3 >= 0));
      return { match: crossed, value: pct };
    }
  }

  if (setupType === 'hi52w' || setupType === 'lo52w') {
    const highs = bars.map(b => b.h);
    const lows  = bars.map(b => b.l);
    const hi52 = Math.max(...highs);
    const lo52 = Math.min(...lows);
    if (setupType === 'hi52w') {
      const pct = hi52 > 0 ? ((hi52 - last) / hi52) * 100 : 100;
      return { match: pct <= threshold, value: pct };
    } else {
      const pct = lo52 > 0 ? ((last - lo52) / lo52) * 100 : 100;
      return { match: pct <= threshold, value: pct };
    }
  }

  return no;
}

function TechSetupScan() {
  const { dispatch } = useWorkspace();
  const [setupType,  setSetupType]  = useState<TechSetupType>('rsi_os');
  const [threshold,  setThreshold]  = useState(35);
  const [catFilter,  setCatFilter]  = useState<CatFilter>('All');
  const [running,    setRunning]    = useState(false);
  const [progress,   setProgress]   = useState(0);
  const [currentSym, setCurrentSym] = useState('');
  const [results,    setResults]    = useState<TechResult[] | null>(null);
  const abortRef = React.useRef(false);

  const universe = React.useMemo(() =>
    catFilter === 'All' ? SCREENER_UNIVERSE : SCREENER_UNIVERSE.filter(s => s.category === catFilter),
    [catFilter],
  );

  const barLimit = (setupType === 'hi52w' || setupType === 'lo52w') ? 260 : 50;

  // Default threshold by setup type
  function defaultThreshold(st: TechSetupType): number {
    if (st === 'rsi_os')  return 35;
    if (st === 'rsi_ob')  return 65;
    if (st === 'golden_x' || st === 'death_x') return 0.1;
    return 2; // 52W proximity %
  }

  const runScan = useCallback(async () => {
    abortRef.current = false;
    setRunning(true);
    setResults(null);
    setProgress(0);
    const found: TechResult[] = [];

    for (let i = 0; i < universe.length; i++) {
      if (abortRef.current) break;
      const sym = universe[i];
      setCurrentSym(sym.symbol);
      setProgress(Math.round((i / universe.length) * 100));

      const bars = await fetchTechBars(sym.symbol, barLimit);
      const { match, value } = computeSetupValue(bars, setupType, threshold);

      if (match && bars.length > 0) {
        found.push({ symbol: sym.symbol, name: sym.name, category: sym.category, price: bars[bars.length - 1].c, value, setupType });
      }

      if (i % 5 === 4) await new Promise(r => setTimeout(r, 10));
    }

    found.sort((a, b) => {
      if (setupType === 'rsi_os')  return a.value - b.value;   // lowest RSI first
      if (setupType === 'rsi_ob')  return b.value - a.value;   // highest RSI first
      if (setupType === 'hi52w')   return a.value - b.value;   // nearest to high first
      if (setupType === 'lo52w')   return a.value - b.value;   // nearest to low first
      return b.value - a.value;                                 // largest cross % first
    });

    setProgress(100);
    setResults(found);
    setRunning(false);
  }, [universe, setupType, threshold, barLimit]);

  const meta = TECH_LABELS[setupType];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Setup type selector */}
      <div style={{ padding: '6px 8px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: T.text3, letterSpacing: '0.06em', fontFamily: T.font, marginBottom: 5 }}>SETUP TYPE</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
          {(Object.keys(TECH_LABELS) as TechSetupType[]).map(st => {
            const { label, dir } = TECH_LABELS[st];
            const active = setupType === st;
            const color = dir === 'bull' ? T.bull : dir === 'bear' ? T.bear : T.accent;
            return (
              <button key={st}
                onClick={() => { setSetupType(st); setThreshold(defaultThreshold(st)); setResults(null); }}
                style={{
                  padding: '4px 6px', borderRadius: 3, fontSize: 9, fontWeight: 600,
                  fontFamily: T.font, cursor: 'pointer', outline: 'none',
                  border: `1px solid ${active ? color : T.border}`,
                  background: active ? (dir === 'bull' ? 'rgba(38,198,118,0.12)' : dir === 'bear' ? 'rgba(239,83,80,0.12)' : T.accentBg) : 'transparent',
                  color: active ? color : T.text3,
                  textAlign: 'left',
                }}
              >{label}</button>
            );
          })}
        </div>
      </div>

      {/* Threshold + Category */}
      <div style={{ padding: '6px 8px', borderBottom: `1px solid ${T.border}`, flexShrink: 0, display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 9, color: T.text3, fontFamily: T.font, whiteSpace: 'nowrap' }}>
            {setupType.startsWith('rsi') ? 'RSI thresh' : setupType.includes('52w') ? '% proximity' : '% diff min'}:
          </span>
          <input
            type="number"
            value={threshold}
            onChange={e => setThreshold(parseFloat(e.target.value) || 0)}
            step={setupType.startsWith('rsi') ? 1 : 0.1}
            style={{
              width: 52, height: 22, padding: '0 6px', borderRadius: 3,
              border: `1px solid ${T.border}`, background: T.surfaceAlt,
              color: T.text1, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace",
              outline: 'none',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {(['All', 'FX', 'Stocks', 'ETF', 'Indices', 'Crypto', 'Commodities'] as CatFilter[]).slice(0, 4).map(cat => (
            <button key={cat} onClick={() => setCatFilter(cat)} style={{
              padding: '2px 5px', borderRadius: 3, fontSize: 8, fontWeight: 600,
              border: `1px solid ${catFilter === cat ? T.accent : T.border}`,
              background: catFilter === cat ? T.accentBg : 'transparent',
              color: catFilter === cat ? T.accent : T.text3,
              cursor: 'pointer', outline: 'none', fontFamily: T.font,
            }}>{cat}</button>
          ))}
        </div>
      </div>

      {/* Run button */}
      <div style={{ padding: '5px 8px', borderBottom: `1px solid ${T.border}`, flexShrink: 0, display: 'flex', gap: 5, alignItems: 'center' }}>
        <button
          onClick={running ? () => { abortRef.current = true; } : runScan}
          style={{
            flex: 1, padding: '5px 0', borderRadius: 3, fontSize: 10, fontWeight: 600,
            fontFamily: T.font, cursor: 'pointer', outline: 'none', border: 'none',
            background: running ? T.border : (meta.dir === 'bull' ? T.bull : meta.dir === 'bear' ? T.bear : T.accent),
            color: running ? T.text3 : '#fff',
          }}
        >
          {running ? `⏹ Stop (${progress}%)` : `▶ Scan ${universe.length} syms`}
        </button>
        {running && currentSym && (
          <span style={{ fontSize: 8, color: T.text3, fontFamily: "'IBM Plex Mono', monospace" }}>{currentSym}</span>
        )}
      </div>

      {/* Results */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {results === null ? (
          <div style={{ padding: 16, textAlign: 'center', color: T.text3, fontSize: 10, fontFamily: T.font }}>
            {meta.desc}
          </div>
        ) : results.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: T.text3, fontSize: 10, fontFamily: T.font }}>
            No matches found
          </div>
        ) : (
          <>
            <div style={{ padding: '4px 8px', fontSize: 9, color: T.text3, fontFamily: T.font, borderBottom: `1px solid ${T.border}` }}>
              {results.length} result{results.length !== 1 ? 's' : ''}
            </div>
            {results.map(r => {
              const { dir } = TECH_LABELS[r.setupType];
              const color = dir === 'bull' ? T.bull : dir === 'bear' ? T.bear : T.accent;
              const valLabel = r.setupType.startsWith('rsi') ? `RSI ${r.value.toFixed(1)}`
                : r.setupType.includes('x') ? `${r.value.toFixed(3)}% diff`
                : `${r.value.toFixed(2)}% away`;
              return (
                <div key={r.symbol} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 8px', borderBottom: `1px solid ${T.border}`,
                  cursor: 'pointer',
                }}
                  onClick={() => dispatch({ type: 'SET_SYMBOL', symbol: r.symbol })}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.text1, fontFamily: "'IBM Plex Mono', monospace" }}>{r.symbol}</div>
                    <div style={{ fontSize: 8, color: T.text3, fontFamily: T.font }}>{r.name}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color, fontFamily: "'IBM Plex Mono', monospace" }}>{valLabel}</div>
                    <div style={{ fontSize: 8, color: T.text3, fontFamily: "'IBM Plex Mono', monospace" }}>{r.price > 100 ? r.price.toFixed(2) : r.price.toFixed(4)}</div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
type ScreenerTab = 'matrix' | 'scan' | 'filter' | 'gap' | 'setup';

export function ScreenerPanel() {
  const { state } = useWorkspace();
  const [tab, setTab] = useState<ScreenerTab>('matrix');
  const symbol = state.symbol;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        {([
          { id: 'matrix' as ScreenerTab, label: 'MTF'     },
          { id: 'scan'   as ScreenerTab, label: 'Signals' },
          { id: 'filter' as ScreenerTab, label: 'Filter'  },
          { id: 'gap'    as ScreenerTab, label: 'Gap'     },
          { id: 'setup'  as ScreenerTab, label: 'Setup'   },
        ]).map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1, padding: '7px 2px', border: 'none', outline: 'none',
                background: 'transparent', cursor: 'pointer',
                fontSize: 9, fontWeight: active ? 700 : 500, fontFamily: T.font,
                color: active ? T.accent : T.text3,
                borderBottom: `2px solid ${active ? T.accent : 'transparent'}`,
                transition: 'all 0.1s',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {tab === 'matrix'
          ? <MTFMatrix symbol={symbol} />
          : tab === 'scan'
          ? <SignalScan symbol={symbol} />
          : tab === 'filter'
          ? <FilterScan />
          : tab === 'gap'
          ? <GapScan />
          : <TechSetupScan />
        }
      </div>
    </div>
  );
}
