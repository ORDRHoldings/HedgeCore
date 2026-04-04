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
  | "baseline"
  | "renko"
  | "linebreak";

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

/* ------------------------------------------------------------------ */
/* 7. Renko                                                            */
/* ------------------------------------------------------------------ */

interface RenkoBrick {
  open: number;
  close: number;
  isBull: boolean;
}

/**
 * ATR(14) brick size: average true range of the first 14 bars.
 */
function computeRenkoBrickSize(bars: Bar[]): number {
  const n = Math.min(14, bars.length - 1);
  if (n < 1) return (bars[0]?.h - bars[0]?.l) || 1;
  let sum = 0;
  for (let i = 1; i <= n; i++) {
    const b = bars[i];
    const pc = bars[i - 1].c;
    sum += Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc));
  }
  return sum / n;
}

function computeRenko(bars: Bar[]): RenkoBrick[] {
  if (bars.length === 0) return [];
  const brickSize = computeRenkoBrickSize(bars);
  const bricks: RenkoBrick[] = [];
  let ref = bars[0].c;
  for (const bar of bars) {
    while (bar.c >= ref + brickSize) {
      bricks.push({ open: ref, close: ref + brickSize, isBull: true });
      ref += brickSize;
    }
    while (bar.c <= ref - brickSize) {
      bricks.push({ open: ref, close: ref - brickSize, isBull: false });
      ref -= brickSize;
    }
  }
  return bricks;
}

/**
 * Renko chart: time-independent price bricks of uniform height (ATR-14).
 * - Bullish brick: solid THEME.bullBody rectangle, no wicks.
 * - Bearish brick: solid THEME.bearBody rectangle, no wicks.
 * - Viewport maps to brick indices proportionally by density ratio.
 */
export function drawRenko(
  ctx: CanvasRenderingContext2D,
  bars: Bar[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  if (bars.length === 0) return;
  const bricks = computeRenko(bars);
  if (bricks.length === 0) return;

  // Map viewport bar indices → brick indices via density ratio
  const ratio = bricks.length / bars.length;
  const si = Math.max(0, Math.floor(viewport.startIndex * ratio));
  const ei = Math.min(bricks.length - 1, Math.ceil(viewport.endIndex * ratio));
  if (si > ei) return;

  // Recompute price range from visible bricks
  let lo = Infinity, hi = -Infinity;
  for (let i = si; i <= ei; i++) {
    const lo2 = Math.min(bricks[i].open, bricks[i].close);
    const hi2 = Math.max(bricks[i].open, bricks[i].close);
    if (lo2 < lo) lo = lo2;
    if (hi2 > hi) hi = hi2;
  }
  const priceRange = hi - lo || 0.0001;
  const pad = priceRange * 0.05;
  const pMin = lo - pad;
  const pMax = hi + pad;

  const count = ei - si + 1;
  const brickW = Math.max(1, (layout.chartWidth / count) * 0.85);

  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.chartLeft, layout.mainTop, layout.chartWidth, layout.mainHeight);
  ctx.clip();

  for (let i = si; i <= ei; i++) {
    const brick = bricks[i];
    const x = layout.chartLeft + ((i - si + 0.5) / count) * layout.chartWidth;
    const y1 = priceToY(Math.max(brick.open, brick.close), pMin, pMax, layout.mainTop, layout.mainHeight, scale);
    const y2 = priceToY(Math.min(brick.open, brick.close), pMin, pMax, layout.mainTop, layout.mainHeight, scale);
    const h = Math.max(1, y2 - y1);

    ctx.fillStyle = brick.isBull ? THEME.bullBody : THEME.bearBody;
    ctx.fillRect(x - brickW / 2, y1, brickW, h);
  }

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 8. Line Break (3-line break)                                        */
/* ------------------------------------------------------------------ */

interface LBLine {
  open: number;
  close: number;
  isBull: boolean;
}

function computeLineBreak(bars: Bar[], n = 3): LBLine[] {
  if (bars.length === 0) return [];
  const lines: LBLine[] = [];
  const first = bars[0];
  lines.push({ open: first.o, close: first.c, isBull: first.c >= first.o });

  for (let i = 1; i < bars.length; i++) {
    const price = bars[i].c;
    const recent = lines.slice(-n);
    const topPrice = Math.max(...recent.map(l => Math.max(l.open, l.close)));
    const bottomPrice = Math.min(...recent.map(l => Math.min(l.open, l.close)));
    const last = lines[lines.length - 1];

    if (price > topPrice) {
      lines.push({ open: Math.max(last.open, last.close), close: price, isBull: true });
    } else if (price < bottomPrice) {
      lines.push({ open: Math.min(last.open, last.close), close: price, isBull: false });
    }
  }
  return lines;
}

/**
 * 3-Line Break chart: new line only when price breaks the prior 3 lines' range.
 * - Bullish line: hollow rectangle (stroke only) in THEME.bullBody.
 * - Bearish line: solid filled rectangle in THEME.bearBody.
 * - Viewport maps to line indices proportionally.
 */
export function drawLineBreak(
  ctx: CanvasRenderingContext2D,
  bars: Bar[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  if (bars.length === 0) return;
  const lines = computeLineBreak(bars);
  if (lines.length === 0) return;

  const ratio = lines.length / bars.length;
  const si = Math.max(0, Math.floor(viewport.startIndex * ratio));
  const ei = Math.min(lines.length - 1, Math.ceil(viewport.endIndex * ratio));
  if (si > ei) return;

  let lo = Infinity, hi = -Infinity;
  for (let i = si; i <= ei; i++) {
    const lo2 = Math.min(lines[i].open, lines[i].close);
    const hi2 = Math.max(lines[i].open, lines[i].close);
    if (lo2 < lo) lo = lo2;
    if (hi2 > hi) hi = hi2;
  }
  const priceRange = hi - lo || 0.0001;
  const pad = priceRange * 0.05;
  const pMin = lo - pad;
  const pMax = hi + pad;

  const count = ei - si + 1;
  const lineW = Math.max(1, (layout.chartWidth / count) * 0.85);

  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.chartLeft, layout.mainTop, layout.chartWidth, layout.mainHeight);
  ctx.clip();

  for (let i = si; i <= ei; i++) {
    const line = lines[i];
    const x = layout.chartLeft + ((i - si + 0.5) / count) * layout.chartWidth;
    const y1 = priceToY(Math.max(line.open, line.close), pMin, pMax, layout.mainTop, layout.mainHeight, scale);
    const y2 = priceToY(Math.min(line.open, line.close), pMin, pMax, layout.mainTop, layout.mainHeight, scale);
    const h = Math.max(1, y2 - y1);

    if (line.isBull) {
      ctx.strokeStyle = THEME.bullBody;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - lineW / 2, y1, lineW, h);
    } else {
      ctx.fillStyle = THEME.bearBody;
      ctx.fillRect(x - lineW / 2, y1, lineW, h);
    }
  }

  ctx.restore();
}
