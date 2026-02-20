"use client";

import React from "react";
import { GitBranch, X } from "lucide-react";
import ReactECharts from "echarts-for-react";
import { UserContext } from "@/lib/authContext";

const S = {
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:    "var(--bg-deep)",
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  rim:       "var(--border-rim)",
  soft:      "var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber)",
  pass:      "var(--status-pass)",
  fail:      "var(--accent-red,#B91C1C)",
} as const;

const BRANCH_DATA = [
  { code: "NYC", name: "New York",    currency: "USD", exposure_usd: 42_500_000, hedge_pct: 74, proposals: 7,  alerts: 2 },
  { code: "MXC", name: "Mexico City", currency: "MXN", exposure_usd: 18_200_000, hedge_pct: 81, proposals: 4,  alerts: 3 },
  { code: "LDN", name: "London",      currency: "GBP", exposure_usd: 28_900_000, hedge_pct: 68, proposals: 5,  alerts: 1 },
];

const totalExposure = BRANCH_DATA.reduce((sum, b) => sum + b.exposure_usd, 0);
const avgHedge      = Math.round(BRANCH_DATA.reduce((sum, b) => sum + b.hedge_pct, 0) / BRANCH_DATA.length);
const totalProps    = BRANCH_DATA.reduce((sum, b) => sum + b.proposals, 0);

interface Props {
  token:    string;
  user:     UserContext;
  onRemove?: () => void;
}

export default function BranchComparisonWidget({ user, onRemove }: Props) {
  const hasPermission = Array.isArray(user?.permissions) &&
    user.permissions.includes("reports.view_all_branches");

  /* ── ECharts option ─────────────────────────────────────────── */
  const chartOption = {
    backgroundColor: "transparent",
    grid: { top: 30, right: 60, bottom: 24, left: 60, containLabel: false },
    xAxis: {
      type: "category" as const,
      data: ["NYC", "MXC", "LDN"],
      axisLine:  { lineStyle: { color: S.rim } },
      axisLabel: { color: S.secondary, fontFamily: S.fontMono, fontSize: 10 },
    },
    yAxis: [
      {
        type: "value" as const,
        name: "$M",
        axisLabel: {
          color: S.tertiary,
          fontFamily: S.fontMono,
          fontSize: 9,
          formatter: (v: number) => `${(v / 1e6).toFixed(0)}M`,
        },
        splitLine: { lineStyle: { color: S.soft } },
      },
      {
        type: "value" as const,
        name: "%",
        min: 0,
        max: 100,
        axisLabel: {
          color: S.tertiary,
          fontFamily: S.fontMono,
          fontSize: 9,
          formatter: (v: number) => `${v}%`,
        },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "Exposure",
        type: "bar" as const,
        data: [42_500_000, 18_200_000, 28_900_000],
        itemStyle: { color: "#3B82F6" },
        barMaxWidth: 40,
        yAxisIndex: 0,
      },
      {
        name: "Hedge %",
        type: "line" as const,
        data: [74, 81, 68],
        symbol: "circle",
        symbolSize: 6,
        itemStyle:  { color: "var(--accent-cyan)" },
        lineStyle:  { color: "var(--accent-cyan)", width: 2 },
        yAxisIndex: 1,
      },
    ],
    legend: {
      top: 0,
      textStyle: { color: S.secondary, fontFamily: S.fontMono, fontSize: 9 },
    },
    tooltip: { trigger: "axis" as const },
  };

  return (
    <div
      style={{
        background:   S.bgPanel,
        border:       `1px solid ${S.rim}`,
        borderRadius: 6,
        display:      "flex",
        flexDirection:"column",
        overflow:     "hidden",
        fontFamily:   S.fontUI,
      }}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div
        style={{
          display:        "flex",
          alignItems:     "center",
          gap:            8,
          padding:        "8px 12px",
          borderBottom:   `1px solid ${S.rim}`,
          background:     S.bgDeep,
        }}
      >
        <GitBranch size={13} color={S.cyan} style={{ flexShrink: 0 }} />
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize:   10,
            color:      S.primary,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            flex: 1,
          }}
        >
          Branch Comparison
        </span>
        <span
          style={{
            fontFamily:  S.fontMono,
            fontSize:    8,
            color:       S.bgDeep,
            background:  S.secondary,
            padding:     "1px 5px",
            borderRadius: 2,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          Company-Wide
        </span>
        {onRemove && (
          <button
            onClick={onRemove}
            aria-label="Remove widget"
            style={{
              background: "none",
              border:     "none",
              cursor:     "pointer",
              color:      S.tertiary,
              padding:    "0 0 0 4px",
              lineHeight: 1,
            }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* ── Permission gate ─────────────────────────────────────── */}
      {!hasPermission ? (
        <div
          style={{
            padding:    "24px 16px",
            fontFamily: S.fontMono,
            fontSize:   11,
            color:      S.amber,
            textAlign:  "center",
          }}
        >
          Requires reports.view_all_branches permission
        </div>
      ) : (
        <div style={{ padding: "12px 12px 8px" }}>
          {/* ── KPI summary row ─────────────────────────────────── */}
          <div
            style={{
              display:             "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap:                 8,
              marginBottom:        12,
            }}
          >
            {[
              { label: "Total Exposure", value: "$89.6M" },
              { label: "Avg Hedge",      value: `${avgHedge}%` },
              { label: "Total Proposals",value: String(totalProps) },
            ].map(({ label, value }) => (
              <div
                key={label}
                style={{
                  background:   S.bgSub,
                  border:       `1px solid ${S.soft}`,
                  borderRadius: 4,
                  padding:      "6px 8px",
                  textAlign:    "center",
                }}
              >
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize:   16,
                    color:      S.primary,
                    lineHeight: 1.1,
                  }}
                >
                  {value}
                </div>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize:   8,
                    color:      S.tertiary,
                    marginTop:  2,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* ── ECharts bar/line chart ───────────────────────────── */}
          <div
            style={{
              background:   S.bgDeep,
              border:       `1px solid ${S.soft}`,
              borderRadius: 4,
            }}
          >
            <ReactECharts
              option={chartOption}
              style={{ height: 180, width: "100%" }}
              opts={{ renderer: "svg" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
