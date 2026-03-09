"use client";
/**
 * /audit-lab/trends
 * Audit Lab -- full-page trend dashboard with ECharts.
 * Charts: markup cost over time, data quality trend, counterparty mix.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { TrendingUp } from "lucide-react";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

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
  green:     "var(--status-pass,#22c55e)",
  red:       "var(--accent-red,#f87171)",
} as const;

/* ── Hex colors for ECharts (cannot use CSS vars) ───────────────────────────── */

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
  text1:   "#E5EAF2",
  text2:   "#A3B1C6",
  text3:   "#8A94A0",
  border:  "#2A3545",
  bgPanel: "#152238",
} as const;

const AXIS_LABEL = { color: C.text3, fontSize: 12, fontFamily: "monospace" };
const SPLIT_LINE = { lineStyle: { color: C.border, type: "dashed" as const, opacity: 0.5 } };
const TOOLTIP_STYLE = {
  backgroundColor: "#1A2535EE",
  borderColor: C.border,
  borderWidth: 1,
  textStyle: { color: C.text1, fontSize: 12, fontFamily: "monospace" },
  extraCssText: "backdrop-filter: blur(8px); box-shadow: 0 4px 24px #000A",
};

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface TrendPoint {
  date: string;
  total_markup_usd: number;
  data_quality_score: number;
}

interface CounterpartyBreakdown {
  counterparty: string;
  total_markup_usd: number;
}

interface TrendsData {
  trend_points: TrendPoint[];
  counterparty_breakdown: CounterpartyBreakdown[];
}

/* ── Chart: Markup Cost Over Time (area) ────────────────────────────────────── */

function MarkupTrendChart({ points }: { points: TrendPoint[] }) {
  const option = useMemo<EChartsOption>(() => ({
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      ...TOOLTIP_STYLE,
      formatter: (params: unknown) => {
        const arr = params as Array<{ name: string; value: number; seriesName: string }>;
        const p = arr[0];
        if (!p) return "";
        const sign = p.value >= 0 ? "+" : "";
        return `<b>${p.name}</b><br/>Markup: ${sign}$${p.value.toLocaleString("en", { maximumFractionDigits: 0 })}`;
      },
    },
    grid: { left: 64, right: 24, top: 24, bottom: 36, containLabel: false },
    xAxis: {
      type: "category",
      data: points.map(p => p.date),
      axisLabel: { ...AXIS_LABEL, rotate: points.length > 12 ? 35 : 0 },
      axisLine: { lineStyle: { color: C.border } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      name: "Markup (USD)",
      nameTextStyle: { color: C.text3, fontSize: 12, fontFamily: "monospace" },
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
    series: [{
      type: "line",
      data: points.map(p => p.total_markup_usd),
      smooth: true,
      symbol: "circle",
      symbolSize: 6,
      lineStyle: { color: C.red, width: 2, shadowBlur: 8, shadowColor: C.red + "66" },
      itemStyle: { color: C.red },
      areaStyle: {
        color: {
          type: "linear" as const,
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: C.red + "44" },
            { offset: 1, color: C.red + "08" },
          ],
        },
      },
    }],
  }), [points]);

  return <ReactECharts option={option} style={{ height: 280, width: "100%" }} opts={{ renderer: "canvas" }} />;
}

/* ── Chart: Data Quality Trend (line) ───────────────────────────────────────── */

function QualityTrendChart({ points }: { points: TrendPoint[] }) {
  const option = useMemo<EChartsOption>(() => ({
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      ...TOOLTIP_STYLE,
      formatter: (params: unknown) => {
        const arr = params as Array<{ name: string; value: number }>;
        const p = arr[0];
        if (!p) return "";
        return `<b>${p.name}</b><br/>Data Quality: ${p.value.toFixed(1)}%`;
      },
    },
    grid: { left: 48, right: 24, top: 24, bottom: 36, containLabel: false },
    xAxis: {
      type: "category",
      data: points.map(p => p.date),
      axisLabel: { ...AXIS_LABEL, rotate: points.length > 12 ? 35 : 0 },
      axisLine: { lineStyle: { color: C.border } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      name: "Quality %",
      nameTextStyle: { color: C.text3, fontSize: 12, fontFamily: "monospace" },
      min: 0, max: 100,
      axisLabel: { ...AXIS_LABEL, formatter: (v: number) => `${v}%` },
      splitLine: SPLIT_LINE,
    },
    series: [{
      type: "line",
      data: points.map(p => p.data_quality_score),
      smooth: true,
      symbol: "circle",
      symbolSize: 6,
      lineStyle: { color: C.green, width: 2, shadowBlur: 8, shadowColor: C.green + "66" },
      itemStyle: { color: C.green },
      areaStyle: {
        color: {
          type: "linear" as const,
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: C.green + "33" },
            { offset: 1, color: C.green + "08" },
          ],
        },
      },
    }],
  }), [points]);

  return <ReactECharts option={option} style={{ height: 280, width: "100%" }} opts={{ renderer: "canvas" }} />;
}

/* ── Chart: Counterparty Mix (horizontal bar) ───────────────────────────────── */

