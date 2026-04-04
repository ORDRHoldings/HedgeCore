/**
 * patterns.ts
 *
 * Chart pattern detection engine — TradingView-parity quality.
 *
 * Detects: Double Top/Bottom, Head & Shoulders (+ Inverse),
 *          Bull/Bear Flag, Ascending/Descending/Symmetric Triangle,
 *          Rising/Falling Wedge.
 *
 * All patterns carry a confidence score (0–1), target, stop,
 * and a `confirmed` flag when price has broken the key level.
 */

import type { Bar, ChartPattern, ChartPatternData } from "../indicators/types";

// ── Internal helpers ──────────────────────────────────────────────────────────

function pctDiff(a: number, b: number): number {
  return Math.abs(a - b) / ((a + b) / 2 || 1);
}

function linSlope(x1: number, y1: number, x2: number, y2: number): number {
  return (y2 - y1) / (x2 - x1 || 1);
}

/** Pivot swing highs within idx range [lo, hi] */
function swingHighs(
  bars: Bar[],
  lookback: number,
  idxLo: number,
  idxHi: number,
): { idx: number; price: number }[] {
  const out: { idx: number; price: number }[] = [];
  for (let i = Math.max(lookback, idxLo); i <= Math.min(bars.length - lookback - 1, idxHi); i++) {
    let ok = true;
    for (let j = 1; j <= lookback && ok; j++) {
      if (bars[i].h <= bars[i - j].h || bars[i].h <= bars[i + j].h) ok = false;
    }
    if (ok) out.push({ idx: i, price: bars[i].h });
  }
  return out;
}

/** Pivot swing lows within idx range [lo, hi] */
function swingLows(
  bars: Bar[],
  lookback: number,
  idxLo: number,
  idxHi: number,
): { idx: number; price: number }[] {
  const out: { idx: number; price: number }[] = [];
  for (let i = Math.max(lookback, idxLo); i <= Math.min(bars.length - lookback - 1, idxHi); i++) {
    let ok = true;
    for (let j = 1; j <= lookback && ok; j++) {
      if (bars[i].l >= bars[i - j].l || bars[i].l >= bars[i + j].l) ok = false;
    }
    if (ok) out.push({ idx: i, price: bars[i].l });
  }
  return out;
}

function rangeMin(bars: Bar[], from: number, to: number): { price: number; idx: number } {
  let price = Infinity, idx = from;
  for (let k = from; k <= to; k++) {
    if (bars[k].l < price) { price = bars[k].l; idx = k; }
  }
  return { price, idx };
}

function rangeMax(bars: Bar[], from: number, to: number): { price: number; idx: number } {
  let price = -Infinity, idx = from;
  for (let k = from; k <= to; k++) {
    if (bars[k].h > price) { price = bars[k].h; idx = k; }
  }
  return { price, idx };
}

// ── Main detector ─────────────────────────────────────────────────────────────

