/**
 * oscillators.ts -- Sub-pane oscillator renderers (Stochastic, StochRSI,
 * Williams %R, CCI, ADX, MFI, CMF, OBV)
 *
 * Each function draws into a specific SubPaneLayout area using dark theme
 * colors from THEME.
 */

import type {
  IndicatorPoint,
  StochasticPoint,
  ADXPoint,
  BullBearPoint,
  KlingerPoint,
  PPOPoint,
  RVIPoint,
  SMIPoint,
  TSIPoint,
  VortexPoint,
  AroonPoint,
} from "../indicators/types";
import type { ChartLayout, Viewport, SubPaneLayout } from "../core/data";
import { indexToX } from "../core/data";
import { THEME } from "../core/theme";

// ── Helpers ────────────────────────────────────────────

/** Draw filled background + top border for a sub-pane. */
function drawPaneBg(
  ctx: CanvasRenderingContext2D,
  layout: ChartLayout,
  pane: SubPaneLayout,
): void {
  ctx.fillStyle = THEME.subPaneBg;
  ctx.fillRect(0, pane.top, layout.canvasWidth - layout.priceAxisWidth, pane.height);
  ctx.strokeStyle = THEME.subPaneBorder;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, pane.top);
  ctx.lineTo(layout.canvasWidth - layout.priceAxisWidth, pane.top);
  ctx.stroke();
}

/** Draw a label in the top-left of a pane. */
function drawPaneLabel(
  ctx: CanvasRenderingContext2D,
  label: string,
  pane: SubPaneLayout,
): void {
  ctx.font = "10px 'IBM Plex Mono', monospace";
  ctx.fillStyle = THEME.axisText;
  ctx.textAlign = "left";
  ctx.fillText(label, 6, pane.top + 12);
}

/** Draw a horizontal dashed guide line at a given value in a fixed 0-100 range pane. */
function drawGuide100(
  ctx: CanvasRenderingContext2D,
  layout: ChartLayout,
  pane: SubPaneLayout,
  value: number,
  color: string,
): void {
  const y = pane.top + pane.height * (1 - value / 100);
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(layout.canvasWidth - layout.priceAxisWidth, y);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Draw a horizontal dashed guide line at a Y position. */
function drawGuideY(
  ctx: CanvasRenderingContext2D,
  layout: ChartLayout,
  y: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(layout.canvasWidth - layout.priceAxisWidth, y);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Map a value in [rangeMin, rangeMax] to a Y coordinate within the pane. */
function valueToY(
  value: number,
  rangeMin: number,
  rangeMax: number,
  pane: SubPaneLayout,
): number {
  const ratio = (value - rangeMin) / (rangeMax - rangeMin || 1);
  return pane.top + pane.height * (1 - ratio);
}

/**
 * Draw a single line through IndicatorPoint[] within a fixed range.
 * Clips to viewport bar indices.
 */
function drawFixedRangeLine(
  ctx: CanvasRenderingContext2D,
  points: { t: number; v: number }[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
  rangeMin: number,
  rangeMax: number,
  color: string,
  lineWidth: number = 1.5,
): void {
  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth } = layout;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  let started = false;
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const y = valueToY(pt.v, rangeMin, rangeMax, pane);
    if (!started) { ctx.moveTo(x, y); started = true; }
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

/**
 * Auto-scale: find min/max of values visible in viewport, then draw.
 * Returns { min, max } used for scaling.
 */
function autoScaleRange(
  values: number[][],
  timestamps: number[],
  bars: { t: number }[],
  viewport: Viewport,
  padding: number = 0.1,
): { min: number; max: number } {
  const { startIndex, endIndex } = viewport;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < timestamps.length; i++) {
    const idx = bars.findIndex(b => b.t === timestamps[i]);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    for (const arr of values) {
      const v = arr[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (!isFinite(lo)) { lo = 0; hi = 1; }
  const range = hi - lo || 1;
  return { min: lo - range * padding, max: hi + range * padding };
}

// ── Stochastic (14,3,3) ───────────────────────────────

export function drawStochastic(
  ctx: CanvasRenderingContext2D,
  points: StochasticPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "Stoch(14,3,3)", pane);

  // Guide lines at 80 and 20
  drawGuide100(ctx, layout, pane, 80, THEME.level30_70);
  drawGuide100(ctx, layout, pane, 20, THEME.level70_30);

  // K line
  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.k })),
    bars, layout, viewport, pane, 0, 100, THEME.stochK, 1.5,
  );
  // D line
  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.d })),
    bars, layout, viewport, pane, 0, 100, THEME.stochD, 1,
  );
}

