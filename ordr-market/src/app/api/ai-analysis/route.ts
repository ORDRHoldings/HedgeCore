import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001"; // fast + cost-efficient for chart analysis

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  interface MarketSnapshot {
    rsi: number | null;
    rsiSignal: string;
    macdHistogram: number | null;
    macdSignal: string;
    emaPosition: number | null;
    emaSignal: string;
    bbPosition: number | null;
    bbSignal: string;
    stochK: number | null;
    stochSignal: string;
    lastStructure: string | null;
    structureSignal: string;
    prevHigh: number | null;
    prevLow: number | null;
    prevClose: number | null;
    barsLoaded: number;
  }

  let body: {
    symbol: string;
    timeframe: string;
    price: number;
    chartConfig: Record<string, boolean>;
    subPanes: string[];
    marketData?: MarketSnapshot;
    messages: { role: "user" | "assistant"; content: string }[];
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { symbol, timeframe, price, chartConfig, subPanes, marketData, messages } = body;

  const activeOverlays = Object.entries(chartConfig)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(", ") || "none";

  const fmt = (n: number | null | undefined, digits = 2) =>
    n != null && Number.isFinite(n) ? n.toFixed(digits) : "N/A";

  const marketContext = marketData
    ? `\nLive computed indicators (${marketData.barsLoaded} bars):
- RSI(14): ${fmt(marketData.rsi, 1)} [${marketData.rsiSignal}]
- MACD histogram: ${fmt(marketData.macdHistogram, 5)} [${marketData.macdSignal}]
- Price vs EMA20: ${marketData.emaPosition != null ? (marketData.emaPosition >= 0 ? "+" : "") + fmt(marketData.emaPosition, 3) + "%" : "N/A"} [${marketData.emaSignal}]
- Bollinger %B: ${fmt(marketData.bbPosition, 1)}% [${marketData.bbSignal}]
- Stochastic %K: ${fmt(marketData.stochK, 0)} [${marketData.stochSignal}]
- Market structure: ${marketData.lastStructure ?? "N/A"} [${marketData.structureSignal}]
- Previous session: H=${fmt(marketData.prevHigh, 5)} L=${fmt(marketData.prevLow, 5)} C=${fmt(marketData.prevClose, 5)}`
    : "";

  const systemPrompt = `You are a professional financial market analyst embedded in the ORDR trading terminal.
Current chart context:
- Symbol: ${symbol}
- Timeframe: ${timeframe}
- Current price: ${price}
- Active overlays: ${activeOverlays}
- Active sub-pane indicators: ${subPanes.join(", ") || "none"}${marketContext}

Provide concise, actionable analysis focused on price action, structure, and risk.
Keep responses under 200 words. Use professional trading terminology.
Do not provide investment advice or price targets.`;

  // Build Anthropic messages array (exclude the initial greeting if it's assistant-only)
  const anthropicMessages = messages
    .filter(m => m.role === "user" || (m.role === "assistant" && messages.some(u => u.role === "user")))
    .map(m => ({ role: m.role, content: m.content }));

  if (anthropicMessages.length === 0 || anthropicMessages[0].role !== "user") {
    return NextResponse.json({ error: "No user message provided" }, { status: 400 });
  }

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: systemPrompt,
        messages: anthropicMessages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `Anthropic API error: ${response.status}` }, { status: 502 });
    }

    const data = await response.json();
    const content = data.content?.[0]?.text ?? "";
    return NextResponse.json({ content });
  } catch (e) {
    return NextResponse.json({ error: "Failed to reach Anthropic API" }, { status: 502 });
  }
}
