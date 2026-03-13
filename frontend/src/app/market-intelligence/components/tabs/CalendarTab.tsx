"use client";

import TradingViewWidget from "../TradingViewWidget";
import { S } from "../../types";

export default function CalendarTab() {
  return (
    <div style={{ padding: "12px 24px 24px" }}>
      <div
        style={{
          border: `1px solid ${S.rim}`,
          borderRadius: 6,
          overflow: "hidden",
        }}
      >
        <TradingViewWidget
          scriptSrc="embed-widget-events.js"
          config={{
            width: "100%",
            height: "100%",
            locale: "en",
            importanceFilter: "-1,0,1",
            countryFilter: "us,eu,gb,jp,cn,de,au,ca,ch",
          }}
          height="calc(100vh - 160px)"
        />
      </div>
    </div>
  );
}
