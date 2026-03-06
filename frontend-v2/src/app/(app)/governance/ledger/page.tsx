"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/store";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import TierGateClient from "@/components/tier/TierGateClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontHeading: "var(--font-heading,'Manrope',sans-serif)",
  bgSub: "var(--bg-sub,#F1F5F9)",
  bgPanel: "var(--bg-panel,#FFFFFF)",
  rim: "var(--border-rim,#E2E8F0)",
  soft: "var(--border-soft,#CBD5E1)",
  accentCyan: "var(--accent-cyan,#1C62F2)",
  accentAmber: "var(--accent-amber,#D97706)",
  statusPass: "var(--status-pass,#059669)",
  textPrimary: "var(--text-primary,#0F172A)",
  textSecondary: "var(--text-secondary,#334155)",
  textTertiary: "var(--text-tertiary,#94A3B8)",
} as const;

interface LedgerEntry {
  id: string;
  position_id: string;
  execution_ref: string | null;
  proposal_payload: Record<string, unknown>;
  authorized_by_email: string | null;
  created_by_email: string;
  committed_at: string;
  status: string;
}

function fmtDateTime(s: string) {
  return new Date(s).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fmtUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string }> = {
    EXECUTED: { bg: "#D1FAE5", color: "#059669" },
    COMMITTED: { bg: "#EFF6FF", color: "#1C62F2" },
    REJECTED: { bg: "#FEF2F2", color: "#DC2626" },
  };
  const c = cfg[status] ?? { bg: "#F1F5F9", color: "#64748B" };
  return (
    <span
      style={{
        fontFamily: S.fontMono,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.06em",
        background: c.bg,
        color: c.color,
        padding: "2px 8px",
        borderRadius: 3,
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}

function LedgerContent() {
  const { token } = useAuthStore();

  const ledgerQ = useQuery<{ entries: LedgerEntry[]; total: number }>({
    queryKey: ["ledger"],
    queryFn: () => api.get<{ entries: LedgerEntry[]; total: number }>("/v1/pipeline/ledger"),
    enabled: !!token,
  });

  const entries: LedgerEntry[] = ledgerQ.data?.entries ?? [];

  return (
    <div style={{ fontFamily: S.fontUI }}>
      <PageHeader
        label="GOVERNANCE / PIPELINE"
        title="Ledger"
        subtitle="Finalized and committed hedge entries — read-only"
        badge={
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.1em",
              background: "#D1FAE5",
              color: S.statusPass,
              border: "1px solid #6EE7B7",
              padding: "3px 8px",
              borderRadius: 3,
            }}
          >
            READ-ONLY
          </span>
        }
      />

      {/* WORM notice */}
      <div
        style={{
          background: "#F0FDF4",
          border: "1px solid #BBF7D0",
          borderRadius: 8,
          padding: "12px 18px",
          marginBottom: 20,
          fontFamily: S.fontUI,
          fontSize: 13,
          color: "#166534",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 16, flexShrink: 0 }}>🔒</span>
        <span>
          <strong>WORM Ledger:</strong> Entries are write-once and cannot be modified or deleted.
          This log constitutes the authoritative hedge execution record.
        </span>
      </div>

      {ledgerQ.isLoading && (
        <div
          style={{
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 10,
            padding: "40px",
            textAlign: "center",
            color: S.textTertiary,
            fontFamily: S.fontMono,
            fontSize: 12,
          }}
        >
          Loading ledger…
        </div>
      )}

      {!ledgerQ.isLoading && entries.length === 0 && (
        <div
          style={{
            background: S.bgPanel,
            border: `1px dashed ${S.soft}`,
            borderRadius: 10,
            padding: "48px 40px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>📒</div>
          <div
            style={{
              fontFamily: S.fontHeading,
              fontWeight: 700,
              fontSize: 16,
              color: S.textPrimary,
              marginBottom: 6,
            }}
          >
            Ledger is empty
          </div>
          <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.textSecondary }}>
            Executed and authorized proposals will appear here after committing to the ledger.
          </div>
        </div>
      )}

      {entries.length > 0 && (
        <div
          style={{
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
              <thead>
                <tr style={{ background: S.bgSub }}>
                  {["Entry ID", "Position", "Currency", "Amount", "Maker", "Authorizer", "Committed At", "Status"].map((h) => (
                    <th
                      key={h}
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        color: S.textTertiary,
                        textTransform: "uppercase",
                        textAlign: h === "Amount" ? "right" : "left",
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
                {entries.map((entry, i) => {
                  const hedgeAmount = entry.proposal_payload?.hedge_amount as number | undefined;
                  const currency = entry.proposal_payload?.currency as string | undefined;
                  return (
                    <tr
                      key={entry.id}
                      style={{ borderBottom: i < entries.length - 1 ? `1px solid ${S.rim}` : "none" }}
                    >
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.accentCyan }}>
                          {entry.id.slice(0, 14)}…
                        </span>
                        {entry.execution_ref && (
                          <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.textTertiary, marginTop: 2 }}>
                            ref: {entry.execution_ref.slice(0, 12)}…
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textSecondary }}>
                          {entry.position_id.slice(0, 12)}…
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.textPrimary }}>
                          {currency ?? "—"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.textPrimary }}>
                          {hedgeAmount != null ? fmtUSD(hedgeAmount) : "—"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.textSecondary }}>
                          {entry.created_by_email}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.textSecondary }}>
                          {entry.authorized_by_email ?? (
                            <span style={{ color: S.textTertiary }}>—</span>
                          )}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>
                          {fmtDateTime(entry.committed_at)}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <StatusBadge status={entry.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div
            style={{
              padding: "12px 20px",
              borderTop: `1px solid ${S.rim}`,
              display: "flex",
              alignItems: "center",
              gap: 16,
              background: S.bgSub,
            }}
          >
            <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>
              {entries.length} ledger entr{entries.length !== 1 ? "ies" : "y"}
            </span>
            <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>
              Total: {fmtUSD(
                entries.reduce((sum, e) => sum + ((e.proposal_payload?.hedge_amount as number) ?? 0), 0)
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LedgerPage() {
  return (
    <TierGateClient requiredTier="enterprise" featureName="governance">
      <LedgerContent />
    </TierGateClient>
  );
}
