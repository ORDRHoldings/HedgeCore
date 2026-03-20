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

type LiveField = { value: number; date: string; trend: Trend } | null;

export async function GET() {
  const asOf = new Date().toISOString().slice(0, 10);

  if (!FH_KEY) {
    return NextResponse.json(
      { error: 'Macro data unavailable', detail: 'FINNHUB_API_KEY not configured.' },
      { status: 503 },
    );
  }

  const [vixData, tnxData, uupData, gldData, usoData] = await Promise.all([
    fetchFHQuote('^VIX'),   fetchFHQuote('^TNX'),
    fetchFHQuote('UUP'),    fetchFHQuote('GLD'),    fetchFHQuote('USO'),
  ]);

  let liveCount = 0;

  const vix: LiveField = vixData
    ? (liveCount++, { value: parseFloat(vixData.price.toFixed(1)), date: vixData.date, trend: calcTrend(vixData.price, vixData.prevClose) })
    : null;

  const us10y: LiveField = tnxData
    ? (liveCount++, { value: parseFloat(tnxData.price.toFixed(2)), date: tnxData.date, trend: calcTrend(tnxData.price, tnxData.prevClose) })
    : null;

  const dxy: LiveField = uupData
    ? (() => { liveCount++; const v = parseFloat((uupData.price * 3.66).toFixed(2)); return { value: v, date: uupData.date, trend: calcTrend(v, uupData.prevClose * 3.66) }; })()
    : null;

  const gold: LiveField = gldData
    ? (() => { liveCount++; const v = parseFloat((gldData.price / 0.0945).toFixed(0)); return { value: v, date: gldData.date, trend: calcTrend(v, gldData.prevClose / 0.0945) }; })()
    : null;

  const brent: LiveField = usoData
    ? (() => { liveCount++; const v = parseFloat((usoData.price * 8 + 3).toFixed(2)); return { value: v, date: usoData.date, trend: calcTrend(v, usoData.prevClose * 8 + 3) }; })()
    : null;

  if (liveCount === 0) {
    return NextResponse.json(
      { error: 'Macro data unavailable', detail: 'All Finnhub quote requests failed. Check FINNHUB_API_KEY and rate limits.' },
      { status: 503 },
    );
  }

  const dataSource = 'live';
  const resolvedAsOf = vixData?.date ?? tnxData?.date ?? gldData?.date ?? asOf;

  function buildField<T extends LiveField>(
    field: T,
    label: string,
    unit: string,
    maxRef: number,
    context: (v: number) => string,
    displayFn: (v: number) => string,
    noteWhenLive: string,
  ) {
    if (!field) return null;
    return {
      label, unit, maxRef,
      value:   field.value,
      display: displayFn(field.value),
      trend:   field.trend,
      context: context(field.value),
      note:    noteWhenLive,
    };
  }

  const payload = {
    dataSource,
    liveCount,
    asOf: resolvedAsOf,
    macroData: {
      dxy:   buildField(dxy,   'DXY INDEX', '',  120,  v => v > 105 ? 'USD broad strength elevated' : v > 100 ? 'USD consolidating' : 'USD softening',             v => v.toFixed(2),         `UUP ETF ×3.66 as of ${dxy?.date}`),
      vix:   buildField(vix,   'VIX',       '',   45,  v => v > 25  ? 'Elevated fear'               : v > 18  ? 'Moderate uncertainty' : 'Risk-on environment',    v => v.toFixed(1),         `^VIX direct as of ${vix?.date}`),
      us10y: buildField(us10y, 'US 10Y',    '%',   6,  v => v > 4.5 ? 'Term premium rebuilding'     : v > 4.0 ? 'Range-bound yield env.' : 'Yields declining',      v => `${v.toFixed(2)}%`,   `^TNX direct as of ${us10y?.date}`),
      brent: buildField(brent, 'BRENT',     '$', 120,  v => v > 90  ? 'Supply tightness'            : v > 75  ? 'OPEC+ balancing act' : 'Demand concerns weighing', v => `$${v.toFixed(1)}`,   `USO ETF ×8+3 proxy as of ${brent?.date}`),
      gold:  buildField(gold,  'GOLD',      '$', 3500, v => v > 2800 ? 'Record highs — safe-haven bid' : v > 2500 ? 'Safe-haven bid persists' : 'Consolidating near support', v => `$${v.toLocaleString('en-US', { maximumFractionDigits: 0 })}`, `GLD ETF ÷0.0945 as of ${gold?.date}`),
    },
  };

  const response = NextResponse.json(payload);
  response.headers.set('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  return response;
}
