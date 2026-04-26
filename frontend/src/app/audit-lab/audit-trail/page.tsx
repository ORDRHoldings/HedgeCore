"use client";
/**
 * /audit-lab/audit-trail
 * Audit Lab -- searchable/filterable event log with CSV export.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { Search, Download, ShieldCheck, Microscope } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";

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
  green:     "var(--status-pass,#22c55e)",
  red:       "var(--accent-red,#f87171)",
} as const;

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface AuditEvent {
  id: string;
  timestamp: string;
  event_type: string;
  description: string;
  entity_type: string;
  actor_email: string;
  hash: string;
}

/* ── CSV Export ──────────────────────────────────────────────────────────────── */

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportCsv(events: AuditEvent[]) {
  const headers = ["timestamp", "event_type", "description", "entity_type", "actor_email", "hash"];
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = events.map(e =>
    [e.timestamp, e.event_type, e.description, e.entity_type, e.actor_email, e.hash]
      .map(escape)
      .join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`);
}

/* ── Event type badge ───────────────────────────────────────────────────────── */

function eventTypeBadge(type: string) {
  const color =
    type.includes("CREATE") || type.includes("INSERT") ? S.green :
    type.includes("DELETE") || type.includes("REJECT") ? S.red :
    type.includes("UPDATE") || type.includes("APPROVE") ? S.amber :
    S.tertiary;
  return (
    <span style={{
      fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
      color, background: `color-mix(in srgb, ${color} 10%, transparent)`,
      padding: "2px 8px", borderRadius: 2, letterSpacing: "0.04em",
    }}>
      {type}
    </span>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────────── */

export default function AuditTrailPage() {
  const { token } = useAuth();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await dashboardFetch("/v1/audit-lab/audit-trail", token);
      if (!res.ok) {
        setError(`Failed to load audit trail (HTTP ${res.status}).`);
        return;
      }
      const data = await res.json();
      setEvents((data as { events: AuditEvent[] }).events ?? data);
    } catch {
      setError("Network error loading audit trail.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Distinct event types for filter dropdown
  const eventTypes = useMemo(
    () => Array.from(new Set(events.map(e => e.event_type))).sort(),
    [events],
  );

  // Filtered + searched events
  const filtered = useMemo(() => {
    let result = events;
    if (typeFilter !== "all") {
      result = result.filter(e => e.event_type === typeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(e =>
        e.description.toLowerCase().includes(q)
        || e.actor_email.toLowerCase().includes(q)
        || e.entity_type.toLowerCase().includes(q)
        || e.event_type.toLowerCase().includes(q)
        || e.hash.toLowerCase().includes(q)
      );
    }
    return result;
  }, [events, typeFilter, search]);

  return (
    <PageShell icon={Microscope} title="Activity Log" breadcrumb={["Audit Lab", "Activity Log"]}>
      <div style={{ fontFamily: S.fontUI }}>
      {/* Breadcrumb + header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{
          fontFamily: S.fontMono, fontSize: 12, color: S.tertiary,
          letterSpacing: "0.1em", marginBottom: 6,
        }}>
          <a href="/audit-lab" style={{ color: S.cyan, textDecoration: "none" }}>AUDIT LAB</a>
          {" / "}
          <span>ACTIVITY LOG</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontFamily: S.fontMono, fontSize: 18, fontWeight: 700, color: S.primary, margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
              <ShieldCheck size={20} style={{ color: S.cyan }} />
              Activity Log
            </h1>
            <p style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, marginTop: 6 }}>
              Immutable event log. All entries are hash-chained and tamper-evident.
            </p>
          </div>
          <button
            onClick={() => exportCsv(filtered)}
            disabled={filtered.length === 0}
            style={{
              fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
              color: S.primary, background: S.bgPanel,
              border: `1px solid ${S.rim}`, padding: "8px 16px", cursor: "pointer",
              borderRadius: 2, display: "flex", alignItems: "center", gap: 6,
              opacity: filtered.length === 0 ? 0.4 : 1,
            }}
          >
            <Download size={14} />
            EXPORT CSV
          </button>
        </div>
      </div>

      {/* Search + filter bar */}
      <div style={{
        display: "flex", gap: 12, marginBottom: 16, alignItems: "center",
      }}>
        <div style={{
          flex: 1, position: "relative", display: "flex", alignItems: "center",
        }}>
          <Search
            size={14}
            style={{
              position: "absolute", left: 12, color: S.tertiary, pointerEvents: "none",
            }}
          />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search description, actor, entity, hash..."
            style={{
              fontFamily: S.fontMono, fontSize: 12, color: S.primary,
              background: S.bgSub, border: `1px solid ${S.rim}`,
              padding: "8px 12px 8px 34px", width: "100%", outline: "none", borderRadius: 2,
              boxSizing: "border-box",
            }}
          />
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          style={{
            fontFamily: S.fontMono, fontSize: 12, color: S.primary,
            background: S.bgSub, border: `1px solid ${S.rim}`,
            padding: "8px 12px", outline: "none", borderRadius: 2, minWidth: 180,
          }}
        >
          <option value="all">All Event Types ({events.length})</option>
          {eventTypes.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, whiteSpace: "nowrap" }}>
          {filtered.length} event{filtered.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: `color-mix(in srgb, ${S.red} 8%, transparent)`,
          border: `1px solid color-mix(in srgb, ${S.red} 30%, transparent)`,
          padding: "10px 16px", marginBottom: 16, fontFamily: S.fontMono, fontSize: 12, color: S.red,
        }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ padding: 40, fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
          Loading audit trail...
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: S.bgSub }}>
                {["Timestamp", "Event Type", "Description", "Entity Type", "Actor", "Hash"].map(h => (
                  <th scope="col" key={h} style={{
                    fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                    letterSpacing: "0.08em", color: S.tertiary, textAlign: "left",
                    padding: "10px 16px", borderBottom: `1px solid ${S.soft}`, textTransform: "uppercase",
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id} style={{ borderBottom: `1px solid ${S.soft}` }}>
                  <td style={{
                    padding: "10px 16px", fontFamily: S.fontMono,
                    fontSize: 12, color: S.secondary, whiteSpace: "nowrap",
                  }}>
                    {new Date(e.timestamp).toLocaleString()}
                  </td>
                  <td style={{ padding: "10px 16px" }}>
                    {eventTypeBadge(e.event_type)}
                  </td>
                  <td style={{
                    padding: "10px 16px", fontFamily: S.fontUI,
                    fontSize: 12, color: S.primary, maxWidth: 320,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {e.description}
                  </td>
                  <td style={{
                    padding: "10px 16px", fontFamily: S.fontMono,
                    fontSize: 12, color: S.tertiary,
                  }}>
                    {e.entity_type}
                  </td>
                  <td style={{
                    padding: "10px 16px", fontFamily: S.fontMono,
                    fontSize: 12, color: S.cyan,
                  }}>
                    {e.actor_email}
                  </td>
                  <td style={{
                    padding: "10px 16px", fontFamily: S.fontMono,
                    fontSize: 12, color: S.tertiary, maxWidth: 140,
                    overflow: "hidden", textOverflow: "ellipsis",
                  }}
                    title={e.hash}
                  >
                    {e.hash ? `${e.hash.slice(0, 12)}...` : "\u2014"}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: "40px 16px", fontFamily: S.fontUI,
                      fontSize: 13, color: S.tertiary, textAlign: "center",
                    }}
                  >
                    {events.length === 0 ? "No audit events recorded yet." : "No events match the current filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </PageShell>
  );
}
