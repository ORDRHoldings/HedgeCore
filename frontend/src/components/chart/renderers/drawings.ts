/**
 * drawings.ts — Professional drawing tools with TradingView parity + innovations.
 *
 * Features: trendline/horizontal/fibonacci/rectangle with full style controls,
 * line styles (solid/dashed/dotted), arrow endpoints, text labels with styling,
 * statistics display, mid-point, price axis labels, extend left/right,
 * 15° shift-snap, magnetic OHLC snap, hit testing, drag-to-move,
 * breakout detection, parallel channel creation, distance-to-price,
 * lock drawing, and backward-compatible persistence.
 */

import type { Bar } from "../indicators/types";
import type { ChartLayout, Viewport } from "../core/data";
import type { PriceScale } from "../core/data";
import { priceToY, indexToX, yToPrice, xToIndex, formatPrice } from "../core/data";
import { THEME } from "../core/theme";

// ══════════════════════════════════════════════════════
//  Types
// ══════════════════════════════════════════════════════

export type DrawingType = "trendline" | "horizontal" | "fibonacci" | "rectangle";
export type LineStyle = "solid" | "dashed" | "dotted";

export interface DrawingStats {
  showPrice: boolean;
  showPercent: boolean;
  showPips: boolean;
  showBars: boolean;
  showDateRange: boolean;
  showAngle: boolean;
  alwaysShow: boolean;
  position: "top" | "bottom" | "left" | "right";
}

export interface Drawing {
  id: string;
  type: DrawingType;
  points: { index: number; price: number }[];
  // Style
  color: string;
  lineWidth: number;
  lineStyle: LineStyle;
  opacity: number;
  // Extensions
  extendLeft: boolean;
  extendRight: boolean;
  // Arrows
  arrowLeft: boolean;
  arrowRight: boolean;
  // Text / Label
  label: string;
  labelFontSize: number;
  labelBold: boolean;
  labelItalic: boolean;
  labelColor: string;
  labelAlign: "left" | "center" | "right";
  // Display
  showAngle: boolean;
  showMidPoint: boolean;
  showPriceLabels: boolean;
  // Statistics
  stats: DrawingStats;
  // Behavior
  locked: boolean;
}

// ══════════════════════════════════════════════════════
//  Constants
// ══════════════════════════════════════════════════════

const DRAWING_COLORS: Record<DrawingType, string> = {
  trendline: THEME.drawTrendline,
  horizontal: THEME.drawHorizontal,
  fibonacci: THEME.drawFibonacci,
  rectangle: THEME.drawRectangle,
};

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const HIT_THRESHOLD = 8;
const HANDLE_RADIUS = 6;
const SNAP_INCREMENT_DEG = 15;
const MAGNETIC_THRESHOLD_PX = 12;

export const DEFAULT_STATS: DrawingStats = {
  showPrice: false,
  showPercent: false,
  showPips: true,
  showBars: false,
  showDateRange: false,
  showAngle: false,
  alwaysShow: false,
  position: "top",
};

// ══════════════════════════════════════════════════════
//  Factory
// ══════════════════════════════════════════════════════

export function getDefaultColor(type: DrawingType): string {
  return DRAWING_COLORS[type];
}

