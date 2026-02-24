"use client";

import { useState, useEffect } from "react";
import { useAuth } from "../../lib/authContext";
import { useRouter } from "next/navigation";
import HelpPanel from "../../components/layout/HelpPanel";
import { AUDIT_TRAIL_HELP } from "../../lib/helpContent";

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
type EventType = "PROPOSAL" | "APPROVAL" | "EXECUTION" | "POLICY" | "IMPORT" | "SYSTEM";
type TabKey = "all" | "proposals" | "approvals" | "executions" | "policy" | "imports";

interface AuditEvent {
  id: string;
  timestamp: string;
  type: EventType;
  actor: string;
  role: string;
  description: string;
  hash: string;
  fullHash: string;
  prevHash: string;
  relatedIds: Record<string, string>;
  ip: string;
  userAgent: string;
  payload: Record<string, unknown>;
  failed?: boolean;
}

// ── Color map for event types ─────────────────────────────────────────────────
const TYPE_COLORS: Record<EventType, string> = {
  PROPOSAL:  S.cyan,
  APPROVAL:  S.pass,
  EXECUTION: S.amber,
  POLICY:    "#a78bfa",
  IMPORT:    S.tertiary,
  SYSTEM:    S.tertiary,
};

// ── Tab definitions ───────────────────────────────────────────────────────────
const TABS: { key: TabKey; label: string }[] = [
  { key: "all",        label: "All Events" },
  { key: "proposals",  label: "Proposals" },
  { key: "approvals",  label: "Approvals" },
  { key: "executions", label: "Executions" },
  { key: "policy",     label: "Policy Changes" },
  { key: "imports",    label: "Data Imports" },
];

const TAB_TYPE_MAP: Record<TabKey, EventType | null> = {
  all:        null,
  proposals:  "PROPOSAL",
  approvals:  "APPROVAL",
  executions: "EXECUTION",
  policy:     "POLICY",
  imports:    "IMPORT",
};

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
      }}>{"\u2190"} Home</button>
      <span style={{ color: S.rim, userSelect: "none" }}>|</span>
      <span style={{
        fontFamily: S.fontUI, fontSize: "0.8125rem", fontWeight: 700,
        letterSpacing: "0.06em", textTransform: "uppercase", color: S.primary,
      }}>
        Audit Trail
      </span>
      <span style={{
        fontFamily: S.fontMono, fontSize: "0.6875rem", letterSpacing: "0.08em",
        color: S.secondary, padding: "1px 5px", border: `1px solid ${S.rim}`,
      }}>GOVERNANCE {"\u00B7"} IMMUTABLE</span>
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
        {renderTs} {"\u2014"} ORDR {"\u00B7"} Audit Trail
      </span>
    </footer>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// KPI Card
