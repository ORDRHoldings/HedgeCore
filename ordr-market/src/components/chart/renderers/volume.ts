import type { Bar } from "../indicators/types";
import type { ChartLayout, Viewport } from "../core/data";
import { indexToX } from "../core/data";
import { THEME } from "../core/theme";

export function drawVolume(
  ctx: CanvasRenderingContext2D,
  bars: Bar[],
  layout: ChartLayout,
  viewport: Viewport,
): void {
  const { volumeTop, volumeHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex } = viewport;
  const range = endIndex - startIndex || 1;
  const barWidth = Math.max(1, (chartWidth / range) * 0.7);

  // Find max volume in viewport
  const si = Math.max(0, Math.floor(startIndex));
  const ei = Math.min(bars.length - 1, Math.ceil(endIndex));
  let maxVol = 0;
  for (let i = si; i <= ei; i++) {
    if (bars[i].v > maxVol) maxVol = bars[i].v;
  }
  if (maxVol === 0) return;

  // Separator line (pixel-snapped)
  ctx.strokeStyle = THEME.separator;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, Math.round(volumeTop) + 0.5);
  ctx.lineTo(layout.canvasWidth - layout.priceAxisWidth, Math.round(volumeTop) + 0.5);
  ctx.stroke();

  const bw = Math.max(1, Math.round(barWidth));
  const halfBw = Math.round(bw / 2);

  for (let i = si; i <= ei; i++) {
    const bar = bars[i];
    const x = Math.round(indexToX(i, startIndex, endIndex, chartLeft, chartWidth));
    const h = Math.round((bar.v / maxVol) * (volumeHeight - 4));
    const isBull = bar.c >= bar.o;

    ctx.fillStyle = isBull ? THEME.bullVol : THEME.bearVol;
    ctx.fillRect(x - halfBw, volumeTop + volumeHeight - h, bw, h);
  }
}