export function createDrawing(
  type: DrawingType,
  points: { index: number; price: number }[],
  overrides?: Partial<Drawing>,
): Drawing {
  return {
    id: `d_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    points,
    color: getDefaultColor(type),
    lineWidth: 1.5,
    lineStyle: "solid",
    opacity: 1,
    extendLeft: false,
    extendRight: false,
    arrowLeft: false,
    arrowRight: false,
    label: "",
    labelFontSize: 11,
    labelBold: false,
    labelItalic: false,
    labelColor: "",
    labelAlign: "right",
    showAngle: true,
    showMidPoint: false,
    showPriceLabels: false,
    stats: { ...DEFAULT_STATS },
    locked: false,
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════
//  Geometry helpers (exported for testing)
// ══════════════════════════════════════════════════════

export function pointToSegmentDist(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function pointToLineDist(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(px - x1, py - y1);
  return Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / len;
}

export function computeAngle(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = -(y2 - y1); // Canvas Y is inverted
  return Math.atan2(dy, dx) * (180 / Math.PI);
}

export function getPipSize(pair: string): number {
  return pair.toUpperCase().includes("JPY") ? 0.01 : 0.0001;
}

export function getLineDash(style: LineStyle): number[] {
  switch (style) {
    case "dashed": return [6, 4];
    case "dotted": return [2, 2];
    default: return [];
  }
}

// ══════════════════════════════════════════════════════
//  Shift snap (angle constraint to 15° increments)
// ══════════════════════════════════════════════════════

export function shiftSnapPoint(
  anchorX: number, anchorY: number,
  cursorX: number, cursorY: number,
): { x: number; y: number } {
  const dx = cursorX - anchorX;
  const dy = cursorY - anchorY;
  const angle = Math.atan2(dy, dx);
  const snapRad = SNAP_INCREMENT_DEG * (Math.PI / 180);
  const snappedAngle = Math.round(angle / snapRad) * snapRad;
  const dist = Math.hypot(dx, dy);
  return {
    x: anchorX + dist * Math.cos(snappedAngle),
    y: anchorY + dist * Math.sin(snappedAngle),
  };
}

// ══════════════════════════════════════════════════════
//  Magnetic snap to OHLC
// ══════════════════════════════════════════════════════

export interface MagneticSnapResult {
  index: number;
  price: number;
  snapped: boolean;
  snapType: "open" | "high" | "low" | "close" | "none";
}

export function magneticSnap(
  cursorX: number,
  cursorY: number,
  bars: Bar[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): MagneticSnapResult {
  const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  const rawIndex = xToIndex(cursorX, startIndex, endIndex, chartLeft, chartWidth);
  const barIndex = Math.round(rawIndex);
  if (barIndex < 0 || barIndex >= bars.length) {
    return {
      index: Math.round(rawIndex),
      price: yToPrice(cursorY, priceMin, priceMax, mainTop, mainHeight, scale),
      snapped: false,
      snapType: "none",
    };
  }

  const bar = bars[barIndex];
  const ohlc: { type: "open" | "high" | "low" | "close"; price: number }[] = [
    { type: "open", price: bar.o },
    { type: "high", price: bar.h },
    { type: "low", price: bar.l },
    { type: "close", price: bar.c },
  ];

  let bestDist = Infinity;
  let bestSnap = ohlc[0];
  for (const v of ohlc) {
    const py = priceToY(v.price, priceMin, priceMax, mainTop, mainHeight, scale);
    const dist = Math.abs(cursorY - py);
    if (dist < bestDist) {
      bestDist = dist;
      bestSnap = v;
    }
  }

  if (bestDist <= MAGNETIC_THRESHOLD_PX) {
    return { index: barIndex, price: bestSnap.price, snapped: true, snapType: bestSnap.type };
  }

  return {
    index: barIndex,
    price: yToPrice(cursorY, priceMin, priceMax, mainTop, mainHeight, scale),
    snapped: false,
    snapType: "none",
  };
}

// ══════════════════════════════════════════════════════
//  Stats computation
// ══════════════════════════════════════════════════════

export interface ComputedStats {
  price: string;
  percent: string;
  pips: string;
  bars: string;
  dateRange: string;
  angle: string;
}

export function computeDrawingStats(
  d: Drawing,
  bars: Bar[],
  pair: string,
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): ComputedStats {
  const empty = { price: "—", percent: "—", pips: "—", bars: "—", dateRange: "—", angle: "—" };
  if (d.points.length < 2) return empty;

  const p0 = d.points[0];
  const p1 = d.points[1];
  const priceDiff = p1.price - p0.price;
  const percentChange = p0.price !== 0 ? (priceDiff / p0.price) * 100 : 0;
  const pipSize = getPipSize(pair);
  const pips = priceDiff / pipSize;
  const barCount = Math.abs(p1.index - p0.index);

  let dateRange = "—";
  const i0 = Math.min(bars.length - 1, Math.max(0, p0.index));
  const i1 = Math.min(bars.length - 1, Math.max(0, p1.index));
  if (bars[i0] && bars[i1]) {
    dateRange = formatDateRange(bars[i0].t, bars[i1].t);
  }

  const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;
  const x1 = indexToX(p0.index, startIndex, endIndex, chartLeft, chartWidth);
  const y1 = priceToY(p0.price, priceMin, priceMax, mainTop, mainHeight, scale);
  const x2 = indexToX(p1.index, startIndex, endIndex, chartLeft, chartWidth);
  const y2 = priceToY(p1.price, priceMin, priceMax, mainTop, mainHeight, scale);
  const angle = computeAngle(x1, y1, x2, y2);

  return {
    price: `${priceDiff >= 0 ? "+" : ""}${formatPrice(Math.abs(priceDiff), pair)}`,
    percent: `${percentChange >= 0 ? "+" : ""}${percentChange.toFixed(2)}%`,
    pips: `${pips >= 0 ? "+" : ""}${pips.toFixed(1)} pips`,
    bars: `${barCount} bars`,
    dateRange,
    angle: `${angle.toFixed(1)}°`,
  };
}

function formatDateRange(ts1: number, ts2: number): string {
  const diffSec = Math.abs(ts2 - ts1);
  if (diffSec < 60) return `${Math.round(diffSec)}s`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m`;
  if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    const mins = Math.round((diffSec % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  const days = Math.floor(diffSec / 86400);
  const hours = Math.round((diffSec % 86400) / 3600);
  if (hours === 0) return `${days}d`;
  return `${days}d ${hours}h`;
}

// ══════════════════════════════════════════════════════
//  Parallel line creation
// ══════════════════════════════════════════════════════

export function createParallelLine(d: Drawing, offsetPrice: number): Drawing {
  return createDrawing(
    "trendline",
    d.points.map(p => ({ index: p.index, price: p.price + offsetPrice })),
    {
      color: d.color,
      lineWidth: d.lineWidth,
      lineStyle: d.lineStyle,
      opacity: d.opacity,
      extendLeft: d.extendLeft,
      extendRight: d.extendRight,
      label: d.label ? `${d.label} \u2225` : "",
    },
  );
}

// ══════════════════════════════════════════════════════
//  Breakout detection
// ══════════════════════════════════════════════════════

export interface BreakoutPoint {
  barIndex: number;
  direction: "up" | "down";
  price: number;
}

export function detectBreakouts(
  d: Drawing,
  bars: Bar[],
  viewport: Viewport,
): BreakoutPoint[] {
  if (d.type !== "trendline" || d.points.length < 2) return [];

  const p0 = d.points[0];
  const p1 = d.points[1];
  const slope = (p1.price - p0.price) / (p1.index - p0.index || 1);
  const breakouts: BreakoutPoint[] = [];
  const start = Math.max(1, Math.floor(viewport.startIndex));
  const end = Math.min(bars.length - 1, Math.ceil(viewport.endIndex));

  for (let i = start; i <= end; i++) {
    const linePrice = p0.price + slope * (i - p0.index);
    const prevLinePrice = p0.price + slope * (i - 1 - p0.index);
    const prevClose = bars[i - 1].c;
    const currClose = bars[i].c;

    if (prevClose <= prevLinePrice && currClose > linePrice) {
      breakouts.push({ barIndex: i, direction: "up", price: linePrice });
    }
    if (prevClose >= prevLinePrice && currClose < linePrice) {
      breakouts.push({ barIndex: i, direction: "down", price: linePrice });
    }
  }
  return breakouts;
}

// ══════════════════════════════════════════════════════
//  Hit Testing
// ══════════════════════════════════════════════════════

export interface HitTestResult {
  drawingId: string;
  distance: number;
  part: "body" | "p0" | "p1";
}

export function hitTestDrawings(
  mx: number, my: number,
  drawings: Drawing[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
): HitTestResult | null {
  const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;
  let best: HitTestResult | null = null;

  for (const d of drawings) {
    if (d.type === "trendline") {
      if (d.points.length < 2) continue;
      const x1 = indexToX(d.points[0].index, startIndex, endIndex, chartLeft, chartWidth);
      const y1 = priceToY(d.points[0].price, priceMin, priceMax, mainTop, mainHeight, scale);
      const x2 = indexToX(d.points[1].index, startIndex, endIndex, chartLeft, chartWidth);
      const y2 = priceToY(d.points[1].price, priceMin, priceMax, mainTop, mainHeight, scale);

      if (Math.hypot(mx - x1, my - y1) <= HANDLE_RADIUS) {
        const dist = Math.hypot(mx - x1, my - y1);
        if (!best || dist < best.distance) best = { drawingId: d.id, distance: dist, part: "p0" };
        continue;
      }
      if (Math.hypot(mx - x2, my - y2) <= HANDLE_RADIUS) {
        const dist = Math.hypot(mx - x2, my - y2);
        if (!best || dist < best.distance) best = { drawingId: d.id, distance: dist, part: "p1" };
        continue;
      }

      const dist = (d.extendLeft || d.extendRight)
        ? pointToLineDist(mx, my, x1, y1, x2, y2)
        : pointToSegmentDist(mx, my, x1, y1, x2, y2);
      if (dist <= HIT_THRESHOLD && (!best || dist < best.distance)) {
        best = { drawingId: d.id, distance: dist, part: "body" };
      }
    } else if (d.type === "horizontal") {
      if (d.points.length < 1) continue;
      const y = priceToY(d.points[0].price, priceMin, priceMax, mainTop, mainHeight, scale);
      const dist = Math.abs(my - y);
      if (dist <= HIT_THRESHOLD && (!best || dist < best.distance)) {
        best = { drawingId: d.id, distance: dist, part: "body" };
      }
    } else if (d.type === "rectangle") {
      if (d.points.length < 2) continue;
      const x1 = indexToX(d.points[0].index, startIndex, endIndex, chartLeft, chartWidth);
      const y1 = priceToY(d.points[0].price, priceMin, priceMax, mainTop, mainHeight, scale);
      const x2 = indexToX(d.points[1].index, startIndex, endIndex, chartLeft, chartWidth);
      const y2 = priceToY(d.points[1].price, priceMin, priceMax, mainTop, mainHeight, scale);
      const left = Math.min(x1, x2), right = Math.max(x1, x2);
      const top = Math.min(y1, y2), bot = Math.max(y1, y2);

      if (mx >= left - HIT_THRESHOLD && mx <= right + HIT_THRESHOLD &&
          my >= top - HIT_THRESHOLD && my <= bot + HIT_THRESHOLD) {
        const minEdge = Math.min(
          Math.abs(mx - left), Math.abs(mx - right),
          Math.abs(my - top), Math.abs(my - bot),
        );
        if (minEdge <= HIT_THRESHOLD && (!best || minEdge < best.distance)) {
          best = { drawingId: d.id, distance: minEdge, part: "body" };
        }
      }
    } else if (d.type === "fibonacci") {
      if (d.points.length < 2) continue;
      const x1 = indexToX(d.points[0].index, startIndex, endIndex, chartLeft, chartWidth);
      const y1 = priceToY(d.points[0].price, priceMin, priceMax, mainTop, mainHeight, scale);
      const x2 = indexToX(d.points[1].index, startIndex, endIndex, chartLeft, chartWidth);
      const y2 = priceToY(d.points[1].price, priceMin, priceMax, mainTop, mainHeight, scale);
      const dist = pointToSegmentDist(mx, my, x1, y1, x2, y2);
      if (dist <= HIT_THRESHOLD && (!best || dist < best.distance)) {
        best = { drawingId: d.id, distance: dist, part: "body" };
      }
    }
  }
  return best;
}

// ══════════════════════════════════════════════════════
//  Arrow helper
// ══════════════════════════════════════════════════════

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  tipX: number, tipY: number,
  fromX: number, fromY: number,
  size: number, color: string,
): void {
  const angle = Math.atan2(tipY - fromY, tipX - fromX);
  ctx.save();
  ctx.translate(tipX, tipY);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size * 1.6, -size * 0.6);
  ctx.lineTo(-size * 1.6, size * 0.6);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

// ══════════════════════════════════════════════════════
//  Stats box renderer
// ══════════════════════════════════════════════════════

function drawStatsBox(
  ctx: CanvasRenderingContext2D,
  stats: ComputedStats,
  drawingStats: DrawingStats,
  midX: number, midY: number,
  color: string,
): void {
  const lines: string[] = [];
  if (drawingStats.showPrice) lines.push(stats.price);
  if (drawingStats.showPercent) lines.push(stats.percent);
  if (drawingStats.showPips) lines.push(stats.pips);
  if (drawingStats.showBars) lines.push(stats.bars);
  if (drawingStats.showDateRange) lines.push(stats.dateRange);
  if (drawingStats.showAngle) lines.push(stats.angle);
  if (lines.length === 0) return;

  ctx.font = "9px 'IBM Plex Mono', monospace";
  const lineHeight = 13;
  const maxWidth = Math.max(...lines.map(l => ctx.measureText(l).width));
  const pad = 5;
  const boxW = maxWidth + pad * 2;
  const boxH = lines.length * lineHeight + pad * 2 - 2;

  // Position based on stats.position
  let bx = midX, by = midY;
  switch (drawingStats.position) {
    case "top": bx = midX - boxW / 2; by = midY - boxH - 12; break;
    case "bottom": bx = midX - boxW / 2; by = midY + 12; break;
    case "left": bx = midX - boxW - 12; by = midY - boxH / 2; break;
    case "right": bx = midX + 12; by = midY - boxH / 2; break;
  }

  ctx.fillStyle = "rgba(19,23,34,0.9)";
  ctx.beginPath();
  ctx.roundRect(bx, by, boxW, boxH, 3);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.5;
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], bx + pad, by + pad + i * lineHeight);
  }
}

