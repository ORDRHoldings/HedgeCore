"use client";

import { useState, useMemo } from "react";
import type { PositionRow } from "@/api/positionClient";
import { CRISIS_SCENARIOS, type CrisisEvent } from "@/components/sandbox/CrisisScenarioLibrary";

const S = {
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  rim:       "var(--border-rim)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  green:     "var(--status-pass, #22c55e)",
  amber:     "var(--accent-amber)",
  red:       "var(--accent-red, #f87171)",
} as const;

interface CrisisImpactPanelProps {
  positions: PositionRow[];
  hedgeCoveragePercent: number; // e.g. 0.85 for 85%
}

function fmtUSD(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${(abs / 1_000).toFixed(0)}K`;
  return `${abs.toFixed(0)}`;
}

export default function CrisisImpactPanel({ positions, hedgeCoveragePercent }: CrisisImpactPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const totalNotional = positions.reduce((sum, p) => sum + Math.abs(p.amount ?? 0), 0);
  const currencies    = useMemo(
    () => [...new Set(positions.map(p => p.currency).filter(Boolean))],
    [positions],
  );

  // Pick 6 most relevant crises based on portfolio currencies
  const relevantCrises = useMemo((): CrisisEvent[] => {
    const emCurrencies = new Set(["MXN", "BRL", "TRY", "ZAR", "ARS", "INR", "IDR", "THB", "MYR", "RUB"]);
    const hasEM = currencies.some(c => emCurrencies.has(c));

    let filtered = [...CRISIS_SCENARIOS];
    if (hasEM) {
      filtered.sort((a, b) => {
        const scoreA = (a.region === "EM" || a.primaryCurrencies.some(c => emCurrencies.has(c))) ? 1 : 0;
        const scoreB = (b.region === "EM" || b.primaryCurrencies.some(c => emCurrencies.has(c))) ? 1 : 0;
        return scoreB - scoreA;
      });
    }
    return filtered.slice(0, 6);
  }, [currencies]);

  // Compute crisis impacts: unhedged vs hedged P&L
  const crisisImpacts = useMemo(() => {
    return relevantCrises.map(crisis => {
      // stressParams.spotShock is in % (e.g., 48.0 = 48%). Convert to decimal.
      const spotShockPct = Math.abs(crisis.stressParams?.spotShock ?? Math.abs(crisis.fxShock ?? 30));
      const spotShock    = spotShockPct / 100;

      const unhedgedLoss = totalNotional * spotShock;
      const hedgedLoss   = totalNotional * spotShock * (1 - hedgeCoveragePercent);
      const protection   = unhedgedLoss - hedgedLoss;

      return { crisis, unhedgedLoss, hedgedLoss, protection, spotShockPct };
    });
  }, [relevantCrises, totalNotional, hedgeCoveragePercent]);

  return (
    <div style={{ borderTop: `1px solid ${S.rim}`, marginTop: 12 }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          padding: "10px 0", background: "transparent", border: "none", cursor: "pointer",
          fontFamily: S.fontMono, fontSize: 12, fontWeight: 600,
          letterSpacing: "0.10em", color: S.tertiary, textTransform: "uppercase",
        }}
      >
        <span style={{ transition: "transform 0.15s", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>▸</span>
        CRISIS SCENARIO IMPACT
        <span style={{
          fontSize: 12, padding: "1px 5px",
          border: "1px solid rgba(0,255,255,0.3)",
          background: "rgba(0,255,255,0.06)",
          color: S.cyan, letterSpacing: "0.06em",
        }}>
          {relevantCrises.length} SCENARIOS
        </span>
      </button>

      {expanded && (
        <div style={{ paddingBottom: 16 }}>
          <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, marginBottom: 12 }}>
            How this hedge protects your portfolio under historical crisis scenarios:
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {crisisImpacts.map(({ crisis, unhedgedLoss, protection, spotShockPct }) => (
              <div key={crisis.id} style={{
                display: "grid", gridTemplateColumns: "1fr auto auto",
                gap: 16, alignItems: "center",
                padding: "10px 12px",
                background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 4,
              }}>
                <div>
                  <div style={{ fontFamily: S.fontUI, fontSize: 12, fontWeight: 600, color: S.primary }}>
                    {crisis.name}
                  </div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginTop: 2 }}>
                    {crisis.period} · Spot shock: {spotShockPct.toFixed(0)}%
                    {crisis.region === "EM" && (
                      <span style={{ marginLeft: 6, color: S.amber }}>EM</span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>UNHEDGED LOSS</div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 600, color: S.red }}>{fmtUSD(unhedgedLoss)}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>PROTECTION</div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 600, color: S.green }}>+{fmtUSD(protection)}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginTop: 10, lineHeight: 1.5 }}>
            Scenarios calibrated from BIS, IMF WEO, and academic literature.
            Coverage: {(hedgeCoveragePercent * 100).toFixed(0)}%. Unhedged losses are estimates only.
          </div>
        </div>
      )}
    </div>
  );
}
