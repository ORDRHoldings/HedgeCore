/**
 * patterns.ts -- Auto-detect classic chart patterns and render annotations
 *
 * Uses pivot-point detection (local highs/lows) to identify:
 *   - Double Top / Double Bottom
 *   - Head & Shoulders (stub)
 *   - Ascending / Descending Triangle
 *   - Rising / Falling Wedge (stub)
 *   - Bull / Bear Flag (stub)
 *
 * Confidence scores are based on symmetry and pattern quality metrics.
 */

import type { Bar } from "../indicators/types";
import type { ChartLayout, Viewport } from "../core/data";
import { indexToX, priceToY } from "../core/data";
import { THEME } from "../core/theme";

// ── Types ────────────────────────────────────────────────

export type PatternType =
  | "double_top"
  | "double_bottom"
  | "head_shoulders"
  | "triangle_asc"
  | "triangle_desc"
  | "wedge_rising"
  | "wedge_falling"
  | "flag_bull"
  | "flag_bear";

export interface DetectedPattern {
  type: PatternType;
  startIndex: number;
  endIndex: number;
  keyPoints: { index: number; price: number }[];
  /** 0-1 confidence score */
  confidence: number;
  label: string;
}

// ── Pivot detection ──────────────────────────────────────

interface Pivot {
  index: number;
  price: number;
  kind: "high" | "low";
}

/**
 * Find local highs and lows where the bar's high/low is the extreme
 * within a window of `radius` bars on each side.
 */
export function findPivots(bars: Bar[], startIdx: number, endIdx: number, radius: number = 5): Pivot[] {
  const pivots: Pivot[] = [];
  const lo = Math.max(0, startIdx);
  const hi = Math.min(bars.length - 1, endIdx);

  for (let i = lo + radius; i <= hi - radius; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= radius; j++) {
      if (bars[i].h <= bars[i - j].h || bars[i].h <= bars[i + j].h) isHigh = false;
      if (bars[i].l >= bars[i - j].l || bars[i].l >= bars[i + j].l) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) pivots.push({ index: i, price: bars[i].h, kind: "high" });
    if (isLow) pivots.push({ index: i, price: bars[i].l, kind: "low" });
  }
  return pivots;
}

// ── Pattern matchers ─────────────────────────────────────

/** Helper: percentage difference between two values */
function pctDiff(a: number, b: number): number {
  const avg = (a + b) / 2;
  if (avg === 0) return 0;
  return Math.abs(a - b) / avg;
}

/**
 * Double Top: two pivot highs at similar price levels with a valley between.
 * Tolerance: highs within 0.3% of each other, valley at least 0.2% below.
 */
function detectDoubleTops(pivots: Pivot[], bars: Bar[]): DetectedPattern[] {
  const results: DetectedPattern[] = [];
  const highs = pivots.filter((p) => p.kind === "high");

  for (let i = 0; i < highs.length - 1; i++) {
    for (let j = i + 1; j < highs.length; j++) {
      const h1 = highs[i];
      const h2 = highs[j];

      // Highs must be separated by at least 5 bars
      if (h2.index - h1.index < 5) continue;
      // Highs must be separated by at most 80 bars
      if (h2.index - h1.index > 80) continue;

      const diff = pctDiff(h1.price, h2.price);
      if (diff > 0.003) continue; // 0.3% tolerance

      // Find the valley (lowest low) between the two highs
      let valleyPrice = Infinity;
      let valleyIdx = h1.index;
      for (let k = h1.index + 1; k < h2.index; k++) {
        if (bars[k] && bars[k].l < valleyPrice) {
          valleyPrice = bars[k].l;
          valleyIdx = k;
        }
      }

      const avgHigh = (h1.price + h2.price) / 2;
      const dip = (avgHigh - valleyPrice) / avgHigh;
      if (dip < 0.002) continue; // valley must be meaningful

      // Confidence: tighter the highs and deeper the valley, higher confidence
      const symmetry = 1 - diff / 0.003;
      const depth = Math.min(1, dip / 0.01);
      const confidence = Math.round(Math.min(0.95, symmetry * 0.5 + depth * 0.5) * 100) / 100;

      results.push({
        type: "double_top",
        startIndex: h1.index,
        endIndex: h2.index,
        keyPoints: [
          { index: h1.index, price: h1.price },
          { index: valleyIdx, price: valleyPrice },
          { index: h2.index, price: h2.price },
        ],
        confidence,
        label: `Double Top (${Math.round(confidence * 100)}%)`,
      });
    }
  }
  return results;
}

