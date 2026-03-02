"use client";
import { useState, useEffect, useCallback } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { S } from "../../types/settings";
import SectionHeader from "../shared/SectionHeader";

interface AuditEvent {
  id:          string;
  event_type:  string;
  description: string;
  actor_email: string | null;
  entity_type: string | null;
  entity_id:   string | null;
  created_at:  string;
  event_hash:  string | null;
}

interface ChainStatus {
  valid:    boolean;
  checked:  number;
  broken_at: string | null;
  message:  string;
}

interface Props { token: string; }

const EVENT_COLORS: Record<string, string> = {
  CALCULATE: "#06B6D4",
  APPROVE:   "#10B981",
  REJECT:    "#EF4444",
  SYSTEM:    "#8B5CF6",
  AUTH:      "#F59E0B",
};

function eventColor(type: string): string {
  return EVENT_COLORS[type] ?? "#6B7280";
}

export default function AuditTrailTab({ token }: Props) {
  const [events,   setEvents]   = useState<AuditEvent[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [chain,    setChain]    = useState<ChainStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [page,     setPage]     = useState(0);
  const [total,    setTotal]    = useState(0);
  const PAGE_SIZE = 50;

  const load = useCallback(async (offset = 0) => {
    setLoading(true); setError(null);
    try {
      const res = await dashboardFetch(
        `/v1/audit-events?limit=${PAGE_SIZE}&offset=${offset}`, token
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { events?: AuditEvent[]; total?: number } | AuditEvent[];
      if (Array.isArray(data)) {
        setEvents(data);
        setTotal(data.length);
      } else {
        setEvents((data as { events?: AuditEvent[] }).events ?? []);
        setTotal((data as { total?: number }).total ?? 0);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load audit events.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(0); }, [load]);

  const handleVerifyChain = async () => {
    setChecking(true); setChain(null);
    try {
      const res = await dashboardFetch("/v1/audit-events/chain", token);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setChain(await res.json() as ChainStatus);
    } catch (e: unknown) {
      setChain({ valid: false, checked: 0, broken_at: null, message: e instanceof Error ? e.message : "Chain check failed." });
    } finally {
      setChecking(false);
    }
  };

  const goPage = (p: number) => {
    setPage(p);
    load(p * PAGE_SIZE);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const headerCell: React.CSSProperties = {
    fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.09em",
    color: S.tertiary, textTransform: "uppercase", padding: "6px 10px",
    borderBottom: `1px solid ${S.rim}`, textAlign: "left",
  };
  const cell: React.CSSProperties = {
    fontFamily: S.fontUI, fontSize: 11, color: S.primary,
    padding: "7px 10px", borderBottom: `1px solid ${S.soft}`,
    verticalAlign: "top",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Chain integrity header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <SectionHeader label={`Audit Events${total ? ` (${total})` : ""}`} />
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {chain && (
            <span style={{
              fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
              color: chain.valid ? S.pass : S.fail,
              background: chain.valid ? `color-mix(in srgb, ${S.pass} 10%, transparent)` : `color-mix(in srgb, ${S.fail} 10%, transparent)`,
              border: `1px solid ${chain.valid ? S.pass : S.fail}40`,
              borderRadius: 2, padding: "3px 9px",
            }}>
              {chain.valid ? `✓ CHAIN VALID (${chain.checked} events)` : `✗ CHAIN BROKEN${chain.broken_at ? ` AT ${chain.broken_at.slice(0, 8)}…` : ""}`}
            </span>
          )}
          <button
            onClick={handleVerifyChain}
            disabled={checking}
            style={{
              fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
              color: "#000", background: checking ? S.tertiary : S.cyan, border: "none", borderRadius: 2,
              padding: "5px 14px", cursor: checking ? "wait" : "pointer",
            }}
          >
            {checking ? "VERIFYING…" : "VERIFY HASH CHAIN"}
          </button>
          <button
            onClick={() => load(page * PAGE_SIZE)}
            style={{
              fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
              color: S.cyan, background: "transparent", border: `1px solid ${S.cyan}40`,
              borderRadius: 2, padding: "5px 10px", cursor: "pointer",
            }}
          >
            ↻
          </button>
        </div>
      </div>

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
          <div style={{ background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 2, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={headerCell}>TIMESTAMP</th>
                  <th style={headerCell}>TYPE</th>
                  <th style={headerCell}>ACTOR</th>
                  <th style={headerCell}>DESCRIPTION</th>
                  <th style={headerCell}>ENTITY</th>
                  <th style={headerCell}>HASH</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr><td colSpan={6} style={{ ...cell, textAlign: "center", color: S.tertiary, padding: "24px" }}>No audit events found.</td></tr>
                ) : events.map(e => {
                  const color = eventColor(e.event_type);
                  return (
                    <tr key={e.id}>
                      <td style={{ ...cell, fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, whiteSpace: "nowrap" }}>
                        {e.created_at.replace("T", " ").slice(0, 16)}
                      </td>
                      <td style={{ ...cell, padding: "6px 10px" }}>
                        <span style={{
                          fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
                          color, background: `color-mix(in srgb, ${color} 10%, transparent)`,
                          border: `1px solid ${color}30`, borderRadius: 2, padding: "2px 6px",
                        }}>
                          {e.event_type}
                        </span>
                      </td>
                      <td style={{ ...cell, fontFamily: S.fontMono, fontSize: 10, color: S.secondary }}>
                        {e.actor_email ?? "—"}
                      </td>
                      <td style={{ ...cell, maxWidth: 280 }}>
                        <span style={{ fontSize: 11, color: S.primary, lineHeight: 1.4 }}>{e.description}</span>
                      </td>
                      <td style={{ ...cell, fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
                        {e.entity_type ? `${e.entity_type}` : "—"}
                        {e.entity_id && <span style={{ display: "block", fontSize: 9, color: S.tertiary }}>{e.entity_id.slice(0, 8)}…</span>}
                      </td>
                      <td style={{ ...cell, fontFamily: S.fontMono, fontSize: 9, color: S.tertiary }}>
                        {e.event_hash ? `${e.event_hash.slice(0, 8)}…` : "—"}
                      </td>
                    </tr>
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

      <div style={{ background: S.bgSub, border: `1px solid ${S.soft}`, borderRadius: 2, padding: "10px 14px", fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, lineHeight: 1.6 }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, color: S.secondary, marginRight: 6, letterSpacing: "0.07em" }}>WORM</span>
        Audit events are append-only. Hash chain links each event to its predecessor — tamper-evident by design.
        Use "Verify Hash Chain" to confirm integrity of the full event log.
      </div>
    </div>
  );
}
