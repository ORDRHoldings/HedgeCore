import { NextRequest, NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// FX Market Autofill — IBKR backend (spot) + Finnhub CME futures (forwards)
// POST /api/market-autofill
// Body: { currencies: string[], trade_value_dates?: string[] }
// Returns: MarketSnapshot-compatible market object
//
// Spot rates:  IBKR backend (primary) -> exchangerate-api.com (fallback)
// Forward pts: Finnhub /quote?symbol={CME_SYMBOL} per contract (1!, 2!, 3!)
//              CME quarterly cycle: March / June / September / December
//              Prices are USD per 1 FCY -> invert to get FCY/USD forward rate
//              Forward points = forward_rate - spot
// Fallback:   Carry-differential estimates when CME data unavailable
// ─────────────────────────────────────────────────────────────────────────────

// IBKR backend (primary for spot)
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const FH_KEY  = process.env.FINNHUB_API_KEY ?? '';
const FH_BASE = 'https://finnhub.io/api/v1';

// Primary spot-rate source (fallback): exchangerate-api.com (free, no key, ~170 currencies)
const ERA_URL = 'https://api.exchangerate-api.com/v4/latest/USD';

// ── CME FX futures symbol mapping ─────────────────────────────────────────
// Finnhub uses the continuous contract notation (1! = front month, 2! = back month, ...)
// All prices are quoted in USD per 1 unit of FCY (invert to get FCY/USD rate)
// CME quarterly expiry cycle: March (H), June (M), September (U), December (Z)
const CME_SYMBOLS: Record<string, string[]> = {
  MXN: ['MXN1!', 'MXN2!', 'MXN3!'], // Mexican Peso
  EUR: ['6E1!',  '6E2!',  '6E3!'],   // Euro FX
  GBP: ['6B1!',  '6B2!',  '6B3!'],   // British Pound
  JPY: ['6J1!',  '6J2!',  '6J3!'],   // Japanese Yen
  CAD: ['6C1!',  '6C2!',  '6C3!'],   // Canadian Dollar
  AUD: ['6A1!',  '6A2!',  '6A3!'],   // Australian Dollar
  CHF: ['6S1!',  '6S2!',  '6S3!'],   // Swiss Franc
  NZD: ['6N1!',  '6N2!',  '6N3!'],   // New Zealand Dollar
  BRL: ['BRL1!', 'BRL2!'],            // Brazilian Real
  CNH: ['CNH1!', 'CNH2!'],            // Chinese Yuan (offshore)
};


// ── Fetch spot rate from IBKR backend for a single currency pair ──────────
async function fetchIbkrSpotRate(currency: string): Promise<number | null> {
  try {
    const pair = `USD${currency}`;
    const res = await fetch(
      `${API_BASE}/api/v1/market-data/live/fx-rates?pairs=${encodeURIComponent(pair)}`,
      {
        signal: AbortSignal.timeout(5_000),
        headers: { 'Content-Type': 'application/json' },
      },
    );
    if (!res.ok) return null;

    const json = await res.json() as {
      rates?: Array<{ symbol: string; bid?: number; ask?: number; mid: number }>;
      source?: string;
    };

    if (!json.rates || !Array.isArray(json.rates) || json.rates.length === 0) return null;

    // Find the matching rate — handle both USDMXN and MXNUSD conventions
    const INVERTED = new Set(['EUR', 'GBP', 'AUD', 'NZD']);
    for (const rate of json.rates) {
      if (rate.mid && rate.mid > 0) {
        if (INVERTED.has(currency)) {
          // For EURUSD: IBKR mid might be the market convention (1.08 = USD per EUR)
          // We need CCY/USD (0.9263 = EUR per USD). But it depends on what symbol
          // the backend returns. If symbol is "EURUSD", mid is USD/EUR -> invert.
          // If symbol is "USDEUR", mid is EUR/USD -> use directly.
          if (rate.symbol?.startsWith('USD')) {
            return parseFloat(rate.mid.toFixed(6));
          }
          // Symbol is like EURUSD -> mid is USD per EUR -> invert to get EUR per USD
          return parseFloat((1 / rate.mid).toFixed(6));
        }
        // For non-inverted (USDMXN): mid is MXN per USD -> use directly
        return parseFloat(rate.mid.toFixed(6));
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ── Fetch all forex spot rates from exchangerate-api.com (free, no key) ──
async function fetchLiveForexRates(): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(ERA_URL, { cache: 'no-store', signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const json = await res.json() as { base?: string; rates?: Record<string, number> };
    if (!json.rates || typeof json.rates !== 'object') return null;
    return json.rates;
  } catch {
    return null;
  }
}

// ── Fetch a single CME futures quote from Finnhub ─────────────────────────
async function fetchCMEQuote(symbol: string): Promise<number | null> {
  if (!FH_KEY) return null;
  try {
    const url = `${FH_BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${FH_KEY}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json() as { c?: number; pc?: number };
    // Use current price; fall back to previous close if market closed
    const price = typeof json.c === 'number' && json.c > 0 ? json.c
      : typeof json.pc === 'number' && json.pc > 0 ? json.pc
      : null;
    return price;
  } catch {
    return null;
  }
}

// ── Compute next N CME quarterly expiry buckets from a given date ──────────
// CME FX quarterly cycle: March (3), June (6), September (9), December (12)
function getNextCMEQuarters(from: Date, count: number): string[] {
  const QUARTERLY_MONTHS = [3, 6, 9, 12];
  const results: string[] = [];
  const year = from.getFullYear();
  const month = from.getMonth() + 1; // 1-based

  for (let offset = 0; results.length < count && offset < 24; offset++) {
    const qMonth = QUARTERLY_MONTHS[offset % 4];
    const qYear  = year + Math.floor(offset / 4);
    // Only include future quarters (strictly after current month)
    if (qYear > year || (qYear === year && qMonth > month)) {
      results.push(`${qYear}-${String(qMonth).padStart(2, '0')}`);
    }
  }
  return results;
}

// ── Interpolate forward rate for any bucket from contract anchor points ────
function interpolateForwardRate(
  targetBucket: string,
  spot: number,
  contracts: { monthsOut: number; forwardRate: number }[],
  now: Date,
): number {
  function bucketToMonths(b: string): number {
    const [y, m] = b.split('-').map(Number);
    return (y - now.getFullYear()) * 12 + (m - (now.getMonth() + 1));
  }

  const tm = bucketToMonths(targetBucket);
  if (tm <= 0) return spot;

  const sorted = [...contracts].sort((a, b) => a.monthsOut - b.monthsOut);
  if (sorted.length === 0) return spot;

  // Before first contract: interpolate from spot (0 months) to first contract
  if (tm <= sorted[0].monthsOut) {
    const t = tm / sorted[0].monthsOut;
    return spot + t * (sorted[0].forwardRate - spot);
  }

  // Beyond last contract: linear extrapolation from last two points
  const last = sorted[sorted.length - 1];
  if (tm >= last.monthsOut) {
    if (sorted.length >= 2) {
      const prev = sorted[sorted.length - 2];
      const slope = (last.forwardRate - prev.forwardRate) / (last.monthsOut - prev.monthsOut);
      return last.forwardRate + slope * (tm - last.monthsOut);
    }
    return last.forwardRate;
  }

  // Between two contracts: linear interpolation
  for (let i = 0; i < sorted.length - 1; i++) {
    if (tm >= sorted[i].monthsOut && tm <= sorted[i + 1].monthsOut) {
      const t = (tm - sorted[i].monthsOut) / (sorted[i + 1].monthsOut - sorted[i].monthsOut);
      return sorted[i].forwardRate + t * (sorted[i + 1].forwardRate - sorted[i].forwardRate);
    }
  }
  return last.forwardRate;
}

// ── Build forward points from CME futures (primary method) ────────────────
// Returns null if CME data unavailable for this currency
async function buildCMEForwardPoints(
  currency: string,
  spot: number,
  requiredBuckets: string[],
  maxMonths: number,
): Promise<{ points: Record<string, number>; source: 'cme_futures' } | null> {
  const symbols = CME_SYMBOLS[currency];
  if (!symbols || !FH_KEY) return null;

  const now = new Date();
  const quarterlyBuckets = getNextCMEQuarters(now, symbols.length);

  // Fetch all available contract quotes in parallel
  const fetchResults = await Promise.all(
    symbols.map((sym, i) =>
      fetchCMEQuote(sym).then(price => ({ price, bucket: quarterlyBuckets[i] ?? null })),
    ),
  );

  // Convert futures prices (USD/FCY) to FCY/USD forward rates
  const contracts: { monthsOut: number; forwardRate: number; bucket: string }[] = [];
  for (const { price, bucket } of fetchResults) {
    if (price === null || price <= 0 || !bucket) continue;
    // All CME FX futures are priced in USD per 1 unit of FCY -> invert to FCY/USD
    const forwardRate = 1 / price;
    const [y, m] = bucket.split('-').map(Number);
    const monthsOut = (y - now.getFullYear()) * 12 + (m - (now.getMonth() + 1));
    if (monthsOut > 0) {
      contracts.push({ monthsOut, forwardRate, bucket });
    }
  }

  if (contracts.length === 0) return null;

  // Build points for all required + standard buckets
  const allBuckets = new Set(requiredBuckets);
  for (let m = 1; m <= Math.max(maxMonths, 12); m++) {
    const d = new Date(now);
    d.setMonth(d.getMonth() + m);
    allBuckets.add(d.toISOString().slice(0, 7));
  }

  const points: Record<string, number> = {};
  for (const bucket of allBuckets) {
    const fwdRate = interpolateForwardRate(bucket, spot, contracts, now);
    points[bucket] = parseFloat((fwdRate - spot).toFixed(4));
  }

  return { points, source: 'cme_futures' };
}


// ── Request handler ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { currencies?: string[]; trade_value_dates?: string[] };
    const currencies: string[]     = body.currencies        ?? ['MXN'];
    const tradeValueDates: string[] = body.trade_value_dates ?? [];

    const requiredBuckets = [...new Set(
      tradeValueDates.map(d => d.slice(0, 7)).filter(b => /^\d{4}-\d{2}$/.test(b)),
    )];

    // Compute max months needed from required buckets
    const now = new Date();
    let maxMonths = 12;
    for (const bucket of requiredBuckets) {
      const [y, m] = bucket.split('-').map(Number);
      if (!isNaN(y) && !isNaN(m)) {
        const mOut = (y - now.getFullYear()) * 12 + (m - (now.getMonth() + 1));
        if (mOut > maxMonths) maxMonths = mOut;
      }
    }

    const primaryCurrency = currencies[0] ?? 'MXN';

    // ── Step 1: Spot rate — IBKR (primary) -> exchangerate-api.com (fallback)
    let spot: number | null = null;
    let spotSource = 'indicative_fallback';

    if (primaryCurrency !== 'USD') {
      // Try IBKR backend first
      const ibkrSpot = await fetchIbkrSpotRate(primaryCurrency);
      if (ibkrSpot !== null && ibkrSpot > 0) {
        spot = ibkrSpot;
        spotSource = 'ibkr';
      }

      // Fallback to exchangerate-api.com
      if (spot === null) {
        const rates = await fetchLiveForexRates();
        if (rates && rates[primaryCurrency] && rates[primaryCurrency] > 0) {
          spot = parseFloat(rates[primaryCurrency].toFixed(6));
          spotSource = 'live';
        }
      }
    }

    if (spot === null) {
      return NextResponse.json(
        { error: 'Spot rate unavailable', detail: 'IBKR and exchangerate-api.com both unreachable. Configure a live data provider.' },
        { status: 503 },
      );
    }

    // ── Step 2: Forward points from CME futures ──────────────────────────
    let forwardPoints: Record<string, number>;
    let forwardSource: 'cme_futures' | 'unavailable' = 'unavailable';

    const cmeResult = await buildCMEForwardPoints(primaryCurrency, spot, requiredBuckets, maxMonths);

    if (cmeResult !== null) {
      forwardPoints = cmeResult.points;
      forwardSource = 'cme_futures';
    } else {
      // No live forward data — return empty rather than hardcoded estimates
      forwardPoints = {};
    }

    // ── Step 3: Assemble market snapshot ────────────────────────────────
    const asOf = new Date().toISOString().slice(0, 19) + 'Z';
    const INVERTED = new Set(['EUR', 'GBP', 'AUD', 'NZD', 'CHF']);
    const pairLabel = INVERTED.has(primaryCurrency)
      ? `${primaryCurrency}/USD`
      : `USD/${primaryCurrency}`;

    const dataClass = 'LIVE';

    let note: string;
    if (spotSource === 'ibkr') {
      if (forwardSource === 'cme_futures') {
        note = `Live spot from IBKR. Forward rates from CME futures (${(CME_SYMBOLS[primaryCurrency] ?? []).join(', ')}).`;
      } else {
        note = `Live spot from IBKR. No CME forward data available — set FINNHUB_API_KEY for forward curves.`;
      }
    } else if (forwardSource === 'cme_futures') {
      note = `Live spot from exchangerate-api.com. Forward rates from CME futures (${(CME_SYMBOLS[primaryCurrency] ?? []).join(', ')}).`;
    } else {
      note = `Live spot from exchangerate-api.com. No CME forward data available — set FINNHUB_API_KEY for forward curves.`;
    }

    const market = {
      as_of: asOf,
      spot_rate: spot,
      forward_points_by_month: forwardPoints,
      provider_metadata: {
        source:              `${spotSource}_${forwardSource}`,
        data_class:          dataClass,
        spot_source:         spotSource,
        forward_source:      forwardSource,
        cme_symbols:         CME_SYMBOLS[primaryCurrency] ?? [],
        currency_pair:       pairLabel,
        primary_currency:    primaryCurrency,
        currencies_detected: currencies,
        note,
      },
    };

    return NextResponse.json({ market, currencies_detected: currencies });
  } catch (err) {
    return NextResponse.json(
      { error: 'Market autofill failed', detail: String(err) },
      { status: 500 },
    );
  }
}
