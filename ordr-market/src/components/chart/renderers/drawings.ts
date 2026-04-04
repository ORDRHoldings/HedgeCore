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
import { drawGenericDrawing, hitTestGenericDrawing } from "./drawingTools";
import { computeAnchoredVWAP } from "../indicators/vwap";

// ══════════════════════════════════════════════════════
//  Types
// ══════════════════════════════════════════════════════

export type DrawingType =
  | "trendline" | "horizontal" | "fibonacci" | "rectangle"
  | "ray" | "extended_line" | "horizontal_ray" | "vertical_line" | "cross_line" | "info_line" | "trend_angle"
  | "parallel_channel" | "regression_trend" | "flat_top_bottom" | "disjoint_channel"
  | "pitchfork" | "schiff_pitchfork" | "mod_schiff_pitchfork" | "inside_pitchfork"
  | "fib_extension" | "fib_channel" | "fib_time_zone" | "fib_speed_fan"
  | "gann_box" | "gann_fan"
  | "xabcd_pattern" | "cypher_pattern" | "abcd_pattern" | "triangle_pattern" | "three_drives" | "head_shoulders"
  | "elliott_impulse" | "elliott_correction" | "elliott_triangle"
  | "circle" | "ellipse" | "triangle_shape" | "arrow_drawing" | "brush" | "polyline" | "arc"
  | "long_position" | "short_position" | "date_range" | "price_range" | "date_price_range" | "forecast"
  | "text_note" | "anchored_text" | "callout" | "price_label" | "arrow_marker_up" | "arrow_marker_down" | "flag_mark"
  | "anchored_vwap";
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
  // Rectangle-specific
  fillEnabled: boolean;
  fillColor: string;         // "" = use drawing color
  fillOpacity: number;       // 0–1, separate from border opacity
  midLine: boolean;          // horizontal midline
  midLineColor: string;      // "" = use drawing color
  midLineWidth: number;
  midLineStyle: LineStyle;
  labelPosition: RectLabelPosition;
  // Channel-specific
  channelWidth?: number;
  channelFillEnabled?: boolean;
  channelFillColor?: string;
  channelFillOpacity?: number;
  // Position tool
  entryPrice?: number;
  targetPrice?: number;
  stopPrice?: number;
  quantity?: number;
  riskPercent?: number;
  accountSize?: number;
  // Pattern labels
  patternLabels?: string[];
  // Text/annotation
  text?: string;
  fontSize?: number;
  fontBold?: boolean;
  fontItalic?: boolean;
  backgroundColor?: string;
  borderRadius?: number;
  // Brush
  brushPoints?: { x: number; y: number }[];
  brushSize?: number;
  // Fib overrides
  fibLevels?: number[];
  fibShowExtensions?: boolean;
  // Gann
  gannShowAngles?: boolean;
  gannShowPriceTime?: boolean;
  // Phase 1 — Line tool innovations
  eventType?: "NFP" | "CPI" | "FOMC" | "CB_MEETING" | "EARNINGS";
  confluenceZoneEnabled?: boolean;
  rRatios?: number[];
  // Phase 2 — Channel innovations
  fibSubdivisions?: boolean;
  showMeanReversionZone?: boolean;
  // Phase 5 — Elliott Wave
  waveDegree?: "grand_supercycle" | "supercycle" | "cycle" | "primary" | "intermediate" | "minor" | "minute" | "minuette" | "sub_minuette";
  waveLabeling?: "roman" | "arabic" | "lowercase";
  // Phase 6 — Shape innovations
  atrCircleEnabled?: boolean;
  atrPeriod?: number;
  phiEllipse?: boolean;
  formationTag?: "ASCENDING" | "DESCENDING" | "SYMMETRICAL" | "WEDGE" | "PENNANT";
  tradeDirection?: "LONG" | "SHORT";
  tradeUnits?: number;
  sentimentTag?: "BULLISH" | "BEARISH" | "NEUTRAL";
  measuredArcMode?: boolean;
  // Phase 7 — Measurement/Annotation innovations
  hedgeCostBps?: number;
  scenarioBranches?: { label: string; probability: number; endIndex: number; endPrice: number }[];
  institutionalTag?: "RISK" | "SIGNAL" | "REVIEW" | "APPROVED" | "BLOCKED";
  teamRole?: "ANALYST" | "RISK" | "TRADER" | "COMPLIANCE";
  alertEnabled?: boolean;
  alertTriggered?: boolean;
  policyLinkForwardRate?: number;
  policyLinkHedgeRatio?: number;
  signalStrength?: number;
  eventTaxonomy?: "NFP" | "CPI" | "FOMC" | "ECB" | "BOJ" | "BOE" | "RBA" | "SNB" | "TRADE_ENTRY" | "TRADE_EXIT" | "POSITION_OPEN" | "POSITION_CLOSE";
  atrMultiple?: number;
}

export type RectLabelPosition =
  | "top-left" | "top-center" | "top-right"
  | "center"
  | "bottom-left" | "bottom-center" | "bottom-right";

// ══════════════════════════════════════════════════════
//  Constants
// ══════════════════════════════════════════════════════

