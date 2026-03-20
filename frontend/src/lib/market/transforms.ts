/**
 * Pure transform functions for Finnhub API responses.
 * Exported from a shared lib module (not from route files) so they
 * can be imported by both API routes and unit tests.
 */

import type { FxRateEntry, FxNewsArticle, EconEvent } from "./types";

// ── FX Rates ─────────────────────────────────────────────────────────────────

type PairDef = { symbol: string; quoteKey: string; invert: boolean; spreadPct: number };

export const FX_TARGET_PAIRS: PairDef[] = [
  { symbol: "USDMXN", quoteKey: "MXN",  invert: false, spreadPct: 0.05 },
  { symbol: "EURUSD", quoteKey: "EUR",  invert: true,  spreadPct: 0.02 },
  { symbol: "GBPUSD", quoteKey: "GBP",  invert: true,  spreadPct: 0.02 },
  { symbol: "USDJPY", quoteKey: "JPY",  invert: false, spreadPct: 0.02 },
  { symbol: "USDCAD", quoteKey: "CAD",  invert: false, spreadPct: 0.02 },
  { symbol: "USDCHF", quoteKey: "CHF",  invert: false, spreadPct: 0.02 },
  { symbol: "AUDUSD", quoteKey: "AUD",  invert: true,  spreadPct: 0.02 },
  { symbol: "USDCNH", quoteKey: "CNH",  invert: false, spreadPct: 0.04 },
];

export function buildFxRates(quote: Record<string, number>): FxRateEntry[] {
  const results: FxRateEntry[] = [];
  for (const { symbol, quoteKey, invert, spreadPct } of FX_TARGET_PAIRS) {
    const raw = quote[quoteKey];
    if (!raw || raw <= 0) continue; // skip pairs with no live data
    const mid = invert ? 1 / raw : raw;
    const halfSpread = mid * (spreadPct / 100) / 2;
    results.push({
      symbol,
      bid: parseFloat((mid - halfSpread).toFixed(6)),
      ask: parseFloat((mid + halfSpread).toFixed(6)),
      mid: parseFloat(mid.toFixed(6)),
    });
  }
  return results;
}

// ── FX News ───────────────────────────────────────────────────────────────────

export interface FinnhubNewsItem {
  id?: number;
  headline?: string;
  summary?: string;
  source?: string;
  url?: string;
  datetime?: number;
  category?: string;
}

const MAX_ARTICLES = 15;

export function buildFxNewsArticles(raw: FinnhubNewsItem[]): FxNewsArticle[] {
  return raw
    .slice(0, MAX_ARTICLES)
    .map((item, idx) => ({
      id: item.id ?? idx,
      headline: item.headline ?? "",
      summary: item.summary ?? "",
      source: item.source ?? "Unknown",
      url: item.url ?? "",
      datetime: item.datetime ?? 0,
      category: item.category ?? "forex",
    }))
    .filter((a) => a.headline.length > 0);
}

// ── Economic Calendar ─────────────────────────────────────────────────────────

export interface FinnhubEconEvent {
  time?: string;
  country?: string;
  event?: string;
  impact?: string;
  actual?: string | null;
  estimate?: string | null;
  prev?: string | null;
}

export function buildEconEvents(raw: FinnhubEconEvent[]): EconEvent[] {
  return raw
    .filter((e) => e.event && e.time)
    .map((e) => ({
      time: e.time ?? "",
      country: e.country ?? "",
      event: e.event ?? "",
      impact: normalizeImpact(e.impact),
      actual: e.actual ?? null,
      estimate: e.estimate ?? null,
      prev: e.prev ?? null,
    }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

function normalizeImpact(raw: string | undefined): "high" | "medium" | "low" {
  const s = (raw ?? "").toLowerCase();
  if (s === "high") return "high";
  if (s === "medium" || s === "med") return "medium";
  return "low";
}
