/**
 * priceLine.ts -- Current price line + OHLC legend overlay
 *
 * TradingView-style current price dashed line with animated label,
 * and compact OHLC legend in the top-left corner of the main pane.
 */

import type { Bar } from "../indicators/types";
import type { ChartLayout, Viewport } from "../core/data";
import { priceToY, formatPrice } from "../core/data";
import { THEME } from "../core/theme";

const FONT = "11px 'IBM Plex Mono', monospace";
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
 *
 * A dashed horizontal line at the last bar's close, spanning the full chart
 * width. A filled label sits in the price-axis gutter with a left-pointing
 * arrow. The label pulses subtly via alpha oscillation.
 */
export function drawCurrentPriceLine(
  ctx: CanvasRenderingContext2D,
  bars: Bar[],
  layout: ChartLayout,
  viewport: Viewport,
  pair: string,
): void {
  if (bars.length === 0) return;

  const lastBar = bars[bars.length - 1];
  const prevBar = bars.length >= 2 ? bars[bars.length - 2] : lastBar;
  const isBull = lastBar.c >= prevBar.c;
  const color = isBull ? THEME.bullBody : THEME.bearBody;

  const { mainTop, mainHeight, chartLeft, chartWidth, canvasWidth, priceAxisWidth } = layout;
  const { priceMin, priceMax } = viewport;

  const y = priceToY(lastBar.c, priceMin, priceMax, mainTop, mainHeight);

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
  // Alpha oscillation: cycle between 0.85 and 1.0 every 1000ms
  const cycle = (Math.sin((Date.now() / 1000) * Math.PI * 2) + 1) / 2; // 0..1
  const alpha = 0.85 + cycle * 0.15; // 0.85..1.0

  ctx.font = FONT;
  const priceStr = formatPrice(lastBar.c, pair);
  const textWidth = ctx.measureText(priceStr).width;
  const labelWidth = textWidth + LABEL_PAD_X * 2;
  const labelHeight = 11 + LABEL_PAD_Y * 2; // 11px font height + padding
  const axisX = canvasWidth - priceAxisWidth;
  const labelX = axisX + 2; // small gap from chart edge
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
 * Draw TradingView-style compact OHLC legend in top-left of chart.
 *
 * Shows either the hovered bar or the last bar. Single-line format:
 *   O 1.08234  H 1.08456  L 1.08123  C 1.08345  Vol 1.2M  +0.123%
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

  const { chartLeft, mainTop } = layout;
  const x0 = chartLeft + 8;
  const y0 = mainTop + 16;

  ctx.save();
  ctx.font = FONT;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  // Compute change percentage (open to close)
  const changePct = bar.o !== 0 ? ((bar.c - bar.o) / bar.o) * 100 : 0;
  const changePctStr =
    (changePct >= 0 ? "+" : "") + changePct.toFixed(3) + "%";
  const changeColor = changePct >= 0 ? THEME.bullBody : THEME.bearBody;

  // Build label-value pairs
  const segments: Array<{ label: string; value: string; color: string }> = [
    { label: "O ", value: formatPrice(bar.o, pair), color: "#D1D4DC" },
    { label: "H ", value: formatPrice(bar.h, pair), color: "#D1D4DC" },
    { label: "L ", value: formatPrice(bar.l, pair), color: "#D1D4DC" },
    { label: "C ", value: formatPrice(bar.c, pair), color: "#D1D4DC" },
    { label: "Vol ", value: formatVolume(bar.v), color: "#D1D4DC" },
  ];

  let cursor = x0;
  const gap = "  "; // 2-space separator

  for (const seg of segments) {
    // Label (muted)
    ctx.fillStyle = THEME.axisText;
    ctx.fillText(seg.label, cursor, y0);
    cursor += ctx.measureText(seg.label).width;

    // Value
    ctx.fillStyle = seg.color;
    ctx.fillText(seg.value, cursor, y0);
    cursor += ctx.measureText(seg.value).width;

    // Gap
    cursor += ctx.measureText(gap).width;
  }

  // Change percentage
  ctx.fillStyle = changeColor;
  ctx.fillText(changePctStr, cursor, y0);

  ctx.restore();
}
