"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth/store";
import { api } from "@/lib/api/client";
import PageHeader from "@/components/layout/PageHeader";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://hedgecore.onrender.com/api";

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

interface AuditRun {
  run_id: string;
  status: "COMPLETED" | "RUNNING" | "FAILED";
  markup_total_usd: number;
  created_at: string;
}

interface AuditDataset {
  id: string;
  name: string;
  row_count: number;
  currency_pairs_detected: string[];
  period_start: string;
  period_end: string;
}

function StatusBadge({ status }: { status: AuditRun["status"] }) {
  const map = {
    COMPLETED: { bg: "#D1FAE5", color: S.statusPass, label: "COMPLETED" },
    RUNNING: { bg: "#FEF3C7", color: S.accentAmber, label: "RUNNING" },
    FAILED: { bg: "#FEE2E2", color: S.accentRed, label: "FAILED" },
  };
  const cfg = map[status] ?? map.FAILED;
  return (
    <span
      style={{
        fontFamily: S.fontMono,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.06em",
        padding: "2px 8px",
        borderRadius: 4,
        background: cfg.bg,
        color: cfg.color,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {status === "RUNNING" && (
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: S.accentAmber,
            display: "inline-block",
            animation: "pulse 1.2s infinite",
          }}
        />
      )}
      {cfg.label}
    </span>
  );
}

