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
  StochSubPane,
  WilliamsRSubPane,
  CCISubPane,
  ADXSubPane,
  ATRSubPane,
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

/**
 * Compute EMA from a numeric array. Returns same-length array;
 * first `period-1` values mirror the seed value.
 */
function emaFromValues(values: number[], period: number): number[] {
  if (values.length === 0 || period <= 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = new Array(values.length);
  result[0] = values[0];
  for (let i = 1; i < values.length; i++) {
    result[i] = values[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}

/**
 * Draw a value label badge in the pane (top-right of the pane header).
 */
function drawPaneValueLabel(
  ctx: CanvasRenderingContext2D,
  layout: ChartLayout,
  pane: SubPaneLayout,
  text: string,
  color: string,
): void {
  ctx.save();
  ctx.font = "bold 9px 'IBM Plex Mono', monospace";
  const tw = ctx.measureText(text).width;
  const px = layout.canvasWidth - layout.priceAxisWidth - tw - 14;
  const py = pane.top + 4;
  ctx.fillStyle = "rgba(10,10,20,0.8)";
  ctx.fillRect(px - 4, py, tw + 8, 12);
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(text, px, py + 1);
  ctx.restore();
}

// ── Stochastic ────────────────────────────────────────

export function drawStochastic(
  ctx: CanvasRenderingContext2D,
  data: StochSubPane,
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  const { points, obLevel, osLevel } = data;
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);

  const pw = layout.canvasWidth - layout.priceAxisWidth;

  // OB / OS zone fills
  const yOB = pane.top + pane.height * (1 - obLevel / 100);
  const yOS = pane.top + pane.height * (1 - osLevel / 100);
  ctx.fillStyle = "rgba(239,83,80,0.10)";
  ctx.fillRect(0, pane.top, pw, yOB - pane.top);
  ctx.fillStyle = "rgba(38,166,154,0.10)";
  ctx.fillRect(0, yOS, pw, pane.top + pane.height - yOS);

  drawGuide100(ctx, layout, pane, obLevel, THEME.level30_70);
  drawGuide100(ctx, layout, pane, osLevel, THEME.level70_30);
  drawGuide100(ctx, layout, pane, 50, THEME.zeroLine);

  // ── Collect visible K/D coordinates for fill ──────────────────────────────
  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth } = layout;
  const visKD: { x: number; yk: number; yd: number; k: number; d: number }[] = [];
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    visKD.push({
      x:  indexToX(idx, startIndex, endIndex, chartLeft, chartWidth),
      yk: valueToY(pt.k, 0, 100, pane),
      yd: valueToY(pt.d, 0, 100, pane),
      k: pt.k, d: pt.d,
    });
  }

  // ── Fill between K and D (green when K ≥ D, red when K < D) ──────────────
  for (let i = 1; i < visKD.length; i++) {
    const pv = visKD[i - 1], cu = visKD[i];
    const avgDiff = ((pv.k - pv.d) + (cu.k - cu.d)) / 2;
    ctx.fillStyle = avgDiff >= 0 ? "rgba(38,166,154,0.18)" : "rgba(239,83,80,0.18)";
    ctx.beginPath();
    ctx.moveTo(pv.x, pv.yk);
    ctx.lineTo(cu.x, cu.yk);
    ctx.lineTo(cu.x, cu.yd);
    ctx.lineTo(pv.x, pv.yd);
    ctx.closePath();
    ctx.fill();
  }

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

  // ── K/D crossover triangle arrows ─────────────────────────────────────────
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1], curr = points[i];
    const crossed = (prev.k - prev.d) * (curr.k - curr.d) < 0;
    if (!crossed) continue;
    const inZone = curr.k > obLevel || curr.k < osLevel;
    const idx = bars.findIndex(b => b.t === curr.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const y = valueToY(curr.k, 0, 100, pane);
    const bull = curr.k > prev.k;
    ctx.fillStyle = bull ? "#26a69a" : "#ef5350";
    ctx.globalAlpha = inZone ? 1.0 : 0.45;
    ctx.beginPath();
    if (bull) {
      ctx.moveTo(x, y - 8); ctx.lineTo(x - 3, y - 2); ctx.lineTo(x + 3, y - 2);
    } else {
      ctx.moveTo(x, y + 8); ctx.lineTo(x - 3, y + 2); ctx.lineTo(x + 3, y + 2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Label
  const lastKD = visKD[visKD.length - 1];
  const kdLabel = lastKD
    ? `Stoch  %K ${lastKD.k.toFixed(1)}  %D ${lastKD.d.toFixed(1)}`
    : `Stoch OB:${obLevel} OS:${osLevel}`;
  drawPaneLabel(ctx, kdLabel, pane);
}

// ── Stochastic RSI ────────────────────────────────────

export function drawStochRSI(
  ctx: CanvasRenderingContext2D,
  data: StochSubPane,
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  const { points, obLevel, osLevel } = data;
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);

  const pw = layout.canvasWidth - layout.priceAxisWidth;
  const yOB = pane.top + pane.height * (1 - obLevel / 100);
  const yOS = pane.top + pane.height * (1 - osLevel / 100);

  ctx.fillStyle = "rgba(239,83,80,0.10)";
  ctx.fillRect(0, pane.top, pw, yOB - pane.top);
  ctx.fillStyle = "rgba(38,166,154,0.10)";
  ctx.fillRect(0, yOS, pw, pane.top + pane.height - yOS);

  drawGuide100(ctx, layout, pane, obLevel, THEME.level30_70);
  drawGuide100(ctx, layout, pane, osLevel, THEME.level70_30);
  drawGuide100(ctx, layout, pane, 50, THEME.zeroLine);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.k })),
    bars, layout, viewport, pane, 0, 100, THEME.stochK, 1.5,
  );
  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.d })),
    bars, layout, viewport, pane, 0, 100, THEME.stochD, 1,
  );

  // Strong cross signals: K/D cross inside OB or OS zone
  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth } = layout;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1], curr = points[i];
    const crossed = (prev.k - prev.d) * (curr.k - curr.d) < 0;
    if (!crossed) continue;
    const inOB = curr.k > obLevel, inOS = curr.k < osLevel;
    if (!inOB && !inOS) continue;
    const idx = bars.findIndex(b => b.t === curr.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const y = valueToY(curr.k, 0, 100, pane);
    // Bear cross in OB = sell signal; bull cross in OS = buy signal
    const signal = (inOB && curr.k < prev.k) || (inOS && curr.k > prev.k);
    ctx.strokeStyle = signal ? (inOS ? "#26a69a" : "#ef5350") : THEME.axisText;
    ctx.lineWidth = signal ? 2 : 1;
    ctx.fillStyle = signal ? (inOS ? "#26a69a" : "#ef5350") : THEME.axisText;
    ctx.beginPath();
    ctx.arc(x, y, signal ? 4 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  drawPaneLabel(ctx, `StochRSI OB:${obLevel} OS:${osLevel}`, pane);
}

// ── Williams %R ───────────────────────────────────────

export function drawWilliamsR(
  ctx: CanvasRenderingContext2D,
  data: WilliamsRSubPane,
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  const { points, obLevel, osLevel } = data;
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);

  const pw = layout.canvasWidth - layout.priceAxisWidth;
  // Range is [-100, 0]; obLevel e.g. -20, osLevel e.g. -80
  const yOB = valueToY(obLevel, -100, 0, pane);
  const yOS = valueToY(osLevel, -100, 0, pane);

  // OB zone fill (top → OB line)
  ctx.fillStyle = "rgba(239,83,80,0.10)";
  ctx.fillRect(0, pane.top, pw, yOB - pane.top);
  // OS zone fill (OS → bottom)
  ctx.fillStyle = "rgba(38,166,154,0.10)";
  ctx.fillRect(0, yOS, pw, pane.top + pane.height - yOS);

  drawGuideY(ctx, layout, yOB, THEME.level30_70);
  drawGuideY(ctx, layout, yOS, THEME.level70_30);
  drawGuideY(ctx, layout, valueToY(-50, -100, 0, pane), THEME.zeroLine);

  // Color line by zone
  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth } = layout;
  const vis: { idx: number; v: number }[] = [];
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    vis.push({ idx, v: pt.value });
  }
  for (let i = 0; i < vis.length - 1; i++) {
    const a = vis[i], b = vis[i + 1];
    const avg = (a.v + b.v) / 2;
    ctx.strokeStyle = avg > obLevel ? "#ef5350" : avg < osLevel ? "#26a69a" : "#FF6D00";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(indexToX(a.idx, startIndex, endIndex, chartLeft, chartWidth), valueToY(a.v, -100, 0, pane));
    ctx.lineTo(indexToX(b.idx, startIndex, endIndex, chartLeft, chartWidth), valueToY(b.v, -100, 0, pane));
    ctx.stroke();
  }

  drawPaneLabel(ctx, `W%R(${data.points.length ? "" : "14"}) OB:${obLevel} OS:${osLevel}`, pane);
}

