/**
 * api/market/finnhub/route.ts
 * Server-side proxy for Finnhub quote requests.
 * Keeps FINNHUB_API_KEY server-only (no NEXT_PUBLIC_ exposure).
 */
import { NextRequest, NextResponse } from "next/server";

const FH_BASE = "https://finnhub.io/api/v1";
const FH_KEY = process.env.FINNHUB_API_KEY ?? "";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }
  if (!FH_KEY) {
    return NextResponse.json({ error: "FINNHUB_API_KEY not configured" }, { status: 503 });
  }
  try {
    const res = await fetch(
      `${FH_BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${FH_KEY}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) {
      return NextResponse.json({ error: `Finnhub HTTP ${res.status}` }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=15" },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
