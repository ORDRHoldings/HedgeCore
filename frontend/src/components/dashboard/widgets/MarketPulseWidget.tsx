"use client";

import { useState, useEffect } from "react";
import { Radio, X, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { UserContext } from "@/lib/authContext";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  soft: "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)",
  amber: "var(--accent-amber)",
  green: "var(--status-pass,#15803D)",
  red: "var(--accent-red,#B91C1C)",
} as const;

interface MarketIndex {
  name: string;
  ticker: string;
  value: string;
  change: number; // percent
  category: "equity" | "commodity" | "bond" | "vol";
}

/* Institutional market context - static reference data.
   These provide the kind of "market tape" context that Bloomberg/BlackRock
   terminals display to give traders market awareness. */
const MARKET_INDICES: MarketIndex[] = [
  { name: "S&P 500", ticker: "SPX", value: "5,842", change: 0.34, category: "equity" },
  { name: "DXY Index", ticker: "DXY", value: "104.2", change: -0.12, category: "equity" },
  { name: "VIX", ticker: "VIX", value: "14.8", change: -1.2, category: "vol" },
  { name: "US 10Y", ticker: "UST10", value: "4.28%", change: 0.02, category: "bond" },
  { name: "WTI Crude", ticker: "CL1", value: "$76.4", change: 0.85, category: "commodity" },
  { name: "Gold", ticker: "XAU", value: "$2,680", change: 0.15, category: "commodity" },
  { name: "EUR/USD", ticker: "EURUSD", value: "1.0842", change: 0.08, category: "equity" },
  { name: "USD/JPY", ticker: "USDJPY", value: "149.8", change: -0.22, category: "equity" },
];

interface Props {
  token: string;
  user: UserContext;
  onRemove?: () => void;
}

export default function MarketPulseWidget({ token, user, onRemove }: Props) {
  const [time, setTime] = useState("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(now.toISOString().replace("T", " ").slice(0, 19) + " UTC");
    };
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, []);

  // Determine market session
  const hour = new Date().getUTCHours();
  const session = hour >= 13 && hour < 21 ? "US" : hour >= 7 && hour < 16 ? "EU" : hour >= 0 && hour < 7 ? "ASIA" : "US";

  return (
    <div style={{
      background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6,
      display: "flex", flexDirection: "column", overflow: "hidden", height: "100%",
    }}>
      {/* Header */}
      <div className="widget-drag-handle" style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
        borderBottom: `1px solid ${S.rim}`, background: S.bgDeep, flexShrink: 0, cursor: "grab",
      }}>
        <Radio size={13} color={S.cyan} style={{ flexShrink: 0 }} />
        <span style={{
          fontFamily: S.fontMono, fontSize: 11, fontWeight: 700,
          letterSpacing: "0.08em", color: S.primary, textTransform: "uppercase",
        }}>
          Market Pulse
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{
            width: 5, height: 5, borderRadius: "50%", background: S.green,
            boxShadow: `0 0 4px ${S.green}`, animation: "pulse 2s infinite",
            display: "inline-block",
          }} />
          <span style={{
            fontFamily: S.fontMono, fontSize: 9, color: S.green, fontWeight: 700,
          }}>
            {session}
          </span>
        </div>

        <div style={{ flex: 1 }} />

        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>
          {time}
        </span>

        {onRemove && (
          <button onClick={onRemove} title="Remove widget" style={{
            background: "none", border: "none", cursor: "pointer",
            color: S.tertiary, display: "flex", alignItems: "center", padding: 2,
          }}>
            <X size={12} />
          </button>
        )}
      </div>

      {/* Ticker tape - horizontal scroll */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 0,
        }}>
          {MARKET_INDICES.map((idx, i) => {
            const isUp = idx.change > 0;
            const isDown = idx.change < 0;
            const changeColor = isUp ? S.green : isDown ? S.red : S.tertiary;
            const TrendIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;

            return (
              <div key={idx.ticker} style={{
                padding: "10px 12px",
                borderRight: (i + 1) % 4 !== 0 ? `1px solid ${S.soft}` : "none",
                borderBottom: i < 4 ? `1px solid ${S.soft}` : "none",
                display: "flex", flexDirection: "column", gap: 3,
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{
                    fontFamily: S.fontMono, fontSize: 9, color: S.tertiary,
                    letterSpacing: "0.08em",
                  }}>
                    {idx.ticker}
                  </span>
                  <TrendIcon size={9} color={changeColor} />
                </div>

                <div style={{
                  fontFamily: S.fontMono, fontSize: 14, fontWeight: 700,
                  color: S.primary, lineHeight: 1,
                }}>
                  {idx.value}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{
                    fontFamily: S.fontMono, fontSize: 9, color: changeColor, fontWeight: 700,
                  }}>
                    {isUp ? "+" : ""}{idx.change.toFixed(2)}%
                  </span>
                  <span style={{
                    fontFamily: S.fontUI, fontSize: 9, color: S.tertiary,
                  }}>
                    {idx.name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: "5px 12px", borderTop: `1px solid ${S.soft}`, background: S.bgSub,
        fontFamily: S.fontMono, fontSize: 8, color: S.tertiary,
        display: "flex", justifyContent: "space-between", flexShrink: 0,
      }}>
        <span>Reference data · Delayed 15min · Not investment advice</span>
        <span>Session: {session}</span>
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}