// ── Stochastic RSI ────────────────────────────────────

export function drawStochRSI(
  ctx: CanvasRenderingContext2D,
  points: StochasticPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "StochRSI(14,14,3,3)", pane);

  drawGuide100(ctx, layout, pane, 80, THEME.level30_70);
  drawGuide100(ctx, layout, pane, 20, THEME.level70_30);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.k })),
    bars, layout, viewport, pane, 0, 100, THEME.stochK, 1.5,
  );
  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.d })),
    bars, layout, viewport, pane, 0, 100, THEME.stochD, 1,
  );
}

// ── Williams %R ───────────────────────────────────────

export function drawWilliamsR(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "Williams %R(14)", pane);

  // Guide lines at -20 (overbought) and -80 (oversold)
  // Range is -100 to 0; map -20 => 80% from bottom, -80 => 20% from bottom
  const y20 = valueToY(-20, -100, 0, pane);
  const y80 = valueToY(-80, -100, 0, pane);
  drawGuideY(ctx, layout, y20, THEME.level30_70);
  drawGuideY(ctx, layout, y80, THEME.level70_30);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, -100, 0, "#FF6D00", 1.5,
  );
}

// ── CCI ───────────────────────────────────────────────

export function drawCCI(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "CCI(20)", pane);

  // Auto-scale
  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange(
    [vals], timestamps, bars, viewport, 0.1,
  );

  // Guide lines at +100, -100, and 0
  const y100 = valueToY(100, rangeMin, rangeMax, pane);
  const yNeg100 = valueToY(-100, rangeMin, rangeMax, pane);
  const yZero = valueToY(0, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, y100, THEME.level30_70);
  drawGuideY(ctx, layout, yNeg100, THEME.level70_30);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#2196F3", 1.5,
  );
}

// ── ADX ───────────────────────────────────────────────

export function drawADX(
  ctx: CanvasRenderingContext2D,
  points: ADXPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "ADX(14)", pane);

  // Guide at 25
  drawGuide100(ctx, layout, pane, 25, THEME.zeroLine);

  // +DI (green)
  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.plusDI })),
    bars, layout, viewport, pane, 0, 100, THEME.bullBody, 1,
  );
  // -DI (red)
  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.minusDI })),
    bars, layout, viewport, pane, 0, 100, THEME.bearBody, 1,
  );
  // ADX (gray, bold)
  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.adx })),
    bars, layout, viewport, pane, 0, 100, THEME.axisText, 2,
  );
}

// ── MFI ───────────────────────────────────────────────

export function drawMFI(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "MFI(14)", pane);

  // Guide lines at 80 (overbought) and 20 (oversold)
  drawGuide100(ctx, layout, pane, 80, THEME.level30_70);
  drawGuide100(ctx, layout, pane, 20, THEME.level70_30);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, 0, 100, "#E040FB", 1.5,
  );
}

// ── CMF ───────────────────────────────────────────────

