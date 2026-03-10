import type {
  IndicatorPoint,
  BandPoint,
  MACDPoint,
  IchimokuPoint,
  PivotPointData,
} from "../indicators/types";
import type { ChartLayout, Viewport } from "../core/data";
import { priceToY, indexToX } from "../core/data";
import { THEME } from "../core/theme";

// ── Overlay line (SMA, EMA) ────────────────────────────

export function drawIndicatorLine(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  color: string,
  lineWidth: number = 1.5,
): void {
  if (points.length < 2) return;
  const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  let started = false;

  for (const pt of points) {
    // Find bar index by timestamp
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;

    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const y = priceToY(pt.value, priceMin, priceMax, mainTop, mainHeight);
    if (!started) { ctx.moveTo(x, y); started = true; }
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// ── Band overlay (Bollinger, Keltner) ──────────────────

export function drawBands(
  ctx: CanvasRenderingContext2D,
  points: BandPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
  fillColor: string,
  lineColor: string,
): void {
  if (points.length < 2) return;
  const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  // Fill between upper and lower
  ctx.fillStyle = fillColor;
  ctx.beginPath();

  const visiblePts: { x: number; upper: number; lower: number; mid: number }[] = [];
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    visiblePts.push({
      x,
      upper: priceToY(pt.upper, priceMin, priceMax, mainTop, mainHeight),
      lower: priceToY(pt.lower, priceMin, priceMax, mainTop, mainHeight),
      mid: priceToY(pt.middle, priceMin, priceMax, mainTop, mainHeight),
    });
  }

  if (visiblePts.length < 2) return;

  // Upper line forward
  ctx.moveTo(visiblePts[0].x, visiblePts[0].upper);
  for (let i = 1; i < visiblePts.length; i++) {
    ctx.lineTo(visiblePts[i].x, visiblePts[i].upper);
  }
  // Lower line backward
  for (let i = visiblePts.length - 1; i >= 0; i--) {
    ctx.lineTo(visiblePts[i].x, visiblePts[i].lower);
  }
  ctx.closePath();
  ctx.fill();

  // Upper/lower/middle lines
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);

  // Upper
  ctx.beginPath();
  for (let i = 0; i < visiblePts.length; i++) {
    if (i === 0) ctx.moveTo(visiblePts[i].x, visiblePts[i].upper);
    else ctx.lineTo(visiblePts[i].x, visiblePts[i].upper);
  }
  ctx.stroke();

  // Lower
  ctx.beginPath();
  for (let i = 0; i < visiblePts.length; i++) {
    if (i === 0) ctx.moveTo(visiblePts[i].x, visiblePts[i].lower);
    else ctx.lineTo(visiblePts[i].x, visiblePts[i].lower);
  }
  ctx.stroke();

  ctx.setLineDash([]);

  // Middle (solid)
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < visiblePts.length; i++) {
    if (i === 0) ctx.moveTo(visiblePts[i].x, visiblePts[i].mid);
    else ctx.lineTo(visiblePts[i].x, visiblePts[i].mid);
  }
  ctx.stroke();
}

// ── RSI sub-pane ───────────────────────────────────────

export function drawRSI(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
): void {
  const { subPaneTop, subPaneHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex } = viewport;
  if (subPaneHeight === 0) return;

  // Background + border
  ctx.fillStyle = THEME.subPaneBg;
  ctx.fillRect(0, subPaneTop, layout.canvasWidth - layout.priceAxisWidth, subPaneHeight);
  ctx.strokeStyle = THEME.subPaneBorder;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, subPaneTop);
  ctx.lineTo(layout.canvasWidth - layout.priceAxisWidth, subPaneTop);
  ctx.stroke();

  // RSI label
  ctx.font = "10px 'IBM Plex Mono', monospace";
  ctx.fillStyle = THEME.axisText;
  ctx.textAlign = "left";
  ctx.fillText("RSI(14)", 6, subPaneTop + 12);

  // 30/70 lines
  const y30 = subPaneTop + subPaneHeight * (1 - 30/100);
  const y70 = subPaneTop + subPaneHeight * (1 - 70/100);
  ctx.strokeStyle = THEME.level30_70;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, y70); ctx.lineTo(layout.canvasWidth - layout.priceAxisWidth, y70);
  ctx.stroke();
  ctx.strokeStyle = THEME.level70_30;
  ctx.beginPath();
  ctx.moveTo(0, y30); ctx.lineTo(layout.canvasWidth - layout.priceAxisWidth, y30);
  ctx.stroke();
  ctx.setLineDash([]);

  // RSI line
  ctx.strokeStyle = THEME.rsiColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  let started = false;
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const y = subPaneTop + subPaneHeight * (1 - pt.value / 100);
    if (!started) { ctx.moveTo(x, y); started = true; }
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// ── MACD sub-pane ──────────────────────────────────────

