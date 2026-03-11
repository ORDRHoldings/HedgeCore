import type { ChartLayout, Viewport } from "../core/data";
import type { PriceScale } from "../core/data";
import { priceToY, indexToX, formatPrice } from "../core/data";
import { THEME } from "../core/theme";

export type DrawingType = "trendline" | "horizontal" | "fibonacci" | "rectangle";

export interface Drawing {
  id: string;
  type: DrawingType;
  points: { index: number; price: number }[];
  color: string;
  lineWidth: number;
  label: string;
  extendLeft: boolean;
  extendRight: boolean;
  showAngle: boolean;
  opacity: number;
}

const DRAWING_COLORS: Record<DrawingType, string> = {
  trendline: THEME.drawTrendline,
  horizontal: THEME.drawHorizontal,
  fibonacci: THEME.drawFibonacci,
  rectangle: THEME.drawRectangle,
};

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

export function getDefaultColor(type: DrawingType): string {
  return DRAWING_COLORS[type];
}

/** Create a new Drawing with sensible defaults */
export function createDrawing(type: DrawingType, points: { index: number; price: number }[], overrides?: Partial<Drawing>): Drawing {
  return {
    id: `d_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    points,
    color: getDefaultColor(type),
    lineWidth: 1.5,
    label: "",
    extendLeft: false,
    extendRight: false,
    showAngle: true,
    opacity: 1,
    ...overrides,
  };
}

// ── Hit Testing ─────────────────────────────────────────

/** Distance from point (px, py) to line segment (x1,y1)-(x2,y2) */
function pointToSegmentDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Distance from point to infinite line through two points */
function pointToLineDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(px - x1, py - y1);
  return Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / len;
}

export interface HitTestResult {
  drawingId: string;
  distance: number;
  /** Which part was hit: "body" | "p0" | "p1" */
  part: "body" | "p0" | "p1";
}

const HIT_THRESHOLD = 8; // pixels
const HANDLE_RADIUS = 6;

/** Test if a point (mx, my) in canvas coords hits any drawing. Returns closest hit or null. */
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

      // Check handles first
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

      // Check body — if extended, use infinite line, else segment
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

      // Check near edges
      if (mx >= left - HIT_THRESHOLD && mx <= right + HIT_THRESHOLD &&
          my >= top - HIT_THRESHOLD && my <= bot + HIT_THRESHOLD) {
        const dLeft = Math.abs(mx - left), dRight = Math.abs(mx - right);
        const dTop = Math.abs(my - top), dBot = Math.abs(my - bot);
        const minEdge = Math.min(dLeft, dRight, dTop, dBot);
        if (minEdge <= HIT_THRESHOLD && (!best || minEdge < best.distance)) {
          best = { drawingId: d.id, distance: minEdge, part: "body" };
        }
      }
    } else if (d.type === "fibonacci") {
      if (d.points.length < 2) continue;
      // Hit test the anchor line between p0 and p1
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

// ── Angle Computation ─────────────────────────────────────

/** Compute angle in degrees from horizontal (right = 0°, up = positive) */
function computeAngle(x1: number, y1: number, x2: number, y2: number): number {
  // Canvas Y is inverted (down = positive), so negate dy for conventional angle
  const dx = x2 - x1;
  const dy = -(y2 - y1);
  return Math.atan2(dy, dx) * (180 / Math.PI);
}

// ── Drawing Renderers ─────────────────────────────────────

export function drawDrawings(
  ctx: CanvasRenderingContext2D,
  drawings: Drawing[],
  layout: ChartLayout,
  viewport: Viewport,
  pair: string,
  scale: PriceScale = "linear",
  selectedId?: string | null,
  hoveredId?: string | null,
): void {
  for (const d of drawings) {
    const isSelected = d.id === selectedId;
    const isHovered = d.id === hoveredId;
    switch (d.type) {
      case "trendline": drawTrendlineDrawing(ctx, d, layout, viewport, scale, isSelected, isHovered); break;
      case "horizontal": drawHorizontalDrawing(ctx, d, layout, viewport, pair, scale, isSelected, isHovered); break;
      case "fibonacci": drawFibonacciDrawing(ctx, d, layout, viewport, pair, scale, isSelected, isHovered); break;
      case "rectangle": drawRectangleDrawing(ctx, d, layout, viewport, scale, isSelected, isHovered); break;
    }
  }
}

function drawTrendlineDrawing(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale,
  isSelected: boolean,
  isHovered: boolean,
): void {
  if (d.points.length < 2) return;
  const { mainTop, mainHeight, chartLeft, chartWidth, priceAxisWidth, canvasWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;
  const x1 = indexToX(d.points[0].index, startIndex, endIndex, chartLeft, chartWidth);
  const y1 = priceToY(d.points[0].price, priceMin, priceMax, mainTop, mainHeight, scale);
  const x2 = indexToX(d.points[1].index, startIndex, endIndex, chartLeft, chartWidth);
  const y2 = priceToY(d.points[1].price, priceMin, priceMax, mainTop, mainHeight, scale);
  const rightEdge = canvasWidth - priceAxisWidth;

  ctx.save();
  ctx.globalAlpha = d.opacity;
  ctx.strokeStyle = d.color;
  ctx.lineWidth = isSelected ? d.lineWidth + 0.5 : d.lineWidth;

  // Draw the main line segment
  ctx.beginPath();

  // Extend left
  if (d.extendLeft) {
    const slope = (y2 - y1) / (x2 - x1 || 1);
    const extLeftX = chartLeft;
    const extLeftY = y1 + slope * (extLeftX - x1);
    ctx.moveTo(extLeftX, extLeftY);
    ctx.lineTo(x1, y1);
  } else {
    ctx.moveTo(x1, y1);
  }

  ctx.lineTo(x2, y2);

  // Extend right
  if (d.extendRight) {
    const slope = (y2 - y1) / (x2 - x1 || 1);
    const extRightX = rightEdge;
    const extRightY = y2 + slope * (extRightX - x2);
    ctx.lineTo(extRightX, extRightY);
  }

  ctx.stroke();

  // Angle badge
  if (d.showAngle) {
    const angle = computeAngle(x1, y1, x2, y2);
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const angleText = `${angle.toFixed(1)}°`;

    ctx.font = "bold 9px 'IBM Plex Mono', monospace";
    const tw = ctx.measureText(angleText).width;
    const pad = 4;

    // Badge background
    ctx.fillStyle = "rgba(19,23,34,0.85)";
    const badgeX = midX - tw / 2 - pad;
    const badgeY = midY - 18;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, tw + pad * 2, 16, 3);
    ctx.fill();
    ctx.strokeStyle = d.color;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.fillStyle = d.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(angleText, midX, midY - 10);
  }

  // Label
  if (d.label) {
    const labelX = x2 + 8;
    const labelY = y2 - 4;
    ctx.font = "10px 'IBM Plex Mono', monospace";
    const tw = ctx.measureText(d.label).width;

    // Label background
    ctx.fillStyle = "rgba(19,23,34,0.85)";
    ctx.beginPath();
    ctx.roundRect(labelX - 3, labelY - 10, tw + 6, 14, 2);
    ctx.fill();

    ctx.fillStyle = d.color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(d.label, labelX, labelY - 3);
  }

  // Selection handles
  if (isSelected || isHovered) {
    const handleR = isSelected ? 5 : 3.5;
    for (const [px, py] of [[x1, y1], [x2, y2]]) {
      // Outer ring
      ctx.beginPath();
      ctx.arc(px, py, handleR, 0, Math.PI * 2);
      ctx.fillStyle = THEME.canvasBg;
      ctx.fill();
      ctx.strokeStyle = d.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Inner dot
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fillStyle = d.color;
      ctx.fill();
    }
  }

  ctx.restore();
}

/** Draw a rubber-band preview line from the first placed point to the current cursor */
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
): void {
  const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;
  const x1 = indexToX(firstPoint.index, startIndex, endIndex, chartLeft, chartWidth);
  const y1 = priceToY(firstPoint.price, priceMin, priceMax, mainTop, mainHeight, scale);

  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = color || getDefaultColor(drawingType);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);

  if (drawingType === "trendline" || drawingType === "fibonacci") {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(cursorX, cursorY);
    ctx.stroke();

    // Show angle in real-time
    const angle = computeAngle(x1, y1, cursorX, cursorY);
    const midX = (x1 + cursorX) / 2;
    const midY = (y1 + cursorY) / 2;
    ctx.setLineDash([]);
    ctx.font = "bold 9px 'IBM Plex Mono', monospace";
    ctx.fillStyle = color || getDefaultColor(drawingType);
    ctx.textAlign = "center";
    ctx.fillText(`${angle.toFixed(1)}°`, midX, midY - 10);

    // Distance in price
    const cursorPrice = priceMin + ((mainTop + mainHeight - cursorY) / mainHeight) * (priceMax - priceMin);
    const priceDiff = cursorPrice - firstPoint.price;
    const pips = Math.abs(priceDiff * 10000).toFixed(1);
    ctx.fillText(`${pips} pips`, midX, midY + 10);
  } else if (drawingType === "rectangle") {
    const w = cursorX - x1;
    const h = cursorY - y1;
    ctx.strokeRect(x1, y1, w, h);
    ctx.fillStyle = (color || getDefaultColor(drawingType)).replace(")", ",0.06)").replace("rgb", "rgba");
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
  ctx.strokeStyle = color || getDefaultColor(drawingType);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x1, y1, 1.5, 0, Math.PI * 2);
  ctx.fillStyle = color || getDefaultColor(drawingType);
  ctx.fill();

  ctx.restore();
}

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
  ctx.setLineDash([8, 4]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(canvasWidth - priceAxisWidth, y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = "10px 'IBM Plex Mono', monospace";
  ctx.fillStyle = d.color;
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
    ctx.setLineDash(level === 0 || level === 1 ? [] : [4, 4]);
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

function drawRectangleDrawing(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  layout: ChartLayout,
  viewport: Viewport,
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
  ctx.strokeStyle = d.color;
  ctx.lineWidth = isSelected ? d.lineWidth + 0.5 : d.lineWidth;
  ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));

  if (d.label) {
    ctx.font = "10px 'IBM Plex Mono', monospace";
    ctx.fillStyle = d.color;
    ctx.textAlign = "left";
    ctx.fillText(d.label, Math.min(x1, x2) + 4, Math.min(y1, y2) + 12);
  }

  ctx.restore();
}

// ── Persistence ─────────────────────────────────────────

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
    // Migrate old drawings missing new fields
    return parsed.map((d: Partial<Drawing> & { id: string; type: DrawingType; points: { index: number; price: number }[]; color: string }) => ({
      lineWidth: 1.5,
      label: "",
      extendLeft: false,
      extendRight: false,
      showAngle: true,
      opacity: 1,
      ...d,
    }));
  } catch { return []; }
}
