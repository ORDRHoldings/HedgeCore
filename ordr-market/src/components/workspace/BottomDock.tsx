'use client';
/**
 * ORDR Market — Bottom Dock
 * Sprint 33 — Algorithmic Trading Pro
 *
 * 5 tabs: Multi-Timeframe | Scanner Pro | Bar Replay | Strategy Lab | Orders
 *
 * Scanner Pro:  28 scan conditions, 4 symbol universes, auto-rescan, NEW signal
 *               badges, per-signal alert dispatch, grouped category filter
 * Strategy Lab: 9 strategies, TF selector (1D/4H/1H), Sharpe ratio, Max
 *               consecutive losses, Long vs Short win-rate breakdown
 * Orders:       Duration tracker, % P&L column, SL/TP display
 */
import React, { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import {
  Clock, ScanLine, PlayCircle, Cpu, ClipboardList, GripHorizontal,
  X, TrendingUp, TrendingDown, Loader, CheckCircle, XCircle,
  Bell, RefreshCw, BarChart2, Layers, History,
} from 'lucide-react';
import { T } from './tokens';
import { useWorkspace } from './WorkspaceProvider';
import type { BottomTab } from './workspace-types';
import { formatPrice, DEFAULT_WATCHLIST } from './workspace-data';
import { usePublicChartData } from '@/hooks/usePublicChartData';
import MiniCandleChart from '@/components/chart/MiniCandleChart';
import type { Bar } from '@/components/chart/indicators/types';
import { detectFVG } from '@/components/chart/detection/fvg';
import { detectMarketStructure } from '@/components/chart/detection/market-structure';
import { detectOrderBlocks } from '@/components/chart/detection/order-blocks';
import { detectLiquidityZones } from '@/components/chart/detection/liquidity-zones';
import { emaFromValues } from '@/components/chart/indicators/ema';
import { computeRSI } from '@/components/chart/indicators/rsi';
import { computeBollinger } from '@/components/chart/indicators/bollinger';
import { computeStochastic } from '@/components/chart/indicators/stochastic';
import { computeSMA } from '@/components/chart/indicators/sma';
import { computeMACD } from '@/components/chart/indicators/macd';
import { computeADX } from '@/components/chart/indicators/adx';
import { computeVWAP } from '@/components/chart/indicators/vwap';

// ── Tab Definitions ───────────────────────────────────────────────────────────

const BOTTOM_TABS: { id: BottomTab; icon: React.ReactNode; label: string }[] = [
  { id: 'mtf',        icon: <Clock size={12} />,          label: 'Multi-TF'    },
  { id: 'scanner',    icon: <ScanLine size={12} />,       label: 'Scanner'     },
  { id: 'confluence', icon: <Layers size={12} />,         label: 'Confluence'  },
  { id: 'replay',     icon: <PlayCircle size={12} />,     label: 'Replay'      },
  { id: 'strategy',   icon: <Cpu size={12} />,            label: 'Strategy'    },
  { id: 'orders',     icon: <ClipboardList size={12} />,  label: 'Orders'      },
];

// ── Shared helpers ────────────────────────────────────────────────────────────

const TF_TO_API: Record<string, string> = {
  '1m': '1min', '3m': '3min', '5m': '5min', '15m': '15min', '30m': '30min',
  '1h': '1h', '4h': '4h', 'D': '1day', 'W': '1week',
};

function fmtPrice(p: number): string {
  if (p < 10)   return p.toFixed(5);
  if (p < 1000) return p.toFixed(2);
  return p.toFixed(0);
}

function fmtDuration(ms: number): string {
  const totalMins = Math.floor(ms / 60_000);
  if (totalMins < 60) return `${totalMins}m`;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── MTF Strip ────────────────────────────────────────────────────────────────

interface MTFCardProps { symbol: string; tf: string; active: boolean; onSelect: () => void; }

function MTFCard({ symbol, tf, active, onSelect }: MTFCardProps) {
  const apiInterval = TF_TO_API[tf] ?? '1day';
  const { bars, loading } = usePublicChartData(symbol, apiInterval, 80);
  const lastBar  = bars[bars.length - 1];
  const firstBar = bars[0];
  const price    = lastBar?.c ?? null;
  const pctChange = price !== null && firstBar?.c
    ? ((price - firstBar.c) / firstBar.c) * 100 : null;
  const bull = (pctChange ?? 0) >= 0;

  return (
    <div onClick={onSelect} style={{
      flex: 1, minWidth: 100, display: 'flex', flexDirection: 'column',
      background: active ? T.selectedBg : T.surfaceAlt,
      border: `1px solid ${active ? T.accent : T.border}`,
      borderRadius: T.r3, overflow: 'hidden', cursor: 'pointer',
      transition: 'border-color 0.12s',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '3px 6px', borderBottom: `1px solid ${T.border}`, flexShrink: 0,
        background: active ? 'rgba(41,98,255,0.06)' : 'transparent',
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: active ? T.accent : T.text1, fontFamily: T.mono }}>{tf}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {price !== null && <span style={{ fontSize: 9, color: T.text2, fontFamily: T.mono }}>{fmtPrice(price)}</span>}
          {pctChange !== null && (
            <>
              <span style={{ fontSize: 9, fontWeight: 600, color: bull ? T.bull : T.bear, fontFamily: T.mono }}>
                {bull ? '+' : ''}{pctChange.toFixed(2)}%
              </span>
              {bull ? <TrendingUp size={9} color={T.bull} /> : <TrendingDown size={9} color={T.bear} />}
            </>
          )}
        </div>
      </div>
      <div style={{ flex: 1, background: T.chartBg, minHeight: 0, overflow: 'hidden' }}>
        {loading && !bars.length
          ? <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <span style={{ fontSize: 9, color: '#444', fontFamily: T.mono }}>loading…</span>
            </div>
          : <MiniCandleChart bars={bars} />}
      </div>
    </div>
  );
}

function MTFStrip() {
  const { state, dispatch } = useWorkspace();
  const timeframes = ['5m', '15m', '1h', '4h', 'D'];
  return (
    <div style={{ display: 'flex', gap: 4, padding: 8, height: '100%', overflow: 'hidden' }}>
      {timeframes.map(tf => (
        <MTFCard key={tf} symbol={state.symbol} tf={tf} active={state.timeframe === tf}
          onSelect={() => dispatch({ type: 'SET_TIMEFRAME', timeframe: tf })} />
      ))}
    </div>
  );
}

// ── Scanner Pro ───────────────────────────────────────────────────────────────

// 28 conditions across 3 categories
const SCAN_TYPES = [
  // Structure / SMC
  'Bullish FVG', 'Bearish FVG',
  'BOS Up', 'BOS Down',
  'CHoCH Bull', 'CHoCH Bear',
  'Bullish OB', 'Bearish OB',
  'EQ Highs', 'EQ Lows',
  'Liq Sweep Bull', 'Liq Sweep Bear',
  // Technical
  'EMA Cross',
  'Golden Cross', 'Death Cross',
  'MACD Cross Bull', 'MACD Cross Bear',
  'MA Stack Bull', 'MA Stack Bear',
  'ADX Trend Bull', 'ADX Trend Bear',
  'VWAP Reclaim', 'VWAP Loss',
  // Momentum
  'RSI Oversold', 'RSI Overbought',
  'Stoch Oversold', 'Stoch Overbought',
  'BB Squeeze',
  'Volume Spike',
] as const;
type ScanType = typeof SCAN_TYPES[number];

const SCAN_CATEGORIES: { id: ScanCategory; label: string; types: ScanType[] }[] = [
  {
    id: 'structure',
    label: 'Structure',
    types: [
      'Bullish FVG', 'Bearish FVG', 'BOS Up', 'BOS Down',
      'CHoCH Bull', 'CHoCH Bear', 'Bullish OB', 'Bearish OB',
      'EQ Highs', 'EQ Lows', 'Liq Sweep Bull', 'Liq Sweep Bear',
    ],
  },
  {
    id: 'technical',
    label: 'Technical',
    types: [
      'EMA Cross', 'Golden Cross', 'Death Cross',
      'MACD Cross Bull', 'MACD Cross Bear',
      'MA Stack Bull', 'MA Stack Bear',
      'ADX Trend Bull', 'ADX Trend Bear',
      'VWAP Reclaim', 'VWAP Loss',
    ],
  },
  {
    id: 'momentum',
    label: 'Momentum',
    types: ['RSI Oversold', 'RSI Overbought', 'Stoch Oversold', 'Stoch Overbought', 'BB Squeeze', 'Volume Spike'],
  },
];
type ScanCategory = 'all' | 'structure' | 'technical' | 'momentum';

type DirFilter = 'all' | 'bull' | 'bear';
type ScanTF = '1D' | '4H' | '1H' | '30m';
type ViewMode = 'signals' | 'summary';

const SCAN_TF_TO_API: Record<ScanTF, string> = { '1D': '1day', '4H': '4h', '1H': '1h', '30m': '30min' };

const SYMBOL_UNIVERSES: Record<string, { label: string; symbols: string[] }> = {
  watchlist: { label: 'Watchlist',  symbols: DEFAULT_WATCHLIST.map(w => w.symbol) },
  equities:  { label: 'Equities',   symbols: ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'META', 'GOOGL'] },
  etfs:      { label: 'ETFs',       symbols: ['SPY', 'QQQ', 'IWM', 'DIA'] },
  crypto:    { label: 'Crypto',     symbols: ['BTCUSD', 'ETHUSD'] },
};
type Universe = keyof typeof SYMBOL_UNIVERSES;

interface ScanResult {
  symbol: string;
  type: ScanType;
  price: number;
  direction: 'bull' | 'bear' | 'neutral';
  detail: string;
  isNew?: boolean;
}

interface SymbolScore {
  symbol: string;
  bull: number;
  bear: number;
  score: number;
  price: number;
  signals: ScanType[];
}

async function fetchScanBars(symbol: string, interval: string): Promise<Bar[]> {
  try {
    const res = await fetch(`/api/chart-data/${encodeURIComponent(symbol)}?interval=${interval}&limit=200`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.bars) ? data.bars : Array.isArray(data) ? data : [];
  } catch { return []; }
}

function runScans(symbol: string, bars: Bar[]): ScanResult[] {
  if (bars.length < 10) return [];
  const out: ScanResult[] = [];
  const lastBar  = bars[bars.length - 1];
  const lastPrice = lastBar.c;
  const closes   = bars.map(b => b.c);

  // ── FVG ──────────────────────────────────────────────────────────────────
  try {
    const fvgs = detectFVG(bars);
    const bullFVGs = fvgs.filter(z => z.type === 'bullish');
    const bearFVGs = fvgs.filter(z => z.type === 'bearish');
    if (bullFVGs.length > 0) {
      const z = bullFVGs[bullFVGs.length - 1];
      out.push({ symbol, type: 'Bullish FVG', price: (z.top + z.bottom) / 2, direction: 'bull', detail: `${bullFVGs.length} zone${bullFVGs.length > 1 ? 's' : ''}` });
    }
    if (bearFVGs.length > 0) {
      const z = bearFVGs[bearFVGs.length - 1];
      out.push({ symbol, type: 'Bearish FVG', price: (z.top + z.bottom) / 2, direction: 'bear', detail: `${bearFVGs.length} zone${bearFVGs.length > 1 ? 's' : ''}` });
    }
  } catch { /* skip */ }

  // ── Market Structure ─────────────────────────────────────────────────────
  try {
    const ms = detectMarketStructure(bars);
    const bosUp   = ms.events.filter(e => e.kind === 'BOS'   && e.direction === 'bullish');
    const bosDown = ms.events.filter(e => e.kind === 'BOS'   && e.direction === 'bearish');
    const chochUp = ms.events.filter(e => e.kind === 'CHoCH' && e.direction === 'bullish');
    const chochDn = ms.events.filter(e => e.kind === 'CHoCH' && e.direction === 'bearish');
    if (bosUp.length > 0)   out.push({ symbol, type: 'BOS Up',     price: bosUp[bosUp.length - 1].price,     direction: 'bull', detail: `${bosUp.length} break${bosUp.length > 1 ? 's' : ''}` });
    if (bosDown.length > 0) out.push({ symbol, type: 'BOS Down',   price: bosDown[bosDown.length - 1].price, direction: 'bear', detail: `${bosDown.length} break${bosDown.length > 1 ? 's' : ''}` });
    if (chochUp.length > 0) out.push({ symbol, type: 'CHoCH Bull', price: chochUp[chochUp.length - 1].price, direction: 'bull', detail: `${chochUp.length} CHoCH` });
    if (chochDn.length > 0) out.push({ symbol, type: 'CHoCH Bear', price: chochDn[chochDn.length - 1].price, direction: 'bear', detail: `${chochDn.length} CHoCH` });
  } catch { /* skip */ }

  // ── Order Blocks ─────────────────────────────────────────────────────────
  try {
    const obs = detectOrderBlocks(bars);
    const nearBullOB = obs.filter(ob => ob.type === 'bullish').find(ob => lastPrice >= ob.bottom * 0.997 && lastPrice <= ob.top * 1.003);
    const nearBearOB = obs.filter(ob => ob.type === 'bearish').find(ob => lastPrice >= ob.bottom * 0.997 && lastPrice <= ob.top * 1.003);
    if (nearBullOB) out.push({ symbol, type: 'Bullish OB', price: (nearBullOB.top + nearBullOB.bottom) / 2, direction: 'bull', detail: `${fmtPrice(nearBullOB.bottom)}–${fmtPrice(nearBullOB.top)}` });
    if (nearBearOB) out.push({ symbol, type: 'Bearish OB', price: (nearBearOB.top + nearBearOB.bottom) / 2, direction: 'bear', detail: `${fmtPrice(nearBearOB.bottom)}–${fmtPrice(nearBearOB.top)}` });
  } catch { /* skip */ }

  // ── Liquidity Zones ───────────────────────────────────────────────────────
  try {
    const liqZones = detectLiquidityZones(bars);
    const eqHighs  = liqZones.filter(z => z.type === 'buy-side'  && z.price > lastPrice);
    const eqLows   = liqZones.filter(z => z.type === 'sell-side' && z.price < lastPrice);
    if (eqHighs.length > 0) {
      const s = eqHighs.reduce((a, b) => b.strength > a.strength ? b : a);
      out.push({ symbol, type: 'EQ Highs', price: s.price, direction: 'neutral', detail: `${s.strength}× at ${fmtPrice(s.price)}` });
    }
    if (eqLows.length > 0) {
      const s = eqLows.reduce((a, b) => b.strength > a.strength ? b : a);
      out.push({ symbol, type: 'EQ Lows', price: s.price, direction: 'neutral', detail: `${s.strength}× at ${fmtPrice(s.price)}` });
    }
    const recentBars = bars.slice(-5);
    const recentLow  = Math.min(...recentBars.map(b => b.l));
    const recentHigh = Math.max(...recentBars.map(b => b.h));
    for (const z of eqLows)  { if (recentLow  < z.price && lastPrice > z.price) { out.push({ symbol, type: 'Liq Sweep Bull', price: lastPrice, direction: 'bull', detail: `Swept ${fmtPrice(z.price)}` }); break; } }
    for (const z of eqHighs) { if (recentHigh > z.price && lastPrice < z.price) { out.push({ symbol, type: 'Liq Sweep Bear', price: lastPrice, direction: 'bear', detail: `Swept ${fmtPrice(z.price)}` }); break; } }
  } catch { /* skip */ }

  // ── EMA 9×21 Cross ───────────────────────────────────────────────────────
  try {
    const ema9  = emaFromValues(closes, 9);
    const ema21 = emaFromValues(closes, 21);
    if (ema9.length >= 2 && ema21.length >= 2) {
      const n = ema9.length - 1, m = ema21.length - 1;
      if (ema9[n-1] <= ema21[m-1] && ema9[n] >  ema21[m]) out.push({ symbol, type: 'EMA Cross', price: lastPrice, direction: 'bull', detail: 'EMA9 > EMA21' });
      if (ema9[n-1] >= ema21[m-1] && ema9[n] <  ema21[m]) out.push({ symbol, type: 'EMA Cross', price: lastPrice, direction: 'bear', detail: 'EMA9 < EMA21' });
    }
  } catch { /* skip */ }

  // ── Golden Cross / Death Cross (SMA50 × SMA200) ───────────────────────────
  try {
    const sma50  = computeSMA(bars, 50);
    const sma200 = computeSMA(bars, 200);
    if (sma50.length >= 2 && sma200.length >= 2) {
      const prev50  = sma50[sma50.length - 2].value,  cur50  = sma50[sma50.length - 1].value;
      const prev200 = sma200[sma200.length - 2].value, cur200 = sma200[sma200.length - 1].value;
      if (prev50 <= prev200 && cur50 >  cur200) out.push({ symbol, type: 'Golden Cross', price: lastPrice, direction: 'bull', detail: 'SMA50 > SMA200' });
      if (prev50 >= prev200 && cur50 <  cur200) out.push({ symbol, type: 'Death Cross',  price: lastPrice, direction: 'bear', detail: 'SMA50 < SMA200' });
    }
  } catch { /* skip */ }

  // ── MACD Cross ────────────────────────────────────────────────────────────
  try {
    const macdPts = computeMACD(bars, 12, 26, 9);
    if (macdPts.length >= 2) {
      const prev = macdPts[macdPts.length - 2] as { macd: number; signal: number };
      const cur  = macdPts[macdPts.length - 1] as { macd: number; signal: number };
      if (prev.macd <= prev.signal && cur.macd >  cur.signal) out.push({ symbol, type: 'MACD Cross Bull', price: lastPrice, direction: 'bull', detail: `MACD ${cur.macd.toFixed(3)}` });
      if (prev.macd >= prev.signal && cur.macd <  cur.signal) out.push({ symbol, type: 'MACD Cross Bear', price: lastPrice, direction: 'bear', detail: `MACD ${cur.macd.toFixed(3)}` });
    }
  } catch { /* skip */ }

  // ── MA Stack ─────────────────────────────────────────────────────────────
  try {
    const ema9  = emaFromValues(closes, 9);
    const ema21 = emaFromValues(closes, 21);
    const ema50 = emaFromValues(closes, 50);
    if (ema9.length && ema21.length && ema50.length) {
      const e9 = ema9[ema9.length - 1], e21 = ema21[ema21.length - 1], e50 = ema50[ema50.length - 1];
      if (e9 > e21 && e21 > e50) out.push({ symbol, type: 'MA Stack Bull', price: lastPrice, direction: 'bull', detail: '9>21>50' });
      if (e9 < e21 && e21 < e50) out.push({ symbol, type: 'MA Stack Bear', price: lastPrice, direction: 'bear', detail: '9<21<50' });
    }
  } catch { /* skip */ }

  // ── ADX Trend ─────────────────────────────────────────────────────────────
  try {
    const adxPts = computeADX(bars, 14) as { adx: number; plusDI: number; minusDI: number }[];
    if (adxPts.length > 0) {
      const { adx, plusDI, minusDI } = adxPts[adxPts.length - 1];
      if (adx > 25 && plusDI  > minusDI) out.push({ symbol, type: 'ADX Trend Bull', price: lastPrice, direction: 'bull', detail: `ADX ${adx.toFixed(0)}` });
      if (adx > 25 && minusDI > plusDI)  out.push({ symbol, type: 'ADX Trend Bear', price: lastPrice, direction: 'bear', detail: `ADX ${adx.toFixed(0)}` });
    }
  } catch { /* skip */ }

  // ── VWAP Reclaim / Loss ───────────────────────────────────────────────────
  try {
    const vwapPts = computeVWAP(bars);
    if (vwapPts.length >= 2 && bars.length >= 2) {
      const prevV  = vwapPts[vwapPts.length - 2].value, curV  = vwapPts[vwapPts.length - 1].value;
      const prevC  = bars[bars.length - 2].c;
      if (prevC < prevV && lastPrice >= curV) out.push({ symbol, type: 'VWAP Reclaim', price: lastPrice, direction: 'bull', detail: `VWAP ${fmtPrice(curV)}` });
      if (prevC > prevV && lastPrice <= curV) out.push({ symbol, type: 'VWAP Loss',    price: lastPrice, direction: 'bear', detail: `VWAP ${fmtPrice(curV)}` });
    }
  } catch { /* skip */ }

  // ── RSI ───────────────────────────────────────────────────────────────────
  try {
    const rsiPts = computeRSI(bars, 14);
    if (rsiPts.length > 0) {
      const r = rsiPts[rsiPts.length - 1].value;
      if (r < 30) out.push({ symbol, type: 'RSI Oversold',  price: lastPrice, direction: 'bull', detail: `RSI ${r.toFixed(1)}` });
      if (r > 70) out.push({ symbol, type: 'RSI Overbought', price: lastPrice, direction: 'bear', detail: `RSI ${r.toFixed(1)}` });
    }
  } catch { /* skip */ }

  // ── Stochastic ────────────────────────────────────────────────────────────
  try {
    const stPts = computeStochastic(bars, 14, 3);
    if (stPts.length > 0) {
      const k = stPts[stPts.length - 1].k;
      if (k < 20) out.push({ symbol, type: 'Stoch Oversold',  price: lastPrice, direction: 'bull', detail: `%K ${k.toFixed(1)}` });
      if (k > 80) out.push({ symbol, type: 'Stoch Overbought', price: lastPrice, direction: 'bear', detail: `%K ${k.toFixed(1)}` });
    }
  } catch { /* skip */ }

  // ── Bollinger Squeeze ─────────────────────────────────────────────────────
  try {
    const bbPts = computeBollinger(bars, 20, 2);
    if (bbPts.length >= 20) {
      const recent  = bbPts.slice(-20);
      const widths  = recent.map(p => p.middle > 0 ? (p.upper - p.lower) / p.middle : 0);
      const currW   = widths[widths.length - 1];
      if (currW <= Math.min(...widths) * 1.05) {
        out.push({ symbol, type: 'BB Squeeze', price: lastPrice, direction: 'neutral', detail: `W ${(currW * 100).toFixed(2)}%` });
      }
    }
  } catch { /* skip */ }

  // ── Volume Spike ──────────────────────────────────────────────────────────
  if (bars.length >= 21) {
    const avgVol  = bars.slice(-21, -1).reduce((s, b) => s + (b.v || 0), 0) / 20;
    const lastVol = lastBar.v || 0;
    if (avgVol > 0 && lastVol > avgVol * 2) {
      out.push({ symbol, type: 'Volume Spike', price: lastPrice, direction: 'neutral', detail: `${(lastVol / avgVol).toFixed(1)}× avg` });
    }
  }

  return out;
}

function buildSummary(results: ScanResult[]): SymbolScore[] {
  const map = new Map<string, SymbolScore>();
  for (const r of results) {
    if (!map.has(r.symbol)) map.set(r.symbol, { symbol: r.symbol, bull: 0, bear: 0, score: 0, price: r.price, signals: [] });
    const s = map.get(r.symbol)!;
    if (r.direction === 'bull') s.bull++;
    else if (r.direction === 'bear') s.bear++;
    s.score = s.bull - s.bear;
    s.price = r.price;
    s.signals.push(r.type);
  }
  return Array.from(map.values()).sort((a, b) => b.score - a.score);
}

// ── Signal direction derived from type name ───────────────────────────────────
function sigDir(t: ScanType): 'bull' | 'bear' | 'neutral' {
  if (/Bull|Up|Oversold|Bullish|Golden|Reclaim|Stack Bull|Trend Bull|Cross Bull/.test(t)) return 'bull';
  if (/Bear|Down|Overbought|Bearish|Death|Loss|Stack Bear|Trend Bear|Cross Bear/.test(t)) return 'bear';
  return 'neutral';
}

function ScannerPanel() {
  const { dispatch } = useWorkspace();

  const [results, setResults]         = useState<ScanResult[]>([]);
  const [running, setRunning]         = useState(false);
  const [scanCategory, setScanCategory] = useState<ScanCategory>('all');
  const [filter, setFilter]           = useState<ScanType | null>(null);
  const [dirFilter, setDirFilter]     = useState<DirFilter>('all');
  const [viewMode, setViewMode]       = useState<ViewMode>('signals');
  const [scanTF, setScanTF]           = useState<ScanTF>('1D');
  const [universe, setUniverse]       = useState<Universe>('watchlist');
  const [lastRan, setLastRan]         = useState<Date | null>(null);
  const [progress, setProgress]       = useState(0);
  const [currentSym, setCurrentSym]   = useState('');
  const [autoRescan, setAutoRescan]   = useState(false);
  const [autoMins, setAutoMins]       = useState<5 | 15>(5);

  const prevResultKeysRef = useRef<Set<string>>(new Set());
  const runScanRef        = useRef<() => Promise<void>>(async () => {});

  const runScan = useCallback(async () => {
    setRunning(true);
    setResults([]);
    setProgress(0);
    const all: ScanResult[] = [];
    const syms    = SYMBOL_UNIVERSES[universe].symbols;
    const interval = SCAN_TF_TO_API[scanTF];
    for (let i = 0; i < syms.length; i++) {
      setCurrentSym(syms[i]);
      setProgress(Math.round((i / syms.length) * 100));
      const bars = await fetchScanBars(syms[i], interval);
      all.push(...runScans(syms[i], bars));
    }
    const marked = all.map(r => ({ ...r, isNew: !prevResultKeysRef.current.has(`${r.symbol}:${r.type}`) }));
    prevResultKeysRef.current = new Set(all.map(r => `${r.symbol}:${r.type}`));
    setProgress(100);
    setResults(marked);
    setLastRan(new Date());
    setRunning(false);
    setCurrentSym('');
  }, [scanTF, universe]);

  // Keep ref in sync for interval callback
  useEffect(() => { runScanRef.current = runScan; }, [runScan]);

  // Auto-rescan
  useEffect(() => {
    if (!autoRescan) return;
    const id = window.setInterval(() => { runScanRef.current(); }, autoMins * 60_000);
    return () => window.clearInterval(id);
  }, [autoRescan, autoMins]);

  // Reset filter chip when category changes
  useEffect(() => { setFilter(null); }, [scanCategory]);

  const visibleTypes = useMemo(() => {
    if (scanCategory === 'all') return SCAN_TYPES as unknown as ScanType[];
    return SCAN_CATEGORIES.find(c => c.id === scanCategory)?.types ?? [];
  }, [scanCategory]);

  const counts = useMemo(() =>
    (SCAN_TYPES as unknown as ScanType[]).reduce((acc, t) => ({ ...acc, [t]: results.filter(r => r.type === t).length }), {} as Record<ScanType, number>),
    [results],
  );

  const displayed = useMemo(() => results.filter(r => {
    if (filter   && r.type      !== filter)     return false;
    if (dirFilter === 'bull' && r.direction !== 'bull') return false;
    if (dirFilter === 'bear' && r.direction !== 'bear') return false;
    if (scanCategory !== 'all' && !visibleTypes.includes(r.type)) return false;
    return true;
  }), [results, filter, dirFilter, scanCategory, visibleTypes]);

  const summary     = useMemo(() => buildSummary(results), [results]);
  const bullCount   = results.filter(r => r.direction === 'bull').length;
  const bearCount   = results.filter(r => r.direction === 'bear').length;
  const newCount    = results.filter(r => r.isNew).length;

  function addAlert(r: ScanResult) {
    dispatch({ type: 'ADD_ALERT', alert: { type: 'price', symbol: r.symbol, condition: r.type, value: r.price, active: true, triggered: false } });
    dispatch({ type: 'SET_RIGHT_TAB', tab: 'alerts' });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Header row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderBottom: `1px solid ${T.border}`, flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: T.text1, fontFamily: T.font }}>Scanner</span>

        {results.length > 0 && (
          <>
            <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'rgba(38,166,154,0.15)', color: T.bull, fontWeight: 700, fontFamily: T.mono }}>{bullCount}▲</span>
            <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'rgba(239,83,80,0.15)',  color: T.bear, fontWeight: 700, fontFamily: T.mono }}>{bearCount}▼</span>
            {newCount > 0 && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'rgba(255,193,7,0.18)', color: '#FFC107', fontWeight: 700, fontFamily: T.mono }}>{newCount} NEW</span>}
          </>
        )}
        <div style={{ flex: 1 }} />

        {/* Universe selector */}
        <select value={universe} onChange={e => setUniverse(e.target.value as Universe)} style={{
          height: 22, padding: '0 4px', borderRadius: 3, border: `1px solid ${T.border}`,
          background: T.surfaceAlt, color: T.text1, fontSize: 9, fontFamily: T.font, outline: 'none', cursor: 'pointer',
        }}>
          {Object.entries(SYMBOL_UNIVERSES).map(([k, v]) => (
            <option key={k} value={k}>{v.label} ({v.symbols.length})</option>
          ))}
        </select>

        {/* TF selector */}
        {(['30m', '1H', '4H', '1D'] as ScanTF[]).map(tf => (
          <button key={tf} onClick={() => setScanTF(tf)} style={{
            padding: '2px 5px', borderRadius: 3, border: `1px solid ${scanTF === tf ? T.accent : T.border}`, outline: 'none',
            background: scanTF === tf ? T.accentBg : 'transparent',
            color: scanTF === tf ? T.accent : T.text3,
            fontSize: 9, fontWeight: 600, cursor: 'pointer', fontFamily: T.mono,
          }}>{tf}</button>
        ))}

        {/* View toggle */}
        <div style={{ display: 'flex', borderRadius: 3, overflow: 'hidden', border: `1px solid ${T.border}` }}>
          {(['signals', 'summary'] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setViewMode(v)} style={{
              padding: '2px 6px', border: 'none', outline: 'none',
              background: viewMode === v ? T.accent : 'transparent',
              color: viewMode === v ? '#fff' : T.text3,
              fontSize: 9, fontWeight: 600, cursor: 'pointer', fontFamily: T.font,
            }}>{v === 'signals' ? 'Signals' : 'Summary'}</button>
          ))}
        </div>

        {/* Auto-rescan toggle */}
        <button
          title={autoRescan ? `Auto-rescan every ${autoMins}m — click to disable` : 'Enable auto-rescan'}
          onClick={() => setAutoRescan(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 3, outline: 'none',
            border: `1px solid ${autoRescan ? T.accent : T.border}`,
            background: autoRescan ? T.accentBg : 'transparent',
            color: autoRescan ? T.accent : T.text3,
            fontSize: 9, fontWeight: 600, cursor: 'pointer', fontFamily: T.font,
          }}>
          <RefreshCw size={9} style={{ animation: autoRescan ? 'spin 2s linear infinite' : 'none' }} />
          {autoRescan ? (
            <select value={autoMins} onChange={e => { e.stopPropagation(); setAutoMins(Number(e.target.value) as 5 | 15); }}
              onClick={e => e.stopPropagation()}
              style={{ background: 'transparent', border: 'none', outline: 'none', color: T.accent, fontSize: 9, cursor: 'pointer', padding: 0 }}>
              <option value={5}>5m</option>
              <option value={15}>15m</option>
            </select>
          ) : 'Auto'}
        </button>

        {lastRan && (
          <span style={{ fontSize: 9, color: T.text3, fontFamily: T.mono }}>
            {lastRan.getHours().toString().padStart(2, '0')}:{lastRan.getMinutes().toString().padStart(2, '0')}
          </span>
        )}

        <button onClick={runScan} disabled={running} style={{
          padding: '4px 12px', borderRadius: T.r2, border: 'none', outline: 'none',
          background: running ? T.surfaceAlt : T.accent,
          color: running ? T.text3 : '#fff',
          fontSize: 10, fontWeight: 600, fontFamily: T.font,
          cursor: running ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          {running && <Loader size={9} style={{ animation: 'spin 1s linear infinite' }} />}
          {running ? 'Scanning…' : 'Run Scan'}
        </button>
      </div>

      {/* ── Progress bar ── */}
      {running && (
        <div style={{ flexShrink: 0, padding: '4px 10px', borderBottom: `1px solid ${T.border}`, background: T.bg }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 3, background: T.border, borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: T.accent, transition: 'width 0.2s', borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 9, color: T.text3, fontFamily: T.mono, minWidth: 70, textAlign: 'right' }}>
              {currentSym || '…'} {progress}%
            </span>
          </div>
        </div>
      )}

      {viewMode === 'signals' ? (
        <>
          {/* ── Category + Direction + Type filter bar ── */}
          <div style={{ flexShrink: 0, borderBottom: `1px solid ${T.border}` }}>
            {/* Category row */}
            <div style={{ display: 'flex', gap: 4, padding: '4px 8px', alignItems: 'center', borderBottom: `1px solid ${T.border}` }}>
              {(['all', 'structure', 'technical', 'momentum'] as ScanCategory[]).map(cat => {
                const active = scanCategory === cat;
                const count = cat === 'all' ? results.length
                  : (SCAN_CATEGORIES.find(c => c.id === cat)?.types ?? []).reduce((n, t) => n + (counts[t] || 0), 0);
                return (
                  <button key={cat} onClick={() => setScanCategory(cat)} style={{
                    padding: '2px 8px', borderRadius: 10, border: `1px solid ${active ? T.accent : T.border}`, outline: 'none',
                    background: active ? T.accentBg : 'transparent',
                    color: active ? T.accent : count > 0 ? T.text2 : T.text3,
                    fontSize: 9, fontWeight: active ? 600 : 400, cursor: 'pointer', fontFamily: T.font, flexShrink: 0,
                  }}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    {count > 0 && <span style={{ marginLeft: 4, opacity: 0.7 }}>({count})</span>}
                  </button>
                );
              })}
              <div style={{ flex: 1 }} />
              {/* Direction pills */}
              {(['all', 'bull', 'bear'] as DirFilter[]).map(d => {
                const active = dirFilter === d;
                const col = d === 'bull' ? T.bull : d === 'bear' ? T.bear : T.accent;
                const cnt = d === 'all' ? displayed.length : d === 'bull' ? bullCount : bearCount;
                return (
                  <button key={d} onClick={() => setDirFilter(d)} style={{
                    padding: '2px 6px', borderRadius: 10, border: `1px solid ${active ? col : T.border}`, outline: 'none',
                    background: active ? (d === 'bull' ? 'rgba(38,166,154,0.12)' : d === 'bear' ? 'rgba(239,83,80,0.12)' : T.accentBg) : 'transparent',
                    color: active ? col : T.text3,
                    fontSize: 9, fontWeight: 600, cursor: 'pointer', fontFamily: T.font, flexShrink: 0,
                  }}>
                    {d === 'all' ? `All (${cnt})` : d === 'bull' ? `▲ ${bullCount}` : `▼ ${bearCount}`}
                  </button>
                );
              })}
            </div>

            {/* Type chips row */}
            <div style={{ display: 'flex', gap: 4, padding: '4px 8px', overflowX: 'auto', alignItems: 'center' }}>
              {visibleTypes.map(t => (
                <button key={t} onClick={() => setFilter(f => f === t ? null : t)} style={{
                  padding: '1px 6px', borderRadius: 8, border: 'none', outline: 'none', flexShrink: 0,
                  background: filter === t ? T.accent : T.surfaceAlt,
                  color: filter === t ? '#fff' : counts[t] > 0 ? T.text1 : T.text3,
                  fontSize: 9, fontWeight: counts[t] > 0 ? 600 : 400,
                  cursor: 'pointer', fontFamily: T.font,
                }}>
                  {t}{counts[t] > 0 ? ` (${counts[t]})` : ''}
                </button>
              ))}
            </div>
          </div>

          {/* ── Signal list ── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
            {results.length === 0 && !running ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <span style={{ fontSize: 11, color: T.text3, fontFamily: T.font }}>
                  {lastRan ? 'No signals found.' : 'Configure universe & TF, then press Run Scan.'}
                </span>
              </div>
            ) : displayed.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <span style={{ fontSize: 11, color: T.text3, fontFamily: T.font }}>No matching signals.</span>
              </div>
            ) : (
              displayed.map((r, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
                  borderRadius: T.r2, cursor: 'pointer', marginBottom: 2,
                  border: `1px solid ${r.direction === 'bull' ? 'rgba(38,166,154,0.22)' : r.direction === 'bear' ? 'rgba(239,83,80,0.22)' : T.border}`,
                  background: r.isNew ? (r.direction === 'bull' ? 'rgba(38,166,154,0.06)' : r.direction === 'bear' ? 'rgba(239,83,80,0.06)' : 'rgba(255,193,7,0.04)') : T.surfaceAlt,
                }}
                  onClick={() => dispatch({ type: 'SET_SYMBOL', symbol: r.symbol })}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: r.direction === 'bull' ? T.bull : r.direction === 'bear' ? T.bear : T.text3 }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.text1, fontFamily: T.mono, width: 56, flexShrink: 0 }}>{r.symbol}</span>
                  <span style={{ fontSize: 10, fontWeight: 500, color: r.direction === 'bull' ? T.bull : r.direction === 'bear' ? T.bear : T.text2, fontFamily: T.font, flex: 1 }}>{r.type}</span>
                  {r.isNew && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, background: 'rgba(255,193,7,0.2)', color: '#FFC107', fontWeight: 700, fontFamily: T.mono, flexShrink: 0 }}>NEW</span>}
                  <span style={{ fontSize: 9, color: T.text3, fontFamily: T.mono, flexShrink: 0 }}>{r.detail}</span>
                  <span style={{ fontSize: 9, color: T.text2, fontFamily: T.mono, flexShrink: 0 }}>{fmtPrice(r.price)}</span>
                  <button
                    title="Add price alert"
                    onClick={e => { e.stopPropagation(); addAlert(r); }}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: T.text3, padding: '0 2px', outline: 'none', flexShrink: 0, display: 'flex', alignItems: 'center' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#FFC107'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = T.text3; }}
                  >
                    <Bell size={10} />
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        /* ── Summary view ── */
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
          {summary.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <span style={{ fontSize: 11, color: T.text3, fontFamily: T.font }}>
                {lastRan ? 'No signals.' : 'Press Run Scan to generate summary.'}
              </span>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 6, padding: '3px 8px 5px', borderBottom: `1px solid ${T.border}`, marginBottom: 4 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: T.text3, fontFamily: T.font, width: 56, flexShrink: 0 }}>SYMBOL</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: T.text3, fontFamily: T.font, flex: 1 }}>SIGNALS</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: T.bull,  fontFamily: T.mono, width: 24, textAlign: 'center' }}>▲</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: T.bear,  fontFamily: T.mono, width: 24, textAlign: 'center' }}>▼</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: T.text3, fontFamily: T.font, width: 36, textAlign: 'center' }}>SCORE</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: T.text3, fontFamily: T.font, width: 60, textAlign: 'right' }}>PRICE</span>
              </div>
              {summary.map(s => {
                const scoreColor = s.score > 0 ? T.bull : s.score < 0 ? T.bear : T.text3;
                const scoreBg    = s.score > 0 ? 'rgba(38,166,154,0.1)' : s.score < 0 ? 'rgba(239,83,80,0.1)' : T.surfaceAlt;
                return (
                  <div key={s.symbol}
                    onClick={() => dispatch({ type: 'SET_SYMBOL', symbol: s.symbol })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
                      borderRadius: T.r2, cursor: 'pointer', marginBottom: 2,
                      border: `1px solid ${s.score > 0 ? 'rgba(38,166,154,0.18)' : s.score < 0 ? 'rgba(239,83,80,0.18)' : T.border}`,
                      background: scoreBg,
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.8'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 700, color: T.text1, fontFamily: T.mono, width: 56, flexShrink: 0 }}>{s.symbol}</span>
                    <div style={{ flex: 1, display: 'flex', gap: 3, flexWrap: 'wrap', minWidth: 0 }}>
                      {s.signals.slice(0, 5).map((sig, idx) => {
                        const d = sigDir(sig);
                        return (
                          <span key={idx} style={{
                            fontSize: 8, padding: '1px 4px', borderRadius: 3, fontFamily: T.font, fontWeight: 600,
                            background: d === 'bull' ? 'rgba(38,166,154,0.15)' : d === 'bear' ? 'rgba(239,83,80,0.15)' : T.surfaceAlt,
                            color: d === 'bull' ? T.bull : d === 'bear' ? T.bear : T.text3, whiteSpace: 'nowrap',
                          }}>{sig}</span>
                        );
                      })}
                      {s.signals.length > 5 && <span style={{ fontSize: 8, color: T.text3, fontFamily: T.mono }}>+{s.signals.length - 5}</span>}
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, color: T.bull,       fontFamily: T.mono, width: 24, textAlign: 'center' }}>{s.bull || '–'}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: T.bear,       fontFamily: T.mono, width: 24, textAlign: 'center' }}>{s.bear || '–'}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: scoreColor,   fontFamily: T.mono, width: 36, textAlign: 'center' }}>{s.score > 0 ? `+${s.score}` : s.score}</span>
                    <span style={{ fontSize: 9,  color: T.text2,                       fontFamily: T.mono, width: 60, textAlign: 'right'  }}>{fmtPrice(s.price)}</span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Bar Replay Panel ──────────────────────────────────────────────────────────

