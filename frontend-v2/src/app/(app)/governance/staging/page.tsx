"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  accentRed: "var(--accent-red,#DC2626)",
  statusPass: "var(--status-pass,#059669)",
  textPrimary: "var(--text-primary,#0F172A)",
  textSecondary: "var(--text-secondary,#334155)",
  textTertiary: "var(--text-tertiary,#94A3B8)",
} as const;

interface StagingItem {
  id: string;
  position_id: string;
  created_by_email: string;
  proposal_payload: Record<string, unknown>;
  created_at: string;
  status: string;
}

function fmtDateTime(s: string) {
  return new Date(s).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fmtUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function StagingContent() {
  const { token } = useAuthStore();
  const qc = useQueryClient();

  const stagingQ = useQuery<StagingItem[]>({
    queryKey: ["staging-queue"],
    queryFn: () => api.get<StagingItem[]>("/v1/pipeline/staging"),
    enabled: !!token,
    refetchInterval: 30_000,
  });

  const authorizeMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/v1/pipeline/staging/authorize`, { proposal_id: id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staging-queue"] });
    },
  });

  const items: StagingItem[] = stagingQ.data ?? [];

  return (
    <div style={{ fontFamily: S.fontUI }}>
      <PageHeader
        label="GOVERNANCE / PIPELINE"
        title="Staging Queue"
        subtitle="Proposals awaiting 4-eyes authorization before ledger commit"
        badge={
          items.length > 0 ? (
            <span
              style={{
                fontFamily: S.fontMono,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.06em",
                background: "#FEF3C7",
                color: S.accentAmber,
                border: "1px solid #FCD34D",
                padding: "3px 8px",
                borderRadius: 3,
              }}
            >
              {items.length} PENDING
            </span>
          ) : undefined
        }
      />

      {/* SoD notice */}
      <div
        style={{
          background: "#EFF6FF",
          border: "1px solid #BFDBFE",
          borderRadius: 8,
          padding: "12px 18px",
          marginBottom: 20,
          fontFamily: S.fontUI,
          fontSize: 13,
          color: "#1E40AF",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span style={{ fontSize: 16, flexShrink: 0 }}>ℹ️</span>
        <span>
          <strong>Segregation of Duties:</strong> Proposals cannot be authorized by their maker.
          A second approver with sufficient permissions must authorize each item.
        </span>
      </div>

      {stagingQ.isLoading && (
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
          Loading staging queue…
        </div>
      )}

      {!stagingQ.isLoading && items.length === 0 && (
        <div
          style={{
            background: S.bgPanel,
            border: `1px dashed ${S.soft}`,
            borderRadius: 10,
            padding: "48px 40px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
          <div
            style={{
              fontFamily: S.fontHeading,
              fontWeight: 700,
              fontSize: 16,
              color: S.statusPass,
              marginBottom: 6,
            }}
          >
            Staging queue is empty
          </div>
          <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.textSecondary }}>
            No proposals are currently awaiting authorization.
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div
          style={{
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead>
                <tr style={{ background: S.bgSub }}>
                  {["Proposal ID", "Position", "Maker", "Amount", "Created", "Action"].map((h) => (
                    <th
                      key={h}
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        color: S.textTertiary,
                        textTransform: "uppercase",
                        textAlign: h === "Amount" || h === "Action" ? "right" : "left",
                        padding: "10px 18px",
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
                {items.map((item, i) => {
                  const hedgeAmount = item.proposal_payload?.hedge_amount as number | undefined;
                  const currency = item.proposal_payload?.currency as string | undefined;
                  return (
                    <tr
                      key={item.id}
                      style={{ borderBottom: i < items.length - 1 ? `1px solid ${S.rim}` : "none" }}
                    >
                      <td style={{ padding: "13px 18px" }}>
                        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.accentCyan }}>
                          {item.id.slice(0, 16)}…
                        </span>
                      </td>
                      <td style={{ padding: "13px 18px" }}>
                        <div>
                          <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.textPrimary }}>
                            {currency ?? "—"}
                          </div>
                          <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.textTertiary, marginTop: 2 }}>
                            {item.position_id.slice(0, 14)}…
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "13px 18px" }}>
                        <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.textSecondary }}>
                          {item.created_by_email}
                        </span>
                      </td>
                      <td style={{ padding: "13px 18px", textAlign: "right" }}>
                        <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.textPrimary }}>
                          {hedgeAmount != null ? fmtUSD(hedgeAmount) : "—"}
                        </span>
                      </td>
                      <td style={{ padding: "13px 18px", whiteSpace: "nowrap" }}>
                        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>
                          {fmtDateTime(item.created_at)}
                        </span>
                      </td>
                      <td style={{ padding: "13px 18px", textAlign: "right" }}>
                        <button
                          onClick={() => authorizeMutation.mutate(item.id)}
                          disabled={authorizeMutation.isPending && authorizeMutation.variables === item.id}
                          style={{
                            fontFamily: S.fontMono,
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: "0.05em",
                            background: S.statusPass,
                            color: "#fff",
                            border: "none",
                            padding: "7px 16px",
                            borderRadius: 5,
                            cursor: authorizeMutation.isPending ? "not-allowed" : "pointer",
                            opacity: authorizeMutation.isPending && authorizeMutation.variables === item.id ? 0.6 : 1,
                            whiteSpace: "nowrap",
                          }}
                        >
                          Authorize
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {authorizeMutation.isError && (
        <div
          style={{
            marginTop: 12,
            background: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: 6,
            padding: "10px 16px",
            fontFamily: S.fontUI,
            fontSize: 13,
            color: S.accentRed,
          }}
        >
          {(authorizeMutation.error as Error)?.message ?? "Authorization failed."}
        </div>
      )}
    </div>
  );
}

export default function StagingPage() {
  return (
    <TierGateClient requiredTier="enterprise" featureName="governance">
      <StagingContent />
    </TierGateClient>
  );
}
