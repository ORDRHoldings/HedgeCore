"use client";

/**
 * /position-desk — Position Control Tower
 *
 * Institutional exposure inventory and lifecycle management surface.
 * NOT a pipeline step — this is a persistent operational control surface.
 *
 * Features:
 *   - Readiness summary strip with KPI metrics
 *   - Status filter tabs with counts (including NEEDS_ACTION composite)
 *   - Sortable, dense data grid with sticky header + lifecycle row borders
 *   - Row expansion for detail context (IDs, hedge data, audit links)
 *   - Bulk assign / bulk reject with progress tracking
 *   - Keyboard shortcuts: / (search), F (filter cycle), R (refresh), Esc (clear)
 *   - Individual actions: ASSIGN POLICY, PROPOSE, REJECT, REOPEN, DELETE
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
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
import { ChevronDownIcon, ChevronUpIcon, ChevronsUpDownIcon,
  ChevronRightIcon, PlusIcon, UploadIcon, LayoutDashboard } from "lucide-react"
import AddPositionDrawer from "@/components/position/AddPositionDrawer";
import ImportCsvModal from "@/components/position/ImportCsvModal";

import { PageShell } from "@/components/layout/PageShell";

// ── Design tokens ────────────────────────────────────────────────────────────
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
  purple:    "#93C5FD",
  indigo:    "#818cf8",
} as const;

// ── Status config ────────────────────────────────────────────────────────────
type ExecStatus = "NEW" | "POLICY_ASSIGNED" | "READY_TO_EXECUTE" | "HEDGED" | "REJECTED";

const STATUS_CONFIG: Record<ExecStatus, { label: string; color: string; desc: string; nextStep: string; borderColor: string; priority: number }> = {
  NEW:              { label: "NEW",          color: S.tertiary, desc: "Awaiting policy assignment",                     nextStep: "Click ASSIGN POLICY to attach a hedge policy.",               borderColor: S.amber,   priority: 0 },
  POLICY_ASSIGNED:  { label: "POLICY ASGND", color: S.cyan,     desc: "Policy assigned, awaiting hedge calculation",     nextStep: "Run hedge engine, then click MARK READY with run ID.",        borderColor: S.cyan,    priority: 1 },
  READY_TO_EXECUTE: { label: "READY",        color: S.amber,    desc: "Run linked, awaiting 4-eyes execution proposal",  nextStep: "Click PROPOSE to start the 4-eyes approval workflow.",        borderColor: S.pass,    priority: 2 },
  HEDGED:           { label: "HEDGED",       color: S.pass,     desc: "Execution confirmed, terminal state",             nextStep: "No further action. Position is fully hedged.",               borderColor: S.pass,    priority: 3 },
  REJECTED:         { label: "REJECTED",     color: S.fail,     desc: "Rejected, can be reopened",                      nextStep: "Click REOPEN to return to NEW status.",                     borderColor: S.fail,    priority: 4 },
};

type FilterPreset = "ALL" | "NEW" | "POLICY_ASSIGNED" | "READY_TO_EXECUTE" | "HEDGED" | "REJECTED" | "NEEDS_ACTION";

const PRESET_LABELS: Record<FilterPreset, string> = {
  ALL: "ALL", NEW: "NEW", POLICY_ASSIGNED: "POLICY ASGND",
  READY_TO_EXECUTE: "READY", HEDGED: "HEDGED", REJECTED: "REJECTED",
  NEEDS_ACTION: "NEEDS ACTION",
};
const NEEDS_ACTION_STATUSES: ExecStatus[] = ["NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE"];

// ── Sort types ───────────────────────────────────────────────────────────────
type SortColumn = "status" | "record_id" | "entity" | "currency" | "amount" | "value_date";
type SortDir = "asc" | "desc";

// ── Types ────────────────────────────────────────────────────────────────────
type ModalType = "assign-policy" | "mark-ready" | "reject" | "proposal-info" | null;
interface ModalState { type: ModalType; position: PositionRow | null; }
interface BulkRejectResult { rejected: number; skipped: number; failed: number; errors: string[]; }

// ── Formatters ───────────────────────────────────────────────────────────────
function fmtAmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}
function fmtDate(s: string | null | undefined): string { return s ? s.slice(0, 10) : "—"; }
function truncate(s: string | null | undefined, max = 16): string {
  if (!s) return "—"; return s.length > max ? s.slice(0, max) + "…" : s;
}
function shortId(s: string | null | undefined): string { if (!s) return "—"; return s.slice(0, 8).toUpperCase(); }
function daysToMaturity(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / 86_400_000);
}

// ── Grid layout ──────────────────────────────────────────────────────────────
const GRID_COLS = "32px 100px 120px minmax(120px,1fr) 52px 100px 94px 80px 72px 1fr";

// ── Micro-components ─────────────────────────────────────────────────────────
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
          color: S.secondary, fontFamily: S.fontMono, fontSize: 12,
          padding: "5px 9px", borderRadius: 2, whiteSpace: "pre-wrap",
          maxWidth: 280, lineHeight: 1.5, pointerEvents: "none",
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
      fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
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
    <button onClick={onClick} disabled={disabled || loading} data-testid={`action-${label.toLowerCase().replace(/\s+/g, "-")}`} style={{
      fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
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
  if (!runId) return <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.rim }}>—</span>;
  return (
    <Tooltip tip={`Run: ${runId}\nClick to view audit trail`}>
      <Link
        href={`/run-viewer?id=${encodeURIComponent(runId)}`}
        onClick={() => onCopy?.(runId)}
        style={{
          fontFamily: S.fontMono, fontSize: 12, color: S.purple,
          background: `color-mix(in srgb, ${S.purple} 10%, transparent)`,
          border: `1px solid color-mix(in srgb, ${S.purple} 25%, transparent)`,
          padding: "1px 5px", borderRadius: 2, cursor: "pointer", letterSpacing: "0.04em",
          textDecoration: "none",
        }}>{shortId(runId)}</Link>
    </Tooltip>
  );
}

function PolicyChip({ policyId }: { policyId: string | null }) {
  if (!policyId) return <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.rim }}>—</span>;
  return (
    <Tooltip tip={`Policy ID: ${policyId}`}>
      <span style={{
        fontFamily: S.fontMono, fontSize: 12, color: S.cyan,
        background: `color-mix(in srgb, ${S.cyan} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${S.cyan} 20%, transparent)`,
        padding: "1px 5px", borderRadius: 2, letterSpacing: "0.04em",
      }}>{shortId(policyId)}</span>
    </Tooltip>
  );
}

// ── Sort header cell ─────────────────────────────────────────────────────────
function SortHeader({ label, column, activeColumn, activeDir, onSort, align }: {
  label: string; column: SortColumn;
  activeColumn: SortColumn | null; activeDir: SortDir;
  onSort: (col: SortColumn) => void;
  align?: "right";
}) {
  const isActive = activeColumn === column;
  return (
    <button
      onClick={() => onSort(column)}
      style={{
        display: "flex", alignItems: "center", gap: 3,
        fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
        color: isActive ? S.cyan : S.tertiary,
        background: "transparent", border: "none", cursor: "pointer",
        padding: "8px 4px", whiteSpace: "nowrap",
        justifyContent: align === "right" ? "flex-end" : "flex-start",
        width: "100%",
      }}
    >
      {label}
      {isActive ? (
        activeDir === "asc"
          ? <ChevronUpIcon size={10} color={S.cyan} />
          : <ChevronDownIcon size={10} color={S.cyan} />
      ) : (
        <ChevronsUpDownIcon size={10} color={S.tertiary} style={{ opacity: 0.4 }} />
      )}
    </button>
  );
}

// ── Modal components ─────────────────────────────────────────────────────────
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
      <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary, marginTop: 4 }}>{subtitle}</div>
    </div>
  );
}

function ModalInput({ label, value, onChange, placeholder, type = "text", error }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; error?: string;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontFamily: S.fontMono, fontSize: 12, color: error ? S.fail : S.secondary, display: "block", marginBottom: 4, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} data-testid={`modal-input-${label.replace(/[^a-zA-Z]/g, "").toLowerCase().slice(0, 20)}`} style={{ width: "100%", padding: "7px 10px", boxSizing: "border-box", background: S.bgSub, border: `1px solid ${error ? S.fail : S.rim}`, color: S.primary, fontFamily: S.fontMono, fontSize: 12, outline: "none" }} />
      {error && <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.fail, marginTop: 3 }}>{error}</div>}
    </div>
  );
}

function ModalActions({ onCancel, onConfirm, confirmLabel, confirmColor, disabled }: {
  onCancel: () => void; onConfirm: () => void; confirmLabel: string; confirmColor: string; disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
      <button onClick={onCancel} data-testid="modal-cancel" style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary, background: "transparent", border: `1px solid ${S.rim}`, padding: "6px 14px", cursor: "pointer" }}>Cancel</button>
      <button onClick={onConfirm} disabled={disabled} data-testid="modal-confirm" style={{ fontFamily: S.fontMono, fontSize: 12, color: S.bgDeep, background: disabled ? S.tertiary : confirmColor, border: "none", padding: "6px 14px", cursor: disabled ? "not-allowed" : "pointer", fontWeight: 700, letterSpacing: "0.04em" }}>{confirmLabel}</button>
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

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function PositionDeskPage() {
  const isMobile = useIsMobile();
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

  // Sort state
  const [sortCol, setSortCol]   = useState<SortColumn | null>(null);
  const [sortDir, setSortDir]   = useState<SortDir>("asc");

  // Expanded row
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

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
  const [deleteError, setDeleteError]                   = useState<string | null>(null);

  // Show/hide rejected toggle
  const [hideRejected, setHideRejected]                 = useState(false);

  // Add Position drawer + Import CSV modal
  const [showAdd, setShowAdd]       = useState(false);
  const [showImport, setShowImport] = useState(false);

  // ERR-1: track whether the operator dismissed the list-error banner
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
        case "Escape": setSearch(""); setSelected(new Set()); setExpandedRow(null); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, token, modal.type, preset]);

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filteredPositions = useMemo(() => {
    let rows = positions;
    if (preset === "NEEDS_ACTION") rows = rows.filter((p) => NEEDS_ACTION_STATUSES.includes(p.execution_status as ExecStatus));
    else if (preset !== "ALL") rows = rows.filter((p) => p.execution_status === preset);
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

  // ── Sorting ────────────────────────────────────────────────────────────────
  const sortedPositions = useMemo(() => {
    if (!sortCol) return filteredPositions;
    const sorted = [...filteredPositions];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortCol) {
        case "status":
          cmp = (STATUS_CONFIG[a.execution_status as ExecStatus]?.priority ?? 99)
              - (STATUS_CONFIG[b.execution_status as ExecStatus]?.priority ?? 99);
          break;
        case "record_id":
          cmp = (a.record_id ?? "").localeCompare(b.record_id ?? "");
          break;
        case "entity":
          cmp = (a.entity ?? "").localeCompare(b.entity ?? "");
          break;
        case "currency":
          cmp = (a.currency ?? "").localeCompare(b.currency ?? "");
          break;
        case "amount":
          cmp = (a.amount ?? 0) - (b.amount ?? 0);
          break;
        case "value_date":
          cmp = (a.value_date ?? "").localeCompare(b.value_date ?? "");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [filteredPositions, sortCol, sortDir]);

  const handleSort = useCallback((col: SortColumn) => {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }, [sortCol]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { ALL: positions.length };
    for (const st of ["NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE", "HEDGED", "REJECTED"] as ExecStatus[])
      c[st] = positions.filter((p) => p.execution_status === st).length;
    c.NEEDS_ACTION = positions.filter((p) => NEEDS_ACTION_STATUSES.includes(p.execution_status as ExecStatus)).length;
    return c;
  }, [positions]);

  // ── Readiness KPIs ─────────────────────────────────────────────────────────
  const totalExposure = useMemo(() =>
    positions.reduce((sum, p) => sum + (p.amount ?? 0), 0),
    [positions],
  );

  // ── Handlers ───────────────────────────────────────────────────────────────
  const openModal = useCallback((type: ModalType, position: PositionRow) => {
    setModal({ type, position });
    setPolicyId(position.policy_id ?? "");
    setRunId(position.last_run_id ?? "");
    setHedgeAmount(position.hedge_amount?.toString() ?? "");
    setHedgeRate(position.hedge_rate?.toString() ?? "");
    setRejectReason("");
    setPolicySearchQuery("");
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
    if (r.meta.requestStatus === "fulfilled") { closeModal(); router.push("/hedge-desk"); }
  }, [dispatch, modal.position, policyId, token, closeModal, router]);

  const handleMarkReady = useCallback(async () => {
    if (!modal.position || !runId.trim() || !token) return;
    const r = await dispatch(markReadyThunk({
      id: modal.position.id, runId: runId.trim(),
      hedgeAmount: hedgeAmount ? parseFloat(hedgeAmount) : undefined,
      hedgeRate: hedgeRate ? parseFloat(hedgeRate) : undefined, token,
    }));
    if (r.meta.requestStatus === "fulfilled") {
      closeModal();
      dispatch(listPositionsThunk({ token }));
    }
  }, [dispatch, modal.position, runId, hedgeAmount, hedgeRate, token, closeModal]);

  const handleReject = useCallback(async () => {
    if (!modal.position || !rejectReason.trim() || !token) return;
    const r = await dispatch(rejectPositionThunk({ id: modal.position.id, reason: rejectReason.trim(), token }));
    if (r.meta.requestStatus === "fulfilled") {
      closeModal();
      dispatch(listPositionsThunk({ token }));
    }
  }, [dispatch, modal.position, rejectReason, token, closeModal]);

  const handleReopen = useCallback(async (p: PositionRow) => {
    if (!token) return;
    const r = await dispatch(reopenPositionThunk({ id: p.id, token }));
    if (r.meta.requestStatus === "fulfilled") {
      dispatch(listPositionsThunk({ token }));
    }
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
    setDeleteError(null);
    try {
      await deletePosition(deleteConfirmId, token);
      dispatch(listPositionsThunk({ token }));
      setDeleteConfirmId(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDeleteError(msg || "Delete failed. You may lack the trades.delete permission.");
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

  // ═════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: S.bgDeep, overflow: "hidden", flex: 1 }}>

      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <header style={{
        display: "flex", alignItems: "center", gap: 12, height: 44, flexShrink: 0,
        padding: "0 20px", background: S.bgPanel, borderBottom: `1px solid ${S.rim}`,
      }}>
        <span style={{ fontFamily: S.fontUI, fontSize: 14, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: S.primary }}>
          Position Desk
        </span>
        <span style={{
          fontFamily: S.fontMono, fontSize: 12, color: S.cyan,
          border: `1px solid color-mix(in srgb, ${S.cyan} 30%, transparent)`,
          background: `color-mix(in srgb, ${S.cyan} 6%, transparent)`,
          padding: "1px 6px", letterSpacing: "0.08em",
        }}>CONTROL TOWER</span>
        {needsActionCount > 0 && (
          <span onClick={() => setPreset("NEEDS_ACTION")} style={{
            fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
            color: S.amber,
            background: `color-mix(in srgb, ${S.amber} 10%, transparent)`,
            border: `1px solid color-mix(in srgb, ${S.amber} 30%, transparent)`,
            padding: "1px 7px", borderRadius: 2, cursor: "pointer", letterSpacing: "0.06em",
          }}>
            {needsActionCount} NEEDS ACTION
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
          {positions.length} position{positions.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={() => setShowAdd(true)}
          title="Add a single position"
          style={{
            fontFamily: S.fontMono, fontSize: 12, color: S.cyan,
            background: `color-mix(in srgb, ${S.cyan} 8%, transparent)`,
            border: `1px solid color-mix(in srgb, ${S.cyan} 30%, transparent)`,
            padding: "2px 8px", cursor: "pointer", letterSpacing: "0.04em",
            display: "flex", alignItems: "center", gap: 4,
          }}
        ><PlusIcon size={10} />ADD POSITION</button>
        <button
          onClick={() => setShowImport(true)}
          title="Bulk CSV Import"
          style={{
            fontFamily: S.fontMono, fontSize: 12, color: S.amber,
            background: `color-mix(in srgb, ${S.amber} 8%, transparent)`,
            border: `1px solid color-mix(in srgb, ${S.amber} 30%, transparent)`,
            padding: "2px 8px", cursor: "pointer", letterSpacing: "0.04em",
            display: "flex", alignItems: "center", gap: 4,
          }}
        ><UploadIcon size={10} />IMPORT CSV</button>
        <button
          onClick={() => token && dispatch(listPositionsThunk({ token }))}
          title="Refresh (R)"
          style={{
            fontFamily: S.fontMono, fontSize: 12, color: S.cyan,
            background: "transparent",
            border: `1px solid color-mix(in srgb, ${S.cyan} 30%, transparent)`,
            padding: "2px 8px", cursor: "pointer",
          }}
        >REFRESH</button>
      </header>

      {/* ── Readiness Summary Strip ─────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 0, flexShrink: 0,
        borderBottom: `1px solid ${S.rim}`,
        background: S.bgSub,
      }}>
        {([
          ["TOTAL EXPOSURE", fmtAmt(totalExposure), S.primary],
          ["POSITIONS", String(positions.length), S.primary],
          ["NEEDS ACTION", String(needsActionCount), needsActionCount > 0 ? S.amber : S.tertiary],
          ["READY", String(statusCounts.READY_TO_EXECUTE ?? 0), (statusCounts.READY_TO_EXECUTE ?? 0) > 0 ? S.pass : S.tertiary],
          ["HEDGED", String(statusCounts.HEDGED ?? 0), (statusCounts.HEDGED ?? 0) > 0 ? S.pass : S.tertiary],
          ["REJECTED", String(statusCounts.REJECTED ?? 0), (statusCounts.REJECTED ?? 0) > 0 ? S.fail : S.tertiary],
        ] as const).map(([label, value, color], idx) => (
          <div key={label} style={{
            padding: "8px 16px",
            borderRight: idx < 5 ? `1px solid ${S.soft}` : "none",
            minWidth: 0,
          }}>
            <div style={{ fontFamily: S.fontMono, fontSize: 12, letterSpacing: "0.1em", color: S.tertiary, marginBottom: 2, whiteSpace: "nowrap" }}>
              {label}
            </div>
            <div style={{ fontFamily: S.fontMono, fontSize: 14, fontWeight: 700, color }}>
              {value}
            </div>
          </div>
        ))}
        <div style={{ flex: 1 }} />
      </div>

      {/* ── Error banners ───────────────────────────────────────────────────── */}
      {lifecycleError && (
        <div style={{ background: `color-mix(in srgb, ${S.fail} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${S.fail} 25%, transparent)`, borderLeft: `3px solid ${S.fail}`, padding: "7px 20px", flexShrink: 0, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.fail, letterSpacing: "0.06em" }}>TRANSITION ERROR</span>
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>{lifecycleError}</span>
          <button onClick={() => dispatch(clearLifecycleError())} style={{ marginLeft: "auto", fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, background: "none", border: "none", cursor: "pointer" }}>✕</button>
        </div>
      )}
      {listError && !errorDismissed && (
        <div role="alert" aria-live="assertive" style={{
          background: `color-mix(in srgb, ${S.amber} 7%, ${S.bgPanel})`,
          border: `1px solid color-mix(in srgb, ${S.amber} 30%, transparent)`,
          borderLeft: `3px solid ${S.amber}`,
          padding: "10px 20px", flexShrink: 0,
          display: "flex", alignItems: "flex-start", gap: 14,
        }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 14, color: S.amber, lineHeight: 1, marginTop: 1 }}>!</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.amber, letterSpacing: "0.06em", marginBottom: 2 }}>
              POSITIONS UNAVAILABLE
            </div>
            <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, marginBottom: 4 }}>
              Could not load positions from server. Retry or check connectivity.
            </div>
            <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.03em" }}>
              Detail: {listError}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, paddingTop: 2 }}>
            <button
              onClick={() => { dispatch(clearListError()); if (token) dispatch(listPositionsThunk({ token })); }}
              disabled={loading}
              style={{
                fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                color: S.bgDeep, background: loading ? S.tertiary : S.amber,
                border: "none", padding: "4px 12px", cursor: loading ? "not-allowed" : "pointer",
                borderRadius: 2, opacity: loading ? 0.6 : 1,
              }}>
              {loading ? "Retrying…" : "RETRY"}
            </button>
            <button
              onClick={() => setErrorDismissed(true)}
              title="Dismiss"
              style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }}>
              ✕
            </button>
          </div>
        </div>
      )}
      {copiedRun && (
        <div style={{ background: `color-mix(in srgb, ${S.purple} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${S.purple} 25%, transparent)`, padding: "5px 20px", flexShrink: 0, fontFamily: S.fontMono, fontSize: 12, color: S.purple }}>
          Run ID copied: {copiedRun}
        </div>
      )}

      {/* ── Filter + Search Bar ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "5px 20px", background: S.bgPanel, borderBottom: `1px solid ${S.soft}`, flexShrink: 0, flexWrap: "wrap" }}>
        {(["ALL", "NEEDS_ACTION", "NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE", "HEDGED", "REJECTED"] as FilterPreset[]).map((p) => {
          const isActive = preset === p;
          const color = p === "NEEDS_ACTION" ? S.amber : p === "ALL" ? S.secondary : p === "HEDGED" ? S.pass : p === "REJECTED" ? S.fail : STATUS_CONFIG[p as ExecStatus]?.color ?? S.secondary;
          const count = statusCounts[p] ?? 0;
          return (
            <button key={p} onClick={() => setPreset(p)} style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: isActive ? color : S.tertiary, background: isActive ? `color-mix(in srgb, ${color} 12%, transparent)` : "transparent", border: `1px solid ${isActive ? `color-mix(in srgb, ${color} 35%, transparent)` : S.rim}`, padding: "3px 9px", cursor: "pointer", borderRadius: 2, transition: "all 0.1s" }}>
              {PRESET_LABELS[p]} ({count})
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        {preset === "ALL" && (statusCounts.REJECTED ?? 0) > 0 && (
          <button
            onClick={() => setHideRejected(h => !h)}
            style={{
              fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
              color: hideRejected ? S.fail : S.tertiary,
              background: hideRejected ? `color-mix(in srgb, ${S.fail} 8%, transparent)` : "transparent",
              border: `1px solid ${hideRejected ? `color-mix(in srgb, ${S.fail} 30%, transparent)` : S.rim}`,
              padding: "3px 9px", cursor: "pointer", borderRadius: 2, marginRight: 4,
            }}>
            {hideRejected ? `SHOW REJECTED (${statusCounts.REJECTED ?? 0})` : `HIDE REJECTED (${statusCounts.REJECTED ?? 0})`}
          </button>
        )}
        <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search… (/ to focus)" style={{ fontFamily: S.fontMono, fontSize: 12, padding: "3px 10px", background: S.bgSub, border: `1px solid ${S.rim}`, color: S.primary, outline: "none", width: 240 }} />
      </div>

      {/* ── Bulk Actions Bar ────────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 20px", background: `color-mix(in srgb, ${S.amber} 6%, ${S.bgPanel})`, borderBottom: `1px solid color-mix(in srgb, ${S.amber} 20%, ${S.soft})`, flexShrink: 0 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.amber, fontWeight: 700, letterSpacing: "0.06em" }}>{selected.size} SELECTED</span>
          <button
            onClick={() => setBulkAssignOpen(true)}
            style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: S.bgDeep, background: S.cyan, border: "none", padding: "3px 12px", cursor: "pointer", borderRadius: 2 }}>
            BULK ASSIGN POLICY
          </button>
          <button
            onClick={() => { setBulkRejectReason(''); setBulkRejectResult(null); setBulkRejectOpen(true); }}
            style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "#fff", background: S.fail, border: "none", padding: "3px 12px", cursor: "pointer", borderRadius: 2 }}>
            BULK REJECT
          </button>
          <button onClick={() => setSelected(new Set())} style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary, background: "transparent", border: `1px solid ${S.rim}`, padding: "2px 8px", cursor: "pointer", borderRadius: 2 }}>CLEAR</button>
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{selected.size} position{selected.size !== 1 ? 's' : ''} selected</span>
        </div>
      )}

      {/* ── Table Header (sticky) ───────────────────────────────────────────── */}
      <div style={{
        display: "grid", gridTemplateColumns: isMobile ? "32px 80px 80px minmax(100px,1fr) 40px 80px 80px 60px 60px 1fr" : GRID_COLS, padding: "0 20px",
        background: S.bgDeep, borderBottom: `2px solid ${S.rim}`, flexShrink: 0,
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", padding: "8px 0" }}>
          <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} style={{ cursor: "pointer", accentColor: S.amber }} />
        </div>
        <SortHeader label="STATUS" column="status" activeColumn={sortCol} activeDir={sortDir} onSort={handleSort} />
        <SortHeader label="RECORD ID" column="record_id" activeColumn={sortCol} activeDir={sortDir} onSort={handleSort} />
        <SortHeader label="ENTITY" column="entity" activeColumn={sortCol} activeDir={sortDir} onSort={handleSort} />
        <SortHeader label="CCY" column="currency" activeColumn={sortCol} activeDir={sortDir} onSort={handleSort} />
        <SortHeader label="EXPOSURE" column="amount" activeColumn={sortCol} activeDir={sortDir} onSort={handleSort} align="right" />
        <SortHeader label="VALUE DATE" column="value_date" activeColumn={sortCol} activeDir={sortDir} onSort={handleSort} />
        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.08em", fontWeight: 700, padding: "8px 4px" }}>POLICY</span>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.08em", fontWeight: 700, padding: "8px 4px" }}>RUN</span>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.08em", fontWeight: 700, padding: "8px 4px" }}>ACTIONS</span>
      </div>

      {/* ── Table Body ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading && <div style={{ padding: "40px 20px", fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, textAlign: "center" }}>Loading positions…</div>}
        {!loading && !listError && filteredPositions.length === 0 && (
          <div style={{ padding: "48px 20px", textAlign: "center" }}>
            <div style={{ fontFamily: S.fontUI, fontSize: 14, color: S.secondary, marginBottom: 6 }}>No positions found</div>
            <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
              {preset !== "ALL" ? `No positions with filter "${PRESET_LABELS[preset]}"` : "Import positions from the Ingestion Desk or create manually"}
            </div>
          </div>
        )}
        {sortedPositions.map((p, idx) => {
          const isLoading = lifecycleLoading === p.id;
          const isSelected = selected.has(p.id);
          const isExpanded = expandedRow === p.id;
          const st = p.execution_status as ExecStatus;
          const cfg = STATUS_CONFIG[st];
          const dtm = daysToMaturity(p.value_date);
          const isTerminal = st === "HEDGED" || st === "REJECTED";

          return (
            <div key={p.id} data-testid={`position-row-${st.toLowerCase()}`} data-position-id={p.id} data-status={st}>
              {/* Main row */}
              <div
                onClick={() => setExpandedRow(isExpanded ? null : p.id)}
                style={{
                  display: "grid", gridTemplateColumns: isMobile ? "32px 80px 80px minmax(100px,1fr) 40px 80px 80px 60px 60px 1fr" : GRID_COLS, padding: "0 20px",
                  borderBottom: isExpanded ? "none" : `1px solid ${S.soft}`,
                  borderLeft: `3px solid ${cfg.borderColor}`,
                  background: isSelected
                    ? `color-mix(in srgb, ${S.amber} 5%, ${S.bgPanel})`
                    : idx % 2 === 0 ? S.bgPanel : `color-mix(in srgb, ${S.bgSub} 40%, ${S.bgPanel})`,
                  alignItems: "center",
                  opacity: isLoading ? 0.6 : isTerminal ? 0.7 : 1,
                  transition: "background 0.1s, opacity 0.15s",
                  cursor: "pointer",
                  minHeight: 36,
                }}
              >
                {/* Checkbox */}
                <div onClick={e => e.stopPropagation()} style={{ padding: "6px 0" }}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(p.id)} style={{ cursor: "pointer", accentColor: S.amber }} />
                </div>

                {/* Status */}
                <Tooltip tip={`${cfg.desc}\n\nNext: ${cfg.nextStep}`}>
                  <div style={{ padding: "6px 4px" }}><StatusBadge status={st} /></div>
                </Tooltip>

                {/* Record ID */}
                <Tooltip tip={p.record_id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 4px" }}>
                    <ChevronRightIcon size={10} color={S.tertiary} style={{ flexShrink: 0, transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }} />
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.primary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{truncate(p.record_id, 12)}</span>
                  </div>
                </Tooltip>

                {/* Entity */}
                <Tooltip tip={p.entity}>
                  <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "6px 4px", display: "block" }}>{truncate(p.entity, 20)}</span>
                </Tooltip>

                {/* Currency */}
                <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.cyan, fontWeight: 700, padding: "6px 4px" }}>{p.currency}</span>

                {/* Exposure (amount) */}
                <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.primary, textAlign: "right", padding: "6px 8px 6px 4px" }}>{fmtAmt(p.amount)}</span>

                {/* Value Date + days to maturity */}
                <div style={{ padding: "6px 4px" }}>
                  <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>{fmtDate(p.value_date)}</div>
                  {dtm !== null && (
                    <div style={{
                      fontFamily: S.fontMono, fontSize: 12,
                      color: dtm <= 7 ? S.fail : dtm <= 30 ? S.amber : S.tertiary,
                      marginTop: 1,
                    }}>
                      {dtm < 0 ? `${Math.abs(dtm)}d past` : dtm === 0 ? "TODAY" : `${dtm}d`}
                    </div>
                  )}
                </div>

                {/* Policy */}
                <div style={{ padding: "6px 4px" }}><PolicyChip policyId={p.policy_id} /></div>

                {/* Run */}
                <div style={{ padding: "6px 4px" }} onClick={e => e.stopPropagation()}><RunIdChip runId={p.last_run_id} onCopy={handleCopyRun} /></div>

                {/* Actions */}
                <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", padding: "4px" }}>
                  {st === "NEW" && (<>
                    <ActionBtn label="ASSIGN POLICY" color={S.cyan} onClick={() => openModal("assign-policy", p)} loading={isLoading} />
                    <ActionBtn label="REJECT" color={S.fail} onClick={() => openModal("reject", p)} loading={isLoading} />
                  </>)}
                  {st === "POLICY_ASSIGNED" && (<>
                    <ActionBtn label="RE-ASSIGN" color={S.secondary} onClick={() => openModal("assign-policy", p)} loading={isLoading} />
                    <ActionBtn label="REJECT" color={S.fail} onClick={() => openModal("reject", p)} loading={isLoading} />
                  </>)}
                  {st === "READY_TO_EXECUTE" && (<>
                    <ActionBtn label="PROPOSE" color={S.pass} onClick={() => openModal("proposal-info", p)} loading={isLoading} />
                    <ActionBtn label="REJECT" color={S.fail} onClick={() => openModal("reject", p)} loading={isLoading} />
                  </>)}
                  {st === "HEDGED" && <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.06em" }}>{p.execution_ref ? `REF: ${truncate(p.execution_ref, 12)}` : "TERMINAL"}</span>}
                  {st === "REJECTED" && (<>
                    <Tooltip tip={p.rejection_reason ? `Reason: ${p.rejection_reason}` : "No reason recorded"}>
                      <ActionBtn label="REOPEN" color={S.secondary} onClick={() => handleReopen(p)} loading={isLoading} />
                    </Tooltip>
                    <Tooltip tip="Permanently remove from active view (soft-delete). Audit trail preserved.">
                      <ActionBtn label="DELETE" color={S.fail} onClick={() => setDeleteConfirmId(p.id)} loading={false} />
                    </Tooltip>
                  </>)}
                  <Link
                    href={`/lineage?position=${encodeURIComponent(p.id)}`}
                    title="View audit trail"
                    style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, textDecoration: "none", padding: "1px 3px", opacity: 0.6 }}
                  >
                    ⟁
                  </Link>
                </div>
              </div>

              {/* ── Expanded row detail ─────────────────────────────────────── */}
              {isExpanded && (
                <div data-testid="detail-panel" style={{
                  padding: "10px 20px 10px 35px",
                  background: `color-mix(in srgb, ${S.cyan} 3%, ${S.bgSub})`,
                  borderBottom: `1px solid ${S.soft}`,
                  borderLeft: `3px solid ${cfg.borderColor}`,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr 1fr",
                  gap: "8px 24px",
                }}>
                  <div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.08em", marginBottom: 2 }}>POSITION ID</div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary, wordBreak: "break-all" }}>{p.id}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.08em", marginBottom: 2 }}>ENTITY</div>
                    <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.primary }}>{p.entity || "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.08em", marginBottom: 2 }}>FLOW TYPE</div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: p.type === "AR" ? S.pass : S.amber }}>{p.type || "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.08em", marginBottom: 2 }}>RECORD ID</div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>{p.record_id}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.08em", marginBottom: 2 }}>HEDGE AMOUNT</div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.primary }}>{p.hedge_amount != null ? fmtAmt(p.hedge_amount) : "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.08em", marginBottom: 2 }}>HEDGE RATE</div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.primary }}>{p.hedge_rate != null ? p.hedge_rate.toFixed(4) : "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.08em", marginBottom: 2 }}>EXECUTION REF</div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>{p.execution_ref || "—"}</div>
                  </div>
                  {st === "REJECTED" && p.rejection_reason && (
                    <div>
                      <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.fail, letterSpacing: "0.08em", marginBottom: 2 }}>REJECTION REASON</div>
                      <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>{p.rejection_reason}</div>
                    </div>
                  )}
                  <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, paddingTop: 4 }}>
                    <Link
                      href={`/lineage?position=${encodeURIComponent(p.id)}`}
                      style={{
                        fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                        color: S.cyan, textDecoration: "none",
                        border: `1px solid color-mix(in srgb, ${S.cyan} 30%, transparent)`,
                        padding: "2px 8px", borderRadius: 2,
                      }}
                    >
                      VIEW AUDIT TRAIL
                    </Link>
                    {p.last_run_id && (
                      <Link
                        href={`/run-viewer?id=${encodeURIComponent(p.last_run_id)}`}
                        style={{
                          fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                          color: S.purple, textDecoration: "none",
                          border: `1px solid color-mix(in srgb, ${S.purple} 30%, transparent)`,
                          padding: "2px 8px", borderRadius: 2,
                        }}
                      >
                        VIEW RUN
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer style={{
        height: 28, flexShrink: 0, display: "flex", alignItems: "center",
        padding: "0 20px", gap: 16,
        background: S.bgPanel, borderTop: `1px solid ${S.rim}`,
      }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.06em" }}>
          POSITION DESK · 4-EYES · WORM AUDIT
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{filteredPositions.length}/{positions.length} shown</span>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.rim }}>/ search · R refresh · F filter · Esc clear</span>
      </footer>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODALS                                                                 */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      {/* ── Assign Policy Modal ─────────────────────────────────────────────── */}
      {modal.type === "assign-policy" && pos && (
        <ModalOverlay onClose={closeModal}>
          <ModalHeader title="Assign Policy" subtitle={`${pos.record_id} · ${pos.entity} (${pos.currency})`} />
          {(() => {
            const activeTemplateId = activePolicyInstance?.template_id ?? null;
            const instanceIdFor = (t: PolicyTemplate): string | null =>
              activePolicyInstance && t.id === activeTemplateId ? activePolicyInstance.id : null;
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
                    <div style={{ fontFamily: S.fontMono, fontSize: '0.5rem', color: S.cyan, letterSpacing: '0.12em', marginBottom: 4 }}>
                      BEST MATCH · {recommendation.confidence}
                    </div>
                    <div style={{ fontFamily: S.fontUI, fontSize: '0.8125rem', color: S.primary, fontWeight: 600, marginBottom: 2 }}>
                      [{recommendation.shortName}] {recommendation.name}
                    </div>
                    <div style={{ fontFamily: S.fontMono, fontSize: '0.5625rem', color: S.tertiary, marginBottom: 6 }}>
                      {recommendation.reason}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPolicyId(recommendation.templateId)}
                      style={{
                        fontFamily: S.fontMono, fontSize: '0.5625rem', letterSpacing: '0.08em', padding: '3px 10px',
                        border: `1px solid ${S.cyan}`, color: S.cyan, background: 'transparent', cursor: 'pointer',
                      }}
                    >
                      USE THIS POLICY
                    </button>
                  </div>
                )}
                <label style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary, display: 'block', marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
                  Policy Instance *
                  {!activePolicyInstance && policyTemplates.length > 0 && (
                    <span style={{ color: S.amber, marginLeft: 8, fontSize: '0.5625rem' }}>
                      NO ACTIVE POLICY — activate one on the Policies page first
                    </span>
                  )}
                </label>
                <input
                  type="text" value={policySearchQuery} onChange={e => setPolicySearchQuery(e.target.value)}
                  placeholder="Search policies…"
                  style={{ fontFamily: S.fontUI, fontSize: '0.75rem', padding: '5px 10px', border: `1px solid ${S.rim}`, background: S.bgSub, color: S.primary, outline: 'none', width: '100%', boxSizing: 'border-box' as const }}
                />
                <div style={{ maxHeight: 240, overflowY: 'auto' as const, border: `1px solid ${S.rim}`, background: S.bgPanel }}>
                  {filteredFavs.length > 0 && (<>
                    <div style={{ padding: '4px 10px', fontFamily: S.fontMono, fontSize: '0.4625rem', color: S.amber, letterSpacing: '0.1em', borderBottom: `1px solid ${S.rim}`, background: S.bgSub }}>
                      ★ FAVORITES
                    </div>
                    {filteredFavs.map(t => {
                      const instId = instanceIdFor(t);
                      return (
                        <PolicySelectorRow key={t.id} tmpl={t}
                          isSelected={!!instId && policyId === instId} isFavorite isActive={t.id === activeTemplateId}
                          onSelect={() => { if (instId) setPolicyId(instId); }}
                        />
                      );
                    })}
                  </>)}
                  {filteredOthers.length > 0 && (<>
                    <div style={{ padding: '4px 10px', fontFamily: S.fontMono, fontSize: '0.4625rem', color: S.tertiary, letterSpacing: '0.1em', borderBottom: `1px solid ${S.rim}`, background: S.bgSub }}>
                      ALL POLICIES
                    </div>
                    {filteredOthers.map(t => {
                      const instId = instanceIdFor(t);
                      return (
                        <PolicySelectorRow key={t.id} tmpl={t}
                          isSelected={!!instId && policyId === instId} isFavorite={false} isActive={t.id === activeTemplateId}
                          onSelect={() => { if (instId) setPolicyId(instId); }}
                        />
                      );
                    })}
                  </>)}
                  {filteredFavs.length === 0 && filteredOthers.length === 0 && (
                    <div style={{ padding: '20px', textAlign: 'center', fontFamily: S.fontMono, fontSize: '0.5625rem', color: S.tertiary }}>
                      {policyTemplates.length === 0 ? 'LOADING…' : 'NO POLICIES MATCH'}
                    </div>
                  )}
                </div>
                {policyId && (
                  <div style={{ fontFamily: S.fontMono, fontSize: '0.5625rem', color: S.cyan, letterSpacing: '0.06em', padding: '3px 8px', border: `1px solid color-mix(in srgb, ${S.cyan} 30%, transparent)` }}>
                    INSTANCE: {policyId.slice(0, 8).toUpperCase()}
                    {selectedTemplate && ` · ${selectedTemplate.short_name} · ${selectedTemplate.name}`}
                  </div>
                )}
              </div>
            );
          })()}
          <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginBottom: 8 }}>Transition: {pos.execution_status} → POLICY_ASSIGNED</div>
          {lifecycleError && <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.fail, marginBottom: 10, padding: "4px 8px", border: `1px solid ${S.fail}`, background: `color-mix(in srgb, ${S.fail} 8%, transparent)` }}>{lifecycleError}</div>}
          <ModalActions onCancel={closeModal} onConfirm={handleAssignPolicy} confirmLabel="ASSIGN POLICY" confirmColor={S.cyan} disabled={!policyId.trim() || isTransitioning} />
        </ModalOverlay>
      )}

      {/* ── Proposal Info Modal ─────────────────────────────────────────────── */}
      {modal.type === "proposal-info" && pos && (
        <ModalOverlay onClose={closeModal}>
          <ModalHeader title="4-Eyes Execution Proposal" subtitle={`${pos.record_id} · ${pos.entity} (${pos.currency})`} />
          <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.amber, padding: "8px 12px", border: `1px solid color-mix(in srgb, ${S.amber} 25%, transparent)`, background: `color-mix(in srgb, ${S.amber} 6%, transparent)`, marginBottom: 14, lineHeight: 1.7 }}>
            <strong>4-Eyes Workflow Required — Segregation of Duties</strong><br />
            Execution to HEDGED requires a formal approval chain:<br /><br />
            1 · Maker submits: POST /v1/proposals<br />
            2 · Different checker approves: PATCH /v1/proposals/:id/approve<br />
            3 · Checker executes: POST /v1/proposals/:id/execute<br /><br />
            SoD enforced at DB layer (approver ≠ proposer).<br />
            Proposal hash + approval hash chained for tamper evidence.
          </div>
          <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary, padding: "6px 10px", border: `1px solid ${S.rim}`, marginBottom: 14, lineHeight: 1.6 }}>
            Position ID: {pos.id}<br />
            Policy: {pos.policy_id ?? "—"}<br />
            Last Run: {pos.last_run_id ?? "—"}<br />
            Hedge Amount: {pos.hedge_amount != null ? fmtAmt(pos.hedge_amount) : "not set"}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={closeModal} style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary, background: "transparent", border: `1px solid ${S.rim}`, padding: "6px 14px", cursor: "pointer" }}>Close</button>
            <button onClick={() => { closeModal(); router.push("/hedge-desk"); }} style={{ fontFamily: S.fontMono, fontSize: 12, color: S.bgDeep, background: S.pass, border: "none", padding: "6px 14px", cursor: "pointer", fontWeight: 700, letterSpacing: "0.04em" }}>HEDGE DESK</button>
          </div>
        </ModalOverlay>
      )}

      {/* ── Reject Modal ────────────────────────────────────────────────────── */}
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
          <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginBottom: 8 }}>Transition: {pos.execution_status} → REJECTED (can be reopened)</div>
          {lifecycleError && <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.fail, marginBottom: 10, padding: "4px 8px", border: `1px solid ${S.fail}`, background: `color-mix(in srgb, ${S.fail} 8%, transparent)` }}>{lifecycleError}</div>}
          <ModalActions onCancel={closeModal} onConfirm={handleReject} confirmLabel="REJECT POSITION" confirmColor={S.fail} disabled={rejectReason.trim().length < 5 || isTransitioning} />
        </ModalOverlay>
      )}

      {/* ── Bulk Reject Modal ───────────────────────────────────────────────── */}
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
              <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginBottom: 12 }}>
                Transition: NEW / POLICY_ASSIGNED / READY_TO_EXECUTE → REJECTED (can be reopened individually)
              </div>
              {bulkRejecting && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary, marginBottom: 6, letterSpacing: '0.06em' }}>
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
                  style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary, background: 'transparent', border: `1px solid ${S.rim}`, padding: '6px 14px', cursor: bulkRejecting ? 'not-allowed' : 'pointer' }}>
                  Cancel
                </button>
                <button
                  onClick={handleBulkReject}
                  disabled={bulkRejectReason.trim().length < 5 || bulkRejecting || rejectableIds.length === 0}
                  style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', color: '#fff', background: bulkRejectReason.trim().length < 5 || bulkRejecting || rejectableIds.length === 0 ? S.tertiary : S.fail, border: 'none', padding: '6px 14px', cursor: bulkRejectReason.trim().length < 5 || bulkRejecting || rejectableIds.length === 0 ? 'not-allowed' : 'pointer' }}>
                  {bulkRejecting ? `REJECTING ${bulkRejectProgress}/${rejectableIds.length}…` : `REJECT ${rejectableIds.length} POSITIONS`}
                </button>
              </div>
            </>)}
            {bulkRejectResult && (
              <div>
                <div style={{ padding: '10px 14px', border: `1px solid ${bulkRejectResult.failed > 0 ? S.fail : S.pass}`, background: `color-mix(in srgb, ${bulkRejectResult.failed > 0 ? S.fail : S.pass} 6%, transparent)`, marginBottom: 14 }}>
                  <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: bulkRejectResult.failed > 0 ? S.fail : S.pass, letterSpacing: '0.06em', marginBottom: 4 }}>
                    RESULT: {bulkRejectResult.rejected} REJECTED · {bulkRejectResult.skipped} SKIPPED · {bulkRejectResult.failed} FAILED
                  </div>
                  {bulkRejectResult.errors.length > 0 && (
                    <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary, maxHeight: 80, overflowY: 'auto' }}>
                      {bulkRejectResult.errors.map((e, i) => <div key={i}>{e}</div>)}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => { setBulkRejectOpen(false); setBulkRejectResult(null); }}
                    style={{ fontFamily: S.fontMono, fontSize: 12, color: S.bgDeep, background: S.pass, border: 'none', padding: '6px 18px', cursor: 'pointer', fontWeight: 700 }}>
                    Done
                  </button>
                </div>
              </div>
            )}
          </ModalOverlay>
        );
      })()}

      {/* ── Delete Confirmation Modal ──────────────────────────────────────── */}
      {deleteConfirmId && (() => {
        const p = positions.find((x) => x.id === deleteConfirmId);
        if (!p) return null;
        return (
          <ModalOverlay onClose={() => { if (!deleteRunning) setDeleteConfirmId(null); }}>
            <ModalHeader title="Remove Position" subtitle={`${p.record_id} · ${p.entity} (${p.currency})`} />
            <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary, lineHeight: 1.6, marginBottom: 16 }}>
              This will <strong style={{ color: S.primary }}>permanently remove</strong> this position from the active view.<br />
              The position will be soft-deleted ({'"'}is_active = false{'"'}) — it cannot be recovered from the UI but remains in the database for audit compliance.<br /><br />
              <span style={{ color: S.tertiary }}>Rejection reason: {p.rejection_reason || '(none recorded)'}</span>
            </div>
            <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.amber, padding: '6px 10px', border: `1px solid color-mix(in srgb, ${S.amber} 30%, transparent)`, background: `color-mix(in srgb, ${S.amber} 6%, transparent)`, marginBottom: 16 }}>
              WORM audit trail preserved. This action is irreversible via UI.
            </div>
            {deleteError && (
              <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.fail, marginBottom: 12, padding: '6px 10px', border: `1px solid ${S.fail}`, background: `color-mix(in srgb, ${S.fail} 8%, transparent)`, lineHeight: 1.5 }}>
                {deleteError}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => { setDeleteConfirmId(null); setDeleteError(null); }} style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary, background: 'transparent', border: `1px solid ${S.rim}`, padding: '6px 14px', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleDeletePosition} disabled={deleteRunning} data-testid="confirm-delete"
                style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', color: '#fff', background: deleteRunning ? S.tertiary : S.fail, border: 'none', padding: '6px 14px', cursor: deleteRunning ? 'not-allowed' : 'pointer' }}>
                {deleteRunning ? 'REMOVING…' : 'CONFIRM DELETE'}
              </button>
            </div>
          </ModalOverlay>
        );
      })()}

      {/* ── Bulk Assign Policy Modal ─────────────────────────────────────────── */}
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
                  <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.amber, padding: '6px 10px', border: `1px solid color-mix(in srgb, ${S.amber} 30%, transparent)`, background: `color-mix(in srgb, ${S.amber} 6%, transparent)`, marginBottom: 4 }}>
                    NO ACTIVE POLICY — activate one on the Policies page first
                  </div>
                )}
                <label style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary, display: 'block', marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
                  Select Policy Instance *
                </label>
                <input
                  type="text" value={bulkSearchQuery} onChange={e => setBulkSearchQuery(e.target.value)}
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
                        <PageShell icon={LayoutDashboard} title="Position Desk" breadcrumb={["Dashboard", "Position Desk"]} noPadding>

                        <PolicySelectorRow key={t.id} tmpl={t}
                          isSelected={!!instId && bulkPolicyId === instId}
                          isFavorite={false} isActive={t.id === activeTemplateId}
                          onSelect={() => { if (instId) setBulkPolicyId(instId); }}
                        />
                      
                        </PageShell>
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
          {bulkResult && (
            <div style={{ marginBottom: 14, padding: '8px 12px', border: `1px solid ${bulkResult.failed > 0 ? S.fail : S.pass}`, background: `color-mix(in srgb, ${bulkResult.failed > 0 ? S.fail : S.pass} 6%, transparent)` }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 12, color: bulkResult.failed > 0 ? S.fail : S.pass, fontWeight: 700, letterSpacing: '0.06em', marginBottom: 4 }}>
                RESULT: {bulkResult.assigned} ASSIGNED · {bulkResult.skipped} SKIPPED · {bulkResult.failed} FAILED
              </div>
              {bulkResult.errors.length > 0 && (
                <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary, maxHeight: 80, overflowY: 'auto' as const }}>
                  {bulkResult.errors.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
            </div>
          )}
          <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginBottom: 8 }}>
            Transitions: NEW → POLICY_ASSIGNED (positions in later states are skipped)
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <button onClick={() => { if (!bulkRunning) setBulkAssignOpen(false); }}
              style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary, background: 'transparent', border: `1px solid ${S.rim}`, padding: '6px 14px', cursor: bulkRunning ? 'not-allowed' : 'pointer' }}>
              {bulkResult && bulkResult.assigned > 0 ? 'Done' : 'Cancel'}
            </button>
            {!bulkResult && (
              <button onClick={handleBulkAssign}
                disabled={!bulkPolicyId.trim() || bulkRunning}
                style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', color: S.bgDeep, background: !bulkPolicyId.trim() || bulkRunning ? S.tertiary : S.cyan, border: 'none', padding: '6px 14px', cursor: !bulkPolicyId.trim() || bulkRunning ? 'not-allowed' : 'pointer' }}>
                {bulkRunning ? `ASSIGNING ${selected.size}…` : `ASSIGN TO ${selected.size} POSITIONS`}
              </button>
            )}
          </div>
        </ModalOverlay>
      )}
      {/* ── Add Position Drawer ──────────────────────────────────────────── */}
      {token && (
        <AddPositionDrawer
          open={showAdd}
          onClose={() => setShowAdd(false)}
          token={token}
          onSuccess={() => { if (token) dispatch(listPositionsThunk({ token })); }}
        />
      )}

      {/* ── Import CSV Modal ──────────────────────────────────────────────── */}
      {token && (
        <ImportCsvModal
          open={showImport}
          onClose={() => setShowImport(false)}
          token={token}
          onSuccess={() => { if (token) dispatch(listPositionsThunk({ token })); }}
        />
      )}
    </div>
    <HelpPanelV2 module={POSITIONS_HELP} storageKey="position-desk" />
    </div>
  );
}
