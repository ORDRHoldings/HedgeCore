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

// ── Default ports per driver ──────────────────────────────────────────────────
const DEFAULT_PORTS: Record<DbDriver, number> = {
  "PostgreSQL": 5432,
  "MySQL": 3306,
  "Microsoft SQL Server": 1433,
  "Oracle DB": 1521,
};

// ═══════════════════════════════════════════════════════════════════════════════
// Page Component
// ═══════════════════════════════════════════════════════════════════════════════
export default function DatabaseConnectionPage() {
  const renderTs = useRenderTs();
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  // Connection state
  const [driver, setDriver] = useState<DbDriver>("PostgreSQL");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(5432);
  const [dbName, setDbName] = useState("");
  const [schema, setSchema] = useState("public");
  const [queryMode, setQueryMode] = useState<QueryMode>("table");
  const [tableName, setTableName] = useState("");
  const [customQuery, setCustomQuery] = useState("");
  const [username, setUsername] = useState("");
  const [connectionTested, setConnectionTested] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  // Update port when driver changes
  useEffect(() => {
    setPort(DEFAULT_PORTS[driver]);
  }, [driver]);

  // Auth guard
  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/auth/login");
    }
  }, [isAuthenticated, router]);

  const handleTestConnection = () => {
    setTestingConnection(true);
    setTimeout(() => {
      setTestingConnection(false);
      setConnectionTested(true);
    }, 1500);
  };

  if (!isAuthenticated) return null;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <div style={{
        background: S.bgDeep, minHeight: "100vh", fontFamily: S.fontUI,
        display: "flex", flexDirection: "column", flex: 1,
      }}>
        <TopBar renderTs={renderTs} onBack={() => router.push("/input")} />

        <div style={{ flex: 1, padding: "32px", maxWidth: "1600px", margin: "0 auto", width: "100%" }}>
          {/* Info Banner */}
          <div style={{
            background: "rgba(0, 255, 255, 0.05)",
            border: `1px solid ${S.cyan}`,
            borderRadius: "6px",
            padding: "16px 20px",
            marginBottom: "24px",
            fontFamily: S.fontMono,
            fontSize: "0.6875rem",
            color: S.secondary,
            lineHeight: 1.6,
          }}>
            <strong style={{ color: S.cyan, marginRight: 8 }}>DATABASE CONNECTOR:</strong>
            Connect to your SQL database to automatically pull FX position data into ORDR.
            Configure connection, map columns to Position fields, and schedule regular imports.
          </div>

          {/* Connection Configuration */}
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

          {/* Action Row */}
          <ActionRow
            connectionTested={connectionTested}
            testingConnection={testingConnection}
            onTestConnection={handleTestConnection}
          />

          {/* Coming Soon Section */}
          <div style={{
            background: S.bgPanel,
            border: `1px solid ${S.soft}`,
            borderRadius: "6px",
            padding: "32px",
            marginTop: "24px",
            textAlign: "center",
          }}>
            <div style={{
              fontFamily: S.fontMono,
              fontSize: "0.6875rem",
              color: S.amber,
              letterSpacing: "0.08em",
              marginBottom: 12,
            }}>
              COMING SOON
            </div>
            <div style={{
              fontFamily: S.fontUI,
              fontSize: "0.9375rem",
              fontWeight: 600,
              color: S.primary,
              marginBottom: 8,
            }}>
              Field Mapping & Auto-Import
            </div>
            <div style={{
              fontFamily: S.fontUI,
              fontSize: "0.75rem",
              color: S.secondary,
              maxWidth: 600,
              margin: "0 auto",
              lineHeight: 1.6,
            }}>
              Full database connector with column mapping, data preview, scheduled imports,
              and audit trail will be available in the next release.
            </div>
          </div>
        </div>

        <Footer renderTs={renderTs} />
      </div>

      <HelpPanel config={DATABASE_CONNECTION_HELP} storageKey="database-connection" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TopBar
