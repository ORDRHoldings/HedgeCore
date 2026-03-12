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
  const range = endIndex - startIndex || 1;
  const barWidth = Math.max(1, (chartWidth / range) * 0.7);
  const wickWidth = Math.max(1, barWidth < 3 ? 1 : barWidth * 0.15);

  const si = Math.max(0, Math.floor(startIndex));
  const ei = Math.min(bars.length - 1, Math.ceil(endIndex));

  const bw = Math.max(1, Math.round(barWidth));
  const halfBw = Math.round(bw / 2);

  for (let i = si; i <= ei; i++) {
    const bar = bars[i];
    const x = Math.round(indexToX(i, startIndex, endIndex, chartLeft, chartWidth));
    const oY = Math.round(priceToY(bar.o, priceMin, priceMax, mainTop, mainHeight, scale));
    const cY = Math.round(priceToY(bar.c, priceMin, priceMax, mainTop, mainHeight, scale));
    const hY = Math.round(priceToY(bar.h, priceMin, priceMax, mainTop, mainHeight, scale));
    const lY = Math.round(priceToY(bar.l, priceMin, priceMax, mainTop, mainHeight, scale));

    const isBull = bar.c >= bar.o;
    const isDoji = Math.abs(bar.c - bar.o) < (bar.h - bar.l) * 0.05;

    // Wick (snap to half-pixel for crisp 1px line)
    ctx.strokeStyle = isDoji ? THEME.dojiColor : (isBull ? THEME.bullWick : THEME.bearWick);
    ctx.lineWidth = Math.max(1, Math.round(wickWidth));
    ctx.beginPath();
    ctx.moveTo(x + 0.5, hY);
    ctx.lineTo(x + 0.5, lY);
    ctx.stroke();

    // Body (pixel-snapped fill)
    const bodyTop = Math.min(oY, cY);
    const bodyHeight = Math.max(1, Math.abs(oY - cY));
    ctx.fillStyle = isDoji ? THEME.dojiColor : (isBull ? THEME.bullBody : THEME.bearBody);
    ctx.fillRect(x - halfBw, bodyTop, bw, bodyHeight);
  }
}
