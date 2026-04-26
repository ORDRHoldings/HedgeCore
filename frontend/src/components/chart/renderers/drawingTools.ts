/**
 * drawingTools.ts — Extended drawing tool renderers for all new drawing types.
 *
 * Covers: line tools, channel tools, fibonacci tools, gann tools,
 * pattern tools, shape tools, measurement tools, annotation tools.
 * Each tool has a dedicated renderer and hit-test function.
 */

import type { Drawing, LineStyle, HitTestResult } from "./drawings";
import type { ChartLayout, Viewport, PriceScale } from "../core/data";
import type { Bar } from "../indicators/types";
import { priceToY, indexToX, formatPrice } from "../core/data";
import { THEME } from "../core/theme";

// ══════════════════════════════════════════════════════
//  Shared Helpers
// ══════════════════════════════════════════════════════

function ptToSegDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function ptToLineDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(px - x1, py - y1);
  return Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / len;
}

function getLineDash(style: LineStyle): number[] {
  switch (style) {
    case "dashed": return [6, 4];
    case "dotted": return [2, 2];
    default: return [];
  }
}

function drawHandle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, filled: boolean): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = filled ? color : THEME.canvasBg;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  if (!filled) {
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

function _drawDiamondHandle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = THEME.canvasBg;
  ctx.fillRect(-size, -size, size * 2, size * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(-size, -size, size * 2, size * 2);
  ctx.restore();
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, bg?: string, fontSize?: number): void {
  const fs = fontSize || 9;
  ctx.font = `${fs}px 'IBM Plex Mono', monospace`;
  const tw = ctx.measureText(text).width;
  const pad = 4;
  ctx.fillStyle = bg || "rgba(19,23,34,0.9)";
  ctx.beginPath();
  ctx.roundRect(x - tw / 2 - pad, y - fs / 2 - pad, tw + pad * 2, fs + pad * 2, 3);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

const HIT_THRESH = 8;
const HANDLE_R = 6;

// ══════════════════════════════════════════════════════
//  Coordinate helpers (local shorthand)
// ══════════════════════════════════════════════════════

interface Coords {
  mainTop: number; mainHeight: number;
  chartLeft: number; chartWidth: number;
  startIndex: number; endIndex: number;
  priceMin: number; priceMax: number;
  rightEdge: number;
  scale: PriceScale;
}

function getCoords(layout: ChartLayout, viewport: Viewport, scale: PriceScale): Coords {
  return {
    mainTop: layout.mainTop, mainHeight: layout.mainHeight,
    chartLeft: layout.chartLeft, chartWidth: layout.chartWidth,
    startIndex: viewport.startIndex, endIndex: viewport.endIndex,
    priceMin: viewport.priceMin, priceMax: viewport.priceMax,
    rightEdge: layout.canvasWidth - layout.priceAxisWidth,
    scale,
  };
}

function ix(index: number, c: Coords): number {
  return indexToX(index, c.startIndex, c.endIndex, c.chartLeft, c.chartWidth);
}

function py(price: number, c: Coords): number {
  return priceToY(price, c.priceMin, c.priceMax, c.mainTop, c.mainHeight, c.scale);
}

// ══════════════════════════════════════════════════════
//  Common drawing setup
// ══════════════════════════════════════════════════════

function setupStroke(ctx: CanvasRenderingContext2D, d: Drawing, isSelected: boolean): void {
  ctx.strokeStyle = d.color;
  ctx.lineWidth = isSelected ? d.lineWidth + 0.5 : d.lineWidth;
  ctx.setLineDash(getLineDash(d.lineStyle));
}

function drawHandles(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (!isSelected && !isHovered) return;
  const r = isSelected ? 5 : 3.5;
  for (const pt of d.points) {
    drawHandle(ctx, ix(pt.index, c), py(pt.price, c), r, d.color, false);
  }
}

function handleHitTest(mx: number, my: number, d: Drawing, c: Coords): HitTestResult | null {
  for (let i = 0; i < d.points.length; i++) {
    const px = ix(d.points[i].index, c);
    const pyy = py(d.points[i].price, c);
    const dist = Math.hypot(mx - px, my - pyy);
    if (dist <= HANDLE_R) {
      return { drawingId: d.id, distance: dist, part: `p${i}` };
    }
  }
  return null;
}

// ══════════════════════════════════════════════════════
//  LINE TOOLS
// ══════════════════════════════════════════════════════

function clipLineToRect(
  x1: number, y1: number, x2: number, y2: number,
  left: number, top: number, right: number, bottom: number,
): [number, number, number, number] | null {
  const dx = x2 - x1, dy = y2 - y1;
  let tMin = -1e9, tMax = 1e9;
  if (dx !== 0) {
    const t1 = (left - x1) / dx, t2 = (right - x1) / dx;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  } else if (x1 < left || x1 > right) return null;
  if (dy !== 0) {
    const t1 = (top - y1) / dy, t2 = (bottom - y1) / dy;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  } else if (y1 < top || y1 > bottom) return null;
  if (tMin > tMax) return null;
  return [x1 + tMin * dx, y1 + tMin * dy, x1 + tMax * dx, y1 + tMax * dy];
}

function drawRay(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 2) return;
  const x1 = ix(d.points[0].index, c), y1 = py(d.points[0].price, c);
  const x2 = ix(d.points[1].index, c), y2 = py(d.points[1].price, c);
  const dx = x2 - x1, dy = y2 - y1;
  // Extend past p1 to chart edge
  let farX = x2, farY = y2;
  if (Math.abs(dx) > 0.001) {
    const t = dx > 0 ? (c.rightEdge - x1) / dx : (c.chartLeft - x1) / dx;
    farX = x1 + t * dx;
    farY = y1 + t * dy;
  } else {
    farY = dy > 0 ? c.mainTop + c.mainHeight : c.mainTop;
    farX = x1;
  }
  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(farX, farY);
  ctx.stroke();
  ctx.setLineDash([]);
  // INNOVATION: Persistence ray — target price reach indicator
  if (d.targetPrice !== undefined) {
    const ty = py(d.targetPrice, c);
    const pipSize = (d.points[0]?.price ?? 1) > 10 ? 0.01 : 0.0001;
    const pips = ((d.targetPrice - d.points[0].price) / pipSize);
    ctx.save();
    ctx.globalAlpha = d.opacity * 0.7;
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x1, ty);
    ctx.lineTo(c.rightEdge, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    drawLabel(ctx, `TARGET ${pips >= 0 ? "+" : ""}${pips.toFixed(1)}p`, c.rightEdge - 10, ty - 10, "#FFD700", "rgba(30,25,0,0.9)");
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawExtendedLine(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 2) return;
  const x1 = ix(d.points[0].index, c), y1 = py(d.points[0].price, c);
  const x2 = ix(d.points[1].index, c), y2 = py(d.points[1].price, c);
  const clipped = clipLineToRect(x1, y1, x2, y2, c.chartLeft, c.mainTop, c.rightEdge, c.mainTop + c.mainHeight);
  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);
  if (clipped) {
    ctx.beginPath();
    ctx.moveTo(clipped[0], clipped[1]);
    ctx.lineTo(clipped[2], clipped[3]);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // INNOVATION: Slope velocity badge
  {
    const barDelta = (d.points[1].index - d.points[0].index) || 1;
    const priceDelta = d.points[1].price - d.points[0].price;
    const pipSize = (d.points[0]?.price ?? 1) > 10 ? 0.01 : 0.0001;
    const pipsPerBar = (priceDelta / pipSize) / barDelta;
    const isHigh = Math.abs(pipsPerBar) > 5;
    const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
    ctx.save();
    ctx.globalAlpha = d.opacity;
    drawLabel(ctx, `${pipsPerBar >= 0 ? "+" : ""}${pipsPerBar.toFixed(2)}p/bar`, midX, midY - 12, isHigh ? "#EF5350" : d.color, isHigh ? "rgba(80,0,0,0.85)" : undefined);
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawHorizontalRay(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 1) return;
  const x1 = ix(d.points[0].index, c), y1 = py(d.points[0].price, c);
  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(c.rightEdge, y1);
  ctx.stroke();
  ctx.setLineDash([]);
  // INNOVATION: Level clustering confluence zone
  if (d.confluenceZoneEnabled) {
    const bandH = 6;
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#26A69A";
    ctx.fillRect(x1, y1 - bandH / 2, c.rightEdge - x1, bandH);
    ctx.globalAlpha = d.opacity;
    drawLabel(ctx, "CONFLUENCE ZONE", (x1 + c.rightEdge) / 2, y1 - bandH - 8, "#26A69A", "rgba(0,30,25,0.9)");
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawVerticalLine(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 1) return;
  const x1 = ix(d.points[0].index, c);
  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);
  ctx.beginPath();
  ctx.moveTo(x1, c.mainTop);
  ctx.lineTo(x1, c.mainTop + c.mainHeight);
  ctx.stroke();
  ctx.setLineDash([]);
  // INNOVATION: Calendar event pin
  if (d.eventType) {
    const eventColors: Record<string, string> = {
      NFP: "#EF5350", CPI: "#FF9800", FOMC: "#2196F3",
      CB_MEETING: "#9C27B0", EARNINGS: "#FFD700",
    };
    const ec = eventColors[d.eventType] || d.color;
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = ec;
    ctx.fillRect(x1 - 4, c.mainTop, 8, c.mainHeight);
    ctx.globalAlpha = d.opacity;
    drawLabel(ctx, d.eventType.replace("_", " "), x1, c.mainTop + 24, ec, "rgba(10,10,20,0.9)");
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawCrossLine(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 1) return;
  const x1 = ix(d.points[0].index, c), y1 = py(d.points[0].price, c);
  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);
  ctx.beginPath();
  ctx.moveTo(c.chartLeft, y1);
  ctx.lineTo(c.rightEdge, y1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, c.mainTop);
  ctx.lineTo(x1, c.mainTop + c.mainHeight);
  ctx.stroke();
  ctx.setLineDash([]);
  // INNOVATION: Market structure quadrant label
  {
    const midPrice = (c.priceMin + c.priceMax) / 2;
    const midBar = (c.startIndex + c.endIndex) / 2;
    const isHigh = d.points[0].price >= midPrice;
    const isRight = d.points[0].index >= midBar;
    const label = isHigh && isRight ? "HH" : isHigh && !isRight ? "HL" : !isHigh && isRight ? "LH" : "LL";
    const labelColor = isHigh ? "#26A69A" : "#EF5350";
    ctx.save();
    ctx.globalAlpha = d.opacity;
    drawLabel(ctx, label, x1 + 16, y1 - 16, labelColor, "rgba(10,10,20,0.9)", 10);
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawInfoLine(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, pair: string, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 2) return;
  const x1 = ix(d.points[0].index, c), y1 = py(d.points[0].price, c);
  const x2 = ix(d.points[1].index, c), y2 = py(d.points[1].price, c);
  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Measurement box
  const priceDiff = d.points[1].price - d.points[0].price;
  const pipSize = pair.toUpperCase().includes("JPY") ? 0.01 : 0.0001;
  const pips = priceDiff / pipSize;
  const pct = d.points[0].price !== 0 ? (priceDiff / d.points[0].price) * 100 : 0;
  const barCount = Math.abs(d.points[1].index - d.points[0].index);
  const angle = Math.atan2(-(y2 - y1), x2 - x1) * (180 / Math.PI);

  const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
  const lines = [
    `${pips >= 0 ? "+" : ""}${pips.toFixed(1)} pips`,
    `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`,
    `${barCount} bars`,
    `${angle.toFixed(1)}\u00B0`,
  ];
  ctx.font = "9px 'IBM Plex Mono', monospace";
  const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
  const boxW = maxW + 12, boxH = lines.length * 13 + 8;
  const bx = midX - boxW / 2, by = midY - boxH - 8;
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
    ctx.fillText(lines[i], midX, by + 4 + i * 13);
  }

  // INNOVATION: R/R stop levels
  if (d.rRatios && d.rRatios.length > 0) {
    const move = d.points[1].price - d.points[0].price;
    ctx.save();
    ctx.globalAlpha = d.opacity * 0.8;
    ctx.setLineDash([3, 3]);
    for (const ratio of d.rRatios) {
      const slPrice = d.points[0].price - move / ratio;
      const sly = py(slPrice, c);
      if (sly < c.mainTop || sly > c.mainTop + c.mainHeight) continue;
      ctx.strokeStyle = "#EF5350";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x1, sly);
      ctx.lineTo(x2, sly);
      ctx.stroke();
      drawLabel(ctx, `SL 1:${ratio}`, x2 + 4, sly, "#EF5350", "rgba(30,0,0,0.85)", 8);
    }
    ctx.setLineDash([]);
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawTrendAngle(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 2) return;
  const x1 = ix(d.points[0].index, c), y1 = py(d.points[0].price, c);
  const x2 = ix(d.points[1].index, c), y2 = py(d.points[1].price, c);
  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Arc showing angle at origin
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const arcR = 30;
  ctx.beginPath();
  ctx.arc(x1, y1, arcR, 0, -angle, angle > 0);
  ctx.strokeStyle = d.color;
  ctx.lineWidth = 1;
  ctx.stroke();

  const degAngle = Math.atan2(-(y2 - y1), x2 - x1) * (180 / Math.PI);
  drawLabel(ctx, `${degAngle.toFixed(1)}\u00B0`, x1 + arcR + 20, y1, d.color);

  // INNOVATION: Gann angle overlay
  {
    const gannAngles = [7.5, 15, 18.75, 26.6, 45, 63.4, 71.25, 75, 82.5];
    const gannLabels = ["1x8", "1x4", "1x3", "1x2", "1x1", "2x1", "3x1", "4x1", "8x1"];
    let nearest = 45, nearestLabel = "1x1";
    let minDiff = Infinity;
    for (let gi = 0; gi < gannAngles.length; gi++) {
      const diff = Math.abs(Math.abs(degAngle) - gannAngles[gi]);
      if (diff < minDiff) { minDiff = diff; nearest = gannAngles[gi]; nearestLabel = gannLabels[gi]; }
    }
    const gannRad = (nearest * Math.PI) / 180 * (degAngle < 0 ? -1 : 1);
    const gannLen = Math.hypot(x2 - x1, y2 - y1) * 1.3;
    ctx.save();
    ctx.globalAlpha = d.opacity * 0.5;
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 0.8;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 + gannLen * Math.cos(-gannRad), y1 + gannLen * Math.sin(-gannRad));
    ctx.stroke();
    ctx.setLineDash([]);
    drawLabel(ctx, `GANN ${nearestLabel}`, x1 + gannLen * Math.cos(-gannRad) * 0.7, y1 + gannLen * Math.sin(-gannRad) * 0.7 - 12, "#FFD700", "rgba(25,20,0,0.85)", 8);
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

// ══════════════════════════════════════════════════════
//  CHANNEL TOOLS
// ══════════════════════════════════════════════════════

function drawParallelChannel(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 3) return;
  const x1 = ix(d.points[0].index, c), y1 = py(d.points[0].price, c);
  const x2 = ix(d.points[1].index, c), y2 = py(d.points[1].price, c);
  const x3 = ix(d.points[2].index, c), y3 = py(d.points[2].price, c);

  // Offset: project p2 onto the perpendicular of the p0-p1 line
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  const nx = -dy / len, ny = dx / len;
  const proj = (x3 - x1) * nx + (y3 - y1) * ny;
  // Second line endpoints offset by proj along normal
  const ox1 = x1 + proj * nx, oy1 = y1 + proj * ny;
  const ox2 = x2 + proj * nx, oy2 = y2 + proj * ny;

  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);

  // Fill between lines
  if (d.channelFillEnabled !== false) {
    const fillAlpha = d.channelFillOpacity ?? 0.15;
    ctx.globalAlpha = fillAlpha;
    ctx.fillStyle = d.channelFillColor || d.color;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(ox2, oy2);
    ctx.lineTo(ox1, oy1);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = d.opacity;
  }

  // Line 1
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Line 2
  ctx.beginPath();
  ctx.moveTo(ox1, oy1);
  ctx.lineTo(ox2, oy2);
  ctx.stroke();

  // Middle line (dashed)
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = Math.max(0.5, d.lineWidth - 0.5);
  ctx.beginPath();
  ctx.moveTo((x1 + ox1) / 2, (y1 + oy1) / 2);
  ctx.lineTo((x2 + ox2) / 2, (y2 + oy2) / 2);
  ctx.stroke();

  ctx.setLineDash([]);
  // INNOVATION: Fibonacci channel subdivisions
  if (d.fibSubdivisions) {
    const fibRatios = [0.236, 0.382, 0.5, 0.618, 0.764];
    const fibColors = ["#787B86", "#FF9800", "#2196F3", "#FFD700", "#787B86"];
    ctx.save();
    for (let fi = 0; fi < fibRatios.length; fi++) {
      const r = fibRatios[fi];
      const fx1 = x1 + (ox1 - x1) * r, fy1 = y1 + (oy1 - y1) * r;
      const fx2 = x2 + (ox2 - x2) * r, fy2 = y2 + (oy2 - y2) * r;
      ctx.globalAlpha = d.opacity * 0.5;
      ctx.strokeStyle = fibColors[fi];
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(fx1, fy1);
      ctx.lineTo(fx2, fy2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "8px 'IBM Plex Mono', monospace";
      ctx.fillStyle = fibColors[fi];
      ctx.textAlign = "right";
      ctx.globalAlpha = d.opacity;
      ctx.fillText(`${(r * 100).toFixed(1)}%`, fx2 - 4, fy2 - 3);
    }
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawRegressionTrend(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean, bars?: Bar[]): void {
  if (d.points.length < 2 || !bars || bars.length === 0) return;
  const i0 = Math.max(0, Math.min(Math.round(d.points[0].index), bars.length - 1));
  const i1 = Math.max(0, Math.min(Math.round(d.points[1].index), bars.length - 1));
  const start = Math.min(i0, i1), end = Math.max(i0, i1);
  if (end <= start) return;

  // Linear regression
  const n = end - start + 1;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = start; i <= end; i++) {
    const x = i - start;
    const y = bars[i].c;
    sumX += x; sumY += y; sumXY += x * y; sumXX += x * x;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX || 1);
  const intercept = (sumY - slope * sumX) / n;

  // Std deviation
  let sumSqErr = 0;
  for (let i = start; i <= end; i++) {
    const pred = intercept + slope * (i - start);
    const err = bars[i].c - pred;
    sumSqErr += err * err;
  }
  const stdDev = Math.sqrt(sumSqErr / n);

  const regStart = intercept;
  const regEnd = intercept + slope * (end - start);
  const rSquared = 1 - sumSqErr / (n * ((sumY / n) ** 2) || 1);

  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);

  const sx = ix(start, c), ex = ix(end, c);
  const sy = py(regStart, c), ey = py(regEnd, c);
  const supy = py(regStart + stdDev, c), eupy = py(regEnd + stdDev, c);
  const sloy = py(regStart - stdDev, c), eloy = py(regEnd - stdDev, c);

  // Fill between std dev lines
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = d.color;
  ctx.beginPath();
  ctx.moveTo(sx, supy);
  ctx.lineTo(ex, eupy);
  ctx.lineTo(ex, eloy);
  ctx.lineTo(sx, sloy);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = d.opacity;

  // Regression line
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  // Upper/lower std dev lines
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = Math.max(0.5, d.lineWidth - 0.5);
  ctx.beginPath();
  ctx.moveTo(sx, supy);
  ctx.lineTo(ex, eupy);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx, sloy);
  ctx.lineTo(ex, eloy);
  ctx.stroke();
  ctx.setLineDash([]);

  // R-squared label (replaced by INNOVATION block)
  // INNOVATION: Live R² badge with strength and mean reversion zone
  {
    const rSqAbs = Math.abs(rSquared).toFixed(3);
    const isWeak = Math.abs(rSquared) < 0.6;
    const badgeColor = isWeak ? "#FF9800" : "#26A69A";
    drawLabel(ctx, `R\u00B2 ${rSqAbs} ${isWeak ? "WEAK" : "STRONG"}`, ex + 10, ey, badgeColor, isWeak ? "rgba(40,20,0,0.9)" : "rgba(0,30,25,0.9)");
    // Show MEAN REVERSION ZONE label when inside ±1σ band
    if (d.showMeanReversionZone) {
      ctx.save();
      ctx.globalAlpha = d.opacity * 0.7;
      ctx.fillStyle = "#2196F3";
      ctx.font = "8px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText("MEAN REVERSION ZONE", (sx + ex) / 2, (supy + eupy) / 2 + 8);
      ctx.restore();
    }
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawFlatTopBottom(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 3) return;
  const x1 = ix(d.points[0].index, c), y1 = py(d.points[0].price, c);
  const x2 = ix(d.points[1].index, c), y2 = py(d.points[1].price, c);
  const y3 = py(d.points[2].price, c);

  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);

  // Fill
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = d.color;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x2, y3);
  ctx.lineTo(x1, y3);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = d.opacity;

  // Diagonal line
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Horizontal line
  ctx.beginPath();
  ctx.moveTo(x1, y3);
  ctx.lineTo(x2, y3);
  ctx.stroke();

  ctx.setLineDash([]);
  // INNOVATION: Supply/demand zone classification
  {
    const zonePrice = (d.points[0].price + d.points[2].price) / 2;
    const visibleMid = (c.priceMin + c.priceMax) / 2;
    const isResistance = zonePrice > visibleMid;
    const label = isResistance ? "RESISTANCE" : "SUPPORT";
    const zcolor = isResistance ? "#EF5350" : "#26A69A";
    const midX = (x1 + x2) / 2, midY = (y1 + y3) / 2;
    ctx.save();
    ctx.globalAlpha = d.opacity;
    drawLabel(ctx, label, midX, midY, zcolor, isResistance ? "rgba(30,0,0,0.85)" : "rgba(0,25,20,0.85)", 9);
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawDisjointChannel(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 4) return;
  const pts = d.points.map(p => ({ x: ix(p.index, c), y: py(p.price, c) }));

  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);

  // Fill between
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = d.color;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  ctx.lineTo(pts[1].x, pts[1].y);
  ctx.lineTo(pts[3].x, pts[3].y);
  ctx.lineTo(pts[2].x, pts[2].y);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = d.opacity;

  // Line 1
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  ctx.lineTo(pts[1].x, pts[1].y);
  ctx.stroke();

  // Line 2
  ctx.beginPath();
  ctx.moveTo(pts[2].x, pts[2].y);
  ctx.lineTo(pts[3].x, pts[3].y);
  ctx.stroke();

  ctx.setLineDash([]);
  // INNOVATION: Channel divergence indicator
  {
    const slope1 = (pts[1].y - pts[0].y) / ((pts[1].x - pts[0].x) || 1);
    const slope2 = (pts[3].y - pts[2].y) / ((pts[3].x - pts[2].x) || 1);
    const slopeDiff = slope2 - slope1;
    let divergenceLabel: string, dcolor: string;
    if (Math.abs(slopeDiff) < 0.05) { divergenceLabel = "PARALLEL"; dcolor = "#26A69A"; }
    else if (slopeDiff > 0) { divergenceLabel = "EXPANDING"; dcolor = "#EF5350"; }
    else { divergenceLabel = "CONTRACTING"; dcolor = "#FF9800"; }
    const midX = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
    const midY = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
    ctx.save();
    ctx.globalAlpha = d.opacity;
    drawLabel(ctx, divergenceLabel, midX, midY, dcolor, "rgba(10,10,20,0.9)", 8);
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawPitchforkCore(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean, variant: string, bars?: Bar[]): void {
  if (d.points.length < 3) return;
  const x0 = ix(d.points[0].index, c), y0 = py(d.points[0].price, c);
  const x1 = ix(d.points[1].index, c), y1 = py(d.points[1].price, c);
  const x2 = ix(d.points[2].index, c), y2 = py(d.points[2].price, c);

  const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
  let anchorX = x0, anchorY = y0;

  if (variant === "schiff") {
    anchorX = (x0 + midX) / 2;
    anchorY = (y0 + midY) / 2;
  } else if (variant === "mod_schiff") {
    anchorX = (x0 + x1) / 2;
    anchorY = y0;
  } else if (variant === "inside") {
    // Narrower: use midpoints of anchor-p1 and anchor-p2 as starts
  }

  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);

  // Direction vector from anchor to midpoint
  const dx = midX - anchorX, dy = midY - anchorY;
  const extend = 3; // Extend 3x the length

  // Median line
  ctx.beginPath();
  ctx.moveTo(anchorX, anchorY);
  ctx.lineTo(anchorX + dx * extend, anchorY + dy * extend);
  ctx.stroke();

  // Outer lines parallel to median through p1 and p2
  let startX1 = x1, startY1 = y1, startX2 = x2, startY2 = y2;
  if (variant === "inside") {
    startX1 = (x0 + x1) / 2; startY1 = (y0 + y1) / 2;
    startX2 = (x0 + x2) / 2; startY2 = (y0 + y2) / 2;
  }

  ctx.beginPath();
  ctx.moveTo(startX1, startY1);
  ctx.lineTo(startX1 + dx * extend, startY1 + dy * extend);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(startX2, startY2);
  ctx.lineTo(startX2 + dx * extend, startY2 + dy * extend);
  ctx.stroke();

  // 25%/75% lines (dashed)
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = Math.max(0.5, d.lineWidth - 0.5);
  const q25x1 = (startX1 * 3 + startX2) / 4;
  const q25y1 = (startY1 * 3 + startY2) / 4;
  ctx.beginPath();
  ctx.moveTo(q25x1, q25y1);
  ctx.lineTo(q25x1 + dx * extend, q25y1 + dy * extend);
  ctx.stroke();

  const q75x1 = (startX1 + startX2 * 3) / 4;
  const q75y1 = (startY1 + startY2 * 3) / 4;
  ctx.beginPath();
  ctx.moveTo(q75x1, q75y1);
  ctx.lineTo(q75x1 + dx * extend, q75y1 + dy * extend);
  ctx.stroke();

  // Fill between outer lines
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = d.color;
  ctx.beginPath();
  ctx.moveTo(startX1, startY1);
  ctx.lineTo(startX1 + dx * extend, startY1 + dy * extend);
  ctx.lineTo(startX2 + dx * extend, startY2 + dy * extend);
  ctx.lineTo(startX2, startY2);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = d.opacity;

  // INNOVATION: Median line touch counter
  if (bars && bars.length > 0) {
    let touches = 0;
    const mdx = anchorX + dx * extend - anchorX;
    const mdy = anchorY + dy * extend - anchorY;
    for (let bi = 0; bi < bars.length; bi++) {
      const bx_ = ix(bi, c);
      if (bx_ < c.chartLeft || bx_ > c.rightEdge) continue;
      const bhY = py(bars[bi].h, c), blY = py(bars[bi].l, c);
      const dist_ = ptToSegDist(bx_, (bhY + blY) / 2, anchorX, anchorY, anchorX + mdx, anchorY + mdy);
      if (dist_ < 5) touches++;
    }
    const rating = touches <= 2 ? "WEAK" : touches <= 5 ? "MODERATE" : "STRONG";
    const rcolor = touches <= 2 ? "#787B86" : touches <= 5 ? "#FF9800" : "#26A69A";
    ctx.save();
    ctx.globalAlpha = d.opacity;
    drawLabel(ctx, `${touches} TOUCHES \u00B7 ${rating}`, (anchorX + anchorX + mdx) / 2, (anchorY + anchorY + mdy) / 2 - 14, rcolor, "rgba(10,10,20,0.9)", 8);
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

// ══════════════════════════════════════════════════════
//  FIBONACCI TOOLS
// ══════════════════════════════════════════════════════

function drawFibExtension(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, pair: string, isSelected: boolean, isHovered: boolean, bars?: Bar[]): void {
  if (d.points.length < 3) return;
  const levels = d.fibLevels || [0, 0.236, 0.382, 0.5, 0.618, 1.0, 1.272, 1.618, 2.0, 2.618, 4.236];
  const range = d.points[1].price - d.points[0].price;

  ctx.save();
  ctx.globalAlpha = d.opacity;

  for (const level of levels) {
    const price = d.points[2].price + range * level;
    const y = py(price, c);
    const x0 = ix(d.points[2].index, c);
    ctx.strokeStyle = d.color;
    ctx.lineWidth = level === 0 || level === 1 ? d.lineWidth : 0.5;
    ctx.setLineDash(level === 0 || level === 1 ? getLineDash(d.lineStyle) : [4, 4]);
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(c.rightEdge, y);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.font = "9px 'IBM Plex Mono', monospace";
    ctx.fillStyle = d.color;
    ctx.textAlign = "right";
    ctx.fillText(`${(level * 100).toFixed(1)}% \u2014 ${formatPrice(price, pair)}`, c.rightEdge - 4, y - 3);
  }

  // Connecting lines
  setupStroke(ctx, d, isSelected);
  ctx.setLineDash([2, 2]);
  ctx.globalAlpha = d.opacity * 0.5;
  for (let i = 0; i < d.points.length - 1; i++) {
    ctx.beginPath();
    ctx.moveTo(ix(d.points[i].index, c), py(d.points[i].price, c));
    ctx.lineTo(ix(d.points[i + 1].index, c), py(d.points[i + 1].price, c));
    ctx.stroke();
  }
  ctx.globalAlpha = d.opacity;
  ctx.setLineDash([]);
  // INNOVATION: Live target tracker
  if (d.points.length >= 3 && bars && bars.length > 0) {
    const lastBar__ = bars[bars.length - 1];
    const currentPrice__ = lastBar__.c;
    const levels__ = d.fibLevels || [0, 0.236, 0.382, 0.5, 0.618, 1.0, 1.272, 1.618, 2.0, 2.618, 4.236];
    const range__ = d.points[1].price - d.points[0].price;
    const pipSize__ = pair.toUpperCase().includes("JPY") ? 0.01 : 0.0001;
    let nearestDist__ = Infinity;
    let nearestLevel__: number | null = null;
    for (const level__ of levels__) {
      const levelPrice__ = d.points[2].price + range__ * level__;
      const dist__ = Math.abs(currentPrice__ - levelPrice__) / pipSize__;
      if (dist__ < nearestDist__) { nearestDist__ = dist__; nearestLevel__ = level__; }
    }
    ctx.save();
    for (const level__ of levels__) {
      const levelPrice__ = d.points[2].price + range__ * level__;
      const levelY__ = py(levelPrice__, c);
      if (levelY__ < c.mainTop || levelY__ > c.mainTop + c.mainHeight) continue;
      const pipsAway__ = (currentPrice__ - levelPrice__) / pipSize__;
      const isNearest__ = level__ === nearestLevel__;
      const badgeText__ = `${pipsAway__ >= 0 ? "+" : ""}${pipsAway__.toFixed(1)}p`;
      ctx.globalAlpha = isNearest__ ? d.opacity : d.opacity * 0.6;
      ctx.font = `${isNearest__ ? "bold " : ""}8px 'IBM Plex Mono', monospace`;
      ctx.fillStyle = isNearest__ ? "#FFD700" : d.color;
      ctx.textAlign = "left";
      ctx.fillText(badgeText__, c.rightEdge - 45, levelY__ - 2);
      if (isNearest__) {
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = "#FFD700";
        ctx.fillRect(c.rightEdge - 50, levelY__ - 8, 46, 12);
        ctx.globalAlpha = d.opacity;
      }
    }
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawFibChannel(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, pair: string, isSelected: boolean, isHovered: boolean, bars?: Bar[]): void {
  if (d.points.length < 3) return;
  const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
  const x1 = ix(d.points[0].index, c), y1 = py(d.points[0].price, c);
  const x2 = ix(d.points[1].index, c), y2 = py(d.points[1].price, c);
  const x3 = ix(d.points[2].index, c), y3 = py(d.points[2].price, c);

  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  const nx = -dy / len, ny = dx / len;
  const fullOffset = (x3 - x1) * nx + (y3 - y1) * ny;

  ctx.save();
  ctx.globalAlpha = d.opacity;

  for (const level of levels) {
    const off = fullOffset * level;
    const lx1 = x1 + off * nx, ly1 = y1 + off * ny;
    const lx2 = x2 + off * nx, ly2 = y2 + off * ny;
    ctx.strokeStyle = d.color;
    ctx.lineWidth = level === 0 || level === 1 ? d.lineWidth : 0.5;
    ctx.setLineDash(level === 0 || level === 1 ? [] : [4, 4]);
    ctx.beginPath();
    ctx.moveTo(lx1, ly1);
    ctx.lineTo(lx2, ly2);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.font = "9px 'IBM Plex Mono', monospace";
    ctx.fillStyle = d.color;
    ctx.textAlign = "left";
    ctx.fillText(`${(level * 100).toFixed(1)}%`, lx2 + 4, ly2 + 3);
  }

  ctx.setLineDash([]);
  // INNOVATION: Dynamic level strength
  if (bars && bars.length > 0) {
    const levelsStr__ = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
    ctx.save();
    ctx.globalAlpha = d.opacity * 0.8;
    for (const level__ of levelsStr__) {
      const off__ = fullOffset * level__;
      const lx2__ = x2 + off__ * nx, ly2__ = y2 + off__ * ny;
      let touches__ = 0;
      for (let bi__ = 0; bi__ < bars.length; bi__++) {
        const bx__ = ix(bi__, c);
        if (bx__ < c.chartLeft || bx__ > c.rightEdge) continue;
        const t__ = ((bx__ - x1 - off__ * nx) * (x2 - x1) + ((py(bars[bi__].h, c) - y1 - off__ * ny) * (y2 - y1))) / ((x2 - x1) ** 2 + (y2 - y1) ** 2 || 1);
        const projY__ = y1 + off__ * ny + t__ * (y2 - y1);
        const highY__ = py(bars[bi__].h, c);
        const lowY__ = py(bars[bi__].l, c);
        if (Math.abs(highY__ - projY__) < 3 || Math.abs(lowY__ - projY__) < 3) touches__++;
      }
      const strength__ = touches__ === 0 ? "UNTESTED" : touches__ <= 2 ? "TESTED" : "CONFIRMED";
      const sColor__ = touches__ === 0 ? "#787B86" : touches__ <= 2 ? "#FF9800" : "#26A69A";
      ctx.font = "8px 'IBM Plex Mono', monospace";
      ctx.fillStyle = sColor__;
      ctx.textAlign = "left";
      ctx.fillText(strength__, lx2__ + 60, ly2__ + 3);
    }
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawFibTimeZone(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 2) return;
  const fibNums = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
  const baseIdx = d.points[0].index;

  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);

  for (const n of fibNums) {
    const idx = baseIdx + n;
    const x = ix(idx, c);
    if (x < c.chartLeft || x > c.rightEdge) continue;
    ctx.beginPath();
    ctx.moveTo(x, c.mainTop);
    ctx.lineTo(x, c.mainTop + c.mainHeight);
    ctx.stroke();
    drawLabel(ctx, String(n), x, c.mainTop + 12, d.color);
  }

  ctx.setLineDash([]);
  // INNOVATION: Highlight key Fibonacci time zones
  {
    const baseIdx__ = d.points[0].index;
    ctx.save();
    ctx.globalAlpha = d.opacity * 0.7;
    ctx.textAlign = "center";
    for (const n__ of [8, 13, 21, 34]) {
      const idx__ = baseIdx__ + n__;
      const x__ = ix(idx__, c);
      if (x__ < c.chartLeft || x__ > c.rightEdge) continue;
      ctx.globalAlpha = d.opacity * 0.3;
      ctx.fillStyle = "#9C27B0";
      ctx.fillRect(x__ - 1, c.mainTop, 2, c.mainHeight);
      ctx.globalAlpha = d.opacity * 0.9;
      drawLabel(ctx, `F${n__}`, x__, c.mainTop + 28, "#FFD700");
    }
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawFibSpeedFan(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean, bars?: Bar[]): void {
  if (d.points.length < 2) return;
  const ratios = [0.236, 0.382, 0.5, 0.618, 0.786];
  const x1 = ix(d.points[0].index, c), y1 = py(d.points[0].price, c);
  const x2 = ix(d.points[1].index, c), _y2 = py(d.points[1].price, c);
  const priceRange = d.points[1].price - d.points[0].price;

  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);

  for (const r of ratios) {
    const fanPrice = d.points[0].price + priceRange * r;
    const fy = py(fanPrice, c);
    const dx = x2 - x1, dy = fy - y1;
    // Extend to chart edge
    const t = dx !== 0 ? (c.rightEdge - x1) / dx : 1;
    const endX = x1 + dx * t;
    const endY = y1 + dy * t;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.font = "9px 'IBM Plex Mono', monospace";
    ctx.fillStyle = d.color;
    ctx.textAlign = "left";
    ctx.fillText(`${(r * 100).toFixed(1)}%`, endX + 4, endY);
  }

  ctx.setLineDash([]);
  // INNOVATION: Breakout tracking on each fan line
  if (bars && bars.length > 0) {
    const ratios__ = [0.236, 0.382, 0.5, 0.618, 0.786];
    const priceRange__ = d.points[1].price - d.points[0].price;
    const x1__ = ix(d.points[0].index, c), y1__ = py(d.points[0].price, c);
    const x2__ = ix(d.points[1].index, c);
    ctx.save();
    ctx.globalAlpha = d.opacity * 0.7;
    for (const r__ of ratios__) {
      const fanPrice__ = d.points[0].price + priceRange__ * r__;
      const fy__ = py(fanPrice__, c);
      const dx__ = x2__ - x1__, dfy = fy__ - y1__;
      const slope__ = dfy / (dx__ || 1);
      for (let bi__ = 1; bi__ < bars.length; bi__++) {
        const bx__ = ix(bi__, c);
        if (bx__ < c.chartLeft || bx__ > c.rightEdge) continue;
        const lineY__ = y1__ + slope__ * (bx__ - x1__);
        const prevLineY__ = y1__ + slope__ * (ix(bi__ - 1, c) - x1__);
        const prevC__ = py(bars[bi__ - 1].c, c);
        const currC__ = py(bars[bi__].c, c);
        if (prevC__ >= prevLineY__ && currC__ < lineY__) {
          ctx.fillStyle = THEME.bullBody;
          ctx.beginPath();
          ctx.arc(bx__, lineY__, 3, 0, Math.PI * 2);
          ctx.fill();
        } else if (prevC__ <= prevLineY__ && currC__ > lineY__) {
          ctx.fillStyle = THEME.bearBody;
          ctx.beginPath();
          ctx.arc(bx__, lineY__, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

// ══════════════════════════════════════════════════════
//  GANN TOOLS
// ══════════════════════════════════════════════════════

function drawGannBox(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, pair: string, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 2) return;
  const x1 = ix(d.points[0].index, c), y1 = py(d.points[0].price, c);
  const x2 = ix(d.points[1].index, c), y2 = py(d.points[1].price, c);
  const left = Math.min(x1, x2), right = Math.max(x1, x2);
  const top = Math.min(y1, y2), bot = Math.max(y1, y2);
  const w = right - left, h = bot - top;

  const levels = [0, 0.25, 0.333, 0.5, 0.667, 0.75, 1.0];

  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);

  // Border
  ctx.strokeRect(left, top, w, h);

  // Horizontal levels
  ctx.lineWidth = 0.5;
  ctx.setLineDash([2, 2]);
  for (const lev of levels) {
    if (lev === 0 || lev === 1) continue;
    const y = top + h * lev;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }

  // Vertical levels
  for (const lev of levels) {
    if (lev === 0 || lev === 1) continue;
    const x = left + w * lev;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bot);
    ctx.stroke();
  }

  // 1x1 Diagonal
  ctx.setLineDash([]);
  ctx.lineWidth = d.lineWidth;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(right, bot);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(left, bot);
  ctx.lineTo(right, top);
  ctx.stroke();

  ctx.setLineDash([]);
  // INNOVATION: Gann Square of 9
  if (d.gannShowPriceTime) {
    const basePrice__ = Math.min(d.points[0].price, d.points[1].price);
    const priceRange__ = Math.abs(d.points[1].price - d.points[0].price);
    const sqRoot__ = Math.sqrt(basePrice__);
    const cardinals__: number[] = [];
    for (let n__ = -4; n__ <= 4; n__++) {
      const candidate__ = Math.pow(sqRoot__ + n__ * 0.25, 2);
      if (candidate__ > basePrice__ - priceRange__ && candidate__ < basePrice__ + priceRange__ * 2) {
        cardinals__.push(candidate__);
      }
    }
    ctx.save();
    ctx.globalAlpha = d.opacity * 0.5;
    ctx.setLineDash([2, 4]);
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = "#FFD700";
    for (const cardPrice__ of cardinals__) {
      const cardY__ = py(cardPrice__, c);
      if (cardY__ < c.mainTop || cardY__ > c.mainTop + c.mainHeight) continue;
      ctx.beginPath();
      ctx.moveTo(left, cardY__);
      ctx.lineTo(right, cardY__);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = d.opacity * 0.8;
      ctx.font = "8px 'IBM Plex Mono', monospace";
      ctx.fillStyle = "#FFD700";
      ctx.textAlign = "right";
      ctx.fillText(`SQ9: ${cardPrice__.toFixed(4)}`, left - 2, cardY__ - 2);
      ctx.globalAlpha = d.opacity * 0.5;
      ctx.setLineDash([2, 4]);
    }
    ctx.setLineDash([]);
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawGannFan(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean, bars?: Bar[]): void {
  if (d.points.length < 2) return;
  const x1 = ix(d.points[0].index, c), y1 = py(d.points[0].price, c);
  const x2 = ix(d.points[1].index, c), y2 = py(d.points[1].price, c);
  const dx = x2 - x1, dy = y2 - y1;

  const angles: [string, number][] = [
    ["1x8", 1 / 8], ["1x4", 1 / 4], ["1x3", 1 / 3], ["1x2", 1 / 2],
    ["1x1", 1],
    ["2x1", 2], ["3x1", 3], ["4x1", 4], ["8x1", 8],
  ];

  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);

  for (const [name, ratio] of angles) {
    const fanDy = dy * ratio;
    const t = dx !== 0 ? Math.abs((c.rightEdge - x1) / dx) : 1;
    const endX = x1 + Math.sign(dx) * Math.abs(dx) * t;
    const endY = y1 + fanDy * t;
    const alpha = ratio === 1 ? 1 : 0.6;
    ctx.globalAlpha = d.opacity * alpha;
    ctx.lineWidth = ratio === 1 ? d.lineWidth + 0.5 : d.lineWidth;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.font = "8px 'IBM Plex Mono', monospace";
    ctx.fillStyle = d.color;
    ctx.textAlign = "left";
    ctx.fillText(name, endX + 4, endY);
  }
  ctx.globalAlpha = d.opacity;

  ctx.setLineDash([]);
  // INNOVATION: Dynamic S/R glow near Gann fan lines
  if (bars && bars.length > 0) {
    const lastPrice__ = bars[bars.length - 1].c;
    const gannAnglesInner__: [string, number][] = [
      ["1x8", 1 / 8], ["1x4", 1 / 4], ["1x3", 1 / 3], ["1x2", 1 / 2],
      ["1x1", 1], ["2x1", 2], ["3x1", 3], ["4x1", 4], ["8x1", 8],
    ];
    ctx.save();
    for (const [name__, ratio__] of gannAnglesInner__) {
      const fanDy__ = dy * ratio__;
      const t__ = dx !== 0 ? Math.abs((c.rightEdge - x1) / dx) : 1;
      const currentY__ = py(lastPrice__, c);
      const rightBarX__ = c.rightEdge;
      const fanYatRight__ = y1 + fanDy__ * ((rightBarX__ - x1) / (dx || 1));
      const pixDist__ = Math.abs(currentY__ - fanYatRight__);
      if (pixDist__ < 10) {
        ctx.globalAlpha = 0.25;
        ctx.strokeStyle = "#00E5FF";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + Math.sign(dx) * Math.abs(dx) * t__, y1 + fanDy__ * t__);
        ctx.stroke();
        ctx.globalAlpha = d.opacity;
        drawLabel(ctx, `${name__} ±near`, c.rightEdge - 60, fanYatRight__, "#00E5FF", undefined, 8);
      }
    }
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

// ══════════════════════════════════════════════════════
//  PATTERN TOOLS
// ══════════════════════════════════════════════════════

function drawConnectedPoints(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, labels: string[], colors?: string[]): void {
  const pts = d.points.map(p => ({ x: ix(p.index, c), y: py(p.price, c) }));
  for (let i = 0; i < pts.length - 1; i++) {
    if (colors && colors[i]) ctx.strokeStyle = colors[i];
    ctx.beginPath();
    ctx.moveTo(pts[i].x, pts[i].y);
    ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
    ctx.stroke();
  }
  // Labels
  ctx.font = "bold 10px 'IBM Plex Mono', monospace";
  ctx.textAlign = "center";
  for (let i = 0; i < pts.length && i < labels.length; i++) {
    const above = i % 2 === 0;
    const ly = above ? pts[i].y - 12 : pts[i].y + 14;
    drawLabel(ctx, labels[i], pts[i].x, ly, d.color);
  }
}

function drawXABCDPattern(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 5) return;
  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);

  const pts = d.points.map(p => ({ x: ix(p.index, c), y: py(p.price, c) }));
  const labels = d.patternLabels || ["X", "A", "B", "C", "D"];

  // Fill triangles XAB and BCD
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = d.color;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  ctx.lineTo(pts[1].x, pts[1].y);
  ctx.lineTo(pts[2].x, pts[2].y);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(pts[2].x, pts[2].y);
  ctx.lineTo(pts[3].x, pts[3].y);
  ctx.lineTo(pts[4].x, pts[4].y);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = d.opacity;

  drawConnectedPoints(ctx, d, c, labels);

  // Fibonacci ratios
  const xa = Math.abs(d.points[1].price - d.points[0].price);
  const ab = Math.abs(d.points[2].price - d.points[1].price);
  const bc = Math.abs(d.points[3].price - d.points[2].price);
  const ad = Math.abs(d.points[4].price - d.points[0].price);
  if (xa > 0) {
    const abXa = ab / xa;
    const adXa = ad / xa;
    ctx.font = "8px 'IBM Plex Mono', monospace";
    ctx.fillStyle = d.color;
    ctx.textAlign = "center";
    const midAB = { x: (pts[1].x + pts[2].x) / 2, y: (pts[1].y + pts[2].y) / 2 };
    ctx.fillText(`${abXa.toFixed(3)}`, midAB.x, midAB.y - 6);
    if (ab > 0) {
      const bcAb = bc / ab;
      const midBC = { x: (pts[2].x + pts[3].x) / 2, y: (pts[2].y + pts[3].y) / 2 };
      ctx.fillText(`${bcAb.toFixed(3)}`, midBC.x, midBC.y - 6);
    }

    // Detect pattern
    let patternName = "";
    if (abXa > 0.58 && abXa < 0.66 && adXa > 0.74 && adXa < 0.83) patternName = "Gartley";
    else if (abXa > 0.74 && abXa < 0.83 && adXa > 1.2 && adXa < 1.7) patternName = "Butterfly";
    else if (abXa > 0.35 && abXa < 0.55 && adXa > 0.85 && adXa < 0.92) patternName = "Bat";
    else if (abXa > 0.35 && abXa < 0.65 && adXa > 1.55 && adXa < 1.7) patternName = "Crab";
    if (patternName) {
      drawLabel(ctx, patternName, (pts[0].x + pts[4].x) / 2, Math.min(...pts.map(p => p.y)) - 20, d.color);
    }
  }

  ctx.setLineDash([]);
  // INNOVATION: PRZ (Potential Reversal Zone)
  if (d.points.length >= 5) {
    const dX__ = ix(d.points[4].index, c);
    const xa__ = Math.abs(d.points[1].price - d.points[0].price);
    const przSize__ = xa__ * 0.0618;
    const przTopY__ = py(d.points[4].price + przSize__, c);
    const przBotY__ = py(d.points[4].price - przSize__, c);
    const przW__ = 30;
    ctx.save();
    ctx.globalAlpha = d.opacity * 0.15;
    ctx.fillStyle = "#FFD700";
    ctx.fillRect(dX__ - przW__ / 2, Math.min(przTopY__, przBotY__), przW__, Math.abs(przBotY__ - przTopY__));
    ctx.globalAlpha = d.opacity * 0.8;
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(dX__ - przW__ / 2, Math.min(przTopY__, przBotY__), przW__, Math.abs(przBotY__ - przTopY__));
    ctx.setLineDash([]);
    drawLabel(ctx, "PRZ", dX__, Math.min(przTopY__, przBotY__) - 14, "#FFD700");
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawCypherPattern(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 5) return;
  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);
  drawConnectedPoints(ctx, d, c, d.patternLabels || ["X", "A", "B", "C", "D"]);

  const pts = d.points.map(p => ({ x: ix(p.index, c), y: py(p.price, c) }));
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = d.color;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  ctx.lineTo(pts[1].x, pts[1].y);
  ctx.lineTo(pts[2].x, pts[2].y);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = d.opacity;

  ctx.setLineDash([]);
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawABCDPattern(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 3) return;
  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);
  drawConnectedPoints(ctx, d, c, (d.patternLabels || ["A", "B", "C", "D"]).slice(0, d.points.length));

  // Show ratios (only when all 4 points placed)
  if (d.points.length >= 4) {
    const ab = Math.abs(d.points[1].price - d.points[0].price);
    const bc = Math.abs(d.points[2].price - d.points[1].price);
    const cd = Math.abs(d.points[3].price - d.points[2].price);
    if (ab > 0) {
      const pts = d.points.map(p => ({ x: ix(p.index, c), y: py(p.price, c) }));
      ctx.font = "8px 'IBM Plex Mono', monospace";
      ctx.fillStyle = d.color;
      ctx.textAlign = "center";
      ctx.fillText(`BC/AB=${(bc / ab).toFixed(3)}`, (pts[1].x + pts[2].x) / 2, (pts[1].y + pts[2].y) / 2 - 8);
      if (bc > 0) {
        ctx.fillText(`CD/BC=${(cd / bc).toFixed(3)}`, (pts[2].x + pts[3].x) / 2, (pts[2].y + pts[3].y) / 2 - 8);
      }
    }
  }

  ctx.setLineDash([]);
  // INNOVATION: Auto-complete projected D
  if (d.points.length === 3) {
    const ab__ = d.points[1].price - d.points[0].price;
    const projD__ = d.points[2].price - ab__;
    const projDIndex__ = d.points[2].index + (d.points[1].index - d.points[0].index);
    const projX__ = ix(projDIndex__, c);
    const projY__ = py(projD__, c);
    const cX__ = ix(d.points[2].index, c), cY__ = py(d.points[2].price, c);
    ctx.save();
    ctx.globalAlpha = d.opacity * 0.5;
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cX__, cY__);
    ctx.lineTo(projX__, projY__);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = d.opacity * 0.4;
    ctx.beginPath();
    ctx.arc(projX__, projY__, 5, 0, Math.PI * 2);
    ctx.fillStyle = THEME.canvasBg;
    ctx.fill();
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = d.opacity * 0.8;
    drawLabel(ctx, `PROJECTED D: ${projD__.toFixed(5)}`, projX__ + 8, projY__, "#FFD700");
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawTrianglePattern(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 3) return;
  const pts = d.points.map(p => ({ x: ix(p.index, c), y: py(p.price, c) }));
  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);

  // Fill
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = d.color;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  ctx.lineTo(pts[1].x, pts[1].y);
  ctx.lineTo(pts[2].x, pts[2].y);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = d.opacity;

  // Outline
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  ctx.lineTo(pts[1].x, pts[1].y);
  ctx.lineTo(pts[2].x, pts[2].y);
  ctx.closePath();
  ctx.stroke();

  const labels = d.patternLabels || ["A", "B", "C"];
  for (let i = 0; i < pts.length && i < labels.length; i++) {
    drawLabel(ctx, labels[i], pts[i].x, pts[i].y - 14, d.color);
  }

  ctx.setLineDash([]);
  // INNOVATION: Triangle type detection
  if (d.points.length >= 5) {
    const pts5__ = d.points.slice(0, 5).map(p => ({ x: ix(p.index, c), y: py(p.price, c) }));
    const upperSlope__ = (pts5__[4].y - pts5__[0].y) / (pts5__[4].x - pts5__[0].x || 1);
    const lowerSlope__ = (pts5__[3].y - pts5__[1].y) / (pts5__[3].x - pts5__[1].x || 1);
    let triType__ = "SYMMETRICAL";
    if (upperSlope__ > -0.001 && lowerSlope__ > 0.001) triType__ = "ASCENDING";
    else if (upperSlope__ < -0.001 && lowerSlope__ < 0.001) triType__ = "DESCENDING";
    const typeColor__ = triType__ === "ASCENDING" ? "#26A69A" : triType__ === "DESCENDING" ? "#EF5350" : "#FF9800";
    const centX__ = pts5__.reduce((s, p) => s + p.x, 0) / pts5__.length;
    const centY__ = pts5__.reduce((s, p) => s + p.y, 0) / pts5__.length;
    ctx.save();
    ctx.globalAlpha = d.opacity * 0.9;
    drawLabel(ctx, triType__ + " TRIANGLE", centX__, centY__, typeColor__);
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawThreeDrives(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 7) return;
  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);
  const labels = d.patternLabels || ["0", "1", "R1", "2", "R2", "3", "R3"];
  drawConnectedPoints(ctx, d, c, labels);
  ctx.setLineDash([]);
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawHeadShoulders(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 6) return;
  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);

  const pts = d.points.map(p => ({ x: ix(p.index, c), y: py(p.price, c) }));
  const labels = d.patternLabels || ["LS-T", "LS", "H-T", "H", "RS-T", "RS"];
  drawConnectedPoints(ctx, d, c, labels);

  // Neckline through troughs (p0, p2, p4)
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = d.color;
  ctx.globalAlpha = d.opacity * 0.7;
  ctx.beginPath();
  const neckSlope = (pts[4].y - pts[0].y) / (pts[4].x - pts[0].x || 1);
  const neckStartX = c.chartLeft;
  const neckStartY = pts[0].y + neckSlope * (neckStartX - pts[0].x);
  const neckEndX = c.rightEdge;
  const neckEndY = pts[0].y + neckSlope * (neckEndX - pts[0].x);
  ctx.moveTo(neckStartX, neckStartY);
  ctx.lineTo(neckEndX, neckEndY);
  ctx.stroke();
  ctx.globalAlpha = d.opacity;

  ctx.setLineDash([]);
  // INNOVATION: Symmetry score
  if (d.points.length >= 6) {
    const lsHeight__ = Math.abs(d.points[1].price - d.points[0].price);
    const rsHeight__ = Math.abs(d.points[5].price - d.points[4].price);
    const lsWidth__ = d.points[1].index - d.points[0].index;
    const rsWidth__ = d.points[5].index - d.points[4].index;
    const heightSym__ = lsHeight__ > 0 ? Math.min(lsHeight__, rsHeight__) / Math.max(lsHeight__, rsHeight__) : 0;
    const widthSym__ = lsWidth__ > 0 ? Math.min(lsWidth__, rsWidth__) / Math.max(lsWidth__, rsWidth__) : 0;
    const symScore__ = Math.round((heightSym__ * 0.6 + widthSym__ * 0.4) * 100);
    const symColor__ = symScore__ > 75 ? "#26A69A" : symScore__ > 50 ? "#FF9800" : "#EF5350";
    const headX__ = ix(d.points[3].index, c), headY__ = py(d.points[3].price, c);
    ctx.save();
    ctx.globalAlpha = d.opacity * 0.9;
    drawLabel(ctx, `SYMMETRY: ${symScore__}%`, headX__, headY__ - 30, symColor__);
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawElliottImpulse(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 6) return;
  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);
  const labels = d.patternLabels || ["0", "1", "2", "3", "4", "5"];
  const colors = [THEME.bullBody, THEME.bearBody, THEME.bullBody, THEME.bearBody, THEME.bullBody];
  drawConnectedPoints(ctx, d, c, labels, colors);
  // INNOVATION: Wave count probability badge
  if (d.points.length >= 6) {
    const waves = d.points;
    const w1 = Math.abs(waves[2].price - waves[1].price);
    const w3 = Math.abs(waves[4].price - waves[3].price);
    const w5 = Math.abs(waves[5].price - waves[4].price);
    const maxWave = Math.max(w1, w3, w5);
    const isClassic = w3 >= w1 && w3 >= w5 && maxWave === w3;
    const isExtW3 = w3 >= w1 * 1.618;
    const label = isExtW3 ? "EXT W3 (72%)" : isClassic ? "CLASSIC (85%)" : "ALTERNATING (60%)";
    const lcolor = isExtW3 ? "#FFD700" : isClassic ? "#26A69A" : "#FF9800";
    const cx_ = ix(waves[3].index, c) + 10;
    const cy_ = py(waves[3].price, c) - 18;
    drawLabel(ctx, label, cx_, cy_, lcolor, "rgba(10,10,20,0.9)", 8);
  }
  ctx.setLineDash([]);
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawElliottCorrection(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 4) return;
  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);
  const labels = d.patternLabels || ["0", "A", "B", "C"];
  const colors = [THEME.bearBody, THEME.bullBody, THEME.bearBody];
  drawConnectedPoints(ctx, d, c, labels, colors);
  // INNOVATION: Correction type badge and ghost C
  if (d.points.length >= 4) {
    const aMove = Math.abs(d.points[2].price - d.points[1].price);
    const bMove = Math.abs(d.points[3].price - d.points[2].price);
    const bRetrace = aMove > 0 ? bMove / aMove : 0;
    const corrType = bRetrace > 1.0 ? "EXPANDED FLAT" : bRetrace > 0.9 ? "FLAT" : "ZIGZAG";
    const ccolor = corrType === "ZIGZAG" ? "#26A69A" : corrType === "FLAT" ? "#FF9800" : "#EF5350";
    const ax_ = ix(d.points[3].index, c) + 10;
    const ay_ = py(d.points[3].price, c) - 14;
    drawLabel(ctx, corrType, ax_, ay_, ccolor, "rgba(10,10,20,0.9)", 8);
  }
  // Ghost projected C if only 3 points placed
  if (d.points.length === 3) {
    const projC_price = d.points[0].price - (d.points[2].price - d.points[1].price);
    const projC_idx = d.points[2].index + (d.points[2].index - d.points[1].index);
    const pcX = ix(projC_idx, c), pcY = py(projC_price, c);
    ctx.save();
    ctx.globalAlpha = d.opacity * 0.45;
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 0.8;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(ix(d.points[2].index, c), py(d.points[2].price, c));
    ctx.lineTo(pcX, pcY);
    ctx.stroke();
    ctx.setLineDash([]);
    drawLabel(ctx, `C?`, pcX, pcY - 10, "#FFD700", "rgba(30,25,0,0.85)", 8);
    ctx.restore();
  }
  ctx.setLineDash([]);
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawElliottTriangle(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 6) return;
  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);
  const labels = d.patternLabels || ["0", "A", "B", "C", "D", "E"];
  drawConnectedPoints(ctx, d, c, labels);
  // INNOVATION: Thrust target zone
  if (d.points.length >= 6) {
    const pts_ = d.points;
    const aHeight = Math.abs(pts_[2].price - pts_[1].price);
    const eX = ix(pts_[5].index, c), _eY = py(pts_[5].price, c);
    const thrustMinY = py(pts_[5].price + aHeight * 0.75, c);
    const thrustMaxY = py(pts_[5].price + aHeight, c);
    const zoneW = 30;
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = "#2196F3";
    ctx.fillRect(eX, Math.min(thrustMinY, thrustMaxY), zoneW, Math.abs(thrustMaxY - thrustMinY));
    ctx.globalAlpha = d.opacity;
    drawLabel(ctx, "THRUST ZONE", eX + zoneW / 2, Math.min(thrustMinY, thrustMaxY) - 10, "#2196F3", "rgba(0,10,30,0.9)", 8);
    ctx.restore();
  }
  ctx.setLineDash([]);
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

// ══════════════════════════════════════════════════════
//  SHAPE TOOLS
// ══════════════════════════════════════════════════════

function drawCircle(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean, bars?: Bar[]): void {
  if (d.points.length < 2) return;
  const cx_ = ix(d.points[0].index, c), cy_ = py(d.points[0].price, c);
  const ex = ix(d.points[1].index, c), ey = py(d.points[1].price, c);
  const radius = Math.hypot(ex - cx_, ey - cy_);

  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);

  if (d.fillEnabled) {
    ctx.globalAlpha = d.fillOpacity ?? 0.15;
    ctx.fillStyle = d.fillColor || d.color;
    ctx.beginPath();
    ctx.arc(cx_, cy_, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = d.opacity;
  }

  ctx.beginPath();
  ctx.arc(cx_, cy_, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.setLineDash([]);
  // INNOVATION: ATR circle overlay
  if (d.atrCircleEnabled && bars && bars.length >= 14) {
    const period = d.atrPeriod || 14;
    let atrSum = 0;
    const start_ = Math.max(1, bars.length - period);
    for (let i = start_; i < bars.length; i++) {
      const tr = Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c));
      atrSum += tr;
    }
    const atr = atrSum / (bars.length - start_);
    const pipSize_ = (bars[bars.length - 1].c > 10) ? 0.01 : 0.0001;
    const atrPips = atr / pipSize_;
    ctx.save();
    ctx.globalAlpha = d.opacity * 0.7;
    drawLabel(ctx, `${period} ATR = ${atrPips.toFixed(1)}p`, cx_, cy_ - radius - 10, "#26A69A", "rgba(0,25,20,0.9)", 8);
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawEllipse(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 2) return;
  const cx_ = ix(d.points[0].index, c), cy_ = py(d.points[0].price, c);
  const ex = ix(d.points[1].index, c), ey = py(d.points[1].price, c);
  const rx = Math.abs(ex - cx_), ry = Math.abs(ey - cy_);

  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);

  if (d.fillEnabled) {
    ctx.globalAlpha = d.fillOpacity ?? 0.15;
    ctx.fillStyle = d.fillColor || d.color;
    ctx.beginPath();
    ctx.ellipse(cx_, cy_, rx || 1, ry || 1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = d.opacity;
  }

  ctx.beginPath();
  ctx.ellipse(cx_, cy_, rx || 1, ry || 1, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.setLineDash([]);
  // INNOVATION: PHI ellipse overlay
  if (d.phiEllipse) {
    const phiRx = rx * 1.618, phiRy = ry / 1.618;
    ctx.save();
    ctx.globalAlpha = d.opacity * 0.4;
    ctx.strokeStyle = "#FFD700";
    ctx.lineWidth = 0.8;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.ellipse(cx_, cy_, phiRx || 1, phiRy || 1, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    drawLabel(ctx, "\u03C6 ELLIPSE", cx_, cy_ - phiRy - 10, "#FFD700", "rgba(25,20,0,0.85)", 8);
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawTriangleShape(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 3) return;
  const pts = d.points.map(p => ({ x: ix(p.index, c), y: py(p.price, c) }));

  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);

  if (d.fillEnabled) {
    ctx.globalAlpha = d.fillOpacity ?? 0.15;
    ctx.fillStyle = d.fillColor || d.color;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.lineTo(pts[2].x, pts[2].y);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = d.opacity;
  }

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  ctx.lineTo(pts[1].x, pts[1].y);
  ctx.lineTo(pts[2].x, pts[2].y);
  ctx.closePath();
  ctx.stroke();

  ctx.setLineDash([]);
  // INNOVATION: Formation tag at centroid
  if (d.formationTag) {
    const centX = (pts[0].x + pts[1].x + pts[2].x) / 3;
    const centY = (pts[0].y + pts[1].y + pts[2].y) / 3;
    const ftColors: Record<string, string> = {
      ASCENDING: "#26A69A", DESCENDING: "#EF5350", SYMMETRICAL: "#2196F3",
      WEDGE: "#FF9800", PENNANT: "#FFD700",
    };
    const ftColor = ftColors[d.formationTag] || d.color;
    ctx.save();
    ctx.globalAlpha = d.opacity;
    drawLabel(ctx, d.formationTag, centX, centY, ftColor, "rgba(10,10,20,0.9)", 9);
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawArrowDrawing(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 2) return;
  const x1 = ix(d.points[0].index, c), y1 = py(d.points[0].price, c);
  const x2 = ix(d.points[1].index, c), y2 = py(d.points[1].price, c);

  ctx.save();
  ctx.globalAlpha = d.opacity;
  ctx.strokeStyle = d.color;
  ctx.lineWidth = isSelected ? d.lineWidth + 1 : d.lineWidth + 0.5;
  ctx.setLineDash(getLineDash(d.lineStyle));
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Arrowhead
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = 12;
  ctx.fillStyle = d.color;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - 0.35), y2 - headLen * Math.sin(angle - 0.35));
  ctx.lineTo(x2 - headLen * Math.cos(angle + 0.35), y2 - headLen * Math.sin(angle + 0.35));
  ctx.closePath();
  ctx.fill();

  // INNOVATION: Trade direction badge
  if (d.tradeDirection) {
    const midX_ = (x1 + x2) / 2, midY_ = (y1 + y2) / 2;
    const tcolor = d.tradeDirection === "LONG" ? "#26A69A" : "#EF5350";
    ctx.save();
    ctx.globalAlpha = d.opacity;
    drawLabel(ctx, d.tradeDirection, midX_, midY_ - 14, tcolor, "rgba(10,10,20,0.9)", 9);
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawBrush(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, _isHovered: boolean): void {
  const points = d.brushPoints;
  if (!points || points.length < 2) return;

  ctx.save();
  ctx.globalAlpha = d.opacity;
  ctx.strokeStyle = d.color;
  ctx.lineWidth = d.brushSize || 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
  }
  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  ctx.stroke();

  // INNOVATION: Sentiment tint overlay
  if (d.sentimentTag && points.length >= 2) {
    const sColors: Record<string, string> = { BULLISH: "#26A69A", BEARISH: "#EF5350", NEUTRAL: "#787B86" };
    const sc = sColors[d.sentimentTag] || d.color;
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const bboxX = Math.min(...xs), bboxY = Math.min(...ys);
    const bboxW = Math.max(...xs) - bboxX, bboxH = Math.max(...ys) - bboxY;
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = sc;
    ctx.fillRect(bboxX - 4, bboxY - 4, bboxW + 8, bboxH + 8);
    ctx.globalAlpha = d.opacity;
    drawLabel(ctx, d.sentimentTag, bboxX + bboxW / 2, bboxY - 12, sc, "rgba(10,10,20,0.9)", 8);
    ctx.restore();
  }
  if (isSelected) {
    drawHandle(ctx, points[0].x, points[0].y, 4, d.color, false);
    drawHandle(ctx, points[points.length - 1].x, points[points.length - 1].y, 4, d.color, false);
  }
  ctx.restore();
}

function drawPolyline(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 2) return;
  const pts = d.points.map(p => ({ x: ix(p.index, c), y: py(p.price, c) }));

  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.stroke();

  ctx.setLineDash([]);
  // INNOVATION: Measured polyline — per-leg and total distance
  if (pts.length >= 2) {
    const pipSize_ = (d.points[0]?.price ?? 1) > 10 ? 0.01 : 0.0001;
    let totalPips = 0;
    ctx.save();
    ctx.globalAlpha = d.opacity * 0.85;
    for (let i = 0; i < d.points.length - 1; i++) {
      const legPips = Math.abs(d.points[i + 1].price - d.points[i].price) / pipSize_;
      totalPips += legPips;
      const lmx = (pts[i].x + pts[i + 1].x) / 2;
      const lmy = (pts[i].y + pts[i + 1].y) / 2;
      drawLabel(ctx, `${legPips.toFixed(1)}p`, lmx, lmy - 10, d.color, undefined, 8);
    }
    const lastPt = pts[pts.length - 1];
    drawLabel(ctx, `TOTAL ${totalPips.toFixed(1)}p`, lastPt.x, lastPt.y - 18, "#FFD700", "rgba(25,20,0,0.9)", 9);
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawArc(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 3) return;
  const pts = d.points.map(p => ({ x: ix(p.index, c), y: py(p.price, c) }));

  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  ctx.quadraticCurveTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y);
  ctx.stroke();

  ctx.setLineDash([]);
  // INNOVATION: Measured arc
  {
    const barSpan_ = Math.abs(d.points[2].index - d.points[0].index);
    const pipSize_ = (d.points[0]?.price ?? 1) > 10 ? 0.01 : 0.0001;
    const pipH = Math.abs(d.points[1].price - (d.points[0].price + d.points[2].price) / 2) / pipSize_;
    const peakX = pts[1].x, peakY = pts[1].y;
    ctx.save();
    ctx.globalAlpha = d.opacity * 0.85;
    drawLabel(ctx, `${barSpan_}b \u00B7 ${pipH.toFixed(1)}p`, peakX, peakY - 14, d.color, "rgba(10,10,20,0.9)", 8);
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

// ══════════════════════════════════════════════════════
//  MEASUREMENT TOOLS
// ══════════════════════════════════════════════════════

function drawLongPosition(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, pair: string, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 2) return;
  const entry = d.points[0].price;
  const target = d.points[1].price;
  const stop = d.stopPrice ?? entry - (target - entry); // 1:1 R:R default

  const x1 = ix(d.points[0].index, c);
  const x2 = ix(d.points[1].index, c);
  const left = Math.min(x1, x2), right = Math.max(x1, x2);
  const w = right - left;

  const entryY = py(entry, c);
  const targetY = py(target, c);
  const stopY = py(stop, c);
  const pipSize = pair.toUpperCase().includes("JPY") ? 0.01 : 0.0001;

  ctx.save();
  ctx.globalAlpha = d.opacity;

  // Profit zone (green)
  ctx.fillStyle = "rgba(38,166,154,0.12)";
  ctx.fillRect(left, Math.min(entryY, targetY), w, Math.abs(targetY - entryY));

  // Loss zone (red)
  ctx.fillStyle = "rgba(239,83,80,0.12)";
  ctx.fillRect(left, Math.min(entryY, stopY), w, Math.abs(stopY - entryY));

  // Entry line
  ctx.strokeStyle = THEME.bullBody;
  ctx.lineWidth = isSelected ? 1.5 : 1;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(left, entryY);
  ctx.lineTo(right, entryY);
  ctx.stroke();

  // Target line
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(left, targetY);
  ctx.lineTo(right, targetY);
  ctx.stroke();

  // Stop line
  ctx.strokeStyle = THEME.bearBody;
  ctx.beginPath();
  ctx.moveTo(left, stopY);
  ctx.lineTo(right, stopY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Info box
  const profitPips = (target - entry) / pipSize;
  const lossPips = (entry - stop) / pipSize;
  const rr = lossPips !== 0 ? Math.abs(profitPips / lossPips) : 0;
  const pct = entry !== 0 ? ((target - entry) / entry * 100) : 0;

  const lines = [
    `LONG`,
    `Entry: ${formatPrice(entry, pair)}`,
    `Target: ${formatPrice(target, pair)}`,
    `Stop: ${formatPrice(stop, pair)}`,
    `Profit: +${profitPips.toFixed(1)} pips (${pct.toFixed(2)}%)`,
    `Loss: -${lossPips.toFixed(1)} pips`,
    `R:R = 1:${rr.toFixed(2)}`,
  ];

  ctx.font = "9px 'IBM Plex Mono', monospace";
  const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
  const boxW = maxW + 12, boxH = lines.length * 13 + 8;
  const bx = right + 8, by = entryY - boxH / 2;
  ctx.fillStyle = "rgba(19,23,34,0.92)";
  ctx.beginPath();
  ctx.roundRect(bx, by, boxW, boxH, 3);
  ctx.fill();
  ctx.strokeStyle = THEME.bullBody;
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  for (let i = 0; i < lines.length; i++) {
    ctx.fillStyle = i === 0 ? THEME.bullBody : d.color;
    ctx.fillText(lines[i], bx + 6, by + 4 + i * 13);
  }

  // INNOVATION: Hedge cost overlay
  if (d.hedgeCostBps !== undefined) {
    const costPips = entry * d.hedgeCostBps / 10000 / pipSize;
    const hedgeY1 = py(entry, c);
    const hedgeY2 = py(entry - entry * d.hedgeCostBps / 10000, c);
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = "#FF9800";
    ctx.fillRect(left, Math.min(hedgeY1, hedgeY2), w, Math.abs(hedgeY2 - hedgeY1));
    ctx.globalAlpha = d.opacity;
    drawLabel(ctx, `HEDGE COST: ${d.hedgeCostBps.toFixed(1)} bps (${costPips.toFixed(1)}p)`, (left + right) / 2, entryY - 22, "#FF9800", "rgba(30,15,0,0.9)", 8);
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawShortPosition(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, pair: string, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 2) return;
  const entry = d.points[0].price;
  const target = d.points[1].price;
  const stop = d.stopPrice ?? entry + (entry - target); // 1:1 R:R default

  const x1 = ix(d.points[0].index, c);
  const x2 = ix(d.points[1].index, c);
  const left = Math.min(x1, x2), right = Math.max(x1, x2);
  const w = right - left;

  const entryY = py(entry, c);
  const targetY = py(target, c);
  const stopY = py(stop, c);
  const pipSize = pair.toUpperCase().includes("JPY") ? 0.01 : 0.0001;

  ctx.save();
  ctx.globalAlpha = d.opacity;

  // Profit zone (green, below entry for short)
  ctx.fillStyle = "rgba(38,166,154,0.12)";
  ctx.fillRect(left, Math.min(entryY, targetY), w, Math.abs(targetY - entryY));

  // Loss zone (red, above entry for short)
  ctx.fillStyle = "rgba(239,83,80,0.12)";
  ctx.fillRect(left, Math.min(entryY, stopY), w, Math.abs(stopY - entryY));

  // Entry line
  ctx.strokeStyle = THEME.bearBody;
  ctx.lineWidth = isSelected ? 1.5 : 1;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(left, entryY);
  ctx.lineTo(right, entryY);
  ctx.stroke();

  // Target line
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = THEME.bullBody;
  ctx.beginPath();
  ctx.moveTo(left, targetY);
  ctx.lineTo(right, targetY);
  ctx.stroke();

  // Stop line
  ctx.strokeStyle = THEME.bearBody;
  ctx.beginPath();
  ctx.moveTo(left, stopY);
  ctx.lineTo(right, stopY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Info box
  const profitPips = (entry - target) / pipSize;
  const lossPips = (stop - entry) / pipSize;
  const rr = lossPips !== 0 ? Math.abs(profitPips / lossPips) : 0;
  const pct = entry !== 0 ? ((entry - target) / entry * 100) : 0;

  const lines = [
    `SHORT`,
    `Entry: ${formatPrice(entry, pair)}`,
    `Target: ${formatPrice(target, pair)}`,
    `Stop: ${formatPrice(stop, pair)}`,
    `Profit: +${profitPips.toFixed(1)} pips (${pct.toFixed(2)}%)`,
    `Loss: -${lossPips.toFixed(1)} pips`,
    `R:R = 1:${rr.toFixed(2)}`,
  ];

  ctx.font = "9px 'IBM Plex Mono', monospace";
  const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));
  const boxW = maxW + 12, boxH = lines.length * 13 + 8;
  const bx = right + 8, by = entryY - boxH / 2;
  ctx.fillStyle = "rgba(19,23,34,0.92)";
  ctx.beginPath();
  ctx.roundRect(bx, by, boxW, boxH, 3);
  ctx.fill();
  ctx.strokeStyle = THEME.bearBody;
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  for (let i = 0; i < lines.length; i++) {
    ctx.fillStyle = i === 0 ? THEME.bearBody : d.color;
    ctx.fillText(lines[i], bx + 6, by + 4 + i * 13);
  }

  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawDateRange(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 2) return;
  const x1 = ix(d.points[0].index, c), x2 = ix(d.points[1].index, c);
  const left = Math.min(x1, x2), right = Math.max(x1, x2);
  const barCount = Math.abs(d.points[1].index - d.points[0].index);

  ctx.save();
  ctx.globalAlpha = d.opacity;

  // Fill
  ctx.fillStyle = d.color;
  ctx.globalAlpha = 0.06;
  ctx.fillRect(left, c.mainTop, right - left, c.mainHeight);
  ctx.globalAlpha = d.opacity;

  // Vertical lines
  setupStroke(ctx, d, isSelected);
  ctx.beginPath();
  ctx.moveTo(left, c.mainTop);
  ctx.lineTo(left, c.mainTop + c.mainHeight);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(right, c.mainTop);
  ctx.lineTo(right, c.mainTop + c.mainHeight);
  ctx.stroke();
  ctx.setLineDash([]);

  // Label at top
  drawLabel(ctx, `${barCount} bars`, (left + right) / 2, c.mainTop + 14, d.color);

  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawPriceRange(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, pair: string, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 2) return;
  const y1 = py(d.points[0].price, c), y2 = py(d.points[1].price, c);
  const top = Math.min(y1, y2), bot = Math.max(y1, y2);
  const priceDiff = Math.abs(d.points[1].price - d.points[0].price);
  const pipSize = pair.toUpperCase().includes("JPY") ? 0.01 : 0.0001;
  const pips = priceDiff / pipSize;
  const pct = d.points[0].price !== 0 ? (priceDiff / d.points[0].price * 100) : 0;

  ctx.save();
  ctx.globalAlpha = d.opacity;

  // Fill
  ctx.fillStyle = d.color;
  ctx.globalAlpha = 0.06;
  ctx.fillRect(c.chartLeft, top, c.chartWidth, bot - top);
  ctx.globalAlpha = d.opacity;

  // Horizontal lines
  setupStroke(ctx, d, isSelected);
  ctx.beginPath();
  ctx.moveTo(c.chartLeft, y1);
  ctx.lineTo(c.rightEdge, y1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(c.chartLeft, y2);
  ctx.lineTo(c.rightEdge, y2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Label at right
  const info = `${pips.toFixed(1)} pips | ${pct.toFixed(2)}%`;
  drawLabel(ctx, info, c.rightEdge - 60, (top + bot) / 2, d.color);

  // INNOVATION: ATR comparison badge
  if (d.atrMultiple !== undefined) {
    const atrLabel = `${d.atrMultiple.toFixed(1)}x ATR`;
    const acolor = d.atrMultiple > 1.5 ? "#EF5350" : d.atrMultiple < 0.5 ? "#26A69A" : "#FF9800";
    ctx.save();
    ctx.globalAlpha = d.opacity;
    drawLabel(ctx, atrLabel, c.chartLeft + 60, (top + bot) / 2, acolor, "rgba(10,10,20,0.9)", 9);
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawDatePriceRange(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, pair: string, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 2) return;
  const x1 = ix(d.points[0].index, c), y1 = py(d.points[0].price, c);
  const x2 = ix(d.points[1].index, c), y2 = py(d.points[1].price, c);
  const left = Math.min(x1, x2), right = Math.max(x1, x2);
  const top = Math.min(y1, y2), bot = Math.max(y1, y2);
  const barCount = Math.abs(d.points[1].index - d.points[0].index);
  const priceDiff = Math.abs(d.points[1].price - d.points[0].price);
  const pipSize = pair.toUpperCase().includes("JPY") ? 0.01 : 0.0001;
  const pips = priceDiff / pipSize;

  ctx.save();
  ctx.globalAlpha = d.opacity;

  // Fill
  ctx.fillStyle = d.color;
  ctx.globalAlpha = 0.06;
  ctx.fillRect(left, top, right - left, bot - top);
  ctx.globalAlpha = d.opacity;

  // Border
  setupStroke(ctx, d, isSelected);
  ctx.strokeRect(left, top, right - left, bot - top);
  ctx.setLineDash([]);

  // Info label
  drawLabel(ctx, `${barCount} bars | ${pips.toFixed(1)} pips`, (left + right) / 2, bot + 14, d.color);

  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawForecast(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, pair: string, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 3) return;
  const slope = (d.points[1].price - d.points[0].price) / (d.points[1].index - d.points[0].index || 1);
  const barSpan = d.points[1].index - d.points[0].index;

  ctx.save();
  ctx.globalAlpha = d.opacity;
  setupStroke(ctx, d, isSelected);

  // Base move
  ctx.beginPath();
  ctx.moveTo(ix(d.points[0].index, c), py(d.points[0].price, c));
  ctx.lineTo(ix(d.points[1].index, c), py(d.points[1].price, c));
  ctx.stroke();

  // Forecast from p2
  const forecastEnd = d.points[2].index + barSpan;
  const forecastPrice = d.points[2].price + slope * barSpan;
  ctx.setLineDash([6, 4]);
  ctx.globalAlpha = d.opacity * 0.7;
  ctx.beginPath();
  ctx.moveTo(ix(d.points[2].index, c), py(d.points[2].price, c));
  ctx.lineTo(ix(forecastEnd, c), py(forecastPrice, c));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = d.opacity;

  drawLabel(ctx, `Target: ${formatPrice(forecastPrice, pair)}`, ix(forecastEnd, c) + 8, py(forecastPrice, c), d.color);

  // INNOVATION: Scenario branches
  if (d.scenarioBranches && d.scenarioBranches.length > 0) {
    const branchColors = ["#26A69A", "#787B86", "#EF5350"];
    const originX = ix(d.points[2].index, c), originY = py(d.points[2].price, c);
    ctx.save();
    for (let bi = 0; bi < Math.min(d.scenarioBranches.length, 3); bi++) {
      const br = d.scenarioBranches[bi];
      const bColor = branchColors[bi];
      ctx.globalAlpha = d.opacity * 0.75;
      ctx.strokeStyle = bColor;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.lineTo(ix(br.endIndex, c), py(br.endPrice, c));
      ctx.stroke();
      ctx.setLineDash([]);
      drawLabel(ctx, `${br.label} ${br.probability}%`, ix(br.endIndex, c) + 6, py(br.endPrice, c), bColor, "rgba(10,10,20,0.9)", 8);
    }
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

// ══════════════════════════════════════════════════════
//  ANNOTATION TOOLS
// ══════════════════════════════════════════════════════

function drawTextNote(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 1) return;
  const x = ix(d.points[0].index, c), y = py(d.points[0].price, c);
  const text = d.text || "Text";
  const fs = d.fontSize || 14;
  const weight = d.fontBold ? "bold" : "normal";
  const style = d.fontItalic ? "italic" : "normal";

  ctx.save();
  ctx.globalAlpha = d.opacity;
  ctx.font = `${style} ${weight} ${fs}px 'IBM Plex Mono', monospace`;
  const tw = ctx.measureText(text).width;
  const pad = 6;
  const br = d.borderRadius ?? 4;

  // Background
  ctx.fillStyle = d.backgroundColor || "rgba(19,23,34,0.85)";
  ctx.beginPath();
  ctx.roundRect(x - pad, y - fs / 2 - pad, tw + pad * 2, fs + pad * 2, br);
  ctx.fill();

  if (isSelected) {
    ctx.strokeStyle = d.color;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Text
  ctx.fillStyle = d.color;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);

  // INNOVATION: Institutional tag badge
  if (d.institutionalTag) {
    const tagColors: Record<string, string> = {
      RISK: "#EF5350", SIGNAL: "#26A69A", REVIEW: "#FF9800", APPROVED: "#00BCD4", BLOCKED: "#EF5350",
    };
    const tc = tagColors[d.institutionalTag] || d.color;
    ctx.save();
    ctx.globalAlpha = d.opacity;
    const tagText = `#${d.institutionalTag}`;
    ctx.font = "bold 8px 'IBM Plex Mono', monospace";
    const tw_ = ctx.measureText(tagText).width;
    const px_ = x - pad, py__ = y - fs / 2 - pad - 14;
    ctx.fillStyle = tc;
    ctx.beginPath();
    ctx.roundRect(px_, py__, tw_ + 8, 12, 6);
    ctx.fill();
    ctx.fillStyle = THEME.canvasBg;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(tagText, px_ + 4, py__ + 6);
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawAnchoredText(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 1) return;
  const x = ix(d.points[0].index, c), y = py(d.points[0].price, c);
  const text = d.text || "Text";
  const fs = d.fontSize || 14;

  ctx.save();
  ctx.globalAlpha = d.opacity;

  // Connecting line to anchor
  ctx.strokeStyle = d.color;
  ctx.lineWidth = 0.5;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 30);
  ctx.stroke();
  ctx.setLineDash([]);

  // Text box
  const weight = d.fontBold ? "bold" : "normal";
  const style = d.fontItalic ? "italic" : "normal";
  ctx.font = `${style} ${weight} ${fs}px 'IBM Plex Mono', monospace`;
  const tw = ctx.measureText(text).width;
  const pad = 6;
  const bx = x - tw / 2 - pad, by = y - 30 - fs - pad;
  ctx.fillStyle = d.backgroundColor || "rgba(19,23,34,0.85)";
  ctx.beginPath();
  ctx.roundRect(bx, by, tw + pad * 2, fs + pad * 2, d.borderRadius ?? 4);
  ctx.fill();

  ctx.fillStyle = d.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y - 30 - fs / 2);

  // INNOVATION: Team role badge
  if (d.teamRole) {
    const roleColors: Record<string, string> = {
      ANALYST: "#2196F3", RISK: "#EF5350", TRADER: "#26A69A", COMPLIANCE: "#FF9800",
    };
    const rc = roleColors[d.teamRole] || d.color;
    ctx.save();
    ctx.globalAlpha = d.opacity;
    drawLabel(ctx, d.teamRole, bx + 4, by - 14, rc, "rgba(10,10,20,0.9)", 8);
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawCallout(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 3) return;
  const tipX = ix(d.points[1].index, c), tipY = py(d.points[1].price, c);
  const boxX = ix(d.points[2].index, c), boxY = py(d.points[2].price, c);
  const text = d.text || "Callout";
  const fs = d.fontSize || 12;

  ctx.save();
  ctx.globalAlpha = d.opacity;

  // Arrow line
  ctx.strokeStyle = d.color;
  ctx.lineWidth = d.lineWidth;
  ctx.beginPath();
  ctx.moveTo(boxX, boxY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  // Arrowhead
  const angle = Math.atan2(tipY - boxY, tipX - boxX);
  ctx.fillStyle = d.color;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - 8 * Math.cos(angle - 0.3), tipY - 8 * Math.sin(angle - 0.3));
  ctx.lineTo(tipX - 8 * Math.cos(angle + 0.3), tipY - 8 * Math.sin(angle + 0.3));
  ctx.closePath();
  ctx.fill();

  // Text box
  const weight = d.fontBold ? "bold" : "normal";
  const style = d.fontItalic ? "italic" : "normal";
  ctx.font = `${style} ${weight} ${fs}px 'IBM Plex Mono', monospace`;
  const tw = ctx.measureText(text).width;
  const pad = 6;
  ctx.fillStyle = d.backgroundColor || "rgba(19,23,34,0.92)";
  ctx.beginPath();
  ctx.roundRect(boxX - tw / 2 - pad, boxY - fs / 2 - pad, tw + pad * 2, fs + pad * 2, d.borderRadius ?? 4);
  ctx.fill();
  ctx.strokeStyle = d.color;
  ctx.lineWidth = 0.5;
  ctx.stroke();

  ctx.fillStyle = d.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, boxX, boxY);

  // INNOVATION: Alert pulse ring
  if (d.alertEnabled) {
    const alertColor = d.alertTriggered ? "#FF9800" : "#787B86";
    ctx.save();
    ctx.globalAlpha = d.alertTriggered ? 0.6 : 0.25;
    ctx.strokeStyle = alertColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(tipX, tipY, 10, 0, Math.PI * 2);
    ctx.stroke();
    if (d.alertTriggered) {
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(tipX, tipY, 18, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawPriceLabel(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, pair: string, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 1) return;
  const x = ix(d.points[0].index, c), y = py(d.points[0].price, c);
  const text = formatPrice(d.points[0].price, pair);

  ctx.save();
  ctx.globalAlpha = d.opacity;
  ctx.font = "bold 10px 'IBM Plex Mono', monospace";
  const tw = ctx.measureText(text).width;
  const pad = 5;

  // Arrow pointing left
  ctx.fillStyle = d.color;
  ctx.beginPath();
  ctx.moveTo(x - tw - pad * 2 - 8, y);
  ctx.lineTo(x - tw - pad * 2, y - 6);
  ctx.lineTo(x - tw - pad * 2, y + 6);
  ctx.closePath();
  ctx.fill();

  // Box
  ctx.beginPath();
  ctx.roundRect(x - tw - pad * 2, y - 10, tw + pad * 2, 20, 3);
  ctx.fill();

  ctx.fillStyle = THEME.canvasBg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x - tw / 2 - pad, y);

  // INNOVATION: Policy level overlay
  if (d.policyLinkForwardRate !== undefined || d.policyLinkHedgeRatio !== undefined) {
    const policyLines: string[] = [];
    if (d.policyLinkForwardRate !== undefined) policyLines.push(`FWD: ${d.policyLinkForwardRate.toFixed(4)}`);
    if (d.policyLinkHedgeRatio !== undefined) policyLines.push(`HEDGE: ${(d.policyLinkHedgeRatio * 100).toFixed(0)}%`);
    ctx.save();
    ctx.globalAlpha = d.opacity * 0.85;
    ctx.font = "8px 'IBM Plex Mono', monospace";
    ctx.fillStyle = "#00BCD4";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    for (let pi = 0; pi < policyLines.length; pi++) {
      ctx.fillText(policyLines[pi], x - tw - pad * 2, y + 14 + pi * 11);
    }
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawArrowMarkerUp(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 1) return;
  const x = ix(d.points[0].index, c), y = py(d.points[0].price, c);
  const size = 12;

  ctx.save();
  ctx.globalAlpha = d.opacity;
  ctx.fillStyle = THEME.bullBody;
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x - size * 0.6, y + size * 0.3);
  ctx.lineTo(x + size * 0.6, y + size * 0.3);
  ctx.closePath();
  ctx.fill();

  if (isSelected || isHovered) {
    ctx.strokeStyle = THEME.bullBody;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // INNOVATION: Signal strength dots
  if (d.signalStrength && d.signalStrength > 0) {
    ctx.save();
    ctx.globalAlpha = d.opacity;
    for (let si = 0; si < Math.min(d.signalStrength, 5); si++) {
      ctx.beginPath();
      ctx.arc(x + (si - 2) * 5, y + size * 0.3 + 6, 2, 0, Math.PI * 2);
      ctx.fillStyle = THEME.bullBody;
      ctx.fill();
    }
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawArrowMarkerDown(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 1) return;
  const x = ix(d.points[0].index, c), y = py(d.points[0].price, c);
  const size = 12;

  ctx.save();
  ctx.globalAlpha = d.opacity;
  ctx.fillStyle = THEME.bearBody;
  ctx.beginPath();
  ctx.moveTo(x, y + size);
  ctx.lineTo(x - size * 0.6, y - size * 0.3);
  ctx.lineTo(x + size * 0.6, y - size * 0.3);
  ctx.closePath();
  ctx.fill();

  if (isSelected || isHovered) {
    ctx.strokeStyle = THEME.bearBody;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // INNOVATION: Signal strength dots
  if (d.signalStrength && d.signalStrength > 0) {
    ctx.save();
    ctx.globalAlpha = d.opacity;
    for (let si = 0; si < Math.min(d.signalStrength, 5); si++) {
      ctx.beginPath();
      ctx.arc(x + (si - 2) * 5, y - size * 0.3 - 6, 2, 0, Math.PI * 2);
      ctx.fillStyle = THEME.bearBody;
      ctx.fill();
    }
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

function drawFlagMark(ctx: CanvasRenderingContext2D, d: Drawing, c: Coords, isSelected: boolean, isHovered: boolean): void {
  if (d.points.length < 1) return;
  const x = ix(d.points[0].index, c), y = py(d.points[0].price, c);
  const staffH = 30;
  const flagW = 16, flagH = 12;

  ctx.save();
  ctx.globalAlpha = d.opacity;

  // Staff
  ctx.strokeStyle = d.color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - staffH);
  ctx.stroke();

  // Flag triangle
  ctx.fillStyle = d.color;
  ctx.beginPath();
  ctx.moveTo(x, y - staffH);
  ctx.lineTo(x + flagW, y - staffH + flagH / 2);
  ctx.lineTo(x, y - staffH + flagH);
  ctx.closePath();
  ctx.fill();

  // INNOVATION: Event taxonomy color and label
  if (d.eventTaxonomy) {
    const taxColors: Record<string, string> = {
      NFP: "#EF5350", CPI: "#FF9800", FOMC: "#2196F3", ECB: "#2196F3",
      BOJ: "#FF4081", BOE: "#9C27B0", RBA: "#00BCD4", SNB: "#26A69A",
      TRADE_ENTRY: "#26A69A", TRADE_EXIT: "#EF5350",
      POSITION_OPEN: "#26A69A", POSITION_CLOSE: "#EF5350",
    };
    const tc = taxColors[d.eventTaxonomy] || d.color;
    ctx.save();
    ctx.globalAlpha = d.opacity;
    // Re-color the flag
    ctx.fillStyle = tc;
    ctx.beginPath();
    ctx.moveTo(x, y - staffH);
    ctx.lineTo(x + flagW, y - staffH + flagH / 2);
    ctx.lineTo(x, y - staffH + flagH);
    ctx.closePath();
    ctx.fill();
    drawLabel(ctx, d.eventTaxonomy.replace("_", " "), x + flagW + 6, y - staffH + flagH / 2, tc, "rgba(10,10,20,0.9)", 8);
    ctx.restore();
  }
  drawHandles(ctx, d, c, isSelected, isHovered);
  ctx.restore();
}

// ══════════════════════════════════════════════════════
//  MAIN DISPATCH: drawGenericDrawing
// ══════════════════════════════════════════════════════

export function drawGenericDrawing(
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
  const c = getCoords(layout, viewport, scale);
  switch (d.type) {
    // Lines
    case "ray": drawRay(ctx, d, c, isSelected, isHovered); break;
    case "extended_line": drawExtendedLine(ctx, d, c, isSelected, isHovered); break;
    case "horizontal_ray": drawHorizontalRay(ctx, d, c, isSelected, isHovered); break;
    case "vertical_line": drawVerticalLine(ctx, d, c, isSelected, isHovered); break;
    case "cross_line": drawCrossLine(ctx, d, c, isSelected, isHovered); break;
    case "info_line": drawInfoLine(ctx, d, c, pair, isSelected, isHovered); break;
    case "trend_angle": drawTrendAngle(ctx, d, c, isSelected, isHovered); break;
    // Channels
    case "parallel_channel": drawParallelChannel(ctx, d, c, isSelected, isHovered); break;
    case "regression_trend": drawRegressionTrend(ctx, d, c, isSelected, isHovered, bars); break;
    case "flat_top_bottom": drawFlatTopBottom(ctx, d, c, isSelected, isHovered); break;
    case "disjoint_channel": drawDisjointChannel(ctx, d, c, isSelected, isHovered); break;
    case "pitchfork": drawPitchforkCore(ctx, d, c, isSelected, isHovered, "andrews", bars); break;
    case "schiff_pitchfork": drawPitchforkCore(ctx, d, c, isSelected, isHovered, "schiff", bars); break;
    case "mod_schiff_pitchfork": drawPitchforkCore(ctx, d, c, isSelected, isHovered, "mod_schiff", bars); break;
    case "inside_pitchfork": drawPitchforkCore(ctx, d, c, isSelected, isHovered, "inside", bars); break;
    // Fibonacci
    case "fib_extension": drawFibExtension(ctx, d, c, pair, isSelected, isHovered, bars); break;
    case "fib_channel": drawFibChannel(ctx, d, c, pair, isSelected, isHovered, bars); break;
    case "fib_time_zone": drawFibTimeZone(ctx, d, c, isSelected, isHovered); break;
    case "fib_speed_fan": drawFibSpeedFan(ctx, d, c, isSelected, isHovered, bars); break;
    // Gann
    case "gann_box": drawGannBox(ctx, d, c, pair, isSelected, isHovered); break;
    case "gann_fan": drawGannFan(ctx, d, c, isSelected, isHovered, bars); break;
    // Patterns
    case "xabcd_pattern": drawXABCDPattern(ctx, d, c, isSelected, isHovered); break;
    case "cypher_pattern": drawCypherPattern(ctx, d, c, isSelected, isHovered); break;
    case "abcd_pattern": drawABCDPattern(ctx, d, c, isSelected, isHovered); break;
    case "triangle_pattern": drawTrianglePattern(ctx, d, c, isSelected, isHovered); break;
    case "three_drives": drawThreeDrives(ctx, d, c, isSelected, isHovered); break;
    case "head_shoulders": drawHeadShoulders(ctx, d, c, isSelected, isHovered); break;
    case "elliott_impulse": drawElliottImpulse(ctx, d, c, isSelected, isHovered); break;
    case "elliott_correction": drawElliottCorrection(ctx, d, c, isSelected, isHovered); break;
    case "elliott_triangle": drawElliottTriangle(ctx, d, c, isSelected, isHovered); break;
    // Shapes
    case "circle": drawCircle(ctx, d, c, isSelected, isHovered, bars); break;
    case "ellipse": drawEllipse(ctx, d, c, isSelected, isHovered); break;
    case "triangle_shape": drawTriangleShape(ctx, d, c, isSelected, isHovered); break;
    case "arrow_drawing": drawArrowDrawing(ctx, d, c, isSelected, isHovered); break;
    case "brush": drawBrush(ctx, d, c, isSelected, isHovered); break;
    case "polyline": drawPolyline(ctx, d, c, isSelected, isHovered); break;
    case "arc": drawArc(ctx, d, c, isSelected, isHovered); break;
    // Measurement
    case "long_position": drawLongPosition(ctx, d, c, pair, isSelected, isHovered); break;
    case "short_position": drawShortPosition(ctx, d, c, pair, isSelected, isHovered); break;
    case "date_range": drawDateRange(ctx, d, c, isSelected, isHovered); break;
    case "price_range": drawPriceRange(ctx, d, c, pair, isSelected, isHovered); break;
    case "date_price_range": drawDatePriceRange(ctx, d, c, pair, isSelected, isHovered); break;
    case "forecast": drawForecast(ctx, d, c, pair, isSelected, isHovered); break;
    // Annotations
    case "text_note": drawTextNote(ctx, d, c, isSelected, isHovered); break;
    case "anchored_text": drawAnchoredText(ctx, d, c, isSelected, isHovered); break;
    case "callout": drawCallout(ctx, d, c, isSelected, isHovered); break;
    case "price_label": drawPriceLabel(ctx, d, c, pair, isSelected, isHovered); break;
    case "arrow_marker_up": drawArrowMarkerUp(ctx, d, c, isSelected, isHovered); break;
    case "arrow_marker_down": drawArrowMarkerDown(ctx, d, c, isSelected, isHovered); break;
    case "flag_mark": drawFlagMark(ctx, d, c, isSelected, isHovered); break;
    default: break;
  }
}

// ══════════════════════════════════════════════════════
//  MAIN DISPATCH: hitTestGenericDrawing
// ══════════════════════════════════════════════════════

function hitTestLine2pt(mx: number, my: number, d: Drawing, c: Coords, extended: "segment" | "ray" | "line"): HitTestResult | null {
  if (d.points.length < 2) return null;
  const hh = handleHitTest(mx, my, d, c);
  if (hh) return hh;
  const x1 = ix(d.points[0].index, c), y1 = py(d.points[0].price, c);
  const x2 = ix(d.points[1].index, c), y2 = py(d.points[1].price, c);
  let dist: number;
  if (extended === "line") dist = ptToLineDist(mx, my, x1, y1, x2, y2);
  else if (extended === "ray") {
    // Ray: only extends past p1
    const dx = x2 - x1, dy = y2 - y1;
    const t = ((mx - x1) * dx + (my - y1) * dy) / (dx * dx + dy * dy || 1);
    if (t < 0) dist = Math.hypot(mx - x1, my - y1);
    else dist = ptToLineDist(mx, my, x1, y1, x2, y2);
  } else {
    dist = ptToSegDist(mx, my, x1, y1, x2, y2);
  }
  if (dist <= HIT_THRESH) return { drawingId: d.id, distance: dist, part: "body" };
  return null;
}

function hitTestHLine(mx: number, my: number, d: Drawing, c: Coords, fullWidth: boolean): HitTestResult | null {
  if (d.points.length < 1) return null;
  const hh = handleHitTest(mx, my, d, c);
  if (hh) return hh;
  const y = py(d.points[0].price, c);
  const dist = Math.abs(my - y);
  if (!fullWidth) {
    const x1 = ix(d.points[0].index, c);
    if (mx < x1 - HIT_THRESH) return null;
  }
  if (dist <= HIT_THRESH) return { drawingId: d.id, distance: dist, part: "body" };
  return null;
}

function hitTestVLine(mx: number, my: number, d: Drawing, c: Coords): HitTestResult | null {
  if (d.points.length < 1) return null;
  const hh = handleHitTest(mx, my, d, c);
  if (hh) return hh;
  const x = ix(d.points[0].index, c);
  const dist = Math.abs(mx - x);
  if (dist <= HIT_THRESH) return { drawingId: d.id, distance: dist, part: "body" };
  return null;
}

function hitTestCrossLine(mx: number, my: number, d: Drawing, c: Coords): HitTestResult | null {
  if (d.points.length < 1) return null;
  const hh = handleHitTest(mx, my, d, c);
  if (hh) return hh;
  const x = ix(d.points[0].index, c), y = py(d.points[0].price, c);
  const dist = Math.min(Math.abs(mx - x), Math.abs(my - y));
  if (dist <= HIT_THRESH) return { drawingId: d.id, distance: dist, part: "body" };
  return null;
}

function hitTestMultiSegment(mx: number, my: number, d: Drawing, c: Coords): HitTestResult | null {
  const hh = handleHitTest(mx, my, d, c);
  if (hh) return hh;
  let minDist = Infinity;
  const pts = d.points.map(p => ({ x: ix(p.index, c), y: py(p.price, c) }));
  for (let i = 0; i < pts.length - 1; i++) {
    const dist = ptToSegDist(mx, my, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
    if (dist < minDist) minDist = dist;
  }
  if (minDist <= HIT_THRESH) return { drawingId: d.id, distance: minDist, part: "body" };
  return null;
}

function hitTestCircle(mx: number, my: number, d: Drawing, c: Coords): HitTestResult | null {
  if (d.points.length < 2) return null;
  const hh = handleHitTest(mx, my, d, c);
  if (hh) return hh;
  const cx_ = ix(d.points[0].index, c), cy_ = py(d.points[0].price, c);
  const ex = ix(d.points[1].index, c), ey = py(d.points[1].price, c);
  const radius = Math.hypot(ex - cx_, ey - cy_);
  const distFromCenter = Math.hypot(mx - cx_, my - cy_);
  const dist = Math.abs(distFromCenter - radius);
  if (dist <= HIT_THRESH || (d.fillEnabled && distFromCenter <= radius)) {
    return { drawingId: d.id, distance: Math.min(dist, 1), part: "body" };
  }
  return null;
}

function hitTestEllipse(mx: number, my: number, d: Drawing, c: Coords): HitTestResult | null {
  if (d.points.length < 2) return null;
  const hh = handleHitTest(mx, my, d, c);
  if (hh) return hh;
  const cx_ = ix(d.points[0].index, c), cy_ = py(d.points[0].price, c);
  const ex = ix(d.points[1].index, c), ey = py(d.points[1].price, c);
  const rx = Math.abs(ex - cx_) || 1, ry = Math.abs(ey - cy_) || 1;
  const nx = (mx - cx_) / rx, ny = (my - cy_) / ry;
  const normDist = Math.sqrt(nx * nx + ny * ny);
  const edgeDist = Math.abs(normDist - 1) * Math.min(rx, ry);
  if (edgeDist <= HIT_THRESH || (d.fillEnabled && normDist <= 1)) {
    return { drawingId: d.id, distance: Math.min(edgeDist, 1), part: "body" };
  }
  return null;
}

function hitTestRect2pt(mx: number, my: number, d: Drawing, c: Coords): HitTestResult | null {
  if (d.points.length < 2) return null;
  const hh = handleHitTest(mx, my, d, c);
  if (hh) return hh;
  const x1 = ix(d.points[0].index, c), y1 = py(d.points[0].price, c);
  const x2 = ix(d.points[1].index, c), y2 = py(d.points[1].price, c);
  const left = Math.min(x1, x2), right = Math.max(x1, x2);
  const top = Math.min(y1, y2), bot = Math.max(y1, y2);
  if (mx >= left - HIT_THRESH && mx <= right + HIT_THRESH && my >= top - HIT_THRESH && my <= bot + HIT_THRESH) {
    const minEdge = Math.min(Math.abs(mx - left), Math.abs(mx - right), Math.abs(my - top), Math.abs(my - bot));
    if (minEdge <= HIT_THRESH) return { drawingId: d.id, distance: minEdge, part: "body" };
    if (mx >= left && mx <= right && my >= top && my <= bot) {
      return { drawingId: d.id, distance: 0.5, part: "body" };
    }
  }
  return null;
}

function hitTestTextBox(mx: number, my: number, d: Drawing, c: Coords, w: number, h: number): HitTestResult | null {
  if (d.points.length < 1) return null;
  const hh = handleHitTest(mx, my, d, c);
  if (hh) return hh;
  const x = ix(d.points[0].index, c), y = py(d.points[0].price, c);
  const pad = 6;
  if (mx >= x - pad && mx <= x + w + pad && my >= y - h / 2 - pad && my <= y + h / 2 + pad) {
    return { drawingId: d.id, distance: 0.5, part: "body" };
  }
  return null;
}

function hitTestBrush(mx: number, my: number, d: Drawing, _c: Coords): HitTestResult | null {
  const points = d.brushPoints;
  if (!points || points.length < 2) return null;
  let minDist = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const dist = ptToSegDist(mx, my, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
    if (dist < minDist) minDist = dist;
  }
  const threshold = HIT_THRESH + (d.brushSize || 2);
  if (minDist <= threshold) return { drawingId: d.id, distance: minDist, part: "body" };
  return null;
}

function hitTestChannel3pt(mx: number, my: number, d: Drawing, c: Coords): HitTestResult | null {
  if (d.points.length < 3) return null;
  const hh = handleHitTest(mx, my, d, c);
  if (hh) return hh;
  const x1 = ix(d.points[0].index, c), y1 = py(d.points[0].price, c);
  const x2 = ix(d.points[1].index, c), y2 = py(d.points[1].price, c);
  const x3 = ix(d.points[2].index, c), y3 = py(d.points[2].price, c);
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return null;
  const nx = -dy / len, ny = dx / len;
  const proj = (x3 - x1) * nx + (y3 - y1) * ny;
  const ox1 = x1 + proj * nx, oy1 = y1 + proj * ny;
  const ox2 = x2 + proj * nx, oy2 = y2 + proj * ny;
  const d1 = ptToSegDist(mx, my, x1, y1, x2, y2);
  const d2 = ptToSegDist(mx, my, ox1, oy1, ox2, oy2);
  const minDist = Math.min(d1, d2);
  if (minDist <= HIT_THRESH) return { drawingId: d.id, distance: minDist, part: "body" };
  return null;
}

function hitTestMarker(mx: number, my: number, d: Drawing, c: Coords): HitTestResult | null {
  if (d.points.length < 1) return null;
  const x = ix(d.points[0].index, c), y = py(d.points[0].price, c);
  const dist = Math.hypot(mx - x, my - y);
  if (dist <= 14) return { drawingId: d.id, distance: dist, part: "body" };
  return null;
}

export function hitTestGenericDrawing(
  mx: number, my: number,
  d: Drawing,
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale,
): HitTestResult | null {
  const c = getCoords(layout, viewport, scale);
  switch (d.type) {
    // Lines
    case "ray": return hitTestLine2pt(mx, my, d, c, "ray");
    case "extended_line": return hitTestLine2pt(mx, my, d, c, "line");
    case "horizontal_ray": return hitTestHLine(mx, my, d, c, false);
    case "vertical_line": return hitTestVLine(mx, my, d, c);
    case "cross_line": return hitTestCrossLine(mx, my, d, c);
    case "info_line": return hitTestLine2pt(mx, my, d, c, "segment");
    case "trend_angle": return hitTestLine2pt(mx, my, d, c, "segment");
    // Channels
    case "parallel_channel": return hitTestChannel3pt(mx, my, d, c);
    case "flat_top_bottom": return hitTestChannel3pt(mx, my, d, c);
    case "pitchfork": case "schiff_pitchfork": case "mod_schiff_pitchfork": case "inside_pitchfork":
      return hitTestChannel3pt(mx, my, d, c);
    case "disjoint_channel": return hitTestMultiSegment(mx, my, d, c);
    case "regression_trend": return hitTestLine2pt(mx, my, d, c, "segment");
    // Fibonacci
    case "fib_extension": return hitTestMultiSegment(mx, my, d, c);
    case "fib_channel": return hitTestChannel3pt(mx, my, d, c);
    case "fib_time_zone": return hitTestLine2pt(mx, my, d, c, "segment");
    case "fib_speed_fan": return hitTestLine2pt(mx, my, d, c, "segment");
    // Gann
    case "gann_box": return hitTestRect2pt(mx, my, d, c);
    case "gann_fan": return hitTestLine2pt(mx, my, d, c, "segment");
    // Patterns
    case "xabcd_pattern": case "cypher_pattern": case "abcd_pattern":
    case "triangle_pattern": case "three_drives": case "head_shoulders":
    case "elliott_impulse": case "elliott_correction": case "elliott_triangle":
      return hitTestMultiSegment(mx, my, d, c);
    // Shapes
    case "circle": return hitTestCircle(mx, my, d, c);
    case "ellipse": return hitTestEllipse(mx, my, d, c);
    case "triangle_shape": return hitTestMultiSegment(mx, my, d, c);
    case "arrow_drawing": return hitTestLine2pt(mx, my, d, c, "segment");
    case "brush": return hitTestBrush(mx, my, d, c);
    case "polyline": return hitTestMultiSegment(mx, my, d, c);
    case "arc": return hitTestMultiSegment(mx, my, d, c);
    // Measurement
    case "long_position": case "short_position":
      return hitTestRect2pt(mx, my, d, c);
    case "date_range": case "price_range": case "date_price_range":
      return hitTestRect2pt(mx, my, d, c);
    case "forecast": return hitTestMultiSegment(mx, my, d, c);
    // Annotations
    case "text_note": case "anchored_text":
      return hitTestTextBox(mx, my, d, c, 80, 20);
    case "callout": return hitTestMultiSegment(mx, my, d, c);
    case "price_label": return hitTestMarker(mx, my, d, c);
    case "arrow_marker_up": case "arrow_marker_down": case "flag_mark":
      return hitTestMarker(mx, my, d, c);
    default: return null;
  }
}