/**
 * Double Bottom: two pivot lows at similar price levels with a peak between.
 */
function detectDoubleBottoms(pivots: Pivot[], bars: Bar[]): DetectedPattern[] {
  const results: DetectedPattern[] = [];
  const lows = pivots.filter((p) => p.kind === "low");

  for (let i = 0; i < lows.length - 1; i++) {
    for (let j = i + 1; j < lows.length; j++) {
      const l1 = lows[i];
      const l2 = lows[j];

      if (l2.index - l1.index < 5) continue;
      if (l2.index - l1.index > 80) continue;

      const diff = pctDiff(l1.price, l2.price);
      if (diff > 0.003) continue;

      // Find the peak (highest high) between the two lows
      let peakPrice = -Infinity;
      let peakIdx = l1.index;
      for (let k = l1.index + 1; k < l2.index; k++) {
        if (bars[k] && bars[k].h > peakPrice) {
          peakPrice = bars[k].h;
          peakIdx = k;
        }
      }

      const avgLow = (l1.price + l2.price) / 2;
      const rise = (peakPrice - avgLow) / avgLow;
      if (rise < 0.002) continue;

      const symmetry = 1 - diff / 0.003;
      const depth = Math.min(1, rise / 0.01);
      const confidence = Math.round(Math.min(0.95, symmetry * 0.5 + depth * 0.5) * 100) / 100;

      results.push({
        type: "double_bottom",
        startIndex: l1.index,
        endIndex: l2.index,
        keyPoints: [
          { index: l1.index, price: l1.price },
          { index: peakIdx, price: peakPrice },
          { index: l2.index, price: l2.price },
        ],
        confidence,
        label: `Double Bottom (${Math.round(confidence * 100)}%)`,
      });
    }
  }
  return results;
}

/**
 * Ascending Triangle: rising lows approaching flat resistance.
 * Needs at least 2 similar highs (resistance) and 2 rising lows (support).
 */
function detectAscendingTriangles(pivots: Pivot[], _bars: Bar[]): DetectedPattern[] {
  const results: DetectedPattern[] = [];
  const highs = pivots.filter((p) => p.kind === "high");
  const lows = pivots.filter((p) => p.kind === "low");

  // Need at least 2 highs and 2 lows
  if (highs.length < 2 || lows.length < 2) return results;

  // Try pairs of highs that form flat resistance
  for (let i = 0; i < highs.length - 1; i++) {
    for (let j = i + 1; j < highs.length; j++) {
      const h1 = highs[i];
      const h2 = highs[j];

      if (h2.index - h1.index < 10) continue;
      if (h2.index - h1.index > 100) continue;

      // Resistance must be flat (within 0.2%)
      if (pctDiff(h1.price, h2.price) > 0.002) continue;

      // Find lows between (or slightly around) the two highs
      const relevantLows = lows.filter(
        (l) => l.index >= h1.index - 3 && l.index <= h2.index + 3
      );
      if (relevantLows.length < 2) continue;

      // Check that lows are rising
      let rising = true;
      for (let k = 1; k < relevantLows.length; k++) {
        if (relevantLows[k].price <= relevantLows[k - 1].price) {
          rising = false;
          break;
        }
      }
      if (!rising) continue;

      const avgResistance = (h1.price + h2.price) / 2;
      const lowestLow = relevantLows[0].price;
      const highestLow = relevantLows[relevantLows.length - 1].price;
      const convergence = 1 - (avgResistance - highestLow) / (avgResistance - lowestLow + 0.0001);

      const confidence = Math.round(Math.min(0.9, 0.4 + convergence * 0.5) * 100) / 100;

      const keyPoints = [
        { index: h1.index, price: h1.price },
        ...relevantLows.map((l) => ({ index: l.index, price: l.price })),
        { index: h2.index, price: h2.price },
      ];

      results.push({
        type: "triangle_asc",
        startIndex: Math.min(h1.index, relevantLows[0].index),
        endIndex: Math.max(h2.index, relevantLows[relevantLows.length - 1].index),
        keyPoints,
        confidence,
        label: `Asc Triangle (${Math.round(confidence * 100)}%)`,
      });
    }
  }
  return results;
}

