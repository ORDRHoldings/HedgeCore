"use client";
/**
 * ChartStatusBar.tsx -- Bottom status bar for the ORDR Chart Platform
 *
 * Displays market status, bar countdown, price scale toggle,
 * screenshot button, and fullscreen button. 24px height, TradingView-style.
 */
import React, { useState, useEffect, useCallback } from "react";
import { THEME } from "./core/theme";
import { getBarCountdown, getMarketStatus } from "./core/utils";

/* ═══════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════ */

export type PriceScale = "linear" | "log" | "percent";

export interface ChartStatusBarProps {
  interval: string;
  lastBarTimestamp: number;
  priceScale: PriceScale;
  onPriceScaleChange: (scale: PriceScale) => void;
  onScreenshot: () => void;
  onFullscreen: () => void;
}

/* ═══════════════════════════════════════════════════════
   Styles
   ═══════════════════════════════════════════════════════ */

const BAR_HEIGHT = 24;
const BORDER_COLOR = "#2A2E39";
const TEXT_COLOR = THEME.axisText;
const TEXT_ACTIVE = THEME.labelText;
const HOVER_BG = "#2A2E39";

const S = {
  bar: {
    height: BAR_HEIGHT,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "0 12px",
    background: THEME.axisBg,
    borderTop: `1px solid ${BORDER_COLOR}`,
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    color: TEXT_COLOR,
    userSelect: "none" as const,
    flexShrink: 0,
  },
  separator: {
    width: 1,
    height: 14,
    background: BORDER_COLOR,
    flexShrink: 0,
  },
  spacer: {
    flex: 1,
  },
  dot: (color: string) => ({
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: color,
    display: "inline-block",
    marginRight: 4,
    flexShrink: 0,
  }),
  btn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: "none",
    color: TEXT_COLOR,
    cursor: "pointer",
    padding: "2px 6px",
    borderRadius: 3,
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    lineHeight: 1,
    height: 18,
  },
} as const;

/* ═══════════════════════════════════════════════════════
   Inline SVG Icons (14x14, minimal)
   ═══════════════════════════════════════════════════════ */

function CameraIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════
   Price Scale Cycle
   ═══════════════════════════════════════════════════════ */

const SCALE_ORDER: PriceScale[] = ["linear", "log", "percent"];
const SCALE_LABEL: Record<PriceScale, string> = {
  linear: "LINEAR",
  log: "LOG",
  percent: "%",
};

/* ═══════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════ */

export default function ChartStatusBar({
  interval,
  lastBarTimestamp,
  priceScale,
  onPriceScaleChange,
  onScreenshot,
  onFullscreen,
}: ChartStatusBarProps) {
  const [countdown, setCountdown] = useState(() => getBarCountdown(interval, lastBarTimestamp));
  const [market, setMarket] = useState(() => getMarketStatus());
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  // Bar countdown: update every second
  useEffect(() => {
    setCountdown(getBarCountdown(interval, lastBarTimestamp));
    const id = setInterval(() => {
      setCountdown(getBarCountdown(interval, lastBarTimestamp));
    }, 1000);
    return () => clearInterval(id);
  }, [interval, lastBarTimestamp]);

  // Market status: update every 30 seconds
  useEffect(() => {
    setMarket(getMarketStatus());
    const id = setInterval(() => {
      setMarket(getMarketStatus());
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const cyclePriceScale = useCallback(() => {
    const idx = SCALE_ORDER.indexOf(priceScale);
    const next = SCALE_ORDER[(idx + 1) % SCALE_ORDER.length];
    onPriceScaleChange(next);
  }, [priceScale, onPriceScaleChange]);

  const btnStyle = (id: string): React.CSSProperties => ({
    ...S.btn,
    background: hoveredBtn === id ? HOVER_BG : "transparent",
    color: hoveredBtn === id ? TEXT_ACTIVE : TEXT_COLOR,
  });

  return (
    <div style={S.bar}>
      {/* Market Status */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
        <span style={S.dot(market.isOpen ? "#26A69A" : "#EF5350")} />
        <span style={{ color: market.isOpen ? "#26A69A" : "#EF5350", fontWeight: 600 }}>
          {market.isOpen ? "MARKET OPEN" : "MARKET CLOSED"}
        </span>
        {market.isOpen && market.sessions.length > 0 && market.sessions[0] !== "closed" && (
          <span style={{ color: TEXT_COLOR, marginLeft: 4 }}>
            {market.label}
          </span>
        )}
      </div>

      {/* Separator */}
      <div style={S.separator} />

      {/* Bar Countdown */}
      <span style={{ whiteSpace: "nowrap" }}>
        Next bar: <span style={{ color: TEXT_ACTIVE }}>{countdown}</span>
      </span>

      {/* Separator */}
      <div style={S.separator} />

      {/* Spacer */}
      <div style={S.spacer} />

      {/* Price Scale */}
      <button
        style={btnStyle("scale")}
        onClick={cyclePriceScale}
        onMouseEnter={() => setHoveredBtn("scale")}
        onMouseLeave={() => setHoveredBtn(null)}
        title="Cycle price scale"
      >
        {SCALE_LABEL[priceScale]}
      </button>

      {/* Separator */}
      <div style={S.separator} />

      {/* Screenshot */}
      <button
        style={btnStyle("screenshot")}
        onClick={onScreenshot}
        onMouseEnter={() => setHoveredBtn("screenshot")}
        onMouseLeave={() => setHoveredBtn(null)}
        title="Export screenshot"
      >
        <CameraIcon />
      </button>

      {/* Fullscreen */}
      <button
        style={btnStyle("fullscreen")}
        onClick={onFullscreen}
        onMouseEnter={() => setHoveredBtn("fullscreen")}
        onMouseLeave={() => setHoveredBtn(null)}
        title="Toggle fullscreen"
      >
        <ExpandIcon />
      </button>
    </div>
  );
}
