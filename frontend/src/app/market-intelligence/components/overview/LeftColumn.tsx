"use client";

import TradingViewWidget from "../TradingViewWidget";
import { S } from "../../types";

export default function LeftColumn() {
  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: 0,
      }}
    >
      {/* Section header */}
      <div
        style={{
          fontFamily: S.fontMono,
          fontSize: 12,
          fontWeight: 600,
          color: S.tertiary,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          padding: "10px 0 6px 0",
        }}
      >
        TOP MOVERS
      </div>

      <TradingViewWidget
        scriptSrc="embed-widget-hotlists.js"
        config={{
          dateRange: "1D",
          exchange: "US",
          showSymbolLogo: true,
          width: "100%",
          height: "100%",
          locale: "en",
        }}
        height="calc(100vh - 260px)"
        style={{
          border: `1px solid ${S.rim}`,
          borderRadius: 6,
          overflow: "hidden",
        }}
      />
    </div>
  );
}