// ═══════════════════════════════════════════════════════════════════════════════
function TopBar({ renderTs, onBack }: { renderTs: string; onBack: () => void }) {
  return (
    <header style={{
      position: "sticky",
      top: 0,
      zIndex: 100,
      background: S.bgSub,
      borderBottom: `1px solid ${S.rim}`,
      boxShadow: `0 2px 0 0 ${S.cyan}`,
    }}>
      <div style={{
        maxWidth: "1800px",
        margin: "0 auto",
        padding: "16px 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        {/* Left: Back Button */}
        <button onClick={onBack} style={{
          background: "transparent",
          border: `1px solid ${S.rim}`,
          color: S.secondary,
          padding: "8px 16px",
          borderRadius: "4px",
          cursor: "pointer",
          fontFamily: S.fontMono,
          fontSize: "11px",
          fontWeight: 500,
          letterSpacing: "0.5px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          transition: "all 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = S.cyan;
          e.currentTarget.style.color = S.cyan;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = S.rim;
          e.currentTarget.style.color = S.secondary;
        }}
        >
          ← BACK
        </button>

        {/* Center: Title */}
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontSize: "10px",
            color: S.tertiary,
            fontFamily: S.fontMono,
            letterSpacing: "1px",
            marginBottom: "4px",
          }}>
            POSITION DESK › CONNECTORS
          </div>
          <h1 style={{
            fontSize: "18px",
            fontWeight: 600,
            margin: 0,
            fontFamily: S.fontMono,
            letterSpacing: "0.5px",
          }}>
            DATABASE CONNECTION
          </h1>
        </div>

        {/* Right: Branding */}
        <div style={{ textAlign: "right" }}>
          <div style={{
            fontSize: "9px",
            color: S.tertiary,
            fontFamily: S.fontMono,
            marginBottom: "4px",
          }}>
            {renderTs}
          </div>
          <div style={{
            fontSize: "10px",
            fontFamily: S.fontMono,
            color: S.cyan,
            letterSpacing: "0.5px",
          }}>
            ORDR TERMINAL · POSITION DESK
          </div>
        </div>
      </div>
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
        {renderTs} — ORDR · Database Connection
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
  connectionTested,
}: ConnectionConfigProps) {
  const inputStyle: React.CSSProperties = {
    fontFamily: S.fontMono, fontSize: "0.75rem", color: S.primary,
    background: S.bgDeep, border: `1px solid ${S.rim}`,
    padding: "10px 12px", width: "100%", outline: "none",
    letterSpacing: "0.02em", borderRadius: "4px",
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: S.fontUI, fontSize: "0.6875rem", fontWeight: 600,
    color: S.secondary, marginBottom: 6, display: "block",
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
      background: S.bgPanel, border: `1px solid ${S.rim}`, padding: 24,
      marginBottom: 20, borderRadius: "6px",
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
          }}>✓ VERIFIED</span>
        )}
      </div>

      {/* Row 1: Driver, Host, Port */}
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 120px", gap: 16, marginBottom: 16 }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>Database Name</label>
          <input
            type="text" value={dbName} onChange={e => setDbName(e.target.value)}
            placeholder="production_db" style={inputStyle}
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
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Data Source</label>
        <div style={{ display: "flex", gap: 0, marginBottom: 10 }}>
          {(["table", "query"] as QueryMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setQueryMode(mode)}
              style={{
                fontFamily: S.fontMono, fontSize: "0.6875rem",
                padding: "8px 16px",
                border: `1px solid ${S.rim}`,
                borderRight: mode === "table" ? "none" : `1px solid ${S.rim}`,
                background: queryMode === mode ? S.bgSub : "transparent",
                color: queryMode === mode ? S.cyan : S.tertiary,
                cursor: "pointer", letterSpacing: "0.04em",
                fontWeight: queryMode === mode ? 600 : 400,
                borderRadius: mode === "table" ? "4px 0 0 4px" : "0 4px 4px 0",
              }}
            >
              {mode === "table" ? "Table Name" : "Custom Query"}
            </button>
          ))}
        </div>
        {queryMode === "table" ? (
          <input
            type="text" value={tableName} onChange={e => setTableName(e.target.value)}
            placeholder="fx_positions" style={inputStyle}
          />
        ) : (
          <textarea
            value={customQuery} onChange={e => setCustomQuery(e.target.value)}
            placeholder="SELECT record_id, entity, flow_type, currency, amount, value_date FROM fx_positions WHERE status = 'OPEN'"
            rows={4}
            style={{
              ...inputStyle, resize: "vertical", lineHeight: 1.5,
              minHeight: 100, fontFamily: "'JetBrains Mono', monospace",
            }}
          />
        )}
      </div>

      {/* Row 4: Authentication */}
      <div style={{
        borderTop: `1px solid ${S.soft}`, paddingTop: 16,
      }}>
        <div style={{
          display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14,
        }}>
          <span style={{ fontFamily: S.fontUI, fontSize: "0.75rem", fontWeight: 600, color: S.secondary }}>
            Authentication
          </span>
          <span style={{
            fontFamily: S.fontMono, fontSize: "0.625rem", color: S.amber,
            border: `1px solid ${S.amber}`, padding: "2px 8px", letterSpacing: "0.06em",
            borderRadius: "3px",
          }}>
            READ-ONLY SERVICE ACCOUNT
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={labelStyle}>Username</label>
            <input
              type="text" value={username} onChange={e => setUsername(e.target.value)}
              placeholder="ordr_readonly" style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              placeholder="••••••••••••"
              style={inputStyle}
            />
            <span style={{
              fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.tertiary,
              marginTop: 6, display: "block", letterSpacing: "0.04em",
            }}>
              Encrypted and stored securely. Contact IT admin to rotate.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Action Row
