import { NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Market Sectors & ETFs API Route
// GET /api/market-sectors
// Proxies to backend yfinance endpoint with fallback to simulated data
// ─────────────────────────────────────────────────────────────────────────────

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

// Fallback market data (current as of Feb 2026)
const FALLBACK_QUOTES = [
  { symbol: "SPY", name: "S&P 500", price: 689.30, change: -3.85, changePercent: -0.56, volume: 67867592, category: "market" },
  { symbol: "QQQ", name: "Nasdaq 100", price: 609.24, change: -7.15, changePercent: -1.16, volume: 45234102, category: "market" },
  { symbol: "DIA", name: "Dow Jones", price: 494.86, change: 0.05, changePercent: 0.01, volume: 4234567, category: "market" },
  { symbol: "IWM", name: "Russell 2000", price: 265.99, change: 1.40, changePercent: 0.53, volume: 23456789, category: "market" },
  { symbol: "XLK", name: "Technology", price: 248.95, change: 1.12, changePercent: 0.45, volume: 12345678, category: "sector" },
  { symbol: "XLV", name: "Healthcare", price: 158.40, change: 0.34, changePercent: 0.21, volume: 8765432, category: "sector" },
  { symbol: "XLF", name: "Financials", price: 47.25, change: 0.22, changePercent: 0.47, volume: 15678901, category: "sector" },
  { symbol: "XLE", name: "Energy", price: 92.80, change: -0.45, changePercent: -0.48, volume: 9876543, category: "sector" },
  { symbol: "XLY", name: "Consumer Discr.", price: 196.45, change: 0.85, changePercent: 0.43, volume: 6543210, category: "sector" },
  { symbol: "XLP", name: "Consumer Staples", price: 81.20, change: -0.15, changePercent: -0.18, volume: 7654321, category: "sector" },
  { symbol: "XLI", name: "Industrials", price: 138.65, change: 0.62, changePercent: 0.45, volume: 5432109, category: "sector" },
  { symbol: "XLU", name: "Utilities", price: 70.85, change: -0.18, changePercent: -0.25, volume: 4321098, category: "sector" },
  { symbol: "XLB", name: "Materials", price: 98.40, change: 0.34, changePercent: 0.35, volume: 3210987, category: "sector" },
  { symbol: "XLRE", name: "Real Estate", price: 39.90, change: -0.12, changePercent: -0.30, volume: 6789012, category: "sector" },
  { symbol: "XLC", name: "Communications", price: 96.80, change: 0.55, changePercent: 0.57, volume: 8901234, category: "sector" },
];

export async function GET() {
  try {
    // Try to fetch from backend yfinance endpoint
    const res = await fetch(`${BACKEND_URL}/api/v1/market/sectors`, {
      next: { revalidate: 30 }, // cache 30 seconds
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }

    // Backend unavailable - return fallback data
    return NextResponse.json({
      quotes: FALLBACK_QUOTES,
      dataSource: "fallback",
      timestamp: new Date().toISOString(),
      source: "Simulated",
      note: "Using fallback data - backend unavailable. Start backend for live Yahoo Finance data.",
    });

  } catch (err) {
    // Network error or timeout - return fallback
    return NextResponse.json({
      quotes: FALLBACK_QUOTES,
      dataSource: "fallback",
      timestamp: new Date().toISOString(),
      source: "Simulated",
      note: "Using fallback data - backend connection failed. Start backend for live Yahoo Finance data.",
    });
  }
}
