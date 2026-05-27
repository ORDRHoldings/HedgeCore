"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../../../lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { CheckCircle,
  XCircle,
  Play,
  ArrowLeft,
  RefreshCw,
  ShieldCheck,
  AlertTriangle, Globe } from "lucide-react"

import { PageShell } from "@/components/layout/PageShell";

// ── Design tokens ─────────────────────────────────────────────────────────────
const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
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
  pass:     "var(--status-pass,#2ECC71)",
  fail:     "var(--accent-red,#E74C3C)",
  royal:    "var(--accent-cyan)",
  white:    "#ffffff",
} as const;

// ── Types ──────────────────────────────────────────────────────────────────────
interface Proposal {
  id:                       string;
  position_id:              string;
  company_id:               string;
  branch_id?:               string | null;
  status:                   string;
  proposed_by:              string;
  proposed_by_email?:       string | null;
  proposed_at:              string;
  proposal_hash:            string;
  approved_by?:             string | null;
  approved_by_email?:       string | null;
  approved_at?:             string | null;
  approval_notes?:          string | null;
  approval_hash?:           string | null;
  execution_ref?:           string | null;
  executed_at?:             string | null;
  rejection_reason?:        string | null;
  created_at:               string;
  second_approver_required: boolean;
  second_approver_id?:      string | null;
  second_approver_email?:   string | null;
  second_approved_at?:      string | null;
  second_approval_notes?:   string | null;
  second_approval_hash?:    string | null;
  risk_decision_hash?:      string | null;
  risk_verdict?:            string | null;
  actual_fill_rate?:        number | null;
  actual_fill_notional?:    number | null;
  slippage_bps?:            number | null;
  fill_timestamp?:          string | null;
  fill_hash?:               string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function truncHash(h: string | null | undefined): string {
  if (!h) return "";
  if (h.length <= 24) return h;
  return `${h.slice(0, 16)}…${h.slice(-4)}`;
}

// ── StatusChip ────────────────────────────────────────────────────────────────
function StatusChip({ status }: { status: string }) {
  const color =
    status === "PROPOSED"  ? S.amber :
    status === "APPROVED"  ? S.cyan  :
    status === "EXECUTED"  ? S.pass  :
    status === "REJECTED"  ? S.fail  :
    S.tertiary;

  return (
    <span style={{
      fontFamily: S.fontMono, fontSize: "0.75rem", fontWeight: 700,
      letterSpacing: "0.1em", padding: "2px 8px",
      border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
      background: `color-mix(in srgb, ${color} 10%, transparent)`,
      color, borderRadius: 2, textTransform: "uppercase" as const,
    }}>
      {status}
    </span>
  );
}

// ── SectionTitle ──────────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: string }) {
  return (
    <div style={{
      fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.12em",
      color: S.cyan, textTransform: "uppercase" as const,
      paddingBottom: 10, marginBottom: 4, borderBottom: `1px solid ${S.rim}`,
    }}>
      {children}
    </div>
  );
}

// ── DetailRow (2-column CSS grid) ─────────────────────────────────────────────
function DetailRow({
  label, value, email = false,
}: {
  label: string;
  value?: string | number | null;
  email?: boolean;
}) {
  const display = value != null && value !== "" ? String(value) : "—";
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "160px 1fr", gap: "0 16px",
      alignItems: "start", padding: "8px 0",
      borderBottom: `1px solid ${S.soft}`,
    }}>
      <span style={{
        fontFamily: S.fontMono, fontSize: "0.75rem",
        color: S.tertiary, letterSpacing: "0.08em",
        textTransform: "uppercase" as const, paddingTop: 1,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: S.fontMono, fontSize: "0.75rem",
        color: email ? S.secondary : S.primary,
        wordBreak: "break-all" as const, lineHeight: 1.4,
      }}>
        {display}
      </span>
    </div>
  );
}

// ── HashChain timeline ────────────────────────────────────────────────────────
interface ChainNode {
  label: string;
  hash:  string | null | undefined;
}

