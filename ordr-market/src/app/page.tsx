"use client";
/**
 * ORDR Market — Main Chart Page
 *
 * Full-screen professional charting platform.
 * 77 technical indicators · 55 drawing tools · TradingView-parity engine
 * No authentication required.
 */
import React, { useState, Suspense } from "react";
import dynamic from "next/dynamic";
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
      { symbol: "SPX",      display: "S&P 500"     },
      { symbol: "NDX",      display: "NASDAQ"       },
      { symbol: "DJI",      display: "Dow Jones"    },
      { symbol: "IXIC",     display: "NASDAQ Comp"  },
      { symbol: "RUT",      display: "Russell 2000" },
      { symbol: "VIX",      display: "VIX"          },
      { symbol: "FTSE",     display: "FTSE 100"     },
      { symbol: "DAX",      display: "DAX"          },
      { symbol: "CAC",      display: "CAC 40"       },
      { symbol: "N225",     display: "Nikkei 225"   },
      { symbol: "HSI",      display: "Hang Seng"    },
      { symbol: "STOXX50E", display: "Euro Stoxx"   },
    ],
  },
  {
    label: "US Equities",
    items: [
      { symbol: "SPY",   display: "SPY"   },
      { symbol: "QQQ",   display: "QQQ"   },
      { symbol: "AAPL",  display: "AAPL"  },
      { symbol: "MSFT",  display: "MSFT"  },
      { symbol: "AMZN",  display: "AMZN"  },
      { symbol: "TSLA",  display: "TSLA"  },
      { symbol: "GOOGL", display: "GOOGL" },
      { symbol: "META",  display: "META"  },
      { symbol: "NVDA",  display: "NVDA"  },
      { symbol: "AMD",   display: "AMD"   },
      { symbol: "NFLX",  display: "NFLX"  },
      { symbol: "DIS",   display: "DIS"   },
      { symbol: "BA",    display: "BA"    },
      { symbol: "JPM",   display: "JPM"   },
      { symbol: "GS",    display: "GS"    },
      { symbol: "V",     display: "V"     },
      { symbol: "MA",    display: "MA"    },
      { symbol: "JNJ",   display: "JNJ"   },
      { symbol: "PFE",   display: "PFE"   },
      { symbol: "XOM",   display: "XOM"   },
      { symbol: "COIN",  display: "COIN"  },
      { symbol: "PLTR",  display: "PLTR"  },
    ],
  },
  {
    label: "Commodities",
    items: [
      { symbol: "XAUUSD",      display: "Gold"        },
      { symbol: "XAGUSD",      display: "Silver"      },
      { symbol: "CRUDE_OIL",   display: "Crude Oil"   },
      { symbol: "NATURAL_GAS", display: "Natural Gas" },
      { symbol: "COPPER",      display: "Copper"      },
      { symbol: "WHEAT",       display: "Wheat"       },
      { symbol: "CORN",        display: "Corn"        },
    ],
  },
];

const TIMEFRAMES: { label: string; value: string }[] = [
  { label: "1m",  value: "1min"   },
  { label: "3m",  value: "3min"   },
  { label: "5m",  value: "5min"   },
  { label: "15m", value: "15min"  },
  { label: "30m", value: "30min"  },
  { label: "1H",  value: "1h"     },
  { label: "4H",  value: "4h"     },
  { label: "1D",  value: "1day"   },
  { label: "1W",  value: "1week"  },
  { label: "1M",  value: "1month" },
];

function ChartPageInner() {
  const [pair, setPair]         = useState("EURUSD");
  const [interval, setInterval] = useState("1day");
  const { bars, loading, error, source, refetch } = usePublicChartData(pair, interval, 500);

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100vh",
      background: "#0B1120", overflow: "hidden", position: "fixed", inset: 0,
    }}>
      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "0 16px", background: "#131722",
        borderBottom: "1px solid #2A2E39", minHeight: 48, flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: 8 }}>
          <span style={{ fontFamily: FONT_MONO, fontSize: 16, fontWeight: 700,
            color: "#D1D4DC", letterSpacing: "0.06em" }}>
            ORDR
          </span>
          <span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 500,
            color: "#545B69", letterSpacing: "0.04em" }}>
            MARKET
          </span>
        </div>

        <span style={{ fontFamily: FONT_MONO, fontSize: 12, fontWeight: 700, color: "#26A69A",
          background: "rgba(38, 166, 154, 0.15)", padding: "2px 6px",
          borderRadius: 3, letterSpacing: "0.08em" }}>
          PRO
        </span>

        <div style={{ width: 1, height: 24, background: "#2A2E39", margin: "0 8px" }} />

        {/* Pair selector */}
        <select value={pair} onChange={(e) => setPair(e.target.value)} style={{
          fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700,
          padding: "4px 8px", border: "1px solid #2A2E39", borderRadius: 6,
          background: "#1E222D", color: "#D1D4DC", cursor: "pointer", outline: "none", maxWidth: 180,
        }}>
          {ASSET_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.items.map((item) => (
                <option key={item.symbol} value={item.symbol}>{item.display}</option>
              ))}
            </optgroup>
          ))}
        </select>

        {/* Timeframes */}
        <div style={{ display: "flex", gap: 2, background: "#1E222D", borderRadius: 6, padding: 2 }}>
          {TIMEFRAMES.map((tf) => (
            <button key={tf.value} onClick={() => setInterval(tf.value)} style={{
              fontFamily: FONT_MONO, fontSize: 12,
              fontWeight: interval === tf.value ? 700 : 500,
              padding: "4px 10px", borderRadius: 4, border: "none",
              background: interval === tf.value ? "#2A2E39" : "transparent",
              color: interval === tf.value ? "#D1D4DC" : "#545B69",
              cursor: "pointer", transition: "all 0.15s",
            }}>
              {tf.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Stats */}
        <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: "#545B69" }}>
          {bars.length > 0 && `${bars.length} bars · `}{source}
        </span>

        {/* Refresh */}
        <button onClick={refetch} style={{
          fontFamily: FONT_MONO, fontSize: 12, fontWeight: 600,
          padding: "4px 12px", borderRadius: 6,
          border: "1px solid #2A2E39", background: "#1E222D",
          color: "#787B86", cursor: "pointer", transition: "all 0.15s",
        }}>
          REFRESH
        </button>

        <div style={{ width: 1, height: 24, background: "#2A2E39", margin: "0 4px" }} />

        {/* Feature tags */}
        <div style={{ display: "flex", gap: 6 }}>
          {["77 INDICATORS", "55 DRAWING TOOLS", "BACKTESTING"].map((tag) => (
            <span key={tag} style={{
              fontFamily: FONT_UI, fontSize: 10, fontWeight: 600,
              color: "#545B69", padding: "2px 6px",
              background: "rgba(255,255,255,0.04)",
              borderRadius: 3, letterSpacing: "0.04em",
            }}>
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Chart */}
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

export default function HomePage() {
  return (
    <Suspense fallback={
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", background: "#0B1120", color: "#787B86", fontFamily: "monospace",
      }}>
        Loading ORDR Market...
      </div>
    }>
      <ChartPageInner />
    </Suspense>
  );
}
