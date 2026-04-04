/**
 * /api/chart-data/[symbol] — server-side Twelve Data proxy
 *
 * Keeps the API key out of the client bundle.
 * In-process LRU-style cache prevents hammering the 8 req/min free limit.
 *
 * Query params:
 *   interval  — workspace or TD TF code: 1m/1min 5m/5min 1h 4h D/1day W M
 *   limit     — bars requested (capped at 800 for TD free plan)
 *
 * Returns: { symbol, interval, source, count, bars: Bar[] }
 * Bar: { t: unix_s, o, h, l, c, v }
 */
import { NextRequest, NextResponse } from 'next/server';

const TD_BASE = 'https://api.twelvedata.com';
const API_KEY = process.env.TWELVEDATA_API_KEY ?? '';

// ── TF normalisation ──────────────────────────────────────────────────────────
const TF_MAP: Record<string, string> = {
  '1m':  '1min',  '3m':  '3min',  '5m':  '5min',
  '15m': '15min', '30m': '30min',
  '1h':  '1h',    '2h':  '2h',    '4h':  '4h',
  'D':   '1day',  '1D':  '1day',
  'W':   '1week', '1W':  '1week',
  'M':   '1month','1M':  '1month',
  // Already-converted pass-through
  '1min':  '1min',  '3min':  '3min',  '5min':  '5min',
  '15min': '15min', '30min': '30min',
  '1day':  '1day',  '1week': '1week', '1month': '1month',
};

// Cache TTL per interval class (ms)
function cacheTTL(tdInterval: string): number {
  if (tdInterval.includes('min')) return 30_000;       // 30 s for intraday
  if (tdInterval === '1h' || tdInterval === '2h') return 60_000;
  if (tdInterval === '4h') return 120_000;
  return 300_000;                                       // 5 min for daily+
}

// ── In-process cache (survives across requests in the same serverless instance) ──
interface CacheEntry { data: unknown; expiresAt: number }
const cache = new Map<string, CacheEntry>();

// ── Symbol normalisation ──────────────────────────────────────────────────────
function normSymbol(raw: string): string {
  const s = raw.toUpperCase();
  // 6-char alpha = forex / crypto pair → EUR/USD, BTC/USD
  if (/^[A-Z]{6}$/.test(s)) return `${s.slice(0, 3)}/${s.slice(3)}`;
  // XAU/USD style already has a slash
  return s;
}

// ── Datetime → unix seconds ───────────────────────────────────────────────────
function parseTs(datetime: string): number {
  return Math.floor(new Date(datetime.replace(' ', 'T')).getTime() / 1000);
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface TDBar {
  datetime: string;
  open: string; high: string; low: string; close: string; volume: string;
}
interface TDResponse {
  status?: string; code?: number; message?: string;
  meta?: Record<string, unknown>; values?: TDBar[];
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ symbol: string }> },
) {
  if (!API_KEY) {
    return NextResponse.json({ error: 'TWELVEDATA_API_KEY not configured' }, { status: 500 });
  }

  const { symbol } = await context.params;
  const sp         = req.nextUrl.searchParams;
  const wsTF       = sp.get('interval') ?? '1day';
  const limit      = Math.min(Number(sp.get('limit') ?? 500), 800);
  const tdInterval = TF_MAP[wsTF] ?? wsTF;
  const tdSymbol   = normSymbol(decodeURIComponent(symbol));
  const cacheKey   = `${tdSymbol}|${tdInterval}|${limit}`;

  // ── Serve from cache ───────────────────────────────────────────────────────
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) {
    return NextResponse.json(hit.data, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'public, max-age=30' },
    });
  }

  // ── Fetch from Twelve Data ─────────────────────────────────────────────────
  const url = new URL(`${TD_BASE}/time_series`);
  url.searchParams.set('symbol',     tdSymbol);
  url.searchParams.set('interval',   tdInterval);
  url.searchParams.set('outputsize', String(limit));
  url.searchParams.set('order',      'ASC');
  url.searchParams.set('apikey',     API_KEY);

  let tdRes: Response;
  try {
    tdRes = await fetch(url.toString(), { cache: 'no-store' });
  } catch (err) {
    return NextResponse.json({ error: `Upstream fetch failed: ${err}` }, { status: 502 });
  }

  const json: TDResponse = await tdRes.json();

  if (json.status === 'error' || json.code) {
    return NextResponse.json(
      { error: json.message ?? 'Twelve Data error', code: json.code },
      { status: json.code === 429 ? 429 : 400 },
    );
  }

  const bars = (json.values ?? []).map((v: TDBar) => ({
    t: parseTs(v.datetime),
    o: parseFloat(v.open),
    h: parseFloat(v.high),
    l: parseFloat(v.low),
    c: parseFloat(v.close),
    v: parseFloat(v.volume) || 0,
  }));

  const payload = {
    symbol: decodeURIComponent(symbol),
    interval: wsTF,
    source: 'TwelveData',
    count: bars.length,
    bars,
  };

  // Store in cache
  cache.set(cacheKey, { data: payload, expiresAt: Date.now() + cacheTTL(tdInterval) });
  // Evict stale entries (keep cache bounded)
  if (cache.size > 200) {
    const now = Date.now();
    for (const [k, v] of cache) { if (v.expiresAt < now) cache.delete(k); }
  }

  return NextResponse.json(payload, {
    headers: { 'X-Cache': 'MISS', 'Cache-Control': 'public, max-age=30' },
  });
}
