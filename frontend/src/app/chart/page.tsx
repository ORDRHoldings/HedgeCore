"use client";
/**
 * /chart — ORDR Chart Platform
 *
 * Full-screen Canvas 2D charting with pair selector, timeframe selector,
 * ChartEngine, right-side TradingPanel, and bottom StrategyPanel.
 */
import React, { useState, useCallback, Suspense } from "react";
import { useAuth } from "@/lib/authContext";
import { useChartData } from "@/hooks/useChartData";
import ChartEngine from "@/components/chart/ChartEngine";
import TradingPanel from "@/components/chart/TradingPanel";
import StrategyPanel, { StrategyPanelToggle } from "@/components/chart/StrategyPanel";
import { RefreshCw, Layers } from "lucide-react";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "#131722",
  bgDeep: "#0B1120",
  bgSub: "#1E222D",
  rim: "#2A2E39",
  accent: "#1C62F2",
  textPrimary: "#D1D4DC",
  textSecondary: "#787B86",
  textTertiary: "#545B69",
} as const;

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
    label: "US Equities",
    items: [
      { symbol: "SPY", display: "SPY" },
      { symbol: "QQQ", display: "QQQ" },
      { symbol: "AAPL", display: "AAPL" },
      { symbol: "MSFT", display: "MSFT" },
      { symbol: "AMZN", display: "AMZN" },
      { symbol: "TSLA", display: "TSLA" },
      { symbol: "GOOGL", display: "GOOGL" },
      { symbol: "META", display: "META" },
      { symbol: "NVDA", display: "NVDA" },
      { symbol: "AMD", display: "AMD" },
      { symbol: "NFLX", display: "NFLX" },
      { symbol: "DIS", display: "DIS" },
      { symbol: "BA", display: "BA" },
      { symbol: "JPM", display: "JPM" },
      { symbol: "GS", display: "GS" },
      { symbol: "V", display: "V" },
      { symbol: "MA", display: "MA" },
      { symbol: "BRK.B", display: "BRK.B" },
      { symbol: "JNJ", display: "JNJ" },
      { symbol: "PFE", display: "PFE" },
      { symbol: "UNH", display: "UNH" },
      { symbol: "XOM", display: "XOM" },
      { symbol: "CVX", display: "CVX" },
      { symbol: "WMT", display: "WMT" },
      { symbol: "HD", display: "HD" },
      { symbol: "COST", display: "COST" },
      { symbol: "KO", display: "KO" },
      { symbol: "PEP", display: "PEP" },
      { symbol: "MCD", display: "MCD" },
      { symbol: "NKE", display: "NKE" },
      { symbol: "INTC", display: "INTC" },
      { symbol: "CRM", display: "CRM" },
      { symbol: "ADBE", display: "ADBE" },
      { symbol: "PYPL", display: "PYPL" },
      { symbol: "SQ", display: "SQ" },
      { symbol: "COIN", display: "COIN" },
      { symbol: "PLTR", display: "PLTR" },
      { symbol: "SOFI", display: "SOFI" },
      { symbol: "RIVN", display: "RIVN" },
      { symbol: "LCID", display: "LCID" },
    ],
  },
  {
    label: "Commodities",
    items: [
      { symbol: "XAUUSD", display: "Gold" },
      { symbol: "XAGUSD", display: "Silver" },
      { symbol: "CRUDE_OIL", display: "Crude Oil" },
      { symbol: "NATURAL_GAS", display: "Natural Gas" },
      { symbol: "COPPER", display: "Copper" },
      { symbol: "WHEAT", display: "Wheat" },
      { symbol: "CORN", display: "Corn" },
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

function ChartPageInner() {
  const { token } = useAuth();
  const isMobile = useIsMobile();
  const [pair, setPair] = useState("EURUSD");
  const [interval, setInterval] = useState("1day");
  const { bars, loading, error, source, refetch } = useChartData(pair, interval, token || "", 1000);

  /* Panel state */
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(200);

  const toggleRight = useCallback(() => setRightPanelOpen((p) => !p), []);
  const toggleBottom = useCallback(() => setBottomPanelOpen((p) => !p), []);
  const closeBottom = useCallback(() => setBottomPanelOpen(false), []);

  if (!token) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: S.fontMono, color: S.textTertiary }}>
        Authentication required
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: S.bgDeep, overflow: "hidden" }}>
      {/* ── Top Control Bar (compact, ~40px) ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "4px 12px",
        borderBottom: `1px solid ${S.rim}`,
        background: S.bgPanel,
        height: 40,
        minHeight: 40,
        flexWrap: isMobile ? "wrap" : "nowrap",
      }}>
        {/* Pair Selector */}
        <select
          value={pair}
          onChange={e => setPair(e.target.value)}
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            fontWeight: 700,
            padding: "3px 6px",
            border: `1px solid ${S.rim}`,
            borderRadius: 4,
            background: S.bgPanel,
            color: S.textPrimary,
            cursor: "pointer",
            outline: "none",
            maxWidth: 160,
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

        {/* Separator */}
        <div style={{ width: 1, height: 20, background: S.rim, flexShrink: 0 }} />

        {/* Timeframes */}
        <div style={{ display: "flex", gap: 1, background: S.bgSub, borderRadius: 4, padding: 1 }}>
          {TIMEFRAMES.map(tf => (
            <button
              key={tf.value}
              onClick={() => setInterval(tf.value)}
              style={{
                fontFamily: S.fontMono,
                fontSize: 10,
                fontWeight: interval === tf.value ? 700 : 500,
                padding: "3px 8px",
                borderRadius: 3,
                border: "none",
                background: interval === tf.value ? S.bgPanel : "transparent",
                color: interval === tf.value ? S.accent : S.textSecondary,
                cursor: "pointer",
                transition: "all 0.12s",
                lineHeight: "16px",
              }}
            >
              {tf.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Bar count */}
        <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.textTertiary }}>
          {bars.length} bars
        </span>

        {/* Separator */}
        <div style={{ width: 1, height: 20, background: S.rim, flexShrink: 0 }} />

        {/* Refresh */}
        <button
          onClick={refetch}
          title="Refresh data"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 4,
            border: `1px solid ${S.rim}`,
            background: S.bgPanel,
            color: S.textSecondary,
            cursor: "pointer",
            padding: 0,
          }}
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* ── Main area: chart + right panel ── */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Chart area (flex column: chart canvas + bottom panel) */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Chart canvas */}
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

          {/* Bottom panel or toggle */}
          {bottomPanelOpen ? (
            <StrategyPanel
              height={bottomPanelHeight}
              onResize={setBottomPanelHeight}
              onClose={closeBottom}
            />
          ) : (
            <StrategyPanelToggle onClick={toggleBottom} />
          )}
        </div>

        {/* Right panel */}
        <TradingPanel
          isOpen={rightPanelOpen}
          onToggle={toggleRight}
          pair={pair}
          onPairChange={setPair}
        />
      </div>
    </div>
  );
}

export default function ChartPage() {
  return (
    <Suspense fallback={<div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "monospace", color: "#94A3B8" }}>Loading chart...</div>}>
      <ChartPageInner />
    </Suspense>
  );
}