export function drawCMF(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "CMF(20)", pane);

  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth } = layout;

  // Auto-scale
  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange(
    [vals], timestamps, bars, viewport, 0.15,
  );

  // Zero line
  const yZero = valueToY(0, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  // Histogram fill below/above zero
  const range = endIndex - startIndex || 1;
  const barW = Math.max(1, (chartWidth / range) * 0.5);
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const yVal = valueToY(pt.value, rangeMin, rangeMax, pane);
    ctx.fillStyle = pt.value >= 0 ? THEME.macdHistPos : THEME.macdHistNeg;
    if (pt.value >= 0) {
      ctx.fillRect(x - barW / 2, yVal, barW, yZero - yVal);
    } else {
      ctx.fillRect(x - barW / 2, yZero, barW, yVal - yZero);
    }
  }

  // CMF line
  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#00BCD4", 1.5,
  );
}

// ── OBV ───────────────────────────────────────────────

export function drawOBV(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "OBV", pane);

  // Auto-scale
  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange(
    [vals], timestamps, bars, viewport, 0.1,
  );

  // Zero line
  const yZero = valueToY(0, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#FF9800", 1.5,
  );
}

// ── AO — Awesome Oscillator ───────────────────────────

export function drawAO(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "AO", pane);

  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);
  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth } = layout;
  const yZero = valueToY(0, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  const range = endIndex - startIndex || 1;
  const barW = Math.max(1, (chartWidth / range) * 0.5);
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const yVal = valueToY(pt.value, rangeMin, rangeMax, pane);
    ctx.fillStyle = pt.value >= 0 ? THEME.macdHistPos : THEME.macdHistNeg;
    if (pt.value >= 0) {
      ctx.fillRect(x - barW / 2, yVal, barW, yZero - yVal);
    } else {
      ctx.fillRect(x - barW / 2, yZero, barW, yVal - yZero);
    }
  }
}

// ── BOP — Balance of Power ────────────────────────────

export function drawBOP(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "BOP", pane);

  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);
  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth } = layout;
  const yZero = valueToY(0, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  const range = endIndex - startIndex || 1;
  const barW = Math.max(1, (chartWidth / range) * 0.5);
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const yVal = valueToY(pt.value, rangeMin, rangeMax, pane);
    ctx.fillStyle = pt.value >= 0 ? THEME.macdHistPos : THEME.macdHistNeg;
    if (pt.value >= 0) {
      ctx.fillRect(x - barW / 2, yVal, barW, yZero - yVal);
    } else {
      ctx.fillRect(x - barW / 2, yZero, barW, yVal - yZero);
    }
  }
}

// ── BBTrend — Bollinger Band Trend ────────────────────

export function drawBBTrend(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "BBTrend", pane);

  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);
  const yZero = valueToY(0, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#2196F3", 1.5,
  );
}

// ── Bull Bear Power ───────────────────────────────────

export function drawBullBearPower(
  ctx: CanvasRenderingContext2D,
  points: BullBearPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "Bull/Bear Power", pane);

  const timestamps = points.map(p => p.t);
  const { min: rangeMin, max: rangeMax } = autoScaleRange(
    [points.map(p => p.bull), points.map(p => p.bear)],
    timestamps, bars, viewport, 0.1,
  );
  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth } = layout;
  const yZero = valueToY(0, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  const range = endIndex - startIndex || 1;
  const barW = Math.max(1, (chartWidth / range) * 0.4);
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    // Bull histogram
    const yBull = valueToY(pt.bull, rangeMin, rangeMax, pane);
    ctx.fillStyle = THEME.bullBody;
    if (pt.bull >= 0) {
      ctx.fillRect(x - barW, yBull, barW, yZero - yBull);
    } else {
      ctx.fillRect(x - barW, yZero, barW, yBull - yZero);
    }
    // Bear histogram
    const yBear = valueToY(pt.bear, rangeMin, rangeMax, pane);
    ctx.fillStyle = THEME.bearBody;
    if (pt.bear >= 0) {
      ctx.fillRect(x, yBear, barW, yZero - yBear);
    } else {
      ctx.fillRect(x, yZero, barW, yBear - yZero);
    }
  }
}