// ══════════════════════════════════════════════════════
//  Drawing Renderers
// ══════════════════════════════════════════════════════

export function drawDrawings(
  ctx: CanvasRenderingContext2D,
  drawings: Drawing[],
  layout: ChartLayout,
  viewport: Viewport,
  pair: string,
  scale: PriceScale = "linear",
  selectedId?: string | null,
  hoveredId?: string | null,
  bars?: Bar[],
): void {
  for (const d of drawings) {
    const isSelected = d.id === selectedId;
    const isHovered = d.id === hoveredId;
    switch (d.type) {
      case "trendline": drawTrendlineDrawing(ctx, d, layout, viewport, pair, scale, isSelected, isHovered, bars); break;
      case "horizontal": drawHorizontalDrawing(ctx, d, layout, viewport, pair, scale, isSelected, isHovered); break;
      case "fibonacci": drawFibonacciDrawing(ctx, d, layout, viewport, pair, scale, isSelected, isHovered); break;
      case "rectangle": drawRectangleDrawing(ctx, d, layout, viewport, pair, scale, isSelected, isHovered); break;
    }
  }
}

function drawTrendlineDrawing(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  layout: ChartLayout,
  viewport: Viewport,
  pair: string,
  scale: PriceScale,
  isSelected: boolean,
  isHovered: boolean,
  bars?: Bar[],
): void {
  if (d.points.length < 2) return;
  const { mainTop, mainHeight, chartLeft, chartWidth, priceAxisWidth, canvasWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;
  const x1 = indexToX(d.points[0].index, startIndex, endIndex, chartLeft, chartWidth);
  const y1 = priceToY(d.points[0].price, priceMin, priceMax, mainTop, mainHeight, scale);
  const x2 = indexToX(d.points[1].index, startIndex, endIndex, chartLeft, chartWidth);
  const y2 = priceToY(d.points[1].price, priceMin, priceMax, mainTop, mainHeight, scale);
  const rightEdge = canvasWidth - priceAxisWidth;
  const slope = (y2 - y1) / (x2 - x1 || 1);

  ctx.save();
  ctx.globalAlpha = d.opacity;

  // ── Line style ──
  ctx.setLineDash(getLineDash(d.lineStyle));
  ctx.strokeStyle = d.color;
  ctx.lineWidth = isSelected ? d.lineWidth + 0.5 : d.lineWidth;

  // ── Main line segment + extensions ──
  ctx.beginPath();
  let drawStartX = x1, drawStartY = y1;
  let drawEndX = x2, drawEndY = y2;

  if (d.extendLeft) {
    drawStartX = chartLeft;
    drawStartY = y1 + slope * (chartLeft - x1);
  }
  if (d.extendRight) {
    drawEndX = rightEdge;
    drawEndY = y2 + slope * (rightEdge - x2);
  }

  ctx.moveTo(drawStartX, drawStartY);
  if (d.extendLeft) ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  if (d.extendRight) ctx.lineTo(drawEndX, drawEndY);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── Arrow endpoints ──
  if (d.arrowLeft) {
    drawArrowHead(ctx, drawStartX, drawStartY, x2, y2, d.lineWidth * 4 + 2, d.color);
  }
  if (d.arrowRight) {
    drawArrowHead(ctx, drawEndX, drawEndY, x1, y1, d.lineWidth * 4 + 2, d.color);
  }

  // ── Mid-point ──
  if (d.showMidPoint) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    ctx.beginPath();
    ctx.moveTo(mx - 4, my);
    ctx.lineTo(mx, my - 4);
    ctx.lineTo(mx + 4, my);
    ctx.lineTo(mx, my + 4);
    ctx.closePath();
    ctx.fillStyle = d.color;
    ctx.fill();
  }

  // ── Breakout markers ──
  if (bars && bars.length > 0) {
    const breakouts = detectBreakouts(d, bars, viewport);
    for (const bp of breakouts) {
      const bx = indexToX(bp.barIndex, startIndex, endIndex, chartLeft, chartWidth);
      const by = priceToY(bp.price, priceMin, priceMax, mainTop, mainHeight, scale);
      ctx.beginPath();
      ctx.arc(bx, by, 4, 0, Math.PI * 2);
      ctx.fillStyle = bp.direction === "up" ? THEME.bullBody : THEME.bearBody;
      ctx.globalAlpha = d.opacity * 0.7;
      ctx.fill();
      ctx.globalAlpha = d.opacity;
    }
  }

  // ── Angle badge ──
  if (d.showAngle) {
    const angle = computeAngle(x1, y1, x2, y2);
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const angleText = `${angle.toFixed(1)}\u00B0`;

    ctx.font = "bold 9px 'IBM Plex Mono', monospace";
    const tw = ctx.measureText(angleText).width;
    const pad = 4;

    ctx.fillStyle = "rgba(19,23,34,0.85)";
    ctx.beginPath();
    ctx.roundRect(midX - tw / 2 - pad, midY - 18, tw + pad * 2, 16, 3);
    ctx.fill();
    ctx.strokeStyle = d.color;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.fillStyle = d.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(angleText, midX, midY - 10);
  }

  // ── Statistics box ──
  const anyStatEnabled = d.stats.showPrice || d.stats.showPercent || d.stats.showPips ||
    d.stats.showBars || d.stats.showDateRange || d.stats.showAngle;
  if (anyStatEnabled && (d.stats.alwaysShow || isSelected) && bars && bars.length > 0) {
    const computed = computeDrawingStats(d, bars, pair, layout, viewport, scale);
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    drawStatsBox(ctx, computed, d.stats, midX, midY, d.color);
  }

  // ── Distance to current price (innovation) ──
  if ((isSelected || d.stats.alwaysShow) && bars && bars.length > 0) {
    const lastBar = bars[bars.length - 1];
    const priceSlope = (d.points[1].price - d.points[0].price) / (d.points[1].index - d.points[0].index || 1);
    const lineAtLast = d.points[0].price + priceSlope * (bars.length - 1 - d.points[0].index);
    const diff = lastBar.c - lineAtLast;
    const pipSize = getPipSize(pair);
    const diffPips = diff / pipSize;
    const distLabel = `${diffPips >= 0 ? "\u2191" : "\u2193"}${Math.abs(diffPips).toFixed(1)} pips`;

    const labelX = rightEdge - 6;
    const labelY = priceToY(lineAtLast, priceMin, priceMax, mainTop, mainHeight, scale);
    if (labelY > mainTop && labelY < mainTop + mainHeight) {
      ctx.font = "bold 8px 'IBM Plex Mono', monospace";
      const tw = ctx.measureText(distLabel).width;
      ctx.fillStyle = "rgba(19,23,34,0.85)";
      ctx.fillRect(labelX - tw - 6, labelY - 8, tw + 8, 16);
      ctx.fillStyle = diffPips >= 0 ? THEME.bullBody : THEME.bearBody;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(distLabel, labelX - 2, labelY);
    }
  }

  // ── Label text with styling ──
  if (d.label) {
    const effColor = d.labelColor || d.color;
    const weight = d.labelBold ? "bold" : "normal";
    const style = d.labelItalic ? "italic" : "normal";
    ctx.font = `${style} ${weight} ${d.labelFontSize}px 'IBM Plex Mono', monospace`;
    const tw = ctx.measureText(d.label).width;

    let labelX: number, textAlign: CanvasTextAlign;
    if (d.labelAlign === "left") {
      labelX = x1 - tw - 8;
      textAlign = "right";
    } else if (d.labelAlign === "center") {
      labelX = (x1 + x2) / 2;
      textAlign = "center";
    } else {
      labelX = x2 + 8;
      textAlign = "left";
    }
    const labelY = d.labelAlign === "center" ? (y1 + y2) / 2 + d.labelFontSize + 4 : y2 - 4;

    // Background
    const bgX = textAlign === "center" ? labelX - tw / 2 - 3 : textAlign === "left" ? labelX - 3 : labelX - tw - 3;
    ctx.fillStyle = "rgba(19,23,34,0.85)";
    ctx.beginPath();
    ctx.roundRect(bgX, labelY - d.labelFontSize + 1, tw + 6, d.labelFontSize + 4, 2);
    ctx.fill();

    ctx.fillStyle = effColor;
    ctx.textAlign = textAlign;
    ctx.textBaseline = "middle";
    ctx.fillText(d.label, labelX, labelY - d.labelFontSize / 2 + 3);
  }

  // ── Selection handles ──
  if (isSelected || isHovered) {
    const handleR = isSelected ? 5 : 3.5;
    for (const [px, py] of [[x1, y1], [x2, y2]]) {
      ctx.beginPath();
      ctx.arc(px, py, handleR, 0, Math.PI * 2);
      ctx.fillStyle = THEME.canvasBg;
      ctx.fill();
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fillStyle = d.color;
      ctx.fill();
    }
    // Mid-point handle when selected
    if (isSelected) {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      ctx.beginPath();
      ctx.arc(mx, my, 3, 0, Math.PI * 2);
      ctx.fillStyle = THEME.canvasBg;
      ctx.fill();
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // Lock indicator
    if (d.locked) {
      ctx.font = "bold 8px 'IBM Plex Mono', monospace";
      ctx.fillStyle = THEME.axisText;
      ctx.textAlign = "left";
      ctx.fillText("\uD83D\uDD12", x2 + 8, y2 + 12);
    }
  }

  ctx.restore();
}

/** Rubber-band preview (drawing in progress) */
export function drawRubberBand(
  ctx: CanvasRenderingContext2D,
  firstPoint: { index: number; price: number },
  cursorX: number,
  cursorY: number,
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
  drawingType: DrawingType = "trendline",
  color?: string,
  snapIndicator?: MagneticSnapResult | null,
): void {
  const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;
  const x1 = indexToX(firstPoint.index, startIndex, endIndex, chartLeft, chartWidth);
  const y1 = priceToY(firstPoint.price, priceMin, priceMax, mainTop, mainHeight, scale);
  const lineColor = color || getDefaultColor(drawingType);

  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);

  if (drawingType === "trendline" || drawingType === "fibonacci") {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(cursorX, cursorY);
    ctx.stroke();

    // Real-time info
    const angle = computeAngle(x1, y1, cursorX, cursorY);
    const midX = (x1 + cursorX) / 2;
    const midY = (y1 + cursorY) / 2;
    ctx.setLineDash([]);
    ctx.font = "bold 9px 'IBM Plex Mono', monospace";

    // Info badge background
    const angleText = `${angle.toFixed(1)}\u00B0`;
    const cursorPrice = yToPrice(cursorY, priceMin, priceMax, mainTop, mainHeight, scale);
    const priceDiff = cursorPrice - firstPoint.price;
    const pips = Math.abs(priceDiff * 10000).toFixed(1);
    const pipsText = `${pips} pips`;
    const barSpan = Math.abs(Math.round(xToIndex(cursorX, startIndex, endIndex, chartLeft, chartWidth)) - firstPoint.index);
    const barsText = `${barSpan} bars`;

    const lines = [angleText, pipsText, barsText];
    const maxTw = Math.max(...lines.map(l => ctx.measureText(l).width));
    const boxW = maxTw + 12;
    const boxH = lines.length * 12 + 8;

    ctx.fillStyle = "rgba(19,23,34,0.9)";
    ctx.beginPath();
    ctx.roundRect(midX - boxW / 2, midY - boxH - 4, boxW, boxH, 3);
    ctx.fill();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.fillStyle = lineColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], midX, midY - boxH - 4 + 4 + i * 12);
    }
  } else if (drawingType === "rectangle") {
    const w = cursorX - x1;
    const h = cursorY - y1;
    ctx.strokeRect(x1, y1, w, h);
    ctx.fillStyle = (lineColor).replace(")", ",0.06)").replace("rgb", "rgba");
    ctx.fillRect(x1, y1, w, h);
  } else if (drawingType === "horizontal") {
    ctx.beginPath();
    ctx.moveTo(layout.chartLeft, cursorY);
    ctx.lineTo(layout.canvasWidth - layout.priceAxisWidth, cursorY);
    ctx.stroke();
  }

  // First point handle
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.arc(x1, y1, 4, 0, Math.PI * 2);
  ctx.fillStyle = THEME.canvasBg;
  ctx.fill();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x1, y1, 1.5, 0, Math.PI * 2);
  ctx.fillStyle = lineColor;
  ctx.fill();

  // Magnetic snap indicator
  if (snapIndicator && snapIndicator.snapped) {
    const sx = indexToX(snapIndicator.index, startIndex, endIndex, chartLeft, chartWidth);
    const sy = priceToY(snapIndicator.price, priceMin, priceMax, mainTop, mainHeight, scale);
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(sx, sy, 6, 0, Math.PI * 2);
    ctx.strokeStyle = "#00E5FF";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = "bold 8px 'IBM Plex Mono', monospace";
    ctx.fillStyle = "#00E5FF";
    ctx.textAlign = "left";
    ctx.fillText(snapIndicator.snapType.toUpperCase(), sx + 8, sy + 3);
  }

  ctx.restore();
}

