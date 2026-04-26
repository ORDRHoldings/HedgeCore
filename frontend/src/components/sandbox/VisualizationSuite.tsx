"use client";

import { useState } from "react";

// ─── Design tokens ────────────────────────────────────────────────────────────
const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  panel:    "var(--bg-panel)",
  sub:      "var(--bg-sub)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  green:    "var(--accent-green)",
  amber:    "var(--accent-amber)",
  red:      "var(--accent-red, #f87171)",
} as const;

// ─── Shared helpers ───────────────────────────────────────────────────────────

function fmt(n: number, decimals = 0): string {
  if (!isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : n > 0 ? "+" : "";
  if (abs >= 1_000_000) return sign + "$" + (abs / 1_000_000).toFixed(1) + "M";
  if (abs >= 1_000) return sign + "$" + (abs / 1_000).toFixed(0) + "K";
  return sign + "$" + abs.toFixed(decimals);
}

function fmtBps(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(1) + " bps";
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

// ─── Methodology footnote ─────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function MethodologyNote({ formula }: { formula: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        fontFamily: S.fontMono,
        fontSize: 12,
        color: S.tertiary,
        marginTop: 6,
        padding: "3px 8px",
        border: `1px solid ${S.soft}`,
        borderRadius: 3,
        display: "inline-block",
        cursor: "pointer",
        letterSpacing: "0.02em",
        maxWidth: "100%",
        wordBreak: "break-all",
      }}
    >
      {expanded ? `METHODOLOGY: ${formula}` : "METHODOLOGY ⓘ — click to expand formula"}
    </div>
  );
}

// ─── 1. WaterfallChart ────────────────────────────────────────────────────────
// Horizontal waterfall showing P&L attribution from gross exposure → net hedged P&L

export interface WaterfallBar {
  label: string;
  value: number;
  type: string; // "start" | "up" | "down" | "total"
}

export function WaterfallChart({ bars, title = "P&L Waterfall" }: { bars: WaterfallBar[]; title?: string }) {
  const W = 500, H = 220;
  const PAD = { top: 24, right: 20, bottom: 40, left: 72 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const barW = Math.min(36, (chartW / bars.length) - 6);

  // Calculate running total to position bars
  let running = 0;
  const processed = bars.map(b => {
    const prev = running;
    if (b.type !== "total") running += b.value;
    const base = b.type === "total" ? 0 : Math.min(prev, prev + b.value);
    const size = Math.abs(b.value);
    return { ...b, base, size, prevRunning: prev };
  });

  const allValues = processed.flatMap(b => [b.base, b.base + b.size]);
  const minVal = Math.min(0, ...allValues);
  const maxVal = Math.max(0, ...allValues);
  const range = maxVal - minVal || 1;

  const toY = (v: number) => PAD.top + chartH * (1 - (v - minVal) / range);
  const barColor = (b: WaterfallBar) => {
    if (b.type === "total") return S.cyan;
    return b.value >= 0 ? S.green : S.red;
  };

  return (
    <div>
      <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, marginBottom: 6 }}>
        {title.toUpperCase()}
      </div>
      <svg width={W} height={H} style={{ display: "block" }}>
        {/* Zero line */}
        <line
          x1={PAD.left} y1={toY(0)} x2={PAD.left + chartW} y2={toY(0)}
          stroke={S.rim} strokeWidth={1} strokeDasharray="3,3"
        />
        {/* Y-axis labels */}
        {[minVal, (minVal + maxVal) / 2, maxVal].map((v, i) => (
          <text key={i} x={PAD.left - 6} y={toY(v) + 4}
            textAnchor="end" fill={S.tertiary}
            style={{ fontFamily: S.fontMono, fontSize: 12 }}
          >
            {fmt(v)}
          </text>
        ))}
        {/* Bars */}
        {processed.map((b, i) => {
          const x = PAD.left + (chartW / bars.length) * i + (chartW / bars.length - barW) / 2;
          const y = toY(b.base + b.size);
          const h = Math.max(2, toY(b.base) - toY(b.base + b.size));
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={h}
                fill={barColor(b)}
                opacity={0.85}
                rx={1}
              />
              {/* Connector line */}
              {i < bars.length - 1 && b.type !== "total" && (
                <line
                  x1={x + barW} y1={toY(b.type === "total" ? b.size : running - (i === 0 ? 0 : 0))}
                  x2={PAD.left + (chartW / bars.length) * (i + 1) + (chartW / bars.length - barW) / 2}
                  y2={toY(b.type === "total" ? b.size : running - (i === 0 ? 0 : 0))}
                  stroke={S.soft} strokeWidth={1} strokeDasharray="2,2"
                />
              )}
              {/* Value label */}
              <text
                x={x + barW / 2} y={y - 3}
                textAnchor="middle"
                fill={barColor(b)}
                style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: "bold" }}
              >
                {fmt(b.value)}
              </text>
              {/* X label */}
              <text
                x={x + barW / 2} y={H - PAD.bottom + 14}
                textAnchor="middle"
                fill={S.tertiary}
                style={{ fontFamily: S.fontMono, fontSize: 12 }}
                transform={`rotate(-25, ${x + barW / 2}, ${H - PAD.bottom + 14})`}
              >
                {b.label.slice(0, 10)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── 2. DV01LadderChart ──────────────────────────────────────────────────────
// Horizontal bar chart showing DV01 per bucket

export interface DV01Entry {
  bucket: string;     // "2026-03"
  dv01: number;       // USD per bp
  notional: number;   // USD notional
}

export function DV01LadderChart({ entries, title = "DV01 Ladder" }: { entries: DV01Entry[]; title?: string }) {
  const W = 420, H = Math.max(120, entries.length * 32 + 60);
  const PAD = { top: 28, right: 80, bottom: 10, left: 76 };
  const chartW = W - PAD.left - PAD.right;
  const maxDv01 = Math.max(...entries.map(e => Math.abs(e.dv01)), 1);

  return (
    <div>
      <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, marginBottom: 4 }}>
        {title.toUpperCase()} — DV01 $ PER 1BP RATE MOVE
      </div>
      <svg width={W} height={H} style={{ display: "block" }}>
        <text x={PAD.left - 4} y={18} textAnchor="end" fill={S.tertiary} style={{ fontFamily: S.fontMono, fontSize: 12 }}>BUCKET</text>
        {entries.map((e, i) => {
          const y = PAD.top + i * 32;
          const barLen = (Math.abs(e.dv01) / maxDv01) * chartW;
          const isNeg = e.dv01 < 0;
          return (
            <g key={i}>
              <text x={PAD.left - 6} y={y + 11} textAnchor="end" fill={S.secondary} style={{ fontFamily: S.fontMono, fontSize: 12 }}>{e.bucket}</text>
              <rect x={PAD.left} y={y} width={barLen} height={20} fill={isNeg ? S.red : S.green} opacity={0.8} rx={2} />
              <text x={PAD.left + barLen + 5} y={y + 13} fill={isNeg ? S.red : S.green} style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: "bold" }}>
                {isNeg ? "−" : "+"}${Math.abs(e.dv01).toFixed(0)}
              </text>
            </g>
          );
        })}
        {/* Total */}
        <text x={PAD.left} y={H - 4} fill={S.tertiary} style={{ fontFamily: S.fontMono, fontSize: 12 }}>
          TOTAL DV01: {fmt(entries.reduce((s, e) => s + e.dv01, 0), 0)}
        </text>
      </svg>
    </div>
  );
}