// ── Chaikin Oscillator ────────────────────────────────

export function drawChaikinOsc(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "Chaikin Osc", pane);

  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);
  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth } = layout;
  const yZero = valueToY(0, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  const range = endIndex - startIndex || 1;
  const barW = Math.max(1, (chartWidth / range) * 0.5);
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const yVal = valueToY(pt.value, rangeMin, rangeMax, pane);
    ctx.fillStyle = pt.value >= 0 ? THEME.macdHistPos : THEME.macdHistNeg;
    if (pt.value >= 0) {
      ctx.fillRect(x - barW / 2, yVal, barW, yZero - yVal);
    } else {
      ctx.fillRect(x - barW / 2, yZero, barW, yVal - yZero);
    }
  }
}

// ── CMO — Chande Momentum Oscillator ─────────────────

export function drawCMO(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "CMO", pane);

  const y50 = valueToY(50, -100, 100, pane);
  const yNeg50 = valueToY(-50, -100, 100, pane);
  const yZero = valueToY(0, -100, 100, pane);
  drawGuideY(ctx, layout, y50, THEME.level30_70);
  drawGuideY(ctx, layout, yNeg50, THEME.level70_30);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, -100, 100, "#FF6D00", 1.5,
  );
}

// ── Choppiness Index ──────────────────────────────────

export function drawChoppiness(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "Choppiness", pane);

  drawGuide100(ctx, layout, pane, 61.8, THEME.level30_70);
  drawGuide100(ctx, layout, pane, 38.2, THEME.level70_30);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, 0, 100, "#9E9E9E", 1.5,
  );
}

// ── Chop Zone ─────────────────────────────────────────

export function drawChopZone(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "Chop Zone", pane);

  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);
  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth } = layout;
  const yZero = valueToY(0, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  const range = endIndex - startIndex || 1;
  const barW = Math.max(1, (chartWidth / range) * 0.5);
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const yVal = valueToY(pt.value, rangeMin, rangeMax, pane);
    ctx.fillStyle = pt.value >= 0 ? THEME.macdHistPos : THEME.macdHistNeg;
    if (pt.value >= 0) {
      ctx.fillRect(x - barW / 2, yVal, barW, yZero - yVal);
    } else {
      ctx.fillRect(x - barW / 2, yZero, barW, yVal - yZero);
    }
  }
}

// ── Connors RSI ───────────────────────────────────────

export function drawConnorsRSI(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "Connors RSI", pane);

  drawGuide100(ctx, layout, pane, 80, THEME.level30_70);
  drawGuide100(ctx, layout, pane, 20, THEME.level70_30);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, 0, 100, "#7B1FA2", 1.5,
  );
}

// ── Coppock Curve ─────────────────────────────────────

export function drawCoppock(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "Coppock", pane);

  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);
  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth } = layout;
  const yZero = valueToY(0, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  const range = endIndex - startIndex || 1;
  const barW = Math.max(1, (chartWidth / range) * 0.5);
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const yVal = valueToY(pt.value, rangeMin, rangeMax, pane);
    ctx.fillStyle = pt.value >= 0 ? THEME.macdHistPos : THEME.macdHistNeg;
    if (pt.value >= 0) {
      ctx.fillRect(x - barW / 2, yVal, barW, yZero - yVal);
    } else {
      ctx.fillRect(x - barW / 2, yZero, barW, yVal - yZero);
    }
  }
}

// ── DPO — Detrended Price Oscillator ─────────────────

export function drawDPO(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "DPO", pane);

  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);
  const yZero = valueToY(0, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#FF4081", 1.5,
  );
}

// ── EOM — Ease of Movement ────────────────────────────

