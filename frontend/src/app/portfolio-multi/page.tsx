"use client";

import { useState } from "react";
import { useAuth } from "../../lib/authContext";
import { PAIR_REGISTRY, GROUP_LABELS, getPairsByGroup, type PairGroup } from "../../constants/pairRegistry";

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
  amber:    "var(--accent-amber)",
  green:    "var(--status-pass,#22c55e)",
  red:      "var(--accent-red,#f87171)",
} as const;

const GROUPS: PairGroup[] = ["G10", "EM_LATAM", "EM_ASIA", "EM_CEEMEA"];

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
          <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: S.cyan }}>
            {GROUP_LABELS[group]}
          </span>
          <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
            {pairs.length} pairs
          </span>
        </div>
        {ndfCount > 0 && (
          <span style={{
            fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.amber,
            padding: "2px 7px", border: `1px solid ${S.amber}`, borderRadius: 2,
            background: `color-mix(in srgb, ${S.amber} 10%, transparent)`,
          }}>
            {ndfCount} NDF
          </span>
        )}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: S.sub }}>
            {["Pair", "Settlement", "Spot Ref", "1M Vol", "ADV"].map(h => (
              <th key={h} style={{
                padding: "7px 14px", fontFamily: S.fontMono, fontSize: 10, fontWeight: 700,
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
                      fontFamily: S.fontMono, fontSize: 9, color: S.amber,
                      padding: "1px 5px", border: `1px solid ${S.amber}`, borderRadius: 2,
                    }}>NDF</span>
                  )}
                </div>
              </td>
              <td style={{ padding: "9px 14px", fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>
                {p.settlementType}
              </td>
              <td style={{ padding: "9px 14px", fontFamily: S.fontMono, fontSize: 12, color: S.primary }}>
                {p.demoSpot.toLocaleString("en", { maximumFractionDigits: 4, minimumFractionDigits: 2 })}
              </td>
              <td style={{ padding: "9px 14px", fontFamily: S.fontMono, fontSize: 12, color: S.primary }}>
                {p.vol1m}%
              </td>
              <td style={{ padding: "9px 14px", fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
                ${p.adv_mn >= 1000
                  ? `${(p.adv_mn / 1000).toFixed(0)}B`
                  : `${p.adv_mn.toLocaleString()}M`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PortfolioMultiPage() {
  const { user } = useAuth();
  const [activeGroup, setActiveGroup] = useState<PairGroup | "ALL">("ALL");

  const allNdf = PAIR_REGISTRY.filter(p => p.isNdf).length;
  const allDeliverable = PAIR_REGISTRY.filter(p => !p.isNdf).length;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", fontFamily: S.fontUI }}>
      {/* Header */}
      <div style={{
        borderBottom: `1px solid ${S.rim}`, background: S.panel,
        padding: "0 20px", height: 48, flexShrink: 0,
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: S.cyan }}>
          MULTI-PAIR PORTFOLIO
        </span>
        <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
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
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(5, 1fr)",
        borderBottom: `1px solid ${S.rim}`, flexShrink: 0,
      }}>
        {[
          { label: "Total Pairs", value: String(PAIR_REGISTRY.length), sub: "26 currencies" },
          { label: "G10 Pairs", value: "10", sub: "Deliverable FWD" },
          { label: "EM Pairs", value: "16", sub: "7 NDF, 9 DEL" },
          { label: "NDF Pairs", value: String(allNdf), sub: "Cash-settled" },
          { label: "ADV Range", value: "$3M–$500B", sub: "USD daily volume" },
        ].map(({ label, value, sub }) => (
          <div key={label} style={{
            padding: "12px 18px", borderRight: `1px solid ${S.rim}`,
            display: "flex", flexDirection: "column", gap: 3,
          }}>
            <div style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary }}>{label}</div>
            <div style={{ fontFamily: S.fontMono, fontSize: 18, fontWeight: 700, color: S.primary }}>{value}</div>
            <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Group filter tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${S.rim}`, background: S.sub, flexShrink: 0 }}>
        {(["ALL", ...GROUPS] as Array<PairGroup | "ALL">).map(g => (
          <button key={g} onClick={() => setActiveGroup(g)} style={{
            fontFamily: S.fontMono, fontSize: 11, fontWeight: 700,
            padding: "0 18px", height: 38, border: "none",
            borderBottom: activeGroup === g ? `2px solid ${S.cyan}` : "2px solid transparent",
            background: "transparent",
            color: activeGroup === g ? S.cyan : S.tertiary,
            cursor: "pointer", whiteSpace: "nowrap",
          }}>
            {g === "ALL" ? "ALL PAIRS" : GROUP_LABELS[g as PairGroup].toUpperCase()}
          </button>
        ))}
      </div>

      {/* Pair tables */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        {(activeGroup === "ALL" ? GROUPS : [activeGroup as PairGroup]).map(group => (
          <GroupCard key={group} group={group} />
        ))}

        {/* Legend */}
        <div style={{
          padding: "12px 16px", background: S.sub, border: `1px solid ${S.soft}`, borderRadius: 3,
          fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, lineHeight: 1.8,
        }}>
          <strong style={{ color: S.secondary }}>Settlement Types:</strong>{" "}
          <span style={{ color: S.green }}>DELIVERABLE</span> — physical FX exchange on value date.{" "}
          <span style={{ color: S.amber }}>NDF</span> — Non-Deliverable Forward, cash-settled in USD on fixing date.
          Spot reference rates are BIS-calibrated fallback values (March 2026). ADV = average daily volume.
        </div>
      </div>
    </div>
  );
}
