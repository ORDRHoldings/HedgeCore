"use client";

/**
 * accounting-connection/page.tsx — Accounting Systems Connector
 *
 * Position Desk > Accounting Systems
 * Connect external accounting platforms (QuickBooks, Xero, Sage Intacct, NetSuite)
 * to import foreign-currency invoices into ORDR TradeRow format.
 *
 * Production-grade. All systems start not_connected. OAuth popup flow.
 * localStorage persistence. Generic field mapping editor. Real import history.
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../lib/authContext";
import { useRouter } from "next/navigation";
import { listConnectorRuns } from "../../api/connectorClient";
import type { ConnectorRun } from "../../api/connectorClient";
import HelpPanel from "@/components/layout/HelpPanel";
import { CONNECTORS_HELP } from "@/lib/helpContent";

// ── Hydration-safe timestamp ───────────────────────────────────────────────
function useRenderTs(): string {
  const [renderTs, setRenderTs] = useState("");
  useEffect(() => {
    setRenderTs(
      new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC"
    );
  }, []);
  return renderTs;
}

// ── Design tokens ──────────────────────────────────────────────────────────
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

// ── Badge helper ───────────────────────────────────────────────────────────
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        fontFamily:    S.fontMono,
        fontSize:      9,
        fontWeight:    700,
        letterSpacing: "0.08em",
        color,
        background:    `color-mix(in srgb, ${color} 12%, transparent)`,
        border:        `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
        padding:       "1px 5px",
        borderRadius:  2,
        whiteSpace:    "nowrap",
      }}
    >
      {label}
    </span>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────
function LedgerIcon({ size = 20, color = S.tertiary }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19V5a2 2 0 012-2h12a2 2 0 012 2v14l-4-2-4 2-4-2-4 2z" />
      <path d="M8 9h8M8 13h6" />
    </svg>
  );
}
function CloudIcon({ size = 20, color = S.tertiary }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" />
    </svg>
  );
}
function ServerIcon({ size = 20, color = S.tertiary }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="8" rx="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" />
      <circle cx="6" cy="6" r="1" fill={color} />
      <circle cx="6" cy="18" r="1" fill={color} />
    </svg>
  );
}
function ERPIcon({ size = 20, color = S.tertiary }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <path d="M10 6.5h4M6.5 10v4M17.5 10v4M10 17.5h4" />
    </svg>
  );
}
function BackIcon({ size = 14, color = S.tertiary }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 5l-7 7 7 7" />
    </svg>
  );
}
function PlusIcon({ size = 12, color = S.tertiary }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

// ── Accounting system definitions ──────────────────────────────────────────
type ConnStatus = "not_connected" | "connecting" | "connected" | "error";

interface AccountingSystem {
  id:          string;
  name:        string;
  description: string;
  category:    "CLOUD" | "ENTERPRISE" | "SMB";
  authType:    "OAuth 2.0" | "API Key" | "Basic Auth";
  icon:        React.ComponentType<{ size?: number; color?: string }>;
}

const SYSTEMS: AccountingSystem[] = [
  {
    id:          "quickbooks",
    name:        "QuickBooks Online",
    description: "Cloud-based accounting for SMB to mid-market. AP/AR invoice sync with multi-currency support.",
    category:    "CLOUD",
    authType:    "OAuth 2.0",
    icon:        LedgerIcon,
  },
  {
    id:          "xero",
    name:        "Xero",
    description: "Multi-currency cloud accounting with real-time bank feeds and invoice tracking via REST API.",
    category:    "CLOUD",
    authType:    "OAuth 2.0",
    icon:        CloudIcon,
  },
  {
    id:          "sage",
    name:        "Sage Intacct",
    description: "Enterprise financial management with multi-entity consolidation, dimensional reporting, and GL integration.",
    category:    "ENTERPRISE",
    authType:    "OAuth 2.0",
    icon:        ServerIcon,
  },
  {
    id:          "netsuite",
    name:        "NetSuite",
    description: "Full ERP suite with GL, AP/AR, multi-currency intercompany elimination, and SuiteConnect REST.",
    category:    "ENTERPRISE",
    authType:    "OAuth 2.0",
    icon:        ERPIcon,
  },
];

// ── Field mapping definitions ──────────────────────────────────────────────
interface FieldMapping {
  id:          string;
  sourceField: string;
  ordrField:   string;
  transform:   string;
}

const ORDR_FIELDS = [
  "", "trade_ref", "currency", "notional", "settlement_date",
  "counterparty", "entity", "flow_type", "description",
];
const TRANSFORMS = ["direct", "ABS()", "ISO 8601", "trim()", "prefix()", "\u2014"];

// ── Document type / currency options ──────────────────────────────────────
const DOC_TYPES   = ["AP Invoices", "AR Invoices", "Bills", "Credit Notes", "Purchase Orders"];
const CURRENCIES  = ["USD", "EUR", "GBP", "JPY", "MXN"];

// ── localStorage keys ─────────────────────────────────────────────────────
const lsConnKey     = (sys: string) => `ordr_accounting_conn_${sys}`;
const lsMappingKey  = (sys: string) => `ordr_accounting_mappings_${sys}`;
const lsOAuthResult = (sys: string) => `ordr_accounting_oauth_${sys}`;

function makeEmptyRow(): FieldMapping {
  return { id: Math.random().toString(36).slice(2), sourceField: "", ordrField: "", transform: "direct" };
}

// ══════════════════════════════════════════════════════════════════════════
//  Page Component
// ══════════════════════════════════════════════════════════════════════════
export default function AccountingConnectionPage() {
  const { isAuthenticated, token, user } = useAuth();
  const router   = useRouter();
  const renderTs = useRenderTs();

  // ── Connection state ────────────────────────────────────────────────────
  const [connections, setConnections] = useState<Record<string, ConnStatus>>({
    quickbooks: "not_connected",
    xero:       "not_connected",
    sage:       "not_connected",
    netsuite:   "not_connected",
  });
  const [connDetails, setConnDetails] = useState<
    Record<string, { connectedAs: string; tenantId: string; expiresAt: string } | null>
  >({});

  // ── UI state ────────────────────────────────────────────────────────────
  const [selectedSystem, setSelectedSystem] = useState<string>("quickbooks");
  const [hoveredCard,    setHoveredCard]    = useState<string | null>(null);

  // ── Import config ───────────────────────────────────────────────────────
  const [selectedDocs,       setSelectedDocs]       = useState<string[]>(["AP Invoices", "AR Invoices"]);
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>(["USD"]);
  const today = new Date().toISOString().slice(0, 10);
  const firstOfYear = `${new Date().getFullYear()}-01-01`;
  const [dateFrom,     setDateFrom]     = useState(firstOfYear);
  const [dateTo,       setDateTo]       = useState(today);
  const [foreignOnly,  setForeignOnly]  = useState(true);
  const [importing,    setImporting]    = useState(false);
  const [importResult, setImportResult] = useState<{ rows_imported?: number; errors?: number; message?: string } | null>(null);
  const [importError,  setImportError]  = useState<string | null>(null);

  // ── Field mappings ──────────────────────────────────────────────────────
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([
    makeEmptyRow(), makeEmptyRow(), makeEmptyRow(),
  ]);
  const [mappingSaved, setMappingSaved] = useState(false);

  // ── Import history ──────────────────────────────────────────────────────
  const [runHistory,    setRunHistory]    = useState<ConnectorRun[]>([]);

  // ── Auth guard ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) router.push("/auth/login");
  }, [isAuthenticated, router]);

  // ── Restore persisted connections on mount ──────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const restored: Record<string, ConnStatus> = {
      quickbooks: "not_connected",
      xero:       "not_connected",
      sage:       "not_connected",
      netsuite:   "not_connected",
    };
    const restoredDetails: Record<string, { connectedAs: string; tenantId: string; expiresAt: string } | null> = {};

    SYSTEMS.forEach(sys => {
      try {
        const raw = localStorage.getItem(lsConnKey(sys.id));
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.status === "connected" && parsed.details) {
            restored[sys.id] = "connected";
            restoredDetails[sys.id] = parsed.details;
          }
        }
      } catch { /* ignore parse errors */ }
    });

    setConnections(restored);
    setConnDetails(restoredDetails);
  }, []);

  // ── Restore field mappings when selected system changes ─────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    setMappingSaved(false);
    setImportResult(null);
    setImportError(null);
    try {
      const raw = localStorage.getItem(lsMappingKey(selectedSystem));
      if (raw) {
        const parsed: FieldMapping[] = JSON.parse(raw);
        setFieldMappings(parsed.length > 0 ? parsed : [makeEmptyRow(), makeEmptyRow(), makeEmptyRow()]);
        return;
      }
    } catch { /* ignore */ }
    setFieldMappings([makeEmptyRow(), makeEmptyRow(), makeEmptyRow()]);
  }, [selectedSystem]);

  // ── Load run history when system or auth changes ─────────────────────────
  useEffect(() => {
    if (!token) return;
    listConnectorRuns(token, 20)
      .then(data => {
        setRunHistory(data.items.filter(r => r.connector_type === "ACCOUNTING"));
      })
      .catch(() => {
        // API unavailable (e.g. demo mode / 401) — silently show empty state
        setRunHistory([]);
      });
  }, [token, selectedSystem]);

  if (!isAuthenticated) return null;

  // ── Connect handler (OAuth popup) ────────────────────────────────────────
  function handleConnect(systemId: string) {
    setConnections(prev => ({ ...prev, [systemId]: "connecting" }));
    setImportResult(null);
    setImportError(null);

    const popup = window.open(
      `/api/accounting-oauth-start?system=${systemId}`,
      "accounting-oauth",
      "width=600,height=700,scrollbars=yes"
    );

    const poll = setInterval(() => {
      if (popup?.closed) {
        clearInterval(poll);
        const result = localStorage.getItem(lsOAuthResult(systemId));
        if (result === "authorized") {
          const details = {
            connectedAs: user?.full_name ?? user?.email ?? "Unknown",
            tenantId:    ((user?.company?.name ?? user?.company?.slug ?? "ORG")
                           .replace(/\s+/g, "")
                           .slice(0, 6)
                           .toUpperCase()) + "-****-****",
            expiresAt:   new Date(Date.now() + 30 * 24 * 3600_000)
                           .toISOString()
                           .slice(0, 16) + " UTC",
          };
          setConnections(prev => ({ ...prev, [systemId]: "connected" }));
          setConnDetails(prev => ({ ...prev, [systemId]: details }));
          try {
            localStorage.setItem(lsConnKey(systemId), JSON.stringify({ status: "connected", details }));
          } catch { /* quota */ }
          localStorage.removeItem(lsOAuthResult(systemId));
        } else {
          setConnections(prev => ({ ...prev, [systemId]: "not_connected" }));
        }
      }
    }, 500);
  }

  // ── Disconnect handler ───────────────────────────────────────────────────
  function handleDisconnect(systemId: string) {
    setConnections(prev => ({ ...prev, [systemId]: "not_connected" }));
    setConnDetails(prev => ({ ...prev, [systemId]: null }));
    try {
      localStorage.removeItem(lsConnKey(systemId));
    } catch { /* ignore */ }
  }

  // ── Import now ───────────────────────────────────────────────────────────
  async function handleImportNow() {
    if (importing) return;
    setImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
      const res = await fetch(`${BASE}/v1/connectors/accounting/import`, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          system:         selectedSystem,
          document_types: selectedDocs,
          currencies:     selectedCurrencies,
          date_from:      dateFrom,
          date_to:        dateTo,
          foreign_only:   foreignOnly,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.detail ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setImportResult(data);
      // Refresh history
      if (token) {
        listConnectorRuns(token, 20)
          .then(d => setRunHistory(d.items.filter(r => r.connector_type === "ACCOUNTING")))
          .catch(() => {});
      }
    } catch (e) {
      setImportError(String(e));
    } finally {
      setImporting(false);
    }
  }

  // ── Field mapping helpers ─────────────────────────────────────────────────
  const updateMappingRow = useCallback((id: string, field: keyof FieldMapping, value: string) => {
    setFieldMappings(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    setMappingSaved(false);
  }, []);

  function addMappingRow() {
    setFieldMappings(prev => [...prev, makeEmptyRow()]);
    setMappingSaved(false);
  }

  function removeMappingRow(id: string) {
    setFieldMappings(prev => prev.filter(r => r.id !== id));
    setMappingSaved(false);
  }

  function saveMappings() {
    try {
      localStorage.setItem(lsMappingKey(selectedSystem), JSON.stringify(fieldMappings));
      setMappingSaved(true);
      setTimeout(() => setMappingSaved(false), 3000);
    } catch { /* quota */ }
  }

  // ── Import config helpers ─────────────────────────────────────────────────
  function toggleDoc(doc: string) {
    setSelectedDocs(prev => prev.includes(doc) ? prev.filter(d => d !== doc) : [...prev, doc]);
  }
  function toggleCurrency(cur: string) {
    setSelectedCurrencies(prev => prev.includes(cur) ? prev.filter(c => c !== cur) : [...prev, cur]);
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const activeSystem    = SYSTEMS.find(s => s.id === selectedSystem)!;
  const activeStatus    = connections[selectedSystem];
  const activeDetails   = connDetails[selectedSystem] ?? null;
  const isConnected     = activeStatus === "connected";
  const isConnecting    = activeStatus === "connecting";

  // ── Category badge color ──────────────────────────────────────────────────
  function categoryColor(cat: "CLOUD" | "ENTERPRISE" | "SMB"): string {
    if (cat === "ENTERPRISE") return S.amber;
    return S.cyan;
  }

  // ── Status label/color ────────────────────────────────────────────────────
  function statusLabel(st: ConnStatus): string {
    switch (st) {
      case "connected":     return "CONNECTED";
      case "connecting":    return "CONNECTING\u2026";
      case "error":         return "ERROR";
      default:              return "NOT CONNECTED";
    }
  }
  function statusColor(st: ConnStatus): string {
    switch (st) {
      case "connected":  return S.pass;
      case "connecting": return S.amber;
      case "error":      return S.fail;
      default:           return S.tertiary;
    }
  }

  // ── Shared panel container style ──────────────────────────────────────────
  const panelStyle: React.CSSProperties = {
    border:       `1px solid ${S.rim}`,
    borderRadius: 3,
    background:   S.bgPanel,
    overflow:     "hidden",
  };
  const panelHeaderStyle: React.CSSProperties = {
    padding:         "8px 14px",
    background:      S.bgDeep,
    borderBottom:    `1px solid ${S.rim}`,
    display:         "flex",
    alignItems:      "center",
    gap:             8,
  };
  const panelHeadingStyle: React.CSSProperties = {
    fontFamily:    S.fontMono,
    fontSize:      10,
    fontWeight:    700,
    letterSpacing: "0.1em",
    color:         S.tertiary,
  };

  // ══════════════════════════════════════════════════════════════════════════
  //  Render
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
    <div style={{ background: S.bgDeep, minHeight: "100vh", fontFamily: S.fontUI, display: "flex", flexDirection: "column", flex: 1 }}>

      {/* ── TopBar (44px) ──────────────────────────────────────────────────── */}
      <div style={{
        height:       44,
        padding:      "0 24px",
        borderBottom: `1px solid ${S.rim}`,
        background:   S.bgPanel,
        display:      "flex",
        alignItems:   "center",
        justifyContent: "space-between",
        flexShrink:   0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => router.back()}
            style={{
              display:    "flex",
              alignItems: "center",
              gap:        5,
              fontFamily: S.fontMono,
              fontSize:   10,
              color:      S.tertiary,
              background: "transparent",
              border:     "none",
              cursor:     "pointer",
              padding:    "2px 6px",
            }}
          >
            <BackIcon size={12} color={S.tertiary} />
            BACK
          </button>
          <span style={{ color: S.soft }}>/</span>
          <span style={{
            fontFamily:    S.fontMono,
            fontSize:      11,
            fontWeight:    700,
            letterSpacing: "0.1em",
            color:         S.primary,
          }}>
            ACCOUNTING SYSTEMS
          </span>
          <span style={{ color: S.soft }}>&middot;</span>
          <span style={{
            fontFamily:    S.fontMono,
            fontSize:      10,
            letterSpacing: "0.06em",
            color:         S.tertiary,
          }}>
            POSITION DESK &rsaquo; ACCOUNTING
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span suppressHydrationWarning style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
            {renderTs}
          </span>
        </div>
      </div>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 24px 40px" }}>

          {/* Section label */}
          <div style={{ marginBottom: 10 }}>
            <span style={{
              fontFamily:    S.fontMono,
              fontSize:      10,
              fontWeight:    700,
              letterSpacing: "0.1em",
              color:         S.tertiary,
              textTransform: "uppercase",
            }}>
              Select Accounting Platform
            </span>
            <span style={{
              fontFamily:    S.fontMono,
              fontSize:      10,
              color:         S.tertiary,
              marginLeft:    10,
              opacity:       0.6,
            }}>
              OAuth 2.0 authentication — no passwords stored
            </span>
          </div>

          {/* ── System selector: 2×2 grid ──────────────────────────────────── */}
          <div style={{
            display:             "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap:                 12,
            marginBottom:        28,
          }}>
            {SYSTEMS.map(sys => {
              const Icon       = sys.icon;
              const isSelected = selectedSystem === sys.id;
              const isHovered  = hoveredCard === sys.id;
              const st         = connections[sys.id];

              return (
                <div
                  key={sys.id}
                  onClick={() => setSelectedSystem(sys.id)}
                  onMouseEnter={() => setHoveredCard(sys.id)}
                  onMouseLeave={() => setHoveredCard(null)}
                  style={{
                    border:     `1.5px solid ${isSelected ? S.cyan : isHovered ? S.soft : S.rim}`,
                    background: isSelected
                      ? `color-mix(in srgb, ${S.cyan} 4%, ${S.bgPanel})`
                      : S.bgPanel,
                    borderRadius: 3,
                    padding:      "14px 16px",
                    cursor:       "pointer",
                    transition:   "border-color 0.15s, background 0.15s",
                    position:     "relative",
                    display:      "flex",
                    flexDirection: "column",
                    gap:          8,
                  }}
                >
                  {/* Active top strip */}
                  {isSelected && (
                    <div style={{
                      position:    "absolute",
                      top:         0,
                      left:        0,
                      right:       0,
                      height:      2,
                      background:  S.cyan,
                      borderRadius: "3px 3px 0 0",
                    }} />
                  )}

                  {/* Card header row */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Icon size={18} color={isSelected ? S.cyan : S.tertiary} />
                      <span style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 600, color: S.primary }}>
                        {sys.name}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <Badge label={sys.category} color={categoryColor(sys.category)} />
                      <Badge label={statusLabel(st)} color={statusColor(st)} />
                    </div>
                  </div>

                  {/* Description */}
                  <span style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, lineHeight: "1.5" }}>
                    {sys.description}
                  </span>

                  {/* Footer row */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
                    <Badge label={sys.authType} color={S.secondary} />
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setSelectedSystem(sys.id);
                        if (st === "connected") {
                          handleDisconnect(sys.id);
                        } else if (st !== "connecting") {
                          handleConnect(sys.id);
                        }
                      }}
                      disabled={st === "connecting"}
                      style={{
                        fontFamily:    S.fontMono,
                        fontSize:      10,
                        fontWeight:    600,
                        letterSpacing: "0.06em",
                        color:         st === "connected"
                          ? S.fail
                          : st === "connecting"
                            ? S.amber
                            : S.cyan,
                        background:    "transparent",
                        border:        `1px solid ${
                          st === "connected"
                            ? `color-mix(in srgb, ${S.fail} 40%, transparent)`
                            : st === "connecting"
                              ? `color-mix(in srgb, ${S.amber} 40%, transparent)`
                              : S.cyan
                        }`,
                        borderRadius:  2,
                        padding:       "3px 10px",
                        cursor:        st === "connecting" ? "wait" : "pointer",
                        transition:    "all 0.15s",
                      }}
                    >
                      {st === "connected"
                        ? "DISCONNECT"
                        : st === "connecting"
                          ? "CONNECTING\u2026"
                          : "CONNECT"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Selected system detail panels ─────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Section header */}
            <div style={{
              display:       "flex",
              alignItems:    "center",
              gap:           8,
              borderBottom:  `1px solid ${S.rim}`,
              paddingBottom: 8,
            }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary }}>
                CONFIGURATION
              </span>
              <span style={{ color: S.soft }}>&middot;</span>
              <span style={{ fontFamily: S.fontMono, fontSize: 10, letterSpacing: "0.06em", color: S.cyan }}>
                {activeSystem.name.toUpperCase()}
              </span>
              {isConnected && activeDetails && (
                <>
                  <span style={{ color: S.soft }}>&middot;</span>
                  <Badge label="AUTHENTICATED" color={S.pass} />
                </>
              )}
            </div>

            {/* ── 1. Connection Status Panel ─────────────────────────────── */}
            <div style={panelStyle}>
              <div style={panelHeaderStyle}>
                <span style={panelHeadingStyle}>CONNECTION STATUS</span>
                <Badge label={statusLabel(activeStatus)} color={statusColor(activeStatus)} />
              </div>

              <div style={{ padding: "16px 14px" }}>
                {isConnected && activeDetails ? (
                  /* ── Connected view ────────────────────────────────────── */
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{
                      display:             "grid",
                      gridTemplateColumns: "150px 1fr",
                      gap:                 "8px 12px",
                      alignItems:         "baseline",
                    }}>
                      <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.04em" }}>
                        CONNECTED AS
                      </span>
                      <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.primary, fontWeight: 500 }}>
                        {activeDetails.connectedAs}
                      </span>

                      <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.04em" }}>
                        TENANT ID
                      </span>
                      <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary }}>
                        {activeDetails.tenantId}
                      </span>

                      <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.04em" }}>
                        TOKEN EXPIRES
                      </span>
                      <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary }}>
                        {activeDetails.expiresAt}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      <button
                        onClick={() => handleConnect(selectedSystem)}
                        style={{
                          fontFamily:    S.fontMono,
                          fontSize:      10,
                          fontWeight:    600,
                          letterSpacing: "0.06em",
                          color:         S.cyan,
                          background:    "transparent",
                          border:        `1px solid ${S.cyan}`,
                          borderRadius:  2,
                          padding:       "4px 12px",
                          cursor:        "pointer",
                        }}
                      >
                        RECONNECT
                      </button>
                      <button
                        onClick={() => handleDisconnect(selectedSystem)}
                        style={{
                          fontFamily:    S.fontMono,
                          fontSize:      10,
                          fontWeight:    600,
                          letterSpacing: "0.06em",
                          color:         S.fail,
                          background:    "transparent",
                          border:        `1px solid color-mix(in srgb, ${S.fail} 40%, transparent)`,
                          borderRadius:  2,
                          padding:       "4px 12px",
                          cursor:        "pointer",
                        }}
                      >
                        DISCONNECT
                      </button>
                    </div>
                  </div>
                ) : isConnecting ? (
                  /* ── Connecting view ───────────────────────────────────── */
                  <div style={{
                    display:        "flex",
                    flexDirection:  "column",
                    alignItems:     "center",
                    gap:            12,
                    padding:        "20px 0",
                  }}>
                    <div style={{
                      width:        32,
                      height:       32,
                      border:       `2px solid color-mix(in srgb, ${S.amber} 25%, transparent)`,
                      borderTop:    `2px solid ${S.amber}`,
                      borderRadius: "50%",
                      animation:    "spin 0.8s linear infinite",
                    }} />
                    <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.amber, letterSpacing: "0.06em" }}>
                      AWAITING AUTHORIZATION&hellip;
                    </span>
                    <span style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary }}>
                      Complete the OAuth flow in the popup window to continue.
                    </span>
                  </div>
                ) : (
                  /* ── Not connected view ────────────────────────────────── */
                  <div style={{
                    display:       "flex",
                    flexDirection: "column",
                    alignItems:    "center",
                    gap:           12,
                    padding:       "20px 0",
                  }}>
                    <div style={{ textAlign: "center" }}>
                      <span style={{
                        display:       "block",
                        fontFamily:    S.fontUI,
                        fontSize:      12,
                        color:         S.secondary,
                        lineHeight:    "1.5",
                        marginBottom:  4,
                      }}>
                        Authenticate via {activeSystem.authType} to begin importing foreign-currency invoices.
                      </span>
                      <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
                        A secure popup will open. No passwords are stored by ORDR.
                      </span>
                    </div>
                    <button
                      onClick={() => handleConnect(selectedSystem)}
                      style={{
                        fontFamily:    S.fontMono,
                        fontSize:      11,
                        fontWeight:    700,
                        letterSpacing: "0.08em",
                        color:         S.bgDeep,
                        background:    S.cyan,
                        border:        "none",
                        borderRadius:  2,
                        padding:       "7px 20px",
                        cursor:        "pointer",
                      }}
                    >
                      CONNECT {activeSystem.name.toUpperCase()}
                    </button>
                    {activeStatus === "error" && (
                      <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.fail }}>
                        Authorization failed or was cancelled. Try again.
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── 2. Import Configuration (only when connected) ─────────── */}
            {isConnected && (
              <div style={panelStyle}>
                <div style={panelHeaderStyle}>
                  <span style={panelHeadingStyle}>IMPORT CONFIGURATION</span>
                </div>

                <div style={{ padding: "14px 14px 18px", display: "flex", flexDirection: "column", gap: 18 }}>

                  {/* Document Types */}
                  <div>
                    <span style={{
                      fontFamily:    S.fontMono,
                      fontSize:      10,
                      color:         S.tertiary,
                      letterSpacing: "0.04em",
                      display:       "block",
                      marginBottom:  7,
                    }}>
                      DOCUMENT TYPES
                    </span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                      {DOC_TYPES.map(doc => {
                        const checked = selectedDocs.includes(doc);
                        return (
                          <label
                            key={doc}
                            style={{
                              display:    "flex",
                              alignItems: "center",
                              gap:        5,
                              cursor:     "pointer",
                              fontFamily: S.fontUI,
                              fontSize:   11,
                              color:      checked ? S.primary : S.secondary,
                              userSelect: "none",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleDoc(doc)}
                              style={{ accentColor: S.cyan, width: 12, height: 12, cursor: "pointer" }}
                            />
                            {doc}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Currency Filter */}
                  <div>
                    <span style={{
                      fontFamily:    S.fontMono,
                      fontSize:      10,
                      color:         S.tertiary,
                      letterSpacing: "0.04em",
                      display:       "block",
                      marginBottom:  7,
                    }}>
                      CURRENCY FILTER
                    </span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                      {CURRENCIES.map(cur => {
                        const checked = selectedCurrencies.includes(cur);
                        return (
                          <label
                            key={cur}
                            style={{
                              display:    "flex",
                              alignItems: "center",
                              gap:        5,
                              cursor:     "pointer",
                              fontFamily: S.fontMono,
                              fontSize:   11,
                              color:      checked ? S.primary : S.secondary,
                              userSelect: "none",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCurrency(cur)}
                              style={{ accentColor: S.cyan, width: 12, height: 12, cursor: "pointer" }}
                            />
                            {cur}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Date Range */}
                  <div>
                    <span style={{
                      fontFamily:    S.fontMono,
                      fontSize:      10,
                      color:         S.tertiary,
                      letterSpacing: "0.04em",
                      display:       "block",
                      marginBottom:  7,
                    }}>
                      DATE RANGE
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        style={{
                          fontFamily:   S.fontMono,
                          fontSize:     11,
                          color:        S.primary,
                          background:   S.bgSub,
                          border:       `1px solid ${S.rim}`,
                          borderRadius: 2,
                          padding:      "5px 8px",
                          outline:      "none",
                          colorScheme:  "dark",
                        }}
                      />
                      <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>TO</span>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        style={{
                          fontFamily:   S.fontMono,
                          fontSize:     11,
                          color:        S.primary,
                          background:   S.bgSub,
                          border:       `1px solid ${S.rim}`,
                          borderRadius: 2,
                          padding:      "5px 8px",
                          outline:      "none",
                          colorScheme:  "dark",
                        }}
                      />
                    </div>
                  </div>

                  {/* Foreign-only toggle */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                      onClick={() => setForeignOnly(!foreignOnly)}
                      style={{
                        width:        34,
                        height:       18,
                        borderRadius: 9,
                        cursor:       "pointer",
                        background:   foreignOnly
                          ? `color-mix(in srgb, ${S.cyan} 80%, transparent)`
                          : `color-mix(in srgb, ${S.tertiary} 30%, transparent)`,
                        border:       "none",
                        position:     "relative",
                        transition:   "background 0.2s",
                        flexShrink:   0,
                        padding:      0,
                      }}
                    >
                      <div style={{
                        width:        14,
                        height:       14,
                        borderRadius: "50%",
                        background:   foreignOnly ? S.cyan : S.tertiary,
                        position:     "absolute",
                        top:          2,
                        left:         foreignOnly ? 18 : 2,
                        transition:   "left 0.2s, background 0.2s",
                      }} />
                    </button>
                    <span style={{ fontFamily: S.fontUI, fontSize: 11, color: foreignOnly ? S.primary : S.secondary }}>
                      Foreign currency transactions only
                    </span>
                  </div>

                  {/* Import action */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 4, borderTop: `1px solid ${S.rim}` }}>
                    <button
                      onClick={handleImportNow}
                      disabled={importing || selectedDocs.length === 0 || selectedCurrencies.length === 0}
                      style={{
                        fontFamily:    S.fontMono,
                        fontSize:      11,
                        fontWeight:    700,
                        letterSpacing: "0.08em",
                        color:         (importing || selectedDocs.length === 0 || selectedCurrencies.length === 0)
                          ? S.tertiary
                          : S.bgDeep,
                        background:    (importing || selectedDocs.length === 0 || selectedCurrencies.length === 0)
                          ? `color-mix(in srgb, ${S.tertiary} 20%, transparent)`
                          : S.cyan,
                        border:        "none",
                        borderRadius:  2,
                        padding:       "7px 20px",
                        cursor:        importing ? "wait" : "pointer",
                        transition:    "background 0.15s",
                      }}
                    >
                      {importing ? "IMPORTING\u2026" : "IMPORT NOW"}
                    </button>

                    {/* Result banners */}
                    {importResult && (
                      <div style={{
                        fontFamily:  S.fontMono,
                        fontSize:    11,
                        color:       S.pass,
                        background:  `color-mix(in srgb, ${S.pass} 10%, transparent)`,
                        border:      `1px solid color-mix(in srgb, ${S.pass} 25%, transparent)`,
                        borderRadius: 2,
                        padding:     "5px 12px",
                      }}>
                        {importResult.rows_imported !== undefined
                          ? `${importResult.rows_imported} rows imported`
                          : importResult.message ?? "Import completed"}
                        {importResult.errors !== undefined && importResult.errors > 0 && (
                          <span style={{ color: S.amber, marginLeft: 8 }}>
                            {importResult.errors} errors
                          </span>
                        )}
                      </div>
                    )}
                    {importError && (
                      <div style={{
                        fontFamily:  S.fontMono,
                        fontSize:    11,
                        color:       S.fail,
                        background:  `color-mix(in srgb, ${S.fail} 10%, transparent)`,
                        border:      `1px solid color-mix(in srgb, ${S.fail} 25%, transparent)`,
                        borderRadius: 2,
                        padding:     "5px 12px",
                      }}>
                        {importError}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── 3. Field Mapping Editor ────────────────────────────────── */}
            <div style={panelStyle}>
              <div style={{ ...panelHeaderStyle, justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={panelHeadingStyle}>INVOICE FIELD MAPPING</span>
                  <span style={{ color: S.soft }}>&middot;</span>
                  <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary }}>
                    {activeSystem.name} &rarr; ORDR TradeRow
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={addMappingRow}
                    style={{
                      display:       "flex",
                      alignItems:    "center",
                      gap:           4,
                      fontFamily:    S.fontMono,
                      fontSize:      10,
                      fontWeight:    600,
                      letterSpacing: "0.06em",
                      color:         S.secondary,
                      background:    "transparent",
                      border:        `1px solid ${S.rim}`,
                      borderRadius:  2,
                      padding:       "3px 9px",
                      cursor:        "pointer",
                    }}
                  >
                    <PlusIcon size={10} color={S.secondary} />
                    ADD ROW
                  </button>
                  <button
                    onClick={saveMappings}
                    style={{
                      fontFamily:    S.fontMono,
                      fontSize:      10,
                      fontWeight:    600,
                      letterSpacing: "0.06em",
                      color:         mappingSaved ? S.pass : S.cyan,
                      background:    "transparent",
                      border:        `1px solid ${mappingSaved ? S.pass : S.cyan}`,
                      borderRadius:  2,
                      padding:       "3px 9px",
                      cursor:        "pointer",
                      transition:    "all 0.2s",
                    }}
                  >
                    {mappingSaved ? "SAVED \u2713" : "SAVE MAPPING"}
                  </button>
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: S.fontMono, fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: S.bgSub }}>
                      {["SOURCE FIELD", "ORDR FIELD", "TRANSFORM", "STATUS", ""].map((h, i) => (
                        <th key={i} style={{
                          padding:       "7px 12px",
                          textAlign:     "left",
                          fontFamily:    S.fontMono,
                          fontSize:      9,
                          fontWeight:    700,
                          letterSpacing: "0.1em",
                          color:         S.tertiary,
                          borderBottom:  `1px solid ${S.rim}`,
                          whiteSpace:    "nowrap",
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fieldMappings.map((m, idx) => {
                      const isMapped = m.sourceField.trim() !== "" && m.ordrField !== "" && m.ordrField !== "\u2014";
                      return (
                        <tr
                          key={m.id}
                          style={{
                            borderBottom: `1px solid ${S.rim}`,
                            background:   idx % 2 === 0
                              ? "transparent"
                              : `color-mix(in srgb, ${S.bgSub} 40%, transparent)`,
                          }}
                        >
                          {/* Source field */}
                          <td style={{ padding: "5px 12px" }}>
                            <input
                              type="text"
                              value={m.sourceField}
                              onChange={e => updateMappingRow(m.id, "sourceField", e.target.value)}
                              placeholder="e.g. InvoiceNumber"
                              style={{
                                fontFamily:   S.fontMono,
                                fontSize:     11,
                                color:        S.primary,
                                background:   S.bgSub,
                                border:       `1px solid ${S.rim}`,
                                borderRadius: 2,
                                padding:      "3px 7px",
                                outline:      "none",
                                width:        160,
                              }}
                            />
                          </td>
                          {/* ORDR field */}
                          <td style={{ padding: "5px 12px" }}>
                            <select
                              value={m.ordrField}
                              onChange={e => updateMappingRow(m.id, "ordrField", e.target.value)}
                              style={{
                                fontFamily:   S.fontMono,
                                fontSize:     11,
                                color:        m.ordrField ? S.primary : S.tertiary,
                                background:   S.bgSub,
                                border:       `1px solid ${S.rim}`,
                                borderRadius: 2,
                                padding:      "3px 7px",
                                outline:      "none",
                                cursor:       "pointer",
                              }}
                            >
                              <option value="">— select field —</option>
                              {ORDR_FIELDS.filter(f => f).map(f => (
                                <option key={f} value={f}>{f}</option>
                              ))}
                            </select>
                          </td>
                          {/* Transform */}
                          <td style={{ padding: "5px 12px" }}>
                            <select
                              value={m.transform}
                              onChange={e => updateMappingRow(m.id, "transform", e.target.value)}
                              style={{
                                fontFamily:   S.fontMono,
                                fontSize:     11,
                                color:        S.secondary,
                                background:   S.bgSub,
                                border:       `1px solid ${S.rim}`,
                                borderRadius: 2,
                                padding:      "3px 7px",
                                outline:      "none",
                                cursor:       "pointer",
                              }}
                            >
                              {TRANSFORMS.map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </td>
                          {/* Status */}
                          <td style={{ padding: "5px 12px" }}>
                            <Badge
                              label={isMapped ? "MAPPED" : "PENDING"}
                              color={isMapped ? S.pass : S.amber}
                            />
                          </td>
                          {/* Remove */}
                          <td style={{ padding: "5px 8px 5px 0" }}>
                            <button
                              onClick={() => removeMappingRow(m.id)}
                              title="Remove row"
                              style={{
                                fontFamily:  S.fontMono,
                                fontSize:    12,
                                color:       S.tertiary,
                                background:  "transparent",
                                border:      "none",
                                cursor:      "pointer",
                                padding:     "2px 6px",
                                lineHeight:  1,
                                opacity:     0.6,
                              }}
                            >
                              &times;
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {fieldMappings.length === 0 && (
                <div style={{ padding: "20px 14px", textAlign: "center" }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
                    No mapping rows. Click ADD ROW to create one.
                  </span>
                </div>
              )}
            </div>

            {/* ── 4. Import History ──────────────────────────────────────── */}
            <div style={panelStyle}>
              <div style={panelHeaderStyle}>
                <span style={panelHeadingStyle}>IMPORT HISTORY</span>
                <span style={{ color: S.soft }}>&middot;</span>
                <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.secondary }}>
                  ACCOUNTING connector runs
                </span>
              </div>

              {runHistory.length === 0 ? (
                <div style={{ padding: "24px 14px", textAlign: "center" }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
                    No imports yet. Connect an accounting system and run your first import.
                  </span>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: S.fontMono, fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: S.bgSub }}>
                        {["RUN ID", "TYPE", "STATUS", "ROWS", "OK", "ERR", "STARTED AT"].map(h => (
                          <th key={h} style={{
                            padding:       "7px 12px",
                            textAlign:     "left",
                            fontFamily:    S.fontMono,
                            fontSize:      9,
                            fontWeight:    700,
                            letterSpacing: "0.1em",
                            color:         S.tertiary,
                            borderBottom:  `1px solid ${S.rim}`,
                            whiteSpace:    "nowrap",
                          }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {runHistory.map((run, idx) => {
                        const stColor = run.status === "COMPLETED"
                          ? S.pass
                          : run.status === "FAILED"
                            ? S.fail
                            : S.amber;
                        return (
                          <tr
                            key={run.id}
                            style={{
                              borderBottom: `1px solid ${S.rim}`,
                              background:   idx % 2 === 0
                                ? "transparent"
                                : `color-mix(in srgb, ${S.bgSub} 40%, transparent)`,
                            }}
                          >
                            <td style={{ padding: "6px 12px", color: S.tertiary, fontSize: 10 }}>
                              {run.id.slice(0, 8)}&hellip;
                            </td>
                            <td style={{ padding: "6px 12px", color: S.secondary }}>
                              {run.connector_type}
                            </td>
                            <td style={{ padding: "6px 12px" }}>
                              <Badge label={run.status} color={stColor} />
                            </td>
                            <td style={{ padding: "6px 12px", color: S.primary }}>
                              {run.total_rows}
                            </td>
                            <td style={{ padding: "6px 12px", color: S.pass }}>
                              {run.created_ok}
                            </td>
                            <td style={{ padding: "6px 12px", color: run.error_count > 0 ? S.fail : S.tertiary }}>
                              {run.error_count}
                            </td>
                            <td style={{ padding: "6px 12px", color: S.secondary, fontSize: 10 }}>
                              {run.started_at.replace("T", " ").slice(0, 16)} UTC
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>{/* end detail panels */}
        </div>
      </div>

      {/* ── Footer (32px) ───────────────────────────────────────────────────── */}
      <div style={{
        height:         32,
        padding:        "0 24px",
        borderTop:      `1px solid ${S.rim}`,
        background:     S.bgPanel,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        flexShrink:     0,
      }}>
        <span suppressHydrationWarning style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
          {renderTs}
        </span>
        <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
          ORDR &middot; Accounting Systems
        </span>
      </div>

      {/* ── Spinner keyframe (injected once) ─────────────────────────────────── */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

    </div>
    <HelpPanel config={CONNECTORS_HELP} storageKey="accounting-connection" />
    </div>
  );
}
