"use client";
/**
 * /market -- ORDR Market (Free)
 *
 * Full-screen dark chart page. No sidebar, no auth required.
 * Uses the public chart data endpoint via usePublicChartData.
 */
import React, { useState, Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePublicChartData } from "@/hooks/usePublicChartData";

const ChartEngine = dynamic(() => import("@/components/chart/ChartEngine"), {
  ssr: false,
});

const FONT_MONO = "'IBM Plex Mono', monospace";
const FONT_UI = "'IBM Plex Sans', sans-serif";

const ASSET_GROUPS: { label: string; items: { symbol: string; display: string }[] }[] = [
  {
    label: "FX Majors",
    items: [
      { symbol: "EURUSD", display: "EUR/USD" },
      { symbol: "GBPUSD", display: "GBP/USD" },
      { symbol: "USDJPY", display: "USD/JPY" },
      { symbol: "USDCAD", display: "USD/CAD" },
      { symbol: "AUDUSD", display: "AUD/USD" },
      { symbol: "NZDUSD", display: "NZD/USD" },
      { symbol: "USDCHF", display: "USD/CHF" },
    ],
  },
  {
    label: "FX Crosses",
    items: [
      { symbol: "EURGBP", display: "EUR/GBP" },
      { symbol: "EURJPY", display: "EUR/JPY" },
      { symbol: "GBPJPY", display: "GBP/JPY" },
      { symbol: "AUDJPY", display: "AUD/JPY" },
      { symbol: "EURCHF", display: "EUR/CHF" },
      { symbol: "EURAUD", display: "EUR/AUD" },
      { symbol: "GBPAUD", display: "GBP/AUD" },
      { symbol: "GBPNZD", display: "GBP/NZD" },
      { symbol: "AUDNZD", display: "AUD/NZD" },
      { symbol: "CADJPY", display: "CAD/JPY" },
      { symbol: "CHFJPY", display: "CHF/JPY" },
      { symbol: "NZDJPY", display: "NZD/JPY" },
    ],
  },
  {
    label: "FX EM",
    items: [
      { symbol: "USDMXN", display: "USD/MXN" },
      { symbol: "USDCNH", display: "USD/CNH" },
      { symbol: "USDZAR", display: "USD/ZAR" },
      { symbol: "USDTRY", display: "USD/TRY" },
      { symbol: "USDBRL", display: "USD/BRL" },
      { symbol: "USDINR", display: "USD/INR" },
      { symbol: "USDSGD", display: "USD/SGD" },
      { symbol: "USDHKD", display: "USD/HKD" },
      { symbol: "USDNOK", display: "USD/NOK" },
      { symbol: "USDSEK", display: "USD/SEK" },
      { symbol: "USDPLN", display: "USD/PLN" },
      { symbol: "USDDKK", display: "USD/DKK" },
      { symbol: "USDCZK", display: "USD/CZK" },
      { symbol: "USDHUF", display: "USD/HUF" },
    ],
  },
  {
    label: "Crypto",
    items: [
      { symbol: "BTCUSD", display: "BTC/USD" },
      { symbol: "ETHUSD", display: "ETH/USD" },
      { symbol: "XRPUSD", display: "XRP/USD" },
      { symbol: "SOLUSD", display: "SOL/USD" },
      { symbol: "ADAUSD", display: "ADA/USD" },
      { symbol: "DOGEUSD", display: "DOGE/USD" },
      { symbol: "DOTUSD", display: "DOT/USD" },
      { symbol: "AVAXUSD", display: "AVAX/USD" },
      { symbol: "MATICUSD", display: "MATIC/USD" },
      { symbol: "LINKUSD", display: "LINK/USD" },
      { symbol: "BNBUSD", display: "BNB/USD" },
      { symbol: "LTCUSD", display: "LTC/USD" },
    ],
  },
  {
    label: "Indices",
    items: [
      { symbol: "SPX", display: "S&P 500" },
      { symbol: "NDX", display: "NASDAQ" },
      { symbol: "DJI", display: "Dow Jones" },
      { symbol: "IXIC", display: "NASDAQ Comp" },
      { symbol: "RUT", display: "Russell 2000" },
      { symbol: "VIX", display: "VIX" },
      { symbol: "FTSE", display: "FTSE 100" },
      { symbol: "DAX", display: "DAX" },
      { symbol: "CAC", display: "CAC 40" },
      { symbol: "N225", display: "Nikkei 225" },
      { symbol: "HSI", display: "Hang Seng" },
      { symbol: "STOXX50E", display: "Euro Stoxx" },
    ],
  },
  {
    label: "Commodities",
    items: [
      { symbol: "XAUUSD", display: "Gold" },
      { symbol: "XAGUSD", display: "Silver" },
    ],
  },
];

