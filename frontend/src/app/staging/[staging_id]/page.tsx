"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../../lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import {
  CheckCircle,
  XCircle,
  Play,
  ArrowLeft,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";

// ── Design tokens ─────────────────────────────────────────────────────────────
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
  pass:      "var(--status-pass,#2ECC71)",
  fail:      "var(--accent-red,#E74C3C)",
  navy:      "#0A1F44",
  royal:     "#1C62F2",
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────
interface Proposal {
  id:                      string;
  position_id:             string;
  company_id:              string;
  branch_id?:              string | null;
  status:                  string;
  proposed_by:             string;
  proposed_by_email?:      string | null;
  proposed_at:             string;
  proposal_hash:           string;
  approved_by?:            string | null;
  approved_by_email?:      string | null;
  approved_at?:            string | null;
  approval_notes?:         string | null;
  approval_hash?:          string | null;
  execution_ref?:          string | null;
  executed_at?:            string | null;
  rejection_reason?:       string | null;
  created_at:              string;
  second_approver_required: boolean;
  second_approver_id?:     string | null;
  second_approver_email?:  string | null;
  second_approved_at?:     string | null;
  second_approval_notes?:  string | null;
  second_approval_hash?:   string | null;
  risk_decision_hash?:     string | null;
  risk_verdict?:           string | null;
  actual_fill_rate?:       number | null;
  actual_fill_notional?:   number | null;
  slippage_bps?:           number | null;
  fill_timestamp?:         string | null;
  fill_hash?:              string | null;
}

// ── Status chip ───────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: string }) {
  const color =
    status === "PROPOSED"   ? S.amber  :
    status === "APPROVED"   ? S.pass   :
    status === "EXECUTED"   ? S.cyan   :
    status === "REJECTED"   ? S.fail   :
    status === "WITHDRAWN"  ? S.tertiary :
    S.tertiary;
  return (
    <span style={{
      fontFamily: S.fontMono, fontSize: "0.625rem", fontWeight: 700,
      letterSpacing: "0.1em", padding: "2px 8px",
      border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
      color, background: `color-mix(in srgb, ${color} 10%, transparent)`,
      borderRadius: 2, textTransform: "uppercase" as const,
    }}>
      {status}
    </span>
  );
}

// ── Hash display ──────────────────────────────────────────────────────────────
function HashPill({ hash, label }: { hash?: string | null; label: string }) {
  if (!hash) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: 2 }}>
      <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary, letterSpacing: "0.08em" }}>
        {label}
      </span>
      <span style={{
        fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.cyan,
        background: `color-mix(in srgb, ${S.cyan} 6%, transparent)`,
        border: `1px solid color-mix(in srgb, ${S.cyan} 20%, transparent)`,
        padding: "2px 6px", letterSpacing: "0.04em", wordBreak: "break-all" as const,
      }}>
        {hash}
      </span>
    </div>
  );
}

// ── Detail row ────────────────────────────────────────────────────────────────
function DetailRow({ label, value, mono = false }: { label: string; value?: string | number | null; mono?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: 2, padding: "8px 0", borderBottom: `1px solid ${S.soft}` }}>
      <span style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>
        {label}
      </span>
      <span style={{
        fontFamily: mono ? S.fontMono : S.fontUI,
        fontSize: mono ? "0.6875rem" : "0.8125rem",
        color: value != null ? S.primary : S.tertiary,
        wordBreak: "break-all" as const,
      }}>
        {value != null ? String(value) : "—"}
      </span>
    </div>
  );
}

