import { NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Market Sectors & ETFs API Route (Frontend Proxy)
// GET /api/market-sectors
// Proxies to backend /v1/market/sectors which uses yfinance for real Yahoo Finance data
// ─────────────────────────────────────────────────────────────────────────────

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/market/sectors`, {
      next: { revalidate: 30 }, // cache 30 seconds
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Backend market data unavailable', status: res.status },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: 'Market sectors fetch failed', detail: String(err) },
      { status: 500 },
    );
  }
}
