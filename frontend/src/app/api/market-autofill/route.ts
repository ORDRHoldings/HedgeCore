import { NextRequest, NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// FX Market Autofill — Finnhub forex/rates API
// POST /api/market-autofill
// Body: { currencies: string[], trade_value_dates?: string[] }
// Returns: MarketSnapshot-compatible market object
//
// Finnhub forex/rates: single call returns ALL USD pairs at once
// vs Alpha Vantage: required one call per currency pair
// Free tier: 60 req/min, no daily cap
// ─────────────────────────────────────────────────────────────────────────────

const FH_KEY  = process.env.FINNHUB_API_KEY ?? '';
const FH_BASE = 'https://finnhub.io/api/v1';

// Carry assumptions (bps/month) by currency — well-known EM/DM differentials
const CARRY_BPS_MONTH: Record<string, number> = {
  MXN: 48, BRL: 95, CLP: 18, COP: 32, TRY: 142, ZAR: 60,
  INR: 22, IDR: 35, PHP: 15, THB: 12, KRW: 8, TWD: 5,
  HUF: 25, PLN: 20, CZK: 18, RON: 22,
  EUR: -5, GBP: -2, CHF: -8, SEK: 3, NOK: 5, DKK: -5,
  JPY: -10, CAD: 2, AUD: 8, NZD: 10,
  CNY: 5, HKD: 1, SGD: 3, RUB: 120,
};

// Fallback demo spots (EOD 2026-02-27) — DXY/UUP confirmed ~99.11
const DEMO_SPOTS: Record<string, number> = {
  MXN: 20.35, BRL: 5.87, CLP: 972.0,  COP: 4278.0,
  EUR: 0.9263, GBP: 0.7921, CHF: 0.8981, SEK: 10.24, NOK: 10.87, DKK: 6.93,
  PLN: 4.08,  CZK: 23.10, HUF: 368.0,
  JPY: 150.40, CNY: 7.26, HKD: 7.78, KRW: 1435.0, SGD: 1.341, TWD: 32.48, INR: 86.50,
  AUD: 1.581, NZD: 1.728, CAD: 1.437,
  ZAR: 18.91, TRY: 36.20, RUB: 90.10,
};

// Fetch ALL forex rates in a single Finnhub call (base=USD)
async function fetchFinnhubForexRates(): Promise<Record<string, number> | null> {
  if (!FH_KEY) return null;
  try {
    const url = `${FH_BASE}/forex/rates?base=USD&token=${FH_KEY}`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const json = await res.json() as { base?: string; quote?: Record<string, number> };
    if (!json.quote || typeof json.quote !== 'object') return null;
    return json.quote;
  } catch {
    return null;
  }
}

function estimateForwardPoints(spot: number, currency: string, requiredBuckets?: string[]): Record<string, number> {
  const now = new Date();
  const buckets: Record<string, number> = {};
  const bpsPerMonth = CARRY_BPS_MONTH[currency] ?? 20;

  let maxMonths = 6;
  if (requiredBuckets && requiredBuckets.length > 0) {
    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth();
    for (const bucket of requiredBuckets) {
      const parts = bucket.split('-');
      if (parts.length >= 2) {
        const bYear = parseInt(parts[0], 10);
        const bMonth = parseInt(parts[1], 10) - 1;
        if (!isNaN(bYear) && !isNaN(bMonth)) {
          const monthsOut = (bYear - nowYear) * 12 + (bMonth - nowMonth);
          if (monthsOut > maxMonths) maxMonths = monthsOut;
        }
      }
    }
    maxMonths = Math.min(maxMonths + 1, 36);
  }

  for (let m = 1; m <= maxMonths; m++) {
    const d = new Date(now);
    d.setMonth(d.getMonth() + m);
    const bucket = d.toISOString().slice(0, 7);
    const pts = parseFloat((spot * (bpsPerMonth / 10000) * m).toFixed(4));
    buckets[bucket] = pts;
  }

  if (requiredBuckets) {
    for (const bucket of requiredBuckets) {
      if (!(bucket in buckets)) {
        const parts = bucket.split('-');
        if (parts.length >= 2) {
          const bYear = parseInt(parts[0], 10);
          const bMonth = parseInt(parts[1], 10) - 1;
          if (!isNaN(bYear) && !isNaN(bMonth)) {
            const nowYear = now.getFullYear();
            const nowMonth = now.getMonth();
            const monthsAgo = (nowYear - bYear) * 12 + (nowMonth - bMonth);
            const pts = parseFloat((spot * (bpsPerMonth / 10000) * Math.max(1, monthsAgo)).toFixed(4));
            buckets[bucket] = pts;
          }
        }
      }
    }
  }

  return buckets;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { currencies?: string[]; trade_value_dates?: string[] };
    const currencies: string[] = body.currencies ?? ['MXN'];
    const tradeValueDates: string[] = body.trade_value_dates ?? [];

    const requiredBuckets = [...new Set(
      tradeValueDates.map(d => d.slice(0, 7)).filter(b => /^\d{4}-\d{2}$/.test(b)),
    )];

    const primaryCurrency = currencies[0] ?? 'MXN';

    let spot: number | null = null;
    let spotSource = 'indicative_fallback';

    if (primaryCurrency !== 'USD') {
      const rates = await fetchFinnhubForexRates();
      if (rates && rates[primaryCurrency] && rates[primaryCurrency] > 0) {
        spot = parseFloat(rates[primaryCurrency].toFixed(6));
        spotSource = 'finnhub_live';
      }
    }

    if (spot === null) {
      spot = DEMO_SPOTS[primaryCurrency] ?? 1.0;
      spotSource = 'indicative_fallback';
    }

    const forwardPoints = estimateForwardPoints(spot, primaryCurrency, requiredBuckets);
    const asOf = new Date().toISOString().slice(0, 19) + 'Z';

    const INVERTED = new Set(['EUR', 'GBP', 'AUD', 'NZD', 'CHF']);
    const pairLabel = INVERTED.has(primaryCurrency) ? `${primaryCurrency}/USD` : `USD/${primaryCurrency}`;

    const market = {
      as_of: asOf,
      spot_usdmxn: spot,
      forward_points_by_month: forwardPoints,
      provider_metadata: {
        source: spotSource,
        data_class: spotSource === 'finnhub_live' ? 'LIVE' : 'INDICATIVE_FALLBACK',
        currency_pair: pairLabel,
        primary_currency: primaryCurrency,
        currencies_detected: currencies,
        note: spotSource === 'finnhub_live'
          ? `Live spot from Finnhub as of ${asOf}. Forward points estimated from carry differentials.`
          : `Indicative fallback rates — configure FINNHUB_API_KEY in .env.local for live data.`,
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
