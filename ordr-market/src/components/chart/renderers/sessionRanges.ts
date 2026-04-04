/**
 * sessionRanges.ts — Trading Session Range Boxes
 *
 * Groups bars by UTC date × session (Asia / London / NY) and renders
 * color-coded translucent rectangles spanning the session's time range
 * and price range.  Unlike the session background bands, these boxes are
 * price-aware — they shrink vertically to the exact H/L of each session.
 *
 * Sessions (UTC, one bar → one session, NY takes priority over London overlap):
 *   Asia    00:00 – 08:00
 *   London  08:00 – 13:00   (pre-NY London open)
 *   NY      13:00 – 21:00   (includes London/NY overlap 13–16 UTC)
 *
 * Only rendered for intraday bars (bar interval < 22 h).
 */

import type { Bar } from "../indicators/types";
import type { ChartLayout, Viewport, PriceScale } from "../core/data";
import { priceToY, indexToX } from "../core/data";

// ── Session definitions ───────────────────────────────────────────────────────

type Session = 'asia' | 'london' | 'newyork';

const SESSION_STYLE: Record<Session, { fill: string; stroke: string; label: string }> = {
  asia:    { fill: 'rgba(255,193,7,0.07)',   stroke: 'rgba(255,193,7,0.40)',   label: 'ASIA'   },
  london:  { fill: 'rgba(33,150,243,0.07)',  stroke: 'rgba(33,150,243,0.40)',  label: 'LNDN'   },
  newyork: { fill: 'rgba(76,175,80,0.07)',   stroke: 'rgba(76,175,80,0.40)',   label: 'NY'     },
};

function sessionForHour(h: number): Session | null {
  if (h >= 0  && h < 8)  return 'asia';
  if (h >= 8  && h < 13) return 'london';
  if (h >= 13 && h < 21) return 'newyork';
  return null;
}

// ── Data types ────────────────────────────────────────────────────────────────

export interface SessionRange {
  session: Session;
  high: number;
  low: number;
  startBarIndex: number;
  endBarIndex: number;
}

// ── Compute ───────────────────────────────────────────────────────────────────

/**
 * Scan all bars and group them by UTC calendar date × session type.
 * Returns one SessionRange per unique (session, date) combination that
 * has at least 2 bars.
 */
export function computeSessionRanges(bars: Bar[]): SessionRange[] {
  if (bars.length < 2) return [];

  // Guard: only run for intraday bars
  const avgIntervalMs = (bars[bars.length - 1].t - bars[0].t) / Math.max(1, bars.length - 1);
  if (avgIntervalMs >= 22 * 3_600_000) return []; // daily+ bars

  // Map of "session_YYYY-M-D" → accumulator
  const acc = new Map<string, { session: Session; high: number; low: number; first: number; last: number }>();

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const d = new Date(bar.t);
    const h = d.getUTCHours();
    const sess = sessionForHour(h);
    if (!sess) continue;

    const dateKey = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    const key = `${sess}_${dateKey}`;

    const existing = acc.get(key);
    if (!existing) {
      acc.set(key, { session: sess, high: bar.h, low: bar.l, first: i, last: i });
    } else {
      if (bar.h > existing.high) existing.high = bar.h;
      if (bar.l < existing.low)  existing.low  = bar.l;
      existing.last = i;
    }
  }

  const ranges: SessionRange[] = [];
  for (const { session, high, low, first, last } of acc.values()) {
    if (last - first < 1) continue; // need at least 2 bars
    ranges.push({ session, high, low, startBarIndex: first, endBarIndex: last });
  }

  return ranges;
}

// ── Draw ──────────────────────────────────────────────────────────────────────

export function drawSessionRanges(
  ctx: CanvasRenderingContext2D,
  ranges: SessionRange[],
  layout: ChartLayout,
  viewport: Viewport,
  priceScale: PriceScale,
): void {
  if (!ranges.length) return;

  const { mainTop, mainHeight, chartLeft, chartWidth, canvasWidth, priceAxisWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  const lineEndX = canvasWidth - priceAxisWidth;
  // Approximate bar pixel width — used to extend boxes by half a bar on each side
  const barPx = chartWidth / Math.max(1, endIndex - startIndex);
  const half  = Math.max(1, barPx * 0.5);

  ctx.save();
  ctx.font         = '8px "IBM Plex Mono", monospace';
  ctx.textBaseline = 'top';

  for (const range of ranges) {
    // Skip ranges entirely outside the viewport
    if (range.endBarIndex < startIndex || range.startBarIndex > endIndex) continue;

    const style = SESSION_STYLE[range.session];

    const x1 = indexToX(range.startBarIndex, startIndex, endIndex, chartLeft, chartWidth) - half;
    const x2 = indexToX(range.endBarIndex,   startIndex, endIndex, chartLeft, chartWidth) + half;
    const y1 = priceToY(range.high, priceMin, priceMax, mainTop, mainHeight, priceScale);
    const y2 = priceToY(range.low,  priceMin, priceMax, mainTop, mainHeight, priceScale);

    // Clamp to chart area
    const rx1 = Math.max(chartLeft,  x1);
    const rx2 = Math.min(lineEndX,   x2);
    const ry1 = Math.max(mainTop,    y1);
    const ry2 = Math.min(mainTop + mainHeight, y2);

    if (rx2 <= rx1 || ry2 <= ry1) continue;

    const w = rx2 - rx1;
    const h = ry2 - ry1;

    // Fill
    ctx.fillStyle = style.fill;
    ctx.fillRect(rx1, ry1, w, h);

    // Border
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth   = 0.75;
    ctx.setLineDash([]);
    ctx.strokeRect(rx1 + 0.5, ry1 + 0.5, w - 1, h - 1);

    // Session label — top-left corner of box, inside boundaries
    const labelX = rx1 + 4;
    const labelY = ry1 + 3;
    if (labelY + 10 < ry2) {
      ctx.fillStyle = style.stroke;
      ctx.fillText(style.label, labelX, labelY);
    }

    // High / low price ticks on right edge
    if (rx2 > chartLeft + 40) {
      ctx.fillStyle   = style.stroke;
      ctx.textAlign   = 'right';
      ctx.textBaseline = 'middle';
      const priceStr = (p: number) => p < 10 ? p.toFixed(5) : p.toFixed(2);
      if (ry1 > mainTop + 8) ctx.fillText(priceStr(range.high), rx2 - 3, ry1 + 5);
      if (ry2 < mainTop + mainHeight - 8) ctx.fillText(priceStr(range.low), rx2 - 3, ry2 - 5);
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'top';
    }
  }

  ctx.restore();
}
