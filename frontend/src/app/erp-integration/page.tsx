"use client";

/**
 * erp-integration/page.tsx -- ERP Connector Configuration
 *
 * Production-grade ERP connector page for ORDR Terminal.
 * Supports SAP, Oracle, NetSuite, and Microsoft Dynamics.
 * All configuration is persisted to localStorage.
 */

import { useState, useEffect } from "react";
import { useAuth } from "../../lib/authContext";
import { useRouter } from "next/navigation";

// -- Hydration-safe timestamp hook ------------------------------------------------
function useRenderTs(): string {
  const [renderTs, setRenderTs] = useState("");
  useEffect(() => {
    setRenderTs(new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC");
  }, []);
  return renderTs;
}

// -- Design tokens ----------------------------------------------------------------
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
  pass:      "var(--status-pass)",
  fail:      "var(--accent-red,#B91C1C)",
} as const;

// -- Tab & type definitions -------------------------------------------------------
type ERPTab = "SAP" | "Oracle" | "NetSuite" | "Microsoft Dynamics";
type ConnStatus = "NOT_CONFIGURED" | "CONFIGURED" | "AUTHORIZED" | "ERROR";
type TestState = "idle" | "loading" | "success" | "failed";
type SyncState = "idle" | "syncing" | "complete" | "failed";

const ERP_TABS: ERPTab[] = ["SAP", "Oracle", "NetSuite", "Microsoft Dynamics"];
const AUTH_METHODS = ["OAuth 2.0", "API Key", "Basic Auth", "Certificate"] as const;
const SYNC_SCHEDULES = ["Manual", "Hourly", "Daily", "Weekly"] as const;

const ORDR_FIELDS = [
  "trade_ref",
  "currency",
  "notional",
  "settlement_date",
  "counterparty",
  "entity",
  "flow_type",
  "description",
] as const;

const TRANSFORMS = [
  "direct",
  "ABS()",
  "ISO 8601",
  "trim()",
  "prefix()",
  "YYYYMMDD→ISO",
  "—",
] as const;

// -- Config interfaces ------------------------------------------------------------
interface ERPConfig {
  systemName:    string;
  endpointUrl:   string;
  clientId:      string;
  authMethod:    string;
  syncSchedule:  string;
}

interface FieldMapping {
  id:           string;
  sourceField:  string;
  ordrField:    string;
  transform:    string;
  status:       "MAPPED" | "PENDING";
}

interface TestResult {
  reachable:    boolean;
  status_code?: number;
  latency_ms?:  number;
  error?:       string;
}

// -- Empty defaults ---------------------------------------------------------------
const EMPTY_CONFIG: ERPConfig = {
  systemName:   "",
  endpointUrl:  "",
  clientId:     "",
  authMethod:   "OAuth 2.0",
  syncSchedule: "Daily",
};

function makeEmptyConfigs(): Record<ERPTab, ERPConfig> {
  return {
    SAP:                   { ...EMPTY_CONFIG },
    Oracle:                { ...EMPTY_CONFIG },
    NetSuite:              { ...EMPTY_CONFIG },
    "Microsoft Dynamics":  { ...EMPTY_CONFIG },
  };
}

function makeEmptyStatuses(): Record<ERPTab, ConnStatus> {
  return {
    SAP:                   "NOT_CONFIGURED",
    Oracle:                "NOT_CONFIGURED",
    NetSuite:              "NOT_CONFIGURED",
    "Microsoft Dynamics":  "NOT_CONFIGURED",
  };
}

function makeEmptyMappings(): FieldMapping[] {
  return [
    { id: crypto.randomUUID(), sourceField: "", ordrField: "", transform: "direct", status: "PENDING" },
    { id: crypto.randomUUID(), sourceField: "", ordrField: "", transform: "direct", status: "PENDING" },
    { id: crypto.randomUUID(), sourceField: "", ordrField: "", transform: "direct", status: "PENDING" },
  ];
}

