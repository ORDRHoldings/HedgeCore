import { NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Market Sectors & ETFs — IBKR backend (primary) + Finnhub (fallback)
// GET /api/market-sectors
// Cache: 5-minute in-memory TTL
// ─────────────────────────────────────────────────────────────────────────────

// IBKR backend (primary)
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Fallback: Finnhub
const FH_KEY  = process.env.FINNHUB_API_KEY ?? '';
const FH_BASE = 'https://finnhub.io/api/v1';

const SYMBOLS = [
  { symbol: 'SPY',  name: 'S&P 500',           category: 'market' as const },
  { symbol: 'QQQ',  name: 'Nasdaq 100',         category: 'market' as const },
  { symbol: 'DIA',  name: 'Dow Jones',          category: 'market' as const },
  { symbol: 'IWM',  name: 'Russell 2000',       category: 'market' as const },
  { symbol: 'XLK',  name: 'Technology',         category: 'sector' as const },
  { symbol: 'XLF',  name: 'Financials',         category: 'sector' as const },
  { symbol: 'XLE',  name: 'Energy',             category: 'sector' as const },
  { symbol: 'XLV',  name: 'Healthcare',         category: 'sector' as const },
  { symbol: 'XLY',  name: 'Consumer Discr.',    category: 'sector' as const },
  { symbol: 'XLP',  name: 'Consumer Staples',   category: 'sector' as const },
  { symbol: 'XLI',  name: 'Industrials',        category: 'sector' as const },
  { symbol: 'XLU',  name: 'Utilities',          category: 'sector' as const },
  { symbol: 'XLB',  name: 'Materials',          category: 'sector' as const },
  { symbol: 'XLRE', name: 'Real Estate',        category: 'sector' as const },
  { symbol: 'XLC',  name: 'Communications',     category: 'sector' as const },
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

// In-memory cache — 5 min TTL
const CACHE_TTL_MS = 300_000;
let _cache: {
  quotes: QuoteResult[];
  dataSource: string;
  asOf: string;
  liveCount: number;
  ts: number;
} | null = null;

// Fallback — EOD 2026-02-27 (SPY/QQQ confirmed live; others estimated)
const FALLBACK_QUOTES: QuoteResult[] = [
  { symbol: 'SPY',  name: 'S&P 500',         price: 685.99, change: -3.31, changePercent: -0.48, latestTradingDay: '2026-02-27', category: 'market' },
  { symbol: 'QQQ',  name: 'Nasdaq 100',       price: 607.29, change: -1.95, changePercent: -0.32, latestTradingDay: '2026-02-27', category: 'market' },
  { symbol: 'DIA',  name: 'Dow Jones',        price: 434.6,  change: -1.87, changePercent: -0.43, latestTradingDay: '2026-02-27', category: 'market' },
  { symbol: 'IWM',  name: 'Russell 2000',     price: 217.2,  change: -2.14, changePercent: -0.98, latestTradingDay: '2026-02-27', category: 'market' },
  { symbol: 'XLK',  name: 'Technology',       price: 224.5,  change: -2.18, changePercent: -0.96, latestTradingDay: '2026-02-27', category: 'sector' },
  { symbol: 'XLF',  name: 'Financials',       price: 49.2,   change: -0.44, changePercent: -0.89, latestTradingDay: '2026-02-27', category: 'sector' },
  { symbol: 'XLE',  name: 'Energy',           price: 87.5,   change: -0.81, changePercent: -0.92, latestTradingDay: '2026-02-27', category: 'sector' },
  { symbol: 'XLV',  name: 'Healthcare',       price: 147.1,  change:  0.43, changePercent:  0.29, latestTradingDay: '2026-02-27', category: 'sector' },
  { symbol: 'XLY',  name: 'Consumer Discr.',  price: 215.4,  change: -3.12, changePercent: -1.43, latestTradingDay: '2026-02-27', category: 'sector' },
  { symbol: 'XLP',  name: 'Consumer Staples', price: 79.8,   change:  0.18, changePercent:  0.23, latestTradingDay: '2026-02-27', category: 'sector' },
  { symbol: 'XLI',  name: 'Industrials',      price: 135.2,  change: -0.96, changePercent: -0.71, latestTradingDay: '2026-02-27', category: 'sector' },
  { symbol: 'XLU',  name: 'Utilities',        price: 78.4,   change:  0.62, changePercent:  0.80, latestTradingDay: '2026-02-27', category: 'sector' },
  { symbol: 'XLB',  name: 'Materials',        price: 89.6,   change: -0.74, changePercent: -0.82, latestTradingDay: '2026-02-27', category: 'sector' },
  { symbol: 'XLRE', name: 'Real Estate',      price: 41.8,   change:  0.31, changePercent:  0.75, latestTradingDay: '2026-02-27', category: 'sector' },
  { symbol: 'XLC',  name: 'Communications',   price: 106.5,  change: -0.88, changePercent: -0.82, latestTradingDay: '2026-02-27', category: 'sector' },
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
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const q = await res.json() as Record<string, number>;
    if (!q.c || q.c === 0) return null;
    const latestTradingDay = q.t
      ? new Date(q.t * 1000).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    return {
      symbol, name, category,
      price:         parseFloat(q.c.toFixed(2)),
      change:        parseFloat((q.d ?? 0).toFixed(2)),
      changePercent: parseFloat((q.dp ?? 0).toFixed(2)),
      latestTradingDay,
    };
  } catch {
    return null;
  }
}

/**
 * Try IBKR backend for all equity quotes in a single batch call.
 * Returns null if IBKR is unavailable or returns no data.
 */
async function fetchIbkrEquityQuotes(): Promise<QuoteResult[] | null> {
  try {
    const symbolList = SYMBOLS.map((s) => s.symbol).join(',');
    const res = await fetch(
      `${API_BASE}/api/v1/market-data/live/equity-quotes?symbols=${encodeURIComponent(symbolList)}`,
      {
        signal: AbortSignal.timeout(5_000),
        headers: { 'Content-Type': 'application/json' },
      },
    );
    if (!res.ok) return null;

    const json = await res.json() as {
      quotes?: Array<{
        symbol: string;
        price?: number;
        last?: number;
        change?: number;
        change_pct?: number;
        volume?: number;
        timestamp?: number;
      }>;
      source?: string;
      connected?: boolean;
    };

    if (!json.quotes || !Array.isArray(json.quotes) || json.quotes.length === 0) return null;

    const results: QuoteResult[] = [];
    const ibkrMap = new Map(json.quotes.map((q) => [q.symbol, q]));

    for (const def of SYMBOLS) {
      const q = ibkrMap.get(def.symbol);
      if (q) {
        const price = q.price ?? q.last ?? 0;
        if (price <= 0) continue;
        const latestTradingDay = q.timestamp
          ? new Date(q.timestamp * 1000).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10);
        results.push({
          symbol: def.symbol,
          name: def.name,
          category: def.category,
          price: parseFloat(price.toFixed(2)),
          change: parseFloat((q.change ?? 0).toFixed(2)),
          changePercent: parseFloat((q.change_pct ?? 0).toFixed(2)),
          latestTradingDay,
        });
      }
    }

    return results.length > 0 ? results : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const now = Date.now();

  // Serve from cache if fresh
  if (_cache && now - _cache.ts < CACHE_TTL_MS) {
    return NextResponse.json({
      quotes:     _cache.quotes,
      dataSource: _cache.dataSource,
      asOf:       _cache.asOf,
      liveCount:  _cache.liveCount,
      totalCount: _cache.quotes.length,
      timestamp:  new Date(_cache.ts).toISOString(),
      note:       `Cached as of ${_cache.asOf}.`,
    });
  }

  let liveCount = 0;
  let results: QuoteResult[] = [];
  let dataSource = 'fallback';

  // ── Primary: IBKR backend (single batch call) ─────────────────────────────
  const ibkrResults = await fetchIbkrEquityQuotes();
  if (ibkrResults && ibkrResults.length > 0) {
    // Fill in any missing symbols from fallback
    const ibkrSymbols = new Set(ibkrResults.map((r) => r.symbol));
    results = [...ibkrResults];
    for (const def of SYMBOLS) {
      if (!ibkrSymbols.has(def.symbol)) {
        const fb = FALLBACK_QUOTES.find((f) => f.symbol === def.symbol);
        if (fb) results.push(fb);
      }
    }
    liveCount = ibkrResults.length;
    dataSource = 'ibkr';
  } else {
    // ── Fallback: Finnhub (individual calls) ─────────────────────────────────
    if (FH_KEY) {
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
    dataSource = liveCount > 0 ? 'live' : 'fallback';
  }

  const symbolOrder = SYMBOLS.map(s => s.symbol);
  results.sort((a, b) => symbolOrder.indexOf(a.symbol) - symbolOrder.indexOf(b.symbol));

  const latestDay = results.find(r => r.latestTradingDay > '2020-01-01')?.latestTradingDay
    ?? new Date().toISOString().slice(0, 10);

  if (liveCount > 0) {
    _cache = { quotes: results, dataSource, asOf: latestDay, liveCount, ts: now };
  }

  const response = NextResponse.json({
    quotes:     results,
    dataSource,
    asOf:       latestDay,
    liveCount,
    totalCount: results.length,
    timestamp:  new Date().toISOString(),
    note: dataSource === 'ibkr'
      ? `IBKR live data as of ${latestDay}. ${liveCount}/${results.length} symbols live.`
      : dataSource === 'live'
        ? `Finnhub data as of ${latestDay}. ${liveCount}/${results.length} symbols live.`
        : 'Using reference data — configure IBKR or FINNHUB_API_KEY for live quotes.',
  });
  response.headers.set(
    'Cache-Control',
    liveCount > 0
      ? 's-maxage=300, stale-while-revalidate=60'
      : 'no-store',
  );
  return response;
}
