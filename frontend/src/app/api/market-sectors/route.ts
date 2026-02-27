import { NextRequest, NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Market Sectors & ETFs API Route
// GET /api/market-sectors
// Returns: Wall Street sector ETFs + major market indices with live prices
// ─────────────────────────────────────────────────────────────────────────────

const AV_KEY = process.env.ALPHA_VANTAGE_API_KEY ?? '';
const AV_BASE = 'https://www.alphavantage.co/query';

interface ETFConfig {
  symbol: string;
  name: string;
  category: 'sector' | 'market';
}

// 11 Sector SPDR ETFs (Select Sector SPDRs)
const SECTOR_ETFS: ETFConfig[] = [
  { symbol: 'XLK', name: 'Technology', category: 'sector' },
  { symbol: 'XLV', name: 'Healthcare', category: 'sector' },
  { symbol: 'XLF', name: 'Financials', category: 'sector' },
  { symbol: 'XLE', name: 'Energy', category: 'sector' },
  { symbol: 'XLY', name: 'Consumer Discr.', category: 'sector' },
  { symbol: 'XLP', name: 'Consumer Staples', category: 'sector' },
  { symbol: 'XLI', name: 'Industrials', category: 'sector' },
  { symbol: 'XLU', name: 'Utilities', category: 'sector' },
  { symbol: 'XLB', name: 'Materials', category: 'sector' },
  { symbol: 'XLRE', name: 'Real Estate', category: 'sector' },
  { symbol: 'XLC', name: 'Communications', category: 'sector' },
];

// 4 Major Market ETFs
const MARKET_ETFS: ETFConfig[] = [
  { symbol: 'SPY', name: 'S&P 500', category: 'market' },
  { symbol: 'QQQ', name: 'Nasdaq 100', category: 'market' },
  { symbol: 'DIA', name: 'Dow Jones', category: 'market' },
  { symbol: 'IWM', name: 'Russell 2000', category: 'market' },
];

const ALL_ETFS = [...MARKET_ETFS, ...SECTOR_ETFS];

interface QuoteData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  category: 'sector' | 'market';
}

// Fallback static data when API fails
const FALLBACK_DATA: Record<string, { price: number; change: number }> = {
  SPY: { price: 582.42, change: 0.34 },
  QQQ: { price: 498.15, change: 0.52 },
  DIA: { price: 428.90, change: 0.28 },
  IWM: { price: 224.18, change: -0.15 },
  XLK: { price: 225.48, change: 0.68 },
  XLV: { price: 152.32, change: 0.22 },
  XLF: { price: 43.85, change: 0.45 },
  XLE: { price: 89.67, change: 1.12 },
  XLY: { price: 184.92, change: 0.38 },
  XLP: { price: 78.54, change: -0.08 },
  XLI: { price: 128.76, change: 0.42 },
  XLU: { price: 68.32, change: -0.22 },
  XLB: { price: 92.48, change: 0.18 },
  XLRE: { price: 38.65, change: -0.12 },
  XLC: { price: 88.94, change: 0.55 },
};

async function fetchQuote(symbol: string): Promise<any | null> {
  if (!AV_KEY || AV_KEY === 'YOUR_ALPHA_VANTAGE_KEY_HERE') return null;
  try {
    const url = `${AV_BASE}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${AV_KEY}`;
    const res = await fetch(url, { next: { revalidate: 60 } }); // cache 1 min
    if (!res.ok) return null;
    const json = await res.json();
    return json?.['Global Quote'] ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const quotes: QuoteData[] = [];
    let dataSource: 'live' | 'fallback' = 'fallback';

    // Fetch quotes for all ETFs
    const quotePromises = ALL_ETFS.map(async (etf) => {
      const quote = await fetchQuote(etf.symbol);

      if (quote && quote['05. price']) {
        // Live data from Alpha Vantage
        const price = parseFloat(quote['05. price']);
        const change = parseFloat(quote['09. change'] ?? '0');
        const changePercent = parseFloat(quote['10. change percent']?.replace('%', '') ?? '0');
        const volume = parseInt(quote['06. volume'] ?? '0');

        return {
          symbol: etf.symbol,
          name: etf.name,
          price,
          change,
          changePercent,
          volume,
          category: etf.category,
        } as QuoteData;
      } else {
        // Fallback to static data
        const fallback = FALLBACK_DATA[etf.symbol];
        return {
          symbol: etf.symbol,
          name: etf.name,
          price: fallback.price,
          change: fallback.change,
          changePercent: fallback.change,
          volume: 0,
          category: etf.category,
        } as QuoteData;
      }
    });

    const results = await Promise.all(quotePromises);
    quotes.push(...results);

    // Check if we have any live data
    const hasLiveData = results.some((q) => q.volume > 0);
    dataSource = hasLiveData ? 'live' : 'fallback';

    return NextResponse.json({
      quotes,
      dataSource,
      timestamp: new Date().toISOString(),
      note: dataSource === 'live'
        ? 'Live data from Alpha Vantage'
        : 'Indicative fallback data - configure ALPHA_VANTAGE_API_KEY for live quotes',
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Market sectors fetch failed', detail: String(err) },
      { status: 500 },
    );
  }
}
