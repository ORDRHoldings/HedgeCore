/**
 * /api/market/fx/change — 24-hour % change for 8 major FX pairs
 *
 * Primary: IBKR backend. Fallback: Yahoo Finance.
 * Returns { changes: Record<string, number> } keyed by symbol (e.g. "EURUSD").
 * Cache: 60-second in-memory TTL.
 */

import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

// IBKR backend (primary)
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── In-memory cache ──────────────────────────────────────────────────────────
const TTL_MS = 60_000; // 60 s
let _ibkrCache: { changes: Record<string, number>; ts: number } | null = null;
let _cache: { changes: Record<string, number>; ts: number } | null = null;

// ─── Pairs ────────────────────────────────────────────────────────────────────
// yfSymbol is URL-encoded for use in path: = -> %3D
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

/**
 * Fetch 24h FX changes from IBKR backend.
 * Expected response: { changes: Record<string, number>, source, ... }
 */
async function fetchIbkrFxChanges(): Promise<Record<string, number> | null> {
  try {
    const pairs = PAIRS.map((p) => p.key).join(",");
    const res = await fetch(
      `${API_BASE}/api/v1/market-data/live/fx-change?pairs=${encodeURIComponent(pairs)}`,
      {
        signal: AbortSignal.timeout(5_000),
        headers: { "Content-Type": "application/json" },
      },
    );
    if (!res.ok) return null;

    const json = await res.json() as {
      changes?: Record<string, number>;
      source?: string;
    };

    if (!json.changes || typeof json.changes !== "object") return null;

    // Validate we got at least some pairs back
    const validCount = PAIRS.filter((p) => typeof json.changes![p.key] === "number").length;
    return validCount > 0 ? json.changes : null;
  } catch {
    return null;
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function GET() {
  const now = Date.now();

  // Serve from IBKR cache first, then Yahoo cache
  if (_ibkrCache && now - _ibkrCache.ts < TTL_MS) {
    return NextResponse.json({
      changes:  _ibkrCache.changes,
      source:   "ibkr",
      cachedAt: _ibkrCache.ts,
    });
  }

  if (_cache && now - _cache.ts < TTL_MS) {
    return NextResponse.json({
      changes:  _cache.changes,
      source:   "yahoo_finance",
      cachedAt: _cache.ts,
    });
  }

  // ── Primary: IBKR backend ─────────────────────────────────────────────────
  const ibkrChanges = await fetchIbkrFxChanges();
  if (ibkrChanges) {
    _ibkrCache = { changes: ibkrChanges, ts: now };
    logger.info({ endpoint: "/api/market/fx/change", liveCount: Object.keys(ibkrChanges).length, cached: false, status: 200, source: "ibkr" });

    const resp = NextResponse.json({ changes: ibkrChanges, source: "ibkr", cachedAt: now, liveCount: Object.keys(ibkrChanges).length });
    resp.headers.set("Cache-Control", "s-maxage=60, stale-while-revalidate=30");
    return resp;
  }

  // ── Fallback: Yahoo Finance ────────────────────────────────────────────────
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
