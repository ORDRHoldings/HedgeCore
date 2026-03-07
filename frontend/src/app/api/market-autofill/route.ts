import { NextRequest, NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// FX Market Autofill — Finnhub forex/rates (spot) + CME futures (forwards)
// POST /api/market-autofill
// Body: { currencies: string[], trade_value_dates?: string[] }
// Returns: MarketSnapshot-compatible market object
//
// Spot rates:  Finnhub /forex/rates?base=USD (single call, all currencies)
// Forward pts: Finnhub /quote?symbol={CME_SYMBOL} per contract (1!, 2!, 3!)
//              CME quarterly cycle: March / June / September / December
//              Prices are USD per 1 FCY → invert to get FCY/USD forward rate
//              Forward points = forward_rate - spot
// Fallback:   Carry-differential estimates when CME data unavailable
// ─────────────────────────────────────────────────────────────────────────────

const FH_KEY  = process.env.FINNHUB_API_KEY ?? '';
const FH_BASE = 'https://finnhub.io/api/v1';

// Primary spot-rate source: exchangerate-api.com (free, no key, ~170 currencies)
const ERA_URL = 'https://api.exchangerate-api.com/v4/latest/USD';

// ── CME FX futures symbol mapping ─────────────────────────────────────────
// Finnhub uses the continuous contract notation (1! = front month, 2! = back month, …)
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

// ── Carry assumptions (bps/month) — fallback for non-CME currencies ───────
const CARRY_BPS_MONTH: Record<string, number> = {
  MXN: 48,  BRL: 95,  CLP: 18,  COP: 32,  TRY: 142, ZAR: 60,
  INR: 22,  IDR: 35,  PHP: 15,  THB: 12,  KRW: 8,   TWD: 5,
  HUF: 25,  PLN: 20,  CZK: 18,  RON: 22,
  EUR: -5,  GBP: -2,  CHF: -8,  SEK: 3,   NOK: 5,   DKK: -5,
  JPY: -10, CAD: 2,   AUD: 8,   NZD: 10,
  CNY: 5,   HKD: 1,   SGD: 3,   RUB: 120,
};

// ── Fallback demo spots (EOD 2026-02-27, DXY ~99.11) ─────────────────────
const DEMO_SPOTS: Record<string, number> = {
  MXN: 20.35, BRL: 5.87,  CLP: 972.0,  COP: 4278.0,
  EUR: 0.9263, GBP: 0.7921, CHF: 0.8981, SEK: 10.24, NOK: 10.87, DKK: 6.93,
  PLN: 4.08,  CZK: 23.10, HUF: 368.0,
  JPY: 150.40, CNY: 7.26, HKD: 7.78,  KRW: 1435.0, SGD: 1.341, TWD: 32.48, INR: 86.50,
  AUD: 1.581, NZD: 1.728, CAD: 1.437,
  ZAR: 18.91, TRY: 36.20, RUB: 90.10,
};

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
    // All CME FX futures are priced in USD per 1 unit of FCY → invert to FCY/USD
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

// ── Carry-based forward estimation (fallback) ─────────────────────────────
function estimateForwardPoints(spot: number, currency: string, requiredBuckets: string[]): Record<string, number> {
  const now = new Date();
  const buckets: Record<string, number> = {};
  const bpsPerMonth = CARRY_BPS_MONTH[currency] ?? 20;

  let maxMonths = 12;
  if (requiredBuckets.length > 0) {
    for (const bucket of requiredBuckets) {
      const [y, m] = bucket.split('-').map(Number);
      if (!isNaN(y) && !isNaN(m)) {
        const mOut = (y - now.getFullYear()) * 12 + (m - (now.getMonth() + 1));
        if (mOut > maxMonths) maxMonths = mOut;
      }
    }
    maxMonths = Math.min(maxMonths + 1, 36);
  }

  for (let m = 1; m <= maxMonths; m++) {
    const d = new Date(now);
    d.setMonth(d.getMonth() + m);
    const bucket = d.toISOString().slice(0, 7);
    buckets[bucket] = parseFloat((spot * (bpsPerMonth / 10000) * m).toFixed(4));
  }

  for (const bucket of requiredBuckets) {
    if (!(bucket in buckets)) {
      const [y, m] = bucket.split('-').map(Number);
      if (!isNaN(y) && !isNaN(m)) {
        const mAgo = Math.max(1, (now.getFullYear() - y) * 12 + ((now.getMonth() + 1) - m));
        buckets[bucket] = parseFloat((spot * (bpsPerMonth / 10000) * mAgo).toFixed(4));
      }
    }
  }

  return buckets;
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

    // ── Step 1: Spot rate from exchangerate-api.com (live, free) ────────
    let spot: number | null = null;
    let spotSource = 'indicative_fallback';

    if (primaryCurrency !== 'USD') {
      const rates = await fetchLiveForexRates();
      if (rates && rates[primaryCurrency] && rates[primaryCurrency] > 0) {
        spot = parseFloat(rates[primaryCurrency].toFixed(6));
        spotSource = 'live';
      }
    }

    if (spot === null) {
      spot = DEMO_SPOTS[primaryCurrency] ?? 1.0;
      spotSource = 'indicative_fallback';
    }

    // ── Step 2: Forward points from CME futures (preferred) ─────────────
    let forwardPoints: Record<string, number>;
    let forwardSource: 'cme_futures' | 'carry_estimate' | 'indicative_fallback' = 'carry_estimate';

    const cmeResult = await buildCMEForwardPoints(primaryCurrency, spot, requiredBuckets, maxMonths);

    if (cmeResult !== null) {
      forwardPoints = cmeResult.points;
      forwardSource = 'cme_futures';
    } else {
      forwardPoints = estimateForwardPoints(spot, primaryCurrency, requiredBuckets);
      forwardSource = spotSource === 'live' ? 'carry_estimate' : 'indicative_fallback';
    }

    // ── Step 3: Assemble market snapshot ────────────────────────────────
    const asOf = new Date().toISOString().slice(0, 19) + 'Z';
    const INVERTED = new Set(['EUR', 'GBP', 'AUD', 'NZD', 'CHF']);
    const pairLabel = INVERTED.has(primaryCurrency)
      ? `${primaryCurrency}/USD`
      : `USD/${primaryCurrency}`;

    const isLive = spotSource === 'live';
    const dataClass = isLive ? 'LIVE' : 'INDICATIVE_FALLBACK';

    let note: string;
    if (!isLive) {
      note = 'Indicative fallback rates (BIS EOD 2026-02-27) — exchangerate-api.com unreachable.';
    } else if (forwardSource === 'cme_futures') {
      note = `Live spot from exchangerate-api.com. Forward rates from CME futures (${(CME_SYMBOLS[primaryCurrency] ?? []).join(', ')}).`;
    } else {
      note = `Live spot from exchangerate-api.com. Forward points estimated from carry differentials.`;
    }

    const market = {
      as_of: asOf,
      spot_rate: spot,
      forward_points_by_month: forwardPoints,
      provider_metadata: {
        source:              isLive ? `live_${forwardSource}` : 'indicative_fallback',
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
