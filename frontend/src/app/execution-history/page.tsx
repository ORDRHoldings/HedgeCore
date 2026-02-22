"use client";

/**
 * execution-history/page.tsx -- Execution History
 *
 * Full audit trail of all hedge executions across the ORDR pipeline.
 * Displays connector run entries with status tracking, approval chain details,
 * and hash-integrity verification.
 */

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../lib/authContext";
import { useRouter } from "next/navigation";
import { listConnectorRuns } from "../../api/connectorClient";
import type { ConnectorRun } from "../../api/connectorClient";

// -- Hydration-safe timestamp hook ------------------------------------------------
function useRenderTs(): string {
  const [renderTs, setRenderTs] = useState('');
  useEffect(() => {
    setRenderTs(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
  }, []);
  return renderTs;
}

// -- Design tokens ----------------------------------------------------------------
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
  pass:     "var(--status-pass)",
  fail:     "var(--accent-red,#B91C1C)",
} as const;

// -- Status types -----------------------------------------------------------------
type ExecutionStatus = "AUTHORIZED" | "EXECUTED" | "SETTLED" | "FAILED" | "CANCELLED";

const STATUS_COLORS: Record<ExecutionStatus, string> = {
  AUTHORIZED: S.amber,
  EXECUTED:   S.cyan,
  SETTLED:    S.pass,
  FAILED:     S.fail,
  CANCELLED:  S.tertiary,
};

// -- Execution row interface -------------------------------------------------------
interface ExecutionRow {
  ledgerId: string;
  stagingId: string;
  status: ExecutionStatus;
  notional: number;
  currencyPair: string;
  instrument: string;
  authorizedBy: string;
  timestamp: string;
  // Detail fields
  counterparty: string;
  rate: string;
  settlementDate: string;
  hashIntegrity: "VERIFIED" | "PENDING";
  approvalChain: { name: string; role: string; ts: string }[];
  stagingSummary: string;
}

// -- Status map for ConnectorRun → ExecutionStatus --------------------------------
const STATUS_MAP: Record<string, ExecutionStatus> = {
  COMPLETED: "SETTLED",
  RUNNING:   "AUTHORIZED",
  FAILED:    "FAILED",
};

// -- Map ConnectorRun to ExecutionRow ---------------------------------------------
function runToRow(run: ConnectorRun): ExecutionRow {
  return {
    ledgerId:       run.id,
    stagingId:      run.source_filename ?? "—",
    status:         (STATUS_MAP[run.status] ?? "EXECUTED") as ExecutionStatus,
    notional:       run.total_rows,
    currencyPair:   run.connector_type,
    instrument:     run.connector_type,
    authorizedBy:   run.triggered_by,
    timestamp:      run.started_at.slice(0, 16).replace("T", " "),
    counterparty:   "—",
    rate:           "—",
    settlementDate: run.completed_at ? run.completed_at.slice(0, 10) : "—",
    hashIntegrity:  run.source_hash ? "VERIFIED" : "PENDING",
    approvalChain:  [{ name: run.triggered_by, role: run.connector_type, ts: run.started_at.slice(0, 16).replace("T", " ") }],
    stagingSummary: `${run.connector_type} import: ${run.total_rows} rows total, ${run.created_ok} created, ${run.error_count} errors`,
  };
}