/**
 * Descending Triangle: falling highs approaching flat support.
 */
function detectDescendingTriangles(pivots: Pivot[], _bars: Bar[]): DetectedPattern[] {
  const results: DetectedPattern[] = [];
  const highs = pivots.filter((p) => p.kind === "high");
  const lows = pivots.filter((p) => p.kind === "low");

  if (highs.length < 2 || lows.length < 2) return results;

  // Try pairs of lows that form flat support
  for (let i = 0; i < lows.length - 1; i++) {
    for (let j = i + 1; j < lows.length; j++) {
      const l1 = lows[i];
      const l2 = lows[j];

      if (l2.index - l1.index < 10) continue;
      if (l2.index - l1.index > 100) continue;

      // Support must be flat (within 0.2%)
      if (pctDiff(l1.price, l2.price) > 0.002) continue;

      // Find highs between the two lows
      const relevantHighs = highs.filter(
        (h) => h.index >= l1.index - 3 && h.index <= l2.index + 3
      );
      if (relevantHighs.length < 2) continue;

      // Check that highs are falling
      let falling = true;
      for (let k = 1; k < relevantHighs.length; k++) {
        if (relevantHighs[k].price >= relevantHighs[k - 1].price) {
          falling = false;
          break;
        }
      }
      if (!falling) continue;

      const avgSupport = (l1.price + l2.price) / 2;
      const highestHigh = relevantHighs[0].price;
      const lowestHigh = relevantHighs[relevantHighs.length - 1].price;
      const convergence = 1 - (lowestHigh - avgSupport) / (highestHigh - avgSupport + 0.0001);

      const confidence = Math.round(Math.min(0.9, 0.4 + convergence * 0.5) * 100) / 100;

      const keyPoints = [
        { index: l1.index, price: l1.price },
        ...relevantHighs.map((h) => ({ index: h.index, price: h.price })),
        { index: l2.index, price: l2.price },
      ];

      results.push({
        type: "triangle_desc",
        startIndex: Math.min(l1.index, relevantHighs[0].index),
        endIndex: Math.max(l2.index, relevantHighs[relevantHighs.length - 1].index),
        keyPoints,
        confidence,
        label: `Desc Triangle (${Math.round(confidence * 100)}%)`,
      });
    }
  }
  return results;
}

// ── Stub detectors (return empty) ────────────────────────

function detectHeadShoulders(_pivots: Pivot[], _bars: Bar[]): DetectedPattern[] {
  // Future: implement head & shoulders detection
  return [];
}

function detectWedges(_pivots: Pivot[], _bars: Bar[]): DetectedPattern[] {
  // Future: implement rising/falling wedge detection
  return [];
}

function detectFlags(_pivots: Pivot[], _bars: Bar[]): DetectedPattern[] {
  // Future: implement bull/bear flag detection
  return [];
}

// ── Public API ───────────────────────────────────────────

/**
 * Detect classic chart patterns in the given bar range.
 * Returns all patterns found, sorted by startIndex.
 */
