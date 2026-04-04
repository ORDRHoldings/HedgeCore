/**
 * market-structure.ts
 *
 * Detects:
 * - Swing highs / lows with lookback confirmation
 * - HH / LH / HL / LL classification
 * - BOS (Break of Structure): close beyond last confirmed swing
 * - CHoCH (Change of Character): first break against prevailing structure
 */

import type { Bar } from "../indicators/types";
import type { MarketStructureData, SwingPoint, StructureEvent } from "../indicators/types";

export function detectMarketStructure(
  bars: Bar[],
  lookback = 5,
): MarketStructureData {
  if (bars.length < lookback * 2 + 2) return { swings: [], events: [] };

  // ── Step 1: Raw swing highs and lows ────────────────────────────────────
  const rawHighs: { idx: number; price: number; t: number }[] = [];
  const rawLows:  { idx: number; price: number; t: number }[] = [];

  for (let i = lookback; i < bars.length - lookback; i++) {
    let isHigh = true, isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (bars[i].h <= bars[i - j].h || bars[i].h <= bars[i + j].h) isHigh = false;
      if (bars[i].l >= bars[i - j].l || bars[i].l >= bars[i + j].l) isLow = false;
    }
    if (isHigh) rawHighs.push({ idx: i, price: bars[i].h, t: bars[i].t });
    if (isLow)  rawLows.push({ idx: i, price: bars[i].l, t: bars[i].t });
  }

  // ── Step 2: Classify HH/LH and HL/LL ────────────────────────────────────
  const swings: SwingPoint[] = [];

  let prevHigh = rawHighs.length > 0 ? rawHighs[0].price : Infinity;
  for (let i = 0; i < rawHighs.length; i++) {
    const h = rawHighs[i];
    const label: "HH" | "LH" = i === 0 ? "HH" : (h.price > prevHigh ? "HH" : "LH");
    swings.push({ idx: h.idx, t: h.t, price: h.price, type: "high", label });
    prevHigh = h.price;
  }

  let prevLow = rawLows.length > 0 ? rawLows[0].price : -Infinity;
  for (let i = 0; i < rawLows.length; i++) {
    const l = rawLows[i];
    const label: "HL" | "LL" = i === 0 ? "HL" : (l.price > prevLow ? "HL" : "LL");
    swings.push({ idx: l.idx, t: l.t, price: l.price, type: "low", label });
    prevLow = l.price;
  }

  // Sort by bar index for event detection
  swings.sort((a, b) => a.idx - b.idx);

  // ── Step 3: BOS / CHoCH detection ───────────────────────────────────────
  const events: StructureEvent[] = [];

  // Track the last confirmed swing high and low before current bar
  const highs = swings.filter(s => s.type === "high");
  const lows  = swings.filter(s => s.type === "low");

  // Determine prevailing structure: bullish = last HL, bearish = last LH
  // Scan forward from lookback end bar
  let lastHighIdx = 0;
  let lastLowIdx  = 0;
  let prevStructure: "bullish" | "bearish" | "neutral" = "neutral";
  const bosBreakSet = new Set<number>(); // prevent duplicate events per bar

  for (let i = lookback; i < bars.length; i++) {
    const bar = bars[i];

    // Find the most recent confirmed swing high before bar i
    while (lastHighIdx < highs.length - 1 && highs[lastHighIdx + 1].idx < i) lastHighIdx++;
    while (lastLowIdx  < lows.length  - 1 && lows[lastLowIdx + 1].idx < i)  lastLowIdx++;

    const latestHigh = highs[lastHighIdx];
    const latestLow  = lows[lastLowIdx];
    if (!latestHigh || !latestLow) continue;

    // Bullish BOS: close above last swing high
    if (bar.c > latestHigh.price && latestHigh.idx < i && !bosBreakSet.has(latestHigh.idx)) {
      const kind: "BOS" | "CHoCH" = prevStructure === "bearish" ? "CHoCH" : "BOS";
      events.push({ idx: i, t: bar.t, price: latestHigh.price, kind, direction: "bullish" });
      bosBreakSet.add(latestHigh.idx);
      prevStructure = "bullish";
    }
    // Bearish BOS: close below last swing low
    if (bar.c < latestLow.price && latestLow.idx < i && !bosBreakSet.has(latestLow.idx)) {
      const kind: "BOS" | "CHoCH" = prevStructure === "bullish" ? "CHoCH" : "BOS";
      events.push({ idx: i, t: bar.t, price: latestLow.price, kind, direction: "bearish" });
      bosBreakSet.add(latestLow.idx);
      prevStructure = "bearish";
    }
  }

  return { swings, events };
}
