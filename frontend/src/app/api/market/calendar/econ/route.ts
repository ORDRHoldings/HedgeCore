import { NextResponse } from "next/server";
import { econCalCache } from "@/lib/market/cache";
import { buildEconEvents } from "@/lib/market/transforms";
import type { FinnhubEconEvent } from "@/lib/market/transforms";

const FH_KEY  = process.env.FINNHUB_API_KEY ?? "";
const FH_BASE = "https://finnhub.io/api/v1";
const CACHE_KEY = "econ_calendar";
const TTL_MS = 900_000;

interface FinnhubCalendarResponse {
  economicCalendar?: FinnhubEconEvent[];
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  const ts = Date.now();

  const cached = econCalCache.get(CACHE_KEY);
  if (cached) {
    console.log(JSON.stringify({ ts, endpoint: "/api/market/calendar/econ", duration_ms: 0, cached: true, status: 200 }));
    return NextResponse.json({ events: cached, cachedAt: ts });
  }

  if (!FH_KEY) {
    console.log(JSON.stringify({ ts, endpoint: "/api/market/calendar/econ", duration_ms: 0, cached: false, status: 200, reason: "no_api_key" }));
    return NextResponse.json({ events: [], cachedAt: ts, error: "FINNHUB_API_KEY not configured" });
  }

  const today = new Date();
  const weekOut = new Date(today);
  weekOut.setDate(today.getDate() + 7);

  const t0 = Date.now();
  try {
    const res = await fetch(
      `${FH_BASE}/calendar/economic?from=${isoDate(today)}&to=${isoDate(weekOut)}&token=${FH_KEY}`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`);

    const json = await res.json() as FinnhubCalendarResponse;
    const raw = json.economicCalendar ?? [];
    if (!Array.isArray(raw)) throw new Error("Expected array in economicCalendar");

    const events = buildEconEvents(raw);
    econCalCache.set(CACHE_KEY, events, TTL_MS);

    const duration_ms = Date.now() - t0;
    console.log(JSON.stringify({ ts, endpoint: "/api/market/calendar/econ", duration_ms, cached: false, status: 200, count: events.length }));
    return NextResponse.json({ events, cachedAt: ts });
  } catch (err) {
    const duration_ms = Date.now() - t0;
    console.log(JSON.stringify({ ts, endpoint: "/api/market/calendar/econ", duration_ms, cached: false, status: 200, error: String(err) }));
    return NextResponse.json({ events: [], cachedAt: ts, error: String(err) });
  }
}
