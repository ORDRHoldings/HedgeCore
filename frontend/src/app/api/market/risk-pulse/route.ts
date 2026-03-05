/**
 * GET /api/market/risk-pulse
 *
 * Returns { snapshot, geo, insight } in one response.
 * All three are computed in the same Lambda invocation — no cross-container
 * cache sharing issues. Insight is included here because Vercel serverless
 * functions run in separate containers; in-memory caches are not shared.
 *
 * Claude calls (when ANTHROPIC_API_KEY set):
 *   1. Geo intelligence  — analyzeGeoIntelligence() — 5 min cache
 *   2. Market insight    — generateInsight()         — 5 min cache
 *
 * Cache: 30s snapshot, 5 min geo + insight.
 */

import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import {
  riskPulseCache,
  geoIntelCache,
  riskInsightCache,
  factorHistory,
  scoreHistory,
  type FactorSample,
} from "@/lib/market/cache";
import {
  computeRiskPulse,
  type RawMacroInputs,
  type FactorHistorySeries,
} from "@/lib/market/riskScoring";
import { buildFxNewsArticles, buildEconEvents } from "@/lib/market/transforms";
import type { FinnhubNewsItem, FinnhubEconEvent } from "@/lib/market/transforms";
import { fetchGeoHeadlines, analyzeGeoIntelligence } from "@/lib/market/geoIntelligence";
import type { RiskFactor, RiskInsight, RiskRegime, GeoIntelligence, RiskPulseSnapshot } from "@/lib/market/types";

const SNAP_KEY    = "risk_pulse";
const GEO_KEY     = "geo_intel";
const INSIGHT_KEY = "risk_pulse_insight";
const SNAP_TTL    = 30_000;
const GEO_TTL     = 300_000;
const INSIGHT_TTL = 300_000;

const FH_KEY  = process.env.FINNHUB_API_KEY ?? "";
const ANT_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const FH_BASE = "https://finnhub.io/api/v1";

// ── Yahoo Finance ─────────────────────────────────────────────────────────────

interface YFMeta { regularMarketPrice?: number; previousClose?: number; chartPreviousClose?: number; }
interface YFResp  { chart?: { result?: Array<{ meta?: YFMeta }>; error?: unknown }; }

