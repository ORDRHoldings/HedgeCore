import type { Bar, IndicatorPoint } from "./types";
import { computeRSI } from "./rsi";

export function computeConnorsRSI(bars: Bar[], rsiPeriod = 3, streakPeriod = 2, pctRankPeriod = 100): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  const rsiVals = computeRSI(bars, rsiPeriod);
  const rsiMap = new Map(rsiVals.map(p => [p.t, p.value]));
  // streakPeriod param kept for API compatibility but streak logic is self-contained
  void streakPeriod;
  for (let i = pctRankPeriod + rsiPeriod; i < bars.length; i++) {
    const rsi3 = rsiMap.get(bars[i].t) ?? 50;
    // Streak: count of consecutive up/down bars
    let streak = 0;
    for (let j = i; j > 0 && Math.abs(streak) < 100; j--) {
      if (bars[j].c > bars[j - 1].c) { if (streak >= 0) streak++; else break; }
      else if (bars[j].c < bars[j - 1].c) { if (streak <= 0) streak--; else break; }
      else break;
    }
    // Streak RSI: RSI of streak values
    const streakRSI = Math.max(0, Math.min(100, 50 + streak * 10));
    // Percentile rank of today's 3-bar ROC among past pctRankPeriod 3-bar ROCs
    const roc3 = bars[i].c > bars[i - 3].c
      ? (bars[i].c - bars[i - 3].c) / bars[i - 3].c * 100
      : -(bars[i - 3].c - bars[i].c) / bars[i - 3].c * 100;
    let below = 0;
    for (let j = i - pctRankPeriod; j < i; j++) {
      if (j > 2) {
        const r = (bars[j].c - bars[j - 3].c) / (bars[j - 3].c || 1) * 100;
        if (r <= roc3) below++;
      }
    }
    const pctRank = below / pctRankPeriod * 100;
    result.push({ t: bars[i].t, value: (rsi3 + streakRSI + pctRank) / 3 });
  }
  return result;
}
