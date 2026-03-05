"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuthStore } from "@/lib/auth/store";
import { api } from "@/lib/api/client";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgDeep: "var(--bg-deep,#F8FAFC)",
  bgPanel: "var(--bg-panel,#FFFFFF)",
  bgSub: "var(--bg-sub,#F1F5F9)",
  rim: "var(--border-rim,#E2E8F0)",
  accentRed: "var(--accent-red,#DC2626)",
  accentCyan: "var(--accent-cyan,#1C62F2)",
  accentAmber: "var(--accent-amber,#D97706)",
  statusPass: "var(--status-pass,#059669)",
  textPrimary: "var(--text-primary,#0F172A)",
  textSecondary: "var(--text-secondary,#334155)",
  textTertiary: "var(--text-tertiary,#94A3B8)",
} as const;

function NotFound() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg-deep)" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-terminal-mono)", fontSize: 48, fontWeight: 700, color: "var(--border-soft)" }}>404</div>
        <div style={{ fontFamily: "var(--font-terminal)", fontSize: 14, color: "var(--text-tertiary)", marginTop: 8 }}>Page not found</div>
      </div>
    </div>
  );
}

interface AuditEvent {
  id: string;
  event_type: string;
  created_at: string;
  actor_email?: string;
  actor_id?: string;
  company_name?: string;
  entity_type?: string;
  entity_id?: string;
  description?: string;
  hash?: string;
  is_valid?: boolean;
}

interface ChainVerifyResult {
  is_intact: boolean;
  total_events: number;
  first_broken_at?: string;
  message?: string;
}

