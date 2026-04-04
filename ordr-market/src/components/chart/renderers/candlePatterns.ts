/**
 * candlePatterns.ts — Single & multi-candle pattern detection + labels
 *
 * Detects: Doji, Hammer, Inverted Hammer, Shooting Star, Hanging Man,
 * Bullish Engulfing, Bearish Engulfing, Bullish Harami, Bearish Harami,
 * Morning Star, Evening Star, Marubozu Bull, Marubozu Bear.
 *
 * Renders small text labels above/below each pattern candle, colour-coded
 * green (bullish) / red (bearish) / gray (neutral).
 */

import type { Bar } from "../indicators/types";
import type { ChartLayout, Viewport } from "../core/data";
import type { PriceScale } from "../core/data";
import { priceToY, indexToX } from "../core/data";

export interface CandlePatternLabel {
  barIndex: number;    // candle to annotate
  label: string;       // short name, e.g. "ENGULF ▲"
  sentiment: 'bull' | 'bear' | 'neutral';
  price: number;       // attach point (high for above, low for below)
  above: boolean;      // render above or below the candle
}

// ── Helper predicates ─────────────────────────────────────────────────────────

function bodySize(b: Bar): number { return Math.abs(b.c - b.o); }
function upperWick(b: Bar): number { return b.h - Math.max(b.o, b.c); }
function lowerWick(b: Bar): number { return Math.min(b.o, b.c) - b.l; }
function range(b: Bar): number { return b.h - b.l; }
function isBull(b: Bar): boolean { return b.c > b.o; }
function isDoji(b: Bar): boolean {
  const r = range(b);
  return r > 0 && bodySize(b) / r < 0.1;
}
function avgRange(bars: Bar[], i: number, n = 14): number {
  const start = Math.max(0, i - n);
  let sum = 0;
  for (let j = start; j < i; j++) sum += range(bars[j]);
  return sum / (i - start || 1);
}

// ── Pattern detection ─────────────────────────────────────────────────────────

export function computeCandlePatterns(bars: Bar[]): CandlePatternLabel[] {
  const labels: CandlePatternLabel[] = [];

  for (let i = 1; i < bars.length; i++) {
    const b  = bars[i];
    const pb = bars[i - 1];
    const r  = range(b);
    if (r === 0) continue;
    const avg = avgRange(bars, i);

    const body  = bodySize(b);
    const upper = upperWick(b);
    const lower = lowerWick(b);

    // ── Single-candle patterns ──────────────────────────────────────────────

    // Doji
    if (isDoji(b) && r >= avg * 0.5) {
      labels.push({ barIndex: i, label: 'DOJI', sentiment: 'neutral', price: b.h, above: true });
      continue;
    }

    // Marubozu Bull (no wicks, big body)
    if (body / r > 0.95 && isBull(b) && body >= avg * 0.8) {
      labels.push({ barIndex: i, label: 'MBULL', sentiment: 'bull', price: b.h, above: true });
      continue;
    }

    // Marubozu Bear
    if (body / r > 0.95 && !isBull(b) && body >= avg * 0.8) {
      labels.push({ barIndex: i, label: 'MBEAR', sentiment: 'bear', price: b.l, above: false });
      continue;
    }

    // Hammer / Hanging Man: small body at top, long lower wick
    if (lower >= body * 2 && upper <= body * 0.5 && body >= avg * 0.05) {
      const sent: 'bull' | 'bear' = isBull(pb) ? 'bear' : 'bull'; // after downtrend=bull
      const name = sent === 'bull' ? 'HAMMER' : 'HANG';
      labels.push({ barIndex: i, label: name, sentiment: sent, price: b.l, above: false });
      continue;
    }

    // Inverted Hammer / Shooting Star: small body at bottom, long upper wick
    if (upper >= body * 2 && lower <= body * 0.5 && body >= avg * 0.05) {
      const sent: 'bull' | 'bear' = isBull(pb) ? 'bear' : 'bull';
      const name = sent === 'bear' ? 'STAR' : 'INV-H';
      labels.push({ barIndex: i, label: name, sentiment: sent, price: b.h, above: true });
      continue;
    }

    // ── Two-candle patterns ─────────────────────────────────────────────────

    // Bullish Engulfing
    if (!isBull(pb) && isBull(b) && b.o < pb.c && b.c > pb.o && body > bodySize(pb)) {
      labels.push({ barIndex: i, label: 'ENGULF▲', sentiment: 'bull', price: b.h, above: true });
      continue;
    }

    // Bearish Engulfing
    if (isBull(pb) && !isBull(b) && b.o > pb.c && b.c < pb.o && body > bodySize(pb)) {
      labels.push({ barIndex: i, label: 'ENGULF▼', sentiment: 'bear', price: b.l, above: false });
      continue;
    }

    // Bullish Harami: large bear prev, small bull inside
    if (!isBull(pb) && isBull(b) && b.o > pb.c && b.c < pb.o && body < bodySize(pb) * 0.5) {
      labels.push({ barIndex: i, label: 'HRAMI▲', sentiment: 'bull', price: b.h, above: true });
      continue;
    }

    // Bearish Harami: large bull prev, small bear inside
    if (isBull(pb) && !isBull(b) && b.o < pb.c && b.c > pb.o && body < bodySize(pb) * 0.5) {
      labels.push({ barIndex: i, label: 'HRAMI▼', sentiment: 'bear', price: b.l, above: false });
      continue;
    }
  }

  // ── Three-candle: Morning Star / Evening Star ─────────────────────────────
  for (let i = 2; i < bars.length; i++) {
    const b0 = bars[i - 2];
    const b1 = bars[i - 1]; // star candle — small body
    const b2 = bars[i];
    if (bodySize(b1) / (range(b1) || 1) > 0.3) continue; // middle must be small

    // Morning Star: big bear, small, big bull
    if (!isBull(b0) && bodySize(b0) >= avgRange(bars, i) * 0.6
      && isBull(b2) && bodySize(b2) >= avgRange(bars, i) * 0.6
      && b2.c > (b0.o + b0.c) / 2) {
      // Remove any label already at b2
      const idx = labels.findIndex(l => l.barIndex === i);
      if (idx !== -1) labels.splice(idx, 1);
      labels.push({ barIndex: i, label: 'MORN★', sentiment: 'bull', price: b2.h, above: true });
      continue;
    }

    // Evening Star: big bull, small, big bear
    if (isBull(b0) && bodySize(b0) >= avgRange(bars, i) * 0.6
      && !isBull(b2) && bodySize(b2) >= avgRange(bars, i) * 0.6
      && b2.c < (b0.o + b0.c) / 2) {
      const idx = labels.findIndex(l => l.barIndex === i);
      if (idx !== -1) labels.splice(idx, 1);
      labels.push({ barIndex: i, label: 'EVE★', sentiment: 'bear', price: b2.l, above: false });
    }
  }

  return labels;
}

