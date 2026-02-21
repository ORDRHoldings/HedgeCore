"use client";

import React, { useEffect, useState, useCallback } from "react";
import { ClipboardCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { UserContext } from "@/lib/authContext";
import EmptyState from "@/components/ui/EmptyState";

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

import { dashboardFetch } from "@/lib/api/dashboardClient";

interface ApprovalItem {
  id: string;
  proposal_ref: string;
  submitted_by: string;
  branch: string;
  created_at: string;
  notional: number;
  urgency: "HIGH" | "MEDIUM" | "LOW";
}

interface Props {
  token: string;
  user: UserContext;
  onRemove?: () => void;
}

function UrgencyChip({ urgency }: { urgency: ApprovalItem["urgency"] }) {
  const cfg: Record<string, { color: string; bg: string; border: string }> = {
    HIGH:   { color: S.fail,     bg: "rgba(185,28,28,0.12)",   border: S.fail },
    MEDIUM: { color: S.amber,    bg: "rgba(245,158,11,0.12)",  border: S.amber },
    LOW:    { color: S.tertiary, bg: "rgba(255,255,255,0.05)", border: S.soft },
  };
  const c = cfg[urgency] ?? cfg.LOW;
  return (
    <span
      style={{
        fontFamily: S.fontMono,
        fontSize: 10,
        fontWeight: 600,
        color: c.color,
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 3,
        padding: "1px 6px",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {urgency}
    </span>
  );
}

export default function PendingApprovalsWidget({ token, user, onRemove }: Props) {
  const router = useRouter();
  const [items, setItems]         = useState<ApprovalItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const fetchApprovals = useCallback(async () => {
    // Demo tokens are not accepted by the backend — skip fetch in demo mode
    if (token.startsWith("demo_token_")) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const res = await dashboardFetch("/v1/dashboard/pending-approvals", token);
      if (res.status === 403) { setForbidden(true); return; }
      if (!res.ok) { setError(`Error ${res.status}`); return; }
      const data: ApprovalItem[] = await res.json();
      setItems(data);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchApprovals(); }, [fetchApprovals]);

  const count = items.length;

  const monoNote = (color: string): React.CSSProperties => ({
    padding: "18px 14px",
    fontFamily: S.fontMono,
    fontSize: 11,
    color,
  });

  return (
    <div
      style={{
        fontFamily: S.fontUI,
        background: S.bgPanel,
        border: `1px solid ${S.rim}`,
        borderRadius: 6,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "9px 12px",
          borderBottom: `1px solid ${S.soft}`,
          background: S.bgSub,
          flexShrink: 0,
        }}
      >
        <ClipboardCheck size={13} style={{ color: S.cyan, flexShrink: 0 }} />

        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 11,
            fontWeight: 600,
            color: S.primary,
            letterSpacing: "0.09em",
            textTransform: "uppercase",
            flex: 1,
          }}
        >
          PENDING APPROVALS
        </span>

        {/* Count badge - solid red circle */}
        {count > 0 && !loading && !forbidden && !error && (
          <span
            style={{
              background: S.fail,
              color: "#fff",
              fontFamily: S.fontMono,
              fontSize: 10,
              fontWeight: 700,
              borderRadius: "50%",
              minWidth: 18,
              height: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
              flexShrink: 0,
            }}
          >
            {count}
          </span>
        )}

        {/* Close */}
        {onRemove && (
          <button
            onClick={onRemove}
            title="Remove widget"
            style={{
              background: "none",
              border: "none",
              color: S.tertiary,
              cursor: "pointer",
              fontSize: 15,
              lineHeight: 1,
              padding: "0 2px",
              flexShrink: 0,
              fontFamily: S.fontMono,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {loading && (
          <div style={{ padding: "8px 12px" }}>
            <EmptyState type="loading" message="Loading approvals..." />
          </div>
        )}

        {!loading && forbidden && (
          <div style={{ padding: "8px 12px" }}>
            <EmptyState type="error" title="Insufficient permissions" message="Requires pipeline.approve permission." />
          </div>
        )}

        {!loading && !forbidden && error && (
          <div style={{ padding: "8px 12px" }}>
            <EmptyState type="error" title="Error loading approvals" message="Unable to load approval data." />
          </div>
        )}

        {!loading && !forbidden && !error && count === 0 && (
          <div style={{ padding: "8px 12px" }}>
            <EmptyState
              type="empty"
              title="No pending approvals"
              message="Proposals submitted for review will appear here."
              action={{ label: "Go to Staging", onClick: () => router.push("/staging") }}
            />
          </div>
        )}

        {!loading && !forbidden && !error && count > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: S.bgDeep, borderBottom: `1px solid ${S.soft}` }}>
                {["Ref", "Branch", "Submitted By", "Notional", "Urgency", ""].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "6px 12px",
                      textAlign: "left",
                      fontFamily: S.fontMono,
                      fontSize: 10,
                      fontWeight: 600,
                      color: S.tertiary,
                      letterSpacing: "0.07em",
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr
                  key={item.id}
                  style={{
                    borderBottom: `1px solid ${S.soft}`,
                    background: i % 2 === 1 ? "rgba(255,255,255,0.015)" : "transparent",
                  }}
                >
                  {/* Ref */}
                  <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 11,
                        color: S.cyan,
                        letterSpacing: "0.04em",
                      }}
                    >
                      {item.proposal_ref}
                    </span>
                  </td>

                  {/* Branch badge */}
                  <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                    <code
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 10,
                        color: S.secondary,
                        background: S.bgSub,
                        border: `1px solid ${S.soft}`,
                        borderRadius: 3,
                        padding: "1px 5px",
                      }}
                    >
                      {item.branch}
                    </code>
                  </td>

                  {/* Submitted By */}
                  <td
                    style={{
                      padding: "8px 12px",
                      color: S.primary,
                      fontSize: 12,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.submitted_by}
                  </td>

                  {/* Notional */}
                  <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.primary }}>
                      ${(item.notional / 1_000_000).toFixed(1)}M
                    </span>
                  </td>

                  {/* Urgency chip */}
                  <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                    <UrgencyChip urgency={item.urgency} />
                  </td>

                  {/* Review button */}
                  <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                    <button
                      onClick={() => router.push("/staging")}
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 10,
                        color: S.cyan,
                        background: "transparent",
                        border: `1px solid ${S.cyan}`,
                        borderRadius: 3,
                        padding: "3px 8px",
                        cursor: "pointer",
                        letterSpacing: "0.05em",
                        whiteSpace: "nowrap",
                      }}
                      onMouseEnter={(e) =>
                        ((e.currentTarget as HTMLButtonElement).style.background =
                          "rgba(6,182,212,0.12)")
                      }
                      onMouseLeave={(e) =>
                        ((e.currentTarget as HTMLButtonElement).style.background = "transparent")
                      }
                    >
                      → Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}