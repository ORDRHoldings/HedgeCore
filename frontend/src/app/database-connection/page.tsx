"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../../lib/authContext";
import { useRouter } from "next/navigation";
import HelpPanel from "@/components/layout/HelpPanel";
import { DATABASE_CONNECTION_HELP } from "@/lib/helpContent";

// ── Types ─────────────────────────────────────────────────────────────────────
type DbDriver = "PostgreSQL" | "MySQL" | "Microsoft SQL Server" | "Oracle" | "SAP HANA" | "Snowflake" | "Redshift";
type ConnectionStatus = "disconnected" | "testing" | "connected" | "failed";
type TabView = "connection" | "mapping" | "preview" | "schedule";

interface DbColumn {
  name: string;
  type: string;
  nullable: boolean;
  sample: string;
}

interface FieldMapping {
  sourceColumn: string;
  ordrField: string;
  transform: string;
  status: "mapped" | "pending" | "error";
}

interface PreviewRow {
  [key: string]: string | number;
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const S = {
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep: "var(--bg-deep)",
  bgPanel: "var(--bg-panel)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  soft: "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)",
  amber: "var(--accent-amber)",
  pass: "var(--status-pass)",
  fail: "var(--accent-red)",
} as const;

// ── Constants ─────────────────────────────────────────────────────────────────
const DB_ADAPTERS: Record<DbDriver, { port: number; icon: string; color: string }> = {
  "PostgreSQL": { port: 5432, icon: "🐘", color: "#336791" },
  "MySQL": { port: 3306, icon: "🐬", color: "#00758F" },
  "Microsoft SQL Server": { port: 1433, icon: "⚡", color: "#CC2927" },
  "Oracle": { port: 1521, icon: "⚫", color: "#F80000" },
  "SAP HANA": { port: 30015, icon: "💎", color: "#0FAAFF" },
  "Snowflake": { port: 443, icon: "❄️", color: "#29B5E8" },
  "Redshift": { port: 5439, icon: "📊", color: "#FF9900" },
};