function HashChainTimeline({ nodes }: { nodes: ChainNode[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" as const }}>
      {nodes.map((node, i) => {
        const exists = !!node.hash;
        const isLast = i === nodes.length - 1;
        return (
          <div key={node.label} style={{ display: "flex", alignItems: "stretch", gap: 12 }}>
            {/* Dot + connector line */}
            <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", width: 16, flexShrink: 0 }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                marginTop: 4,
                background: exists
                  ? `color-mix(in srgb, ${S.cyan} 90%, transparent)`
                  : "transparent",
                border: exists
                  ? `1px solid ${S.cyan}`
                  : `1px solid ${S.rim}`,
              }} />
              {!isLast && (
                <div style={{
                  width: 1, flex: 1,
                  background: exists ? S.cyan : S.rim,
                  opacity: exists ? 0.3 : 0.2,
                  minHeight: 16,
                }} />
              )}
            </div>
            {/* Label + hash */}
            <div style={{
              display: "flex", flexDirection: "column" as const,
              paddingBottom: isLast ? 0 : 14, paddingTop: 2, flex: 1,
            }}>
              <span style={{
                fontFamily: S.fontMono, fontSize: "0.75rem",
                letterSpacing: "0.1em", textTransform: "uppercase" as const,
                color: exists ? S.primary : S.tertiary,
                fontWeight: exists ? 700 : 400,
              }}>
                {node.label}
              </span>
              {exists && (
                <span style={{
                  fontFamily: S.fontMono, fontSize: "0.75rem", color: S.cyan,
                  letterSpacing: "0.04em", marginTop: 2,
                }}>
                  {truncHash(node.hash)}
                </span>
              )}
              {!exists && (
                <span style={{ fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary, opacity: 0.5 }}>
                  not yet recorded
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── WorkflowGuide ─────────────────────────────────────────────────────────────
function WorkflowGuide({ status }: { status: string }) {
  const steps = [
    {
      key:   "PROPOSED",
      label: "PROPOSED",
      desc:  "Maker submits. Checker reviews under SoD.",
      color: S.amber,
    },
    {
      key:   "APPROVED",
      label: "APPROVED",
      desc:  "Checker approved. Ready for execution.",
      color: S.cyan,
    },
    {
      key:   "EXECUTED",
      label: "EXECUTED",
      desc:  "Position transitioned to HEDGED.",
      color: S.pass,
    },
  ];

  const isTerminal = status === "REJECTED" || status === "WITHDRAWN";
  const currentIdx = steps.findIndex(s => s.key === status);

  return (
    <div style={{
      marginTop: "auto", paddingTop: 16, borderTop: `1px solid ${S.soft}`,
    }}>
      <div style={{
        fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.1em",
        color: S.tertiary, textTransform: "uppercase" as const, marginBottom: 12,
      }}>
        4-Eyes Workflow
      </div>
      {isTerminal && (
        <div style={{
          fontFamily: S.fontMono, fontSize: "0.75rem", color: S.fail,
          marginBottom: 10, opacity: 0.8,
        }}>
          Terminal state: {status}
        </div>
      )}
      {steps.map((step, i) => {
        const active   = step.key === status;
        const complete = !isTerminal && currentIdx > i;
        const dim      = !active && !complete;
        return (
          <div key={step.key} style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            marginBottom: 10, opacity: dim ? 0.35 : 1,
          }}>
            <div style={{
              width: 7, height: 7, borderRadius: "50%", flexShrink: 0, marginTop: 3,
              background: active || complete ? step.color : "transparent",
              border: `1px solid ${active || complete ? step.color : S.rim}`,
            }} />
            <div>
              <div style={{
                fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.08em",
                color: active ? step.color : S.primary,
                fontWeight: active ? 700 : 400,
              }}>
                {step.label}
              </div>
              <div style={{
                fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary, marginTop: 1,
              }}>
                {step.desc}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── FeedbackBanner ────────────────────────────────────────────────────────────
function FeedbackBanner({
  type, message,
}: {
  type: "error" | "success";
  message: string;
}) {
  const color = type === "error" ? S.fail : S.pass;
  const Icon  = type === "error" ? AlertTriangle : CheckCircle;
  return (
    <div style={{
      padding: "10px 14px", marginBottom: 12,
      background: `color-mix(in srgb, ${color} 8%, transparent)`,
      border: `1px solid ${color}`, borderLeft: `3px solid ${color}`,
      fontFamily: S.fontMono, fontSize: "0.75rem", color,
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <Icon size={12} style={{ flexShrink: 0 }} />
      <span>{message}</span>
    </div>
  );
}

// ── InputField ────────────────────────────────────────────────────────────────
function InputField({
  label, value, onChange, placeholder, type = "text", required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "number";
  required?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
      <label style={{
        fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.08em",
        textTransform: "uppercase" as const, color: S.tertiary,
      }}>
        {label}{required && <span style={{ color: S.fail }}> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          fontFamily: S.fontMono, fontSize: "0.75rem",
          background: S.bgSub, border: `1px solid ${S.rim}`,
          color: S.primary, padding: "6px 8px", outline: "none", width: "100%",
        }}
      />
    </div>
  );
}

// ── TextareaField ─────────────────────────────────────────────────────────────
function TextareaField({
  label, value, onChange, placeholder, required = false, borderColor,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  borderColor?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
      <label style={{
        fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.08em",
        textTransform: "uppercase" as const, color: S.tertiary,
      }}>
        {label}{required && <span style={{ color: S.fail }}> *</span>}
      </label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        style={{
          fontFamily: S.fontMono, fontSize: "0.75rem",
          background: S.bgSub,
          border: `1px solid ${borderColor ?? S.rim}`,
          color: S.primary, padding: "6px 8px",
          resize: "vertical" as const, outline: "none", width: "100%",
        }}
      />
    </div>
  );
}

// ── ActionButton ──────────────────────────────────────────────────────────────
function ActionButton({
  label, onClick, disabled = false, loading = false,
  variant, height = 40, icon,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant: "approve" | "reject" | "execute" | "secondary" | "danger";
  height?: number;
  icon?: React.ReactNode;
}) {
  const styles: Record<string, { bg: string; border: string; color: string }> = {
    approve:   { bg: `color-mix(in srgb, ${S.pass} 15%, transparent)`,  border: S.pass,   color: S.pass   },
    reject:    { bg: "transparent",                                        border: S.fail,   color: S.fail   },
    execute:   { bg: S.royal,                                             border: S.royal,  color: S.white },
    secondary: { bg: `color-mix(in srgb, ${S.cyan} 10%, transparent)`,  border: S.cyan,   color: S.cyan   },
    danger:    { bg: `color-mix(in srgb, ${S.fail} 12%, transparent)`,  border: S.fail,   color: S.fail   },
  };
  const st = styles[variant];
  const isDisabled = disabled || loading;
  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        width: "100%", height,
        fontFamily: S.fontMono, fontSize: "0.75rem", fontWeight: 700,
        letterSpacing: "0.1em", textTransform: "uppercase" as const,
        background: isDisabled ? "transparent" : st.bg,
        border: `1px solid ${isDisabled ? S.rim : st.border}`,
        color: isDisabled ? S.tertiary : st.color,
        cursor: isDisabled ? "not-allowed" : "pointer",
        opacity: isDisabled ? 0.5 : 1,
        borderRadius: 2,
        transition: "opacity 0.15s",
      }}
    >
      {icon}
      {loading ? "WORKING…" : label}
    </button>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function ProposalDetailPage() {
  const params      = useParams<{ staging_id: string }>();
  const router      = useRouter();
  const { token }   = useAuth();

  const proposalId  = params?.staging_id ?? "";

  const [proposal,       setProposal]      = useState<Proposal | null>(null);
  const [loading,        setLoading]       = useState(true);
  const [actionLoading,  setActionLoading] = useState(false);
  const [error,          setError]         = useState<string | null>(null);
  const [actionError,    setActionError]   = useState<string | null>(null);
  const [actionSuccess,  setActionSuccess] = useState<string | null>(null);
  const [showRejectForm, setShowRejectForm]= useState(false);
  const [rejectReason,   setRejectReason]  = useState("");
  const [approvalNotes,  setApprovalNotes] = useState("");
  const [showFillForm,         setShowFillForm]        = useState(false);
  const [fillPrice,            setFillPrice]            = useState("");
  const [fillNotional,         setFillNotional]         = useState("");
  const [fillRef,              setFillRef]              = useState("");
  const [secondApprovalNotes,  setSecondApprovalNotes]  = useState("");
  const [showSecondApproveForm,setShowSecondApproveForm]= useState(false);

  // Auth guard
  useEffect(() => {
    if (!token && typeof window !== "undefined") router.push("/auth/login");
  }, [token, router]);

  // Auto-dismiss success banner
  useEffect(() => {
    if (!actionSuccess) return;
    const t = setTimeout(() => setActionSuccess(null), 4000);
    return () => clearTimeout(t);
  }, [actionSuccess]);

  // Fetch proposal
  const fetchProposal = useCallback(async () => {
    if (!token || !proposalId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await dashboardFetch(`/v1/proposals/${proposalId}`, token);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { detail?: string };
        throw new Error(body?.detail ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as Proposal;
      setProposal(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load proposal");
    } finally {
      setLoading(false);
    }
  }, [token, proposalId]);

  useEffect(() => { void fetchProposal(); }, [fetchProposal]);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleApprove() {
    if (!token || !proposalId) return;
    setActionLoading(true); setActionError(null); setActionSuccess(null);
    try {
      const res = await dashboardFetch(`/v1/proposals/${proposalId}/approve`, token, {
        method: "PATCH",
        body:   JSON.stringify({ approval_notes: approvalNotes || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { detail?: string };
        throw new Error(body?.detail ?? `HTTP ${res.status}`);
      }
      const updated = await res.json() as Proposal;
      setProposal(updated); setApprovalNotes("");
      setActionSuccess("Proposal approved successfully.");
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Approve failed");
    } finally { setActionLoading(false); }
  }

  async function handleReject() {
    if (!token || !proposalId || !rejectReason.trim()) return;
    setActionLoading(true); setActionError(null); setActionSuccess(null);
    try {
      const res = await dashboardFetch(`/v1/proposals/${proposalId}/reject`, token, {
        method: "PATCH",
        body:   JSON.stringify({ reason: rejectReason.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { detail?: string };
        throw new Error(body?.detail ?? `HTTP ${res.status}`);
      }
      const updated = await res.json() as Proposal;
      setProposal(updated); setShowRejectForm(false); setRejectReason("");
      setActionSuccess("Proposal rejected.");
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Reject failed");
    } finally { setActionLoading(false); }
  }

  async function handleExecute() {
    if (!token || !proposalId) return;
    setActionLoading(true); setActionError(null); setActionSuccess(null);
    try {
      const res = await dashboardFetch(`/v1/proposals/${proposalId}/execute`, token, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { detail?: string };
        throw new Error(body?.detail ?? `HTTP ${res.status}`);
      }
      const updated = await res.json() as Proposal;
      setProposal(updated);
      setActionSuccess("Proposal executed. Position is now HEDGED.");
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Execute failed");
    } finally { setActionLoading(false); }
  }

  async function handleSecondApprove() {
    if (!token || !proposalId) return;
    setActionLoading(true); setActionError(null); setActionSuccess(null);
    try {
      const res = await dashboardFetch(`/v1/proposals/${proposalId}/second-approve`, token, {
        method: "PATCH",
        body: JSON.stringify({ notes: secondApprovalNotes || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { detail?: string };
        throw new Error(body?.detail ?? `HTTP ${res.status}`);
      }
      const updated = await res.json() as Proposal;
      setProposal(updated); setShowSecondApproveForm(false); setSecondApprovalNotes("");
      setActionSuccess("Second approval recorded. Execution is now authorized.");
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Second approval failed");
    } finally { setActionLoading(false); }
  }

  async function handleFillRecord() {
    if (!token || !proposalId || !fillPrice) return;
    setActionLoading(true); setActionError(null); setActionSuccess(null);
    try {
      const body: Record<string, unknown> = { fill_price: parseFloat(fillPrice) };
      if (fillNotional) body.fill_notional = parseFloat(fillNotional);
      if (fillRef)      body.fill_ref      = fillRef.trim();
      const res = await dashboardFetch(`/v1/proposals/${proposalId}/fill`, token, {
        method: "PATCH",
        body:   JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as { detail?: string };
        throw new Error(b?.detail ?? `HTTP ${res.status}`);
      }
      const updated = await res.json() as Proposal;
      setProposal(updated);
      setShowFillForm(false); setFillPrice(""); setFillNotional(""); setFillRef("");
      setActionSuccess("Fill recorded. Hash chain updated.");
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Fill record failed");
    } finally { setActionLoading(false); }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!token) return null;

  const awaitingSecond =
    proposal?.second_approver_required === true &&
    !proposal?.second_approver_id;

  const chainNodes: ChainNode[] = proposal
    ? [
        { label: "PROPOSAL",   hash: proposal.proposal_hash },
        { label: "RISK GATE",  hash: proposal.risk_decision_hash },
        { label: "APPROVAL",   hash: proposal.approval_hash },
        { label: "DUAL KEY",   hash: proposal.second_approval_hash },
        { label: "FILL",       hash: proposal.fill_hash },
      ]
    : [];

  return (
    <PageShell icon={Globe} title="Staging Detail" breadcrumb={["Dashboard","Staging","Detail"]}>

      {/* ── Header 44px ── */}
      <header style={{
        height: 44, display: "flex", alignItems: "center", gap: 10,
        padding: "0 20px", background: S.bgPanel,
        borderBottom: `1px solid ${S.rim}`, flexShrink: 0,
      }}>
        <button
          onClick={() => router.push("/staging")}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.06em",
            color: S.tertiary, background: "transparent",
            border: `1px solid ${S.rim}`, padding: "3px 10px",
            cursor: "pointer", borderRadius: 2,
          }}
        >
          <ArrowLeft size={11} />
          STAGING QUEUE
        </button>

        <span style={{ color: S.rim, fontFamily: S.fontMono, fontSize: "0.75rem" }}>|</span>

        <ShieldCheck size={14} color={S.cyan} />

        <span style={{
          fontFamily: S.fontMono, fontSize: "0.75rem", fontWeight: 700,
          letterSpacing: "0.08em", textTransform: "uppercase" as const, color: S.primary,
        }}>
          PROPOSAL REVIEW
        </span>

        {proposal && (
          <>
            <span style={{
              fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary,
              letterSpacing: "0.06em",
            }}>
              {proposalId.slice(0, 8).toUpperCase()}
            </span>
            <StatusChip status={proposal.status} />
          </>
        )}

        <div style={{ flex: 1 }} />

        <button
          onClick={() => void fetchProposal()}
          disabled={loading}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            fontFamily: S.fontMono, fontSize: "0.75rem", letterSpacing: "0.06em",
            color: S.tertiary, background: "transparent",
            border: `1px solid ${S.rim}`, padding: "3px 10px",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.5 : 1, borderRadius: 2,
          }}
        >
          <RefreshCw size={10} />
          REFRESH
        </button>
      </header>

      {/* ── Body ── */}
      <div style={{ flex: 1, padding: "20px 24px", maxWidth: 1200, width: "100%", margin: "0 auto" }}>

        {/* Loading */}
        {loading && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: 240, fontFamily: S.fontMono, fontSize: "0.75rem",
            color: S.tertiary, letterSpacing: "0.1em",
          }}>
            LOADING PROPOSAL…
          </div>
        )}

        {/* Fetch error */}
        {!loading && error && (
          <FeedbackBanner type="error" message={error} />
        )}

        {/* Proposal loaded */}
        {!loading && proposal && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "65% 35%",
            gap: 20, alignItems: "start",
          }}>

            {/* ── LEFT COLUMN ── */}
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 20 }}>

              {/* Proposal Details panel */}
              <div style={{
                background: S.bgPanel, border: `1px solid ${S.rim}`,
                padding: "20px 24px",
              }}>
                <SectionTitle>PROPOSAL DETAILS</SectionTitle>

                <div style={{ marginTop: 12 }}>
                  <DetailRow label="PROPOSAL ID"      value={proposal.id}                       />
                  <DetailRow label="POSITION ID"      value={proposal.position_id}              />
                  <DetailRow label="EXECUTION REF"    value={proposal.execution_ref}            />
                  <DetailRow label="STATUS"           value={proposal.status}                   />
                  <DetailRow label="PROPOSED BY"      value={proposal.proposed_by_email}        email />
                  <DetailRow label="PROPOSED AT"      value={fmt(proposal.proposed_at)}         />
                  <DetailRow label="RISK VERDICT"     value={proposal.risk_verdict}             />
                  <DetailRow label="APPROVED BY"      value={proposal.approved_by_email}        email />
                  <DetailRow label="APPROVED AT"      value={fmt(proposal.approved_at)}         />
                  <DetailRow label="APPROVAL NOTES"   value={proposal.approval_notes}           />
                  {proposal.executed_at && (
                    <DetailRow label="EXECUTED AT"    value={fmt(proposal.executed_at)}         />
                  )}
                  {proposal.rejection_reason && (
                    <DetailRow label="REJECTION REASON" value={proposal.rejection_reason}       />
                  )}
                  {proposal.second_approver_required && (
                    <>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "8px 10px", margin: "8px 0",
                        background: `color-mix(in srgb, ${S.amber} 8%, transparent)`,
                        border: `1px solid ${S.amber}`, borderLeft: `3px solid ${S.amber}`,
                      }}>
                        <AlertTriangle size={11} color={S.amber} style={{ flexShrink: 0 }} />
                        <span style={{
                          fontFamily: S.fontMono, fontSize: "0.75rem",
                          color: S.amber, letterSpacing: "0.08em",
                          textTransform: "uppercase" as const,
                        }}>
                          DUAL-KEY AUTHORIZATION REQUIRED
                        </span>
                      </div>
                      <DetailRow label="2ND APPROVER"
                        value={proposal.second_approver_email ?? "PENDING SECOND APPROVER"} email />
                      <DetailRow label="2ND APPROVED AT" value={fmt(proposal.second_approved_at)} />
                      <DetailRow label="2ND APPROVAL NOTES" value={proposal.second_approval_notes} />
                    </>
                  )}
                  {proposal.actual_fill_rate != null && (
                    <>
                      <DetailRow label="FILL RATE"
                        value={proposal.actual_fill_rate.toFixed(6)} />
                      <DetailRow label="FILL NOTIONAL"
                        value={proposal.actual_fill_notional?.toLocaleString() ?? "—"} />
                      <DetailRow label="SLIPPAGE"
                        value={proposal.slippage_bps != null
                          ? `${proposal.slippage_bps.toFixed(2)} bps` : "—"} />
                    </>
                  )}
                </div>
              </div>

              {/* Audit Chain panel */}
              <div style={{
                background: S.bgPanel, border: `1px solid ${S.rim}`,
                padding: "20px 24px",
              }}>
                <SectionTitle>AUDIT CHAIN</SectionTitle>
                <div style={{ marginTop: 16 }}>
                  <HashChainTimeline nodes={chainNodes} />
                </div>
              </div>
            </div>

            {/* ── RIGHT COLUMN (sticky) ── */}
            <div style={{ position: "sticky" as const, top: 20 }}>
              <div style={{
                background: S.bgPanel, border: `1px solid ${S.rim}`,
                padding: "20px", display: "flex", flexDirection: "column" as const, gap: 14,
              }}>
                <SectionTitle>CHECKER ACTIONS</SectionTitle>

                {/* Action feedback banners at top of right panel */}
                {actionError   && <FeedbackBanner type="error"   message={actionError}   />}
                {actionSuccess && <FeedbackBanner type="success" message={actionSuccess} />}

                {/* ── PROPOSED state ── */}
                {proposal.status === "PROPOSED" && (
                  <>
                    <TextareaField
                      label="APPROVAL NOTES"
                      value={approvalNotes}
                      onChange={setApprovalNotes}
                      placeholder="Add notes (optional)…"
                    />

                    <ActionButton
                      label="APPROVE"
                      variant="approve"
                      height={40}
                      onClick={() => void handleApprove()}
                      disabled={actionLoading}
                      loading={actionLoading}
                      icon={<CheckCircle size={13} />}
                    />

                    {!showRejectForm ? (
                      <ActionButton
                        label="REJECT"
                        variant="reject"
                        height={36}
                        onClick={() => setShowRejectForm(true)}
                        disabled={actionLoading}
                        icon={<XCircle size={13} />}
                      />
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                        <TextareaField
                          label="REJECTION REASON"
                          value={rejectReason}
                          onChange={setRejectReason}
                          placeholder="State reason for rejection…"
                          required
                          borderColor={S.fail}
                        />
                        <ActionButton
                          label="CONFIRM REJECTION"
                          variant="danger"
                          height={36}
                          onClick={() => void handleReject()}
                          disabled={actionLoading || !rejectReason.trim()}
                          loading={actionLoading}
                          icon={<XCircle size={13} />}
                        />
                        <button
                          onClick={() => { setShowRejectForm(false); setRejectReason(""); }}
                          style={{
                            fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary,
                            background: "transparent", border: `1px solid ${S.rim}`,
                            padding: "6px 12px", cursor: "pointer", borderRadius: 2,
                          }}
                        >
                          CANCEL
                        </button>
                      </div>
                    )}

                    <div style={{
                      fontFamily: S.fontMono, fontSize: "0.75rem",
                      color: S.tertiary, lineHeight: 1.6,
                    }}>
                      You are approving as checker. Maker:{" "}
                      <span style={{ color: S.secondary }}>
                        {proposal.proposed_by_email ?? proposal.proposed_by}
                      </span>
                    </div>
                  </>
                )}

                {/* ── APPROVED state ── */}
                {proposal.status === "APPROVED" && (
                  <>
                    {awaitingSecond && (
                      <div style={{
                        padding: "10px 12px",
                        background: `color-mix(in srgb, ${S.amber} 8%, transparent)`,
                        border: `1px solid ${S.amber}`, borderLeft: `3px solid ${S.amber}`,
                        fontFamily: S.fontMono, fontSize: "0.75rem", color: S.amber,
                        display: "flex", alignItems: "flex-start", gap: 8, lineHeight: 1.5,
                      }}>
                        <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                        <span>
                          SECOND APPROVAL REQUIRED BEFORE EXECUTION
                        </span>
                      </div>
                    )}

                    {awaitingSecond && !showSecondApproveForm && (
                      <ActionButton
                        label="SECOND APPROVE"
                        variant="secondary"
                        height={36}
                        onClick={() => setShowSecondApproveForm(true)}
                        disabled={actionLoading}
                        icon={<ShieldCheck size={13} />}
                      />
                    )}

                    {awaitingSecond && showSecondApproveForm && (
                      <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                        <TextareaField
                          label="SECOND APPROVAL NOTES"
                          value={secondApprovalNotes}
                          onChange={setSecondApprovalNotes}
                          placeholder="Add notes (optional)…"
                        />
                        <ActionButton
                          label="CONFIRM SECOND APPROVAL"
                          variant="secondary"
                          height={36}
                          onClick={() => void handleSecondApprove()}
                          disabled={actionLoading}
                          loading={actionLoading}
                          icon={<ShieldCheck size={13} />}
                        />
                        <button
                          onClick={() => { setShowSecondApproveForm(false); setSecondApprovalNotes(""); }}
                          style={{
                            fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary,
                            background: "transparent", border: `1px solid ${S.rim}`,
                            padding: "6px 12px", cursor: "pointer", borderRadius: 2,
                          }}
                        >
                          CANCEL
                        </button>
                      </div>
                    )}

                    {!awaitingSecond && proposal.second_approver_required && (
                      <div style={{
                        padding: "10px 12px",
                        background: `color-mix(in srgb, ${S.pass} 6%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${S.pass} 30%, transparent)`,
                        borderLeft: `3px solid ${S.pass}`,
                        display: "flex", alignItems: "center", gap: 8,
                        fontFamily: S.fontMono, fontSize: "0.75rem", color: S.pass,
                      }}>
                        <CheckCircle size={12} style={{ flexShrink: 0 }} />
                        <span>
                          Second approval by{" "}
                          <span style={{ fontWeight: 700 }}>
                            {proposal.second_approver_email ?? "unknown"}
                          </span>
                        </span>
                      </div>
                    )}

                    <ActionButton
                      label="EXECUTE"
                      variant="execute"
                      height={44}
                      onClick={() => void handleExecute()}
                      disabled={actionLoading || awaitingSecond}
                      loading={actionLoading}
                      icon={<Play size={13} />}
                    />

                    <div style={{
                      fontFamily: S.fontMono, fontSize: "0.75rem",
                      color: S.tertiary, lineHeight: 1.6,
                    }}>
                      This action is irreversible and will transition the position to{" "}
                      <span style={{ color: S.pass }}>HEDGED</span>.
                    </div>
                  </>
                )}

                {/* ── EXECUTED — no fill_hash ── */}
                {proposal.status === "EXECUTED" && !proposal.fill_hash && (
                  <>
                    <div style={{
                      padding: "10px 12px",
                      background: `color-mix(in srgb, ${S.cyan} 6%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${S.cyan} 25%, transparent)`,
                      fontFamily: S.fontMono, fontSize: "0.75rem", color: S.cyan,
                      lineHeight: 1.5,
                    }}>
                      Record actual fill to complete the audit chain.
                    </div>

                    {!showFillForm ? (
                      <ActionButton
                        label="RECORD FILL"
                        variant="secondary"
                        height={36}
                        onClick={() => setShowFillForm(true)}
                        disabled={actionLoading}
                        icon={<CheckCircle size={13} />}
                      />
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                        <InputField
                          label="FILL PRICE"
                          value={fillPrice}
                          onChange={setFillPrice}
                          placeholder="e.g. 1.2485"
                          type="number"
                          required
                        />
                        <InputField
                          label="FILL NOTIONAL"
                          value={fillNotional}
                          onChange={setFillNotional}
                          placeholder="e.g. 5000000"
                          type="number"
                        />
                        <InputField
                          label="FILL REFERENCE / TICKET ID"
                          value={fillRef}
                          onChange={setFillRef}
                          placeholder="e.g. IBK-92841"
                        />
                        <ActionButton
                          label="CONFIRM FILL"
                          variant="secondary"
                          height={36}
                          onClick={() => void handleFillRecord()}
                          disabled={actionLoading || !fillPrice}
                          loading={actionLoading}
                          icon={<CheckCircle size={13} />}
                        />
                        <button
                          onClick={() => {
                            setShowFillForm(false);
                            setFillPrice(""); setFillNotional(""); setFillRef("");
                          }}
                          style={{
                            fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary,
                            background: "transparent", border: `1px solid ${S.rim}`,
                            padding: "6px 12px", cursor: "pointer", borderRadius: 2,
                          }}
                        >
                          CANCEL
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* ── EXECUTED — fill_hash present ── */}
                {proposal.status === "EXECUTED" && proposal.fill_hash && (
                  <div style={{
                    padding: "12px 14px",
                    background: `color-mix(in srgb, ${S.pass} 6%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${S.pass} 30%, transparent)`,
                    borderLeft: `3px solid ${S.pass}`,
                    display: "flex", flexDirection: "column" as const, gap: 4,
                  }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      fontFamily: S.fontMono, fontSize: "0.75rem",
                      fontWeight: 700, color: S.pass,
                    }}>
                      <CheckCircle size={13} />
                      AUDIT CHAIN COMPLETE
                    </div>
                    {proposal.fill_timestamp && (
                      <div style={{
                        fontFamily: S.fontMono, fontSize: "0.75rem",
                        color: S.tertiary, marginTop: 2,
                      }}>
                        Fill recorded on {fmt(proposal.fill_timestamp)}
                      </div>
                    )}
                  </div>
                )}

                {/* ── REJECTED / WITHDRAWN ── */}
                {(proposal.status === "REJECTED" || proposal.status === "WITHDRAWN") && (
                  <div style={{
                    padding: "10px 12px", background: S.bgSub,
                    border: `1px solid ${S.rim}`,
                    fontFamily: S.fontMono, fontSize: "0.75rem",
                    color: S.tertiary, lineHeight: 1.6,
                  }}>
                    This proposal is in a terminal state and requires no further action.
                  </div>
                )}

                {/* ── 4-Eyes workflow guide (always visible) ── */}
                <WorkflowGuide status={proposal.status} />
              </div>
            </div>

          </div>
        )}
      </div>
    </PageShell>
  );
}