// ── CCI ───────────────────────────────────────────────

export function drawCCI(
  ctx: CanvasRenderingContext2D,
  data: CCISubPane,
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  const { points, obLevel, osLevel } = data;
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);

  const pw = layout.canvasWidth - layout.priceAxisWidth;
  // Auto-scale with OB/OS lines guaranteed visible
  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rMin, max: rMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);
  const rangeMin = Math.min(rMin, osLevel * 1.1);
  const rangeMax = Math.max(rMax, obLevel * 1.1);

  const yOB   = valueToY(obLevel,  rangeMin, rangeMax, pane);
  const yOS   = valueToY(osLevel,  rangeMin, rangeMax, pane);
  const yZero = valueToY(0, rangeMin, rangeMax, pane);

  // OB / OS zone fills
  ctx.fillStyle = "rgba(239,83,80,0.10)";
  ctx.fillRect(0, pane.top, pw, yOB - pane.top);
  ctx.fillStyle = "rgba(38,166,154,0.10)";
  ctx.fillRect(0, yOS, pw, pane.top + pane.height - yOS);

  drawGuideY(ctx, layout, yOB,   THEME.level30_70);
  drawGuideY(ctx, layout, yOS,   THEME.level70_30);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  // Color CCI line by zone
  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth } = layout;
  const vis: { idx: number; v: number }[] = [];
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    vis.push({ idx, v: pt.value });
  }
  for (let i = 0; i < vis.length - 1; i++) {
    const a = vis[i], b = vis[i + 1];
    const avg = (a.v + b.v) / 2;
    ctx.strokeStyle = avg > obLevel ? "#ef5350" : avg < osLevel ? "#26a69a" : "#2196F3";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(indexToX(a.idx, startIndex, endIndex, chartLeft, chartWidth), valueToY(a.v, rangeMin, rangeMax, pane));
    ctx.lineTo(indexToX(b.idx, startIndex, endIndex, chartLeft, chartWidth), valueToY(b.v, rangeMin, rangeMax, pane));
    ctx.stroke();
  }

  drawPaneLabel(ctx, `CCI OB:${obLevel} OS:${osLevel}`, pane);
}