const ORDR_FIELDS = [
  { field: "record_id", type: "STRING", required: true, desc: "Unique position identifier" },
  { field: "entity", type: "STRING", required: true, desc: "Legal entity or division" },
  { field: "flow_type", type: "ENUM[AR|AP]", required: true, desc: "Receivable or Payable" },
  { field: "currency", type: "ISO4217", required: true, desc: "3-letter currency code" },
  { field: "amount", type: "DECIMAL", required: true, desc: "Notional amount (positive)" },
  { field: "value_date", type: "DATE", required: true, desc: "Settlement date (YYYY-MM-DD)" },
  { field: "description", type: "STRING", required: false, desc: "Optional description" },
  { field: "status", type: "ENUM[CONFIRMED|FORECAST]", required: false, desc: "Defaults to CONFIRMED" },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════
export default function DatabaseConnectionPage() {
  const { isAuthenticated, token } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabView>("connection");

  // Connection state
  const [driver, setDriver] = useState<DbDriver>("PostgreSQL");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(5432);
  const [database, setDatabase] = useState("");
  const [schema, setSchema] = useState("public");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [useSSL, setUseSSL] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [connectionError, setConnectionError] = useState("");

  // Data source
  const [queryMode, setQueryMode] = useState<"table" | "query">("table");
  const [tableName, setTableName] = useState("");
  const [customQuery, setCustomQuery] = useState("");

  // Discovered columns
  const [discoveredColumns, setDiscoveredColumns] = useState<DbColumn[]>([]);

  // Field mappings
  const [mappings, setMappings] = useState<FieldMapping[]>([]);

  // Preview data
  const [previewData, setPreviewData] = useState<PreviewRow[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Schedule
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleInterval, setScheduleInterval] = useState("daily");
  const [scheduleTime, setScheduleTime] = useState("00:00");

  // Update port when driver changes
  useEffect(() => {
    setPort(DB_ADAPTERS[driver].port);
  }, [driver]);

  // Auth guard
  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/auth/login");
    }
  }, [isAuthenticated, router]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleTestConnection = async () => {
    setConnectionStatus("testing");
    setConnectionError("");

    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Mock success and discover columns
    setConnectionStatus("connected");

    // Mock discovered columns
    const mockColumns: DbColumn[] = [
      { name: "trade_id", type: "VARCHAR(50)", nullable: false, sample: "TXN-12345" },
      { name: "company_name", type: "VARCHAR(255)", nullable: false, sample: "Acme Corp" },
      { name: "transaction_type", type: "VARCHAR(10)", nullable: false, sample: "RECEIVABLE" },
      { name: "ccy", type: "CHAR(3)", nullable: false, sample: "USD" },
      { name: "notional", type: "NUMERIC(18,2)", nullable: false, sample: "1500000.00" },
      { name: "settlement_date", type: "DATE", nullable: false, sample: "2026-03-15" },
      { name: "notes", type: "TEXT", nullable: true, sample: "Q1 payment" },
      { name: "created_at", type: "TIMESTAMP", nullable: false, sample: "2026-02-26 10:30:00" },
    ];
    setDiscoveredColumns(mockColumns);

    // Auto-generate smart mappings
    autoGenerateMappings(mockColumns);

    // Enable next tab
    setActiveTab("mapping");
  };

  const autoGenerateMappings = (columns: DbColumn[]) => {
    const smartMappings: FieldMapping[] = [];

    // Smart matching logic
    const columnMap: Record<string, string> = {
      "trade_id": "record_id",
      "transaction_id": "record_id",
      "ref_id": "record_id",
      "company_name": "entity",
      "entity_name": "entity",
      "legal_entity": "entity",
      "transaction_type": "flow_type",
      "flow": "flow_type",
      "direction": "flow_type",
      "ccy": "currency",
      "currency_code": "currency",
      "notional": "amount",
      "amount_usd": "amount",
      "value": "amount",
      "settlement_date": "value_date",
      "maturity_date": "value_date",
      "value_date": "value_date",
      "notes": "description",
      "description": "description",
      "comments": "description",
    };

    columns.forEach(col => {
      const colLower = col.name.toLowerCase();
      const ordrField = columnMap[colLower];

      if (ordrField) {
        let transform = "—";

        // Add transforms for common conversions
        if (ordrField === "flow_type") {
          transform = "CASE WHEN UPPER({{col}}) IN ('RECEIVABLE','AR','INFLOW') THEN 'AR' WHEN UPPER({{col}}) IN ('PAYABLE','AP','OUTFLOW') THEN 'AP' ELSE {{col}} END";
        }

        smartMappings.push({
          sourceColumn: col.name,
          ordrField: ordrField,
          transform: transform,
          status: "mapped",
        });
      }
    });

    setMappings(smartMappings);
  };

  const handlePreviewData = async () => {
    setPreviewLoading(true);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Mock preview data
    const mockPreview: PreviewRow[] = [
      { trade_id: "TXN-001", company_name: "Acme Corp", transaction_type: "AR", ccy: "USD", notional: 1500000, settlement_date: "2026-03-15", notes: "Q1 revenue" },
      { trade_id: "TXN-002", company_name: "Beta LLC", transaction_type: "AP", ccy: "EUR", notional: 850000, settlement_date: "2026-03-20", notes: "Supplier payment" },
      { trade_id: "TXN-003", company_name: "Gamma Ltd", transaction_type: "AR", ccy: "GBP", notional: 650000, settlement_date: "2026-04-01", notes: "Q2 invoice" },
    ];
    setPreviewData(mockPreview);
    setPreviewLoading(false);
    setActiveTab("preview");
  };

  const updateMapping = (index: number, field: keyof FieldMapping, value: string) => {
    const newMappings = [...mappings];
    newMappings[index] = { ...newMappings[index], [field]: value };
    setMappings(newMappings);
  };

  if (!isAuthenticated) return null;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <div style={{
        background: S.bgDeep,
        minHeight: "100vh",
        fontFamily: S.fontUI,
        display: "flex",
        flexDirection: "column",
        flex: 1,
      }}>
        {/* Header */}
        <Header onBack={() => router.push("/input")} connectionStatus={connectionStatus} />

        {/* Tab Navigation */}
        <TabNav activeTab={activeTab} setActiveTab={setActiveTab} connectionStatus={connectionStatus} />

        {/* Main Content */}
        <div style={{ flex: 1, padding: "32px", maxWidth: "1800px", margin: "0 auto", width: "100%" }}>
          {/* Connection Tab */}
          {activeTab === "connection" && (
            <ConnectionTab
              driver={driver} setDriver={setDriver}
              host={host} setHost={setHost}
              port={port} setPort={setPort}
              database={database} setDatabase={setDatabase}
              schema={schema} setSchema={setSchema}
              username={username} setUsername={setUsername}
              password={password} setPassword={setPassword}
              useSSL={useSSL} setUseSSL={setUseSSL}
              queryMode={queryMode} setQueryMode={setQueryMode}
              tableName={tableName} setTableName={setTableName}
              customQuery={customQuery} setCustomQuery={setCustomQuery}
              connectionStatus={connectionStatus}
              connectionError={connectionError}
              onTestConnection={handleTestConnection}
            />
          )}

          {/* Mapping Tab */}
          {activeTab === "mapping" && (
            <MappingTab
              discoveredColumns={discoveredColumns}
              mappings={mappings}
              updateMapping={updateMapping}
              onPreview={handlePreviewData}
              connectionStatus={connectionStatus}
            />
          )}

          {/* Preview Tab */}
          {activeTab === "preview" && (
            <PreviewTab
              previewData={previewData}
              previewLoading={previewLoading}
              mappings={mappings}
            />
          )}

          {/* Schedule Tab */}
          {activeTab === "schedule" && (
            <ScheduleTab
              scheduleEnabled={scheduleEnabled}
              setScheduleEnabled={setScheduleEnabled}
              scheduleInterval={scheduleInterval}
              setScheduleInterval={setScheduleInterval}
              scheduleTime={scheduleTime}
              setScheduleTime={setScheduleTime}
            />
          )}
        </div>

        <Footer />
      </div>

      <HelpPanel config={DATABASE_CONNECTION_HELP} storageKey="database-connection" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Header
