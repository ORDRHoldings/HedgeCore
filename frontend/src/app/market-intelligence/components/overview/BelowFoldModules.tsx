"use client";

import TradingViewWidget from "../TradingViewWidget";
import { S } from "../../types";

function SectionHeader({ title }: { title: string }) {
  return (
    <div
      style={{
        fontFamily: S.fontMono,
        fontSize: 12,
        fontWeight: 600,
        color: S.tertiary,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        padding: "20px 0 8px 0",
        borderBottom: `1px solid ${S.rim}`,
        marginBottom: 12,
      }}
    >
      {title}
    </div>
  );
}

export default function BelowFoldModules() {
  return (
    <div style={{ padding: "0 0 40px 0" }}>
      {/* Layer 3: Market Breadth */}
      <SectionHeader title="Market Breadth" />
      <div
        style={{
          border: `1px solid ${S.rim}`,
          borderRadius: 6,
          overflow: "hidden",
          marginBottom: 24,
        }}
      >
        <TradingViewWidget
          scriptSrc="embed-widget-market-overview.js"
          config={{
            showChart: true,
            locale: "en",
            width: "100%",
            height: "100%",
            largeChartUrl: "",
            plotLineColorGrowing: "rgba(5, 150, 105, 1)",
            plotLineColorFalling: "rgba(220, 38, 38, 1)",
            gridLineColor: "rgba(42, 46, 57, 0)",
            scaleFontColor: "rgba(134, 137, 147, 1)",
            belowLineFillColorGrowing: "rgba(5, 150, 105, 0.12)",
            belowLineFillColorFalling: "rgba(220, 38, 38, 0.12)",
            belowLineFillColorGrowingBottom: "rgba(5, 150, 105, 0)",
            belowLineFillColorFallingBottom: "rgba(220, 38, 38, 0)",
            symbolActiveColor: "rgba(28, 98, 242, 0.12)",
            tabs: [
              {
                title: "Indices",
                symbols: [
                  { s: "FOREXCOM:SPXUSD", d: "S&P 500" },
                  { s: "FOREXCOM:NSXUSD", d: "US 100" },
                  { s: "BLACKBULL:US30", d: "Dow 30" },
                  { s: "INDEX:RUT", d: "Russell 2000" },
                  { s: "TVC:UKX", d: "FTSE 100" },
                  { s: "XETR:DAX", d: "DAX" },
                ],
              },
              {
                title: "Forex",
                symbols: [
                  { s: "FX_IDC:EURUSD", d: "EUR/USD" },
                  { s: "FX_IDC:USDJPY", d: "USD/JPY" },
                  { s: "FX_IDC:GBPUSD", d: "GBP/USD" },
                  { s: "FX_IDC:USDMXN", d: "USD/MXN" },
                  { s: "FX_IDC:USDCAD", d: "USD/CAD" },
                  { s: "FX_IDC:USDCHF", d: "USD/CHF" },
                ],
              },
              {
                title: "Commodities",
                symbols: [
                  { s: "TVC:GOLD", d: "Gold" },
                  { s: "TVC:SILVER", d: "Silver" },
                  { s: "TVC:USOIL", d: "WTI Crude" },
                  { s: "NYMEX:NG1!", d: "Natural Gas" },
                ],
              },
              {
                title: "Bonds",
                symbols: [
                  { s: "TVC:US02Y", d: "US 2Y Yield" },
                  { s: "TVC:US10Y", d: "US 10Y Yield" },
                  { s: "TVC:US30Y", d: "US 30Y Yield" },
                  { s: "TVC:DE10Y", d: "Germany 10Y" },
                ],
              },
            ],
          }}
          height={420}
        />
      </div>

      {/* Layer 4: Sector Screener */}
      <SectionHeader title="Sector Performance" />
      <div
        style={{
          border: `1px solid ${S.rim}`,
          borderRadius: 6,
          overflow: "hidden",
          marginBottom: 24,
        }}
      >
        <TradingViewWidget
          scriptSrc="embed-widget-screener.js"
          config={{
            width: "100%",
            height: "100%",
            defaultColumn: "overview",
            defaultScreen: "most_capitalized",
            market: "us",
            showToolbar: true,
            locale: "en",
          }}
          height={400}
        />
      </div>

      {/* Layer 5: Technical Analysis + News side by side */}
      <div style={{ display: "flex", gap: 16 }}>
        {/* Technicals */}
        <div style={{ flex: 1 }}>
          <SectionHeader title="Technical Analysis — S&P 500" />
          <div
            style={{
              border: `1px solid ${S.rim}`,
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            <TradingViewWidget
              scriptSrc="embed-widget-technical-analysis.js"
              config={{
                interval: "1D",
                width: "100%",
                height: "100%",
                symbol: "FOREXCOM:SPXUSD",
                showIntervalTabs: true,
                locale: "en",
              }}
              height={400}
            />
          </div>
        </div>

        {/* News Stream */}
        <div style={{ flex: 1 }}>
          <SectionHeader title="News Stream" />
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
              height={400}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
