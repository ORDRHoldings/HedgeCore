import { NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Macro Data — Alpha Vantage economic indicators + ETF proxies
// GET /api/macro-data
// Returns: structured macro snapshot for GeoPolitical & Macro widget
//
// Endpoints used (all free tier):
//   TREASURY_YIELD     → US 10Y yield (daily)
//   FEDERAL_FUNDS_RATE → Fed Funds rate (monthly)
//   GLOBAL_QUOTE       → UUP (DXY proxy), GLD (Gold), USO (Oil), VIXY (VIX proxy)
//
// Cache: 24 hours (revalidate: 86400) — end-of-day market closed data
// Free tier budget: 6 calls/day for this route
// ─────────────────────────────────────────────────────────────────────────────

const AV_KEY  = process.env.ALPHA_VANTAGE_API_KEY ?? '';
const AV_BASE = 'https://www.alphavantage.co/query';

// Static fallback values — updated Feb 2026
const STATIC = {
  dxy:        { value: 106.62, date: '2026-02-21', trend: 'up'   as const },
  us10y:      { value: 4.42,   date: '2026-02-21', trend: 'up'   as const },
  fedFunds:   { value: 4.33,   date: '2026-01-01', trend: 'flat' as const },
  gold:       { value: 2934.0, date: '2026-02-21', trend: 'up'   as const },
  brent:      { value: 74.74,  date: '2026-02-21', trend: 'down' as const },
  vix:        { value: 18.21,  date: '2026-02-21', trend: 'up'   as const },
};

type Trend = 'up' | 'down' | 'flat';

function calcTrend(current: number, prev: number): Trend {
  if (prev === 0) return 'flat';
  const diff = (current - prev) / prev;
  if (diff > 0.001) return 'up';
  if (diff < -0.001) return 'down';
  return 'flat';
}

// Fetch latest value from AV time series endpoints (TREASURY_YIELD, FEDERAL_FUNDS_RATE, etc.)
async function fetchSeriesLatest(fn: string, params = ''): Promise<{ value: number; prev: number; date: string } | null> {
  if (!AV_KEY || AV_KEY === 'YOUR_ALPHA_VANTAGE_KEY_HERE') return null;
  try {
    const url = `${AV_BASE}?function=${fn}${params}&apikey=${AV_KEY}`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const json = await res.json() as Record<string, unknown>;
    if (json['Note'] || json['Information']) return null;

    // Both TREASURY_YIELD and FEDERAL_FUNDS_RATE return { data: [{date, value}, ...] }
    const data = json['data'] as Array<{ date: string; value: string }> | undefined;
    if (!data || data.length === 0) return null;

    const latest = data[0]!;
    const prev   = data[1];
    const value  = parseFloat(latest.value);
    const prevVal = prev ? parseFloat(prev.value) : value;
    if (isNaN(value)) return null;

    return { value, prev: prevVal, date: latest.date };
  } catch {
    return null;
  }
}

// Fetch GLOBAL_QUOTE for an ETF/stock symbol
async function fetchETF(symbol: string): Promise<{ price: number; prevClose: number; date: string } | null> {
  if (!AV_KEY || AV_KEY === 'YOUR_ALPHA_VANTAGE_KEY_HERE') return null;
  try {
    const url = `${AV_BASE}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${AV_KEY}`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const json = await res.json() as Record<string, unknown>;
    if (json['Note'] || json['Information']) return null;

    const q = json['Global Quote'] as Record<string, string> | undefined;
    if (!q || !q['05. price']) return null;
    const price = parseFloat(q['05. price']);
    const prev  = parseFloat(q['08. previous close'] ?? q['05. price']);
    const date  = q['07. latest trading day'] ?? '';
    if (isNaN(price) || price <= 0) return null;
    return { price, prevClose: prev, date };
  } catch {
    return null;
  }
}

export async function GET() {
  const asOf = new Date().toISOString().slice(0, 10);
  let liveCount = 0;

  // ── Fetch all in parallel ─────────────────────────────────────────────────
  const [us10yData, fedData, uupData, gldData, usoData, vixyData] = await Promise.all([
    fetchSeriesLatest('TREASURY_YIELD', '&interval=daily&maturity=10year'),
    fetchSeriesLatest('FEDERAL_FUNDS_RATE', '&interval=monthly'),
    fetchETF('UUP'),    // USD Index Bullish ETF  (DXY proxy)
    fetchETF('GLD'),    // SPDR Gold Trust ETF     (~gold/10 oz)
    fetchETF('USO'),    // United States Oil Fund  (WTI proxy)
    fetchETF('VIXY'),   // ProShares VIX ST Futures (VIX proxy)
  ]);

  // ── Build macro snapshot ──────────────────────────────────────────────────

  // US 10Y
  let us10y:    { value: number; date: string; trend: Trend } = { ...STATIC.us10y };
  if (us10yData) {
    liveCount++;
    us10y = {
      value: us10yData.value,
      date:  us10yData.date,
      trend: calcTrend(us10yData.value, us10yData.prev),
    };
  }

  // Fed Funds
  let fedFunds: { value: number; date: string; trend: Trend } = { ...STATIC.fedFunds };
  if (fedData) {
    liveCount++;
    fedFunds = {
      value: fedData.value,
      date:  fedData.date,
      trend: calcTrend(fedData.value, fedData.prev),
    };
  }

  // DXY proxy via UUP
  // UUP ≈ DXY / 3.66  (rough historical relationship)
  let dxy:      { value: number; date: string; trend: Trend } = { ...STATIC.dxy };
  if (uupData) {
    liveCount++;
    const dxyEst = parseFloat((uupData.price * 3.66).toFixed(2));
    const dxyPrev = parseFloat((uupData.prevClose * 3.66).toFixed(2));
    dxy = {
      value: dxyEst,
      date:  uupData.date,
      trend: calcTrend(dxyEst, dxyPrev),
    };
  }

  // Gold via GLD ETF: GLD holds ~0.0945 oz gold → gold ≈ GLD / 0.0945
  let gold:     { value: number; date: string; trend: Trend } = { ...STATIC.gold };
  if (gldData) {
    liveCount++;
    const goldEst  = parseFloat((gldData.price / 0.0945).toFixed(0));
    const goldPrev = parseFloat((gldData.prevClose / 0.0945).toFixed(0));
    gold = {
      value: goldEst,
      date:  gldData.date,
      trend: calcTrend(goldEst, goldPrev),
    };
  }

  // Brent via USO ETF (USO tracks WTI; Brent typically $2-4 higher)
  let brent:    { value: number; date: string; trend: Trend } = { ...STATIC.brent };
  if (usoData) {
    liveCount++;
    // USO ≈ WTI/8 (after reverse splits) → WTI ≈ USO × 8 → Brent ≈ WTI + 3
    const wtiEst   = parseFloat((usoData.price * 8).toFixed(2));
    const brentEst = wtiEst + 3;
    const wtiPrev  = usoData.prevClose * 8 + 3;
    brent = {
      value: brentEst,
      date:  usoData.date,
      trend: calcTrend(brentEst, wtiPrev),
    };
  }

  // VIX via VIXY (ProShares VIX Short-Term Futures ETF)
  // VIXY ≈ VIX × 0.65  (very rough proxy due to futures roll cost)
  let vix:      { value: number; date: string; trend: Trend } = { ...STATIC.vix };
  if (vixyData) {
    liveCount++;
    const vixEst  = parseFloat((vixyData.price / 0.65).toFixed(1));
    const vixPrev = vixyData.prevClose / 0.65;
    vix = {
      value: vixEst,
      date:  vixyData.date,
      trend: calcTrend(vixEst, vixPrev),
    };
  }

  const dataSource = liveCount > 0 ? 'live' : 'fallback';

  return NextResponse.json({
    dataSource,
    liveCount,
    asOf: us10yData?.date ?? gldData?.date ?? asOf,
    macroData: {
      dxy: {
        label:   'DXY INDEX',
        value:   dxy.value,
        display: dxy.value.toFixed(2),
        maxRef:  120,
        trend:   dxy.trend,
        context: dxy.value > 105 ? 'USD broad strength elevated' : dxy.value > 100 ? 'USD consolidating' : 'USD softening',
        unit:    '',
        note:    uupData ? `UUP ETF proxy × 3.66 as of ${dxy.date}` : 'Indicative estimate',
      },
      vix: {
        label:   'VIX',
        value:   vix.value,
        display: vix.value.toFixed(1),
        maxRef:  45,
        trend:   vix.trend,
        context: vix.value > 25 ? 'Elevated fear gauge — hedge demand rising' : vix.value > 18 ? 'Moderate uncertainty' : 'Risk-on environment',
        unit:    '',
        note:    vixyData ? `VIXY ETF proxy as of ${vix.date}` : 'Indicative estimate',
      },
      us10y: {
        label:   'US 10Y',
        value:   us10y.value,
        display: `${us10y.value.toFixed(2)}%`,
        maxRef:  6,
        trend:   us10y.trend,
        context: us10y.value > 4.5 ? 'Term premium rebuilding — tightening pressure' : us10y.value > 4.0 ? 'Range-bound yield environment' : 'Yields declining on growth concerns',
        unit:    '%',
        note:    us10yData ? `TREASURY_YIELD daily as of ${us10y.date}` : 'Indicative estimate',
      },
      fedFunds: {
        label:   'FED FUNDS',
        value:   fedFunds.value,
        display: `${fedFunds.value.toFixed(2)}%`,
        maxRef:  6,
        trend:   fedFunds.trend,
        context: 'FOMC target range · data-dependent policy',
        unit:    '%',
        note:    fedData ? `FEDERAL_FUNDS_RATE monthly as of ${fedFunds.date}` : 'Indicative estimate',
      },
      brent: {
        label:   'BRENT',
        value:   brent.value,
        display: `$${brent.value.toFixed(1)}`,
        maxRef:  120,
        trend:   brent.trend,
        context: brent.value > 90 ? 'Supply tightness supporting prices' : brent.value > 75 ? 'OPEC+ balancing act' : 'Demand concerns weighing on crude',
        unit:    '$',
        note:    usoData ? `USO ETF ×8+3 proxy as of ${brent.date}` : 'Indicative estimate',
      },
      gold: {
        label:   'GOLD',
        value:   gold.value,
        display: `$${gold.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
        maxRef:  3500,
        trend:   gold.trend,
        context: gold.value > 2800 ? 'Record highs — safe-haven bid dominant' : gold.value > 2500 ? 'Safe-haven bid persists' : 'Consolidating near key support',
        unit:    '$',
        note:    gldData ? `GLD ETF ÷0.0945 as of ${gold.date}` : 'Indicative estimate',
      },
    },
  });
}
