import { NextRequest, NextResponse } from "next/server";

// Alpha Vantage News & Sentiment API
const AV_BASE = "https://www.alphavantage.co/query";

interface AVNewsItem {
  title: string;
  url: string;
  time_published: string; // "20240327T093200"
  source: string;
  summary: string;
  overall_sentiment_label: string;
  overall_sentiment_score: number;
  ticker_sentiment?: { ticker: string; relevance_score: string; ticker_sentiment_label: string }[];
}

interface AVNewsResponse {
  feed?: AVNewsItem[];
  Information?: string;
}

// Convert "20240327T093200" → ISO string "2024-03-27T09:32:00Z"
function avTimeToISO(raw: string): string {
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!m) return new Date().toISOString();
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
}

function sentimentToImportance(score: number): "high" | "medium" | "low" {
  const abs = Math.abs(score);
  if (abs >= 0.35) return "high";
  if (abs >= 0.15) return "medium";
  return "low";
}

function extractTags(item: AVNewsItem): string[] {
  if (!item.ticker_sentiment) return [];
  return item.ticker_sentiment
    .sort((a, b) => parseFloat(b.relevance_score) - parseFloat(a.relevance_score))
    .slice(0, 3)
    .map(t => t.ticker.replace("FOREX:", "").replace("CRYPTO:", "").replace("ETF:", ""))
    .filter(Boolean);
}

// Map workspace symbol → Alpha Vantage ticker string
function symbolToAVTickers(symbol: string): string {
  const s = symbol.toUpperCase();

  // Crypto
  const cryptoMap: Record<string, string> = {
    BTCUSD: 'CRYPTO:BTC', ETHUSD: 'CRYPTO:ETH', XRPUSD: 'CRYPTO:XRP',
    SOLUSD: 'CRYPTO:SOL', ADAUSD: 'CRYPTO:ADA', DOGEUSD: 'CRYPTO:DOGE',
    DOTUSD: 'CRYPTO:DOT', AVAXUSD: 'CRYPTO:AVAX', MATICUSD: 'CRYPTO:MATIC',
    LINKUSD: 'CRYPTO:LINK', BNBUSD: 'CRYPTO:BNB', LTCUSD: 'CRYPTO:LTC',
  };
  if (cryptoMap[s]) return cryptoMap[s];

  // Commodities
  if (s === 'XAUUSD') return 'FOREX:XAU';
  if (s === 'XAGUSD') return 'FOREX:XAG';

  // FX 6-char pairs
  if (/^[A-Z]{6}$/.test(s)) return `FOREX:${s.slice(0, 3)},FOREX:${s.slice(3)}`;

  // Indices → ETF proxies that AV understands
  const idxMap: Record<string, string> = {
    SPX: 'SPY', NDX: 'QQQ', DJI: 'DIA', RUT: 'IWM',
    VIX: 'VIX', FTSE: 'EWU', DAX: 'EWG', N225: 'EWJ',
  };
  if (idxMap[s]) return idxMap[s];

  // Stocks / ETFs — pass directly
  return s;
}

// ── Twelve Data economic calendar ────────────────────────────────────────────

const TD_BASE = "https://api.twelvedata.com";

interface TDCalEvent {
  event:      string;
  date:       string; // "2026-04-07"
  time:       string; // "12:30:00" or "Tentative"
  country:    string;
  currency:   string;
  unit?:      string;
  actual?:    string;
  forecast?:  string;
  previous?:  string;
  importance: number; // 1 | 2 | 3
}

interface TDCalResponse {
  result?: { list?: TDCalEvent[] };
  status?: string;
}

function tdImpToLabel(imp: number): 'high' | 'medium' | 'low' {
  if (imp >= 3) return 'high';
  if (imp === 2) return 'medium';
  return 'low';
}

function fmtDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

