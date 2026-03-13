"use client";

import TradingViewWidget from "../TradingViewWidget";
import { S } from "../../types";

const INDICES = [
  { symbol: "FOREXCOM:SPXUSD", label: "S&P 500" },
  { symbol: "FOREXCOM:NSXUSD", label: "Nasdaq 100" },
  { symbol: "TVC:DXY", label: "Dollar Index" },
];

export default function SignalsTab() {
  return (
    <div style={{ padding: "12px 24px 24px" }}>
      {/* Technical Analysis Grid */}
      <div
        style={{
          fontFamily: S.fontMono,
          fontSize: 12,
          fontWeight: 600,
          color: S.tertiary,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          padding: "0 0 8px 0",
          borderBottom: `1px solid ${S.rim}`,
          marginBottom: 12,
        }}
      >
        PASSIVE TECHNICALS
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
        {INDICES.map((idx) => (
          <div
            key={idx.symbol}
            style={{
              border: `1px solid ${S.rim}`,
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 600,
                color: S.primary,
                padding: "8px 12px",
                background: S.bgPanel,
                borderBottom: `1px solid ${S.rim}`,
                letterSpacing: "0.04em",
              }}
            >
              {idx.label}
            </div>
            <TradingViewWidget
              scriptSrc="embed-widget-technical-analysis.js"
              config={{
                interval: "1D",
                width: "100%",
                height: "100%",
                symbol: idx.symbol,
                showIntervalTabs: true,
                locale: "en",
              }}
              height={380}
            />
          </div>
        ))}
      </div>

      {/* News & Catalyst Stream */}
      <div
        style={{
          fontFamily: S.fontMono,
          fontSize: 12,
          fontWeight: 600,
          color: S.tertiary,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          padding: "0 0 8px 0",
          borderBottom: `1px solid ${S.rim}`,
          marginBottom: 12,
        }}
      >
        NEWS & CATALYST STREAM
      </div>

      <div
        style={{
          border: `1px solid ${S.rim}`,
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <TradingViewWidget
          scriptSrc="embed-widget-timeline.js"
          config={{
            feedMode: "all_symbols",
            market: "stock",
            displayMode: "regular",
            width: "100%",
            height: "100%",
            locale: "en",
          }}
          height={500}
        />
      </div>
    </div>
  );
}
