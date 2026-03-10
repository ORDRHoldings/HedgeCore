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
