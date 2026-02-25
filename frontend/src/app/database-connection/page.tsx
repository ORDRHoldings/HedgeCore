"use client";

/**
 * database-connection/page.tsx — Database Connection
 *
 * Position Desk > Connect Database
 * Configure a SQL data source, map columns to ORDR TradeRow fields,
 * preview import data, and view import history.
 */

import { useState, useEffect } from "react";
import { useAuth } from "../../lib/authContext";
import { useRouter } from "next/navigation";
import EmptyState from "../../components/ui/EmptyState";
import HelpPanel from "@/components/layout/HelpPanel";
import { DATABASE_CONNECTION_HELP } from "@/lib/helpContent";

// ── Hydration-safe timestamp hook ─────────────────────────────────────────────
function useRenderTs(): string {
  const [renderTs, setRenderTs] = useState('');
  useEffect(() => {
    setRenderTs(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
  }, []);
  return renderTs;
}

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

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
  pass:     "var(--status-pass)",
  fail:     "var(--accent-red,#B91C1C)",
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────
type DbDriver = "PostgreSQL" | "MySQL" | "Microsoft SQL Server" | "Oracle DB";
type QueryMode = "table" | "query";
type MappingStatus = "MAPPED" | "PENDING" | "UNMAPPED";
type ImportStatus = "SUCCESS" | "FAILED" | "PARTIAL";

interface ColumnMapping {
  sourceColumn: string;
  dataType: string;
  ordrField: string;
  transform: string;
  status: MappingStatus;
}

interface ImportRun {
  runId: string;
  timestamp: string;
  rowsImported: number;
  status: ImportStatus;
}

interface PreviewRow {
  trade_ref: string;
  currency: string;
  notional: string;
  trade_date: string;
  settlement_date: string;
  counterparty: string;
  direction: string;
  forward_rate: string;
}

// ── Default ports per driver ──────────────────────────────────────────────────
const DEFAULT_PORTS: Record<DbDriver, number> = {
  "PostgreSQL": 5432,
  "MySQL": 3306,
  "Microsoft SQL Server": 1433,
  "Oracle DB": 1521,
};

// ── Demo data ─────────────────────────────────────────────────────────────────
const DEMO_MAPPINGS: ColumnMapping[] = [
  { sourceColumn: "trade_ref",        dataType: "VARCHAR",   ordrField: "trade_ref",       transform: "\u2014",         status: "MAPPED" },
  { sourceColumn: "currency_code",    dataType: "CHAR(3)",   ordrField: "currency",        transform: "UPPERCASE",   status: "MAPPED" },
  { sourceColumn: "notional_amount",  dataType: "DECIMAL",   ordrField: "notional",        transform: "ABS()",       status: "MAPPED" },
  { sourceColumn: "trade_date",       dataType: "DATE",      ordrField: "trade_date",      transform: "ISO_FORMAT",  status: "MAPPED" },
  { sourceColumn: "settlement_date",  dataType: "DATE",      ordrField: "settlement_date", transform: "ISO_FORMAT",  status: "MAPPED" },
  { sourceColumn: "counterparty",     dataType: "VARCHAR",   ordrField: "counterparty",    transform: "\u2014",         status: "MAPPED" },
  { sourceColumn: "direction",        dataType: "VARCHAR",   ordrField: "direction",       transform: "ENUM_MAP",    status: "PENDING" },
  { sourceColumn: "fx_rate",          dataType: "DECIMAL",   ordrField: "forward_rate",    transform: "\u2014",         status: "MAPPED" },
];

const DEMO_PREVIEW: PreviewRow[] = [
  { trade_ref: "MFG-2026-00147", currency: "USD", notional: "2,450,000.00",  trade_date: "2026-02-10", settlement_date: "2026-04-10", counterparty: "Banamex",        direction: "BUY",  forward_rate: "19.1240" },
  { trade_ref: "MFG-2026-00148", currency: "EUR", notional: "1,820,000.00",  trade_date: "2026-02-11", settlement_date: "2026-05-11", counterparty: "BBVA Mexico",    direction: "SELL", forward_rate: "20.6380" },
  { trade_ref: "MFG-2026-00149", currency: "USD", notional: "3,100,000.00",  trade_date: "2026-02-12", settlement_date: "2026-06-12", counterparty: "Santander MX",   direction: "BUY",  forward_rate: "19.2870" },
  { trade_ref: "MFG-2026-00150", currency: "JPY", notional: "185,000,000",   trade_date: "2026-02-13", settlement_date: "2026-05-13", counterparty: "MUFG Mexico",    direction: "BUY",  forward_rate: "0.1268" },
  { trade_ref: "MFG-2026-00151", currency: "USD", notional: "4,750,000.00",  trade_date: "2026-02-14", settlement_date: "2026-08-14", counterparty: "Banamex",        direction: "SELL", forward_rate: "19.4510" },
];

const DEMO_IMPORT_HISTORY: ImportRun[] = [
  { runId: "RUN-A8F2C1", timestamp: "2026-02-22 06:00:14 UTC", rowsImported: 342,  status: "SUCCESS" },
  { runId: "RUN-7D91E4", timestamp: "2026-02-21 06:00:09 UTC", rowsImported: 338,  status: "SUCCESS" },
  { runId: "RUN-3B20F8", timestamp: "2026-02-20 06:00:22 UTC", rowsImported: 0,    status: "FAILED" },
  { runId: "RUN-C4E67A", timestamp: "2026-02-19 06:01:03 UTC", rowsImported: 291,  status: "PARTIAL" },
  { runId: "RUN-19DA5C", timestamp: "2026-02-18 06:00:11 UTC", rowsImported: 335,  status: "SUCCESS" },
];

const PREVIEW_COLUMNS: { key: keyof PreviewRow; label: string }[] = [
  { key: "trade_ref",       label: "Trade Ref" },
  { key: "currency",        label: "CCY" },
  { key: "notional",        label: "Notional" },
  { key: "trade_date",      label: "Trade Date" },
  { key: "settlement_date", label: "Settle Date" },
  { key: "counterparty",    label: "Counterparty" },
  { key: "direction",       label: "Dir" },
  { key: "forward_rate",    label: "Fwd Rate" },
];

// ── Status badge colors ───────────────────────────────────────────────────────
function statusColor(status: MappingStatus | ImportStatus): string {
  if (status === "MAPPED" || status === "SUCCESS") return S.pass;
  if (status === "PENDING" || status === "PARTIAL") return S.amber;
  return S.fail;
}

// ── Sub-tabs ──────────────────────────────────────────────────────────────────
type PageTab = "config" | "mapping" | "import";

const TABS: { key: PageTab; label: string }[] = [
  { key: "config",  label: "Connection" },
  { key: "mapping", label: "Field Mapping" },
  { key: "import",  label: "Import & History" },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Page Component
// ═══════════════════════════════════════════════════════════════════════════════
export default function DatabaseConnectionPage() {
  const renderTs = useRenderTs();
  const { isAuthenticated, token, user, isDemoMode } = useAuth();
  const router = useRouter();

  // Auth guard
  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/auth/login");
    }
  }, [isAuthenticated, router]);

  // State
  const [activeTab, setActiveTab] = useState<PageTab>("config");
  const [driver, setDriver] = useState<DbDriver>("PostgreSQL");
  const [host, setHost] = useState("db.aceros-del-norte.mx");
  const [port, setPort] = useState<number>(5432);
  const [dbName, setDbName] = useState("fx_treasury_prod");
  const [schema, setSchema] = useState("public");
  const [queryMode, setQueryMode] = useState<QueryMode>("table");
  const [tableName, setTableName] = useState("fx_trade_positions");
  const [customQuery, setCustomQuery] = useState("SELECT * FROM fx_trade_positions WHERE trade_date >= CURRENT_DATE - INTERVAL '90 days'");
  const [username, setUsername] = useState("svc_ordr_reader");
  const [connectionTested, setConnectionTested] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  // Update port when driver changes
  useEffect(() => {
    setPort(DEFAULT_PORTS[driver]);
  }, [driver]);

  if (!isAuthenticated) return null;

  // ── Non-demo empty state ──────────────────────────────────────────────────
  if (!DEMO_MODE && !isDemoMode) {
    return (
      <div style={{
        background: S.bgDeep, minHeight: "100vh", fontFamily: S.fontUI,
        display: "flex", flexDirection: "column",
      }}>
        <TopBar renderTs={renderTs} onBack={() => router.push("/input")} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
          <EmptyState
            type="empty"
            title="No Database Configured"
            message="Configure a SQL data source to pull FX positions into ORDR."
          />
        </div>
        <Footer renderTs={renderTs} />
      </div>
    );
  }

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleTestConnection = () => {
    setTestingConnection(true);
    setTimeout(() => {
      setTestingConnection(false);
      setConnectionTested(true);
    }, 1800);
  };

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <div style={{
      background: S.bgDeep, minHeight: "100vh", fontFamily: S.fontUI,
      display: "flex", flexDirection: "column",
    }}>
      {/* TopBar */}
      <TopBar renderTs={renderTs} onBack={() => router.push("/input")} />

      {/* Tab bar */}
      <div style={{
        height: 36, display: "flex", alignItems: "stretch",
        background: S.bgPanel, borderBottom: `1px solid ${S.rim}`,
        padding: "0 20px", gap: 0, flexShrink: 0,
      }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              fontFamily: S.fontUI, fontSize: "0.6875rem", fontWeight: activeTab === tab.key ? 600 : 400,
              padding: "0 16px", border: "none",
              borderBottom: activeTab === tab.key ? `2px solid ${S.cyan}` : "2px solid transparent",
              color: activeTab === tab.key ? S.cyan : S.tertiary,
              background: "transparent", cursor: "pointer",
              display: "flex", alignItems: "center",
              transition: "color 0.15s, border-color 0.15s",
              letterSpacing: "0.04em",
            }}
          >
            {tab.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {connectionTested && (
          <span style={{
            fontFamily: S.fontMono, fontSize: "0.625rem", color: S.pass,
            display: "flex", alignItems: "center", gap: 4, letterSpacing: "0.06em",
          }}>
            CONNECTED
          </span>
        )}
      </div>

      {/* Content area */}
      <div style={{
        flex: 1, maxWidth: 1440, width: "100%", margin: "0 auto",
        padding: "24px 24px 16px",
      }}>
        {activeTab === "config" && (
          <ConnectionConfigPanel
            driver={driver} setDriver={setDriver}
            host={host} setHost={setHost}
            port={port} setPort={setPort}
            dbName={dbName} setDbName={setDbName}
            schema={schema} setSchema={setSchema}
            queryMode={queryMode} setQueryMode={setQueryMode}
            tableName={tableName} setTableName={setTableName}
            customQuery={customQuery} setCustomQuery={setCustomQuery}
            username={username} setUsername={setUsername}
            connectionTested={connectionTested}
            testingConnection={testingConnection}
            onTestConnection={handleTestConnection}
          />
        )}
        {activeTab === "mapping" && <FieldMappingPanel />}
        {activeTab === "import" && <ImportPreviewPanel />}

        {/* Action Row */}
        <ActionRow
          activeTab={activeTab}
          testingConnection={testingConnection}
          onTestConnection={handleTestConnection}
        />
      </div>

      {/* Footer */}
      <Footer renderTs={renderTs} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TopBar
// ═══════════════════════════════════════════════════════════════════════════════
function TopBar({ renderTs, onBack }: { renderTs: string; onBack: () => void }) {
  return (
    <header style={{
      display: "flex", alignItems: "center", gap: 12, height: 44,
      padding: "0 20px", background: S.bgPanel, borderBottom: `1px solid ${S.rim}`,
      flexShrink: 0,
    }}>
      <button onClick={onBack} style={{
        fontFamily: S.fontMono, fontSize: "0.75rem", color: S.tertiary,
        background: "transparent", border: `1px solid ${S.rim}`,
        padding: "2px 8px", cursor: "pointer", letterSpacing: "0.04em",
      }}>{"\u2190"} Position Desk</button>
      <span style={{ color: S.rim, userSelect: "none" }}>|</span>
      <span style={{
        fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 700,
        letterSpacing: "0.06em", textTransform: "uppercase", color: S.primary,
      }}>
        Database Connection
      </span>
      <span style={{
        fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.08em",
        color: S.secondary, padding: "1px 5px", border: `1px solid ${S.rim}`,
      }}>SQL {"\u2192"} ORDR</span>
      <div style={{ flex: 1 }} />
      <span style={{
        fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary,
        letterSpacing: "0.04em",
      }}>
        AS OF {renderTs}
      </span>
    </header>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Footer
// ═══════════════════════════════════════════════════════════════════════════════
function Footer({ renderTs }: { renderTs: string }) {
  return (
    <footer style={{
      height: 32, display: "flex", alignItems: "center", justifyContent: "center",
      borderTop: `1px solid ${S.rim}`, background: S.bgPanel, flexShrink: 0,
    }}>
      <span suppressHydrationWarning style={{
        fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary,
        letterSpacing: "0.06em",
      }}>
        {renderTs} {"\u2014"} ORDR {"\u00B7"} Database Connection
      </span>
    </footer>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Connection Configuration Panel
// ═══════════════════════════════════════════════════════════════════════════════
interface ConnectionConfigProps {
  driver: DbDriver;       setDriver: (v: DbDriver) => void;
  host: string;           setHost: (v: string) => void;
  port: number;           setPort: (v: number) => void;
  dbName: string;         setDbName: (v: string) => void;
  schema: string;         setSchema: (v: string) => void;
  queryMode: QueryMode;   setQueryMode: (v: QueryMode) => void;
  tableName: string;      setTableName: (v: string) => void;
  customQuery: string;    setCustomQuery: (v: string) => void;
  username: string;       setUsername: (v: string) => void;
  connectionTested: boolean;
  testingConnection: boolean;
  onTestConnection: () => void;
}

function ConnectionConfigPanel({
  driver, setDriver, host, setHost, port, setPort,
  dbName, setDbName, schema, setSchema,
  queryMode, setQueryMode, tableName, setTableName,
  customQuery, setCustomQuery, username, setUsername,
  connectionTested, testingConnection,
}: ConnectionConfigProps) {
  const inputStyle: React.CSSProperties = {
    fontFamily: S.fontMono, fontSize: "0.75rem", color: S.primary,
    background: S.bgDeep, border: `1px solid ${S.rim}`,
    padding: "7px 10px", width: "100%", outline: "none",
    letterSpacing: "0.02em",
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: S.fontUI, fontSize: "0.6875rem", fontWeight: 600,
    color: S.secondary, marginBottom: 4, display: "block",
    letterSpacing: "0.04em", textTransform: "uppercase",
  };
  const selectStyle: React.CSSProperties = {
    ...inputStyle, cursor: "pointer", appearance: "none" as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.2'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center",
    paddingRight: 28,
  };

  return (
    <div style={{
      background: S.bgPanel, border: `1px solid ${S.rim}`, padding: 20,
      marginBottom: 20,
    }}>
      {/* Section header */}
      <div style={{
        display: "flex", alignItems: "baseline", gap: 10, marginBottom: 18,
        borderBottom: `1px solid ${S.soft}`, paddingBottom: 10,
      }}>
        <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.06em" }}>01</span>
        <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600, color: S.primary }}>Connection Configuration</span>
        {connectionTested && (
          <span style={{
            fontFamily: S.fontMono, fontSize: "0.625rem", color: S.pass,
            marginLeft: "auto", letterSpacing: "0.06em",
          }}>VERIFIED</span>
        )}
      </div>

      {/* Row 1: Driver, Host, Port */}
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 100px", gap: 16, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Database Driver</label>
          <select
            value={driver}
            onChange={e => setDriver(e.target.value as DbDriver)}
            style={selectStyle}
          >
            <option>PostgreSQL</option>
            <option>MySQL</option>
            <option>Microsoft SQL Server</option>
            <option>Oracle DB</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Host</label>
          <input
            type="text" value={host} onChange={e => setHost(e.target.value)}
            placeholder="db.yourcompany.com" style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Port</label>
          <input
            type="number" value={port} onChange={e => setPort(Number(e.target.value))}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Row 2: Database Name, Schema */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Database Name</label>
          <input
            type="text" value={dbName} onChange={e => setDbName(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Schema</label>
          <input
            type="text" value={schema} onChange={e => setSchema(e.target.value)}
            placeholder="public" style={inputStyle}
          />
        </div>
      </div>

      {/* Row 3: Table or Custom Query toggle */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Data Source</label>
        <div style={{ display: "flex", gap: 0, marginBottom: 8 }}>
          {(["table", "query"] as QueryMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setQueryMode(mode)}
              style={{
                fontFamily: S.fontMono, fontSize: "0.6875rem",
                padding: "5px 14px",
                border: `1px solid ${S.rim}`,
                borderRight: mode === "table" ? "none" : `1px solid ${S.rim}`,
                background: queryMode === mode ? S.bgSub : "transparent",
                color: queryMode === mode ? S.cyan : S.tertiary,
                cursor: "pointer", letterSpacing: "0.04em",
                fontWeight: queryMode === mode ? 600 : 400,
              }}
            >
              {mode === "table" ? "Table Name" : "Custom Query"}
            </button>
          ))}
        </div>
        {queryMode === "table" ? (
          <input
            type="text" value={tableName} onChange={e => setTableName(e.target.value)}
            placeholder="schema.table_name" style={inputStyle}
          />
        ) : (
          <textarea
            value={customQuery} onChange={e => setCustomQuery(e.target.value)}
            rows={4}
            style={{
              ...inputStyle, resize: "vertical", lineHeight: 1.5,
              minHeight: 80,
            }}
          />
        )}
      </div>

      {/* Row 4: Authentication */}
      <div style={{
        borderTop: `1px solid ${S.soft}`, paddingTop: 14,
      }}>
        <div style={{
          display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12,
        }}>
          <span style={{ fontFamily: S.fontUI, fontSize: "0.75rem", fontWeight: 600, color: S.secondary }}>
            Authentication
          </span>
          <span style={{
            fontFamily: S.fontMono, fontSize: "0.625rem", color: S.amber,
            border: `1px solid ${S.amber}`, padding: "1px 6px", letterSpacing: "0.06em",
          }}>
            SERVICE ACCOUNT
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={labelStyle}>Username</label>
            <input
              type="text" value={username} onChange={e => setUsername(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input
              type="password" value="" disabled
              placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
              style={{
                ...inputStyle, opacity: 0.5, cursor: "not-allowed",
              }}
            />
            <span style={{
              fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.tertiary,
              marginTop: 4, display: "block", letterSpacing: "0.04em",
            }}>
              Managed by IT admin. Contact infosec@aceros-del-norte.mx to rotate.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Field Mapping Panel
// ═══════════════════════════════════════════════════════════════════════════════
function FieldMappingPanel() {
  const mappings = DEMO_MAPPINGS;
  const mappedCount = mappings.filter(m => m.status === "MAPPED").length;

  const thStyle: React.CSSProperties = {
    fontFamily: S.fontMono, fontSize: "0.625rem", fontWeight: 600,
    color: S.tertiary, letterSpacing: "0.08em", textTransform: "uppercase",
    padding: "8px 12px", textAlign: "left", borderBottom: `1px solid ${S.rim}`,
    background: S.bgSub, whiteSpace: "nowrap",
  };
  const tdStyle: React.CSSProperties = {
    fontFamily: S.fontMono, fontSize: "0.75rem", color: S.primary,
    padding: "8px 12px", borderBottom: `1px solid ${S.soft}`,
    whiteSpace: "nowrap",
  };

  return (
    <div style={{
      background: S.bgPanel, border: `1px solid ${S.rim}`, padding: 20,
      marginBottom: 20,
    }}>
      <div style={{
        display: "flex", alignItems: "baseline", gap: 10, marginBottom: 16,
        borderBottom: `1px solid ${S.soft}`, paddingBottom: 10,
      }}>
        <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.06em" }}>02</span>
        <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600, color: S.primary }}>
          Column Mapping {"\u2014"} SQL {"\u2192"} ORDR TradeRow
        </span>
        <span style={{
          fontFamily: S.fontMono, fontSize: "0.625rem", color: S.pass,
          marginLeft: "auto", letterSpacing: "0.06em",
        }}>
          {mappedCount}/{mappings.length} FIELDS
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Source Column</th>
              <th style={thStyle}>Data Type</th>
              <th style={thStyle}>ORDR Field</th>
              <th style={thStyle}>Transform</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m, i) => (
              <tr key={i} style={{
                background: i % 2 === 0 ? "transparent" : `color-mix(in srgb, ${S.bgSub} 40%, transparent)`,
              }}>
                <td style={tdStyle}>
                  <span style={{ color: S.cyan }}>{m.sourceColumn}</span>
                </td>
                <td style={{ ...tdStyle, color: S.secondary, fontSize: "0.6875rem" }}>
                  {m.dataType}
                </td>
                <td style={tdStyle}>
                  {m.ordrField}
                </td>
                <td style={{
                  ...tdStyle, color: m.transform === "\u2014" ? S.tertiary : S.amber,
                  fontSize: "0.6875rem",
                }}>
                  {m.transform}
                </td>
                <td style={{ ...tdStyle, textAlign: "center" }}>
                  <span style={{
                    fontFamily: S.fontMono, fontSize: "0.5625rem", fontWeight: 700,
                    color: statusColor(m.status), letterSpacing: "0.08em",
                    border: `1px solid ${statusColor(m.status)}`,
                    padding: "2px 8px", display: "inline-block",
                  }}>
                    {m.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Import Preview & History Panel
// ═══════════════════════════════════════════════════════════════════════════════
function ImportPreviewPanel() {
  const preview = DEMO_PREVIEW;
  const history = DEMO_IMPORT_HISTORY;

  const thStyle: React.CSSProperties = {
    fontFamily: S.fontMono, fontSize: "0.5625rem", fontWeight: 600,
    color: S.tertiary, letterSpacing: "0.08em", textTransform: "uppercase",
    padding: "6px 8px", textAlign: "left", borderBottom: `1px solid ${S.rim}`,
    background: S.bgSub, whiteSpace: "nowrap",
  };
  const tdStyle: React.CSSProperties = {
    fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.primary,
    padding: "5px 8px", borderBottom: `1px solid ${S.soft}`,
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20, marginBottom: 20 }}>
      {/* Left: Import Preview */}
      <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: 16 }}>
        <div style={{
          display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12,
          borderBottom: `1px solid ${S.soft}`, paddingBottom: 8,
        }}>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.06em" }}>03a</span>
          <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600, color: S.primary }}>Import Preview</span>
          <span style={{
            fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary,
            marginLeft: "auto", letterSpacing: "0.06em",
          }}>
            {preview.length} ROWS
          </span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {PREVIEW_COLUMNS.map(col => (
                  <th key={col.key} style={thStyle}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr key={i} style={{
                  background: i % 2 === 0 ? "transparent" : `color-mix(in srgb, ${S.bgSub} 40%, transparent)`,
                }}>
                  {PREVIEW_COLUMNS.map(col => (
                    <td key={col.key} style={{
                      ...tdStyle,
                      color: col.key === "trade_ref" ? S.cyan
                        : col.key === "notional" ? S.primary
                        : col.key === "direction"
                          ? (row.direction === "BUY" ? S.pass : S.fail)
                          : S.secondary,
                      textAlign: col.key === "notional" || col.key === "forward_rate" ? "right" : "left",
                    }}>
                      {row[col.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right: Import History */}
      <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: 16 }}>
        <div style={{
          display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12,
          borderBottom: `1px solid ${S.soft}`, paddingBottom: 8,
        }}>
          <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary, letterSpacing: "0.06em" }}>03b</span>
          <span style={{ fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 600, color: S.primary }}>Import History</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {history.map((run, i) => (
            <div key={run.runId} style={{
              display: "grid", gridTemplateColumns: "70px 1fr auto",
              alignItems: "center", gap: 10,
              padding: "8px 0",
              borderBottom: i < history.length - 1 ? `1px solid ${S.soft}` : "none",
            }}>
              <span style={{
                fontFamily: S.fontMono, fontSize: "0.625rem", color: S.cyan,
                letterSpacing: "0.04em",
              }}>
                {run.runId}
              </span>
              <div>
                <div style={{
                  fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary,
                  letterSpacing: "0.02em",
                }}>
                  {run.timestamp}
                </div>
                <div style={{
                  fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.secondary,
                  marginTop: 2,
                }}>
                  {run.rowsImported.toLocaleString()} rows
                </div>
              </div>
              <span style={{
                fontFamily: S.fontMono, fontSize: "0.5625rem", fontWeight: 700,
                color: statusColor(run.status), letterSpacing: "0.08em",
                border: `1px solid ${statusColor(run.status)}`,
                padding: "2px 8px", whiteSpace: "nowrap",
              }}>
                {run.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Action Row
// ═══════════════════════════════════════════════════════════════════════════════
function ActionRow({
  activeTab,
  testingConnection,
  onTestConnection,
}: {
  activeTab: PageTab;
  testingConnection: boolean;
  onTestConnection: () => void;
}) {
  const btnBase: React.CSSProperties = {
    fontFamily: S.fontMono, fontSize: "0.6875rem", fontWeight: 600,
    letterSpacing: "0.06em", padding: "8px 20px", cursor: "pointer",
    transition: "opacity 0.15s",
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "16px 0 0", borderTop: `1px solid ${S.rim}`,
    }}>
      <button
        onClick={onTestConnection}
        disabled={testingConnection}
        style={{
          ...btnBase, background: "transparent",
          border: `1px solid ${S.cyan}`, color: S.cyan,
          opacity: testingConnection ? 0.5 : 1,
        }}
      >
        {testingConnection ? "TESTING\u2026" : "TEST CONNECTION"}
      </button>
      <button style={{
        ...btnBase, background: "transparent",
        border: `1px solid ${S.rim}`, color: S.secondary,
      }}>
        PREVIEW DATA
      </button>
      <button style={{
        ...btnBase, background: S.cyan, border: `1px solid ${S.cyan}`,
        color: S.bgDeep,
      }}>
        IMPORT NOW
      </button>
      <button style={{
        ...btnBase, background: "transparent",
        border: `1px solid ${S.rim}`, color: S.secondary,
      }}>
        SAVE & SCHEDULE
      </button>
      <div style={{ flex: 1 }} />
      <span style={{
        fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.tertiary,
        letterSpacing: "0.06em",
      }}>
        {activeTab === "config" ? "STEP 1 OF 3" : activeTab === "mapping" ? "STEP 2 OF 3" : "STEP 3 OF 3"}
      </span>
    
    <HelpPanel config={DATABASE_CONNECTION_HELP} storageKey="database-connection" />
    </div>
  );
}