export function drawMACD(
  ctx: CanvasRenderingContext2D,
  points: MACDPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
): void {
  const { subPaneTop, subPaneHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex } = viewport;
  if (subPaneHeight === 0) return;

  ctx.fillStyle = THEME.subPaneBg;
  ctx.fillRect(0, subPaneTop, layout.canvasWidth - layout.priceAxisWidth, subPaneHeight);
  ctx.strokeStyle = THEME.subPaneBorder;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, subPaneTop);
  ctx.lineTo(layout.canvasWidth - layout.priceAxisWidth, subPaneTop);
  ctx.stroke();

  ctx.font = "10px 'IBM Plex Mono', monospace";
  ctx.fillStyle = THEME.axisText;
  ctx.textAlign = "left";
  ctx.fillText("MACD(12,26,9)", 6, subPaneTop + 12);

  // Find max abs value for scaling
  let maxAbs = 0;
  const visible: { idx: number; pt: MACDPoint }[] = [];
  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    visible.push({ idx, pt });
    maxAbs = Math.max(maxAbs, Math.abs(pt.macd), Math.abs(pt.signal), Math.abs(pt.histogram));
  }
  if (maxAbs === 0 || visible.length < 2) return;

  const midY = subPaneTop + subPaneHeight / 2;
  const scale = (subPaneHeight / 2 - 10) / maxAbs;
  const range = endIndex - startIndex || 1;
  const barWidth = Math.max(1, (chartWidth / range) * 0.5);

  // Zero line
  ctx.strokeStyle = THEME.zeroLine;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(layout.canvasWidth - layout.priceAxisWidth, midY);
  ctx.stroke();

  // Histogram
  for (const { idx, pt } of visible) {
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const h = pt.histogram * scale;
    ctx.fillStyle = pt.histogram >= 0 ? THEME.macdHistPos : THEME.macdHistNeg;
    ctx.fillRect(x - barWidth / 2, midY - (h > 0 ? h : 0), barWidth, Math.abs(h));
  }

  // MACD line
  ctx.strokeStyle = THEME.macdLine;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  visible.forEach(({ idx, pt }, i) => {
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const y = midY - pt.macd * scale;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Signal line
  ctx.strokeStyle = THEME.macdSignal;
  ctx.lineWidth = 1;
  ctx.beginPath();
  visible.forEach(({ idx, pt }, i) => {
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const y = midY - pt.signal * scale;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

// ── VWAP overlay ──────────────────────────────────────

export function drawVWAP(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
): void {
  drawIndicatorLine(ctx, points, bars, layout, viewport, THEME.vwapColor, 2);
}

// ── Ichimoku Cloud overlay ────────────────────────────

export function drawIchimoku(
  ctx: CanvasRenderingContext2D,
  points: IchimokuPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
): void {
  if (points.length < 2) return;
  const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  // Collect visible points with their x/y coords
  const vis: {
    x: number;
    tenkanY: number;
    kijunY: number;
    senkouAY: number;
    senkouBY: number;
    chikouY: number;
    senkouA: number;
    senkouB: number;
  }[] = [];

  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    vis.push({
      x,
      tenkanY: priceToY(pt.tenkan, priceMin, priceMax, mainTop, mainHeight),
      kijunY: priceToY(pt.kijun, priceMin, priceMax, mainTop, mainHeight),
      senkouAY: priceToY(pt.senkouA, priceMin, priceMax, mainTop, mainHeight),
      senkouBY: priceToY(pt.senkouB, priceMin, priceMax, mainTop, mainHeight),
      chikouY: priceToY(pt.chikou, priceMin, priceMax, mainTop, mainHeight),
      senkouA: pt.senkouA,
      senkouB: pt.senkouB,
    });
  }
  if (vis.length < 2) return;

  // Cloud fill between senkouA and senkouB
  // Draw as segments, coloring bullish/bearish per segment
  for (let i = 0; i < vis.length - 1; i++) {
    const curr = vis[i];
    const next = vis[i + 1];
    const bullish = curr.senkouA >= curr.senkouB;
    ctx.fillStyle = bullish ? "rgba(38,166,154,0.06)" : "rgba(239,83,80,0.06)";
    ctx.beginPath();
    ctx.moveTo(curr.x, curr.senkouAY);
    ctx.lineTo(next.x, next.senkouAY);
    ctx.lineTo(next.x, next.senkouBY);
    ctx.lineTo(curr.x, curr.senkouBY);
    ctx.closePath();
    ctx.fill();
  }

  // Tenkan-sen (conversion line)
  ctx.strokeStyle = "#2962FF";
  ctx.lineWidth = 1;
  ctx.beginPath();
  vis.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.tenkanY); else ctx.lineTo(p.x, p.tenkanY); });
  ctx.stroke();

  // Kijun-sen (base line)
  ctx.strokeStyle = "#EF5350";
  ctx.lineWidth = 1;
  ctx.beginPath();
  vis.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.kijunY); else ctx.lineTo(p.x, p.kijunY); });
  ctx.stroke();

  // Chikou span (lagging)
  ctx.strokeStyle = "#787B86";
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  vis.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.chikouY); else ctx.lineTo(p.x, p.chikouY); });
  ctx.stroke();
  ctx.setLineDash([]);

  // Senkou A (leading span A)
  ctx.strokeStyle = "rgba(38,166,154,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  vis.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.senkouAY); else ctx.lineTo(p.x, p.senkouAY); });
  ctx.stroke();

  // Senkou B (leading span B)
  ctx.strokeStyle = "rgba(239,83,80,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  vis.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.senkouBY); else ctx.lineTo(p.x, p.senkouBY); });
  ctx.stroke();
}

