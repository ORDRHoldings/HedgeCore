"use client";

import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth/store";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { BlurredPreview } from "@/components/tier/BlurredPreview";
import type { DashboardSummary, DashboardRun, AuditRunSummary } from "@/types/api";

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
  return `${n.toFixed(1)}%`;
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}

function KpiCard({ label, value, sub, accent }: KpiCardProps) {
  return (
    <div
      style={{
        background: S.bgPanel,
        border: `1px solid ${S.rim}`,
        borderRadius: 8,
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          fontFamily: S.fontMono,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: S.textTertiary,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: S.fontMono,
          fontSize: 28,
          fontWeight: 700,
          color: accent ?? S.textPrimary,
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.textTertiary }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Fake KPI grid for blurred preview ─────────────────────────────────────

function FakeKpiGrid() {
  const fakeCards = [
    { label: "Total Exposure (USD)", value: "$2,450,000" },
    { label: "Coverage %", value: "68.4%" },
    { label: "Pending Approvals", value: "3" },
    { label: "Active Alerts", value: "2" },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 16,
        padding: "24px",
        background: S.bgSub,
        borderRadius: 8,
      }}
    >
      {fakeCards.map((c) => (
        <div
          key={c.label}
          style={{
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 8,
            padding: "20px 24px",
          }}
        >
          <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.textTertiary, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            {c.label}
          </div>
          <div style={{ fontFamily: S.fontMono, fontSize: 28, fontWeight: 700, color: S.textPrimary }}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Checklist ─────────────────────────────────────────────────────────────────

const CHECKLIST_ITEMS = [
  { key: "upload_fx", label: "Upload FX transactions" },
  { key: "create_policy", label: "Create a hedge policy" },
  { key: "run_hedge", label: "Run your first hedge plan" },
  { key: "execute_hedge", label: "Execute a hedge" },
];

function GettingStartedChecklist() {
  const getChecked = (key: string): boolean => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(`checklist_${key}`) === "1";
  };

  const toggleItem = (key: string) => {
    const current = getChecked(key);
    if (current) {
      localStorage.removeItem(`checklist_${key}`);
    } else {
      localStorage.setItem(`checklist_${key}`, "1");
    }
    // Force re-render via a tiny trick — not ideal but avoids heavy state for a checklist
    window.location.reload();
  };

  const items = CHECKLIST_ITEMS.map((item) => ({ ...item, checked: getChecked(item.key) }));
  const completedCount = items.filter((i) => i.checked).length;

  return (
    <div
      style={{
        background: S.bgPanel,
        border: `1px solid ${S.rim}`,
        borderRadius: 8,
        padding: "20px 24px",
        marginBottom: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontFamily: S.fontHeading,
            fontSize: 15,
            fontWeight: 700,
            color: S.textPrimary,
          }}
        >
          Getting Started
        </div>
        <div
          style={{
            fontFamily: S.fontMono,
            fontSize: 11,
            color: S.textTertiary,
          }}
        >
          {completedCount}/{items.length} done
        </div>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 4,
          background: S.bgSub,
          borderRadius: 2,
          marginBottom: 16,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${(completedCount / items.length) * 100}%`,
            background: S.accentCyan,
            borderRadius: 2,
            transition: "width 0.3s ease",
          }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((item) => (
          <button
            key={item.key}
            onClick={() => toggleItem(item.key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "6px 0",
              textAlign: "left",
              width: "100%",
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                border: item.checked ? "none" : `2px solid ${S.soft}`,
                background: item.checked ? S.accentCyan : "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "all 0.15s",
              }}
            >
              {item.checked && (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span
              style={{
                fontFamily: S.fontUI,
                fontSize: 13,
                color: item.checked ? S.textTertiary : S.textSecondary,
                textDecoration: item.checked ? "line-through" : "none",
              }}
            >
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Run status badge ───────────────────────────────────────────────────────

function RunBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string }> = {
    COMPLETED: { bg: "#D1FAE5", color: "#059669" },
    RUNNING: { bg: "#FEF3C7", color: "#D97706" },
    FAILED: { bg: "#FEE2E2", color: "#DC2626" },
    PENDING: { bg: "#F1F5F9", color: "#94A3B8" },
  };
  const c = cfg[status] ?? cfg.PENDING;
  return (
    <span
      style={{
        fontFamily: S.fontMono,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.06em",
        padding: "2px 8px",
        borderRadius: 4,
        background: c.bg,
        color: c.color,
      }}
    >
      {status}
    </span>
  );
}

// ── FREE tier dashboard ────────────────────────────────────────────────────

function FreeDashboard() {
  const auditRunQ = useQuery<AuditRunSummary[]>({
    queryKey: ["audit-runs-lite"],
    queryFn: () => api.get<AuditRunSummary[]>("/v1/audit-lab/runs?limit=1"),
  });

  const lastRun = auditRunQ.data?.[0] ?? null;

  return (
    <div>
      <PageHeader
        label="ORDR TERMINAL"
        title="Dashboard"
        subtitle="Free tier — audit lab access included"
      />

      {/* Last run summary or CTA */}
      <div style={{ marginBottom: 24 }}>
        {auditRunQ.isLoading ? (
          <div
            style={{
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 8,
              padding: "24px",
              color: S.textTertiary,
              fontFamily: S.fontMono,
              fontSize: 12,
            }}
          >
            Loading…
          </div>
        ) : lastRun ? (
          <div
            style={{
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 8,
              padding: "20px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  color: S.textTertiary,
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                Last Audit Run
              </div>
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 13,
                  fontWeight: 600,
                  color: S.textPrimary,
                  marginBottom: 4,
                }}
              >
                {lastRun.run_id.slice(0, 20)}…
              </div>
              <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>
                {fmtDate(lastRun.created_at)} · v{lastRun.methodology_version}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <RunBadge status={lastRun.status} />
              <Link
                href={`/audit-lab/runs/${lastRun.run_id}`}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  fontWeight: 700,
                  color: S.accentCyan,
                  textDecoration: "none",
                }}
              >
                View Report →
              </Link>
            </div>
          </div>
        ) : (
          <div
            style={{
              background: S.bgPanel,
              border: `1px dashed ${S.soft}`,
              borderRadius: 8,
              padding: "32px 24px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontFamily: S.fontHeading,
                fontSize: 16,
                fontWeight: 700,
                color: S.textPrimary,
                marginBottom: 8,
              }}
            >
              No audit runs yet
            </div>
            <div
              style={{
                fontFamily: S.fontUI,
                fontSize: 13,
                color: S.textSecondary,
                marginBottom: 20,
              }}
            >
              Upload your FX transaction data to detect hidden markups and fees.
            </div>
            <Link
              href="/audit-lab/upload"
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.06em",
                background: S.accentCyan,
                color: "#fff",
                padding: "10px 20px",
                borderRadius: 6,
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Start your first audit →
            </Link>
          </div>
        )}
      </div>

      {/* Blurred SMB preview */}
      <div style={{ marginBottom: 8 }}>
        <div
          style={{
            fontFamily: S.fontMono,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.1em",
            color: S.textTertiary,
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          SMB Features Preview
        </div>
        <BlurredPreview requiredTier="smb" featureName="exposures">
          <FakeKpiGrid />
        </BlurredPreview>
      </div>
    </div>
  );
}

// ── SMB/PRO dashboard ─────────────────────────────────────────────────────

function SmbDashboard({ isEnterprise }: { isEnterprise: boolean }) {
  const router = useRouter();

  const summaryQ = useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary"],
    queryFn: () => api.get<DashboardSummary>("/v1/dashboard/summary"),
  });

  const runsQ = useQuery<DashboardRun[]>({
    queryKey: ["dashboard-recent-runs"],
    queryFn: () => api.get<DashboardRun[]>("/v1/dashboard/recent-runs"),
  });

  const chainQ = useQuery<{ is_intact: boolean; chain_length: number }>({
    queryKey: ["audit-chain-status"],
    queryFn: () => api.get("/v1/audit/chain/verify"),
    enabled: isEnterprise,
  });

  const summary = summaryQ.data;
  const runs = runsQ.data ?? [];

  return (
    <div>
      <PageHeader
        label="ORDR TERMINAL"
        title="Dashboard"
        subtitle={isEnterprise ? "Enterprise — full governance mode" : "SMB — position & hedge management"}
        action={
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => router.push("/exposures?action=add")}
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.06em",
                background: S.accentCyan,
                color: "#fff",
                border: "none",
                padding: "8px 16px",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              + Add Exposure
            </button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {summaryQ.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                background: S.bgPanel,
                border: `1px solid ${S.rim}`,
                borderRadius: 8,
                padding: "20px 24px",
                height: 92,
                animation: "pulse 1.2s ease infinite",
              }}
            />
          ))
        ) : (
          <>
            <KpiCard
              label="Total Exposure (USD)"
              value={summary ? fmtUSD(summary.exposure_usd) : "—"}
              sub="Net open FX positions"
            />
            <KpiCard
              label="Coverage %"
              value={summary ? fmtPct(summary.coverage_pct) : "—"}
              accent={
                summary
                  ? summary.coverage_pct >= 80
                    ? S.statusPass
                    : summary.coverage_pct >= 50
                    ? S.accentAmber
                    : S.accentRed
                  : undefined
              }
              sub="Hedged / total exposure"
            />
            <KpiCard
              label="Pending Approvals"
              value={summary ? String(summary.pending_proposals) : "—"}
              accent={summary && summary.pending_proposals > 0 ? S.accentAmber : undefined}
              sub="Awaiting checker sign-off"
            />
            <KpiCard
              label="Active Alerts"
              value={summary ? String(summary.alerts_count) : "—"}
              accent={summary && summary.alerts_count > 0 ? S.accentRed : undefined}
              sub="Policy & risk alerts"
            />
          </>
        )}
      </div>

      {/* Enterprise extras */}
      {isEnterprise && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 8,
              padding: "18px 22px",
            }}
          >
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.1em",
                color: S.textTertiary,
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              Hash Chain Integrity
            </div>
            {chainQ.isLoading ? (
              <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.textTertiary }}>Verifying…</div>
            ) : chainQ.data ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: chainQ.data.is_intact ? S.statusPass : S.accentRed,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 14,
                    fontWeight: 700,
                    color: chainQ.data.is_intact ? S.statusPass : S.accentRed,
                  }}
                >
                  {chainQ.data.is_intact ? "INTACT" : "BROKEN"}
                </span>
                <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.textTertiary }}>
                  · {chainQ.data.chain_length.toLocaleString()} events
                </span>
              </div>
            ) : (
              <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.textTertiary }}>Unavailable</div>
            )}
          </div>

          <div
            style={{
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 8,
              padding: "18px 22px",
            }}
          >
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.1em",
                color: S.textTertiary,
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              Governance Queue
            </div>
            <Link
              href="/governance"
              style={{
                fontFamily: S.fontMono,
                fontSize: 13,
                fontWeight: 600,
                color: S.accentCyan,
                textDecoration: "none",
              }}
            >
              View governance queue →
            </Link>
          </div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isEnterprise ? "1fr 320px" : "1fr 300px",
          gap: 20,
          marginBottom: 24,
        }}
      >
        {/* Recent Runs */}
        <div
          style={{
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "16px 20px",
              borderBottom: `1px solid ${S.rim}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                fontFamily: S.fontHeading,
                fontSize: 14,
                fontWeight: 700,
                color: S.textPrimary,
              }}
            >
              Recent Runs
            </div>
            <Link
              href="/hedge-plan"
              style={{
                fontFamily: S.fontMono,
                fontSize: 11,
                color: S.accentCyan,
                textDecoration: "none",
              }}
            >
              View all →
            </Link>
          </div>

          {runsQ.isLoading ? (
            <div style={{ padding: "24px 20px", color: S.textTertiary, fontFamily: S.fontMono, fontSize: 12 }}>
              Loading runs…
            </div>
          ) : runs.length === 0 ? (
            <div
              style={{
                padding: "32px 20px",
                textAlign: "center",
                color: S.textTertiary,
                fontFamily: S.fontUI,
                fontSize: 13,
              }}
            >
              No runs yet. Click "Run Hedge Plan" to get started.
            </div>
          ) : (
            <div>
              {runs.slice(0, 5).map((run, i) => (
                <div
                  key={run.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 20px",
                    borderBottom: i < Math.min(runs.length, 5) - 1 ? `1px solid ${S.rim}` : "none",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        fontWeight: 600,
                        color: S.textPrimary,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {run.id.slice(0, 18)}…
                    </div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary, marginTop: 2 }}>
                      {run.position_count} positions · {fmtDate(run.created_at)}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {run.decision_verdict && (
                      <span
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 10,
                          color: S.textTertiary,
                        }}
                      >
                        {run.decision_verdict}
                      </span>
                    )}
                    <RunBadge status={run.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions + Checklist */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Quick Actions */}
          <div
            style={{
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 8,
              padding: "16px 20px",
            }}
          >
            <div
              style={{
                fontFamily: S.fontHeading,
                fontSize: 14,
                fontWeight: 700,
                color: S.textPrimary,
                marginBottom: 12,
              }}
            >
              Quick Actions
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { label: "+ Add Exposure", href: "/exposures?action=add", primary: true },
                { label: "Run Hedge Plan", href: "/hedge-plan", primary: false },
                { label: "View Audit Trail", href: "/audit-lab", primary: false },
              ].map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  style={{
                    display: "block",
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    color: action.primary ? "#fff" : S.textPrimary,
                    background: action.primary ? S.accentCyan : S.bgSub,
                    border: `1px solid ${action.primary ? S.accentCyan : S.rim}`,
                    padding: "9px 14px",
                    borderRadius: 6,
                    textDecoration: "none",
                    textAlign: "center",
                  }}
                >
                  {action.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Checklist */}
          <GettingStartedChecklist />
        </div>
      </div>

      {/* Locked enterprise banner (SMB only) */}
      {!isEnterprise && (
        <div
          style={{
            background: "#FAFAFA",
            border: `1px solid ${S.rim}`,
            borderRadius: 8,
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.textSecondary }}>
            Enterprise features locked — audit chain, governance queue, scenario studio, portfolio risk analytics.
          </div>
          <Link
            href="/settings?upgrade=true"
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: S.accentCyan,
              textDecoration: "none",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            Upgrade to Enterprise →
          </Link>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function DashboardContent() {
  const { user } = useAuthStore();
  const tier = user?.plan_tier ?? "lite";

  if (tier === "lite") {
    return <FreeDashboard />;
  }

  const isEnterprise = tier === "enterprise";
  return <SmbDashboard isEnterprise={isEnterprise} />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  );
}
