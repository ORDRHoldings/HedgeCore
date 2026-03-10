import type { Bar } from "../indicators/types";
import type { ChartLayout, Viewport } from "./data";
import type { PriceScale } from "./data";
import { priceToY, indexToX, formatPrice, formatTimestamp } from "./data";
import { THEME } from "./theme";

export function drawPriceAxis(
  ctx: CanvasRenderingContext2D,
  layout: ChartLayout,
  viewport: Viewport,
  pair: string,
  scale: PriceScale = "linear",
  refPrice?: number,
): void {
  const { canvasWidth, priceAxisWidth, mainTop, mainHeight } = layout;
  const { priceMin, priceMax } = viewport;
  const axisX = canvasWidth - priceAxisWidth;

  // Background
  ctx.fillStyle = THEME.axisBg;
  ctx.fillRect(axisX, mainTop, priceAxisWidth, mainHeight);

  // Border (pixel-snapped)
  ctx.strokeStyle = THEME.separator;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(axisX) + 0.5, mainTop);
  ctx.lineTo(Math.round(axisX) + 0.5, mainTop + mainHeight);
  ctx.stroke();

  ctx.font = THEME.axisFont;
  ctx.fillStyle = THEME.axisText;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  if (scale === "log" && priceMin > 0 && priceMax > 0) {
    // Log scale: generate ticks in log space
    const logMin = Math.log(priceMin);
    const logMax = Math.log(priceMax);
    const logRange = logMax - logMin;
    const logStep = niceStep(logRange, mainHeight / 50);
    const logStart = Math.ceil(logMin / logStep) * logStep;

    for (let lp = logStart; lp <= logMax; lp += logStep) {
      const price = Math.exp(lp);
      const y = Math.round(priceToY(price, priceMin, priceMax, mainTop, mainHeight, scale));
      if (y < mainTop + 10 || y > mainTop + mainHeight - 10) continue;

      ctx.strokeStyle = THEME.gridLine;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(axisX, y + 0.5);
      ctx.stroke();

      ctx.fillStyle = THEME.axisText;
      ctx.fillText(formatPrice(price, pair), axisX + 6, y);
    }
  } else if (scale === "percent" && refPrice && refPrice > 0) {
    // Percent scale: show % change from reference price
    const range = priceMax - priceMin;
    const step = niceStep(range, mainHeight / 50);
    const start = Math.ceil(priceMin / step) * step;

    for (let price = start; price <= priceMax; price += step) {
      const y = Math.round(priceToY(price, priceMin, priceMax, mainTop, mainHeight));
      if (y < mainTop + 10 || y > mainTop + mainHeight - 10) continue;

      ctx.strokeStyle = THEME.gridLine;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(axisX, y + 0.5);
      ctx.stroke();

      const pctChange = ((price - refPrice) / refPrice) * 100;
      const pctStr = (pctChange >= 0 ? "+" : "") + pctChange.toFixed(2) + "%";
      ctx.fillStyle = THEME.axisText;
      ctx.fillText(pctStr, axisX + 6, y);
    }
  } else {
    // Linear scale (default)
    const range = priceMax - priceMin;
    const step = niceStep(range, mainHeight / 50);
    const start = Math.ceil(priceMin / step) * step;

    for (let price = start; price <= priceMax; price += step) {
      const y = Math.round(priceToY(price, priceMin, priceMax, mainTop, mainHeight));
      if (y < mainTop + 10 || y > mainTop + mainHeight - 10) continue;

      // Grid line (pixel-snapped)
      ctx.strokeStyle = THEME.gridLine;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(axisX, y + 0.5);
      ctx.stroke();

      ctx.fillStyle = THEME.axisText;
      ctx.fillText(formatPrice(price, pair), axisX + 6, y);
    }
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
  ctx.fillStyle = THEME.axisBg;
  ctx.fillRect(0, axisY, canvasWidth, timeAxisHeight);

  // Border (pixel-snapped)
  ctx.strokeStyle = THEME.separator;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, Math.round(axisY) + 0.5);
  ctx.lineTo(canvasWidth, Math.round(axisY) + 0.5);
  ctx.stroke();

  // Labels
  const visibleBars = endIndex - startIndex;
  const labelSpacing = Math.max(1, Math.floor(visibleBars / 8));

  ctx.font = THEME.axisFont;
  ctx.fillStyle = THEME.axisText;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  for (let i = startIndex; i <= endIndex; i += labelSpacing) {
    const idx = Math.floor(i);
    if (idx < 0 || idx >= bars.length) continue;
    const x = Math.round(indexToX(i, startIndex, endIndex, chartLeft, chartWidth));
    if (x < 30 || x > canvasWidth - 90) continue;

    // Grid line (pixel-snapped)
    ctx.strokeStyle = THEME.gridLine;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, axisY);
    ctx.stroke();

    ctx.fillStyle = THEME.axisText;
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
