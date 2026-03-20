"use client";

import { useState, useMemo } from "react";
import { useAuth } from "../../lib/authContext";
import { PAIR_REGISTRY, GROUP_LABELS, getPairsByGroup, type PairGroup } from "../../constants/pairRegistry";
import { usePlanRedirect } from "@/lib/hooks/usePlanRedirect";
import { PageShell } from "@/components/layout/PageShell";
import { BarChart3, AlertTriangle, TrendingDown, Layers } from "lucide-react";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  panel:    "var(--bg-panel)",
  sub:      "var(--bg-sub)",
  deep:     "var(--bg-deep)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  amber:    "var(--accent-amber)",
  green:    "var(--status-pass,#22c55e)",
  red:      "var(--accent-red,#f87171)",
} as const;

type ViewMode = "PAIRS" | "HEATMAP" | "CONCENTRATION" | "RECOMMENDATIONS";
const GROUPS: PairGroup[] = ["G10", "EM_LATAM", "EM_ASIA", "EM_CEEMEA"];

// ── Currencies (ordered by group) ─────────────────────────────────────────────
const CURRENCIES = PAIR_REGISTRY.map(p => p.localCcy);

// ── Seeded correlation matrix ──────────────────────────────────────────────────
// Group-aware: same group = higher base corr, cross-group = lower
const GROUP_OF: Record<string, PairGroup> = {};
for (const p of PAIR_REGISTRY) GROUP_OF[p.localCcy] = p.group;

const CORR_OVERRIDES: Record<string, number> = {
  "DKK-EUR": 0.93, "EUR-DKK": 0.93,
  "AUD-NZD": 0.87, "NZD-AUD": 0.87,
  "SEK-NOK": 0.79, "NOK-SEK": 0.79,
  "EUR-CHF": 0.74, "CHF-EUR": 0.74,
  "EUR-GBP": 0.81, "GBP-EUR": 0.81,
  "EUR-PLN": 0.65, "PLN-EUR": 0.65,
  "EUR-HUF": 0.60, "HUF-EUR": 0.60,
  "KRW-TWD": 0.71, "TWD-KRW": 0.71,
  "BRL-MXN": 0.48, "MXN-BRL": 0.48,
  "SEK-DKK": 0.68, "DKK-SEK": 0.68,
  "CAD-AUD": 0.58, "AUD-CAD": 0.58,
  "PLN-HUF": 0.72, "HUF-PLN": 0.72,
  "IDR-THB": 0.61, "THB-IDR": 0.61,
  "PHP-MYR": 0.55, "MYR-PHP": 0.55,
};

