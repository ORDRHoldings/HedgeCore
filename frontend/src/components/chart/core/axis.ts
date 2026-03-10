import type { Bar } from "../indicators/types";
import type { ChartLayout, Viewport } from "./data";
import { priceToY, indexToX, formatPrice, formatTimestamp } from "./data";

const AXIS_BG = "#FAFBFC";
const AXIS_TEXT = "#64748B";
const GRID_LINE = "rgba(226,232,240,0.5)";
const AXIS_FONT = "11px 'IBM Plex Mono', monospace";

export function drawPriceAxis(
  ctx: CanvasRenderingContext2D,
  layout: ChartLayout,
  viewport: Viewport,
  pair: string,
): void {
  const { canvasWidth, priceAxisWidth, mainTop, mainHeight } = layout;
  const { priceMin, priceMax } = viewport;
  const axisX = canvasWidth - priceAxisWidth;

  // Background
  ctx.fillStyle = AXIS_BG;
  ctx.fillRect(axisX, mainTop, priceAxisWidth, mainHeight);

  // Border
  ctx.strokeStyle = "#E2E8F0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(axisX, mainTop);
  ctx.lineTo(axisX, mainTop + mainHeight);
  ctx.stroke();

  // Price labels
  const range = priceMax - priceMin;
  const step = niceStep(range, mainHeight / 50);
  const start = Math.ceil(priceMin / step) * step;

  ctx.font = AXIS_FONT;
  ctx.fillStyle = AXIS_TEXT;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  for (let price = start; price <= priceMax; price += step) {
    const y = priceToY(price, priceMin, priceMax, mainTop, mainHeight);
    if (y < mainTop + 10 || y > mainTop + mainHeight - 10) continue;

    // Grid line
    ctx.strokeStyle = GRID_LINE;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(axisX, y);
    ctx.stroke();

    // Label
    ctx.fillStyle = AXIS_TEXT;
    ctx.fillText(formatPrice(price, pair), axisX + 6, y);
  }
}

export function drawTimeAxis(
  ctx: CanvasRenderingContext2D,
  layout: ChartLayout,
  viewport: Viewport,
  bars: Bar[],
  interval: string,
): void {
  const { canvasWidth, canvasHeight, timeAxisHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex } = viewport;
  const axisY = canvasHeight - timeAxisHeight;

  // Background
  ctx.fillStyle = AXIS_BG;
  ctx.fillRect(0, axisY, canvasWidth, timeAxisHeight);

  // Border
  ctx.strokeStyle = "#E2E8F0";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, axisY);
  ctx.lineTo(canvasWidth, axisY);
  ctx.stroke();

  // Labels
  const visibleBars = endIndex - startIndex;
  const labelSpacing = Math.max(1, Math.floor(visibleBars / 8));

  ctx.font = AXIS_FONT;
  ctx.fillStyle = AXIS_TEXT;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  for (let i = startIndex; i <= endIndex; i += labelSpacing) {
    const idx = Math.floor(i);
    if (idx < 0 || idx >= bars.length) continue;
    const x = indexToX(i, startIndex, endIndex, chartLeft, chartWidth);
    if (x < 30 || x > canvasWidth - 90) continue;

    // Grid line
    ctx.strokeStyle = GRID_LINE;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, axisY);
    ctx.stroke();

    ctx.fillStyle = AXIS_TEXT;
    ctx.fillText(formatTimestamp(bars[idx].t, interval), x, axisY + 6);
  }
}

function niceStep(range: number, targetCount: number): number {
  const rough = range / targetCount;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / pow;
  let nice: number;
  if (norm < 1.5) nice = 1;
  else if (norm < 3.5) nice = 2;
  else if (norm < 7.5) nice = 5;
  else nice = 10;
  return nice * pow;
}
