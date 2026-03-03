"use client";

/**
 * connectors/page.tsx — ORDR Connectors Hub
 *
 * Single unified dashboard for all data pipeline connectors.
 * Aggregates status from CSV upload, database, ERP, and accounting integrations.
 *
 * Layout:
 *  - Header KPI strip: total connectors, active, last sync, error count
 *  - Connector cards grid: CSV · Database · ERP · Accounting (with status + quick-action)
 *  - Recent connector runs table (same data as import-history, but filtered to connector runs)
 *  - Health matrix: per-connector field mapping coverage
 *
 * All connector pages already exist; this hub provides:
 *  1. At-a-glance status across ALL connector types
 *  2. Quick-link to configure each connector
 *  3. Aggregate run history
 *  4. Field mapping health summary
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/authContext";
import { usePlanRedirect } from "@/lib/hooks/usePlanRedirect";
import { listConnectorRuns } from "../../api/connectorClient";
import type { ConnectorRun } from "../../api/connectorClient";
import HelpPanel from "@/components/layout/HelpPanel";
import { CONNECTORS_HELP } from "@/lib/helpContent";

// ── Hydration-safe timestamp ───────────────────────────────────────────────────
function useRenderTs(): string {
  const [ts, setTs] = useState("");
  useEffect(() => { setTs(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC"); }, []);
  return ts;
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const S = {
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:   "var(--bg-deep,#0D0F11)",
  bgPanel:  "var(--bg-panel,#141618)",
  bgSub:    "var(--bg-sub,#1A1D21)",
  rim:      "var(--border-rim,#2A2D34)",
  soft:     "var(--border-soft,#1F2228)",
  primary:  "var(--text-primary,#E8EAF0)",
  secondary:"var(--text-secondary,#9CA3AF)",
  tertiary: "var(--text-tertiary,#6B7280)",
  cyan:     "var(--accent-cyan,#06B6D4)",
  amber:    "var(--accent-amber,#F59E0B)",
  pass:     "var(--status-pass,#10B981)",
  fail:     "var(--accent-red,#EF4444)",
  violet:   "#3B82F6",
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────
type ConnectorType = "CSV" | "DATABASE" | "ERP" | "ACCOUNTING";
type ConnectorStatus = "NOT_CONFIGURED" | "CONFIGURED" | "CONNECTED" | "ERROR" | "SYNCING";

interface ConnectorState {
  type:          ConnectorType;
  label:         string;
  description:   string;
  icon:          string;
  href:          string;
  status:        ConnectorStatus;
  lastSync:      string | null;
  recordsToday:  number;
  fieldCoverage: number; // 0–100%
  systems:       string[];
  storageKey:    string; // key in localStorage to detect configuration
}

const STATUS_COLORS: Record<ConnectorStatus, string> = {
  NOT_CONFIGURED: S.tertiary,
  CONFIGURED:     S.amber,
  CONNECTED:      S.pass,
  ERROR:          S.fail,
  SYNCING:        S.cyan,
};

const STATUS_LABELS: Record<ConnectorStatus, string> = {
  NOT_CONFIGURED: "NOT CONFIGURED",
  CONFIGURED:     "CONFIGURED",
  CONNECTED:      "CONNECTED",
  ERROR:          "ERROR",
  SYNCING:        "SYNCING",
};

// ── Connector definitions ─────────────────────────────────────────────────────
const CONNECTOR_DEFS: Omit<ConnectorState, "status" | "lastSync" | "recordsToday">[] = [
  {
    type:          "CSV",
    label:         "CSV / Excel Upload",
    description:   "Manual bulk import of trade positions from CSV or XLSX files. Supports custom column mapping, header detection, validation, and transformation rules.",
    icon:          "📂",
    href:          "/input?tab=upload",
    fieldCoverage: 100,
    systems:       ["CSV", "Excel", "XLSX", "Google Sheets export"],
    storageKey:    "ordr_csv_uploads",
  },
  {
    type:          "DATABASE",
    label:         "SQL Database",
    description:   "Direct SQL pull from Oracle, PostgreSQL, MySQL, or MS SQL Server. Configures host, credentials, schema, table name and pull schedule.",
    icon:          "🗄",
    href:          "/database-connection",
    fieldCoverage: 87,
    systems:       ["Oracle", "PostgreSQL", "MySQL", "MS SQL Server"],
    storageKey:    "ordr_db_config",
  },
  {
    type:          "ERP",
    label:         "ERP Integration",
    description:   "OAuth 2.0 connector for SAP, Oracle ERP, NetSuite, and Microsoft Dynamics. Full field mapping from ERP trade/invoice schema to ORDR TradeRow format.",
    icon:          "⚡",
    href:          "/erp-integration",
    fieldCoverage: 75,
    systems:       ["SAP S/4HANA", "Oracle ERP Cloud", "NetSuite", "MS Dynamics 365"],
    storageKey:    "ordr_erp_config",
  },
  {
    type:          "ACCOUNTING",
    label:         "Accounting Systems",
    description:   "Invoice and AR/AP import from QuickBooks Online, Xero, Sage 50/Intacct, and FreshBooks via OAuth 2.0 API connections.",
    icon:          "📊",
    href:          "/accounting-connection",
    fieldCoverage: 68,
    systems:       ["QuickBooks Online", "Xero", "Sage Intacct", "FreshBooks"],
    storageKey:    "ordr_accounting_config",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function detectConnectorStatus(storageKey: string): ConnectorStatus {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return "NOT_CONFIGURED";
    const obj = JSON.parse(raw);
    if (obj?.authorized === true)  return "CONNECTED";
    if (obj?.error)                return "ERROR";
    if (obj?.configured === true || (typeof obj === "object" && Object.keys(obj).length > 0)) return "CONFIGURED";
    return "NOT_CONFIGURED";
  } catch {
    return "NOT_CONFIGURED";
  }
}

function FieldCoverageBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{
        flex: 1, height: 4, background: S.soft, borderRadius: 2, overflow: "hidden",
      }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontFamily: S.fontMono, fontSize: 10, color, minWidth: 32 }}>{pct}%</span>
    </div>
  );
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{
      background: S.bgPanel, border: `1px solid ${S.rim}`,
      borderLeft: `3px solid ${color}`, borderRadius: 3,
      padding: "12px 16px",
    }}>
      <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontFamily: S.fontMono, fontSize: 22, fontWeight: 700, color: S.primary, lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: S.fontUI, fontSize: 10, color: S.tertiary, marginTop: 3 }}>{sub}</div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ConnectorsPage() {
  const _planAllowed = usePlanRedirect("professional");
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const renderTs = useRenderTs();

  const [connectors, setConnectors] = useState<ConnectorState[]>([]);
  const [runs, setRuns]             = useState<ConnectorRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError]   = useState<string | null>(null);
  const [filterType, setFilterType] = useState<ConnectorType | "ALL">("ALL");
  const [expandedCard, setExpandedCard] = useState<ConnectorType | null>(null);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace("/auth/login");
  }, [authLoading, isAuthenticated, router]);

  // Detect connector statuses from localStorage
  useEffect(() => {
    const states: ConnectorState[] = CONNECTOR_DEFS.map(def => ({
      ...def,
      status:       detectConnectorStatus(def.storageKey),
      lastSync:     localStorage.getItem(`${def.storageKey}_last_sync`) ?? null,
      recordsToday: Number(localStorage.getItem(`${def.storageKey}_records_today`) ?? 0),
    }));
    setConnectors(states);
  }, []);

  // Fetch connector runs
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    setRunsLoading(true);
    listConnectorRuns()
      .then(resp => { if (!cancelled) { setRuns(resp.items); setRunsLoading(false); } })
      .catch(err => { if (!cancelled) { setRunsError(String(err)); setRunsLoading(false); } });
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  // KPIs
  const totalConnectors  = connectors.length;
  const connectedCount   = connectors.filter(c => c.status === "CONNECTED").length;
  const configuredCount  = connectors.filter(c => c.status !== "NOT_CONFIGURED").length;
  const errorCount       = connectors.filter(c => c.status === "ERROR").length;
  const lastSyncTime     = runs[0]?.started_at
    ? new Date(runs[0].started_at).toLocaleString()
    : "—";
  const totalRunsToday   = runs.filter(r => {
    const d = new Date(r.started_at);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }).length;

  const filteredRuns = useMemo(() =>
    filterType === "ALL"
      ? runs
      : runs.filter(r => r.connector_type?.toUpperCase() === filterType),
    [runs, filterType],
  );

  if (!_planAllowed) return null;

  if (authLoading) {
    return (
      <div style={{ background: S.bgDeep, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, letterSpacing: "0.1em" }}>LOADING…</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
    <div style={{ background: S.bgDeep, minHeight: "100vh", fontFamily: S.fontUI, flex: 1 }}>

      {/* ── Top bar ── */}
      <div style={{
        height: 44, padding: "0 24px",
        background: S.bgPanel, borderBottom: `1px solid ${S.rim}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: S.primary }}>
            CONNECTORS
          </span>
          <span style={{ color: S.rim }}>|</span>
          <span style={{ fontFamily: S.fontMono, fontSize: 10, letterSpacing: "0.06em", color: S.tertiary }}>
            DATA PIPELINE HUB
          </span>
          {errorCount > 0 && (
            <span style={{
              fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.fail,
              background: `color-mix(in srgb, ${S.fail} 10%, transparent)`,
              border: `1px solid color-mix(in srgb, ${S.fail} 25%, transparent)`,
              padding: "1px 6px", borderRadius: 2, letterSpacing: "0.06em",
            }}>
              {errorCount} ERROR{errorCount > 1 ? "S" : ""}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a href="/import-history" style={{
            fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
            color: S.cyan, textDecoration: "none",
            border: `1px solid ${S.cyan}40`, borderRadius: 2, padding: "5px 12px",
          }}>
            IMPORT HISTORY →
          </a>
          <span suppressHydrationWarning style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
            {renderTs}
          </span>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "20px 24px 48px" }}>

        {/* KPI Strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
          <KpiCard label="TOTAL CONNECTORS"   value={`${totalConnectors}`}  color={S.cyan} />
          <KpiCard label="CONNECTED"          value={`${connectedCount}`}   color={S.pass}  sub={`${configuredCount} configured`} />
          <KpiCard label="ERRORS"             value={`${errorCount}`}       color={errorCount > 0 ? S.fail : S.tertiary} />
          <KpiCard label="RUNS TODAY"         value={`${totalRunsToday}`}   color={S.violet} />
          <KpiCard label="LAST SYNC"          value={lastSyncTime}          color={S.cyan} />
        </div>

        {/* Connector cards */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", color: S.tertiary, marginBottom: 12 }}>
            CONNECTOR STATUS
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            {connectors.map(conn => {
              const statusColor = STATUS_COLORS[conn.status];
              const isExpanded  = expandedCard === conn.type;
              return (
                <div
                  key={conn.type}
                  style={{
                    background: S.bgPanel, border: `1px solid ${S.rim}`,
                    borderLeft: `3px solid ${statusColor}`,
                    borderRadius: 3, overflow: "hidden",
                    transition: "border-color 0.15s",
                  }}
                >
                  {/* Card header */}
                  <div
                    style={{ padding: "14px 16px", cursor: "pointer" }}
                    onClick={() => setExpandedCard(isExpanded ? null : conn.type)}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 20, flexShrink: 0 }}>{conn.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 700, color: S.primary }}>
                            {conn.label}
                          </div>
                          <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, marginTop: 2, lineHeight: 1.4 }}>
                            {conn.description.slice(0, 80)}…
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                        <span style={{
                          fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                          letterSpacing: "0.06em", color: statusColor,
                          background: `color-mix(in srgb, ${statusColor} 10%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${statusColor} 25%, transparent)`,
                          padding: "2px 7px", borderRadius: 2,
                        }}>
                          {STATUS_LABELS[conn.status]}
                        </span>
                        <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>
                          {isExpanded ? "▲ COLLAPSE" : "▼ DETAILS"}
                        </span>
                      </div>
                    </div>

                    {/* Mini stats row */}
                    <div style={{
                      display: "flex", gap: 16, marginTop: 10,
                      paddingTop: 10, borderTop: `1px solid ${S.soft}`,
                    }}>
                      <div>
                        <div style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, marginBottom: 2, letterSpacing: "0.07em" }}>LAST SYNC</div>
                        <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary }}>
                          {conn.lastSync ? new Date(conn.lastSync).toLocaleString() : "Never"}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, marginBottom: 2, letterSpacing: "0.07em" }}>RECORDS TODAY</div>
                        <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary }}>{conn.recordsToday.toLocaleString()}</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, marginBottom: 4, letterSpacing: "0.07em" }}>FIELD COVERAGE</div>
                        <FieldCoverageBar
                          pct={conn.fieldCoverage}
                          color={conn.fieldCoverage >= 90 ? S.pass : conn.fieldCoverage >= 70 ? S.amber : S.fail}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div style={{ borderTop: `1px solid ${S.rim}`, padding: "14px 16px", background: S.bgSub }}>
                      {/* Description */}
                      <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, lineHeight: 1.6, marginBottom: 12 }}>
                        {conn.description}
                      </div>
                      {/* Supported systems */}
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", color: S.tertiary, marginBottom: 6 }}>
                          SUPPORTED SYSTEMS
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {conn.systems.map(sys => (
                            <span key={sys} style={{
                              fontFamily: S.fontMono, fontSize: 9, color: S.secondary,
                              background: S.bgPanel, border: `1px solid ${S.rim}`,
                              padding: "2px 7px", borderRadius: 2,
                            }}>
                              {sys}
                            </span>
                          ))}
                        </div>
                      </div>
                      {/* Status message */}
                      {conn.status === "NOT_CONFIGURED" && (
                        <div style={{
                          background: `color-mix(in srgb, ${S.amber} 6%, transparent)`,
                          border: `1px solid ${S.amber}30`,
                          borderLeft: `3px solid ${S.amber}`,
                          borderRadius: 2, padding: "8px 12px", marginBottom: 12,
                          fontFamily: S.fontUI, fontSize: 11, color: S.secondary,
                        }}>
                          This connector is not yet configured. Click Configure to set up credentials and field mappings.
                        </div>
                      )}
                      {conn.status === "ERROR" && (
                        <div style={{
                          background: `color-mix(in srgb, ${S.fail} 6%, transparent)`,
                          border: `1px solid ${S.fail}30`,
                          borderLeft: `3px solid ${S.fail}`,
                          borderRadius: 2, padding: "8px 12px", marginBottom: 12,
                          fontFamily: S.fontUI, fontSize: 11, color: S.secondary,
                        }}>
                          Connector is reporting an error. Check credentials, network access, and field mapping schema.
                        </div>
                      )}
                      {/* Action buttons */}
                      <div style={{ display: "flex", gap: 8 }}>
                        <a
                          href={conn.href}
                          style={{
                            fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                            color: "#000", background: S.cyan,
                            border: "none", borderRadius: 2, padding: "6px 14px",
                            textDecoration: "none", display: "inline-block",
                          }}
                        >
                          {conn.status === "NOT_CONFIGURED" ? "CONFIGURE →" : "MANAGE →"}
                        </a>
                        <a
                          href="/import-history"
                          style={{
                            fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                            color: S.secondary, background: "transparent",
                            border: `1px solid ${S.rim}`, borderRadius: 2, padding: "6px 14px",
                            textDecoration: "none", display: "inline-block",
                          }}
                        >
                          VIEW RUNS →
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Field mapping health matrix */}
        <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 3, marginBottom: 20, overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${S.rim}` }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary }}>
              FIELD MAPPING COVERAGE
            </span>
          </div>
          <div style={{ padding: "14px 16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
              {connectors.map(conn => {
                const color = conn.fieldCoverage >= 90 ? S.pass : conn.fieldCoverage >= 70 ? S.amber : S.fail;
                return (
                  <div key={conn.type}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary }}>{conn.label}</span>
                    </div>
                    <FieldCoverageBar pct={conn.fieldCoverage} color={color} />
                    <div style={{ fontFamily: S.fontUI, fontSize: 10, color: S.tertiary, marginTop: 3 }}>
                      {conn.fieldCoverage >= 90
                        ? "All required fields mapped"
                        : conn.fieldCoverage >= 70
                        ? "Some optional fields unmapped"
                        : "Critical fields may be missing"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Recent runs */}
        <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 3, overflow: "hidden" }}>
          <div style={{
            padding: "10px 16px", borderBottom: `1px solid ${S.rim}`,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap",
          }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary }}>
              RECENT CONNECTOR RUNS
            </span>
            {/* Filter chips */}
            <div style={{ display: "flex", gap: 6 }}>
              {(["ALL", "CSV", "DATABASE", "ERP", "ACCOUNTING"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilterType(f)}
                  style={{
                    fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.05em",
                    color: filterType === f ? "#000" : S.tertiary,
                    background: filterType === f ? S.cyan : "transparent",
                    border: `1px solid ${filterType === f ? S.cyan : S.rim}`,
                    borderRadius: 2, padding: "3px 8px", cursor: "pointer",
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
            <a href="/import-history" style={{ fontFamily: S.fontMono, fontSize: 10, color: S.cyan, textDecoration: "none" }}>
              FULL HISTORY →
            </a>
          </div>

          {/* Run table */}
          {runsLoading ? (
            <div style={{ padding: "32px", textAlign: "center", fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
              LOADING RUNS…
            </div>
          ) : runsError ? (
            <div style={{ padding: "16px", background: `color-mix(in srgb, ${S.amber} 5%, transparent)`, borderLeft: `3px solid ${S.amber}`, margin: 12, borderRadius: 2 }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.amber }}>⚠ Could not load connector runs — {runsError}</span>
            </div>
          ) : filteredRuns.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center" }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
                No runs found for selected filter.
              </div>
              <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, marginTop: 6 }}>
                Configure a connector and trigger a sync to see runs here.
              </div>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                  {["RUN ID", "CONNECTOR", "STARTED", "DURATION", "RECORDS", "STATUS", "TRIGGERED BY"].map(h => (
                    <th key={h} style={{
                      fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.07em",
                      color: S.tertiary, padding: "7px 12px", textAlign: "left", whiteSpace: "nowrap",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRuns.slice(0, 20).map((run, i) => {
                  const dur = run.completed_at
                    ? `${Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)}s`
                    : "—";
                  const statusColor = run.status === "COMPLETED" ? S.pass
                    : run.status === "FAILED" ? S.fail
                    : run.status === "RUNNING" ? S.cyan
                    : S.amber;
                  return (
                    <tr key={run.id} style={{
                      borderBottom: `1px solid ${S.soft}`,
                      background: i % 2 === 0 ? "transparent" : `color-mix(in srgb, ${S.bgSub} 40%, transparent)`,
                    }}>
                      <td style={{ padding: "8px 12px", fontFamily: S.fontMono, fontSize: 10, color: S.cyan }}>
                        {run.id.slice(0, 10)}…
                      </td>
                      <td style={{ padding: "8px 12px", fontFamily: S.fontMono, fontSize: 10, color: S.secondary }}>
                        {run.connector_type ?? "—"}
                      </td>
                      <td style={{ padding: "8px 12px", fontFamily: S.fontMono, fontSize: 10, color: S.secondary, whiteSpace: "nowrap" }}>
                        {new Date(run.started_at).toLocaleString()}
                      </td>
                      <td style={{ padding: "8px 12px", fontFamily: S.fontMono, fontSize: 10, color: S.secondary }}>
                        {dur}
                      </td>
                      <td style={{ padding: "8px 12px", fontFamily: S.fontMono, fontSize: 10, color: S.secondary }}>
                        {run.total_rows.toLocaleString()}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        <span style={{
                          fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                          color: statusColor,
                          background: `color-mix(in srgb, ${statusColor} 10%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${statusColor} 25%, transparent)`,
                          padding: "1px 6px", borderRadius: 2, letterSpacing: "0.05em",
                        }}>
                          {run.status}
                        </span>
                      </td>
                      <td style={{ padding: "8px 12px", fontFamily: S.fontUI, fontSize: 11, color: S.secondary }}>
                        {run.triggered_by}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Quick action strip */}
        <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[
            { label: "UPLOAD CSV FILE",     href: "/input?tab=upload",       color: S.cyan   },
            { label: "CONFIGURE DATABASE",  href: "/database-connection",    color: S.cyan   },
            { label: "SETUP ERP",           href: "/erp-integration",        color: S.amber  },
            { label: "CONNECT ACCOUNTING",  href: "/accounting-connection",  color: S.pass   },
            { label: "VIEW ALL IMPORTS",    href: "/import-history",         color: S.tertiary},
            { label: "SETTINGS →",          href: "/settings",               color: S.violet },
          ].map(a => (
            <a
              key={a.label}
              href={a.href}
              style={{
                fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
                color: a.color, textDecoration: "none",
                border: `1px solid ${a.color}40`, borderRadius: 2,
                padding: "6px 14px",
                background: `color-mix(in srgb, ${a.color} 5%, transparent)`,
              }}
            >
              {a.label}
            </a>
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{
        height: 32, display: "flex", alignItems: "center", justifyContent: "center",
        borderTop: `1px solid ${S.rim}`, background: S.bgPanel,
      }}>
        <span suppressHydrationWarning style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.05em" }}>
          {renderTs} · ORDR Connectors Hub · {connectors.filter(c => c.status !== "NOT_CONFIGURED").length}/{CONNECTOR_DEFS.length} configured
        </span>
      </div>
    </div>
    <HelpPanel config={CONNECTORS_HELP} storageKey="connectors" />
    </div>
  );
}