// ── Price axis labels (drawn AFTER axes) ────────────

export function drawDrawingPriceLabels(
  ctx: CanvasRenderingContext2D,
  drawings: Drawing[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale,
  selectedId: string | null,
): void {
  const { mainTop, mainHeight, priceAxisWidth, canvasWidth } = layout;
  const { priceMin, priceMax } = viewport;
  const axisLeft = canvasWidth - priceAxisWidth;

  for (const d of drawings) {
    if (!d.showPriceLabels && d.id !== selectedId) continue;
    if (!d.showPriceLabels) continue; // Only draw if explicitly enabled

    const prices = d.type === "horizontal" && d.points.length >= 1
      ? [d.points[0].price]
      : d.points.map(p => p.price);

    for (const price of prices) {
      if (price < priceMin || price > priceMax) continue;
      const y = priceToY(price, priceMin, priceMax, mainTop, mainHeight, scale);

      ctx.save();
      ctx.font = "9px 'IBM Plex Mono', monospace";
      const text = price.toFixed(5);
      const tw = ctx.measureText(text).width;

      // Colored background strip
      ctx.fillStyle = d.color;
      ctx.globalAlpha = 0.15;
      ctx.fillRect(axisLeft + 1, y - 8, priceAxisWidth - 2, 16);
      ctx.globalAlpha = 1;

      // Left accent bar
      ctx.fillStyle = d.color;
      ctx.fillRect(axisLeft, y - 8, 2, 16);

      // Price text
      ctx.fillStyle = d.color;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(text, axisLeft + 6, y);
      ctx.restore();
    }
  }
}

// ── Horizontal drawing ────────────────────────────────

function drawHorizontalDrawing(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  layout: ChartLayout,
  viewport: Viewport,
  pair: string,
  scale: PriceScale,
  isSelected: boolean,
  isHovered: boolean,
): void {
  if (d.points.length < 1) return;
  const { mainTop, mainHeight, priceAxisWidth, canvasWidth } = layout;
  const { priceMin, priceMax } = viewport;
  const y = priceToY(d.points[0].price, priceMin, priceMax, mainTop, mainHeight, scale);

  ctx.save();
  ctx.globalAlpha = d.opacity;
  ctx.strokeStyle = d.color;
  ctx.lineWidth = isSelected ? d.lineWidth + 0.5 : d.lineWidth;
  ctx.setLineDash(getLineDash(d.lineStyle || "dashed"));
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(canvasWidth - priceAxisWidth, y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Label
  const effColor = d.labelColor || d.color;
  const weight = d.labelBold ? "bold" : "normal";
  const style = d.labelItalic ? "italic" : "normal";
  ctx.font = `${style} ${weight} ${d.labelFontSize || 10}px 'IBM Plex Mono', monospace`;
  ctx.fillStyle = effColor;
  ctx.textAlign = "right";
  const priceText = d.label || formatPrice(d.points[0].price, pair);
  ctx.fillText(priceText, canvasWidth - priceAxisWidth - 4, y - 3);

  if (isSelected || isHovered) {
    const handleR = isSelected ? 4 : 3;
    ctx.beginPath();
    ctx.arc(canvasWidth - priceAxisWidth - 10, y, handleR, 0, Math.PI * 2);
    ctx.fillStyle = THEME.canvasBg;
    ctx.fill();
    ctx.strokeStyle = d.color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.restore();
}

// ── Fibonacci drawing ─────────────────────────────────

function drawFibonacciDrawing(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  layout: ChartLayout,
  viewport: Viewport,
  pair: string,
  scale: PriceScale,
  isSelected: boolean,
  _isHovered: boolean,
): void {
  if (d.points.length < 2) return;
  const { mainTop, mainHeight, priceAxisWidth, canvasWidth, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  const p1 = d.points[0].price;
  const p2 = d.points[1].price;
  const x1 = indexToX(d.points[0].index, startIndex, endIndex, chartLeft, chartWidth);
  const x2 = indexToX(d.points[1].index, startIndex, endIndex, chartLeft, chartWidth);
  const rightEdge = canvasWidth - priceAxisWidth;

  ctx.save();
  ctx.globalAlpha = d.opacity;

  for (const level of FIB_LEVELS) {
    const price = p2 + (p1 - p2) * level;
    const y = priceToY(price, priceMin, priceMax, mainTop, mainHeight, scale);

    ctx.strokeStyle = d.color;
    ctx.lineWidth = isSelected && (level === 0 || level === 1) ? d.lineWidth + 0.5 : 0.5;
    ctx.setLineDash(level === 0 || level === 1 ? getLineDash(d.lineStyle || "solid") : [4, 4]);
    ctx.beginPath();
    ctx.moveTo(Math.min(x1, x2), y);
    ctx.lineTo(rightEdge, y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = "9px 'IBM Plex Mono', monospace";
    ctx.fillStyle = d.color;
    ctx.textAlign = "right";
    ctx.fillText(`${(level * 100).toFixed(1)}% \u2014 ${formatPrice(price, pair)}`, rightEdge - 4, y - 3);
  }

  ctx.restore();
}

// ── Rectangle drawing ─────────────────────────────────

function drawRectangleDrawing(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  layout: ChartLayout,
  viewport: Viewport,
  _pair: string,
  scale: PriceScale,
  isSelected: boolean,
  _isHovered: boolean,
): void {
  if (d.points.length < 2) return;
  const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  const x1 = indexToX(d.points[0].index, startIndex, endIndex, chartLeft, chartWidth);
  const y1 = priceToY(d.points[0].price, priceMin, priceMax, mainTop, mainHeight, scale);
  const x2 = indexToX(d.points[1].index, startIndex, endIndex, chartLeft, chartWidth);
  const y2 = priceToY(d.points[1].price, priceMin, priceMax, mainTop, mainHeight, scale);

  ctx.save();
  ctx.globalAlpha = d.opacity;

  ctx.fillStyle = d.color.replace(")", ",0.08)").replace("rgb", "rgba");
  ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  ctx.setLineDash(getLineDash(d.lineStyle || "solid"));
  ctx.strokeStyle = d.color;
  ctx.lineWidth = isSelected ? d.lineWidth + 0.5 : d.lineWidth;
  ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  ctx.setLineDash([]);

  if (d.label) {
    const effColor = d.labelColor || d.color;
    const weight = d.labelBold ? "bold" : "normal";
    const style = d.labelItalic ? "italic" : "normal";
    ctx.font = `${style} ${weight} ${d.labelFontSize || 10}px 'IBM Plex Mono', monospace`;
    ctx.fillStyle = effColor;
    ctx.textAlign = "left";
    ctx.fillText(d.label, Math.min(x1, x2) + 4, Math.min(y1, y2) + 12);
  }

  ctx.restore();
}

// ══════════════════════════════════════════════════════
//  Persistence (backward-compatible migration)
// ══════════════════════════════════════════════════════

export function saveDrawings(pair: string, drawings: Drawing[]): void {
  try {
    localStorage.setItem(`ordr_drawings_${pair}`, JSON.stringify(drawings));
  } catch { /* quota exceeded */ }
}

export function loadDrawings(pair: string): Drawing[] {
  try {
    const raw = localStorage.getItem(`ordr_drawings_${pair}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return parsed.map((d: any) => ({
      // New defaults for migrating old drawings
      lineWidth: 1.5,
      lineStyle: "solid",
      opacity: 1,
      extendLeft: false,
      extendRight: false,
      arrowLeft: false,
      arrowRight: false,
      label: "",
      labelFontSize: 11,
      labelBold: false,
      labelItalic: false,
      labelColor: "",
      labelAlign: "right",
      showAngle: true,
      showMidPoint: false,
      showPriceLabels: false,
      locked: false,
      ...d,
      // Ensure stats is fully populated even if partially saved
      stats: { ...DEFAULT_STATS, ...(d.stats || {}) },
    }));
  } catch { return []; }
}