// ─── 3. CorrelationHeatmap ────────────────────────────────────────────────────
// Shows currency-pair correlation matrix with heat encoding

export interface CorrelationMatrix {
  labels: string[];
  values: number[][];  // -1 to +1
}

export function CorrelationHeatmap({ matrix, title = "Correlation Matrix" }: { matrix: CorrelationMatrix; title?: string }) {
  const n = matrix.labels.length;
  const CELL = 38;
  const LABEL_W = 44;
  const W = LABEL_W + n * CELL + 4;
  const H = LABEL_W + n * CELL + 4;

  function corrColor(v: number): string {
    // -1 → red, 0 → neutral, +1 → green
    if (v > 0.7) return `rgba(52, 211, 153, ${0.3 + v * 0.6})`;
    if (v > 0) return `rgba(52, 211, 153, ${0.1 + v * 0.3})`;
    if (v > -0.7) return `rgba(248, 113, 113, ${0.1 + Math.abs(v) * 0.3})`;
    return `rgba(248, 113, 113, ${0.3 + Math.abs(v) * 0.6})`;
  }

  return (
    <div>
      <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, marginBottom: 4 }}>
        {title.toUpperCase()}
      </div>
      <svg width={W} height={H} style={{ display: "block" }}>
        {/* Column headers */}
        {matrix.labels.map((lbl, j) => (
          <text key={j}
            x={LABEL_W + j * CELL + CELL / 2}
            y={LABEL_W - 6}
            textAnchor="middle"
            fill={S.secondary}
            style={{ fontFamily: S.fontMono, fontSize: 12 }}
          >{lbl}</text>
        ))}
        {/* Rows */}
        {matrix.values.map((row, i) => (
          row.map((v, j) => {
            const x = LABEL_W + j * CELL;
            const y = LABEL_W + i * CELL;
            return (
              <g key={`${i}-${j}`}>
                {j === 0 && (
                  <text
                    x={LABEL_W - 5} y={y + CELL / 2 + 4}
                    textAnchor="end"
                    fill={S.secondary}
                    style={{ fontFamily: S.fontMono, fontSize: 12 }}
                  >{matrix.labels[i]}</text>
                )}
                <rect x={x + 1} y={y + 1} width={CELL - 2} height={CELL - 2} fill={corrColor(v)} rx={2} />
                <text
                  x={x + CELL / 2} y={y + CELL / 2 + 4}
                  textAnchor="middle"
                  fill={Math.abs(v) > 0.5 ? "#fff" : S.secondary}
                  style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: "bold" }}
                >{v.toFixed(2)}</text>
              </g>
            );
          })
        ))}
      </svg>
      <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginTop: 4 }}>
        DCC-GARCH correlations · Crisis correlations collapse toward +1.0 · Per ISDA SIMM v2.6
      </div>
    </div>
  );
}

// ─── 4. EfficientFrontierChart ─────────────────────────────────────────────────
// Risk/Return scatter plot with efficient frontier curve

export interface PortfolioPoint {
  label: string;
  risk: number;     // annualised vol %
  return: number;   // expected return %
  type: "current" | "proposed" | "optimal" | "frontier";
}