function CounterpartyChart({ data }: { data: CounterpartyBreakdown[] }) {
  const sorted = useMemo(() => [...data].sort((a, b) => b.total_markup_usd - a.total_markup_usd), [data]);

  const option = useMemo<EChartsOption>(() => ({
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      ...TOOLTIP_STYLE,
      formatter: (params: unknown) => {
        const arr = params as Array<{ name: string; value: number }>;
        const p = arr[0];
        if (!p) return "";
        return `<b>${p.name}</b><br/>Markup: $${p.value.toLocaleString("en", { maximumFractionDigits: 0 })}`;
      },
    },
    grid: { left: 120, right: 24, top: 12, bottom: 24, containLabel: false },
    xAxis: {
      type: "value",
      axisLabel: {
        ...AXIS_LABEL,
        formatter: (v: number) => {
          if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
          if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
          return `$${v.toFixed(0)}`;
        },
      },
      splitLine: SPLIT_LINE,
    },
    yAxis: {
      type: "category",
      data: sorted.map(d => d.counterparty),
      inverse: true,
      axisLabel: { ...AXIS_LABEL },
      axisLine: { lineStyle: { color: C.border } },
      axisTick: { show: false },
    },
    series: [{
      type: "bar",
      data: sorted.map((d, i) => {
        const colors = [C.cyan, C.amber, C.indigo, C.green, C.red];
        const col = colors[i % colors.length];
        return {
          value: Math.abs(d.total_markup_usd),
          itemStyle: {
            color: {
              type: "linear" as const,
              x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [
                { offset: 0, color: col + "EE" },
                { offset: 1, color: col + "66" },
              ],
            },
            shadowBlur: 8,
            shadowColor: col + "44",
            borderRadius: [0, 3, 3, 0],
          },
        };
      }),
      barMaxWidth: 28,
    }],
  }), [sorted]);

  const height = Math.max(200, sorted.length * 36 + 48);
  return <ReactECharts option={option} style={{ height, width: "100%" }} opts={{ renderer: "canvas" }} />;
}

/* ── Page ───────────────────────────────────────────────────────────────────── */

export default function AuditLabTrendsPage() {
  const { token } = useAuth();
  const [data, setData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await dashboardFetch("/v1/audit-lab/trends", token);
      if (!res.ok) {
        setError(`Failed to load trends (HTTP ${res.status}).`);
        return;
      }
      setData(await res.json() as TrendsData);
    } catch {
      setError("Network error loading trends.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const dateRange = useMemo(() => {
    if (!data?.trend_points?.length) return null;
    const dates = data.trend_points.map(p => p.date).sort();
    return { from: dates[0], to: dates[dates.length - 1] };
  }, [data]);

  if (loading) {
    return (
      <div style={{ padding: 40, fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
        Loading trends...
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: S.bgDeep, padding: "28px 40px", fontFamily: S.fontUI }}>
      {/* Breadcrumb + header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontFamily: S.fontMono, fontSize: 10, color: S.tertiary,
          letterSpacing: "0.1em", marginBottom: 6,
        }}>
          <a href="/audit-lab" style={{ color: S.cyan, textDecoration: "none" }}>AUDIT LAB</a>
          {" / "}
          <span>TRENDS</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontFamily: S.fontMono, fontSize: 18, fontWeight: 700, color: S.primary, margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
              <TrendingUp size={20} style={{ color: S.cyan }} />
              Trend Dashboard
            </h1>
            <p style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, marginTop: 6 }}>
              Historical trends across audit runs.
              {dateRange && (
                <span style={{ fontFamily: S.fontMono, color: S.tertiary }}>
                  {" \u00B7 "}{dateRange.from} to {dateRange.to}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: `color-mix(in srgb, ${S.red} 8%, transparent)`,
          border: `1px solid color-mix(in srgb, ${S.red} 30%, transparent)`,
          padding: "10px 16px", marginBottom: 16, fontFamily: S.fontMono, fontSize: 12, color: S.red,
        }}>
          {error}
        </div>
      )}

      {/* Charts grid */}
      {data && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Markup Cost Over Time */}
          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: "20px 24px" }}>
            <div style={{
              fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
              letterSpacing: "0.06em", color: S.primary,
              textTransform: "uppercase", marginBottom: 16,
            }}>
              Markup Cost Over Time
            </div>
            {data.trend_points.length > 0 ? (
              <MarkupTrendChart points={data.trend_points} />
            ) : (
              <div style={{
                height: 200, display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: S.fontMono, fontSize: 13, color: S.tertiary, background: S.bgSub,
              }}>
                No trend data available yet
              </div>
            )}
          </div>

          {/* Two-column row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            {/* Data Quality Trend */}
            <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: "20px 24px" }}>
              <div style={{
                fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                letterSpacing: "0.06em", color: S.primary,
                textTransform: "uppercase", marginBottom: 16,
              }}>
                Data Quality Trend
              </div>
              {data.trend_points.length > 0 ? (
                <QualityTrendChart points={data.trend_points} />
              ) : (
                <div style={{
                  height: 200, display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: S.fontMono, fontSize: 13, color: S.tertiary, background: S.bgSub,
                }}>
                  No data quality metrics yet
                </div>
              )}
            </div>

            {/* Counterparty Mix */}
            <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: "20px 24px" }}>
              <div style={{
                fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                letterSpacing: "0.06em", color: S.primary,
                textTransform: "uppercase", marginBottom: 16,
              }}>
                Counterparty Mix
              </div>
              {data.counterparty_breakdown.length > 0 ? (
                <CounterpartyChart data={data.counterparty_breakdown} />
              ) : (
                <div style={{
                  height: 200, display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: S.fontMono, fontSize: 13, color: S.tertiary, background: S.bgSub,
                }}>
                  No counterparty data available
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
