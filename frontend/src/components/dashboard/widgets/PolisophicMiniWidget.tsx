"use client";

import React from "react";
import { Radar, X, Zap } from "lucide-react";
import Link from "next/link";
import { UserContext } from "@/lib/authContext";
import { RegimeChip, ScoreBar } from "@/components/ui/RiskPrimitives";

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

/* ── Static data ─────────────────────────────────────────────────── */
const RISK_SCORES = [
  { dimension: "MXN Exchange Rate Pressure",   score: 74, regime: "ELEVATED",  currencies: ["MXN"] },
  { dimension: "US Interest Rate Trajectory",  score: 80, regime: "HIGH",      currencies: ["USD"] },
  { dimension: "Mexico Sovereign Credit Risk", score: 62, regime: "MODERATE",  currencies: ["MXN"] },
  { dimension: "Global Liquidity Conditions",  score: 71, regime: "ELEVATED",  currencies: ["USD", "GBP", "MXN"] },
  { dimension: "GBP Trade Uncertainty",        score: 48, regime: "MODERATE",  currencies: ["GBP"] },
];

const TOP_EVENTS = [
  { id: "EVT-2026-0214", headline: "Banxico holds rate at 10.25%; signals two cuts in H1 2026",      severity: 72, alertTriggered: true,  currencies: ["MXN"] },
  { id: "EVT-2026-0211", headline: "FOMC hawkish dissent; rate cut timeline pushed to Q3 2026",      severity: 78, alertTriggered: true,  currencies: ["USD"] },
  { id: "EVT-2026-0213", headline: "OFAC sanctions expansion targeting energy sector counterparties", severity: 85, alertTriggered: true,  currencies: ["USD", "MXN"] },
];

const BRANCH_CURRENCY: Record<string, string> = { NYC: "USD", MXC: "MXN", LDN: "GBP" };

/* ── Regime accent colour ────────────────────────────────────────── */
function regimeAccent(regime: string): string {
  switch (regime) {
    case "HIGH":     return "var(--accent-red,#B91C1C)";
    case "ELEVATED": return "var(--accent-amber)";
    case "MODERATE": return "var(--accent-cyan)";
    default:         return "var(--text-secondary)";
  }
}

/* ── Severity badge colour ───────────────────────────────────────── */
function severityColor(score: number): string {
  if (score >= 80) return "var(--accent-red,#B91C1C)";
  if (score >= 65) return "var(--accent-amber)";
  return "var(--accent-cyan)";
}

interface Props {
  token:    string;
  user:     UserContext;
  onRemove?: () => void;
}

export default function PolisophicMiniWidget({ user, onRemove }: Props) {
  const branchCode     = ((user?.branch?.code) ?? "NYC").toUpperCase();
  const userCurrency   = BRANCH_CURRENCY[branchCode] ?? "USD";
  const relevantEvents = TOP_EVENTS.filter(e => e.currencies.includes(userCurrency)).slice(0, 3);
  const relevantScore  = RISK_SCORES.find(r => r.currencies.includes(userCurrency));
  const compositeScore = Math.round(
    RISK_SCORES.reduce((sum, r) => sum + r.score, 0) / RISK_SCORES.length
  );
  const accentColor = relevantScore ? regimeAccent(relevantScore.regime) : S.secondary;

  return (
    <div
      style={{
        background:    S.bgPanel,
        border:        `1px solid ${S.rim}`,
        borderRadius:  6,
        display:       "flex",
        flexDirection: "column",
        overflow:      "hidden",
        fontFamily:    S.fontUI,
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          8,
          padding:      "8px 12px",
          borderBottom: `1px solid ${S.rim}`,
          background:   S.bgDeep,
        }}
      >
        <Radar size={13} color={S.cyan} style={{ flexShrink: 0 }} />
        <span
          style={{
            fontFamily:    S.fontMono,
            fontSize:      10,
            color:         S.primary,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            flex:          1,
          }}
        >
          Geopolitical Risk
        </span>
        <span
          style={{
            fontFamily:    S.fontMono,
            fontSize:      8,
            color:         S.bgDeep,
            background:    S.secondary,
            padding:       "1px 5px",
            borderRadius:  2,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {userCurrency} Exposure
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

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>

        {/* 1. Currency exposure alert box */}
        {relevantScore && (
          <div
            style={{
              borderLeft:   `3px solid ${accentColor}`,
              background:   S.bgSub,
              borderRadius: "0 4px 4px 0",
              padding:      "7px 10px",
            }}
          >
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize:   10,
                color:      S.primary,
                lineHeight: 1.4,
              }}
            >
              Your{" "}
              <span style={{ color: accentColor, fontWeight: 600 }}>{userCurrency}</span>{" "}
              exposure is facing{" "}
              <span style={{ color: accentColor }}>{relevantScore.regime}</span>{" "}
              risk
            </div>
            <div
              style={{
                marginTop:  5,
                display:    "flex",
                alignItems: "center",
                gap:        8,
              }}
            >
              <ScoreBar score={relevantScore.score} />
              <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>
                Score {relevantScore.score}
              </span>
              <RegimeChip regime={relevantScore.regime} />
            </div>
          </div>
        )}

        {/* 2. Relevant events */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {relevantEvents.map(evt => (
            <div
              key={evt.id}
              style={{
                display:      "flex",
                alignItems:   "flex-start",
                gap:          6,
                background:   S.bgSub,
                border:       `1px solid ${S.soft}`,
                borderRadius: 4,
                padding:      "5px 8px",
              }}
            >
              {evt.alertTriggered && (
                <Zap size={10} color={S.amber} style={{ flexShrink: 0, marginTop: 1 }} />
              )}
              <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.secondary, flex: 1, lineHeight: 1.45 }}>
                {evt.headline}
              </span>
              <span
                style={{
                  fontFamily:   S.fontMono,
                  fontSize:     8,
                  color:        S.bgDeep,
                  background:   severityColor(evt.severity),
                  padding:      "1px 4px",
                  borderRadius: 2,
                  flexShrink:   0,
                  alignSelf:    "flex-start",
                }}
              >
                {evt.severity}
              </span>
            </div>
          ))}
        </div>

        {/* 3. Open Full Polisophic View link */}
        <Link
          href="/polisophic"
          style={{
            fontFamily:     S.fontMono,
            fontSize:       9,
            color:          S.cyan,
            textDecoration: "none",
            letterSpacing:  "0.04em",
          }}
        >
          → Open Full Polisophic View
        </Link>
      </div>

      {/* ── Footer: composite score ──────────────────────────────────── */}
      <div
        style={{
          borderTop:  `1px solid ${S.soft}`,
          background: S.bgDeep,
          padding:    "5px 12px",
          display:    "flex",
          alignItems: "center",
          gap:        8,
        }}
      >
        <span
          style={{
            fontFamily:    S.fontMono,
            fontSize:      9,
            color:         S.tertiary,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Composite Risk:
        </span>
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize:   11,
            color:      severityColor(compositeScore),
            fontWeight: 700,
          }}
        >
          {compositeScore}
        </span>
        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>
          / 100
        </span>
      </div>
    </div>
  );
}
