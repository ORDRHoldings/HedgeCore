"use client";

import { useEffect, useMemo, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/authContext";
import type { RootState, AppDispatch } from "../../lib/store";
import { listStagingThunk } from "../../lib/store/slices/pipelineSlice";
import type { StagedArtifact } from "../../api/pipelineTypes";
import HelpPanel from "@/components/layout/HelpPanel";
import { STAGING_HELP } from "@/lib/helpContent";

// ── Design tokens ─────────────────────────────────────────────────────────────
const S = {
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:   "var(--bg-deep)",
  bgPanel:  "var(--bg-panel)",
  bgSub:    "var(--bg-sub)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  amber:    "var(--accent-amber)",
  pass:     "var(--status-pass,#4ade80)",
  fail:     "var(--accent-red,#B91C1C)",
} as const;

// ── Status chip ───────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  PENDING:    S.amber,
  APPROVED:   S.pass,
  REJECTED:   S.fail,
  RETURNED:   S.amber,
  REVOKED:    S.fail,
  AUTHORIZED: S.pass,
  STAGED:     S.cyan,
};

function StatusChip({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? S.tertiary;
  return (
    <span style={{
      fontFamily: S.fontMono, fontSize: "0.5625rem", fontWeight: 700,
      letterSpacing: "0.08em", padding: "1px 6px",
      border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      color, background: `color-mix(in srgb, ${color} 10%, transparent)`,
      borderRadius: 2,
    }}>
      {status}
    </span>
  );
}

// ── Integrity score bar ───────────────────────────────────────────────────────
function IntegrityBar({ score }: { score: number }) {
  const color = score >= 90 ? S.pass : score >= 70 ? S.amber : S.fail;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 48, height: 4, background: S.soft, position: "relative" as const, flexShrink: 0 }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${score}%`, background: color }} />
      </div>
      <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color, fontWeight: 600 }}>{score}</span>
    </div>
  );
}

// ── Approval dots ─────────────────────────────────────────────────────────────
function ApprovalDots({ current, required }: { current: number; required: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {Array.from({ length: required }).map((_, i) => (
        <div key={i} style={{
          width: 8, height: 8, borderRadius: "50%",
          background: i < current ? S.pass : S.rim,
          border: `1px solid ${i < current ? S.pass : S.soft}`,
        }} />
      ))}
      <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.tertiary, marginLeft: 2 }}>
        {current}/{required}
      </span>
    </div>
  );
}

// ── Hydration-safe timestamp ──────────────────────────────────────────────────
function useRenderTs(): string {
  const [ts, setTs] = useState('');
  useEffect(() => {
    setTs(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
  }, []);
  return ts;
}

// ── Sort state ────────────────────────────────────────────────────────────────
type SortField = "submitted_at" | "integrity_score" | "status" | "approvals";
type SortDir = "asc" | "desc";

// ── Page ──────────────────────────────────────────────────────────────────────
export default function StagingListPage() {
  const dispatch = useDispatch<AppDispatch>();
  const router = useRouter();
  const renderTs = useRenderTs();
  const { token } = useAuth();
  const { stagingArtifacts, stagingLoading, error } = useSelector(
    (s: RootState) => s.pipeline
  );

  const [sortField, setSortField] = useState<SortField>("submitted_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  useEffect(() => {
    if (token) dispatch(listStagingThunk({ token }));
  }, [dispatch, token]);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  }

  const uniqueStatuses = useMemo(() => {
    const s = new Set(stagingArtifacts.map(a => a.authorization_status));
    return ["ALL", ...Array.from(s)];
  }, [stagingArtifacts]);

  const sorted = useMemo(() => {
    let list = [...stagingArtifacts];
    if (filterStatus !== "ALL") list = list.filter(a => a.authorization_status === filterStatus);
    list.sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0;
      if (sortField === "submitted_at") { va = a.submitted_at; vb = b.submitted_at; }
      else if (sortField === "integrity_score") { va = a.integrity_score; vb = b.integrity_score; }
      else if (sortField === "status") { va = a.authorization_status; vb = b.authorization_status; }
      else if (sortField === "approvals") { va = a.approvals.length; vb = b.approvals.length; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [stagingArtifacts, sortField, sortDir, filterStatus]);

  const pendingCount = stagingArtifacts.filter(a => a.authorization_status === "PENDING").length;
  const approvedCount = stagingArtifacts.filter(a => a.authorization_status === "APPROVED").length;
  const avgIntegrity = stagingArtifacts.length
    ? Math.round(stagingArtifacts.reduce((s, a) => s + a.integrity_score, 0) / stagingArtifacts.length)
    : 0;

  // ── Sortable column header ────────────────────────────────────────────────
  function SortHeader({ field, label }: { field: SortField; label: string }) {
    const isActive = sortField === field;
    return (
      <th
        onClick={() => toggleSort(field)}
        style={{
          padding: "8px 12px", fontFamily: S.fontMono, fontSize: "0.5625rem",
          letterSpacing: "0.07em", textTransform: "uppercase", color: isActive ? S.cyan : S.tertiary,
          textAlign: "left", borderBottom: `1px solid ${S.rim}`, whiteSpace: "nowrap" as const,
          cursor: "pointer", userSelect: "none", background: S.bgSub,
        }}
      >
        {label} {isActive ? (sortDir === "asc" ? "↑" : "↓") : ""}
      </th>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: S.bgDeep, fontFamily: S.fontUI, color: S.primary, flex: 1 }}>

      {/* ── Page header ── */}
      <header style={{
        display: "flex", alignItems: "center", gap: 12, height: 44,
        padding: "0 20px", background: S.bgPanel, borderBottom: `1px solid ${S.rim}`, flexShrink: 0,
      }}>
        <button
          onClick={() => router.push("/")}
          style={{
            fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary,
            background: "transparent", border: `1px solid ${S.rim}`,
            padding: "2px 8px", cursor: "pointer", letterSpacing: "0.04em",
          }}
        >← Home</button>
        <span style={{ color: S.rim }}>|</span>
        <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: S.primary }}>
          Staging Queue
        </span>
        <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.08em", color: S.secondary, padding: "1px 5px", border: `1px solid ${S.rim}` }}>
          GOVERNANCE PIPELINE
        </span>
        {pendingCount > 0 && (
          <span style={{
            fontFamily: S.fontMono, fontSize: "0.6875rem", padding: "1px 6px",
            border: `1px solid ${S.amber}`, color: S.amber,
            background: `color-mix(in srgb, ${S.amber} 8%, transparent)`,
          }}>
            ● {pendingCount} PENDING APPROVAL{pendingCount !== 1 ? "S" : ""}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary }}>{renderTs}</span>
      </header>

      {/* ── KPI strip ── */}
      {!stagingLoading && stagingArtifacts.length > 0 && (
        <div style={{
          display: "flex", gap: 0, background: S.bgPanel, borderBottom: `1px solid ${S.rim}`,
          padding: "0 20px", height: 52, flexShrink: 0,
        }}>
          {[
            { label: "TOTAL STAGED",    value: String(stagingArtifacts.length), color: S.primary },
            { label: "PENDING",         value: String(pendingCount),            color: S.amber },
            { label: "APPROVED",        value: String(approvedCount),           color: S.pass },
            { label: "AVG INTEGRITY",   value: `${avgIntegrity}/100`,           color: avgIntegrity >= 90 ? S.pass : avgIntegrity >= 70 ? S.amber : S.fail },
          ].map(({ label, value, color }, i, arr) => (
            <div key={label} style={{
              display: "flex", flexDirection: "column", justifyContent: "center",
              gap: 2, padding: "0 20px",
              borderRight: i < arr.length - 1 ? `1px solid ${S.rim}` : "none",
            }}>
              <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary, letterSpacing: "0.09em" }}>{label}</span>
              <span style={{ fontFamily: S.fontMono, fontSize: "1rem", fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Content ── */}
      <div style={{ flex: 1, padding: "16px 20px", maxWidth: 1440, width: "100%", margin: "0 auto" }}>

        {/* Error banner */}
        {error && (
          <div style={{
            marginBottom: 12, padding: "10px 16px",
            background: `color-mix(in srgb, ${S.fail} 8%, transparent)`,
            border: `1px solid ${S.fail}`, borderLeft: `3px solid ${S.fail}`,
            fontFamily: S.fontMono, fontSize: "0.75rem", color: S.fail,
          }}>
            {error.message}
          </div>
        )}

        {/* Filter bar */}
        {!stagingLoading && stagingArtifacts.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.tertiary, letterSpacing: "0.07em" }}>FILTER:</span>
            {uniqueStatuses.map(status => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                style={{
                  fontFamily: S.fontMono, fontSize: "0.5625rem", letterSpacing: "0.07em", fontWeight: 600,
                  padding: "2px 8px", borderRadius: 2, cursor: "pointer",
                  border: `1px solid ${filterStatus === status ? S.cyan : S.rim}`,
                  color: filterStatus === status ? S.bgDeep : S.tertiary,
                  background: filterStatus === status ? S.cyan : "transparent",
                }}
              >
                {status}
              </button>
            ))}
            <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.tertiary, marginLeft: "auto" }}>
              {sorted.length} of {stagingArtifacts.length} artifacts
            </span>
          </div>
        )}

        {/* Loading */}
        {stagingLoading ? (
          <div style={{
            textAlign: "center", padding: "60px 0",
            fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary, letterSpacing: "0.06em",
          }}>
            LOADING STAGING QUEUE…
          </div>
        ) : stagingArtifacts.length === 0 ? (
          <div style={{ padding: "60px 28px", textAlign: "center" }}>
            <div style={{ fontFamily: S.fontUI, fontSize: "0.9375rem", fontWeight: 600, color: S.primary, marginBottom: 8 }}>
              No staged artifacts
            </div>
            <div style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", color: S.secondary, marginBottom: 20 }}>
              Submit proposals from the Execution Desk to create staged artifacts for governance review.
            </div>
            <button
              onClick={() => router.push("/execution-desk")}
              style={{
                fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.07em", fontWeight: 700,
                padding: "7px 20px", border: `1px solid ${S.cyan}`,
                color: S.bgDeep, background: S.cyan, cursor: "pointer", borderRadius: 2,
              }}
            >
              OPEN EXECUTION DESK →
            </button>
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary }}>
            NO ARTIFACTS MATCH THIS FILTER
          </div>
        ) : (
          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}` }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ padding: "8px 12px", fontFamily: S.fontMono, fontSize: "0.5625rem", letterSpacing: "0.07em", textTransform: "uppercase", color: S.tertiary, textAlign: "left", borderBottom: `1px solid ${S.rim}`, background: S.bgSub }}>
                    STAGING ID
                  </th>
                  <th style={{ padding: "8px 12px", fontFamily: S.fontMono, fontSize: "0.5625rem", letterSpacing: "0.07em", textTransform: "uppercase", color: S.tertiary, textAlign: "left", borderBottom: `1px solid ${S.rim}`, background: S.bgSub }}>
                    PROPOSAL
                  </th>
                  <SortHeader field="status" label="Status" />
                  <SortHeader field="integrity_score" label="Integrity" />
                  <SortHeader field="approvals" label="Approvals" />
                  <th style={{ padding: "8px 12px", fontFamily: S.fontMono, fontSize: "0.5625rem", letterSpacing: "0.07em", textTransform: "uppercase", color: S.tertiary, textAlign: "left", borderBottom: `1px solid ${S.rim}`, background: S.bgSub }}>
                    SUBMITTER
                  </th>
                  <SortHeader field="submitted_at" label="Submitted" />
                  <th style={{ padding: "8px 12px", fontFamily: S.fontMono, fontSize: "0.5625rem", letterSpacing: "0.07em", textTransform: "uppercase", color: S.tertiary, textAlign: "right", borderBottom: `1px solid ${S.rim}`, background: S.bgSub }}>
                    ACTION
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((artifact: StagedArtifact, i: number) => {
                  const isPending = artifact.authorization_status === "PENDING";
                  return (
                    <tr
                      key={artifact.staging_id}
                      onClick={() => router.push(`/staging/${artifact.staging_id}`)}
                      style={{
                        borderBottom: i < sorted.length - 1 ? `1px solid ${S.soft}` : "none",
                        background: isPending
                          ? `color-mix(in srgb, ${S.amber} 3%, transparent)`
                          : i % 2 === 0 ? "transparent" : `color-mix(in srgb, ${S.rim} 8%, transparent)`,
                        cursor: "pointer",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = `color-mix(in srgb, ${S.cyan} 5%, transparent)`)}
                      onMouseLeave={e => (e.currentTarget.style.background = isPending ? `color-mix(in srgb, ${S.amber} 3%, transparent)` : i % 2 === 0 ? "transparent" : `color-mix(in srgb, ${S.rim} 8%, transparent)`)}
                    >
                      <td style={{ padding: "10px 12px", fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.cyan }}>
                        {artifact.staging_id.slice(0, 12)}…
                      </td>
                      <td style={{ padding: "10px 12px", fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.secondary }}>
                        {artifact.proposal_id.slice(0, 12)}…
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                          <StatusChip status={artifact.authorization_status} />
                          {(artifact as StagedArtifact & { second_approver_required?: boolean; second_approver_id?: string | null }).second_approver_required && (
                            (artifact as StagedArtifact & { second_approver_required?: boolean; second_approver_id?: string | null }).second_approver_id ? (
                              <span style={{
                                fontFamily: S.fontMono, fontSize: "0.5625rem", fontWeight: 700,
                                letterSpacing: "0.08em", padding: "1px 6px",
                                border: `1px solid color-mix(in srgb, ${S.pass} 30%, transparent)`,
                                color: S.pass,
                                background: `color-mix(in srgb, ${S.pass} 10%, transparent)`,
                                borderRadius: 2,
                              }}>
                                2ND APPROVED
                              </span>
                            ) : (
                              <span style={{
                                fontFamily: S.fontMono, fontSize: "0.5625rem", fontWeight: 700,
                                letterSpacing: "0.08em", padding: "1px 6px",
                                border: `1px solid color-mix(in srgb, ${S.amber} 30%, transparent)`,
                                color: S.amber,
                                background: `color-mix(in srgb, ${S.amber} 10%, transparent)`,
                                borderRadius: 2,
                              }}>
                                2ND APPROVAL REQUIRED
                              </span>
                            )
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <IntegrityBar score={artifact.integrity_score} />
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <ApprovalDots current={artifact.approvals.length} required={artifact.required_approvals} />
                      </td>
                      <td style={{ padding: "10px 12px", fontFamily: S.fontUI, fontSize: "0.75rem", color: S.secondary }}>
                        {artifact.submitted_by}
                      </td>
                      <td style={{ padding: "10px 12px", fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, whiteSpace: "nowrap" as const }}>
                        {new Date(artifact.submitted_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>
                        <button
                          onClick={e => { e.stopPropagation(); router.push(`/staging/${artifact.staging_id}`); }}
                          style={{
                            fontFamily: S.fontMono, fontSize: "0.5625rem", letterSpacing: "0.07em", fontWeight: 700,
                            padding: "3px 10px",
                            border: `1px solid ${isPending ? S.amber : S.rim}`,
                            color: isPending ? S.amber : S.tertiary,
                            background: "transparent", cursor: "pointer", borderRadius: 2,
                          }}
                        >
                          {isPending ? "REVIEW →" : "VIEW →"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <footer style={{
        height: 32, display: "flex", alignItems: "center", gap: 8, padding: "0 20px",
        borderTop: `1px solid ${S.rim}`, background: S.bgPanel,
        fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary,
        letterSpacing: "0.04em", flexShrink: 0,
      }}>
        <span>ORDR Terminal · Staging Queue</span>
        <span style={{ color: S.rim }}>·</span>
        <span>Governance Pipeline v1</span>
        <span style={{ color: S.rim }}>·</span>
        <span suppressHydrationWarning>{renderTs}</span>
      </footer>
    </div>
    <HelpPanel config={STAGING_HELP} storageKey="staging" />
    </div>
  );
}