export function drawEOM(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "EOM", pane);

  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);
  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth } = layout;
  const yZero = valueToY(0, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  const range = endIndex - startIndex || 1;
  const barW = Math.max(1, (chartWidth / range) * 0.5);
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const yVal = valueToY(pt.value, rangeMin, rangeMax, pane);
    ctx.fillStyle = pt.value >= 0 ? THEME.macdHistPos : THEME.macdHistNeg;
    if (pt.value >= 0) {
      ctx.fillRect(x - barW / 2, yVal, barW, yZero - yVal);
    } else {
      ctx.fillRect(x - barW / 2, yZero, barW, yVal - yZero);
    }
  }
}

// ── EFI — Elder Force Index ───────────────────────────

export function drawEFI(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "EFI", pane);

  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);
  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth } = layout;
  const yZero = valueToY(0, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  const range = endIndex - startIndex || 1;
  const barW = Math.max(1, (chartWidth / range) * 0.5);
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const yVal = valueToY(pt.value, rangeMin, rangeMax, pane);
    ctx.fillStyle = pt.value >= 0 ? THEME.macdHistPos : THEME.macdHistNeg;
    if (pt.value >= 0) {
      ctx.fillRect(x - barW / 2, yVal, barW, yZero - yVal);
    } else {
      ctx.fillRect(x - barW / 2, yZero, barW, yVal - yZero);
    }
  }
}

// ── Fisher Transform ──────────────────────────────────

export function drawFisher(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "Fisher", pane);

  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);
  const y2 = valueToY(2, rangeMin, rangeMax, pane);
  const yNeg2 = valueToY(-2, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, y2, THEME.level30_70);
  drawGuideY(ctx, layout, yNeg2, THEME.level70_30);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#E91E63", 1.5,
  );
}

// ── Klinger Oscillator ────────────────────────────────

export function drawKlinger(
  ctx: CanvasRenderingContext2D,
  points: KlingerPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "Klinger", pane);

  const timestamps = points.map(p => p.t);
  const { min: rangeMin, max: rangeMax } = autoScaleRange(
    [points.map(p => p.kvo), points.map(p => p.signal)],
    timestamps, bars, viewport, 0.1,
  );
  const yZero = valueToY(0, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.kvo })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#2196F3", 1.5,
  );
  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.signal })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#FF6D00", 1,
  );
}

// ── KST — Know Sure Thing ─────────────────────────────

export function drawKST(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "KST", pane);

  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);
  const yZero = valueToY(0, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#FF9800", 1.5,
  );
}

// ── Mass Index ────────────────────────────────────────

export function drawMassIndex(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "Mass Index", pane);

  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);
  const y27 = valueToY(27, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, y27, THEME.level30_70);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#9C27B0", 1.5,
  );
}

// ── Momentum ──────────────────────────────────────────

export function drawMomentum(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "Momentum", pane);

  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);
  const yZero = valueToY(0, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#26C6DA", 1.5,
  );
}

// ── PPO — Percentage Price Oscillator ─────────────────

export function drawPPO(
  ctx: CanvasRenderingContext2D,
  points: PPOPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "PPO", pane);

  const timestamps = points.map(p => p.t);
  const { min: rangeMin, max: rangeMax } = autoScaleRange(
    [points.map(p => p.ppo), points.map(p => p.signal), points.map(p => p.histogram)],
    timestamps, bars, viewport, 0.1,
  );
  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth } = layout;
  const yZero = valueToY(0, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  // Histogram
  const range = endIndex - startIndex || 1;
  const barW = Math.max(1, (chartWidth / range) * 0.5);
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const yVal = valueToY(pt.histogram, rangeMin, rangeMax, pane);
    ctx.fillStyle = pt.histogram >= 0 ? THEME.macdHistPos : THEME.macdHistNeg;
    if (pt.histogram >= 0) {
      ctx.fillRect(x - barW / 2, yVal, barW, yZero - yVal);
    } else {
      ctx.fillRect(x - barW / 2, yZero, barW, yVal - yZero);
    }
  }

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.ppo })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#2962FF", 1.5,
  );
  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.signal })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#FF6D00", 1,
  );
}