export default function AuditPage() {
  const { user } = useAuthStore();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chainResult, setChainResult] = useState<ChainVerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Filters
  const [filterEventType, setFilterEventType] = useState("");
  const [filterActor, setFilterActor] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<AuditEvent[] | { items: AuditEvent[] }>("/v1/audit?limit=100");
      setEvents(Array.isArray(res) ? res : (res as { items: AuditEvent[] }).items ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load audit events");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.is_superuser) fetchEvents();
  }, [user, fetchEvents]);

  if (!user?.is_superuser) return <NotFound />;

  const filtered = events.filter((evt) => {
    if (filterEventType && !evt.event_type.toLowerCase().includes(filterEventType.toLowerCase())) return false;
    if (filterActor && !(evt.actor_email ?? "").toLowerCase().includes(filterActor.toLowerCase())) return false;
    if (filterDateFrom && evt.created_at < filterDateFrom) return false;
    if (filterDateTo && evt.created_at > filterDateTo + "T23:59:59") return false;
    return true;
  });

  const handleVerifyChain = async () => {
    setVerifying(true);
    setChainResult(null);
    try {
      const res = await api.get<ChainVerifyResult>("/v1/audit/chain/verify");
      setChainResult(res);
    } catch (e: unknown) {
      setChainResult({ is_intact: false, total_events: 0, message: e instanceof Error ? e.message : "Verification failed" });
    } finally {
      setVerifying(false);
    }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-events-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const eventTypes = Array.from(new Set(events.map((e) => e.event_type))).sort();

  return (
    <div style={{ padding: "28px 32px", minHeight: "calc(100vh - 92px)", background: S.bgDeep }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.accentRed, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>
            COMMAND CENTER / AUDIT
          </div>
          <h1 style={{ fontFamily: S.fontMono, fontSize: 20, fontWeight: 700, color: S.textPrimary, margin: 0 }}>
            AUDIT TRAIL
          </h1>
          <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary, marginTop: 4 }}>
            Hash-chained, tamper-evident event log
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={handleVerifyChain}
            disabled={verifying}
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: S.accentCyan,
              background: "#EFF6FF",
              border: `1px solid ${S.accentCyan}`,
              borderRadius: 5,
              padding: "8px 16px",
              cursor: verifying ? "default" : "pointer",
            }}
          >
            {verifying ? "VERIFYING..." : "VERIFY CHAIN"}
          </button>
          <button
            onClick={handleExport}
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: S.bgPanel,
              background: S.accentRed,
              border: "none",
              borderRadius: 5,
              padding: "8px 16px",
              cursor: "pointer",
            }}
          >
            EXPORT ↓
          </button>
        </div>
      </div>

      {/* Chain verification result banner */}
      {chainResult && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            background: chainResult.is_intact ? "#D1FAE5" : "#FEF2F2",
            border: `1px solid ${chainResult.is_intact ? S.statusPass : S.accentRed}`,
            borderRadius: 5,
            marginBottom: 16,
          }}
        >
          <span style={{ fontSize: 16 }}>{chainResult.is_intact ? "✅" : "❌"}</span>
          <div>
            <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: chainResult.is_intact ? S.statusPass : S.accentRed }}>
              {chainResult.is_intact ? "CHAIN INTACT" : "CHAIN BROKEN"}
            </div>
            <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>
              {chainResult.total_events} events verified
              {chainResult.first_broken_at && ` · First break at: ${chainResult.first_broken_at}`}
              {chainResult.message && ` · ${chainResult.message}`}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <input
          value={filterEventType}
          onChange={(e) => setFilterEventType(e.target.value)}
          placeholder="Filter by event type..."
          list="event-types"
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            color: S.textPrimary,
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 5,
            padding: "7px 12px",
            outline: "none",
            width: 200,
          }}
        />
        <datalist id="event-types">
          {eventTypes.map((et) => <option key={et} value={et} />)}
        </datalist>
        <input
          value={filterActor}
          onChange={(e) => setFilterActor(e.target.value)}
          placeholder="Filter by actor..."
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            color: S.textPrimary,
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 5,
            padding: "7px 12px",
            outline: "none",
            width: 180,
          }}
        />
        <input
          type="date"
          value={filterDateFrom}
          onChange={(e) => setFilterDateFrom(e.target.value)}
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            color: S.textPrimary,
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 5,
            padding: "7px 12px",
            outline: "none",
          }}
        />
        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.textTertiary, alignSelf: "center" }}>to</span>
        <input
          type="date"
          value={filterDateTo}
          onChange={(e) => setFilterDateTo(e.target.value)}
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            color: S.textPrimary,
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 5,
            padding: "7px 12px",
            outline: "none",
          }}
        />
        {(filterEventType || filterActor || filterDateFrom || filterDateTo) && (
          <button
            onClick={() => { setFilterEventType(""); setFilterActor(""); setFilterDateFrom(""); setFilterDateTo(""); }}
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              fontWeight: 700,
              color: S.textTertiary,
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 5,
              padding: "7px 12px",
              cursor: "pointer",
            }}
          >
            CLEAR
          </button>
        )}
        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary, alignSelf: "center", marginLeft: "auto" }}>
          {filtered.length} / {events.length} events
        </span>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "10px 16px", background: "#FEF2F2", border: `1px solid ${S.accentRed}`, borderRadius: 5, fontFamily: S.fontMono, fontSize: 12, color: S.accentRed, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Table */}
      <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", fontFamily: S.fontMono, fontSize: 12, color: S.textTertiary }}>
            Loading audit events...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", fontFamily: S.fontMono, fontSize: 12, color: S.textTertiary }}>
            No events match current filters.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr style={{ background: S.bgSub, borderBottom: `1px solid ${S.rim}` }}>
                  {["TIMESTAMP", "EVENT TYPE", "ACTOR", "ENTITY", "DESCRIPTION", "HASH"].map((h) => (
                    <th
                      key={h}
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.07em",
                        color: S.textTertiary,
                        padding: "10px 14px",
                        textAlign: "left",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((evt) => (
                  <tr key={evt.id} style={{ borderBottom: `1px solid ${S.rim}` }}>
                    <td style={{ padding: "9px 14px", fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary, whiteSpace: "nowrap" }}>
                      {new Date(evt.created_at).toLocaleString()}
                    </td>
                    <td style={{ padding: "9px 14px" }}>
                      <span
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.05em",
                          color: S.accentCyan,
                          background: "#EFF6FF",
                          padding: "2px 7px",
                          borderRadius: 3,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {evt.event_type}
                      </span>
                    </td>
                    <td style={{ padding: "9px 14px", fontFamily: S.fontMono, fontSize: 11, color: S.textSecondary, whiteSpace: "nowrap" }}>
                      {evt.actor_email ?? "—"}
                    </td>
                    <td style={{ padding: "9px 14px", fontFamily: S.fontMono, fontSize: 11, color: S.textSecondary, whiteSpace: "nowrap" }}>
                      {evt.entity_type ?? "—"}
                    </td>
                    <td style={{ padding: "9px 14px", fontFamily: S.fontMono, fontSize: 11, color: S.textSecondary, maxWidth: 280 }}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {evt.description ?? "—"}
                      </span>
                    </td>
                    <td style={{ padding: "9px 14px", fontFamily: S.fontMono, fontSize: 10, color: S.textTertiary, whiteSpace: "nowrap" }}>
                      {evt.hash ? `${evt.hash.slice(0, 8)}...` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
