"use client";
import React from "react";
import { TrendingUp, X } from "lucide-react";
import { UserContext } from "@/lib/authContext";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api";
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
interface ExposureRow {
  currency: string;
  notional_usd: number;
  hedge_ratio: number;
  open_trades: number;
}
const BRANCH_EXPOSURE: Record<string, ExposureRow[]> = {
  NYC: [
    { currency: "USD/MXN", notional_usd: 24_500_000, hedge_ratio: 78, open_trades: 8 },
    { currency: "USD/GBP", notional_usd: 11_200_000, hedge_ratio: 65, open_trades: 5 },
    { currency: "USD/EUR", notional_usd:  6_800_000, hedge_ratio: 82, open_trades: 3 },
  ],
  MXC: [
    { currency: "USD/MXN", notional_usd: 15_400_000, hedge_ratio: 85, open_trades: 12 },
    { currency: "MXN/EUR", notional_usd:  2_800_000, hedge_ratio: 70, open_trades:  4 },
  ],
  LDN: [
    { currency: "GBP/USD", notional_usd: 18_200_000, hedge_ratio: 68, open_trades: 9 },
    { currency: "GBP/EUR", notional_usd:  7_400_000, hedge_ratio: 72, open_trades: 5 },
    { currency: "GBP/MXN", notional_usd:  3_300_000, hedge_ratio: 60, open_trades: 2 },
  ],
};
function mergeAllBranches(): ExposureRow[] {
  const map = new Map<string, ExposureRow>();
  for (const rows of Object.values(BRANCH_EXPOSURE)) {
    for (const row of rows) {
      const existing = map.get(row.currency);
      if (!existing || row.notional_usd > existing.notional_usd) {
        map.set(row.currency, { ...row });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.notional_usd - a.notional_usd);
}
function hedgeColor(ratio: number): string {
  if (ratio >= 75) return "var(--status-pass)";
  if (ratio >= 55) return "var(--accent-amber)";
  return "var(--accent-red,#B91C1C)";
}
function fmtMillions(n: number): string { return `${(n / 1_000_000).toFixed(1)}M`; }
interface Props { token: string; user: UserContext; onRemove?: () => void; }
export default function ExposureSummaryWidget({ token, user, onRemove }: Props) {
  const [hoveredRow, setHoveredRow] = React.useState<number | null>(null);
  const hasTradesView = Array.isArray(user.permissions) && user.permissions.includes("trades.view");
  const hasViewAll    = Array.isArray(user.permissions) && user.permissions.includes("reports.view_all_branches");
  const branchCode = (user as any).branch?.code?.toUpperCase() ?? "NYC";
  const rows: ExposureRow[] = hasViewAll ? mergeAllBranches() : (BRANCH_EXPOSURE[branchCode] ?? BRANCH_EXPOSURE["NYC"]);
  const totalNotional = rows.reduce((sum, r) => sum + r.notional_usd, 0);
  const scopeLabel = hasViewAll ? "ALL BRANCHES" : branchCode;
  return (
    <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 4, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: S.fontUI }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderBottom: `1px solid ${S.rim}`, background: S.bgDeep }}>
        <TrendingUp size={12} color={S.cyan} />
        <span style={{ fontFamily: S.fontMono, fontSize: "0.625rem", letterSpacing: "0.1em", color: S.cyan, fontWeight: 700 }}>
          FX EXPOSURE SUMMARY
        </span>
        <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.amber, border: `1px solid ${S.amber}`, borderRadius: 2, padding: "1px 5px", letterSpacing: "0.05em", marginLeft: 2 }}>
          {scopeLabel}
        </span>
        <span style={{ flex: 1 }} />
        {onRemove && (
          <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: S.tertiary, display: "flex", alignItems: "center", padding: 2, lineHeight: 1 }} title="Remove widget">
            <X size={12} />
          </button>
        )}
      </div>
      {/* Body */}
      <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {!hasTradesView ? (
          <p style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.amber, margin: 0, padding: "10px 0", textAlign: "center" }}>
            Requires trades.view permission
          </p>
        ) : (
          <>
            <div style={{ fontFamily: S.fontMono, fontSize: "0.625rem", color: S.secondary, display: "flex", justifyContent: "flex-end" }}>
              {fmtMillions(totalNotional)} total
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.6875rem" }}>
              <thead>
                <tr>
                  {["Pair", "Notional ($M)", "Hedge %", "Trades"].map((col) => (
                    <th key={col} style={{
                        fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.tertiary, fontWeight: 600,
                        textAlign: col === "Pair" ? "left" : "right", padding: "2px 6px 4px",
                        borderBottom: `1px solid ${S.soft}`, letterSpacing: "0.05em", whiteSpace: "nowrap"
                      }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const isHovered = hoveredRow === idx;
                  const hColor = hedgeColor(row.hedge_ratio);
                  return (
                    <tr key={row.currency}
                      onMouseEnter={() => setHoveredRow(idx)}
                      onMouseLeave={() => setHoveredRow(null)}
                      style={{ background: isHovered ? "rgba(255,255,255,0.03)" : "transparent", transition: "background 0.1s" }}>
                      <td style={{ fontFamily: S.fontMono, color: S.primary, padding: "4px 6px", fontSize: "0.6875rem", fontWeight: 600, whiteSpace: "nowrap" }}>
                        {row.currency}
                      </td>
                      <td style={{ fontFamily: S.fontMono, color: S.secondary, padding: "4px 6px", fontSize: "0.6875rem", textAlign: "right", whiteSpace: "nowrap" }}>
                        {fmtMillions(row.notional_usd)}
                      </td>
                      <td style={{ padding: "4px 6px", textAlign: "right" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5 }}>
                          <div style={{ width: 40, height: 4, background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2, overflow: "hidden", flexShrink: 0 }}>
                            <div style={{ width: `${row.hedge_ratio}%`, height: "100%", background: hColor, transition: "width 0.3s ease" }} />
                          </div>
                          <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: hColor, minWidth: 28, textAlign: "right" }}>
                            {row.hedge_ratio}%
                          </span>
                        </div>
                      </td>
                      <td style={{ fontFamily: S.fontMono, color: S.secondary, padding: "4px 6px", fontSize: "0.6875rem", textAlign: "right" }}>
                        {row.open_trades}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.tertiary, borderTop: `1px solid ${S.soft}`, paddingTop: 6, textAlign: "right" }}>
              Last snapshot: static demo
            </div>
          </>
        )}
      </div>
    </div>
  );
}
