import type { IndicatorPoint, BandPoint, MACDPoint } from "../indicators/types";
import type { ChartLayout, Viewport } from "../core/data";
import { priceToY, indexToX } from "../core/data";

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
  ctx.fillStyle = "#FAFBFC";
  ctx.fillRect(0, subPaneTop, layout.canvasWidth - layout.priceAxisWidth, subPaneHeight);
  ctx.strokeStyle = "#E2E8F0";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, subPaneTop);
  ctx.lineTo(layout.canvasWidth - layout.priceAxisWidth, subPaneTop);
  ctx.stroke();

  // RSI label
  ctx.font = "10px 'IBM Plex Mono', monospace";
  ctx.fillStyle = "#94A3B8";
  ctx.textAlign = "left";
  ctx.fillText("RSI(14)", 6, subPaneTop + 12);

  // 30/70 lines
  const y30 = subPaneTop + subPaneHeight * (1 - 30/100);
  const y70 = subPaneTop + subPaneHeight * (1 - 70/100);
  ctx.strokeStyle = "rgba(220,38,38,0.2)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, y70); ctx.lineTo(layout.canvasWidth - layout.priceAxisWidth, y70);
  ctx.stroke();
  ctx.strokeStyle = "rgba(5,150,105,0.2)";
  ctx.beginPath();
  ctx.moveTo(0, y30); ctx.lineTo(layout.canvasWidth - layout.priceAxisWidth, y30);
  ctx.stroke();
  ctx.setLineDash([]);

  // RSI line
  ctx.strokeStyle = "#8B5CF6";
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

  ctx.fillStyle = "#FAFBFC";
  ctx.fillRect(0, subPaneTop, layout.canvasWidth - layout.priceAxisWidth, subPaneHeight);
  ctx.strokeStyle = "#E2E8F0";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, subPaneTop);
  ctx.lineTo(layout.canvasWidth - layout.priceAxisWidth, subPaneTop);
  ctx.stroke();

  ctx.font = "10px 'IBM Plex Mono', monospace";
  ctx.fillStyle = "#94A3B8";
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
  ctx.strokeStyle = "rgba(148,163,184,0.3)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(layout.canvasWidth - layout.priceAxisWidth, midY);
  ctx.stroke();

  // Histogram
  for (const { idx, pt } of visible) {
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const h = pt.histogram * scale;
    ctx.fillStyle = pt.histogram >= 0 ? "rgba(5,150,105,0.4)" : "rgba(220,38,38,0.4)";
    ctx.fillRect(x - barWidth / 2, midY - (h > 0 ? h : 0), barWidth, Math.abs(h));
  }

  // MACD line
  ctx.strokeStyle = "#3B82F6";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  visible.forEach(({ idx, pt }, i) => {
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const y = midY - pt.macd * scale;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Signal line
  ctx.strokeStyle = "#F97316";
  ctx.lineWidth = 1;
  ctx.beginPath();
  visible.forEach(({ idx, pt }, i) => {
    const x = indexToX(idx, startIndex, endIndex, chartLeft, chartWidth);
    const y = midY - pt.signal * scale;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
}