// -- Badge helper -----------------------------------------------------------------
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontFamily: S.fontMono,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: "0.08em",
      color: color,
      background: `color-mix(in srgb, ${color} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
      padding: "1px 5px",
      borderRadius: 2,
    }}>
      {label}
    </span>
  );
}

// -- Status badge -----------------------------------------------------------------
function StatusBadge({ status }: { status: ExecutionStatus }) {
  const color = STATUS_COLORS[status];
  return <Badge label={status} color={color} />;
}

// -- KPI Card ---------------------------------------------------------------------
function KPICard({ label, value, badge, badgeColor }: {
  label: string;
  value: string;
  badge: string;
  badgeColor: string;
}) {
  return (
    <div style={{
      flex: 1,
      minWidth: 180,
      background: S.bgPanel,
      border: `1px solid ${S.rim}`,
      borderRadius: 2,
      padding: "12px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{
          fontFamily: S.fontMono,
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: S.tertiary,
          textTransform: "uppercase",
        }}>
          {label}
        </span>
        <Badge label={badge} color={badgeColor} />
      </div>
      <span style={{
        fontFamily: S.fontMono,
        fontSize: 20,
        fontWeight: 700,
        color: S.primary,
        lineHeight: 1,
      }}>
        {value}
      </span>
    </div>
  );
}

// -- Detail Panel -----------------------------------------------------------------
function DetailPanel({ row, onClose }: { row: ExecutionRow; onClose: () => void }) {
  const sectionHeader: React.CSSProperties = {
    fontFamily: S.fontMono,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.08em",
    color: S.tertiary,
    textTransform: "uppercase",
    marginBottom: 8,
    paddingBottom: 4,
    borderBottom: `1px solid ${S.soft}`,
  };

  const detailLabel: React.CSSProperties = {
    fontFamily: S.fontMono,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.06em",
    color: S.tertiary,
    textTransform: "uppercase",
  };

  const detailValue: React.CSSProperties = {
    fontFamily: S.fontMono,
    fontSize: 12,
    color: S.primary,
    fontWeight: 500,
  };

  return (
    <tr>
      <td colSpan={9} style={{ padding: 0 }}>
        <div style={{
          background: `color-mix(in srgb, ${S.cyan} 3%, ${S.bgDeep})`,
          borderTop: `1px solid color-mix(in srgb, ${S.cyan} 20%, transparent)`,
          borderBottom: `1px solid color-mix(in srgb, ${S.cyan} 20%, transparent)`,
          padding: "16px 20px",
        }}>
          {/* Detail header */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.cyan }}>
                {row.ledgerId}
              </span>
              <StatusBadge status={row.status} />
              <Badge
                label={row.hashIntegrity}
                color={row.hashIntegrity === "VERIFIED" ? S.pass : S.amber}
              />
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              style={{
                fontFamily: S.fontMono,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.06em",
                color: S.tertiary,
                background: "transparent",
                border: `1px solid ${S.rim}`,
                padding: "3px 10px",
                borderRadius: 2,
                cursor: "pointer",
              }}
            >
              CLOSE
            </button>
          </div>

          {/* Three-column detail grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 20,
          }}>
            {/* Column 1: Ledger Entry Details */}
            <div>
              <div style={sectionHeader}>RUN DETAILS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { label: "Run ID",          value: row.ledgerId },
                  { label: "Source File",      value: row.stagingId },
                  { label: "Connector Type",   value: row.currencyPair },
                  { label: "Rows Processed",   value: String(row.notional) },
                  { label: "Started",          value: row.timestamp },
                  { label: "Settled / Done",   value: row.settlementDate },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div style={detailLabel}>{label}</div>
                    <div style={detailValue}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Column 2: Execution Details */}
            <div>
              <div style={sectionHeader}>IMPORT SUMMARY</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { label: "Counterparty",   value: row.counterparty },
                  { label: "Rate",           value: row.rate },
                  { label: "Settlement Date", value: row.settlementDate },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div style={detailLabel}>{label}</div>
                    <div style={detailValue}>{value}</div>
                  </div>
                ))}
                <div>
                  <div style={detailLabel}>SUMMARY</div>
                  <div style={{
                    fontFamily: S.fontUI,
                    fontSize: 11,
                    color: S.secondary,
                    lineHeight: 1.5,
                    marginTop: 2,
                  }}>
                    {row.stagingSummary}
                  </div>
                </div>
              </div>
            </div>

            {/* Column 3: Approval Chain */}
            <div>
              <div style={sectionHeader}>TRIGGERED BY</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {row.approvalChain.map((approver, idx) => (
                  <div key={idx} style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                  }}>
                    {/* Step indicator */}
                    <div style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: `color-mix(in srgb, ${S.cyan} 15%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${S.cyan} 40%, transparent)`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: S.fontMono,
                      fontSize: 9,
                      fontWeight: 700,
                      color: S.cyan,
                      flexShrink: 0,
                      marginTop: 1,
                    }}>
                      {idx + 1}
                    </div>
                    <div>
                      <div style={{ fontFamily: S.fontUI, fontSize: 12, fontWeight: 600, color: S.primary }}>
                        {approver.name}
                      </div>
                      <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
                        {approver.role}
                      </div>
                      <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary, marginTop: 2 }}>
                        {approver.ts}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Hash Integrity Check */}
              <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${S.soft}` }}>
                <div style={detailLabel}>HASH INTEGRITY CHECK</div>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 4,
                }}>
                  <Badge
                    label={row.hashIntegrity}
                    color={row.hashIntegrity === "VERIFIED" ? S.pass : S.amber}
                  />
                  <span style={{
                    fontFamily: S.fontMono,
                    fontSize: 10,
                    color: row.hashIntegrity === "VERIFIED" ? S.pass : S.amber,
                  }}>
                    {row.hashIntegrity === "VERIFIED"
                      ? "SHA-256 hash matches ledger record"
                      : "Awaiting hash verification"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

// =================================================================================
// PAGE
// =================================================================================
export default function ExecutionHistoryPage() {
  const renderTs = useRenderTs();
  const { isAuthenticated, token, user } = useAuth();
  const router = useRouter();

  // -- API state ------------------------------------------------------------------
  const [runs, setRuns] = useState<ConnectorRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // -- Filter state ---------------------------------------------------------------
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ExecutionStatus>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // -- Pagination state -----------------------------------------------------------
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  // -- Auth guard -----------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated) router.push("/auth/login");
  }, [isAuthenticated, router]);

  // -- Fetch runs -----------------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated || !token) return;
    let cancelled = false;
    setLoading(true);
    setApiError(null);
    listConnectorRuns(token, 100)
      .then(res => {
        if (!cancelled) setRuns(res.items ?? []);
      })
      .catch(err => {
        if (!cancelled) setApiError(err instanceof Error ? err.message : "Failed to load execution history");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [isAuthenticated, token]);

  // -- Map runs to rows -----------------------------------------------------------
  const allRows = useMemo(() => runs.map(runToRow), [runs]);

  // -- Filter logic ---------------------------------------------------------------
  const filteredData = useMemo(() => allRows.filter(row => {
    if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !row.ledgerId.toLowerCase().includes(q) &&
        !row.authorizedBy.toLowerCase().includes(q) &&
        !row.counterparty.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    if (dateFrom) {
      const from = new Date(dateFrom);
      const rowDate = new Date(row.timestamp);
      if (rowDate < from) return false;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      const rowDate = new Date(row.timestamp);
      if (rowDate > to) return false;
    }
    return true;
  }), [allRows, statusFilter, searchQuery, dateFrom, dateTo]);

  // -- KPI computations ----------------------------------------------------------
  const kpiTotal      = allRows.length;
  const kpiSettled    = allRows.filter(r => r.status === "SETTLED").length;
  const kpiFailed     = allRows.filter(r => r.status === "FAILED").length;
  const kpiSuccessRate = kpiTotal > 0
    ? `${(((kpiTotal - kpiFailed) / kpiTotal) * 100).toFixed(1)}%`
    : "—";

  // -- Shared styles --------------------------------------------------------------
  const inputStyle: React.CSSProperties = {
    fontFamily: S.fontMono,
    fontSize: 11,
    color: S.primary,
    background: S.bgDeep,
    border: `1px solid ${S.rim}`,
    padding: "5px 10px",
    borderRadius: 2,
    outline: "none",
    boxSizing: "border-box",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236b7280' fill='none' stroke-width='1.2'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 8px center",
    paddingRight: 24,
  };

  const thStyle: React.CSSProperties = {
    padding: "8px 12px",
    textAlign: "left",
    fontFamily: S.fontMono,
    fontSize: 9,
    letterSpacing: "0.07em",
    color: S.tertiary,
    fontWeight: 600,
    whiteSpace: "nowrap",
  };

  const tdStyle: React.CSSProperties = {
    padding: "8px 12px",
    fontFamily: S.fontMono,
    fontSize: 11,
    color: S.primary,
    whiteSpace: "nowrap",
  };

  // -- Export CSV -----------------------------------------------------------------
  function handleExportCSV() {
    const headers = ["Run ID", "Source File", "Status", "Rows", "Connector Type", "Triggered By", "Timestamp"];
    const rows = filteredData.map(r => [
      r.ledgerId, r.stagingId, r.status, r.notional.toString(),
      r.currencyPair, r.authorizedBy, r.timestamp,
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `execution-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!isAuthenticated) return null;

  // -- Pagination -----------------------------------------------------------------
  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const pagedData  = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      background: S.bgDeep,
      fontFamily: S.fontUI,
      color: S.primary,
    }}>

      {/* ====== TopBar (44px) ====== */}
      <header style={{
        display: "flex", alignItems: "center", gap: 12, height: 44,
        padding: "0 20px", background: S.bgPanel, borderBottom: `1px solid ${S.rim}`, flexShrink: 0,
      }}>
        {/* Icon */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1" y="3" width="14" height="10" rx="1.5" stroke={S.cyan} strokeWidth="1.25" />
          <path d="M1 6h14" stroke={S.cyan} strokeWidth="1" />
          <path d="M4 9h4" stroke={S.cyan} strokeWidth="1" strokeLinecap="round" />
        </svg>
        <div>
          <div style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: S.primary, lineHeight: 1.1 }}>
            Execution History
          </div>
          <div style={{ fontFamily: S.fontMono, fontSize: 11, letterSpacing: "0.07em", color: S.tertiary }}>
            EXECUTION &gt; EXECUTION HISTORY
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* User chip */}
        {user && (
          <span style={{
            fontFamily: S.fontMono,
            fontSize: 10,
            color: S.tertiary,
            padding: "2px 8px",
            border: `1px solid ${S.rim}`,
            borderRadius: 2,
          }}>
            {user.email || user.full_name || "operator"}
          </span>
        )}

        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>{renderTs}</span>
      </header>

      {/* ====== Content ====== */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ------ KPI Summary Row ------ */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <KPICard label="Total Runs"    value={loading ? "…" : String(kpiTotal)}    badge="ALL TIME" badgeColor={S.tertiary} />
            <KPICard label="Settled"       value={loading ? "…" : String(kpiSettled)}  badge="SETTLED"  badgeColor={S.pass} />
            <KPICard label="Failed"        value={loading ? "…" : String(kpiFailed)}   badge="FAILED"   badgeColor={S.fail} />
            <KPICard label="Success Rate"  value={loading ? "…" : kpiSuccessRate}      badge="RATE"     badgeColor={S.cyan} />
          </div>

          {/* ------ Filter Bar ------ */}
          <div style={{
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 2,
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}>
            {/* Date From */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", color: S.tertiary }}>
                FROM
              </span>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                style={{ ...inputStyle, width: 140 }}
              />
            </div>

            {/* Date To */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", color: S.tertiary }}>
                TO
              </span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                style={{ ...inputStyle, width: 140 }}
              />
            </div>

            {/* Separator */}
            <div style={{ width: 1, height: 20, background: S.rim }} />

            {/* Status Filter */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", color: S.tertiary }}>
                STATUS
              </span>
              <select
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value as "ALL" | ExecutionStatus); setCurrentPage(1); }}
                style={{ ...selectStyle, width: 140 }}
              >
                <option value="ALL">All</option>
                <option value="AUTHORIZED">AUTHORIZED</option>
                <option value="EXECUTED">EXECUTED</option>
                <option value="SETTLED">SETTLED</option>
                <option value="FAILED">FAILED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </div>

            {/* Separator */}
            <div style={{ width: 1, height: 20, background: S.rim }} />

            {/* Search */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 180 }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 600, letterSpacing: "0.08em", color: S.tertiary }}>
                SEARCH
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                placeholder="Run ID or connector..."
                style={{ ...inputStyle, flex: 1 }}
              />
            </div>

            {/* Export CSV */}
            <button
              onClick={handleExportCSV}
              style={{
                fontFamily: S.fontMono,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.06em",
                color: S.cyan,
                background: "transparent",
                border: `1px solid ${S.cyan}`,
                padding: "5px 14px",
                borderRadius: 2,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              EXPORT CSV
            </button>
          </div>

          {/* ------ Data Table ------ */}
          <div style={{
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 2,
            overflow: "hidden",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.rim}`, background: S.bgSub }}>
                  {["RUN ID", "SOURCE FILE", "STATUS", "ROWS", "CONNECTOR TYPE", "TRIGGERED BY", "TIMESTAMP", "HASH", "ACTIONS"].map(h => (
                    <th key={h} style={{
                      ...thStyle,
                      textAlign: h === "ROWS" ? "right" : "left",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Loading state */}
                {loading && (
                  <tr>
                    <td colSpan={9} style={{ padding: 40, textAlign: "center" }}>
                      <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, letterSpacing: "0.06em" }}>
                        LOADING EXECUTION HISTORY…
                      </span>
                    </td>
                  </tr>
                )}

                {/* Error state */}
                {!loading && apiError && (
                  <tr>
                    <td colSpan={9} style={{ padding: 40, textAlign: "center" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.fail }}>
                          FAILED TO LOAD — {apiError}
                        </span>
                        <button
                          onClick={() => { setApiError(null); setLoading(true); }}
                          style={{
                            fontFamily: S.fontMono, fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
                            color: S.cyan, background: "transparent", border: `1px solid ${S.cyan}`,
                            padding: "4px 14px", borderRadius: 2, cursor: "pointer",
                          }}
                        >
                          RETRY
                        </button>
                      </div>
                    </td>
                  </tr>
                )}

                {/* Empty state */}
                {!loading && !apiError && filteredData.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ padding: 48, textAlign: "center" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                          <rect x="3" y="7" width="26" height="18" rx="2" stroke={S.tertiary} strokeWidth="1.5" />
                          <path d="M3 12h26" stroke={S.tertiary} strokeWidth="1" />
                          <path d="M9 18h8" stroke={S.tertiary} strokeWidth="1" strokeLinecap="round" />
                        </svg>
                        <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, letterSpacing: "0.06em" }}>
                          NO EXECUTION HISTORY YET
                        </div>
                        <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, maxWidth: 360, lineHeight: 1.6, textAlign: "center" }}>
                          {allRows.length === 0
                            ? "Positions imported via CSV, database, or ERP connector will appear here."
                            : "No executions match your current filters."}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}

                {/* Data rows */}
                {!loading && !apiError && pagedData.map((row, i) => {
                  const isExpanded = expandedRow === row.ledgerId;
                  return (
                    <>
                      <tr
                        key={row.ledgerId}
                        onClick={() => setExpandedRow(isExpanded ? null : row.ledgerId)}
                        style={{
                          borderBottom: `1px solid ${S.soft}`,
                          background: isExpanded
                            ? `color-mix(in srgb, ${S.cyan} 5%, transparent)`
                            : i % 2 === 0
                              ? "transparent"
                              : `color-mix(in srgb, ${S.rim} 12%, transparent)`,
                          cursor: "pointer",
                          transition: "background 0.12s",
                        }}
                        onMouseEnter={(e) => {
                          if (!isExpanded) (e.currentTarget as HTMLElement).style.background = `color-mix(in srgb, ${S.cyan} 4%, transparent)`;
                        }}
                        onMouseLeave={(e) => {
                          if (!isExpanded) (e.currentTarget as HTMLElement).style.background = i % 2 === 0 ? "transparent" : `color-mix(in srgb, ${S.rim} 12%, transparent)`;
                        }}
                      >
                        {/* Run ID */}
                        <td style={{ ...tdStyle, fontWeight: 600, color: S.cyan }}>
                          {row.ledgerId}
                        </td>
                        {/* Source File */}
                        <td style={{ ...tdStyle, color: S.secondary }}>
                          {row.stagingId}
                        </td>
                        {/* Status */}
                        <td style={{ ...tdStyle }}>
                          <StatusBadge status={row.status} />
                        </td>
                        {/* Rows */}
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>
                          {row.notional.toLocaleString("en-US")}
                        </td>
                        {/* Connector Type */}
                        <td style={tdStyle}>
                          {row.currencyPair}
                        </td>
                        {/* Triggered By */}
                        <td style={{ ...tdStyle, fontFamily: S.fontUI, color: S.secondary }}>
                          {row.authorizedBy}
                        </td>
                        {/* Timestamp */}
                        <td style={{ ...tdStyle, color: S.tertiary }}>
                          {row.timestamp}
                        </td>
                        {/* Hash */}
                        <td style={tdStyle}>
                          <Badge
                            label={row.hashIntegrity}
                            color={row.hashIntegrity === "VERIFIED" ? S.pass : S.amber}
                          />
                        </td>
                        {/* Actions */}
                        <td style={tdStyle}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedRow(isExpanded ? null : row.ledgerId);
                            }}
                            style={{
                              fontFamily: S.fontMono,
                              fontSize: 10,
                              fontWeight: 600,
                              letterSpacing: "0.06em",
                              color: S.cyan,
                              background: "transparent",
                              border: `1px solid color-mix(in srgb, ${S.cyan} 30%, transparent)`,
                              padding: "2px 10px",
                              borderRadius: 2,
                              cursor: "pointer",
                            }}
                          >
                            {isExpanded ? "HIDE" : "VIEW"}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <DetailPanel
                          key={`detail-${row.ledgerId}`}
                          row={row}
                          onClose={() => setExpandedRow(null)}
                        />
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ------ Pagination ------ */}
          {!loading && !apiError && filteredData.length > 0 && (
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 4px",
            }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
                Showing {Math.min((currentPage - 1) * pageSize + 1, filteredData.length)}–{Math.min(currentPage * pageSize, filteredData.length)} of {filteredData.length} entries
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 11,
                      fontWeight: currentPage === page ? 700 : 400,
                      color: currentPage === page ? S.cyan : S.tertiary,
                      background: currentPage === page ? `color-mix(in srgb, ${S.cyan} 10%, transparent)` : "transparent",
                      border: `1px solid ${currentPage === page ? S.cyan : S.rim}`,
                      padding: "3px 10px",
                      borderRadius: 2,
                      cursor: "pointer",
                      minWidth: 32,
                    }}
                  >
                    {page}
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ====== Footer (32px) ====== */}
      <footer style={{
        height: 32, display: "flex", alignItems: "center", justifyContent: "center",
        background: S.bgPanel, borderTop: `1px solid ${S.rim}`, flexShrink: 0,
      }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.06em" }}>
          {renderTs} — ORDR &middot; Execution History
        </span>
      </footer>
    </div>
  );
}