async function fetchYF(sym: string): Promise<{ price: number; prevClose: number } | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=2d`,
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; RiskPulseBot/1.0)", Accept: "application/json" }, signal: AbortSignal.timeout(7_000) },
    );
    if (!res.ok) return null;
    const meta = ((await res.json()) as YFResp).chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    return { price: meta.regularMarketPrice, prevClose: meta.previousClose ?? meta.chartPreviousClose ?? meta.regularMarketPrice };
  } catch { return null; }
}

// ── Finnhub helpers ───────────────────────────────────────────────────────────

async function fetchFinnhubForexNews(): Promise<FinnhubNewsItem[]> {
  if (!FH_KEY) return [];
  try {
    const res = await fetch(`${FH_BASE}/news?category=forex&token=${FH_KEY}`, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return [];
    const raw = (await res.json()) as unknown;
    return Array.isArray(raw) ? (raw as FinnhubNewsItem[]) : [];
  } catch { return []; }
}

async function fetchFinnhubCalendar(): Promise<FinnhubEconEvent[]> {
  if (!FH_KEY) return [];
  try {
    const from = new Date(); const to = new Date(Date.now() + 7 * 86_400_000);
    const fmt  = (d: Date) => d.toISOString().slice(0, 10);
    const res  = await fetch(`${FH_BASE}/calendar/economic?from=${fmt(from)}&to=${fmt(to)}&token=${FH_KEY}`, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return [];
    const json = (await res.json()) as { economicCalendar?: FinnhubEconEvent[] };
    return Array.isArray(json.economicCalendar) ? json.economicCalendar : [];
  } catch { return []; }
}

// ── Insight generation ────────────────────────────────────────────────────────

const REGIME_SUMMARY: Record<RiskRegime, string> = {
  Low:      "Market conditions are benign. All major risk factors near or below historical norms.",
  Guarded:  "Background risk present but contained. Monitor lead indicators for early inflection.",
  Elevated: "Risk conditions elevated above long-run norms. Cross-asset vigilance warranted.",
  High:     "Risk environment materially stressed. Defensive positioning and hedge review advised.",
  Crisis:   "Crisis-level signals. Immediate hedge review and liquidity assessment recommended.",
};
const REGIME_RATIONALE: Record<RiskRegime, string> = {
  Low:      "Volatility, rates, and USD all subdued vs calibrated baselines. Risk-on environment.",
  Guarded:  "At least one factor drifting above baseline. Warrants tighter stops on unhedged FX.",
  Elevated: "Above-baseline z-scores across multiple factors. Historical precedent: FX vol spikes 20–40bps.",
  High:     "Sustained multi-factor stress. DXY + VIX elevation historically correlates with EM FX weakness.",
  Crisis:   "Top-decile historical event. Liquidity may deteriorate rapidly. Review all unhedged positions.",
};

function topFactor(factors: RiskFactor[]): RiskFactor {
  return factors.reduce((b, f) => (f.contribution > b.contribution ? f : b), factors[0]);
}

function buildTemplateInsight(snap: RiskPulseSnapshot, geo: GeoIntelligence | null): RiskInsight {
  const { regime, factors, score, deltaScore, highImpactEvents } = snap;
  const top    = topFactor(factors);
  const delta  = deltaScore !== null ? ` Score ${deltaScore > 0 ? "+" : ""}${deltaScore.toFixed(1)} vs prior.` : "";
  const dirStr = top.trend === "up" ? "rising" : top.trend === "down" ? "falling" : "flat";

  let summary = `${REGIME_SUMMARY[regime]}${delta} ${top.label} (${top.source}) is the largest driver at ${top.display} (z=${top.zscore > 0 ? "+" : ""}${top.zscore.toFixed(1)}, ${dirStr}).`;
  if (geo && geo.geo_risk_score >= 5 && geo.top_events.length > 0) {
    summary += ` Geopolitical: ${geo.top_events[0]}`;
  }

  const rationale = REGIME_RATIONALE[regime] +
    ` Score ${score.toFixed(1)}/10.0.` +
    (geo ? ` Geo ${geo.geo_risk_score.toFixed(1)}/10 (${geo.source}). ${geo.market_implications}` : "");

  const sorted    = [...factors].sort((a, b) => b.contribution - a.contribution);
  const watchlist = sorted.slice(0, 2).map((f) => `${f.source}: z=${f.zscore > 0 ? "+" : ""}${f.zscore.toFixed(1)} — monitor for continuation`);
  if (geo && geo.geo_risk_score >= 6) watchlist.push(`Geo ${geo.geo_risk_score.toFixed(1)}/10 — oil supply routes + safe-haven demand (Gold, JPY, CHF)`);
  else if (highImpactEvents > 0) watchlist.push(`${highImpactEvents} high-impact economic event${highImpactEvents > 1 ? "s" : ""} — expect intraday vol`);
  else watchlist.push("Calendar light — range-bound unless headline shock");

  return { summary, rationale, watchlist: watchlist.slice(0, 3), ai_assisted: false, generatedAt: Date.now() };
}

async function buildClaudeInsight(snap: RiskPulseSnapshot, geo: GeoIntelligence | null): Promise<RiskInsight | null> {
  if (!ANT_KEY) return null;

  const factorLines = snap.factors.map(
    (f) => `  ${f.label}: ${f.display} (z=${f.zscore > 0 ? "+" : ""}${f.zscore.toFixed(1)}, impact=${(f.impact * 100).toFixed(0)}%, weight=${(f.weight * 100).toFixed(0)}%)`,
  ).join("\n");

  const geoCtx = geo
    ? `Geo risk: ${geo.geo_risk_score.toFixed(1)}/10 (${geo.source}, ${geo.confidence} confidence)\nTop events: ${geo.top_events.join("; ") || "none"}\nOil impact: ${geo.oil_impact} / USD impact: ${geo.usd_impact}`
    : "No geo intelligence.";

  const prompt = `You are a senior FX risk analyst. Provide a concise institutional market insight.

RISK PULSE: ${snap.score.toFixed(1)}/10 — ${snap.regime.toUpperCase()}
High-impact events: ${snap.highImpactEvents}

FACTORS:
${factorLines}

GEOPOLITICAL CONTEXT:
${geoCtx}

Return ONLY valid JSON:
{"summary":"<1-2 sentences: what and primary driver>","rationale":"<2-3 sentences: FX implications>","watchlist":["<item1 max 120 chars>","<item2>","<item3>"]}

