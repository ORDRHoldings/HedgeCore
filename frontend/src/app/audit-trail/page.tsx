"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../../lib/authContext";
import { useRouter } from "next/navigation";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import HelpPanelV2 from "@/components/help/HelpPanelV2";
import { AUDIT_HELP } from "@/lib/help";
import { usePlanRedirect } from "@/lib/hooks/usePlanRedirect";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";

import { PageShell } from "@/components/layout/PageShell";
import { Globe } from "lucide-react";

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

// ── UI Types ──────────────────────────────────────────────────────────────────
type EventType = "PROPOSAL" | "APPROVAL" | "EXECUTION" | "POLICY" | "IMPORT" | "VOICE" | "SYSTEM";
type TabKey    = "all" | "proposals" | "approvals" | "executions" | "policy" | "imports" | "voice" | "grouped";

interface AuditEvent {
  id:         string;
  timestamp:  string;
  type:       EventType;
  actor:      string;
  role:       string;
  description: string;
  hash:       string;   // 8-char display snippet
  fullHash:   string;   // full SHA-256
  prevHash:   string;
  relatedIds: Record<string, string>;
  ip:         string;
  userAgent:  string;
  payload:    Record<string, unknown>;
  failed?:    boolean;
}

// ── Backend response types ────────────────────────────────────────────────────
interface AuditEventResponse {
  id:              string;
  company_id:      string | null;
  actor_id:        string | null;
  actor_email:     string | null;
  actor_role:      string | null;
  event_type:      string;
  description:     string;
  entity_type:     string | null;
  entity_id:       string | null;
  payload:         Record<string, unknown>;
  event_hash:      string;
  prev_event_hash: string;
  ip_address:      string | null;
  created_at:      string;
}

interface AuditListResponse {
  items: AuditEventResponse[];
  total: number;
}

interface ChainIntegrityReport {
  tenant_id:      string | null;
  events_checked: number;
  broken_at:      string | null;
  is_intact:      boolean;
  verified_at:    string;
}

// ── Map backend event_type → UI EventType ─────────────────────────────────────
function inferEventType(event_type: string): EventType {
  const t = event_type.toLowerCase();
  // Voice agent (MiFID II Art. 16(7), EU AI Act Arts. 14+52, SR 11-7) —
  // every voice event starts with "VOICE_" — see v1_voice_transcript.py.
  if (t.startsWith("voice_"))                                              return "VOICE";
  if (t.includes("approved") || t.includes("approval"))                    return "APPROVAL";
  if (t.includes("executed") || t.includes("hedged") || t.includes("execution")) return "EXECUTION";
  if (t.startsWith("proposal.") || t.startsWith("position.") ||
      t.startsWith("calculation.") || t.startsWith("run."))                return "PROPOSAL";
  if (t.startsWith("policy."))                                             return "POLICY";
  if (t.startsWith("import.") || t.startsWith("connector."))              return "IMPORT";
  return "SYSTEM";
}

// ── Build related-ID display map from a backend event ────────────────────────
function buildRelatedIds(e: AuditEventResponse): Record<string, string> {
  const ids: Record<string, string> = {};
  if (e.entity_type && e.entity_id) ids[e.entity_type] = e.entity_id.slice(0, 12);
  const p = e.payload;
  if (p.run_id)       ids.run_id       = String(p.run_id).slice(0, 12);
  if (p.position_id)  ids.position_id  = String(p.position_id).slice(0, 12);
  if (p.policy_id)    ids.policy_id    = String(p.policy_id).slice(0, 12);
  if (p.proposal_id)  ids.proposal_id  = String(p.proposal_id).slice(0, 12);
  return ids;
}

// ── Map a backend AuditEventResponse → UI AuditEvent ─────────────────────────
function mapBackendEvent(e: AuditEventResponse): AuditEvent {
  return {
    id:          e.id,
    timestamp:   e.created_at.replace("T", " ").slice(0, 19) + " UTC",
    type:        inferEventType(e.event_type),
    actor:       e.actor_email ?? e.actor_id ?? "system",
    role:        e.actor_role  ?? "—",
    description: e.description,
    hash:        e.event_hash.slice(0, 8).toUpperCase(),
    fullHash:    e.event_hash,
    prevHash:    e.prev_event_hash,
    relatedIds:  buildRelatedIds(e),
    ip:          e.ip_address ?? "—",
    userAgent:   "ORDR Terminal",
    payload:     { ...e.payload, event_type: e.event_type },
  };
}

