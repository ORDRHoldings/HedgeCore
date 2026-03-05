/**
 * /api/market/macro — Live macro snapshot: DXY, VIX, US 10Y, Brent, Gold
 *
 * Fetches from Yahoo Finance v8/finance/chart (same endpoint as geo-news).
 * Fed Funds rate is static (FOMC target, updated per meeting).
 * Cache: 5-minute in-memory TTL.
 */

import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

// ─── In-memory cache ──────────────────────────────────────────────────────────
const TTL_MS = 300_000; // 5 min
let _cache: { data: Record<string, MacroItem>; ts: number } | null = null;

// ─── Types ────────────────────────────────────────────────────────────────────
interface MacroItem {
  label:   string;
  value:   number;
  display: string;
  maxRef:  number;
  trend:   "up" | "down" | "flat";
  context: string;
  unit:    string;
  note?:   string;
}

interface YFChartMeta {
  regularMarketPrice?:  number;
  previousClose?:       number;
  chartPreviousClose?:  number;
  regularMarketTime?:   number;
}
interface YFChartResponse {
  chart?: { result?: Array<{ meta?: YFChartMeta }>; error?: unknown };
}

// ─── Symbol definitions ───────────────────────────────────────────────────────
type SymbolDef = {
  yfSymbol: string;
  label:    string;
  unit:     string;
  maxRef:   number;
  context:  string;
  fmt:      (v: number) => string;
};

const SYMBOLS: SymbolDef[] = [
  {
    yfSymbol: "DX-Y.NYB",
    label:    "DXY INDEX",
    unit:     "",
    maxRef:   120,
    context:  "USD dollar index vs basket of 6 majors",
    fmt:      (v) => v.toFixed(2),
  },
  {
    yfSymbol: "%5EVIX",
    label:    "VIX",
    unit:     "",
    maxRef:   45,
    context:  "Cboe Volatility Index — implied S&P 500 volatility",
    fmt:      (v) => v.toFixed(1),
  },
  {
    yfSymbol: "%5ETNX",
    label:    "US 10Y",
    unit:     "%",
    maxRef:   6,
    context:  "US 10-year Treasury yield",
    fmt:      (v) => v.toFixed(2) + "%",
  },
  {
    yfSymbol: "BZ%3DF",
    label:    "BRENT",
    unit:     "$",
    maxRef:   120,
    context:  "Brent crude oil futures (ICE)",
    fmt:      (v) => "$" + v.toFixed(2),
  },
  {
    yfSymbol: "GC%3DF",
    label:    "GOLD",
    unit:     "$",
    maxRef:   3500,
    context:  "Gold futures (COMEX) — safe-haven demand",
    fmt:      (v) => "$" + Math.round(v).toLocaleString("en-US"),
  },
];

// Fed Funds: FOMC sets this ~8× per year; updated here per decision
const FED_FUNDS_STATIC: MacroItem = {
  label:   "FED FUNDS",
  value:   4.33,
  display: "4.33%",
  maxRef:  6,
  trend:   "flat",
  context: "FOMC target range 4.25–4.50% · data-dependent hold",
  unit:    "%",
  note:    "FOMC target rate",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const YF_HEADERS: HeadersInit = {
  "User-Agent": "Mozilla/5.0 (compatible; InstitutionalMacroBot/1.0)",
  Accept: "application/json, */*",
};

async function fetchYFQuote(
  yfSymbol: string,
): Promise<{ price: number; prevClose: number; ts: number } | null> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${yfSymbol}` +
    `?interval=1d&range=2d`;
  try {
    const res = await fetch(url, {
      headers: YF_HEADERS,
      signal: AbortSignal.timeout(7_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as YFChartResponse;
    const meta = json.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    return {
      price:     meta.regularMarketPrice,
      prevClose: meta.previousClose ?? meta.chartPreviousClose ?? meta.regularMarketPrice,
      ts:        meta.regularMarketTime ?? Math.floor(Date.now() / 1_000),
    };
  } catch {
    return null;
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export async function GET() {
  const now = Date.now();

  if (_cache && now - _cache.ts < TTL_MS) {
    return NextResponse.json({
      macroData:  _cache.data,
      dataSource: "live",
      asOf:       new Date(_cache.ts).toISOString().slice(0, 10),
      cachedAt:   _cache.ts,
    });
  }

  const settled = await Promise.allSettled(
    SYMBOLS.map((s) => fetchYFQuote(s.yfSymbol)),
  );

  let liveCount = 0;
  const macroData: Record<string, MacroItem> = {};

  SYMBOLS.forEach(({ label, unit, maxRef, context, fmt }, idx) => {
    const r = settled[idx];
    if (r?.status === "fulfilled" && r.value) {
      const { price, prevClose, ts: qTs } = r.value;
      const trend: "up" | "down" | "flat" =
        price > prevClose * 1.0001 ? "up" :
        price < prevClose * 0.9999 ? "down" : "flat";
      macroData[label] = {
        label,
        value:   price,
        display: fmt(price),
        maxRef,
        trend,
        context,
        unit,
        note: `live as of ${new Date(qTs * 1_000).toISOString().slice(0, 10)}`,
      };
      liveCount++;
    }
  });

  // Fed Funds is always included (static FOMC rate)
  macroData["FED FUNDS"] = FED_FUNDS_STATIC;

  const dataSource = liveCount > 0 ? "live" : "fallback";
  const asOf = new Date(now).toISOString().slice(0, 10);

  if (liveCount > 0) {
    _cache = { data: macroData, ts: now };
  }

  logger.info({ endpoint: "/api/market/macro", liveCount, cached: false, status: 200 });

  const resp = NextResponse.json({
    macroData,
    dataSource,
    asOf,
    cachedAt: now,
    liveCount,
  });
  resp.headers.set(
    "Cache-Control",
    liveCount > 0
      ? "s-maxage=300, stale-while-revalidate=60"
      : "no-store",
  );
  return resp;
}
