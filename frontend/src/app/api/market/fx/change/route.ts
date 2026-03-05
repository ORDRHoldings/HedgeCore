/**
 * /api/market/fx/change — 24-hour % change for 8 major FX pairs via Yahoo Finance
 *
 * Returns { changes: Record<string, number> } keyed by symbol (e.g. "EURUSD").
 * Cache: 60-second in-memory TTL.
 */

import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

// ─── In-memory cache ──────────────────────────────────────────────────────────
const TTL_MS = 60_000; // 60 s
let _cache: { changes: Record<string, number>; ts: number } | null = null;

// ─── Pairs ────────────────────────────────────────────────────────────────────
// yfSymbol is URL-encoded for use in path: = → %3D
const PAIRS: Array<{ yfSymbol: string; key: string }> = [
  { yfSymbol: "EURUSD%3DX", key: "EURUSD" },
  { yfSymbol: "USDJPY%3DX", key: "USDJPY" },
  { yfSymbol: "GBPUSD%3DX", key: "GBPUSD" },
  { yfSymbol: "USDMXN%3DX", key: "USDMXN" },
  { yfSymbol: "USDCAD%3DX", key: "USDCAD" },
  { yfSymbol: "USDCHF%3DX", key: "USDCHF" },
  { yfSymbol: "AUDUSD%3DX", key: "AUDUSD" },
  { yfSymbol: "USDCNH%3DX", key: "USDCNH" },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface YFChartMeta {
  regularMarketChangePercent?: number;
  regularMarketPrice?:         number;
  previousClose?:              number;
  chartPreviousClose?:         number;
}
interface YFChartResponse {
  chart?: { result?: Array<{ meta?: YFChartMeta }>; error?: unknown };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const YF_HEADERS: HeadersInit = {
  "User-Agent": "Mozilla/5.0 (compatible; InstitutionalFXBot/1.0)",
  Accept: "application/json, */*",
};

async function fetchChangePct(yfSymbol: string): Promise<number | null> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${yfSymbol}` +
    `?interval=1d&range=1d`;
  try {
    const res = await fetch(url, {
      headers: YF_HEADERS,
      signal: AbortSignal.timeout(7_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as YFChartResponse;
    const meta = json.chart?.result?.[0]?.meta;
    if (!meta) return null;
    if (meta.regularMarketChangePercent !== undefined) {
      return parseFloat(meta.regularMarketChangePercent.toFixed(4));
    }
    // Fallback: compute from price and prev close
    if (meta.regularMarketPrice && (meta.previousClose ?? meta.chartPreviousClose)) {
      const prev = meta.previousClose ?? meta.chartPreviousClose!;
      const pct = ((meta.regularMarketPrice - prev) / prev) * 100;
      return parseFloat(pct.toFixed(4));
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function GET() {
  const now = Date.now();

  if (_cache && now - _cache.ts < TTL_MS) {
    return NextResponse.json({
      changes:  _cache.changes,
      source:   "yahoo_finance",
      cachedAt: _cache.ts,
    });
  }

  const settled = await Promise.allSettled(
    PAIRS.map((p) => fetchChangePct(p.yfSymbol)),
  );

  const changes: Record<string, number> = {};
  let liveCount = 0;

  PAIRS.forEach(({ key }, idx) => {
    const r = settled[idx];
    if (r?.status === "fulfilled" && r.value !== null) {
      changes[key] = r.value;
      liveCount++;
    }
  });

  if (liveCount > 0) {
    _cache = { changes, ts: now };
  }

  const source = liveCount > 0 ? "yahoo_finance" : "fallback";
  logger.info({ endpoint: "/api/market/fx/change", liveCount, cached: false, status: 200 });

  const resp = NextResponse.json({ changes, source, cachedAt: now, liveCount });
  resp.headers.set(
    "Cache-Control",
    liveCount > 0 ? "s-maxage=60, stale-while-revalidate=30" : "no-store",
  );
  return resp;
}