// ── Color map for event types ─────────────────────────────────────────────────
const TYPE_COLORS: Record<EventType, string> = {
  PROPOSAL:  S.cyan,
  APPROVAL:  S.pass,
  EXECUTION: S.amber,
  POLICY:    "var(--accent-indigo)",
  IMPORT:    S.tertiary,
  VOICE:     "#1C62F2", // matches VoiceTerminal blue
  SYSTEM:    S.tertiary,
};

// ── Tab definitions ───────────────────────────────────────────────────────────
const TABS: { key: TabKey; label: string }[] = [
  { key: "all",        label: "All Events"    },
  { key: "proposals",  label: "Proposals"     },
  { key: "approvals",  label: "Approvals"     },
  { key: "executions", label: "Executions"    },
  { key: "policy",     label: "Policy Changes"},
  { key: "imports",    label: "Data Imports"  },
  { key: "voice",      label: "Voice Sessions"},
  { key: "grouped",    label: "Grouped View"  },
];

const TAB_TYPE_MAP: Record<TabKey, EventType | null> = {
  all:        null,
  proposals:  "PROPOSAL",
  approvals:  "APPROVAL",
  executions: "EXECUTION",
  policy:     "POLICY",
  imports:    "IMPORT",
  voice:      "VOICE",
  grouped:    null,
};

