"use client";

/**
 * erp-integration/page.tsx -- ERP Integration
 *
 * Configure SAP, Oracle, NetSuite, and Microsoft Dynamics connectors
 * to automatically import FX exposure positions into ORDR TradeRow.
 * Demo data reflects a Mexican manufacturing company hedging USD/MXN.
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

// -- Tab definitions --------------------------------------------------------------
type ERPTab = "SAP" | "Oracle" | "NetSuite" | "Microsoft Dynamics";

const ERP_TABS: ERPTab[] = ["SAP", "Oracle", "NetSuite", "Microsoft Dynamics"];

// -- Auth methods -----------------------------------------------------------------
const AUTH_METHODS = ["API Key", "OAuth 2.0", "Basic Auth", "Certificate"] as const;

// -- Sync schedule options --------------------------------------------------------
const SYNC_SCHEDULES = ["Manual", "Hourly", "Daily", "Weekly"] as const;

// -- Per-system demo configuration ------------------------------------------------
interface ERPConfig {
  systemName: string;
  endpointUrl: string;
  clientId: string;
  authMethod: string;
  syncSchedule: string;
}

const DEMO_CONFIGS: Record<ERPTab, ERPConfig> = {
  SAP: {
    systemName: "SAP S/4HANA Finance",
    endpointUrl: "https://mxmfg-prod.s4hana.ondemand.com/sap/opu/odata4/sap/api_journalentryitembasic/srvd_a2x/sap/journalentryitembasic/0001",
    clientId: "MX-MFG-PROD-800",
    authMethod: "OAuth 2.0",
    syncSchedule: "Daily",
  },
  Oracle: {
    systemName: "Oracle Fusion Cloud ERP",
    endpointUrl: "https://mxmfg.fa.us6.oraclecloud.com/fscmRestApi/resources/11.13.18.05/invoices",
    clientId: "FA-MX-MANUFACTURING-01",
    authMethod: "OAuth 2.0",
    syncSchedule: "Hourly",
  },
  NetSuite: {
    systemName: "NetSuite SuiteCloud",
    endpointUrl: "https://mxmfg.suitetalk.api.netsuite.com/services/rest/record/v1/invoice",
    clientId: "NS-MXMFG-2026-PROD",
    authMethod: "API Key",
    syncSchedule: "Daily",
  },
  "Microsoft Dynamics": {
    systemName: "Dynamics 365 Finance",
    endpointUrl: "https://mxmfg-prod.operations.dynamics.com/data/VendorInvoiceHeaders",
    clientId: "d365-mxmfg-fx-connector",
    authMethod: "OAuth 2.0",
    syncSchedule: "Hourly",
  },
};

// -- Field mapping data -----------------------------------------------------------
interface FieldMapping {
  sourceField: string;
  ordrField: string;
  transform: string;
  status: "MAPPED" | "PENDING";
}

const FIELD_MAPPINGS: Record<ERPTab, FieldMapping[]> = {
  SAP: [
    { sourceField: "BUKRS",  ordrField: "company",     transform: "direct",                      status: "MAPPED"  },
    { sourceField: "WAERS",  ordrField: "currency",    transform: "ISO 4217 lookup",             status: "MAPPED"  },
    { sourceField: "DMBTR",  ordrField: "notional",    transform: "abs() * direction_sign",      status: "MAPPED"  },
    { sourceField: "BLDAT",  ordrField: "trade_date",  transform: "YYYYMMDD -> ISO 8601",        status: "MAPPED"  },
    { sourceField: "BELNR",  ordrField: "trade_ref",   transform: "prefix('SAP-')",              status: "MAPPED"  },
    { sourceField: "SHKZG",  ordrField: "direction",   transform: "S->SELL, H->BUY",             status: "MAPPED"  },
    { sourceField: "GSBER",  ordrField: "business_unit",transform: "lookup(org_map)",            status: "MAPPED"  },
    { sourceField: "KOSTL",  ordrField: "cost_center", transform: "direct",                      status: "MAPPED"  },
    { sourceField: "KURSF",  ordrField: "booked_rate", transform: "decimal(6)",                  status: "MAPPED"  },
    { sourceField: "ZUONR",  ordrField: "assignment",  transform: "trim()",                      status: "PENDING" },
    { sourceField: "SGTXT",  ordrField: "memo",        transform: "truncate(120)",               status: "PENDING" },
    { sourceField: "AUGDT",  ordrField: "settle_date", transform: "YYYYMMDD -> ISO 8601",        status: "PENDING" },
  ],
  Oracle: [
    { sourceField: "INVOICE_CURRENCY_CODE", ordrField: "currency",      transform: "direct",                   status: "MAPPED"  },
    { sourceField: "INVOICE_AMOUNT",        ordrField: "notional",      transform: "abs()",                    status: "MAPPED"  },
    { sourceField: "INVOICE_NUM",           ordrField: "trade_ref",     transform: "prefix('ORA-')",           status: "MAPPED"  },
    { sourceField: "INVOICE_DATE",          ordrField: "trade_date",    transform: "ISO 8601 parse",           status: "MAPPED"  },
    { sourceField: "VENDOR_NAME",           ordrField: "counterparty",  transform: "lookup(vendor_map)",       status: "MAPPED"  },
    { sourceField: "ORG_ID",               ordrField: "company",       transform: "lookup(org_map)",          status: "MAPPED"  },
    { sourceField: "PAYMENT_CURRENCY_CODE", ordrField: "settle_ccy",    transform: "direct",                   status: "MAPPED"  },
    { sourceField: "DUE_DATE",             ordrField: "settle_date",   transform: "ISO 8601 parse",           status: "MAPPED"  },
    { sourceField: "EXCHANGE_RATE",         ordrField: "booked_rate",   transform: "decimal(6)",               status: "MAPPED"  },
    { sourceField: "PAYMENT_METHOD_CODE",   ordrField: "settle_method", transform: "enum_map(CHECK,WIRE,ACH)", status: "PENDING" },
    { sourceField: "DESCRIPTION",           ordrField: "memo",          transform: "truncate(120)",            status: "PENDING" },
  ],
  NetSuite: [
    { sourceField: "tranid",         ordrField: "trade_ref",     transform: "prefix('NS-')",          status: "MAPPED"  },
    { sourceField: "currency.refName", ordrField: "currency",    transform: "ISO 4217 resolve",       status: "MAPPED"  },
    { sourceField: "amount",         ordrField: "notional",      transform: "abs()",                  status: "MAPPED"  },
    { sourceField: "tranDate",       ordrField: "trade_date",    transform: "MM/DD/YYYY -> ISO 8601", status: "MAPPED"  },
    { sourceField: "entity.refName", ordrField: "counterparty",  transform: "direct",                 status: "MAPPED"  },
    { sourceField: "subsidiary.refName", ordrField: "company",   transform: "lookup(sub_map)",        status: "MAPPED"  },
    { sourceField: "exchangeRate",   ordrField: "booked_rate",   transform: "decimal(6)",             status: "MAPPED"  },
    { sourceField: "dueDate",        ordrField: "settle_date",   transform: "MM/DD/YYYY -> ISO 8601", status: "MAPPED"  },
    { sourceField: "department.refName", ordrField: "business_unit", transform: "lookup(dept_map)",   status: "PENDING" },
    { sourceField: "memo",           ordrField: "memo",          transform: "truncate(120)",          status: "PENDING" },
    { sourceField: "classification.refName", ordrField: "exposure_type", transform: "enum_map",       status: "PENDING" },
  ],
  "Microsoft Dynamics": [
    { sourceField: "TransactionCurrencyId",     ordrField: "currency",      transform: "direct",                    status: "MAPPED"  },
    { sourceField: "ExtendedAmount",            ordrField: "notional",      transform: "abs()",                     status: "MAPPED"  },
    { sourceField: "InvoiceId",                 ordrField: "trade_ref",     transform: "prefix('D365-')",           status: "MAPPED"  },
    { sourceField: "InvoiceDate",               ordrField: "trade_date",    transform: "ISO 8601 parse",            status: "MAPPED"  },
    { sourceField: "VendorAccountNumber",       ordrField: "counterparty",  transform: "lookup(vendor_map)",        status: "MAPPED"  },
    { sourceField: "LegalEntityId",             ordrField: "company",       transform: "lookup(entity_map)",        status: "MAPPED"  },
    { sourceField: "ExchangeRate",              ordrField: "booked_rate",   transform: "decimal(6)",                status: "MAPPED"  },
    { sourceField: "DueDate",                   ordrField: "settle_date",   transform: "ISO 8601 parse",            status: "MAPPED"  },
    { sourceField: "PaymentMethodName",         ordrField: "settle_method", transform: "enum_map(WIRE,ACH,CHECK)",  status: "PENDING" },
    { sourceField: "CashDiscountAmount",        ordrField: "discount",      transform: "decimal(2)",                status: "PENDING" },
    { sourceField: "DefaultDimensionDisplayValue", ordrField: "cost_center", transform: "split('-')[1]",            status: "PENDING" },
  ],
};

// -- Badge component --------------------------------------------------------------
function StatusBadge({ status }: { status: "MAPPED" | "PENDING" }) {
  const color = status === "MAPPED" ? S.pass : S.amber;
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
      {status}
    </span>
  );
}

// -- Tooltip "Coming Soon" --------------------------------------------------------
function ComingSoonButton({ label }: { label: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          fontFamily: S.fontMono,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.06em",
          color: S.cyan,
          background: "transparent",
          border: `1px solid ${S.cyan}`,
          padding: "6px 16px",
          cursor: "default",
          borderRadius: 2,
        }}
      >
        {label}
      </button>
      {hovered && (
        <div style={{
          position: "absolute",
          bottom: "calc(100% + 6px)",
          left: "50%",
          transform: "translateX(-50%)",
          fontFamily: S.fontMono,
          fontSize: 10,
          color: S.bgDeep,
          background: S.amber,
          padding: "3px 8px",
          borderRadius: 2,
          whiteSpace: "nowrap",
          fontWeight: 600,
          letterSpacing: "0.06em",
          zIndex: 10,
        }}>
          COMING SOON
        </div>
      )}
    </div>
  );
}

// =================================================================================
// PAGE
// =================================================================================
export default function ERPIntegrationPage() {
  const renderTs = useRenderTs();
  const { isAuthenticated, token, user, isDemoMode } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<ERPTab>("SAP");
  const [configs, setConfigs] = useState<Record<ERPTab, ERPConfig>>(() =>
    DEMO_MODE || true // In demo: pre-fill, in prod: also pre-fill defaults
      ? { ...DEMO_CONFIGS }
      : {
          SAP:                  { systemName: "SAP", endpointUrl: "", clientId: "", authMethod: "API Key", syncSchedule: "Manual" },
          Oracle:               { systemName: "Oracle", endpointUrl: "", clientId: "", authMethod: "API Key", syncSchedule: "Manual" },
          NetSuite:             { systemName: "NetSuite", endpointUrl: "", clientId: "", authMethod: "API Key", syncSchedule: "Manual" },
          "Microsoft Dynamics": { systemName: "Microsoft Dynamics", endpointUrl: "", clientId: "", authMethod: "API Key", syncSchedule: "Manual" },
        }
  );
  const [saveFlash, setSaveFlash] = useState<ERPTab | null>(null);

  // -- Auth guard -----------------------------------------------------------------
  if (!isAuthenticated) {
    router.push("/auth/login");
    return null;
  }

  // -- Show empty state when not demo and no config --------------------------------
  if (!DEMO_MODE && !isDemoMode) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: S.bgDeep, fontFamily: S.fontUI, color: S.primary }}>
        {/* TopBar */}
        <header style={{
          display: "flex", alignItems: "center", gap: 12, height: 44,
          padding: "0 20px", background: S.bgPanel, borderBottom: `1px solid ${S.rim}`, flexShrink: 0,
        }}>
          <div>
            <div style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: S.primary, lineHeight: 1.1 }}>
              ERP Integration
            </div>
            <div style={{ fontFamily: S.fontMono, fontSize: 11, letterSpacing: "0.07em", color: S.tertiary }}>
              POSITION DESK &gt; ERP INTEGRATION
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>{renderTs}</span>
        </header>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
          <EmptyState
            type="empty"
            title="No ERP Configured"
            message="Configure your ERP connector to automatically import FX exposure positions."
          />
        </div>
        {/* Footer */}
        <footer style={{
          height: 32, display: "flex", alignItems: "center", justifyContent: "center",
          background: S.bgPanel, borderTop: `1px solid ${S.rim}`, flexShrink: 0,
        }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.06em" }}>
            {renderTs} — ORDR &middot; ERP Integration
          </span>
        </footer>
      </div>
    );
  }

  const currentConfig = configs[activeTab];
  const currentMappings = FIELD_MAPPINGS[activeTab];
  const mappedCount = currentMappings.filter(m => m.status === "MAPPED").length;
  const pendingCount = currentMappings.filter(m => m.status === "PENDING").length;

  function updateConfig(field: keyof ERPConfig, value: string) {
    setConfigs(prev => ({
      ...prev,
      [activeTab]: { ...prev[activeTab], [field]: value },
    }));
  }

  function handleSave() {
    setSaveFlash(activeTab);
    setTimeout(() => setSaveFlash(null), 1800);
  }

  // -- Shared label style ---------------------------------------------------------
  const labelStyle: React.CSSProperties = {
    fontFamily: S.fontMono,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.08em",
    color: S.tertiary,
    textTransform: "uppercase",
    marginBottom: 4,
  };

  const inputStyle: React.CSSProperties = {
    fontFamily: S.fontMono,
    fontSize: 12,
    color: S.primary,
    background: S.bgDeep,
    border: `1px solid ${S.rim}`,
    padding: "7px 10px",
    width: "100%",
    borderRadius: 2,
    outline: "none",
    boxSizing: "border-box",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: "none",
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236b7280' fill='none' stroke-width='1.2'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 10px center",
    paddingRight: 28,
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: S.bgDeep, fontFamily: S.fontUI, color: S.primary }}>

      {/* ====== TopBar (44px) ====== */}
      <header style={{
        display: "flex", alignItems: "center", gap: 12, height: 44,
        padding: "0 20px", background: S.bgPanel, borderBottom: `1px solid ${S.rim}`, flexShrink: 0,
      }}>
        {/* Icon */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="1" y="2" width="6" height="12" rx="1" stroke={S.cyan} strokeWidth="1.25" />
          <rect x="9" y="2" width="6" height="12" rx="1" stroke={S.cyan} strokeWidth="1.25" />
          <path d="M7 6h2M7 10h2" stroke={S.cyan} strokeWidth="1" strokeLinecap="round" />
        </svg>
        <div>
          <div style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: S.primary, lineHeight: 1.1 }}>
            ERP Integration
          </div>
          <div style={{ fontFamily: S.fontMono, fontSize: 11, letterSpacing: "0.07em", color: S.tertiary }}>
            POSITION DESK &gt; ERP INTEGRATION
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* KPI chips */}
        <div style={{ display: "flex", gap: 0, alignItems: "stretch", border: `1px solid ${S.rim}` }}>
          {[
            { label: "SYSTEMS",    value: "4",              color: S.primary },
            { label: "MAPPED",     value: String(mappedCount),  color: S.pass   },
            { label: "PENDING",    value: String(pendingCount), color: S.amber  },
            { label: "SYNC",       value: currentConfig.syncSchedule.toUpperCase(), color: S.cyan },
          ].map(({ label, value, color }, i, arr) => (
            <div key={label} style={{
              padding: "4px 12px", display: "flex", flexDirection: "column", gap: 1,
              borderRight: i < arr.length - 1 ? `1px solid ${S.rim}` : "none",
            }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.05em" }}>{label}</span>
              <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
            </div>
          ))}
        </div>

        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>{renderTs}</span>
      </header>

      {/* ====== Tab Bar (36px) ====== */}
      <div style={{
        display: "flex", alignItems: "center", background: S.bgPanel,
        borderBottom: `1px solid ${S.rim}`, padding: "0 20px", height: 36, flexShrink: 0,
      }}>
        {ERP_TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            fontFamily: S.fontMono, fontSize: 12, letterSpacing: "0.04em",
            padding: "0 16px", height: "100%", display: "flex", alignItems: "center",
            color: activeTab === tab ? S.cyan : S.tertiary,
            borderBottom: activeTab === tab ? `2px solid ${S.cyan}` : "2px solid transparent",
            borderTop: "none", borderLeft: "none", borderRight: "none",
            background: "transparent", cursor: "pointer",
            fontWeight: activeTab === tab ? 600 : 400,
            transition: "color 0.15s, border-color 0.15s",
          }}>
            {tab}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, padding: "1px 6px", border: `1px solid ${S.rim}` }}>
          MX-MFG-DEMO &middot; USD/MXN
        </span>
      </div>

      {/* ====== Content ====== */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* ------ Connection Form Card ------ */}
          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 2 }}>
            {/* Card header */}
            <div style={{
              padding: "10px 16px", borderBottom: `1px solid ${S.rim}`, background: S.bgSub,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 10, letterSpacing: "0.08em", color: S.tertiary }}>
                CONNECTION CONFIGURATION &mdash; {activeTab.toUpperCase()}
              </span>
              <span style={{
                fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                color: S.cyan,
                background: `color-mix(in srgb, ${S.cyan} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${S.cyan} 25%, transparent)`,
                padding: "1px 5px", borderRadius: 2,
              }}>
                DEMO
              </span>
            </div>

            {/* Form grid */}
            <div style={{ padding: "16px 16px 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" }}>
              {/* System Name */}
              <div>
                <div style={labelStyle}>SYSTEM NAME</div>
                <input
                  type="text"
                  value={currentConfig.systemName}
                  onChange={e => updateConfig("systemName", e.target.value)}
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

              {/* System ID / Client ID */}
              <div>
                <div style={labelStyle}>SYSTEM ID / CLIENT ID</div>
                <input
                  type="text"
                  value={currentConfig.clientId}
                  onChange={e => updateConfig("clientId", e.target.value)}
                  style={inputStyle}
                />
              </div>

              {/* Authentication Method */}
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

              {/* Credentials (full-width) */}
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={labelStyle}>CREDENTIALS</div>
                <input
                  type="password"
                  value="****************************"
                  disabled
                  style={{
                    ...inputStyle,
                    opacity: 0.5,
                    cursor: "not-allowed",
                    color: S.tertiary,
                  }}
                />
                <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginTop: 4, letterSpacing: "0.04em" }}>
                  Credentials managed by your IT admin. Contact treasury-ops@mxmfg.com to rotate keys.
                </div>
              </div>
            </div>
          </div>

          {/* ------ Field Mapping Table ------ */}
          <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 2 }}>
            {/* Table header */}
            <div style={{
              padding: "10px 16px", borderBottom: `1px solid ${S.rim}`, background: S.bgSub,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: S.fontMono, fontSize: 10, letterSpacing: "0.08em", color: S.tertiary }}>
                  FIELD MAPPING &mdash; {activeTab.toUpperCase()} &rarr; ORDR TRADEROW
                </span>
                <StatusBadge status="MAPPED" />
                <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary }}>{mappedCount}</span>
                <StatusBadge status="PENDING" />
                <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary }}>{pendingCount}</span>
              </div>
              <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
                {currentMappings.length} FIELDS
              </span>
            </div>

            {/* Table */}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                  {["SOURCE FIELD", "ORDR FIELD", "TRANSFORM", "STATUS"].map(h => (
                    <th key={h} style={{
                      padding: "7px 14px",
                      textAlign: "left",
                      fontFamily: S.fontMono,
                      fontSize: 9,
                      letterSpacing: "0.07em",
                      color: S.tertiary,
                      fontWeight: 600,
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {currentMappings.map((mapping, i) => (
                  <tr key={mapping.sourceField} style={{
                    borderBottom: `1px solid ${S.soft}`,
                    background: i % 2 === 0 ? "transparent" : `color-mix(in srgb, ${S.rim} 12%, transparent)`,
                  }}>
                    <td style={{ padding: "8px 14px", fontFamily: S.fontMono, fontSize: 11, fontWeight: 600, color: S.cyan }}>
                      {mapping.sourceField}
                    </td>
                    <td style={{ padding: "8px 14px", fontFamily: S.fontMono, fontSize: 11, color: S.primary }}>
                      {mapping.ordrField}
                    </td>
                    <td style={{ padding: "8px 14px", fontFamily: S.fontMono, fontSize: 11, color: S.secondary }}>
                      {mapping.transform}
                    </td>
                    <td style={{ padding: "8px 14px" }}>
                      <StatusBadge status={mapping.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ------ Action Row ------ */}
          <div style={{
            background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 2,
            padding: "12px 16px",
            display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
          }}>
            {/* Test Connection */}
            <ComingSoonButton label="TEST CONNECTION" />

            {/* Separator */}
            <div style={{ width: 1, height: 24, background: S.rim }} />

            {/* Sync Schedule */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", color: S.tertiary }}>
                SYNC SCHEDULE
              </span>
              <select
                value={currentConfig.syncSchedule}
                onChange={e => updateConfig("syncSchedule", e.target.value)}
                style={{
                  ...selectStyle,
                  width: "auto",
                  minWidth: 110,
                }}
              >
                {SYNC_SCHEDULES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div style={{ flex: 1 }} />

            {/* Save Configuration */}
            <button
              type="button"
              onClick={handleSave}
              style={{
                fontFamily: S.fontMono,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.06em",
                color: S.bgDeep,
                background: saveFlash === activeTab ? S.pass : S.cyan,
                border: "none",
                padding: "7px 20px",
                borderRadius: 2,
                cursor: "pointer",
                transition: "background 0.2s",
              }}
            >
              {saveFlash === activeTab ? "SAVED" : "SAVE CONFIGURATION"}
            </button>
          </div>

        </div>
      </div>

      {/* ====== Footer (32px) ====== */}
      <footer style={{
        height: 32, display: "flex", alignItems: "center", justifyContent: "center",
        background: S.bgPanel, borderTop: `1px solid ${S.rim}`, flexShrink: 0,
      }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.06em" }}>
          {renderTs} — ORDR &middot; ERP Integration
        </span>
      </footer>
    </div>
  );
}