const DRAWING_COLORS: Record<DrawingType, string> = {
  trendline: THEME.drawTrendline,
  horizontal: THEME.drawHorizontal,
  fibonacci: THEME.drawFibonacci,
  rectangle: THEME.drawRectangle,
  // Lines
  ray: "#2962FF",
  extended_line: "#2962FF",
  horizontal_ray: "#FF9800",
  vertical_line: "#787B86",
  cross_line: "#787B86",
  info_line: "#26A69A",
  trend_angle: "#FF6D00",
  // Channels
  parallel_channel: "#2962FF",
  regression_trend: "#9C27B0",
  flat_top_bottom: "#FF9800",
  disjoint_channel: "#00BCD4",
  pitchfork: "#2962FF",
  schiff_pitchfork: "#2962FF",
  mod_schiff_pitchfork: "#2962FF",
  inside_pitchfork: "#2962FF",
  // Fibonacci
  fib_extension: "#9C27B0",
  fib_channel: "#9C27B0",
  fib_time_zone: "#9C27B0",
  fib_speed_fan: "#9C27B0",
  // Gann
  gann_box: "#FF6D00",
  gann_fan: "#FF6D00",
  // Patterns
  xabcd_pattern: "#00BCD4",
  cypher_pattern: "#00BCD4",
  abcd_pattern: "#00BCD4",
  triangle_pattern: "#FF9800",
  three_drives: "#00BCD4",
  head_shoulders: "#E91E63",
  elliott_impulse: "#26A69A",
  elliott_correction: "#EF5350",
  elliott_triangle: "#FF9800",
  // Shapes
  circle: "#2962FF",
  ellipse: "#2962FF",
  triangle_shape: "#FF9800",
  arrow_drawing: "#EF5350",
  brush: "#FFEB3B",
  polyline: "#2962FF",
  arc: "#9C27B0",
  // Measurement
  long_position: "#26A69A",
  short_position: "#EF5350",
  date_range: "#787B86",
  price_range: "#787B86",
  date_price_range: "#787B86",
  forecast: "#2962FF",
  // Annotations
  text_note: "#D1D4DC",
  anchored_text: "#D1D4DC",
  callout: "#FFEB3B",
  price_label: "#FF9800",
  arrow_marker_up: "#26A69A",
  arrow_marker_down: "#EF5350",
  flag_mark: "#FF9800",
  anchored_vwap: "#00E5FF",
};

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const HIT_THRESHOLD = 8;
const HANDLE_RADIUS = 6;
const SNAP_INCREMENT_DEG = 15;
const MAGNETIC_THRESHOLD_PX = 20;

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
    showAngle: false,
    showMidPoint: false,
    showPriceLabels: false,
    stats: { ...DEFAULT_STATS },
    locked: false,
    fillEnabled: type === "rectangle",
    fillColor: "",
    fillOpacity: 0.15,
    midLine: false,
    midLineColor: "",
    midLineWidth: 1,
    midLineStyle: "dashed",
    labelPosition: "top-left",
    channelFillEnabled: false,
    channelFillOpacity: 0.15,
    channelFillColor: "",
    brushSize: 2,
    brushPoints: [],
    text: "",
    fontSize: 14,
    fontBold: false,
    fontItalic: false,
    backgroundColor: "",
    borderRadius: 4,
    // Fib
    fibLevels: FIB_LEVELS.slice(),
    fibShowExtensions: false,
    // Gann
    gannShowAngles: true,
    gannShowPriceTime: false,
    // Line innovations
    eventType: undefined,
    confluenceZoneEnabled: false,
    rRatios: [1, 2, 3],
    // Channel innovations
    fibSubdivisions: false,
    showMeanReversionZone: false,
    // Elliott Wave
    waveDegree: "intermediate",
    waveLabeling: "arabic",
    // Shape innovations
    atrCircleEnabled: false,
    atrPeriod: 14,
    phiEllipse: false,
    formationTag: undefined,
    tradeDirection: undefined,
    tradeUnits: 1,
    sentimentTag: undefined,
    measuredArcMode: false,
    // Measurement/Annotation innovations
    hedgeCostBps: 0,
    scenarioBranches: [],
    institutionalTag: undefined,
    teamRole: undefined,
    alertEnabled: false,
    alertTriggered: false,
    policyLinkForwardRate: undefined,
    policyLinkHedgeRatio: undefined,
    signalStrength: undefined,
    eventTaxonomy: undefined,
    atrMultiple: 1,
    // Position tool
    patternLabels: [],
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════
//  Points required per drawing type
// ══════════════════════════════════════════════════════

export function getPointsRequired(type: DrawingType): number {
  switch (type) {
    case "horizontal": case "vertical_line": case "cross_line": case "horizontal_ray":
    case "text_note": case "anchored_text": case "price_label":
    case "arrow_marker_up": case "arrow_marker_down": case "flag_mark":
    case "anchored_vwap":
      return 1;
    case "trendline": case "ray": case "extended_line": case "info_line": case "trend_angle":
    case "fibonacci": case "rectangle": case "circle": case "ellipse":
    case "date_range": case "price_range": case "date_price_range":
    case "gann_box": case "gann_fan": case "fib_time_zone": case "fib_speed_fan":
    case "long_position": case "short_position": case "regression_trend":
      return 2;
    case "parallel_channel": case "flat_top_bottom":
    case "pitchfork": case "schiff_pitchfork": case "mod_schiff_pitchfork": case "inside_pitchfork":
    case "fib_extension": case "fib_channel":
    case "callout": case "triangle_shape": case "arc": case "forecast":
      return 3;
    case "abcd_pattern": case "elliott_correction": case "disjoint_channel":
      return 4;
    case "xabcd_pattern": case "cypher_pattern": case "triangle_pattern":
      return 5;
    case "elliott_impulse": case "head_shoulders": case "elliott_triangle":
      return 6;
    case "three_drives":
      return 7;
    case "brush": case "polyline": case "arrow_drawing":
      return -1;
    default: return 2;
  }
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

function computeLocalATR(bars: Bar[], period = 14): number {
  if (bars.length < 2) return 0;
  const n = Math.min(period, bars.length - 1);
  let sum = 0;
  for (let i = bars.length - n; i < bars.length; i++) {
    const tr = Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c));
    sum += tr;
  }
  return sum / n;
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
  part: string; // "body"|"p0"|"p1"|"rect-adj-0"|"rect-adj-1"|"edge-top"|"edge-bottom"|"edge-left"|"edge-right"
}

