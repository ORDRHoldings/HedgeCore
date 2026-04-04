/**
 * eqhl.ts — Equal Highs / Equal Lows (EQH / EQL)
 *
 * Detects clusters of swing highs/lows that are within a tight tolerance
 * band, marking them as Equal Highs (EQH) or Equal Lows (EQL).
 *
 * These represent resting liquidity: stop-loss clusters above EQH and below
 * EQL that institutional traders frequently target ("liquidity sweep").
 *
 * Rendering:
 *   - Intact EQH : dashed red horizontal line   + "EQH" label
 *   - Intact EQL : dashed teal horizontal line  + "EQL" label
 *   - Swept level: dimmed grey line             + "EQH✓" / "EQL✓" label
 */

import type { Bar } from "../indicators/types";
import type { ChartLayout, Viewport, PriceScale } from "../core/data";
import { priceToY } from "../core/data";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EQHLLevel {
  type:     "EQH" | "EQL";
  price:    number;          // average price of the cluster
  firstIdx: number;          // first bar index in cluster
  lastIdx:  number;          // last bar index in cluster
  swept:    boolean;         // price has closed beyond this level since formation
}

// ── Detection ─────────────────────────────────────────────────────────────────

/** Bars where bar[i].h is strictly greater than all bars within ±lookback. */
function findSwingHighs(bars: Bar[], lookback: number): { idx: number; price: number }[] {
  const out: { idx: number; price: number }[] = [];
  const n = bars.length;
  for (let i = lookback; i < n - lookback; i++) {
    const h = bars[i].h;
    let ok = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && bars[j].h >= h) { ok = false; break; }
    }
    if (ok) out.push({ idx: i, price: h });
  }
  return out;
}

/** Bars where bar[i].l is strictly less than all bars within ±lookback. */
function findSwingLows(bars: Bar[], lookback: number): { idx: number; price: number }[] {
  const out: { idx: number; price: number }[] = [];
  const n = bars.length;
  for (let i = lookback; i < n - lookback; i++) {
    const l = bars[i].l;
    let ok = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && bars[j].l <= l) { ok = false; break; }
    }
    if (ok) out.push({ idx: i, price: l });
  }
  return out;
}

/**
 * Greedy cluster grouping: assign each point to the first existing group
 * whose current mean is within `tolerancePct`% of the point's price.
 */
function clusterByPrice(
  points: { idx: number; price: number }[],
  tolerancePct: number,
): { mean: number; indices: number[] }[] {
  const groups: { sum: number; count: number; mean: number; indices: number[] }[] = [];

  for (const pt of points) {
    const match = groups.find(
      g => Math.abs(pt.price - g.mean) / g.mean <= tolerancePct / 100,
    );
    if (match) {
      match.sum   += pt.price;
      match.count += 1;
      match.mean   = match.sum / match.count;
      match.indices.push(pt.idx);
    } else {
      groups.push({ sum: pt.price, count: 1, mean: pt.price, indices: [pt.idx] });
    }
  }

  return groups.filter(g => g.indices.length >= 2).map(g => ({ mean: g.mean, indices: g.indices }));
}

/**
 * Detect Equal Highs and Equal Lows in `bars`.
 *
 * @param lookback    Swing detection lookback (default 3 bars each side)
 * @param tolerancePct  Price cluster tolerance in % (default 0.08 %)
 */
export function detectEQHL(
  bars: Bar[],
  lookback = 3,
  tolerancePct = 0.08,
): EQHLLevel[] {
  if (bars.length < lookback * 2 + 2) return [];

  const levels: EQHLLevel[] = [];

  // Equal Highs
  const highs  = findSwingHighs(bars, lookback);
  const hGroups = clusterByPrice(highs, tolerancePct);
  for (const g of hGroups) {
    const sorted   = [...g.indices].sort((a, b) => a - b);
    const lastIdx  = sorted[sorted.length - 1];
    const swept    = bars.slice(lastIdx + 1).some(b => b.c > g.mean);
    levels.push({ type: "EQH", price: g.mean, firstIdx: sorted[0], lastIdx, swept });
  }

  // Equal Lows
  const lows   = findSwingLows(bars, lookback);
  const lGroups = clusterByPrice(lows, tolerancePct);
  for (const g of lGroups) {
    const sorted   = [...g.indices].sort((a, b) => a - b);
    const lastIdx  = sorted[sorted.length - 1];
    const swept    = bars.slice(lastIdx + 1).some(b => b.c < g.mean);
    levels.push({ type: "EQL", price: g.mean, firstIdx: sorted[0], lastIdx, swept });
  }

  return levels;
}

// ── Renderer ──────────────────────────────────────────────────────────────────

/**
 * Draw Equal Highs / Equal Lows as dashed horizontal lines.
 *
 * Color scheme:
 *   EQH (intact)  → red       (sell-stops above, bearish liquidity target)
 *   EQL (intact)  → teal      (buy-stops below,  bullish liquidity target)
 *   Swept         → grey-dim  (liquidity already taken)
 */
export function drawEQHL(
  ctx: CanvasRenderingContext2D,
  levels: EQHLLevel[],
  layout: ChartLayout,
  viewport: Viewport,
  scale: PriceScale,
): void {
  if (levels.length === 0) return;

  const { priceMin, priceMax } = viewport;
  const { chartLeft, chartWidth, mainTop, mainHeight, canvasWidth, priceAxisWidth } = layout;
  const lineEndX = canvasWidth - priceAxisWidth - 2;

  ctx.save();
  ctx.font         = 'bold 8px "IBM Plex Mono", monospace';
  ctx.textBaseline = "middle";
  ctx.textAlign    = "right";

  for (const level of levels) {
    // Skip if price out of view
    if (level.price < priceMin || level.price > priceMax) continue;

    const y = priceToY(level.price, priceMin, priceMax, mainTop, mainHeight, scale);
    const isHigh = level.type === "EQH";

    const color = level.swept
      ? "rgba(120,123,134,0.40)"
      : isHigh
        ? "rgba(239,83,80,0.80)"
        : "rgba(38,166,154,0.80)";

    ctx.strokeStyle = color;
    ctx.fillStyle   = color;
    ctx.lineWidth   = 1;
    ctx.setLineDash([3, 5]);

    ctx.beginPath();
    ctx.moveTo(chartLeft, y);
    ctx.lineTo(lineEndX, y);
    ctx.stroke();
    ctx.setLineDash([]);

    const label = level.swept ? `${level.type}✓` : level.type;
    ctx.fillText(label, lineEndX, y - 1);
  }

  ctx.textAlign    = "left";
  ctx.textBaseline = "top";
  ctx.restore();
}
