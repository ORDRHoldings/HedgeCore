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

export function drawDrawings(
  ctx: CanvasRenderingContext2D,
  drawings: Drawing[],
  layout: ChartLayout,
  viewport: Viewport,
  pair: string,
  scale: PriceScale = "linear",
): void {
  for (const d of drawings) {
    switch (d.type) {
      case "trendline": drawTrendlineDrawing(ctx, d, layout, viewport, scale); break;
      case "horizontal": drawHorizontalDrawing(ctx, d, layout, viewport, pair, scale); break;
      case "fibonacci": drawFibonacciDrawing(ctx, d, layout, viewport, pair, scale); break;
      case "rectangle": drawRectangleDrawing(ctx, d, layout, viewport, scale); break;
    }
  }
}

function drawTrendlineDrawing(ctx: CanvasRenderingContext2D, d: Drawing, layout: ChartLayout, viewport: Viewport, scale: PriceScale = "linear"): void {
  if (d.points.length < 2) return;
  const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;
  const x1 = indexToX(d.points[0].index, startIndex, endIndex, chartLeft, chartWidth);
  const y1 = priceToY(d.points[0].price, priceMin, priceMax, mainTop, mainHeight, scale);
  const x2 = indexToX(d.points[1].index, startIndex, endIndex, chartLeft, chartWidth);
  const y2 = priceToY(d.points[1].price, priceMin, priceMax, mainTop, mainHeight, scale);

  ctx.strokeStyle = d.color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawHorizontalDrawing(ctx: CanvasRenderingContext2D, d: Drawing, layout: ChartLayout, viewport: Viewport, pair: string, scale: PriceScale = "linear"): void {
  if (d.points.length < 1) return;
  const { mainTop, mainHeight, priceAxisWidth, canvasWidth } = layout;
  const { priceMin, priceMax } = viewport;
  const y = priceToY(d.points[0].price, priceMin, priceMax, mainTop, mainHeight, scale);

  ctx.strokeStyle = d.color;
  ctx.lineWidth = 1;
  ctx.setLineDash([8, 4]);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(canvasWidth - priceAxisWidth, y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = "10px 'IBM Plex Mono', monospace";
  ctx.fillStyle = d.color;
  ctx.textAlign = "right";
  ctx.fillText(formatPrice(d.points[0].price, pair), canvasWidth - priceAxisWidth - 4, y - 3);
}

function drawFibonacciDrawing(ctx: CanvasRenderingContext2D, d: Drawing, layout: ChartLayout, viewport: Viewport, pair: string, scale: PriceScale = "linear"): void {
  if (d.points.length < 2) return;
  const { mainTop, mainHeight, priceAxisWidth, canvasWidth, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  const p1 = d.points[0].price;
  const p2 = d.points[1].price;
  const x1 = indexToX(d.points[0].index, startIndex, endIndex, chartLeft, chartWidth);
  const x2 = indexToX(d.points[1].index, startIndex, endIndex, chartLeft, chartWidth);
  const rightEdge = canvasWidth - priceAxisWidth;

  for (const level of FIB_LEVELS) {
    const price = p2 + (p1 - p2) * level;
    const y = priceToY(price, priceMin, priceMax, mainTop, mainHeight, scale);

    ctx.strokeStyle = d.color;
    ctx.lineWidth = 0.5;
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
}

function drawRectangleDrawing(ctx: CanvasRenderingContext2D, d: Drawing, layout: ChartLayout, viewport: Viewport, scale: PriceScale = "linear"): void {
  if (d.points.length < 2) return;
  const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  const x1 = indexToX(d.points[0].index, startIndex, endIndex, chartLeft, chartWidth);
  const y1 = priceToY(d.points[0].price, priceMin, priceMax, mainTop, mainHeight, scale);
  const x2 = indexToX(d.points[1].index, startIndex, endIndex, chartLeft, chartWidth);
  const y2 = priceToY(d.points[1].price, priceMin, priceMax, mainTop, mainHeight, scale);

  ctx.fillStyle = d.color.replace(")", ",0.08)").replace("rgb", "rgba");
  ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  ctx.strokeStyle = d.color;
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
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
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
