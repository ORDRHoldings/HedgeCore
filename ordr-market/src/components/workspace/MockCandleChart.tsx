'use client';
/**
 * ORDR Market — Interactive Candlestick Chart
 *
 * Full-featured canvas chart with pan, zoom, crosshair, multiple chart types,
 * indicator rendering, drawing tools, S/R and FVG overlays.
 */

import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { calcSMA, calcEMA, calcBB, calcRSI, calcMACD, calcVWAP, calcHMA } from './chart-math';
import type { ActiveIndicator } from './workspace-types';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Bar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface ChartDrawing {
  id: string;
  tool: string;
  points: { barIdx: number; price: number }[];
  color: string;
  lineWidth: number;
}

interface Props {
  bars?: Bar[];
  symbol?: string;
  exchange?: string;
  interval?: string;
  chartType?: 'candle' | 'bar' | 'line' | 'area';
  showSR?: boolean;
  showFVG?: boolean;
  indicators?: ActiveIndicator[];
  activeTool?: string;
  resetTrigger?: number;
  onDrawingComplete?: (drawing: ChartDrawing) => void;
  onContextMenu?: (x: number, y: number) => void;
}

// ─── Interval helpers ─────────────────────────────────────────────────────────
function intervalMs(interval: string): number {
  const map: Record<string, number> = {
    '1m': 60_000, '3m': 180_000, '5m': 300_000, '15m': 900_000,
    '30m': 1_800_000, '1h': 3_600_000, '4h': 14_400_000,
    'D': 86_400_000, 'W': 604_800_000, 'M': 2_592_000_000,
  };
  return map[interval] ?? 86_400_000;
}

