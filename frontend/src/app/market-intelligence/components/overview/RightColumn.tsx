"use client";

import TradingViewWidget from "../TradingViewWidget";
import { S } from "../../types";

export default function RightColumn() {
  return (
    <div
      style={{
        width: 320,
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
        ECONOMIC CALENDAR
      </div>

      <TradingViewWidget
        scriptSrc="embed-widget-events.js"
        config={{
          width: "100%",
          height: "100%",
          locale: "en",
          importanceFilter: "-1,0,1",
          countryFilter: "us,eu,gb,jp,cn,de",
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