export function EfficientFrontierChart({
  points,
  title = "Efficient Frontier",
}: {
  points: PortfolioPoint[];
  title?: string;
}) {
  const W = 420, H = 280;
  const PAD = { top: 24, right: 20, bottom: 44, left: 52 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const allRisk = points.map(p => p.risk);
  const allRet = points.map(p => p.return);
  const minRisk = Math.max(0, Math.min(...allRisk) * 0.8);
  const maxRisk = Math.max(...allRisk) * 1.15;
  const minRet = Math.min(...allRet) * (Math.min(...allRet) < 0 ? 1.15 : 0.8);
  const maxRet = Math.max(...allRet) * 1.15;

  const toX = (r: number) => PAD.left + ((r - minRisk) / (maxRisk - minRisk)) * chartW;
  const toY = (r: number) => PAD.top + chartH - ((r - minRet) / (maxRet - minRet)) * chartH;

  // Generate frontier curve (parabolic approximation)
  const frontierPts = Array.from({ length: 40 }, (_, i) => {
    const t = i / 39;
    const risk = lerp(minRisk + 2, maxRisk - 2, t);
    // Parabolic frontier: return peaks at moderate risk
    const ret = -0.15 * (risk - (maxRisk + minRisk) * 0.4) ** 2 + (maxRet + minRet) * 0.5;
    return { risk, ret };
  });

  const frontierPath = frontierPts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.risk).toFixed(1)} ${toY(p.ret).toFixed(1)}`)
    .join(" ");

  const dotColor = (type: PortfolioPoint["type"]) => {
    if (type === "optimal") return S.cyan;
    if (type === "proposed") return S.green;
    if (type === "current") return S.amber;
    return S.tertiary;
  };

  return (
    <div>
      <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, marginBottom: 4 }}>
        {title.toUpperCase()} — RISK/RETURN OPTIMISATION
      </div>
      <svg width={W} height={H} style={{ display: "block" }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1.0].map(t => {
          const y = PAD.top + t * chartH;
          const val = maxRet - t * (maxRet - minRet);
          return (
            <g key={t}>
              <line x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y} stroke={S.soft} strokeWidth={0.5} />
              <text x={PAD.left - 5} y={y + 3} textAnchor="end" fill={S.tertiary} style={{ fontFamily: S.fontMono, fontSize: 12 }}>
                {val.toFixed(1)}%
              </text>
            </g>
          );
        })}
        {[0, 0.33, 0.67, 1.0].map(t => {
          const x = PAD.left + t * chartW;
          const val = minRisk + t * (maxRisk - minRisk);
          return (
            <g key={t}>
              <line x1={x} y1={PAD.top} x2={x} y2={PAD.top + chartH} stroke={S.soft} strokeWidth={0.5} />
              <text x={x} y={PAD.top + chartH + 14} textAnchor="middle" fill={S.tertiary} style={{ fontFamily: S.fontMono, fontSize: 12 }}>
                {val.toFixed(1)}%
              </text>
            </g>
          );
        })}
        {/* Axis labels */}
        <text x={PAD.left + chartW / 2} y={H - 4} textAnchor="middle" fill={S.tertiary} style={{ fontFamily: S.fontMono, fontSize: 12 }}>
          PORTFOLIO RISK (σ annualised)
        </text>
        {/* Frontier curve */}
        <path d={frontierPath} fill="none" stroke={S.cyan} strokeWidth={1.5} opacity={0.4} strokeDasharray="4,3" />
        {/* Points */}
        {points.filter(p => p.type !== "frontier").map((p, i) => {
          const x = toX(p.risk), y = toY(p.return);
          const c = dotColor(p.type);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={6} fill={c} opacity={0.85} />
              <text x={x + 9} y={y + 3} fill={c} style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: "bold" }}>
                {p.label}
              </text>
            </g>
          );
        })}
        {/* Zero return line */}
        {minRet < 0 && maxRet > 0 && (
          <line x1={PAD.left} y1={toY(0)} x2={PAD.left + chartW} y2={toY(0)} stroke={S.rim} strokeWidth={1} strokeDasharray="3,3" />
        )}
      </svg>
      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
        {[
          { type: "current" as const, label: "Current" },
          { type: "proposed" as const, label: "Proposed" },
          { type: "optimal" as const, label: "Optimal" },
        ].map(l => (
          <div key={l.type} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor(l.type) }} />
            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── 5. HedgeGauge ────────────────────────────────────────────────────────────
// Radial gauge showing hedge coverage ratio with IFRS 9 bands

export function HedgeGauge({
  ratio,
  label = "Hedge Coverage",
  min = 0,
  max = 1,
}: {
  ratio: number;
  label?: string;
  min?: number;
  max?: number;
}) {
  const W = 200, H = 130;
  const CX = W / 2, CY = 115;
  const R = 80, STROKE = 14;
  const START_ANGLE = Math.PI;
  const END_ANGLE = 2 * Math.PI;
  const TOTAL_ANGLE = END_ANGLE - START_ANGLE;

  const clampedRatio = Math.max(min, Math.min(max, ratio));
  const filledAngle = START_ANGLE + ((clampedRatio - min) / (max - min)) * TOTAL_ANGLE;

  function polarToXY(angle: number, r: number) {
    return {
      x: CX + r * Math.cos(angle),
      y: CY + r * Math.sin(angle),
    };
  }

  function arcPath(startA: number, endA: number, r: number) {
    const s = polarToXY(startA, r);
    const e = polarToXY(endA, r);
    const large = endA - startA > Math.PI ? 1 : 0;
    return `M ${s.x.toFixed(1)} ${s.y.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
  }

  // Color zones: <50% red, 50-80% amber, 80-100% green
  const pct = (clampedRatio - min) / (max - min);
  const needleColor = pct < 0.5 ? S.red : pct < 0.8 ? S.amber : S.green;

  // Zone arcs
  const zones = [
    { start: 0, end: 0.5, color: S.red, opacity: 0.2 },
    { start: 0.5, end: 0.80, color: S.amber, opacity: 0.2 },
    { start: 0.80, end: 1.0, color: S.green, opacity: 0.2 },
  ];

  // Needle endpoint
  const needleEnd = polarToXY(filledAngle, R - STROKE / 2 - 2);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, marginBottom: 2 }}>
        {label.toUpperCase()}
      </div>
      <svg width={W} height={H} style={{ display: "block" }}>
        {/* Zone arcs */}
        {zones.map((z, i) => (
          <path key={i}
            d={arcPath(START_ANGLE + z.start * TOTAL_ANGLE, START_ANGLE + z.end * TOTAL_ANGLE, R)}
            fill="none"
            stroke={z.color}
            strokeWidth={STROKE}
            strokeLinecap="butt"
            opacity={z.opacity + 0.4}
          />
        ))}
        {/* Filled arc */}
        <path
          d={arcPath(START_ANGLE, filledAngle, R)}
          fill="none"
          stroke={needleColor}
          strokeWidth={STROKE}
          strokeLinecap="butt"
          opacity={0.9}
        />
        {/* Needle */}
        <line
          x1={CX} y1={CY}
          x2={needleEnd.x} y2={needleEnd.y}
          stroke={needleColor}
          strokeWidth={2}
          strokeLinecap="round"
        />
        <circle cx={CX} cy={CY} r={5} fill={needleColor} />
        {/* Value */}
        <text x={CX} y={CY - 22} textAnchor="middle" fill={needleColor} style={{ fontFamily: S.fontMono, fontSize: 20, fontWeight: "bold" }}>
          {(ratio * 100).toFixed(0)}%
        </text>
        {/* Min/max labels */}
        <text x={CX - R - 5} y={CY + 14} textAnchor="middle" fill={S.tertiary} style={{ fontFamily: S.fontMono, fontSize: 12 }}>0%</text>
        <text x={CX + R + 5} y={CY + 14} textAnchor="middle" fill={S.tertiary} style={{ fontFamily: S.fontMono, fontSize: 12 }}>100%</text>
        {/* IFRS 9 label */}
        <text x={CX} y={CY + 14} textAnchor="middle" fill={S.tertiary} style={{ fontFamily: S.fontMono, fontSize: 12 }}>IFRS 9.6.4.1</text>
      </svg>
      <div style={{ fontFamily: S.fontMono, fontSize: 12, color: needleColor, fontWeight: 700, marginTop: -4 }}>
        {pct >= 0.8 ? "✓ EFFECTIVE" : pct >= 0.5 ? "⚠ PARTIAL" : "✗ INEFFECTIVE"}
      </div>
    </div>
  );
}