// ── HMA overlay ───────────────────────────────────────

export function drawHMA(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
): void {
  drawIndicatorLine(ctx, points, bars, layout, viewport, "#00E676", 1.5);
}

// ── TEMA overlay ──────────────────────────────────────

export function drawTEMA(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
): void {
  drawIndicatorLine(ctx, points, bars, layout, viewport, "#FF4081", 1.5);
}

// ── Donchian Channel overlay ──────────────────────────

export function drawDonchian(
  ctx: CanvasRenderingContext2D,
  points: BandPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
): void {
  drawBands(ctx, points, bars, layout, viewport, "rgba(0,188,212,0.06)", "#00BCD4");
}

// ── Parabolic SAR dots overlay ────────────────────────

export function drawParabolicSAR(
  ctx: CanvasRenderingContext2D,
  points: IndicatorPoint[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
): void {
  if (points.length === 0) return;
  const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  for (const pt of points) {
    const idx = bars.findIndex(b => b.t === pt.t);
    if (idx < startIndex - 1 || idx > endIndex + 1) continue;
    if (idx < 0 || idx >= bars.length) continue;

    const bar = bars[idx] as { t: number; c: number };
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const y = priceToY(pt.value, priceMin, priceMax, mainTop, mainHeight);

    // SAR above close = bearish (red), below close = bullish (green)
    const closePrice = bar.c;
    ctx.fillStyle = pt.value > closePrice ? "#EF5350" : "#26A69A";

    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Pivot Points overlay ──────────────────────────────

export function drawPivotPoints(
  ctx: CanvasRenderingContext2D,
  pivots: PivotPointData,
  layout: ChartLayout,
  viewport: Viewport,
): void {
  const { mainTop, mainHeight, chartLeft, chartWidth, priceAxisWidth, canvasWidth } = layout;
  const { priceMin, priceMax } = viewport;

  const lineRight = canvasWidth - priceAxisWidth;

  const drawPivotLine = (
    price: number,
    label: string,
    color: string,
    dashed: boolean,
  ) => {
    if (price < priceMin || price > priceMax) return;
    const y = priceToY(price, priceMin, priceMax, mainTop, mainHeight);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    if (dashed) ctx.setLineDash([4, 4]);
    else ctx.setLineDash([]);

    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(lineRight, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label on right side
    ctx.font = "9px 'IBM Plex Mono', monospace";
    ctx.fillStyle = color;
    ctx.textAlign = "right";
    ctx.fillText(label, lineRight - 4, y - 3);
  };

  // PP - solid white
  drawPivotLine(pivots.pp, "PP", "#D1D4DC", false);

  // Resistance - dashed red
  drawPivotLine(pivots.r1, "R1", "#EF5350", true);
  drawPivotLine(pivots.r2, "R2", "#EF5350", true);
  drawPivotLine(pivots.r3, "R3", "#EF5350", true);

  // Support - dashed green
  drawPivotLine(pivots.s1, "S1", "#26A69A", true);
  drawPivotLine(pivots.s2, "S2", "#26A69A", true);
  drawPivotLine(pivots.s3, "S3", "#26A69A", true);
}
