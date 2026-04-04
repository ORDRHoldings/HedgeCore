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

/** Alert level descriptor passed from workspace state */
export interface AlertLevel {
  value: number;
  active: boolean;
  triggered: boolean;
}

/**
 * Draw alert price levels as dashed horizontal lines with axis labels.
 * Active alerts: orange. Triggered/inactive: muted gray.
 */
export function drawAlertLevels(
  ctx: CanvasRenderingContext2D,
  alerts: AlertLevel[],
  layout: ChartLayout,
  viewport: Viewport,
  pair: string,
  scale: PriceScale = "linear",
): void {
  if (!alerts.length) return;

  const { mainTop, mainHeight, chartLeft, chartWidth, canvasWidth, priceAxisWidth } = layout;
  const { priceMin, priceMax } = viewport;

  ctx.save();
  ctx.font = FONT;

  for (const alert of alerts) {
    const y = priceToY(alert.value, priceMin, priceMax, mainTop, mainHeight, scale);
    if (y < mainTop || y > mainTop + mainHeight) continue;

    const color = (alert.active && !alert.triggered) ? "#FF9800" : "#607D8B";
    const alpha = (alert.active && !alert.triggered) ? 0.85 : 0.45;

    ctx.globalAlpha = alpha;

    // Dashed line
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(chartLeft + chartWidth, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Price label in axis gutter
    const priceStr = formatPrice(alert.value, pair);
    const textWidth = ctx.measureText(priceStr).width;
    const labelWidth = textWidth + LABEL_PAD_X * 2;
    const labelHeight = 11 + LABEL_PAD_Y * 2;
    const axisX = canvasWidth - priceAxisWidth;
    const labelX = axisX + 2;
    const labelY = y - labelHeight / 2;

    // Arrow
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(labelX, y);
    ctx.lineTo(labelX + ARROW_SIZE, y - ARROW_SIZE);
    ctx.lineTo(labelX + ARROW_SIZE, y + ARROW_SIZE);
    ctx.closePath();
    ctx.fill();

    // Background
    ctx.fillStyle = color;
    ctx.fillRect(labelX + ARROW_SIZE, labelY, labelWidth, labelHeight);

    // Text
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(priceStr, labelX + ARROW_SIZE + LABEL_PAD_X, y);
  }

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

// ── Trade Levels ──────────────────────────────────────────────────────────────

/** Minimal trade data for on-chart rendering */
export interface TradeLevel {
  side: 'buy' | 'sell';
  entryPrice: number;
  sl: number | null;
  tp: number | null;
  lots: number;
  pair: string;
}

/**
 * Draw open paper positions on the chart:
 *   - Solid entry line  (blue = buy, amber = sell)
 *   - Dashed SL line    (red)
 *   - Dashed TP line    (green)
 *   - Translucent risk zone  (entry → SL)
 *   - Translucent reward zone (entry → TP)
 *   - Label at right edge: "LONG 0.10 @ 1.08500"
 */
export function drawTradeLevels(
  ctx: CanvasRenderingContext2D,
  trades: TradeLevel[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): void {
  if (!trades.length) return;

  const { mainTop, mainHeight, chartLeft, chartWidth, canvasWidth, priceAxisWidth } = layout;
  const { priceMin, priceMax } = viewport;

  ctx.save();
  ctx.font = "10px 'IBM Plex Mono', monospace";

  for (const trade of trades) {
    const isBuy  = trade.side === 'buy';
    const entryColor = isBuy  ? '#2962FF' : '#FF8C00';    // blue / amber
    const slColor    = '#EF5350';                          // red
    const tpColor    = '#26A69A';                          // teal

    const entryY = priceToY(trade.entryPrice, priceMin, priceMax, mainTop, mainHeight, scale);
    const inView = (y: number) => y >= mainTop && y <= mainTop + mainHeight;

    // ── Entry line ────────────────────────────────────────────────────────
    if (inView(entryY)) {
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = entryColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(chartLeft, entryY);
      ctx.lineTo(chartLeft + chartWidth, entryY);
      ctx.stroke();

      // Label
      const lotStr = trade.lots.toFixed(2);
      const pxStr  = formatPrice(trade.entryPrice, trade.pair);
      const label  = `${isBuy ? 'LONG' : 'SHORT'} ${lotStr} @ ${pxStr}`;
      const tw     = ctx.measureText(label).width;
      const lx     = canvasWidth - priceAxisWidth - tw - 10;
      const ly     = entryY - 8;

      ctx.globalAlpha = 0.75;
      ctx.fillStyle   = entryColor;
      ctx.fillRect(lx - 3, ly - 1, tw + 6, 13);
      ctx.globalAlpha = 1;
      ctx.fillStyle   = '#FFFFFF';
      ctx.textAlign   = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(label, lx, ly);
      ctx.textBaseline = 'alphabetic';
    }

    // ── SL zone + line ────────────────────────────────────────────────────
    if (trade.sl !== null && trade.sl > 0) {
      const slY = priceToY(trade.sl, priceMin, priceMax, mainTop, mainHeight, scale);
      const zoneTop    = Math.min(entryY, slY);
      const zoneBottom = Math.max(entryY, slY);
      const clampedTop    = Math.max(mainTop, zoneTop);
      const clampedBottom = Math.min(mainTop + mainHeight, zoneBottom);
      if (clampedBottom > clampedTop) {
        ctx.globalAlpha = 0.07;
        ctx.fillStyle   = slColor;
        ctx.fillRect(chartLeft, clampedTop, chartWidth, clampedBottom - clampedTop);
      }
      if (inView(slY)) {
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = slColor;
        ctx.lineWidth   = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(chartLeft, slY);
        ctx.lineTo(chartLeft + chartWidth, slY);
        ctx.stroke();
        ctx.setLineDash([]);
        // Label
        const slStr = `SL ${formatPrice(trade.sl, trade.pair)}`;
        const tw2   = ctx.measureText(slStr).width;
        ctx.globalAlpha = 0.65;
        ctx.fillStyle   = slColor;
        ctx.fillRect(canvasWidth - priceAxisWidth - tw2 - 10, slY - 13, tw2 + 6, 13);
        ctx.globalAlpha = 1;
        ctx.fillStyle   = '#FFFFFF';
        ctx.textAlign   = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(slStr, canvasWidth - priceAxisWidth - tw2 - 7, slY - 13);
        ctx.textBaseline = 'alphabetic';
      }
    }

    // ── TP zone + line ────────────────────────────────────────────────────
    if (trade.tp !== null && trade.tp > 0) {
      const tpY = priceToY(trade.tp, priceMin, priceMax, mainTop, mainHeight, scale);
      const zoneTop    = Math.min(entryY, tpY);
      const zoneBottom = Math.max(entryY, tpY);
      const clampedTop    = Math.max(mainTop, zoneTop);
      const clampedBottom = Math.min(mainTop + mainHeight, zoneBottom);
      if (clampedBottom > clampedTop) {
        ctx.globalAlpha = 0.07;
        ctx.fillStyle   = tpColor;
        ctx.fillRect(chartLeft, clampedTop, chartWidth, clampedBottom - clampedTop);
      }
      if (inView(tpY)) {
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = tpColor;
        ctx.lineWidth   = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(chartLeft, tpY);
        ctx.lineTo(chartLeft + chartWidth, tpY);
        ctx.stroke();
        ctx.setLineDash([]);
        const tpStr = `TP ${formatPrice(trade.tp, trade.pair)}`;
        const tw3   = ctx.measureText(tpStr).width;
        ctx.globalAlpha = 0.65;
        ctx.fillStyle   = tpColor;
        ctx.fillRect(canvasWidth - priceAxisWidth - tw3 - 10, tpY - 13, tw3 + 6, 13);
        ctx.globalAlpha = 1;
        ctx.fillStyle   = '#FFFFFF';
        ctx.textAlign   = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(tpStr, canvasWidth - priceAxisWidth - tw3 - 7, tpY - 13);
        ctx.textBaseline = 'alphabetic';
      }
    }
  }

  ctx.restore();
}

// ── ICT Open Levels (DOL / WOL / Asia Range) ─────────────────────────────────

export interface OpenLevel {
  price: number;
  label: string;       // e.g. "DOL", "WOL", "Asia High", "Asia Low"
  color: string;
}

/**
 * Derive ICT open levels from bar history.
 *  - DOL  = open of the most recent daily bar (UTC midnight reset)
 *  - WOL  = open of the most recent weekly bar (Monday UTC)
 *  - Asia High/Low = highest high / lowest low of bars between 00:00–08:00 UTC today
 */
export function computeOpenLevels(bars: Bar[]): OpenLevel[] {
  if (!bars.length) return [];

  const todayMidnight = new Date();
  todayMidnight.setUTCHours(0, 0, 0, 0);
  const midnightMs = todayMidnight.getTime();

  // Monday this week UTC
  const dayOfWeek = todayMidnight.getUTCDay(); // 0=Sun, 1=Mon, …
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const mondayMs = midnightMs - daysSinceMonday * 86_400_000;

  // Asia session: 00:00–08:00 UTC today
  const asiaStart = midnightMs;
  const asiaEnd   = midnightMs + 8 * 3_600_000;

  let dolPrice: number | null = null;
  let wolPrice: number | null = null;
  let asiaHigh: number | null = null;
  let asiaLow:  number | null = null;

  for (const bar of bars) {
    const ts = bar.t * 1000; // bar.t is Unix seconds

    // DOL — first bar on or after today's midnight
    if (dolPrice === null && ts >= midnightMs) {
      dolPrice = bar.o;
    }
    // WOL — first bar on or after Monday
    if (wolPrice === null && ts >= mondayMs) {
      wolPrice = bar.o;
    }
    // Asia range — bars wholly within 00:00–08:00 UTC today
    if (ts >= asiaStart && ts < asiaEnd) {
      asiaHigh = asiaHigh === null ? bar.h : Math.max(asiaHigh, bar.h);
      asiaLow  = asiaLow  === null ? bar.l : Math.min(asiaLow,  bar.l);
    }
  }

  const levels: OpenLevel[] = [];
  if (dolPrice !== null) levels.push({ price: dolPrice, label: 'DOL',       color: '#2979FF' });
  if (wolPrice !== null && wolPrice !== dolPrice)
                          levels.push({ price: wolPrice, label: 'WOL',       color: '#AB47BC' });
  if (asiaHigh !== null) levels.push({ price: asiaHigh, label: 'Asia High', color: '#FF8F00' });
  if (asiaLow  !== null) levels.push({ price: asiaLow,  label: 'Asia Low',  color: '#FF8F00' });

  return levels;
}

/**
 * Draw DOL / WOL / Asia Range dashed lines on the main chart pane.
 */
export function drawOpenLevels(
  ctx: CanvasRenderingContext2D,
  levels: OpenLevel[],
  layout: ChartLayout,
  viewport: Viewport,
  priceScale: PriceScale,
): void {
  if (!levels.length) return;

  ctx.save();
  ctx.font = "10px 'IBM Plex Mono', monospace";

  const { mainTop, mainHeight, chartLeft, chartWidth, canvasWidth, priceAxisWidth } = layout;
  const { priceMin, priceMax } = viewport;

  const inView = (y: number) => y >= mainTop && y <= mainTop + mainHeight;

  for (const lvl of levels) {
    const y = priceToY(lvl.price, priceMin, priceMax, mainTop, mainHeight, priceScale);
    if (!inView(y)) continue;

    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = lvl.color;
    ctx.lineWidth   = 1;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(chartLeft + chartWidth, y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label pill on the right axis edge
    const tw    = ctx.measureText(lvl.label).width;
    const pillW = tw + 8;
    const pillH = 13;
    ctx.globalAlpha = 0.75;
    ctx.fillStyle   = lvl.color;
    ctx.fillRect(canvasWidth - priceAxisWidth - pillW - 2, y - pillH, pillW, pillH);
    ctx.globalAlpha = 1;
    ctx.fillStyle   = '#FFFFFF';
    ctx.textAlign   = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(lvl.label, canvasWidth - priceAxisWidth - pillW - 2 + 4, y - pillH);
    ctx.textBaseline = 'alphabetic';
  }

  ctx.restore();
}

// ── Indicator Price-Axis Labels ───────────────────────────────────────────────

export interface IndicatorAxisLabel {
  price: number;
  color: string;
  /** Short text shown inside the label — e.g. "EMA20", "BB+", "ST" */
  shortLabel: string;
}

/**
 * Draw small coloured price-axis labels for the last value of each active
 * overlay indicator. Labels stack automatically when they overlap.
 */
export function drawIndicatorAxisLabels(
  ctx: CanvasRenderingContext2D,
  labels: IndicatorAxisLabel[],
  layout: ChartLayout,
  viewport: Viewport,
  priceScale: PriceScale,
): void {
  if (!labels.length) return;

  const { mainTop, mainHeight, canvasWidth, priceAxisWidth } = layout;
  const { priceMin, priceMax } = viewport;

  const inView = (y: number) => y >= mainTop && y <= mainTop + mainHeight;

  const LABEL_H   = 12;
  const LABEL_PAD = 3;
  const axisX     = canvasWidth - priceAxisWidth + 1;

  ctx.save();
  ctx.font = "9px 'IBM Plex Mono', monospace";

  // Compute raw y positions
  const positioned: { y: number; label: IndicatorAxisLabel }[] = [];
  for (const lbl of labels) {
    const y = priceToY(lbl.price, priceMin, priceMax, mainTop, mainHeight, priceScale);
    if (!inView(y)) continue;
    positioned.push({ y, label: lbl });
  }

  // Sort by y so stacking resolves top-to-bottom
  positioned.sort((a, b) => a.y - b.y);

  // Greedy anti-overlap: push labels down if they collide with previous
  for (let i = 1; i < positioned.length; i++) {
    if (positioned[i].y - positioned[i - 1].y < LABEL_H) {
      positioned[i].y = positioned[i - 1].y + LABEL_H;
    }
  }

  for (const { y, label } of positioned) {
    if (!inView(y)) continue;

    const tw    = ctx.measureText(label.shortLabel).width;
    const pillW = tw + LABEL_PAD * 2;
    const pillY = y - LABEL_H / 2;

    ctx.globalAlpha = 0.85;
    ctx.fillStyle   = label.color;
    ctx.fillRect(axisX, pillY, pillW, LABEL_H);

    ctx.globalAlpha = 1;
    ctx.fillStyle   = '#FFFFFF';
    ctx.textAlign   = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label.shortLabel, axisX + LABEL_PAD, y);
    ctx.textBaseline = 'alphabetic';
  }

  ctx.restore();
}