// ── ROC — Rate of Change ──────────────────────────────

export function drawROC(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "ROC", pane);

  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);
  const yZero = valueToY(0, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#00BCD4", 1.5,
  );
}

// ── RVI — Relative Vigor Index ────────────────────────

export function drawRVI(
  ctx: CanvasRenderingContext2D,
  points: RVIPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "RVI", pane);

  const timestamps = points.map(p => p.t);
  const { min: rangeMin, max: rangeMax } = autoScaleRange(
    [points.map(p => p.rvi), points.map(p => p.signal)],
    timestamps, bars, viewport, 0.1,
  );

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.rvi })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#26C6DA", 1.5,
  );
  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.signal })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#FF6D00", 1,
  );
}

// ── SMI Ergodic ───────────────────────────────────────

export function drawSMI(
  ctx: CanvasRenderingContext2D,
  points: SMIPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "SMI Ergodic", pane);

  const timestamps = points.map(p => p.t);
  const { min: rangeMin, max: rangeMax } = autoScaleRange(
    [points.map(p => p.smi), points.map(p => p.signal)],
    timestamps, bars, viewport, 0.1,
  );
  const y40 = valueToY(40, rangeMin, rangeMax, pane);
  const yNeg40 = valueToY(-40, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, y40, THEME.level30_70);
  drawGuideY(ctx, layout, yNeg40, THEME.level70_30);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.smi })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#00E676", 1.5,
  );
  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.signal })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#FF6D00", 1,
  );
}

// ── TRIX ──────────────────────────────────────────────

export function drawTRIX(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "TRIX", pane);

  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);
  const yZero = valueToY(0, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#FF4081", 1.5,
  );
}

// ── TSI — True Strength Index ─────────────────────────

export function drawTSI(
  ctx: CanvasRenderingContext2D,
  points: TSIPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "TSI", pane);

  const timestamps = points.map(p => p.t);
  const { min: rangeMin, max: rangeMax } = autoScaleRange(
    [points.map(p => p.tsi), points.map(p => p.signal)],
    timestamps, bars, viewport, 0.1,
  );
  const y25 = valueToY(25, rangeMin, rangeMax, pane);
  const yNeg25 = valueToY(-25, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, y25, THEME.level30_70);
  drawGuideY(ctx, layout, yNeg25, THEME.level70_30);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.tsi })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#7B1FA2", 1.5,
  );
  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.signal })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#FF6D00", 1,
  );
}

// ── Ultimate Oscillator ───────────────────────────────

export function drawUltimateOscillator(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "Ultimate Osc", pane);

  drawGuide100(ctx, layout, pane, 70, THEME.level30_70);
  drawGuide100(ctx, layout, pane, 30, THEME.level70_30);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, 0, 100, "#FF9800", 1.5,
  );
}

// ── Vortex Indicator ──────────────────────────────────

export function drawVortex(
  ctx: CanvasRenderingContext2D,
  points: VortexPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "Vortex", pane);

  const timestamps = points.map(p => p.t);
  const { min: rangeMin, max: rangeMax } = autoScaleRange(
    [points.map(p => p.viPlus), points.map(p => p.viMinus)],
    timestamps, bars, viewport, 0.1,
  );
  const y1 = valueToY(1, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, y1, THEME.zeroLine);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.viPlus })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#26C6DA", 1.5,
  );
  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.viMinus })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#EF5350", 1.5,
  );
}

// ── Aroon ─────────────────────────────────────────────

export function drawAroon(
  ctx: CanvasRenderingContext2D,
  points: AroonPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "Aroon", pane);

  drawGuide100(ctx, layout, pane, 70, THEME.level30_70);
  drawGuide100(ctx, layout, pane, 30, THEME.level70_30);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.up })),
    bars, layout, viewport, pane, 0, 100, "#26C6DA", 1.5,
  );
  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.down })),
    bars, layout, viewport, pane, 0, 100, "#EF5350", 1.5,
  );
}

