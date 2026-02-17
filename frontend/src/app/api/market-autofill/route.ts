import { NextRequest, NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Alpha Vantage Market Autofill API Route
// POST /api/market-autofill
// Body: { currencies: string[] }   e.g. ["MXN", "EUR", "BRL"]
// Returns: MarketSnapshot-compatible market object
// ─────────────────────────────────────────────────────────────────────────────

const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY ?? '';
const AV_BASE = 'https://www.alphavantage.co/query';

// For currencies not directly available vs USD, we fetch available pairs
// Alpha Vantage FX endpoint: CURRENCY_EXCHANGE_RATE
async function fetchSpot(from: string, to: string): Promise<number | null> {
  if (!AV_KEY || AV_KEY === 'YOUR_ALPHA_VANTAGE_KEY_HERE') return null;
  try {
    const url = `${AV_BASE}?function=CURRENCY_EXCHANGE_RATE&from_currency=${from}&to_currency=${to}&apikey=${AV_KEY}`;
    const res = await fetch(url, { next: { revalidate: 300 } }); // cache 5 min
    if (!res.ok) return null;
    const json = await res.json();
    const rate = json?.['Realtime Currency Exchange Rate']?.['5. Exchange Rate'];
    return rate ? parseFloat(rate) : null;
  } catch {
    return null;
  }
}

// Approximate forward points from interest rate differential using covered interest parity
// fwd = spot × (1 + r_quote × T) / (1 + r_base × T) − spot
// We approximate using AV FX_DAILY as a proxy for carry; here we use demo fallbacks for now
function estimateForwardPoints(spot: number, currency: string): Record<string, number> {
  // Carry assumptions (bps/month) by currency — well-known EM/DM differentials
  const CARRY_BPS_MONTH: Record<string, number> = {
    MXN: 48, BRL: 95, CLP: 18, COP: 32, TRY: 142, ZAR: 60,
    INR: 22, IDR: 35, PHP: 15, THB: 12, KRW: 8, TWD: 5,
    HUF: 25, PLN: 20, CZK: 18, RON: 22,
    EUR: -5, GBP: -2, CHF: -8, SEK: 3, NOK: 5, DKK: -5,
    JPY: -10, CAD: 2, AUD: 8, NZD: 10,
    CNY: 5, HKD: 1, SGD: 3, RUB: 120,
  };

  const now = new Date();
  const buckets: Record<string, number> = {};
  const bpsPerMonth = CARRY_BPS_MONTH[currency] ?? 20;

  for (let m = 1; m <= 6; m++) {
    const d = new Date(now);
    d.setMonth(d.getMonth() + m);
    const bucket = d.toISOString().slice(0, 7); // YYYY-MM
    // Simple linear approximation: points = spot × carry_bps/month × m / 10000
    const pts = parseFloat((spot * (bpsPerMonth / 10000) * m).toFixed(4));
    buckets[bucket] = pts;
  }
  return buckets;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { currencies?: string[] };
    const currencies: string[] = body.currencies ?? ['MXN'];

    // Primary currency to price vs USD
    // For MXN and most EM, we want USD/CCY (units of CCY per 1 USD)
    // For EUR/GBP, Alpha Vantage returns base/quote = EUR/USD (units of USD per 1 EUR)
    // We normalise everything to: how many local currency units per 1 USD

    const primaryCurrency = currencies[0] ?? 'MXN';

    let spot: number | null = null;
    let spotSource = 'demo_fallback';

    // Determine fetch direction
    // For DM currencies that quote vs USD (EUR, GBP, AUD, NZD, CHF), we fetch CCY/USD then invert
    const INVERTED = new Set(['EUR', 'GBP', 'AUD', 'NZD', 'CHF']);
    const isInverted = INVERTED.has(primaryCurrency);

    if (primaryCurrency !== 'USD') {
      if (isInverted) {
        const rate = await fetchSpot(primaryCurrency, 'USD');
        if (rate && rate > 0) { spot = parseFloat((1 / rate).toFixed(6)); spotSource = 'alpha_vantage_live'; }
      } else {
        const rate = await fetchSpot('USD', primaryCurrency);
        if (rate && rate > 0) { spot = parseFloat(rate.toFixed(6)); spotSource = 'alpha_vantage_live'; }
      }
    }

    // Fallback demo spots when API key not configured or rate limit hit
    const DEMO_SPOTS: Record<string, number> = {
      MXN: 18.97, BRL: 5.08, CLP: 945.50, COP: 4155.00,
      EUR: 0.9210, GBP: 0.7882, CHF: 0.8820, SEK: 10.42, NOK: 10.68, DKK: 6.87,
      PLN: 4.02, CZK: 22.80, HUF: 361.0,
      JPY: 149.80, CNY: 7.24, HKD: 7.82, KRW: 1342.0, SGD: 1.338, TWD: 32.15, INR: 83.90,
      AUD: 1.567, NZD: 1.703, CAD: 1.395,
      ZAR: 18.55, TRY: 32.85, RUB: 88.50,
    };

    if (spot === null) {
      spot = DEMO_SPOTS[primaryCurrency] ?? 1.0;
      spotSource = 'demo_fallback';
    }

    const forwardPoints = estimateForwardPoints(spot, primaryCurrency);
    const asOf = new Date().toISOString().slice(0, 19) + 'Z';

    // Build currency pair label
    const pairLabel = INVERTED.has(primaryCurrency) ? `${primaryCurrency}/USD` : `USD/${primaryCurrency}`;

    const market = {
      as_of: asOf,
      spot_usdmxn: spot,   // field name is legacy — contains actual spot for primary currency
      forward_points_by_month: forwardPoints,
      provider_metadata: {
        source: spotSource,
        data_class: spotSource === 'alpha_vantage_live' ? 'LIVE' : 'DEMO',
        currency_pair: pairLabel,
        primary_currency: primaryCurrency,
        currencies_detected: currencies,
        note: spotSource === 'alpha_vantage_live'
          ? `Live spot from Alpha Vantage as of ${asOf}. Forward points estimated from carry differentials.`
          : `Demo fallback rates — configure ALPHA_VANTAGE_API_KEY in .env.local for live data.`,
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