function seedHash(a: string, b: string): number {
  const key = [a, b].sort().join("~");
  let h = 0x9f3bc1;
  for (let i = 0; i < key.length; i++) h = ((h * 31) ^ key.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

function getCorrValue(a: string, b: string): number {
  if (a === b) return 1.0;
  const key = `${a}-${b}`;
  if (CORR_OVERRIDES[key] !== undefined) return CORR_OVERRIDES[key];
  const sameGroup = GROUP_OF[a] === GROUP_OF[b];
  const raw = seedHash(a, b);
  if (sameGroup) return Math.round((0.35 + raw * 0.48) * 100) / 100;
  // JPY is safe-haven — negative with EM risk
  if ((a === "JPY" || b === "JPY") && !sameGroup) return Math.round((-0.05 + raw * 0.25) * 100) / 100;
  return Math.round((-0.05 + raw * 0.38) * 100) / 100;
}

function corrColor(v: number): string {
  // v in [-1, 1] → blue (neg) → white (0) → red (pos)
  if (v >= 0) {
    const t = Math.min(1, v);
    return `rgb(${Math.round(220 - t * 180)}, ${Math.round(220 - t * 190)}, ${Math.round(220 + t * 20)})`;
  } else {
    const t = Math.min(1, -v);
    return `rgb(${Math.round(220 + t * 20)}, ${Math.round(220 - t * 170)}, ${Math.round(220 - t * 150)})`;
  }
}

// ── Demo exposure data (USD thousands) ────────────────────────────────────────
const DEMO_EXPOSURE: Record<string, number> = {
  EUR: 45_000, JPY: 32_000, GBP: 28_000, BRL: 18_000, INR: 15_000,
  MXN: 12_000, AUD: 10_000, ZAR: 8_000,  KRW: 7_500,  TRY: 6_000,
  CHF: 5_500,  PLN: 4_800,  IDR: 4_200,  CAD: 3_800,  TWD: 3_500,
  THB: 3_000,  MYR: 2_800,  PHP: 2_500,  HUF: 2_200,  NZD: 2_000,
  COP: 1_800,  SEK: 1_500,  CLP: 1_200,  PEN: 900,    NOK: 800,   DKK: 600,
};

const TOTAL_EXP = Object.values(DEMO_EXPOSURE).reduce((a, b) => a + b, 0);

// ── GroupCard ──────────────────────────────────────────────────────────────────
function GroupCard({ group }: { group: PairGroup }) {
  const pairs = getPairsByGroup(group);
  const ndfCount = pairs.filter(p => p.isNdf).length;
  return (
    <div style={{ background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 4, overflow: "hidden" }}>
      <div style={{
        padding: "10px 16px", borderBottom: `1px solid ${S.rim}`,
        background: S.sub, display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.cyan }}>
            {GROUP_LABELS[group]}
          </span>
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{pairs.length} pairs</span>
        </div>
        {ndfCount > 0 && (
          <span style={{
            fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.amber,
            padding: "2px 7px", border: `1px solid ${S.amber}`, borderRadius: 2,
            background: `color-mix(in srgb, ${S.amber} 10%, transparent)`,
          }}>{ndfCount} NDF</span>
        )}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: S.sub }}>
            {["Pair", "Settlement", "1M Vol", "ADV"].map(h => (
              <th key={h} style={{
                padding: "7px 14px", fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                color: S.tertiary, textAlign: "left", borderBottom: `1px solid ${S.rim}`,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pairs.map(p => (
            <tr key={p.id} style={{ borderBottom: `1px solid ${S.soft}` }}>
              <td style={{ padding: "9px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.cyan }}>{p.label}</span>
                  {p.isNdf && (
                    <span style={{
                      fontFamily: S.fontMono, fontSize: 12, color: S.amber,
                      padding: "1px 5px", border: `1px solid ${S.amber}`, borderRadius: 2,
                    }}>NDF</span>
                  )}
                </div>
              </td>
              <td style={{ padding: "9px 14px", fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>{p.settlementType}</td>
              <td style={{ padding: "9px 14px", fontFamily: S.fontMono, fontSize: 12, color: S.primary }}>{p.vol1m}%</td>
              <td style={{ padding: "9px 14px", fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
                ${p.adv_mn >= 1000 ? `${(p.adv_mn / 1000).toFixed(0)}B` : `${p.adv_mn.toLocaleString()}M`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── CorrelationHeatmap ─────────────────────────────────────────────────────────
function CorrelationHeatmap() {
  const [hovered, setHovered] = useState<{ r: string; c: string; v: number } | null>(null);
  const CELL = 16;
  const LABEL_W = 46;

  return (
    <div style={{ padding: "16px 20px" }}>
      <div style={{
        fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
        color: S.tertiary, marginBottom: 12, textTransform: "uppercase",
      }}>
        26-Pair Correlation Matrix · 90-Day Rolling (BIS-calibrated)
      </div>

      {/* Hovered cell info */}
      <div style={{
        height: 28, marginBottom: 8, fontFamily: S.fontMono, fontSize: 12,
        color: hovered ? S.primary : S.tertiary,
        display: "flex", alignItems: "center", gap: 12,
      }}>
        {hovered ? (
          <>
            <span style={{ color: S.cyan }}>{hovered.r}</span>
            <span style={{ color: S.tertiary }}>vs</span>
            <span style={{ color: S.cyan }}>{hovered.c}</span>
            <span style={{
              padding: "2px 8px", borderRadius: 3,
              background: corrColor(hovered.v),
              color: "#000", fontWeight: 700, fontSize: 11,
            }}>
              ρ = {hovered.v.toFixed(2)}
            </span>
            <span style={{ color: S.tertiary, fontSize: 11 }}>
              {hovered.v > 0.7 ? "STRONG +" : hovered.v > 0.4 ? "MODERATE +" : hovered.v > 0 ? "WEAK +" : hovered.v > -0.2 ? "WEAK −" : "NEGATIVE"}
            </span>
          </>
        ) : (
          <span>Hover a cell to see correlation detail</span>
        )}
      </div>

      {/* Grid */}
      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "flex" }}>
          {/* Empty top-left corner */}
          <div style={{ width: LABEL_W, flexShrink: 0 }} />
          {/* Column labels */}
          {CURRENCIES.map(c => (
            <div key={c} style={{
              width: CELL, flexShrink: 0, textAlign: "center",
              fontFamily: S.fontMono, fontSize: 7, color: S.tertiary,
              transform: "rotate(-60deg) translateX(-4px)", transformOrigin: "bottom center",
              height: 44, display: "flex", alignItems: "flex-end", justifyContent: "center",
            }}>
              {c}
            </div>
          ))}
        </div>
        {CURRENCIES.map(row => (
          <div key={row} style={{ display: "flex", alignItems: "center" }}>
            {/* Row label */}
            <div style={{
              width: LABEL_W, flexShrink: 0,
              fontFamily: S.fontMono, fontSize: 8, color: S.tertiary,
              textAlign: "right", paddingRight: 6,
            }}>
              {row}
            </div>
            {/* Cells */}
            {CURRENCIES.map(col => {
              const v = getCorrValue(row, col);
              const isHov = hovered?.r === row && hovered?.c === col;
              return (
                <div
                  key={col}
                  onMouseEnter={() => setHovered({ r: row, c: col, v })}
                  onMouseLeave={() => setHovered(null)}
                  title={`${row}/${col}: ρ=${v.toFixed(2)}`}
                  style={{
                    width: CELL, height: CELL, flexShrink: 0,
                    background: corrColor(v),
                    margin: "0.5px",
                    borderRadius: 1,
                    cursor: "crosshair",
                    outline: isHov ? "2px solid var(--accent-cyan)" : "none",
                    outlineOffset: "-1px",
                    transition: "outline 0.1s",
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Color legend */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>−1.0</span>
        <div style={{
          width: 160, height: 10, borderRadius: 2,
          background: "linear-gradient(to right, rgb(240,50,70), rgb(220,220,220), rgb(40,30,210))",
          border: `1px solid ${S.rim}`,
        }} />
        <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>+1.0</span>
        <span style={{ fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, marginLeft: 16 }}>
          Red = positive correlation · Blue = negative · Diagonal = 1.00
        </span>
      </div>

      {/* Group legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
        {(["G10", "EM_LATAM", "EM_ASIA", "EM_CEEMEA"] as PairGroup[]).map(g => (
          <div key={g} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 8, height: 8, borderRadius: 1,
              background: g === "G10" ? "#4080ff" : g === "EM_LATAM" ? "#f59e0b" : g === "EM_ASIA" ? "#22c55e" : "#a78bfa",
            }} />
            <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>{GROUP_LABELS[g]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ConcentrationPanel ─────────────────────────────────────────────────────────
function ConcentrationPanel() {
  const sorted = useMemo(() => {
    return Object.entries(DEMO_EXPOSURE)
      .map(([ccy, amt]) => ({
        ccy,
        amt,
        pct: amt / TOTAL_EXP * 100,
        isNdf: PAIR_REGISTRY.find(p => p.localCcy === ccy)?.isNdf ?? false,
        group: GROUP_OF[ccy] ?? "G10",
        vol1m: PAIR_REGISTRY.find(p => p.localCcy === ccy)?.vol1m ?? 8,
      }))
      .sort((a, b) => b.amt - a.amt);
  }, []);

  const alerts = sorted.filter(r => r.pct >= 15);
  const warnings = sorted.filter(r => r.pct >= 8 && r.pct < 15);

  return (
    <div style={{ padding: "16px 20px" }}>
      <div style={{
        fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
        color: S.tertiary, marginBottom: 16, textTransform: "uppercase",
      }}>
        Currency Concentration · Demo Portfolio · Total ${(TOTAL_EXP / 1000).toFixed(1)}M USD
      </div>

      {/* Alert banners */}
      {alerts.length > 0 && (
        <div style={{
          display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap",
        }}>
          {alerts.map(r => (
            <div key={r.ccy} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 14px", borderRadius: 4,
              background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)",
            }}>
              <AlertTriangle size={13} color={S.red} />
              <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.red }}>
                {r.ccy}
              </span>
              <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary }}>
                {r.pct.toFixed(1)}% — exceeds 15% concentration limit
              </span>
            </div>
          ))}
        </div>
      )}
      {warnings.length > 0 && (
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          {warnings.map(r => (
            <div key={r.ccy} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 14px", borderRadius: 4,
              background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
            }}>
              <AlertTriangle size={13} color={S.amber} />
              <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.amber }}>
                {r.ccy}
              </span>
              <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary }}>
                {r.pct.toFixed(1)}% — approaching 15% limit
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Bar chart */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sorted.map(r => {
          const barW = Math.min(100, (r.amt / sorted[0].amt) * 100);
          const isAlert = r.pct >= 15;
          const isWarn  = r.pct >= 8 && r.pct < 15;
          const barColor = isAlert ? S.red : isWarn ? S.amber : S.cyan;
          return (
            <div key={r.ccy} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* CCY label */}
              <div style={{ width: 36, fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: S.primary, textAlign: "right", flexShrink: 0 }}>
                {r.ccy}
              </div>
              {/* Bar */}
              <div style={{ flex: 1, position: "relative", height: 18, background: S.sub, borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  position: "absolute", left: 0, top: 0, bottom: 0,
                  width: `${barW}%`,
                  background: isAlert ? "rgba(248,113,113,0.5)" : isWarn ? "rgba(245,158,11,0.4)" : "rgba(0,200,255,0.25)",
                  borderRight: `2px solid ${barColor}`,
                  transition: "width 0.3s ease",
                }}>
                  {/* 15% threshold line */}
                  <div style={{
                    position: "absolute", top: 0, bottom: 0,
                    left: `${(15 / (sorted[0].pct)) * 100}%`,
                    width: 1,
                    background: "rgba(248,113,113,0.5)",
                  }} />
                </div>
              </div>
              {/* Amount */}
              <div style={{ width: 64, fontFamily: S.fontMono, fontSize: 11, color: S.secondary, textAlign: "right", flexShrink: 0 }}>
                ${r.amt >= 10_000 ? `${(r.amt / 1000).toFixed(0)}M` : `${(r.amt / 1000).toFixed(1)}M`}
              </div>
              {/* Pct */}
              <div style={{ width: 44, fontFamily: S.fontMono, fontSize: 11, fontWeight: 600, color: barColor, textAlign: "right", flexShrink: 0 }}>
                {r.pct.toFixed(1)}%
              </div>
              {/* Badges */}
              <div style={{ width: 70, display: "flex", gap: 4, flexShrink: 0 }}>
                {r.isNdf && (
                  <span style={{
                    fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.amber,
                    padding: "1px 4px", border: `1px solid ${S.amber}`, borderRadius: 2,
                  }}>NDF</span>
                )}
                {r.vol1m >= 14 && (
                  <span style={{
                    fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.red,
                    padding: "1px 4px", border: `1px solid ${S.red}`, borderRadius: 2,
                  }}>HI-VOL</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        marginTop: 16, padding: "10px 14px", background: S.sub,
        border: `1px solid ${S.soft}`, borderRadius: 3,
        fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, lineHeight: 1.7,
      }}>
        <strong style={{ color: S.secondary }}>Concentration Limits:</strong>{" "}
        <span style={{ color: S.red }}>Alert ≥15%</span> ·{" "}
        <span style={{ color: S.amber }}>Warning ≥8%</span> ·{" "}
        Exposures are notional USD equivalents (March 2026 demo data).
        NDF currencies carry additional fixing risk. HI-VOL = 1M implied vol ≥14%.
      </div>
    </div>
  );
}

// ── RecommendationsPanel ───────────────────────────────────────────────────────
const HEDGE_RECS = [
  {
    ccy: "EUR", pair: "EUR/USD", amt: 45_000, pct: 20.1,
    type: "FWD" as const, tenor: "3M", notional: 31_500, prio: "HIGH" as const,
    rationale: "EUR at 20.1% exceeds 15% concentration limit. Hedge 70% via 3M deliverable forward to reduce delta to ~6%.",
    instrument: "FX Forward",
    action: "SELL EUR 3M FWD",
  },
  {
    ccy: "JPY", pair: "USD/JPY", amt: 32_000, pct: 14.3,
    type: "COLLAR" as const, tenor: "3M", notional: 20_000, prio: "MEDIUM" as const,
    rationale: "JPY approaching 15% limit at 14.3%. Collar (buy put + sell call) for downside protection while retaining upside if JPY recovers.",
    instrument: "FX Collar",
    action: "BUY USD/JPY COLLAR 3M",
  },
  {
    ccy: "BRL", pair: "USD/BRL", amt: 18_000, pct: 8.0,
    type: "NDF" as const, tenor: "90d", notional: 12_600, prio: "MEDIUM" as const,
    rationale: "BRL NDF exposure at 8.0% with 16.8% 1M vol. Cash-settle 70% via USD/BRL NDF to eliminate fixing risk.",
    instrument: "NDF",
    action: "BUY USD/BRL NDF 90d",
  },
  {
    ccy: "INR", pair: "USD/INR", amt: 15_000, pct: 6.7,
    type: "NDF" as const, tenor: "90d", notional: 9_000, prio: "LOW" as const,
    rationale: "INR NDF at 6.7% is within limits but benefits from RBI fixing risk hedge given volatile rate environment.",
    instrument: "NDF",
    action: "BUY USD/INR NDF 90d",
  },
  {
    ccy: "ZAR", pair: "USD/ZAR", amt: 8_000, pct: 3.6,
    type: "SPOT" as const, tenor: "SPOT", notional: 5_600, prio: "LOW" as const,
    rationale: "ZAR has lowest liquidity and highest correlation to EM risk-off sentiment (16% 1M vol). Consider spot reduction.",
    instrument: "Spot FX",
    action: "SELL USD/ZAR SPOT",
  },
];

const PRIO_COLOR = { HIGH: "var(--accent-red,#f87171)", MEDIUM: "var(--accent-amber)", LOW: "var(--text-tertiary)" };
const TYPE_COLOR = { FWD: "var(--accent-cyan)", COLLAR: "var(--accent-green,#22c55e)", NDF: "var(--accent-amber)", SPOT: "var(--text-secondary)" };

function RecommendationsPanel() {
  const totalNotional = HEDGE_RECS.reduce((a, r) => a + r.notional, 0);

  return (
    <div style={{ padding: "16px 20px" }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 16,
      }}>
        <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary, textTransform: "uppercase" }}>
          Hedge Recommendations · {HEDGE_RECS.length} actions · ${(totalNotional / 1000).toFixed(1)}M total notional
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {(["HIGH", "MEDIUM", "LOW"] as const).map(p => (
            <span key={p} style={{
              fontFamily: S.fontMono, fontSize: 10, fontWeight: 700,
              color: PRIO_COLOR[p], padding: "2px 6px",
              border: `1px solid ${PRIO_COLOR[p]}`, borderRadius: 2,
              background: `${PRIO_COLOR[p]}18`,
            }}>{p}</span>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {HEDGE_RECS.map((rec, i) => (
          <div key={rec.ccy} style={{
            background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 4, overflow: "hidden",
          }}>
            {/* Header row */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 16px", borderBottom: `1px solid ${S.soft}`,
              background: S.sub,
            }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.tertiary, width: 20 }}>
                #{i + 1}
              </span>
              <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.cyan }}>
                {rec.ccy}
              </span>
              <span style={{
                fontFamily: S.fontMono, fontSize: 10, fontWeight: 700,
                padding: "2px 7px", borderRadius: 2,
                color: PRIO_COLOR[rec.prio],
                background: `${PRIO_COLOR[rec.prio]}15`,
                border: `1px solid ${PRIO_COLOR[rec.prio]}40`,
              }}>{rec.prio} PRIORITY</span>
              <span style={{
                fontFamily: S.fontMono, fontSize: 10, fontWeight: 700,
                padding: "2px 7px", borderRadius: 2,
                color: TYPE_COLOR[rec.type],
                background: `${TYPE_COLOR[rec.type]}15`,
                border: `1px solid ${TYPE_COLOR[rec.type]}40`,
              }}>{rec.instrument}</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
                Current: ${(rec.amt / 1000).toFixed(1)}M ({rec.pct.toFixed(1)}%)
              </span>
              <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: S.primary }}>
                Hedge: ${(rec.notional / 1000).toFixed(1)}M · {rec.tenor}
              </span>
            </div>

            {/* Action + rationale */}
            <div style={{ padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: 16 }}>
              {/* Action badge */}
              <div style={{
                flexShrink: 0, padding: "8px 14px",
                background: S.deep, border: `1px solid ${S.rim}`, borderRadius: 3,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 140,
              }}>
                <TrendingDown size={14} color={S.cyan} />
                <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.cyan, letterSpacing: "0.06em", textAlign: "center" }}>
                  {rec.action}
                </span>
              </div>
              {/* Rationale */}
              <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, lineHeight: 1.6 }}>
                {rec.rationale}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 12, padding: "10px 14px", background: S.sub,
        border: `1px solid ${S.soft}`, borderRadius: 3,
        fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, lineHeight: 1.7,
      }}>
        <strong style={{ color: S.secondary }}>Disclaimer:</strong>{" "}
        Recommendations are algorithmically derived from concentration limits and volatility thresholds.
        All hedge decisions require 4-eyes approval via the Governance pipeline before execution.
        NDF instruments require confirmation of eligible fixing sources (EMTA/BBG).
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function PortfolioMultiPage() {
  const _planAllowed = usePlanRedirect("enterprise");
  const { user } = useAuth();
  const [view, setView] = useState<ViewMode>("PAIRS");
  const [activeGroup, setActiveGroup] = useState<PairGroup | "ALL">("ALL");

  if (!_planAllowed) return null;

  const allNdf = PAIR_REGISTRY.filter(p => p.isNdf).length;
  const allDeliverable = PAIR_REGISTRY.filter(p => !p.isNdf).length;

  const VIEWS: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
    { id: "PAIRS",           label: "PAIRS",           icon: <Layers size={12} /> },
    { id: "HEATMAP",         label: "HEATMAP",         icon: <BarChart3 size={12} /> },
    { id: "CONCENTRATION",   label: "CONCENTRATION",   icon: <AlertTriangle size={12} /> },
    { id: "RECOMMENDATIONS", label: "HEDGE RECS",      icon: <TrendingDown size={12} /> },
  ];

  return (
    <PageShell icon={BarChart3} title="Multi-Currency Portfolio" breadcrumb={["Dashboard", "Portfolio"]} noPadding>
      <div style={{ height: "100%", display: "flex", flexDirection: "column", fontFamily: S.fontUI }}>

        {/* Header */}
        <div style={{
          borderBottom: `1px solid ${S.rim}`, background: S.panel,
          padding: "0 20px", height: 48, flexShrink: 0,
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: S.cyan }}>
            MULTI-PAIR PORTFOLIO
          </span>
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
            {PAIR_REGISTRY.length} pairs · {allNdf} NDF · {allDeliverable} Deliverable
          </span>
          <div style={{ flex: 1 }} />
          {user && (
            <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>
              {user.full_name ?? user.email}
            </span>
          )}
        </div>

        {/* KPI strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", borderBottom: `1px solid ${S.rim}`, flexShrink: 0 }}>
          {[
            { label: "Total Pairs", value: String(PAIR_REGISTRY.length), sub: "26 currencies" },
            { label: "G10 Pairs",   value: "10",                          sub: "Deliverable FWD" },
            { label: "EM Pairs",    value: "16",                          sub: "7 NDF, 9 DEL" },
            { label: "NDF Pairs",   value: String(allNdf),                sub: "Cash-settled" },
            { label: "ADV Range",   value: "$3M–$500B",                   sub: "USD daily volume" },
          ].map(({ label, value, sub }) => (
            <div key={label} style={{ padding: "12px 18px", borderRight: `1px solid ${S.rim}`, display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary }}>{label}</div>
              <div style={{ fontFamily: S.fontMono, fontSize: 18, fontWeight: 700, color: S.primary }}>{value}</div>
              <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* View mode tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${S.rim}`, background: S.sub, flexShrink: 0 }}>
          {VIEWS.map(v => (
            <button key={v.id} onClick={() => setView(v.id)} style={{
              display: "flex", alignItems: "center", gap: 6,
              fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
              padding: "0 18px", height: 38, border: "none",
              borderBottom: view === v.id ? `2px solid ${S.cyan}` : "2px solid transparent",
              background: "transparent",
              color: view === v.id ? S.cyan : S.tertiary,
              cursor: "pointer",
            }}>
              {v.icon}
              {v.label}
            </button>
          ))}
        </div>

        {/* Group filter tabs (PAIRS view only) */}
        {view === "PAIRS" && (
          <div style={{ display: "flex", borderBottom: `1px solid ${S.rim}`, background: S.panel, flexShrink: 0 }}>
            {(["ALL", ...GROUPS] as Array<PairGroup | "ALL">).map(g => (
              <button key={g} onClick={() => setActiveGroup(g)} style={{
                fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                padding: "0 18px", height: 34, border: "none",
                borderBottom: activeGroup === g ? `2px solid ${S.cyan}` : "2px solid transparent",
                background: "transparent",
                color: activeGroup === g ? S.cyan : S.tertiary,
                cursor: "pointer", whiteSpace: "nowrap",
              }}>
                {g === "ALL" ? "ALL PAIRS" : GROUP_LABELS[g as PairGroup].toUpperCase()}
              </button>
            ))}
          </div>
        )}

        {/* Content area */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {view === "PAIRS" && (
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
              {(activeGroup === "ALL" ? GROUPS : [activeGroup as PairGroup]).map(group => (
                <GroupCard key={group} group={group} />
              ))}
              <div style={{
                padding: "12px 16px", background: S.sub, border: `1px solid ${S.soft}`, borderRadius: 3,
                fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, lineHeight: 1.8,
              }}>
                <strong style={{ color: S.secondary }}>Settlement Types:</strong>{" "}
                <span style={{ color: S.green }}>DELIVERABLE</span> — physical FX exchange on value date.{" "}
                <span style={{ color: S.amber }}>NDF</span> — Non-Deliverable Forward, cash-settled in USD on fixing date.
                Spot reference rates are BIS-calibrated fallback values (March 2026). ADV = average daily volume.
              </div>
            </div>
          )}

          {view === "HEATMAP" && <CorrelationHeatmap />}
          {view === "CONCENTRATION" && <ConcentrationPanel />}
          {view === "RECOMMENDATIONS" && <RecommendationsPanel />}
        </div>
      </div>
    </PageShell>
  );
}