// ── ADL — Accumulation/Distribution Line ──────────────

export function drawADL(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "ADL", pane);

  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);
  const yZero = valueToY(0, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#FF9800", 1.5,
  );
}

// ── CVD — Cumulative Volume Delta ─────────────────────

export function drawCVD(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "CVD", pane);

  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);
  const yZero = valueToY(0, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#26C6DA", 1.5,
  );
}

// ── CVI — Chaikin Volatility Index ────────────────────

export function drawCVI(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "CVI", pane);

  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);
  const yZero = valueToY(0, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#FF6D00", 1.5,
  );
}

// ── Net Volume ────────────────────────────────────────

export function drawNetVolume(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "Net Volume", pane);

  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);
  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth } = layout;
  const yZero = valueToY(0, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  const range = endIndex - startIndex || 1;
  const barW = Math.max(1, (chartWidth / range) * 0.5);
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const yVal = valueToY(pt.value, rangeMin, rangeMax, pane);
    ctx.fillStyle = pt.value >= 0 ? THEME.macdHistPos : THEME.macdHistNeg;
    if (pt.value >= 0) {
      ctx.fillRect(x - barW / 2, yVal, barW, yZero - yVal);
    } else {
      ctx.fillRect(x - barW / 2, yZero, barW, yVal - yZero);
    }
  }
}

// ── PVT — Price Volume Trend ──────────────────────────

export function drawPVT(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "PVT", pane);

  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#E91E63", 1.5,
  );
}

// ── Volume Oscillator ─────────────────────────────────

export function drawVolumeOscillator(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "Vol Osc", pane);

  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);
  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth } = layout;
  const yZero = valueToY(0, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  const range = endIndex - startIndex || 1;
  const barW = Math.max(1, (chartWidth / range) * 0.5);
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const yVal = valueToY(pt.value, rangeMin, rangeMax, pane);
    ctx.fillStyle = pt.value >= 0 ? THEME.macdHistPos : THEME.macdHistNeg;
    if (pt.value >= 0) {
      ctx.fillRect(x - barW / 2, yVal, barW, yZero - yVal);
    } else {
      ctx.fillRect(x - barW / 2, yZero, barW, yVal - yZero);
    }
  }
}

// ── BB %B ─────────────────────────────────────────────

export function drawBBPercentB(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "BB %B", pane);

  const y1 = valueToY(1, -0.1, 1.1, pane);
  const y0 = valueToY(0, -0.1, 1.1, pane);
  drawGuideY(ctx, layout, y1, THEME.level30_70);
  drawGuideY(ctx, layout, y0, THEME.level70_30);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, -0.1, 1.1, "#2196F3", 1.5,
  );
}

// ── BB Width ──────────────────────────────────────────

export function drawBBWidth(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "BB Width", pane);

  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#FF9800", 1.5,
  );
}

// ── Historical Volatility ─────────────────────────────

export function drawHistVol(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "Hist Vol", pane);

  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#7B1FA2", 1.5,
  );
}

// ── Correlation Coefficient ───────────────────────────

export function drawCorrelation(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "Correlation", pane);

  const y75 = valueToY(0.75, -1.1, 1.1, pane);
  const yZero = valueToY(0, -1.1, 1.1, pane);
  const yNeg75 = valueToY(-0.75, -1.1, 1.1, pane);
  drawGuideY(ctx, layout, y75, THEME.level30_70);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);
  drawGuideY(ctx, layout, yNeg75, THEME.level70_30);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, -1.1, 1.1, "#26A69A", 1.5,
  );
}

// ── ADR — Average Daily Range ─────────────────────────

export function drawADRPane(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);
  drawPaneLabel(ctx, "ADR", pane);

  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#FFD54F", 1.5,
  );
}