// ── ADX ───────────────────────────────────────────────

export function drawADX(
  ctx: CanvasRenderingContext2D,
  data: ADXSubPane,
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  const { points, threshold, showPlusDI, showMinusDI, showADX } = data;
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);

  const pw = layout.canvasWidth - layout.priceAxisWidth;
  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth } = layout;

  // Threshold guide line
  drawGuide100(ctx, layout, pane, threshold, THEME.zeroLine);

  // DI dominance fill — draw filled area between +DI and -DI, colored by dominance
  const vis: { idx: number; pt: ADXPoint }[] = [];
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    vis.push({ idx, pt });
  }

  if (vis.length >= 2 && (showPlusDI || showMinusDI)) {
    for (let i = 0; i < vis.length - 1; i++) {
      const a = vis[i], b = vis[i + 1];
      const x1 = indexToX(a.idx, startIndex, endIndex, chartLeft, chartWidth);
      const x2 = indexToX(b.idx, startIndex, endIndex, chartLeft, chartWidth);
      const plusDom = (a.pt.plusDI + b.pt.plusDI) / 2 > (a.pt.minusDI + b.pt.minusDI) / 2;
      ctx.fillStyle = plusDom ? "rgba(38,166,154,0.12)" : "rgba(239,83,80,0.12)";
      const topA = valueToY(Math.max(a.pt.plusDI, a.pt.minusDI), 0, 100, pane);
      const botA = valueToY(Math.min(a.pt.plusDI, a.pt.minusDI), 0, 100, pane);
      const topB = valueToY(Math.max(b.pt.plusDI, b.pt.minusDI), 0, 100, pane);
      const botB = valueToY(Math.min(b.pt.plusDI, b.pt.minusDI), 0, 100, pane);
      ctx.beginPath();
      ctx.moveTo(x1, topA);
      ctx.lineTo(x2, topB);
      ctx.lineTo(x2, botB);
      ctx.lineTo(x1, botA);
      ctx.closePath();
      ctx.fill();
    }
  }

  // DI cross markers
  for (let i = 1; i < vis.length; i++) {
    const prev = vis[i - 1].pt, curr = vis[i].pt;
    const crossed = (prev.plusDI - prev.minusDI) * (curr.plusDI - curr.minusDI) < 0;
    if (!crossed) continue;
    const x = indexToX(vis[i].idx, startIndex, endIndex, chartLeft, chartWidth);
    const y = valueToY((curr.plusDI + curr.minusDI) / 2, 0, 100, pane);
    ctx.fillStyle = curr.plusDI > curr.minusDI ? "#26a69a" : "#ef5350";
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  if (showPlusDI) drawFixedRangeLine(ctx, points.map(p => ({ t: p.t, v: p.plusDI })), bars, layout, viewport, pane, 0, 100, THEME.bullBody, 1);
  if (showMinusDI) drawFixedRangeLine(ctx, points.map(p => ({ t: p.t, v: p.minusDI })), bars, layout, viewport, pane, 0, 100, THEME.bearBody, 1);
  if (showADX) drawFixedRangeLine(ctx, points.map(p => ({ t: p.t, v: p.adx })), bars, layout, viewport, pane, 0, 100, THEME.axisText, 2);

  // Current ADX value label
  const lastPt = vis.length > 0 ? vis[vis.length - 1].pt : null;
  const adxLabel = lastPt ? ` ${lastPt.adx.toFixed(1)}` : "";
  drawPaneLabel(ctx, `ADX(${threshold})${adxLabel}`, pane);
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

  const pw = layout.canvasWidth - layout.priceAxisWidth;

  // OB/OS fill zones
  const yOB = pane.top + pane.height * (1 - 80 / 100);
  const yOS = pane.top + pane.height * (1 - 20 / 100);
  ctx.fillStyle = "rgba(239,83,80,0.08)";
  ctx.fillRect(0, pane.top, pw, yOB - pane.top);
  ctx.fillStyle = "rgba(38,166,154,0.08)";
  ctx.fillRect(0, yOS, pw, pane.top + pane.height - yOS);

  // Guide lines at 80, 50, 20
  drawGuide100(ctx, layout, pane, 80, THEME.level30_70);
  drawGuide100(ctx, layout, pane, 50, THEME.zeroLine);
  drawGuide100(ctx, layout, pane, 20, THEME.level70_30);

  // Color-segmented MFI line
  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth } = layout;
  ctx.lineWidth = 1.5;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1], p1 = points[i];
    const i0 = bars.findIndex(b => b.t === p0.t);
    const i1 = bars.findIndex(b => b.t === p1.t);
    if (i0 < startIndex - 1 || i0 > endIndex + 1) continue;
    const x0 = indexToX(i0, startIndex, endIndex, chartLeft, chartWidth);
    const x1 = indexToX(i1, startIndex, endIndex, chartLeft, chartWidth);
    const y0 = valueToY(p0.value, 0, 100, pane);
    const y1 = valueToY(p1.value, 0, 100, pane);
    const midVal = (p0.value + p1.value) / 2;
    ctx.strokeStyle = midVal >= 80 ? "#EF5350" : midVal <= 20 ? "#26A69A" : "#CE93D8";
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  // Current value label
  const last = points[points.length - 1];
  if (last) {
    const color = last.value >= 80 ? "#EF5350" : last.value <= 20 ? "#26A69A" : "#CE93D8";
    drawPaneValueLabel(ctx, layout, pane, `MFI ${last.value.toFixed(1)}`, color);
  }
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

  // Histogram fill below/above zero — stronger alpha
  const range = endIndex - startIndex || 1;
  const barW = Math.max(1, (chartWidth / range) * 0.5);
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const yVal = valueToY(pt.value, rangeMin, rangeMax, pane);
    ctx.fillStyle = pt.value >= 0 ? "rgba(38,166,154,0.45)" : "rgba(239,83,80,0.45)";
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

  // Signal EMA(9) line on CMF
  const sigVals = emaFromValues(vals, 9);
  drawFixedRangeLine(
    ctx, points.map((p, i) => ({ t: p.t, v: sigVals[i] })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#FF9800", 1,
  );

  // Zero-cross signal triangles
  const triSize = 4;
  ctx.save();
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1], p1 = points[i];
    const idx = bars.findIndex(b => b.t === p1.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    if ((p0.value < 0 && p1.value >= 0) || (p0.value > 0 && p1.value <= 0)) {
      const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
      const bull = p1.value >= 0;
      ctx.fillStyle = bull ? "#26A69A" : "#EF5350";
      const ty = bull ? yZero + 6 : yZero - 6;
      ctx.beginPath();
      if (bull) {
        ctx.moveTo(x, ty - triSize); ctx.lineTo(x - triSize, ty + triSize); ctx.lineTo(x + triSize, ty + triSize);
      } else {
        ctx.moveTo(x, ty + triSize); ctx.lineTo(x - triSize, ty - triSize); ctx.lineTo(x + triSize, ty - triSize);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();

  // Current value label
  const last = points[points.length - 1];
  if (last) {
    const color = last.value >= 0 ? "#26A69A" : "#EF5350";
    drawPaneValueLabel(ctx, layout, pane, `CMF ${last.value.toFixed(3)}`, color);
  }
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

  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth } = layout;

  // Auto-scale
  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const sigVals = emaFromValues(vals, 20);
  const { min: rangeMin, max: rangeMax } = autoScaleRange(
    [vals, sigVals], timestamps, bars, viewport, 0.1,
  );

  // Zero line
  const yZero = valueToY(0, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  // Direction-colored OBV line segments
  ctx.lineWidth = 1.5;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1], p1 = points[i];
    const i0 = bars.findIndex(b => b.t === p0.t);
    const i1 = bars.findIndex(b => b.t === p1.t);
    if (i0 < startIndex - 1 || i0 > endIndex + 1) continue;
    const x0 = indexToX(i0, startIndex, endIndex, chartLeft, chartWidth);
    const x1 = indexToX(i1, startIndex, endIndex, chartLeft, chartWidth);
    const y0 = valueToY(p0.value, rangeMin, rangeMax, pane);
    const y1 = valueToY(p1.value, rangeMin, rangeMax, pane);
    ctx.strokeStyle = p1.value >= p0.value ? "#26A69A" : "#EF5350";
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  // Signal EMA(20) line
  drawFixedRangeLine(
    ctx, points.map((p, i) => ({ t: p.t, v: sigVals[i] })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#FFD700", 1,
  );

  // Current value label
  const last = points[points.length - 1];
  const prev = points.length >= 2 ? points[points.length - 2] : null;
  if (last) {
    const bull = prev ? last.value >= prev.value : true;
    const formatted = Math.abs(last.value) >= 1e6
      ? `OBV ${(last.value / 1e6).toFixed(2)}M`
      : Math.abs(last.value) >= 1e3
      ? `OBV ${(last.value / 1e3).toFixed(1)}K`
      : `OBV ${last.value.toFixed(0)}`;
    drawPaneValueLabel(ctx, layout, pane, formatted, bull ? "#26A69A" : "#EF5350");
  }
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
  const sigVals = emaFromValues(vals, 10);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals, sigVals], timestamps, bars, viewport, 0.1);
  const yZero = valueToY(0, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#FF9800", 1.5,
  );
  // Signal EMA(10)
  drawFixedRangeLine(
    ctx, points.map((p, i) => ({ t: p.t, v: sigVals[i] })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#2196F3", 1,
  );
  // Current value
  const last = points[points.length - 1];
  const prev = points.length >= 2 ? points[points.length - 2] : null;
  if (last) {
    const bull = prev ? last.value >= prev.value : true;
    drawPaneValueLabel(ctx, layout, pane, `ADL ${last.value >= 0 ? "+" : ""}${last.value.toFixed(0)}`, bull ? "#FF9800" : "#EF5350");
  }
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

  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth } = layout;
  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);
  const yZero = valueToY(0, rangeMin, rangeMax, pane);
  drawGuideY(ctx, layout, yZero, THEME.zeroLine);

  // Delta bars (bar-by-bar change in CVD)
  const barRange = endIndex - startIndex || 1;
  const barW = Math.max(1, (chartWidth / barRange) * 0.4);
  for (let i = 1; i < points.length; i++) {
    const delta = points[i].value - points[i - 1].value;
    const idx = bars.findIndex(b => b.t === points[i].t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const yVal = valueToY(points[i].value, rangeMin, rangeMax, pane);
    ctx.fillStyle = delta >= 0 ? "rgba(38,198,218,0.5)" : "rgba(239,83,80,0.5)";
    if (delta >= 0) {
      ctx.fillRect(x - barW / 2, yVal, barW, yZero - yVal);
    } else {
      ctx.fillRect(x - barW / 2, yZero, barW, yVal - yZero);
    }
  }

  // Cumulative line on top
  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#26C6DA", 1.5,
  );

  // Current value
  const last = points[points.length - 1];
  if (last) {
    const bull = last.value >= 0;
    drawPaneValueLabel(ctx, layout, pane, `CVD ${bull ? "+" : ""}${last.value.toFixed(0)}`, bull ? "#26C6DA" : "#EF5350");
  }
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
  const sigVals = emaFromValues(vals, 9);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals, sigVals], timestamps, bars, viewport, 0.1);

  // PVT line
  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#E91E63", 1.5,
  );
  // Signal EMA(9)
  drawFixedRangeLine(
    ctx, points.map((p, i) => ({ t: p.t, v: sigVals[i] })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#FF9800", 1,
  );

  // Current value
  const last = points[points.length - 1];
  if (last) {
    const prev = points.length >= 2 ? points[points.length - 2] : null;
    const bull = prev ? last.value >= prev.value : true;
    drawPaneValueLabel(ctx, layout, pane, `PVT ${last.value.toFixed(0)}`, bull ? "#E91E63" : "#EF5350");
  }
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

  // Zero-cross signal triangles
  const triSize = 4;
  ctx.save();
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1], p1 = points[i];
    const idx = bars.findIndex(b => b.t === p1.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    if ((p0.value < 0 && p1.value >= 0) || (p0.value > 0 && p1.value <= 0)) {
      const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
      const bull = p1.value >= 0;
      ctx.fillStyle = bull ? "#26A69A" : "#EF5350";
      const ty = bull ? yZero + 7 : yZero - 7;
      ctx.beginPath();
      if (bull) {
        ctx.moveTo(x, ty - triSize); ctx.lineTo(x - triSize, ty + triSize); ctx.lineTo(x + triSize, ty + triSize);
      } else {
        ctx.moveTo(x, ty + triSize); ctx.lineTo(x - triSize, ty - triSize); ctx.lineTo(x + triSize, ty - triSize);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();

  // Current value label
  const last = points[points.length - 1];
  if (last) {
    const color = last.value >= 0 ? THEME.macdHistPos : THEME.macdHistNeg;
    drawPaneValueLabel(ctx, layout, pane, `VOsc ${last.value.toFixed(2)}%`, color);
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

  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth } = layout;
  const pw = layout.canvasWidth - layout.priceAxisWidth;

  // Auto-scale from visible values
  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);

  // Compute squeeze threshold = 25th percentile of visible values
  const visVals: number[] = [];
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx >= startIndex && idx <= endIndex) visVals.push(pt.value);
  }
  visVals.sort((a, b) => a - b);
  const squeeze25 = visVals.length > 4 ? visVals[Math.floor(visVals.length * 0.25)] : rangeMin;
  const squeeze10 = visVals.length > 4 ? visVals[Math.floor(visVals.length * 0.10)] : rangeMin;

  // Squeeze zone fill (bottom 25% of range = yellow-amber tint)
  const ySqueezeThresh = valueToY(squeeze25, rangeMin, rangeMax, pane);
  ctx.fillStyle = "rgba(255,193,7,0.08)";
  ctx.fillRect(0, ySqueezeThresh, pw, pane.top + pane.height - ySqueezeThresh);

  // Threshold line (squeeze boundary)
  ctx.strokeStyle = "rgba(255,193,7,0.55)";
  ctx.lineWidth = 0.8;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, ySqueezeThresh); ctx.lineTo(pw, ySqueezeThresh);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw BBWidth as colored histogram bars (expanding=teal, contracting=red, squeezed=amber)
  const visPoints: { idx: number; v: number }[] = [];
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    visPoints.push({ idx, v: pt.value });
  }

  const range = endIndex - startIndex || 1;
  const bw = Math.max(1, (chartWidth / range) * 0.6);
  const yBase = pane.top + pane.height;

  for (let i = 0; i < visPoints.length; i++) {
    const { idx, v } = visPoints[i];
    const prevV = i > 0 ? visPoints[i - 1].v : v;
    const squeezed = v <= squeeze10;
    let color: string;
    if (squeezed) color = "rgba(255,193,7,0.75)";
    else if (v > prevV) color = "rgba(38,198,218,0.75)";
    else color = "rgba(239,83,80,0.75)";

    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const y = valueToY(v, rangeMin, rangeMax, pane);
    ctx.fillStyle = color;
    ctx.fillRect(x - bw / 2, y, bw, yBase - y);
  }

  // Squeeze transition markers (squeeze entry/exit)
  for (let i = 1; i < visPoints.length; i++) {
    const prev = visPoints[i - 1], curr = visPoints[i];
    const wasSqueezing = prev.v <= squeeze25;
    const isSqueezed   = curr.v <= squeeze25;
    if (!wasSqueezing && isSqueezed) {
      // Entering squeeze: amber dot on threshold
      const x = indexToX(curr.idx, startIndex, endIndex, chartLeft, chartWidth);
      ctx.fillStyle = "#FFC107";
      ctx.beginPath();
      ctx.arc(x, ySqueezeThresh, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (wasSqueezing && !isSqueezed) {
      // Exiting squeeze (potential breakout): teal arrow
      const x = indexToX(curr.idx, startIndex, endIndex, chartLeft, chartWidth);
      ctx.fillStyle = "#26C6DA";
      ctx.beginPath();
      ctx.moveTo(x, ySqueezeThresh - 10);
      ctx.lineTo(x - 4, ySqueezeThresh - 4);
      ctx.lineTo(x + 4, ySqueezeThresh - 4);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Label with current value
  const lastVP = visPoints[visPoints.length - 1];
  const isSq = lastVP && lastVP.v <= squeeze25;
  drawPaneLabel(ctx, `BB Width ${lastVP ? lastVP.v.toFixed(4) : ""}${isSq ? " [SQ]" : ""}`, pane);
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

  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth } = layout;
  const pw = layout.canvasWidth - layout.priceAxisWidth;

  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange([vals], timestamps, bars, viewport, 0.1);

  // Compute percentiles from visible data
  const visVals: number[] = [];
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx >= startIndex && idx <= endIndex) visVals.push(pt.value);
  }
  const sorted = [...visVals].sort((a, b) => a - b);
  const pct = (q: number) => sorted.length > 4 ? sorted[Math.floor(sorted.length * q)] : 0;
  const p25 = pct(0.25), p75 = pct(0.75), p90 = pct(0.90);

  // Percentile reference bands (zones)
  if (p75 > 0) {
    const y25 = valueToY(p25, rangeMin, rangeMax, pane);
    const y75 = valueToY(p75, rangeMin, rangeMax, pane);
    const y90 = valueToY(p90, rangeMin, rangeMax, pane);
    const yBot = pane.top + pane.height;

    // Low vol zone fill (below 25th percentile) — green tint
    ctx.fillStyle = "rgba(38,166,154,0.07)";
    ctx.fillRect(0, y25, pw, yBot - y25);
    // High vol zone fill (above 75th percentile) — red tint
    ctx.fillStyle = "rgba(239,83,80,0.07)";
    ctx.fillRect(0, pane.top, pw, y75 - pane.top);
    // Extreme vol zone (above 90th) — stronger red
    if (p90 > p75) {
      ctx.fillStyle = "rgba(239,83,80,0.10)";
      ctx.fillRect(0, pane.top, pw, y90 - pane.top);
    }

    // Percentile dashed lines
    const drawPctLine = (y: number, label: string, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.6;
      ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(pw, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "8px 'IBM Plex Mono', monospace";
      ctx.fillStyle = color;
      ctx.textAlign = "right";
      ctx.fillText(label, pw - 3, y - 2);
    };
    drawPctLine(y25, "25p", "rgba(38,166,154,0.6)");
    drawPctLine(y75, "75p", "rgba(239,83,80,0.5)");
    if (p90 > p75) drawPctLine(y90, "90p", "rgba(239,83,80,0.7)");
  }

  // Collect visible points for color-coded line
  const visHV: { idx: number; v: number }[] = [];
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    visHV.push({ idx, v: pt.value });
  }

  // Draw HV line with regime color
  for (let i = 0; i < visHV.length - 1; i++) {
    const a = visHV[i], b = visHV[i + 1];
    const avg = (a.v + b.v) / 2;
    const color = avg > p75 ? "#EF5350" : avg < p25 ? "#26A69A" : "#AB47BC";
    const x1 = indexToX(a.idx, startIndex, endIndex, chartLeft, chartWidth);
    const x2 = indexToX(b.idx, startIndex, endIndex, chartLeft, chartWidth);
    const y1 = valueToY(a.v, rangeMin, rangeMax, pane);
    const y2 = valueToY(b.v, rangeMin, rangeMax, pane);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Label with current value + percentile rank
  const lastHV = visHV[visHV.length - 1];
  if (lastHV) {
    const rank = sorted.length > 0
      ? Math.round((sorted.filter(v => v <= lastHV.v).length / sorted.length) * 100)
      : 0;
    const regime = lastHV.v > p75 ? " HIGH" : lastHV.v < p25 ? " LOW" : "";
    drawPaneLabel(ctx, `HV ${(lastHV.v * 100).toFixed(1)}%  Rank:${rank}%${regime}`, pane);
  } else {
    drawPaneLabel(ctx, "Hist Vol", pane);
  }
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

// ── ATR — Average True Range ──────────────────────────

export function drawATR(
  ctx: CanvasRenderingContext2D,
  data: ATRSubPane,
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  pane: SubPaneLayout,
): void {
  const { points, ma, percentMode, period } = data;
  if (points.length < 2 || pane.height === 0) return;
  drawPaneBg(ctx, layout, pane);

  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth } = layout;

  // Auto-scale: include both ATR and MA values
  const timestamps = points.map(p => p.t);
  const vals = points.map(p => p.value);
  const maVals = ma.map(p => p.value);
  const { min: rangeMin, max: rangeMax } = autoScaleRange(
    maVals.length > 0 ? [vals, maVals] : [vals],
    timestamps, bars, viewport, 0.1,
  );

  // Fill area under ATR curve with gradient (high = more intense)
  const visATR: { idx: number; v: number }[] = [];
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    visATR.push({ idx, v: pt.value });
  }

  if (visATR.length >= 2) {
    const yBase = pane.top + pane.height;
    ctx.fillStyle = "rgba(38,198,218,0.10)";
    ctx.beginPath();
    ctx.moveTo(indexToX(visATR[0].idx, startIndex, endIndex, chartLeft, chartWidth), yBase);
    for (const { idx, v } of visATR) {
      ctx.lineTo(indexToX(idx, startIndex, endIndex, chartLeft, chartWidth), valueToY(v, rangeMin, rangeMax, pane));
    }
    ctx.lineTo(indexToX(visATR[visATR.length - 1].idx, startIndex, endIndex, chartLeft, chartWidth), yBase);
    ctx.closePath();
    ctx.fill();
  }

  // ATR line
  drawFixedRangeLine(
    ctx, points.map(p => ({ t: p.t, v: p.value })),
    bars, layout, viewport, pane, rangeMin, rangeMax, "#26C6DA", 1.5,
  );

  // MA overlay (SMA of ATR)
  if (ma.length >= 2) {
    drawFixedRangeLine(
      ctx, ma.map(p => ({ t: p.t, v: p.value })),
      bars, layout, viewport, pane, rangeMin, rangeMax, "#FFA726", 1,
    );
  }

  // Last value label
  const lastPt = visATR.length > 0 ? visATR[visATR.length - 1] : null;
  const valStr = lastPt ? (percentMode ? `${lastPt.v.toFixed(2)}%` : lastPt.v.toFixed(4)) : "";
  const suffix = percentMode ? " %" : "";
  drawPaneLabel(ctx, `ATR(${period})${suffix} ${valStr}`, pane);
}
