"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/store";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import TierGateClient from "@/components/tier/TierGateClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontHeading: "var(--font-heading,'Manrope',sans-serif)",
  bgDeep: "var(--bg-deep,#F8FAFC)",
  bgSub: "var(--bg-sub,#F1F5F9)",
  bgPanel: "var(--bg-panel,#FFFFFF)",
  rim: "var(--border-rim,#E2E8F0)",
  soft: "var(--border-soft,#CBD5E1)",
  accentCyan: "var(--accent-cyan,#1C62F2)",
  accentAmber: "var(--accent-amber,#D97706)",
  accentRed: "var(--accent-red,#DC2626)",
  statusPass: "var(--status-pass,#059669)",
  textPrimary: "var(--text-primary,#0F172A)",
  textSecondary: "var(--text-secondary,#334155)",
  textTertiary: "var(--text-tertiary,#94A3B8)",
} as const;

interface AuditEvent {
  id: string;
  event_type: string;
  actor_email: string | null;
  entity_type: string | null;
  entity_id: string | null;
  description: string | null;
  event_hash: string;
  created_at: string;
}

interface ChainVerifyResult {
  is_intact: boolean;
  chain_length: number;
  first_hash: string | null;
  last_hash: string | null;
  broken_at: number | null;
}

function fmtDateTime(s: string) {
  return new Date(s).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function truncHash(h: string, n = 12) {
  return h ? `${h.slice(0, n)}…` : "—";
}

function AuditTrailContent() {
  const { token } = useAuthStore();
  const [verifyResult, setVerifyResult] = useState<ChainVerifyResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [filterType, setFilterType] = useState("");
  const [filterActor, setFilterActor] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const eventsQ = useQuery<AuditEvent[]>({
    queryKey: ["audit-events"],
    queryFn: () => api.get<AuditEvent[]>("/v1/audit?limit=100"),
    enabled: !!token,
  });

  const events: AuditEvent[] = eventsQ.data ?? [];

  const eventTypes = useMemo(
    () => [...new Set(events.map((e) => e.event_type))].sort(),
    [events]
  );

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (filterType && e.event_type !== filterType) return false;
      if (filterActor && !(e.actor_email ?? "").toLowerCase().includes(filterActor.toLowerCase())) return false;
      if (filterDateFrom && new Date(e.created_at) < new Date(filterDateFrom)) return false;
      if (filterDateTo && new Date(e.created_at) > new Date(filterDateTo + "T23:59:59")) return false;
      return true;
    });
  }, [events, filterType, filterActor, filterDateFrom, filterDateTo]);

  const handleVerifyChain = async () => {
    setIsVerifying(true);
    setVerifyResult(null);
    try {
      const result = await api.get<ChainVerifyResult>("/v1/audit/chain/verify");
      setVerifyResult(result);
    } catch (e: unknown) {
      setVerifyResult({
        is_intact: false,
        chain_length: 0,
        first_hash: null,
        last_hash: null,
        broken_at: null,
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleExport = () => {
    const json = JSON.stringify(filtered, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setFilterType("");
    setFilterActor("");
    setFilterDateFrom("");
    setFilterDateTo("");
  };

  const headerAction = (
    <div style={{ display: "flex", gap: 10 }}>
      <button
        onClick={handleVerifyChain}
        disabled={isVerifying}
        style={{
          fontFamily: S.fontMono,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.05em",
          background: "transparent",
          border: `1px solid ${S.soft}`,
          color: S.textSecondary,
          padding: "8px 16px",
          borderRadius: 6,
          cursor: isVerifying ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          opacity: isVerifying ? 0.6 : 1,
        }}
      >
        {isVerifying ? (
          <span
            style={{
              width: 12,
              height: 12,
              border: "2px solid var(--border-soft)",
              borderTopColor: S.accentCyan,
              borderRadius: "50%",
              display: "inline-block",
              animation: "spin 0.7s linear infinite",
            }}
          />
        ) : (
          <span style={{ fontSize: 13 }}>🔗</span>
        )}
        Verify Chain Integrity
      </button>
      <button
        onClick={handleExport}
        style={{
          fontFamily: S.fontMono,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.05em",
          background: S.accentCyan,
          color: "#fff",
          border: "none",
          padding: "8px 16px",
          borderRadius: 6,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        Export Full Log ↓
      </button>
    </div>
  );

  return (
    <div style={{ fontFamily: S.fontUI }}>
      <PageHeader
        label="GOVERNANCE"
        title="Audit Trail"
        subtitle="Tamper-evident SHA-256 hash-chained event log"
        action={headerAction}
      />

      {/* Chain verify banner */}
      {verifyResult && (
        <div
          style={{
            background: verifyResult.is_intact ? "#D1FAE5" : "#FEF2F2",
            border: `1px solid ${verifyResult.is_intact ? "#6EE7B7" : "#FECACA"}`,
            borderRadius: 8,
            padding: "14px 20px",
            marginBottom: 20,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>
              {verifyResult.is_intact ? "✅" : "⚠️"}
            </span>
            <div>
              <div
                style={{
                  fontFamily: S.fontHeading,
                  fontSize: 15,
                  fontWeight: 700,
                  color: verifyResult.is_intact ? S.statusPass : S.accentRed,
                  marginBottom: 4,
                }}
              >
                Chain is {verifyResult.is_intact ? "intact" : "BROKEN"}
              </div>
              <div style={{ fontFamily: S.fontMono, fontSize: 11, color: verifyResult.is_intact ? "#047857" : "#991B1B" }}>
                {verifyResult.chain_length} events verified
                {verifyResult.broken_at != null && ` · Break detected at event #${verifyResult.broken_at}`}
                {verifyResult.last_hash && ` · Latest hash: ${truncHash(verifyResult.last_hash, 16)}`}
              </div>
            </div>
          </div>
          <button
            onClick={() => setVerifyResult(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", opacity: 0.5, fontSize: 18, padding: "0 2px", flexShrink: 0 }}
          >
            ×
          </button>
        </div>
      )}

      {/* Filter bar */}
      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          borderRadius: 10,
          padding: "14px 20px",
          marginBottom: 16,
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          alignItems: "center",
        }}
      >
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            color: filterType ? S.textPrimary : S.textTertiary,
            background: S.bgSub,
            border: `1px solid ${S.rim}`,
            borderRadius: 5,
            padding: "6px 12px",
            outline: "none",
            cursor: "pointer",
          }}
        >
          <option value="">All event types</option>
          {eventTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <input
          type="text"
          value={filterActor}
          onChange={(e) => setFilterActor(e.target.value)}
          placeholder="Filter by actor…"
          style={{
            fontFamily: S.fontUI,
            fontSize: 12,
            color: S.textPrimary,
            background: S.bgSub,
            border: `1px solid ${S.rim}`,
            borderRadius: 5,
            padding: "6px 12px",
            outline: "none",
            minWidth: 180,
          }}
        />

        <input
          type="date"
          value={filterDateFrom}
          onChange={(e) => setFilterDateFrom(e.target.value)}
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            color: filterDateFrom ? S.textPrimary : S.textTertiary,
            background: S.bgSub,
            border: `1px solid ${S.rim}`,
            borderRadius: 5,
            padding: "6px 12px",
            outline: "none",
          }}
        />
        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>→</span>
        <input
          type="date"
          value={filterDateTo}
          onChange={(e) => setFilterDateTo(e.target.value)}
          style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            color: filterDateTo ? S.textPrimary : S.textTertiary,
            background: S.bgSub,
            border: `1px solid ${S.rim}`,
            borderRadius: 5,
            padding: "6px 12px",
            outline: "none",
          }}
        />

        {(filterType || filterActor || filterDateFrom || filterDateTo) && (
          <button
            onClick={clearFilters}
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              fontWeight: 700,
              background: "none",
              border: `1px solid ${S.soft}`,
              borderRadius: 5,
              padding: "6px 12px",
              cursor: "pointer",
              color: S.textTertiary,
            }}
          >
            Clear
          </button>
        )}

        <div style={{ marginLeft: "auto", fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>
          {filtered.length} / {events.length} events
        </div>
      </div>

      {/* Events table */}
      <div
        style={{
          background: S.bgPanel,
          border: `1px solid ${S.rim}`,
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {eventsQ.isLoading && (
          <div
            style={{
              padding: "40px",
              textAlign: "center",
              color: S.textTertiary,
              fontFamily: S.fontMono,
              fontSize: 12,
            }}
          >
            Loading audit events…
          </div>
        )}

        {!eventsQ.isLoading && filtered.length === 0 && (
          <div
            style={{
              padding: "40px",
              textAlign: "center",
              fontFamily: S.fontUI,
              fontSize: 13,
              color: S.textTertiary,
            }}
          >
            {events.length === 0 ? "No audit events recorded yet." : "No events match the current filters."}
          </div>
        )}

        {filtered.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr style={{ background: S.bgSub }}>
                  {["Timestamp", "Event Type", "Actor", "Entity", "Description", "Hash"].map((h) => (
                    <th
                      key={h}
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        color: S.textTertiary,
                        textTransform: "uppercase",
                        textAlign: "left",
                        padding: "10px 16px",
                        borderBottom: `1px solid ${S.rim}`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, i) => (
                  <tr
                    key={e.id}
                    style={{
                      borderBottom: i < filtered.length - 1 ? `1px solid ${S.rim}` : "none",
                    }}
                  >
                    <td style={{ padding: "11px 16px", whiteSpace: "nowrap" }}>
                      <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>
                        {fmtDateTime(e.created_at)}
                      </span>
                    </td>
                    <td style={{ padding: "11px 16px" }}>
                      <span
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          background: "#EFF6FF",
                          color: S.accentCyan,
                          padding: "2px 8px",
                          borderRadius: 3,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {e.event_type}
                      </span>
                    </td>
                    <td style={{ padding: "11px 16px" }}>
                      <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.textSecondary }}>
                        {e.actor_email ?? "SYSTEM"}
                      </span>
                    </td>
                    <td style={{ padding: "11px 16px" }}>
                      {e.entity_type && (
                        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textSecondary }}>
                          {e.entity_type}
                          {e.entity_id && (
                            <span style={{ color: S.textTertiary }}> / {e.entity_id.slice(0, 8)}…</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "11px 16px", maxWidth: 280 }}>
                      <span
                        style={{
                          fontFamily: S.fontUI,
                          fontSize: 12,
                          color: S.textSecondary,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          display: "block",
                        }}
                      >
                        {e.description ?? "—"}
                      </span>
                    </td>
                    <td style={{ padding: "11px 16px" }}>
                      <span
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 10,
                          color: S.textTertiary,
                          letterSpacing: "0.04em",
                        }}
                        title={e.event_hash}
                      >
                        {truncHash(e.event_hash)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function AuditTrailPage() {
  return (
    <TierGateClient requiredTier="enterprise" featureName="governance">
      <AuditTrailContent />
    </TierGateClient>
  );
}
