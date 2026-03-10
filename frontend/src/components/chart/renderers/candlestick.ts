import type { Bar } from "../indicators/types";
import type { ChartLayout, Viewport } from "../core/data";
import { priceToY, indexToX } from "../core/data";
import { THEME } from "../core/theme";

export function drawCandlesticks(
  ctx: CanvasRenderingContext2D,
  bars: Bar[],
  layout: ChartLayout,
  viewport: Viewport,
): void {
  const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;
  const range = endIndex - startIndex || 1;
  const barWidth = Math.max(1, (chartWidth / range) * 0.7);
  const wickWidth = Math.max(1, barWidth < 3 ? 1 : barWidth * 0.15);

  const si = Math.max(0, Math.floor(startIndex));
  const ei = Math.min(bars.length - 1, Math.ceil(endIndex));

  for (let i = si; i <= ei; i++) {
    const bar = bars[i];
    const x = indexToX(i, startIndex, endIndex, chartLeft, chartWidth);
    const oY = priceToY(bar.o, priceMin, priceMax, mainTop, mainHeight);
    const cY = priceToY(bar.c, priceMin, priceMax, mainTop, mainHeight);
    const hY = priceToY(bar.h, priceMin, priceMax, mainTop, mainHeight);
    const lY = priceToY(bar.l, priceMin, priceMax, mainTop, mainHeight);

    const isBull = bar.c >= bar.o;
    const isDoji = Math.abs(bar.c - bar.o) < (bar.h - bar.l) * 0.05;

    // Wick
    ctx.strokeStyle = isDoji ? THEME.dojiColor : (isBull ? THEME.bullWick : THEME.bearWick);
    ctx.lineWidth = wickWidth;
    ctx.beginPath();
    ctx.moveTo(x, hY);
    ctx.lineTo(x, lY);
    ctx.stroke();

    // Body
    const bodyTop = Math.min(oY, cY);
    const bodyHeight = Math.max(1, Math.abs(oY - cY));
    ctx.fillStyle = isDoji ? THEME.dojiColor : (isBull ? THEME.bullBody : THEME.bearBody);
    ctx.fillRect(x - barWidth / 2, bodyTop, barWidth, bodyHeight);
  }
}