export function detectPatterns(bars: Bar[], lookback = 5): ChartPatternData {
  if (bars.length < lookback * 2 + 10) return { patterns: [] };

  const n = bars.length;
  const lastClose = bars[n - 1].c;
  const patterns: ChartPattern[] = [];

  // Scan window: only the trailing 70% of bars for reversal patterns
  const scanFrom = Math.floor(n * 0.30);
  const highs = swingHighs(bars, lookback, scanFrom, n - lookback - 1);
  const lows  = swingLows(bars,  lookback, scanFrom, n - lookback - 1);

  // ── Double Top ─────────────────────────────────────────────────────────────
  for (let i = 0; i < highs.length - 1; i++) {
    const h1 = highs[i];
    const h2 = highs[i + 1];

    if (pctDiff(h1.price, h2.price) > 0.03) continue;  // peaks within 3%
    if (h2.idx - h1.idx < 4)  continue;                 // gap ≥ 4 bars
    if (h2.idx - h1.idx > 80) continue;                 // not too far apart

    const valley = rangeMin(bars, h1.idx + 1, h2.idx - 1);
    const peakAvg = (h1.price + h2.price) / 2;

    if ((peakAvg - valley.price) / peakAvg < 0.03) continue; // valley ≥ 3% below

    const equalness = 1 - pctDiff(h1.price, h2.price) / 0.03;
    const depth = Math.min(1, (peakAvg - valley.price) / peakAvg / 0.08);
    const confidence = Math.min(1, Math.round((0.45 + equalness * 0.3 + depth * 0.25) * 100) / 100);

    patterns.push({
      type: "doubleTop",
      direction: "bearish",
      confidence,
      startIdx: h1.idx,
      endIdx: h2.idx,
      keyPoints: [
        { idx: h1.idx,     price: h1.price,    label: "L" },
        { idx: valley.idx, price: valley.price, label: "V" },
        { idx: h2.idx,     price: h2.price,    label: "R" },
      ],
      neckline: valley.price,
      target:   valley.price - (peakAvg - valley.price),
      stop:     peakAvg * 1.01,
      confirmed: lastClose < valley.price,
    });
  }

  // ── Double Bottom ──────────────────────────────────────────────────────────
  for (let i = 0; i < lows.length - 1; i++) {
    const l1 = lows[i];
    const l2 = lows[i + 1];

    if (pctDiff(l1.price, l2.price) > 0.03) continue;
    if (l2.idx - l1.idx < 4)  continue;
    if (l2.idx - l1.idx > 80) continue;

    const peak = rangeMax(bars, l1.idx + 1, l2.idx - 1);
    const troughAvg = (l1.price + l2.price) / 2;

    if ((peak.price - troughAvg) / troughAvg < 0.03) continue;

    const equalness = 1 - pctDiff(l1.price, l2.price) / 0.03;
    const depth = Math.min(1, (peak.price - troughAvg) / troughAvg / 0.08);
    const confidence = Math.min(1, Math.round((0.45 + equalness * 0.3 + depth * 0.25) * 100) / 100);

    patterns.push({
      type: "doubleBottom",
      direction: "bullish",
      confidence,
      startIdx: l1.idx,
      endIdx: l2.idx,
      keyPoints: [
        { idx: l1.idx,  price: l1.price,   label: "L" },
        { idx: peak.idx, price: peak.price, label: "V" },
        { idx: l2.idx,  price: l2.price,   label: "R" },
      ],
      neckline: peak.price,
      target:   peak.price + (peak.price - troughAvg),
      stop:     troughAvg * 0.99,
      confirmed: lastClose > peak.price,
    });
  }

  // ── Head & Shoulders (bearish) ─────────────────────────────────────────────
  for (let i = 0; i < highs.length - 2; i++) {
    const ls = highs[i];
    const hd = highs[i + 1];
    const rs = highs[i + 2];

    if (hd.price <= ls.price || hd.price <= rs.price) continue;  // head is tallest
    if (pctDiff(ls.price, rs.price) > 0.06) continue;            // shoulders similar
    const shoulderAvg = (ls.price + rs.price) / 2;
    if ((hd.price - shoulderAvg) / shoulderAvg < 0.02) continue; // head clears shoulders
    if (hd.idx - ls.idx < 3 || rs.idx - hd.idx < 3) continue;
    if (rs.idx - ls.idx > 120) continue;

    const t1 = rangeMin(bars, ls.idx + 1, hd.idx - 1);  // left trough (neckline L)
    const t2 = rangeMin(bars, hd.idx + 1, rs.idx - 1);  // right trough (neckline R)

    const neckline = (t1.price + t2.price) / 2;
    const headHeight = hd.price - neckline;

    const symmetry   = 1 - pctDiff(ls.price, rs.price) / 0.06;
    const prominence = Math.min(1, (hd.price - shoulderAvg) / shoulderAvg / 0.05);
    const confidence = Math.min(1, Math.round((0.40 + symmetry * 0.35 + prominence * 0.25) * 100) / 100);

    patterns.push({
      type: "headAndShoulders",
      direction: "bearish",
      confidence,
      startIdx: ls.idx,
      endIdx: rs.idx,
      keyPoints: [
        { idx: ls.idx,  price: ls.price,  label: "LS" },
        { idx: t1.idx,  price: t1.price,  label: "N"  },
        { idx: hd.idx,  price: hd.price,  label: "H"  },
        { idx: t2.idx,  price: t2.price,  label: "N"  },
        { idx: rs.idx,  price: rs.price,  label: "RS" },
      ],
      neckline,
      target:   neckline - headHeight,
      stop:     hd.price * 1.01,
      confirmed: lastClose < neckline,
    });
  }

  // ── Inverse Head & Shoulders (bullish) ────────────────────────────────────
  for (let i = 0; i < lows.length - 2; i++) {
    const ls = lows[i];
    const hd = lows[i + 1];  // head (deepest)
    const rs = lows[i + 2];

    if (hd.price >= ls.price || hd.price >= rs.price) continue;
    if (pctDiff(ls.price, rs.price) > 0.06) continue;
    const shoulderAvg = (ls.price + rs.price) / 2;
    if ((shoulderAvg - hd.price) / shoulderAvg < 0.02) continue;
    if (hd.idx - ls.idx < 3 || rs.idx - hd.idx < 3) continue;
    if (rs.idx - ls.idx > 120) continue;

    const p1 = rangeMax(bars, ls.idx + 1, hd.idx - 1);
    const p2 = rangeMax(bars, hd.idx + 1, rs.idx - 1);

    const neckline = (p1.price + p2.price) / 2;
    const headDepth = neckline - hd.price;

    const symmetry   = 1 - pctDiff(ls.price, rs.price) / 0.06;
    const prominence = Math.min(1, (shoulderAvg - hd.price) / shoulderAvg / 0.05);
    const confidence = Math.min(1, Math.round((0.40 + symmetry * 0.35 + prominence * 0.25) * 100) / 100);

    patterns.push({
      type: "inverseHeadAndShoulders",
      direction: "bullish",
      confidence,
      startIdx: ls.idx,
      endIdx: rs.idx,
      keyPoints: [
        { idx: ls.idx, price: ls.price, label: "LS" },
        { idx: p1.idx, price: p1.price, label: "N"  },
        { idx: hd.idx, price: hd.price, label: "H"  },
        { idx: p2.idx, price: p2.price, label: "N"  },
        { idx: rs.idx, price: rs.price, label: "RS" },
      ],
      neckline,
      target:   neckline + headDepth,
      stop:     hd.price * 0.99,
      confirmed: lastClose > neckline,
    });
  }

  // ── Triangle & Wedge patterns (window-based) ───────────────────────────────
  const winSize  = Math.min(60, Math.floor(n * 0.40));
  const winStart = n - winSize;
  const wHighs = swingHighs(bars, lookback, winStart, n - lookback - 1);
  const wLows  = swingLows(bars,  lookback, winStart, n - lookback - 1);

  if (wHighs.length >= 2 && wLows.length >= 2) {
    const hFirst = wHighs[0], hLast = wHighs[wHighs.length - 1];
    const lFirst = wLows[0],  lLast = wLows[wLows.length - 1];

    const midPrice = (hFirst.price + lFirst.price) / 2 || 1;
    const hSlope = linSlope(hFirst.idx, hFirst.price, hLast.idx, hLast.price) / midPrice;
    const lSlope = linSlope(lFirst.idx, lFirst.price, lLast.idx, lLast.price) / midPrice;

    const FLAT = 0.00015; // ~0.015% per bar — essentially horizontal

    const touchBonus = (nh: number, nl: number) =>
      Math.min(1, 0.5 + Math.min(nh, 5) * 0.06 + Math.min(nl, 5) * 0.06);

    // Ascending Triangle: flat top + rising lows
    if (Math.abs(hSlope) < FLAT && lSlope > FLAT) {
      const resistance = (hFirst.price + hLast.price) / 2;
      const height = resistance - lFirst.price;
      patterns.push({
        type: "ascendingTriangle",
        direction: "bullish",
        confidence: Math.round(touchBonus(wHighs.length, wLows.length) * 100) / 100,
        startIdx: winStart,
        endIdx: n - 1,
        keyPoints: [
          { idx: hFirst.idx, price: hFirst.price, label: "R" },
          { idx: lFirst.idx, price: lFirst.price, label: "S" },
          { idx: hLast.idx,  price: hLast.price,  label: "R" },
          { idx: lLast.idx,  price: lLast.price,  label: "S" },
        ],
        neckline: resistance,
        target:   resistance + height,
        stop:     lLast.price * 0.99,
        confirmed: lastClose > resistance,
      });
    }

    // Descending Triangle: declining highs + flat bottom
    else if (hSlope < -FLAT && Math.abs(lSlope) < FLAT) {
      const support = (lFirst.price + lLast.price) / 2;
      const height  = hFirst.price - support;
      patterns.push({
        type: "descendingTriangle",
        direction: "bearish",
        confidence: Math.round(touchBonus(wHighs.length, wLows.length) * 100) / 100,
        startIdx: winStart,
        endIdx: n - 1,
        keyPoints: [
          { idx: hFirst.idx, price: hFirst.price, label: "R" },
          { idx: lFirst.idx, price: lFirst.price, label: "S" },
          { idx: hLast.idx,  price: hLast.price,  label: "R" },
          { idx: lLast.idx,  price: lLast.price,  label: "S" },
        ],
        neckline: support,
        target:   support - height,
        stop:     hLast.price * 1.01,
        confirmed: lastClose < support,
      });
    }

    // Symmetric Triangle: declining highs + rising lows (converging)
    else if (hSlope < -FLAT && lSlope > FLAT) {
      const apexPrice = (hLast.price + lLast.price) / 2;
      const height = hFirst.price - lFirst.price;
      const conf = Math.round(touchBonus(wHighs.length, wLows.length) * 0.9 * 100) / 100;
      patterns.push({
        type: "symmetricTriangle",
        direction: lastClose >= apexPrice ? "bullish" : "bearish",
        confidence: conf,
        startIdx: winStart,
        endIdx: n - 1,
        keyPoints: [
          { idx: hFirst.idx, price: hFirst.price, label: "H" },
          { idx: lFirst.idx, price: lFirst.price, label: "L" },
          { idx: hLast.idx,  price: hLast.price,  label: "H" },
          { idx: lLast.idx,  price: lLast.price,  label: "L" },
        ],
        target: lastClose >= apexPrice ? apexPrice + height * 0.75 : apexPrice - height * 0.75,
        confirmed: false,
      });
    }

    // Rising Wedge (bearish): both up, lows rising faster → convergence
    else if (hSlope > FLAT && lSlope > FLAT && lSlope > hSlope) {
      const conf = Math.round(Math.min(1, 0.45 + (wHighs.length + wLows.length) * 0.05) * 100) / 100;
      patterns.push({
        type: "risingWedge",
        direction: "bearish",
        confidence: conf,
        startIdx: winStart,
        endIdx: n - 1,
        keyPoints: [
          { idx: hFirst.idx, price: hFirst.price, label: "H" },
          { idx: lFirst.idx, price: lFirst.price, label: "L" },
          { idx: hLast.idx,  price: hLast.price,  label: "H" },
          { idx: lLast.idx,  price: lLast.price,  label: "L" },
        ],
        target:    lFirst.price,
        confirmed: lastClose < lFirst.price,
      });
    }

    // Falling Wedge (bullish): both down, highs falling faster → convergence
    else if (hSlope < -FLAT && lSlope < -FLAT && hSlope < lSlope) {
      const conf = Math.round(Math.min(1, 0.45 + (wHighs.length + wLows.length) * 0.05) * 100) / 100;
      patterns.push({
        type: "fallingWedge",
        direction: "bullish",
        confidence: conf,
        startIdx: winStart,
        endIdx: n - 1,
        keyPoints: [
          { idx: hFirst.idx, price: hFirst.price, label: "H" },
          { idx: lFirst.idx, price: lFirst.price, label: "L" },
          { idx: hLast.idx,  price: hLast.price,  label: "H" },
          { idx: lLast.idx,  price: lLast.price,  label: "L" },
        ],
        target:    hFirst.price,
        confirmed: lastClose > hFirst.price,
      });
    }
  }

  // ── Bull Flag ──────────────────────────────────────────────────────────────
  {
    const POLE_MIN = 0.04;     // min pole height (4%)
    const POLE_MIN_BARS = 4;
    const POLE_MAX_BARS = 25;
    const FLAG_MAX_BARS = 20;
    let found = false;

    // Scan backwards to find the most recent qualifying flag
    for (
      let pStart = Math.max(lookback, n - POLE_MAX_BARS - FLAG_MAX_BARS - 5);
      pStart >= lookback && !found;
      pStart--
    ) {
      // Find pole top
      let pTopPrice = -Infinity, pTopIdx = pStart;
      for (let k = pStart; k < Math.min(pStart + POLE_MAX_BARS, n); k++) {
        if (bars[k].h > pTopPrice) { pTopPrice = bars[k].h; pTopIdx = k; }
      }

      if (pTopIdx - pStart < POLE_MIN_BARS) continue;

      let pBase = Infinity;
      for (let k = pStart; k <= pTopIdx; k++) {
        if (bars[k].l < pBase) pBase = bars[k].l;
      }

      const poleH = pTopPrice - pBase;
      if (poleH / pBase < POLE_MIN) continue;

      const fEnd = Math.min(pTopIdx + FLAG_MAX_BARS, n - 1);
      if (fEnd <= pTopIdx + 2) continue;

      let fHigh = -Infinity, fLow = Infinity;
      for (let k = pTopIdx; k <= fEnd; k++) {
        if (bars[k].h > fHigh) fHigh = bars[k].h;
        if (bars[k].l < fLow)  fLow  = bars[k].l;
      }

      const retracement = (pTopPrice - fLow) / poleH;
      if (retracement < 0.10 || retracement > 0.55) continue;
      if ((fHigh - fLow) / poleH > 0.60) continue;

      const conf = Math.min(1, Math.round((
        0.50
        + (pTopIdx - pStart) / POLE_MAX_BARS * 0.20
        + (0.55 - retracement) / 0.55 * 0.15
      ) * 100) / 100);
      if (conf < 0.45) continue;

      patterns.push({
        type: "bullFlag",
        direction: "bullish",
        confidence: conf,
        startIdx: pStart,
        endIdx: fEnd,
        keyPoints: [
          { idx: pStart,   price: pBase,         label: "B" },
          { idx: pTopIdx,  price: pTopPrice,      label: "T" },
          { idx: fEnd,     price: bars[fEnd].c,   label: "F" },
        ],
        target:    pTopPrice + poleH,
        stop:      fLow * 0.99,
        confirmed: lastClose > pTopPrice,
      });
      found = true;
    }
  }

  // ── Bear Flag ──────────────────────────────────────────────────────────────
  {
    const POLE_MIN = 0.04;
    const POLE_MIN_BARS = 4;
    const POLE_MAX_BARS = 25;
    const FLAG_MAX_BARS = 20;
    let found = false;

    for (
      let pStart = Math.max(lookback, n - POLE_MAX_BARS - FLAG_MAX_BARS - 5);
      pStart >= lookback && !found;
      pStart--
    ) {
      let pBotPrice = Infinity, pBotIdx = pStart;
      for (let k = pStart; k < Math.min(pStart + POLE_MAX_BARS, n); k++) {
        if (bars[k].l < pBotPrice) { pBotPrice = bars[k].l; pBotIdx = k; }
      }

      if (pBotIdx - pStart < POLE_MIN_BARS) continue;

      let pTop = -Infinity;
      for (let k = pStart; k <= pBotIdx; k++) {
        if (bars[k].h > pTop) pTop = bars[k].h;
      }

      const poleH = pTop - pBotPrice;
      if (poleH / pTop < POLE_MIN) continue;

      const fEnd = Math.min(pBotIdx + FLAG_MAX_BARS, n - 1);
      if (fEnd <= pBotIdx + 2) continue;

      let fHigh = -Infinity, fLow = Infinity;
      for (let k = pBotIdx; k <= fEnd; k++) {
        if (bars[k].h > fHigh) fHigh = bars[k].h;
        if (bars[k].l < fLow)  fLow  = bars[k].l;
      }

      const retracement = (fHigh - pBotPrice) / poleH;
      if (retracement < 0.10 || retracement > 0.55) continue;
      if ((fHigh - fLow) / poleH > 0.60) continue;

      const conf = Math.min(1, Math.round((
        0.50
        + (pBotIdx - pStart) / POLE_MAX_BARS * 0.20
        + (0.55 - retracement) / 0.55 * 0.15
      ) * 100) / 100);
      if (conf < 0.45) continue;

      patterns.push({
        type: "bearFlag",
        direction: "bearish",
        confidence: conf,
        startIdx: pStart,
        endIdx: fEnd,
        keyPoints: [
          { idx: pStart,   price: pTop,          label: "T" },
          { idx: pBotIdx,  price: pBotPrice,      label: "B" },
          { idx: fEnd,     price: bars[fEnd].c,   label: "F" },
        ],
        target:    pBotPrice - poleH,
        stop:      fHigh * 1.01,
        confirmed: lastClose < pBotPrice,
      });
      found = true;
    }
  }

  // ── Post-processing ────────────────────────────────────────────────────────
  // Filter low-confidence, sort by recency + confidence, deduplicate same-type overlaps
  const filtered = patterns
    .filter(p => p.confidence >= 0.50)
    .sort((a, b) => (b.endIdx - a.endIdx) || (b.confidence - a.confidence));

  const result: ChartPattern[] = [];
  for (const p of filtered) {
    const dup = result.some(q =>
      q.type === p.type &&
      Math.max(q.startIdx, p.startIdx) < Math.min(q.endIdx, p.endIdx),
    );
    if (!dup) result.push(p);
  }

  return { patterns: result };
}
