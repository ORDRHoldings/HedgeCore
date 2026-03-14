/**
 * api/market/finnhub/route.ts
 * Server-side proxy for quote requests.
 * Primary: IBKR backend. Fallback: Finnhub API.
 * Keeps FINNHUB_API_KEY server-only (no NEXT_PUBLIC_ exposure).
 */
import { NextRequest, NextResponse } from "next/server";

// IBKR backend (primary)
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Fallback: Finnhub
const FH_BASE = "https://finnhub.io/api/v1";
const FH_KEY = process.env.FINNHUB_API_KEY ?? "";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  // ── Primary: IBKR backend ─────────────────────────────────────────────────
  // Determine type hint: FX symbols contain "=X" or known FX patterns
  const isFx = symbol.includes("=X") || /^[A-Z]{6}$/.test(symbol);
  const type = isFx ? "fx" : "equity";
  try {
    const ibkrRes = await fetch(
      `${API_BASE}/api/v1/market-data/live/quote?symbol=${encodeURIComponent(symbol)}&type=${type}`,
      {
        signal: AbortSignal.timeout(5_000),
        headers: { "Content-Type": "application/json" },
      },
    );
    if (ibkrRes.ok) {
      const ibkrData = await ibkrRes.json() as {
        symbol?: string;
        bid?: number;
        ask?: number;
        mid?: number;
        last?: number;
        open?: number;
        high?: number;
        low?: number;
        prev_close?: number;
        change?: number;
        change_pct?: number;
        source?: string;
      };
      // Transform IBKR format to Finnhub quote format:
      // { c: current, d: change, dp: changePct, h: high, l: low, o: open, pc: prevClose, t: timestamp }
      const current = ibkrData.last ?? ibkrData.mid ?? 0;
      if (current > 0) {
        const prevClose = ibkrData.prev_close ?? current;
        const data = {
          c:  current,
          d:  ibkrData.change ?? parseFloat((current - prevClose).toFixed(4)),
          dp: ibkrData.change_pct ?? parseFloat((((current - prevClose) / prevClose) * 100).toFixed(4)),
          h:  ibkrData.high ?? current,
          l:  ibkrData.low ?? current,
          o:  ibkrData.open ?? prevClose,
          pc: prevClose,
          t:  Math.floor(Date.now() / 1000),
          _source: "ibkr",
        };
        return NextResponse.json(data, {
          headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=15" },
        });
      }
    }
  } catch {
    // IBKR unavailable — fall through to Finnhub
  }

  // ── Fallback: Finnhub ─────────────────────────────────────────────────────
  if (!FH_KEY) {
    return NextResponse.json({ error: "FINNHUB_API_KEY not configured and IBKR unavailable" }, { status: 503 });
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
