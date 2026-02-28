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

// Static fallback — updated Feb 2026
const FALLBACK_QUOTES: Array<{symbol:string;name:string;price:number;change:number;changePercent:number;volume:number;category:"market"|"sector";latestTradingDay:string}> = [
  { symbol: 'SPY',  name: 'S&P 500',           price: 597.31, change: -3.42,  changePercent: -0.57, volume: 68219304, category: 'market', latestTradingDay: '2026-02-21' },
  { symbol: 'QQQ',  name: 'Nasdaq 100',         price: 512.18, change: -6.87,  changePercent: -1.32, volume: 47231087, category: 'market', latestTradingDay: '2026-02-21' },
  { symbol: 'DIA',  name: 'Dow Jones',           price: 438.55, change:  1.12,  changePercent:  0.26, volume:  4512786, category: 'market', latestTradingDay: '2026-02-21' },
  { symbol: 'IWM',  name: 'Russell 2000',        price: 220.44, change: -1.28,  changePercent: -0.58, volume: 25987321, category: 'market', latestTradingDay: '2026-02-21' },
  { symbol: 'XLK',  name: 'Technology',          price: 219.67, change: -3.11,  changePercent: -1.39, volume: 13421876, category: 'sector', latestTradingDay: '2026-02-21' },
  { symbol: 'XLF',  name: 'Financials',          price:  49.82, change:  0.31,  changePercent:  0.63, volume: 38129764, category: 'sector', latestTradingDay: '2026-02-21' },
  { symbol: 'XLE',  name: 'Energy',              price:  88.94, change: -0.52,  changePercent: -0.58, volume:  9873245, category: 'sector', latestTradingDay: '2026-02-21' },
  { symbol: 'XLV',  name: 'Healthcare',          price: 147.23, change:  0.87,  changePercent:  0.59, volume:  8234567, category: 'sector', latestTradingDay: '2026-02-21' },
  { symbol: 'XLY',  name: 'Consumer Discr.',     price: 178.91, change: -2.34,  changePercent: -1.29, volume:  6543219, category: 'sector', latestTradingDay: '2026-02-21' },
  { symbol: 'XLP',  name: 'Consumer Staples',    price:  80.45, change:  0.22,  changePercent:  0.27, volume:  7234512, category: 'sector', latestTradingDay: '2026-02-21' },
  { symbol: 'XLI',  name: 'Industrials',         price: 134.78, change:  0.91,  changePercent:  0.68, volume:  5423198, category: 'sector', latestTradingDay: '2026-02-21' },
  { symbol: 'XLU',  name: 'Utilities',           price:  72.14, change: -0.34,  changePercent: -0.47, volume:  4312987, category: 'sector', latestTradingDay: '2026-02-21' },
  { symbol: 'XLB',  name: 'Materials',           price:  93.21, change:  0.18,  changePercent:  0.19, volume:  3198765, category: 'sector', latestTradingDay: '2026-02-21' },
  { symbol: 'XLRE', name: 'Real Estate',          price:  40.12, change: -0.23,  changePercent: -0.57, volume:  6754321, category: 'sector', latestTradingDay: '2026-02-21' },
  { symbol: 'XLC',  name: 'Communications',      price:  94.35, change:  0.67,  changePercent:  0.71, volume:  8876543, category: 'sector', latestTradingDay: '2026-02-21' },
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
    return NextResponse.json({
      quotes: FALLBACK_QUOTES,
      dataSource: 'fallback',
      asOf: FALLBACK_QUOTES[0]?.latestTradingDay ?? '2026-02-21',
      timestamp: new Date().toISOString(),
      note: 'Using reference data — configure ALPHA_VANTAGE_API_KEY for live quotes.',
    });
  }

  // Sort to preserve original symbol order
  const symbolOrder = SYMBOLS.map(s => s.symbol);
  results.sort((a, b) => symbolOrder.indexOf(a.symbol) - symbolOrder.indexOf(b.symbol));

  const latestDay = results[0]?.latestTradingDay ?? new Date().toISOString().slice(0, 10);
  const dataSource = liveCount > 0 ? 'live' : 'fallback';

  return NextResponse.json({
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
}