const TIMEFRAMES: { label: string; value: string }[] = [
  { label: "1m", value: "1min" },
  { label: "3m", value: "3min" },
  { label: "5m", value: "5min" },
  { label: "15m", value: "15min" },
  { label: "30m", value: "30min" },
  { label: "1H", value: "1h" },
  { label: "4H", value: "4h" },
  { label: "1D", value: "1day" },
  { label: "1W", value: "1week" },
  { label: "1M", value: "1month" },
];

function getDisplayName(symbol: string): string {
  for (const group of ASSET_GROUPS) {
    const item = group.items.find(i => i.symbol === symbol);
    if (item) return item.display;
  }
  return symbol.length > 3 ? `${symbol.slice(0, 3)}/${symbol.slice(3)}` : symbol;
}

function MarketPageInner() {
  const [pair, setPair] = useState("EURUSD");
  const [interval, setInterval] = useState("1day");
  const { bars, loading, error, source, refetch } = usePublicChartData(pair, interval, 500);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0B1120", overflow: "hidden", position: "fixed", inset: 0 }}>
      {/* ── Dark Top Bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 16px",
          background: "#131722",
          borderBottom: "1px solid #2A2E39",
          minHeight: 48,
          flexShrink: 0,
        }}
      >
        {/* Left: Logo */}
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 6, marginRight: 8 }}>
          <span style={{ fontFamily: FONT_MONO, fontSize: 16, fontWeight: 700, color: "#D1D4DC", letterSpacing: "0.06em" }}>
            ORDR
          </span>
          <span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 500, color: "#545B69", letterSpacing: "0.04em" }}>
            MARKET
          </span>
        </Link>
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: 9,
            fontWeight: 700,
            color: "#26A69A",
            background: "rgba(38, 166, 154, 0.15)",
            padding: "2px 6px",
            borderRadius: 3,
            letterSpacing: "0.08em",
          }}
        >
          FREE
        </span>

        <div style={{ width: 1, height: 24, background: "#2A2E39", margin: "0 8px" }} />

        {/* Pair selector with optgroup */}
        <select
          value={pair}
          onChange={(e) => setPair(e.target.value)}
          style={{
            fontFamily: FONT_MONO,
            fontSize: 13,
            fontWeight: 700,
            padding: "4px 8px",
            border: "1px solid #2A2E39",
            borderRadius: 6,
            background: "#1E222D",
            color: "#D1D4DC",
            cursor: "pointer",
            outline: "none",
            maxWidth: 180,
          }}
        >
          {ASSET_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.items.map((item) => (
                <option key={item.symbol} value={item.symbol}>
                  {item.display}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        {/* Timeframes */}
        <div style={{ display: "flex", gap: 2, background: "#1E222D", borderRadius: 6, padding: 2 }}>
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setInterval(tf.value)}
              style={{
                fontFamily: FONT_MONO,
                fontSize: 11,
                fontWeight: interval === tf.value ? 700 : 500,
                padding: "4px 10px",
                borderRadius: 4,
                border: "none",
                background: interval === tf.value ? "#2A2E39" : "transparent",
                color: interval === tf.value ? "#D1D4DC" : "#545B69",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {tf.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Bar count */}
        <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: "#545B69" }}>
          {bars.length} bars
        </span>

        {/* Refresh */}
        <button
          onClick={refetch}
          style={{
            fontFamily: FONT_MONO,
            fontSize: 11,
            fontWeight: 600,
            padding: "4px 12px",
            borderRadius: 6,
            border: "1px solid #2A2E39",
            background: "#1E222D",
            color: "#787B86",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          REFRESH
        </button>

        <div style={{ width: 1, height: 24, background: "#2A2E39", margin: "0 4px" }} />

        {/* Sign in link */}
        <Link
          href="/auth/login"
          style={{
            fontFamily: FONT_UI,
            fontSize: 12,
            fontWeight: 600,
            color: "#4A90D9",
            textDecoration: "none",
            letterSpacing: "0.02em",
            whiteSpace: "nowrap",
          }}
        >
          SIGN IN FOR FULL ACCESS
        </Link>
      </div>

      {/* ── Chart Area ── */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <ChartEngine
          bars={bars}
          pair={pair}
          interval={interval}
          source={source}
          loading={loading}
          error={error}
          onPairChange={setPair}
        />
      </div>
    </div>
  );
}

export default function MarketPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100vh",
            background: "#0B1120",
            color: "#787B86",
            fontFamily: "monospace",
          }}
        >
          Loading market...
        </div>
      }
    >
      <MarketPageInner />
    </Suspense>
  );
}
