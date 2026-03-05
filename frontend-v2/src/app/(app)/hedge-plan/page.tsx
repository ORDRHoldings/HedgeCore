"use client";

import { Suspense, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth/store";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import type {
  Position,
  PaginatedResponse,
  DecisionRun,
  DecisionProposal,
  DecisionAction,
} from "@/types/api";

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
  statusPending: "var(--status-pending,#94A3B8)",
  textPrimary: "var(--text-primary,#0F172A)",
  textSecondary: "var(--text-secondary,#334155)",
  textTertiary: "var(--text-tertiary,#94A3B8)",
} as const;

function fmtUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtPct(n: number) {
  return `${(n * 100).toFixed(2)}%`;
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Action badge ──────────────────────────────────────────────────────────────

const ACTION_CFG: Record<DecisionAction, { bg: string; color: string; label: string }> = {
  HEDGE_IMMEDIATE: { bg: "#FEE2E2", color: "#DC2626", label: "HEDGE IMMEDIATE" },
  HEDGE_STAGED: { bg: "#FEF3C7", color: "#D97706", label: "HEDGE STAGED" },
  REDUCE_RATIO: { bg: "#EFF6FF", color: "#1C62F2", label: "REDUCE RATIO" },
  NO_ACTION: { bg: "#F1F5F9", color: "#94A3B8", label: "NO ACTION" },
};

function ActionBadge({ action }: { action: DecisionAction }) {
  const cfg = ACTION_CFG[action] ?? ACTION_CFG.NO_ACTION;
  return (
    <span
      style={{
        fontFamily: S.fontMono,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.07em",
        padding: "3px 10px",
        borderRadius: 4,
        background: cfg.bg,
        color: cfg.color,
      }}
    >
      {cfg.label}
    </span>
  );
}

// ── Proposal Card ─────────────────────────────────────────────────────────────

function ProposalCard({ proposal }: { proposal: DecisionProposal }) {
  const [copied, setCopied] = useState(false);

  const handleCopyIbkr = () => {
    const payload = JSON.stringify(
      {
        proposal_id: proposal.proposal_id,
        currency_pair: proposal.currency_pair,
        instrument: proposal.instrument,
        side: proposal.side,
        notional_usd: proposal.notional_usd,
        action: proposal.action,
      },
      null,
      2,
    );
    navigator.clipboard.writeText(payload).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      style={{
        background: S.bgPanel,
        border: `1px solid ${S.rim}`,
        borderRadius: 8,
        overflow: "hidden",
        marginBottom: 12,
      }}
    >
      {/* Card header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px",
          borderBottom: `1px solid ${S.rim}`,
          background: S.bgSub,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 15,
              fontWeight: 800,
              color: S.textPrimary,
              letterSpacing: "0.02em",
            }}
          >
            {proposal.currency_pair}
          </span>
          <ActionBadge action={proposal.action} />
        </div>
        <button
          type="button"
          onClick={handleCopyIbkr}
          style={{
            fontFamily: S.fontMono,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.07em",
            background: copied ? "#D1FAE5" : S.bgPanel,
            color: copied ? "#059669" : S.textSecondary,
            border: `1px solid ${copied ? "#059669" : S.rim}`,
            borderRadius: 4,
            padding: "5px 12px",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          {copied ? "COPIED!" : "COPY IBKR PAYLOAD"}
        </button>
      </div>

      {/* Card body */}
      <div style={{ padding: "16px 18px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
            marginBottom: proposal.staged_schedule ? 16 : 0,
          }}
        >
          {[
            { label: "Instrument", value: proposal.instrument },
            { label: "Side", value: proposal.side },
            { label: "Notional USD", value: fmtUSD(proposal.notional_usd) },
            { label: "Est. Cost", value: fmtPct(proposal.cost_pct) },
          ].map((f) => (
            <div key={f.label}>
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: S.textTertiary,
                  marginBottom: 4,
                }}
              >
                {f.label}
              </div>
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 13,
                  fontWeight: 700,
                  color: S.textPrimary,
                }}
              >
                {f.value}
              </div>
            </div>
          ))}
        </div>

        {/* Rationale */}
        {proposal.rationale && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 14px",
              background: S.bgSub,
              borderRadius: 6,
              fontFamily: S.fontUI,
              fontSize: 12,
              color: S.textSecondary,
              lineHeight: 1.5,
            }}
          >
            {proposal.rationale}
          </div>
        )}

        {/* Staged schedule table */}
        {proposal.action === "HEDGE_STAGED" && proposal.staged_schedule && proposal.staged_schedule.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: S.textTertiary,
                marginBottom: 8,
              }}
            >
              Staged Schedule
            </div>
            <div
              style={{
                border: `1px solid ${S.rim}`,
                borderRadius: 6,
                overflow: "hidden",
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  background: S.bgSub,
                  borderBottom: `1px solid ${S.rim}`,
                }}
              >
                {["Tenor (days)", "Notional USD"].map((h) => (
                  <div
                    key={h}
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: S.textTertiary,
                      padding: "8px 12px",
                    }}
                  >
                    {h}
                  </div>
                ))}
              </div>
              {proposal.staged_schedule.map((row, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    borderBottom:
                      idx < (proposal.staged_schedule?.length ?? 0) - 1
                        ? `1px solid ${S.rim}`
                        : "none",
                  }}
                >
                  <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.textSecondary, padding: "9px 12px" }}>
                    {row.tenor_days}d
                  </div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, color: S.textPrimary, padding: "9px 12px" }}>
                    {fmtUSD(row.notional_usd)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

interface DecisionRunList {
  run_id: string;
  verdict: string;
  proposal_count: number;
  created_at: string;
}

function HedgePlanContent() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [runResult, setRunResult] = useState<DecisionRun | null>(null);
  const [noMarketSnapshot, setNoMarketSnapshot] = useState(false);

  const positionsQ = useQuery<PaginatedResponse<Position>>({
    queryKey: ["positions-ready"],
    queryFn: () =>
      api.get<PaginatedResponse<Position>>("/v1/positions?status=READY_TO_EXECUTE&size=100"),
  });

  const pastRunsQ = useQuery<DecisionRunList[]>({
    queryKey: ["decision-runs-list"],
    queryFn: () => api.get<DecisionRunList[]>("/v1/decisions/runs?limit=5"),
  });

  const positions = positionsQ.data?.items ?? [];

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(positions.map((p) => p.id)));
  const clearAll = () => setSelectedIds(new Set());

  const generateMutation = useMutation({
    mutationFn: () =>
      api.post<DecisionRun>("/v1/decisions/run", {
        position_ids: Array.from(selectedIds),
      }),
    onSuccess: (data) => {
      setRunResult(data);
      setNoMarketSnapshot(false);
    },
    onError: (e: Error) => {
      if (e.message?.includes("NO_MARKET_SNAPSHOT") || e.message?.includes("market")) {
        setNoMarketSnapshot(true);
      }
    },
  });

  const totalHedgeNotional = runResult
    ? runResult.proposals.reduce((acc, p) => acc + p.notional_usd, 0)
    : 0;

  const totalCost = runResult
    ? runResult.proposals.reduce((acc, p) => acc + p.notional_usd * p.cost_pct, 0)
    : 0;

  const residualExposure = runResult
    ? runResult.proposals
        .filter((p) => p.action === "NO_ACTION")
        .reduce((acc, p) => acc + p.net_usd, 0)
    : 0;

  return (
    <div>
      <PageHeader
        label="DECISION DESK"
        title="Hedge Plan"
        subtitle="Select READY positions and generate hedge recommendations"
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 3fr",
          gap: 20,
          alignItems: "flex-start",
        }}
      >
        {/* ── LEFT: Position selector ───────────────────────────────────── */}
        <div>
          <div
            style={{
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: "14px 18px",
                borderBottom: `1px solid ${S.rim}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: S.bgSub,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: S.fontHeading,
                    fontSize: 14,
                    fontWeight: 700,
                    color: S.textPrimary,
                  }}
                >
                  Ready Positions
                </div>
                <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary, marginTop: 2 }}>
                  {positions.length} available · {selectedIds.size} selected
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={selectAll}
                  disabled={positions.length === 0}
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    background: "none",
                    border: `1px solid ${S.rim}`,
                    borderRadius: 4,
                    padding: "5px 10px",
                    cursor: positions.length === 0 ? "not-allowed" : "pointer",
                    color: S.textSecondary,
                  }}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    background: "none",
                    border: `1px solid ${S.rim}`,
                    borderRadius: 4,
                    padding: "5px 10px",
                    cursor: "pointer",
                    color: S.textSecondary,
                  }}
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Position list */}
            {positionsQ.isLoading ? (
              <div style={{ padding: "24px", textAlign: "center", fontFamily: S.fontMono, fontSize: 12, color: S.textTertiary }}>
                Loading positions…
              </div>
            ) : positions.length === 0 ? (
              <div style={{ padding: "32px 20px", textAlign: "center" }}>
                <div style={{ fontFamily: S.fontHeading, fontSize: 14, fontWeight: 700, color: S.textPrimary, marginBottom: 8 }}>
                  No ready positions
                </div>
                <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.textSecondary, marginBottom: 16 }}>
                  Mark positions as READY_TO_EXECUTE from the Exposures desk.
                </div>
                <Link
                  href="/exposures"
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    color: S.accentCyan,
                    textDecoration: "none",
                  }}
                >
                  Go to Exposures →
                </Link>
              </div>
            ) : (
              <div>
                {positions.map((pos, i) => {
                  const checked = selectedIds.has(pos.id);
                  return (
                    <div
                      key={pos.id}
                      onClick={() => toggleSelect(pos.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 18px",
                        borderBottom: i < positions.length - 1 ? `1px solid ${S.rim}` : "none",
                        cursor: "pointer",
                        background: checked ? "#EFF6FF" : "transparent",
                        transition: "background 0.1s",
                      }}
                    >
                      {/* Checkbox */}
                      <div
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 4,
                          border: checked ? "none" : `2px solid ${S.soft}`,
                          background: checked ? S.accentCyan : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          transition: "all 0.15s",
                        }}
                      >
                        {checked && (
                          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                            <path d="M1 3.5L3 5.5L8 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                          <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.textPrimary }}>
                            {pos.currency}
                          </span>
                          <span
                            style={{
                              fontFamily: S.fontMono,
                              fontSize: 10,
                              fontWeight: 700,
                              color: pos.flow_type === "AR" ? S.statusPass : S.accentAmber,
                            }}
                          >
                            {pos.flow_type}
                          </span>
                        </div>
                        <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>
                          {pos.amount_usd != null ? fmtUSD(pos.amount_usd) : `${pos.amount.toLocaleString()} ${pos.currency}`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Generate button */}
          <button
            type="button"
            onClick={() => generateMutation.mutate()}
            disabled={selectedIds.size === 0 || generateMutation.isPending}
            style={{
              fontFamily: S.fontMono,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.06em",
              background:
                selectedIds.size === 0 || generateMutation.isPending
                  ? S.textTertiary
                  : S.accentCyan,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "14px 24px",
              cursor:
                selectedIds.size === 0 || generateMutation.isPending
                  ? "not-allowed"
                  : "pointer",
              width: "100%",
              marginTop: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}
          >
            {generateMutation.isPending ? (
              <>
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "#fff",
                    display: "inline-block",
                    animation: "spin 0.7s linear infinite",
                  }}
                />
                Analyzing exposures…
              </>
            ) : (
              `Generate Hedge Plan${selectedIds.size > 0 ? ` (${selectedIds.size})` : ""} →`
            )}
          </button>
        </div>

        {/* ── RIGHT: Results ──────────────────────────────────────────────── */}
        <div>
          {/* No market snapshot warning */}
          {noMarketSnapshot && (
            <div
              style={{
                background: "#FEF3C7",
                border: `1px solid #FCD34D`,
                borderRadius: 8,
                padding: "16px 20px",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  fontWeight: 700,
                  color: S.accentAmber,
                  marginBottom: 6,
                }}
              >
                NO_MARKET_SNAPSHOT
              </div>
              <div style={{ fontFamily: S.fontUI, fontSize: 13, color: "#92400E" }}>
                No FX market snapshot is available for this tenant. Ask your administrator to load
                current market rates before generating a hedge plan. Market data can be loaded via
                the connectors API or the admin panel.
              </div>
            </div>
          )}

          {/* Error state (non-market) */}
          {generateMutation.isError && !noMarketSnapshot && (
            <div
              style={{
                background: "#FEE2E2",
                border: `1px solid ${S.accentRed}`,
                borderRadius: 8,
                padding: "14px 18px",
                marginBottom: 16,
                fontFamily: S.fontUI,
                fontSize: 13,
                color: S.accentRed,
              }}
            >
              {(generateMutation.error as Error)?.message ?? "Failed to generate hedge plan."}
            </div>
          )}

          {/* Empty state */}
          {!runResult && !generateMutation.isPending && !noMarketSnapshot && (
            <div
              style={{
                background: S.bgPanel,
                border: `1px dashed ${S.soft}`,
                borderRadius: 8,
                padding: "60px 40px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  background: S.bgSub,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 16px",
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={S.textTertiary} strokeWidth="1.8">
                  <path d="M3 3h18v4H3zM3 10h18v4H3zM3 17h18v4H3z" />
                </svg>
              </div>
              <div
                style={{
                  fontFamily: S.fontHeading,
                  fontSize: 16,
                  fontWeight: 700,
                  color: S.textPrimary,
                  marginBottom: 8,
                }}
              >
                No hedge plan generated
              </div>
              <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.textSecondary }}>
                Select positions on the left and click{" "}
                <span style={{ fontWeight: 600 }}>Generate →</span>
              </div>
            </div>
          )}

          {/* Loading spinner */}
          {generateMutation.isPending && (
            <div
              style={{
                background: S.bgPanel,
                border: `1px solid ${S.rim}`,
                borderRadius: 8,
                padding: "60px 40px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  border: `3px solid ${S.rim}`,
                  borderTopColor: S.accentCyan,
                  margin: "0 auto 16px",
                  animation: "spin 0.7s linear infinite",
                }}
              />
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 13,
                  fontWeight: 600,
                  color: S.textSecondary,
                }}
              >
                Analyzing exposures…
              </div>
            </div>
          )}

          {/* Results */}
          {runResult && !generateMutation.isPending && (
            <div>
              {/* Summary bar */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 12,
                  marginBottom: 20,
                }}
              >
                {[
                  { label: "Total Hedge Notional", value: fmtUSD(totalHedgeNotional) },
                  { label: "Estimated Cost", value: fmtUSD(totalCost) },
                  {
                    label: "Residual Exposure",
                    value: fmtUSD(residualExposure),
                    accent: residualExposure > 0 ? S.accentAmber : S.statusPass,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      background: S.bgPanel,
                      border: `1px solid ${S.rim}`,
                      borderRadius: 8,
                      padding: "14px 18px",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: S.textTertiary,
                        marginBottom: 5,
                      }}
                    >
                      {item.label}
                    </div>
                    <div
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 18,
                        fontWeight: 700,
                        color: (item as { accent?: string }).accent ?? S.textPrimary,
                      }}
                    >
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* Verdict */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: 16,
                  padding: "10px 16px",
                  background: S.bgSub,
                  borderRadius: 6,
                }}
              >
                <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Verdict
                </span>
                <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.textPrimary }}>
                  {runResult.verdict}
                </span>
                <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary, marginLeft: "auto" }}>
                  Run {runResult.run_id.slice(0, 16)}…
                </span>
              </div>

              {/* Proposal cards */}
              {runResult.proposals.map((proposal) => (
                <ProposalCard key={proposal.proposal_id} proposal={proposal} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Past Runs ──────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 32 }}>
        <div
          style={{
            fontFamily: S.fontMono,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: S.textTertiary,
            marginBottom: 12,
          }}
        >
          Past Runs
        </div>

        {pastRunsQ.isLoading ? (
          <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.textTertiary }}>
            Loading…
          </div>
        ) : !pastRunsQ.data || pastRunsQ.data.length === 0 ? (
          <div
            style={{
              background: S.bgPanel,
              border: `1px dashed ${S.soft}`,
              borderRadius: 8,
              padding: "20px 24px",
              fontFamily: S.fontUI,
              fontSize: 13,
              color: S.textTertiary,
              textAlign: "center",
            }}
          >
            No past runs yet.
          </div>
        ) : (
          <div
            style={{
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {pastRunsQ.data.map((run, i) => (
              <Link
                key={run.run_id}
                href={`/hedge-plan/runs/${run.run_id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 18px",
                  borderBottom:
                    i < (pastRunsQ.data?.length ?? 0) - 1
                      ? `1px solid ${S.rim}`
                      : "none",
                  textDecoration: "none",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = S.bgSub)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 12,
                      fontWeight: 600,
                      color: S.accentCyan,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      marginBottom: 2,
                    }}
                  >
                    {run.run_id.slice(0, 22)}…
                  </div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>
                    {fmtDate(run.created_at)}
                    {" · "}
                    {run.proposal_count} proposal{run.proposal_count !== 1 ? "s" : ""}
                  </div>
                </div>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, color: S.textSecondary }}>
                  {run.verdict}
                </div>
                <span style={{ color: S.textTertiary, fontSize: 14 }}>›</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default function HedgePlanPage() {
  return (
    <Suspense fallback={null}>
      <HedgePlanContent />
    </Suspense>
  );
}