function fmtUSD(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function truncate(s: string, n = 20) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export default function AuditLabPage() {
  const { token } = useAuthStore();

  const runsQ = useQuery<AuditRun[]>({
    queryKey: ["audit-lab-runs"],
    queryFn: () => api.get<AuditRun[]>("/v1/audit-lab/runs"),
    enabled: !!token,
  });

  const datasetsQ = useQuery<AuditDataset[]>({
    queryKey: ["audit-lab-datasets"],
    queryFn: () => api.get<AuditDataset[]>("/v1/audit-lab/datasets"),
    enabled: !!token,
  });

  const runs: AuditRun[] = runsQ.data ?? [];
  const datasets: AuditDataset[] = datasetsQ.data ?? [];

  const headerAction = (
    <Link
      href="/audit-lab/upload"
      style={{
        fontFamily: S.fontMono,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.06em",
        background: S.accentCyan,
        color: "#fff",
        padding: "8px 18px",
        borderRadius: 6,
        textDecoration: "none",
        display: "inline-block",
      }}
    >
      + New Audit
    </Link>
  );

  return (
    <div style={{ minHeight: "100vh", background: S.bgDeep, fontFamily: S.fontUI }}>
      <PageHeader title="Audit Lab" subtitle="FX transaction cost analysis" action={headerAction} />

      {/* Trust signal banner */}
      <div
        style={{
          margin: "0 24px 20px",
          background: "#EFF6FF",
          border: "1px solid #BFDBFE",
          borderRadius: 8,
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          color: "#1E40AF",
          fontFamily: S.fontUI,
        }}
      >
        <span style={{ fontSize: 15 }}>🔒</span>
        <span>Your data is encrypted and auto-deletes in 30 days. Never used to train models.</span>
      </div>

      {/* Two columns */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: 20,
          padding: "0 24px 40px",
        }}
      >
        {/* PAST RUNS */}
        <section>
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: S.textTertiary,
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Past Audit Runs
          </div>

          {runsQ.isLoading && (
            <div
              style={{
                background: S.bgPanel,
                border: `1px solid ${S.rim}`,
                borderRadius: 10,
                padding: "32px 24px",
                textAlign: "center",
                color: S.textTertiary,
                fontFamily: S.fontMono,
                fontSize: 12,
              }}
            >
              Loading runs…
            </div>
          )}

          {!runsQ.isLoading && runs.length === 0 && (
            <div
              style={{
                background: S.bgPanel,
                border: `1px dashed ${S.soft}`,
                borderRadius: 10,
                padding: "36px 24px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
              <div style={{ fontFamily: S.fontHeading, fontWeight: 700, fontSize: 15, color: S.textPrimary, marginBottom: 6 }}>
                No audit runs yet
              </div>
              <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.textSecondary, marginBottom: 18 }}>
                Upload your FX transaction data to detect hidden bank markups and fees.
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
                  padding: "8px 16px",
                  borderRadius: 6,
                  textDecoration: "none",
                  display: "inline-block",
                }}
              >
                Run Your First Audit →
              </Link>
            </div>
          )}

          {runs.length > 0 && (
            <div
              style={{
                background: S.bgPanel,
                border: `1px solid ${S.rim}`,
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              {runs.map((r, i) => (
                <Link
                  key={r.run_id}
                  href={`/audit-lab/runs/${r.run_id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 18px",
                    borderBottom: i < runs.length - 1 ? `1px solid ${S.rim}` : "none",
                    textDecoration: "none",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = S.bgSub)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        color: S.accentCyan,
                        fontWeight: 600,
                        marginBottom: 3,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {truncate(r.run_id, 24)}
                    </div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>
                      {fmtDate(r.created_at)}
                    </div>
                  </div>
                  <StatusBadge status={r.status} />
                  {r.status === "COMPLETED" && (
                    <div
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 13,
                        fontWeight: 700,
                        color: r.markup_total_usd > 0 ? S.accentRed : S.statusPass,
                        minWidth: 90,
                        textAlign: "right",
                      }}
                    >
                      {fmtUSD(r.markup_total_usd)}
                    </div>
                  )}
                  <div style={{ color: S.textTertiary, fontSize: 14, marginLeft: 4 }}>›</div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* DATASETS */}
        <section>
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: S.textTertiary,
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Uploaded Datasets
          </div>

          {datasetsQ.isLoading && (
            <div
              style={{
                background: S.bgPanel,
                border: `1px solid ${S.rim}`,
                borderRadius: 10,
                padding: "32px 24px",
                textAlign: "center",
                color: S.textTertiary,
                fontFamily: S.fontMono,
                fontSize: 12,
              }}
            >
              Loading datasets…
            </div>
          )}

          {!datasetsQ.isLoading && datasets.length === 0 && (
            <div
              style={{
                background: S.bgPanel,
                border: `1px dashed ${S.soft}`,
                borderRadius: 10,
                padding: "36px 24px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 10 }}>📤</div>
              <div style={{ fontFamily: S.fontHeading, fontWeight: 700, fontSize: 15, color: S.textPrimary, marginBottom: 6 }}>
                No datasets uploaded
              </div>
              <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.textSecondary, marginBottom: 18 }}>
                Upload a CSV export from your bank or treasury system to get started.
              </div>
              <Link
                href="/audit-lab/upload"
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  background: S.bgSub,
                  color: S.textPrimary,
                  border: `1px solid ${S.soft}`,
                  padding: "8px 16px",
                  borderRadius: 6,
                  textDecoration: "none",
                  display: "inline-block",
                }}
              >
                Upload Dataset →
              </Link>
            </div>
          )}

          {datasets.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              {datasets.map((d) => (
                <div
                  key={d.id}
                  style={{
                    background: S.bgPanel,
                    border: `1px solid ${S.rim}`,
                    borderRadius: 10,
                    padding: "16px 18px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: S.fontUI,
                        fontSize: 14,
                        fontWeight: 600,
                        color: S.textPrimary,
                        marginBottom: 4,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {d.name}
                    </div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textSecondary, marginBottom: 3 }}>
                      {d.row_count.toLocaleString()} rows · {d.currency_pairs_detected?.length ?? 0} pairs
                    </div>
                    <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary }}>
                      {d.period_start ? fmtDate(d.period_start) : "—"} → {d.period_end ? fmtDate(d.period_end) : "—"}
                    </div>
                    {d.currency_pairs_detected?.length > 0 && (
                      <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {d.currency_pairs_detected.slice(0, 6).map((p) => (
                          <span
                            key={p}
                            style={{
                              fontFamily: S.fontMono,
                              fontSize: 10,
                              fontWeight: 600,
                              letterSpacing: "0.05em",
                              background: "#EFF6FF",
                              color: S.accentCyan,
                              padding: "2px 6px",
                              borderRadius: 3,
                            }}
                          >
                            {p}
                          </span>
                        ))}
                        {d.currency_pairs_detected.length > 6 && (
                          <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.textTertiary, padding: "2px 0" }}>
                            +{d.currency_pairs_detected.length - 6} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <Link
                    href={`/audit-lab/upload?dataset_id=${d.id}`}
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      background: S.accentCyan,
                      color: "#fff",
                      padding: "7px 14px",
                      borderRadius: 6,
                      textDecoration: "none",
                      display: "inline-block",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    Run Audit →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
