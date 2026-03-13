"use client";

import { useState } from "react";
import TradingViewWidget from "../TradingViewWidget";
import { S } from "../../types";

type HeatmapType = "STOCKS" | "ETFS" | "FOREX" | "CRYPTO";

const TYPE_CONFIG: Record<
  HeatmapType,
  { script: string; config: Record<string, unknown> }
> = {
  STOCKS: {
    script: "embed-widget-stock-heatmap.js",
    config: {
      exchanges: [],
      dataSource: "SPX500",
      grouping: "sector",
      blockSize: "market_cap_basic",
      blockColor: "change",
      locale: "en",
      hasTopBar: true,
      isDataSetEnabled: true,
      width: "100%",
      height: "100%",
    },
  },
  ETFS: {
    script: "embed-widget-etf-heatmap.js",
    config: {
      dataSource: "AllUSEtf",
      blockSize: "aum_basic",
      blockColor: "change",
      grouping: "asset_class",
      locale: "en",
      hasTopBar: true,
      width: "100%",
      height: "100%",
    },
  },
  FOREX: {
    script: "embed-widget-forex-heatmap.js",
    config: {
      currencies: [
        "EUR", "USD", "JPY", "GBP", "CHF", "AUD", "CAD", "NZD",
        "CNY", "MXN", "BRL", "SEK", "NOK", "SGD", "KRW",
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
      hasTopBar: true,
      width: "100%",
      height: "100%",
    },
  },
};

const TYPE_OPTIONS: { key: HeatmapType; label: string }[] = [
  { key: "STOCKS", label: "Stocks" },
  { key: "ETFS", label: "ETFs" },
  { key: "FOREX", label: "Forex" },
  { key: "CRYPTO", label: "Crypto" },
];

export default function HeatmapTab() {
  const [type, setType] = useState<HeatmapType>("STOCKS");
  const cfg = TYPE_CONFIG[type];

  return (
    <div style={{ padding: "12px 24px 24px" }}>
      {/* Selector strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 12,
        }}
      >
        {TYPE_OPTIONS.map((opt) => {
          const isActive = opt.key === type;
          return (
            <button
              key={opt.key}
              onClick={() => setType(opt.key)}
              style={{
                fontFamily: S.fontMono,
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? S.cyan : S.tertiary,
                background: isActive ? "rgba(28,98,242,0.1)" : "transparent",
                border: `1px solid ${isActive ? S.cyan : S.rim}`,
                borderRadius: 5,
                padding: "6px 16px",
                cursor: "pointer",
                transition: "all 0.12s",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Full-viewport heatmap */}
      <div
        style={{
          border: `1px solid ${S.rim}`,
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <TradingViewWidget
          key={type}
          scriptSrc={cfg.script}
          config={cfg.config}
          height="calc(100vh - 200px)"
        />
      </div>
    </div>
  );
}
