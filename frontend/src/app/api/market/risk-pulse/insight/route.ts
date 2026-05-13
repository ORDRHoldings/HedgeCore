/**
 * GET /api/market/risk-pulse/insight
 *
 * If ANTHROPIC_API_KEY is configured: calls Claude Haiku with the current
 * risk snapshot + geo intelligence to generate a contextual market insight.
 *
 * Fallback: deterministic template derived from snapshot data only.
 *
 * Cache: 5-minute TTL.
 */

import { NextRequest, NextResponse } from "next/server";
import { riskPulseCache, geoIntelCache, riskInsightCache } from "@/lib/market/cache";
import type { RiskFactor, RiskInsight, RiskRegime, GeoIntelligence } from "@/lib/market/types";
import { requireVerifiedBearer } from "@/lib/server/auth";

const PULSE_KEY   = "risk_pulse";
const INSIGHT_KEY = "risk_pulse_insight";
const TTL_MS      = 300_000;  // 5 min

const ANT_KEY = process.env.ANTHROPIC_API_KEY ?? "";

// ── Template fallback ─────────────────────────────────────────────────────────

const REGIME_SUMMARY: Record<RiskRegime, string> = {
  Low:      "Market conditions are benign. All major risk factors near or below historical norms.",
  Guarded:  "Background risk present but contained. Monitor lead indicators for early inflection.",
  Elevated: "Risk conditions elevated above long-run norms. Cross-asset vigilance warranted.",
  High:     "Risk environment materially stressed. Defensive positioning and hedge review advised.",
  Crisis:   "Crisis-level risk signals. Immediate hedge review and liquidity assessment recommended.",
};

const REGIME_RATIONALE: Record<RiskRegime, string> = {
  Low:      "Volatility, rates, and USD all subdued relative to calibrated baselines. Risk-on environment.",
  Guarded:  "At least one factor drifting above baseline. Manageable but warrants tighter stops on unhedged FX.",
  Elevated: "Above-baseline z-scores across multiple factors. Historical precedent: FX vol spikes of 20–40bps.",
  High:     "Sustained multi-factor stress. DXY strength and VIX elevation historically associated with EM FX weakness.",
  Crisis:   "Top-decile historical event. Liquidity conditions may deteriorate rapidly. Review all unhedged positions.",
};

function topFactor(factors: RiskFactor[]): RiskFactor {
  return factors.reduce((best, f) => (f.contribution > best.contribution ? f : best), factors[0]);
}

function buildTemplateInsight(
  regime: RiskRegime,
  factors: RiskFactor[],
  score: number,
  deltaScore: number | null,
  highImpactEvents: number,
  geo: GeoIntelligence | null,
): RiskInsight {
  const top    = topFactor(factors);
  const delta  = deltaScore !== null ? ` Score ${deltaScore > 0 ? "+" : ""}${deltaScore.toFixed(1)} vs prior.` : "";
  const dirStr = top.trend === "up" ? "rising" : top.trend === "down" ? "falling" : "flat";

  let summary = `${REGIME_SUMMARY[regime]}${delta} ${top.label} (${top.source}) is the largest driver at ${top.display} (z=${top.zscore > 0 ? "+" : ""}${top.zscore.toFixed(1)}, ${dirStr}).`;

  if (geo && geo.geo_risk_score >= 5 && geo.top_events.length > 0) {
    summary += ` Geopolitical alert: ${geo.top_events[0]}`;
  }

  const rationale = REGIME_RATIONALE[regime] +
    ` Composite score ${score.toFixed(1)}/10.0.` +
    (geo ? ` Geo intelligence score: ${geo.geo_risk_score.toFixed(1)}/10 (${geo.source}).` : "") +
    (geo?.market_implications ? ` ${geo.market_implications}` : "");

  // Watchlist: top 2 factors + geo/calendar note
  const sorted = [...factors].sort((a, b) => b.contribution - a.contribution);
  const watchlist: string[] = sorted.slice(0, 2).map(
    (f) => `${f.source}: z=${f.zscore > 0 ? "+" : ""}${f.zscore.toFixed(1)} — monitor for continuation`,
  );

  if (geo && geo.geo_risk_score >= 6) {
    watchlist.push(`Geo risk ${geo.geo_risk_score.toFixed(1)}/10 — oil supply routes and safe-haven demand (Gold, JPY, CHF)`);
  } else if (highImpactEvents > 0) {
    watchlist.push(`${highImpactEvents} high-impact economic event${highImpactEvents > 1 ? "s" : ""} on calendar — expect intraday vol`);
  } else {
    watchlist.push("Macro calendar light — range-bound unless headline shock");
  }

  return { summary, rationale, watchlist: watchlist.slice(0, 3), ai_assisted: false, generatedAt: Date.now() };
}