// ─── 6. ScenarioHeatmap ──────────────────────────────────────────────────────
// 2D grid: spot shock rows × carry shock columns, showing P&L outcome

export interface HeatmapCell {
  spotShock: number;    // e.g. -30%
  carryShock: number;   // e.g. -50%
  pnl: number;          // USD
}

export function ScenarioHeatmap({
  cells,
  title = "Scenario P&L Heatmap",
  spotLabel = "SPOT SHOCK %",
  carryLabel = "CARRY SHOCK %",
}: {
  cells: HeatmapCell[];
  title?: string;
  spotLabel?: string;
  carryLabel?: string;
}) {
  if (!cells.length) return null;

  const spotShocks = [...new Set(cells.map(c => c.spotShock))].sort((a, b) => b - a);
  const carryShocks = [...new Set(cells.map(c => c.carryShock))].sort((a, b) => a - b);

  const CELL_W = 56, CELL_H = 28;
  const LABEL_W = 44, LABEL_H = 28;
  const W = LABEL_W + carryShocks.length * CELL_W;
  const H = LABEL_H + spotShocks.length * CELL_H + 24;

  const allPnl = cells.map(c => c.pnl);
  const minPnl = Math.min(...allPnl);
  const maxPnl = Math.max(...allPnl);

  function cellColor(pnl: number): string {
    const t = (pnl - minPnl) / (maxPnl - minPnl || 1);
    if (t > 0.7) return `rgba(52,211,153,${0.15 + t * 0.65})`;
    if (t > 0.5) return `rgba(52,211,153,${0.1 + (t - 0.5) * 0.5})`;
    if (t > 0.3) return `rgba(248,113,113,${0.05 + (0.5 - t) * 0.4})`;
    return `rgba(248,113,113,${0.1 + (0.3 - t) * 0.8})`;
  }

  return (
    <div>
      <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, marginBottom: 4 }}>
        {title.toUpperCase()}
      </div>
      <svg width={W} height={H} style={{ display: "block" }}>
        {/* Column headers */}
        {carryShocks.map((cs, j) => (
          <text key={j} x={LABEL_W + j * CELL_W + CELL_W / 2} y={16}
            textAnchor="middle" fill={S.tertiary}
            style={{ fontFamily: S.fontMono, fontSize: 12 }}
          >{cs > 0 ? "+" : ""}{cs}%</text>
        ))}
        {/* Carry shock label */}
        <text x={LABEL_W + carryShocks.length * CELL_W / 2} y={H - 4}
          textAnchor="middle" fill={S.tertiary}
          style={{ fontFamily: S.fontMono, fontSize: 12 }}
        >{carryLabel}</text>
        {/* Cells */}
        {spotShocks.map((ss, i) =>
          carryShocks.map((cs, j) => {
            const cell = cells.find(c => c.spotShock === ss && c.carryShock === cs);
            const x = LABEL_W + j * CELL_W;
            const y = LABEL_H + i * CELL_H;
            const pnl = cell?.pnl ?? 0;
            return (
              <g key={`${i}-${j}`}>
                {j === 0 && (
                  <text x={LABEL_W - 5} y={y + CELL_H / 2 + 4}
                    textAnchor="end" fill={S.tertiary}
                    style={{ fontFamily: S.fontMono, fontSize: 12 }}
                  >{ss > 0 ? "+" : ""}{ss}%</text>
                )}
                <rect x={x + 1} y={y + 1} width={CELL_W - 2} height={CELL_H - 2}
                  fill={cellColor(pnl)} rx={1} />
                <text x={x + CELL_W / 2} y={y + CELL_H / 2 + 4}
                  textAnchor="middle"
                  fill={Math.abs(pnl) > (maxPnl - minPnl) * 0.4 ? "#fff" : S.secondary}
                  style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: "bold" }}
                >
                  {fmt(pnl)}
                </text>
              </g>
            );
          })
        )}
        {/* Row label */}
        <text
          x={8} y={LABEL_H + spotShocks.length * CELL_H / 2 + 4}
          textAnchor="middle" fill={S.tertiary}
          style={{ fontFamily: S.fontMono, fontSize: 12 }}
          transform={`rotate(-90, 8, ${LABEL_H + spotShocks.length * CELL_H / 2 + 4})`}
        >{spotLabel}</text>
      </svg>
    </div>
  );
}

// ─── 7. FanChart ─────────────────────────────────────────────────────────────
// Forward rate fan chart with confidence bands (10/25/50/75/90 percentile)

export interface FanChartPoint {
  period: string;   // "2026-03"
  p10: number; p25: number; p50: number; p75: number; p90: number;
  actual?: number;
}