const SPEEDS: (1 | 2 | 4 | 8)[] = [1, 2, 4, 8];

function Btn({ onClick, active, children, title, danger }: {
  onClick: () => void; active?: boolean; children: React.ReactNode; title?: string; danger?: boolean;
}) {
  return (
    <button onClick={onClick} title={title} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 9px', height: 24, borderRadius: T.r2, border: 'none', outline: 'none',
      background: danger ? 'rgba(239,83,80,0.12)' : active ? T.accentBg : T.surfaceAlt,
      color: danger ? T.bear : active ? T.accent : T.text2,
      fontSize: 10, fontWeight: 600, fontFamily: T.mono, cursor: 'pointer', flexShrink: 0,
    }}>
      {children}
    </button>
  );
}

function ReplayPanel() {
  const { state, dispatch } = useWorkspace();
  const { replayActive, replayIndex, replayPlaying, replaySpeed, replayTotal } = state;

  useEffect(() => {
    if (!replayPlaying || !replayActive) return;
    const id = window.setInterval(() => { dispatch({ type: 'REPLAY_STEP', delta: 1 }); }, Math.round(1000 / replaySpeed));
    return () => window.clearInterval(id);
  }, [replayPlaying, replayActive, replaySpeed, dispatch]);

  useEffect(() => {
    if (replayActive && replayPlaying && replayIndex >= replayTotal) dispatch({ type: 'REPLAY_PAUSE' });
  }, [replayIndex, replayTotal, replayActive, replayPlaying, dispatch]);

  if (!replayActive) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
        <PlayCircle size={20} color={T.text3} />
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.text1, fontFamily: T.font }}>Bar Replay</div>
          <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>Step through historical bars to practice analysis</div>
        </div>
        <button onClick={() => dispatch({ type: 'REPLAY_START' })} style={{
          padding: '6px 16px', borderRadius: 3, border: 'none', background: T.accent,
          color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: T.font,
        }}>Start Replay</button>
      </div>
    );
  }

  const pct = replayTotal > 0 ? (replayIndex / replayTotal) * 100 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '8px 12px', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Btn title="Step back (←)"    onClick={() => dispatch({ type: 'REPLAY_STEP', delta: -1 })}>◀</Btn>
        <Btn active={replayPlaying} title={replayPlaying ? 'Pause' : 'Play'}
          onClick={() => dispatch({ type: replayPlaying ? 'REPLAY_PAUSE' : 'REPLAY_PLAY' })}>
          {replayPlaying ? '⏸' : '▶'}
        </Btn>
        <Btn title="Step forward (→)" onClick={() => dispatch({ type: 'REPLAY_STEP', delta: 1 })}>▶▌</Btn>
        <div style={{ width: 1, height: 18, background: T.border }} />
        {SPEEDS.map(s => (
          <Btn key={s} active={replaySpeed === s} onClick={() => dispatch({ type: 'REPLAY_SET_SPEED', speed: s })}>{s}×</Btn>
        ))}
        <div style={{ width: 1, height: 18, background: T.border }} />
        <span style={{ fontSize: 10, color: T.text2, fontFamily: T.mono, whiteSpace: 'nowrap' }}>
          Bar <span style={{ color: T.text1, fontWeight: 700 }}>{replayIndex}</span>{' / '}{replayTotal}
        </span>
        <div style={{ flex: 1 }} />
        <Btn danger onClick={() => dispatch({ type: 'REPLAY_STOP' })} title="Exit replay">✕ Exit</Btn>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 9, color: T.text3, fontFamily: T.mono, width: 20 }}>0</span>
        <div style={{ flex: 1, position: 'relative', height: 20, display: 'flex', alignItems: 'center' }}>
          <div style={{ position: 'absolute', inset: '50% 0', height: 3, borderRadius: 2, background: T.border, transform: 'translateY(-50%)' }} />
          <div style={{ position: 'absolute', left: 0, top: '50%', height: 3, borderRadius: 2, background: T.accent, width: `${pct}%`, transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input type="range" min={1} max={Math.max(1, replayTotal)} value={replayIndex}
            onChange={e => dispatch({ type: 'REPLAY_SEEK', index: parseInt(e.target.value, 10) })}
            style={{ position: 'absolute', inset: 0, width: '100%', opacity: 0, cursor: 'pointer', margin: 0, padding: 0 }} />
          <div style={{ position: 'absolute', left: `${pct}%`, top: '50%', width: 12, height: 12, borderRadius: '50%', background: T.accent, border: `2px solid ${T.surface}`, transform: 'translate(-50%, -50%)', pointerEvents: 'none' }} />
        </div>
        <span style={{ fontSize: 9, color: T.text3, fontFamily: T.mono, width: 28, textAlign: 'right' }}>{replayTotal}</span>
      </div>
    </div>
  );
}

