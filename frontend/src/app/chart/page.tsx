"use client";
/**
 * /chart — ORDR Chart Platform
 *
 * Full-screen Canvas 2D charting with pair selector, timeframe selector,
 * and the ChartEngine component.
 */
import React, { useState, Suspense } from "react";
import { useAuth } from "@/lib/authContext";
import { useChartData } from "@/hooks/useChartData";
import ChartEngine from "@/components/chart/ChartEngine";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel, #FFFFFF)",
  bgDeep: "var(--bg-deep, #F8FAFC)",
  bgSub: "var(--bg-sub, #F1F5F9)",
  rim: "var(--border-rim, #E2E8F0)",
  accent: "var(--accent-cyan, #1C62F2)",
  textPrimary: "var(--text-primary, #0F172A)",
  textSecondary: "var(--text-secondary, #334155)",
  textTertiary: "var(--text-tertiary, #94A3B8)",
} as const;

const FX_PAIRS = [
  "USDMXN", "EURUSD", "GBPUSD", "USDJPY", "USDCAD",
  "AUDUSD", "NZDUSD", "USDCHF", "EURGBP", "EURJPY",
  "GBPJPY", "AUDJPY", "USDCNH", "USDBRL", "USDZAR",
  "USDTRY", "USDINR",
];

const TIMEFRAMES: { label: string; value: string }[] = [
  { label: "1m", value: "1min" },
  { label: "5m", value: "5min" },
  { label: "15m", value: "15min" },
  { label: "1H", value: "1h" },
  { label: "4H", value: "4h" },
  { label: "1D", value: "1day" },
  { label: "1W", value: "1week" },
  { label: "1M", value: "1month" },
];

function ChartPageInner() {
  const { token } = useAuth();
  const [pair, setPair] = useState("EURUSD");
  const [interval, setInterval] = useState("1day");
  const { bars, loading, error, source, refetch } = useChartData(pair, interval, token || "", 1000);

  if (!token) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: S.fontMono, color: S.textTertiary }}>
        Authentication required
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: S.bgDeep }}>
      {/* ── Top Control Bar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 16px",
        borderBottom: `1px solid ${S.rim}`,
        background: S.bgPanel,
        minHeight: 48,
      }}>
        {/* Pair Selector */}
        <select
          value={pair}
          onChange={e => setPair(e.target.value)}
          style={{
            fontFamily: S.fontMono,
            fontSize: 13,
            fontWeight: 700,
            padding: "4px 8px",
            border: `1px solid ${S.rim}`,
            borderRadius: 6,
            background: S.bgPanel,
            color: S.textPrimary,
            cursor: "pointer",
            outline: "none",
          }}
        >
          {FX_PAIRS.map(p => (
            <option key={p} value={p}>{p.slice(0, 3)}/{p.slice(3)}</option>
          ))}
        </select>

        {/* Timeframes */}
        <div style={{ display: "flex", gap: 2, background: S.bgSub, borderRadius: 6, padding: 2 }}>
          {TIMEFRAMES.map(tf => (
            <button
              key={tf.value}
              onClick={() => setInterval(tf.value)}
              style={{
                fontFamily: S.fontMono,
                fontSize: 11,
                fontWeight: interval === tf.value ? 700 : 500,
                padding: "4px 10px",
                borderRadius: 4,
                border: "none",
                background: interval === tf.value ? S.bgPanel : "transparent",
                color: interval === tf.value ? S.accent : S.textSecondary,
                cursor: "pointer",
                boxShadow: interval === tf.value ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
                transition: "all 0.15s",
              }}
            >
              {tf.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Refresh */}
        <button
          onClick={refetch}
          style={{
            fontFamily: S.fontMono,
            fontSize: 11,
            padding: "4px 12px",
            borderRadius: 6,
            border: `1px solid ${S.rim}`,
            background: S.bgPanel,
            color: S.textSecondary,
            cursor: "pointer",
          }}
        >
          REFRESH
        </button>

        {/* Bar count */}
        <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.textTertiary }}>
          {bars.length} bars
        </span>
      </div>

      {/* ── Chart Area ── */}
      <div style={{ flex: 1, padding: 8 }}>
        <ChartEngine
          bars={bars}
          pair={pair}
          interval={interval}
          source={source}
          loading={loading}
          error={error}
        />
      </div>
    </div>
  );
}

export default function ChartPage() {
  return (
    <Suspense fallback={<div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "monospace", color: "#94A3B8" }}>Loading chart...</div>}>
      <ChartPageInner />
    </Suspense>
  );
}
