"use client";

/**
 * /position-desk — Position Lifecycle Control Tower
 *
 * Status-driven workflow UI. Every row shows the current lifecycle state and
 * exposes the exact set of actions that are legal from that state.
 *
 * State machine mirrored from backend EXECUTION_TRANSITIONS:
 *   NEW               → [Assign Policy, Reject]
 *   POLICY_ASSIGNED   → [Mark Ready, Re-assign Policy, Reject]
 *   READY_TO_EXECUTE  → [Execute, Re-assign Policy (step back), Reject]
 *   HEDGED            → [] (terminal)
 *   REJECTED          → [Reopen]
 *
 * All transitions call the backend (DB is source of truth).
 * Redux state is updated from the server response — never optimistically.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { useAuth } from "../../lib/authContext";
import type { AppDispatch, RootState } from "../../lib/store";
import {
  listPositionsThunk,
  assignPolicyThunk,
  markReadyThunk,
  executePositionThunk,
  rejectPositionThunk,
  reopenPositionThunk,
  clearLifecycleError,
} from "../../lib/store/slices/positionSlice";
import type { PositionRow } from "../../api/positionClient";

// ─── Design tokens ─────────────────────────────────────────────────────────────
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
  pass:     "var(--status-pass,#22c55e)",
  fail:     "var(--accent-red,#ef4444)",
  purple:   "#a78bfa",
} as const;

// ─── Execution status definitions ──────────────────────────────────────────────
type ExecStatus = "NEW" | "POLICY_ASSIGNED" | "READY_TO_EXECUTE" | "HEDGED" | "REJECTED";

const STATUS_CONFIG: Record<ExecStatus, { label: string; color: string; desc: string }> = {
  NEW:                { label: "NEW",           color: S.tertiary, desc: "Awaiting policy assignment" },
  POLICY_ASSIGNED:    { label: "POLICY ASGND",  color: S.cyan,     desc: "Policy assigned, awaiting run" },
  READY_TO_EXECUTE:   { label: "READY",         color: S.amber,    desc: "Run linked, ready for execution" },
  HEDGED:             { label: "HEDGED",        color: S.pass,     desc: "Execution confirmed — terminal" },
  REJECTED:           { label: "REJECTED",      color: S.fail,     desc: "Rejected — can be reopened" },
};

const ALL_STATUSES: ExecStatus[] = ["NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE", "HEDGED", "REJECTED"];

// ─── Modal types ───────────────────────────────────────────────────────────────
type ModalType = "assign-policy" | "mark-ready" | "execute" | "reject" | null;

interface ModalState {
  type: ModalType;
  position: PositionRow | null;
}

// ─── Formatting helpers ────────────────────────────────────────────────────────
function fmtAmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  return s.slice(0, 10);
}

// ─── Status badge component ────────────────────────────────────────────────────
function StatusBadge({ status }: { status: ExecStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span style={{
      fontFamily: S.fontMono,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: "0.08em",
      color: cfg.color,
      background: `color-mix(in srgb, ${cfg.color} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${cfg.color} 28%, transparent)`,
      padding: "2px 6px",
      borderRadius: 2,
      whiteSpace: "nowrap",
    }}>
      {cfg.label}
    </span>
  );
}

// ─── Action button component ───────────────────────────────────────────────────
function ActionBtn({
  label, color, onClick, disabled, loading,
}: {
  label: string;
  color: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        fontFamily: S.fontMono,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.06em",
        color: disabled ? S.tertiary : color,
        background: "transparent",
        border: `1px solid ${disabled ? S.rim : `color-mix(in srgb, ${color} 40%, transparent)`}`,
        padding: "2px 7px",
        cursor: disabled ? "not-allowed" : "pointer",
        borderRadius: 2,
        opacity: loading ? 0.5 : 1,
        transition: "all 0.1s",
      }}
    >
      {loading ? "…" : label}
    </button>
  );
}

// ─── Modal wrapper ─────────────────────────────────────────────────────────────
function ModalOverlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 200,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: S.bgPanel, border: `1px solid ${S.rim}`,
          padding: "24px 28px", minWidth: 380, maxWidth: 480,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 700, color: S.primary, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {title}
      </div>
      <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary, marginTop: 4 }}>
        {subtitle}
      </div>
    </div>
  );
}

function ModalInput({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary, display: "block", marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", padding: "7px 10px", boxSizing: "border-box",
          background: S.bgSub, border: `1px solid ${S.rim}`,
          color: S.primary, fontFamily: S.fontMono, fontSize: 12,
          outline: "none",
        }}
      />
    </div>
  );
}

function ModalActions({ onCancel, onConfirm, confirmLabel, confirmColor, disabled }: {
  onCancel: () => void; onConfirm: () => void;
  confirmLabel: string; confirmColor: string; disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
      <button onClick={onCancel} style={{
        fontFamily: S.fontMono, fontSize: 11, color: S.secondary,
        background: "transparent", border: `1px solid ${S.rim}`,
        padding: "6px 14px", cursor: "pointer",
      }}>Cancel</button>
      <button onClick={onConfirm} disabled={disabled} style={{
        fontFamily: S.fontMono, fontSize: 11, color: S.bgDeep,
        background: disabled ? S.tertiary : confirmColor,
        border: "none", padding: "6px 14px",
        cursor: disabled ? "not-allowed" : "pointer",
        fontWeight: 700, letterSpacing: "0.04em",
      }}>{confirmLabel}</button>
    </div>
  );
}

// ─── Page component ────────────────────────────────────────────────────────────
export default function PositionDeskPage() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { user, token } = useAuth();

  const positions       = useSelector((s: RootState) => s.positions.positions);
  const loading         = useSelector((s: RootState) => s.positions.loading);
  const lifecycleLoading = useSelector((s: RootState) => s.positions.lifecycleLoading);
  const lifecycleError   = useSelector((s: RootState) => s.positions.lifecycleError);

  // ── Filter state ──
  const [statusFilter, setStatusFilter] = useState<ExecStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");

  // ── Modal state ──
  const [modal, setModal] = useState<ModalState>({ type: null, position: null });
  const [policyId, setPolicyId] = useState("");
  const [runId, setRunId] = useState("");
  const [hedgeAmount, setHedgeAmount] = useState("");
  const [hedgeRate, setHedgeRate] = useState("");
  const [executionRef, setExecutionRef] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  // ── Load on mount ──
  useEffect(() => {
    if (token) {
      dispatch(listPositionsThunk({ token }));
    }
  }, [dispatch, token]);

  // ── Dismiss lifecycle error on modal open ──
  useEffect(() => {
    if (modal.type !== null) {
      dispatch(clearLifecycleError());
    }
  }, [modal.type, dispatch]);

  // ── Filtered positions ──
  const filteredPositions = useMemo(() => {
    let rows = positions;
    if (statusFilter !== "ALL") {
      rows = rows.filter((p) => p.execution_status === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (p) =>
          p.record_id.toLowerCase().includes(q) ||
          p.entity.toLowerCase().includes(q) ||
          p.currency.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [positions, statusFilter, search]);

  // ── Status counts for filter bar ──
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: positions.length };
    for (const st of ALL_STATUSES) {
      counts[st] = positions.filter((p) => p.execution_status === st).length;
    }
    return counts;
  }, [positions]);

  // ── Open modal helpers ──
  const openModal = useCallback((type: ModalType, position: PositionRow) => {
    setModal({ type, position });
    // Pre-fill from position state
    setPolicyId(position.policy_id ?? "");
    setRunId(position.last_run_id ?? "");
    setHedgeAmount(position.hedge_amount?.toString() ?? "");
    setHedgeRate(position.hedge_rate?.toString() ?? "");
    setExecutionRef("");
    setRejectReason("");
  }, []);

  const closeModal = useCallback(() => {
    setModal({ type: null, position: null });
  }, []);

  // ── Action handlers ──
  const handleAssignPolicy = useCallback(async () => {
    if (!modal.position || !policyId.trim() || !token) return;
    const result = await dispatch(assignPolicyThunk({
      id: modal.position.id, policyInstanceId: policyId.trim(), token,
    }));
    if (result.meta.requestStatus === "fulfilled") closeModal();
  }, [dispatch, modal.position, policyId, token, closeModal]);

  const handleMarkReady = useCallback(async () => {
    if (!modal.position || !runId.trim() || !token) return;
    const result = await dispatch(markReadyThunk({
      id: modal.position.id,
      runId: runId.trim(),
      hedgeAmount: hedgeAmount ? parseFloat(hedgeAmount) : undefined,
      hedgeRate: hedgeRate ? parseFloat(hedgeRate) : undefined,
      token,
    }));
    if (result.meta.requestStatus === "fulfilled") closeModal();
  }, [dispatch, modal.position, runId, hedgeAmount, hedgeRate, token, closeModal]);

  const handleExecute = useCallback(async () => {
    if (!modal.position || !executionRef.trim() || !token) return;
    const result = await dispatch(executePositionThunk({
      id: modal.position.id,
      executionRef: executionRef.trim(),
      hedgeAmount: hedgeAmount ? parseFloat(hedgeAmount) : undefined,
      hedgeRate: hedgeRate ? parseFloat(hedgeRate) : undefined,
      token,
    }));
    if (result.meta.requestStatus === "fulfilled") closeModal();
  }, [dispatch, modal.position, executionRef, hedgeAmount, hedgeRate, token, closeModal]);

  const handleReject = useCallback(async () => {
    if (!modal.position || !rejectReason.trim() || !token) return;
    const result = await dispatch(rejectPositionThunk({
      id: modal.position.id, reason: rejectReason.trim(), token,
    }));
    if (result.meta.requestStatus === "fulfilled") closeModal();
  }, [dispatch, modal.position, rejectReason, token, closeModal]);

  const handleReopen = useCallback(async (pos: PositionRow) => {
    if (!token) return;
    dispatch(reopenPositionThunk({ id: pos.id, token }));
  }, [dispatch, token]);

  // ── Redirect if not authenticated ──
  if (!user) {
    return (
      <div style={{ padding: 40, fontFamily: S.fontMono, color: S.secondary, fontSize: 12 }}>
        Authentication required. <button onClick={() => router.push("/auth/login")} style={{ color: S.cyan, background: "none", border: "none", cursor: "pointer", fontFamily: S.fontMono }}>Sign in</button>
      </div>
    );
  }

  const pos = modal.position;
  const isTransitioning = lifecycleLoading !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: S.bgDeep, overflow: "hidden" }}>

      {/* ── Header strip ──────────────────────────────────────────────────────── */}
      <header style={{
        display: "flex", alignItems: "center", gap: 12, height: 44, flexShrink: 0,
        padding: "0 20px", background: S.bgPanel, borderBottom: `1px solid ${S.rim}`,
      }}>
        <button onClick={() => router.push("/input")} style={{
          fontFamily: S.fontMono, fontSize: 11, color: S.tertiary,
          background: "transparent", border: `1px solid ${S.rim}`,
          padding: "2px 8px", cursor: "pointer",
        }}>← Ingestion</button>
        <span style={{ color: S.rim }}>|</span>
        <span style={{
          fontFamily: S.fontUI, fontSize: 13, fontWeight: 700,
          letterSpacing: "0.06em", textTransform: "uppercase", color: S.primary,
        }}>Position Desk</span>
        <span style={{
          fontFamily: S.fontMono, fontSize: 10, color: S.secondary,
          border: `1px solid ${S.rim}`, padding: "1px 5px",
        }}>CONTROL TOWER · LIFECYCLE</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
          {positions.length} positions
        </span>
        <button
          onClick={() => token && dispatch(listPositionsThunk({ token }))}
          style={{
            fontFamily: S.fontMono, fontSize: 10, color: S.cyan,
            background: "transparent", border: `1px solid color-mix(in srgb, ${S.cyan} 30%, transparent)`,
            padding: "2px 8px", cursor: "pointer",
          }}
        >↻ Refresh</button>
      </header>

      {/* ── Lifecycle error banner ─────────────────────────────────────────────── */}
      {lifecycleError && (
        <div style={{
          background: `color-mix(in srgb, ${S.fail} 8%, transparent)`,
          border: `1px solid color-mix(in srgb, ${S.fail} 25%, transparent)`,
          borderLeft: `3px solid ${S.fail}`,
          padding: "8px 20px", flexShrink: 0,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.fail, letterSpacing: "0.06em" }}>
            TRANSITION ERROR
          </span>
          <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary }}>
            {lifecycleError}
          </span>
          <button
            onClick={() => dispatch(clearLifecycleError())}
            style={{ marginLeft: "auto", fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, background: "none", border: "none", cursor: "pointer" }}
          >✕</button>
        </div>
      )}

      {/* ── Status filter bar ──────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 2, padding: "6px 20px",
        background: S.bgPanel, borderBottom: `1px solid ${S.soft}`, flexShrink: 0, flexWrap: "wrap",
      }}>
        {/* ALL filter */}
        {(["ALL", ...ALL_STATUSES] as const).map((st) => {
          const isActive = statusFilter === st;
          const cfg = st === "ALL" ? null : STATUS_CONFIG[st];
          const color = cfg?.color ?? S.secondary;
          const label = st === "ALL" ? "ALL" : cfg!.label;
          const count = statusCounts[st] ?? 0;
          return (
            <button
              key={st}
              onClick={() => setStatusFilter(st as typeof statusFilter)}
              style={{
                fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                color: isActive ? (st === "ALL" ? S.primary : color) : S.tertiary,
                background: isActive ? `color-mix(in srgb, ${st === "ALL" ? S.cyan : color} 10%, transparent)` : "transparent",
                border: `1px solid ${isActive ? `color-mix(in srgb, ${st === "ALL" ? S.cyan : color} 35%, transparent)` : S.rim}`,
                padding: "3px 9px", cursor: "pointer", borderRadius: 2,
                transition: "all 0.1s",
              }}
            >
              {label} <span style={{ opacity: 0.7 }}>({count})</span>
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        {/* Search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search record_id / entity / currency…"
          style={{
            fontFamily: S.fontMono, fontSize: 11, padding: "3px 10px",
            background: S.bgSub, border: `1px solid ${S.rim}`, color: S.primary,
            outline: "none", width: 260,
          }}
        />
      </div>

      {/* ── Column header ─────────────────────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "130px 160px 70px 80px 110px 100px 80px 1fr",
        padding: "5px 20px",
        background: S.bgSub, borderBottom: `1px solid ${S.soft}`,
        flexShrink: 0,
      }}>
        {["RECORD ID", "ENTITY", "CCY", "AMOUNT", "STATUS", "VALUE DATE", "FLOW", "ACTIONS"].map((col) => (
          <span key={col} style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.08em", fontWeight: 700 }}>
            {col}
          </span>
        ))}
      </div>

      {/* ── Table body ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading && (
          <div style={{ padding: "40px 20px", fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, textAlign: "center" }}>
            Loading positions…
          </div>
        )}
        {!loading && filteredPositions.length === 0 && (
          <div style={{ padding: "48px 20px", textAlign: "center" }}>
            <div style={{ fontFamily: S.fontUI, fontSize: 14, color: S.secondary, marginBottom: 6 }}>
              No positions found
            </div>
            <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
              {statusFilter !== "ALL" ? `No positions with status ${statusFilter}` : "Import positions from the Ingestion Desk"}
            </div>
          </div>
        )}
        {filteredPositions.map((pos, idx) => {
          const isLoading = lifecycleLoading === pos.id;
          const st = pos.execution_status as ExecStatus;

          return (
            <div
              key={pos.id}
              style={{
                display: "grid",
                gridTemplateColumns: "130px 160px 70px 80px 110px 100px 80px 1fr",
                padding: "8px 20px",
                borderBottom: `1px solid ${S.soft}`,
                background: idx % 2 === 0 ? "transparent" : `color-mix(in srgb, ${S.bgPanel} 40%, transparent)`,
                alignItems: "center",
                opacity: isLoading ? 0.6 : 1,
                transition: "opacity 0.15s",
              }}
            >
              {/* Record ID */}
              <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.primary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {pos.record_id}
              </span>

              {/* Entity */}
              <span style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {pos.entity}
              </span>

              {/* Currency */}
              <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.cyan, fontWeight: 700 }}>
                {pos.currency}
              </span>

              {/* Amount */}
              <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.primary, textAlign: "right", paddingRight: 8 }}>
                {fmtAmt(pos.amount)}
              </span>

              {/* Execution status badge */}
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <StatusBadge status={st} />
              </div>

              {/* Value date */}
              <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary }}>
                {fmtDate(pos.value_date)}
              </span>

              {/* Flow type */}
              <span style={{
                fontFamily: S.fontMono, fontSize: 10, fontWeight: 700,
                color: pos.type === "AR" ? S.pass : S.amber,
              }}>
                {pos.type}
              </span>

              {/* Actions */}
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {st === "NEW" && (
                  <>
                    <ActionBtn label="ASSIGN POLICY" color={S.cyan}    onClick={() => openModal("assign-policy", pos)} loading={isLoading} />
                    <ActionBtn label="REJECT"        color={S.fail}    onClick={() => openModal("reject", pos)}        loading={isLoading} />
                  </>
                )}
                {st === "POLICY_ASSIGNED" && (
                  <>
                    <ActionBtn label="MARK READY"    color={S.amber}   onClick={() => openModal("mark-ready", pos)}    loading={isLoading} />
                    <ActionBtn label="RE-ASSIGN"     color={S.secondary} onClick={() => openModal("assign-policy", pos)} loading={isLoading} />
                    <ActionBtn label="REJECT"        color={S.fail}    onClick={() => openModal("reject", pos)}        loading={isLoading} />
                  </>
                )}
                {st === "READY_TO_EXECUTE" && (
                  <>
                    <ActionBtn label="EXECUTE"       color={S.pass}    onClick={() => openModal("execute", pos)}       loading={isLoading} />
                    <ActionBtn label="REJECT"        color={S.fail}    onClick={() => openModal("reject", pos)}        loading={isLoading} />
                  </>
                )}
                {st === "HEDGED" && (
                  <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.06em" }}>
                    {pos.execution_ref ? `REF: ${pos.execution_ref}` : "TERMINAL"}
                  </span>
                )}
                {st === "REJECTED" && (
                  <ActionBtn label="REOPEN" color={S.secondary} onClick={() => handleReopen(pos)} loading={isLoading} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────────── */}
      <footer style={{
        height: 28, flexShrink: 0, display: "flex", alignItems: "center",
        padding: "0 20px", gap: 16,
        background: S.bgPanel, borderTop: `1px solid ${S.rim}`,
      }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.06em" }}>
          POSITION DESK · PHASE 0 BACKBONE · WORM AUDIT
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>
          {filteredPositions.length}/{positions.length} rows shown
        </span>
      </footer>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════════ */}

      {/* Assign Policy modal */}
      {modal.type === "assign-policy" && pos && (
        <ModalOverlay onClose={closeModal}>
          <ModalHeader
            title="Assign Policy"
            subtitle={`Position: ${pos.record_id} — ${pos.entity} (${pos.currency})`}
          />
          <ModalInput
            label="Policy Instance ID *"
            value={policyId}
            onChange={setPolicyId}
            placeholder="UUID of the active policy instance"
          />
          <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginBottom: 8 }}>
            Transition: {pos.execution_status} → POLICY_ASSIGNED
          </div>
          {lifecycleError && (
            <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.fail, marginBottom: 10, padding: "4px 8px", border: `1px solid ${S.fail}`, background: `color-mix(in srgb, ${S.fail} 8%, transparent)` }}>
              {lifecycleError}
            </div>
          )}
          <ModalActions
            onCancel={closeModal}
            onConfirm={handleAssignPolicy}
            confirmLabel="ASSIGN POLICY"
            confirmColor={S.cyan}
            disabled={!policyId.trim() || isTransitioning}
          />
        </ModalOverlay>
      )}

      {/* Mark Ready modal */}
      {modal.type === "mark-ready" && pos && (
        <ModalOverlay onClose={closeModal}>
          <ModalHeader
            title="Mark Ready to Execute"
            subtitle={`Position: ${pos.record_id} — ${pos.entity} (${pos.currency})`}
          />
          <ModalInput
            label="Calculation Run ID *"
            value={runId}
            onChange={setRunId}
            placeholder="run_id from POST /v1/calculate"
          />
          <ModalInput
            label="Hedge Amount (optional)"
            value={hedgeAmount}
            onChange={setHedgeAmount}
            placeholder="Notional USD to hedge"
            type="number"
          />
          <ModalInput
            label="Hedge Rate (optional)"
            value={hedgeRate}
            onChange={setHedgeRate}
            placeholder="Locked forward rate"
            type="number"
          />
          <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginBottom: 8 }}>
            Transition: POLICY_ASSIGNED → READY_TO_EXECUTE
          </div>
          {lifecycleError && (
            <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.fail, marginBottom: 10, padding: "4px 8px", border: `1px solid ${S.fail}`, background: `color-mix(in srgb, ${S.fail} 8%, transparent)` }}>
              {lifecycleError}
            </div>
          )}
          <ModalActions
            onCancel={closeModal}
            onConfirm={handleMarkReady}
            confirmLabel="MARK READY"
            confirmColor={S.amber}
            disabled={!runId.trim() || isTransitioning}
          />
        </ModalOverlay>
      )}

      {/* Execute modal */}
      {modal.type === "execute" && pos && (
        <ModalOverlay onClose={closeModal}>
          <ModalHeader
            title="Confirm Execution"
            subtitle={`Position: ${pos.record_id} — ${pos.entity} (${pos.currency})`}
          />
          <div style={{
            fontFamily: S.fontMono, fontSize: 10, color: S.amber,
            padding: "6px 10px", border: `1px solid color-mix(in srgb, ${S.amber} 25%, transparent)`,
            background: `color-mix(in srgb, ${S.amber} 6%, transparent)`,
            marginBottom: 14, lineHeight: 1.5,
          }}>
            This is a TERMINAL transition. HEDGED state cannot be reversed.<br />
            Requires: trades.execute permission (SoD gate).
          </div>
          <ModalInput
            label="Execution Reference *"
            value={executionRef}
            onChange={setExecutionRef}
            placeholder="IBKR order ID / bank confirmation ref"
          />
          <ModalInput
            label="Hedge Amount (optional)"
            value={hedgeAmount}
            onChange={setHedgeAmount}
            placeholder="Actual hedged notional USD"
            type="number"
          />
          <ModalInput
            label="Hedge Rate (optional)"
            value={hedgeRate}
            onChange={setHedgeRate}
            placeholder="Actual execution rate"
            type="number"
          />
          {lifecycleError && (
            <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.fail, marginBottom: 10, padding: "4px 8px", border: `1px solid ${S.fail}`, background: `color-mix(in srgb, ${S.fail} 8%, transparent)` }}>
              {lifecycleError}
            </div>
          )}
          <ModalActions
            onCancel={closeModal}
            onConfirm={handleExecute}
            confirmLabel="CONFIRM EXECUTION"
            confirmColor={S.pass}
            disabled={!executionRef.trim() || isTransitioning}
          />
        </ModalOverlay>
      )}

      {/* Reject modal */}
      {modal.type === "reject" && pos && (
        <ModalOverlay onClose={closeModal}>
          <ModalHeader
            title="Reject Position"
            subtitle={`Position: ${pos.record_id} — ${pos.entity} (${pos.currency})`}
          />
          <ModalInput
            label="Rejection Reason * (mandatory for audit)"
            value={rejectReason}
            onChange={setRejectReason}
            placeholder="e.g. Counterparty credit limit exceeded"
          />
          <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginBottom: 8 }}>
            Transition: {pos.execution_status} → REJECTED (can be reopened)
          </div>
          {lifecycleError && (
            <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.fail, marginBottom: 10, padding: "4px 8px", border: `1px solid ${S.fail}`, background: `color-mix(in srgb, ${S.fail} 8%, transparent)` }}>
              {lifecycleError}
            </div>
          )}
          <ModalActions
            onCancel={closeModal}
            onConfirm={handleReject}
            confirmLabel="REJECT POSITION"
            confirmColor={S.fail}
            disabled={!rejectReason.trim() || isTransitioning}
          />
        </ModalOverlay>
      )}
    </div>
  );
}