// ── Action button ─────────────────────────────────────────────────────────────
function ActionBtn({
  label, color, bg, border, onClick, disabled, icon,
}: {
  label: string;
  color: string;
  bg: string;
  border: string;
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        fontFamily: S.fontMono, fontSize: "0.6875rem", fontWeight: 700,
        letterSpacing: "0.08em", textTransform: "uppercase" as const,
        padding: "8px 18px", border: `1px solid ${border}`,
        color: disabled ? S.tertiary : color,
        background: disabled ? "transparent" : bg,
        borderColor: disabled ? S.rim : border,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "opacity 0.15s",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ProposalDetailPage() {
  const params  = useParams<{ staging_id: string }>();
  const router  = useRouter();
  const { token, user } = useAuth();

  const proposalId = params?.staging_id ?? "";

  const [proposal,      setProposal]     = useState<Proposal | null>(null);
  const [loading,       setLoading]      = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error,         setError]        = useState<string | null>(null);
  const [actionError,   setActionError]  = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Reject form state
  const [showRejectForm,  setShowRejectForm]  = useState(false);
  const [rejectReason,    setRejectReason]    = useState("");

  // Approve notes state
  const [approvalNotes, setApprovalNotes] = useState("");

  // Auth guard
  useEffect(() => {
    if (!token && typeof window !== "undefined") {
      router.push("/login");
    }
  }, [token, router]);

  // Fetch proposal
  const fetchProposal = useCallback(async () => {
    if (!token || !proposalId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await dashboardFetch(`/v1/proposals/${proposalId}`, token);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? `HTTP ${res.status}`);
      }
      const data: Proposal = await res.json();
      setProposal(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load proposal");
    } finally {
      setLoading(false);
    }
  }, [token, proposalId]);

  useEffect(() => { fetchProposal(); }, [fetchProposal]);

  // ── Actions ──────────────────────────────────────────────────────────────

  async function handleApprove() {
    if (!token || !proposalId) return;
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await dashboardFetch(`/v1/proposals/${proposalId}/approve`, token, {
        method: "PATCH",
        body: JSON.stringify({ approval_notes: approvalNotes || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? `HTTP ${res.status}`);
      }
      const updated: Proposal = await res.json();
      setProposal(updated);
      setActionSuccess("Proposal approved successfully.");
      setApprovalNotes("");
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject() {
    if (!token || !proposalId || !rejectReason.trim()) return;
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await dashboardFetch(`/v1/proposals/${proposalId}/reject`, token, {
        method: "PATCH",
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? `HTTP ${res.status}`);
      }
      const updated: Proposal = await res.json();
      setProposal(updated);
      setActionSuccess("Proposal rejected.");
      setShowRejectForm(false);
      setRejectReason("");
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleExecute() {
    if (!token || !proposalId) return;
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await dashboardFetch(`/v1/proposals/${proposalId}/execute`, token, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.detail ?? `HTTP ${res.status}`);
      }
      const updated: Proposal = await res.json();
      setProposal(updated);
      setActionSuccess("Proposal executed. Position is now HEDGED.");
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Execute failed");
    } finally {
      setActionLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!token) return null;

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column" as const,
      background: S.bgDeep, fontFamily: S.fontUI, color: S.primary,
    }}>

      {/* Page header */}
      <header style={{
        display: "flex", alignItems: "center", gap: 12, height: 44,
        padding: "0 20px", background: S.bgPanel, borderBottom: `1px solid ${S.rim}`,
        flexShrink: 0,
      }}>
        <button
          onClick={() => router.push("/staging")}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary,
            background: "transparent", border: `1px solid ${S.rim}`,
            padding: "2px 8px", cursor: "pointer", letterSpacing: "0.04em",
          }}
        >
          <ArrowLeft size={12} /> Back
        </button>
        <span style={{ color: S.rim }}>|</span>
        <ShieldCheck size={14} color={S.cyan} />
        <span style={{
          fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 700,
          letterSpacing: "0.06em", textTransform: "uppercase" as const, color: S.primary,
        }}>
          Proposal Review
        </span>
        {proposal && (
          <>
            <span style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.tertiary }}>
              {proposalId.slice(0, 8).toUpperCase()}
            </span>
            <StatusChip status={proposal.status} />
          </>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={fetchProposal}
          disabled={loading}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.tertiary,
            background: "transparent", border: `1px solid ${S.rim}`,
            padding: "2px 8px", cursor: "pointer",
          }}
        >
          <RefreshCw size={10} /> Refresh
        </button>
      </header>

      {/* Content */}
      <div style={{ flex: 1, padding: "20px", maxWidth: 1100, width: "100%", margin: "0 auto" }}>

        {/* Loading */}
        {loading && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: 200, fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary,
            letterSpacing: "0.08em",
          }}>
            LOADING PROPOSAL...
          </div>
        )}

        {/* Fetch error */}
        {!loading && error && (
          <div style={{
            padding: "12px 16px",
            background: `color-mix(in srgb, ${S.fail} 8%, transparent)`,
            border: `1px solid ${S.fail}`, borderLeft: `3px solid ${S.fail}`,
            fontFamily: S.fontMono, fontSize: "0.75rem", color: S.fail,
            marginBottom: 16,
          }}>
            <AlertTriangle size={12} style={{ display: "inline", marginRight: 6 }} />
            {error}
          </div>
        )}

        {/* Action feedback */}
        {actionError && (
          <div style={{
            padding: "10px 16px", marginBottom: 12,
            background: `color-mix(in srgb, ${S.fail} 8%, transparent)`,
            border: `1px solid ${S.fail}`, borderLeft: `3px solid ${S.fail}`,
            fontFamily: S.fontMono, fontSize: "0.75rem", color: S.fail,
          }}>
            <AlertTriangle size={12} style={{ display: "inline", marginRight: 6 }} />
            {actionError}
          </div>
        )}

        {actionSuccess && (
          <div style={{
            padding: "10px 16px", marginBottom: 12,
            background: `color-mix(in srgb, ${S.pass} 8%, transparent)`,
            border: `1px solid ${S.pass}`, borderLeft: `3px solid ${S.pass}`,
            fontFamily: S.fontMono, fontSize: "0.75rem", color: S.pass,
          }}>
            <CheckCircle size={12} style={{ display: "inline", marginRight: 6 }} />
            {actionSuccess}
          </div>
        )}

        {!loading && proposal && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start" }}>

            {/* Left: proposal details */}
            <div style={{
              background: S.bgPanel, border: `1px solid ${S.rim}`,
              padding: "20px 24px",
            }}>
              <div style={{
                fontFamily: S.fontMono, fontSize: "0.5625rem", letterSpacing: "0.1em",
                color: S.cyan, textTransform: "uppercase" as const, marginBottom: 16,
                paddingBottom: 8, borderBottom: `1px solid ${S.rim}`,
              }}>
                Proposal Details
              </div>

              <DetailRow label="Position ID"       value={proposal.position_id}       mono />
              <DetailRow label="Execution Ref"     value={proposal.execution_ref}     mono />
              <DetailRow label="Status"            value={proposal.status}            mono />
              <DetailRow label="Proposed By"       value={proposal.proposed_by_email} />
              <DetailRow label="Proposed At"       value={proposal.proposed_at ? new Date(proposal.proposed_at).toLocaleString() : null} />
              <DetailRow label="Risk Verdict"      value={proposal.risk_verdict}      mono />
              <DetailRow label="Approved By"       value={proposal.approved_by_email} />
              <DetailRow label="Approved At"       value={proposal.approved_at ? new Date(proposal.approved_at).toLocaleString() : null} />
              <DetailRow label="Approval Notes"    value={proposal.approval_notes} />
              <DetailRow label="Executed At"       value={proposal.executed_at ? new Date(proposal.executed_at).toLocaleString() : null} />
              <DetailRow label="Rejection Reason"  value={proposal.rejection_reason} />
              {proposal.second_approver_required && (
                <>
                  <DetailRow label="2nd Approver Required" value="YES" mono />
                  <DetailRow label="2nd Approver"          value={proposal.second_approver_email} />
                  <DetailRow label="2nd Approved At"       value={proposal.second_approved_at ? new Date(proposal.second_approved_at).toLocaleString() : null} />
                </>
              )}
              {proposal.actual_fill_rate != null && (
                <>
                  <DetailRow label="Fill Rate"     value={proposal.actual_fill_rate}     mono />
                  <DetailRow label="Fill Notional" value={proposal.actual_fill_notional} mono />
                  <DetailRow label="Slippage (bps)" value={proposal.slippage_bps != null ? `${proposal.slippage_bps.toFixed(2)} bps` : null} mono />
                </>
              )}

              {/* Hash chain section */}
              <div style={{ marginTop: 20, display: "flex", flexDirection: "column" as const, gap: 10 }}>
                <div style={{
                  fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary,
                  letterSpacing: "0.1em", textTransform: "uppercase" as const,
                  paddingTop: 12, borderTop: `1px solid ${S.rim}`,
                }}>
                  Hash Chain
                </div>
                <HashPill hash={proposal.proposal_hash}        label="PROPOSAL HASH" />
                <HashPill hash={proposal.approval_hash}        label="APPROVAL HASH" />
                <HashPill hash={proposal.risk_decision_hash}   label="RISK DECISION HASH" />
                <HashPill hash={proposal.second_approval_hash} label="2ND APPROVAL HASH" />
                <HashPill hash={proposal.fill_hash}            label="FILL HASH" />
              </div>
            </div>

            {/* Right: action panel */}
            <div style={{
              background: S.bgPanel, border: `1px solid ${S.rim}`,
              padding: "20px 20px",
              display: "flex", flexDirection: "column" as const, gap: 16,
            }}>
              <div style={{
                fontFamily: S.fontMono, fontSize: "0.5625rem", letterSpacing: "0.1em",
                color: S.cyan, textTransform: "uppercase" as const,
                paddingBottom: 10, borderBottom: `1px solid ${S.rim}`,
              }}>
                Checker Actions
              </div>

              {/* PROPOSED state: show approve + reject */}
              {proposal.status === "PROPOSED" && (
                <>
                  {/* Approval notes */}
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                    <label style={{
                      fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary,
                      letterSpacing: "0.08em", textTransform: "uppercase" as const,
                    }}>
                      Approval Notes (optional)
                    </label>
                    <textarea
                      value={approvalNotes}
                      onChange={e => setApprovalNotes(e.target.value)}
                      rows={3}
                      placeholder="Add notes..."
                      style={{
                        fontFamily: S.fontMono, fontSize: "0.6875rem",
                        background: S.bgSub, border: `1px solid ${S.rim}`,
                        color: S.primary, padding: "6px 8px", resize: "vertical" as const,
                        outline: "none",
                      }}
                    />
                  </div>

                  <ActionBtn
                    label="Approve"
                    color={S.pass}
                    bg={`color-mix(in srgb, ${S.pass} 12%, transparent)`}
                    border={S.pass}
                    onClick={handleApprove}
                    disabled={actionLoading}
                    icon={<CheckCircle size={13} />}
                  />

                  {!showRejectForm ? (
                    <ActionBtn
                      label="Reject"
                      color={S.fail}
                      bg={`color-mix(in srgb, ${S.fail} 10%, transparent)`}
                      border={S.fail}
                      onClick={() => setShowRejectForm(true)}
                      disabled={actionLoading}
                      icon={<XCircle size={13} />}
                    />
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
                      <label style={{
                        fontFamily: S.fontMono, fontSize: "0.5rem", color: S.fail,
                        letterSpacing: "0.08em", textTransform: "uppercase" as const,
                      }}>
                        Rejection Reason *
                      </label>
                      <textarea
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        rows={3}
                        placeholder="State reason for rejection..."
                        style={{
                          fontFamily: S.fontMono, fontSize: "0.6875rem",
                          background: S.bgSub,
                          border: `1px solid ${S.fail}`,
                          color: S.primary, padding: "6px 8px", resize: "vertical" as const,
                          outline: "none",
                        }}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <ActionBtn
                          label="Confirm Reject"
                          color={S.fail}
                          bg={`color-mix(in srgb, ${S.fail} 12%, transparent)`}
                          border={S.fail}
                          onClick={handleReject}
                          disabled={actionLoading || !rejectReason.trim()}
                          icon={<XCircle size={13} />}
                        />
                        <button
                          onClick={() => { setShowRejectForm(false); setRejectReason(""); }}
                          style={{
                            fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary,
                            background: "transparent", border: `1px solid ${S.rim}`,
                            padding: "6px 12px", cursor: "pointer",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* APPROVED state: show execute */}
              {proposal.status === "APPROVED" && (
                <>
                  {proposal.second_approver_required && !proposal.second_approver_id && (
                    <div style={{
                      padding: "8px 10px",
                      background: `color-mix(in srgb, ${S.amber} 8%, transparent)`,
                      border: `1px solid ${S.amber}`, borderLeft: `3px solid ${S.amber}`,
                      fontFamily: S.fontMono, fontSize: "0.625rem", color: S.amber,
                    }}>
                      <AlertTriangle size={11} style={{ display: "inline", marginRight: 6 }} />
                      Dual-key required. A second approver must confirm before execution.
                      <br />
                      <span style={{ fontSize: "0.5625rem", opacity: 0.75 }}>
                        PATCH /v1/proposals/{"{id}"}/second-approve
                      </span>
                    </div>
                  )}

                  <ActionBtn
                    label="Execute"
                    color={S.royal}
                    bg={`color-mix(in srgb, ${S.royal} 15%, transparent)`}
                    border={S.royal}
                    onClick={handleExecute}
                    disabled={
                      actionLoading ||
                      (proposal.second_approver_required && !proposal.second_approver_id)
                    }
                    icon={<Play size={13} />}
                  />

                  <div style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.tertiary, lineHeight: 1.5 }}>
                    Executing will finalise this proposal and transition the position to{" "}
                    <span style={{ color: S.pass }}>HEDGED</span>.
                    This action is irreversible.
                  </div>
                </>
              )}

              {/* Terminal states */}
              {(proposal.status === "EXECUTED" || proposal.status === "REJECTED" || proposal.status === "WITHDRAWN") && (
                <div style={{
                  padding: "10px 12px",
                  background: S.bgSub, border: `1px solid ${S.rim}`,
                  fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary,
                  lineHeight: 1.6,
                }}>
                  This proposal is in a terminal state ({proposal.status}) and requires no further action.
                </div>
              )}

              {/* Workflow guide */}
              <div style={{
                marginTop: 8, padding: "12px", background: S.bgSub,
                border: `1px solid ${S.soft}`, borderLeft: `3px solid ${S.rim}`,
              }}>
                <div style={{
                  fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary,
                  letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 8,
                }}>
                  4-Eyes Workflow
                </div>
                {[
                  { label: "PROPOSED",  desc: "Awaiting checker approval",    active: proposal.status === "PROPOSED"  },
                  { label: "APPROVED",  desc: "Ready to execute",              active: proposal.status === "APPROVED"  },
                  { label: "EXECUTED",  desc: "Position hedged",               active: proposal.status === "EXECUTED"  },
                ].map(({ label, desc, active }) => (
                  <div key={label} style={{
                    display: "flex", alignItems: "flex-start", gap: 8,
                    marginBottom: 6, opacity: active ? 1 : 0.4,
                  }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                      marginTop: 4,
                      background: active
                        ? (label === "EXECUTED" ? S.pass : label === "APPROVED" ? S.royal : S.amber)
                        : S.rim,
                    }} />
                    <div>
                      <div style={{ fontFamily: S.fontMono, fontSize: "0.5625rem", color: active ? S.primary : S.tertiary, fontWeight: active ? 700 : 400 }}>
                        {label}
                      </div>
                      <div style={{ fontFamily: S.fontMono, fontSize: "0.5rem", color: S.tertiary }}>
                        {desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
