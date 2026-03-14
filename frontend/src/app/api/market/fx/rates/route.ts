import { NextResponse } from "next/server";
import { fxRateCache } from "@/lib/market/cache";
import { buildFxRates, buildFallbackRates, FX_TARGET_PAIRS } from "@/lib/market/transforms";
import { logger } from "@/lib/logger";

// IBKR backend (primary)
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Fallback: exchangerate-api.com (free, no key, ~170 currencies, updated hourly)
const ERA_URL    = "https://api.exchangerate-api.com/v4/latest/USD";
const CACHE_KEY  = "fx_rates";
const IBKR_CACHE_KEY = "fx_rates_ibkr";
const TTL_MS     = 60_000;

/**
 * Convert IBKR live rates response to the USD-based quote record that
 * buildFxRates() expects: { MXN: 20.35, EUR: 0.9263, ... }
 *
 * IBKR returns: { rates: [{ symbol: "USDMXN", bid, ask, mid }], ... }
 * buildFxRates() expects: Record<string, number> keyed by currency code
 * where value is the USD-based rate (same as exchangerate-api: USD/CCY).
 *
 * For inverted pairs (EURUSD = EUR per 1 USD on IBKR side, but mid is
 * actually the market convention rate), we need to invert to get the
 * exchangerate-api convention (USD per 1 FCY for EUR/GBP/AUD, or
 * FCY per 1 USD for MXN/JPY/etc). Actually, buildFxRates handles
 * inversion internally via the `invert` flag on FX_TARGET_PAIRS.
 * exchangerate-api returns: { EUR: 0.9263, MXN: 20.35, JPY: 150.4, ... }
 * i.e., how many units of CCY per 1 USD for all currencies.
 * So we need to convert IBKR symbols to that convention.
 */
function ibkrRatesToQuoteRecord(
  ibkrRates: Array<{ symbol: string; bid: number; ask: number; mid: number; spread?: number }>,
): Record<string, number> | null {
  if (!ibkrRates || ibkrRates.length === 0) return null;

  const quote: Record<string, number> = {};

  for (const rate of ibkrRates) {
    if (!rate.symbol || !rate.mid || rate.mid <= 0) continue;

    // Match IBKR symbol to our pair definitions
    const pairDef = FX_TARGET_PAIRS.find((p) => p.symbol === rate.symbol);
    if (!pairDef) continue;

    // exchangerate-api convention: all rates are "how many CCY per 1 USD"
    // For USDMXN (invert=false): mid IS already CCY/USD -> use directly
    // For EURUSD (invert=true): mid is USD/CCY market convention -> invert to get CCY/USD
    if (pairDef.invert) {
      // EURUSD mid = 1.08 means 1 EUR = 1.08 USD. exchangerate-api EUR = 0.9263 (1/1.08)
      quote[pairDef.quoteKey] = 1 / rate.mid;
    } else {
      // USDMXN mid = 20.35 means 1 USD = 20.35 MXN. exchangerate-api MXN = 20.35
      quote[pairDef.quoteKey] = rate.mid;
    }
  }

  return Object.keys(quote).length > 0 ? quote : null;
}

export async function GET() {
  const ts = Date.now();

  // Serve from cache (IBKR or ERA)
  const cachedIbkr = fxRateCache.get(IBKR_CACHE_KEY);
  if (cachedIbkr) {
    logger.info({ endpoint: "/api/market/fx/rates", duration_ms: 0, cached: true, status: 200, source: "ibkr" });
    return NextResponse.json({ rates: cachedIbkr, cachedAt: ts, source: "ibkr" });
  }

  const cached = fxRateCache.get(CACHE_KEY);
  if (cached) {
    logger.info({ endpoint: "/api/market/fx/rates", duration_ms: 0, cached: true, status: 200 });
    return NextResponse.json({ rates: cached, cachedAt: ts, source: "cache" });
  }

  // ── Primary: IBKR backend ─────────────────────────────────────────────────
  const t0 = Date.now();
  try {
    const pairs = FX_TARGET_PAIRS.map((p) => p.symbol).join(",");
    const ibkrRes = await fetch(
      `${API_BASE}/api/v1/market-data/live/fx-rates?pairs=${encodeURIComponent(pairs)}`,
      {
        signal: AbortSignal.timeout(5_000),
        headers: { "Content-Type": "application/json" },
      },
    );
    if (ibkrRes.ok) {
      const ibkrJson = await ibkrRes.json() as {
        rates?: Array<{ symbol: string; bid: number; ask: number; mid: number; spread?: number }>;
        source?: string;
        connected?: boolean;
      };
      if (ibkrJson.rates && Array.isArray(ibkrJson.rates) && ibkrJson.rates.length > 0) {
        const quoteRecord = ibkrRatesToQuoteRecord(ibkrJson.rates);
        if (quoteRecord) {
          const rates = buildFxRates(quoteRecord);
          fxRateCache.set(IBKR_CACHE_KEY, rates, TTL_MS);

          const duration_ms = Date.now() - t0;
          logger.info({ endpoint: "/api/market/fx/rates", duration_ms, cached: false, status: 200, source: "ibkr" });
          return NextResponse.json({ rates, cachedAt: ts, source: "ibkr" });
        }
      }
    }
  } catch {
    // IBKR unavailable — fall through to exchangerate-api
  }

  // ── Fallback: exchangerate-api.com ─────────────────────────────────────────
  const t1 = Date.now();
  try {
    const res = await fetch(ERA_URL, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`exchangerate-api HTTP ${res.status}`);

    const json = await res.json() as { base?: string; rates?: Record<string, number> };
    if (!json.rates || typeof json.rates !== "object") throw new Error("Invalid exchangerate-api response");

    const rates = buildFxRates(json.rates);
    fxRateCache.set(CACHE_KEY, rates, TTL_MS);

    const duration_ms = Date.now() - t1;
    logger.info({ endpoint: "/api/market/fx/rates", duration_ms, cached: false, status: 200, source: "live" });
    return NextResponse.json({ rates, cachedAt: ts, source: "live" });
  } catch (err) {
    const duration_ms = Date.now() - t1;
    const rates = buildFallbackRates();
    logger.info({ endpoint: "/api/market/fx/rates", duration_ms, cached: false, status: 200, source: "fallback", error: String(err) });
    return NextResponse.json({ rates, cachedAt: ts, source: "fallback" });
  }
}
