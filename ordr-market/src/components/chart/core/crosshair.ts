import type { Bar } from "../indicators/types";
import type { ChartLayout, Viewport } from "./data";
import type { PriceScale } from "./data";
import { priceToY, yToPrice, indexToX, formatPrice } from "./data";
import { THEME } from "./theme";

const FONT = "11px 'IBM Plex Mono', monospace";

export type CrosshairMode = "crosshair" | "dot" | "none";

export interface CrosshairState {
  x: number;
  y: number;
  visible: boolean;
  snapIndex: number;
}

export function drawCrosshair(
  ctx: CanvasRenderingContext2D,
  state: CrosshairState,
  layout: ChartLayout,
  viewport: Viewport,
  bars: Bar[],
  pair: string,
  mode: CrosshairMode = "crosshair",
  scale: PriceScale = "linear",
  refPrice?: number,
): void {
  if (!state.visible || mode === "none") return;

  const { canvasWidth, canvasHeight, priceAxisWidth, mainTop, mainHeight, timeAxisHeight, chartLeft, chartWidth } = layout;
  const { priceMin, priceMax, startIndex, endIndex } = viewport;
  const axisY = canvasHeight - timeAxisHeight;
  const axisX = canvasWidth - priceAxisWidth;
  const snapX = Math.round(indexToX(state.snapIndex, startIndex, endIndex, chartLeft, chartWidth));

  if (mode === "dot") {
    // Dot mode: small circle at snap position, no lines
    const idx = Math.round(state.snapIndex);
    if (idx >= 0 && idx < bars.length) {
      const bar = bars[idx];
      const dotY = Math.round(priceToY(bar.c, priceMin, priceMax, mainTop, mainHeight, scale));
      ctx.save();
      ctx.fillStyle = THEME.crosshairColor;
      ctx.beginPath();
      ctx.arc(snapX, dotY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    return;
  }

  // Full crosshair mode
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = THEME.crosshairColor;
  ctx.lineWidth = 0.5;

  // Horizontal line (pixel-snapped)
  const hy = Math.round(state.y) + 0.5;
  ctx.beginPath();
  ctx.moveTo(0, hy);
  ctx.lineTo(axisX, hy);
  ctx.stroke();

  // Vertical line (pixel-snapped)
  ctx.beginPath();
  ctx.moveTo(snapX + 0.5, mainTop);
  ctx.lineTo(snapX + 0.5, axisY);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.restore();

  // Price label on Y axis (scale-aware)
  const price = yToPrice(state.y, priceMin, priceMax, mainTop, mainHeight, scale);
  ctx.font = FONT;

  let priceStr: string;
  if (scale === "percent" && refPrice && refPrice > 0) {
    const pct = ((price - refPrice) / refPrice) * 100;
    priceStr = (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%";
  } else {
    priceStr = formatPrice(price, pair);
  }

  const pw = ctx.measureText(priceStr).width + 12;
  ctx.fillStyle = THEME.labelBg;
  ctx.fillRect(axisX, Math.round(state.y) - 10, pw, 20);
  ctx.fillStyle = THEME.labelText;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(priceStr, axisX + 6, Math.round(state.y));

  // Time label on X axis
  const idx = Math.round(state.snapIndex);
  if (idx >= 0 && idx < bars.length) {
    const bar = bars[idx];
    const d = new Date(bar.t * 1000);
    const timeStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    const tw = ctx.measureText(timeStr).width + 12;
    ctx.fillStyle = THEME.labelBg;
    ctx.fillRect(snapX - tw/2, axisY, tw, 20);
    ctx.fillStyle = THEME.labelText;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(timeStr, snapX, axisY + 4);
  }

  // No separate tooltip box — OHLC legend (Row 1) already shows hovered bar data
}

export function snapToBar(
  mouseX: number,
  startIndex: number,
  endIndex: number,
  chartLeft: number,
  chartWidth: number,
  barCount: number,
): number {
  const range = endIndex - startIndex || 1;
  const raw = startIndex + ((mouseX - chartLeft) / chartWidth) * range;
  return Math.max(0, Math.min(barCount - 1, Math.round(raw)));
}
