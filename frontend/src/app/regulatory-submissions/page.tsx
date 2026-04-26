"use client";

/**
 * /regulatory-submissions — TR submission queue.
 *
 * Columns: framework, UTI, status, source run, doc hash, created.
 * Stats strip across the top. Inline "create submission" form and per-row
 * actions: Submit, Acknowledge, Reject, Mark Failed.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import { useAuth } from "@/lib/authContext";
import {
  acknowledge,
  createSubmission,
  getStats,
  listSubmissions,
  markFailed,
  markSubmitted,
  rejectSubmission,
  type RegulatorySubmission,
  type SubmissionFramework,
  type SubmissionStats,
  type SubmissionStatus,
} from "@/lib/api/regulatorySubmissionClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  textPri: "var(--text-primary)",
  textSec: "var(--text-secondary)",
  white: "#fff",
} as const;

const FRAMEWORKS: SubmissionFramework[] = [
  "EMIR",
  "MIFID_II",
  "DODD_FRANK",
  "ISDA",
  "FINRA_17A4",
  "IFRS9",
];

const STATUSES: SubmissionStatus[] = [
  "PENDING",
  "SUBMITTED",
  "ACKNOWLEDGED",
  "REJECTED",
  "FAILED",
];

const statusColor = (s: SubmissionStatus): string => {
  switch (s) {
    case "ACKNOWLEDGED":
      return "var(--success, #38a169)";
    case "SUBMITTED":
      return "var(--accent-cyan, #3b82f6)";
    case "PENDING":
      return "var(--warning, #dd6b20)";
    case "REJECTED":
    case "FAILED":
      return "var(--danger, #e53e3e)";
    default:
      return S.textSec;
  }
};

const fmtDate = (iso: string | null): string => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

const truncateHash = (h: string): string => (h.length > 16 ? `${h.slice(0, 16)}…` : h);

export default function RegulatorySubmissionsPage() {
  const isMobile = useIsMobile();
  const { token } = useAuth();
  const [rows, setRows] = useState<RegulatorySubmission[]>([]);
  const [stats, setStats] = useState<SubmissionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<SubmissionStatus | "">("");
  const [frameworkFilter, setFrameworkFilter] = useState<SubmissionFramework | "">("");

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [draftFramework, setDraftFramework] = useState<SubmissionFramework>("EMIR");
  const [draftRunId, setDraftRunId] = useState("");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [list, s] = await Promise.all([
        listSubmissions(token, {
          framework: frameworkFilter || undefined,
          status: statusFilter || undefined,
          limit: 200,
        }),
        getStats(token),
      ]);
      setRows(list);
      setStats(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    } finally {
      setLoading(false);
    }
  }, [token, frameworkFilter, statusFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onCreate = async () => {
    if (!token) return;
    setCreating(true);
    try {
      await createSubmission(token, {
        framework: draftFramework,
        source_run_id: draftRunId.trim() || null,
      });
      setShowCreate(false);
      setDraftRunId("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "create failed");
    } finally {
      setCreating(false);
    }
  };

  const onSubmit = async (id: string) => {
    if (!token) return;
    try {
      await markSubmitted(token, id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "submit failed");
    }
  };

  const onAcknowledge = async (id: string) => {
    if (!token) return;
    const ref = window.prompt("Enter TR acknowledgment reference:");
    if (!ref) return;
    try {
      await acknowledge(token, id, { ack_reference: ref });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "acknowledge failed");
    }
  };

  const onReject = async (id: string) => {
    if (!token) return;
    const reason = window.prompt("Enter rejection reason:");
    if (!reason) return;
    try {
      await rejectSubmission(token, id, { rejection_reason: reason });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "reject failed");
    }
  };

  const onFail = async (id: string) => {
    if (!token) return;
    const reason = window.prompt("Enter failure reason:");
    if (!reason) return;
    try {
      await markFailed(token, id, { rejection_reason: reason });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "mark-failed failed");
    }
  };

  const statCards = useMemo(() => {
    if (!stats) return null;
    const cards: Array<[string, string | number, string]> = [
      ["Total", stats.total, S.textPri],
      ["Pending", stats.pending, statusColor("PENDING")],
      ["Submitted", stats.submitted, statusColor("SUBMITTED")],
      ["Acknowledged", stats.acknowledged, statusColor("ACKNOWLEDGED")],
      ["Rejected", stats.rejected, statusColor("REJECTED")],
      ["Failed", stats.failed, statusColor("FAILED")],
      ["Ack Rate", `${stats.ack_rate_pct.toFixed(1)}%`, statusColor("ACKNOWLEDGED")],
    ];
    return (
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr 1fr" : "repeat(7, 1fr)", gap: 12, marginBottom: 16 }}>
        {cards.map(([label, val, color]) => (
          <div
            key={label}
            style={{
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              padding: "12px 14px",
              fontFamily: S.fontMono,
            }}
          >
            <div style={{ fontSize: 11, color: S.textSec, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {label}
            </div>
            <div style={{ fontSize: 20, color, marginTop: 4 }}>{val}</div>
          </div>
        ))}
      </div>
    );
  }, [stats, isMobile]);

  return (
    <div style={{ padding: 20, fontFamily: S.fontUI, color: S.textPri }}>
      {error && (
        <div
          style={{
            background: "rgba(229,62,62,0.1)",
            border: "1px solid var(--danger, #e53e3e)",
            padding: "10px 14px",
            marginBottom: 16,
            fontFamily: S.fontMono,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {statCards}

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
        <select
          value={frameworkFilter}
          onChange={(e) => setFrameworkFilter(e.target.value as SubmissionFramework | "")}
          style={{
            background: S.bgSub,
            color: S.textPri,
            border: `1px solid ${S.rim}`,
            padding: "6px 10px",
            fontFamily: S.fontMono,
            fontSize: 12,
          }}
        >
          <option value="">All frameworks</option>
          {FRAMEWORKS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as SubmissionStatus | "")}
          style={{
            background: S.bgSub,
            color: S.textPri,
            border: `1px solid ${S.rim}`,
            padding: "6px 10px",
            fontFamily: S.fontMono,
            fontSize: 12,
          }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={{
            background: "var(--accent-cyan, #3b82f6)",
            color: S.white,
            border: "none",
            padding: "6px 14px",
            fontFamily: S.fontMono,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {showCreate ? "Cancel" : "+ New Submission"}
        </button>
      </div>

      {showCreate && (
        <div
          style={{
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            padding: 14,
            marginBottom: 16,
            display: "flex",
            gap: 10,
            alignItems: "end",
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
            <span style={{ fontSize: 11, color: S.textSec, textTransform: "uppercase" }}>Framework</span>
            <select
              value={draftFramework}
              onChange={(e) => setDraftFramework(e.target.value as SubmissionFramework)}
              style={{
                background: S.bgSub,
                color: S.textPri,
                border: `1px solid ${S.rim}`,
                padding: "6px 10px",
                fontFamily: S.fontMono,
                fontSize: 12,
              }}
            >
              {FRAMEWORKS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 2 }}>
            <span style={{ fontSize: 11, color: S.textSec, textTransform: "uppercase" }}>
              Source calculation_run id (optional)
            </span>
            <input
              type="text"
              value={draftRunId}
              onChange={(e) => setDraftRunId(e.target.value)}
              placeholder="Leave blank for manual (position) report"
              style={{
                background: S.bgSub,
                color: S.textPri,
                border: `1px solid ${S.rim}`,
                padding: "6px 10px",
                fontFamily: S.fontMono,
                fontSize: 12,
              }}
            />
          </label>
          <button
            onClick={onCreate}
            disabled={creating}
            style={{
              background: "var(--success, #38a169)",
              color: S.white,
              border: "none",
              padding: "8px 16px",
              fontFamily: S.fontMono,
              fontSize: 12,
              cursor: creating ? "wait" : "pointer",
              opacity: creating ? 0.6 : 1,
            }}
          >
            {creating ? "Generating…" : "Generate"}
          </button>
        </div>
      )}

      <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: S.fontMono, fontSize: 12 }}>
          <thead>
            <tr style={{ background: S.bgDeep, color: S.textSec }}>
              <th scope="col" style={thStyle}>Framework</th>
              <th scope="col" style={thStyle}>UTI</th>
              <th scope="col" style={thStyle}>Status</th>
              <th scope="col" style={thStyle}>Run</th>
              <th scope="col" style={thStyle}>Doc hash</th>
              <th scope="col" style={thStyle}>Created</th>
              <th scope="col" style={thStyle}>Submitted</th>
              <th scope="col" style={thStyle}>Ack ref</th>
              <th scope="col" style={thStyle}>Retries</th>
              <th scope="col" style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} style={{ padding: 16, textAlign: "center", color: S.textSec }}>
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: 16, textAlign: "center", color: S.textSec }}>
                  No submissions match filters.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} style={{ borderTop: `1px solid ${S.rim}` }}>
                  <td style={tdStyle}>{r.framework}</td>
                  <td style={{ ...tdStyle, fontSize: 11 }}>{r.uti}</td>
                  <td style={{ ...tdStyle, color: statusColor(r.status), fontWeight: 600 }}>{r.status}</td>
                  <td style={{ ...tdStyle, fontSize: 11 }}>{r.source_run_id ?? "—"}</td>
                  <td style={{ ...tdStyle, fontSize: 11 }} title={r.document_hash}>
                    {truncateHash(r.document_hash)}
                  </td>
                  <td style={tdStyle}>{fmtDate(r.created_at)}</td>
                  <td style={tdStyle}>{fmtDate(r.submitted_at)}</td>
                  <td style={{ ...tdStyle, fontSize: 11 }}>{r.ack_reference ?? "—"}</td>
                  <td style={tdStyle}>{r.retry_count}</td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {r.status === "PENDING" && (
                        <button style={actionBtn} onClick={() => onSubmit(r.id)}>
                          Submit
                        </button>
                      )}
                      {r.status === "SUBMITTED" && (
                        <>
                          <button style={actionBtn} onClick={() => onAcknowledge(r.id)}>
                            Ack
                          </button>
                          <button style={actionBtn} onClick={() => onReject(r.id)}>
                            Reject
                          </button>
                        </>
                      )}
                      {r.status !== "ACKNOWLEDGED" && (
                        <button style={actionBtn} onClick={() => onFail(r.id)}>
                          Fail
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  fontWeight: 500,
};

const tdStyle: React.CSSProperties = {
  padding: "8px 12px",
  verticalAlign: "middle",
};

const actionBtn: React.CSSProperties = {
  background: "var(--bg-sub)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-rim)",
  padding: "3px 8px",
  fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontSize: 11,
  cursor: "pointer",
};
