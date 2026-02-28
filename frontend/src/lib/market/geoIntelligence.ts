/**
 * Geopolitical intelligence engine.
 *
 * Primary path: fetch Finnhub general + forex headlines → call Claude Haiku →
 *   return structured GeoIntelligence with geo_risk_score 0–10.
 *
 * Fallback path (no ANTHROPIC_API_KEY): keyword heuristic scoring.
 *
 * geo_risk_score calibration:
 *   0–2  : Quiet / background noise
 *   2–4  : Regional tensions, trade friction
 *   4–6  : Significant conflict, major sanctions
 *   6–8  : Active military strikes, oil supply threat
 *   8–10 : Major war escalation, nuclear threat, global crisis
 */

import type { GeoIntelligence, RiskRegime } from "./types";
import type { FinnhubNewsItem } from "./transforms";

const FH_KEY  = process.env.FINNHUB_API_KEY ?? "";
const ANT_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const FH_BASE = "https://finnhub.io/api/v1";

// ── Headline fetch: general + forex categories ────────────────────────────────

export async function fetchGeoHeadlines(): Promise<{ headline: string; url: string; datetime: number }[]> {
  if (!FH_KEY) return [];
  try {
    const [gRes, fRes] = await Promise.all([
      fetch(`${FH_BASE}/news?category=general&token=${FH_KEY}`, { signal: AbortSignal.timeout(8_000) }),
      fetch(`${FH_BASE}/news?category=forex&token=${FH_KEY}`,   { signal: AbortSignal.timeout(8_000) }),
    ]);

    const general: FinnhubNewsItem[] = gRes.ok ? (await gRes.json() as FinnhubNewsItem[]) : [];
    const forex:   FinnhubNewsItem[] = fRes.ok ? (await fRes.json() as FinnhubNewsItem[]) : [];

    // Merge, dedupe by headline text, sort newest first, cap at 50
    const seen = new Set<string>();
    const merged = [...general, ...forex]
      .filter((n) => n.headline && n.headline.length > 10)
      .filter((n) => { const k = n.headline!.slice(0, 80); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => (b.datetime ?? 0) - (a.datetime ?? 0))
      .slice(0, 50);

    return merged.map((n) => ({
      headline: n.headline ?? "",
      url:      n.url      ?? "",
      datetime: n.datetime ?? 0,
    }));
  } catch { return []; }
}

// ── Keyword heuristic (fallback when no API key) ──────────────────────────────

const CRISIS_TIERS: Array<{ keywords: string[]; score: number }> = [
  { keywords: ["nuclear strike", "nuclear weapon", "nuclear war", "warhead launched"],                                                      score: 5.0 },
  { keywords: ["airstrikes on iran", "bombed iran", "attack on iran", "iran attacked", "israel bombs", "us bombs", "us strikes iran"],      score: 4.5 },
  { keywords: ["airstrike", "air strike", "bombing campaign", "missile strike", "military strike", "invaded", "declaration of war"],        score: 3.5 },
  { keywords: ["attack on", "attacked", "explosion in", "killed in strike", "drone attack", "ballistic missile"],                           score: 2.5 },
  { keywords: ["iran", "israel", "hezbollah", "hamas", "houthi", "strait of hormuz"],                                                       score: 1.5 },
  { keywords: ["russia", "ukraine", "nato", "china", "taiwan strait", "south china sea"],                                                   score: 1.0 },
  { keywords: ["sanction", "embargo", "oil embargo", "opec cut", "supply cut", "blockade"],                                                 score: 0.8 },
  { keywords: ["escalat", "tension", "conflict", "crisis", "standoff", "confrontation"],                                                    score: 0.5 },
];

function heuristicAnalysis(headlines: string[]): {
  score: number;
  events: string[];
  oil_impact: GeoIntelligence["oil_impact"];
  usd_impact: GeoIntelligence["usd_impact"];
} {
  const joined  = headlines.join(" ").toLowerCase();
  let   score   = 0;
  const matched: string[] = [];

  for (const tier of CRISIS_TIERS) {
    for (const kw of tier.keywords) {
      if (joined.includes(kw)) {
        score += tier.score;
        const hl = headlines.find((h) => h.toLowerCase().includes(kw));
        if (hl && !matched.includes(hl)) matched.push(hl);
        break;
      }
    }
    if (score > 9) break;
  }

  const finalScore = Math.min(score, 10);

  // Oil/USD directional signals from geopolitical context
  const oilBullish = ["iran", "strait of hormuz", "opec", "supply cut", "oil field", "pipeline", "houthi"].some((k) => joined.includes(k));
  const usdStrong  = finalScore > 4;

  return {
    score:      parseFloat(finalScore.toFixed(1)),
    events:     matched.slice(0, 3),
    oil_impact: oilBullish ? "bullish" : "neutral",
    usd_impact: usdStrong  ? "strengthening" : "neutral",
  };
}

function scoreToRegime(s: number): RiskRegime {
  if (s < 2) return "Low";
  if (s < 4) return "Guarded";
  if (s < 6) return "Elevated";
  if (s < 8) return "High";
  return "Crisis";
}

// ── Claude analysis ───────────────────────────────────────────────────────────

interface ClaudeGeoResponse {
  geo_risk_score: number;
  top_events:     string[];
  market_implications: string;
  oil_impact:     "bullish" | "bearish" | "neutral";
  usd_impact:     "strengthening" | "weakening" | "neutral";
  confidence:     "high" | "medium" | "low";
}

async function callClaudeGeoAnalysis(
  headlines: string[],
): Promise<ClaudeGeoResponse | null> {
  if (!ANT_KEY || headlines.length === 0) return null;

  const numbered = headlines
    .slice(0, 40)
    .map((h, i) => `${i + 1}. ${h}`)
    .join("\n");

  const prompt = `You are a geopolitical risk analyst at an institutional FX trading desk. Analyze the following recent news headlines and return a structured risk assessment.

HEADLINES:
${numbered}

Return ONLY valid JSON — no explanation, no markdown:
{
  "geo_risk_score": <float 0.0–10.0>,
  "top_events": [<up to 3 strings, each max 100 chars, most market-relevant events>],
  "market_implications": "<2 sentences on direct FX/oil/rates impact>",
  "oil_impact": "bullish" | "bearish" | "neutral",
  "usd_impact": "strengthening" | "weakening" | "neutral",
  "confidence": "high" | "medium" | "low"
}

Score calibration:
0–2  = Normal background news, no active conflicts
2–4  = Regional tensions, trade friction, political uncertainty
4–6  = Significant active conflict or major economic crisis
6–8  = Large-scale military strikes, oil supply route threats, broad regional war
8–10 = Catastrophic escalation: multi-nation war, nuclear threat, systemic crisis`;

  // Try primary model, fall back to 3.5-haiku if unavailable
  const MODELS = ["claude-haiku-4-5-20251001", "claude-3-5-haiku-20241022"];

  for (const model of MODELS) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key":         ANT_KEY,
          "anthropic-version": "2023-06-01",
          "content-type":      "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 600,
          messages:   [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(20_000),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        console.error(`[geo-intel] Claude ${model} HTTP ${res.status}: ${errBody.slice(0, 200)}`);
        // If model not found, try next; otherwise bail
        if (res.status === 404 || res.status === 400) continue;
        return null;
      }

      const data = await res.json() as { content?: Array<{ type: string; text: string }> };
      const text = data.content?.find((c) => c.type === "text")?.text ?? "";

      // Extract JSON block — Claude sometimes wraps in backticks
      const match = text.match(/\{[\s\S]+\}/);
      if (!match) {
        console.error(`[geo-intel] Claude ${model} returned non-JSON: ${text.slice(0, 200)}`);
        return null;
      }

      const parsed = JSON.parse(match[0]) as ClaudeGeoResponse;
      console.log(`[geo-intel] Claude ${model} succeeded, geo_risk_score=${parsed.geo_risk_score}`);
      return parsed;
    } catch (err) {
      console.error(`[geo-intel] Claude ${model} exception: ${String(err)}`);
    }
  }
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function analyzeGeoIntelligence(
  headlines: { headline: string; url?: string; datetime?: number }[],
): Promise<GeoIntelligence> {
  const ts            = Date.now();
  const headlineTexts = headlines.map((h) => h.headline);

  if (ANT_KEY && headlineTexts.length > 0) {
    const claude = await callClaudeGeoAnalysis(headlineTexts);
    if (claude) {
      const score = Math.max(0, Math.min(10, claude.geo_risk_score ?? 2));
      return {
        geo_risk_score:      parseFloat(score.toFixed(1)),
        regime:              scoreToRegime(score),
        top_events:          (claude.top_events ?? []).slice(0, 3),
        market_implications: claude.market_implications ?? "",
        oil_impact:          claude.oil_impact  ?? "neutral",
        usd_impact:          claude.usd_impact  ?? "neutral",
        confidence:          claude.confidence  ?? "medium",
        source:              "claude",
        computedAt:          ts,
        headlineCount:       headlineTexts.length,
      };
    }
  }

  // Heuristic fallback
  const h = heuristicAnalysis(headlineTexts);
  const implText =
    h.score >= 6
      ? "Major geopolitical event detected. Expect oil supply disruption risk and safe-haven demand (Gold, JPY, CHF). EM FX under pressure."
      : h.score >= 3
      ? "Elevated regional tensions. Monitor oil and risk-sensitive FX pairs for vol expansion."
      : "No significant geopolitical events detected. Background risk is normal.";

  return {
    geo_risk_score:      h.score,
    regime:              scoreToRegime(h.score),
    top_events:          h.events,
    market_implications: implText,
    oil_impact:          h.oil_impact,
    usd_impact:          h.usd_impact,
    confidence:          ANT_KEY ? "medium" : "low",
    source:              "heuristic",
    computedAt:          ts,
    headlineCount:       headlineTexts.length,
  };
}
