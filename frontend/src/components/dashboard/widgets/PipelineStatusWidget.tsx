"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { GitMerge, X } from "lucide-react";
import { UserContext } from "@/lib/authContext";
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
interface PipelineEntry { sandbox: number; staging: number; ledger: number; }
const PIPELINE_DATA: Record<string, PipelineEntry> = {
  NYC: { sandbox: 3, staging: 2, ledger: 18 },
  MXC: { sandbox: 2, staging: 1, ledger: 12 },
  LDN: { sandbox: 2, staging: 1, ledger: 15 },
  ALL: { sandbox: 7, staging: 4, ledger: 45 },
};
interface Props { token: string; user: UserContext; onRemove?: () => void; }
export default function PipelineStatusWidget({ token, user, onRemove }: Props) {
  const router = useRouter();
  const hasPipelinePerm = Array.isArray(user.permissions) && user.permissions.includes("pipeline.create_proposal");
  const hasViewAll      = Array.isArray(user.permissions) && user.permissions.includes("reports.view_all_branches");
  const branchCode = hasViewAll ? "ALL" : ((user as any).branch?.code?.toUpperCase() ?? "NYC");
  const data: PipelineEntry = PIPELINE_DATA[branchCode] ?? PIPELINE_DATA["NYC"];
  const scopeLabel = hasViewAll ? "ALL BRANCHES" : branchCode;
  const total = data.sandbox + data.staging + data.ledger;
  const stages: Array<{ key: keyof PipelineEntry; label: string; color: string; route: string }> = [
    { key: "sandbox", label: "SANDBOX", color: S.cyan,  route: "/sandbox" },
    { key: "staging", label: "STAGING", color: S.amber, route: "/staging" },
    { key: "ledger",  label: "LEDGER",  color: S.pass,  route: "/ledger"  },
  ];
  return (
    <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 4, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: S.fontUI }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderBottom: `1px solid ${S.rim}`, background: S.bgDeep }}>
        <GitMerge size={12} color={S.cyan} />
        <span style={{ fontFamily: S.fontMono, fontSize: "0.625rem", letterSpacing: "0.1em", color: S.cyan, fontWeight: 700 }}>
          PIPELINE STATUS
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
      <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 10 }}>
        {!hasPipelinePerm ? (
          <p style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.amber, margin: 0, padding: "10px 0", textAlign: "center" }}>
            Requires pipeline.create_proposal permission
          </p>
        ) : (
          <>
            {/* Funnel visualization */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {stages.map((stage, idx) => (
                <React.Fragment key={stage.key}>
                  {idx > 0 && (
                    <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary, flexShrink: 0 }}>→</span>
                  )}
                  <div
                    style={{
                      flex: 1,
                      border: `1px solid ${stage.color}`,
                      borderRadius: 3,
                      padding: "8px 6px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 2,
                    }}
                  >
                    <span style={{ fontFamily: S.fontMono, fontSize: "1.25rem", fontWeight: 700, color: stage.color, lineHeight: 1 }}>
                      {data[stage.key]}
                    </span>
                    <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary, letterSpacing: "0.08em" }}>
                      {stage.label}
                    </span>
                  </div>
                </React.Fragment>
              ))}
            </div>
            {/* Table */}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {stages.map((stage) => (
                  <tr key={stage.key}
                    style={{ borderBottom: `1px solid ${S.soft}` }}>
                    <td style={{ fontFamily: S.fontMono, fontSize: "0.625rem", color: stage.color, padding: "4px 6px", fontWeight: 600, width: 60 }}>
                      {stage.label}
                    </td>
                    <td style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.primary, padding: "4px 6px", textAlign: "right", width: 30 }}>
                      {data[stage.key]}
                    </td>
                    <td style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.tertiary, padding: "4px 6px" }}>
                      active
                    </td>
                    <td style={{ padding: "4px 6px", textAlign: "right" }}>
                      <button
                        onClick={() => router.push(stage.route)}
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: "0.5625rem",
                          color: stage.color,
                          border: `1px solid ${stage.color}`,
                          background: "none",
                          borderRadius: 2,
                          padding: "2px 6px",
                          cursor: "pointer",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {"→ View"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.secondary, borderTop: `1px solid ${S.soft}`, paddingTop: 6 }}>
              `${total} total pipeline runs`
            </div>
          </>
        )}
      </div>
    </div>
  );
}
