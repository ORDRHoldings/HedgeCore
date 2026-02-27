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

// Feb 2026 baseline prices - simulated market data with realistic growth from 2024-2026
const BASELINE_PRICES_2026: Record<string, number> = {
  SPY: 612.85,   // S&P 500: +5.2% from 582 (strong 2024-2026 bull run)
  QQQ: 534.20,   // Nasdaq: +7.2% (tech leadership continues)
  DIA: 448.15,   // Dow: +4.5% (steady industrial growth)
  IWM: 232.50,   // Russell 2000: +3.7% (small-cap recovery)
  XLK: 248.95,   // Technology: +10.4% (AI boom continues)
  XLV: 158.40,   // Healthcare: +4.0% (defensive positioning)
  XLF: 47.25,    // Financials: +7.8% (rising rates benefit)
  XLE: 92.80,    // Energy: +3.5% (oil stabilization)
  XLY: 196.45,   // Consumer Discr: +6.2% (consumer strength)
  XLP: 81.20,    // Consumer Staples: +3.4% (defensive)
  XLI: 138.65,   // Industrials: +7.7% (infrastructure spending)
  XLU: 70.85,    // Utilities: +3.7% (bond proxy)
  XLB: 98.40,    // Materials: +6.4% (commodity demand)
  XLRE: 39.90,   // Real Estate: +3.2% (rates stabilizing)
  XLC: 96.80,    // Communications: +8.8% (digital transformation)
};

// Generate realistic intraday movement (simulated live market)
function generateIntradayMovement(basePrice: number, symbol: string): { price: number; change: number } {
  const now = new Date();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();

  // Market session volatility multipliers
  // US market hours: 14:30-21:00 UTC (9:30am-4pm ET)
  const isUSMarketOpen = hour >= 14 && hour < 21;
  const volatilityMultiplier = isUSMarketOpen ? 1.0 : 0.3; // Lower vol when closed

  // Sector-specific volatility
  const sectorVol: Record<string, number> = {
    SPY: 0.015, QQQ: 0.022, DIA: 0.012, IWM: 0.018,
    XLK: 0.025, XLV: 0.012, XLF: 0.020, XLE: 0.028,
    XLY: 0.018, XLP: 0.010, XLI: 0.016, XLU: 0.009,
    XLB: 0.019, XLRE: 0.015, XLC: 0.021,
  };

  const baseVol = sectorVol[symbol] ?? 0.015;

  // Deterministic pseudo-random based on date + symbol for consistency
  const seed = now.getDate() * 1000 + now.getMonth() * 100 + symbol.charCodeAt(0);
  const pseudoRandom = (Math.sin(seed) * 10000) % 1;
  const trendBias = (pseudoRandom - 0.5) * 2; // -1 to +1

  // Intraday drift with time-of-day pattern
  const intradayProgress = isUSMarketOpen ? (hour - 14) / 6.5 : 0; // 0 to 1 during market hours
  const timePattern = Math.sin(intradayProgress * Math.PI); // Peak volatility mid-day

  // Calculate movement
  const movement = trendBias * baseVol * volatilityMultiplier * (0.5 + timePattern * 0.5);
  const price = basePrice * (1 + movement);
  const change = movement * 100; // Convert to percent

  return {
    price: parseFloat(price.toFixed(2)),
    change: parseFloat(change.toFixed(2)),
  };
}

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
        // Fallback to simulated Feb 2026 market data with realistic intraday movement
        const basePrice = BASELINE_PRICES_2026[etf.symbol];
        const { price, change } = generateIntradayMovement(basePrice, etf.symbol);

        return {
          symbol: etf.symbol,
          name: etf.name,
          price,
          change: price - basePrice, // Absolute change
          changePercent: change,
          volume: 0, // Indicates simulated data
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
      marketDate: '2026-02-26',
      note: dataSource === 'live'
        ? 'Live data from Alpha Vantage'
        : 'Simulated Feb 2026 market data with realistic intraday movements - configure ALPHA_VANTAGE_API_KEY for live quotes',
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Market sectors fetch failed', detail: String(err) },
      { status: 500 },
    );
  }
}