// ═══════════════════════════════════════════════════════════════════════════════
function Header({ onBack, connectionStatus }: { onBack: () => void; connectionStatus: ConnectionStatus }) {
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () => setClock(new Date().toISOString().slice(0, 19).replace("T", " ") + " UTC");
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 100,
      background: S.bgSub, borderBottom: `1px solid ${S.rim}`,
      boxShadow: `0 2px 0 0 ${S.cyan}`,
    }}>
      <div style={{
        maxWidth: "1800px", margin: "0 auto", padding: "16px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <button onClick={onBack} style={{
          background: "transparent", border: `1px solid ${S.rim}`,
          color: S.secondary, padding: "8px 16px", borderRadius: "4px",
          cursor: "pointer", fontFamily: S.fontMono, fontSize: "11px",
          fontWeight: 500, letterSpacing: "0.5px", transition: "all 0.2s",
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = S.cyan; e.currentTarget.style.color = S.cyan; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = S.rim; e.currentTarget.style.color = S.secondary; }}>
          ← BACK
        </button>

        <div style={{ textAlign: "center" }}>
          <div style={{
            fontSize: "10px", color: S.tertiary, fontFamily: S.fontMono,
            letterSpacing: "1px", marginBottom: "4px",
          }}>
            POSITION DESK › CONNECTORS › SQL
          </div>
          <h1 style={{
            fontSize: "18px", fontWeight: 600, margin: 0,
            fontFamily: S.fontMono, letterSpacing: "0.5px",
          }}>
            DATABASE CONNECTION
          </h1>
        </div>

        <div style={{ textAlign: "right", display: "flex", alignItems: "center", gap: 12 }}>
          <ConnectionStatusBadge status={connectionStatus} />
          <div>
            <div style={{ fontSize: "9px", color: S.tertiary, fontFamily: S.fontMono, marginBottom: "4px" }}>
              {clock}
            </div>
            <div style={{ fontSize: "10px", fontFamily: S.fontMono, color: S.cyan, letterSpacing: "0.5px" }}>
              ORDR TERMINAL
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function ConnectionStatusBadge({ status }: { status: ConnectionStatus }) {
  const colors = {
    disconnected: S.tertiary,
    testing: S.amber,
    connected: S.pass,
    failed: S.fail,
  };

  const labels = {
    disconnected: "DISCONNECTED",
    testing: "TESTING…",
    connected: "CONNECTED",
    failed: "FAILED",
  };

  return (
    <div style={{
      fontFamily: S.fontMono, fontSize: "9px", fontWeight: 700,
      color: colors[status], letterSpacing: "0.08em",
      border: `1px solid ${colors[status]}`, padding: "4px 10px",
      borderRadius: "3px", display: "flex", alignItems: "center", gap: 6,
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: "50%",
        background: colors[status],
        animation: status === "testing" ? "pulse 1.5s infinite" : "none",
      }} />
      {labels[status]}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab Navigation
// ═══════════════════════════════════════════════════════════════════════════════
function TabNav({
  activeTab,
  setActiveTab,
  connectionStatus,
}: {
  activeTab: TabView;
  setActiveTab: (tab: TabView) => void;
  connectionStatus: ConnectionStatus;
}) {
  const tabs: { key: TabView; label: string; badge?: string; disabled: boolean }[] = [
    { key: "connection", label: "Connection", badge: "1", disabled: false },
    { key: "mapping", label: "Field Mapping", badge: "2", disabled: connectionStatus !== "connected" },
    { key: "preview", label: "Data Preview", badge: "3", disabled: connectionStatus !== "connected" },
    { key: "schedule", label: "Schedule", badge: "4", disabled: false },
  ];

  return (
    <div style={{
      borderBottom: `1px solid ${S.rim}`,
      background: S.bgPanel,
      padding: "0 32px",
    }}>
      <div style={{
        maxWidth: "1800px",
        margin: "0 auto",
        display: "flex",
        gap: 0,
      }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => !tab.disabled && setActiveTab(tab.key)}
            disabled={tab.disabled}
            style={{
              fontFamily: S.fontMono,
              fontSize: "11px",
              fontWeight: activeTab === tab.key ? 600 : 400,
              padding: "12px 20px",
              background: activeTab === tab.key ? S.bgDeep : "transparent",
              border: "none",
              borderBottom: activeTab === tab.key ? `2px solid ${S.cyan}` : "2px solid transparent",
              color: tab.disabled ? S.tertiary : (activeTab === tab.key ? S.cyan : S.secondary),
              cursor: tab.disabled ? "not-allowed" : "pointer",
              opacity: tab.disabled ? 0.4 : 1,
              letterSpacing: "0.5px",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {tab.badge && (
              <span style={{
                background: activeTab === tab.key ? S.cyan : S.soft,
                color: activeTab === tab.key ? S.bgDeep : S.tertiary,
                width: 18,
                height: 18,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "9px",
                fontWeight: 700,
              }}>
                {tab.badge}
              </span>
            )}
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Connection Tab
// ═══════════════════════════════════════════════════════════════════════════════
interface ConnectionTabProps {
  driver: DbDriver;
  setDriver: (v: DbDriver) => void;
  host: string;
  setHost: (v: string) => void;
  port: number;
  setPort: (v: number) => void;
  database: string;
  setDatabase: (v: string) => void;
  schema: string;
  setSchema: (v: string) => void;
  username: string;
  setUsername: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  useSSL: boolean;
  setUseSSL: (v: boolean) => void;
  queryMode: "table" | "query";
  setQueryMode: (v: "table" | "query") => void;
  tableName: string;
  setTableName: (v: string) => void;
  customQuery: string;
  setCustomQuery: (v: string) => void;
  connectionStatus: ConnectionStatus;
  connectionError: string;
  onTestConnection: () => void;
}

function ConnectionTab(props: ConnectionTabProps) {
  const inputStyle: React.CSSProperties = {
    fontFamily: S.fontMono, fontSize: "13px", color: S.primary,
    background: S.bgDeep, border: `1px solid ${S.rim}`,
    padding: "10px 14px", width: "100%", outline: "none",
    borderRadius: "4px", transition: "border-color 0.2s",
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: S.fontUI, fontSize: "11px", fontWeight: 600,
    color: S.secondary, marginBottom: 8, display: "block",
    letterSpacing: "0.5px", textTransform: "uppercase",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Database Adapters */}
      <Panel title="Database Adapter" step="1.1">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {(Object.keys(DB_ADAPTERS) as DbDriver[]).map(db => {
            const adapter = DB_ADAPTERS[db];
            const isSelected = props.driver === db;
            return (
              <button
                key={db}
                onClick={() => props.setDriver(db)}
                style={{
                  background: isSelected ? S.bgDeep : S.bgSub,
                  border: `2px solid ${isSelected ? S.cyan : S.soft}`,
                  borderRadius: "6px",
                  padding: "16px",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                }}
                onMouseEnter={e => !isSelected && (e.currentTarget.style.borderColor = S.rim)}
                onMouseLeave={e => !isSelected && (e.currentTarget.style.borderColor = S.soft)}
              >
                <div style={{ fontSize: "32px" }}>{adapter.icon}</div>
                <div style={{
                  fontFamily: S.fontMono,
                  fontSize: "11px",
                  fontWeight: 600,
                  color: isSelected ? S.cyan : S.primary,
                  letterSpacing: "0.5px",
                  textAlign: "center",
                }}>
                  {db}
                </div>
                <div style={{
                  fontFamily: S.fontMono,
                  fontSize: "9px",
                  color: S.tertiary,
                }}>
                  Port {adapter.port}
                </div>
              </button>
            );
          })}
        </div>
      </Panel>

      {/* Connection Parameters */}
      <Panel title="Connection Parameters" step="1.2">
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Hostname / IP Address</label>
            <input
              type="text"
              value={props.host}
              onChange={e => props.setHost(e.target.value)}
              placeholder="db.company.com or 10.0.1.50"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Port</label>
            <input
              type="number"
              value={props.port}
              onChange={e => props.setPort(Number(e.target.value))}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Database Name</label>
            <input
              type="text"
              value={props.database}
              onChange={e => props.setDatabase(e.target.value)}
              placeholder="production"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Schema</label>
            <input
              type="text"
              value={props.schema}
              onChange={e => props.setSchema(e.target.value)}
              placeholder="public"
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={labelStyle}>Username</label>
            <input
              type="text"
              value={props.username}
              onChange={e => props.setUsername(e.target.value)}
              placeholder="readonly_user"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={props.password}
              onChange={e => props.setPassword(e.target.value)}
              placeholder="••••••••••••"
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="checkbox"
            checked={props.useSSL}
            onChange={e => props.setUseSSL(e.target.checked)}
            id="ssl-checkbox"
            style={{ width: 16, height: 16, cursor: "pointer" }}
          />
          <label htmlFor="ssl-checkbox" style={{
            fontFamily: S.fontMono,
            fontSize: "11px",
            color: S.secondary,
            cursor: "pointer",
          }}>
            Use SSL/TLS encrypted connection (recommended for production)
          </label>
        </div>
      </Panel>

      {/* Data Source */}
      <Panel title="Data Source Query" step="1.3">
        <div style={{ display: "flex", gap: 0, marginBottom: 16 }}>
          {(["table", "query"] as const).map(mode => (
            <button
              key={mode}
              onClick={() => props.setQueryMode(mode)}
              style={{
                fontFamily: S.fontMono,
                fontSize: "11px",
                fontWeight: 600,
                padding: "10px 24px",
                background: props.queryMode === mode ? S.cyan : S.bgSub,
                border: `1px solid ${S.rim}`,
                borderRight: mode === "table" ? "none" : `1px solid ${S.rim}`,
                color: props.queryMode === mode ? S.bgDeep : S.secondary,
                cursor: "pointer",
                letterSpacing: "0.5px",
                borderRadius: mode === "table" ? "4px 0 0 4px" : "0 4px 4px 0",
                transition: "all 0.2s",
              }}
            >
              {mode === "table" ? "📋 TABLE NAME" : "⚡ CUSTOM SQL"}
            </button>
          ))}
        </div>

        {props.queryMode === "table" ? (
          <div>
            <label style={labelStyle}>Table Name</label>
            <input
              type="text"
              value={props.tableName}
              onChange={e => props.setTableName(e.target.value)}
              placeholder="fx_positions"
              style={inputStyle}
            />
            <div style={{
              fontFamily: S.fontMono,
              fontSize: "10px",
              color: S.tertiary,
              marginTop: 6,
            }}>
              Example: schema.table_name or just table_name if schema is specified above
            </div>
          </div>
        ) : (
          <div>
            <label style={labelStyle}>SQL Query</label>
            <textarea
              value={props.customQuery}
              onChange={e => props.setCustomQuery(e.target.value)}
              placeholder="SELECT trade_id, entity, flow_type, currency, amount, value_date&#10;FROM fx_positions&#10;WHERE status = 'OPEN'&#10;  AND value_date >= CURRENT_DATE"
              rows={6}
              style={{
                ...inputStyle,
                resize: "vertical",
                lineHeight: 1.6,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "12px",
              }}
            />
            <div style={{
              fontFamily: S.fontMono,
              fontSize: "10px",
              color: S.amber,
              marginTop: 6,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}>
              ⚠️ Query will be executed as READ-ONLY. Ensure service account has SELECT permissions only.
            </div>
          </div>
        )}
      </Panel>

      {/* Test Connection Button */}
      <div style={{
        display: "flex",
        gap: 12,
        paddingTop: 24,
        borderTop: `1px solid ${S.rim}`,
      }}>
        <button
          onClick={props.onTestConnection}
          disabled={props.connectionStatus === "testing" || !props.host || !props.database || !props.username}
          style={{
            fontFamily: S.fontMono,
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.5px",
            padding: "14px 32px",
            background: props.connectionStatus === "connected" ? S.pass : S.cyan,
            border: "none",
            borderRadius: "4px",
            color: S.bgDeep,
            cursor: props.connectionStatus === "testing" || !props.host ? "not-allowed" : "pointer",
            opacity: props.connectionStatus === "testing" || !props.host ? 0.5 : 1,
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          {props.connectionStatus === "testing" ? (
            <>
              <Spinner />
              TESTING CONNECTION…
            </>
          ) : props.connectionStatus === "connected" ? (
            <>✓ CONNECTED - DISCOVER SCHEMA</>
          ) : (
            <>🔌 TEST CONNECTION</>
          )}
        </button>

        {props.connectionStatus === "connected" && (
          <div style={{
            fontFamily: S.fontMono,
            fontSize: "11px",
            color: S.pass,
            padding: "14px 20px",
            background: "rgba(34, 197, 94, 0.1)",
            border: `1px solid ${S.pass}`,
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            ✓ Connection successful. Schema discovered. Proceed to Field Mapping →
          </div>
        )}

        {props.connectionError && (
          <div style={{
            fontFamily: S.fontMono,
            fontSize: "11px",
            color: S.fail,
            padding: "14px 20px",
            background: "rgba(220, 38, 38, 0.1)",
            border: `1px solid ${S.fail}`,
            borderRadius: "4px",
          }}>
            {props.connectionError}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Mapping Tab
// ═══════════════════════════════════════════════════════════════════════════════
interface MappingTabProps {
  discoveredColumns: DbColumn[];
  mappings: FieldMapping[];
  updateMapping: (index: number, field: keyof FieldMapping, value: string) => void;
  onPreview: () => void;
  connectionStatus: ConnectionStatus;
}

function MappingTab({ discoveredColumns, mappings, updateMapping, onPreview, connectionStatus }: MappingTabProps) {
  const mappedCount = mappings.filter(m => m.status === "mapped").length;
  const requiredFields = ORDR_FIELDS.filter(f => f.required).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Panel title="Column Mapping: Database → ORDR Position Fields" step="2.1">
        {/* Progress Bar */}
        <div style={{ marginBottom: 24 }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}>
            <span style={{
              fontFamily: S.fontMono,
              fontSize: "11px",
              color: S.secondary,
            }}>
              Mapping Progress
            </span>
            <span style={{
              fontFamily: S.fontMono,
              fontSize: "11px",
              fontWeight: 700,
              color: mappedCount >= requiredFields ? S.pass : S.amber,
            }}>
              {mappedCount} / {requiredFields} required fields mapped
            </span>
          </div>
          <div style={{
            width: "100%",
            height: 8,
            background: S.bgSub,
            borderRadius: 4,
            overflow: "hidden",
          }}>
            <div style={{
              width: `${(mappedCount / requiredFields) * 100}%`,
              height: "100%",
              background: mappedCount >= requiredFields ? S.pass : S.amber,
              transition: "width 0.3s",
            }} />
          </div>
        </div>

        {/* Mapping Table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${S.rim}` }}>
                <th style={{
                  fontFamily: S.fontMono,
                  fontSize: "10px",
                  fontWeight: 700,
                  color: S.tertiary,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "12px",
                  textAlign: "left",
                  background: S.bgSub,
                }}>
                  Source Column
                </th>
                <th style={{
                  fontFamily: S.fontMono,
                  fontSize: "10px",
                  fontWeight: 700,
                  color: S.tertiary,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "12px",
                  textAlign: "left",
                  background: S.bgSub,
                }}>
                  Data Type
                </th>
                <th style={{
                  fontFamily: S.fontMono,
                  fontSize: "10px",
                  fontWeight: 700,
                  color: S.tertiary,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "12px",
                  textAlign: "left",
                  background: S.bgSub,
                }}>
                  Sample Value
                </th>
                <th style={{
                  fontFamily: S.fontMono,
                  fontSize: "10px",
                  fontWeight: 700,
                  color: S.tertiary,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "12px",
                  textAlign: "left",
                  background: S.bgSub,
                }}>
                  → ORDR Field
                </th>
                <th style={{
                  fontFamily: S.fontMono,
                  fontSize: "10px",
                  fontWeight: 700,
                  color: S.tertiary,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "12px",
                  textAlign: "left",
                  background: S.bgSub,
                }}>
                  Transform
                </th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((mapping, index) => {
                const sourceCol = discoveredColumns.find(c => c.name === mapping.sourceColumn);
                return (
                  <tr key={index} style={{ borderBottom: `1px solid ${S.soft}` }}>
                    <td style={{
                      padding: "12px",
                      fontFamily: S.fontMono,
                      fontSize: "12px",
                      color: S.cyan,
                      fontWeight: 500,
                    }}>
                      {mapping.sourceColumn}
                    </td>
                    <td style={{
                      padding: "12px",
                      fontFamily: S.fontMono,
                      fontSize: "11px",
                      color: S.tertiary,
                    }}>
                      {sourceCol?.type || "—"}
                    </td>
                    <td style={{
                      padding: "12px",
                      fontFamily: S.fontMono,
                      fontSize: "11px",
                      color: S.secondary,
                    }}>
                      {sourceCol?.sample || "—"}
                    </td>
                    <td style={{ padding: "12px" }}>
                      <select
                        value={mapping.ordrField}
                        onChange={e => updateMapping(index, "ordrField", e.target.value)}
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: "11px",
                          padding: "6px 10px",
                          background: S.bgDeep,
                          border: `1px solid ${S.rim}`,
                          borderRadius: 3,
                          color: S.primary,
                          cursor: "pointer",
                        }}
                      >
                        {ORDR_FIELDS.map(f => (
                          <option key={f.field} value={f.field}>
                            {f.field} {f.required ? "*" : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{
                      padding: "12px",
                      fontFamily: S.fontMono,
                      fontSize: "10px",
                      color: mapping.transform === "—" ? S.tertiary : S.amber,
                    }}>
                      {mapping.transform.length > 40
                        ? mapping.transform.substring(0, 40) + "…"
                        : mapping.transform}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ORDR Field Reference */}
      <Panel title="ORDR Position Field Reference" step="2.2">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${S.rim}` }}>
                <th style={{
                  fontFamily: S.fontMono,
                  fontSize: "10px",
                  fontWeight: 700,
                  color: S.tertiary,
                  padding: "10px 12px",
                  textAlign: "left",
                  background: S.bgSub,
                }}>
                  Field
                </th>
                <th style={{
                  fontFamily: S.fontMono,
                  fontSize: "10px",
                  fontWeight: 700,
                  color: S.tertiary,
                  padding: "10px 12px",
                  textAlign: "left",
                  background: S.bgSub,
                }}>
                  Type
                </th>
                <th style={{
                  fontFamily: S.fontMono,
                  fontSize: "10px",
                  fontWeight: 700,
                  color: S.tertiary,
                  padding: "10px 12px",
                  textAlign: "center",
                  background: S.bgSub,
                }}>
                  Required
                </th>
                <th style={{
                  fontFamily: S.fontMono,
                  fontSize: "10px",
                  fontWeight: 700,
                  color: S.tertiary,
                  padding: "10px 12px",
                  textAlign: "left",
                  background: S.bgSub,
                }}>
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {ORDR_FIELDS.map(field => (
                <tr key={field.field} style={{ borderBottom: `1px solid ${S.soft}` }}>
                  <td style={{
                    padding: "10px 12px",
                    fontFamily: S.fontMono,
                    fontWeight: 600,
                    color: S.cyan,
                  }}>
                    {field.field}
                  </td>
                  <td style={{
                    padding: "10px 12px",
                    fontFamily: S.fontMono,
                    fontSize: "10px",
                    color: S.tertiary,
                  }}>
                    {field.type}
                  </td>
                  <td style={{
                    padding: "10px 12px",
                    textAlign: "center",
                  }}>
                    <span style={{
                      fontFamily: S.fontMono,
                      fontSize: "9px",
                      fontWeight: 700,
                      color: field.required ? S.fail : S.tertiary,
                      border: `1px solid ${field.required ? S.fail : S.soft}`,
                      padding: "2px 6px",
                      borderRadius: 3,
                    }}>
                      {field.required ? "YES" : "NO"}
                    </span>
                  </td>
                  <td style={{
                    padding: "10px 12px",
                    color: S.secondary,
                    fontSize: "11px",
                  }}>
                    {field.desc}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Action Button */}
      <div style={{
        display: "flex",
        gap: 12,
        paddingTop: 24,
        borderTop: `1px solid ${S.rim}`,
      }}>
        <button
          onClick={onPreview}
          disabled={mappedCount < requiredFields}
          style={{
            fontFamily: S.fontMono,
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.5px",
            padding: "14px 32px",
            background: mappedCount >= requiredFields ? S.cyan : S.soft,
            border: "none",
            borderRadius: "4px",
            color: S.bgDeep,
            cursor: mappedCount >= requiredFields ? "pointer" : "not-allowed",
            opacity: mappedCount >= requiredFields ? 1 : 0.5,
            transition: "all 0.2s",
          }}
        >
          👁️ PREVIEW DATA
        </button>

        {mappedCount < requiredFields && (
          <div style={{
            fontFamily: S.fontMono,
            fontSize: "11px",
            color: S.amber,
            padding: "14px 20px",
            background: "rgba(251, 191, 36, 0.1)",
            border: `1px solid ${S.amber}`,
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            ⚠️ Map all required fields to preview data
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Preview Tab
// ═══════════════════════════════════════════════════════════════════════════════
function PreviewTab({
  previewData,
  previewLoading,
  mappings,
}: {
  previewData: PreviewRow[];
  previewLoading: boolean;
  mappings: FieldMapping[];
}) {
  if (previewLoading) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 400,
        gap: 20,
      }}>
        <Spinner />
        <div style={{
          fontFamily: S.fontMono,
          fontSize: "12px",
          color: S.secondary,
        }}>
          Loading preview data...
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Panel title="Data Preview (First 3 Rows)" step="3.1">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${S.rim}` }}>
                {Object.keys(previewData[0] || {}).map(col => (
                  <th key={col} style={{
                    fontFamily: S.fontMono,
                    fontSize: "10px",
                    fontWeight: 700,
                    color: S.tertiary,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    padding: "12px",
                    textAlign: "left",
                    background: S.bgSub,
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewData.map((row, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${S.soft}` }}>
                  {Object.values(row).map((val, j) => (
                    <td key={j} style={{
                      padding: "12px",
                      fontFamily: S.fontMono,
                      fontSize: "12px",
                      color: S.primary,
                    }}>
                      {String(val)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div style={{
        background: "rgba(34, 197, 94, 0.1)",
        border: `1px solid ${S.pass}`,
        borderRadius: 6,
        padding: 20,
        fontFamily: S.fontMono,
        fontSize: "11px",
        color: S.pass,
      }}>
        ✓ Preview successful. Ready to import {previewData.length} rows. Configure import schedule or run manual import.
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Schedule Tab
// ═══════════════════════════════════════════════════════════════════════════════
function ScheduleTab({
  scheduleEnabled,
  setScheduleEnabled,
  scheduleInterval,
  setScheduleInterval,
  scheduleTime,
  setScheduleTime,
}: {
  scheduleEnabled: boolean;
  setScheduleEnabled: (v: boolean) => void;
  scheduleInterval: string;
  setScheduleInterval: (v: string) => void;
  scheduleTime: string;
  setScheduleTime: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Panel title="Automated Import Schedule" step="4.1">
        <div style={{ marginBottom: 24 }}>
          <label style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            cursor: "pointer",
            fontFamily: S.fontUI,
            fontSize: "13px",
            fontWeight: 600,
          }}>
            <input
              type="checkbox"
              checked={scheduleEnabled}
              onChange={e => setScheduleEnabled(e.target.checked)}
              style={{ width: 20, height: 20, cursor: "pointer" }}
            />
            Enable Automated Imports
          </label>
        </div>

        {scheduleEnabled && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{
                fontFamily: S.fontUI,
                fontSize: "11px",
                fontWeight: 600,
                color: S.secondary,
                marginBottom: 8,
                display: "block",
                textTransform: "uppercase",
              }}>
                Frequency
              </label>
              <select
                value={scheduleInterval}
                onChange={e => setScheduleInterval(e.target.value)}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: "13px",
                  padding: "10px 14px",
                  background: S.bgDeep,
                  border: `1px solid ${S.rim}`,
                  borderRadius: 4,
                  color: S.primary,
                  cursor: "pointer",
                  width: 300,
                }}
              >
                <option value="hourly">Every Hour</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            <div>
              <label style={{
                fontFamily: S.fontUI,
                fontSize: "11px",
                fontWeight: 600,
                color: S.secondary,
                marginBottom: 8,
                display: "block",
                textTransform: "uppercase",
              }}>
                Time (UTC)
              </label>
              <input
                type="time"
                value={scheduleTime}
                onChange={e => setScheduleTime(e.target.value)}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: "13px",
                  padding: "10px 14px",
                  background: S.bgDeep,
                  border: `1px solid ${S.rim}`,
                  borderRadius: 4,
                  color: S.primary,
                  width: 200,
                }}
              />
            </div>
          </div>
        )}
      </Panel>

      <div style={{
        background: "rgba(251, 191, 36, 0.1)",
        border: `1px solid ${S.amber}`,
        borderRadius: 6,
        padding: 20,
        fontFamily: S.fontMono,
        fontSize: "11px",
        color: S.secondary,
      }}>
        <strong style={{ color: S.amber }}>COMING SOON:</strong> Automated scheduling will be available in next release. Manual import is currently available.
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shared Components
// ═══════════════════════════════════════════════════════════════════════════════
function Panel({ title, step, children }: { title: string; step: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: S.bgPanel,
      border: `1px solid ${S.rim}`,
      borderRadius: 6,
      padding: 24,
    }}>
      <div style={{
        display: "flex",
        alignItems: "baseline",
        gap: 12,
        marginBottom: 20,
        paddingBottom: 12,
        borderBottom: `1px solid ${S.soft}`,
      }}>
        <span style={{
          fontFamily: S.fontMono,
          fontSize: "10px",
          color: S.tertiary,
          letterSpacing: "0.5px",
        }}>
          {step}
        </span>
        <span style={{
          fontFamily: S.fontUI,
          fontSize: "14px",
          fontWeight: 600,
          color: S.primary,
        }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <>
      <div style={{
        width: 14,
        height: 14,
        border: `2px solid ${S.bgDeep}`,
        borderTopColor: "transparent",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}

function Footer() {
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () => setClock(new Date().toISOString().slice(0, 19).replace("T", " ") + " UTC");
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <footer style={{
      height: 32,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderTop: `1px solid ${S.rim}`,
      background: S.bgPanel,
      flexShrink: 0,
    }}>
      <span style={{
        fontFamily: S.fontMono,
        fontSize: "10px",
        color: S.tertiary,
        letterSpacing: "0.06em",
      }}>
        {clock} — ORDR Terminal · Database Connection Module
      </span>
    </footer>
  );
}
