"use client";

/**
 * EChartsWrapper.tsx
 *
 * Institutional-grade chart components for Committee Reports.
 * Uses Apache ECharts (echarts-for-react) with:
 *  – canvas renderer for GPU-accelerated rendering and crisp pixel output
 *  – linearGradient fills for 3D-extrusion depth illusion
 *  – shadowBlur / shadowColor for glow/depth effects
 *  – emphasis (hover) scale + brightness amplification
 *  – Rich animated donut and radar charts
 *
 * Exports:
 *  HorizontalStackedBar  – Coverage decomposition (R-01)
 *  BucketBarChart        – Vertical bars for residual/friction/concentration
 *  EChartsWaterfallChart – Worst-case shock waterfall (R-03)
 *  DonutChart            – Compliance score donut (R-04)
 *  RadarChart            – Multi-dimensional risk radar (R-06)
 */

import React from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";

// ── RPT-09: Chart Error Boundary ──────────────────────────────────────────────

class ChartErrorBoundary extends React.Component<
  { chartName?: string; children: React.ReactNode },
  { hasError: boolean; error: string | null }
> {
  constructor(props: { chartName?: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[Chart Error] ${this.props.chartName ?? "unknown"}:`, error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: "120px",
          border: "1px solid var(--border-rim)",
          background: "var(--bg-sub)",
          gap: 8,
        }}>
          <span style={{ fontSize: 11, fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)", color: "var(--text-tertiary)" }}>
            Chart failed to render
          </span>
          <button
            style={{
              fontSize: 10, fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
              border: "1px solid var(--border-rim)", background: "none",
              color: "var(--accent-cyan)", padding: "4px 10px", cursor: "pointer",
            }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            RETRY
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Design token constants ─────────────────────────────────────────────────────
// Hex values matching globals.css custom properties.
const C = {
  cyan:    "#22D3EE",
  cyanDim: "#0E7490",
  green:   "#4ADE80",
  greenDk: "#166534",
  amber:   "#FBB347",
  amberDk: "#92400E",
  red:     "#F87171",
  redDk:   "#7F1D1D",
  indigo:  "#818CF8",
  grey:    "#6B7280",
  greyDk:  "#374151",
  text1:   "#E5EAF2",
  text2:   "#A3B1C6",
  text3:   "#8A94A0",
  border:  "#2A3545",
  bgDeep:  "#0B1120",
  bgPanel: "#152238",
} as const;

// ── Gradient factory ──────────────────────────────────────────────────────────
function vGrad(topHex: string, botHex: string, opacity = 0.92) {
  return {
    type: "linear" as const,
    x: 0, y: 0, x2: 0, y2: 1,
    colorStops: [
      { offset: 0,   color: topHex + Math.round(opacity * 255).toString(16).padStart(2, "0") },
      { offset: 0.6, color: topHex + "BB" },
      { offset: 1,   color: botHex + "88" },
    ],
  };
}

function hGrad(leftHex: string, rightHex: string) {
  return {
    type: "linear" as const,
    x: 0, y: 0, x2: 1, y2: 0,
    colorStops: [
      { offset: 0,   color: leftHex + "EE" },
      { offset: 0.6, color: leftHex + "CC" },
      { offset: 1,   color: rightHex + "88" },
    ],
  };
}

// ── Shared axis/tooltip defaults ──────────────────────────────────────────────
const AXIS_LABEL = { color: C.text3, fontSize: 10, fontFamily: "monospace" };
const SPLIT_LINE = { lineStyle: { color: C.border, type: "dashed" as const, opacity: 0.5 } };

const TOOLTIP_STYLE = {
  backgroundColor: "#1A2535EE",
  borderColor: C.border,
  borderWidth: 1,
  textStyle: { color: C.text1, fontSize: 11, fontFamily: "monospace" },
  extraCssText: "backdrop-filter: blur(8px); box-shadow: 0 4px 24px #000A",
};

// ═════════════════════════════════════════════════════════════════════════════
// 1. HorizontalStackedBar — Coverage Decomposition (R-01)
// ═════════════════════════════════════════════════════════════════════════════

interface StackedBarProps {
  existing:  number;
  newAction: number;
  residual:  number;
  total:     number;
  height?:   number;
}

export function HorizontalStackedBar({
  existing, newAction, residual, total, height = 130,
}: StackedBarProps) {
  const abs = Math.abs(total);
  if (abs === 0) return null;

  const pEx  = +(Math.min((Math.abs(existing)  / abs) * 100, 100)).toFixed(1);
  const pNew = +(Math.min((Math.abs(newAction) / abs) * 100, 100)).toFixed(1);
  const pRes = +(Math.min((Math.abs(residual)  / abs) * 100, 100)).toFixed(1);

  const option: EChartsOption = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      ...TOOLTIP_STYLE,
      formatter: (p: unknown) => {
        const params = p as { seriesName: string; value: number };
        return `<b>${params.seriesName}</b><br/>${params.value.toFixed(1)}%`;
      },
    },
    legend: {
      bottom: 2,
      textStyle: { color: C.text3, fontSize: 10, fontFamily: "monospace" },
      itemWidth: 12, itemHeight: 8,
      icon: "roundRect",
    },
    grid: { left: 4, right: 4, top: 10, bottom: 44, containLabel: false },
    xAxis: { type: "value", max: 100, show: false },
    yAxis: { type: "category", data: ["Coverage"], show: false },
    series: [
      {
        name: "Existing",
        type: "bar",
        stack: "t",
        data: [pEx],
        barMaxWidth: 40,
        itemStyle: {
          color: hGrad(C.grey, C.greyDk),
          shadowBlur: 6,
          shadowColor: C.grey + "55",
        },
        emphasis: { itemStyle: { shadowBlur: 14, shadowColor: C.grey + "AA" } },
        label: pEx >= 8 ? {
          show: true, position: "inside" as const,
          fontSize: 9, color: "#fff", fontFamily: "monospace",
          formatter: () => `${pEx}%`,
        } : { show: false },
      },
      {
        name: "New Action",
        type: "bar",
        stack: "t",
        data: [pNew],
        barMaxWidth: 40,
        itemStyle: {
          color: hGrad(C.cyan, C.cyanDim),
          shadowBlur: 8,
          shadowColor: C.cyan + "55",
        },
        emphasis: { itemStyle: { shadowBlur: 18, shadowColor: C.cyan + "AA" } },
        label: pNew >= 8 ? {
          show: true, position: "inside" as const,
          fontSize: 9, color: "#000", fontFamily: "monospace",
          formatter: () => `${pNew}%`,
        } : { show: false },
      },
      {
        name: "Residual",
        type: "bar",
        stack: "t",
        data: [pRes],
        barMaxWidth: 40,
        itemStyle: {
          color: hGrad(C.amber, C.amberDk),
          shadowBlur: 8,
          shadowColor: C.amber + "55",
        },
        emphasis: { itemStyle: { shadowBlur: 18, shadowColor: C.amber + "AA" } },
        label: pRes >= 8 ? {
          show: true, position: "inside" as const,
          fontSize: 9, color: "#000", fontFamily: "monospace",
          formatter: () => `${pRes}%`,
        } : { show: false },
      },
    ],
  };

  return (
    <ChartErrorBoundary chartName="HorizontalStackedBar">
      <ReactECharts
        option={option}
        style={{ height, width: "100%" }}
        opts={{ renderer: "canvas" }}
      />
    </ChartErrorBoundary>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. BucketBarChart — 3D-style vertical bars (R-01 residual, R-02 cost, R-05 conc.)
// ═════════════════════════════════════════════════════════════════════════════

interface BucketBarDatum {
  label: string;
  value: number;
  color?: string;
}

interface BucketBarChartProps {
  data:       BucketBarDatum[];
  yLabel?:    string;
  height?:    number;
  /** Top color for gradient. Defaults to datum color. */
  topColor?:  string;
}

export function BucketBarChart({
  data, yLabel = "", height = 200,
}: BucketBarChartProps) {
  if (data.length === 0) return null;

  const option: EChartsOption = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: C.cyan + "0A" } },
      ...TOOLTIP_STYLE,
    },
    grid: { left: 48, right: 12, top: 16, bottom: 36, containLabel: false },
    xAxis: {
      type: "category",
      data: data.map(d => d.label),
      axisLabel: { ...AXIS_LABEL, rotate: data.length > 6 ? 35 : 0 },
      axisLine:  { lineStyle: { color: C.border } },
      axisTick:  { show: false },
    },
    yAxis: {
      type: "value",
      name: yLabel,
      nameTextStyle: { color: C.text3, fontSize: 8, fontFamily: "monospace" },
      axisLabel: {
        ...AXIS_LABEL,
        formatter: (v: number) =>
          v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M`
          : v >= 1_000   ? `${(v / 1_000).toFixed(0)}K`
          : v.toFixed(0),
      },
      splitLine: SPLIT_LINE,
    },
    series: [{
      type: "bar",
      data: data.map(d => {
        const col = d.color ?? C.cyan;
        // Derive darker bottom color from top color
        const darkCol = col === C.cyan ? C.cyanDim
          : col === C.green  ? C.greenDk
          : col === C.amber  ? C.amberDk
          : col === C.red    ? C.redDk
          : C.greyDk;
        return {
          value: Math.abs(d.value),
          itemStyle: {
            color: vGrad(col, darkCol),
            shadowBlur: 10,
            shadowColor: col + "55",
            shadowOffsetY: 2,
            borderRadius: [3, 3, 0, 0],
          },
        };
      }),
      barMaxWidth: 40,
      emphasis: {
        itemStyle: {
          shadowBlur: 22,
          shadowOffsetY: 4,
        },
      },
    }],
  };

  return (
    <ChartErrorBoundary chartName="BucketBarChart">
      <ReactECharts
        option={option}
        style={{ height, width: "100%" }}
        opts={{ renderer: "canvas" }}
      />
    </ChartErrorBoundary>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. EChartsWaterfallChart — 3D-style waterfall (R-03)
// ═════════════════════════════════════════════════════════════════════════════

interface WaterfallStep {
  label: string;
  value: number;
  color?: string;
}

interface WaterfallChartProps {
  steps:   WaterfallStep[];
  height?: number;
}

export function EChartsWaterfallChart({ steps, height = 240 }: WaterfallChartProps) {
  if (steps.length === 0) return null;

  // Classic ECharts waterfall: transparent spacer + visible bar
  const spacers: number[] = [];
  const bars: {
    value: number;
    itemStyle: { color: object; shadowBlur: number; shadowColor: string; shadowOffsetY: number; borderRadius: number[] };
  }[] = [];
  let running = 0;

  steps.forEach(step => {
    const pos = step.value >= 0;
    spacers.push(pos ? running : running + step.value);

    const col   = step.color
      ? step.color
      : pos ? C.green : C.red;
    const colDk = pos ? C.greenDk : C.redDk;

    bars.push({
      value: Math.abs(step.value),
      itemStyle: {
        color:         vGrad(col, colDk, 0.95),
        shadowBlur:    14,
        shadowColor:   col + "55",
        shadowOffsetY: 3,
        borderRadius:  [3, 3, 0, 0],
      },
    });
    running += step.value;
  });

  const option: EChartsOption = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: C.cyan + "0A" } },
      ...TOOLTIP_STYLE,
      formatter: (params: unknown) => {
        const arr = params as Array<{ seriesIndex: number; name: string; value: number }>;
        const bar = arr.find(p => p.seriesIndex === 1);
        if (!bar) return "";
        const step = steps.find(s => s.label === bar.name);
        const sign = step && step.value < 0 ? "-" : "";
        return `<b>${bar.name}</b><br/>${sign}$${Math.abs(bar.value).toLocaleString("en", { maximumFractionDigits: 0 })}`;
      },
    },
    grid: { left: 60, right: 16, top: 20, bottom: 30, containLabel: false },
    xAxis: {
      type: "category",
      data: steps.map(s => s.label),
      axisLabel: { ...AXIS_LABEL, fontSize: 11 },
      axisLine: { lineStyle: { color: C.border } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        ...AXIS_LABEL,
        formatter: (v: number) =>
          `$${v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M`
            : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K`
            : v.toFixed(0)}`,
      },
      splitLine: SPLIT_LINE,
    },
    series: [
      {
        // Invisible spacer
        type: "bar",
        stack: "wf",
        data: spacers,
        itemStyle: { color: "transparent" },
        emphasis: { itemStyle: { color: "transparent" } },
        silent: true,
      },
      {
        // Visible gradient bars
        type: "bar",
        stack: "wf",
        data: bars,
        barMaxWidth: 64,
        emphasis: { itemStyle: { shadowBlur: 16 } },
        label: {
          show: true,
          position: "top" as const,
          fontSize: 9,
          color: C.text3,
          fontFamily: "monospace",
          formatter: (p: unknown) => {
            const params = p as { dataIndex: number };
            const step = steps[params.dataIndex];
            const sign = step.value < 0 ? "-" : "+";
            const abs  = Math.abs(step.value);
            return `${sign}$${abs >= 1_000_000
              ? `${(abs / 1_000_000).toFixed(1)}M`
              : abs >= 1_000
                ? `${(abs / 1_000).toFixed(0)}K`
                : abs.toFixed(0)}`;
          },
        },
      },
    ],
  };

  return (
    <ChartErrorBoundary chartName="EChartsWaterfallChart">
      <ReactECharts
        option={option}
        style={{ height, width: "100%" }}
        opts={{ renderer: "canvas" }}
      />
    </ChartErrorBoundary>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. DonutChart — Compliance Score (R-04)
// ═════════════════════════════════════════════════════════════════════════════

interface DonutChartProps {
  score:          number;   // 0–100
  classification: string;
  passed:         number;
  total:          number;
  height?:        number;
}

export function DonutChart({
  score, classification, passed, total, height = 220,
}: DonutChartProps) {
  const color = classification === "ALIGNED"         ? C.green
    : classification === "MINOR DEVIATIONS" ? C.amber
    : C.red;
  const colorDk = classification === "ALIGNED"       ? C.greenDk
    : classification === "MINOR DEVIATIONS" ? C.amberDk
    : C.redDk;

  const option: EChartsOption = {
    backgroundColor: "transparent",
    tooltip: { show: false },
    series: [{
      type: "pie",
      radius: ["56%", "80%"],
      center: ["50%", "50%"],
      startAngle: 200,
      endAngle: 340 + 200,
      avoidLabelOverlap: false,
      silent: true,
      itemStyle: { borderWidth: 0 },
      data: [
        {
          value: score,
          name: "Compliant",
          itemStyle: {
            color: {
              type: "linear" as const,
              x: 0, y: 0, x2: 1, y2: 1,
              colorStops: [
                { offset: 0,   color: color + "EE" },
                { offset: 1,   color: colorDk + "99" },
              ],
            },
            shadowBlur: 16,
            shadowColor: color + "66",
          },
        },
        {
          value: 100 - score,
          name: "Gap",
          itemStyle: { color: C.bgPanel + "CC" },
        },
      ],
      label: {
        show: true,
        position: "center",
        rich: {
          score: { fontSize: 32, fontWeight: "bold", color: color, fontFamily: "monospace", lineHeight: 42 },
          pct:   { fontSize: 14, color: color, fontFamily: "monospace" },
          cls:   { fontSize: 9,  color: C.text3, fontFamily: "monospace", lineHeight: 20 },
          sub:   { fontSize: 9,  color: C.text3, fontFamily: "monospace", lineHeight: 14 },
        },
        formatter: `{score|${score}}{pct|%}\n{cls|${classification}}\n{sub|${passed}/${total} rules}`,
      },
    }],
  };

  return (
    <ChartErrorBoundary chartName="DonutChart">
      <ReactECharts
        option={option}
        style={{ height, width: "100%" }}
        opts={{ renderer: "canvas" }}
      />
    </ChartErrorBoundary>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. RadarChart — Multi-dimensional Risk Posture (R-06 Executive Briefing)
// ═════════════════════════════════════════════════════════════════════════════

interface RadarChartProps {
  dimensions: { name: string; value: number; max?: number }[];
  label?:     string;
  height?:    number;
}

export function RadarChart({ dimensions, label = "Risk Posture", height = 280 }: RadarChartProps) {
  const indicators = dimensions.map(d => ({
    name: d.name,
    max:  d.max ?? 100,
  }));
  const values = dimensions.map(d => d.value);

  const option: EChartsOption = {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "item",
      ...TOOLTIP_STYLE,
      formatter: (p: unknown) => {
        const params = p as { data: { value: number[] } };
        return dimensions
          .map((d, i) => `<b>${d.name}</b>: ${params.data.value[i].toFixed(0)}`)
          .join("<br/>");
      },
    },
    radar: {
      indicator: indicators,
      shape: "polygon",
      center: ["50%", "50%"],
      radius: "68%",
      axisName: {
        color: C.text2,
        fontSize: 10,
        fontFamily: "monospace",
      },
      splitLine: {
        lineStyle: { color: [C.border], opacity: 0.6, type: "dashed" },
      },
      splitArea: {
        show: true,
        areaStyle: {
          color: [C.bgPanel + "40", C.bgPanel + "20"],
        },
      },
      axisLine: { lineStyle: { color: C.border, opacity: 0.5 } },
    },
    series: [{
      type: "radar",
      data: [{
        value: values,
        name:  label,
        symbol: "circle",
        symbolSize: 5,
        itemStyle: { color: C.cyan },
        lineStyle: {
          color: C.cyan,
          width: 2,
          shadowBlur: 8,
          shadowColor: C.cyan + "88",
        },
        areaStyle: {
          color: {
            type: "radial" as const,
            x: 0.5, y: 0.5, r: 0.5,
            colorStops: [
              { offset: 0,   color: C.cyan + "44" },
              { offset: 1,   color: C.cyan + "11" },
            ],
          },
        },
        emphasis: {
          lineStyle: { width: 3, shadowBlur: 16, shadowColor: C.cyan + "BB" },
          itemStyle: { shadowBlur: 12, shadowColor: C.cyan + "88" },
        },
      }],
    }],
  };

  return (
    <ChartErrorBoundary chartName="RadarChart">
      <ReactECharts
        option={option}
        style={{ height, width: "100%" }}
        opts={{ renderer: "canvas" }}
      />
    </ChartErrorBoundary>
  );
}
