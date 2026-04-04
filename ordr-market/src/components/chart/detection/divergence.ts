/**
 * divergence.ts
 *
 * Detects regular and hidden divergences between price and any oscillator.
 *
 * Regular Bullish:  price makes lower low  + oscillator makes higher low
 * Regular Bearish:  price makes higher high + oscillator makes lower high
 * Hidden  Bullish:  price makes higher low  + oscillator makes lower low
 * Hidden  Bearish:  price makes lower high  + oscillator makes higher high
 */

import type { Bar, DivergenceLine } from "../indicators/types";

interface OscPoint { t: number; value: number }
type Pivot = { idx: number; price: number; osc: number };

// ── Internal pivot helpers ────────────────────────────────────────────────────

function buildOscMap(osc: OscPoint[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const pt of osc) m.set(pt.t, pt.value);
  return m;
}

function pivotHighs(
  bars: Bar[],
  oscMap: Map<number, number>,
  lookback: number,
  fromIdx: number,
): Pivot[] {
  const out: Pivot[] = [];
  for (let i = Math.max(lookback, fromIdx); i <= bars.length - lookback - 1; i++) {
    let ok = true;
    for (let j = 1; j <= lookback && ok; j++) {
      if (bars[i].h <= bars[i - j].h || bars[i].h <= bars[i + j].h) ok = false;
    }
    if (!ok) continue;
    const ov = oscMap.get(bars[i].t);
    if (ov === undefined) continue;
    out.push({ idx: i, price: bars[i].h, osc: ov });
  }
  return out;
}

function pivotLows(
  bars: Bar[],
  oscMap: Map<number, number>,
  lookback: number,
  fromIdx: number,
): Pivot[] {
  const out: Pivot[] = [];
  for (let i = Math.max(lookback, fromIdx); i <= bars.length - lookback - 1; i++) {
    let ok = true;
    for (let j = 1; j <= lookback && ok; j++) {
      if (bars[i].l >= bars[i - j].l || bars[i].l >= bars[i + j].l) ok = false;
    }
    if (!ok) continue;
    const ov = oscMap.get(bars[i].t);
    if (ov === undefined) continue;
    out.push({ idx: i, price: bars[i].l, osc: ov });
  }
  return out;
}

// ── Main detector ─────────────────────────────────────────────────────────────

/**
 * Detect regular and hidden divergences between price bars and an oscillator.
 *
 * @param bars       OHLCV bars
 * @param osc        Oscillator value series (same timestamps as bars)
 * @param lookback   Pivot swing lookback (default 5)
 * @param minPctMove Minimum % price move between pivots to count (default 0.5%)
 * @param maxAge     Only consider pivots in the trailing N bars (default 120)
 */
export function detectDivergence(
  bars: Bar[],
  osc: OscPoint[],
  lookback = 5,
  minPctMove = 0.005,
  maxAge = 120,
): DivergenceLine[] {
  if (bars.length < lookback * 2 + 4 || osc.length < 2) return [];

  const fromIdx = Math.max(lookback, bars.length - maxAge);
  const oscMap = buildOscMap(osc);
  const highs = pivotHighs(bars, oscMap, lookback, fromIdx);
  const lows  = pivotLows(bars,  oscMap, lookback, fromIdx);

  const lines: DivergenceLine[] = [];

  // ── Pairs of consecutive swing highs ─────────────────────────────────────
  for (let i = 0; i < highs.length - 1; i++) {
    const a = highs[i], b = highs[i + 1];
    const pct = Math.abs(b.price - a.price) / (a.price || 1);
    if (pct < minPctMove) continue;

    // Regular Bearish: price HH, oscillator LH
    if (b.price > a.price && b.osc < a.osc) {
      lines.push({
        idx1: a.idx, idx2: b.idx,
        price1: a.price, price2: b.price,
        osc1: a.osc, osc2: b.osc,
        kind: "regular", direction: "bearish",
        pctMove: pct,
      });
    }
    // Hidden Bearish: price LH, oscillator HH
    else if (b.price < a.price && b.osc > a.osc) {
      lines.push({
        idx1: a.idx, idx2: b.idx,
        price1: a.price, price2: b.price,
        osc1: a.osc, osc2: b.osc,
        kind: "hidden", direction: "bearish",
        pctMove: pct,
      });
    }
  }

  // ── Pairs of consecutive swing lows ──────────────────────────────────────
  for (let i = 0; i < lows.length - 1; i++) {
    const a = lows[i], b = lows[i + 1];
    const pct = Math.abs(b.price - a.price) / (a.price || 1);
    if (pct < minPctMove) continue;

    // Regular Bullish: price LL, oscillator HL
    if (b.price < a.price && b.osc > a.osc) {
      lines.push({
        idx1: a.idx, idx2: b.idx,
        price1: a.price, price2: b.price,
        osc1: a.osc, osc2: b.osc,
        kind: "regular", direction: "bullish",
        pctMove: pct,
      });
    }
    // Hidden Bullish: price HL, oscillator LL
    else if (b.price > a.price && b.osc < a.osc) {
      lines.push({
        idx1: a.idx, idx2: b.idx,
        price1: a.price, price2: b.price,
        osc1: a.osc, osc2: b.osc,
        kind: "hidden", direction: "bullish",
        pctMove: pct,
      });
    }
  }

  // ── Post-process: sort by recency, deduplicate, limit ─────────────────────
  lines.sort((a, b) => b.idx2 - a.idx2);

  const deduped: DivergenceLine[] = [];
  for (const ln of lines) {
    // Skip if same pivot pair already covered
    const dup = deduped.some(
      q => q.idx1 === ln.idx1 && q.idx2 === ln.idx2 && q.direction === ln.direction,
    );
    if (!dup) deduped.push(ln);
    if (deduped.length >= 8) break;
  }

  return deduped;
}
