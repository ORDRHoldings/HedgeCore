/**
 * GET /api/market/risk-pulse
 *
 * Composite risk score (0.0–10.0) derived from 7 market factors:
 *   equity_stress (VIX), rates_stress (US10Y), usd_strength (DXY),
 *   vol_proxy (VIX σ), credit_risk (Gold), oil_shock (Brent|), geo_news (press)
 *
 * Data sources: Yahoo Finance (macro), Finnhub (news + calendar)
 * Cache: 30s TTL — history ring buffer survives warm invocations
 */

import { NextResponse } from "next/server";
import {
  riskPulseCache,
  factorHistory,
  scoreHistory,
  type FactorSample,
} from "@/lib/market/cache";
import {
  computeRiskPulse,
  type RawMacroInputs,
  type FactorHistorySeries,
} from "@/lib/market/riskScoring";
import type { FinnhubNewsItem } from "@/lib/market/transforms";
import { buildFxNewsArticles } from "@/lib/market/transforms";
import type { FinnhubEconEvent } from "@/lib/market/transforms";
import { buildEconEvents } from "@/lib/market/transforms";

const CACHE_KEY = "risk_pulse";
const TTL_MS    = 30_000;   // 30s

const FH_KEY    = process.env.FINNHUB_API_KEY ?? "";
const FH_BASE   = "https://finnhub.io/api/v1";

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

async function fetchFinnhubNews(): Promise<FinnhubNewsItem[]> {
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

  const cached = riskPulseCache.get(CACHE_KEY);
  if (cached) {
    console.log(JSON.stringify({ ts, endpoint: "/api/market/risk-pulse", cached: true, status: 200 }));
    return NextResponse.json({ snapshot: cached, cachedAt: ts });
  }

  const t0 = Date.now();

  // Parallel fetch: 5 YF symbols + Finnhub news + Finnhub calendar
  const [vixR, us10yR, dxyR, brentR, goldR, rawNews, rawCalendar] = await Promise.all([
    fetchYF("%5EVIX"),
    fetchYF("%5ETNX"),
    fetchYF("DX-Y.NYB"),
    fetchYF("BZ%3DF"),
    fetchYF("GC%3DF"),
    fetchFinnhubNews(),
    fetchFinnhubCalendar(),
  ]);

  // Determine data quality
  const liveCount = [vixR, us10yR, dxyR, brentR, goldR].filter(Boolean).length;
  const quality = liveCount === 5 ? "LIVE" : liveCount >= 2 ? "PARTIAL" : "FALLBACK";

  // Calibrated fallbacks
  const vix   = vixR?.price   ?? 18.5;
  const us10y = us10yR?.price ?? 3.8;
  const dxy   = dxyR?.price   ?? 103;
  const brent = brentR?.price ?? 78;
  const gold  = goldR?.price  ?? 2250;

  // Macro trends
  const trend = (r: { price: number; prevClose: number } | null): "up" | "down" | "flat" =>
    !r ? "flat" : r.price > r.prevClose * 1.0001 ? "up" : r.price < r.prevClose * 0.9999 ? "down" : "flat";

  const macroTrends: Record<string, "up" | "down" | "flat"> = {
    "VIX":    trend(vixR),
    "US 10Y": trend(us10yR),
    "DXY":    trend(dxyR),
    "BRENT":  trend(brentR),
    "GOLD":   trend(goldR),
  };

  // Push new sample to history (for rolling z-score computation)
  const sample: FactorSample = { ts, vix, us10y, dxy, brent, gold };
  factorHistory.push(sample);

  // Build factor history series from ring buffer
  const fhArr = factorHistory.toArray();
  const history: FactorHistorySeries = {
    vix:   fhArr.map((s) => s.vix),
    us10y: fhArr.map((s) => s.us10y),
    dxy:   fhArr.map((s) => s.dxy),
    brent: fhArr.map((s) => s.brent),
    gold:  fhArr.map((s) => s.gold),
  };

  // VIX vol proxy: stdev of last N VIX samples, or level-based proxy
  const vixHistory = history.vix;
  let vix_vol: number;
  if (vixHistory.length >= 3) {
    const m = vixHistory.reduce((s, x) => s + x, 0) / vixHistory.length;
    vix_vol = Math.sqrt(vixHistory.reduce((s, x) => s + (x - m) ** 2, 0) / vixHistory.length);
  } else {
    vix_vol = vix / 20;  // crude proxy on cold start
  }

  // News / calendar processing
  const articles     = buildFxNewsArticles(rawNews);
  const events       = buildEconEvents(rawCalendar);
  const now24h       = ts - 24 * 3_600_000;
  const newsCount24h = articles.filter((a) => a.datetime * 1000 > now24h).length;
  const highImpact   = events.filter((e) => e.impact === "high").length;
  const medImpact    = events.filter((e) => e.impact === "medium").length;
  const news_score   = newsCount24h * 1.0 + highImpact * 3.0 + medImpact * 1.5;

  const inputs: RawMacroInputs = { vix, us10y, dxy, brent, gold, vix_vol, news_score };

  // Compute score
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

  // Persist score for sparkline
  scoreHistory.push(snapshot.score);

  riskPulseCache.set(CACHE_KEY, snapshot, TTL_MS);

  const duration_ms = Date.now() - t0;
  console.log(JSON.stringify({
    ts, endpoint: "/api/market/risk-pulse",
    duration_ms, cached: false, status: 200,
    score: snapshot.score, regime: snapshot.regime, quality,
  }));

  return NextResponse.json({ snapshot, cachedAt: ts });
}