// ── Strategy Lab ──────────────────────────────────────────────────────────────

interface BacktestTrade {
  win:           boolean;
  pnl:           number;
  side:          'long' | 'short';
  entryPrice:    number;
  exitPrice:     number;
  entryBarIdx:   number;
  exitBarIdx:    number;
  entryT:        number;  // unix ms
  exitT:         number;  // unix ms
}
interface BacktestResult {
  trades:       BacktestTrade[];
  winRate:      number;
  profitFactor: number;
  netPnl:       number;
  maxDD:        number;
  avgWin:       number;
  avgLoss:      number;
  sharpe:       number;
  maxConsecLoss:number;
  longWinRate:  number;
  shortWinRate: number;
}

const STRATEGIES = [
  { id: 'ema_cross',    label: 'EMA 9×21 Cross'               },
  { id: 'rsi_revert',   label: 'RSI Mean Reversion (14)'      },
  { id: 'macd_cross',   label: 'MACD Cross (12,26,9)'         },
  { id: 'bb_bounce',    label: 'BB Bounce (20,2)'             },
  { id: 'stoch_cross',  label: 'Stochastic OB/OS (14,3)'      },
  { id: 'golden_cross', label: 'Golden Cross SMA50×200'       },
  { id: 'adx_ema',      label: 'ADX Trend + EMA Filter'       },
  { id: 'bb_squeeze',   label: 'BB Squeeze Breakout'          },
  { id: 'stoch_rsi',    label: 'Stoch RSI Extreme (14)'       },
] as const;
type StrategyId = typeof STRATEGIES[number]['id'];

