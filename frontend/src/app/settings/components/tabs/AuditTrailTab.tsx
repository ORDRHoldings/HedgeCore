"use client";
import { useState, useEffect, useCallback } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { S } from "../../types/settings";
import SectionHeader from "../shared/SectionHeader";

/* ── Backend shapes ──────────────────────────────────────────────────────── */
interface AuditEvent {
  id:              string;
  event_type:      string;
  description:     string;
  actor_email:     string | null;
  actor_role:      string | null;
  entity_type:     string | null;
  entity_id:       string | null;
  payload:         Record<string, unknown>;
  event_hash:      string;
  prev_event_hash: string;
  ip_address:      string | null;
  created_at:      string;
}

interface ChainReport {
  is_intact:      boolean;
  events_checked: number;
  broken_at:      string | null;
  tenant_id:      string | null;
  verified_at:    string;
}

interface Props { token: string; }

/* ── Event type colours ──────────────────────────────────────────────────── */
const TYPE_COLORS: Record<string, string> = {
  CALCULATE: "#06B6D4",
  APPROVE:   "#10B981",
  REJECT:    "#EF4444",
  SYSTEM:    "#3B82F6",
  AUTH:      "#F59E0B",
  PIPELINE:  "#3B82F6",
  USER:      "#EC4899",
  POLICY:    "#14B8A6",
};
const eventColor = (t: string) => TYPE_COLORS[t.toUpperCase()] ?? "#6B7280";

const EVENT_TYPES = ["CALCULATE", "APPROVE", "REJECT", "SYSTEM", "AUTH", "PIPELINE", "USER", "POLICY"];
const PAGE_SIZE   = 50;