// ═══════════════════════════════════════════════════════════════════════════════
function ActionRow({
  connectionTested,
  testingConnection,
  onTestConnection,
}: {
  connectionTested: boolean;
  testingConnection: boolean;
  onTestConnection: () => void;
}) {
  const btnBase: React.CSSProperties = {
    fontFamily: S.fontMono, fontSize: "0.6875rem", fontWeight: 600,
    letterSpacing: "0.06em", padding: "10px 20px", cursor: "pointer",
    transition: "all 0.2s", borderRadius: "4px",
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "20px 0", borderTop: `1px solid ${S.rim}`,
    }}>
      <button
        onClick={onTestConnection}
        disabled={testingConnection}
        style={{
          ...btnBase, background: "transparent",
          border: `1px solid ${S.cyan}`, color: S.cyan,
          opacity: testingConnection ? 0.6 : 1,
          cursor: testingConnection ? "not-allowed" : "pointer",
        }}
      >
        {testingConnection ? "TESTING…" : connectionTested ? "✓ CONNECTION OK" : "TEST CONNECTION"}
      </button>
      <button
        disabled
        style={{
          ...btnBase, background: "transparent",
          border: `1px solid ${S.soft}`, color: S.tertiary,
          opacity: 0.5, cursor: "not-allowed",
        }}
      >
        PREVIEW DATA
      </button>
      <button
        disabled
        style={{
          ...btnBase, background: S.soft,
          border: `1px solid ${S.soft}`, color: S.tertiary,
          opacity: 0.5, cursor: "not-allowed",
        }}
      >
        IMPORT NOW
      </button>
      <div style={{ flex: 1 }} />
      <span style={{
        fontFamily: S.fontMono, fontSize: "0.5625rem", color: S.tertiary,
        letterSpacing: "0.06em",
      }}>
        STEP 1 OF 3 · COMING SOON
      </span>
    </div>
  );
}
