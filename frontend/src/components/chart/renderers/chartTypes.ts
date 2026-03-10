/**
 * chartTypes.ts -- Six additional chart-type renderers for the ORDR Canvas 2D
 * charting platform: line, area, OHLC bars, hollow candles, Heikin Ashi,
 * and baseline.
 *
 * Every function follows the same contract as drawCandlesticks:
 *   (ctx, bars, layout, viewport) => void
 */
import type { Bar } from "../indicators/types";
import type { ChartLayout, Viewport } from "../core/data";
import type { PriceScale } from "../core/data";
import { priceToY, indexToX } from "../core/data";
import { THEME } from "../core/theme";
import { computeHeikinAshi } from "../core/heikinAshi";

/* ------------------------------------------------------------------ */
/* Chart type union                                                    */
/* ------------------------------------------------------------------ */

export type ChartType =
  | "candles"
  | "hollow"
  | "bars"
  | "line"
  | "area"
  | "heikinAshi"
  | "baseline";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Clamp visible bar indices to the array. */
function visibleRange(bars: Bar[], viewport: Viewport): [number, number] {
  const si = Math.max(0, Math.floor(viewport.startIndex));
  const ei = Math.min(bars.length - 1, Math.ceil(viewport.endIndex));
  return [si, ei];
}

/** Map a bar index to a canvas x-coordinate. */
function bx(
  i: number,
  viewport: Viewport,
  layout: ChartLayout,
): number {
  return indexToX(
    i,
    viewport.startIndex,
    viewport.endIndex,
    layout.chartLeft,
    layout.chartWidth,
  );
}

/** Map a price to a canvas y-coordinate in the main pane. */
function by(
  price: number,
  viewport: Viewport,
  layout: ChartLayout,
  scale: PriceScale = "linear",
): number {
  return priceToY(
    price,
    viewport.priceMin,
    viewport.priceMax,
    layout.mainTop,
    layout.mainHeight,
    scale,
  );
}

/* ------------------------------------------------------------------ */
/* 1. Line chart                                                       */
/* ------------------------------------------------------------------ */

/**
 * Single line connecting close prices.
 * - Line color: THEME.sma1Color (#2962FF)
 * - Line width: 2
 */
