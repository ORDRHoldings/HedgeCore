"use client";

/**
 * RateScatterChart.tsx — Item 15
 *
 * Scatter plot: X = benchmark rate, Y = effective rate.
 * Diagonal y=x reference line. Points colored by currency pair.
 * Tooltip with row detail (currency pair, counterparty, row index).
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

/* ── Color constants (hex) ────────────────────────────────────────────────── */

const C = {
  border: "#E2E8F0",
  text1: "#0F172A",
  text3: "#94A3B8",
  bgPanel: "#FFFFFF",
  tooltipBg: "#FFFFFFEE",
  borderWhite: "#FFFFFF",
} as const;

/** Palette for currency pair coloring — 10 distinct, institutional-grade hues */
const PAIR_PALETTE = [
  "#1C62F2", // blue
  "#059669", // green
  "#DC2626", // red
  "#D97706", // amber
  "#4F46E5", // indigo
  "#0891B2", // teal
  "#9333EA", // purple
  "#E11D48", // rose
  "#65A30D", // lime
  "#EA580C", // orange
] as const;

/* ── Shared ECharts defaults ──────────────────────────────────────────────── */

const AXIS_LABEL = { color: C.text3, fontSize: 12, fontFamily: "monospace" };
const SPLIT_LINE = {
  lineStyle: { color: C.border, type: "dashed" as const, opacity: 0.5 },
};
const TOOLTIP_STYLE = {
  backgroundColor: C.tooltipBg,
  borderColor: C.border,
  borderWidth: 1,
  textStyle: { color: C.text1, fontSize: 12, fontFamily: "monospace" },
  extraCssText: "backdrop-filter: blur(8px); box-shadow: 0 2px 12px #0001",
};

/* ── Props ────────────────────────────────────────────────────────────────── */

interface Transaction {
  effective_rate: number;
  benchmark_rate: number;
  currency_pair: string;
  counterparty: string;
  row_index: number;
}

interface RateScatterChartProps {
  transactions: Transaction[];
  height?: number;
}

/* ── Component ────────────────────────────────────────────────────────────── */

export default function RateScatterChart({
  transactions,
  height = 340,
}: RateScatterChartProps) {
  const option = useMemo<EChartsOption>(() => {
    if (transactions.length === 0) {
      return { backgroundColor: "transparent" };
    }

    /* Group transactions by currency pair */
    const pairMap = new Map<string, Transaction[]>();
    for (const tx of transactions) {
      const existing = pairMap.get(tx.currency_pair);
      if (existing) {
        existing.push(tx);
      } else {
        pairMap.set(tx.currency_pair, [tx]);
      }
    }

    const pairs = Array.from(pairMap.keys()).sort();
    const pairColorMap = new Map<string, string>();
    pairs.forEach((pair, i) => {
      pairColorMap.set(pair, PAIR_PALETTE[i % PAIR_PALETTE.length]);
    });

    /* Compute axis bounds for y=x reference line */
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (const tx of transactions) {
      const lo = Math.min(tx.benchmark_rate, tx.effective_rate);
      const hi = Math.max(tx.benchmark_rate, tx.effective_rate);
      if (lo < minVal) minVal = lo;
      if (hi > maxVal) maxVal = hi;
    }
    const pad = (maxVal - minVal) * 0.08 || 0.01;
    const axisMin = minVal - pad;
    const axisMax = maxVal + pad;

    /* Build one scatter series per currency pair */
    const scatterSeries = pairs.map((pair) => {
      const txs = pairMap.get(pair)!;
      const color = pairColorMap.get(pair)!;
      return {
        name: pair,
        type: "scatter" as const,
        data: txs.map((tx) => ({
          value: [tx.benchmark_rate, tx.effective_rate],
          _tx: tx,
        })),
        symbolSize: 10,
        itemStyle: {
          color,
          shadowBlur: 6,
          shadowColor: color + "44",
          borderColor: C.borderWhite,
          borderWidth: 1,
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 14,
            shadowColor: color + "88",
            borderWidth: 2,
          },
          scale: 1.4,
        },
      };
    });

    /* y=x reference line (diagonal) */
    const lineSeries = {
      name: "y = x",
      type: "line" as const,
      data: [
        [axisMin, axisMin],
        [axisMax, axisMax],
      ],
      symbol: "none",
      lineStyle: {
        color: C.text3,
        type: "dashed" as const,
        width: 1,
        opacity: 0.6,
      },
      silent: true,
      tooltip: { show: false },
    };

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        ...TOOLTIP_STYLE,
        formatter: (params: unknown) => {
          const p = params as {
            seriesName: string;
            data: { value: [number, number]; _tx: Transaction };
          };
          if (!p.data?._tx) return "";
          const tx = p.data._tx;
          const diff = tx.effective_rate - tx.benchmark_rate;
          const diffSign = diff >= 0 ? "+" : "";
          const diffColor = diff > 0 ? "#DC2626" : diff < 0 ? "#059669" : C.text3;
          return [
            `<b style="font-size:13px">${tx.currency_pair}</b>`,
            `Counterparty: ${tx.counterparty}`,
            `Benchmark: ${tx.benchmark_rate.toFixed(6)}`,
            `Effective: ${tx.effective_rate.toFixed(6)}`,
            `Spread: <span style="color:${diffColor}">${diffSign}${diff.toFixed(6)}</span>`,
            `<span style="color:${C.text3}">Row #${tx.row_index}</span>`,
          ].join("<br/>");
        },
      },
      legend: {
        top: 4,
        right: 12,
        textStyle: { color: C.text3, fontSize: 12, fontFamily: "monospace" },
        itemWidth: 12,
        itemHeight: 8,
        icon: "circle",
      },
      grid: { left: 64, right: 16, top: 40, bottom: 48, containLabel: false },
      xAxis: {
        type: "value",
        name: "Benchmark Rate",
        nameLocation: "center",
        nameGap: 32,
        nameTextStyle: {
          color: C.text3,
          fontSize: 12,
          fontFamily: "monospace",
        },
        min: axisMin,
        max: axisMax,
        axisLabel: {
          ...AXIS_LABEL,
          formatter: (v: number) => v.toFixed(4),
        },
        axisLine: { lineStyle: { color: C.border } },
        splitLine: SPLIT_LINE,
      },
      yAxis: {
        type: "value",
        name: "Effective Rate",
        nameLocation: "center",
        nameGap: 48,
        nameTextStyle: {
          color: C.text3,
          fontSize: 12,
          fontFamily: "monospace",
        },
        min: axisMin,
        max: axisMax,
        axisLabel: {
          ...AXIS_LABEL,
          formatter: (v: number) => v.toFixed(4),
        },
        axisLine: { lineStyle: { color: C.border } },
        splitLine: SPLIT_LINE,
      },
      series: [...scatterSeries, lineSeries],
    };
  }, [transactions]);

  if (transactions.length === 0) {
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
        No transaction rate data available
      </div>
    );
  }

  return (
    <div style={{ width: "100%" }}>
      <ReactECharts
        option={option}
        style={{ height, width: "100%" }}
        opts={{ renderer: "canvas" }}
      />
    </div>
  );
}