Be specific. Reference actual values. If geo risk is elevated, lead with geopolitical implications.`;

  const MODELS = ["claude-haiku-4-5-20251001", "claude-3-5-haiku-20241022"];
  for (const model of MODELS) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": ANT_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 500, messages: [{ role: "user", content: prompt }] }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        console.error(`[insight] Claude ${model} HTTP ${res.status}: ${errBody.slice(0, 200)}`);
        if (res.status === 404 || res.status === 400) continue;
        return null;
      }

      const data   = await res.json() as { content?: Array<{ type: string; text: string }> };
      const text   = data.content?.find((c) => c.type === "text")?.text ?? "";
      const match  = text.match(/\{[\s\S]+\}/);
      if (!match) { console.error(`[insight] Claude ${model} non-JSON: ${text.slice(0, 200)}`); return null; }

      const parsed = JSON.parse(match[0]) as { summary: string; rationale: string; watchlist: string[] };
      logger.info({ event: "insight_claude_success", model });
      return { summary: parsed.summary ?? "", rationale: parsed.rationale ?? "", watchlist: (parsed.watchlist ?? []).slice(0, 3), ai_assisted: true, generatedAt: Date.now() };
    } catch (err) {
      console.error(`[insight] Claude ${model} exception: ${String(err)}`);
    }
  }
  return null;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET() {
  const ts = Date.now();

  const cachedSnap    = riskPulseCache.get(SNAP_KEY);
  const cachedGeo     = geoIntelCache.get(GEO_KEY);
  const cachedInsight = riskInsightCache.get(INSIGHT_KEY);

  if (cachedSnap && cachedGeo && cachedInsight) {
    logger.info({ endpoint: "/api/market/risk-pulse", cached: true, status: 200 });
    return NextResponse.json({ snapshot: cachedSnap, geo: cachedGeo, insight: cachedInsight, cachedAt: ts });
  }

  const t0 = Date.now();

  // ── Parallel: market data + geo headlines ──────────────────────────────────
  const [vixR, us10yR, dxyR, brentR, goldR, forexNews, calEvents, geoHeadlines] = await Promise.all([
    fetchYF("%5EVIX"),
    fetchYF("%5ETNX"),
    fetchYF("DX-Y.NYB"),
    fetchYF("BZ%3DF"),
    fetchYF("GC%3DF"),
    fetchFinnhubForexNews(),
    fetchFinnhubCalendar(),
    fetchGeoHeadlines(),
  ]);

  // ── Geo intelligence ───────────────────────────────────────────────────────
  const geoIntel = cachedGeo ?? await (async () => {
    const g = await analyzeGeoIntelligence(geoHeadlines);
    geoIntelCache.set(GEO_KEY, g, GEO_TTL);
    return g;
  })();

  // ── Market data ────────────────────────────────────────────────────────────
  const liveCount = [vixR, us10yR, dxyR, brentR, goldR].filter(Boolean).length;
  const quality   = liveCount === 5 ? "LIVE" : liveCount >= 2 ? "PARTIAL" : "FALLBACK";

  const vix   = vixR?.price   ?? 18.5;
  const us10y = us10yR?.price ?? 3.8;
  const dxy   = dxyR?.price   ?? 103;
  const brent = brentR?.price ?? 78;
  const gold  = goldR?.price  ?? 2250;

  const trend = (r: { price: number; prevClose: number } | null): "up" | "down" | "flat" =>
    !r ? "flat" : r.price > r.prevClose * 1.0001 ? "up" : r.price < r.prevClose * 0.9999 ? "down" : "flat";

  const macroTrends: Record<string, "up" | "down" | "flat"> = {
    "VIX": trend(vixR), "US 10Y": trend(us10yR), "DXY": trend(dxyR),
    "BRENT": trend(brentR), "GOLD": trend(goldR),
    "INTEL": geoIntel.geo_risk_score >= 2 ? "up" : "flat",
  };

  const sample: FactorSample = { ts, vix, us10y, dxy, brent, gold };
  factorHistory.push(sample);

  const fhArr = factorHistory.toArray();
  const history: FactorHistorySeries = {
    vix:   fhArr.map((s) => s.vix),
    us10y: fhArr.map((s) => s.us10y),
    dxy:   fhArr.map((s) => s.dxy),
    brent: fhArr.map((s) => s.brent),
    gold:  fhArr.map((s) => s.gold),
  };

  const vixHist = history.vix;
  const vix_vol = vixHist.length >= 3
    ? Math.sqrt(vixHist.reduce((s, x) => { const m = vixHist.reduce((a, b) => a + b, 0) / vixHist.length; return s + (x - m) ** 2; }, 0) / vixHist.length)
    : vix / 20;

  const articles     = buildFxNewsArticles(forexNews);
  const events       = buildEconEvents(calEvents);
  const now24h       = ts - 24 * 3_600_000;
  const newsCount24h = articles.filter((a) => a.datetime * 1000 > now24h).length;
  const highImpact   = events.filter((e) => e.impact === "high").length;
  const medImpact    = events.filter((e) => e.impact === "medium").length;

  const inputs: RawMacroInputs = { vix, us10y, dxy, brent, gold, vix_vol, news_score: geoIntel.geo_risk_score };

  const snapshot = computeRiskPulse(inputs, history, scoreHistory.toArray(), {
    newsCount24h, highImpactEvents: highImpact, mediumImpactEvents: medImpact,
    quality, computedAt: ts, dataAge_ms: Date.now() - t0,
  }, macroTrends);

  scoreHistory.push(snapshot.score);
  riskPulseCache.set(SNAP_KEY, snapshot, SNAP_TTL);

  // ── Insight (Claude or template, in same Lambda invocation) ───────────────
  const insight = cachedInsight ?? await (async () => {
    const ins = (await buildClaudeInsight(snapshot, geoIntel)) ?? buildTemplateInsight(snapshot, geoIntel);
    riskInsightCache.set(INSIGHT_KEY, ins, INSIGHT_TTL);
    return ins;
  })();

  const duration_ms = Date.now() - t0;
  logger.info({
    endpoint: "/api/market/risk-pulse", duration_ms, cached: false, status: 200,
    score: snapshot.score, regime: snapshot.regime, quality,
    geo_score: geoIntel.geo_risk_score, geo_source: geoIntel.source,
    insight_ai: insight.ai_assisted,
  });

  return NextResponse.json({ snapshot, geo: geoIntel, insight, cachedAt: ts });
}
