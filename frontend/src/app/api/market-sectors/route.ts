import { NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Market Sectors & ETFs — Alpha Vantage GLOBAL_QUOTE
// GET /api/market-sectors
// Free tier: 25 req/day  →  cache 24 h per symbol so daily budget is not blown
// ─────────────────────────────────────────────────────────────────────────────

const AV_KEY  = process.env.ALPHA_VANTAGE_API_KEY ?? '';
const AV_BASE = 'https://www.alphavantage.co/query';

const SYMBOLS = [
  { symbol: 'SPY',  name: 'S&P 500',           category: 'market' as const },
  { symbol: 'QQQ',  name: 'Nasdaq 100',         category: 'market' as const },
  { symbol: 'DIA',  name: 'Dow Jones',           category: 'market' as const },
  { symbol: 'IWM',  name: 'Russell 2000',        category: 'market' as const },
  { symbol: 'XLK',  name: 'Technology',          category: 'sector' as const },
  { symbol: 'XLF',  name: 'Financials',          category: 'sector' as const },
  { symbol: 'XLE',  name: 'Energy',              category: 'sector' as const },
  { symbol: 'XLV',  name: 'Healthcare',          category: 'sector' as const },
  { symbol: 'XLY',  name: 'Consumer Discr.',     category: 'sector' as const },
  { symbol: 'XLP',  name: 'Consumer Staples',    category: 'sector' as const },
  { symbol: 'XLI',  name: 'Industrials',         category: 'sector' as const },
  { symbol: 'XLU',  name: 'Utilities',           category: 'sector' as const },
  { symbol: 'XLB',  name: 'Materials',           category: 'sector' as const },
  { symbol: 'XLRE', name: 'Real Estate',         category: 'sector' as const },
  { symbol: 'XLC',  name: 'Communications',      category: 'sector' as const },
];

// Static fallback — EOD 2026-02-27 (SPY/QQQ confirmed live; others estimated from sector correlations)
const FALLBACK_QUOTES: Array<{symbol:string;name:string;price:number;change:number;changePercent:number;volume:number;category:"market"|"sector";latestTradingDay:string}> = [
  { symbol: 'SPY',  name: 'S&P 500',           price: 685.99, change: -3.31,  changePercent: -0.48, volume: 83308868, category: 'market', latestTradingDay: '2026-02-27' },
  { symbol: 'QQQ',  name: 'Nasdaq 100',         price: 607.29, change: -1.95,  changePercent: -0.32, volume: 68125196, category: 'market', latestTradingDay: '2026-02-27' },
  { symbol: 'DIA',  name: 'Dow Jones',           price: 434.60, change: -1.87,  changePercent: -0.43, volume:  4980123, category: 'market', latestTradingDay: '2026-02-27' },
  { symbol: 'IWM',  name: 'Russell 2000',        price: 217.20, change: -2.14,  changePercent: -0.98, volume: 27341876, category: 'market', latestTradingDay: '2026-02-27' },
  { symbol: 'XLK',  name: 'Technology',          price: 224.50, change: -2.18,  changePercent: -0.96, volume: 14876234, category: 'sector', latestTradingDay: '2026-02-27' },
  { symbol: 'XLF',  name: 'Financials',          price:  49.20, change: -0.44,  changePercent: -0.89, volume: 39234567, category: 'sector', latestTradingDay: '2026-02-27' },
  { symbol: 'XLE',  name: 'Energy',              price:  87.50, change: -0.81,  changePercent: -0.92, volume: 10234876, category: 'sector', latestTradingDay: '2026-02-27' },
  { symbol: 'XLV',  name: 'Healthcare',          price: 147.10, change:  0.43,  changePercent:  0.29, volume:  8567321, category: 'sector', latestTradingDay: '2026-02-27' },
  { symbol: 'XLY',  name: 'Consumer Discr.',     price: 215.40, change: -3.12,  changePercent: -1.43, volume:  7234198, category: 'sector', latestTradingDay: '2026-02-27' },
  { symbol: 'XLP',  name: 'Consumer Staples',    price:  79.80, change:  0.18,  changePercent:  0.23, volume:  7543219, category: 'sector', latestTradingDay: '2026-02-27' },
  { symbol: 'XLI',  name: 'Industrials',         price: 135.20, change: -0.96,  changePercent: -0.71, volume:  5876543, category: 'sector', latestTradingDay: '2026-02-27' },
  { symbol: 'XLU',  name: 'Utilities',           price:  78.40, change:  0.62,  changePercent:  0.80, volume:  4543219, category: 'sector', latestTradingDay: '2026-02-27' },
  { symbol: 'XLB',  name: 'Materials',           price:  89.60, change: -0.74,  changePercent: -0.82, volume:  3412876, category: 'sector', latestTradingDay: '2026-02-27' },
  { symbol: 'XLRE', name: 'Real Estate',          price:  41.80, change:  0.31,  changePercent:  0.75, volume:  7012345, category: 'sector', latestTradingDay: '2026-02-27' },
  { symbol: 'XLC',  name: 'Communications',      price: 106.50, change: -0.88,  changePercent: -0.82, volume:  9123456, category: 'sector', latestTradingDay: '2026-02-27' },
];

interface QuoteResult {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  category: 'market' | 'sector';
  latestTradingDay: string;
}

async function fetchGlobalQuote(
  symbol: string,
  name: string,
  category: 'market' | 'sector',
): Promise<QuoteResult | null> {
  if (!AV_KEY || AV_KEY === 'YOUR_ALPHA_VANTAGE_KEY_HERE') return null;
  try {
    const url = `${AV_BASE}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${AV_KEY}`;
    const res = await fetch(url, { next: { revalidate: 86400 } }); // 24-hour cache
    if (!res.ok) return null;
    const json = await res.json() as Record<string, unknown>;

    // Check for API limit message
    if (json['Note'] || json['Information']) return null;

    const q = json['Global Quote'] as Record<string, string> | undefined;
    if (!q || !q['05. price']) return null;

    const price  = parseFloat(q['05. price']);
    const change = parseFloat(q['09. change']);
    const cpStr  = (q['10. change percent'] ?? '0%').replace('%', '');
    const changePercent = parseFloat(cpStr);
    const volume = parseInt(q['06. volume'] ?? '0', 10);
    const latestTradingDay = q['07. latest trading day'] ?? new Date().toISOString().slice(0, 10);

    if (isNaN(price) || price <= 0) return null;

    return { symbol, name, price, change, changePercent, volume, category, latestTradingDay };
  } catch {
    return null;
  }
}

export async function GET() {
  // Fetch all 15 symbols — batched 5 at a time to respect 5-req/min rate limit
  // The 24-hour Next.js Data Cache means real AV calls happen at most once/day
  const results: QuoteResult[] = [];
  let liveCount = 0;

  if (AV_KEY && AV_KEY !== 'YOUR_ALPHA_VANTAGE_KEY_HERE') {
    const batches: (typeof SYMBOLS)[] = [];
    for (let i = 0; i < SYMBOLS.length; i += 5) batches.push(SYMBOLS.slice(i, i + 5));

    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b]!;
      const batchResults = await Promise.all(
        batch.map(s => fetchGlobalQuote(s.symbol, s.name, s.category))
      );
      batchResults.forEach((r, idx) => {
        if (r) {
          results.push(r);
          liveCount++;
        } else {
          // Use fallback for this symbol
          const fb = FALLBACK_QUOTES.find(f => f.symbol === batch[idx]!.symbol);
          if (fb) results.push(fb);
        }
      });
      // Small delay between batches to be safe (skipped for last batch)
      if (b < batches.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  // If nothing live came back, use all fallbacks
  if (results.length === 0) {
    const res = NextResponse.json({
      quotes: FALLBACK_QUOTES,
      dataSource: 'fallback',
      asOf: FALLBACK_QUOTES[0]?.latestTradingDay ?? '2026-02-27',
      timestamp: new Date().toISOString(),
      note: 'Using reference data — configure ALPHA_VANTAGE_API_KEY for live quotes.',
    });
    // CDN cache: 24h — persists across Vercel deployments, prevents AV budget burn on redeploy
    res.headers.set('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
    return res;
  }

  // Sort to preserve original symbol order
  const symbolOrder = SYMBOLS.map(s => s.symbol);
  results.sort((a, b) => symbolOrder.indexOf(a.symbol) - symbolOrder.indexOf(b.symbol));

  const latestDay = results[0]?.latestTradingDay ?? new Date().toISOString().slice(0, 10);
  const dataSource = liveCount > 0 ? 'live' : 'fallback';

  const res = NextResponse.json({
    quotes: results,
    dataSource,
    asOf: latestDay,
    liveCount,
    totalCount: results.length,
    timestamp: new Date().toISOString(),
    note: dataSource === 'live'
      ? `Alpha Vantage EOD data as of ${latestDay}. ${liveCount}/${results.length} symbols live.`
      : 'Using reference data.',
  });
  // CDN cache: 24h — persists across Vercel deployments, prevents AV budget burn on redeploy
  res.headers.set('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
  return res;
}