// ── Badge helper ──────────────────────────────────────────────────────────────
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontFamily:    S.fontMono,
      fontSize: 12,
      fontWeight:    700,
      letterSpacing: "0.08em",
      color,
      background:    `color-mix(in srgb, ${color} 12%, transparent)`,
      border:        `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
      padding:       "1px 5px",
      borderRadius:  2,
    }}>
      {label}
    </span>
  );
}

// ── Grouped View ──────────────────────────────────────────────────────────────
interface EventGroup {
  key:     string;
  label:   string;
  entity:  string;
  events:  AuditEvent[];
}

function GroupedView({ events }: { events: AuditEvent[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const groups: EventGroup[] = useMemo(() => {
    const map = new Map<string, AuditEvent[]>();
    for (const evt of events) {
      // Pick best entity key
      const ids = evt.relatedIds;
      const entityKey =
        (ids.proposal_id   ? `proposal:${ids.proposal_id}`   : null) ??
        (ids.position_id   ? `position:${ids.position_id}`   : null) ??
        (ids.run_id        ? `run:${ids.run_id}`              : null) ??
        (ids.policy_id     ? `policy:${ids.policy_id}`        : null) ??
        `type:${evt.type}`;
      const arr = map.get(entityKey) ?? [];
      arr.push(evt);
      map.set(entityKey, arr);
    }
    return Array.from(map.entries()).map(([key, evts]) => {
      const [entityType, entityId] = key.split(":");
      const sorted = [...evts].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      return {
        key,
        label: entityId ? `${entityType.toUpperCase()} · ${entityId}…` : entityType.toUpperCase(),
        entity: entityType,
        events: sorted,
      };
    }).sort((a, b) => {
      const aLast = a.events[a.events.length - 1]?.timestamp ?? "";
      const bLast = b.events[b.events.length - 1]?.timestamp ?? "";
      return bLast.localeCompare(aLast);
    });
  }, [events]);

  if (events.length === 0) {
    return (
      <div style={{ padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary }}>
          No events to group.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, letterSpacing: "0.06em", marginBottom: 4 }}>
        {groups.length} ENTITY GROUPS · {events.length} EVENTS
      </div>
      {groups.map(group => {
        const isOpen = expanded === group.key;
        const typeBreakdown = group.events.reduce((acc, e) => {
          acc[e.type] = (acc[e.type] ?? 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        const firstEvt = group.events[0];
        const lastEvt  = group.events[group.events.length - 1];
        const impact = lastEvt?.type === "EXECUTION" ? "EXECUTED"
          : lastEvt?.type === "APPROVAL" ? "APPROVED"
          : lastEvt?.type === "POLICY" ? "POLICY UPDATED"
          : group.events.length > 1 ? "IN PROGRESS"
          : "INITIATED";

        return (
          <div key={group.key} style={{
            background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 4, overflow: "hidden",
          }}>
            {/* Group header */}
            <div
              onClick={() => setExpanded(isOpen ? null : group.key)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 16px", cursor: "pointer",
                background: isOpen ? `color-mix(in srgb, ${S.cyan} 5%, ${S.bgSub})` : S.bgSub,
                borderBottom: isOpen ? `1px solid ${S.rim}` : "none",
              }}
            >
              <span style={{
                fontFamily: S.fontMono, fontSize: 11, fontWeight: 700,
                color: S.cyan, letterSpacing: "0.06em",
              }}>
                {group.label}
              </span>
              <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
                {group.events.length} events
              </span>
              <div style={{ flex: 1 }} />
              {/* Type breakdown */}
              {Object.entries(typeBreakdown).map(([type, count]) => (
                <span key={type} style={{
                  fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                  color: TYPE_COLORS[type as EventType] ?? S.tertiary,
                  padding: "1px 5px", borderRadius: 2,
                  border: `1px solid ${TYPE_COLORS[type as EventType] ?? S.rim}`,
                  background: `${TYPE_COLORS[type as EventType] ?? S.tertiary}15`,
                }}>
                  {type} ×{count}
                </span>
              ))}
              {/* Impact */}
              <span style={{
                fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                color: impact === "EXECUTED" ? S.pass : impact === "APPROVED" ? S.pass : impact === "IN PROGRESS" ? S.amber : S.tertiary,
                padding: "1px 6px", borderRadius: 2,
                border: `1px solid ${impact === "EXECUTED" || impact === "APPROVED" ? S.pass : impact === "IN PROGRESS" ? S.amber : S.rim}`,
              }}>
                {impact}
              </span>
              <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, marginLeft: 4 }}>
                {isOpen ? "▲" : "▼"}
              </span>
            </div>

            {/* Impact summary (always visible) */}
            {!isOpen && (
              <div style={{
                padding: "8px 16px",
                fontFamily: S.fontUI, fontSize: 11, color: S.secondary,
                display: "flex", gap: 16, flexWrap: "wrap",
              }}>
                <span>
                  <span style={{ color: S.tertiary }}>First: </span>
                  {firstEvt?.timestamp.slice(0, 16)} · {firstEvt?.description.slice(0, 60)}{firstEvt && firstEvt.description.length > 60 ? "…" : ""}
                </span>
                {group.events.length > 1 && (
                  <span>
                    <span style={{ color: S.tertiary }}>Last: </span>
                    {lastEvt?.timestamp.slice(0, 16)} · {lastEvt?.description.slice(0, 40)}{lastEvt && lastEvt.description.length > 40 ? "…" : ""}
                  </span>
                )}
              </div>
            )}

            {/* Expanded event list */}
            {isOpen && (
              <div style={{ padding: "8px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                {group.events.map((evt, ei) => (
                  <div key={evt.id} style={{
                    display: "flex", alignItems: "flex-start", gap: 12,
                    paddingBottom: ei < group.events.length - 1 ? 6 : 0,
                    borderBottom: ei < group.events.length - 1 ? `1px solid ${S.soft}` : "none",
                  }}>
                    {/* Timeline dot */}
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%", flexShrink: 0, marginTop: 4,
                      background: TYPE_COLORS[evt.type] ?? S.tertiary,
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}>
                        <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>{evt.timestamp.slice(0, 16)}</span>
                        <span style={{
                          fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                          color: TYPE_COLORS[evt.type] ?? S.tertiary,
                          padding: "0 4px", border: `1px solid ${TYPE_COLORS[evt.type] ?? S.rim}`,
                          borderRadius: 2,
                        }}>{evt.type}</span>
                        <span style={{ fontFamily: S.fontUI, fontSize: 10, color: S.tertiary }}>{evt.actor}</span>
                      </div>
                      <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary }}>{evt.description}</div>
                    </div>
                    <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, flexShrink: 0 }}>{evt.hash}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── TopBar ────────────────────────────────────────────────────────────────────
function TopBar({ renderTs, onBack, onRefresh, loading }: {
  renderTs:  string;
  onBack:    () => void;
  onRefresh: () => void;
  loading:   boolean;
}) {
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
      }}>← Home</button>
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
      }}>GOVERNANCE · IMMUTABLE</span>
      <span style={{
        fontFamily: S.fontMono, fontSize: "0.625rem", letterSpacing: "0.06em",
        color: S.pass, padding: "1px 5px",
        border: `1px solid color-mix(in srgb, ${S.pass} 30%, transparent)`,
        background: `color-mix(in srgb, ${S.pass} 8%, transparent)`,
      }}>BACKEND · LIVE</span>
      <div style={{ flex: 1 }} />
      <button
        onClick={onRefresh}
        disabled={loading}
        title="Reload events from server"
        style={{
          fontFamily: S.fontMono, fontSize: 12, color: loading ? S.tertiary : S.primary,
          background: "transparent", border: `1px solid ${S.rim}`,
          padding: "3px 10px", cursor: loading ? "wait" : "pointer",
          letterSpacing: "0.04em",
        }}
      >
        {loading ? "Loading…" : "↻ Refresh"}
      </button>
      <span style={{
        fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary,
        letterSpacing: "0.04em",
      }}>
        AS OF {renderTs}
      </span>
    </header>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────
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
        {renderTs} — ORDR · Audit Trail · Hash-Chained · PostgreSQL
      </span>
    </footer>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, badge, badgeColor }: {
  label:      string;
  value:      string;
  badge:      string;
  badgeColor: string;
}) {
  return (
    <div style={{
      flex: 1, background: S.bgPanel, border: `1px solid ${S.rim}`,
      padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6,
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

// ── Event Row ─────────────────────────────────────────────────────────────────
function EventRow({ event, expanded, onToggle }: {
  event:    AuditEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isMobile = useIsMobile();
  const typeColor = TYPE_COLORS[event.type];

  return (
    <div style={{
      borderBottom: `1px solid ${S.soft}`,
      background:   expanded ? S.bgSub : "transparent",
      transition:   "background 0.15s",
    }}>
      {/* Main row */}
      <div
        onClick={onToggle}
        style={{
          display:               "grid",
          gridTemplateColumns:   "140px 90px 170px 1fr 100px",
          alignItems:            "center",
          padding:               "10px 16px",
          cursor:                "pointer",
          gap:                   12,
        }}
        onMouseEnter={(e) => {
          if (!expanded) (e.currentTarget as HTMLDivElement).style.background = S.bgSub;
        }}
        onMouseLeave={(e) => {
          if (!expanded) (e.currentTarget as HTMLDivElement).style.background = "transparent";
        }}
      >
        <span style={{
          fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.tertiary,
          letterSpacing: "0.02em", whiteSpace: "nowrap",
        }}>
          {event.timestamp}
        </span>
        <Badge label={event.type} color={typeColor} />
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
        <span style={{
          fontFamily: S.fontUI, fontSize: "0.75rem",
          color:      event.failed ? S.fail : S.secondary,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          fontWeight: event.failed ? 600 : 400,
        }}>
          {event.description}
        </span>
        <span style={{
          fontFamily: S.fontMono, fontSize: "0.625rem", color: S.tertiary,
          letterSpacing: "0.03em", textAlign: "right",
        }}>
          {event.hash}
        </span>
      </div>

      {/* Expandable detail panel */}
      {expanded && (
        <div style={{ padding: "0 16px 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Metadata grid */}
          <div style={{
            display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8,
            padding: "12px 14px", background: S.bgPanel, border: `1px solid ${S.rim}`,
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{
                fontFamily: S.fontUI, fontSize: "0.625rem", fontWeight: 600,
                color: S.tertiary, letterSpacing: "0.06em", textTransform: "uppercase",
              }}>Full Hash (SHA-256)</span>
              <span style={{
                fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.cyan,
                wordBreak: "break-all",
              }}>{event.fullHash}</span>
            </div>
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
  const _planAllowed = usePlanRedirect("enterprise");
  const renderTs = useRenderTs();
  const { isAuthenticated, isLoading, token, user } = useAuth();
  const router = useRouter();
  const isMobile = useIsMobile();

  // Auth guard
  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/auth/login");
  }, [isLoading, isAuthenticated, router]);

  // Data state
  const [events,    setEvents]    = useState<AuditEvent[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filter state
  const [activeTab,    setActiveTab]    = useState<TabKey>("all");
  const [expandedId,   setExpandedId]   = useState<string | null>(null);
  const [actorFilter,  setActorFilter]  = useState("All Actors");
  const [dateFrom,     setDateFrom]     = useState("");
  const [dateTo,       setDateTo]       = useState("");
  const [search,       setSearch]       = useState("");

  // Chain integrity state
  const [verifying,        setVerifying]        = useState(false);
  const [integrityReport,  setIntegrityReport]  = useState<ChainIntegrityReport | null>(null);

  // ── Fetch events from backend ──────────────────────────────────────────────
  const fetchEvents = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (dateFrom) params.set("from_ts", dateFrom + "T00:00:00");
      if (dateTo)   params.set("to_ts",   dateTo   + "T23:59:59");

      const res = await dashboardFetch(`/v1/audit?${params.toString()}`, token);
      if (!res.ok) {
        const msg = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(msg || `HTTP ${res.status}`);
      }
      const data: AuditListResponse = await res.json();
      setEvents(data.items.map(mapBackendEvent));
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load audit events");
    } finally {
      setLoading(false);
    }
  }, [token, dateFrom, dateTo]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  if (!_planAllowed) return null;

  // ── Chain integrity verification (backend) ────────────────────────────────
  const handleVerify = async () => {
    if (!token || verifying) return;
    setVerifying(true);
    setIntegrityReport(null);
    try {
      const res = await dashboardFetch("/v1/audit/chain/verify", token);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const report: ChainIntegrityReport = await res.json();
      setIntegrityReport(report);
    } catch {
      // Leave report null — UI shows failure state
    } finally {
      setVerifying(false);
    }
  };

  // ── Client-side filtering ─────────────────────────────────────────────────
  const filteredEvents = events.filter((evt) => {
    const typeFilter = TAB_TYPE_MAP[activeTab];
    if (typeFilter && evt.type !== typeFilter) return false;
    if (actorFilter !== "All Actors" && evt.actor !== actorFilter) return false;
    if (dateFrom && evt.timestamp.slice(0, 10) < dateFrom) return false;
    if (dateTo   && evt.timestamp.slice(0, 10) > dateTo)   return false;
    if (search) {
      const q = search.toLowerCase();
      const matchDesc = evt.description.toLowerCase().includes(q);
      const matchId   = Object.values(evt.relatedIds).some(v => v.toLowerCase().includes(q));
      const matchActor = evt.actor.toLowerCase().includes(q);
      if (!matchDesc && !matchId && !matchActor) return false;
    }
    return true;
  });

  // ── CSV export ────────────────────────────────────────────────────────────
  const handleExportAuditLog = () => {
    const rows = ["timestamp,type,actor,role,description,hash,prev_hash"];
    events.forEach(e => rows.push(
      [e.timestamp, e.type, e.actor, e.role, `"${e.description.replace(/"/g, '""')}"`, e.fullHash, e.prevHash].join(",")
    ));
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `ordr_audit_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isAuthenticated) return null;

  // ── KPI values ───────────────────────────────────────────────────────────
  const weekAgo    = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const thisWeek   = events.filter(e => e.timestamp.slice(0, 10) >= weekAgo).length;
  const execCount  = events.filter(e => e.type === "EXECUTION").length;

  let integrityValue = "—";
  let integrityColor: string = S.tertiary;
  if (integrityReport) {
    if (integrityReport.is_intact) {
      integrityValue = `✓ ${integrityReport.events_checked} verified`;
      integrityColor = S.pass;
    } else {
      integrityValue = "✗ BROKEN";
      integrityColor = S.fail;
    }
  }

  // Unique actors for the actor filter dropdown
  const actors = ["All Actors", ...Array.from(new Set(events.map(e => e.actor))).sort()];

  return (

    <PageShell icon={Globe} title="Audit Trail" breadcrumb={["Dashboard", "Audit Trail"]} noPadding>
    <div style={{
      background: S.bgDeep, minHeight: "100vh", fontFamily: S.fontUI,
      display: "flex", flexDirection: "column",
    }}>
      {/* TopBar (44px) */}
      <TopBar
        renderTs={renderTs}
        onBack={() => router.push("/")}
        onRefresh={fetchEvents}
        loading={loading}
      />

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
                fontFamily:   S.fontUI,
                fontSize:     "0.6875rem",
                fontWeight:   active ? 600 : 400,
                padding:      "0 16px",
                border:       "none",
                borderBottom: active ? `2px solid ${S.cyan}` : "2px solid transparent",
                color:        active ? S.cyan : S.tertiary,
                background:   "transparent",
                cursor:       "pointer",
                display:      "flex",
                alignItems:   "center",
                transition:   "color 0.15s, border-color 0.15s",
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
          {loading ? "…" : filteredEvents.length} EVENTS
        </span>
      </div>

      {/* Content area + Help Panel */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{
          flex: 1, overflowY: "auto",
          padding: isMobile ? "20px 12px 16px" : "20px 24px 16px",
          display: "flex", flexDirection: "column", gap: 16,
        }}>

          {/* KPI Summary Row */}
          <div style={{ display: "flex", gap: 12, flexWrap: isMobile ? "wrap" : "nowrap" }}>
            <KpiCard
              label="Total Events"
              value={loading ? "…" : String(events.length)}
              badge="ALL TIME"
              badgeColor={S.tertiary}
            />
            <KpiCard
              label="This Week"
              value={loading ? "…" : String(thisWeek)}
              badge="7 DAYS"
              badgeColor={thisWeek > 0 ? S.cyan : S.tertiary}
            />
            <KpiCard
              label="Executions"
              value={loading ? "…" : String(execCount)}
              badge="ORDERS"
              badgeColor={execCount > 0 ? S.amber : S.tertiary}
            />
            <KpiCard
              label="Chain Integrity"
              value={loading ? "…" : integrityValue}
              badge="SHA-256"
              badgeColor={integrityColor}
            />
          </div>

          {/* Filter Controls */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px",
            background: S.bgPanel, border: `1px solid ${S.rim}`,
            flexWrap: "wrap",
          }}>
            {/* Search */}
            <input
              type="text"
              placeholder="Search description, ID, actor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                fontFamily: S.fontMono, fontSize: "0.6875rem", color: S.primary,
                background: S.bgDeep, border: `1px solid ${S.rim}`,
                padding: "4px 10px", outline: "none", width: 220,
              }}
            />

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
              {actors.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>

            <div style={{ flex: 1 }} />

            {/* Verify Chain Integrity (real backend call) */}
            <button
              onClick={handleVerify}
              disabled={verifying || loading}
              style={{
                fontFamily:   S.fontMono,
                fontSize:     "0.6875rem",
                fontWeight:   700,
                letterSpacing: "0.06em",
                color:        integrityReport?.is_intact
                                ? S.pass
                                : integrityReport && !integrityReport.is_intact
                                  ? S.fail
                                  : S.cyan,
                background:   integrityReport?.is_intact
                                ? `color-mix(in srgb, ${S.pass} 10%, transparent)`
                                : `color-mix(in srgb, ${S.cyan} 10%, transparent)`,
                border:       `1px solid ${integrityReport?.is_intact ? S.pass : integrityReport && !integrityReport.is_intact ? S.fail : S.cyan}`,
                padding:      "5px 14px",
                cursor:       verifying || loading ? "wait" : "pointer",
                display:      "flex",
                alignItems:   "center",
                gap:          6,
                transition:   "all 0.25s",
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
              {integrityReport?.is_intact
                ? `✓ ${integrityReport.events_checked} events verified`
                : integrityReport && !integrityReport.is_intact
                  ? `✗ Chain broken at ${integrityReport.broken_at?.slice(0, 8)}`
                  : verifying
                    ? "Verifying…"
                    : "VERIFY CHAIN INTEGRITY"}
            </button>

            {/* Export */}
            <button
              onClick={handleExportAuditLog}
              disabled={events.length === 0}
              style={{
                fontFamily:   S.fontMono,
                fontSize:     "0.6875rem",
                fontWeight:   600,
                letterSpacing: "0.06em",
                color:        events.length > 0 ? S.secondary : S.tertiary,
                background:   "transparent",
                border:       `1px solid ${S.rim}`,
                padding:      "5px 14px",
                cursor:       events.length > 0 ? "pointer" : "default",
              }}
            >
              Export CSV ↓
            </button>
          </div>

          {/* Table wrapper */}
          <div style={{ overflowX: "auto", display: "flex", flexDirection: "column", flex: 1 }}>
            {/* Timeline header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "140px 90px 170px 1fr 100px",
              padding: "6px 16px", gap: 12,
              borderBottom: `1px solid ${S.rim}`,
            }}>
              {["TIMESTAMP", "TYPE", "ACTOR", "DESCRIPTION", "HASH"].map((h) => (
                <span key={h} style={{
                  fontFamily:    S.fontMono,
                  fontSize:      "0.625rem",
                  fontWeight:    700,
                  letterSpacing: "0.08em",
                  color:         S.tertiary,
                  textAlign:     h === "HASH" ? "right" : "left",
                }}>
                  {h}
                </span>
              ))}
            </div>

            {/* Event list */}
            <div style={{
              background: S.bgPanel, border: `1px solid ${S.rim}`,
              flex: 1, overflowY: "auto",
            }}>
            {/* Loading */}
            {loading && (
              <div style={{ padding: "40px 24px", textAlign: "center" }}>
                <div style={{
                  fontFamily: S.fontMono, fontSize: 12, color: S.tertiary,
                  letterSpacing: "0.06em",
                }}>
                  LOADING AUDIT EVENTS…
                </div>
              </div>
            )}

            {/* Error */}
            {!loading && fetchError && (
              <div style={{ padding: "32px 24px", textAlign: "center" }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.fail, letterSpacing: "0.06em" }}>
                  FAILED TO LOAD — {fetchError}
                </div>
                <button
                  onClick={fetchEvents}
                  style={{
                    marginTop: 12, fontFamily: S.fontMono, fontSize: 12,
                    fontWeight: 600, letterSpacing: "0.06em",
                    color: S.cyan, background: "transparent",
                    border: `1px solid ${S.cyan}`,
                    padding: "5px 14px", cursor: "pointer",
                  }}
                >
                  RETRY
                </button>
              </div>
            )}

            {/* Empty */}
            {!loading && !fetchError && filteredEvents.length === 0 && (
              <div style={{ padding: "40px 24px", textAlign: "center" }}>
                <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, lineHeight: 1.6 }}>
                  {events.length === 0
                    ? "No audit events recorded yet. Events are written automatically as your team takes actions."
                    : "No events match the current filters."}
                </div>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginTop: 6, letterSpacing: "0.06em" }}>
                  {events.length === 0 ? "EMPTY AUDIT LOG" : "0 MATCHING EVENTS"}
                </div>
              </div>
            )}

            {/* Events (flat or grouped) */}
            {!loading && !fetchError && activeTab === "grouped" ? (
              <GroupedView events={filteredEvents} />
            ) : (
              !loading && !fetchError && filteredEvents.map((evt) => (
                <EventRow
                  key={evt.id}
                  event={evt}
                  expanded={expandedId === evt.id}
                  onToggle={() => setExpandedId((prev) => (prev === evt.id ? null : evt.id))}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <HelpPanelV2 module={AUDIT_HELP} storageKey="audit-trail" />
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
  
    </PageShell>
    );
}
