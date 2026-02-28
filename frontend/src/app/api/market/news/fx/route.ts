import { NextResponse } from "next/server";
import { fxNewsCache } from "@/lib/market/cache";
import { buildFxNewsArticles } from "@/lib/market/transforms";
import type { FinnhubNewsItem } from "@/lib/market/transforms";

const FH_KEY  = process.env.FINNHUB_API_KEY ?? "";
const FH_BASE = "https://finnhub.io/api/v1";
const CACHE_KEY = "fx_news";
const TTL_MS = 300_000;

export async function GET() {
  const ts = Date.now();

  const cached = fxNewsCache.get(CACHE_KEY);
  if (cached) {
    console.log(JSON.stringify({ ts, endpoint: "/api/market/news/fx", duration_ms: 0, cached: true, status: 200 }));
    return NextResponse.json({ articles: cached, cachedAt: ts });
  }

  if (!FH_KEY) {
    console.log(JSON.stringify({ ts, endpoint: "/api/market/news/fx", duration_ms: 0, cached: false, status: 200, reason: "no_api_key" }));
    return NextResponse.json({ articles: [], cachedAt: ts, error: "FINNHUB_API_KEY not configured" });
  }

  const t0 = Date.now();
  try {
    const res = await fetch(`${FH_BASE}/news?category=forex&token=${FH_KEY}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`);

    const raw = await res.json() as FinnhubNewsItem[];
    if (!Array.isArray(raw)) throw new Error("Expected array from Finnhub news");

    const articles = buildFxNewsArticles(raw);
    fxNewsCache.set(CACHE_KEY, articles, TTL_MS);

    const duration_ms = Date.now() - t0;
    console.log(JSON.stringify({ ts, endpoint: "/api/market/news/fx", duration_ms, cached: false, status: 200, count: articles.length }));
    return NextResponse.json({ articles, cachedAt: ts });
  } catch (err) {
    const duration_ms = Date.now() - t0;
    console.log(JSON.stringify({ ts, endpoint: "/api/market/news/fx", duration_ms, cached: false, status: 200, error: String(err) }));
    return NextResponse.json({ articles: [], cachedAt: ts, error: String(err) });
  }
}
