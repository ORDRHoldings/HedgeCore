"use client";

/**
 * Import History — Bloomberg/BlackRock-grade connector run audit trail
 * ORDR Terminal · Position Desk · Ingestion Audit
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/authContext";
import {
  listConnectorRuns,
  getConnectorRunDetail,
  type ConnectorRun,
  type ConnectorRunDetail,
  type ConnectorRunError,
} from "../../api/connectorClient";
import HelpPanel from "@/components/layout/HelpPanel";
import { IMPORT_HISTORY_HELP } from "@/lib/helpContent";
import { usePlanRedirect } from "@/lib/hooks/usePlanRedirect";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";

import { PageShell } from "@/components/layout/PageShell";
import { LayoutDashboard } from "lucide-react";

// ─── Design Tokens ────────────────────────────────────────────────────────────
const S = {
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  bgPanel: "var(--bg-panel)",
  rim: "var(--border-rim)",
  soft: "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)",
  amber: "var(--accent-amber)",
  red: "var(--accent-red)",
  pass: "var(--status-pass)",
  fontUI: "'IBM Plex Sans', sans-serif",
  fontMono: "'IBM Plex Mono', monospace",
} as const;

// ─── Connector Type Color Map ────────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  UPLOAD_CSV: S.cyan,
  UPLOAD_EXCEL: S.amber,
  DATABASE: "#60a5fa",
  ERP: "#fb923c",
  ACCOUNTING: "#93C5FD",
};

// ─── Utility: Format timestamp ───────────────────────────────────────────────
function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mon = months[d.getUTCMonth()];
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${mon} ${day}, ${year} · ${hh}:${mm}:${ss} UTC`;
}

// ─── Utility: Short timestamp (for table) ────────────────────────────────────
function formatShortTimestamp(iso: string): string {
  const d = new Date(iso);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mon = months[d.getUTCMonth()];
  const day = d.getUTCDate();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${mon} ${day} · ${hh}:${mm} UTC`;
}

// ─── Utility: Duration ────────────────────────────────────────────────────────
function computeDuration(started: string, completed: string | null): string {
  if (!completed) return "—";
  const start = new Date(started).getTime();
  const end = new Date(completed).getTime();
  const delta = end - start;
  if (delta < 1000) return `${delta}ms`;
  return `${(delta / 1000).toFixed(1)}s`;
}

// ─── Utility: Live UTC Clock ─────────────────────────────────────────────────
function useUtcClock(): string {
  const [clock, setClock] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const hh = String(now.getUTCHours()).padStart(2, "0");
      const mm = String(now.getUTCMinutes()).padStart(2, "0");
      const ss = String(now.getUTCSeconds()).padStart(2, "0");
      setClock(`${hh}:${mm}:${ss} UTC`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);
  return clock;
}

// ─── Utility: Copy to Clipboard ──────────────────────────────────────────────
function copyToClipboard(text: string) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Top Bar — matches Position Desk header pattern exactly
// ═══════════════════════════════════════════════════════════════════════════════
function TopBar({ totalRuns, loading, onBack, onRefresh }: { totalRuns: number; loading: boolean; onBack: () => void; onRefresh: () => void }) {
  return (
    <header style={{ display: "flex", alignItems: "center", gap: 10, height: 44, flexShrink: 0, padding: "0 20px", background: S.bgPanel, borderBottom: `1px solid ${S.rim}` }}>
      <button onClick={onBack} style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, background: "transparent", border: `1px solid ${S.rim}`, padding: "2px 8px", cursor: "pointer" }}>← Position Desk</button>
      <span style={{ color: S.rim }}>|</span>
      <span style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: S.primary }}>Import History</span>
      <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary, border: `1px solid ${S.rim}`, padding: "1px 5px" }}>INGESTION AUDIT</span>
      <div style={{ flex: 1 }} />
      <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{totalRuns} runs</span>
      <button onClick={onRefresh} disabled={loading} title="Refresh" style={{ fontFamily: S.fontMono, fontSize: 12, color: S.cyan, background: "transparent", border: `1px solid color-mix(in srgb, ${S.cyan} 30%, transparent)`, padding: "2px 8px", cursor: loading ? "not-allowed" : "pointer" }}>↻ Refresh</button>
    </header>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// KPI Card
// ═══════════════════════════════════════════════════════════════════════════════
function KpiCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        background: S.bgPanel,
        border: `1px solid ${S.rim}`,
        borderLeft: `3px solid ${color}`,
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <span
        style={{
          fontFamily: S.fontMono,
          fontSize: "0.625rem",
          fontWeight: 500,
          color: S.tertiary,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: S.fontMono,
          fontSize: "1.5rem",
          fontWeight: 700,
          color: S.primary,
          lineHeight: 1,
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Filter Bar
// ═══════════════════════════════════════════════════════════════════════════════
interface FilterBarProps {
  dateFrom: string;
  dateTo: string;
  status: string;
  connectorType: string;
  search: string;
  isLoading: boolean;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onStatusChange: (v: string) => void;
  onConnectorTypeChange: (v: string) => void;
  onSearchChange: (v: string) => void;
  onRefresh: () => void;
  onExport: () => void;
}

function FilterBar({
  dateFrom,
  dateTo,
  status,
  connectorType,
  search,
  isLoading,
  onDateFromChange,
  onDateToChange,
  onStatusChange,
  onConnectorTypeChange,
  onSearchChange,
  onRefresh,
  onExport,
}: FilterBarProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 20px", background: S.bgPanel, borderBottom: `1px solid ${S.soft}`, flexShrink: 0, flexWrap: "wrap" }}>
      <input type="date" value={dateFrom} onChange={(e) => onDateFromChange(e.target.value)} style={{ fontFamily: S.fontMono, fontSize: 12, padding: "3px 8px", background: S.bgSub, color: S.primary, border: `1px solid ${S.rim}`, outline: "none" }} />
      <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>—</span>
      <input type="date" value={dateTo} onChange={(e) => onDateToChange(e.target.value)} style={{ fontFamily: S.fontMono, fontSize: 12, padding: "3px 8px", background: S.bgSub, color: S.primary, border: `1px solid ${S.rim}`, outline: "none" }} />
      <select value={status} onChange={(e) => onStatusChange(e.target.value)} style={{ fontFamily: S.fontMono, fontSize: 12, padding: "3px 8px", background: S.bgSub, color: S.primary, border: `1px solid ${S.rim}`, outline: "none" }}>
        <option value="ALL">ALL STATUS</option>
        <option value="COMPLETED">COMPLETED</option>
        <option value="FAILED">FAILED</option>
        <option value="RUNNING">RUNNING</option>
      </select>
      <select value={connectorType} onChange={(e) => onConnectorTypeChange(e.target.value)} style={{ fontFamily: S.fontMono, fontSize: 12, padding: "3px 8px", background: S.bgSub, color: S.primary, border: `1px solid ${S.rim}`, outline: "none" }}>
        <option value="ALL">ALL TYPES</option>
        <option value="UPLOAD_CSV">CSV</option>
        <option value="UPLOAD_EXCEL">EXCEL</option>
        <option value="DATABASE">DATABASE</option>
        <option value="ERP">ERP</option>
        <option value="ACCOUNTING">ACCOUNTING</option>
      </select>
      <div style={{ flex: 1 }} />
      <input type="text" placeholder="Search filename or run ID…" value={search} onChange={(e) => onSearchChange(e.target.value)} style={{ fontFamily: S.fontMono, fontSize: 12, padding: "3px 10px", background: S.bgSub, border: `1px solid ${S.rim}`, color: S.primary, outline: "none", width: 240 }} />
      <button onClick={onExport} style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: S.amber, background: "transparent", border: `1px solid color-mix(in srgb, ${S.amber} 35%, transparent)`, padding: "3px 10px", cursor: "pointer" }}>↓ CSV</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Status Badge
// ═══════════════════════════════════════════════════════════════════════════════
function StatusBadge({ status }: { status: string }) {
  let color: string = S.secondary;
  if (status === "COMPLETED") color = S.pass;
  if (status === "FAILED") color = S.red;
  if (status === "RUNNING") color = S.amber;

  const isPulsing = status === "RUNNING";

  return (
    <span
      style={{
        fontFamily: S.fontMono,
        fontSize: "0.625rem",
        fontWeight: 700,
        letterSpacing: "0.06em",
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid ${color}`,
        padding: "2px 6px",
        borderRadius: 2,
        animation: isPulsing ? "pulse 1.5s infinite" : undefined,
      }}
    >
      {status}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Type Badge
// ═══════════════════════════════════════════════════════════════════════════════
function TypeBadge({ type }: { type: string }) {
  const color = TYPE_COLORS[type] ?? S.secondary;
  return (
    <span
      style={{
        fontFamily: S.fontMono,
        fontSize: "0.625rem",
        fontWeight: 700,
        letterSpacing: "0.06em",
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid ${color}`,
        padding: "2px 6px",
        borderRadius: 2,
      }}
    >
      {type}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Table Row
// ═══════════════════════════════════════════════════════════════════════════════
interface RunRowProps {
  run: ConnectorRun;
  expanded: boolean;
  detail: ConnectorRunDetail | null;
  loadingDetail: boolean;
  onToggle: () => void;
}

function RunRow({ run, expanded, detail, loadingDetail, onToggle }: RunRowProps) {
  const successRate =
    run.total_rows > 0 ? ((run.created_ok / run.total_rows) * 100).toFixed(0) : "—";

  let successColor: string = S.secondary;
  if (successRate !== "—") {
    const rate = parseFloat(successRate);
    if (rate >= 95) successColor = S.pass;
    else if (rate >= 75) successColor = S.amber;
    else successColor = S.red;
  }

  const duration = computeDuration(run.started_at, run.completed_at);

  return (
    <>
      <tr
        onClick={onToggle}
        style={{
          cursor: "pointer",
          background: expanded ? S.bgSub : S.bgPanel,
          borderBottom: `1px solid ${S.rim}`,
        }}
        onMouseEnter={(e) => {
          if (!expanded) e.currentTarget.style.background = S.bgSub;
        }}
        onMouseLeave={(e) => {
          if (!expanded) e.currentTarget.style.background = S.bgPanel;
        }}
      >
        <td
          style={{
            padding: "8px 12px",
            fontFamily: S.fontMono,
            fontSize: "0.75rem",
            color: S.tertiary,
            textAlign: "center",
          }}
        >
          <span style={{ transform: expanded ? "rotate(90deg)" : "none", display: "inline-block" }}>
            ▶
          </span>
        </td>
        <td
          style={{
            padding: "8px 12px",
            fontFamily: S.fontMono,
            fontSize: "0.75rem",
            color: S.cyan,
          }}
          title={run.id}
        >
          {run.id.slice(0, 8)}…
        </td>
        <td
          style={{
            padding: "8px 12px",
            fontFamily: S.fontMono,
            fontSize: "0.75rem",
            color: S.primary,
          }}
        >
          {run.source_filename ?? run.connector_type}
        </td>
        <td style={{ padding: "8px 12px" }}>
          <TypeBadge type={run.connector_type} />
        </td>
        <td style={{ padding: "8px 12px" }}>
          <StatusBadge status={run.status} />
        </td>
        <td
          style={{
            padding: "8px 12px",
            fontFamily: S.fontMono,
            fontSize: "0.75rem",
            color: S.secondary,
            textAlign: "right",
          }}
        >
          {run.total_rows}
        </td>
        <td
          style={{
            padding: "8px 12px",
            fontFamily: S.fontMono,
            fontSize: "0.75rem",
            color: S.pass,
            textAlign: "right",
          }}
        >
          {run.created_ok}
        </td>
        <td
          style={{
            padding: "8px 12px",
            fontFamily: S.fontMono,
            fontSize: "0.75rem",
            color: run.error_count > 0 ? S.red : S.secondary,
            textAlign: "right",
          }}
        >
          {run.error_count}
        </td>
        <td
          style={{
            padding: "8px 12px",
            fontFamily: S.fontMono,
            fontSize: "0.75rem",
            color: successColor,
            textAlign: "right",
            fontWeight: 600,
          }}
        >
          {successRate === "—" ? "—" : `${successRate}%`}
        </td>
        <td
          style={{
            padding: "8px 12px",
            fontFamily: S.fontUI,
            fontSize: "0.75rem",
            color: S.secondary,
          }}
        >
          {run.triggered_by}
        </td>
        <td
          style={{
            padding: "8px 12px",
            fontFamily: S.fontMono,
            fontSize: "0.75rem",
            color: S.tertiary,
          }}
        >
          {formatShortTimestamp(run.started_at)}
        </td>
        <td
          style={{
            padding: "8px 12px",
            fontFamily: S.fontMono,
            fontSize: "0.75rem",
            color: S.secondary,
            textAlign: "right",
          }}
        >
          {duration}
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: S.bgDeep, borderBottom: `1px solid ${S.rim}` }}>
          <td colSpan={12} style={{ padding: 0 }}>
            <DetailPanel run={run} detail={detail} loading={loadingDetail} />
          </td>
        </tr>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Detail Panel
// ═══════════════════════════════════════════════════════════════════════════════
function DetailPanel({
  run,
  detail,
  loading,
}: {
  run: ConnectorRun;
  detail: ConnectorRunDetail | null;
  loading: boolean;
}) {
  const isMobile = useIsMobile();
  if (loading) {
    return (
      <div
        style={{
          padding: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            border: `2px solid ${S.cyan}`,
            borderTopColor: "transparent",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: "0.75rem",
            color: S.tertiary,
          }}
        >
          Loading details...
        </span>
      </div>
    );
  }

  if (!detail) return null;

  const duration = computeDuration(detail.started_at, detail.completed_at);

  return (
    <div style={{ padding: "20px 24px" }}>
      {/* Metadata Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
          gap: "16px 32px",
          marginBottom: 20,
        }}
      >
        <MetaField label="RUN ID" value={detail.id} copyable />
        <MetaField label="STATUS" value={detail.status} />
        <MetaField label="COMPANY ID" value={detail.company_id} />
        <MetaField label="BRANCH" value={detail.branch_id ?? "N/A"} />
        <MetaField label="CONNECTOR TYPE" value={detail.connector_type} />
        <MetaField label="SOURCE FILE" value={detail.source_filename ?? "N/A"} />
        <MetaField
          label="FILE HASH (SHA-256)"
          value={detail.source_hash ?? "N/A"}
          copyable
          highlight
        />
        <MetaField label="STARTED AT" value={formatTimestamp(detail.started_at)} />
        <MetaField
          label="COMPLETED AT"
          value={detail.completed_at ? formatTimestamp(detail.completed_at) : "N/A"}
        />
        <MetaField label="DURATION" value={duration} />
      </div>

      {/* Errors Table */}
      {detail.error_count > 0 && detail.errors && detail.errors.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: "0.75rem",
              color: S.red,
              fontWeight: 700,
              letterSpacing: "0.04em",
              marginBottom: 10,
            }}
          >
            {detail.error_count} VALIDATION ERROR{detail.error_count > 1 ? "S" : ""} FOUND IN THIS
            IMPORT
          </div>
          <div
            style={{
              border: `1px solid ${S.rim}`,
              background: S.bgPanel,
              maxHeight: 240,
              overflowY: "auto",
            }}
          >
            <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.rim}`, background: S.bgSub }}>
                  <th
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: "0.625rem",
                      fontWeight: 700,
                      color: S.tertiary,
                      letterSpacing: "0.06em",
                      padding: "6px 10px",
                      textAlign: "left",
                    }}
                  >
                    ROW #
                  </th>
                  <th
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: "0.625rem",
                      fontWeight: 700,
                      color: S.tertiary,
                      letterSpacing: "0.06em",
                      padding: "6px 10px",
                      textAlign: "left",
                    }}
                  >
                    FIELD
                  </th>
                  <th
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: "0.625rem",
                      fontWeight: 700,
                      color: S.tertiary,
                      letterSpacing: "0.06em",
                      padding: "6px 10px",
                      textAlign: "left",
                    }}
                  >
                    ERROR MESSAGE
                  </th>
                </tr>
              </thead>
              <tbody>
                {detail.errors.map((err, idx) => (
                  <tr key={idx} style={{ borderBottom: `1px solid ${S.soft}` }}>
                    <td
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: "0.75rem",
                        color: S.amber,
                        padding: "6px 10px",
                      }}
                    >
                      {err.row_number ?? "—"}
                    </td>
                    <td
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: "0.75rem",
                        color: S.secondary,
                        padding: "6px 10px",
                      }}
                    >
                      {err.field_name ?? "—"}
                    </td>
                    <td
                      style={{
                        fontFamily: S.fontUI,
                        fontSize: "0.75rem",
                        color: S.red,
                        padding: "6px 10px",
                      }}
                    >
                      {err.error_message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* Audit Chain Note */}
      <div style={{ marginTop: 20 }}>
        {detail.status === "COMPLETED" ? (
          <div
            style={{
              border: `1px solid ${S.pass}`,
              background: `color-mix(in srgb, ${S.pass} 6%, ${S.bgPanel})`,
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ color: S.pass, fontSize: "1rem" }}>✓</span>
            <span
              style={{
                fontFamily: S.fontUI,
                fontSize: "0.75rem",
                color: S.pass,
                lineHeight: 1.4,
              }}
            >
              This run is recorded in the immutable audit chain. Hash:{" "}
              <span style={{ fontFamily: S.fontMono }}>
                {detail.source_hash ? detail.source_hash.slice(0, 16) + "…" : "N/A"}
              </span>
            </span>
          </div>
        ) : detail.status === "FAILED" ? (
          <div
            style={{
              border: `1px solid ${S.amber}`,
              background: `color-mix(in srgb, ${S.amber} 6%, ${S.bgPanel})`,
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ color: S.amber, fontSize: "1rem" }}>⚠</span>
            <span
              style={{
                fontFamily: S.fontUI,
                fontSize: "0.75rem",
                color: S.amber,
                lineHeight: 1.4,
              }}
            >
              This run recorded {detail.error_count} validation error
              {detail.error_count > 1 ? "s" : ""}. Positions were not created for failed rows.
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Meta Field ───────────────────────────────────────────────────────────────
function MetaField({
  label,
  value,
  copyable,
  highlight,
}: {
  label: string;
  value: string;
  copyable?: boolean;
  highlight?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontFamily: S.fontMono,
          fontSize: "0.625rem",
          color: S.tertiary,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: "0.75rem",
            color: highlight ? S.cyan : S.primary,
            fontWeight: highlight ? 600 : 400,
          }}
        >
          {value}
        </span>
        {copyable && value !== "N/A" && (
          <button
            onClick={() => copyToClipboard(value)}
            title="Copy to clipboard"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: S.cyan,
              fontSize: "0.75rem",
              padding: 0,
            }}
          >
            📋
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Empty State
// ═══════════════════════════════════════════════════════════════════════════════
function EmptyStateView({ onUploadClick }: { onUploadClick: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "80px 20px",
        gap: 16,
      }}
    >
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
        <rect
          x="12"
          y="16"
          width="40"
          height="40"
          rx="2"
          stroke={S.tertiary}
          strokeWidth="2"
          fill="none"
        />
        <path d="M32 28 L32 40 M26 34 L32 28 L38 34" stroke={S.tertiary} strokeWidth="2" />
      </svg>
      <div
        style={{
          fontFamily: S.fontMono,
          fontSize: "0.875rem",
          fontWeight: 700,
          color: S.secondary,
          letterSpacing: "0.06em",
        }}
      >
        NO IMPORT RECORDS FOUND
      </div>
      <div
        style={{
          fontFamily: S.fontUI,
          fontSize: "0.75rem",
          color: S.tertiary,
          maxWidth: 480,
          textAlign: "center",
          lineHeight: 1.5,
        }}
      >
        Position imports via CSV, Excel, Database, ERP, or Accounting connectors appear here. Every
        import creates an immutable audit record.
      </div>
      <button
        onClick={onUploadClick}
        style={{
          fontFamily: S.fontMono,
          fontSize: "0.75rem",
          fontWeight: 600,
          color: S.cyan,
          background: `color-mix(in srgb, ${S.cyan} 12%, transparent)`,
          border: `1px solid ${S.cyan}`,
          padding: "8px 16px",
          cursor: "pointer",
          letterSpacing: "0.04em",
          marginTop: 8,
        }}
      >
        UPLOAD YOUR FIRST FILE →
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Skeleton Loading
// ═══════════════════════════════════════════════════════════════════════════════
function SkeletonRow() {
  return (
    <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
      <td colSpan={12} style={{ padding: "12px 20px" }}>
        <div
          style={{
            height: 20,
            background: `linear-gradient(90deg, ${S.bgSub} 25%, ${S.bgPanel} 50%, ${S.bgSub} 75%)`,
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s infinite",
            borderRadius: 2,
          }}
        />
      </td>
    </tr>
  );
}

function SkeletonTable() {
  return (
    <div style={{ padding: "20px" }}>
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          style={{
            height: 40,
            marginBottom: 8,
            background: `linear-gradient(90deg, ${S.bgSub} 25%, ${S.bgPanel} 50%, ${S.bgSub} 75%)`,
            backgroundSize: "200% 100%",
            animation: "shimmer 1.5s infinite",
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════════════════════
export default function ImportHistoryPage() {
  const _planAllowed = usePlanRedirect("professional");
  const router = useRouter();
  const { token, isAuthenticated, isLoading: authLoading } = useAuth();

  const [runs, setRuns] = useState<ConnectorRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [connectorTypeFilter, setConnectorTypeFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  // Expanded rows
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailMap, setDetailMap] = useState<Record<string, ConnectorRunDetail>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const isMobile = useIsMobile();
  const PAGE_SIZE = 25;

  // Auto-refresh
  const [autoRefreshActive, setAutoRefreshActive] = useState(false);

  // Fetch runs
  const fetchRuns = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listConnectorRuns(token, 200);
      setRuns(res.items);
    } catch (err) {
      console.error("Failed to fetch connector runs:", err);
      setError("Failed to load import history");
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Initial fetch
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      fetchRuns();
    }
  }, [authLoading, isAuthenticated, fetchRuns]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/auth/login");
    }
  }, [authLoading, isAuthenticated, router]);

  // Auto-refresh if any run is RUNNING
  useEffect(() => {
    const hasRunning = runs.some((r) => r.status === "RUNNING");
    setAutoRefreshActive(hasRunning);

    if (!hasRunning) return;

    const interval = setInterval(() => {
      fetchRuns();
    }, 30000);

    return () => clearInterval(interval);
  }, [runs, fetchRuns]);

  // Toggle expand
  const toggleExpand = useCallback(
    async (runId: string) => {
      if (expandedId === runId) {
        setExpandedId(null);
        return;
      }

      setExpandedId(runId);

      // Load detail if not already loaded
      if (!detailMap[runId]) {
        setLoadingDetail(runId);
        try {
          const detail = await getConnectorRunDetail(runId, token ?? undefined);
          setDetailMap((prev) => ({ ...prev, [runId]: detail }));
        } catch (err) {
          console.error("Failed to load run detail:", err);
        } finally {
          setLoadingDetail(null);
        }
      }
    },
    [expandedId, detailMap, token]
  );

  // Filtered runs
  const filteredRuns = useMemo(() => {
    let result = [...runs];

    // Date range
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      result = result.filter((r) => new Date(r.started_at).getTime() >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime() + 86400000; // end of day
      result = result.filter((r) => new Date(r.started_at).getTime() < to);
    }

    // Status
    if (statusFilter !== "ALL") {
      result = result.filter((r) => r.status === statusFilter);
    }

    // Connector type
    if (connectorTypeFilter !== "ALL") {
      result = result.filter((r) => r.connector_type === connectorTypeFilter);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          (r.source_filename && r.source_filename.toLowerCase().includes(q))
      );
    }

    return result;
  }, [runs, dateFrom, dateTo, statusFilter, connectorTypeFilter, search]);

  // KPIs
  const totalRuns = runs.length;
  const rowsImported = runs.reduce((sum, r) => sum + r.created_ok, 0);
  const errorRows = runs.reduce((sum, r) => sum + r.error_count, 0);
  const totalRows = runs.reduce((sum, r) => sum + r.total_rows, 0);
  const successRate =
    totalRows > 0 ? ((rowsImported / totalRows) * 100).toFixed(1) : "0.0";

  // Pagination
  const totalPages = Math.ceil(filteredRuns.length / PAGE_SIZE);
  const paginatedRuns = filteredRuns.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Export CSV
  const exportCsv = useCallback(() => {
    const headers = [
      "Run ID",
      "File",
      "Type",
      "Status",
      "Total Rows",
      "OK",
      "Errors",
      "Started At",
      "Triggered By",
    ];
    const rows = filteredRuns.map((r) => [
      r.id,
      r.source_filename ?? r.connector_type,
      r.connector_type,
      r.status,
      r.total_rows.toString(),
      r.created_ok.toString(),
      r.error_count.toString(),
      r.started_at,
      r.triggered_by,
    ]);
    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredRuns]);

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: S.bgDeep, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: S.fontUI, fontSize: 13, color: S.tertiary }}>
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <PageShell icon={LayoutDashboard} title="Import History" breadcrumb={["Dashboard","Import History"]}>

    <div style={{ display: 'flex', minHeight: '100vh' }}>

    <>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          overflow: "hidden",
          background: S.bgDeep,
          color: S.primary,
          flex: 1,
        }}
      >
        <TopBar totalRuns={totalRuns} loading={loading} onBack={() => router.push("/position-desk")} onRefresh={fetchRuns} />

        {/* KPI Summary Row */}
        <div style={{ display: "flex", gap: 10, padding: isMobile ? "8px 12px" : "8px 20px", borderBottom: `1px solid ${S.soft}`, background: S.bgPanel, flexShrink: 0, flexWrap: isMobile ? "wrap" : "nowrap" }}>
          <KpiCard label="Total Runs" value={totalRuns.toString()} color={S.cyan} />
          <KpiCard
            label="Rows Imported"
            value={rowsImported.toLocaleString()}
            color={S.pass}
          />
          <KpiCard label="Error Rows" value={errorRows.toLocaleString()} color={S.red} />
          <KpiCard label="Success Rate" value={`${successRate}%`} color={S.amber} />
        </div>

        {/* Filter Bar */}
        <FilterBar
          dateFrom={dateFrom}
          dateTo={dateTo}
          status={statusFilter}
          connectorType={connectorTypeFilter}
          search={search}
          isLoading={loading}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onStatusChange={setStatusFilter}
          onConnectorTypeChange={setConnectorTypeFilter}
          onSearchChange={setSearch}
          onRefresh={fetchRuns}
          onExport={exportCsv}
        />
        {/* Table column header — matches position-desk header row pattern */}
        <div style={{ display: "grid", gridTemplateColumns: "32px 90px 1fr 100px 80px 52px 52px 52px 80px 90px 70px", padding: "5px 20px", background: S.bgSub, borderBottom: `1px solid ${S.soft}`, flexShrink: 0, overflowX: "auto" }}>
          {["", "RUN ID", "FILE / SOURCE", "TYPE", "STATUS", "ROWS", "OK", "ERR", "RATE", "STARTED", "DURATION"].map((col) => (
            <span key={col} style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.08em", fontWeight: 700 }}>{col}</span>
          ))}
        </div>

        {/* Auto-refresh badge */}
        {autoRefreshActive && (
          <div
            style={{
              padding: "6px 20px",
              background: `color-mix(in srgb, ${S.cyan} 6%, ${S.bgPanel})`,
              border: `1px solid ${S.cyan}`,
              borderLeft: "none",
              borderRight: "none",
            }}
          >
            <span
              style={{
                fontFamily: S.fontMono,
                fontSize: "0.625rem",
                color: S.cyan,
                fontWeight: 700,
                letterSpacing: "0.06em",
              }}
            >
              ⟳ AUTO-REFRESH ACTIVE — MONITORING RUNNING IMPORTS
            </span>
          </div>
        )}

        {/* Main Table */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {loading && runs.length === 0 ? (
            <SkeletonTable />
          ) : error || filteredRuns.length === 0 ? (
            <EmptyStateView onUploadClick={() => router.push("/position-desk")} />
          ) : (
            <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", background: S.bgPanel }}>
              <tbody>
                {paginatedRuns.map((run) => (
                  <RunRow
                    key={run.id}
                    run={run}
                    expanded={expandedId === run.id}
                    detail={detailMap[run.id] ?? null}
                    loadingDetail={loadingDetail === run.id}
                    onToggle={() => toggleExpand(run.id)}
                  />
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>

        {/* Pagination Footer */}
        {!loading && filteredRuns.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: isMobile ? "5px 12px" : "5px 20px", background: S.bgPanel, borderTop: `1px solid ${S.soft}`, flexShrink: 0, flexWrap: isMobile ? "wrap" : "nowrap" }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredRuns.length)} of {filteredRuns.length.toLocaleString()}
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={{ fontFamily: S.fontMono, fontSize: 12, padding: "2px 8px", background: "transparent", color: page === 1 ? S.tertiary : S.secondary, border: `1px solid ${S.rim}`, cursor: page === 1 ? "not-allowed" : "pointer" }}>← PREV</button>
              <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, padding: "2px 6px" }}>pg {page}/{totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ fontFamily: S.fontMono, fontSize: 12, padding: "2px 8px", background: "transparent", color: page === totalPages ? S.tertiary : S.secondary, border: `1px solid ${S.rim}`, cursor: page === totalPages ? "not-allowed" : "pointer" }}>NEXT →</button>
            </div>
          </div>
        )}
      </div>
    </>
  
    <HelpPanel config={IMPORT_HISTORY_HELP} storageKey="import-history" />
    </div>
  
    </PageShell>
  );
}
