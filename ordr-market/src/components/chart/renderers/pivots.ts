/**
 * pivots.ts — Swing Pivot High/Low overlay
 *
 * Renders small coloured triangles at swing pivot highs (red ▼) and lows
 * (green ▲) directly above/below candles, using a configurable left/right
 * pivot lookback window.
 *
 * These are the foundational SMC/ICT reference points: every significant
 * swing is a potential liquidity pool, order block anchor, or structure level.
 */

import type { Bar } from "../indicators/types";
import type { ChartLayout, Viewport } from "../core/data";
import type { PriceScale } from "../core/data";
import { priceToY, indexToX } from "../core/data";

export interface SwingPivot {
  barIndex: number;   // index into the bars array
  price: number;
  type: 'high' | 'low';
}

/**
 * Detect swing pivots using a symmetric left/right lookback window.
 * A pivot high occurs when bar[i].h > all bars in [i-left … i+right].
 * A pivot low  occurs when bar[i].l < all bars in [i-left … i+right].
 */
export function computeSwingPivots(
  bars: Bar[],
  left  = 5,
  right = 5,
): SwingPivot[] {
  const pivots: SwingPivot[] = [];
  const n = bars.length;

  for (let i = left; i < n - right; i++) {
    const bar = bars[i];

    // Check pivot high
    let isPH = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j !== i && bars[j].h >= bar.h) { isPH = false; break; }
    }
    if (isPH) pivots.push({ barIndex: i, price: bar.h, type: 'high' });

    // Check pivot low
    let isPL = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j !== i && bars[j].l <= bar.l) { isPL = false; break; }
    }
    if (isPL) pivots.push({ barIndex: i, price: bar.l, type: 'low' });
  }

  return pivots;
}

const PIVOT_HIGH_COLOR = 'rgba(239,83,80,0.85)';   // red
const PIVOT_LOW_COLOR  = 'rgba(38,198,118,0.85)';  // green
const DOT_RADIUS = 3;
const OFFSET_PX  = 6; // distance above/below the candle wick

/**
 * Draw pivot high/low markers as small filled circles above/below candles.
 */
export function drawSwingPivots(
  ctx: CanvasRenderingContext2D,
  pivots: SwingPivot[],
  bars: Bar[],
  layout: ChartLayout,
  viewport: Viewport,
  priceScale: PriceScale,
): void {
  if (!pivots.length) return;

  const { mainTop, mainHeight, canvasWidth, priceAxisWidth, chartLeft, chartWidth } = layout;
  const { priceMin, priceMax, startIndex, endIndex } = viewport;

  const inView = (y: number) => y >= mainTop && y <= mainTop + mainHeight;

  ctx.save();

  for (const pv of pivots) {
    const x = indexToX(pv.barIndex, startIndex, endIndex, chartLeft, chartWidth);
    if (x < chartLeft || x > canvasWidth - priceAxisWidth) continue;

    const y = priceToY(pv.price, priceMin, priceMax, mainTop, mainHeight, priceScale);
    if (!inView(y)) continue;

    const dotY = pv.type === 'high' ? y - OFFSET_PX : y + OFFSET_PX;

    ctx.beginPath();
    ctx.arc(x, dotY, DOT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = pv.type === 'high' ? PIVOT_HIGH_COLOR : PIVOT_LOW_COLOR;
    ctx.fill();
  }

  ctx.restore();
}