type BacktestTF = '1day' | '4h' | '1h';
const BT_TF_LABELS: Record<BacktestTF, string>  = { '1day': '1D', '4h': '4H', '1h': '1H' };
const BT_TF_BARS:  Record<BacktestTF, number>   = { '1day': 500, '4h': 300, '1h': 200 };

function mkTrade(inTrade: { side: 'long'|'short'; entry: number; barIdx: number }, exitPrice: number, exitBarIdx: number, bars: Bar[]): BacktestTrade {
  const pnl = inTrade.side === 'long' ? exitPrice - inTrade.entry : inTrade.entry - exitPrice;
  return {
    win: pnl > 0, pnl, side: inTrade.side,
    entryPrice: inTrade.entry, exitPrice,
    entryBarIdx: inTrade.barIdx, exitBarIdx,
    entryT: (bars[inTrade.barIdx]?.t ?? 0) * 1000,
    exitT:  (bars[exitBarIdx]?.t  ?? 0) * 1000,
  };
}

function runBacktest(bars: Bar[], strategy: StrategyId): BacktestResult {
  const closes = bars.map(b => b.c);
  const trades: BacktestTrade[] = [];

  // ── EMA 9×21 Cross ────────────────────────────────────────────────────────
  if (strategy === 'ema_cross') {
    const ema9  = emaFromValues(closes, 9);
    const ema21 = emaFromValues(closes, 21);
    const offset = closes.length - ema9.length;
    let inTrade: { side: 'long' | 'short'; entry: number; barIdx: number } | null = null;
    for (let i = 1; i < ema9.length - 1; i++) {
      const price = bars[i + offset]?.c ?? 0; const bi = i + offset;
      if (ema9[i-1] <= ema21[i-1] && ema9[i] > ema21[i]) {
        if (inTrade?.side === 'short') trades.push(mkTrade(inTrade, price, bi, bars));
        inTrade = { side: 'long', entry: price, barIdx: bi };
      } else if (ema9[i-1] >= ema21[i-1] && ema9[i] < ema21[i]) {
        if (inTrade?.side === 'long') trades.push(mkTrade(inTrade, price, bi, bars));
        inTrade = { side: 'short', entry: price, barIdx: bi };
      }
    }

  // ── RSI Mean Reversion ────────────────────────────────────────────────────
  } else if (strategy === 'rsi_revert') {
    const rsi = computeRSI(bars, 14).map(p => p.value);
    const offset = closes.length - rsi.length;
    let inTrade: { side: 'long' | 'short'; entry: number; barIdx: number } | null = null;
    for (let i = 1; i < rsi.length - 1; i++) {
      const price = bars[i + offset]?.c ?? 0; const bi = i + offset;
      if (!inTrade) {
        if (rsi[i] < 30) inTrade = { side: 'long',  entry: price, barIdx: bi };
        else if (rsi[i] > 70) inTrade = { side: 'short', entry: price, barIdx: bi };
      } else {
        if (inTrade.side === 'long'  && rsi[i] > 50) { trades.push(mkTrade(inTrade, price, bi, bars)); inTrade = null; }
        else if (inTrade.side === 'short' && rsi[i] < 50) { trades.push(mkTrade(inTrade, price, bi, bars)); inTrade = null; }
      }
    }

  // ── MACD Cross ────────────────────────────────────────────────────────────
  } else if (strategy === 'macd_cross') {
    const ema12  = emaFromValues(closes, 12);
    const ema26  = emaFromValues(closes, 26);
    const len    = Math.min(ema12.length, ema26.length);
    const macdLine = ema12.slice(ema12.length - len).map((v, i) => v - ema26[ema26.length - len + i]);
    const signal   = emaFromValues(macdLine, 9);
    const off      = closes.length - signal.length;
    const macdOff  = macdLine.length - signal.length;
    let inTrade: { side: 'long' | 'short'; entry: number; barIdx: number } | null = null;
    for (let i = 1; i < signal.length - 1; i++) {
      const prevM = macdLine[i - 1 + macdOff], curM = macdLine[i + macdOff];
      const prevS = signal[i-1], curS = signal[i];
      const price = bars[i + off]?.c ?? 0; const bi = i + off;
      if (prevM <= prevS && curM > curS) { if (inTrade?.side === 'short') trades.push(mkTrade(inTrade, price, bi, bars)); inTrade = { side: 'long',  entry: price, barIdx: bi }; }
      if (prevM >= prevS && curM < curS) { if (inTrade?.side === 'long')  trades.push(mkTrade(inTrade, price, bi, bars)); inTrade = { side: 'short', entry: price, barIdx: bi }; }
    }

  // ── BB Bounce ─────────────────────────────────────────────────────────────
  } else if (strategy === 'bb_bounce') {
    const bb  = computeBollinger(bars, 20, 2);
    const off = bars.length - bb.length;
    let inTrade: { side: 'long' | 'short'; entry: number; barIdx: number } | null = null;
    for (let i = 1; i < bb.length - 1; i++) {
      const bi = i + off;
      const prevC = bars[bi - 1]?.c ?? 0, curC = bars[bi]?.c ?? 0;
      const { lower, middle, upper } = bb[i];
      if (!inTrade) {
        if (prevC <= lower  && curC > lower)  inTrade = { side: 'long',  entry: curC, barIdx: bi };
        else if (prevC >= upper && curC < upper) inTrade = { side: 'short', entry: curC, barIdx: bi };
      } else {
        if (inTrade.side === 'long'  && curC >= middle) { trades.push(mkTrade(inTrade, curC, bi, bars)); inTrade = null; }
        else if (inTrade.side === 'short' && curC <= middle) { trades.push(mkTrade(inTrade, curC, bi, bars)); inTrade = null; }
      }
    }

  // ── Stochastic OB/OS ──────────────────────────────────────────────────────
  } else if (strategy === 'stoch_cross') {
    const stoch = computeStochastic(bars, 14, 3);
    const off   = bars.length - stoch.length;
    let inTrade: { side: 'long' | 'short'; entry: number; barIdx: number } | null = null;
    for (let i = 1; i < stoch.length - 1; i++) {
      const bi = i + off; const price = bars[bi]?.c ?? 0;
      const prevK = stoch[i-1].k, curK = stoch[i].k;
      const prevD = stoch[i-1].d, curD = stoch[i].d;
      if (!inTrade) {
        if (prevK < 20 && prevK <= prevD && curK > curD) inTrade = { side: 'long',  entry: price, barIdx: bi };
        if (prevK > 80 && prevK >= prevD && curK < curD) inTrade = { side: 'short', entry: price, barIdx: bi };
      } else {
        if (inTrade.side === 'long'  && curK > 80 && curK < prevK) { trades.push(mkTrade(inTrade, price, bi, bars)); inTrade = null; }
        else if (inTrade.side === 'short' && curK < 20 && curK > prevK) { trades.push(mkTrade(inTrade, price, bi, bars)); inTrade = null; }
      }
    }

  // ── Golden Cross SMA50×200 ────────────────────────────────────────────────
  } else if (strategy === 'golden_cross') {
    const s50   = computeSMA(bars, 50).map(p => p.value);
    const s200  = computeSMA(bars, 200).map(p => p.value);
    const len   = Math.min(s50.length, s200.length);
    const a50   = s50.slice(s50.length - len);
    const a200  = s200.slice(s200.length - len);
    const off   = bars.length - len;
    let inTrade: { side: 'long' | 'short'; entry: number; barIdx: number } | null = null;
    for (let i = 1; i < len - 1; i++) {
      const bi = i + off; const price = bars[bi]?.c ?? 0;
      if (a50[i-1] <= a200[i-1] && a50[i] > a200[i]) { if (inTrade?.side === 'short') trades.push(mkTrade(inTrade, price, bi, bars)); inTrade = { side: 'long',  entry: price, barIdx: bi }; }
      if (a50[i-1] >= a200[i-1] && a50[i] < a200[i]) { if (inTrade?.side === 'long')  trades.push(mkTrade(inTrade, price, bi, bars)); inTrade = { side: 'short', entry: price, barIdx: bi }; }
    }

  // ── ADX Trend + EMA Filter ────────────────────────────────────────────────
  } else if (strategy === 'adx_ema') {
    const adxData = computeADX(bars, 14) as { adx: number; plusDI: number; minusDI: number }[];
    const ema21   = emaFromValues(closes, 21);
    const ema50   = emaFromValues(closes, 50);
    const len     = Math.min(adxData.length, ema21.length, ema50.length);
    const adxOff  = adxData.length - len;
    const e21Off  = ema21.length - len;
    const e50Off  = ema50.length - len;
    const barOff  = bars.length - len;
    let inTrade: { side: 'long' | 'short'; entry: number; barIdx: number } | null = null;
    for (let i = 1; i < len - 1; i++) {
      const bi = i + barOff; const price = bars[bi]?.c ?? 0;
      const { adx, plusDI, minusDI } = adxData[i + adxOff];
      const prevE21  = ema21[i - 1 + e21Off], curE21 = ema21[i + e21Off];
      const prevE50  = ema50[i - 1 + e50Off], curE50 = ema50[i + e50Off];
      const bullX    = prevE21 <= prevE50 && curE21 > curE50 && adx > 20 && plusDI > minusDI;
      const bearX    = prevE21 >= prevE50 && curE21 < curE50 && adx > 20 && minusDI > plusDI;
      if (bullX) { if (inTrade?.side === 'short') trades.push(mkTrade(inTrade, price, bi, bars)); inTrade = { side: 'long',  entry: price, barIdx: bi }; }
      if (bearX) { if (inTrade?.side === 'long')  trades.push(mkTrade(inTrade, price, bi, bars)); inTrade = { side: 'short', entry: price, barIdx: bi }; }
    }

  // ── BB Squeeze Breakout ───────────────────────────────────────────────────
  } else if (strategy === 'bb_squeeze') {
    const bb  = computeBollinger(bars, 20, 2);
    const off = bars.length - bb.length;
    let prevSq = false;
    let inTrade: { side: 'long' | 'short'; entry: number; barIdx: number } | null = null;
    for (let i = 5; i < bb.length - 1; i++) {
      const bi    = i + off;
      const price = bars[bi]?.c ?? 0;
      const recent = bb.slice(Math.max(0, i - 19), i + 1);
      const avgW   = recent.reduce((s, p) => s + (p.middle > 0 ? (p.upper - p.lower) / p.middle : 0), 0) / recent.length;
      const curW   = bb[i].middle > 0 ? (bb[i].upper - bb[i].lower) / bb[i].middle : 0;
      const inSq   = curW < avgW * 0.8;
      if (prevSq && !inSq) {
        if (price > bb[i].middle) { if (inTrade?.side === 'short') trades.push(mkTrade(inTrade, price, bi, bars)); inTrade = { side: 'long',  entry: price, barIdx: bi }; }
        else                      { if (inTrade?.side === 'long')  trades.push(mkTrade(inTrade, price, bi, bars)); inTrade = { side: 'short', entry: price, barIdx: bi }; }
      }
      if (inTrade) {
        if (inTrade.side === 'long'  && price < bb[i].middle) { trades.push(mkTrade(inTrade, price, bi, bars)); inTrade = null; }
        else if (inTrade.side === 'short' && price > bb[i].middle) { trades.push(mkTrade(inTrade, price, bi, bars)); inTrade = null; }
      }
      prevSq = inSq;
    }

  // ── Stoch RSI Extreme ─────────────────────────────────────────────────────
  } else {
    const rsiPts = computeRSI(bars, 14).map(p => p.value);
    const period = 14;
    const rawK: number[] = [];
    for (let i = period - 1; i < rsiPts.length; i++) {
      const w = rsiPts.slice(i - period + 1, i + 1);
      const maxR = Math.max(...w), minR = Math.min(...w);
      rawK.push(maxR === minR ? 50 : ((rsiPts[i] - minR) / (maxR - minR)) * 100);
    }
    const smoothK: number[] = [];
    for (let i = 2; i < rawK.length; i++) smoothK.push((rawK[i] + rawK[i-1] + rawK[i-2]) / 3);
    const off = bars.length - smoothK.length;
    let inTrade: { side: 'long' | 'short'; entry: number; barIdx: number } | null = null;
    for (let i = 1; i < smoothK.length - 1; i++) {
      const bi = i + off; const price = bars[bi]?.c ?? 0;
      const k = smoothK[i];
      if (!inTrade) {
        if (k < 20) inTrade = { side: 'long',  entry: price, barIdx: bi };
        else if (k > 80) inTrade = { side: 'short', entry: price, barIdx: bi };
      } else {
        if (inTrade.side === 'long'  && k > 80) { trades.push(mkTrade(inTrade, price, bi, bars)); inTrade = null; }
        else if (inTrade.side === 'short' && k < 20) { trades.push(mkTrade(inTrade, price, bi, bars)); inTrade = null; }
      }
    }
  }

  // ── Aggregate metrics ─────────────────────────────────────────────────────
  const wins   = trades.filter(t => t.win);
  const losses = trades.filter(t => !t.win);
  const grossWin  = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const netPnl    = trades.reduce((s, t) => s + t.pnl, 0);

  // Equity drawdown
  let peak = 0, equity = 0, maxDD = 0;
  for (const t of trades) {
    equity += t.pnl;
    if (equity > peak) peak = equity;
    maxDD = Math.max(maxDD, peak - equity);
  }

  // Sharpe ratio (annualised, trade-level)
  const pnls    = trades.map(t => t.pnl);
  const meanPnl = pnls.length ? pnls.reduce((a, b) => a + b, 0) / pnls.length : 0;
  const stdPnl  = pnls.length > 1
    ? Math.sqrt(pnls.reduce((a, t) => a + (t - meanPnl) ** 2, 0) / (pnls.length - 1))
    : 0;
  const sharpe  = stdPnl === 0 ? 0 : parseFloat((meanPnl / stdPnl * Math.sqrt(252)).toFixed(2));

  // Max consecutive losses
  let maxConsecLoss = 0, curConsec = 0;
  for (const t of trades) {
    if (!t.win) { curConsec++; maxConsecLoss = Math.max(maxConsecLoss, curConsec); }
    else curConsec = 0;
  }

  // Long / Short win rates
  const longTrades   = trades.filter(t => t.side === 'long');
  const shortTrades  = trades.filter(t => t.side === 'short');
  const longWinRate  = longTrades.length  ? parseFloat((longTrades.filter(t => t.win).length  / longTrades.length  * 100).toFixed(1)) : 0;
  const shortWinRate = shortTrades.length ? parseFloat((shortTrades.filter(t => t.win).length / shortTrades.length * 100).toFixed(1)) : 0;

  return {
    trades,
    winRate:      trades.length ? parseFloat((wins.length / trades.length * 100).toFixed(1)) : 0,
    profitFactor: grossLoss === 0 ? (grossWin > 0 ? 99 : 0) : parseFloat((grossWin / grossLoss).toFixed(2)),
    netPnl:       parseFloat(netPnl.toFixed(4)),
    maxDD:        parseFloat(maxDD.toFixed(4)),
    avgWin:       wins.length   ? parseFloat((grossWin  / wins.length).toFixed(4))  : 0,
    avgLoss:      losses.length ? parseFloat((grossLoss / losses.length).toFixed(4)): 0,
    sharpe,
    maxConsecLoss,
    longWinRate,
    shortWinRate,
  };
}

