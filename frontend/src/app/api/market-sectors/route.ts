import { NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Market Sectors & ETFs — Finnhub quote API
// GET /api/market-sectors
// Finnhub free tier: 60 req/min, no daily cap — all 15 fetched in parallel
// CDN cache: s-maxage=86400 persists across Vercel deployments
// ─────────────────────────────────────────────────────────────────────────────

const FH_KEY  = process.env.FINNHUB_API_KEY ?? '';
const FH_BASE = 'https://finnhub.io/api/v1';

const SYMBOLS = [
  { symbol: 'SPY',  name: 'S&P 500',  category: 'market' as const },
  { symbol: 'QQQ',  name: 'Nasdaq 100',  category: 'market' as const },
  { symbol: 'DIA',  name: 'Dow Jones',  category: 'market' as const },
  { symbol: 'IWM',  name: 'Russell 2000',  category: 'market' as const },
  { symbol: 'XLK',  name: 'Technology',  category: 'sector' as const },
  { symbol: 'XLF',  name: 'Financials',  category: 'sector' as const },
  { symbol: 'XLE',  name: 'Energy',  category: 'sector' as const },
  { symbol: 'XLV',  name: 'Healthcare',  category: 'sector' as const },
  { symbol: 'XLY',  name: 'Consumer Discr.',  category: 'sector' as const },
  { symbol: 'XLP',  name: 'Consumer Staples',  category: 'sector' as const },
  { symbol: 'XLI',  name: 'Industrials',  category: 'sector' as const },
  { symbol: 'XLU',  name: 'Utilities',  category: 'sector' as const },
  { symbol: 'XLB',  name: 'Materials',  category: 'sector' as const },
  { symbol: 'XLRE',  name: 'Real Estate',  category: 'sector' as const },
  { symbol: 'XLC',  name: 'Communications',  category: 'sector' as const },
];

interface QuoteResult {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  latestTradingDay: string;
  category: 'market' | 'sector';
}

// Fallback — EOD 2026-02-27 (SPY/QQQ confirmed live; others estimated)
const FALLBACK_QUOTES: QuoteResult[] = [
  { symbol: 'SPY',  name: 'S&P 500',  price: 685.99, change: -3.31,  changePercent: -0.48, latestTradingDay: '2026-02-27', category: 'market' },
  { symbol: 'QQQ',  name: 'Nasdaq 100',  price: 607.29, change: -1.95,  changePercent: -0.32, latestTradingDay: '2026-02-27', category: 'market' },
  { symbol: 'DIA',  name: 'Dow Jones',  price: 434.6, change: -1.87,  changePercent: -0.43, latestTradingDay: '2026-02-27', category: 'market' },
  { symbol: 'IWM',  name: 'Russell 2000',  price: 217.2, change: -2.14,  changePercent: -0.98, latestTradingDay: '2026-02-27', category: 'market' },
  { symbol: 'XLK',  name: 'Technology',  price: 224.5, change: -2.18,  changePercent: -0.96, latestTradingDay: '2026-02-27', category: 'sector' },
  { symbol: 'XLF',  name: 'Financials',  price: 49.2, change: -0.44,  changePercent: -0.89, latestTradingDay: '2026-02-27', category: 'sector' },
  { symbol: 'XLE',  name: 'Energy',  price: 87.5, change: -0.81,  changePercent: -0.92, latestTradingDay: '2026-02-27', category: 'sector' },
  { symbol: 'XLV',  name: 'Healthcare',  price: 147.1, change: 0.43,  changePercent: 0.29, latestTradingDay: '2026-02-27', category: 'sector' },
  { symbol: 'XLY',  name: 'Consumer Discr.',  price: 215.4, change: -3.12,  changePercent: -1.43, latestTradingDay: '2026-02-27', category: 'sector' },
  { symbol: 'XLP',  name: 'Consumer Staples',  price: 79.8, change: 0.18,  changePercent: 0.23, latestTradingDay: '2026-02-27', category: 'sector' },
  { symbol: 'XLI',  name: 'Industrials',  price: 135.2, change: -0.96,  changePercent: -0.71, latestTradingDay: '2026-02-27', category: 'sector' },
  { symbol: 'XLU',  name: 'Utilities',  price: 78.4, change: 0.62,  changePercent: 0.8, latestTradingDay: '2026-02-27', category: 'sector' },
  { symbol: 'XLB',  name: 'Materials',  price: 89.6, change: -0.74,  changePercent: -0.82, latestTradingDay: '2026-02-27', category: 'sector' },
  { symbol: 'XLRE',  name: 'Real Estate',  price: 41.8, change: 0.31,  changePercent: 0.75, latestTradingDay: '2026-02-27', category: 'sector' },
  { symbol: 'XLC',  name: 'Communications',  price: 106.5, change: -0.88,  changePercent: -0.82, latestTradingDay: '2026-02-27', category: 'sector' },
];

// Finnhub /quote: { c=current, d=change, dp=changePct, pc=prevClose, t=unixTs }
async function fetchFinnhubQuote(
  symbol: string,
  name: string,
  category: 'market' | 'sector',
): Promise<QuoteResult | null> {
  if (!FH_KEY) return null;
  try {
    const url = `${FH_BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${FH_KEY}`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const q = await res.json() as Record<string, number>;
    if (!q.c || q.c === 0) return null;
    const latestTradingDay = q.t
      ? new Date(q.t * 1000).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    return {
      symbol, name, category,
      price: parseFloat(q.c.toFixed(2)),
      change: parseFloat((q.d ?? 0).toFixed(2)),
      changePercent: parseFloat((q.dp ?? 0).toFixed(2)),
      latestTradingDay,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  let liveCount = 0;
  let results: QuoteResult[] = [];

  if (FH_KEY) {
    // Fetch all in parallel — Finnhub 60 req/min free tier, no daily limit
    const raw = await Promise.all(
      SYMBOLS.map(s => fetchFinnhubQuote(s.symbol, s.name, s.category))
    );
    raw.forEach((r, idx) => {
      if (r) { results.push(r); liveCount++; }
      else {
        const fb = FALLBACK_QUOTES.find(f => f.symbol === SYMBOLS[idx]!.symbol);
        if (fb) results.push(fb);
      }
    });
  }

  if (results.length === 0) results = [...FALLBACK_QUOTES];

  const symbolOrder = SYMBOLS.map(s => s.symbol);
  results.sort((a, b) => symbolOrder.indexOf(a.symbol) - symbolOrder.indexOf(b.symbol));

  const latestDay = results.find(r => r.latestTradingDay > '2020-01-01')?.latestTradingDay
    ?? new Date().toISOString().slice(0, 10);
  const dataSource = liveCount > 0 ? 'live' : 'fallback';

  const response = NextResponse.json({
    quotes: results,
    dataSource,
    asOf: latestDay,
    liveCount,
    totalCount: results.length,
    timestamp: new Date().toISOString(),
    note: dataSource === 'live'
      ? `Finnhub EOD data as of ${latestDay}. ${liveCount}/${results.length} symbols live.`
      : 'Using reference data — configure FINNHUB_API_KEY for live quotes.',
  });
  response.headers.set('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
  return response;
}