export function FanChart({ points, title = "Forward Rate Fan Chart" }: { points: FanChartPoint[]; title?: string }) {
  const W = 440, H = 220;
  const PAD = { top: 24, right: 20, bottom: 36, left: 58 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  if (!points.length) return null;

  const allVals = points.flatMap(p => [p.p10, p.p90, p.actual ?? p.p50]);
  const minV = Math.min(...allVals) * 0.98;
  const maxV = Math.max(...allVals) * 1.02;

  const toX = (i: number) => PAD.left + (i / (points.length - 1 || 1)) * chartW;
  const toY = (v: number) => PAD.top + chartH - ((v - minV) / (maxV - minV)) * chartH;

  function buildArea(upper: keyof FanChartPoint, lower: keyof FanChartPoint): string {
    const top = points.map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(p[upper] as number).toFixed(1)}`).join(" ");
    const bottom = points.map((p, i) => `L ${toX(points.length - 1 - i).toFixed(1)} ${toY(points[points.length - 1 - i][lower] as number).toFixed(1)}`).join(" ");
    return top + " " + bottom + " Z";
  }

  function buildLine(key: keyof FanChartPoint): string {
    return points.map((p, i) => {
      const v = p[key] as number | undefined;
      if (v === undefined) return "";
      return `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`;
    }).filter(Boolean).join(" ");
  }

  return (
    <div>
      <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, marginBottom: 4 }}>
        {title.toUpperCase()}
      </div>
      <svg width={W} height={H} style={{ display: "block" }}>
        {/* Y-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1.0].map(t => {
          const v = minV + t * (maxV - minV);
          return (
            <g key={t}>
              <line x1={PAD.left} y1={PAD.top + t * chartH} x2={PAD.left + chartW} y2={PAD.top + t * chartH} stroke={S.soft} strokeWidth={0.5} />
              <text x={PAD.left - 5} y={PAD.top + (1 - t) * chartH + 4} textAnchor="end" fill={S.tertiary} style={{ fontFamily: S.fontMono, fontSize: 12 }}>
                {v.toFixed(2)}
              </text>
            </g>
          );
        })}
        {/* Fan areas */}
        <path d={buildArea("p90", "p10")} fill={S.cyan} opacity={0.06} />
        <path d={buildArea("p75", "p25")} fill={S.cyan} opacity={0.12} />
        {/* Median */}
        <path d={buildLine("p50")} fill="none" stroke={S.cyan} strokeWidth={2} />
        {/* Actual */}
        {points.some(p => p.actual !== undefined) && (
          <path d={buildLine("actual")} fill="none" stroke={S.amber} strokeWidth={1.5} strokeDasharray="4,3" />
        )}
        {/* X labels */}
        {points.map((p, i) => (
          <text key={i}
            x={toX(i)} y={PAD.top + chartH + 14}
            textAnchor="middle" fill={S.tertiary}
            style={{ fontFamily: S.fontMono, fontSize: 12 }}
          >{p.period.slice(2)}</text>
        ))}
        {/* P90/P10 labels */}
        <text x={PAD.left + chartW - 2} y={toY(points[points.length - 1]?.p90 ?? 0) - 3}
          textAnchor="end" fill={S.cyan} opacity={0.6}
          style={{ fontFamily: S.fontMono, fontSize: 10 }}>P90</text>
        <text x={PAD.left + chartW - 2} y={toY(points[points.length - 1]?.p10 ?? 0) + 10}
          textAnchor="end" fill={S.cyan} opacity={0.6}
          style={{ fontFamily: S.fontMono, fontSize: 10 }}>P10</text>
      </svg>
      <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 12, height: 3, background: S.cyan }} />
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>Median (P50)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 12, height: 8, background: S.cyan, opacity: 0.2 }} />
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>P25–P75 band</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 12, height: 8, background: S.cyan, opacity: 0.1 }} />
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>P10–P90 band</span>
        </div>
        {points.some(p => p.actual !== undefined) && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 12, height: 2, background: S.amber }} />
            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>Actual</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Re-export lerp to avoid unused variable warning ─────────────────────────
export { lerp };

// ─── 8. LossVsHedgeRatioScatter ──────────────────────────────────────────────
// Scatter: X = hedge ratio %, Y = expected loss USD, colour = scenario severity

export interface LossHedgePoint {
  hedgeRatio: number;    // 0–1
  expectedLoss: number;  // USD (negative = loss)
  scenarioId?: string;
  label?: string;
  isOptimal?: boolean;
}

export function LossVsHedgeRatioScatter({
  points,
  title = "Loss vs Hedge Ratio",
  currentRatio = 0.8,
}: {
  points: LossHedgePoint[];
  title?: string;
  currentRatio?: number;
}) {
  const W = 400, H = 260;
  const PAD = { top: 24, right: 20, bottom: 44, left: 68 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  if (!points.length) return null;

  const allLoss = points.map(p => p.expectedLoss);
  const minL = Math.min(...allLoss) * 1.1;
  const maxL = Math.max(...allLoss) * (Math.max(...allLoss) > 0 ? 1.1 : 0.9);

  const toX = (r: number) => PAD.left + r * chartW;
  const toY = (l: number) => PAD.top + chartH - ((l - minL) / (maxL - minL || 1)) * chartH;

  // Fit a smooth curve through points sorted by ratio
  const sorted = [...points].sort((a, b) => a.hedgeRatio - b.hedgeRatio);
  const curvePath = sorted.map((p, i) =>
    `${i === 0 ? "M" : "L"} ${toX(p.hedgeRatio).toFixed(1)} ${toY(p.expectedLoss).toFixed(1)}`
  ).join(" ");

  return (
    <div>
      <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, marginBottom: 4 }}>
        {title.toUpperCase()}
      </div>
      <svg width={W} height={H} style={{ display: "block" }}>
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1.0].map(t => {
          const l = minL + t * (maxL - minL);
          return (
            <g key={t}>
              <line x1={PAD.left} y1={PAD.top + (1 - t) * chartH} x2={PAD.left + chartW} y2={PAD.top + (1 - t) * chartH} stroke={S.soft} strokeWidth={0.5} />
              <text x={PAD.left - 5} y={PAD.top + (1 - t) * chartH + 4} textAnchor="end" fill={S.tertiary} style={{ fontFamily: S.fontMono, fontSize: 12 }}>
                {fmt(l)}
              </text>
            </g>
          );
        })}
        {/* X axis labels */}
        {[0, 0.25, 0.5, 0.75, 1.0].map(r => (
          <g key={r}>
            <line x1={toX(r)} y1={PAD.top} x2={toX(r)} y2={PAD.top + chartH} stroke={S.soft} strokeWidth={0.5} />
            <text x={toX(r)} y={PAD.top + chartH + 14} textAnchor="middle" fill={S.tertiary} style={{ fontFamily: S.fontMono, fontSize: 12 }}>
              {(r * 100).toFixed(0)}%
            </text>
          </g>
        ))}
        <text x={PAD.left + chartW / 2} y={H - 6} textAnchor="middle" fill={S.tertiary} style={{ fontFamily: S.fontMono, fontSize: 12 }}>HEDGE RATIO</text>
        {/* Curve */}
        <path d={curvePath} fill="none" stroke={S.cyan} strokeWidth={1.5} opacity={0.5} />
        {/* Current ratio line */}
        <line
          x1={toX(currentRatio)} y1={PAD.top}
          x2={toX(currentRatio)} y2={PAD.top + chartH}
          stroke={S.amber} strokeWidth={1.5} strokeDasharray="4,3"
        />
        <text x={toX(currentRatio) + 4} y={PAD.top + 10} fill={S.amber} style={{ fontFamily: S.fontMono, fontSize: 12 }}>
          CURRENT {(currentRatio * 100).toFixed(0)}%
        </text>
        {/* Points */}
        {points.map((p, i) => {
          const x = toX(p.hedgeRatio), y = toY(p.expectedLoss);
          const c = p.isOptimal ? S.green : p.expectedLoss < allLoss.reduce((a, b) => a + b, 0) / allLoss.length ? S.red : S.amber;
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={p.isOptimal ? 6 : 4} fill={c} opacity={0.85} />
              {p.label && (
                <text x={x + 8} y={y + 3} fill={c} style={{ fontFamily: S.fontMono, fontSize: 12 }}>{p.label}</text>
              )}
            </g>
          );
        })}
        {/* Zero line */}
        {minL < 0 && maxL > 0 && (
          <line x1={PAD.left} y1={toY(0)} x2={PAD.left + chartW} y2={toY(0)} stroke={S.rim} strokeWidth={1} strokeDasharray="3,3" />
        )}
      </svg>
    </div>
  );
}

// ─── 9. StressTornadoChart ────────────────────────────────────────────────────

export interface TornadoBar {
  label: string;
  shock: number;
  unhedgedPnl: number;
  hedgedPnl: number;
}

export function StressTornadoChart({
  bars,
  title = "Stress P&L Tornado",
}: {
  bars: TornadoBar[];
  title?: string;
}) {
  if (!bars.length) return null;

  const sorted = [...bars].sort((a, b) => a.unhedgedPnl - b.unhedgedPnl);
  const ROW_H = 44;
  const LEFT_PAD = 160;
  const RIGHT_PAD = 20;
  const TOP_PAD = 36;
  const BOT_PAD = 36;
  const chartW = 560;
  const svgH = TOP_PAD + sorted.length * ROW_H + BOT_PAD;
  const W = LEFT_PAD + chartW + RIGHT_PAD;

  const allVals = sorted.flatMap(b => [b.unhedgedPnl, b.hedgedPnl]);
  const minV = Math.min(...allVals, 0);
  const maxV = Math.max(...allVals, 1);
  const range = maxV - minV || 1;
  const zeroX = LEFT_PAD + ((0 - minV) / range) * chartW;
  const toX = (v: number) => LEFT_PAD + ((v - minV) / range) * chartW;
  const barH = 14;

  return (
    <div>
      <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, marginBottom: 6 }}>
        {title.toUpperCase()}
      </div>
      <div style={{ overflowX: "auto" }}>
        <svg width={W} height={svgH} style={{ display: "block", minWidth: W }}>
          {[0, 0.25, 0.5, 0.75, 1.0].map(t => {
            const v = minV + t * range;
            const x = LEFT_PAD + t * chartW;
            return (
              <g key={t}>
                <line x1={x} y1={TOP_PAD - 4} x2={x} y2={TOP_PAD + sorted.length * ROW_H} stroke={S.soft} strokeWidth={0.5} />
                <text x={x} y={TOP_PAD - 10} textAnchor="middle" fill={S.tertiary} style={{ fontFamily: S.fontMono, fontSize: 12 }}>
                  {fmt(v)}
                </text>
              </g>
            );
          })}
          <line x1={zeroX} y1={TOP_PAD - 4} x2={zeroX} y2={TOP_PAD + sorted.length * ROW_H} stroke={S.rim} strokeWidth={1.5} />
          {sorted.map((b, idx) => {
            const y = TOP_PAD + idx * ROW_H;
            const barY1 = y + 4;
            const uc = b.unhedgedPnl < 0 ? S.red : S.green;
            const ux1 = Math.min(toX(b.unhedgedPnl), zeroX);
            const ux2 = Math.max(toX(b.unhedgedPnl), zeroX);
            const uw = Math.max(2, ux2 - ux1);
            const hx1 = Math.min(toX(b.hedgedPnl), zeroX);
            const hx2 = Math.max(toX(b.hedgedPnl), zeroX);
            const hw = Math.max(2, hx2 - hx1);
            const sc = b.shock < 0 ? S.red : S.green;
            return (
              <g key={idx}>
                <text x={LEFT_PAD - 10} y={y + barH + 6} textAnchor="end" fill={S.secondary} style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 600 }}>
                  {b.label.length > 18 ? b.label.slice(0, 16) + "…" : b.label}
                </text>
                <text x={LEFT_PAD - 10} y={y + barH + 19} textAnchor="end" fill={sc} style={{ fontFamily: S.fontMono, fontSize: 12 }}>
                  {b.shock > 0 ? "+" : ""}{(b.shock * 100).toFixed(1)}%
                </text>
                <rect x={ux1} y={barY1} width={uw} height={barH} fill={uc} opacity={0.82} rx={2} />
                <text x={b.unhedgedPnl >= 0 ? ux2 + 5 : ux1 - 5} y={barY1 + barH / 2 + 4} textAnchor={b.unhedgedPnl >= 0 ? "start" : "end"} fill={uc} style={{ fontFamily: S.fontMono, fontSize: 12 }}>
                  {fmt(b.unhedgedPnl)}
                </text>
                <rect x={hx1} y={barY1 + barH + 3} width={hw} height={barH} fill={S.cyan} opacity={0.8} rx={2} />
                <text x={b.hedgedPnl >= 0 ? hx2 + 5 : hx1 - 5} y={barY1 + barH + 3 + barH / 2 + 4} textAnchor={b.hedgedPnl >= 0 ? "start" : "end"} fill={S.cyan} style={{ fontFamily: S.fontMono, fontSize: 12 }}>
                  {fmt(b.hedgedPnl)}
                </text>
                <line x1={LEFT_PAD} y1={y + ROW_H} x2={LEFT_PAD + chartW} y2={y + ROW_H} stroke={S.soft} strokeWidth={0.4} />
              </g>
            );
          })}
          <g transform={`translate(${LEFT_PAD + 8}, ${svgH - BOT_PAD + 10})`}>
            <rect width={12} height={10} fill={S.red} opacity={0.82} rx={1} />
            <text x={16} y={9} fill={S.tertiary} style={{ fontFamily: S.fontMono, fontSize: 12 }}>Unhedged P&amp;L</text>
            <rect x={130} width={12} height={10} fill={S.cyan} opacity={0.8} rx={1} />
            <text x={146} y={9} fill={S.tertiary} style={{ fontFamily: S.fontMono, fontSize: 12 }}>Hedged P&amp;L</text>
          </g>
          <text x={LEFT_PAD + chartW / 2} y={svgH - 6} textAnchor="middle" fill={S.tertiary} style={{ fontFamily: S.fontMono, fontSize: 12 }}>P&amp;L (USD)</text>
        </svg>
      </div>
    </div>
  );
}

// ─── 10. TermStructureSurface ─────────────────────────────────────────────────

export interface TermStructureCell {
  tenor: string;
  scenario: string;
  forwardRate: number;
  carryBps: number;
}

export function TermStructureSurface({
  cells, tenors, scenarios, spot, title = "Term Structure Surface",
}: {
  cells: TermStructureCell[];
  tenors: string[];
  scenarios: string[];
  spot: number;
  title?: string;
}) {
  const CELL_W = Math.max(76, Math.floor(640 / Math.max(scenarios.length, 1)));
  const CELL_H = 54;
  const LABEL_W = 50;
  const HEADER_H = 64;
  const W = LABEL_W + scenarios.length * CELL_W + 24;
  const H = HEADER_H + tenors.length * CELL_H + 24;
  const allRates = cells.map(c => c.forwardRate);
  const maxDev = Math.max(...allRates.map(r => Math.abs(r - spot)), 0.001);

  function cellBg(fr: number): string {
    const dev = fr - spot;
    const intensity = Math.min(1, Math.abs(dev) / maxDev);
    if (dev > 0) return `rgba(52,211,153,${0.1 + intensity * 0.75})`;
    if (dev < 0) return `rgba(248,113,113,${0.1 + intensity * 0.75})`;
    return "rgba(120,120,140,0.1)";
  }
  function tc(fr: number): string {
    return Math.min(1, Math.abs(fr - spot) / maxDev) > 0.55 ? "#fff" : S.secondary;
  }

  return (
    <div>
      <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, marginBottom: 6 }}>
        {title.toUpperCase()} — SPOT: {spot.toFixed(4)}
      </div>
      <div style={{ overflowX: "auto" }}>
        <svg width={W} height={H} style={{ display: "block", minWidth: W }}>
          {scenarios.map((sc, j) => {
            const x = LABEL_W + j * CELL_W + CELL_W / 2;
            return (
              <text key={j} x={x} y={HEADER_H - 8} textAnchor="start" fill={S.secondary}
                style={{ fontFamily: S.fontMono, fontSize: 12 }}
                transform={`rotate(-40, ${x}, ${HEADER_H - 8})`}>
                {sc.slice(0, 16)}
              </text>
            );
          })}
          {tenors.map((tenor, i) => scenarios.map((scenario, j) => {
            const cell = cells.find(c => c.tenor === tenor && c.scenario === scenario);
            const x = LABEL_W + j * CELL_W;
            const y = HEADER_H + i * CELL_H;
            const rate = cell?.forwardRate ?? spot;
            const carry = cell?.carryBps ?? 0;
            return (
              <g key={`${i}-${j}`}>
                {j === 0 && <text x={LABEL_W - 6} y={y + CELL_H / 2 + 5} textAnchor="end" fill={S.secondary} style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 600 }}>{tenor}</text>}
                <rect x={x + 1} y={y + 1} width={CELL_W - 2} height={CELL_H - 2} fill={cellBg(rate)} rx={2} />
                <text x={x + CELL_W / 2} y={y + CELL_H / 2 - 2} textAnchor="middle" fill={tc(rate)} style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: "bold" }}>{rate.toFixed(4)}</text>
                <text x={x + CELL_W / 2} y={y + CELL_H / 2 + 14} textAnchor="middle" fill={tc(rate)} style={{ fontFamily: S.fontMono, fontSize: 12, opacity: 0.85 }}>{fmtBps(carry)}</text>
              </g>
            );
          }))}
          <defs>
            <linearGradient id="termLegend2" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(248,113,113,0.9)" />
              <stop offset="50%" stopColor="rgba(100,100,120,0.12)" />
              <stop offset="100%" stopColor="rgba(52,211,153,0.9)" />
            </linearGradient>
          </defs>
          <rect x={LABEL_W} y={H - 12} width={scenarios.length * CELL_W * 0.7} height={8} fill="url(#termLegend2)" rx={3} />
          <text x={LABEL_W} y={H - 14} fill={S.red} style={{ fontFamily: S.fontMono, fontSize: 12 }}>DISCOUNT</text>
          <text x={LABEL_W + scenarios.length * CELL_W * 0.7} y={H - 14} textAnchor="end" fill={S.green} style={{ fontFamily: S.fontMono, fontSize: 12 }}>PREMIUM</text>
        </svg>
      </div>
    </div>
  );
}

// ─── 11. GreeksRadarChart ─────────────────────────────────────────────────────

export interface GreeksData {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  limits: { delta: number; gamma: number; theta: number; vega: number; rho: number };
}

export function GreeksRadarChart({ data, title = "Greeks Radar" }: { data: GreeksData; title?: string }) {
  const SIZE = 360;
  const CX = SIZE / 2, CY = SIZE / 2, R = 130;
  const axes: Array<{ key: keyof Omit<GreeksData, "limits">; label: string }> = [
    { key: "delta", label: "Δ Delta" }, { key: "gamma", label: "Γ Gamma" },
    { key: "theta", label: "Θ Theta" }, { key: "vega",  label: "ν Vega"  },
    { key: "rho",   label: "ρ Rho"   },
  ];
  const N = axes.length;
  function pt(i: number, frac: number) {
    const a = (Math.PI * 2 * i) / N - Math.PI / 2;
    return { x: CX + R * frac * Math.cos(a), y: CY + R * frac * Math.sin(a) };
  }
  const fracs = axes.map(ax => Math.min(1.2, data.limits[ax.key] > 0 ? data[ax.key] / data.limits[ax.key] : 0));
  function polyPath(fs: number[]) {
    return fs.map((f, i) => { const p = pt(i, f); return `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`; }).join(" ") + " Z";
  }
  return (
    <div style={{ display: "inline-block" }}>
      <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, marginBottom: 6 }}>
        {title.toUpperCase()}
      </div>
      <svg width={SIZE} height={SIZE} style={{ display: "block" }}>
        {[0.25, 0.5, 0.75, 1.0].map((f, ri) => (
          <polygon key={ri} points={axes.map((_, i) => { const p = pt(i, f); return `${p.x.toFixed(2)},${p.y.toFixed(2)}`; }).join(" ")} fill="none" stroke={S.soft} strokeWidth={f === 1.0 ? 1.5 : 0.7} />
        ))}
        {axes.map((_, i) => { const tip = pt(i, 1.0); return <line key={i} x1={CX} y1={CY} x2={tip.x} y2={tip.y} stroke={S.soft} strokeWidth={0.8} />; })}
        <path d={polyPath(axes.map(() => 1.0))} fill="none" stroke={S.amber} strokeWidth={2} opacity={0.7} strokeDasharray="5,3" />
        <path d={polyPath(fracs)} fill={S.cyan} fillOpacity={0.28} stroke={S.cyan} strokeWidth={2} />
        {axes.map((ax, i) => {
          const tip = pt(i, 1.24);
          return <text key={i} x={tip.x} y={tip.y} textAnchor="middle" fill={S.primary} style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: "bold" }}>{ax.label}</text>;
        })}
        {axes.map((ax, i) => {
          const p = pt(i, Math.min(fracs[i], 1.0) * 0.5 + 0.1);
          return <text key={i} x={p.x} y={p.y + 4} textAnchor="middle" fill={S.cyan} style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 600 }}>{data[ax.key].toFixed(1)}%</text>;
        })}
        <circle cx={CX} cy={CY} r={3} fill={S.cyan} opacity={0.6} />
      </svg>
    </div>
  );
}

// ─── 12. VaRConeChart ─────────────────────────────────────────────────────────

export interface VaRConeData {
  vol: number;
  notionalUSD: number;
  skewness?: number;
  kurtosis?: number;
}

export function VaRConeChart({ data, title = "VaR Cone" }: { data: VaRConeData; title?: string }) {
  const W = 680, H = 320;
  const PAD = { top: 36, right: 36, bottom: 52, left: 96 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const horizons = [
    { label: "1D", days: 1 }, { label: "5D", days: 5 },
    { label: "10D", days: 10 }, { label: "21D", days: 21 },
    { label: "63D", days: 63 }, { label: "126D", days: 126 },
  ];
  const dv = data.vol / Math.sqrt(252);
  const N = data.notionalUSD;
  const sk = data.skewness ?? 0;
  const ku = data.kurtosis ?? 0;
  const z95 = 1.6449, z99 = 2.3263;
  function cfZ(z: number) { return z + ((z * z - 1) * sk) / 6 + ((z * z * z - 3 * z) * ku) / 24; }
  const z99cf = cfZ(z99);
  const pts = horizons.map(h => {
    const s = Math.sqrt(h.days);
    return { ...h, var95: N * dv * z95 * s, var99: N * dv * z99 * s, var99cf: N * dv * Math.abs(z99cf) * s };
  });
  const maxV = Math.max(...pts.map(p => p.var99cf));
  const toX = (i: number) => PAD.left + (i / (horizons.length - 1)) * chartW;
  const toY = (v: number) => PAD.top + chartH - (v / (maxV || 1)) * chartH;
  function lp(vals: number[]) { return vals.map((v, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(" "); }
  const bTop = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i).toFixed(1)} ${toY(p.var99).toFixed(1)}`).join(" ");
  const bBot = pts.map((p, i) => `L ${toX(pts.length - 1 - i).toFixed(1)} ${toY(pts[pts.length - 1 - i].var95).toFixed(1)}`).join(" ");
  return (
    <div>
      <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, marginBottom: 6 }}>
        {title.toUpperCase()} — √T SCALING · ANNUAL VOL {(data.vol * 100).toFixed(1)}%
      </div>
      <svg width={W} height={H} style={{ display: "block" }}>
        {[0, 0.25, 0.5, 0.75, 1.0].map(t => (
          <g key={t}>
            <line x1={PAD.left} y1={PAD.top + (1 - t) * chartH} x2={PAD.left + chartW} y2={PAD.top + (1 - t) * chartH} stroke={S.soft} strokeWidth={0.5} />
            <text x={PAD.left - 8} y={PAD.top + (1 - t) * chartH + 4} textAnchor="end" fill={S.tertiary} style={{ fontFamily: S.fontMono, fontSize: 12 }}>{fmt(t * maxV)}</text>
          </g>
        ))}
        {horizons.map((h, i) => (
          <g key={i}>
            <line x1={toX(i)} y1={PAD.top} x2={toX(i)} y2={PAD.top + chartH} stroke={S.soft} strokeWidth={0.5} />
            <text x={toX(i)} y={PAD.top + chartH + 16} textAnchor="middle" fill={S.tertiary} style={{ fontFamily: S.fontMono, fontSize: 12 }}>{h.label}</text>
          </g>
        ))}
        <text x={PAD.left + chartW / 2} y={H - 8} textAnchor="middle" fill={S.tertiary} style={{ fontFamily: S.fontMono, fontSize: 12 }}>HOLDING PERIOD</text>
        <text x={18} y={PAD.top + chartH / 2} textAnchor="middle" fill={S.tertiary} style={{ fontFamily: S.fontMono, fontSize: 12 }} transform={`rotate(-90, 18, ${PAD.top + chartH / 2})`}>VaR (USD)</text>
        <path d={bTop + " " + bBot + " Z"} fill={S.green} opacity={0.1} />
        <path d={lp(pts.map(p => p.var95))} fill="none" stroke={S.green} strokeWidth={2.5} />
        <path d={lp(pts.map(p => p.var99))} fill="none" stroke={S.amber} strokeWidth={2.5} />
        <path d={lp(pts.map(p => p.var99cf))} fill="none" stroke={S.red} strokeWidth={2} strokeDasharray="7,4" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={toX(i)} cy={toY(p.var95)} r={4} fill={S.green} />
            <circle cx={toX(i)} cy={toY(p.var99)} r={4} fill={S.amber} />
            <circle cx={toX(i)} cy={toY(p.var99cf)} r={4} fill={S.red} />
          </g>
        ))}
      </svg>
      <div style={{ display: "flex", gap: 20, marginTop: 6 }}>
        {[
          { color: S.green, label: "VaR 95% (Normal)" },
          { color: S.amber, label: "VaR 99% (Normal)" },
          { color: S.red, label: "VaR 99% (Cornish-Fisher)", dashed: true },
        ].map((l, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 18, height: 3, background: (l as { dashed?: boolean }).dashed ? "transparent" : l.color, borderTop: (l as { dashed?: boolean }).dashed ? `2px dashed ${l.color}` : "none" }} />
            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
