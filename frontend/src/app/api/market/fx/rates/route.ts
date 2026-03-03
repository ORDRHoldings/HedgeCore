import { NextResponse } from "next/server";
import { fxRateCache } from "@/lib/market/cache";
import { buildFxRates, buildFallbackRates } from "@/lib/market/transforms";

// Primary: exchangerate-api.com (free, no key, ~170 currencies, updated hourly)
const ERA_URL    = "https://api.exchangerate-api.com/v4/latest/USD";
const CACHE_KEY  = "fx_rates";
const TTL_MS     = 60_000;

export async function GET() {
  const ts = Date.now();

  const cached = fxRateCache.get(CACHE_KEY);
  if (cached) {
    console.log(JSON.stringify({ ts, endpoint: "/api/market/fx/rates", duration_ms: 0, cached: true, status: 200 }));
    return NextResponse.json({ rates: cached, cachedAt: ts, source: "cache" });
  }

  const t0 = Date.now();
  try {
    const res = await fetch(ERA_URL, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`exchangerate-api HTTP ${res.status}`);

    const json = await res.json() as { base?: string; rates?: Record<string, number> };
    if (!json.rates || typeof json.rates !== "object") throw new Error("Invalid exchangerate-api response");

    const rates = buildFxRates(json.rates);
    fxRateCache.set(CACHE_KEY, rates, TTL_MS);

    const duration_ms = Date.now() - t0;
    console.log(JSON.stringify({ ts, endpoint: "/api/market/fx/rates", duration_ms, cached: false, status: 200, source: "live" }));
    return NextResponse.json({ rates, cachedAt: ts, source: "live" });
  } catch (err) {
    const duration_ms = Date.now() - t0;
    const rates = buildFallbackRates();
    console.log(JSON.stringify({ ts, endpoint: "/api/market/fx/rates", duration_ms, cached: false, status: 200, source: "fallback", error: String(err) }));
    return NextResponse.json({ rates, cachedAt: ts, source: "fallback" });
  }
}