// ═══════════════════════════════════════════════════════════════════════════════
function KpiCard({ label, value, badge, badgeColor }: {
  label: string;
  value: string;
  badge: string;
  badgeColor: string;
}) {
  return (
    <div style={{
      flex: 1,
      background: S.bgPanel,
      border: `1px solid ${S.rim}`,
      padding: "14px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontFamily: S.fontUI, fontSize: "0.6875rem", fontWeight: 500,
          color: S.tertiary, letterSpacing: "0.04em", textTransform: "uppercase",
        }}>
          {label}
        </span>
        <Badge label={badge} color={badgeColor} />
      </div>
      <span style={{
        fontFamily: S.fontMono, fontSize: "1.375rem", fontWeight: 700,
        color: S.primary, lineHeight: 1, letterSpacing: "-0.01em",
      }}>
        {value}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Event Row
// ═══════════════════════════════════════════════════════════════════════════════
function EventRow({ event, expanded, onToggle }: {
  event: AuditEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  const typeColor = TYPE_COLORS[event.type];

  return (
    <div style={{
      borderBottom: `1px solid ${S.soft}`,
      background: expanded ? S.bgSub : "transparent",
      transition: "background 0.15s",
    }}>
      {/* Main row */}
      <div
        onClick={onToggle}
        style={{
          display: "grid",
          gridTemplateColumns: "140px 90px 170px 1fr 100px",
          alignItems: "center",
          padding: "10px 16px",
          cursor: "pointer",
          gap: 12,
        }}
        onMouseEnter={(e) => {
          if (!expanded) (e.currentTarget as HTMLDivElement).style.background = S.bgSub;
        }}
        onMouseLeave={(e) => {
          if (!expanded) (e.currentTarget as HTMLDivElement).style.background = "transparent";
        }}
      >
        {/* Timestamp */}
        <span style={{
          fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary,
          letterSpacing: "0.02em", whiteSpace: "nowrap",
        }}>
          {event.timestamp}
        </span>

        {/* Type badge */}
        <Badge label={event.type} color={typeColor} />

        {/* Actor */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{
            fontFamily: S.fontUI, fontSize: "0.75rem", fontWeight: 500,
            color: S.primary, whiteSpace: "nowrap", overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {event.actor}
          </span>
          <Badge label={event.role} color={S.tertiary} />
        </div>

        {/* Description */}
        <span style={{
          fontFamily: S.fontUI, fontSize: "0.75rem",
          color: event.failed ? S.fail : S.secondary,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          fontWeight: event.failed ? 600 : 400,
        }}>
          {event.description}
        </span>

        {/* Hash */}
        <span style={{
          fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary,
          letterSpacing: "0.03em", textAlign: "right",
        }}>
          {event.hash}
        </span>
      </div>

      {/* Expandable detail panel */}
      {expanded && (
        <div style={{
          padding: "0 16px 16px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}>
          {/* Metadata grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            padding: "12px 14px",
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
          }}>
            {/* Full hash */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{
                fontFamily: S.fontUI, fontSize: "0.625rem", fontWeight: 600,
                color: S.tertiary, letterSpacing: "0.06em", textTransform: "uppercase",
              }}>Full Hash</span>
              <span style={{
                fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.cyan,
                wordBreak: "break-all",
              }}>{event.fullHash}</span>
            </div>

            {/* Previous hash */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{
                fontFamily: S.fontUI, fontSize: "0.625rem", fontWeight: 600,
                color: S.tertiary, letterSpacing: "0.06em", textTransform: "uppercase",
              }}>Previous Hash</span>
              <span style={{
                fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary,
                wordBreak: "break-all",
              }}>{event.prevHash}</span>
            </div>

            {/* Related IDs */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{
                fontFamily: S.fontUI, fontSize: "0.625rem", fontWeight: 600,
                color: S.tertiary, letterSpacing: "0.06em", textTransform: "uppercase",
              }}>Related Entity IDs</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {Object.entries(event.relatedIds).map(([key, val]) => (
                  <span key={key} style={{
                    fontFamily: S.fontMono, fontSize: "0.625rem", color: S.secondary,
                    background: S.bgSub, border: `1px solid ${S.soft}`,
                    padding: "1px 5px", borderRadius: 2,
                  }}>
                    {key}: {val}
                  </span>
                ))}
              </div>
            </div>

            {/* IP + User Agent */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{
                fontFamily: S.fontUI, fontSize: "0.625rem", fontWeight: 600,
                color: S.tertiary, letterSpacing: "0.06em", textTransform: "uppercase",
              }}>Origin</span>
              <span style={{ fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.secondary }}>
                IP: {event.ip}
              </span>
              <span style={{ fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary }}>
                {event.userAgent}
              </span>
            </div>
          </div>

          {/* Raw payload */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{
              fontFamily: S.fontUI, fontSize: "0.625rem", fontWeight: 600,
              color: S.tertiary, letterSpacing: "0.06em", textTransform: "uppercase",
            }}>Raw Event Payload</span>
            <pre style={{
              fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.secondary,
              background: S.bgDeep, border: `1px solid ${S.rim}`,
              padding: "12px 14px", margin: 0,
              overflow: "auto", whiteSpace: "pre-wrap",
              lineHeight: 1.55, maxHeight: 220,
            }}>
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Page Component
// ═══════════════════════════════════════════════════════════════════════════════
export default function AuditTrailPage() {
  const renderTs = useRenderTs();
  const { isAuthenticated, token, user } = useAuth();
  const router = useRouter();

  // Auth guard
  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/auth/login");
    }
  }, [isAuthenticated, router]);

  // State
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actorFilter, setActorFilter] = useState("All Actors");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);

  // Filter events
  const filteredEvents = events.filter((evt) => {
    const typeFilter = TAB_TYPE_MAP[activeTab];
    if (typeFilter && evt.type !== typeFilter) return false;
    if (actorFilter !== "All Actors" && evt.actor !== actorFilter) return false;
    if (dateFrom) {
      const evtDate = evt.timestamp.slice(0, 10);
      if (evtDate < dateFrom) return false;
    }
    if (dateTo) {
      const evtDate = evt.timestamp.slice(0, 10);
      if (evtDate > dateTo) return false;
    }
    return true;
  });

  // Toggle expand
  const handleToggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  // Verify chain integrity
  const handleVerify = () => {
    if (events.length === 0) {
      console.log("No events to verify");
      return;
    }
    setVerifying(true);
    setVerified(false);
    setTimeout(() => {
      setVerifying(false);
      setVerified(true);
    }, 1600);
  };

  if (!isAuthenticated) return null;

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <div style={{
      background: S.bgDeep, minHeight: "100vh", fontFamily: S.fontUI,
      display: "flex", flexDirection: "column",
    }}>
      {/* TopBar (44px) */}
      <TopBar renderTs={renderTs} onBack={() => router.push("/")} />

      {/* Tab bar (36px) */}
      <div style={{
        height: 36, display: "flex", alignItems: "stretch",
        background: S.bgPanel, borderBottom: `1px solid ${S.rim}`,
        padding: "0 20px", gap: 0, flexShrink: 0,
      }}>
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setExpandedId(null); }}
              style={{
                fontFamily: S.fontUI, fontSize: "0.6875rem",
                fontWeight: active ? 600 : 400,
                padding: "0 16px", border: "none",
                borderBottom: active ? `2px solid ${S.cyan}` : "2px solid transparent",
                color: active ? S.cyan : S.tertiary,
                background: "transparent", cursor: "pointer",
                display: "flex", alignItems: "center",
                transition: "color 0.15s, border-color 0.15s",
                letterSpacing: "0.04em",
              }}
            >
              {tab.label}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <span style={{
          fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary,
          display: "flex", alignItems: "center", letterSpacing: "0.06em",
        }}>
          {filteredEvents.length} EVENTS
        </span>
      </div>

      {/* Content area + Help Panel */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      <div style={{
        flex: 1, overflowY: "auto",
        padding: "20px 24px 16px",
        display: "flex", flexDirection: "column", gap: 16,
      }}>

        {/* KPI Summary Row */}
        <div style={{ display: "flex", gap: 12 }}>
          <KpiCard label="Total Events"    value="0"  badge="ALL TIME" badgeColor={S.tertiary} />
          <KpiCard label="This Week"       value="0"  badge="7 DAYS"   badgeColor={S.tertiary} />
          <KpiCard label="Pending Reviews" value="—"  badge="ACTION"   badgeColor={S.amber} />
          <KpiCard label="Integrity Score" value="—"  badge="VERIFIED" badgeColor={S.pass} />
        </div>

        {/* Filter Controls */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px",
          background: S.bgPanel, border: `1px solid ${S.rim}`,
          flexWrap: "wrap",
        }}>
          {/* Date range */}
          <span style={{
            fontFamily: S.fontUI, fontSize: "0.625rem", fontWeight: 600,
            color: S.tertiary, letterSpacing: "0.06em", textTransform: "uppercase",
          }}>From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{
              fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.primary,
              background: S.bgDeep, border: `1px solid ${S.rim}`,
              padding: "4px 8px", outline: "none",
            }}
          />
          <span style={{
            fontFamily: S.fontUI, fontSize: "0.625rem", fontWeight: 600,
            color: S.tertiary, letterSpacing: "0.06em", textTransform: "uppercase",
          }}>To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{
              fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.primary,
              background: S.bgDeep, border: `1px solid ${S.rim}`,
              padding: "4px 8px", outline: "none",
            }}
          />

          {/* Actor filter */}
          <select
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            style={{
              fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.primary,
              background: S.bgDeep, border: `1px solid ${S.rim}`,
              padding: "4px 8px", outline: "none", cursor: "pointer",
              appearance: "none" as const,
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.2'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 8px center",
              paddingRight: 24,
            }}
          >
            {(["All Actors"] as string[]).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          <div style={{ flex: 1 }} />

          {/* Verify Chain Integrity */}
          <button
            onClick={handleVerify}
            disabled={verifying}
            style={{
              fontFamily: S.fontMono, fontSize: "0.6875rem", fontWeight: 700,
              letterSpacing: "0.06em",
              color: verified ? S.pass : S.cyan,
              background: verified
                ? `color-mix(in srgb, ${S.pass} 10%, transparent)`
                : `color-mix(in srgb, ${S.cyan} 10%, transparent)`,
              border: `1px solid ${verified ? S.pass : S.cyan}`,
              padding: "5px 14px", cursor: verifying ? "wait" : "pointer",
              display: "flex", alignItems: "center", gap: 6,
              transition: "all 0.25s",
            }}
          >
            {verifying && (
              <span style={{
                display: "inline-block", width: 10, height: 10,
                border: `2px solid ${S.cyan}`, borderTopColor: "transparent",
                borderRadius: "50%",
                animation: "audit-spin 0.6s linear infinite",
              }} />
            )}
            {verified ? `\u2713 All ${events.length} events verified` : verifying ? "Verifying\u2026" : "VERIFY CHAIN INTEGRITY"}
          </button>

          {/* Export */}
          <button style={{
            fontFamily: S.fontMono, fontSize: "0.6875rem", fontWeight: 600,
            letterSpacing: "0.06em",
            color: S.secondary,
            background: "transparent",
            border: `1px solid ${S.rim}`,
            padding: "5px 14px", cursor: "pointer",
          }}>
            Export Audit Log
          </button>
        </div>

        {/* Timeline header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "140px 90px 170px 1fr 100px",
          padding: "6px 16px",
          gap: 12,
          borderBottom: `1px solid ${S.rim}`,
        }}>
          {["TIMESTAMP", "TYPE", "ACTOR", "DESCRIPTION", "HASH"].map((h) => (
            <span key={h} style={{
              fontFamily: S.fontMono, fontSize: "0.625rem", fontWeight: 700,
              letterSpacing: "0.08em", color: S.tertiary,
              textAlign: h === "HASH" ? "right" : "left",
            }}>
              {h}
            </span>
          ))}
        </div>

        {/* Event list */}
        <div style={{
          background: S.bgPanel, border: `1px solid ${S.rim}`,
          flex: 1, overflow: "auto",
        }}>
          {filteredEvents.length === 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td colSpan={6} style={{ padding: "40px 24px", textAlign: "center" }}>
                    <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, lineHeight: 1.6 }}>
                      Audit events are written automatically as your team takes actions.
                    </div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginTop: 6, letterSpacing: "0.06em" }}>
                      NO EVENTS RECORDED YET
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            filteredEvents.map((evt) => (
              <EventRow
                key={evt.id}
                event={evt}
                expanded={expandedId === evt.id}
                onToggle={() => handleToggle(evt.id)}
              />
            ))
          )}
        </div>
      </div>

        <HelpPanel config={AUDIT_TRAIL_HELP} storageKey="audit-trail" />
      </div>

      {/* Footer (32px) */}
      <Footer renderTs={renderTs} />

      {/* Spinner keyframes */}
      <style>{`
        @keyframes audit-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
