"use client";

/**
 * MarkupByMonthChart.tsx — Item 14
 *
 * Bar chart: months on X-axis, markup USD on Y-axis.
 * Bars colored by sign: red for positive (adverse), green for negative (favorable).
 */

import React, { useMemo } from "react";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

/* ── Style tokens ─────────────────────────────────────────────────────────── */

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  textPrimary: "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textTertiary: "var(--text-tertiary)",
} as const;

/* ── Color constants (hex — ECharts needs raw values) ─────────────────────── */

const C = {
  green: "#059669",
  greenDk: "#065F46",
  red: "#DC2626",
  redDk: "#991B1B",
  border: "#E2E8F0",
  text3: "#94A3B8",
  text1: "#0F172A",
  bgPanel: "#FFFFFF",
} as const;

/* ── Gradient factory ─────────────────────────────────────────────────────── */

function vGrad(topHex: string, botHex: string) {
  return {
    type: "linear" as const,
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: topHex + "EE" },
      { offset: 0.6, color: topHex + "BB" },
      { offset: 1, color: botHex + "88" },
    ],
  };
}

/* ── Shared ECharts defaults ──────────────────────────────────────────────── */

const AXIS_LABEL = { color: C.text3, fontSize: 12, fontFamily: "monospace" };
const SPLIT_LINE = {
  lineStyle: { color: C.border, type: "dashed" as const, opacity: 0.5 },
};
const TOOLTIP_STYLE = {
  backgroundColor: "#FFFFFFEE",
  borderColor: C.border,
  borderWidth: 1,
  textStyle: { color: C.text1, fontSize: 12, fontFamily: "monospace" },
  extraCssText: "backdrop-filter: blur(8px); box-shadow: 0 2px 12px #0001",
};

/* ── Props ────────────────────────────────────────────────────────────────── */

interface MarkupByMonthChartProps {
  markupByMonth: Record<string, number>;
  height?: number;
}

/* ── Component ────────────────────────────────────────────────────────────── */

export default function MarkupByMonthChart({
  markupByMonth,
  height = 280,
}: MarkupByMonthChartProps) {
  const option = useMemo<EChartsOption>(() => {
    const months = Object.keys(markupByMonth);
    const values = Object.values(markupByMonth);

    if (months.length === 0) {
      return { backgroundColor: "transparent" };
    }

    const barData = values.map((v) => {
      const isAdverse = v >= 0;
      const topCol = isAdverse ? C.red : C.green;
      const botCol = isAdverse ? C.redDk : C.greenDk;
      return {
        value: v,
        itemStyle: {
          color: vGrad(topCol, botCol),
          shadowBlur: 8,
          shadowColor: topCol + "44",
          shadowOffsetY: 2,
          borderRadius: v >= 0 ? [3, 3, 0, 0] : [0, 0, 3, 3],
        },
      };
    });

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "shadow",
          shadowStyle: { color: C.border + "22" },
        },
        ...TOOLTIP_STYLE,
        formatter: (params: unknown) => {
          const arr = params as Array<{
            name: string;
            value: number;
          }>;
          const p = arr[0];
          if (!p) return "";
          const sign = p.value >= 0 ? "+" : "";
          const label = p.value >= 0 ? "ADVERSE" : "FAVORABLE";
          const color = p.value >= 0 ? C.red : C.green;
          return [
            `<b>${p.name}</b>`,
            `<span style="color:${color}">${label}</span>`,
            `${sign}$${p.value.toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
          ].join("<br/>");
        },
      },
      grid: { left: 64, right: 16, top: 24, bottom: 40, containLabel: false },
      xAxis: {
        type: "category",
        data: months,
        axisLabel: {
          ...AXIS_LABEL,
          rotate: months.length > 8 ? 35 : 0,
        },
        axisLine: { lineStyle: { color: C.border } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        name: "Markup (USD)",
        nameTextStyle: {
          color: C.text3,
          fontSize: 12,
          fontFamily: "monospace",
        },
        axisLabel: {
          ...AXIS_LABEL,
          formatter: (v: number) => {
            const abs = Math.abs(v);
            const sign = v < 0 ? "-" : "";
            if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
            if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
            return `${sign}$${abs.toFixed(0)}`;
          },
        },
        splitLine: SPLIT_LINE,
      },
      series: [
        {
          type: "bar",
          data: barData,
          barMaxWidth: 48,
          emphasis: {
            itemStyle: { shadowBlur: 18, shadowOffsetY: 4 },
          },
        },
      ],
    };
  }, [markupByMonth]);

  const months = Object.keys(markupByMonth);

  if (months.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height,
          fontFamily: S.fontMono,
          fontSize: 13,
          color: S.textTertiary,
          background: S.bgSub,
          border: `1px solid ${S.rim}`,
        }}
      >
        No monthly markup data available
      </div>
    );
  }

  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 8,
          fontFamily: S.fontMono,
          fontSize: 12,
          color: S.textTertiary,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              background: C.red,
              borderRadius: 2,
              display: "inline-block",
            }}
          />
          Adverse (positive markup)
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              background: C.green,
              borderRadius: 2,
              display: "inline-block",
            }}
          />
          Favorable (negative markup)
        </span>
      </div>
      <ReactECharts
        option={option}
        style={{ height, width: "100%" }}
        opts={{ renderer: "canvas" }}
      />
    </div>
  );
}