// -- Badge helpers ----------------------------------------------------------------
function badge(
  text: string,
  color: string,
  extraStyle?: React.CSSProperties
): React.CSSProperties {
  return {
    fontFamily:    S.fontMono,
    fontSize:      9,
    fontWeight:    700,
    letterSpacing: "0.08em",
    color,
    background:    `color-mix(in srgb, ${color} 12%, transparent)`,
    border:        `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
    padding:       "1px 5px",
    borderRadius:  2,
    display:       "inline-block",
    whiteSpace:    "nowrap" as const,
    ...extraStyle,
  };
}

function connStatusColor(status: ConnStatus): string {
  switch (status) {
    case "AUTHORIZED":     return S.pass;
    case "CONFIGURED":     return S.cyan;
    case "ERROR":          return S.fail;
    case "NOT_CONFIGURED": return S.tertiary;
  }
}

// -- Shared input styles ----------------------------------------------------------
const labelStyle: React.CSSProperties = {
  fontFamily:    S.fontMono,
  fontSize:      10,
  fontWeight:    600,
  letterSpacing: "0.08em",
  color:         S.tertiary,
  textTransform: "uppercase",
  marginBottom:  4,
};

const inputStyle: React.CSSProperties = {
  fontFamily:  S.fontMono,
  fontSize:    12,
  color:       S.primary,
  background:  S.bgDeep,
  border:      `1px solid var(--border-rim)`,
  padding:     "7px 10px",
  width:       "100%",
  borderRadius: 2,
  outline:     "none",
  boxSizing:   "border-box",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance:          "none",
  backgroundImage:     `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236b7280' fill='none' stroke-width='1.2'/%3E%3C/svg%3E")`,
  backgroundRepeat:    "no-repeat",
  backgroundPosition:  "right 10px center",
  paddingRight:        28,
};

const smallSelectStyle: React.CSSProperties = {
  ...selectStyle,
  fontSize:    11,
  padding:     "4px 24px 4px 6px",
  width:       "100%",
  height:      26,
  borderRadius: 2,
};

// =================================================================================
// PAGE
// =================================================================================
export default function ERPIntegrationPage() {
  const renderTs = useRenderTs();
  const { isAuthenticated, token } = useAuth();
  const router = useRouter();

  // -- State -------------------------------------------------------------------
  const [activeTab,   setActiveTab]   = useState<ERPTab>("SAP");
  const [configs,     setConfigs]     = useState<Record<ERPTab, ERPConfig>>(makeEmptyConfigs);
  const [statuses,    setStatuses]    = useState<Record<ERPTab, ConnStatus>>(makeEmptyStatuses);
  const [mappings,    setMappings]    = useState<Record<ERPTab, FieldMapping[]>>(() => ({
    SAP:                   makeEmptyMappings(),
    Oracle:                makeEmptyMappings(),
    NetSuite:              makeEmptyMappings(),
    "Microsoft Dynamics":  makeEmptyMappings(),
  }));

  const [saveFlash,   setSaveFlash]   = useState(false);
  const [testState,   setTestState]   = useState<TestState>("idle");
  const [testResult,  setTestResult]  = useState<TestResult | null>(null);
  const [syncState,   setSyncState]   = useState<SyncState>("idle");
  const [oAuthFlash,  setOAuthFlash]  = useState<ERPTab | null>(null);
  const [mappingSaved, setMappingSaved] = useState(false);

  // -- Auth guard (useEffect, not early return) ---------------------------------
  useEffect(() => {
    if (!isAuthenticated) router.push("/auth/login");
  }, [isAuthenticated, router]);

  // -- Load from localStorage on mount -----------------------------------------
  useEffect(() => {
    try {
      const savedConfigs = localStorage.getItem("ordr_erp_configs");
      if (savedConfigs) {
        const parsed = JSON.parse(savedConfigs) as Record<ERPTab, ERPConfig>;
        setConfigs(parsed);
      }
    } catch { /* ignore */ }

    try {
      const savedStatuses = localStorage.getItem("ordr_erp_status");
      if (savedStatuses) {
        const parsed = JSON.parse(savedStatuses) as Record<ERPTab, ConnStatus>;
        setStatuses(parsed);
      }
    } catch { /* ignore */ }

    // Load per-tab mappings
    const loadedMappings: Record<ERPTab, FieldMapping[]> = {
      SAP:                   makeEmptyMappings(),
      Oracle:                makeEmptyMappings(),
      NetSuite:              makeEmptyMappings(),
      "Microsoft Dynamics":  makeEmptyMappings(),
    };
    for (const tab of ERP_TABS) {
      try {
        const key = `ordr_erp_mappings_${tab}`;
        const saved = localStorage.getItem(key);
        if (saved) {
          const parsed = JSON.parse(saved) as FieldMapping[];
          loadedMappings[tab] = parsed;
        }
      } catch { /* ignore */ }
    }
    setMappings(loadedMappings);
  }, []);

  // -- Reset test state when switching tabs ------------------------------------
  useEffect(() => {
    setTestState("idle");
    setTestResult(null);
    setSyncState("idle");
    setMappingSaved(false);
  }, [activeTab]);

  if (!isAuthenticated) return null;

  // -- Derived -----------------------------------------------------------------
  const currentConfig   = configs[activeTab];
  const currentMappings = mappings[activeTab];
  const currentStatus   = statuses[activeTab];
  const configuredCount = ERP_TABS.filter(t => configs[t].endpointUrl.trim() !== "").length;

  const mappedCount  = currentMappings.filter(m => m.status === "MAPPED").length;
  const pendingCount = currentMappings.filter(m => m.status === "PENDING").length;

  // -- Helpers -----------------------------------------------------------------
  function updateStatus(tab: ERPTab, status: ConnStatus) {
    setStatuses(prev => {
      const next = { ...prev, [tab]: status };
      localStorage.setItem("ordr_erp_status", JSON.stringify(next));
      return next;
    });
  }

  function updateConfig(field: keyof ERPConfig, value: string) {
    setConfigs(prev => ({
      ...prev,
      [activeTab]: { ...prev[activeTab], [field]: value },
    }));
  }

  function handleSave() {
    const next = { ...configs };
    localStorage.setItem("ordr_erp_configs", JSON.stringify(next));
    // Update status: CONFIGURED if endpointUrl is non-empty and not yet AUTHORIZED
    if (currentConfig.endpointUrl.trim() !== "" && currentStatus === "NOT_CONFIGURED") {
      updateStatus(activeTab, "CONFIGURED");
    }
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1800);
  }

  async function handleTestConnection() {
    if (!currentConfig.endpointUrl) return;
    setTestState("loading");
    setTestResult(null);
    try {
      const res = await fetch("/api/erp-probe", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          endpoint_url: currentConfig.endpointUrl,
          auth_method:  currentConfig.authMethod,
        }),
      });
      const data = (await res.json()) as TestResult;
      setTestResult(data);
      setTestState(data.reachable ? "success" : "failed");
      if (data.reachable) updateStatus(activeTab, "AUTHORIZED");
    } catch {
      setTestState("failed");
      setTestResult({ reachable: false, error: "Network error" });
    }
  }

  function handleAuthorize(system: ERPTab) {
    const popup = window.open(
      `/api/erp-oauth-start?system=${encodeURIComponent(system)}`,
      "erp-oauth",
      "width=600,height=700,scrollbars=yes"
    );
    const poll = setInterval(() => {
      if (popup?.closed) {
        clearInterval(poll);
        const authorized = localStorage.getItem(`ordr_erp_oauth_${system}`);
        if (authorized === "authorized") {
          updateStatus(system, "AUTHORIZED");
          setOAuthFlash(system);
          setTimeout(() => setOAuthFlash(null), 3000);
        }
      }
    }, 500);
  }

  async function handleSyncNow() {
    if (!currentConfig.endpointUrl) return;
    setSyncState("syncing");
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
      const res = await fetch(`${apiBase}/v1/connectors/erp/sync`, {
        method:  "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({ system: activeTab, config: currentConfig }),
      });
      setSyncState(res.ok ? "complete" : "failed");
    } catch {
      setSyncState("failed");
    }
    setTimeout(() => setSyncState("idle"), 4000);
  }

  // -- Mapping helpers ---------------------------------------------------------
  function updateMappingRow(id: string, field: keyof FieldMapping, value: string) {
    setMappings(prev => {
      const rows = prev[activeTab].map(row => {
        if (row.id !== id) return row;
        const updated = { ...row, [field]: value };
        updated.status =
          updated.sourceField.trim() !== "" && updated.ordrField !== ""
            ? "MAPPED"
            : "PENDING";
        return updated;
      });
      return { ...prev, [activeTab]: rows };
    });
  }

  function deleteMappingRow(id: string) {
    setMappings(prev => ({
      ...prev,
      [activeTab]: prev[activeTab].filter(r => r.id !== id),
    }));
  }

  function addMappingRow() {
    const newRow: FieldMapping = {
      id:          crypto.randomUUID(),
      sourceField: "",
      ordrField:   "",
      transform:   "direct",
      status:      "PENDING",
    };
    setMappings(prev => ({
      ...prev,
      [activeTab]: [...prev[activeTab], newRow],
    }));
  }

  function handleSaveMapping() {
    const key = `ordr_erp_mappings_${activeTab}`;
    localStorage.setItem(key, JSON.stringify(currentMappings));
    setMappingSaved(true);
    setTimeout(() => setMappingSaved(false), 1800);
  }

  // -- Sync button label -------------------------------------------------------
  function syncLabel(): string {
    switch (syncState) {
      case "syncing":  return "SYNCING…";
      case "complete": return "SYNC COMPLETE";
      case "failed":   return "SYNC FAILED";
      default:         return "SYNC NOW";
    }
  }

  function syncColor(): string {
    switch (syncState) {
      case "complete": return S.pass;
      case "failed":   return S.fail;
      default:         return S.amber;
    }
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================
  return (
    <div style={{
      minHeight:  "100vh",
      display:    "flex",
      flexDirection: "column",
      background: S.bgDeep,
      fontFamily: S.fontUI,
      color:      S.primary,
    }}>

      {/* ====== TopBar (44px) ====== */}
      <header style={{
        display:       "flex",
        alignItems:    "center",
        gap:           12,
        height:        44,
        padding:       "0 20px",
        background:    S.bgPanel,
        borderBottom:  `1px solid ${S.rim}`,
        flexShrink:    0,
      }}>
        {/* Back button */}
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            fontFamily:    S.fontMono,
            fontSize:      10,
            color:         S.tertiary,
            background:    "transparent",
            border:        `1px solid ${S.rim}`,
            padding:       "3px 8px",
            borderRadius:  2,
            cursor:        "pointer",
            letterSpacing: "0.06em",
          }}
        >
          ← BACK
        </button>

        {/* Icon */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1" y="2" width="6" height="12" rx="1" stroke={S.cyan} strokeWidth="1.25" />
          <rect x="9" y="2" width="6" height="12" rx="1" stroke={S.cyan} strokeWidth="1.25" />
          <path d="M7 6h2M7 10h2" stroke={S.cyan} strokeWidth="1" strokeLinecap="round" />
        </svg>

        <div>
          <div style={{
            fontFamily:    S.fontUI,
            fontSize:      13,
            fontWeight:    700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color:         S.primary,
            lineHeight:    1.1,
          }}>
            ERP Integration
          </div>
          <div style={{ fontFamily: S.fontMono, fontSize: 11, letterSpacing: "0.07em", color: S.tertiary }}>
            POSITION DESK &gt; ERP INTEGRATION
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* KPI chips */}
        <div style={{ display: "flex", gap: 0, alignItems: "stretch", border: `1px solid ${S.rim}` }}>
          {([
            { label: "SYSTEMS",    value: "4",                    color: S.primary  },
            { label: "CONFIGURED", value: String(configuredCount), color: S.cyan    },
            {
              label: "STATUS",
              value: currentStatus,
              color: connStatusColor(currentStatus),
            },
          ] as Array<{ label: string; value: string; color: string }>).map(({ label, value, color }, i, arr) => (
            <div key={label} style={{
              padding:      "4px 12px",
              display:      "flex",
              flexDirection: "column",
              gap:          1,
              borderRight:  i < arr.length - 1 ? `1px solid ${S.rim}` : "none",
            }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.05em" }}>
                {label}
              </span>
              <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color, lineHeight: 1 }}>
                {value}
              </span>
            </div>
          ))}
        </div>

        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>{renderTs}</span>
      </header>

      {/* ====== Tab Bar (36px) ====== */}
      <div style={{
        display:       "flex",
        alignItems:    "center",
        background:    S.bgPanel,
        borderBottom:  `1px solid ${S.rim}`,
        padding:       "0 20px",
        height:        36,
        flexShrink:    0,
      }}>
        {ERP_TABS.map(tab => {
          const tabStatus = statuses[tab];
          const tabColor  = connStatusColor(tabStatus);
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                fontFamily:   S.fontMono,
                fontSize:     12,
                letterSpacing: "0.04em",
                padding:      "0 14px",
                height:       "100%",
                display:      "flex",
                alignItems:   "center",
                gap:          6,
                color:        activeTab === tab ? S.cyan : S.tertiary,
                borderBottom: activeTab === tab ? `2px solid ${S.cyan}` : "2px solid transparent",
                borderTop:    "none",
                borderLeft:   "none",
                borderRight:  "none",
                background:   "transparent",
                cursor:       "pointer",
                fontWeight:   activeTab === tab ? 600 : 400,
                transition:   "color 0.15s, border-color 0.15s",
                whiteSpace:   "nowrap",
              }}
            >
              {tab}
              {tabStatus !== "NOT_CONFIGURED" && (
                <span style={badge(tabStatus, tabColor)}>
                  {tabStatus === "AUTHORIZED" ? "AUTH" : tabStatus === "CONFIGURED" ? "CFG" : "ERR"}
                </span>
              )}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
      </div>

      {/* ====== Content ====== */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{
          maxWidth:      1440,
          margin:        "0 auto",
          padding:       "20px 24px",
          display:       "flex",
          flexDirection: "column",
          gap:           20,
        }}>

          {/* ------ Connection Configuration Card ------ */}
          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 2 }}>
            <div style={{
              padding:       "10px 16px",
              borderBottom:  `1px solid ${S.rim}`,
              background:    S.bgSub,
              display:       "flex",
              alignItems:    "center",
              justifyContent: "space-between",
            }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 10, letterSpacing: "0.08em", color: S.tertiary }}>
                CONNECTION CONFIGURATION — {activeTab.toUpperCase()}
              </span>
              <span style={badge(currentStatus, connStatusColor(currentStatus))}>
                {currentStatus.replace("_", " ")}
              </span>
            </div>

            {/* Form grid */}
            <div style={{
              padding:             "16px 16px 20px",
              display:             "grid",
              gridTemplateColumns: "1fr 1fr",
              gap:                 "14px 20px",
            }}>
              {/* System Name */}
              <div>
                <div style={labelStyle}>SYSTEM NAME</div>
                <input
                  type="text"
                  value={currentConfig.systemName}
                  onChange={e => updateConfig("systemName", e.target.value)}
                  placeholder={`e.g. ${activeTab} Production`}
                  style={inputStyle}
                />
              </div>

              {/* Endpoint URL */}
              <div>
                <div style={labelStyle}>ENDPOINT URL</div>
                <input
                  type="text"
                  value={currentConfig.endpointUrl}
                  onChange={e => updateConfig("endpointUrl", e.target.value)}
                  placeholder="https://your-instance.example.com/api/v1"
                  style={inputStyle}
                />
              </div>

              {/* Client ID */}
              <div>
                <div style={labelStyle}>SYSTEM ID / CLIENT ID</div>
                <input
                  type="text"
                  value={currentConfig.clientId}
                  onChange={e => updateConfig("clientId", e.target.value)}
                  placeholder="e.g. prod-client-001"
                  style={inputStyle}
                />
              </div>

              {/* Auth Method */}
              <div>
                <div style={labelStyle}>AUTHENTICATION METHOD</div>
                <select
                  value={currentConfig.authMethod}
                  onChange={e => updateConfig("authMethod", e.target.value)}
                  style={selectStyle}
                >
                  {AUTH_METHODS.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {/* Credentials row (full-width) */}
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={labelStyle}>CREDENTIALS</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="password"
                    placeholder={
                      currentConfig.authMethod === "OAuth 2.0"
                        ? "Client secret — stored in your vault"
                        : "API key or password"
                    }
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  {currentConfig.authMethod === "OAuth 2.0" && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleAuthorize(activeTab)}
                        style={{
                          fontFamily:    S.fontMono,
                          fontSize:      11,
                          fontWeight:    600,
                          letterSpacing: "0.06em",
                          color:         S.amber,
                          background:    "transparent",
                          border:        `1px solid ${S.amber}`,
                          padding:       "7px 14px",
                          borderRadius:  2,
                          cursor:        "pointer",
                          whiteSpace:    "nowrap",
                          flexShrink:    0,
                        }}
                      >
                        AUTHORIZE →
                      </button>
                      {oAuthFlash === activeTab || currentStatus === "AUTHORIZED" ? (
                        <span style={badge("AUTHORIZED ✓", S.pass)}>AUTHORIZED ✓</span>
                      ) : (
                        <span style={badge("PENDING AUTHORIZATION", S.amber)}>
                          PENDING AUTHORIZATION
                        </span>
                      )}
                    </>
                  )}
                </div>
                <div style={{
                  fontFamily:    S.fontMono,
                  fontSize:      10,
                  color:         S.tertiary,
                  marginTop:     4,
                  letterSpacing: "0.04em",
                }}>
                  Credentials are stored in your browser vault and never transmitted in plaintext.
                </div>
              </div>
            </div>
          </div>

          {/* ------ Field Mapping Card ------ */}
          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 2 }}>
            {/* Card header */}
            <div style={{
              padding:        "10px 16px",
              borderBottom:   `1px solid ${S.rim}`,
              background:     S.bgSub,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: S.fontMono, fontSize: 10, letterSpacing: "0.08em", color: S.tertiary }}>
                  FIELD MAPPING — {activeTab.toUpperCase()} → ORDR TRADEROW
                </span>
                <span style={badge("MAPPED", S.pass)}>{mappedCount} MAPPED</span>
                <span style={badge("PENDING", S.amber)}>{pendingCount} PENDING</span>
              </div>
              <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
                {currentMappings.length} ROWS
              </span>
            </div>

            {/* Table */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                    {["SOURCE FIELD", "ORDR FIELD", "TRANSFORM", "STATUS", ""].map((h, i) => (
                      <th
                        key={`${h}-${i}`}
                        style={{
                          padding:       "7px 12px",
                          textAlign:     "left",
                          fontFamily:    S.fontMono,
                          fontSize:      9,
                          letterSpacing: "0.07em",
                          color:         S.tertiary,
                          fontWeight:    600,
                          whiteSpace:    "nowrap",
                          width:         h === "" ? 32 : "auto",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {currentMappings.map((row, i) => (
                    <tr
                      key={row.id}
                      style={{
                        borderBottom: `1px solid ${S.soft}`,
                        background:   i % 2 === 0
                          ? "transparent"
                          : `color-mix(in srgb, ${S.rim} 12%, transparent)`,
                      }}
                    >
                      {/* Source field — editable input */}
                      <td style={{ padding: "5px 8px" }}>
                        <input
                          type="text"
                          value={row.sourceField}
                          onChange={e => updateMappingRow(row.id, "sourceField", e.target.value)}
                          placeholder="ERP field name"
                          style={{
                            fontFamily:   S.fontMono,
                            fontSize:     11,
                            color:        S.cyan,
                            background:   S.bgDeep,
                            border:       `1px solid ${S.rim}`,
                            padding:      "4px 8px",
                            borderRadius: 2,
                            outline:      "none",
                            width:        "100%",
                            minWidth:     120,
                            boxSizing:    "border-box",
                          }}
                        />
                      </td>

                      {/* ORDR field — select */}
                      <td style={{ padding: "5px 8px", minWidth: 140 }}>
                        <select
                          value={row.ordrField}
                          onChange={e => updateMappingRow(row.id, "ordrField", e.target.value)}
                          style={smallSelectStyle}
                        >
                          <option value="">— select field —</option>
                          {ORDR_FIELDS.map(f => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                      </td>

                      {/* Transform — select */}
                      <td style={{ padding: "5px 8px", minWidth: 140 }}>
                        <select
                          value={row.transform}
                          onChange={e => updateMappingRow(row.id, "transform", e.target.value)}
                          style={smallSelectStyle}
                        >
                          {TRANSFORMS.map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </td>

                      {/* Status badge */}
                      <td style={{ padding: "5px 12px", whiteSpace: "nowrap" }}>
                        <span style={badge(row.status, row.status === "MAPPED" ? S.pass : S.amber)}>
                          {row.status}
                        </span>
                      </td>

                      {/* Delete row */}
                      <td style={{ padding: "5px 8px", textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={() => deleteMappingRow(row.id)}
                          title="Remove row"
                          style={{
                            fontFamily:   S.fontMono,
                            fontSize:     12,
                            color:        S.tertiary,
                            background:   "transparent",
                            border:       "none",
                            cursor:       "pointer",
                            padding:      "2px 6px",
                            borderRadius: 2,
                            lineHeight:   1,
                          }}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Table footer */}
            <div style={{
              padding:        "10px 12px",
              borderTop:      `1px solid ${S.rim}`,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
              gap:            12,
            }}>
              <button
                type="button"
                onClick={addMappingRow}
                style={{
                  fontFamily:    S.fontMono,
                  fontSize:      11,
                  fontWeight:    600,
                  letterSpacing: "0.06em",
                  color:         S.secondary,
                  background:    "transparent",
                  border:        `1px dashed ${S.rim}`,
                  padding:       "5px 14px",
                  borderRadius:  2,
                  cursor:        "pointer",
                }}
              >
                + ADD FIELD MAPPING
              </button>

              <button
                type="button"
                onClick={handleSaveMapping}
                style={{
                  fontFamily:    S.fontMono,
                  fontSize:      11,
                  fontWeight:    700,
                  letterSpacing: "0.06em",
                  color:         S.bgDeep,
                  background:    mappingSaved ? S.pass : S.secondary,
                  border:        "none",
                  padding:       "5px 16px",
                  borderRadius:  2,
                  cursor:        "pointer",
                  transition:    "background 0.2s",
                }}
              >
                {mappingSaved ? "MAPPING SAVED ✓" : "SAVE MAPPING"}
              </button>
            </div>
          </div>

          {/* ------ Action Row ------ */}
          <div style={{
            background:  S.bgPanel,
            border:      `1px solid ${S.rim}`,
            borderRadius: 2,
            padding:     "12px 16px",
            display:     "flex",
            alignItems:  "flex-start",
            gap:         16,
            flexWrap:    "wrap",
          }}>
            {/* Test Connection */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={!currentConfig.endpointUrl || testState === "loading"}
                style={{
                  fontFamily:    S.fontMono,
                  fontSize:      11,
                  fontWeight:    600,
                  letterSpacing: "0.06em",
                  color:         !currentConfig.endpointUrl ? S.tertiary : S.cyan,
                  background:    "transparent",
                  border:        `1px solid ${!currentConfig.endpointUrl ? S.rim : S.cyan}`,
                  padding:       "6px 16px",
                  borderRadius:  2,
                  cursor:        !currentConfig.endpointUrl ? "not-allowed" : "pointer",
                  opacity:       !currentConfig.endpointUrl ? 0.5 : 1,
                  display:       "flex",
                  alignItems:    "center",
                  gap:           6,
                  whiteSpace:    "nowrap",
                  transition:    "opacity 0.15s",
                }}
              >
                {testState === "loading" && (
                  <span style={{
                    display:        "inline-block",
                    animation:      "spin 0.8s linear infinite",
                    fontSize:       12,
                  }}>◌</span>
                )}
                {testState === "loading" ? "TESTING…" : "TEST CONNECTION →"}
              </button>

              {/* Test result row */}
              {testState === "success" && testResult && (
                <div style={{
                  fontFamily:    S.fontMono,
                  fontSize:      10,
                  fontWeight:    600,
                  letterSpacing: "0.06em",
                  color:         S.pass,
                  display:       "flex",
                  alignItems:    "center",
                  gap:           4,
                }}>
                  ● REACHABLE
                  {testResult.latency_ms !== undefined && ` · ${testResult.latency_ms}ms`}
                  {testResult.status_code !== undefined && ` · HTTP ${testResult.status_code}`}
                </div>
              )}
              {testState === "failed" && testResult && (
                <div style={{
                  fontFamily:    S.fontMono,
                  fontSize:      10,
                  fontWeight:    600,
                  letterSpacing: "0.06em",
                  color:         S.fail,
                  display:       "flex",
                  alignItems:    "center",
                  gap:           4,
                }}>
                  ● UNREACHABLE
                  {testResult.status_code && ` · HTTP ${testResult.status_code}`}
                  {testResult.error && ` · ${testResult.error}`}
                </div>
              )}
            </div>

            {/* Separator */}
            <div style={{ width: 1, height: 32, background: S.rim, alignSelf: "center" }} />

            {/* Sync Schedule */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                fontFamily:    S.fontMono,
                fontSize:      10,
                fontWeight:    600,
                letterSpacing: "0.08em",
                color:         S.tertiary,
                whiteSpace:    "nowrap",
              }}>
                SYNC SCHEDULE
              </span>
              <select
                value={currentConfig.syncSchedule}
                onChange={e => updateConfig("syncSchedule", e.target.value)}
                style={{ ...selectStyle, width: "auto", minWidth: 110 }}
              >
                {SYNC_SCHEDULES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Separator */}
            <div style={{ width: 1, height: 32, background: S.rim, alignSelf: "center" }} />

            {/* Sync Now */}
            <button
              type="button"
              onClick={handleSyncNow}
              disabled={!currentConfig.endpointUrl || syncState === "syncing"}
              style={{
                fontFamily:    S.fontMono,
                fontSize:      11,
                fontWeight:    600,
                letterSpacing: "0.06em",
                color:         !currentConfig.endpointUrl ? S.tertiary : syncColor(),
                background:    "transparent",
                border:        `1px solid ${!currentConfig.endpointUrl ? S.rim : syncColor()}`,
                padding:       "6px 16px",
                borderRadius:  2,
                cursor:        !currentConfig.endpointUrl ? "not-allowed" : "pointer",
                opacity:       !currentConfig.endpointUrl ? 0.5 : 1,
                whiteSpace:    "nowrap",
                transition:    "color 0.2s, border-color 0.2s",
              }}
            >
              {syncLabel()}
            </button>

            <div style={{ flex: 1 }} />

            {/* Save Configuration */}
            <button
              type="button"
              onClick={handleSave}
              style={{
                fontFamily:    S.fontMono,
                fontSize:      11,
                fontWeight:    700,
                letterSpacing: "0.06em",
                color:         S.bgDeep,
                background:    saveFlash ? S.pass : S.cyan,
                border:        "none",
                padding:       "7px 20px",
                borderRadius:  2,
                cursor:        "pointer",
                transition:    "background 0.2s",
                whiteSpace:    "nowrap",
              }}
            >
              {saveFlash ? "SAVED ✓" : "SAVE CONFIGURATION"}
            </button>
          </div>

        </div>
      </div>

      {/* ====== Footer (32px) ====== */}
      <footer style={{
        height:         32,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        background:     S.bgPanel,
        borderTop:      `1px solid ${S.rim}`,
        flexShrink:     0,
      }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.06em" }}>
          {renderTs} — ORDR · ERP Integration · {configuredCount}/4 connectors configured
        </span>
      </footer>

      {/* Spinner keyframes */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
