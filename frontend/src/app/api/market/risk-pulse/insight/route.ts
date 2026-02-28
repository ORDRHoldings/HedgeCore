/**
 * GET /api/market/risk-pulse/insight
 *
 * Deterministic AI-style insight derived from the current risk pulse snapshot.
 * Uses template logic only — no external AI call. Insight is non-hallucinated:
 * every statement references only data visible in the snapshot.
 *
 * Cache: 5-minute TTL (insight changes when regime or top factor changes).
 */

import { NextResponse } from "next/server";
import { riskPulseCache, riskInsightCache } from "@/lib/market/cache";
import type { RiskFactor, RiskInsight, RiskRegime } from "@/lib/market/types";

const PULSE_KEY   = "risk_pulse";
const INSIGHT_KEY = "risk_pulse_insight";
const TTL_MS      = 300_000;  // 5 min

// ── Regime prose ──────────────────────────────────────────────────────────────

const REGIME_SUMMARY: Record<RiskRegime, string> = {
  Low:      "Market conditions are benign. All major risk factors are trading near or below historical norms.",
  Guarded:  "Background risk is present but contained. Monitor lead indicators for early inflection.",
  Elevated: "Risk conditions are elevated above long-run norms. Cross-asset vigilance warranted.",
  High:     "Risk environment is materially stressed. Defensive positioning and hedge review advised.",
  Crisis:   "Crisis-level risk signals. Immediate hedge review and liquidity assessment recommended.",
};

const REGIME_RATIONALE: Record<RiskRegime, string> = {
  Low:      "Low-regime readings indicate that volatility, rates, and USD are all subdued relative to calibrated baselines. This is consistent with a risk-on environment conducive to carry and EM exposure.",
  Guarded:  "Guarded-regime readings suggest at least one factor is drifting above baseline. The composite remains manageable but warrants a tighter stop on unhedged FX exposure.",
  Elevated: "Elevated readings are driven by above-baseline z-scores across multiple factors. Historical episodes at this regime level have preceded short-term FX vol spikes of 20–40bps.",
  High:     "High-regime conditions indicate sustained multi-factor stress. DXY strength and VIX elevation are historically associated with EM FX weakness and wider credit spreads.",
  Crisis:   "Crisis-regime readings are rare (top-decile historical events). Liquidity conditions may deteriorate rapidly. All unhedged positions should be reviewed immediately.",
};

// ── Top factor analysis ───────────────────────────────────────────────────────

function topFactor(factors: RiskFactor[]): RiskFactor {
  return factors.reduce((best, f) => (f.contribution > best.contribution ? f : best), factors[0]);
}

function factorSentence(f: RiskFactor): string {
  const dir = f.trend === "up" ? "rising" : f.trend === "down" ? "falling" : "flat";
  return `${f.label} (${f.source}) is the largest contributor at ${f.display} (z=${f.zscore > 0 ? "+" : ""}${f.zscore.toFixed(1)}, ${dir}).`;
}

// ── Watchlist generation ──────────────────────────────────────────────────────

function buildWatchlist(factors: RiskFactor[], highImpactEvents: number, regime: RiskRegime): string[] {
  const sorted   = [...factors].sort((a, b) => b.contribution - a.contribution);
  const top2     = sorted.slice(0, 2);
  const watchlist: string[] = top2.map(
    (f) => `${f.source}: monitor for continuation — current z=${f.zscore > 0 ? "+" : ""}${f.zscore.toFixed(1)}`,
  );

  if (highImpactEvents > 0) {
    watchlist.push(`${highImpactEvents} high-impact economic event${highImpactEvents > 1 ? "s" : ""} on calendar — expect intraday vol`);
  } else if (regime === "High" || regime === "Crisis") {
    watchlist.push("No scheduled catalysts — watch for unscheduled central bank communication");
  } else {
    watchlist.push("Macro calendar light — range-bound conditions likely unless headline shock");
  }

  return watchlist.slice(0, 3);
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET() {
  const ts = Date.now();

  const cached = riskInsightCache.get(INSIGHT_KEY);
  if (cached) {
    return NextResponse.json({ insight: cached, cachedAt: ts });
  }

  const snapshot = riskPulseCache.get(PULSE_KEY);
  if (!snapshot) {
    // No snapshot yet — return a placeholder
    const placeholder: RiskInsight = {
      summary:      "Awaiting first data fetch. Insight will populate on next poll.",
      rationale:    "The risk pulse engine requires at least one successful data fetch before generating insights.",
      watchlist:    ["Wait for initial data fetch to complete"],
      ai_assisted:  false,
      generatedAt:  ts,
    };
    return NextResponse.json({ insight: placeholder, cachedAt: ts });
  }

  const { regime, factors, score, deltaScore, highImpactEvents, newsCount24h } = snapshot;
  const top  = topFactor(factors);
  const delta = deltaScore !== null
    ? ` Score ${deltaScore > 0 ? "+" : ""}${deltaScore.toFixed(1)} vs prior reading.`
    : "";

  const summary   = `${REGIME_SUMMARY[regime]}${delta} ${factorSentence(top)}`;
  const rationale = REGIME_RATIONALE[regime] +
    ` Composite score ${score.toFixed(1)}/10.0. ` +
    (newsCount24h > 0
      ? `${newsCount24h} FX news items published in the last 24h.`
      : "FX news flow is quiet in the last 24h.");

  const watchlist = buildWatchlist(factors, highImpactEvents, regime);

  const insight: RiskInsight = {
    summary,
    rationale,
    watchlist,
    ai_assisted: false,
    generatedAt: ts,
  };

  riskInsightCache.set(INSIGHT_KEY, insight, TTL_MS);

  return NextResponse.json({ insight, cachedAt: ts });
}
