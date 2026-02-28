import { NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Macro Data — Finnhub quote API (replaces Alpha Vantage ETF proxies)
// GET /api/macro-data
// Finnhub free tier: 60 req/min, no daily cap
// Symbols used:
//   ^VIX   → VIX volatility index (direct)
//   ^TNX   → US 10Y Treasury yield (direct, already in %)
//   UUP    → DXY proxy ETF (×3.66)
//   GLD    → Gold proxy ETF (÷0.0945)
//   USO    → WTI/Brent proxy ETF (×8+3)
//   VIXY   → kept as VIX fallback if ^VIX unavailable
// CDN cache: s-maxage=86400 persists across Vercel deployments
// ─────────────────────────────────────────────────────────────────────────────

const FH_KEY  = process.env.FINNHUB_API_KEY ?? '';
const FH_BASE = 'https://finnhub.io/api/v1';

// Static fallback — EOD 2026-02-27 (DXY/UUP confirmed; others estimated)
const STATIC = {
  dxy:       { value: 99.11, date: '2026-02-27', trend: 'down' as const },
  us10y:     { value: 4.26, date: '2026-02-27', trend: 'down' as const },
  fedFunds:  { value: 4.33, date: '2026-02-01', trend: 'flat' as const },
  gold:      { value: 2870.0, date: '2026-02-27', trend: 'flat' as const },
  brent:     { value: 73.5, date: '2026-02-27', trend: 'down' as const },
  vix:       { value: 21.5, date: '2026-02-27', trend: 'up' as const },
};

type Trend = 'up' | 'down' | 'flat';

function calcTrend(current: number, prev: number): Trend {
  if (prev === 0) return 'flat';
  const diff = (current - prev) / prev;
  if (diff > 0.001) return 'up';
  if (diff < -0.001) return 'down';
  return 'flat';
}

async function fetchFHQuote(symbol: string): Promise<{ price: number; prevClose: number; date: string } | null> {
  if (!FH_KEY) return null;
  try {
    const url = `${FH_BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${FH_KEY}`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const q = await res.json() as Record<string, number>;
    if (!q.c || q.c === 0) return null;
    const date = q.t ? new Date(q.t * 1000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    return { price: q.c, prevClose: q.pc ?? q.c, date };
  } catch {
    return null;
  }
}

export async function GET() {
  const asOf = new Date().toISOString().slice(0, 10);
  let liveCount = 0;

  const [vixData, tnxData, uupData, gldData, usoData] = await Promise.all([
    fetchFHQuote('^VIX'),   fetchFHQuote('^TNX'),
    fetchFHQuote('UUP'),    fetchFHQuote('GLD'),    fetchFHQuote('USO'),
  ]);

  let vix: { value: number; date: string; trend: Trend } = { ...STATIC.vix };
  if (vixData) { liveCount++; vix = { value: parseFloat(vixData.price.toFixed(1)), date: vixData.date, trend: calcTrend(vixData.price, vixData.prevClose) }; }

  let us10y: { value: number; date: string; trend: Trend } = { ...STATIC.us10y };
  if (tnxData) { liveCount++; us10y = { value: parseFloat(tnxData.price.toFixed(2)), date: tnxData.date, trend: calcTrend(tnxData.price, tnxData.prevClose) }; }

  let dxy: { value: number; date: string; trend: Trend } = { ...STATIC.dxy };
  if (uupData) { liveCount++; const dxyEst = parseFloat((uupData.price * 3.66).toFixed(2)); dxy = { value: dxyEst, date: uupData.date, trend: calcTrend(dxyEst, uupData.prevClose * 3.66) }; }

  let gold: { value: number; date: string; trend: Trend } = { ...STATIC.gold };
  if (gldData) { liveCount++; const goldEst = parseFloat((gldData.price / 0.0945).toFixed(0)); gold = { value: goldEst, date: gldData.date, trend: calcTrend(goldEst, gldData.prevClose / 0.0945) }; }

  let brent: { value: number; date: string; trend: Trend } = { ...STATIC.brent };
  if (usoData) { liveCount++; const brentEst = parseFloat((usoData.price * 8 + 3).toFixed(2)); brent = { value: brentEst, date: usoData.date, trend: calcTrend(brentEst, usoData.prevClose * 8 + 3) }; }

  const fedFunds = { ...STATIC.fedFunds };
  const dataSource = liveCount > 0 ? 'live' : 'fallback';

  const payload = { dataSource, liveCount, asOf: vixData?.date ?? tnxData?.date ?? gldData?.date ?? asOf, macroData: {
    dxy: { label: 'DXY INDEX', value: dxy.value, display: dxy.value.toFixed(2), maxRef: 120, trend: dxy.trend, context: dxy.value > 105 ? 'USD broad strength elevated' : dxy.value > 100 ? 'USD consolidating' : 'USD softening', unit: '', note: uupData ? `UUP ETF ×3.66 as of ${dxy.date}` : 'Indicative estimate' },
    vix: { label: 'VIX', value: vix.value, display: vix.value.toFixed(1), maxRef: 45, trend: vix.trend, context: vix.value > 25 ? 'Elevated fear' : vix.value > 18 ? 'Moderate uncertainty' : 'Risk-on environment', unit: '', note: vixData ? `^VIX direct as of ${vix.date}` : 'Indicative estimate' },
    us10y: { label: 'US 10Y', value: us10y.value, display: `${us10y.value.toFixed(2)}%`, maxRef: 6, trend: us10y.trend, context: us10y.value > 4.5 ? 'Term premium rebuilding' : us10y.value > 4.0 ? 'Range-bound yield env.' : 'Yields declining on growth concerns', unit: '%', note: tnxData ? `^TNX direct as of ${us10y.date}` : 'Indicative estimate' },
    fedFunds: { label: 'FED FUNDS', value: fedFunds.value, display: `${fedFunds.value.toFixed(2)}%`, maxRef: 6, trend: fedFunds.trend, context: 'FOMC target range · data-dependent policy', unit: '%', note: 'Static reference — FOMC target unchanged' },
    brent: { label: 'BRENT', value: brent.value, display: `$${brent.value.toFixed(1)}`, maxRef: 120, trend: brent.trend, context: brent.value > 90 ? 'Supply tightness' : brent.value > 75 ? 'OPEC+ balancing act' : 'Demand concerns weighing', unit: '$', note: usoData ? `USO ETF ×8+3 proxy as of ${brent.date}` : 'Indicative estimate' },
    gold: { label: 'GOLD', value: gold.value, display: `$${gold.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, maxRef: 3500, trend: gold.trend, context: gold.value > 2800 ? 'Record highs — safe-haven bid' : gold.value > 2500 ? 'Safe-haven bid persists' : 'Consolidating near support', unit: '$', note: gldData ? `GLD ETF ÷0.0945 as of ${gold.date}` : 'Indicative estimate' },
  } };
  const response = NextResponse.json(payload);
  response.headers.set('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
  return response;
}