export function drawLineChart(
  ctx: CanvasRenderingContext2D,
  bars: Bar[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  if (bars.length === 0) return;
  const [si, ei] = visibleRange(bars, viewport);
  if (si > ei) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.chartLeft, layout.mainTop, layout.chartWidth, layout.mainHeight);
  ctx.clip();

  ctx.strokeStyle = THEME.sma1Color;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.beginPath();

  let started = false;
  for (let i = si; i <= ei; i++) {
    const x = bx(i, viewport, layout);
    const y = by(bars[i].c, viewport, layout, scale);
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 2. Area chart                                                       */
/* ------------------------------------------------------------------ */

/**
 * Filled area below close-price line.
 * - Line: same as line chart (#2962FF, width 2)
 * - Fill: vertical gradient from line color (0.3 alpha) to transparent
 */
export function drawAreaChart(
  ctx: CanvasRenderingContext2D,
  bars: Bar[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  if (bars.length === 0) return;
  const [si, ei] = visibleRange(bars, viewport);
  if (si > ei) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.chartLeft, layout.mainTop, layout.chartWidth, layout.mainHeight);
  ctx.clip();

  // Build the close-price path
  const points: { x: number; y: number }[] = [];
  for (let i = si; i <= ei; i++) {
    points.push({
      x: bx(i, viewport, layout),
      y: by(bars[i].c, viewport, layout, scale),
    });
  }

  if (points.length === 0) {
    ctx.restore();
    return;
  }

  const bottomY = layout.mainTop + layout.mainHeight;

  // Fill
  const grad = ctx.createLinearGradient(0, layout.mainTop, 0, bottomY);
  grad.addColorStop(0, "rgba(41,98,255,0.30)");
  grad.addColorStop(1, "rgba(41,98,255,0.00)");

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(points[0].x, bottomY);
  for (const p of points) ctx.lineTo(p.x, p.y);
  ctx.lineTo(points[points.length - 1].x, bottomY);
  ctx.closePath();
  ctx.fill();

  // Stroke
  ctx.strokeStyle = THEME.sma1Color;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 3. OHLC bar chart                                                   */
/* ------------------------------------------------------------------ */

/**
 * Classic OHLC bars: vertical line H-L, left tick O, right tick C.
 * - Bull: THEME.bullBody, Bear: THEME.bearBody
 * - Line width: 1.5, tick width: 4px each side
 */
export function drawBarChart(
  ctx: CanvasRenderingContext2D,
  bars: Bar[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  if (bars.length === 0) return;
  const [si, ei] = visibleRange(bars, viewport);
  if (si > ei) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.chartLeft, layout.mainTop, layout.chartWidth, layout.mainHeight);
  ctx.clip();

  ctx.lineWidth = 1.5;
  ctx.lineCap = "butt";

  for (let i = si; i <= ei; i++) {
    const bar = bars[i];
    const x = bx(i, viewport, layout);
    const hY = by(bar.h, viewport, layout, scale);
    const lY = by(bar.l, viewport, layout, scale);
    const oY = by(bar.o, viewport, layout, scale);
    const cY = by(bar.c, viewport, layout, scale);

    const isBull = bar.c >= bar.o;
    ctx.strokeStyle = isBull ? THEME.bullBody : THEME.bearBody;

    ctx.beginPath();
    // Vertical line high-to-low
    ctx.moveTo(x, hY);
    ctx.lineTo(x, lY);
    // Left tick — open
    ctx.moveTo(x - 4, oY);
    ctx.lineTo(x, oY);
    // Right tick — close
    ctx.moveTo(x, cY);
    ctx.lineTo(x + 4, cY);
    ctx.stroke();
  }

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 4. Hollow candles                                                   */
/* ------------------------------------------------------------------ */

/**
 * Like standard candles but:
 * - Bull (close > open): outline only (hollow), THEME.bullBody border
 * - Bear (close < open): filled solid, THEME.bearBody
 * - Wick: thin line from high to low, same color as body
 */
export function drawHollowCandles(
  ctx: CanvasRenderingContext2D,
  bars: Bar[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  if (bars.length === 0) return;
  const [si, ei] = visibleRange(bars, viewport);
  if (si > ei) return;

  const range = viewport.endIndex - viewport.startIndex || 1;
  const barWidth = Math.max(1, (layout.chartWidth / range) * 0.7);
  const wickWidth = Math.max(1, barWidth < 3 ? 1 : barWidth * 0.15);

  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.chartLeft, layout.mainTop, layout.chartWidth, layout.mainHeight);
  ctx.clip();

  for (let i = si; i <= ei; i++) {
    const bar = bars[i];
    const x = bx(i, viewport, layout);
    const oY = by(bar.o, viewport, layout, scale);
    const cY = by(bar.c, viewport, layout, scale);
    const hY = by(bar.h, viewport, layout, scale);
    const lY = by(bar.l, viewport, layout, scale);

    const isBull = bar.c >= bar.o;
    const color = isBull ? THEME.bullBody : THEME.bearBody;

    // Wick
    ctx.strokeStyle = color;
    ctx.lineWidth = wickWidth;
    ctx.beginPath();
    ctx.moveTo(x, hY);
    ctx.lineTo(x, lY);
    ctx.stroke();

    // Body
    const bodyTop = Math.min(oY, cY);
    const bodyHeight = Math.max(1, Math.abs(oY - cY));

    if (isBull) {
      // Hollow — stroke only
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - barWidth / 2, bodyTop, barWidth, bodyHeight);
    } else {
      // Filled
      ctx.fillStyle = color;
      ctx.fillRect(x - barWidth / 2, bodyTop, barWidth, bodyHeight);
    }
  }

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 5. Heikin Ashi                                                      */
/* ------------------------------------------------------------------ */

/**
 * Transforms bars to Heikin Ashi then renders as standard candles.
 * The viewport price range is recomputed from the HA bars to ensure
 * correct vertical scaling.
 */
export function drawHeikinAshi(
  ctx: CanvasRenderingContext2D,
  bars: Bar[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  if (bars.length === 0) return;

  const haBars = computeHeikinAshi(bars);

  // Recompute price min/max from HA bars within visible range
  const [si, ei] = visibleRange(haBars, viewport);
  if (si > ei) return;

  let lo = Infinity;
  let hi = -Infinity;
  for (let i = si; i <= ei; i++) {
    if (haBars[i].l < lo) lo = haBars[i].l;
    if (haBars[i].h > hi) hi = haBars[i].h;
  }
  const priceRange = hi - lo || 0.0001;
  const padding = priceRange * 0.02;
  const haViewport: Viewport = {
    startIndex: viewport.startIndex,
    endIndex: viewport.endIndex,
    priceMin: lo - padding,
    priceMax: hi + padding,
  };

  const range = haViewport.endIndex - haViewport.startIndex || 1;
  const barWidth = Math.max(1, (layout.chartWidth / range) * 0.7);
  const wickWidth = Math.max(1, barWidth < 3 ? 1 : barWidth * 0.15);

  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.chartLeft, layout.mainTop, layout.chartWidth, layout.mainHeight);
  ctx.clip();

  for (let i = si; i <= ei; i++) {
    const bar = haBars[i];
    const x = bx(i, haViewport, layout);
    const oY = by(bar.o, haViewport, layout, scale);
    const cY = by(bar.c, haViewport, layout, scale);
    const hY = by(bar.h, haViewport, layout, scale);
    const lY = by(bar.l, haViewport, layout, scale);

    const isBull = bar.c >= bar.o;
    const isDoji = Math.abs(bar.c - bar.o) < (bar.h - bar.l) * 0.05;

    // Wick
    ctx.strokeStyle = isDoji ? THEME.dojiColor : (isBull ? THEME.bullWick : THEME.bearWick);
    ctx.lineWidth = wickWidth;
    ctx.beginPath();
    ctx.moveTo(x, hY);
    ctx.lineTo(x, lY);
    ctx.stroke();

    // Body
    const bodyTop = Math.min(oY, cY);
    const bodyHeight = Math.max(1, Math.abs(oY - cY));
    ctx.fillStyle = isDoji ? THEME.dojiColor : (isBull ? THEME.bullBody : THEME.bearBody);
    ctx.fillRect(x - barWidth / 2, bodyTop, barWidth, bodyHeight);
  }

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 6. Baseline                                                         */
/* ------------------------------------------------------------------ */

/**
 * Close-price line with fills above/below a dynamic baseline.
 * - Baseline = average close of visible bars
 * - Above: green line + green fill (alpha 0.10)
 * - Below: red line + red fill (alpha 0.10)
 * - Baseline: thin dashed gray line
 */
export function drawBaseline(
  ctx: CanvasRenderingContext2D,
  bars: Bar[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  if (bars.length === 0) return;
  const [si, ei] = visibleRange(bars, viewport);
  if (si > ei) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.chartLeft, layout.mainTop, layout.chartWidth, layout.mainHeight);
  ctx.clip();

  // Compute baseline as average close of visible bars
  let sum = 0;
  let count = 0;
  for (let i = si; i <= ei; i++) {
    sum += bars[i].c;
    count++;
  }
  const baseline = count > 0 ? sum / count : 0;
  const baseY = by(baseline, viewport, layout, scale);

  // Collect points
  const points: { x: number; y: number; close: number }[] = [];
  for (let i = si; i <= ei; i++) {
    points.push({
      x: bx(i, viewport, layout),
      y: by(bars[i].c, viewport, layout, scale),
      close: bars[i].c,
    });
  }

  if (points.length < 2) {
    ctx.restore();
    return;
  }

  // Fill above baseline (green)
  ctx.fillStyle = "rgba(38,166,154,0.10)";
  ctx.beginPath();
  ctx.moveTo(points[0].x, baseY);
  for (const p of points) {
    ctx.lineTo(p.x, Math.min(p.y, baseY));
  }
  ctx.lineTo(points[points.length - 1].x, baseY);
  ctx.closePath();
  ctx.fill();

  // Fill below baseline (red)
  ctx.fillStyle = "rgba(239,83,80,0.10)";
  ctx.beginPath();
  ctx.moveTo(points[0].x, baseY);
  for (const p of points) {
    ctx.lineTo(p.x, Math.max(p.y, baseY));
  }
  ctx.lineTo(points[points.length - 1].x, baseY);
  ctx.closePath();
  ctx.fill();

  // Stroke line segments colored by position relative to baseline
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    // Color by midpoint of segment
    const midClose = (prev.close + curr.close) / 2;
    ctx.strokeStyle = midClose >= baseline ? THEME.bullBody : THEME.bearBody;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(curr.x, curr.y);
    ctx.stroke();
  }

  // Baseline dashed line
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = THEME.axisText;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(layout.chartLeft, baseY);
  ctx.lineTo(layout.chartLeft + layout.chartWidth, baseY);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();
}