// ── Canvas renderer ───────────────────────────────────────────────────────────

const BULL_COLOR    = 'rgba(38,198,118,0.9)';
const BEAR_COLOR    = 'rgba(239,83,80,0.9)';
const NEUTRAL_COLOR = 'rgba(160,160,180,0.75)';
const LABEL_OFFSET  = 10; // px above/below candle

export function drawCandlePatterns(
  ctx: CanvasRenderingContext2D,
  labels: CandlePatternLabel[],
  bars: Bar[],
  layout: ChartLayout,
  viewport: Viewport,
  priceScale: PriceScale,
): void {
  if (!labels.length) return;

  const { mainTop, mainHeight, canvasWidth, priceAxisWidth, chartLeft, chartWidth } = layout;
  const { priceMin, priceMax, startIndex, endIndex } = viewport;

  const inView = (y: number) => y >= mainTop && y <= mainTop + mainHeight;

  ctx.save();
  ctx.font = "8px 'IBM Plex Mono', monospace";
  ctx.textAlign = 'center';

  for (const lbl of labels) {
    if (lbl.barIndex < startIndex || lbl.barIndex > endIndex) continue;

    const x = indexToX(lbl.barIndex, startIndex, endIndex, chartLeft, chartWidth);
    if (x < chartLeft || x > canvasWidth - priceAxisWidth) continue;

    const anchorY = priceToY(lbl.price, priceMin, priceMax, mainTop, mainHeight, priceScale);
    const y = lbl.above ? anchorY - LABEL_OFFSET : anchorY + LABEL_OFFSET + 8;
    if (!inView(lbl.above ? anchorY : anchorY)) continue;

    const color = lbl.sentiment === 'bull' ? BULL_COLOR
      : lbl.sentiment === 'bear' ? BEAR_COLOR : NEUTRAL_COLOR;

    ctx.fillStyle = color;
    ctx.textBaseline = lbl.above ? 'bottom' : 'top';
    ctx.fillText(lbl.label, x, y);
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}
