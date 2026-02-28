import { NextResponse } from "next/server";
import { fxRateCache } from "@/lib/market/cache";
import { buildFxRates, buildFallbackRates } from "@/lib/market/transforms";

const FH_KEY  = process.env.FINNHUB_API_KEY ?? "";
const FH_BASE = "https://finnhub.io/api/v1";
const CACHE_KEY = "fx_rates";
const TTL_MS = 60_000;

export async function GET() {
  const ts = Date.now();

  const cached = fxRateCache.get(CACHE_KEY);
  if (cached) {
    console.log(JSON.stringify({ ts, endpoint: "/api/market/fx/rates", duration_ms: 0, cached: true, status: 200 }));
    return NextResponse.json({ rates: cached, cachedAt: ts, source: "cache" });
  }

  if (!FH_KEY) {
    const rates = buildFallbackRates();
    console.log(JSON.stringify({ ts, endpoint: "/api/market/fx/rates", duration_ms: 0, cached: false, status: 200, source: "fallback", reason: "no_api_key" }));
    return NextResponse.json({ rates, cachedAt: ts, source: "fallback" });
  }

  const t0 = Date.now();
  try {
    const res = await fetch(`${FH_BASE}/forex/rates?base=USD&token=${FH_KEY}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`);

    const json = await res.json() as { base?: string; quote?: Record<string, number> };
    if (!json.quote || typeof json.quote !== "object") throw new Error("Invalid Finnhub response");

    const rates = buildFxRates(json.quote);
    fxRateCache.set(CACHE_KEY, rates, TTL_MS);

    const duration_ms = Date.now() - t0;
    console.log(JSON.stringify({ ts, endpoint: "/api/market/fx/rates", duration_ms, cached: false, status: 200, source: "finnhub" }));
    return NextResponse.json({ rates, cachedAt: ts, source: "finnhub" });
  } catch (err) {
    const duration_ms = Date.now() - t0;
    const rates = buildFallbackRates();
    console.log(JSON.stringify({ ts, endpoint: "/api/market/fx/rates", duration_ms, cached: false, status: 200, source: "fallback", error: String(err) }));
    return NextResponse.json({ rates, cachedAt: ts, source: "fallback" });
  }
}
