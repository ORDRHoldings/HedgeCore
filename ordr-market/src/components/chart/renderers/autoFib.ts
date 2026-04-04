/**
 * autoFib.ts — Automatic Fibonacci Retracement overlay
 *
 * Detects the most prominent swing high and low within the current viewport
 * (reusing computeSwingPivots from the Pivots overlay) and renders standard
 * Fibonacci retracement levels between them.
 *
 * Levels: 0.0 / 23.6 / 38.2 / 50.0 / 61.8 / 78.6 / 100.0
 * Golden zone (61.8–78.6%) gets a subtle green fill.
 * Convention: 0% = swing high (start of retracement), 100% = swing low (full retrace).
 */

import type { Bar } from "../indicators/types";
import type { ChartLayout, Viewport, PriceScale } from "../core/data";
import { priceToY } from "../core/data";
import { computeSwingPivots } from "./pivots";

// ── Fib level definitions ─────────────────────────────────────────────────────

const FIB_DEFS = [
  { level: 0,     label: '0.0%',   color: 'rgba(255,255,255,0.60)', dash: false, width: 0.8 },
  { level: 0.236, label: '23.6%',  color: 'rgba(255,152,0,0.80)',   dash: true,  width: 0.75 },
  { level: 0.382, label: '38.2%',  color: 'rgba(255,193,7,0.90)',   dash: true,  width: 0.75 },
  { level: 0.5,   label: '50.0%',  color: 'rgba(190,190,190,0.55)', dash: true,  width: 0.75 },
  { level: 0.618, label: '61.8%',  color: 'rgba(76,175,80,0.95)',   dash: true,  width: 1.2  },
  { level: 0.786, label: '78.6%',  color: 'rgba(33,150,243,0.85)',  dash: true,  width: 0.75 },
  { level: 1.0,   label: '100.0%', color: 'rgba(255,255,255,0.60)', dash: false, width: 0.8  },
] as const;

const GOLDEN_FILL = 'rgba(76,175,80,0.07)';
const PIVOT_LEFT  = 5;
const PIVOT_RIGHT = 5;

// ── Compute ───────────────────────────────────────────────────────────────────

interface FibSwing { highPrice: number; lowPrice: number; }

/**
 * Find the highest pivot high and lowest pivot low within the viewport.
 * Returns null if fewer than one pivot of each type is visible.
 */
export function computeViewportFib(bars: Bar[], startIndex: number, endIndex: number): FibSwing | null {
  const pivots = computeSwingPivots(bars, PIVOT_LEFT, PIVOT_RIGHT);
  const start  = Math.max(0, startIndex);
  const end    = Math.min(bars.length - 1, endIndex);

  const highs = pivots.filter(p => p.type === 'high' && p.barIndex >= start && p.barIndex <= end);
  const lows  = pivots.filter(p => p.type === 'low'  && p.barIndex >= start && p.barIndex <= end);

  if (!highs.length || !lows.length) return null;

  const highPrice = highs.reduce((a, b) => b.price > a.price ? b : a).price;
  const lowPrice  = lows.reduce((a, b)  => b.price < a.price ? b : a).price;
  const range     = highPrice - lowPrice;

  // Require a meaningful range (≥ 0.1% of price) to avoid noise on flat charts
  if (range < highPrice * 0.001) return null;

  return { highPrice, lowPrice };
}

// ── Draw ──────────────────────────────────────────────────────────────────────

/**
 * Render Fibonacci retracement lines for the dominant swing in the viewport.
 */
export function drawViewportFib(
  ctx: CanvasRenderingContext2D,
  bars: Bar[],
  layout: ChartLayout,
  viewport: Viewport,
  priceScale: PriceScale,
): void {
  const swing = computeViewportFib(bars, viewport.startIndex, viewport.endIndex);
  if (!swing) return;

  const { mainTop, mainHeight, chartLeft, chartWidth, canvasWidth, priceAxisWidth } = layout;
  const { priceMin, priceMax } = viewport;
  const range    = swing.highPrice - swing.lowPrice;
  const lineEndX = canvasWidth - priceAxisWidth;

  ctx.save();

  // ── Golden zone fill (61.8 – 78.6%) ───────────────────────────────────────
  {
    const y618 = priceToY(swing.highPrice - range * 0.618, priceMin, priceMax, mainTop, mainHeight, priceScale);
    const y786 = priceToY(swing.highPrice - range * 0.786, priceMin, priceMax, mainTop, mainHeight, priceScale);
    ctx.fillStyle = GOLDEN_FILL;
    ctx.fillRect(chartLeft, Math.min(y618, y786), chartWidth, Math.abs(y786 - y618));
  }

  // ── Lines + labels ────────────────────────────────────────────────────────
  ctx.font         = '9px "IBM Plex Mono", monospace';
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'bottom';

  for (const def of FIB_DEFS) {
    // 0% = swing high, 100% = swing low (standard retracement from top)
    const price = swing.highPrice - range * def.level;
    const y     = priceToY(price, priceMin, priceMax, mainTop, mainHeight, priceScale);

    if (y < mainTop - 1 || y > mainTop + mainHeight + 1) continue;

    ctx.strokeStyle = def.color;
    ctx.lineWidth   = def.width;
    ctx.setLineDash(def.dash ? [4, 4] : []);

    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(lineEndX, y);
    ctx.stroke();

    // Label: "61.8%  1.08342"
    const priceStr = price < 10 ? price.toFixed(5) : price.toFixed(2);
    ctx.fillStyle  = def.color;
    ctx.fillText(`${def.label}  ${priceStr}`, lineEndX - 4, y - 1);
  }

  ctx.setLineDash([]);
  ctx.restore();
}
