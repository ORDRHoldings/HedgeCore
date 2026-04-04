import type { Bar } from "../indicators/types";
import type { ChartLayout, Viewport } from "../core/data";
import type { PriceScale } from "../core/data";
import { priceToY, indexToX } from "../core/data";
import { THEME } from "../core/theme";

export function drawCandlesticks(
  ctx: CanvasRenderingContext2D,
  bars: Bar[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;
  const range  = endIndex - startIndex || 1;

  // TradingView proportions: body ~62% of slot, wick always 1px
  const slotW  = chartWidth / range;
  const bodyW  = Math.max(1, Math.round(slotW * 0.62));
  const halfBw = Math.floor(bodyW / 2);

  const si = Math.max(0, Math.floor(startIndex));
  const ei = Math.min(bars.length - 1, Math.ceil(endIndex));

  ctx.lineWidth = 1;

  for (let i = si; i <= ei; i++) {
    const bar  = bars[i];
    const x    = Math.round(indexToX(i, startIndex, endIndex, chartLeft, chartWidth));
    const oY   = Math.round(priceToY(bar.o, priceMin, priceMax, mainTop, mainHeight, scale));
    const cY   = Math.round(priceToY(bar.c, priceMin, priceMax, mainTop, mainHeight, scale));
    const hY   = Math.round(priceToY(bar.h, priceMin, priceMax, mainTop, mainHeight, scale));
    const lY   = Math.round(priceToY(bar.l, priceMin, priceMax, mainTop, mainHeight, scale));

    const isBull = bar.c >= bar.o;
    const isDoji = Math.abs(bar.c - bar.o) < (bar.h - bar.l) * 0.05;
    const color  = isDoji ? THEME.dojiColor : (isBull ? THEME.bullBody : THEME.bearBody);

    // Wick — 1px, centred at x+0.5 (crisp on all DPR)
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, hY);
    ctx.lineTo(x + 0.5, lY);
    ctx.stroke();

    // Body — solid fill, no border stroke (TradingView style)
    const bodyTop = Math.min(oY, cY);
    const bodyH   = Math.max(1, Math.abs(oY - cY));
    ctx.fillStyle = color;
    ctx.fillRect(x - halfBw, bodyTop, bodyW, bodyH);
  }
}
