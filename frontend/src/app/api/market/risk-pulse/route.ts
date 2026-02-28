/**
 * GET /api/market/risk-pulse
 *
 * Composite risk score (0.0–10.0) from 7 factors. Key change from v1:
 *   - geo_news (20%) + oil_shock (20%) = 40% combined weight.
 *     A single geopolitical event (e.g. airstrikes on an oil producer) will
 *     simultaneously spike both, correctly registering a High/Crisis regime.
 *   - geo_news input is Claude's geo_risk_score 0–10 (not a news count).
 *   - GeoIntelligence object is included in the response for the widget.
 *
 * Data: Yahoo Finance (VIX, US10Y, DXY, Brent, Gold) + Finnhub (general+forex
 *       news) + Claude Haiku (geopolitical analysis).
 *
 * Cache: 30s snapshot TTL, 5 min geo intelligence TTL.
 */

import { NextResponse } from "next/server";
import {
  riskPulseCache,
  geoIntelCache,
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

const CACHE_KEY     = "risk_pulse";
const GEO_CACHE_KEY = "geo_intel";
const TTL_MS        = 30_000;    // 30s snapshot
const GEO_TTL_MS    = 300_000;   // 5 min geo (Claude is cached longer to control cost)

const FH_KEY  = process.env.FINNHUB_API_KEY ?? "";
const FH_BASE = "https://finnhub.io/api/v1";

// ── Yahoo Finance ─────────────────────────────────────────────────────────────

interface YFMeta {
  regularMarketPrice?:  number;
  previousClose?:       number;
  chartPreviousClose?:  number;
}
interface YFResp {
  chart?: { result?: Array<{ meta?: YFMeta }>; error?: unknown };
}

async function fetchYF(yfSymbol: string): Promise<{ price: number; prevClose: number } | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yfSymbol}?interval=1d&range=2d`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; RiskPulseBot/1.0)", Accept: "application/json" },
        signal: AbortSignal.timeout(7_000),
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as YFResp;
    const meta  = json.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    return {
      price:     meta.regularMarketPrice,
      prevClose: meta.previousClose ?? meta.chartPreviousClose ?? meta.regularMarketPrice,
    };
  } catch { return null; }
}

// ── Finnhub helpers ───────────────────────────────────────────────────────────

async function fetchFinnhubForexNews(): Promise<FinnhubNewsItem[]> {
  if (!FH_KEY) return [];
  try {
    const res = await fetch(`${FH_BASE}/news?category=forex&token=${FH_KEY}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const raw = (await res.json()) as unknown;
    return Array.isArray(raw) ? (raw as FinnhubNewsItem[]) : [];
  } catch { return []; }
}

async function fetchFinnhubCalendar(): Promise<FinnhubEconEvent[]> {
  if (!FH_KEY) return [];
  try {
    const from = new Date();
    const to   = new Date(Date.now() + 7 * 86_400_000);
    const fmt  = (d: Date) => d.toISOString().slice(0, 10);
    const res  = await fetch(
      `${FH_BASE}/calendar/economic?from=${fmt(from)}&to=${fmt(to)}&token=${FH_KEY}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { economicCalendar?: FinnhubEconEvent[] };
    return Array.isArray(json.economicCalendar) ? json.economicCalendar : [];
  } catch { return []; }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET() {
  const ts = Date.now();

  // Return snapshot from cache (but always include fresh geo intel in response)
  const cachedSnap = riskPulseCache.get(CACHE_KEY);
  const cachedGeo  = geoIntelCache.get(GEO_CACHE_KEY);

  if (cachedSnap && cachedGeo) {
    console.log(JSON.stringify({ ts, endpoint: "/api/market/risk-pulse", cached: true, status: 200 }));
    return NextResponse.json({ snapshot: cachedSnap, geo: cachedGeo, cachedAt: ts });
  }

  const t0 = Date.now();

  // ── Parallel fetch: market data + geo headlines ────────────────────────────
  const [vixR, us10yR, dxyR, brentR, goldR, forexNews, calendarEvents, geoHeadlines] =
    await Promise.all([
      fetchYF("%5EVIX"),
      fetchYF("%5ETNX"),
      fetchYF("DX-Y.NYB"),
      fetchYF("BZ%3DF"),
      fetchYF("GC%3DF"),
      fetchFinnhubForexNews(),
      fetchFinnhubCalendar(),
      fetchGeoHeadlines(),
    ]);

  // ── Geo intelligence (Claude or heuristic) ─────────────────────────────────
  const geoIntel = cachedGeo ?? await (async () => {
    const intel = await analyzeGeoIntelligence(geoHeadlines);
    geoIntelCache.set(GEO_CACHE_KEY, intel, GEO_TTL_MS);
    return intel;
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
    "VIX":    trend(vixR),
    "US 10Y": trend(us10yR),
    "DXY":    trend(dxyR),
    "BRENT":  trend(brentR),
    "GOLD":   trend(goldR),
    "INTEL":  geoIntel.geo_risk_score > 2 ? "up" : "flat",
  };

  // ── History ring buffer ────────────────────────────────────────────────────
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

  // VIX vol proxy
  const vixHist = history.vix;
  let vix_vol: number;
  if (vixHist.length >= 3) {
    const m = vixHist.reduce((s, x) => s + x, 0) / vixHist.length;
    vix_vol = Math.sqrt(vixHist.reduce((s, x) => s + (x - m) ** 2, 0) / vixHist.length);
  } else {
    vix_vol = vix / 20;
  }

  // ── Calendar / news metadata ───────────────────────────────────────────────
  const articles     = buildFxNewsArticles(forexNews);
  const events       = buildEconEvents(calendarEvents);
  const now24h       = ts - 24 * 3_600_000;
  const newsCount24h = articles.filter((a) => a.datetime * 1000 > now24h).length;
  const highImpact   = events.filter((e) => e.impact === "high").length;
  const medImpact    = events.filter((e) => e.impact === "medium").length;

  // ── Scoring: news_score = Claude's geo_risk_score (0–10 scale) ────────────
  const inputs: RawMacroInputs = {
    vix, us10y, dxy, brent, gold, vix_vol,
    news_score: geoIntel.geo_risk_score,
  };

  const snapshot = computeRiskPulse(
    inputs,
    history,
    scoreHistory.toArray(),
    {
      newsCount24h,
      highImpactEvents:   highImpact,
      mediumImpactEvents: medImpact,
      quality,
      computedAt: ts,
      dataAge_ms: Date.now() - t0,
    },
    macroTrends,
  );

  scoreHistory.push(snapshot.score);
  riskPulseCache.set(CACHE_KEY, snapshot, TTL_MS);

  const duration_ms = Date.now() - t0;
  console.log(JSON.stringify({
    ts, endpoint: "/api/market/risk-pulse",
    duration_ms, cached: false, status: 200,
    score: snapshot.score, regime: snapshot.regime, quality,
    geo_score: geoIntel.geo_risk_score, geo_source: geoIntel.source,
  }));

  return NextResponse.json({ snapshot, geo: geoIntel, cachedAt: ts });
}
