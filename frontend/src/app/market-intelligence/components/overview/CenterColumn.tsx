"use client";

import { useState } from "react";
import TradingViewWidget from "../TradingViewWidget";
import { S } from "../../types";

type HeatmapSource = "SPX500" | "NASDAQ" | "FOREX" | "CRYPTO";

const SOURCE_CONFIG: Record<
  HeatmapSource,
  { script: string; config: Record<string, unknown> }
> = {
  SPX500: {
    script: "embed-widget-stock-heatmap.js",
    config: {
      exchanges: [],
      dataSource: "SPX500",
      grouping: "sector",
      blockSize: "market_cap_basic",
      blockColor: "change",
      locale: "en",
      hasTopBar: false,
      isDataSet498: true,
      width: "100%",
      height: "100%",
    },
  },
  NASDAQ: {
    script: "embed-widget-stock-heatmap.js",
    config: {
      exchanges: [],
      dataSource: "NASDAQ100",
      grouping: "sector",
      blockSize: "market_cap_basic",
      blockColor: "change",
      locale: "en",
      hasTopBar: false,
      isDataSetEnabled: false,
      width: "100%",
      height: "100%",
    },
  },
  FOREX: {
    script: "embed-widget-forex-heatmap.js",
    config: {
      currencies: [
        "EUR", "USD", "JPY", "GBP", "CHF", "AUD", "CAD", "NZD", "MXN", "BRL",
      ],
      locale: "en",
      width: "100%",
      height: "100%",
    },
  },
  CRYPTO: {
    script: "embed-widget-crypto-coins-heatmap.js",
    config: {
      dataSource: "Crypto",
      blockSize: "market_cap_calc",
      blockColor: "change",
      locale: "en",
      hasTopBar: false,
      width: "100%",
      height: "100%",
    },
  },
};

const TOGGLE_OPTIONS: { key: HeatmapSource; label: string }[] = [
  { key: "SPX500", label: "S&P 500" },
  { key: "NASDAQ", label: "Nasdaq" },
  { key: "FOREX", label: "Forex" },
  { key: "CRYPTO", label: "Crypto" },
];

export default function CenterColumn() {
  const [source, setSource] = useState<HeatmapSource>("SPX500");
  const cfg = SOURCE_CONFIG[source];

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
      {/* Toggle bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "10px 0 6px 0",
        }}
      >
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            fontWeight: 600,
            color: S.tertiary,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            marginRight: 8,
          }}
        >
          HEATMAP
        </span>
        {TOGGLE_OPTIONS.map((opt) => {
          const isActive = opt.key === source;
          return (
            <button
              key={opt.key}
              onClick={() => setSource(opt.key)}
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? S.cyan : S.tertiary,
                background: isActive ? "rgba(28,98,242,0.1)" : "transparent",
                border: `1px solid ${isActive ? S.cyan : S.rim}`,
                borderRadius: 4,
                padding: "4px 10px",
                cursor: "pointer",
                transition: "all 0.12s",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Heatmap widget — key forces full remount on source change */}
      <div
        style={{
          flex: 1,
          border: `1px solid ${S.rim}`,
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <TradingViewWidget
          key={source}
          scriptSrc={cfg.script}
          config={cfg.config}
          height="calc(100vh - 260px)"
        />
      </div>
    </div>
  );
}