// ── Equity Curve Canvas ───────────────────────────────────────────────────────

function EquityCanvas({ trades }: { trades: BacktestTrade[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || trades.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W   = canvas.clientWidth  * dpr;
    const H   = canvas.clientHeight * dpr;
    canvas.width  = W;
    canvas.height = H;

    // Build equity series
    let eq = 0;
    const pts: number[] = [0];
    for (const t of trades) { eq += t.pnl; pts.push(eq); }
    const minV  = Math.min(...pts);
    const maxV  = Math.max(...pts);
    const range = maxV - minV || 1;
    const pad   = { top: 8 * dpr, btm: 8 * dpr, left: 4 * dpr, right: 4 * dpr };
    const drawW = W - pad.left - pad.right;
    const drawH = H - pad.top  - pad.btm;

    const toX = (i: number) => pad.left + (i / (pts.length - 1)) * drawW;
    const toY = (v: number) => pad.top  + (1 - (v - minV) / range) * drawH;
    const zeroY = toY(0);

    ctx.clearRect(0, 0, W, H);

    // Zero line
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth   = 1 * dpr;
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(W - pad.right, zeroY); ctx.stroke();
    ctx.setLineDash([]);

    // Determine final color
    const finalEq   = pts[pts.length - 1];
    const lineColor = finalEq >= 0 ? '#26a69a' : '#ef5350';
    const fillColor = finalEq >= 0 ? 'rgba(38,166,154,0.15)' : 'rgba(239,83,80,0.15)';

    // Fill below/above zero
    ctx.beginPath();
    ctx.moveTo(toX(0), zeroY);
    pts.forEach((v, i) => ctx.lineTo(toX(i), toY(v)));
    ctx.lineTo(toX(pts.length - 1), zeroY);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    // Drawdown overlay (peak to trough areas in red)
    let peak = 0;
    ctx.beginPath();
    let ddActive = false;
    pts.forEach((v, i) => {
      if (v > peak) { peak = v; ddActive = false; }
      const dd = peak - v;
      if (dd > range * 0.02) {
        if (!ddActive) { ctx.moveTo(toX(i), toY(peak)); ddActive = true; }
        ctx.lineTo(toX(i), toY(v));
      }
    });
    ctx.strokeStyle = 'rgba(239,83,80,0.4)';
    ctx.lineWidth   = 1 * dpr;
    ctx.stroke();

    // Equity line
    ctx.beginPath();
    pts.forEach((v, i) => {
      if (i === 0) ctx.moveTo(toX(i), toY(v));
      else         ctx.lineTo(toX(i), toY(v));
    });
    ctx.strokeStyle = lineColor;
    ctx.lineWidth   = 1.5 * dpr;
    ctx.lineJoin    = 'round';
    ctx.stroke();
  }, [trades]);

  return (
    <canvas
      ref={canvasRef}
      style={{ flex: 1, minHeight: 0, width: '100%', borderRadius: 3, background: T.surfaceAlt }}
    />
  );
}

// ── Walk-Forward types ────────────────────────────────────────────────────────

type LabMode = 'standard' | 'walkforward';
type WFWindows = 5 | 10 | 20;

interface WFWindowResult {
  window: number;
  trades: number;
  winRate: number;
  netPnl: number;
  sharpe: number;
  maxDD: number;
  profitable: boolean;
}

