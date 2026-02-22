"use client";

/**
 * execution-history/page.tsx -- Execution History
 *
 * Full audit trail of all hedge executions across the ORDR pipeline.
 * Displays ledger entries with status tracking, approval chain details,
 * and hash-integrity verification for a Mexican manufacturing treasury desk.
 */

import { useState, useEffect } from "react";
import { useAuth } from "../../lib/authContext";
import { useRouter } from "next/navigation";
import EmptyState from "../../components/ui/EmptyState";

// -- Hydration-safe timestamp hook ------------------------------------------------
function useRenderTs(): string {
  const [renderTs, setRenderTs] = useState('');
  useEffect(() => {
    setRenderTs(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
  }, []);
  return renderTs;
}

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

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

// -- Demo execution data ----------------------------------------------------------
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

const DEMO_EXECUTIONS: ExecutionRow[] = [
  {
    ledgerId: "LDG-2026-0047",
    stagingId: "STG-0089",
    status: "SETTLED",
    notional: 3200000,
    currencyPair: "USD/MXN",
    instrument: "Forward 6M",
    authorizedBy: "Maria Torres (CFO)",
    timestamp: "2026-02-20 16:45",
    counterparty: "Citibanamex",
    rate: "17.4520",
    settlementDate: "2026-08-20",
    hashIntegrity: "VERIFIED",
    approvalChain: [
      { name: "Carlos Reyes", role: "Head of Risk", ts: "2026-02-20 14:30" },
      { name: "Maria Torres", role: "CFO", ts: "2026-02-20 15:15" },
    ],
    stagingSummary: "6M USD/MXN forward hedge covering Q3 payables exposure from US supplier contracts.",
  },
  {
    ledgerId: "LDG-2026-0046",
    stagingId: "STG-0088",
    status: "EXECUTED",
    notional: 1800000,
    currencyPair: "EUR/MXN",
    instrument: "Collar 3M",
    authorizedBy: "Carlos Reyes (Head of Risk)",
    timestamp: "2026-02-19 11:20",
    counterparty: "BBVA Mexico",
    rate: "18.9350 / 19.4200",
    settlementDate: "2026-05-19",
    hashIntegrity: "VERIFIED",
    approvalChain: [
      { name: "Ana Lopez", role: "Treasury Analyst", ts: "2026-02-19 09:00" },
      { name: "Carlos Reyes", role: "Head of Risk", ts: "2026-02-19 10:45" },
    ],
    stagingSummary: "3M EUR/MXN collar for European raw material imports. Floor 18.93, Cap 19.42.",
  },
  {
    ledgerId: "LDG-2026-0045",
    stagingId: "STG-0087",
    status: "AUTHORIZED",
    notional: 5500000,
    currencyPair: "USD/MXN",
    instrument: "Forward 12M",
    authorizedBy: "Maria Torres (CFO)",
    timestamp: "2026-02-18 09:15",
    counterparty: "Santander Mexico",
    rate: "17.8900",
    settlementDate: "2027-02-18",
    hashIntegrity: "VERIFIED",
    approvalChain: [
      { name: "Carlos Reyes", role: "Head of Risk", ts: "2026-02-17 16:00" },
      { name: "Maria Torres", role: "CFO", ts: "2026-02-18 09:10" },
    ],
    stagingSummary: "12M USD/MXN forward for annual capital equipment purchase program.",
  },
  {
    ledgerId: "LDG-2026-0044",
    stagingId: "STG-0086",
    status: "SETTLED",
    notional: 2100000,
    currencyPair: "USD/MXN",
    instrument: "NDF 3M",
    authorizedBy: "Carlos Reyes",
    timestamp: "2026-02-15 14:30",
    counterparty: "JPMorgan Mexico",
    rate: "17.3100",
    settlementDate: "2026-05-15",
    hashIntegrity: "VERIFIED",
    approvalChain: [
      { name: "Ana Lopez", role: "Treasury Analyst", ts: "2026-02-15 11:00" },
      { name: "Carlos Reyes", role: "Head of Risk", ts: "2026-02-15 13:45" },
    ],
    stagingSummary: "3M NDF hedge for non-deliverable USD/MXN exposure on intercompany transfers.",
  },
  {
    ledgerId: "LDG-2026-0043",
    stagingId: "STG-0085",
    status: "FAILED",
    notional: 900000,
    currencyPair: "GBP/MXN",
    instrument: "Option Put",
    authorizedBy: "Auto-System",
    timestamp: "2026-02-14 10:00",
    counterparty: "HSBC Mexico",
    rate: "N/A",
    settlementDate: "N/A",
    hashIntegrity: "PENDING",
    approvalChain: [
      { name: "Auto-System", role: "Automated Rule", ts: "2026-02-14 09:55" },
    ],
    stagingSummary: "GBP/MXN put option failed: counterparty credit limit exceeded. Requires manual review.",
  },
  {
    ledgerId: "LDG-2026-0042",
    stagingId: "STG-0084",
    status: "SETTLED",
    notional: 4700000,
    currencyPair: "USD/MXN",
    instrument: "Forward 6M",
    authorizedBy: "Maria Torres (CFO)",
    timestamp: "2026-02-12 15:45",
    counterparty: "Citibanamex",
    rate: "17.3850",
    settlementDate: "2026-08-12",
    hashIntegrity: "VERIFIED",
    approvalChain: [
      { name: "Carlos Reyes", role: "Head of Risk", ts: "2026-02-12 13:00" },
      { name: "Maria Torres", role: "CFO", ts: "2026-02-12 14:30" },
    ],
    stagingSummary: "6M forward hedge covering Q3 USD payables to primary US manufacturing partner.",
  },
  {
    ledgerId: "LDG-2026-0041",
    stagingId: "STG-0083",
    status: "CANCELLED",
    notional: 1200000,
    currencyPair: "JPY/MXN",
    instrument: "Forward 3M",
    authorizedBy: "Carlos Reyes",
    timestamp: "2026-02-10 08:30",
    counterparty: "Mizuho Mexico",
    rate: "N/A",
    settlementDate: "N/A",
    hashIntegrity: "PENDING",
    approvalChain: [
      { name: "Carlos Reyes", role: "Head of Risk", ts: "2026-02-10 08:25" },
    ],
    stagingSummary: "3M JPY/MXN forward cancelled: underlying purchase order was rescinded by procurement.",
  },
  {
    ledgerId: "LDG-2026-0040",
    stagingId: "STG-0082",
    status: "SETTLED",
    notional: 6800000,
    currencyPair: "USD/MXN",
    instrument: "Collar 12M",
    authorizedBy: "Maria Torres (CFO)",
    timestamp: "2026-02-08 16:00",
    counterparty: "Santander Mexico",
    rate: "17.1500 / 17.9200",
    settlementDate: "2027-02-08",
    hashIntegrity: "VERIFIED",
    approvalChain: [
      { name: "Ana Lopez", role: "Treasury Analyst", ts: "2026-02-08 10:00" },
      { name: "Carlos Reyes", role: "Head of Risk", ts: "2026-02-08 13:00" },
      { name: "Maria Torres", role: "CFO", ts: "2026-02-08 15:30" },
    ],
    stagingSummary: "12M USD/MXN collar for annual hedging program. Floor 17.15, Cap 17.92.",
  },
];

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
              <div style={sectionHeader}>LEDGER ENTRY DETAILS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { label: "Ledger ID", value: row.ledgerId },
                  { label: "Staging ID", value: row.stagingId },
                  { label: "Currency Pair", value: row.currencyPair },
                  { label: "Instrument", value: row.instrument },
                  { label: "Notional", value: `$${row.notional.toLocaleString("en-US")}` },
                  { label: "Timestamp", value: row.timestamp },
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
              <div style={sectionHeader}>EXECUTION DETAILS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { label: "Counterparty", value: row.counterparty },
                  { label: "Rate", value: row.rate },
                  { label: "Settlement Date", value: row.settlementDate },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div style={detailLabel}>{label}</div>
                    <div style={detailValue}>{value}</div>
                  </div>
                ))}
                <div>
                  <div style={detailLabel}>STAGING SUMMARY</div>
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
              <div style={sectionHeader}>APPROVAL CHAIN</div>
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
  const { isAuthenticated, token, user, isDemoMode } = useAuth();
  const router = useRouter();

  // -- Filter state ---------------------------------------------------------------
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ExecutionStatus>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // -- Pagination state -----------------------------------------------------------
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;
  const totalEntries = 23;

  // -- Auth guard -----------------------------------------------------------------
  if (!isAuthenticated) {
    router.push("/auth/login");
    return null;
  }

  // -- Empty state when not demo ---------------------------------------------------
  if (!DEMO_MODE && !isDemoMode) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: S.bgDeep,
        fontFamily: S.fontUI,
        color: S.primary,
      }}>
        {/* TopBar */}
        <header style={{
          display: "flex", alignItems: "center", gap: 12, height: 44,
          padding: "0 20px", background: S.bgPanel, borderBottom: `1px solid ${S.rim}`, flexShrink: 0,
        }}>
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
          <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>{renderTs}</span>
        </header>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
          <EmptyState
            type="empty"
            title="No Execution History"
            message="No executions recorded. Complete the execution pipeline to see history."
          />
        </div>

        {/* Footer */}
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

  // -- Filter logic ---------------------------------------------------------------
  const filteredData = DEMO_EXECUTIONS.filter(row => {
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
  });

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

  // -- Format notional ------------------------------------------------------------
  function fmtNotional(n: number): string {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toLocaleString("en-US")}`;
  }

  function handleExportCSV() {
    // Demo: create CSV content and download
    const headers = ["Ledger ID", "Staging ID", "Status", "Notional (USD)", "Currency Pair", "Instrument", "Authorized By", "Timestamp"];
    const rows = filteredData.map(r => [
      r.ledgerId, r.stagingId, r.status, r.notional.toString(),
      r.currencyPair, r.instrument, r.authorizedBy, r.timestamp,
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
            <KPICard label="Total Executions" value="23" badge="ALL TIME" badgeColor={S.tertiary} />
            <KPICard label="Total Notional Executed" value="$47.2M USD" badge="HEDGED" badgeColor={S.cyan} />
            <KPICard label="Average Execution Time" value="4.2 min" badge="AVG" badgeColor={S.amber} />
            <KPICard label="Success Rate" value="95.7%" badge="RATE" badgeColor={S.pass} />
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
                placeholder="Ledger ID or counterparty..."
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
                  {["LEDGER ID", "STAGING ID", "STATUS", "NOTIONAL (USD)", "CURRENCY PAIR", "INSTRUMENT", "AUTHORIZED BY", "TIMESTAMP", "ACTIONS"].map(h => (
                    <th key={h} style={{
                      ...thStyle,
                      textAlign: h === "NOTIONAL (USD)" ? "right" : "left",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: 40, textAlign: "center" }}>
                      <span style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary }}>
                        No executions match your filters.
                      </span>
                    </td>
                  </tr>
                ) : (
                  filteredData.map((row, i) => {
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
                          {/* Ledger ID */}
                          <td style={{ ...tdStyle, fontWeight: 600, color: S.cyan }}>
                            {row.ledgerId}
                          </td>
                          {/* Staging ID */}
                          <td style={{ ...tdStyle, color: S.secondary }}>
                            {row.stagingId}
                          </td>
                          {/* Status */}
                          <td style={{ ...tdStyle }}>
                            <StatusBadge status={row.status} />
                          </td>
                          {/* Notional */}
                          <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>
                            ${row.notional.toLocaleString("en-US")}
                          </td>
                          {/* Currency Pair */}
                          <td style={tdStyle}>
                            {row.currencyPair}
                          </td>
                          {/* Instrument */}
                          <td style={{ ...tdStyle, color: S.secondary }}>
                            {row.instrument}
                          </td>
                          {/* Authorized By */}
                          <td style={{ ...tdStyle, fontFamily: S.fontUI, color: S.secondary }}>
                            {row.authorizedBy}
                          </td>
                          {/* Timestamp */}
                          <td style={{ ...tdStyle, color: S.tertiary }}>
                            {row.timestamp}
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
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ------ Pagination ------ */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 4px",
          }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
              Showing 1-{Math.min(filteredData.length, pageSize)} of {totalEntries} entries
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              {[1, 2, 3].map(page => (
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