async function fetchTDCalendar(): Promise<object[] | null> {
  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey) return null;
  try {
    const today = new Date();
    const start = today.toISOString().slice(0, 10);
    const end = new Date(today.getTime() + 14 * 86400_000).toISOString().slice(0, 10);
    const url = `${TD_BASE}/economic_calendar?start_date=${start}&end_date=${end}&importance=1,2,3&apikey=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 3600 } }); // cache 1h
    if (!res.ok) return null;
    const data: TDCalResponse = await res.json();
    const list: TDCalEvent[] = data?.result?.list ?? [];
    if (!list.length) return null;
    return list.map(e => ({
      day:      fmtDay(e.date),
      date:     e.date,
      time:     e.time?.slice(0, 5) ?? '00:00',
      event:    e.event,
      impact:   tdImpToLabel(e.importance),
      currency: e.currency,
      actual:   e.actual   ?? null,
      forecast: e.forecast ?? null,
      previous: e.previous ?? null,
    }));
  } catch {
    return null;
  }
}

// Fallback: generate a skeleton for the current week from well-known recurring releases
function buildFallbackCalendar(): object[] {
  const now = new Date();
  const dow = now.getUTCDay(); // 0=Sun
  // Find Monday of current week
  const monday = new Date(now.getTime() - (dow === 0 ? 6 : dow - 1) * 86400_000);
  const dateOf = (daysFromMon: number) => {
    const d = new Date(monday.getTime() + daysFromMon * 86400_000);
    return d.toISOString().slice(0, 10);
  };
  const events = [
    { d: 0, time: '09:00', event: 'Euro Zone Sentix Investor Confidence',  impact: 'medium' as const, currency: 'EUR' },
    { d: 1, time: '08:30', event: 'US CPI / Core CPI',                    impact: 'high'   as const, currency: 'USD' },
    { d: 2, time: '08:30', event: 'US PPI',                               impact: 'medium' as const, currency: 'USD' },
    { d: 2, time: '14:30', event: 'EIA Crude Oil Inventories',             impact: 'medium' as const, currency: 'OIL' },
    { d: 3, time: '08:30', event: 'US Initial Jobless Claims',             impact: 'medium' as const, currency: 'USD' },
    { d: 4, time: '08:30', event: 'US Retail Sales',                      impact: 'high'   as const, currency: 'USD' },
    { d: 4, time: '10:00', event: 'U of Michigan Consumer Sentiment',     impact: 'medium' as const, currency: 'USD' },
  ];
  return events.map(e => ({
    day:      fmtDay(dateOf(e.d)),
    date:     dateOf(e.d),
    time:     e.time,
    event:    e.event,
    impact:   e.impact,
    currency: e.currency,
    actual:   null,
    forecast: null,
    previous: null,
  }));
}

// Fallback mock news (fresh-looking content)
const MOCK_NEWS = [
  {
    id: 1, isoTime: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    importance: "high" as const, sentiment: "Bearish",
    title: "Fed signals higher-for-longer; markets reprice rate cut expectations",
    source: "Reuters", url: null, summary: "Federal Reserve officials indicated at recent meetings that inflation progress has stalled, pushing back the timeline for rate cuts. Fed funds futures now price less than two cuts in 2026.",
    tags: ["USD", "RATES", "FED"],
  },
  {
    id: 2, isoTime: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    importance: "high" as const, sentiment: "Bullish",
    title: "NVIDIA beats Q1 estimates; data center revenue up 427% YoY",
    source: "Bloomberg", url: null, summary: "NVDA reported Q1 EPS of $6.12 vs $5.65 expected. Data center segment surged to $22.6B driven by AI chip demand. Shares rose 6% after-hours.",
    tags: ["NVDA", "TECH", "AI"],
  },
  {
    id: 3, isoTime: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    importance: "medium" as const, sentiment: "Neutral",
    title: "ECB's Lagarde reiterates data-dependent approach to future cuts",
    source: "FT", url: null, summary: "ECB President Lagarde said the central bank will remain data-dependent and does not pre-commit to a rate path, echoing recent Fed language around persistence of inflation.",
    tags: ["EUR", "ECB", "RATES"],
  },
  {
    id: 4, isoTime: new Date(Date.now() - 52 * 60 * 1000).toISOString(),
    importance: "medium" as const, sentiment: "Bullish",
    title: "Gold hits record $3,120 as safe-haven demand surges",
    source: "Kitco", url: null, summary: "Spot gold rallied to an all-time high of $3,120/oz as geopolitical tensions and a weakening dollar drove safe-haven flows. Central bank buying remains a structural tailwind.",
    tags: ["XAU", "GOLD", "SAFE-HAVEN"],
  },
  {
    id: 5, isoTime: new Date(Date.now() - 78 * 60 * 1000).toISOString(),
    importance: "low" as const, sentiment: "Neutral",
    title: "UK GDP revised up to 0.4% in Q4 2025",
    source: "ONS", url: null, summary: "The Office for National Statistics revised UK Q4 2025 GDP growth up to 0.4% from the initial 0.3% estimate, citing stronger consumer spending and services output.",
    tags: ["GBP", "UK", "GDP"],
  },
  {
    id: 6, isoTime: new Date(Date.now() - 110 * 60 * 1000).toISOString(),
    importance: "medium" as const, sentiment: "Bearish",
    title: "Bitcoin falls below $82K as tariff fears weigh on risk assets",
    source: "CoinDesk", url: null, summary: "BTC dropped 4.2% to $81,800 as broader risk-off sentiment from trade policy uncertainty spilled into crypto markets. Ethereum fell 5.1%.",
    tags: ["BTC", "ETH", "CRYPTO"],
  },
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol  = searchParams.get("symbol") ?? "SPY";
  const mode    = searchParams.get("mode") ?? "market"; // "symbol" | "market"
  const limit   = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 50);

  // Return live economic calendar
  if (searchParams.get("type") === "calendar") {
    const live = await fetchTDCalendar();
    const events = live ?? buildFallbackCalendar();
    const source = live ? "twelvedata" : "fallback";
    return NextResponse.json({ events, source });
  }

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ items: MOCK_NEWS, source: "mock" });
  }

  try {
    const tickers = mode === "symbol" ? symbolToAVTickers(symbol) : "FOREX:USD,FOREX:EUR,FOREX:GBP,FOREX:JPY";
    const url = `${AV_BASE}?function=NEWS_SENTIMENT&tickers=${encodeURIComponent(tickers)}&limit=${limit}&apikey=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 120 } }); // cache 2 min
    if (!res.ok) return NextResponse.json({ items: MOCK_NEWS, source: "mock" });

    const data: AVNewsResponse = await res.json();
    if (!data.feed || data.Information) {
      return NextResponse.json({ items: MOCK_NEWS, source: "mock" });
    }

    const items = data.feed.slice(0, limit).map((item, i) => ({
      id: i + 1,
      isoTime: avTimeToISO(item.time_published),
      importance: sentimentToImportance(item.overall_sentiment_score),
      sentiment: item.overall_sentiment_label ?? "Neutral",
      title: item.title,
      source: item.source,
      url: item.url,
      summary: item.summary ? item.summary.slice(0, 200) : null,
      tags: extractTags(item),
    }));

    return NextResponse.json({ items, source: "alphavantage" });
  } catch {
    return NextResponse.json({ items: MOCK_NEWS, source: "mock" });
  }
}
