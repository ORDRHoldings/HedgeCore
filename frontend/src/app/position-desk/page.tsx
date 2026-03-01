"use client";

/**
 * /position-desk — Position Control Tower
 * Sprint 1.2 — Institutional Control Tower Upgrade
 *
 * Upgrades over Phase 0:
 *   - Two new data columns: POLICY ID chip + RUN ID chip (click-to-copy)
 *   - NEEDS_ACTION preset filter: surfaces NEW + POLICY_ASSIGNED + READY rows
 *   - Keyboard shortcuts: / (search focus), F (filter cycle), R (refresh), Esc (clear)
 *   - Disabled action buttons show WHY and HOW TO RESOLVE via tooltip
 *   - Row checkboxes for bulk visual selection
 *   - Sprint 1.1 PROPOSE button replaces EXECUTE for READY_TO_EXECUTE rows
 *   - Status badge tooltip shows next step for each lifecycle state
 *   - Rejection reason shown on REOPEN hover tooltip
 *   - Header shows NEEDS ACTION count chip + Execution Desk link
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { recommendPolicyForPosition } from "@/utils/policyRecommender";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  clearError as clearListError,
} from "../../lib/store/slices/positionSlice";
import type { PositionRow, BulkAssignResult } from "../../api/positionClient";
import { bulkAssignPolicy, rejectPosition, deletePosition } from "../../api/positionClient";
import {
  listPolicyTemplates,
  listFavorites,
  getActivePolicy,
  type PolicyTemplate,
  type PolicyInstance,
} from "../../api/policyClient";
import HelpPanelV2 from "@/components/help/HelpPanelV2";
import { POSITIONS_HELP } from "@/lib/help";
import WorkflowBreadcrumb from "@/components/layout/WorkflowBreadcrumb";
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
  pass:      "var(--status-pass,#22c55e)",
  fail:      "var(--accent-red,#ef4444)",
  purple:    "#a78bfa",
  indigo:    "#818cf8",
} as const;
type ExecStatus = "NEW" | "POLICY_ASSIGNED" | "READY_TO_EXECUTE" | "HEDGED" | "REJECTED";

const STATUS_CONFIG: Record<ExecStatus, { label: string; color: string; desc: string; nextStep: string }> = {
  NEW:              { label: "NEW",          color: S.tertiary, desc: "Awaiting policy assignment",                     nextStep: "Click ASSIGN POLICY to attach a hedge policy." },
  POLICY_ASSIGNED:  { label: "POLICY ASGND", color: S.cyan,     desc: "Policy assigned, awaiting hedge calculation",     nextStep: "Run hedge engine, then click MARK READY with run ID." },
  READY_TO_EXECUTE: { label: "READY",        color: S.amber,    desc: "Run linked, awaiting 4-eyes execution proposal",  nextStep: "Click PROPOSE to start the 4-eyes approval workflow." },
  HEDGED:           { label: "HEDGED",       color: S.pass,     desc: "Execution confirmed, terminal state",             nextStep: "No further action. Position is fully hedged." },
  REJECTED:         { label: "REJECTED",     color: S.fail,     desc: "Rejected, can be reopened",                      nextStep: "Click REOPEN to return to NEW status." },
};

type FilterPreset = "ALL" | "NEW" | "POLICY_ASSIGNED" | "READY_TO_EXECUTE" | "HEDGED" | "REJECTED" | "NEEDS_ACTION";

const PRESET_LABELS: Record<FilterPreset, string> = {
  ALL: "ALL", NEW: "NEW", POLICY_ASSIGNED: "POLICY ASGND",
  READY_TO_EXECUTE: "READY", HEDGED: "HEDGED", REJECTED: "REJECTED",
  NEEDS_ACTION: "NEEDS ACTION",
};
const NEEDS_ACTION_STATUSES: ExecStatus[] = ["NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE"];

type ModalType = "assign-policy" | "mark-ready" | "reject" | "proposal-info" | null;
interface ModalState { type: ModalType; position: PositionRow | null; }
interface BulkRejectResult { rejected: number; skipped: number; failed: number; errors: string[]; }
function fmtAmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null | undefined): string { return s ? s.slice(0, 10) : "—"; }
function truncate(s: string | null | undefined, max = 16): string {
  if (!s) return "—"; return s.length > max ? s.slice(0, max) + "…" : s;
}
function shortId(s: string | null | undefined): string { if (!s) return "—"; return s.slice(0, 8).toUpperCase(); }
function Tooltip({ tip, children }: { tip: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && tip && (
        <span style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: "50%",
          transform: "translateX(-50%)", zIndex: 500,
          background: "#1a1a2e", border: `1px solid ${S.rim}`,
          color: S.secondary, fontFamily: S.fontMono, fontSize: 10,
          padding: "5px 9px", borderRadius: 2, whiteSpace: "pre-wrap",
          maxWidth: 260, lineHeight: 1.5, pointerEvents: "none",
          boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
        }}>{tip}</span>
      )}
    </span>
  );
}
function StatusBadge({ status }: { status: ExecStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span style={{
      fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
      color: cfg.color, background: `color-mix(in srgb, ${cfg.color} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${cfg.color} 28%, transparent)`,
      padding: "2px 6px", borderRadius: 2, whiteSpace: "nowrap",
    }}>{cfg.label}</span>
  );
}

function ActionBtn({ label, color, onClick, disabled, loading, disabledReason }: {
  label: string; color: string; onClick: () => void;
  disabled?: boolean; loading?: boolean; disabledReason?: string;
}) {
  const btn = (
    <button onClick={onClick} disabled={disabled || loading} style={{
      fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
      color: disabled ? S.tertiary : color, background: "transparent",
      border: `1px solid ${disabled ? S.rim : `color-mix(in srgb, ${color} 40%, transparent)`}`,
      padding: "2px 7px", cursor: disabled ? "not-allowed" : "pointer",
      borderRadius: 2, opacity: loading ? 0.5 : 1, transition: "all 0.1s",
    }}>{loading ? "…" : label}</button>
  );
  if (disabled && disabledReason) return <Tooltip tip={disabledReason}>{btn}</Tooltip>;
  return btn;
}
function RunIdChip({ runId, onCopy }: { runId: string | null; onCopy?: (id: string) => void }) {
  if (!runId) return <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.rim }}>—</span>;
  return (
    <Tooltip tip={`Run: ${runId}
Click to view audit trail`}>
      <Link
        href={`/run-viewer?id=${encodeURIComponent(runId)}`}
        onClick={() => onCopy?.(runId)}
        style={{
          fontFamily: S.fontMono, fontSize: 9, color: S.purple,
          background: `color-mix(in srgb, ${S.purple} 10%, transparent)`,
          border: `1px solid color-mix(in srgb, ${S.purple} 25%, transparent)`,
          padding: "1px 5px", borderRadius: 2, cursor: "pointer", letterSpacing: "0.04em",
          textDecoration: "none",
        }}>{shortId(runId)}</Link>
    </Tooltip>
  );
}

function PolicyChip({ policyId }: { policyId: string | null }) {
  if (!policyId) return <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.rim }}>—</span>;
  return (
    <Tooltip tip={`Policy ID: ${policyId}`}>
      <span style={{
        fontFamily: S.fontMono, fontSize: 9, color: S.cyan,
        background: `color-mix(in srgb, ${S.cyan} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${S.cyan} 20%, transparent)`,
        padding: "1px 5px", borderRadius: 2, letterSpacing: "0.04em",
      }}>{shortId(policyId)}</span>
    </Tooltip>
  );
}
function ModalOverlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: "24px 28px", minWidth: 400, maxWidth: 500, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 700, color: S.primary, letterSpacing: "0.04em", textTransform: "uppercase" }}>{title}</div>
      <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary, marginTop: 4 }}>{subtitle}</div>
    </div>
  );
}

function ModalInput({ label, value, onChange, placeholder, type = "text", error }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; error?: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontFamily: S.fontMono, fontSize: 10, color: error ? S.fail : S.secondary, display: "block", marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", padding: "7px 10px", boxSizing: "border-box", background: S.bgSub, border: `1px solid ${error ? S.fail : S.rim}`, color: S.primary, fontFamily: S.fontMono, fontSize: 12, outline: "none" }} />
      {error && <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.fail, marginTop: 3 }}>{error}</div>}
    </div>
  );
}

function ModalActions({ onCancel, onConfirm, confirmLabel, confirmColor, disabled }: {
  onCancel: () => void; onConfirm: () => void; confirmLabel: string; confirmColor: string; disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
      <button onClick={onCancel} style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary, background: "transparent", border: `1px solid ${S.rim}`, padding: "6px 14px", cursor: "pointer" }}>Cancel</button>
      <button onClick={onConfirm} disabled={disabled} style={{ fontFamily: S.fontMono, fontSize: 11, color: S.bgDeep, background: disabled ? S.tertiary : confirmColor, border: "none", padding: "6px 14px", cursor: disabled ? "not-allowed" : "pointer", fontWeight: 700, letterSpacing: "0.04em" }}>{confirmLabel}</button>
    </div>
  );
}
function PolicySelectorRow({
  tmpl, isSelected, isFavorite, isActive, onSelect
}: {
  tmpl: PolicyTemplate;
  isSelected: boolean;
  isFavorite: boolean;
  isActive: boolean;
  onSelect: () => void;
}) {
  const conf = Math.round((tmpl.config.hedge_ratios?.confirmed ?? 0) * 100);
  const fcst = Math.round((tmpl.config.hedge_ratios?.forecast ?? 0) * 100);
  return (
    <div
      onClick={isActive ? onSelect : undefined}
      style={{
        padding: '6px 10px',
        cursor: isActive ? 'pointer' : 'not-allowed',
        background: isSelected
          ? `color-mix(in srgb, ${S.cyan} 8%, ${S.bgPanel})`
          : !isActive
            ? `color-mix(in srgb, ${S.rim} 20%, transparent)`
            : 'transparent',
        borderBottom: `1px solid ${S.rim}`,
        display: 'flex', alignItems: 'center', gap: 8,
        transition: 'background 0.1s',
        opacity: isActive ? 1 : 0.45,
      }}
    >
      {isFavorite && <span style={{ color: S.amber, fontSize: '0.625rem' }}>★</span>}
      <span style={{ fontFamily: S.fontMono, fontSize: '0.6875rem',
        color: S.cyan, letterSpacing: '0.06em', minWidth: 48 }}>
        {tmpl.short_name}
      </span>
      <span style={{ fontFamily: S.fontUI, fontSize: '0.75rem',
        color: S.primary, flex: 1 }}>
        {tmpl.name}
      </span>
      {isActive && (
        <span style={{ fontFamily: S.fontMono, fontSize: '0.4375rem',
          color: S.pass, letterSpacing: '0.08em',
          border: `1px solid color-mix(in srgb, ${S.pass} 30%, transparent)`,
          padding: '1px 4px' }}>
          ACTIVE
        </span>
      )}
      <span style={{ fontFamily: S.fontMono, fontSize: '0.5625rem',
        color: S.tertiary, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
        {conf}% · {fcst}%
      </span>
    </div>
  );
}

export default function PositionDeskPage() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { user, token } = useAuth();
  const positions        = useSelector((s: RootState) => s.positions.positions);
  const loading          = useSelector((s: RootState) => s.positions.loading);
  const listError        = useSelector((s: RootState) => s.positions.error);
  const lifecycleLoading = useSelector((s: RootState) => s.positions.lifecycleLoading);
  const lifecycleError   = useSelector((s: RootState) => s.positions.lifecycleError);

  const [preset, setPreset]       = useState<FilterPreset>("ALL");
  const [search, setSearch]       = useState("");
  const [copiedRun, setCopiedRun] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [modal, setModal]               = useState<ModalState>({ type: null, position: null });
  const [policyId, setPolicyId]         = useState("");
  const [runId, setRunId]               = useState("");
  const [hedgeAmount, setHedgeAmount]   = useState("");
  const [hedgeRate, setHedgeRate]       = useState("");
  const [rejectReason, setRejectReason] = useState("");

  // Policy selector state (for assign-policy modal)
  const [policyTemplates, setPolicyTemplates]           = useState<PolicyTemplate[]>([]);
  const [activePolicyInstance, setActivePolicyInstance] = useState<PolicyInstance | null>(null);
  const [favTemplateIds, setFavTemplateIds]             = useState<Set<string>>(new Set());
  const [policySearchQuery, setPolicySearchQuery]       = useState('');

  // Bulk assign state
  const [bulkAssignOpen, setBulkAssignOpen]             = useState(false);
  const [bulkPolicyId, setBulkPolicyId]                 = useState('');
  const [bulkSearchQuery, setBulkSearchQuery]           = useState('');
  const [bulkRunning, setBulkRunning]                   = useState(false);
  const [bulkResult, setBulkResult]                     = useState<BulkAssignResult | null>(null);

  // Bulk reject state
  const [bulkRejectOpen, setBulkRejectOpen]             = useState(false);
  const [bulkRejectReason, setBulkRejectReason]         = useState('');
  const [bulkRejecting, setBulkRejecting]               = useState(false);
  const [bulkRejectProgress, setBulkRejectProgress]     = useState(0);
  const [bulkRejectResult, setBulkRejectResult]         = useState<BulkRejectResult | null>(null);

  // Delete confirmation state
  const [deleteConfirmId, setDeleteConfirmId]           = useState<string | null>(null);
  const [deleteRunning, setDeleteRunning]               = useState(false);

  // Show/hide rejected toggle (X-15)
  const [hideRejected, setHideRejected]                 = useState(false);

  // ERR-1: track whether the operator dismissed the list-error banner for the current error
  const [errorDismissed, setErrorDismissed]             = useState(false);

  // Best-match policy recommendation for assign-policy modal
  const recommendation = useMemo(() => {
    if (modal.type !== 'assign-policy' || !modal.position) return null;
    return recommendPolicyForPosition(
      modal.position,
      policyTemplates,
      favTemplateIds,
    );
  }, [modal, policyTemplates, favTemplateIds]);

  useEffect(() => { if (token) dispatch(listPositionsThunk({ token })); }, [dispatch, token]);
  useEffect(() => { if (modal.type !== null) dispatch(clearLifecycleError()); }, [modal.type, dispatch]);
  // ERR-1: un-dismiss the banner whenever a new error surfaces (new string reference = new error)
  useEffect(() => { if (listError) setErrorDismissed(false); }, [listError]);

  // Load templates + favorites + active instance when assign-policy modal opens
  useEffect(() => {
    if (modal.type !== 'assign-policy' || !token) return;
    Promise.all([
      listPolicyTemplates(token),
      listFavorites(token),
      getActivePolicy(token),
    ]).then(([templates, favs, activeInst]) => {
      setPolicyTemplates(templates);
      setFavTemplateIds(new Set(favs.map(f => f.template_id)));
      setActivePolicyInstance(activeInst);
    }).catch(() => {});
  }, [modal.type, token]);

  // Load templates + favorites + active instance when bulk assign modal opens
  useEffect(() => {
    if (!bulkAssignOpen || !token) return;
    setBulkPolicyId('');
    setBulkSearchQuery('');
    setBulkResult(null);
    Promise.all([
      listPolicyTemplates(token),
      listFavorites(token),
      getActivePolicy(token),
    ]).then(([templates, favs, activeInst]) => {
      setPolicyTemplates(templates);
      setFavTemplateIds(new Set(favs.map(f => f.template_id)));
      setActivePolicyInstance(activeInst);
      // Auto-select active policy instance if available
      if (activeInst) setBulkPolicyId(activeInst.id);
    }).catch(() => {});
  }, [bulkAssignOpen, token]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        if (e.key === "Escape") { (e.target as HTMLElement).blur(); setSearch(""); }
        return;
      }
      if (modal.type !== null) { if (e.key === "Escape") closeModal(); return; }
      switch (e.key) {
        case "/": e.preventDefault(); searchRef.current?.focus(); break;
        case "r": case "R": if (token) dispatch(listPositionsThunk({ token })); break;
        case "f": case "F": {
          const cycle: FilterPreset[] = ["ALL", "NEEDS_ACTION", "NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE", "HEDGED", "REJECTED"];
          const idx = cycle.indexOf(preset);
          setPreset(cycle[(idx + 1) % cycle.length]);
          break;
        }
        case "Escape": setSearch(""); setSelected(new Set()); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, token, modal.type, preset]);
  const filteredPositions = useMemo(() => {
    let rows = positions;
    if (preset === "NEEDS_ACTION") rows = rows.filter((p) => NEEDS_ACTION_STATUSES.includes(p.execution_status as ExecStatus));
    else if (preset !== "ALL") rows = rows.filter((p) => p.execution_status === preset);
    // X-15: hide rejected when toggle is on and viewing ALL
    if (preset === "ALL" && hideRejected) rows = rows.filter((p) => p.execution_status !== "REJECTED");
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((p) =>
        p.record_id.toLowerCase().includes(q) || p.entity.toLowerCase().includes(q) ||
        p.currency.toLowerCase().includes(q) || (p.policy_id ?? "").toLowerCase().includes(q) ||
        (p.last_run_id ?? "").toLowerCase().includes(q),
      );
    }
    return rows;
  }, [positions, preset, search, hideRejected]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { ALL: positions.length };
    for (const st of ["NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE", "HEDGED", "REJECTED"] as ExecStatus[])
      c[st] = positions.filter((p) => p.execution_status === st).length;
    c.NEEDS_ACTION = positions.filter((p) => NEEDS_ACTION_STATUSES.includes(p.execution_status as ExecStatus)).length;
    return c;
  }, [positions]);
  const openModal = useCallback((type: ModalType, position: PositionRow) => {
    setModal({ type, position });
    setPolicyId(position.policy_id ?? "");
    setRunId(position.last_run_id ?? "");
    setHedgeAmount(position.hedge_amount?.toString() ?? "");
    setHedgeRate(position.hedge_rate?.toString() ?? "");
    setRejectReason("");
    setPolicySearchQuery("");
    // Reset selector so stale data doesn't show while loading
    if (type === 'assign-policy') {
      setPolicyTemplates([]);
      setActivePolicyInstance(null);
    }
  }, []);

  const closeModal = useCallback(() => setModal({ type: null, position: null }), []);

  const handleCopyRun = useCallback((id: string) => {
    navigator.clipboard?.writeText(id).catch(() => undefined);
    setCopiedRun(id);
    setTimeout(() => setCopiedRun(null), 1800);
  }, []);

  const handleAssignPolicy = useCallback(async () => {
    if (!modal.position || !policyId.trim() || !token) return;
    const r = await dispatch(assignPolicyThunk({ id: modal.position.id, policyInstanceId: policyId.trim(), token }));
    if (r.meta.requestStatus === "fulfilled") closeModal();
  }, [dispatch, modal.position, policyId, token, closeModal]);

  const handleMarkReady = useCallback(async () => {
    if (!modal.position || !runId.trim() || !token) return;
    const r = await dispatch(markReadyThunk({
      id: modal.position.id, runId: runId.trim(),
      hedgeAmount: hedgeAmount ? parseFloat(hedgeAmount) : undefined,
      hedgeRate: hedgeRate ? parseFloat(hedgeRate) : undefined, token,
    }));
    if (r.meta.requestStatus === "fulfilled") closeModal();
  }, [dispatch, modal.position, runId, hedgeAmount, hedgeRate, token, closeModal]);

  const handleReject = useCallback(async () => {
    if (!modal.position || !rejectReason.trim() || !token) return;
    const r = await dispatch(rejectPositionThunk({ id: modal.position.id, reason: rejectReason.trim(), token }));
    if (r.meta.requestStatus === "fulfilled") closeModal();
  }, [dispatch, modal.position, rejectReason, token, closeModal]);

  const handleReopen = useCallback(async (p: PositionRow) => {
    if (!token) return;
    dispatch(reopenPositionThunk({ id: p.id, token }));
  }, [dispatch, token]);

  const handleBulkAssign = useCallback(async () => {
    if (!token || !bulkPolicyId || selected.size === 0) return;
    setBulkRunning(true);
    setBulkResult(null);
    try {
      const result = await bulkAssignPolicy(Array.from(selected), bulkPolicyId, token);
      setBulkResult(result);
      if (result.assigned > 0) {
        dispatch(listPositionsThunk({ token }));
        setSelected(new Set());
      }
    } catch {
      setBulkResult({ assigned: 0, skipped: 0, failed: selected.size, errors: ['Request failed — check network and permissions.'] });
    } finally {
      setBulkRunning(false);
    }
  }, [token, bulkPolicyId, selected, dispatch]);

  const handleBulkReject = useCallback(async () => {
    if (!token || !bulkRejectReason.trim() || selected.size === 0) return;
    setBulkRejecting(true);
    setBulkRejectProgress(0);
    setBulkRejectResult(null);
    const ids = Array.from(selected);
    const posMap = new Map(positions.map((p) => [p.id, p]));
    let rejected = 0, skipped = 0, failed = 0;
    const errors: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      const p = posMap.get(ids[i]);
      if (!p || p.execution_status === 'HEDGED' || p.execution_status === 'REJECTED') {
        skipped++;
        setBulkRejectProgress(i + 1);
        continue;
      }
      try {
        await rejectPosition(p.id, bulkRejectReason.trim(), token);
        rejected++;
      } catch (e) {
        failed++;
        errors.push(`${p.record_id}: ${e instanceof Error ? e.message : 'Failed'}`);
      }
      setBulkRejectProgress(i + 1);
    }
    setBulkRejectResult({ rejected, skipped, failed, errors });
    if (rejected > 0) {
      dispatch(listPositionsThunk({ token }));
      setSelected(new Set());
    }
    setBulkRejecting(false);
  }, [token, bulkRejectReason, selected, positions, dispatch]);

  const handleDeletePosition = useCallback(async () => {
    if (!token || !deleteConfirmId) return;
    setDeleteRunning(true);
    try {
      await deletePosition(deleteConfirmId, token);
      dispatch(listPositionsThunk({ token }));
      setDeleteConfirmId(null);
    } catch (e) {
      console.error('Delete failed:', e);
    } finally {
      setDeleteRunning(false);
    }
  }, [token, deleteConfirmId, dispatch]);

  const allVisibleSelected = filteredPositions.length > 0 && filteredPositions.every((p) => selected.has(p.id));
  const toggleSelectAll = useCallback(() => {
    if (allVisibleSelected) setSelected(new Set());
    else setSelected(new Set(filteredPositions.map((p) => p.id)));
  }, [allVisibleSelected, filteredPositions]);
  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);
  if (!user) return (
    <div style={{ padding: 40, fontFamily: S.fontMono, color: S.secondary, fontSize: 12 }}>
      Authentication required. <button onClick={() => router.push("/auth/login")} style={{ color: S.cyan, background: "none", border: "none", cursor: "pointer", fontFamily: S.fontMono }}>Sign in</button>
    </div>
  );

  const pos = modal.position;
  const isTransitioning = lifecycleLoading !== null;
  const needsActionCount = statusCounts.NEEDS_ACTION ?? 0;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: S.bgDeep, overflow: "hidden", flex: 1 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 10, height: 44, flexShrink: 0, padding: "0 20px", background: S.bgPanel, borderBottom: `1px solid ${S.rim}` }}>
        <button onClick={() => router.push("/input")} style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, background: "transparent", border: `1px solid ${S.rim}`, padding: "2px 8px", cursor: "pointer" }}>← Ingestion</button>
        <span style={{ color: S.rim }}>|</span>
        <span style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: S.primary }}>Position Desk</span>
        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.secondary, border: `1px solid ${S.rim}`, padding: "1px 5px" }}>CONTROL TOWER</span>
        {needsActionCount > 0 && (
          <span onClick={() => setPreset("NEEDS_ACTION")} style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.amber, background: `color-mix(in srgb, ${S.amber} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${S.amber} 30%, transparent)`, padding: "1px 7px", borderRadius: 2, cursor: "pointer", letterSpacing: "0.06em" }}>
            ⚡ {needsActionCount} NEEDS ACTION
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>{positions.length} positions</span>
        <button onClick={() => token && dispatch(listPositionsThunk({ token }))} title="Refresh (R)" style={{ fontFamily: S.fontMono, fontSize: 10, color: S.cyan, background: "transparent", border: `1px solid color-mix(in srgb, ${S.cyan} 30%, transparent)`, padding: "2px 8px", cursor: "pointer" }}>↻ Refresh</button>
        <button onClick={() => router.push("/hedge-desk")} style={{ fontFamily: S.fontMono, fontSize: 10, color: S.pass, background: `color-mix(in srgb, ${S.pass} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${S.pass} 25%, transparent)`, padding: "2px 8px", cursor: "pointer" }}>→ Execution</button>
      </header>
      <WorkflowBreadcrumb active="position" />
      {lifecycleError && (
        <div style={{ background: `color-mix(in srgb, ${S.fail} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${S.fail} 25%, transparent)`, borderLeft: `3px solid ${S.fail}`, padding: "7px 20px", flexShrink: 0, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.fail, letterSpacing: "0.06em" }}>TRANSITION ERROR</span>
          <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary }}>{lifecycleError}</span>
          <button onClick={() => dispatch(clearLifecycleError())} style={{ marginLeft: "auto", fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, background: "none", border: "none", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {/* ERR-1: list-load error banner — shown when positions could not be fetched */}
      {listError && !errorDismissed && (
        <div role="alert" aria-live="assertive" style={{
          background: `color-mix(in srgb, ${S.amber} 7%, ${S.bgPanel})`,
          border: `1px solid color-mix(in srgb, ${S.amber} 30%, transparent)`,
          borderLeft: `3px solid ${S.amber}`,
          padding: "10px 20px", flexShrink: 0,
          display: "flex", alignItems: "flex-start", gap: 14,
        }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 14, color: S.amber, lineHeight: 1, marginTop: 1 }}>⚠</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: S.amber, letterSpacing: "0.06em", marginBottom: 2 }}>
              POSITIONS UNAVAILABLE
            </div>
            <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, marginBottom: 4 }}>
              We couldn&apos;t load positions from the server. Retry or check connectivity.
            </div>
            <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.03em" }}>
              Detail: {listError}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, paddingTop: 2 }}>
            <button
              onClick={() => { dispatch(clearListError()); if (token) dispatch(listPositionsThunk({ token })); }}
              disabled={loading}
              style={{
                fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                color: S.bgDeep, background: loading ? S.tertiary : S.amber,
                border: "none", padding: "4px 12px", cursor: loading ? "not-allowed" : "pointer",
                borderRadius: 2, opacity: loading ? 0.6 : 1,
              }}>
              {loading ? "Retrying…" : "↻ Retry"}
            </button>
            <button
              onClick={() => setErrorDismissed(true)}
              title="Dismiss"
              style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }}>
              ✕
            </button>
          </div>
        </div>
      )}

      {copiedRun && (
        <div style={{ background: `color-mix(in srgb, ${S.purple} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${S.purple} 25%, transparent)`, padding: "5px 20px", flexShrink: 0, fontFamily: S.fontMono, fontSize: 10, color: S.purple }}>
          ✓ Run ID copied: {copiedRun}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "6px 20px", background: S.bgPanel, borderBottom: `1px solid ${S.soft}`, flexShrink: 0, flexWrap: "wrap" }}>
        {(["ALL", "NEEDS_ACTION", "NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE", "HEDGED", "REJECTED"] as FilterPreset[]).map((p) => {
          const isActive = preset === p;
          const color = p === "NEEDS_ACTION" ? S.amber : p === "ALL" ? S.secondary : p === "HEDGED" ? S.pass : p === "REJECTED" ? S.fail : STATUS_CONFIG[p as ExecStatus]?.color ?? S.secondary;
          const count = statusCounts[p] ?? 0;
          return (
            <button key={p} onClick={() => setPreset(p)} style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", color: isActive ? color : S.tertiary, background: isActive ? `color-mix(in srgb, ${color} 12%, transparent)` : "transparent", border: `1px solid ${isActive ? `color-mix(in srgb, ${color} 35%, transparent)` : S.rim}`, padding: "3px 9px", cursor: "pointer", borderRadius: 2, transition: "all 0.1s" }}>
              {PRESET_LABELS[p]} ({count})
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        {/* X-15: Show/Hide Rejected toggle */}
        {preset === "ALL" && (statusCounts.REJECTED ?? 0) > 0 && (
          <button
            onClick={() => setHideRejected(h => !h)}
            style={{
              fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
              color: hideRejected ? S.fail : S.tertiary,
              background: hideRejected ? `color-mix(in srgb, ${S.fail} 8%, transparent)` : "transparent",
              border: `1px solid ${hideRejected ? `color-mix(in srgb, ${S.fail} 30%, transparent)` : S.rim}`,
              padding: "3px 9px", cursor: "pointer", borderRadius: 2, marginRight: 4,
            }}>
            {hideRejected ? `SHOW REJECTED (${statusCounts.REJECTED ?? 0})` : `HIDE REJECTED (${statusCounts.REJECTED ?? 0})`}
          </button>
        )}
        <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search… (/ to focus · Esc to clear)" style={{ fontFamily: S.fontMono, fontSize: 11, padding: "3px 10px", background: S.bgSub, border: `1px solid ${S.rim}`, color: S.primary, outline: "none", width: 280 }} />
      </div>
      {selected.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 20px", background: `color-mix(in srgb, ${S.amber} 6%, ${S.bgPanel})`, borderBottom: `1px solid color-mix(in srgb, ${S.amber} 20%, ${S.soft})`, flexShrink: 0 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.amber, fontWeight: 700, letterSpacing: "0.06em" }}>{selected.size} SELECTED</span>
          <button
            onClick={() => setBulkAssignOpen(true)}
            style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", color: S.bgDeep, background: S.cyan, border: "none", padding: "3px 12px", cursor: "pointer", borderRadius: 2 }}>
            BULK ASSIGN POLICY
          </button>
          <button
            onClick={() => { setBulkRejectReason(''); setBulkRejectResult(null); setBulkRejectOpen(true); }}
            style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", color: "#fff", background: S.fail, border: "none", padding: "3px 12px", cursor: "pointer", borderRadius: 2 }}>
            BULK REJECT
          </button>
          <button onClick={() => setSelected(new Set())} style={{ fontFamily: S.fontMono, fontSize: 9, color: S.secondary, background: "transparent", border: `1px solid ${S.rim}`, padding: "2px 8px", cursor: "pointer", borderRadius: 2 }}>CLEAR</button>
          <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>{selected.size} position{selected.size !== 1 ? 's' : ''} selected</span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "32px 120px 140px 56px 80px 118px 86px 80px 56px 56px 1fr", padding: "5px 20px", background: S.bgSub, borderBottom: `1px solid ${S.soft}`, flexShrink: 0 }}>
        <div><input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} style={{ cursor: "pointer", accentColor: S.amber }} /></div>
        {["RECORD ID", "ENTITY", "CCY", "AMOUNT", "STATUS", "POLICY ID", "RUN ID", "VALUE DATE", "FLOW", "ACTIONS"].map((col) => (
          <span key={col} style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.08em", fontWeight: 700 }}>{col}</span>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading && <div style={{ padding: "40px 20px", fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, textAlign: "center" }}>Loading positions…</div>}
        {/* ERR-1: suppress "No positions found" when a load error is active — avoids misleading the operator */}
        {!loading && !listError && filteredPositions.length === 0 && (
          <div style={{ padding: "48px 20px", textAlign: "center" }}>
            <div style={{ fontFamily: S.fontUI, fontSize: 14, color: S.secondary, marginBottom: 6 }}>No positions found</div>
            <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
              {preset !== "ALL" ? `No positions with filter "${PRESET_LABELS[preset]}"` : "Import positions from the Ingestion Desk"}
            </div>
          </div>
        )}
        {filteredPositions.map((p, idx) => {
          const isLoading = lifecycleLoading === p.id;
          const isSelected = selected.has(p.id);
          const st = p.execution_status as ExecStatus;
          const cfg = STATUS_CONFIG[st];
          return (
            <div key={p.id} style={{ display: "grid", gridTemplateColumns: "32px 120px 140px 56px 80px 118px 86px 80px 56px 56px 1fr", padding: "7px 20px", borderBottom: `1px solid ${S.soft}`, background: isSelected ? `color-mix(in srgb, ${S.amber} 5%, ${S.bgPanel})` : idx % 2 === 0 ? "transparent" : `color-mix(in srgb, ${S.bgPanel} 40%, transparent)`, alignItems: "center", opacity: isLoading ? 0.6 : 1, transition: "background 0.1s, opacity 0.15s" }}>
              <div><input type="checkbox" checked={isSelected} onChange={() => toggleSelect(p.id)} style={{ cursor: "pointer", accentColor: S.amber }} /></div>
              <Tooltip tip={p.record_id}><span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.primary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{truncate(p.record_id, 14)}</span></Tooltip>
              <Tooltip tip={p.entity}><span style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{truncate(p.entity, 18)}</span></Tooltip>
              <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.cyan, fontWeight: 700 }}>{p.currency}</span>
              <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.primary, textAlign: "right", paddingRight: 8 }}>{fmtAmt(p.amount)}</span>
              <Tooltip tip={`${cfg.desc}

Next: ${cfg.nextStep}`}><div><StatusBadge status={st} /></div></Tooltip>
              <PolicyChip policyId={p.policy_id} />
              <RunIdChip runId={p.last_run_id} onCopy={handleCopyRun} />
              <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary }}>{fmtDate(p.value_date)}</span>
              <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: p.type === "AR" ? S.pass : S.amber }}>{p.type}</span>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                {st === "NEW" && (<>
                  <ActionBtn label="ASSIGN POLICY" color={S.cyan} onClick={() => openModal("assign-policy", p)} loading={isLoading} />
                  <ActionBtn label="REJECT" color={S.fail} onClick={() => openModal("reject", p)} loading={isLoading} />
                </>)}
                {st === "POLICY_ASSIGNED" && (<>
                  <ActionBtn label="RE-ASSIGN" color={S.secondary} onClick={() => openModal("assign-policy", p)} loading={isLoading} />
                  <ActionBtn label="REJECT" color={S.fail} onClick={() => openModal("reject", p)} loading={isLoading} />
                  <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, letterSpacing: "0.04em" }}>→ Execute on Execution Desk</span>
                </>)}
                {st === "READY_TO_EXECUTE" && (<>
                  <ActionBtn label="PROPOSE" color={S.pass} onClick={() => openModal("proposal-info", p)} loading={isLoading} />
                  <ActionBtn label="REJECT" color={S.fail} onClick={() => openModal("reject", p)} loading={isLoading} />
                </>)}
                {st === "HEDGED" && <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.06em" }}>{p.execution_ref ? `REF: ${truncate(p.execution_ref, 14)}` : "TERMINAL"}</span>}
                {st === "REJECTED" && (<>
                  <Tooltip tip={p.rejection_reason ? `Reason: ${p.rejection_reason}` : "No reason recorded"}>
                    <ActionBtn label="REOPEN" color={S.secondary} onClick={() => handleReopen(p)} loading={isLoading} />
                  </Tooltip>
                  <Tooltip tip="Permanently remove from active view (soft-delete). Audit trail preserved.">
                    <ActionBtn label="DELETE" color={S.fail} onClick={() => setDeleteConfirmId(p.id)} loading={false} />
                  </Tooltip>
                </>)}
                {/* Audit trail link */}
                <Link
                  href={`/lineage?position=${encodeURIComponent(p.id)}`}
                  title="View audit trail"
                  style={{
                    fontFamily:    S.fontMono,
                    fontSize:      9,
                    color:         S.tertiary,
                    textDecoration:"none",
                    padding:       "1px 3px",
                    opacity:       0.6,
                  }}
                >
                  ⟁
                </Link>
              </div>
            </div>
          );
        })}
      </div>
      <footer style={{ height: 28, flexShrink: 0, display: "flex", alignItems: "center", padding: "0 20px", gap: 16, background: S.bgPanel, borderTop: `1px solid ${S.rim}` }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.06em" }}>POSITION DESK · PHASE 1 · 4-EYES · WORM AUDIT</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>{filteredPositions.length}/{positions.length} shown</span>
        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.rim }}>/ = search · R = refresh · F = filter · Esc = clear</span>
      </footer>
      {modal.type === "assign-policy" && pos && (
        <ModalOverlay onClose={closeModal}>
          <ModalHeader title="Assign Policy" subtitle={`${pos.record_id} · ${pos.entity} (${pos.currency})`} />
          {/* Policy selector */}
          {(() => {
            // activeTemplateId: the template currently activated as an instance
            const activeTemplateId = activePolicyInstance?.template_id ?? null;
            // Helper: given template t, return the instance ID to assign (only valid for active template)
            const instanceIdFor = (t: PolicyTemplate): string | null =>
              activePolicyInstance && t.id === activeTemplateId ? activePolicyInstance.id : null;
            // selectedTemplate: template whose active instance ID matches policyId
            const selectedTemplate = policyId
              ? policyTemplates.find(t => instanceIdFor(t) === policyId) ?? null
              : null;

            const favTemplates   = policyTemplates.filter(t => favTemplateIds.has(t.id));
            const otherTemplates = policyTemplates.filter(t => !favTemplateIds.has(t.id));
            const query = policySearchQuery.toLowerCase();
            const filterFn = (t: PolicyTemplate) =>
              !query || t.name.toLowerCase().includes(query) || t.short_name.toLowerCase().includes(query);
            const filteredFavs   = favTemplates.filter(filterFn);
            const filteredOthers = otherTemplates.filter(filterFn);

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {recommendation && (recommendation.confidence === 'HIGH' || recommendation.confidence === 'MEDIUM') && (
                  <div style={{
                    padding: '8px 12px', marginBottom: 8,
                    border: `1px solid color-mix(in srgb, var(--accent-cyan,#22d3ee) 30%, transparent)`,
                    background: `color-mix(in srgb, var(--accent-cyan,#22d3ee) 4%, var(--bg-panel))`,
                  }}>
                    <div style={{
                      fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.5rem',
                      color: 'var(--accent-cyan,#22d3ee)', letterSpacing: '0.12em', marginBottom: 4,
                    }}>
                      BEST MATCH · {recommendation.confidence}
                    </div>
                    <div style={{
                      fontFamily: "'IBM Plex Sans',sans-serif", fontSize: '0.8125rem',
                      color: 'var(--text-primary)', fontWeight: 600, marginBottom: 2,
                    }}>
                      [{recommendation.shortName}] {recommendation.name}
                    </div>
                    <div style={{
                      fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.5625rem',
                      color: 'var(--text-tertiary)', marginBottom: 6,
                    }}>
                      {recommendation.reason}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPolicyId(recommendation.templateId)}
                      style={{
                        fontFamily: "'IBM Plex Mono',monospace", fontSize: '0.5625rem',
                        letterSpacing: '0.08em', padding: '3px 10px',
                        border: `1px solid var(--accent-cyan,#22d3ee)`,
                        color: 'var(--accent-cyan,#22d3ee)', background: 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      USE THIS POLICY
                    </button>
                  </div>
                )}
                <label style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary, display: 'block', marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
                  Policy Instance *
                  {!activePolicyInstance && policyTemplates.length > 0 && (
                    <span style={{ color: S.amber, marginLeft: 8, fontSize: '0.5625rem' }}>
                      NO ACTIVE POLICY — activate one on the Policies page first
                    </span>
                  )}
                </label>
                {/* Search */}
                <input
                  type="text"
                  value={policySearchQuery}
                  onChange={e => setPolicySearchQuery(e.target.value)}
                  placeholder="Search policies…"
                  style={{
                    fontFamily: S.fontUI, fontSize: '0.75rem', padding: '5px 10px',
                    border: `1px solid ${S.rim}`, background: S.bgSub,
                    color: S.primary, outline: 'none', width: '100%', boxSizing: 'border-box' as const,
                  }}
                />
                {/* Policy list */}
                <div style={{
                  maxHeight: 240, overflowY: 'auto' as const,
                  border: `1px solid ${S.rim}`, background: S.bgPanel,
                }}>
                  {/* FAVORITES section */}
                  {filteredFavs.length > 0 && (
                    <>
                      <div style={{
                        padding: '4px 10px', fontFamily: S.fontMono, fontSize: '0.4625rem',
                        color: S.amber, letterSpacing: '0.1em', borderBottom: `1px solid ${S.rim}`,
                        background: S.bgSub,
                      }}>
                        ★ FAVORITES
                      </div>
                      {filteredFavs.map(t => {
                        const instId = instanceIdFor(t);
                        return (
                          <PolicySelectorRow
                            key={t.id} tmpl={t}
                            isSelected={!!instId && policyId === instId}
                            isFavorite
                            isActive={t.id === activeTemplateId}
                            onSelect={() => { if (instId) setPolicyId(instId); }}
                          />
                        );
                      })}
                    </>
                  )}
                  {/* ALL POLICIES section */}
                  {filteredOthers.length > 0 && (
                    <>
                      <div style={{
                        padding: '4px 10px', fontFamily: S.fontMono, fontSize: '0.4625rem',
                        color: S.tertiary, letterSpacing: '0.1em', borderBottom: `1px solid ${S.rim}`,
                        background: S.bgSub,
                      }}>
                        ALL POLICIES
                      </div>
                      {filteredOthers.map(t => {
                        const instId = instanceIdFor(t);
                        return (
                          <PolicySelectorRow
                            key={t.id} tmpl={t}
                            isSelected={!!instId && policyId === instId}
                            isFavorite={false}
                            isActive={t.id === activeTemplateId}
                            onSelect={() => { if (instId) setPolicyId(instId); }}
                          />
                        );
                      })}
                    </>
                  )}
                  {filteredFavs.length === 0 && filteredOthers.length === 0 && (
                    <div style={{ padding: '20px', textAlign: 'center', fontFamily: S.fontMono,
                      fontSize: '0.5625rem', color: S.tertiary }}>
                      {policyTemplates.length === 0 ? 'LOADING…' : 'NO POLICIES MATCH'}
                    </div>
                  )}
                </div>
                {/* Selected policy display */}
                {policyId && (
                  <div style={{ fontFamily: S.fontMono, fontSize: '0.5625rem', color: S.cyan,
                    letterSpacing: '0.06em', padding: '3px 8px',
                    border: `1px solid color-mix(in srgb, ${S.cyan} 30%, transparent)` }}>
                    INSTANCE: {policyId.slice(0, 8).toUpperCase()}
                    {selectedTemplate && ` · ${selectedTemplate.short_name} · ${selectedTemplate.name}`}
                  </div>
                )}
              </div>
            );
          })()}
          <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginBottom: 8 }}>Transition: {pos.execution_status} → POLICY_ASSIGNED</div>
          {lifecycleError && <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.fail, marginBottom: 10, padding: "4px 8px", border: `1px solid ${S.fail}`, background: `color-mix(in srgb, ${S.fail} 8%, transparent)` }}>{lifecycleError}</div>}
          <ModalActions onCancel={closeModal} onConfirm={handleAssignPolicy} confirmLabel="ASSIGN POLICY" confirmColor={S.cyan} disabled={!policyId.trim() || isTransitioning} />
        </ModalOverlay>
      )}

      {/* Mark Ready modal removed — handled automatically by Execution Desk pipeline */}
      {modal.type === "proposal-info" && pos && (
        <ModalOverlay onClose={closeModal}>
          <ModalHeader title="4-Eyes Execution Proposal" subtitle={`${pos.record_id} · ${pos.entity} (${pos.currency})`} />
          <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.amber, padding: "8px 12px", border: `1px solid color-mix(in srgb, ${S.amber} 25%, transparent)`, background: `color-mix(in srgb, ${S.amber} 6%, transparent)`, marginBottom: 14, lineHeight: 1.7 }}>
            <strong>4-Eyes Workflow Required — Segregation of Duties</strong><br />
            Execution to HEDGED requires a formal approval chain:<br /><br />
            1 · Maker submits: POST /v1/proposals<br />
            2 · Different checker approves: PATCH /v1/proposals/:id/approve<br />
            3 · Checker executes: POST /v1/proposals/:id/execute<br /><br />
            SoD enforced at DB layer (approver ≠ proposer).<br />
            Proposal hash + approval hash chained for tamper evidence.
          </div>
          <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary, padding: "6px 10px", border: `1px solid ${S.rim}`, marginBottom: 14, lineHeight: 1.6 }}>
            Position ID: {pos.id}<br />
            Policy: {pos.policy_id ?? "—"}<br />
            Last Run: {pos.last_run_id ?? "—"}<br />
            Hedge Amount: {pos.hedge_amount != null ? fmtAmt(pos.hedge_amount) : "not set"}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={closeModal} style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary, background: "transparent", border: `1px solid ${S.rim}`, padding: "6px 14px", cursor: "pointer" }}>Close</button>
            <button onClick={() => { closeModal(); router.push("/hedge-desk"); }} style={{ fontFamily: S.fontMono, fontSize: 11, color: S.bgDeep, background: S.pass, border: "none", padding: "6px 14px", cursor: "pointer", fontWeight: 700, letterSpacing: "0.04em" }}>→ Execution Desk</button>
          </div>
        </ModalOverlay>
      )}
      {modal.type === "reject" && pos && (
        <ModalOverlay onClose={closeModal}>
          <ModalHeader title="Reject Position" subtitle={`${pos.record_id} · ${pos.entity} (${pos.currency})`} />
          <ModalInput
            label="Rejection Reason * (mandatory for audit)"
            value={rejectReason}
            onChange={setRejectReason}
            placeholder="e.g. Counterparty credit limit exceeded"
            error={rejectReason.length > 0 && rejectReason.trim().length < 5 ? "Minimum 5 characters required" : undefined}
          />
          <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginBottom: 8 }}>Transition: {pos.execution_status} → REJECTED (can be reopened)</div>
          {lifecycleError && <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.fail, marginBottom: 10, padding: "4px 8px", border: `1px solid ${S.fail}`, background: `color-mix(in srgb, ${S.fail} 8%, transparent)` }}>{lifecycleError}</div>}
          <ModalActions onCancel={closeModal} onConfirm={handleReject} confirmLabel="REJECT POSITION" confirmColor={S.fail} disabled={rejectReason.trim().length < 5 || isTransitioning} />
        </ModalOverlay>
      )}

      {/* ── Bulk Reject Modal ──────────────────────────────────────────────── */}
      {bulkRejectOpen && (() => {
        const posMap = new Map(positions.map((p) => [p.id, p]));
        const rejectableIds = Array.from(selected).filter((id) => {
          const p = posMap.get(id);
          return p && p.execution_status !== 'HEDGED' && p.execution_status !== 'REJECTED';
        });
        const skippedCount = selected.size - rejectableIds.length;
        return (
          <ModalOverlay onClose={() => { if (!bulkRejecting) { setBulkRejectOpen(false); setBulkRejectResult(null); } }}>
            <ModalHeader
              title="Bulk Reject Positions"
              subtitle={`${selected.size} selected · ${rejectableIds.length} rejectable · ${skippedCount} skipped (HEDGED/already REJECTED)`}
            />
            {!bulkRejectResult && (<>
              <ModalInput
                label="Rejection Reason * (mandatory for audit — applied to all positions)"
                value={bulkRejectReason}
                onChange={setBulkRejectReason}
                placeholder="e.g. Outside hedge policy window — defer to next cycle"
                error={bulkRejectReason.length > 0 && bulkRejectReason.trim().length < 5 ? "Minimum 5 characters required" : undefined}
              />
              <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginBottom: 12 }}>
                Transition: NEW / POLICY_ASSIGNED / READY_TO_EXECUTE → REJECTED (can be reopened individually)
              </div>
              {bulkRejecting && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary, marginBottom: 6, letterSpacing: '0.06em' }}>
                    REJECTING… {bulkRejectProgress}/{rejectableIds.length}
                  </div>
                  <div style={{ height: 4, background: S.bgSub, borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${rejectableIds.length > 0 ? (bulkRejectProgress / rejectableIds.length) * 100 : 0}%`, background: S.fail, transition: 'width 0.2s' }} />
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button
                  onClick={() => { if (!bulkRejecting) { setBulkRejectOpen(false); setBulkRejectResult(null); } }}
                  style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary, background: 'transparent', border: `1px solid ${S.rim}`, padding: '6px 14px', cursor: bulkRejecting ? 'not-allowed' : 'pointer' }}>
                  Cancel
                </button>
                <button
                  onClick={handleBulkReject}
                  disabled={bulkRejectReason.trim().length < 5 || bulkRejecting || rejectableIds.length === 0}
                  style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: '#fff', background: bulkRejectReason.trim().length < 5 || bulkRejecting || rejectableIds.length === 0 ? S.tertiary : S.fail, border: 'none', padding: '6px 14px', cursor: bulkRejectReason.trim().length < 5 || bulkRejecting || rejectableIds.length === 0 ? 'not-allowed' : 'pointer' }}>
                  {bulkRejecting ? `REJECTING ${bulkRejectProgress}/${rejectableIds.length}…` : `REJECT ${rejectableIds.length} POSITIONS`}
                </button>
              </div>
            </>)}
            {bulkRejectResult && (
              <div>
                <div style={{ padding: '10px 14px', border: `1px solid ${bulkRejectResult.failed > 0 ? S.fail : S.pass}`, background: `color-mix(in srgb, ${bulkRejectResult.failed > 0 ? S.fail : S.pass} 6%, transparent)`, marginBottom: 14 }}>
                  <div style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: bulkRejectResult.failed > 0 ? S.fail : S.pass, letterSpacing: '0.06em', marginBottom: 4 }}>
                    RESULT: {bulkRejectResult.rejected} REJECTED · {bulkRejectResult.skipped} SKIPPED · {bulkRejectResult.failed} FAILED
                  </div>
                  {bulkRejectResult.errors.length > 0 && (
                    <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.secondary, maxHeight: 80, overflowY: 'auto' }}>
                      {bulkRejectResult.errors.map((e, i) => <div key={i}>{e}</div>)}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => { setBulkRejectOpen(false); setBulkRejectResult(null); }}
                    style={{ fontFamily: S.fontMono, fontSize: 11, color: S.bgDeep, background: S.pass, border: 'none', padding: '6px 18px', cursor: 'pointer', fontWeight: 700 }}>
                    Done
                  </button>
                </div>
              </div>
            )}
          </ModalOverlay>
        );
      })()}

      {/* ── Delete Confirmation Modal ───────────────────────────────────────── */}
      {deleteConfirmId && (() => {
        const p = positions.find((x) => x.id === deleteConfirmId);
        if (!p) return null;
        return (
          <ModalOverlay onClose={() => { if (!deleteRunning) setDeleteConfirmId(null); }}>
            <ModalHeader title="Remove Position" subtitle={`${p.record_id} · ${p.entity} (${p.currency})`} />
            <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary, lineHeight: 1.6, marginBottom: 16 }}>
              This will <strong style={{ color: S.primary }}>permanently remove</strong> this position from the active view.<br />
              The position will be soft-deleted ({'"'}is_active = false{'"'}) — it cannot be recovered from the UI but remains in the database for audit compliance.<br /><br />
              <span style={{ color: S.tertiary }}>Rejection reason: {p.rejection_reason || '(none recorded)'}</span>
            </div>
            <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.amber, padding: '6px 10px', border: `1px solid color-mix(in srgb, ${S.amber} 30%, transparent)`, background: `color-mix(in srgb, ${S.amber} 6%, transparent)`, marginBottom: 16 }}>
              ⚠ WORM audit trail preserved. This action is irreversible via UI.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setDeleteConfirmId(null)} style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary, background: 'transparent', border: `1px solid ${S.rim}`, padding: '6px 14px', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleDeletePosition} disabled={deleteRunning}
                style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: '#fff', background: deleteRunning ? S.tertiary : S.fail, border: 'none', padding: '6px 14px', cursor: deleteRunning ? 'not-allowed' : 'pointer' }}>
                {deleteRunning ? 'REMOVING…' : 'CONFIRM DELETE'}
              </button>
            </div>
          </ModalOverlay>
        );
      })()}

      {/* ── Bulk Assign Policy Modal ────────────────────────────────────────── */}
      {bulkAssignOpen && (
        <ModalOverlay onClose={() => { if (!bulkRunning) setBulkAssignOpen(false); }}>
          <ModalHeader
            title="Bulk Assign Policy"
            subtitle={`Assign one policy to ${selected.size} selected position${selected.size !== 1 ? 's' : ''}`}
          />
          {(() => {
            const activeTemplateId = activePolicyInstance?.template_id ?? null;
            const instanceIdFor = (t: PolicyTemplate): string | null =>
              activePolicyInstance && t.id === activeTemplateId ? activePolicyInstance.id : null;
            const selectedTemplate = bulkPolicyId
              ? policyTemplates.find(t => instanceIdFor(t) === bulkPolicyId) ?? null
              : null;
            const bulkFavTemplates   = policyTemplates.filter(t => favTemplateIds.has(t.id));
            const bulkOtherTemplates = policyTemplates.filter(t => !favTemplateIds.has(t.id));
            const bq = bulkSearchQuery.toLowerCase();
            const filterFn = (t: PolicyTemplate) =>
              !bq || t.name.toLowerCase().includes(bq) || t.short_name.toLowerCase().includes(bq);
            const filteredBulkFavs   = bulkFavTemplates.filter(filterFn);
            const filteredBulkOthers = bulkOtherTemplates.filter(filterFn);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {!activePolicyInstance && policyTemplates.length > 0 && (
                  <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.amber, padding: '6px 10px', border: `1px solid color-mix(in srgb, ${S.amber} 30%, transparent)`, background: `color-mix(in srgb, ${S.amber} 6%, transparent)`, marginBottom: 4 }}>
                    ⚡ NO ACTIVE POLICY — activate one on the Policies page first
                  </div>
                )}
                <label style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary, display: 'block', marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
                  Select Policy Instance *
                </label>
                <input
                  type="text"
                  value={bulkSearchQuery}
                  onChange={e => setBulkSearchQuery(e.target.value)}
                  placeholder="Search policies…"
                  style={{ fontFamily: S.fontUI, fontSize: '0.75rem', padding: '5px 10px', border: `1px solid ${S.rim}`, background: S.bgSub, color: S.primary, outline: 'none', width: '100%', boxSizing: 'border-box' as const }}
                />
                <div style={{ maxHeight: 200, overflowY: 'auto' as const, border: `1px solid ${S.rim}`, background: S.bgPanel }}>
                  {filteredBulkFavs.length > 0 && (<>
                    <div style={{ padding: '4px 10px', fontFamily: S.fontMono, fontSize: '0.4625rem', color: S.amber, letterSpacing: '0.1em', borderBottom: `1px solid ${S.rim}`, background: S.bgSub }}>
                      ★ FAVORITES
                    </div>
                    {filteredBulkFavs.map(t => {
                      const instId = instanceIdFor(t);
                      return (
                        <PolicySelectorRow key={t.id} tmpl={t}
                          isSelected={!!instId && bulkPolicyId === instId}
                          isFavorite isActive={t.id === activeTemplateId}
                          onSelect={() => { if (instId) setBulkPolicyId(instId); }}
                        />
                      );
                    })}
                  </>)}
                  {filteredBulkOthers.length > 0 && (<>
                    <div style={{ padding: '4px 10px', fontFamily: S.fontMono, fontSize: '0.4625rem', color: S.tertiary, letterSpacing: '0.1em', borderBottom: `1px solid ${S.rim}`, background: S.bgSub }}>
                      ALL POLICIES
                    </div>
                    {filteredBulkOthers.map(t => {
                      const instId = instanceIdFor(t);
                      return (
                        <PolicySelectorRow key={t.id} tmpl={t}
                          isSelected={!!instId && bulkPolicyId === instId}
                          isFavorite={false} isActive={t.id === activeTemplateId}
                          onSelect={() => { if (instId) setBulkPolicyId(instId); }}
                        />
                      );
                    })}
                  </>)}
                  {filteredBulkFavs.length === 0 && filteredBulkOthers.length === 0 && (
                    <div style={{ padding: '20px', textAlign: 'center', fontFamily: S.fontMono, fontSize: '0.5625rem', color: S.tertiary }}>
                      {policyTemplates.length === 0 ? 'LOADING…' : 'NO POLICIES MATCH'}
                    </div>
                  )}
                </div>
                {bulkPolicyId && (
                  <div style={{ fontFamily: S.fontMono, fontSize: '0.5625rem', color: S.cyan, letterSpacing: '0.06em', padding: '3px 8px', border: `1px solid color-mix(in srgb, ${S.cyan} 30%, transparent)` }}>
                    INSTANCE: {bulkPolicyId.slice(0, 8).toUpperCase()}
                    {selectedTemplate && ` · ${selectedTemplate.short_name} · ${selectedTemplate.name}`}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Result display after run */}
          {bulkResult && (
            <div style={{ marginBottom: 14, padding: '8px 12px', border: `1px solid ${bulkResult.failed > 0 ? S.fail : S.pass}`, background: `color-mix(in srgb, ${bulkResult.failed > 0 ? S.fail : S.pass} 6%, transparent)` }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 10, color: bulkResult.failed > 0 ? S.fail : S.pass, fontWeight: 700, letterSpacing: '0.06em', marginBottom: 4 }}>
                RESULT: {bulkResult.assigned} ASSIGNED · {bulkResult.skipped} SKIPPED · {bulkResult.failed} FAILED
              </div>
              {bulkResult.errors.length > 0 && (
                <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.secondary, maxHeight: 80, overflowY: 'auto' as const }}>
                  {bulkResult.errors.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
            </div>
          )}

          <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginBottom: 8 }}>
            Transitions: NEW → POLICY_ASSIGNED (positions in later states are skipped)
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <button onClick={() => { if (!bulkRunning) setBulkAssignOpen(false); }}
              style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary, background: 'transparent', border: `1px solid ${S.rim}`, padding: '6px 14px', cursor: bulkRunning ? 'not-allowed' : 'pointer' }}>
              {bulkResult && bulkResult.assigned > 0 ? 'Done' : 'Cancel'}
            </button>
            {!bulkResult && (
              <button onClick={handleBulkAssign}
                disabled={!bulkPolicyId.trim() || bulkRunning}
                style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: S.bgDeep, background: !bulkPolicyId.trim() || bulkRunning ? S.tertiary : S.cyan, border: 'none', padding: '6px 14px', cursor: !bulkPolicyId.trim() || bulkRunning ? 'not-allowed' : 'pointer' }}>
                {bulkRunning ? `ASSIGNING ${selected.size}…` : `ASSIGN TO ${selected.size} POSITIONS`}
              </button>
            )}
          </div>
        </ModalOverlay>
      )}
    </div>
    <HelpPanelV2 module={POSITIONS_HELP} storageKey="position-desk" />
    </div>
  );
}