function formatTimeLabel(ts: number, interval: string): string {
  const d = new Date(ts);
  if (['1m', '3m', '5m', '15m', '30m'].includes(interval))
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (interval === '1h' || interval === '4h') {
    const mo = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const tm = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${mo} ${tm}`;
  }
  if (interval === 'M')
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatPrice(p: number): string {
  if (p >= 1000) return p.toFixed(2);
  if (p >= 100) return p.toFixed(2);
  if (p >= 10) return p.toFixed(2);
  if (p >= 1) return p.toFixed(4);
  return p.toFixed(5);
}

// ─── Mock data generator ──────────────────────────────────────────────────────
// Seeded PRNG for deterministic per-symbol data
function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}

function symbolBasePrice(sym: string): number {
  const map: Record<string, number> = {
    EURUSD: 1.0825, GBPUSD: 1.2683, USDJPY: 149.41, USDCAD: 1.3645,
    AUDUSD: 0.6542, NZDUSD: 0.6105, USDCHF: 0.8812,
    EURGBP: 0.8534, EURJPY: 161.82, GBPJPY: 189.56, AUDJPY: 97.72,
    XAUUSD: 2318.45, XAGUSD: 27.34,
    BTCUSD: 67842, ETHUSD: 3482, SOLUSD: 142.5, XRPUSD: 0.5824,
    SPX: 5187.67, NDX: 18234.5, DJI: 38742.1, VIX: 14.32,
    AAPL: 178.52, MSFT: 415.60, AMZN: 178.25, TSLA: 175.30,
    GOOGL: 155.72, META: 493.50, NVDA: 878.40, AMD: 162.18,
    NFLX: 612.40, JPM: 198.30, V: 278.60, BA: 184.50,
    SPY: 518.20, QQQ: 445.80,
  };
  if (map[sym]) return map[sym];
  const hash = sym.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return 50 + (hash % 400) + (hash % 100) / 100;
}

function generateMockBars(count = 300, interval = '30m', sym = 'EURUSD'): Bar[] {
  const bars: Bar[] = [];
  const base = symbolBasePrice(sym);
  const seed = sym.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
  const rand = seededRandom(Math.abs(seed) + 1);
  // Scale volatility relative to price magnitude
  const volScale = base * 0.003;
  const meanRevert = base;
  let price = base;
  const ms = intervalMs(interval);
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const open = price;
    const drift = (rand() - 0.487) * volScale;
    const pull = (meanRevert - price) * 0.004;
    const close = open + drift + pull;
    const range = Math.abs(drift) * 1.4 + rand() * volScale * 0.6;
    const high = Math.max(open, close) + range * (0.4 + rand() * 0.4);
    const low = Math.min(open, close) - range * (0.3 + rand() * 0.4);
    const vol = Math.floor(38_000 + rand() * 140_000);
    bars.push({ t: now - (count - i) * ms, o: +open, h: +high, l: +low, c: +close, v: vol });
    price = close;
  }
  return bars;
}

// ─── Drawing modes ────────────────────────────────────────────────────────────
const DRAW_MODES = new Set([
  'trendline', 'ray', 'hline', 'vline', 'channel', 'fib',
  'rect', 'ellipse', 'path', 'text', 'measure',
]);
const SINGLE_CLICK_TOOLS = new Set(['hline', 'vline']);

// ─── Chart constants ──────────────────────────────────────────────────────────
const PRICE_AW = 72;
const TIME_AH = 24;
const VOL_H = 48;
const MIN_CANDLE_STEP = 3;
const MAX_CANDLE_STEP = 28;
const DEFAULT_CANDLE_STEP = 9;
const RIGHT_PAD_BARS = 12;

const C = {
  bg: '#131722', grid: '#1C2030', axisBg: '#1A1E2D', axisBorder: '#2A2E39',
  axisText: '#787B86', bull: '#26A69A', bear: '#EF5350',
  bullArea: 'rgba(38,166,154,0.06)', bearArea: 'rgba(239,83,80,0.06)',
  srBull: 'rgba(38,166,154,0.35)', srBear: 'rgba(239,83,80,0.35)',
  fvgBull: 'rgba(38,166,154,0.10)', fvgBear: 'rgba(239,83,80,0.10)',
  crosshair: '#787B86', crosshairBg: '#2A2E39',
  drawColor: '#2962FF', drawPreview: 'rgba(41,98,255,0.6)',
  watermark: 'rgba(255,255,255,0.023)',
} as const;

// ─── Indicator color map ──────────────────────────────────────────────────────
function getIndicatorValues(
  id: string, bars: Bar[], params: string
): { type: 'overlay'; lines: { values: (number | null)[]; color: string; label: string }[]; fill?: { upper: (number | null)[]; lower: (number | null)[]; color: string } }
| { type: 'separate'; lines: { values: (number | null)[]; color: string; label: string }[]; histograms?: { values: (number | null)[]; bullColor: string; bearColor: string }[]; refLines?: { value: number; color: string }[]; range?: [number, number] }
| null {
  const closes = bars.map(b => b.c);
  const period = parseInt(params) || 14;

  switch (id) {
    case 'ema20': return { type: 'overlay', lines: [{ values: calcEMA(closes, parseInt(params) || 20), color: '#4caf50', label: `EMA ${params || 20}` }] };
    case 'sma50': return { type: 'overlay', lines: [{ values: calcSMA(closes, parseInt(params) || 50), color: '#f44336', label: `SMA ${params || 50}` }] };
    case 'ema200': return { type: 'overlay', lines: [{ values: calcEMA(closes, 200), color: '#ab47bc', label: 'EMA 200' }] };
    case 'hma': return { type: 'overlay', lines: [{ values: calcHMA(closes, period), color: '#26A69A', label: `HMA ${period}` }] };
    case 'vwap': return { type: 'overlay', lines: [{ values: calcVWAP(bars), color: '#607d8b', label: 'VWAP' }] };
    case 'bb': {
      const [p, m] = (params || '20,2').split(',').map(Number);
      const bb = calcBB(closes, p || 20, m || 2);
      return {
        type: 'overlay',
        lines: [
          { values: bb.upper, color: '#ff9800', label: 'BB Upper' },
          { values: bb.middle, color: '#ff9800', label: 'BB Middle' },
          { values: bb.lower, color: '#ff9800', label: 'BB Lower' },
        ],
        fill: { upper: bb.upper, lower: bb.lower, color: 'rgba(255,152,0,0.06)' },
      };
    }
    case 'rsi': return {
      type: 'separate',
      lines: [{ values: calcRSI(closes, period), color: '#9c27b0', label: `RSI ${period}` }],
      refLines: [{ value: 70, color: 'rgba(239,83,80,0.3)' }, { value: 30, color: 'rgba(38,166,154,0.3)' }, { value: 50, color: 'rgba(120,123,134,0.2)' }],
      range: [0, 100],
    };
    case 'macd': {
      const [f, s, sig] = (params || '12,26,9').split(',').map(Number);
      const macd = calcMACD(closes, f || 12, s || 26, sig || 9);
      return {
        type: 'separate',
        lines: [
          { values: macd.macd, color: '#2196f3', label: 'MACD' },
          { values: macd.signal, color: '#ff9800', label: 'Signal' },
        ],
        histograms: [{ values: macd.histogram, bullColor: 'rgba(38,166,154,0.6)', bearColor: 'rgba(239,83,80,0.6)' }],
      };
    }
    default: return null;
  }
}

// ─── React component ──────────────────────────────────────────────────────────
export function MockCandleChart({
  bars: propBars,
  symbol = 'EURUSD',
  exchange = 'FOREX · ICE',
  interval = '30m',
  chartType = 'candle',
  showSR = false,
  showFVG = false,
  indicators = [],
  activeTool = 'cursor',
  resetTrigger = 0,
  onDrawingComplete,
  onContextMenu,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mockBars = useMemo(() => generateMockBars(300, interval, symbol), [interval, symbol]);
  const allBars = propBars && propBars.length > 0 ? propBars : mockBars;

  // ── Interactive state ─────────────────────────────────────────────────────
  const [candleStep, setCandleStep] = useState(DEFAULT_CANDLE_STEP);
  const [panOffset, setPanOffset] = useState(0);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);
  const [pendingDraw, setPendingDraw] = useState<{ tool: string; points: { barIdx: number; price: number }[] } | null>(null);

  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, offset: 0 });
  const layoutRef = useRef({ CW: 0, MH: 0, yMin: 0, yMax: 0, yRange: 0, startIdx: 0, endIdx: 0, sepPaneH: 0 });

  // ── Compute indicator data ────────────────────────────────────────────────
  const indicatorData = useMemo(() => {
    if (!indicators || indicators.length === 0) return [];
    return indicators
      .filter(ind => ind.visible)
      .map(ind => ({ ind, data: getIndicatorValues(ind.id, allBars, ind.params) }))
      .filter(d => d.data !== null) as { ind: ActiveIndicator; data: NonNullable<ReturnType<typeof getIndicatorValues>> }[];
  }, [indicators, allBars]);

  const separatePanes = indicatorData.filter(d => d.data.type === 'separate');
  const sepPaneH = Math.min(separatePanes.length, 2) * 72;

  // ── Coordinate helpers ────────────────────────────────────────────────────
  const getLayout = useCallback((W: number, H: number) => {
    const CW = W - PRICE_AW;
    const MH = H - TIME_AH - VOL_H - sepPaneH;
    const visibleBars = Math.max(10, Math.floor(CW / candleStep));
    const endIdx = Math.min(allBars.length - 1 + RIGHT_PAD_BARS, allBars.length - 1 + RIGHT_PAD_BARS - panOffset);
    const startIdx = Math.max(0, endIdx - visibleBars + 1);
    const actualEnd = Math.min(endIdx, allBars.length - 1);
    const actualStart = Math.max(0, startIdx);
    const visibleSlice = allBars.slice(actualStart, actualEnd + 1);
    if (visibleSlice.length === 0) return null;
    const priceHigh = Math.max(...visibleSlice.map(b => b.h));
    const priceLow = Math.min(...visibleSlice.map(b => b.l));
    const pad = (priceHigh - priceLow) * 0.13 || 0.001;
    const yMax = priceHigh + pad;
    const yMin = priceLow - pad;
    const yRange = yMax - yMin;
    return { CW, MH: Math.max(MH, 40), yMin, yMax, yRange, startIdx: actualStart, endIdx: actualEnd, sepPaneH };
  }, [allBars, candleStep, panOffset, sepPaneH]);

  // ── Main render ───────────────────────────────────────────────────────────
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = rect.width;
    const H = rect.height;
    if (W < 10 || H < 10) return;

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const layout = getLayout(W, H);
    if (!layout) return;
    const { CW, MH, yMin, yMax, yRange, startIdx, endIdx } = layout;
    layoutRef.current = layout;

    const py = (p: number) => MH * (1 - (p - yMin) / yRange);
    const bx = (idx: number) => (idx - startIdx) * candleStep + candleStep / 2;

    // ── Background ──────────────────────────────────────────────────────────
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // ── Grid ────────────────────────────────────────────────────────────────
    const hCount = 6;
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= hCount; i++) {
      const y = Math.round(MH * i / hCount) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CW, y); ctx.stroke();
    }
    const vSpacing = Math.max(60, candleStep * 10);
    for (let x = vSpacing; x < CW; x += vSpacing) {
      ctx.beginPath(); ctx.moveTo(~~x + 0.5, 0); ctx.lineTo(~~x + 0.5, H - TIME_AH); ctx.stroke();
    }

    // ── FVG zones ───────────────────────────────────────────────────────────
    if (showFVG) {
      for (let i = startIdx + 2; i <= endIdx; i++) {
        if (i >= allBars.length) break;
        const b0 = allBars[i - 2], b2 = allBars[i];
        // Bullish FVG: bar[i].low > bar[i-2].high
        if (b2.l > b0.h) {
          const x1 = bx(i - 2) - candleStep / 2;
          const x2 = bx(i) + candleStep / 2;
          ctx.fillStyle = C.fvgBull;
          ctx.fillRect(x1, py(b2.l), x2 - x1, py(b0.h) - py(b2.l));
        }
        // Bearish FVG: bar[i].high < bar[i-2].low
        if (b2.h < b0.l) {
          const x1 = bx(i - 2) - candleStep / 2;
          const x2 = bx(i) + candleStep / 2;
          ctx.fillStyle = C.fvgBear;
          ctx.fillRect(x1, py(b0.l), x2 - x1, py(b2.h) - py(b0.l));
        }
      }
    }

    // ── S/R levels ──────────────────────────────────────────────────────────
    if (showSR) {
      const r1 = yMin + yRange * 0.705;
      const s1 = yMin + yRange * 0.295;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      for (const { p, color, label } of [
        { p: r1, color: C.srBull, label: 'R1' },
        { p: s1, color: C.srBear, label: 'S1' },
      ]) {
        ctx.strokeStyle = color;
        ctx.beginPath(); ctx.moveTo(0, py(p)); ctx.lineTo(CW, py(p)); ctx.stroke();
        ctx.font = "bold 9px -apple-system,sans-serif";
        ctx.textAlign = 'left';
        ctx.fillStyle = color;
        ctx.fillText(`${label}  ${formatPrice(p)}`, 6, py(p) - 4);
      }
      ctx.setLineDash([]);
    }

    // ── Indicator overlay fills ─────────────────────────────────────────────
    for (const { data } of indicatorData) {
      if (data.type !== 'overlay' || !data.fill) continue;
      const { upper, lower, color } = data.fill;
      ctx.fillStyle = color;
      ctx.beginPath();
      let started = false;
      for (let i = startIdx; i <= endIdx && i < allBars.length; i++) {
        const u = upper[i];
        if (u === null) continue;
        const x = bx(i);
        if (!started) { ctx.moveTo(x, py(u)); started = true; }
        else ctx.lineTo(x, py(u));
      }
      for (let i = Math.min(endIdx, allBars.length - 1); i >= startIdx; i--) {
        const l = lower[i];
        if (l === null) continue;
        ctx.lineTo(bx(i), py(l));
      }
      ctx.closePath();
      ctx.fill();
    }

    // ── Price data (candles / bars / line / area) ───────────────────────────
    const candleW = Math.max(1, candleStep - 2);

    if (chartType === 'area' || chartType === 'line') {
      // Area fill
      if (chartType === 'area') {
        const lastBar = allBars[Math.min(endIdx, allBars.length - 1)];
        const areaColor = lastBar && lastBar.c >= allBars[startIdx]?.o ? C.bullArea : C.bearArea;
        const grad = ctx.createLinearGradient(0, 0, 0, MH);
        const lineColor = lastBar && lastBar.c >= allBars[startIdx]?.o ? C.bull : C.bear;
        grad.addColorStop(0, lineColor.replace(')', ',0.15)').replace('rgb', 'rgba'));
        grad.addColorStop(1, 'rgba(19,23,34,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        let first = true;
        for (let i = startIdx; i <= endIdx && i < allBars.length; i++) {
          const x = bx(i);
          if (first) { ctx.moveTo(x, py(allBars[i].c)); first = false; }
          else ctx.lineTo(x, py(allBars[i].c));
        }
        const lastX = bx(Math.min(endIdx, allBars.length - 1));
        ctx.lineTo(lastX, MH);
        ctx.lineTo(bx(startIdx), MH);
        ctx.closePath();
        ctx.fill();
      }

      // Line
      ctx.lineWidth = 1.5;
      const firstBar = allBars[startIdx];
      const lastBarL = allBars[Math.min(endIdx, allBars.length - 1)];
      ctx.strokeStyle = (lastBarL && firstBar && lastBarL.c >= firstBar.o) ? C.bull : C.bear;
      ctx.beginPath();
      let first = true;
      for (let i = startIdx; i <= endIdx && i < allBars.length; i++) {
        const x = bx(i);
        if (first) { ctx.moveTo(x, py(allBars[i].c)); first = false; }
        else ctx.lineTo(x, py(allBars[i].c));
      }
      ctx.stroke();
    } else {
      // Candles or OHLC bars
      for (let i = startIdx; i <= endIdx && i < allBars.length; i++) {
        const bar = allBars[i];
        const x = bx(i);
        const bull = bar.c >= bar.o;
        ctx.fillStyle = bull ? C.bull : C.bear;
        ctx.strokeStyle = bull ? C.bull : C.bear;

        if (chartType === 'bar') {
          // OHLC bar
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, py(bar.h)); ctx.lineTo(x, py(bar.l)); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x - candleW / 3, py(bar.o)); ctx.lineTo(x, py(bar.o)); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x, py(bar.c)); ctx.lineTo(x + candleW / 3, py(bar.c)); ctx.stroke();
        } else {
          // Candlestick
          const wx = x;
          ctx.fillRect(Math.round(wx) - 0.5, py(bar.h), 1, Math.max(1, py(bar.l) - py(bar.h)));
          const byT = py(Math.max(bar.o, bar.c));
          const bH = Math.max(1, py(Math.min(bar.o, bar.c)) - byT);
          if (bull) {
            ctx.strokeStyle = C.bull;
            ctx.lineWidth = 1;
            ctx.strokeRect(x - candleW / 2, byT, candleW, bH);
          } else {
            ctx.fillRect(x - candleW / 2, byT, candleW, bH);
          }
        }
      }
    }

    // ── Indicator overlay lines ─────────────────────────────────────────────
    for (const { ind, data } of indicatorData) {
      if (data.type !== 'overlay') continue;
      for (const line of data.lines) {
        ctx.strokeStyle = ind.color || line.color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = ind.opacity;
        ctx.beginPath();
        let started = false;
        for (let i = startIdx; i <= endIdx && i < allBars.length; i++) {
          const v = line.values[i];
          if (v === null) continue;
          const x = bx(i);
          if (!started) { ctx.moveTo(x, py(v)); started = true; }
          else ctx.lineTo(x, py(v));
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // ── Drawings ────────────────────────────────────────────────────────────
    const drawAllDrawings = (drawList: ChartDrawing[]) => {
      for (const d of drawList) {
        ctx.strokeStyle = d.color;
        ctx.lineWidth = d.lineWidth;
        ctx.setLineDash([]);
        const pts = d.points.map(p => ({ x: bx(p.barIdx), y: py(p.price) }));

        switch (d.tool) {
          case 'hline':
            if (pts.length >= 1) {
              ctx.beginPath(); ctx.moveTo(0, pts[0].y); ctx.lineTo(CW, pts[0].y); ctx.stroke();
              ctx.font = "9px -apple-system,sans-serif";
              ctx.fillStyle = d.color;
              ctx.textAlign = 'left';
              ctx.fillText(formatPrice(d.points[0].price), 4, pts[0].y - 3);
            }
            break;
          case 'vline':
            if (pts.length >= 1) {
              ctx.beginPath(); ctx.moveTo(pts[0].x, 0); ctx.lineTo(pts[0].x, MH); ctx.stroke();
            }
            break;
          case 'trendline': case 'ray':
            if (pts.length >= 2) {
              ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
              if (d.tool === 'ray') {
                const dx = pts[1].x - pts[0].x;
                const dy = pts[1].y - pts[0].y;
                const ext = Math.max(CW, MH) * 2;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;
                ctx.lineTo(pts[0].x + (dx / len) * ext, pts[0].y + (dy / len) * ext);
              } else {
                ctx.lineTo(pts[1].x, pts[1].y);
              }
              ctx.stroke();
              // Draw anchor dots
              for (const p of pts) {
                ctx.fillStyle = d.color;
                ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
              }
            }
            break;
          case 'rect':
            if (pts.length >= 2) {
              ctx.strokeRect(pts[0].x, pts[0].y, pts[1].x - pts[0].x, pts[1].y - pts[0].y);
              ctx.fillStyle = d.color.replace(')', ',0.06)').replace('rgb', 'rgba');
              ctx.fillRect(pts[0].x, pts[0].y, pts[1].x - pts[0].x, pts[1].y - pts[0].y);
            }
            break;
          case 'fib':
            if (pts.length >= 2) {
              const p1Price = d.points[0].price;
              const p2Price = d.points[1].price;
              const diff = p1Price - p2Price;
              const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
              const colors = ['#787B86', '#F44336', '#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#787B86'];
              for (let li = 0; li < levels.length; li++) {
                const price = p2Price + diff * levels[li];
                const y = py(price);
                ctx.strokeStyle = colors[li];
                ctx.lineWidth = 1;
                ctx.setLineDash([2, 4]);
                ctx.beginPath(); ctx.moveTo(pts[0].x, y); ctx.lineTo(pts[1].x, y); ctx.stroke();
                ctx.setLineDash([]);
                ctx.font = "9px -apple-system,sans-serif";
                ctx.fillStyle = colors[li];
                ctx.textAlign = 'left';
                ctx.fillText(`${(levels[li] * 100).toFixed(1)}% — ${formatPrice(price)}`, pts[0].x + 4, y - 3);
              }
            }
            break;
          case 'measure':
            if (pts.length >= 2) {
              ctx.setLineDash([3, 3]);
              ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[0].y);
              ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke();
              ctx.setLineDash([]);
              const priceDiff = d.points[1].price - d.points[0].price;
              const barDiff = d.points[1].barIdx - d.points[0].barIdx;
              const pct = (priceDiff / d.points[0].price * 100).toFixed(2);
              const midX = (pts[0].x + pts[1].x) / 2;
              const midY = (pts[0].y + pts[1].y) / 2;
              ctx.fillStyle = '#2A2E39';
              ctx.fillRect(midX - 40, midY - 12, 80, 24);
              ctx.strokeStyle = d.color;
              ctx.strokeRect(midX - 40, midY - 12, 80, 24);
              ctx.fillStyle = '#E0E0E0';
              ctx.font = "bold 9px -apple-system,sans-serif";
              ctx.textAlign = 'center';
              ctx.fillText(`${pct}% | ${barDiff} bars`, midX, midY + 3);
            }
            break;
        }
      }
    };

    drawAllDrawings(drawings);

    // ── Pending drawing preview ─────────────────────────────────────────────
    if (pendingDraw && pendingDraw.points.length > 0 && mousePos) {
      const mp = mousePos;
      const mx = mp.x;
      const my = mp.y;
      if (mx >= 0 && mx <= CW && my >= 0 && my <= MH) {
        const mBarIdx = Math.round(startIdx + mx / candleStep);
        const mPrice = yMax - (my / MH) * yRange;
        const previewPts = [...pendingDraw.points, { barIdx: mBarIdx, price: mPrice }];
        const previewDrawing: ChartDrawing = {
          id: 'preview', tool: pendingDraw.tool,
          points: previewPts, color: C.drawPreview, lineWidth: 1,
        };
        ctx.globalAlpha = 0.7;
        drawAllDrawings([previewDrawing]);
        ctx.globalAlpha = 1;
      }
    }

    // ── Volume bars ─────────────────────────────────────────────────────────
    const volTop = MH + sepPaneH;
    const volBase = H - TIME_AH;
    const volZone = volBase - volTop;
    let volMax = 0;
    for (let i = startIdx; i <= endIdx && i < allBars.length; i++) {
      if (allBars[i].v > volMax) volMax = allBars[i].v;
    }
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, volTop + 0.5); ctx.lineTo(CW, volTop + 0.5); ctx.stroke();

    for (let i = startIdx; i <= endIdx && i < allBars.length; i++) {
      const bar = allBars[i];
      const bull = bar.c >= bar.o;
      const vH = volMax > 0 ? Math.round((bar.v / volMax) * (volZone - 4)) : 0;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = bull ? C.bull : C.bear;
      ctx.fillRect(bx(i) - candleW / 2, volBase - vH, candleW, vH);
      ctx.globalAlpha = 1;
    }

    // ── Separate indicator panes ────────────────────────────────────────────
    if (separatePanes.length > 0) {
      const paneH = sepPaneH / Math.min(separatePanes.length, 2);
      separatePanes.slice(0, 2).forEach((pane, paneIdx) => {
        const paneTop = MH + paneIdx * paneH;
        const data = pane.data;
        if (data.type !== 'separate') return;

        // Pane background and border
        ctx.fillStyle = 'rgba(19,23,34,0.4)';
        ctx.fillRect(0, paneTop, CW, paneH);
        ctx.strokeStyle = C.grid;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, paneTop + 0.5); ctx.lineTo(CW, paneTop + 0.5); ctx.stroke();

        // Label
        ctx.font = "bold 9px -apple-system,sans-serif";
        ctx.fillStyle = '#787B86';
        ctx.textAlign = 'left';
        ctx.fillText(pane.ind.name, 6, paneTop + 12);

        // Calculate range
        let rMin = Infinity, rMax = -Infinity;
        if (data.range) { [rMin, rMax] = data.range; }
        else {
          for (const line of data.lines) {
            for (let i = startIdx; i <= endIdx && i < line.values.length; i++) {
              const v = line.values[i];
              if (v !== null) { if (v < rMin) rMin = v; if (v > rMax) rMax = v; }
            }
          }
          if (data.histograms) {
            for (const h of data.histograms) {
              for (let i = startIdx; i <= endIdx && i < h.values.length; i++) {
                const v = h.values[i];
                if (v !== null) { if (v < rMin) rMin = v; if (v > rMax) rMax = v; }
              }
            }
          }
          const pad = (rMax - rMin) * 0.1 || 1;
          rMin -= pad; rMax += pad;
        }
        const rRange = rMax - rMin || 1;
        const ppy = (v: number) => paneTop + 4 + (paneH - 8) * (1 - (v - rMin) / rRange);

        // Reference lines
        if (data.refLines) {
          for (const rl of data.refLines) {
            ctx.strokeStyle = rl.color;
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 3]);
            const ry = ppy(rl.value);
            ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(CW, ry); ctx.stroke();
            ctx.setLineDash([]);
            ctx.font = "8px -apple-system,sans-serif";
            ctx.fillStyle = rl.color;
            ctx.textAlign = 'right';
            ctx.fillText(String(rl.value), CW - 4, ry - 2);
          }
        }

        // Histograms
        if (data.histograms) {
          for (const h of data.histograms) {
            const zeroY = ppy(0);
            for (let i = startIdx; i <= endIdx && i < h.values.length; i++) {
              const v = h.values[i];
              if (v === null) continue;
              ctx.fillStyle = v >= 0 ? h.bullColor : h.bearColor;
              const hY = ppy(v);
              const barH = Math.abs(hY - zeroY);
              ctx.fillRect(bx(i) - candleW / 3, Math.min(hY, zeroY), candleW * 0.66, barH || 1);
            }
          }
        }

        // Lines
        for (const line of data.lines) {
          ctx.strokeStyle = line.color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          let started = false;
          for (let i = startIdx; i <= endIdx && i < line.values.length; i++) {
            const v = line.values[i];
            if (v === null) continue;
            const x = bx(i);
            if (!started) { ctx.moveTo(x, ppy(v)); started = true; }
            else ctx.lineTo(x, ppy(v));
          }
          ctx.stroke();
        }

        // Current value label
        const lastLine = data.lines[0];
        if (lastLine) {
          const lastVal = lastLine.values[Math.min(endIdx, lastLine.values.length - 1)];
          if (lastVal !== null) {
            ctx.font = "bold 9px -apple-system,sans-serif";
            ctx.fillStyle = lastLine.color;
            ctx.textAlign = 'left';
            ctx.fillText(lastVal!.toFixed(2), 6 + ctx.measureText(pane.ind.name).width + 8, paneTop + 12);
          }
        }
      });
    }

    // ── Price axis ──────────────────────────────────────────────────────────
    ctx.fillStyle = C.axisBg;
    ctx.fillRect(CW, 0, PRICE_AW, H);
    ctx.strokeStyle = C.axisBorder;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(CW + 0.5, 0); ctx.lineTo(CW + 0.5, H); ctx.stroke();

    ctx.fillStyle = C.axisText;
    ctx.font = "10px -apple-system,sans-serif";
    ctx.textAlign = 'right';
    for (let i = 0; i <= hCount; i++) {
      const p = yMax - (yRange / hCount) * i;
      const y = MH * i / hCount;
      if (y > 6 && y < MH - 8) ctx.fillText(formatPrice(p), W - 5, y + 3.5);
    }

    // Current price label
    const last = allBars[Math.min(endIdx, allBars.length - 1)];
    if (last) {
      const lastY = py(last.c);
      const isBull = last.c >= last.o;
      const lineColor = isBull ? C.bull : C.bear;
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, lastY); ctx.lineTo(CW, lastY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = lineColor;
      ctx.fillRect(CW + 1, lastY - 8, PRICE_AW - 1, 16);
      ctx.fillStyle = '#FFF';
      ctx.font = "bold 10px -apple-system,sans-serif";
      ctx.textAlign = 'right';
      ctx.fillText(formatPrice(last.c), W - 5, lastY + 3.5);
    }

    // ── Time axis ───────────────────────────────────────────────────────────
    ctx.fillStyle = C.axisBg;
    ctx.fillRect(0, H - TIME_AH, W, TIME_AH);
    ctx.strokeStyle = C.axisBorder;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, H - TIME_AH + 0.5); ctx.lineTo(W, H - TIME_AH + 0.5); ctx.stroke();

    ctx.fillStyle = C.axisText;
    ctx.font = "10px -apple-system,sans-serif";
    ctx.textAlign = 'center';
    const labelStep = Math.max(1, Math.round(vSpacing / candleStep));
    for (let i = startIdx; i <= endIdx && i < allBars.length; i += labelStep) {
      const x = bx(i);
      if (x > 0 && x < CW) ctx.fillText(formatTimeLabel(allBars[i].t, interval), x, H - TIME_AH + 15);
    }

    // ── Crosshair ───────────────────────────────────────────────────────────
    if (mousePos && mousePos.x >= 0 && mousePos.x <= CW && mousePos.y >= 0 && mousePos.y <= MH && !isPanningRef.current) {
      ctx.strokeStyle = C.crosshair;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      // Horizontal
      ctx.beginPath(); ctx.moveTo(0, mousePos.y); ctx.lineTo(CW, mousePos.y); ctx.stroke();
      // Vertical
      ctx.beginPath(); ctx.moveTo(mousePos.x, 0); ctx.lineTo(mousePos.x, H - TIME_AH); ctx.stroke();
      ctx.setLineDash([]);

      // Price label at cursor
      const cursorPrice = yMax - (mousePos.y / MH) * yRange;
      ctx.fillStyle = C.crosshairBg;
      ctx.fillRect(CW + 1, mousePos.y - 8, PRICE_AW - 1, 16);
      ctx.fillStyle = '#E0E0E0';
      ctx.font = "10px -apple-system,sans-serif";
      ctx.textAlign = 'right';
      ctx.fillText(formatPrice(cursorPrice), W - 5, mousePos.y + 3.5);

      // Time label at cursor
      const cursorBarIdx = Math.round(startIdx + mousePos.x / candleStep);
      if (cursorBarIdx >= 0 && cursorBarIdx < allBars.length) {
        const lbl = formatTimeLabel(allBars[cursorBarIdx].t, interval);
        const tw = ctx.measureText(lbl).width + 12;
        ctx.fillStyle = C.crosshairBg;
        ctx.fillRect(mousePos.x - tw / 2, H - TIME_AH + 1, tw, TIME_AH - 2);
        ctx.fillStyle = '#E0E0E0';
        ctx.textAlign = 'center';
        ctx.fillText(lbl, mousePos.x, H - TIME_AH + 15);
      }

      // Bar OHLCV tooltip near cursor
      if (cursorBarIdx >= 0 && cursorBarIdx < allBars.length) {
        const hoverBar = allBars[cursorBarIdx];
        const barBull = hoverBar.c >= hoverBar.o;
        const tx = Math.min(mousePos.x + 12, CW - 120);
        const ty = Math.max(mousePos.y - 55, 4);
        ctx.fillStyle = 'rgba(26,30,45,0.92)';
        ctx.fillRect(tx, ty, 112, 50);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.strokeRect(tx, ty, 112, 50);
        ctx.font = "9px -apple-system,sans-serif";
        ctx.textAlign = 'left';
        const labels = ['O', 'H', 'L', 'C'];
        const vals = [hoverBar.o, hoverBar.h, hoverBar.l, hoverBar.c];
        for (let li = 0; li < 4; li++) {
          ctx.fillStyle = '#787B86';
          ctx.fillText(labels[li], tx + 5, ty + 12 + li * 10);
          ctx.fillStyle = barBull ? '#26A69A' : '#EF5350';
          ctx.fillText(formatPrice(vals[li]), tx + 18, ty + 12 + li * 10);
          if (li < 3) {
            ctx.fillStyle = '#787B86';
            ctx.fillText(labels[li + 1], tx + 62, ty + 12 + li * 10);
          }
        }
        ctx.fillStyle = '#787B86';
        ctx.fillText(`Vol: ${(hoverBar.v / 1000).toFixed(0)}K`, tx + 62, ty + 42);
      }
    }

    // ── Watermark ───────────────────────────────────────────────────────────
    ctx.textAlign = 'center';
    ctx.fillStyle = C.watermark;
    ctx.font = "bold 38px -apple-system,sans-serif";
    ctx.fillText(symbol, CW / 2, MH / 2 + 16);
    ctx.font = "500 15px -apple-system,sans-serif";
    ctx.fillText(`${exchange} · ${interval}`, CW / 2, MH / 2 + 40);
  }, [allBars, candleStep, panOffset, mousePos, chartType, showSR, showFVG, symbol, exchange, interval, indicatorData, separatePanes, drawings, pendingDraw, getLayout, sepPaneH]);

  // ── Effect: render on changes ─────────────────────────────────────────────
  useEffect(() => {
    render();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(render);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [render]);

  // ── Mouse handlers ────────────────────────────────────────────────────────
  const getCanvasPos = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getCanvasPos(e);
    const layout = layoutRef.current;
    if (!layout || pos.x > layout.CW) return;

    const isDrawMode = DRAW_MODES.has(activeTool);

    if (isDrawMode && pos.y <= layout.MH) {
      const barIdx = Math.round(layout.startIdx + pos.x / candleStep);
      const price = layout.yMax - (pos.y / layout.MH) * layout.yRange;

      if (SINGLE_CLICK_TOOLS.has(activeTool)) {
        const newDrawing: ChartDrawing = {
          id: `d_${Date.now()}`, tool: activeTool,
          points: [{ barIdx, price }], color: C.drawColor, lineWidth: 1,
        };
        setDrawings(prev => [...prev, newDrawing]);
        onDrawingComplete?.(newDrawing);
        return;
      }

      if (pendingDraw) {
        const pts = [...pendingDraw.points, { barIdx, price }];
        const newDrawing: ChartDrawing = {
          id: `d_${Date.now()}`, tool: pendingDraw.tool,
          points: pts, color: C.drawColor, lineWidth: 1,
        };
        setDrawings(prev => [...prev, newDrawing]);
        setPendingDraw(null);
        onDrawingComplete?.(newDrawing);
      } else {
        setPendingDraw({ tool: activeTool, points: [{ barIdx, price }] });
      }
      return;
    }

    // Pan mode
    isPanningRef.current = true;
    panStartRef.current = { x: e.clientX, offset: panOffset };
    e.preventDefault();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const pos = getCanvasPos(e);
    setMousePos(pos);

    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const barsDelta = Math.round(dx / candleStep);
      const newOffset = Math.max(-(RIGHT_PAD_BARS), Math.min(allBars.length - 20, panStartRef.current.offset + barsDelta));
      setPanOffset(newOffset);
    }
  };

  const handleMouseUp = () => {
    isPanningRef.current = false;
  };

  const handleMouseLeave = () => {
    setMousePos(null);
    isPanningRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 : -1;
    setCandleStep(prev => {
      const next = prev - delta;
      return Math.max(MIN_CANDLE_STEP, Math.min(MAX_CANDLE_STEP, next));
    });
  };

  // ── Reset when resetTrigger changes ────────────────────────────────────────
  const prevResetRef = useRef(0);
  useEffect(() => {
    if (resetTrigger !== prevResetRef.current) {
      prevResetRef.current = resetTrigger;
      setCandleStep(DEFAULT_CANDLE_STEP);
      setPanOffset(0);
      setDrawings([]);
      setPendingDraw(null);
    }
  }, [resetTrigger]);

  const isDrawMode = DRAW_MODES.has(activeTool);
  const cursor = isDrawMode ? 'crosshair' : (isPanningRef.current ? 'grabbing' : 'crosshair');

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu?.(e.clientX, e.clientY);
  };

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', width: '100%', height: '100%', cursor }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
    />
  );
}
