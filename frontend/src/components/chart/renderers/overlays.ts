import type { SRLevel, FVGZone, TrendLine } from "../indicators/types";
import type { ChartLayout, Viewport } from "../core/data";
import { priceToY, indexToX } from "../core/data";

// ── Support/Resistance ──────────────────────────────────

export function drawSRLevels(
  ctx: CanvasRenderingContext2D,
  levels: SRLevel[],
  layout: ChartLayout,
  viewport: Viewport,
): void {
  const { mainTop, mainHeight, chartLeft, priceAxisWidth, canvasWidth } = layout;
  const { priceMin, priceMax } = viewport;

  for (const level of levels) {
    const y = priceToY(level.price, priceMin, priceMax, mainTop, mainHeight);
    if (y < mainTop || y > mainTop + mainHeight) continue;

    const alpha = Math.min(0.8, 0.2 + level.strength * 0.1);
    const color = level.type === "support"
      ? `rgba(5,150,105,${alpha})`
      : `rgba(220,38,38,${alpha})`;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(canvasWidth - priceAxisWidth, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label
    ctx.font = "9px 'IBM Plex Mono', monospace";
    ctx.fillStyle = color;
    ctx.textAlign = "right";
    ctx.fillText(
      `${level.type === "support" ? "S" : "R"} (${level.strength})`,
      canvasWidth - priceAxisWidth - 4,
      y - 3,
    );
  }
}

// ── Fair Value Gaps ─────────────────────────────────────

export function drawFVGZones(
  ctx: CanvasRenderingContext2D,
  zones: FVGZone[],
  layout: ChartLayout,
  viewport: Viewport,
): void {
  const { mainTop, mainHeight, chartLeft, chartWidth, priceAxisWidth, canvasWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  for (const zone of zones) {
    if (zone.endIndex < startIndex || zone.startIndex > endIndex) continue;

    const x1 = indexToX(zone.startIndex, startIndex, endIndex, chartLeft, chartWidth);
    const x2 = canvasWidth - priceAxisWidth; // extend to right edge
    const yTop = priceToY(zone.top, priceMin, priceMax, mainTop, mainHeight);
    const yBot = priceToY(zone.bottom, priceMin, priceMax, mainTop, mainHeight);

    ctx.fillStyle = zone.type === "bullish"
      ? "rgba(5,150,105,0.08)"
      : "rgba(220,38,38,0.08)";
    ctx.fillRect(x1, yTop, x2 - x1, yBot - yTop);

    // Border
    ctx.strokeStyle = zone.type === "bullish"
      ? "rgba(5,150,105,0.25)"
      : "rgba(220,38,38,0.25)";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x1, yTop, x2 - x1, yBot - yTop);

    // Label
    ctx.font = "9px 'IBM Plex Mono', monospace";
    ctx.fillStyle = zone.type === "bullish" ? "rgba(5,150,105,0.6)" : "rgba(220,38,38,0.6)";
    ctx.textAlign = "left";
    ctx.fillText("FVG", x1 + 3, yTop + 10);
  }
}

// ── Auto Trendlines ─────────────────────────────────────

export function drawTrendlines(
  ctx: CanvasRenderingContext2D,
  lines: TrendLine[],
  bars: { t: number }[],
  layout: ChartLayout,
  viewport: Viewport,
): void {
  const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  for (const line of lines) {
    // Find bar indices by timestamp
    const i1 = bars.findIndex(b => b.t === line.x1);
    const i2 = bars.findIndex(b => b.t === line.x2);
    if (i1 < 0 || i2 < 0) continue;
    if (i2 < startIndex - 5 || i1 > endIndex + 5) continue;

    const x1 = indexToX(i1, startIndex, endIndex, chartLeft, chartWidth);
    const y1 = priceToY(line.y1, priceMin, priceMax, mainTop, mainHeight);
    const x2 = indexToX(i2, startIndex, endIndex, chartLeft, chartWidth);
    const y2 = priceToY(line.y2, priceMin, priceMax, mainTop, mainHeight);

    const alpha = Math.min(0.8, 0.3 + line.touches * 0.1);
    ctx.strokeStyle = line.direction === "up"
      ? `rgba(5,150,105,${alpha})`
      : `rgba(220,38,38,${alpha})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);

    // Extend the line to the right edge
    const slope = (y2 - y1) / (x2 - x1 || 1);
    const extX = layout.canvasWidth - layout.priceAxisWidth;
    const extY = y2 + slope * (extX - x2);
    ctx.lineTo(extX, extY);
    ctx.stroke();

    // Touch count label
    ctx.font = "9px 'IBM Plex Mono', monospace";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.textAlign = "left";
    ctx.fillText(`\u00d7${line.touches}`, x2 + 4, y2 - 4);
  }
}