/* ── Component ───────────────────────────────────────────────────────────── */
export default function AuditTrailTab({ token }: Props) {
  const [events,     setEvents]     = useState<AuditEvent[]>([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [chain,      setChain]      = useState<ChainReport | null>(null);
  const [checking,   setChecking]   = useState(false);
  const [expanded,   setExpanded]   = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [fromTs,     setFromTs]     = useState("");
  const [toTs,       setToTs]       = useState("");

  /* Fetch events */
  const load = useCallback(async (offset = 0, type = typeFilter, from = fromTs, to = toTs) => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (type)  params.set("event_type", type);
      if (from)  params.set("from_ts", from + "T00:00:00");
      if (to)    params.set("to_ts",   to   + "T23:59:59");

      const res = await dashboardFetch(`/v1/audit?${params}`, token);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { items?: AuditEvent[]; total?: number };
      setEvents(data.items ?? []);
      setTotal(data.total ?? data.items?.length ?? 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load audit events.");
    } finally {
      setLoading(false);
    }
  }, [token, typeFilter, fromTs, toTs]);

  useEffect(() => { load(0); }, [load]);

  /* Verify chain */
  const handleVerifyChain = async () => {
    setChecking(true); setChain(null);
    try {
      const res = await dashboardFetch("/v1/audit/chain/verify", token);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setChain(await res.json() as ChainReport);
    } catch (e: unknown) {
      setChain({ is_intact: false, events_checked: 0, broken_at: null, tenant_id: null,
        verified_at: new Date().toISOString() });
    } finally {
      setChecking(false);
    }
  };

  const goPage = (p: number) => { setPage(p); load(p * PAGE_SIZE); };

  const applyFilters = () => { setPage(0); load(0, typeFilter, fromTs, toTs); };

  const clearFilters = () => {
    setTypeFilter(""); setFromTs(""); setToTs("");
    setPage(0); load(0, "", "", "");
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  /* ── Styles ──────────────────────────────────────────────────────────── */
  const th: React.CSSProperties = {
    fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.09em",
    color: S.tertiary, textTransform: "uppercase", padding: "6px 10px",
    borderBottom: `1px solid ${S.rim}`, textAlign: "left", whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = {
    fontFamily: S.fontUI, fontSize: 11, color: S.primary,
    padding: "7px 10px", borderBottom: `1px solid ${S.soft}`, verticalAlign: "top",
  };
  const inputStyle: React.CSSProperties = {
    fontFamily: S.fontUI, fontSize: 11, color: S.primary,
    background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2,
    padding: "5px 8px", outline: "none",
  };

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <SectionHeader label={`Audit Events${total ? ` (${total})` : ""}`} />
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {chain && (
            <span style={{
              fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
              color: chain.is_intact ? S.pass : S.fail,
              background: chain.is_intact
                ? `color-mix(in srgb, ${S.pass} 10%, transparent)`
                : `color-mix(in srgb, ${S.fail} 10%, transparent)`,
              border: `1px solid ${chain.is_intact ? S.pass : S.fail}40`,
              borderRadius: 2, padding: "3px 9px",
            }}>
              {chain.is_intact
                ? `✓ CHAIN VALID (${chain.events_checked} events)`
                : `✗ CHAIN BROKEN${chain.broken_at ? ` · NEAR ${chain.broken_at.slice(0, 8)}…` : ""}`}
            </span>
          )}
          <button onClick={handleVerifyChain} disabled={checking} style={{
            fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
            color: "#000", background: checking ? S.tertiary : S.cyan,
            border: "none", borderRadius: 2, padding: "5px 14px", cursor: checking ? "wait" : "pointer",
          }}>
            {checking ? "VERIFYING…" : "VERIFY HASH CHAIN"}
          </button>
          <button onClick={() => load(page * PAGE_SIZE)} style={{
            fontFamily: S.fontMono, fontSize: 10, fontWeight: 700,
            color: S.cyan, background: "transparent", border: `1px solid ${S.cyan}40`,
            borderRadius: 2, padding: "5px 10px", cursor: "pointer",
          }}>↻</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2,
        padding: "12px 14px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", color: S.tertiary }}>EVENT TYPE</span>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ ...inputStyle, minWidth: 140 }}>
            <option value="">All types</option>
            {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", color: S.tertiary }}>FROM DATE</span>
          <input type="date" value={fromTs} onChange={e => setFromTs(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", color: S.tertiary }}>TO DATE</span>
          <input type="date" value={toTs} onChange={e => setToTs(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ display: "flex", gap: 6, alignSelf: "flex-end" }}>
          <button onClick={applyFilters} style={{
            fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
            color: "#000", background: S.cyan, border: "none", borderRadius: 2,
            padding: "5px 14px", cursor: "pointer",
          }}>APPLY</button>
          {(typeFilter || fromTs || toTs) && (
            <button onClick={clearFilters} style={{
              fontFamily: S.fontMono, fontSize: 10, color: S.secondary, background: "transparent",
              border: `1px solid ${S.rim}`, borderRadius: 2, padding: "5px 10px", cursor: "pointer",
            }}>CLEAR</button>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, padding: "32px 0", letterSpacing: "0.09em" }}>
          LOADING…
        </div>
      ) : error ? (
        <div style={{ background: `color-mix(in srgb, ${S.fail} 8%, transparent)`, border: `1px solid ${S.fail}`, borderLeft: `3px solid ${S.fail}`, borderRadius: 2, padding: "12px 16px", fontFamily: S.fontMono, fontSize: 11, color: S.fail }}>
          ✗ {error}
        </div>
      ) : (
        <>
          <div style={{ background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
              <thead>
                <tr>
                  <th style={th}>TIMESTAMP</th>
                  <th style={th}>TYPE</th>
                  <th style={th}>ACTOR</th>
                  <th style={th}>DESCRIPTION</th>
                  <th style={th}>ENTITY</th>
                  <th style={th}>HASH</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ ...td, textAlign: "center", color: S.tertiary, padding: "28px" }}>
                      No audit events found{typeFilter || fromTs || toTs ? " — try clearing filters" : ""}.
                    </td>
                  </tr>
                ) : events.map(e => {
                  const color = eventColor(e.event_type);
                  const isExp = expanded === e.id;
                  const hasPayload = e.payload && Object.keys(e.payload).length > 0;
                  return (
                    <>
                      <tr key={e.id}
                        onClick={() => hasPayload && setExpanded(isExp ? null : e.id)}
                        style={{ cursor: hasPayload ? "pointer" : "default", background: isExp ? `color-mix(in srgb, ${S.cyan} 3%, transparent)` : "transparent" }}
                        onMouseEnter={ev => { if (!isExp) (ev.currentTarget as HTMLTableRowElement).style.background = S.bgPanel; }}
                        onMouseLeave={ev => { if (!isExp) (ev.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}
                      >
                        <td style={{ ...td, fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, whiteSpace: "nowrap" }}>
                          {e.created_at.replace("T", " ").slice(0, 16)}
                        </td>
                        <td style={{ ...td, padding: "6px 10px" }}>
                          <span style={{
                            fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                            color, background: `color-mix(in srgb, ${color} 10%, transparent)`,
                            border: `1px solid ${color}30`, borderRadius: 2, padding: "2px 6px",
                          }}>
                            {e.event_type}
                          </span>
                        </td>
                        <td style={{ ...td, fontFamily: S.fontMono, fontSize: 10, color: S.secondary, whiteSpace: "nowrap" }}>
                          {e.actor_email ?? "—"}
                          {e.actor_role && (
                            <span style={{ display: "block", fontSize: 9, color: S.tertiary }}>{e.actor_role}</span>
                          )}
                        </td>
                        <td style={{ ...td, maxWidth: 260 }}>
                          <span style={{ fontSize: 11, lineHeight: 1.4 }}>{e.description}</span>
                          {hasPayload && (
                            <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.cyan, marginLeft: 6 }}>
                              {isExp ? "▲" : "▶"} JSON
                            </span>
                          )}
                        </td>
                        <td style={{ ...td, fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, whiteSpace: "nowrap" }}>
                          {e.entity_type ?? "—"}
                          {e.entity_id && (
                            <span style={{ display: "block", fontSize: 9 }}>{e.entity_id.slice(0, 8)}…</span>
                          )}
                        </td>
                        <td style={{ ...td, fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>
                          {e.event_hash ? `${e.event_hash.slice(0, 8)}…` : "—"}
                        </td>
                      </tr>

                      {isExp && hasPayload && (
                        <tr key={`${e.id}-payload`}>
                          <td colSpan={6} style={{ background: S.bgDeep, borderBottom: `1px solid ${S.rim}`, padding: "0 10px 10px" }}>
                            <pre style={{
                              fontFamily: S.fontMono, fontSize: 10, color: S.secondary,
                              margin: 0, padding: "10px 12px",
                              background: S.bgDeep, borderRadius: 2,
                              whiteSpace: "pre-wrap", wordBreak: "break-word",
                              maxHeight: 240, overflowY: "auto",
                              border: `1px solid ${S.soft}`,
                            }}>
                              {JSON.stringify(e.payload, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <button disabled={page === 0} onClick={() => goPage(page - 1)} style={{
                fontFamily: S.fontMono, fontSize: 10, color: page === 0 ? S.tertiary : S.secondary,
                background: "transparent", border: `1px solid ${S.rim}`, borderRadius: 2, padding: "4px 10px",
                cursor: page === 0 ? "not-allowed" : "pointer",
              }}>← PREV</button>
              <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
                {page + 1} / {totalPages}
              </span>
              <button disabled={page >= totalPages - 1} onClick={() => goPage(page + 1)} style={{
                fontFamily: S.fontMono, fontSize: 10, color: page >= totalPages - 1 ? S.tertiary : S.secondary,
                background: "transparent", border: `1px solid ${S.rim}`, borderRadius: 2, padding: "4px 10px",
                cursor: page >= totalPages - 1 ? "not-allowed" : "pointer",
              }}>NEXT →</button>
            </div>
          )}
        </>
      )}

      {/* Chain integrity callout */}
      {chain && !chain.is_intact && (
        <div style={{
          background: `color-mix(in srgb, ${S.fail} 8%, transparent)`,
          border: `1px solid ${S.fail}`, borderLeft: `3px solid ${S.fail}`,
          borderRadius: 2, padding: "12px 16px",
        }}>
          <div style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.fail, letterSpacing: "0.08em", marginBottom: 4 }}>
            ✗ HASH CHAIN INTEGRITY FAILURE
          </div>
          <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, lineHeight: 1.6 }}>
            Chain break detected{chain.broken_at ? ` near event ${chain.broken_at}` : ""}.
            Events: {chain.events_checked} checked. Verified: {new Date(chain.verified_at).toLocaleString()}.
            Contact your compliance team immediately — this may indicate log tampering.
          </div>
        </div>
      )}

      {/* WORM footer */}
      <div style={{ background: S.bgSub, border: `1px solid ${S.soft}`, borderRadius: 2, padding: "10px 14px", fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, lineHeight: 1.6 }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.secondary, marginRight: 6, letterSpacing: "0.07em" }}>WORM</span>
        Audit events are append-only and tamper-evident. Each event is cryptographically chained to its predecessor via SHA-256.
        Use <strong>Verify Hash Chain</strong> to confirm end-to-end integrity. Click any row with a JSON payload to expand it.
      </div>
    </div>
  );
}
