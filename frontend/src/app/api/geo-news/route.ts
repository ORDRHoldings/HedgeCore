/**
 * /api/geo-news — Geopolitical & macro news feed via Yahoo Finance
 *
 * Runs three parallel searches on Yahoo Finance's undocumented v1/finance/search
 * endpoint (same source yfinance wraps), merges, deduplicates, and serves the
 * top 15 articles sorted newest-first.
 *
 * Cache: 10-minute in-memory TTL + CDN s-maxage=600
 */

import { NextResponse } from "next/server";

// ─── In-memory cache ──────────────────────────────────────────────────────────
const CACHE_TTL_MS = 600_000; // 10 min
let _cache: { articles: NewsArticle[]; ts: number } | null = null;

// ─── Types ────────────────────────────────────────────────────────────────────
interface YFRawItem {
  uuid?: string;
  title?: string;
  publisher?: string;
  link?: string;
  providerPublishTime?: number;
  type?: string;
}

export interface NewsArticle {
  uuid:        string;
  title:       string;
  publisher:   string;
  link:        string;
  publishedAt: number; // unix seconds
  ago:         string; // human-readable relative time
}

// ─── Search queries ───────────────────────────────────────────────────────────
// Wide enough to surface macro/geo risk news without being too narrow
const QUERIES = [
  "geopolitical risk currency forex dollar",
  "central bank interest rate inflation Fed ECB",
  "trade war tariff emerging markets FX",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function agoString(epochSecs: number): string {
  const diffMs   = Date.now() - epochSecs * 1_000;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1)  return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const h = Math.floor(diffMins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const YF_HEADERS: HeadersInit = {
  "User-Agent": "Mozilla/5.0 (compatible; InstitutionalNewsBot/1.0)",
  "Accept":     "application/json, */*",
};

async function searchYF(query: string): Promise<YFRawItem[]> {
  const url =
    `https://query1.finance.yahoo.com/v1/finance/search` +
    `?q=${encodeURIComponent(query)}` +
    `&newsCount=8&enableFuzzyQuery=false&lang=en-US&region=US`;
  try {
    const res = await fetch(url, {
      headers: YF_HEADERS,
      signal: AbortSignal.timeout(7_000),
    });
    if (!res.ok) return [];
    const json = await res.json() as { news?: YFRawItem[] };
    return Array.isArray(json.news) ? json.news : [];
  } catch {
    return [];
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function GET() {
  // Serve from cache if still fresh
  if (_cache && Date.now() - _cache.ts < CACHE_TTL_MS) {
    const resp = NextResponse.json({
      articles: _cache.articles,
      source:   "yahoo_finance",
      cachedAt: _cache.ts,
      count:    _cache.articles.length,
    });
    resp.headers.set("Cache-Control", "s-maxage=600, stale-while-revalidate=120");
    return resp;
  }

  // Fetch all three queries in parallel
  const settled = await Promise.allSettled(QUERIES.map(searchYF));

  const seen     = new Set<string>();
  const articles: NewsArticle[] = [];

  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const item of result.value) {
      if (!item.uuid || !item.title)           continue; // require both
      if (item.type && item.type !== "STORY")  continue; // skip non-articles
      if (seen.has(item.uuid))                 continue; // deduplicate
      seen.add(item.uuid);
      const ts = item.providerPublishTime ?? Math.floor(Date.now() / 1_000);
      articles.push({
        uuid:        item.uuid,
        title:       item.title,
        publisher:   item.publisher ?? "Yahoo Finance",
        link:        item.link      ?? "https://finance.yahoo.com",
        publishedAt: ts,
        ago:         agoString(ts),
      });
    }
  }

  // Newest first, take top 15
  articles.sort((a, b) => b.publishedAt - a.publishedAt);
  const top15 = articles.slice(0, 15);

  _cache = { articles: top15, ts: Date.now() };

  const resp = NextResponse.json({
    articles: top15,
    source:   top15.length > 0 ? "yahoo_finance" : "empty",
    cachedAt: _cache.ts,
    count:    top15.length,
  });
  resp.headers.set(
    "Cache-Control",
    top15.length > 0
      ? "s-maxage=600, stale-while-revalidate=120"
      : "no-store",
  );
  return resp;
}