function StrategyDock() {
  const { state, dispatch } = useWorkspace();
  const [strategy,   setStrategy]   = useState<StrategyId>('ema_cross');
  const [btTF,       setBtTF]       = useState<BacktestTF>('1day');
  const [result,     setResult]     = useState<BacktestResult | null>(null);
  const [running,    setRunning]    = useState(false);
  const [activeTab,  setActiveTab]  = useState<'curve' | 'trades'>('curve');

  // Walk-forward state
  const [labMode,    setLabMode]    = useState<LabMode>('standard');
  const [wfWindows,  setWfWindows]  = useState<WFWindows>(10);
  const [wfResults,  setWfResults]  = useState<WFWindowResult[]>([]);
  const [wfRunning,  setWfRunning]  = useState(false);

  const { bars, loading } = usePublicChartData(state.symbol, btTF, BT_TF_BARS[btTF]);

  function handleRun() {
    if (bars.length < 30) return;
    setRunning(true);
    setTimeout(() => {
      const r = runBacktest(bars, strategy);
      setResult(r);
      setRunning(false);
      dispatch({
        type: 'SET_BACKTEST_MARKERS',
        markers: r.trades.map(t => ({
          entryT: t.entryT, exitT: t.exitT,
          entryPrice: t.entryPrice, exitPrice: t.exitPrice,
          side: t.side, win: t.win,
        })),
      });
    }, 80);
  }

  function handleWFRun() {
    const windowSize = Math.floor(bars.length / wfWindows);
    if (windowSize < 20) return;
    setWfRunning(true);
    setTimeout(() => {
      const results: WFWindowResult[] = [];
      for (let w = 0; w < wfWindows; w++) {
        const start = w * windowSize;
        const end   = w === wfWindows - 1 ? bars.length : start + windowSize;
        const slice = bars.slice(start, end);
        if (slice.length < 20) continue;
        const r = runBacktest(slice, strategy);
        results.push({
          window: w + 1,
          trades:    r.trades.length,
          winRate:   r.winRate,
          netPnl:    r.netPnl,
          sharpe:    r.sharpe,
          maxDD:     r.maxDD,
          profitable: r.netPnl > 0,
        });
      }
      setWfResults(results);
      setWfRunning(false);
    }, 80);
  }

  const statCell = (label: string, value: string | number, color?: string) => (
    <div style={{ textAlign: 'center', padding: '5px 6px', background: T.surfaceAlt, borderRadius: 3, flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 7, fontWeight: 700, color: T.text3, letterSpacing: '0.06em', fontFamily: T.font, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: color ?? T.text1, fontFamily: T.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  );

  const windowSize = Math.floor(bars.length / wfWindows);
  const profitableCount = wfResults.filter(r => r.profitable).length;
  const stabilityScore  = wfResults.length > 0 ? Math.round((profitableCount / wfResults.length) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: 10, gap: 8 }}>

      {/* Controls row */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
        <select value={strategy} onChange={e => { setStrategy(e.target.value as StrategyId); setResult(null); setWfResults([]); }} style={{
          flex: 1, minWidth: 140, height: 26, padding: '0 6px', borderRadius: 3,
          border: `1px solid ${T.border}`, background: T.surfaceAlt,
          color: T.text1, fontSize: 10, fontFamily: T.font, outline: 'none', cursor: 'pointer',
        }}>
          {STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>

        {/* TF selector */}
        <div style={{ display: 'flex', borderRadius: 3, overflow: 'hidden', border: `1px solid ${T.border}`, flexShrink: 0 }}>
          {(Object.keys(BT_TF_LABELS) as BacktestTF[]).map(tf => (
            <button key={tf} onClick={() => { setBtTF(tf); setResult(null); setWfResults([]); }} style={{
              padding: '0 7px', height: 26, border: 'none', outline: 'none',
              background: btTF === tf ? T.accent : 'transparent',
              color: btTF === tf ? '#fff' : T.text3,
              fontSize: 9, fontWeight: 600, cursor: 'pointer', fontFamily: T.mono,
            }}>{BT_TF_LABELS[tf]}</button>
          ))}
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', borderRadius: 3, overflow: 'hidden', border: `1px solid ${T.border}`, flexShrink: 0 }}>
          {(['standard', 'walkforward'] as LabMode[]).map(m => (
            <button key={m} onClick={() => setLabMode(m)} style={{
              padding: '0 7px', height: 26, border: 'none', outline: 'none',
              background: labMode === m ? T.accent : 'transparent',
              color: labMode === m ? '#fff' : T.text3,
              fontSize: 9, fontWeight: 600, cursor: 'pointer', fontFamily: T.mono,
            }}>{m === 'standard' ? 'Standard' : 'Walk-Fwd'}</button>
          ))}
        </div>

        {/* Walk-forward: window count selector */}
        {labMode === 'walkforward' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <span style={{ fontSize: 8, color: T.text3, fontFamily: T.mono }}>WIN</span>
            {([5, 10, 20] as WFWindows[]).map(n => (
              <button key={n} onClick={() => { setWfWindows(n); setWfResults([]); }} style={{
                width: 22, height: 22, border: `1px solid ${wfWindows === n ? T.accent : T.border}`,
                borderRadius: 3, background: wfWindows === n ? T.accentBg : 'transparent',
                color: wfWindows === n ? T.accent : T.text3,
                fontSize: 8, fontWeight: 700, cursor: 'pointer', fontFamily: T.mono, outline: 'none',
              }}>{n}</button>
            ))}
          </div>
        )}

        <span style={{ fontSize: 9, color: T.text3, fontFamily: T.font, flexShrink: 0 }}>
          {state.symbol} · {bars.length} bars{labMode === 'walkforward' && windowSize >= 20 ? ` · ${windowSize}/win` : ''}
        </span>

        {labMode === 'standard' ? (
          <button onClick={handleRun} disabled={running || loading || bars.length < 30} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '0 12px', height: 26, borderRadius: 3, border: 'none',
            background: T.accent, color: '#fff', fontSize: 10, fontWeight: 600,
            fontFamily: T.font, cursor: running ? 'default' : 'pointer', outline: 'none',
            opacity: running || loading ? 0.6 : 1, flexShrink: 0,
          }}>
            {running ? <Loader size={10} style={{ animation: 'spin 1s linear infinite' }} /> : <BarChart2 size={10} />}
            {running ? 'Running…' : 'Run'}
          </button>
        ) : (
          <button onClick={handleWFRun} disabled={wfRunning || loading || windowSize < 20} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '0 12px', height: 26, borderRadius: 3, border: 'none',
            background: T.accent, color: '#fff', fontSize: 10, fontWeight: 600,
            fontFamily: T.font, cursor: wfRunning ? 'default' : 'pointer', outline: 'none',
            opacity: wfRunning || loading || windowSize < 20 ? 0.6 : 1, flexShrink: 0,
          }} title={windowSize < 20 ? 'Not enough bars per window (need ≥20)' : ''}>
            {wfRunning ? <Loader size={10} style={{ animation: 'spin 1s linear infinite' }} /> : <BarChart2 size={10} />}
            {wfRunning ? 'Running…' : 'Analyze'}
          </button>
        )}
      </div>

      {result ? (
        <>
          {/* Primary stats row */}
          <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
            {statCell('TRADES',   result.trades.length)}
            {statCell('WIN RATE', `${result.winRate}%`,      result.winRate >= 50 ? T.bull : T.bear)}
            {statCell('PF',       result.profitFactor,       result.profitFactor >= 1.5 ? T.bull : result.profitFactor >= 1 ? (T.warn ?? '#FF9800') : T.bear)}
            {statCell('NET P&L',  result.netPnl >= 0 ? `+${result.netPnl}` : `${result.netPnl}`, result.netPnl >= 0 ? T.bull : T.bear)}
            {statCell('MAX DD',   result.maxDD.toFixed(2),   T.bear)}
          </div>

          {/* Secondary stats row */}
          <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
            {statCell('SHARPE',     result.sharpe, result.sharpe > 1 ? T.bull : result.sharpe > 0 ? (T.warn ?? '#FF9800') : T.bear)}
            {statCell('MAX CONSEC L', result.maxConsecLoss, result.maxConsecLoss > 5 ? T.bear : T.text1)}
            {statCell('LONG W%',   result.longWinRate  > 0 ? `${result.longWinRate}%`  : '–', result.longWinRate  >= 50 ? T.bull : T.bear)}
            {statCell('SHORT W%',  result.shortWinRate > 0 ? `${result.shortWinRate}%` : '–', result.shortWinRate >= 50 ? T.bull : T.bear)}
            {statCell('AVG W:L',
              result.avgLoss > 0 ? `${(result.avgWin / result.avgLoss).toFixed(2)}` : '–',
              result.avgLoss > 0 && result.avgWin / result.avgLoss >= 1.5 ? T.bull : T.text1)}
          </div>

          {/* Equity / Trades tab bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, borderBottom: `1px solid ${T.border}`, paddingBottom: 4 }}>
            {(['curve', 'trades'] as const).map(tab => (
              <span key={tab} onClick={() => setActiveTab(tab)} style={{
                fontSize: 9, fontWeight: activeTab === tab ? 700 : 400,
                color: activeTab === tab ? T.accent : T.text3,
                cursor: 'pointer', fontFamily: T.font,
                paddingBottom: 3, borderBottom: activeTab === tab ? `2px solid ${T.accent}` : '2px solid transparent',
              }}>
                {tab === 'curve' ? `EQUITY CURVE · ${result.trades.length} trades` : 'TRADE LIST'}
              </span>
            ))}
            <div style={{ flex: 1 }} />
            <button
              onClick={() => {
                const rows = [['#','Side','Win','Entry','Exit','P&L','Cumulative P&L']];
                let cum = 0;
                result.trades.forEach((t, i) => { cum += t.pnl; rows.push([String(i + 1), t.side, t.win ? 'W' : 'L', t.entryPrice.toFixed(5), t.exitPrice.toFixed(5), t.pnl.toFixed(5), cum.toFixed(5)]); });
                const csv = rows.map(r => r.join(',')).join('\n');
                const a = document.createElement('a');
                a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
                a.download = `backtest_${strategy}_${state.symbol}_${btTF}.csv`;
                a.click();
              }}
              style={{ fontSize: 8, fontWeight: 600, padding: '2px 6px', borderRadius: 3, border: `1px solid ${T.border}`, background: T.surfaceAlt, color: T.text2, cursor: 'pointer', outline: 'none', fontFamily: T.font }}
            >↓ CSV</button>
          </div>

          {activeTab === 'curve' ? (
            <EquityCanvas trades={result.trades} />
          ) : (
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, fontFamily: T.mono }}>
                <thead style={{ position: 'sticky', top: 0, background: T.surface }}>
                  <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                    {['#','SIDE','ENTRY','EXIT','P&L','W/L'].map(h => (
                      <th key={h} style={{ padding: '3px 5px', textAlign: h === '#' || h === 'SIDE' || h === 'W/L' ? 'left' : 'right', fontSize: 7, fontWeight: 700, color: T.text3, letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.trades.map((t, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 === 0 ? 'transparent' : T.surfaceAlt }}>
                      <td style={{ padding: '2px 5px', color: T.text3 }}>{i + 1}</td>
                      <td style={{ padding: '2px 5px', color: t.side === 'long' ? T.bull : T.bear, fontWeight: 600 }}>{t.side === 'long' ? '▲ L' : '▼ S'}</td>
                      <td style={{ padding: '2px 5px', textAlign: 'right', color: T.text2 }}>{t.entryPrice.toFixed(5)}</td>
                      <td style={{ padding: '2px 5px', textAlign: 'right', color: T.text2 }}>{t.exitPrice.toFixed(5)}</td>
                      <td style={{ padding: '2px 5px', textAlign: 'right', color: t.pnl >= 0 ? T.bull : T.bear, fontWeight: 600 }}>{t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(5)}</td>
                      <td style={{ padding: '2px 5px', fontWeight: 700, color: t.win ? T.bull : T.bear }}>{t.win ? 'W' : 'L'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Avg win/loss footer */}
          <div style={{ display: 'flex', gap: 4, flexShrink: 0, fontSize: 9, fontFamily: T.mono, color: T.text3 }}>
            <span style={{ color: T.bull }}>Avg Win: +{result.avgWin}</span>
            <span style={{ marginLeft: 'auto', color: T.bear }}>Avg Loss: -{result.avgLoss}</span>
          </div>
        </>
      ) : labMode === 'standard' ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text3, fontSize: 10, fontFamily: T.font }}>
          Select a strategy and press Run to backtest on {state.symbol} ({BT_TF_LABELS[btTF]})
        </div>
      ) : null}

      {/* ── Walk-Forward Results ── */}
      {labMode === 'walkforward' && wfResults.length > 0 && (
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>

          {/* Stability header */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: stabilityScore >= 70 ? T.bullBg : stabilityScore >= 50 ? T.warnBg : T.bearBg,
              border: `1px solid ${stabilityScore >= 70 ? T.bullBorder : stabilityScore >= 50 ? 'rgba(229,168,75,0.3)' : T.bearBorder}`,
              borderRadius: T.r3, padding: '4px 10px', flex: 1,
            }}>
              <span style={{ fontSize: 9, fontWeight: 700, fontFamily: T.mono, color: T.text2, letterSpacing: '0.04em' }}>STABILITY</span>
              <span style={{ fontSize: 14, fontWeight: 700, fontFamily: T.mono, color: stabilityScore >= 70 ? T.bull : stabilityScore >= 50 ? T.warn : T.bear }}>
                {stabilityScore}%
              </span>
              <span style={{ fontSize: 9, fontFamily: T.mono, color: T.text3 }}>
                {profitableCount}/{wfResults.length} windows profitable
              </span>
            </div>
            {/* Avg metrics */}
            {(() => {
              const avg = (key: keyof WFWindowResult) =>
                (wfResults.reduce((s, r) => s + (r[key] as number), 0) / wfResults.length);
              const avgWR  = avg('winRate');
              const avgPnl = avg('netPnl');
              const avgSh  = avg('sharpe');
              return (
                <>
                  {statCell('AVG WIN%', `${avgWR.toFixed(0)}%`, avgWR >= 50 ? T.bull : T.bear)}
                  {statCell('AVG PNL',  avgPnl >= 0 ? `+${avgPnl.toFixed(3)}` : avgPnl.toFixed(3), avgPnl >= 0 ? T.bull : T.bear)}
                  {statCell('AVG SHARPE', avgSh.toFixed(2), avgSh > 1 ? T.bull : avgSh > 0 ? T.warn : T.bear)}
                </>
              );
            })()}
          </div>

          {/* SVG equity curve across windows */}
          {(() => {
            const cumulativePnl: number[] = [];
            let cum = 0;
            wfResults.forEach(r => { cum += r.netPnl; cumulativePnl.push(cum); });
            const minV = Math.min(0, ...cumulativePnl);
            const maxV = Math.max(0, ...cumulativePnl);
            const range = maxV - minV || 1;
            const W = 400, H = 52;
            const pad = 4;
            const toX = (i: number) => pad + (i / (cumulativePnl.length - 1 || 1)) * (W - pad * 2);
            const toY = (v: number) => H - pad - ((v - minV) / range) * (H - pad * 2);
            const pts = cumulativePnl.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');
            const zero = toY(0);
            const final = cumulativePnl[cumulativePnl.length - 1] ?? 0;
            const lineColor = final >= 0 ? T.bull : T.bear;
            return (
              <div style={{ flexShrink: 0, background: T.surfaceAlt, borderRadius: T.r3, overflow: 'hidden' }}>
                <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', height: H }}>
                  {/* Zero line */}
                  <line x1={pad} y1={zero} x2={W - pad} y2={zero} stroke={T.border} strokeWidth="1" strokeDasharray="3,3" />
                  {/* Equity path fill */}
                  <polygon
                    points={`${toX(0)},${zero} ${pts} ${toX(cumulativePnl.length - 1)},${zero}`}
                    fill={lineColor} opacity="0.12"
                  />
                  {/* Equity line */}
                  <polyline points={pts} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinejoin="round" />
                  {/* Data points */}
                  {cumulativePnl.map((v, i) => (
                    <circle key={i} cx={toX(i)} cy={toY(v)} r="2" fill={wfResults[i].profitable ? T.bull : T.bear} />
                  ))}
                </svg>
              </div>
            );
          })()}

          {/* Per-window table */}
          <div style={{ flexShrink: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, fontFamily: T.mono }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                  {['WIN', 'TRADES', 'WIN%', 'NET P&L', 'SHARPE', 'MAX DD'].map(h => (
                    <th key={h} style={{ textAlign: h === 'WIN' ? 'left' : 'right', padding: '2px 5px', fontSize: 7, fontWeight: 700, color: T.text3, letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {wfResults.map((r, i) => (
                  <tr key={i} style={{ background: r.profitable ? 'rgba(38,166,154,0.04)' : 'rgba(239,83,80,0.04)', borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: '3px 5px', fontWeight: 700, color: T.text1 }}>
                      <span style={{ fontSize: 7, marginRight: 3 }}>{r.profitable ? '▲' : '▼'}</span>{r.window}
                    </td>
                    <td style={{ padding: '3px 5px', textAlign: 'right', color: T.text2 }}>{r.trades}</td>
                    <td style={{ padding: '3px 5px', textAlign: 'right', color: r.winRate >= 50 ? T.bull : T.bear, fontWeight: 600 }}>{r.winRate}%</td>
                    <td style={{ padding: '3px 5px', textAlign: 'right', color: r.netPnl >= 0 ? T.bull : T.bear, fontWeight: 600 }}>
                      {r.netPnl >= 0 ? '+' : ''}{r.netPnl.toFixed(3)}
                    </td>
                    <td style={{ padding: '3px 5px', textAlign: 'right', color: r.sharpe > 1 ? T.bull : r.sharpe > 0 ? T.warn : T.bear }}>{r.sharpe.toFixed(2)}</td>
                    <td style={{ padding: '3px 5px', textAlign: 'right', color: T.bear }}>{r.maxDD.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {labMode === 'walkforward' && wfResults.length === 0 && !wfRunning && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text3, fontSize: 10, fontFamily: T.font, textAlign: 'center', padding: 12 }}>
          {windowSize < 20
            ? `Need more bars — each window has only ${windowSize} bars (min 20). Use fewer windows or a longer TF.`
            : `Walk-Forward splits ${bars.length} bars into ${wfWindows} windows of ~${windowSize} bars each.\nPress Analyze to test strategy robustness.`}
        </div>
      )}
    </div>
  );
}

// ── Orders / Positions ────────────────────────────────────────────────────────

type OrderTab = 'open' | 'history';

const PRESET_TAGS = ['winner', 'loser', 'breakout', 'reversal', 'news', 'over-held', 'fomo', 'planned'];

function OrdersDock() {
  const { state, dispatch, symbolInfo } = useWorkspace();
  const [tab, setTab] = useState<OrderTab>('open');
  const [now, setNow] = useState(Date.now());
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState<Record<string, string>>({});

  // Live clock for duration display
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(id);
  }, []);

  const positions = state.paperPositions;
  const history   = state.tradeHistory;

  const histStats = useMemo(() => {
    if (!history.length) return null;
    const wins = history.filter(t => t.pnl > 0);
    const totalPnl  = history.reduce((s, t) => s + t.pnl, 0);
    const grossWin  = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(history.filter(t => t.pnl <= 0).reduce((s, t) => s + t.pnl, 0));
    return {
      total:    history.length,
      winRate:  parseFloat((wins.length / history.length * 100).toFixed(1)),
      totalPnl: parseFloat(totalPnl.toFixed(4)),
      pf:       grossLoss === 0 ? (grossWin > 0 ? 99 : 0) : parseFloat((grossWin / grossLoss).toFixed(2)),
    };
  }, [history]);

  const tabStyle = (id: OrderTab): React.CSSProperties => ({
    fontSize: 10, fontWeight: tab === id ? 600 : 400,
    color: tab === id ? T.accent : T.text3,
    cursor: 'pointer', fontFamily: T.font,
    paddingBottom: 4, borderBottom: tab === id ? `2px solid ${T.accent}` : '2px solid transparent',
  });

  const colHdr = (label: string, right?: boolean): React.CSSProperties => ({
    fontSize: 8, fontWeight: 700, color: T.text3, letterSpacing: '0.05em',
    fontFamily: T.font, textAlign: right ? 'right' : 'left',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '8px 12px', overflow: 'hidden' }}>

      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8, flexShrink: 0 }}>
        <span style={tabStyle('open')} onClick={() => setTab('open')}>
          Open Positions
          {positions.length > 0 && <span style={{ fontSize: 8, background: T.accentBg, color: T.accent, borderRadius: 8, padding: '1px 4px', marginLeft: 3 }}>{positions.length}</span>}
        </span>
        <span style={tabStyle('history')} onClick={() => setTab('history')}>
          Trade History
          {history.length > 0 && <span style={{ fontSize: 8, background: T.surfaceAlt, color: T.text3, borderRadius: 8, padding: '1px 4px', marginLeft: 3 }}>{history.length}</span>}
        </span>
        <div style={{ flex: 1 }} />
        {tab === 'open' && positions.length > 0 && (
          <button
            onClick={() => {
              const exits = positions.map(pos => ({
                id: pos.id,
                exitPrice: pos.symbol === state.symbol ? (pos.side === 'buy' ? symbolInfo.bid : symbolInfo.ask) : pos.entryPrice,
              }));
              dispatch({ type: 'CLOSE_ALL_POSITIONS', exits });
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 3,
              border: `1px solid rgba(239,83,80,0.3)`, background: 'rgba(239,83,80,0.08)',
              color: T.bear, fontSize: 9, fontWeight: 600, fontFamily: T.font, cursor: 'pointer', outline: 'none',
            }}>
            <XCircle size={10} /> Close All
          </button>
        )}
        {tab === 'history' && history.length > 0 && (
          <button
            onClick={() => {
              const rows = [['Symbol','Side','Lots','Entry','Exit','P&L','Open','Close','Tags','Note']];
              history.forEach(t => rows.push([
                t.symbol, t.side, String(t.lots),
                t.entryPrice.toFixed(5), t.exitPrice.toFixed(5), t.pnl.toFixed(5),
                new Date(t.openedAt).toISOString().slice(0, 16),
                new Date(t.closedAt).toISOString().slice(0, 16),
                (t.tags ?? []).join(';'),
                `"${(t.note ?? '').replace(/"/g, '""')}"`,
              ]));
              const csv = rows.map(r => r.join(',')).join('\n');
              const a = document.createElement('a');
              a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
              a.download = `trade_journal_${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 3,
              border: `1px solid ${T.border}`, background: T.surfaceAlt,
              color: T.text2, fontSize: 9, fontWeight: 600, fontFamily: T.font, cursor: 'pointer', outline: 'none',
            }}>
            ↓ Journal CSV
          </button>
        )}
      </div>

      {tab === 'open' ? (
        positions.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text3, fontSize: 10, fontFamily: T.font }}>
            No open positions — paper trade from the Trade panel
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {/* Floating P&L summary */}
            {(() => {
              const totalPnl = positions.reduce((s, pos) => {
                const cur = pos.symbol === state.symbol ? (pos.side === 'buy' ? symbolInfo.bid : symbolInfo.ask) : pos.entryPrice;
                return s + (pos.side === 'buy' ? cur - pos.entryPrice : pos.entryPrice - cur) * pos.lots;
              }, 0);
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 4px 6px', borderBottom: `1px solid ${T.border}`, marginBottom: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 9, color: T.text3, fontFamily: T.font }}>Floating P&L</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: totalPnl >= 0 ? T.bull : T.bear, fontFamily: T.mono }}>
                    {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(4)}
                  </span>
                  <span style={{ fontSize: 9, color: T.text3, fontFamily: T.font }}>{positions.length} position{positions.length !== 1 ? 's' : ''}</span>
                </div>
              );
            })()}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {/* Header: SYMBOL | SIDE | LOTS | ENTRY | CURRENT | P&L | P&L% | DUR | SL | TP | × */}
              <div style={{ display: 'grid', gridTemplateColumns: '52px 44px 48px 62px 62px 62px 44px 48px 54px 54px 20px', gap: 3, padding: '0 4px 4px', borderBottom: `1px solid ${T.border}`, marginBottom: 4 }}>
                {['SYMBOL','SIDE','LOTS','ENTRY','CURRENT','P&L','P&L %','DUR','SL','TP',''].map((h, i) => (
                  <span key={i} style={colHdr(h, i > 1)}>{h}</span>
                ))}
              </div>
              {positions.map(pos => {
                const current = pos.symbol === state.symbol ? (pos.side === 'buy' ? symbolInfo.bid : symbolInfo.ask) : pos.entryPrice;
                const pnl     = (pos.side === 'buy' ? current - pos.entryPrice : pos.entryPrice - current) * pos.lots;
                const pnlPct  = pos.entryPrice > 0 ? (pnl / (pos.entryPrice * pos.lots)) * 100 : 0;
                const pnlColor = pnl >= 0 ? T.bull : T.bear;
                const dur      = fmtDuration(now - pos.openedAt);
                return (
                  <div key={pos.id} style={{ display: 'grid', gridTemplateColumns: '52px 44px 48px 62px 62px 62px 44px 48px 54px 54px 20px', gap: 3, padding: '4px 4px', alignItems: 'center', borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: T.text1, fontFamily: T.mono }}>{pos.symbol}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: pos.side === 'buy' ? T.bull : T.bear, fontFamily: T.mono, textAlign: 'right' }}>
                      {pos.side === 'buy' ? '▲ B' : '▼ S'}
                    </span>
                    <span style={{ fontSize: 10, color: T.text2, fontFamily: T.mono, textAlign: 'right' }}>{pos.lots}</span>
                    <span style={{ fontSize: 10, color: T.text2, fontFamily: T.mono, textAlign: 'right' }}>{formatPrice(pos.entryPrice)}</span>
                    <span style={{ fontSize: 10, color: T.text2, fontFamily: T.mono, textAlign: 'right' }}>{formatPrice(current)}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: pnlColor, fontFamily: T.mono, textAlign: 'right' }}>
                      {pnl >= 0 ? '+' : ''}{pnl.toFixed(4)}
                    </span>
                    <span style={{ fontSize: 9, fontWeight: 600, color: pnlColor, fontFamily: T.mono, textAlign: 'right' }}>
                      {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                    </span>
                    <span style={{ fontSize: 9, color: T.text3, fontFamily: T.mono, textAlign: 'right' }}>{dur}</span>
                    <span style={{ fontSize: 9, color: pos.sl ? T.bear : T.text3, fontFamily: T.mono, textAlign: 'right' }}>{pos.sl ? formatPrice(pos.sl) : '–'}</span>
                    <span style={{ fontSize: 9, color: pos.tp ? T.bull : T.text3, fontFamily: T.mono, textAlign: 'right' }}>{pos.tp ? formatPrice(pos.tp) : '–'}</span>
                    <button
                      onClick={() => dispatch({ type: 'CLOSE_PAPER_POSITION', id: pos.id, exitPrice: current })}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: T.text3, padding: 0, outline: 'none', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}
                      onMouseEnter={e => { e.currentTarget.style.color = T.bear; }}
                      onMouseLeave={e => { e.currentTarget.style.color = T.text3; }}
                      title="Close position"
                    >
                      <XCircle size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )
      ) : (
        history.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.text3, fontSize: 10, fontFamily: T.font }}>
            No closed trades yet
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 6 }}>
            {histStats && (
              <div style={{ display: 'flex', gap: 4, flexShrink: 0, borderBottom: `1px solid ${T.border}`, paddingBottom: 6 }}>
                {[
                  { label: 'TRADES',      value: String(histStats.total),                                                  color: T.text1 },
                  { label: 'WIN RATE',    value: `${histStats.winRate}%`,                                                   color: histStats.winRate >= 50 ? T.bull : T.bear },
                  { label: 'TOTAL P&L',  value: `${histStats.totalPnl >= 0 ? '+' : ''}${histStats.totalPnl}`,              color: histStats.totalPnl >= 0 ? T.bull : T.bear },
                  { label: 'PROF FACTOR',value: String(histStats.pf),                                                      color: histStats.pf >= 1.5 ? T.bull : histStats.pf >= 1 ? (T.warn ?? '#FF9800') : T.bear },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ flex: 1, textAlign: 'center', padding: '4px 6px', background: T.surfaceAlt, borderRadius: 3 }}>
                    <div style={{ fontSize: 7, fontWeight: 700, color: T.text3, letterSpacing: '0.06em', fontFamily: T.font, marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color, fontFamily: T.mono }}>{value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Mini equity curve */}
            {history.length >= 2 && (() => {
              let cum = 0, maxAbs = 0.001;
              const pts = history.slice().reverse().map(t => { cum += t.pnl; maxAbs = Math.max(maxAbs, Math.abs(cum)); return { v: cum, win: t.pnl > 0 }; });
              return (
                <div style={{ height: 36, flexShrink: 0, display: 'flex', alignItems: 'flex-end', gap: 1, background: T.surfaceAlt, borderRadius: 3, padding: '3px 3px 0', overflow: 'hidden' }}>
                  {pts.map((pt, i) => (
                    <div key={i} style={{ flex: 1, height: `${Math.max(4, Math.abs(pt.v) / maxAbs * 90)}%`, minWidth: 1, background: pt.win ? T.bull : T.bear, borderRadius: '1px 1px 0 0', opacity: 0.75 }} />
                  ))}
                </div>
              );
            })()}

            {/* Trade list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '52px 38px 48px 62px 62px 62px 44px', gap: 3, padding: '0 4px 4px', borderBottom: `1px solid ${T.border}`, marginBottom: 4 }}>
                {['SYMBOL','SIDE','LOTS','ENTRY','EXIT','P&L','P&L %'].map((h, i) => (
                  <span key={i} style={colHdr(h, i > 1)}>{h}</span>
                ))}
              </div>
              {history.map(t => {
                const pctPnl = t.entryPrice > 0 ? (t.pnl / (t.entryPrice * t.lots)) * 100 : 0;
                const expanded = expandedTradeId === t.id;
                const currentNote = noteInput[t.id] ?? t.note ?? '';
                return (
                  <div key={t.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                    {/* Main row */}
                    <div
                      style={{ display: 'grid', gridTemplateColumns: '52px 38px 48px 62px 62px 62px 44px 18px', gap: 3, padding: '4px 4px', alignItems: 'center', cursor: 'pointer' }}
                      onClick={() => {
                        setExpandedTradeId(expanded ? null : t.id);
                        if (!expanded) setNoteInput(prev => ({ ...prev, [t.id]: t.note ?? '' }));
                      }}
                    >
                      <span style={{ fontSize: 10, fontWeight: 600, color: T.text1, fontFamily: T.mono }}>{t.symbol}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: t.side === 'buy' ? T.bull : T.bear, fontFamily: T.mono, textAlign: 'right' }}>{t.side === 'buy' ? '▲' : '▼'}</span>
                      <span style={{ fontSize: 10, color: T.text2, fontFamily: T.mono, textAlign: 'right' }}>{t.lots}</span>
                      <span style={{ fontSize: 10, color: T.text2, fontFamily: T.mono, textAlign: 'right' }}>{formatPrice(t.entryPrice)}</span>
                      <span style={{ fontSize: 10, color: T.text2, fontFamily: T.mono, textAlign: 'right' }}>{formatPrice(t.exitPrice)}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: t.pnl >= 0 ? T.bull : T.bear, fontFamily: T.mono, textAlign: 'right', display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end' }}>
                        {t.pnl >= 0 ? <CheckCircle size={9} /> : <XCircle size={9} />}
                        {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(4)}
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 600, color: pctPnl >= 0 ? T.bull : T.bear, fontFamily: T.mono, textAlign: 'right' }}>
                        {pctPnl >= 0 ? '+' : ''}{pctPnl.toFixed(2)}%
                      </span>
                      <span style={{ fontSize: 9, color: t.note || (t.tags?.length ?? 0) > 0 ? T.accent : T.text3, textAlign: 'center' }}>
                        {expanded ? '▲' : '▼'}
                      </span>
                    </div>
                    {/* Journal expansion */}
                    {expanded && (
                      <div style={{ padding: '6px 8px 8px', background: T.surfaceAlt, display: 'flex', flexDirection: 'column', gap: 6 }} onClick={e => e.stopPropagation()}>
                        {/* Tags */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {PRESET_TAGS.map(tag => {
                            const active = (t.tags ?? []).includes(tag);
                            return (
                              <button
                                key={tag}
                                onClick={() => dispatch(active ? { type: 'REMOVE_TRADE_TAG', id: t.id, tag } : { type: 'ADD_TRADE_TAG', id: t.id, tag })}
                                style={{
                                  padding: '2px 6px', borderRadius: 10, fontSize: 9, fontWeight: 600,
                                  fontFamily: T.font, cursor: 'pointer', outline: 'none', border: 'none',
                                  background: active ? T.accentBg : T.border,
                                  color: active ? T.accent : T.text3,
                                  transition: 'all 0.1s',
                                }}
                              >
                                {tag}
                              </button>
                            );
                          })}
                        </div>
                        {/* Note input */}
                        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
                          <textarea
                            value={currentNote}
                            onChange={e => setNoteInput(prev => ({ ...prev, [t.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); dispatch({ type: 'UPDATE_TRADE_NOTE', id: t.id, note: currentNote }); setExpandedTradeId(null); } }}
                            placeholder="Add trade note… (Enter to save, Shift+Enter for newline)"
                            rows={2}
                            style={{
                              flex: 1, resize: 'none', padding: '4px 6px', borderRadius: 3,
                              border: `1px solid ${T.border}`, background: T.bg, color: T.text1,
                              fontSize: 10, fontFamily: T.font, outline: 'none', lineHeight: 1.4,
                            }}
                          />
                          <button
                            onClick={() => { dispatch({ type: 'UPDATE_TRADE_NOTE', id: t.id, note: currentNote }); setExpandedTradeId(null); }}
                            style={{ padding: '4px 10px', borderRadius: 3, border: 'none', background: T.accent, color: '#fff', fontSize: 9, fontWeight: 600, cursor: 'pointer', fontFamily: T.font, outline: 'none', whiteSpace: 'nowrap' }}
                          >
                            Save
                          </button>
                        </div>
                        {t.note && (
                          <div style={{ fontSize: 9, color: T.text2, fontFamily: T.font, fontStyle: 'italic', borderLeft: `2px solid ${T.accent}`, paddingLeft: 6 }}>
                            {t.note}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}

      <div style={{ fontSize: 8, color: T.text3, fontFamily: T.font, paddingTop: 4, flexShrink: 0, borderTop: `1px solid ${T.border}`, marginTop: 4 }}>
        Paper trading mode · No real orders executed
      </div>
    </div>
  );
}

// ── Confluence Engine ─────────────────────────────────────────────────────────

type ConfTF = '1H' | '4H' | '1D' | '1W';
const CONF_TFS: ConfTF[] = ['1H', '4H', '1D', '1W'];
const CONF_TF_API: Record<ConfTF, string> = { '1H': '1h', '4H': '4h', '1D': '1day', '1W': '1week' };
const CONF_TF_WEIGHT: Record<ConfTF, number> = { '1H': 1, '4H': 2, '1D': 3, '1W': 4 };

interface TFScanState { results: ScanResult[]; loading: boolean; }

interface SignalHistoryEntry {
  ts: number;
  symbol: string;
  type: string;
  tf: string;
  direction: 'bull' | 'bear' | 'neutral';
}

const CONF_HISTORY_KEY = 'ordr_conf_history';
const MAX_CONF_HISTORY = 300;

function loadConfHistory(): SignalHistoryEntry[] {
  try { return JSON.parse(sessionStorage.getItem(CONF_HISTORY_KEY) ?? '[]'); } catch { return []; }
}
function appendConfHistory(results: ScanResult[], tf: string): void {
  try {
    const now = Date.now();
    const next = [
      ...loadConfHistory(),
      ...results.map(r => ({ ts: now, symbol: r.symbol, type: r.type, tf, direction: r.direction })),
    ].slice(-MAX_CONF_HISTORY);
    sessionStorage.setItem(CONF_HISTORY_KEY, JSON.stringify(next));
  } catch {}
}

function catCounts(results: ScanResult[], cat: { types: ScanType[] }): { bull: number; bear: number } {
  const filtered = results.filter(r => (cat.types as string[]).includes(r.type));
  return {
    bull: filtered.filter(r => r.direction === 'bull').length,
    bear: filtered.filter(r => r.direction === 'bear').length,
  };
}

function fmtHHMM(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function ConfluencePanel() {
  const { state } = useWorkspace();
  const symbol = state.symbol;

  const emptyTF = (): TFScanState => ({ results: [], loading: false });
  const [tfData, setTfData] = useState<Record<ConfTF, TFScanState>>({
    '1H': emptyTF(), '4H': emptyTF(), '1D': emptyTF(), '1W': emptyTF(),
  });
  const [running, setRunning] = useState(false);
  const [view, setView] = useState<'matrix' | 'history'>('matrix');
  const [history, setHistory] = useState<SignalHistoryEntry[]>([]);
  const [histFilter, setHistFilter] = useState('');
  const prevSymRef = useRef<string>('');
  const runRef = useRef<() => Promise<void>>(async () => {});

  const runConfluence = useCallback(async () => {
    setRunning(true);
    setTfData(prev => {
      const next = { ...prev };
      CONF_TFS.forEach(tf => { next[tf] = { ...next[tf], loading: true }; });
      return next;
    });
    await Promise.all(CONF_TFS.map(async (tf) => {
      const bars = await fetchScanBars(symbol, CONF_TF_API[tf]);
      const results = runScans(symbol, bars);
      appendConfHistory(results, tf);
      setTfData(prev => ({ ...prev, [tf]: { results, loading: false } }));
    }));
    setHistory(loadConfHistory().slice().reverse());
    setRunning(false);
  }, [symbol]);

  useEffect(() => { runRef.current = runConfluence; }, [runConfluence]);

  // Auto-run on mount and symbol change
  useEffect(() => {
    if (prevSymRef.current !== symbol) {
      prevSymRef.current = symbol;
      runRef.current();
    }
  }, [symbol]);
  useEffect(() => { runRef.current(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Weighted overall score
  const overall = useMemo(() => {
    let wTotal = 0, wBull = 0, wBear = 0;
    CONF_TFS.forEach(tf => {
      const { results } = tfData[tf];
      const bull = results.filter(r => r.direction === 'bull').length;
      const bear = results.filter(r => r.direction === 'bear').length;
      const total = bull + bear;
      if (total === 0) return;
      const w = CONF_TF_WEIGHT[tf];
      wTotal += w;
      wBull  += (bull / total) * w;
      wBear  += (bear / total) * w;
    });
    if (wTotal === 0) return { bullPct: 0, bearPct: 0, bias: 'neutral' as const };
    const bullPct = Math.round((wBull / wTotal) * 100);
    const bearPct = Math.round((wBear / wTotal) * 100);
    const bias = bullPct > 58 ? 'bull' : bearPct > 58 ? 'bear' : 'neutral';
    return { bullPct, bearPct, bias } as const;
  }, [tfData]);

  // Top signals that fire on most TFs
  const topSignals = useMemo(() => {
    const freq = new Map<string, { type: ScanType; tfs: ConfTF[]; dir: 'bull' | 'bear' | 'neutral' }>();
    CONF_TFS.forEach(tf => {
      tfData[tf].results.forEach(r => {
        if (!freq.has(r.type)) freq.set(r.type, { type: r.type, tfs: [], dir: r.direction });
        freq.get(r.type)!.tfs.push(tf);
      });
    });
    return Array.from(freq.values()).sort((a, b) => b.tfs.length - a.tfs.length).slice(0, 8);
  }, [tfData]);

  const filteredHistory = useMemo(() => {
    if (!histFilter) return history;
    const q = histFilter.toLowerCase();
    return history.filter(h => h.symbol.toLowerCase().includes(q) || h.tf.toLowerCase().includes(q) || h.type.toLowerCase().includes(q));
  }, [history, histFilter]);

  const biasColor = overall.bias === 'bull' ? T.bull : overall.bias === 'bear' ? T.bear : T.text3;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '6px 10px', gap: 6, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <Layers size={11} color={T.accent} />
        <span style={{ fontSize: 10, fontWeight: 700, fontFamily: T.mono, color: T.text1 }}>{symbol}</span>
        <span style={{ fontSize: 8, color: T.text3, fontFamily: T.mono, letterSpacing: '0.04em' }}>CONFLUENCE ENGINE</span>
        <div style={{ flex: 1 }} />
        {/* View toggle */}
        {(['matrix', 'history'] as const).map(v => (
          <button key={v} onClick={() => { setView(v); if (v === 'history') setHistory(loadConfHistory().slice().reverse()); }}
            style={{
              padding: '2px 7px', fontSize: 9, fontFamily: T.mono, fontWeight: 600,
              background: view === v ? T.accentBg : 'transparent',
              color: view === v ? T.accent : T.text3,
              border: `1px solid ${view === v ? T.accent : T.border}`,
              borderRadius: T.r2, cursor: 'pointer', outline: 'none', display: 'flex', alignItems: 'center', gap: 3,
            }}
          >
            {v === 'matrix' ? <Layers size={8} /> : <History size={8} />}
            {v === 'matrix' ? 'MATRIX' : 'HISTORY'}
          </button>
        ))}
        <button onClick={() => runRef.current()} disabled={running}
          style={{
            display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px',
            fontSize: 9, fontFamily: T.mono, fontWeight: 600,
            background: running ? T.surfaceAlt : T.accentBg,
            color: running ? T.text3 : T.accent,
            border: `1px solid ${running ? T.border : T.accent}`,
            borderRadius: T.r2, cursor: running ? 'default' : 'pointer', outline: 'none',
          }}
        >
          {running
            ? <><Loader size={8} style={{ animation: 'spin 1s linear infinite' }} />SCANNING…</>
            : <><RefreshCw size={8} />SCAN</>}
        </button>
      </div>

      {/* ── Matrix View ── */}
      {view === 'matrix' && (
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>

          {/* TF score cards */}
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {CONF_TFS.map(tf => {
              const { results, loading } = tfData[tf];
              const bull  = results.filter(r => r.direction === 'bull').length;
              const bear  = results.filter(r => r.direction === 'bear').length;
              const total = bull + bear;
              const bullPct = total > 0 ? Math.round((bull / total) * 100) : 50;
              const bias  = total === 0 ? 'neutral' : bull > bear ? 'bull' : bull < bear ? 'bear' : 'neutral';
              const bc    = bias === 'bull' ? T.bull : bias === 'bear' ? T.bear : T.text3;
              const weight = CONF_TF_WEIGHT[tf];
              return (
                <div key={tf} style={{
                  flex: 1, background: T.surfaceAlt, borderRadius: T.r3, padding: '5px 6px',
                  border: `1px solid ${bias !== 'neutral' ? bc + '44' : T.border}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, fontFamily: T.mono, color: T.text1 }}>{tf}</span>
                    {loading
                      ? <Loader size={8} color={T.text3} style={{ animation: 'spin 1s linear infinite' }} />
                      : <span style={{ fontSize: 7, fontWeight: 700, fontFamily: T.mono, color: bc }}>
                          {bias === 'neutral' ? 'NEUT' : bias.toUpperCase()}
                        </span>
                    }
                  </div>
                  {/* Bull bar */}
                  <div style={{ height: 3, background: T.border, borderRadius: 2, overflow: 'hidden', marginBottom: 2 }}>
                    <div style={{ height: '100%', width: `${bullPct}%`, background: bc, transition: 'width 0.4s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <span style={{ fontSize: 8, fontFamily: T.mono, color: T.bull }}>▲{bull}</span>
                      <span style={{ fontSize: 8, fontFamily: T.mono, color: T.bear }}>▼{bear}</span>
                    </div>
                    <span style={{ fontSize: 7, fontFamily: T.mono, color: T.text3 }}>W×{weight}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Overall weighted score */}
          <div style={{
            background: T.surfaceAlt, borderRadius: T.r3, padding: '5px 8px', flexShrink: 0,
            border: `1px solid ${overall.bias !== 'neutral' ? biasColor + '44' : T.border}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
              <span style={{ fontSize: 8, fontWeight: 700, fontFamily: T.mono, color: T.text3, letterSpacing: '0.04em' }}>WEIGHTED CONFLUENCE</span>
              <span style={{ fontSize: 10, fontWeight: 700, fontFamily: T.mono, color: biasColor }}>
                {overall.bullPct}% {overall.bias === 'bull' ? 'BULL' : overall.bias === 'bear' ? 'BEAR' : 'NEUTRAL'}
              </span>
            </div>
            <div style={{ height: 4, background: T.border, borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${overall.bullPct}%`, background: biasColor, transition: 'width 0.5s' }} />
            </div>
          </div>

          {/* Signal matrix: category × TF */}
          <div style={{ flexShrink: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, fontFamily: T.mono }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '3px 6px', color: T.text3, fontWeight: 600, borderBottom: `1px solid ${T.border}`, fontSize: 8, letterSpacing: '0.04em' }}>CATEGORY</th>
                  {CONF_TFS.map(tf => (
                    <th key={tf} style={{ textAlign: 'center', padding: '3px 8px', color: T.text2, fontWeight: 700, borderBottom: `1px solid ${T.border}`, minWidth: 60 }}>{tf}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SCAN_CATEGORIES.map((cat, ci) => (
                  <tr key={cat.id} style={{ background: ci % 2 === 1 ? 'rgba(128,128,128,0.03)' : 'transparent' }}>
                    <td style={{ padding: '4px 6px', color: T.text2, fontWeight: 600, fontSize: 8, letterSpacing: '0.04em' }}>{cat.label.toUpperCase()}</td>
                    {CONF_TFS.map(tf => {
                      const { loading } = tfData[tf];
                      if (loading) return (
                        <td key={tf} style={{ textAlign: 'center', padding: '4px 8px' }}>
                          <Loader size={8} color={T.text3} style={{ animation: 'spin 1s linear infinite' }} />
                        </td>
                      );
                      const { bull, bear } = catCounts(tfData[tf].results, cat);
                      return (
                        <td key={tf} style={{ textAlign: 'center', padding: '4px 8px' }}>
                          {bull + bear > 0
                            ? <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                                {bull > 0 && <span style={{ color: T.bull, fontWeight: 700 }}>▲{bull}</span>}
                                {bear > 0 && <span style={{ color: T.bear, fontWeight: 700 }}>▼{bear}</span>}
                              </div>
                            : <span style={{ color: T.text3, opacity: 0.35, fontSize: 8 }}>—</span>
                          }
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {/* Total row */}
                <tr style={{ borderTop: `1px solid ${T.border}` }}>
                  <td style={{ padding: '3px 6px', color: T.text3, fontWeight: 700, fontSize: 8 }}>TOTAL</td>
                  {CONF_TFS.map(tf => {
                    const { results, loading } = tfData[tf];
                    if (loading) return <td key={tf} />;
                    const bull = results.filter(r => r.direction === 'bull').length;
                    const bear = results.filter(r => r.direction === 'bear').length;
                    return (
                      <td key={tf} style={{ textAlign: 'center', padding: '3px 8px' }}>
                        <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                          {bull > 0 && <span style={{ color: T.bull, fontWeight: 700, fontSize: 8 }}>▲{bull}</span>}
                          {bear > 0 && <span style={{ color: T.bear, fontWeight: 700, fontSize: 8 }}>▼{bear}</span>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Top signals firing across multiple TFs */}
          {topSignals.length > 0 && (
            <div style={{ flexShrink: 0 }}>
              <div style={{ fontSize: 8, fontWeight: 700, fontFamily: T.mono, color: T.text3, letterSpacing: '0.04em', marginBottom: 4 }}>
                MULTI-TF SIGNALS
              </div>
              {topSignals.map((s, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0',
                  borderBottom: i < topSignals.length - 1 ? `1px solid ${T.border}` : 'none',
                }}>
                  <span style={{ fontSize: 9, fontFamily: T.mono, color: s.dir === 'bull' ? T.bull : s.dir === 'bear' ? T.bear : T.text3, minWidth: 10 }}>
                    {s.dir === 'bull' ? '▲' : s.dir === 'bear' ? '▼' : '○'}
                  </span>
                  <span style={{ flex: 1, fontSize: 9, fontFamily: T.mono, color: T.text1 }}>{s.type}</span>
                  <div style={{ display: 'flex', gap: 2 }}>
                    {s.tfs.map(tf => (
                      <span key={tf} style={{
                        fontSize: 7, fontWeight: 700, fontFamily: T.mono,
                        color: T.accent, background: T.accentBg,
                        padding: '1px 3px', borderRadius: T.r1,
                      }}>{tf}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── History View ── */}
      {view === 'history' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <input
              value={histFilter}
              onChange={e => setHistFilter(e.target.value)}
              placeholder="Filter by symbol, TF, or condition…"
              style={{
                flex: 1, background: T.surfaceAlt, border: `1px solid ${T.border}`,
                borderRadius: T.r2, padding: '3px 7px', fontSize: 9, fontFamily: T.mono,
                color: T.text1, outline: 'none',
              }}
            />
            <button
              onClick={() => { try { sessionStorage.removeItem(CONF_HISTORY_KEY); } catch {} setHistory([]); }}
              style={{
                fontSize: 8, fontFamily: T.mono, color: T.text3,
                background: 'transparent', border: `1px solid ${T.border}`,
                borderRadius: T.r2, padding: '3px 6px', cursor: 'pointer', outline: 'none',
              }}
            >CLEAR</button>
          </div>
          <div style={{ fontSize: 8, fontWeight: 700, fontFamily: T.mono, color: T.text3, flexShrink: 0 }}>
            {filteredHistory.length} SIGNALS — THIS SESSION
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filteredHistory.length === 0
              ? <div style={{ fontSize: 9, fontFamily: T.mono, color: T.text3, padding: '8px 0' }}>
                  No signals recorded yet. Run the Matrix scan to populate history.
                </div>
              : filteredHistory.map((h, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '2px 0', borderBottom: `1px solid ${T.border}`,
                }}>
                  <span style={{ fontSize: 8, fontFamily: T.mono, color: T.text3, minWidth: 34 }}>{fmtHHMM(h.ts)}</span>
                  <span style={{ fontSize: 8, fontWeight: 700, fontFamily: T.mono, color: T.text2, minWidth: 46 }}>{h.symbol}</span>
                  <span style={{
                    fontSize: 7, fontWeight: 700, fontFamily: T.mono,
                    color: T.accent, background: T.accentBg,
                    padding: '1px 3px', borderRadius: T.r1, minWidth: 24, textAlign: 'center',
                  }}>{h.tf}</span>
                  <span style={{ flex: 1, fontSize: 9, fontFamily: T.mono, color: T.text1 }}>{h.type}</span>
                  <span style={{ fontSize: 8, fontWeight: 700, fontFamily: T.mono, color: h.direction === 'bull' ? T.bull : h.direction === 'bear' ? T.bear : T.text3 }}>
                    {h.direction === 'bull' ? '▲' : h.direction === 'bear' ? '▼' : '○'}
                  </span>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ── Content Router ────────────────────────────────────────────────────────────

function DockContent({ tab }: { tab: BottomTab }) {
  switch (tab) {
    case 'mtf':        return <MTFStrip />;
    case 'scanner':    return <ScannerPanel />;
    case 'confluence': return <ConfluencePanel />;
    case 'replay':     return <ReplayPanel />;
    case 'strategy':   return <StrategyDock />;
    case 'orders':     return <OrdersDock />;
  }
}

// ── Main Bottom Dock ──────────────────────────────────────────────────────────

export function BottomDock() {
  const { state, dispatch } = useWorkspace();
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: state.bottomHeight };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      dispatch({ type: 'SET_BOTTOM_HEIGHT', height: dragRef.current.startH + (dragRef.current.startY - ev.clientY) });
    };
    const onUp = () => { dragRef.current = null; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [state.bottomHeight, dispatch]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: T.surface, overflow: 'hidden' }}>
      {/* Resize handle */}
      <div onMouseDown={onResizeStart} style={{ height: 4, cursor: 'row-resize', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Drag to resize">
        <GripHorizontal size={12} color={T.text3} style={{ opacity: 0.4 }} />
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'center', height: 28, borderBottom: `1px solid ${T.border}`, flexShrink: 0, padding: '0 8px', gap: 0 }}>
        {BOTTOM_TABS.map(tab => {
          const active = state.bottomTab === tab.id;
          return (
            <button key={tab.id}
              onClick={() => dispatch({ type: 'SET_BOTTOM_TAB', tab: tab.id })}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', height: 26,
                borderRadius: 3, border: 'none', outline: 'none',
                background: active ? T.accentBg : 'transparent',
                color: active ? T.accent : T.text3,
                fontSize: 10, fontWeight: active ? 600 : 400, fontFamily: T.font, cursor: 'pointer', flexShrink: 0,
              }}
              onMouseEnter={e => { if (!active) { e.currentTarget.style.background = T.hover; e.currentTarget.style.color = T.text1; } }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.text3; } }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => dispatch({ type: 'SET_BOTTOM_TAB', tab: null })}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 3, border: 'none', background: 'transparent', color: T.text3, cursor: 'pointer', outline: 'none' }}
          title="Close dock"
          onMouseEnter={e => { e.currentTarget.style.color = T.text1; }}
          onMouseLeave={e => { e.currentTarget.style.color = T.text3; }}
        >
          <X size={12} />
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {state.bottomTab && <DockContent tab={state.bottomTab} />}
      </div>
    </div>
  );
}
