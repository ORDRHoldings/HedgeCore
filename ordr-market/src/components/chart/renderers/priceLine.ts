/**
 * priceLine.ts -- Current price line + OHLC legend overlay
 *
 * TradingView-style current price dashed line with animated label,
 * and compact OHLC legend in the top-left corner of the main pane.
 */

import type { Bar } from "../indicators/types";
import type { ChartLayout, Viewport } from "../core/data";
import type { PriceScale } from "../core/data";
import { priceToY, formatPrice } from "../core/data";
import { THEME } from "../core/theme";

const FONT = "11px 'IBM Plex Mono', monospace";
const FONT_SMALL = "10px 'IBM Plex Mono', monospace";
const LABEL_PAD_X = 4;
const LABEL_PAD_Y = 2;
const ARROW_SIZE = 4;

/**
 * Format volume with K/M/B suffixes.
 */
function formatVolume(v: number): string {
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + "B";
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(1) + "K";
  return String(Math.round(v));
}

/**
 * Draw TradingView-style current price line with animated label.
 */
export function drawCurrentPriceLine(
  ctx: CanvasRenderingContext2D,
  bars: Bar[],
  layout: ChartLayout,
  viewport: Viewport,
  pair: string,
  scale: PriceScale = "linear",
): void {
  if (bars.length === 0) return;

  const lastBar = bars[bars.length - 1];
  const prevBar = bars.length >= 2 ? bars[bars.length - 2] : lastBar;
  const isBull = lastBar.c >= prevBar.c;
  const color = isBull ? THEME.bullBody : THEME.bearBody;

  const { mainTop, mainHeight, chartLeft, chartWidth, canvasWidth, priceAxisWidth } = layout;
  const { priceMin, priceMax } = viewport;

  const y = priceToY(lastBar.c, priceMin, priceMax, mainTop, mainHeight, scale);

  // Clamp: skip drawing if the price line is outside the visible main pane
  if (y < mainTop || y > mainTop + mainHeight) return;

  // --- Dashed line across chart area ---
  ctx.save();
  ctx.setLineDash([6, 3]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(chartLeft, y);
  ctx.lineTo(chartLeft + chartWidth, y);
  ctx.stroke();
  ctx.setLineDash([]);

  // --- Animated label in price-axis gutter ---
  const cycle = (Math.sin((Date.now() / 1000) * Math.PI * 2) + 1) / 2;
  const alpha = 0.85 + cycle * 0.15;

  ctx.font = FONT;
  const priceStr = formatPrice(lastBar.c, pair);
  const textWidth = ctx.measureText(priceStr).width;
  const labelWidth = textWidth + LABEL_PAD_X * 2;
  const labelHeight = 11 + LABEL_PAD_Y * 2;
  const axisX = canvasWidth - priceAxisWidth;
  const labelX = axisX + 2;
  const labelY = y - labelHeight / 2;

  ctx.globalAlpha = alpha;

  // Left-pointing arrow
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(labelX, y);
  ctx.lineTo(labelX + ARROW_SIZE, y - ARROW_SIZE);
  ctx.lineTo(labelX + ARROW_SIZE, y + ARROW_SIZE);
  ctx.closePath();
  ctx.fill();

  // Label background
  ctx.fillStyle = color;
  ctx.fillRect(labelX + ARROW_SIZE, labelY, labelWidth, labelHeight);

  // Label text
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(priceStr, labelX + ARROW_SIZE + LABEL_PAD_X, y);

  ctx.globalAlpha = 1.0;
  ctx.restore();
}

/**
 * Draw clean OHLC legend — Row 1 of top-left info block.
 *
 * Format: O 1.08234  H 1.08456  L 1.08123  C 1.08345  Vol 1.2M  +0.123%
 * Uses theme colors for bull/bear change %, muted labels.
 */
export function drawOHLCLegend(
  ctx: CanvasRenderingContext2D,
  bars: Bar[],
  layout: ChartLayout,
  viewport: Viewport,
  pair: string,
  hoveredIndex: number,
): void {
  if (bars.length === 0) return;

  const bar =
    hoveredIndex >= 0 && hoveredIndex < bars.length
      ? bars[hoveredIndex]
      : bars[bars.length - 1];

  const { chartLeft } = layout;
  const x0 = chartLeft + 8;
  const y0 = 14; // Row 1: absolute position in reserved header space (above mainTop)

  ctx.save();
  ctx.font = FONT;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  // Change percentage
  const changePct = bar.o !== 0 ? ((bar.c - bar.o) / bar.o) * 100 : 0;
  const isBull = bar.c >= bar.o;
  const changeColor = isBull ? THEME.bullBody : THEME.bearBody;
  const valueColor = THEME.tooltipText || "#D1D4DC";
  const labelColor = THEME.axisText || "#787B86";

  // Segments: label + value pairs
  const segments: { label: string; value: string; color: string }[] = [
    { label: "O ", value: formatPrice(bar.o, pair), color: valueColor },
    { label: "H ", value: formatPrice(bar.h, pair), color: valueColor },
    { label: "L ", value: formatPrice(bar.l, pair), color: valueColor },
    { label: "C ", value: formatPrice(bar.c, pair), color: isBull ? THEME.bullBody : THEME.bearBody },
    { label: "Vol ", value: formatVolume(bar.v), color: valueColor },
  ];

  let cursor = x0;
  const gap = 10; // pixel gap between segments

  for (const seg of segments) {
    ctx.fillStyle = labelColor;
    ctx.fillText(seg.label, cursor, y0);
    cursor += ctx.measureText(seg.label).width;

    ctx.fillStyle = seg.color;
    ctx.fillText(seg.value, cursor, y0);
    cursor += ctx.measureText(seg.value).width + gap;
  }

  // Change percentage at end
  const changePctStr = (changePct >= 0 ? "+" : "") + changePct.toFixed(3) + "%";
  ctx.fillStyle = changeColor;
  ctx.fillText(changePctStr, cursor, y0);

  ctx.restore();
}

/**
 * Draw indicator chip legend — Row 2 of top-left info block.
 *
 * Each active indicator rendered as: [colored dot] [label]
 * Spaced horizontally, positioned below OHLC legend.
 * Returns the Y position of the bottom of the legend for downstream layout.
 */
export function drawIndicatorLegend(
  ctx: CanvasRenderingContext2D,
  lines: { label: string; color: string }[],
  bands: { label: string; line: string }[],
  layout: ChartLayout,
): number {
  const items = [
    ...lines.map(l => ({ label: l.label, color: l.color })),
    ...bands.map(b => ({ label: b.label, color: b.line })),
  ];

  const { chartLeft } = layout;
  const ROW_Y = 30; // Row 2: absolute position in reserved header space

  if (items.length === 0) return ROW_Y;

  ctx.save();
  ctx.font = FONT_SMALL;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  let x = chartLeft + 8;

  for (const item of items) {
    // Colored dot
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.arc(x + 4, ROW_Y, 3, 0, Math.PI * 2);
    ctx.fill();

    // Label text
    ctx.fillStyle = THEME.axisText || "#787B86";
    ctx.fillText(item.label, x + 10, ROW_Y);
    x += ctx.measureText(item.label).width + 22;
  }

  ctx.restore();
  return ROW_Y + 10;
}