export function hitTestDrawings(
  mx: number, my: number,
  drawings: Drawing[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale = "linear",
  hitScale = 1.0,
): HitTestResult | null {
  const ht = HIT_THRESHOLD * hitScale;
  const hr = HANDLE_RADIUS * hitScale;
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

      if (Math.hypot(mx - x1, my - y1) <= hr) {
        const dist = Math.hypot(mx - x1, my - y1);
        if (!best || dist < best.distance) best = { drawingId: d.id, distance: dist, part: "p0" };
        continue;
      }
      if (Math.hypot(mx - x2, my - y2) <= hr) {
        const dist = Math.hypot(mx - x2, my - y2);
        if (!best || dist < best.distance) best = { drawingId: d.id, distance: dist, part: "p1" };
        continue;
      }

      const dist = (d.extendLeft || d.extendRight)
        ? pointToLineDist(mx, my, x1, y1, x2, y2)
        : pointToSegmentDist(mx, my, x1, y1, x2, y2);
      if (dist <= ht && (!best || dist < best.distance)) {
        best = { drawingId: d.id, distance: dist, part: "body" };
      }
    } else if (d.type === "horizontal") {
      if (d.points.length < 1) continue;
      const y = priceToY(d.points[0].price, priceMin, priceMax, mainTop, mainHeight, scale);
      const dist = Math.abs(my - y);
      if (dist <= ht && (!best || dist < best.distance)) {
        best = { drawingId: d.id, distance: dist, part: "body" };
      }
    } else if (d.type === "anchored_vwap") {
      if (d.points.length < 1) continue;
      // Hit the anchor handle
      const ax = indexToX(d.points[0].index, startIndex, endIndex, chartLeft, chartWidth);
      const ay = priceToY(d.points[0].price, priceMin, priceMax, mainTop, mainHeight, scale);
      const dist = Math.hypot(mx - ax, my - ay);
      if (dist <= hr * 1.5 && (!best || dist < best.distance)) {
        best = { drawingId: d.id, distance: dist, part: "p0" };
      }
    } else if (d.type === "rectangle") {
      if (d.points.length < 2) continue;
      const rx1 = indexToX(d.points[0].index, startIndex, endIndex, chartLeft, chartWidth);
      const ry1 = priceToY(d.points[0].price, priceMin, priceMax, mainTop, mainHeight, scale);
      const rx2 = indexToX(d.points[1].index, startIndex, endIndex, chartLeft, chartWidth);
      const ry2 = priceToY(d.points[1].price, priceMin, priceMax, mainTop, mainHeight, scale);
      const rLeft = Math.min(rx1, rx2), rRight = Math.max(rx1, rx2);
      const rTop = Math.min(ry1, ry2), rBot = Math.max(ry1, ry2);

      // 4 corner handles: p0, p1, and two adjacent corners
      const corners: { x: number; y: number; part: string }[] = [
        { x: rx1, y: ry1, part: "p0" },
        { x: rx2, y: ry2, part: "p1" },
        { x: rx1, y: ry2, part: "rect-adj-0" }, // (p0.index, p1.price)
        { x: rx2, y: ry1, part: "rect-adj-1" }, // (p1.index, p0.price)
      ];
      for (const c of corners) {
        const cd = Math.hypot(mx - c.x, my - c.y);
        if (cd <= hr && (!best || cd < best.distance)) {
          best = { drawingId: d.id, distance: cd, part: c.part };
        }
      }
      if (best && best.drawingId === d.id) { /* corner takes priority, skip body/edge */ }
      // 4 edge midpoint handles
      else {
        const edges: { x: number; y: number; part: string }[] = [
          { x: (rLeft + rRight) / 2, y: rTop, part: "edge-top" },
          { x: (rLeft + rRight) / 2, y: rBot, part: "edge-bottom" },
          { x: rLeft, y: (rTop + rBot) / 2, part: "edge-left" },
          { x: rRight, y: (rTop + rBot) / 2, part: "edge-right" },
        ];
        for (const e of edges) {
          const ed = Math.hypot(mx - e.x, my - e.y);
          if (ed <= hr && (!best || ed < best.distance)) {
            best = { drawingId: d.id, distance: ed, part: e.part };
          }
        }
        // Edge line hit (border)
        if (!best || best.drawingId !== d.id) {
          if (mx >= rLeft - ht && mx <= rRight + ht &&
              my >= rTop - ht && my <= rBot + ht) {
            const minEdge = Math.min(
              Math.abs(mx - rLeft), Math.abs(mx - rRight),
              Math.abs(my - rTop), Math.abs(my - rBot),
            );
            if (minEdge <= ht && (!best || minEdge < best.distance)) {
              best = { drawingId: d.id, distance: minEdge, part: "body" };
            }
          }
        }
        // Interior body click (fill area)
        if (!best || best.drawingId !== d.id) {
          if (d.fillEnabled !== false && mx >= rLeft && mx <= rRight && my >= rTop && my <= rBot) {
            const dist = 0.5; // low priority — inside fill
            if (!best || dist < best.distance) {
              best = { drawingId: d.id, distance: dist, part: "body" };
            }
          }
        }
      }
    } else if (d.type === "fibonacci") {
      if (d.points.length < 2) continue;
      const x1 = indexToX(d.points[0].index, startIndex, endIndex, chartLeft, chartWidth);
      const y1 = priceToY(d.points[0].price, priceMin, priceMax, mainTop, mainHeight, scale);
      const x2 = indexToX(d.points[1].index, startIndex, endIndex, chartLeft, chartWidth);
      const y2 = priceToY(d.points[1].price, priceMin, priceMax, mainTop, mainHeight, scale);
      // Check endpoint handles first (higher priority than body)
      const d0 = Math.hypot(mx - x1, my - y1);
      const d1 = Math.hypot(mx - x2, my - y2);
      if (d0 <= hr && (!best || d0 < best.distance)) {
        best = { drawingId: d.id, distance: d0, part: "p0" };
      } else if (d1 <= hr && (!best || d1 < best.distance)) {
        best = { drawingId: d.id, distance: d1, part: "p1" };
      } else {
        const dist = pointToSegmentDist(mx, my, x1, y1, x2, y2);
        if (dist <= ht && (!best || dist < best.distance)) {
          best = { drawingId: d.id, distance: dist, part: "body" };
        }
      }
    } else {
      const genericHit = hitTestGenericDrawing(mx, my, d, layout, viewport, scale, hitScale);
      if (genericHit && (!best || genericHit.distance < best.distance)) {
        best = genericHit;
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
  selectedIds?: string[],
): void {
  for (const d of drawings) {
    const isSelected = d.id === selectedId || (selectedIds != null && selectedIds.includes(d.id));
    const isHovered = d.id === hoveredId;
    switch (d.type) {
      case "trendline": drawTrendlineDrawing(ctx, d, layout, viewport, pair, scale, isSelected, isHovered, bars); break;
      case "horizontal": drawHorizontalDrawing(ctx, d, layout, viewport, pair, scale, isSelected, isHovered, bars); break;
      case "fibonacci": drawFibonacciDrawing(ctx, d, layout, viewport, pair, scale, isSelected, isHovered, bars); break;
      case "rectangle": drawRectangleDrawing(ctx, d, layout, viewport, pair, scale, isSelected, isHovered, bars); break;
      case "anchored_vwap": drawAnchoredVWAPDrawing(ctx, d, layout, viewport, scale, isSelected, isHovered, bars); break;
      default: {
        drawGenericDrawing(ctx, d, layout, viewport, pair, scale, isSelected, isHovered, bars);
        // Stats box for all generic tools (mirrors trendline behavior)
        const anyStatEnabled = d.stats.showPrice || d.stats.showPercent || d.stats.showPips ||
          d.stats.showBars || d.stats.showDateRange || d.stats.showAngle;
        if (anyStatEnabled && (d.stats.alwaysShow || isSelected) && bars && bars.length > 0 && d.points.length >= 2) {
          const computed = computeDrawingStats(d, bars, pair, layout, viewport, scale);
          const { startIndex, endIndex, priceMin, priceMax } = viewport;
          const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
          const midX = (
            indexToX(d.points[0].index, startIndex, endIndex, chartLeft, chartWidth) +
            indexToX(d.points[1].index, startIndex, endIndex, chartLeft, chartWidth)
          ) / 2;
          const midY = (
            priceToY(d.points[0].price, priceMin, priceMax, mainTop, mainHeight, scale) +
            priceToY(d.points[1].price, priceMin, priceMax, mainTop, mainHeight, scale)
          ) / 2;
          drawStatsBox(ctx, computed, d.stats, midX, midY, d.color);
        }
        break;
      }
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

  // ── ATR Envelope (visible when selected) ──
  if (isSelected && bars && bars.length >= 2) {
    const atr = computeLocalATR(bars);
    if (atr > 0 && priceMax > priceMin) {
      const atrPx = (atr / (priceMax - priceMin)) * mainHeight;
      ctx.save();
      ctx.globalAlpha = d.opacity * 0.35;
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(drawStartX, drawStartY - atrPx);
      ctx.lineTo(drawEndX, drawEndY - atrPx);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(drawStartX, drawStartY + atrPx);
      ctx.lineTo(drawEndX, drawEndY + atrPx);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = d.opacity * 0.06;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.moveTo(drawStartX, drawStartY - atrPx);
      ctx.lineTo(drawEndX, drawEndY - atrPx);
      ctx.lineTo(drawEndX, drawEndY + atrPx);
      ctx.lineTo(drawStartX, drawStartY + atrPx);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
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

  // ── Touch counter ──
  if (bars && bars.length >= 2) {
    const atr = computeLocalATR(bars);
    if (atr > 0) {
      const pSlope = (d.points[1].price - d.points[0].price) / (d.points[1].index - d.points[0].index || 1);
      const iMin = Math.max(0, Math.min(d.points[0].index, d.points[1].index));
      const iMax = Math.min(bars.length - 1, Math.max(d.points[0].index, d.points[1].index));
      let touches = 0;
      for (let bi = iMin; bi <= iMax; bi++) {
        const linePrice = d.points[0].price + pSlope * (bi - d.points[0].index);
        if (Math.abs(bars[bi].h - linePrice) < atr * 0.25 || Math.abs(bars[bi].l - linePrice) < atr * 0.25) touches++;
      }
      if (touches > 0) {
        const strength = touches <= 2 ? "WEAK" : touches <= 5 ? "MODERATE" : "STRONG";
        const scolor = touches <= 2 ? "#787B86" : touches <= 5 ? "#FF9800" : "#26A69A";
        const bx = (x1 + x2) / 2;
        const by = Math.min(y1, y2) - 20;
        if (by > mainTop + 4) {
          ctx.save();
          ctx.font = "bold 8px 'IBM Plex Mono', monospace";
          const text = `\u29C9 ${touches} \u00B7 ${strength}`;
          const tw = ctx.measureText(text).width;
          const pad = 4;
          ctx.globalAlpha = d.opacity;
          ctx.fillStyle = "rgba(19,23,34,0.88)";
          ctx.beginPath();
          ctx.roundRect(bx - tw / 2 - pad, by - 6, tw + pad * 2, 13, 3);
          ctx.fill();
          ctx.strokeStyle = scolor;
          ctx.lineWidth = 0.5;
          ctx.stroke();
          ctx.fillStyle = scolor;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(text, bx, by);
          ctx.restore();
        }
      }
    }
  }

  // ── Alert zone ──
  if (bars && bars.length >= 2) {
    const atr = computeLocalATR(bars);
    if (atr > 0 && priceMax > priceMin) {
      const pSlope = (d.points[1].price - d.points[0].price) / (d.points[1].index - d.points[0].index || 1);
      const lineAtNow = d.points[0].price + pSlope * (bars.length - 1 - d.points[0].index);
      if (Math.abs(bars[bars.length - 1].c - lineAtNow) < atr) {
        const alertY = priceToY(lineAtNow, priceMin, priceMax, mainTop, mainHeight, scale);
        const atrPx = (atr / (priceMax - priceMin)) * mainHeight * 0.5;
        ctx.save();
        ctx.globalAlpha = 0.07;
        ctx.fillStyle = "#FF9800";
        ctx.fillRect(Math.min(drawStartX, drawEndX), alertY - atrPx, Math.abs(drawEndX - drawStartX), atrPx * 2);
        ctx.restore();
      }
    }
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
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = lineColor;
    ctx.fillRect(x1, y1, w, h);
    ctx.globalAlpha = 0.8;
    // Dimension info box
    const { priceMin: pm, priceMax: px } = viewport;
    const priceH = Math.max(
      yToPrice(y1, pm, px, layout.mainTop, layout.mainHeight, scale),
      yToPrice(cursorY, pm, px, layout.mainTop, layout.mainHeight, scale),
    );
    const priceL = Math.min(
      yToPrice(y1, pm, px, layout.mainTop, layout.mainHeight, scale),
      yToPrice(cursorY, pm, px, layout.mainTop, layout.mainHeight, scale),
    );
    const priceDiff = priceH - priceL;
    const barSpan = Math.abs(Math.round(xToIndex(cursorX, viewport.startIndex, viewport.endIndex, layout.chartLeft, layout.chartWidth))
      - Math.round(xToIndex(x1, viewport.startIndex, viewport.endIndex, layout.chartLeft, layout.chartWidth)));
    ctx.font = "10px 'IBM Plex Mono', monospace";
    const infoText = `${priceDiff.toFixed(4)} | ${barSpan} bars`;
    const tw = ctx.measureText(infoText).width + 10;
    const ix = Math.min(x1, cursorX) + Math.abs(w) / 2 - tw / 2;
    const iy = Math.max(y1, cursorY) + 6;
    ctx.fillStyle = "rgba(19,23,34,0.9)";
    ctx.beginPath();
    ctx.roundRect(ix, iy, tw, 18, 3);
    ctx.fill();
    ctx.fillStyle = lineColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(infoText, ix + tw / 2, iy + 9);
    // Corner guides
    ctx.globalAlpha = 0.4;
    ctx.setLineDash([2, 2]);
    // horizontal guide from cursor
    ctx.beginPath(); ctx.moveTo(cursorX, cursorY); ctx.lineTo(x1, cursorY); ctx.stroke();
    // vertical guide from cursor
    ctx.beginPath(); ctx.moveTo(cursorX, cursorY); ctx.lineTo(cursorX, y1); ctx.stroke();
    ctx.setLineDash([6, 4]);
    ctx.globalAlpha = 0.8;
  } else if (drawingType === "horizontal") {
    ctx.beginPath();
    ctx.moveTo(layout.chartLeft, cursorY);
    ctx.lineTo(layout.canvasWidth - layout.priceAxisWidth, cursorY);
    ctx.stroke();
  } else {
    // Generic fallback: dashed line from anchor to cursor (covers ray, channel,
    // pitchfork, arc, circle, ellipse, long_position, etc.)
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(cursorX, cursorY);
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
  bars?: Bar[],
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

  // ── Level strength badge ──
  if (bars && bars.length >= 2) {
    const price = d.points[0].price;
    const atr = computeLocalATR(bars);
    const band = atr * 0.25;
    let touches = 0;
    for (const bar of bars) {
      if (Math.abs(bar.h - price) <= band || Math.abs(bar.l - price) <= band) touches++;
    }
    if (touches > 0) {
      const strength = touches <= 2 ? "WEAK" : touches <= 5 ? "MODERATE" : "STRONG";
      const scolor = touches <= 2 ? "#787B86" : touches <= 5 ? "#FF9800" : "#26A69A";
      ctx.save();
      ctx.globalAlpha = d.opacity;
      ctx.font = "bold 8px 'IBM Plex Mono', monospace";
      const text = `\u29C9 ${touches} \u00B7 ${strength}`;
      const tw = ctx.measureText(text).width;
      const bx = (canvasWidth - priceAxisWidth) * 0.45;
      const pad = 4;
      ctx.fillStyle = "rgba(19,23,34,0.88)";
      ctx.beginPath();
      ctx.roundRect(bx - tw / 2 - pad, y - 13, tw + pad * 2, 12, 3);
      ctx.fill();
      ctx.strokeStyle = scolor;
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.fillStyle = scolor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, bx, y - 7);
      ctx.restore();
    }
    // ── Bounce zone ──
    if ((isSelected || d.stats.alwaysShow) && priceMax > priceMin) {
      const atrPx = (atr / (priceMax - priceMin)) * mainHeight;
      const bandPx = atrPx * 0.25;
      ctx.save();
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = d.color;
      ctx.fillRect(0, y - bandPx, canvasWidth - priceAxisWidth, bandPx * 2);
      ctx.restore();
    }
  }

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

// ── Anchored VWAP drawing ─────────────────────────────

function drawAnchoredVWAPDrawing(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale,
  isSelected: boolean,
  isHovered: boolean,
  bars?: Bar[],
): void {
  if (d.points.length < 1 || !bars || bars.length === 0) return;
  const { mainTop, mainHeight, chartLeft, chartWidth, priceAxisWidth, canvasWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  const anchorIndex = d.points[0].index;
  const vwapPts = computeAnchoredVWAP(bars, anchorIndex);
  if (vwapPts.length < 2) return;

  ctx.save();
  ctx.globalAlpha = d.opacity;
  ctx.strokeStyle = d.color;
  ctx.lineWidth = isSelected ? d.lineWidth + 0.5 : d.lineWidth;
  ctx.setLineDash(getLineDash(d.lineStyle || "solid"));
  ctx.beginPath();

  let started = false;
  for (let i = 0; i < vwapPts.length; i++) {
    const barIdx = anchorIndex + i;
    if (barIdx < startIndex - 1 || barIdx > endIndex + 1) {
      started = false;
      continue;
    }
    const x = indexToX(barIdx, startIndex, endIndex, chartLeft, chartWidth);
    const y = priceToY(vwapPts[i].value, priceMin, priceMax, mainTop, mainHeight, scale);
    if (!started) { ctx.moveTo(x, y); started = true; }
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Anchor handle: diamond marker
  const ax = indexToX(anchorIndex, startIndex, endIndex, chartLeft, chartWidth);
  const ay = priceToY(vwapPts[0].value, priceMin, priceMax, mainTop, mainHeight, scale);
  const r = isSelected ? 5 : 4;
  ctx.beginPath();
  ctx.moveTo(ax, ay - r);
  ctx.lineTo(ax + r, ay);
  ctx.lineTo(ax, ay + r);
  ctx.lineTo(ax - r, ay);
  ctx.closePath();
  ctx.fillStyle = d.color;
  ctx.fill();

  // Label at right edge showing last VWAP value
  if (vwapPts.length > 0) {
    const lastPt = vwapPts[vwapPts.length - 1];
    const lastBarIdx = anchorIndex + vwapPts.length - 1;
    if (lastBarIdx <= endIndex + 1) {
      const lx = Math.min(indexToX(lastBarIdx, startIndex, endIndex, chartLeft, chartWidth), canvasWidth - priceAxisWidth - 2);
      const ly = priceToY(lastPt.value, priceMin, priceMax, mainTop, mainHeight, scale);
      ctx.font = "bold 9px 'IBM Plex Mono', monospace";
      ctx.fillStyle = d.color;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(d.label || "AVWAP", lx - 4, ly - 7);
    }
  }

  if (isSelected || isHovered) {
    ctx.beginPath();
    ctx.arc(ax, ay, isSelected ? 7 : 6, 0, Math.PI * 2);
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
  isHovered: boolean,
  bars?: Bar[],
): void {
  if (d.points.length < 2) return;
  const { mainTop, mainHeight, priceAxisWidth, canvasWidth, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  const priceStart = d.points[0].price;
  const priceEnd   = d.points[1].price;
  const xStart = indexToX(d.points[0].index, startIndex, endIndex, chartLeft, chartWidth);
  const xEnd   = indexToX(d.points[1].index, startIndex, endIndex, chartLeft, chartWidth);
  const xLeft  = Math.min(xStart, xEnd);
  const rightEdge = canvasWidth - priceAxisWidth;

  // Level set: custom or default, plus optional extensions
  const baseLevels = (d.fibLevels && d.fibLevels.length > 0) ? d.fibLevels : FIB_LEVELS.slice();
  const EXT_LEVELS = [1.272, 1.414, 1.618, 2.0, 2.618];
  const allLevels = d.fibShowExtensions
    ? [...new Set([...baseLevels, ...EXT_LEVELS])].sort((a, b) => a - b)
    : baseLevels.slice().sort((a, b) => a - b);

  // Level color by significance
  const fibColor = (level: number): string => {
    if (Math.abs(level) < 0.001 || Math.abs(level - 1) < 0.001) return "#9598A1";
    if (Math.abs(level - 0.236) < 0.001) return "#787B86";
    if (Math.abs(level - 0.382) < 0.001) return "#FF9800";
    if (Math.abs(level - 0.5)   < 0.001) return "#2196F3";
    if (Math.abs(level - 0.618) < 0.001) return "#FFD700";
    if (Math.abs(level - 0.786) < 0.001) return "#FF6D00";
    if (Math.abs(level - 1.272) < 0.001) return "#26A69A";
    if (Math.abs(level - 1.414) < 0.001) return "#AB47BC";
    if (Math.abs(level - 1.618) < 0.001) return "#FFD700";
    if (Math.abs(level - 2.0)   < 0.001) return "#EF5350";
    if (Math.abs(level - 2.618) < 0.001) return "#EF5350";
    return d.color;
  };

  const isGoldenLevel = (level: number) =>
    Math.abs(level - 0.618) < 0.001 || Math.abs(level - 1.618) < 0.001;
  const isKeyLevel = (level: number) =>
    Math.abs(level) < 0.001 || Math.abs(level - 1) < 0.001;

  // Current price proximity
  const pipSize = getPipSize(pair);
  let nearestLevel: number | null = null;
  let nearestDist = Infinity;
  if (bars && bars.length > 0) {
    const cp = bars[bars.length - 1].c;
    for (const lv of allLevels) {
      const lp = priceEnd + (priceStart - priceEnd) * lv;
      const dist = Math.abs(cp - lp) / pipSize;
      if (dist < nearestDist) { nearestDist = dist; nearestLevel = lv; }
    }
  }

  ctx.save();
  ctx.globalAlpha = d.opacity;

  // ── 1. Fill bands between adjacent price levels ──
  const sortedByPrice = allLevels.slice().sort((a, b) => {
    const pa = priceEnd + (priceStart - priceEnd) * a;
    const pb = priceEnd + (priceStart - priceEnd) * b;
    return pb - pa;
  });
  for (let i = 0; i < sortedByPrice.length - 1; i++) {
    const la = sortedByPrice[i], lb = sortedByPrice[i + 1];
    const pa = priceEnd + (priceStart - priceEnd) * la;
    const pb = priceEnd + (priceStart - priceEnd) * lb;
    const ya = priceToY(pa, priceMin, priceMax, mainTop, mainHeight, scale);
    const yb = priceToY(pb, priceMin, priceMax, mainTop, mainHeight, scale);
    const yTop = Math.min(ya, yb), yBot = Math.max(ya, yb);
    if (yTop > mainTop + mainHeight || yBot < mainTop) continue;
    const isNearZone = nearestLevel !== null && (la === nearestLevel || lb === nearestLevel);
    ctx.globalAlpha = isNearZone ? d.opacity * 0.09 : (i % 2 === 0 ? d.opacity * 0.04 : d.opacity * 0.02);
    ctx.fillStyle = isNearZone ? "#FFFFFF" : (i % 2 === 0 ? d.color : "#787B86");
    ctx.fillRect(
      xLeft,
      Math.max(mainTop, yTop),
      rightEdge - xLeft,
      Math.min(mainTop + mainHeight, yBot) - Math.max(mainTop, yTop),
    );
  }
  ctx.globalAlpha = d.opacity;

  // ── 2. Level lines + labels ──
  for (const level of allLevels) {
    const price = priceEnd + (priceStart - priceEnd) * level;
    const y = priceToY(price, priceMin, priceMax, mainTop, mainHeight, scale);
    if (y < mainTop - 2 || y > mainTop + mainHeight + 2) continue;

    const isKey    = isKeyLevel(level);
    const isGolden = isGoldenLevel(level);
    const isNearest = level === nearestLevel;
    const isExt    = level > 1.001;
    const lcolor   = fibColor(level);

    ctx.strokeStyle = isNearest ? "#FFFFFF" : lcolor;
    ctx.lineWidth   = isKey ? (isSelected ? d.lineWidth + 0.5 : d.lineWidth)
                    : isGolden ? 1.2
                    : isNearest ? 1.0
                    : 0.7;
    ctx.setLineDash(isExt ? [6, 3] : isKey ? getLineDash(d.lineStyle || "solid") : (isGolden ? [] : [4, 3]));
    ctx.globalAlpha = isNearest ? d.opacity : d.opacity * (isKey || isGolden ? 0.9 : 0.6);
    ctx.beginPath();
    ctx.moveTo(xLeft, y);
    ctx.lineTo(rightEdge, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = d.opacity;

    // Right label: "61.8% — 1.09234"
    const pctStr   = `${(level * 100).toFixed(1)}%`;
    const priceStr = formatPrice(price, pair);
    const fullText = `${pctStr} \u2014 ${priceStr}`;
    const fs = isKey || isGolden ? 9 : 8;
    ctx.font = `${isKey || isGolden ? "bold " : ""}${fs}px 'IBM Plex Mono', monospace`;
    const tw = ctx.measureText(fullText).width;
    ctx.globalAlpha = d.opacity * 0.72;
    ctx.fillStyle = "rgba(19,23,34,0.72)";
    ctx.fillRect(rightEdge - tw - 10, y - 12, tw + 8, 11);
    ctx.globalAlpha = d.opacity;
    ctx.fillStyle = isNearest ? "#FFFFFF" : lcolor;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(fullText, rightEdge - 5, y - 2);

    // Left label: pct only
    ctx.font = `${fs}px 'IBM Plex Mono', monospace`;
    ctx.fillStyle = lcolor;
    ctx.globalAlpha = d.opacity * 0.65;
    ctx.textAlign = "left";
    ctx.fillText(pctStr, xLeft + 4, y - 2);
    ctx.globalAlpha = d.opacity;

    // Nearest-level proximity badge
    if (isNearest && bars && bars.length > 0 && nearestDist < 300) {
      const cp = bars[bars.length - 1].c;
      const dir = cp > price ? "\u2191" : "\u2193";
      const badge = `${dir} ${nearestDist.toFixed(1)}p`;
      const bw = ctx.measureText(badge).width + 12;
      ctx.save();
      ctx.font = "bold 8px 'IBM Plex Mono', monospace";
      ctx.globalAlpha = d.opacity;
      ctx.fillStyle = "rgba(19,23,34,0.92)";
      ctx.beginPath();
      ctx.roundRect(xLeft + 50, y - 9, bw, 12, 3);
      ctx.fill();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(badge, xLeft + 56, y - 3);
      ctx.restore();
    }
  }

  // ── 3. Anchor connector line ──
  const yStart_ = priceToY(priceStart, priceMin, priceMax, mainTop, mainHeight, scale);
  const yEnd_   = priceToY(priceEnd,   priceMin, priceMax, mainTop, mainHeight, scale);
  ctx.globalAlpha = d.opacity * 0.55;
  ctx.strokeStyle = d.color;
  ctx.lineWidth = d.lineWidth;
  ctx.setLineDash(getLineDash(d.lineStyle || "solid"));
  ctx.beginPath();
  ctx.moveTo(xStart, yStart_);
  ctx.lineTo(xEnd, yEnd_);
  ctx.stroke();
  ctx.setLineDash([]);

  // Anchor vertical marker dashes
  ctx.globalAlpha = d.opacity * 0.25;
  ctx.lineWidth = 0.8;
  ctx.setLineDash([3, 4]);
  for (const x of [xStart, xEnd]) {
    ctx.beginPath();
    ctx.moveTo(x, mainTop);
    ctx.lineTo(x, mainTop + mainHeight);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = d.opacity;

  // ── 4. Selection / hover handles ──
  if (isSelected || isHovered) {
    for (const pt of d.points) {
      const hx = indexToX(pt.index, startIndex, endIndex, chartLeft, chartWidth);
      const hy = priceToY(pt.price, priceMin, priceMax, mainTop, mainHeight, scale);
      const r = isSelected ? 5 : 3.5;
      ctx.beginPath();
      ctx.arc(hx, hy, r, 0, Math.PI * 2);
      ctx.fillStyle = THEME.canvasBg;
      ctx.fill();
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(hx, hy, 2, 0, Math.PI * 2);
      ctx.fillStyle = d.color;
      ctx.fill();
    }
  }

  ctx.restore();
}

// ── Rectangle drawing ─────────────────────────────────

function drawRectangleDrawing(
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
  const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  const x1 = indexToX(d.points[0].index, startIndex, endIndex, chartLeft, chartWidth);
  const y1 = priceToY(d.points[0].price, priceMin, priceMax, mainTop, mainHeight, scale);
  const x2 = indexToX(d.points[1].index, startIndex, endIndex, chartLeft, chartWidth);
  const y2 = priceToY(d.points[1].price, priceMin, priceMax, mainTop, mainHeight, scale);

  let left = Math.min(x1, x2), right = Math.max(x1, x2);
  const top = Math.min(y1, y2), bot = Math.max(y1, y2);
  const w = right - left;
  const h = bot - top;

  // Extend left/right
  if (d.extendLeft) left = chartLeft;
  if (d.extendRight) right = chartLeft + chartWidth;
  const ew = right - left;

  ctx.save();

  // ── Active zone glow (current price inside rectangle) ──
  const topPrice = Math.max(d.points[0].price, d.points[1].price);
  const botPrice = Math.min(d.points[0].price, d.points[1].price);
  const lastBar = bars && bars.length > 0 ? bars[bars.length - 1] : null;
  const isActiveZone = lastBar && lastBar.c >= botPrice && lastBar.c <= topPrice;
  if (isActiveZone && !isSelected) {
    ctx.shadowColor = d.color;
    ctx.shadowBlur = 8;
  }

  // ── Fill ──
  ctx.globalAlpha = d.opacity;
  if (d.fillEnabled !== false) {
    const fc = d.fillColor || d.color;
    ctx.globalAlpha = d.fillOpacity ?? 0.15;
    ctx.fillStyle = fc;
    ctx.fillRect(left, top, ew, h);
    ctx.globalAlpha = d.opacity;
  }
  ctx.shadowBlur = 0;

  // ── Border ──
  ctx.setLineDash(getLineDash(d.lineStyle || "solid"));
  ctx.strokeStyle = d.color;
  ctx.lineWidth = isSelected ? d.lineWidth + 0.5 : d.lineWidth;
  ctx.strokeRect(left, top, ew, h);
  ctx.setLineDash([]);

  // ── Middle line ──
  if (d.midLine) {
    const midY = (top + bot) / 2;
    ctx.setLineDash(getLineDash(d.midLineStyle || "dashed"));
    ctx.strokeStyle = d.midLineColor || d.color;
    ctx.lineWidth = d.midLineWidth || 1;
    ctx.beginPath();
    ctx.moveTo(left, Math.round(midY) + 0.5);
    ctx.lineTo(right, Math.round(midY) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Zone type auto-label ──
  if (!d.label && (isSelected || isHovered) && bars && bars.length > 0) {
    const zoneType = classifyZone(d, bars);
    if (zoneType) {
      ctx.font = "bold 9px 'IBM Plex Mono', monospace";
      ctx.fillStyle = zoneType === "SUPPLY" ? "rgba(239,83,80,0.6)" : zoneType === "DEMAND" ? "rgba(38,166,154,0.6)" : "rgba(149,152,161,0.4)";
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText(zoneType + " ZONE", right - 4, top + 3);
    }
  }

  // ── Label with position ──
  if (d.label) {
    const effColor = d.labelColor || d.color;
    const weight = d.labelBold ? "bold" : "normal";
    const style = d.labelItalic ? "italic" : "normal";
    ctx.font = `${style} ${weight} ${d.labelFontSize || 11}px 'IBM Plex Mono', monospace`;
    ctx.fillStyle = effColor;
    const pos = d.labelPosition || "top-left";
    const pad = 6;
    let lx: number, ly: number;
    if (pos.includes("left")) { ctx.textAlign = "left"; lx = left + pad; }
    else if (pos.includes("right")) { ctx.textAlign = "right"; lx = right - pad; }
    else { ctx.textAlign = "center"; lx = left + ew / 2; }
    if (pos.startsWith("top")) { ctx.textBaseline = "top"; ly = top + pad; }
    else if (pos.startsWith("bottom")) { ctx.textBaseline = "bottom"; ly = bot - pad; }
    else { ctx.textBaseline = "middle"; ly = top + h / 2; }
    ctx.fillText(d.label, lx, ly);
  }

  // ── Stats box ──
  if ((isSelected || d.stats?.alwaysShow) && d.points.length >= 2) {
    const rectStats = computeRectStats(d, bars || [], pair);
    const lines: string[] = [];
    if (d.stats?.showPrice) lines.push(`${rectStats.priceRange}`);
    if (d.stats?.showPips) lines.push(`${rectStats.pips} pips`);
    if (d.stats?.showPercent) lines.push(`${rectStats.percent}`);
    if (d.stats?.showBars) lines.push(`${rectStats.bars} bars`);
    if (d.stats?.showDateRange && rectStats.dateRange !== "—") lines.push(rectStats.dateRange);
    if (lines.length > 0) {
      ctx.font = "10px 'IBM Plex Mono', monospace";
      const boxW = Math.max(...lines.map(l => ctx.measureText(l).width)) + 12;
      const boxH = lines.length * 13 + 8;
      const statsPos = d.stats?.position || "top";
      let bx: number, by: number;
      if (statsPos === "bottom") { bx = left + ew / 2 - boxW / 2; by = bot + 4; }
      else if (statsPos === "left") { bx = left - boxW - 4; by = top + h / 2 - boxH / 2; }
      else if (statsPos === "right") { bx = right + 4; by = top + h / 2 - boxH / 2; }
      else { bx = left + ew / 2 - boxW / 2; by = top - boxH - 4; } // top (default)
      ctx.fillStyle = "rgba(19,23,34,0.92)";
      ctx.beginPath();
      ctx.roundRect(bx, by, boxW, boxH, 3);
      ctx.fill();
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.fillStyle = d.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], bx + boxW / 2, by + 4 + i * 13);
      }
    }
  }

  // ── Active zone indicator badge ──
  if (isActiveZone) {
    ctx.font = "bold 8px 'IBM Plex Mono', monospace";
    ctx.fillStyle = d.color;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText("● ACTIVE", left + 4, bot - 3);
  }

  // ── Selection handles (4 corners + 4 edge midpoints) ──
  if (isSelected || isHovered) {
    const handleAlpha = isSelected ? 0.9 : 0.5;
    const handles = [
      { x: x1, y: y1 }, { x: x2, y: y2 },         // p0, p1 (defining corners)
      { x: x1, y: y2 }, { x: x2, y: y1 },         // adjacent corners
    ];
    const edgeMids = [
      { x: (x1 + x2) / 2, y: Math.min(y1, y2) },  // top edge mid
      { x: (x1 + x2) / 2, y: Math.max(y1, y2) },  // bottom edge mid
      { x: Math.min(x1, x2), y: (y1 + y2) / 2 },  // left edge mid
      { x: Math.max(x1, x2), y: (y1 + y2) / 2 },  // right edge mid
    ];
    ctx.globalAlpha = handleAlpha;
    // Corner handles (circles)
    for (const hp of handles) {
      ctx.beginPath();
      ctx.arc(hp.x, hp.y, isSelected ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = THEME.canvasBg;
      ctx.fill();
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(hp.x, hp.y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = d.color;
      ctx.fill();
    }
    // Edge midpoint handles (small diamonds)
    if (isSelected) {
      for (const ep of edgeMids) {
        ctx.save();
        ctx.translate(ep.x, ep.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = THEME.canvasBg;
        ctx.fillRect(-3, -3, 6, 6);
        ctx.strokeStyle = d.color;
        ctx.lineWidth = 1;
        ctx.strokeRect(-3, -3, 6, 6);
        ctx.restore();
      }
    }
  }

  // ── Lock indicator ──
  if (d.locked) {
    ctx.globalAlpha = 0.5;
    ctx.font = "bold 9px 'IBM Plex Mono', monospace";
    ctx.fillStyle = "#FF9800";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText("🔒", right - 2, top - 2);
  }

  ctx.restore();
}

// ── Rectangle stats ──
function computeRectStats(d: Drawing, bars: Bar[], pair: string) {
  if (d.points.length < 2) return { priceRange: "—", pips: "—", percent: "—", bars: "—", dateRange: "—" };
  const p0 = d.points[0], p1 = d.points[1];
  const priceH = Math.max(p0.price, p1.price);
  const priceL = Math.min(p0.price, p1.price);
  const diff = priceH - priceL;
  const pct = priceL !== 0 ? (diff / priceL) * 100 : 0;
  const pip = getPipSize(pair);
  const pips = diff / pip;
  const barCount = Math.abs(p1.index - p0.index);
  let dateRange = "—";
  const i0 = Math.min(bars.length - 1, Math.max(0, Math.min(p0.index, p1.index)));
  const i1 = Math.min(bars.length - 1, Math.max(0, Math.max(p0.index, p1.index)));
  if (bars[i0] && bars[i1]) dateRange = formatDateRange(bars[i0].t, bars[i1].t);
  return {
    priceRange: `${formatPrice(priceL, pair)} – ${formatPrice(priceH, pair)}`,
    pips: pips.toFixed(1),
    percent: `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`,
    bars: String(barCount),
    dateRange,
  };
}

// ── Zone classification ──
function classifyZone(d: Drawing, bars: Bar[]): "SUPPLY" | "DEMAND" | "RANGE" | null {
  if (d.points.length < 2) return null;
  const leftIdx = Math.min(d.points[0].index, d.points[1].index);
  const rightIdx = Math.max(d.points[0].index, d.points[1].index);
  // Look at bars before the zone
  const lookback = Math.min(10, leftIdx);
  if (lookback < 3 || leftIdx >= bars.length) return null;
  let sumBefore = 0;
  let countBefore = 0;
  for (let i = Math.max(0, leftIdx - lookback); i < leftIdx && i < bars.length; i++) {
    sumBefore += bars[i].c;
    countBefore++;
  }
  // Look at bars after the zone
  const lookAhead = Math.min(10, bars.length - rightIdx - 1);
  if (lookAhead < 1) return null;
  let sumAfter = 0;
  let countAfter = 0;
  for (let i = rightIdx + 1; i <= Math.min(bars.length - 1, rightIdx + lookAhead); i++) {
    sumAfter += bars[i].c;
    countAfter++;
  }
  if (countBefore === 0 || countAfter === 0) return null;
  const avgBefore = sumBefore / countBefore;
  const avgAfter = sumAfter / countAfter;
  const midPrice = (Math.max(d.points[0].price, d.points[1].price) + Math.min(d.points[0].price, d.points[1].price)) / 2;
  // Price dropped after the zone → supply; rose → demand
  if (avgBefore > midPrice && avgAfter < midPrice) return "SUPPLY";
  if (avgBefore < midPrice && avgAfter > midPrice) return "DEMAND";
  if (Math.abs(avgAfter - avgBefore) / midPrice < 0.002) return "RANGE";
  return null;
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
      showAngle: false,
      showMidPoint: false,
      showPriceLabels: false,
      locked: false,
      fillEnabled: d.type === "rectangle",
      fillColor: "",
      fillOpacity: 0.15,
      midLine: false,
      midLineColor: "",
      midLineWidth: 1,
      midLineStyle: "dashed",
      labelPosition: "top-left",
      channelFillEnabled: false,
      channelFillOpacity: 0.15,
      channelFillColor: "",
      brushSize: 2,
      text: "",
      fontSize: 14,
      fontBold: false,
      fontItalic: false,
      backgroundColor: "",
      borderRadius: 4,
      ...d,
      // Ensure stats is fully populated even if partially saved
      stats: { ...DEFAULT_STATS, ...(d.stats || {}) },
    }));
  } catch { return []; }
}