export function detectPatterns(bars: Bar[], startIdx: number, endIdx: number): DetectedPattern[] {
  if (bars.length < 15) return [];

  const clamped_start = Math.max(0, startIdx);
  const clamped_end = Math.min(bars.length - 1, endIdx);
  if (clamped_end - clamped_start < 15) return [];

  const pivots = findPivots(bars, clamped_start, clamped_end);
  if (pivots.length < 2) return [];

  const patterns: DetectedPattern[] = [
    ...detectDoubleTops(pivots, bars),
    ...detectDoubleBottoms(pivots, bars),
    ...detectAscendingTriangles(pivots, bars),
    ...detectDescendingTriangles(pivots, bars),
    ...detectHeadShoulders(pivots, bars),
    ...detectWedges(pivots, bars),
    ...detectFlags(pivots, bars),
  ];

  // Sort by start index, deduplicate overlapping same-type patterns
  patterns.sort((a, b) => a.startIndex - b.startIndex);

  // Remove duplicates: same type with overlapping range, keep highest confidence
  const deduplicated: DetectedPattern[] = [];
  for (const p of patterns) {
    const overlapping = deduplicated.find(
      (d) =>
        d.type === p.type &&
        p.startIndex <= d.endIndex &&
        p.endIndex >= d.startIndex,
    );
    if (overlapping) {
      if (p.confidence > overlapping.confidence) {
        const idx = deduplicated.indexOf(overlapping);
        deduplicated[idx] = p;
      }
    } else {
      deduplicated.push(p);
    }
  }

  return deduplicated;
}

// ── Colors ───────────────────────────────────────────────

const BULLISH_TYPES: Set<PatternType> = new Set([
  "double_bottom",
  "triangle_asc",
  "wedge_falling",
  "flag_bull",
]);

const BEARISH_TYPES: Set<PatternType> = new Set([
  "double_top",
  "triangle_desc",
  "wedge_rising",
  "flag_bear",
]);

function patternColor(type: PatternType): string {
  if (BULLISH_TYPES.has(type)) return THEME.bullBody; // #26A69A
  if (BEARISH_TYPES.has(type)) return THEME.bearBody; // #EF5350
  return THEME.crosshairColor; // neutral
}

// ── Renderer ─────────────────────────────────────────────

/**
 * Render detected patterns on the chart.
 * Draws dashed connecting lines between key points and a label badge
 * with pattern name and confidence percentage.
 */
export function drawPatterns(
  ctx: CanvasRenderingContext2D,
  patterns: DetectedPattern[],
  layout: ChartLayout,
  viewport: Viewport,
): void {
  if (patterns.length === 0) return;

  const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex, priceMin, priceMax } = viewport;

  for (const pattern of patterns) {
    // Skip patterns entirely outside viewport
    if (pattern.endIndex < startIndex || pattern.startIndex > endIndex) continue;
    if (pattern.keyPoints.length < 2) continue;

    const color = patternColor(pattern.type);

    // Draw connecting lines between key points
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();

    let labelMinY = Infinity;
    let labelCenterX = 0;
    let pointCount = 0;

    for (let i = 0; i < pattern.keyPoints.length; i++) {
      const pt = pattern.keyPoints[i];
      const x = indexToX(pt.index, startIndex, endIndex, chartLeft, chartWidth);
      const y = priceToY(pt.price, priceMin, priceMax, mainTop, mainHeight);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      if (y < labelMinY) labelMinY = y;
      labelCenterX += x;
      pointCount++;
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw small circles at each key point
    ctx.fillStyle = color;
    for (const pt of pattern.keyPoints) {
      const x = indexToX(pt.index, startIndex, endIndex, chartLeft, chartWidth);
      const y = priceToY(pt.price, priceMin, priceMax, mainTop, mainHeight);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw label badge above the highest point
    if (pointCount > 0) {
      labelCenterX = labelCenterX / pointCount;
      const labelY = Math.max(mainTop + 14, labelMinY - 12);

      const text = pattern.label;
      ctx.font = "10px 'IBM Plex Mono', monospace";
      const textWidth = ctx.measureText(text).width;
      const badgePadX = 6;
      const badgePadY = 3;
      const badgeW = textWidth + badgePadX * 2;
      const badgeH = 16;
      const badgeX = labelCenterX - badgeW / 2;
      const badgeY = labelY - badgeH;

      // Badge background
      const bgAlpha = "0.85";
      ctx.fillStyle = `rgba(19,23,34,${bgAlpha})`;
      ctx.beginPath();
      roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 3);
      ctx.fill();

      // Badge border
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 3);
      ctx.stroke();

      // Badge text
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, labelCenterX, labelY - badgeH / 2);
      ctx.textBaseline = "alphabetic";
    }
  }
}

// ── Rounded rect helper ──────────────────────────────────

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
