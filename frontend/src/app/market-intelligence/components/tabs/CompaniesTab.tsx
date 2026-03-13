"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import TradingViewWidget from "../TradingViewWidget";
import { S } from "../../types";

const DEFAULT_SYMBOLS = [
  { symbol: "AAPL", name: "Apple" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "GOOGL", name: "Alphabet" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "NVDA", name: "NVIDIA" },
  { symbol: "JPM", name: "JP Morgan" },
];

export default function CompaniesTab() {
  const [searchInput, setSearchInput] = useState("");
  const [activeSymbol, setActiveSymbol] = useState("AAPL");

  const handleSearch = () => {
    const sym = searchInput.trim().toUpperCase();
    if (sym) setActiveSymbol(sym);
  };

  return (
    <div style={{ padding: "12px 24px 24px" }}>
      {/* Search bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            flex: 1,
            maxWidth: 400,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 5,
            padding: "8px 12px",
          }}
        >
          <Search size={14} style={{ color: S.tertiary, flexShrink: 0 }} />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Enter symbol (e.g. AAPL, MSFT, TSLA)"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontFamily: S.fontMono,
              fontSize: 13,
              color: S.primary,
              letterSpacing: "0.02em",
            }}
          />
        </div>
        <button
          onClick={handleSearch}
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            fontWeight: 600,
            color: S.cyan,
            background: "rgba(28,98,242,0.1)",
            border: `1px solid ${S.cyan}`,
            borderRadius: 5,
            padding: "8px 16px",
            cursor: "pointer",
            letterSpacing: "0.06em",
          }}
        >
          SEARCH
        </button>

        {/* Quick picks */}
        <div style={{ display: "flex", gap: 4, marginLeft: 12 }}>
          {DEFAULT_SYMBOLS.map((s) => (
            <button
              key={s.symbol}
              onClick={() => setActiveSymbol(s.symbol)}
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: activeSymbol === s.symbol ? 700 : 500,
                color: activeSymbol === s.symbol ? S.cyan : S.tertiary,
                background:
                  activeSymbol === s.symbol
                    ? "rgba(28,98,242,0.1)"
                    : "transparent",
                border: `1px solid ${activeSymbol === s.symbol ? S.cyan : S.rim}`,
                borderRadius: 4,
                padding: "4px 8px",
                cursor: "pointer",
              }}
            >
              {s.symbol}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div style={{ display: "flex", gap: 16 }}>
        {/* Left: Symbol Overview */}
        <div
          style={{
            flex: 3,
            border: `1px solid ${S.rim}`,
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          <TradingViewWidget
            key={`overview-${activeSymbol}`}
            scriptSrc="embed-widget-symbol-overview.js"
            config={{
              symbols: [[activeSymbol, `${activeSymbol}|1D`]],
              chartOnly: false,
              width: "100%",
              height: "100%",
              locale: "en",
              dateRange: "12M",
              showVolume: false,
              showMA: false,
              hideDateRanges: false,
              hideMarketStatus: false,
              hideSymbolLogo: false,
              scalePosition: "right",
              scaleMode: "Normal",
              fontFamily: "IBM Plex Sans",
              fontSize: "10",
              noTimeScale: false,
              valuesTracking: "1",
              changeMode: "price-and-percent",
              chartType: "area",
              lineWidth: 2,
              lineType: 0,
              gridLineColor: "rgba(42, 46, 57, 0)",
              lineColor: "rgba(28, 98, 242, 1)",
              topColor: "rgba(28, 98, 242, 0.3)",
              bottomColor: "rgba(28, 98, 242, 0.04)",
            }}
            height="calc(100vh - 220px)"
          />
        </div>

        {/* Right: Technical Analysis */}
        <div
          style={{
            flex: 2,
            border: `1px solid ${S.rim}`,
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          <TradingViewWidget
            key={`ta-${activeSymbol}`}
            scriptSrc="embed-widget-technical-analysis.js"
            config={{
              interval: "1D",
              width: "100%",
              height: "100%",
              symbol: activeSymbol,
              showIntervalTabs: true,
              locale: "en",
            }}
            height="calc(100vh - 220px)"
          />
        </div>
      </div>
    </div>
  );
}
