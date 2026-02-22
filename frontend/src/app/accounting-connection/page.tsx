"use client";

/**
 * accounting-connection/page.tsx — Accounting Systems Connection
 *
 * Position Desk > Accounting Systems
 * Connect external accounting platforms (QuickBooks, Xero, Sage, NetSuite)
 * to import foreign-currency invoices into ORDR TradeRow format.
 */

import { useState, useEffect } from "react";
import { useAuth } from "../../lib/authContext";
import { useRouter } from "next/navigation";
import EmptyState from "../../components/ui/EmptyState";

// ── Hydration-safe timestamp ──────────────────────────────────────────────────
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

// ── Badge helper ──────────────────────────────────────────────────────────────
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontFamily: S.fontMono,
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: "0.08em",
      color,
      background: `color-mix(in srgb, ${color} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
      padding: "1px 5px",
      borderRadius: 2,
    }}>
      {label}
    </span>
  );
}

// ── System card icons (SVG) ───────────────────────────────────────────────────
function LedgerIcon({ size = 20, color = S.tertiary }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19V5a2 2 0 012-2h12a2 2 0 012 2v14l-4-2-4 2-4-2-4 2z" />
      <path d="M8 9h8" />
      <path d="M8 13h6" />
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
      <path d="M10 6.5h4" />
      <path d="M6.5 10v4" />
      <path d="M17.5 10v4" />
      <path d="M10 17.5h4" />
    </svg>
  );
}

// ── Accounting system definitions ─────────────────────────────────────────────
interface AccountingSystem {
  id: string;
  name: string;
  description: string;
  status: "connected" | "not_connected";
  icon: React.ComponentType<{ size?: number; color?: string }>;
}

const SYSTEMS: AccountingSystem[] = [
  {
    id: "quickbooks",
    name: "QuickBooks Online",
    description: "Cloud-based accounting for small to mid-market. AP/AR invoice sync with currency support.",
    status: "not_connected",
    icon: LedgerIcon,
  },
  {
    id: "xero",
    name: "Xero",
    description: "Multi-currency cloud accounting with real-time bank feeds and invoice tracking.",
    status: "connected",
    icon: CloudIcon,
  },
  {
    id: "sage",
    name: "Sage Intacct",
    description: "Enterprise financial management with multi-entity consolidation and dimensional reporting.",
    status: "not_connected",
    icon: ServerIcon,
  },
  {
    id: "netsuite",
    name: "NetSuite (ERP+Accounting)",
    description: "Full ERP suite with GL, AP/AR, multi-currency, and intercompany elimination.",
    status: "not_connected",
    icon: ERPIcon,
  },
];

// ── Field mapping definitions ─────────────────────────────────────────────────
interface FieldMapping {
  source: string;
  target: string;
  transform: string;
  status: "MAPPED" | "UNMAPPED";
}

const DEMO_FIELD_MAPPINGS: FieldMapping[] = [
  { source: "InvoiceNumber",       target: "trade_ref",        transform: "\u2014", status: "MAPPED" },
  { source: "CurrencyCode",        target: "currency",         transform: "\u2014", status: "MAPPED" },
  { source: "Total",               target: "notional",         transform: "ABS",    status: "MAPPED" },
  { source: "DueDate",             target: "settlement_date",  transform: "ISO",    status: "MAPPED" },
  { source: "Contact.Name",        target: "counterparty",     transform: "\u2014", status: "MAPPED" },
  { source: "LineItems[].TaxAmount", target: "\u2014",         transform: "\u2014", status: "UNMAPPED" },
];

// ── Document type options ─────────────────────────────────────────────────────
const DOC_TYPES = ["AP Invoices", "AR Invoices", "Bills", "Credit Notes", "Purchase Orders"];
const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "MXN"];

// ══════════════════════════════════════════════════════════════════════════════
//  Page Component
// ══════════════════════════════════════════════════════════════════════════════
export default function AccountingConnectionPage() {
  const { isAuthenticated, token, user, isDemoMode } = useAuth();
  const router = useRouter();
  const renderTs = useRenderTs();

  const [selectedSystem, setSelectedSystem] = useState<string>("xero");
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  // Import configuration state
  const [selectedDocs, setSelectedDocs] = useState<string[]>(["AP Invoices", "AR Invoices"]);
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>(["USD"]);
  const [dateFrom, setDateFrom] = useState("2026-01-01");
  const [dateTo, setDateTo] = useState("2026-02-22");
  const [foreignOnly, setForeignOnly] = useState(true);

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/auth/login");
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return null;

  // ── Non-demo: empty state ─────────────────────────────────────────────────
  if (!DEMO_MODE && !isDemoMode) {
    return (
      <div style={{ background: S.bgDeep, minHeight: "100vh", fontFamily: S.fontUI, display: "flex", flexDirection: "column" }}>
        {/* TopBar */}
        <div style={{
          height: 44, padding: "0 24px", borderBottom: `1px solid ${S.rim}`, background: S.bgPanel,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary }}>
            ACCOUNTING SYSTEMS
          </span>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 48 }}>
          <EmptyState
            type="empty"
            title="No Accounting System"
            message="Connect your accounting system to import foreign currency invoices."
          />
        </div>
        {/* Footer */}
        <div style={{
          height: 32, padding: "0 24px", borderTop: `1px solid ${S.rim}`, background: S.bgPanel,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span suppressHydrationWarning style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
            {renderTs}
          </span>
          <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
            ORDR &middot; Accounting Systems
          </span>
        </div>
      </div>
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function toggleDoc(doc: string) {
    setSelectedDocs(prev => prev.includes(doc) ? prev.filter(d => d !== doc) : [...prev, doc]);
  }
  function toggleCurrency(cur: string) {
    setSelectedCurrencies(prev => prev.includes(cur) ? prev.filter(c => c !== cur) : [...prev, cur]);
  }

  const activeSystem = SYSTEMS.find(s => s.id === selectedSystem);

  // ══════════════════════════════════════════════════════════════════════════
  //  Render — Demo / Connected
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ background: S.bgDeep, minHeight: "100vh", fontFamily: S.fontUI, display: "flex", flexDirection: "column" }}>

      {/* ── TopBar (44px) ─────────────────────────────────────────────────── */}
      <div style={{
        height: 44,
        padding: "0 24px",
        borderBottom: `1px solid ${S.rim}`,
        background: S.bgPanel,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary }}>
            ACCOUNTING SYSTEMS
          </span>
          <span style={{ color: S.soft }}>&middot;</span>
          <span style={{ fontFamily: S.fontMono, fontSize: 11, letterSpacing: "0.06em", color: S.tertiary }}>
            POSITION DESK
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Badge label="DEMO" color={S.amber} />
          <span suppressHydrationWarning style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
            {renderTs}
          </span>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 24px 32px" }}>

          {/* ── Section: System Selector Card Grid ───────────────────────── */}
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, textTransform: "uppercase" }}>
              Select Accounting Platform
            </span>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 12,
            marginBottom: 24,
          }}>
            {SYSTEMS.map(sys => {
              const Icon = sys.icon;
              const isSelected = selectedSystem === sys.id;
              const isHovered = hoveredCard === sys.id;
              const isConnected = sys.status === "connected";

              return (
                <div
                  key={sys.id}
                  onClick={() => setSelectedSystem(sys.id)}
                  onMouseEnter={() => setHoveredCard(sys.id)}
                  onMouseLeave={() => setHoveredCard(null)}
                  style={{
                    border: `1.5px solid ${isSelected ? S.cyan : isHovered ? S.soft : S.rim}`,
                    background: isSelected ? `color-mix(in srgb, ${S.cyan} 4%, ${S.bgPanel})` : S.bgPanel,
                    borderRadius: 3,
                    padding: "14px 16px",
                    cursor: "pointer",
                    transition: "border-color 0.15s, background 0.15s",
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {/* Active indicator strip */}
                  {isSelected && (
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: S.cyan, borderRadius: "3px 3px 0 0" }} />
                  )}

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Icon size={18} color={isSelected ? S.cyan : S.tertiary} />
                      <span style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 600, color: S.primary }}>
                        {sys.name}
                      </span>
                    </div>
                    <Badge
                      label={isConnected ? "CONNECTED" : "NOT CONNECTED"}
                      color={isConnected ? S.pass : S.tertiary}
                    />
                  </div>

                  <span style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, lineHeight: "1.45" }}>
                    {sys.description}
                  </span>

                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 2 }}>
                    <button
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        color: isSelected ? S.cyan : S.secondary,
                        background: "transparent",
                        border: `1px solid ${isSelected ? S.cyan : S.rim}`,
                        borderRadius: 2,
                        padding: "3px 10px",
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      CONFIGURE
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Configuration Panel (shown when a system is selected) ───── */}
          {activeSystem && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Section header */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                borderBottom: `1px solid ${S.rim}`, paddingBottom: 8,
              }}>
                <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary }}>
                  CONFIGURATION
                </span>
                <span style={{ color: S.soft }}>&middot;</span>
                <span style={{ fontFamily: S.fontMono, fontSize: 10, letterSpacing: "0.06em", color: S.cyan }}>
                  {activeSystem.name.toUpperCase()}
                </span>
              </div>

              {/* ── 1. OAuth Connection Status ──────────────────────────── */}
              <div style={{
                border: `1px solid ${S.rim}`,
                borderRadius: 3,
                background: S.bgPanel,
                overflow: "hidden",
              }}>
                <div style={{
                  padding: "8px 14px",
                  background: S.bgDeep,
                  borderBottom: `1px solid ${S.rim}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary }}>
                    OAUTH CONNECTION STATUS
                  </span>
                  {activeSystem.status === "connected" && (
                    <Badge label="ACTIVE" color={S.pass} />
                  )}
                </div>

                <div style={{ padding: "14px 14px 16px" }}>
                  {activeSystem.status === "connected" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "6px 12px", alignItems: "baseline" }}>
                        <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.04em" }}>Connected As</span>
                        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.primary }}>
                          Synexiun Manufacturing S.A. de C.V.
                        </span>

                        <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.04em" }}>Tenant ID</span>
                        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary }}>
                          a3f8****-****-****-****-****e72b
                        </span>

                        <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.04em" }}>Token Expires</span>
                        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary }}>
                          2026-03-21 14:30 UTC
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        <button style={{
                          fontFamily: S.fontMono, fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
                          color: S.cyan, background: "transparent",
                          border: `1px solid ${S.cyan}`, borderRadius: 2,
                          padding: "4px 12px", cursor: "pointer",
                        }}>
                          RECONNECT
                        </button>
                        <button style={{
                          fontFamily: S.fontMono, fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
                          color: S.fail, background: "transparent",
                          border: `1px solid color-mix(in srgb, ${S.fail} 40%, transparent)`, borderRadius: 2,
                          padding: "4px 12px", cursor: "pointer",
                        }}>
                          DISCONNECT
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "16px 0" }}>
                      <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>
                        No active connection. Authenticate via OAuth to begin importing invoices.
                      </span>
                      <button style={{
                        fontFamily: S.fontMono, fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
                        color: S.bgPanel, background: S.cyan,
                        border: "none", borderRadius: 2,
                        padding: "5px 16px", cursor: "pointer",
                      }}>
                        CONNECT {activeSystem.name.toUpperCase()}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* ── 2. Import Configuration ─────────────────────────────── */}
              <div style={{
                border: `1px solid ${S.rim}`,
                borderRadius: 3,
                background: S.bgPanel,
                overflow: "hidden",
              }}>
                <div style={{
                  padding: "8px 14px",
                  background: S.bgDeep,
                  borderBottom: `1px solid ${S.rim}`,
                }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary }}>
                    IMPORT CONFIGURATION
                  </span>
                </div>

                <div style={{ padding: "14px 14px 16px", display: "flex", flexDirection: "column", gap: 16 }}>

                  {/* Document Types */}
                  <div>
                    <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>
                      Document Types
                    </span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {DOC_TYPES.map(doc => {
                        const checked = selectedDocs.includes(doc);
                        return (
                          <label
                            key={doc}
                            style={{
                              display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
                              fontFamily: S.fontUI, fontSize: 11, color: checked ? S.primary : S.secondary,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleDoc(doc)}
                              style={{ accentColor: S.cyan, width: 12, height: 12 }}
                            />
                            {doc}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Currency Filter */}
                  <div>
                    <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>
                      Currency Filter
                    </span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {CURRENCIES.map(cur => {
                        const checked = selectedCurrencies.includes(cur);
                        return (
                          <label
                            key={cur}
                            style={{
                              display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
                              fontFamily: S.fontMono, fontSize: 11, color: checked ? S.primary : S.secondary,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCurrency(cur)}
                              style={{ accentColor: S.cyan, width: 12, height: 12 }}
                            />
                            {cur}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Date Range */}
                  <div>
                    <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>
                      Date Range
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        style={{
                          fontFamily: S.fontMono, fontSize: 11, color: S.primary,
                          background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2,
                          padding: "4px 8px", outline: "none",
                        }}
                      />
                      <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>TO</span>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        style={{
                          fontFamily: S.fontMono, fontSize: 11, color: S.primary,
                          background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2,
                          padding: "4px 8px", outline: "none",
                        }}
                      />
                    </div>
                  </div>

                  {/* Foreign-only toggle */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                      onClick={() => setForeignOnly(!foreignOnly)}
                      style={{
                        width: 32, height: 16, borderRadius: 8, cursor: "pointer",
                        background: foreignOnly
                          ? `color-mix(in srgb, ${S.cyan} 80%, transparent)`
                          : `color-mix(in srgb, ${S.tertiary} 30%, transparent)`,
                        border: "none", position: "relative",
                        transition: "background 0.2s",
                      }}
                    >
                      <div style={{
                        width: 12, height: 12, borderRadius: "50%",
                        background: foreignOnly ? S.cyan : S.tertiary,
                        position: "absolute", top: 2,
                        left: foreignOnly ? 18 : 2,
                        transition: "left 0.2s, background 0.2s",
                      }} />
                    </button>
                    <span style={{ fontFamily: S.fontUI, fontSize: 11, color: foreignOnly ? S.primary : S.secondary }}>
                      Only foreign currency transactions
                    </span>
                  </div>
                </div>
              </div>

              {/* ── 3. Field Mapping Table ──────────────────────────────── */}
              <div style={{
                border: `1px solid ${S.rim}`,
                borderRadius: 3,
                background: S.bgPanel,
                overflow: "hidden",
              }}>
                <div style={{
                  padding: "8px 14px",
                  background: S.bgDeep,
                  borderBottom: `1px solid ${S.rim}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary }}>
                    INVOICE MAPPING
                  </span>
                  <span style={{ color: S.soft }}>&middot;</span>
                  <span style={{ fontFamily: S.fontMono, fontSize: 10, letterSpacing: "0.06em", color: S.secondary }}>
                    {activeSystem.name} &rarr; ORDR TradeRow
                  </span>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{
                    width: "100%", borderCollapse: "collapse",
                    fontFamily: S.fontMono, fontSize: 11,
                  }}>
                    <thead>
                      <tr style={{ background: S.bgSub }}>
                        {["SOURCE FIELD", "TARGET FIELD", "TRANSFORM", "STATUS"].map(h => (
                          <th key={h} style={{
                            padding: "7px 14px",
                            textAlign: "left",
                            fontFamily: S.fontMono,
                            fontSize: 9,
                            fontWeight: 700,
                            letterSpacing: "0.1em",
                            color: S.tertiary,
                            borderBottom: `1px solid ${S.rim}`,
                          }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DEMO_FIELD_MAPPINGS.map((m, i) => (
                        <tr
                          key={i}
                          style={{
                            borderBottom: `1px solid ${S.rim}`,
                            background: i % 2 === 0 ? "transparent" : `color-mix(in srgb, ${S.bgSub} 40%, transparent)`,
                          }}
                        >
                          <td style={{ padding: "6px 14px", color: S.primary }}>{m.source}</td>
                          <td style={{ padding: "6px 14px", color: m.target === "\u2014" ? S.tertiary : S.secondary }}>{m.target}</td>
                          <td style={{ padding: "6px 14px", color: S.tertiary }}>{m.transform}</td>
                          <td style={{ padding: "6px 14px" }}>
                            <Badge
                              label={m.status}
                              color={m.status === "MAPPED" ? S.pass : S.fail}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── 4. Import Summary ──────────────────────────────────── */}
              <div style={{
                border: `1px solid ${S.rim}`,
                borderRadius: 3,
                background: S.bgPanel,
                overflow: "hidden",
              }}>
                <div style={{
                  padding: "8px 14px",
                  background: S.bgDeep,
                  borderBottom: `1px solid ${S.rim}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary }}>
                    IMPORT SUMMARY
                  </span>
                  <Badge label="DEMO" color={S.amber} />
                </div>

                <div style={{ padding: "14px 14px 16px" }}>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 12,
                  }}>
                    {[
                      { label: "LAST SYNC", value: "2026-02-21 14:30 UTC" },
                      { label: "INVOICES IMPORTED", value: "47" },
                      { label: "TOTAL NOTIONAL", value: "$2.4M USD equiv." },
                      { label: "NEXT SCHEDULED", value: "2026-02-22 14:30 UTC" },
                    ].map(item => (
                      <div
                        key={item.label}
                        style={{
                          border: `1px solid ${S.rim}`,
                          borderRadius: 2,
                          background: S.bgSub,
                          padding: "10px 12px",
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                        }}
                      >
                        <span style={{
                          fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                          letterSpacing: "0.1em", color: S.tertiary,
                        }}>
                          {item.label}
                        </span>
                        <span style={{
                          fontFamily: S.fontMono, fontSize: 13, fontWeight: 600,
                          color: S.primary,
                        }}>
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* ── Footer (32px) ─────────────────────────────────────────────────── */}
      <div style={{
        height: 32,
        padding: "0 24px",
        borderTop: `1px solid ${S.rim}`,
        background: S.bgPanel,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <span suppressHydrationWarning style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
          {renderTs}
        </span>
        <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
          ORDR &middot; Accounting Systems
        </span>
      </div>
    </div>
  );
}