// ── Claude-powered insight ────────────────────────────────────────────────────

async function buildClaudeInsight(
  regime: RiskRegime,
  score: number,
  factors: RiskFactor[],
  geo: GeoIntelligence | null,
  highImpactEvents: number,
): Promise<RiskInsight | null> {
  if (!ANT_KEY) return null;

  const factorLines = factors.map(
    (f) => `  ${f.label}: ${f.display} (z=${f.zscore > 0 ? "+" : ""}${f.zscore.toFixed(1)}, impact=${(f.impact * 100).toFixed(0)}%, weight=${(f.weight * 100).toFixed(0)}%)`,
  ).join("\n");

  const geoLines = geo
    ? `Geo risk score: ${geo.geo_risk_score.toFixed(1)}/10 (${geo.source})\nTop events: ${geo.top_events.join("; ") || "none"}\nOil impact: ${geo.oil_impact} / USD impact: ${geo.usd_impact}`
    : "No geo intelligence available.";

  const prompt = `You are a senior FX risk analyst. Provide a concise institutional market insight based on this data.

RISK PULSE: ${score.toFixed(1)}/10 — ${regime.toUpperCase()}
High-impact economic events: ${highImpactEvents}

FACTOR BREAKDOWN:
${factorLines}

GEOPOLITICAL INTELLIGENCE:
${geoLines}

Return ONLY valid JSON:
{
  "summary": "<1-2 sentences: what changed and primary driver>",
  "rationale": "<2-3 sentences: why it matters for FX positions>",
  "watchlist": [<exactly 3 strings, each max 120 chars, actionable items to monitor in 24h>]
}

Be specific. Reference actual values. No boilerplate. If geo risk is elevated, lead with geopolitical implications.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key":         ANT_KEY,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages:   [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return null;
    const data = await res.json() as { content?: Array<{ type: string; text: string }> };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    const match = text.match(/\{[\s\S]+\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]) as { summary: string; rationale: string; watchlist: string[] };
    return {
      summary:     parsed.summary   ?? "",
      rationale:   parsed.rationale ?? "",
      watchlist:   (parsed.watchlist ?? []).slice(0, 3),
      ai_assisted: true,
      generatedAt: Date.now(),
    };
  } catch { return null; }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ts = Date.now();
  const authHeader = req.headers.get("authorization") ?? "";
  const aiAuth = ANT_KEY && authHeader.startsWith("Bearer ") ? await requireVerifiedBearer(req) : null;
  const allowAi = Boolean(aiAuth?.ok);

  const cached = riskInsightCache.get(INSIGHT_KEY);
  if (cached && (allowAi || !cached.ai_assisted)) {
    return NextResponse.json({ insight: cached, cachedAt: ts });
  }

  const snapshot = riskPulseCache.get(PULSE_KEY);
  if (!snapshot) {
    const placeholder: RiskInsight = {
      summary:     "Awaiting first data fetch.",
      rationale:   "The risk pulse engine requires at least one successful fetch before generating insights.",
      watchlist:   ["Wait for initial data fetch to complete"],
      ai_assisted: false,
      generatedAt: ts,
    };
    return NextResponse.json({ insight: placeholder, cachedAt: ts });
  }

  const geo = geoIntelCache.get("geo_intel");
  const { regime, factors, score, deltaScore, highImpactEvents } = snapshot;

  // Try Claude first, fall back to template
  const insight =
    (allowAi ? await buildClaudeInsight(regime, score, factors, geo, highImpactEvents) : null) ??
    buildTemplateInsight(regime, factors, score, deltaScore, highImpactEvents, geo);

  riskInsightCache.set(INSIGHT_KEY, insight, TTL_MS);

  return NextResponse.json({ insight, cachedAt: ts });
}
