"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth/store";
import { api } from "@/lib/api/client";
import PageHeader from "@/components/layout/PageHeader";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

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

type FindingType = "MARKUP" | "FEE" | "UNHEDGED_IMPACT";

interface Finding {
  id: string;
  type: FindingType;
  currency_pair: string;
  counterparty: string;
  amount_usd: number;
  status: string;
  details?: string;
}

interface AuditRunDetail {
  run_id: string;
  status: string;
  markup_total_usd: number;
  total_fees_usd: number;
  unhedged_impact_usd: number;
  transaction_count: number;
  dataset_id: string;
  methodology_version: string;
  run_hash: string;
  inputs_hash: string;
  outputs_hash: string;
  created_at: string;
  findings: Finding[];
}

const DEMO_RUN: AuditRunDetail = {
  run_id: "demo-sample-run",
  status: "COMPLETED",
  markup_total_usd: 8420,
  total_fees_usd: 1230,
  unhedged_impact_usd: 14500,
  transaction_count: 10,
  dataset_id: "demo",
  methodology_version: "v1.0.0",
  run_hash: "a3f8c2d1e4b7a9f0c2e5d8b1a4c7f0e3b6a9d2c5f8b1e4a7d0c3f6b9e2a5d8b1",
  inputs_hash: "b1e4a7d0c3f6b9e2a5d8b1e4a7d0c3f6b9e2a5d8b1e4a7d0c3f6b9e2a5d8b1e4",
  outputs_hash: "c5f8b1e4a7d0c3f6b9e2a5d8b1e4a7d0c3f6b9e2a5d8b1e4a7d0c3f6b9e2a5d8",
  created_at: new Date().toISOString(),
  findings: [
    { id: "1", type: "MARKUP", currency_pair: "EURUSD", counterparty: "HSBC", amount_usd: 2100, status: "CONFIRMED", details: "Spread 28bps above mid" },
    { id: "2", type: "MARKUP", currency_pair: "GBPUSD", counterparty: "Barclays", amount_usd: 1850, status: "CONFIRMED", details: "Spread 22bps above mid" },
    { id: "3", type: "FEE", currency_pair: "USDJPY", counterparty: "HSBC", amount_usd: 780, status: "CONFIRMED", details: "Flat transaction fee" },
    { id: "4", type: "MARKUP", currency_pair: "EURUSD", counterparty: "JPMorgan", amount_usd: 1640, status: "CONFIRMED", details: "Spread 19bps above mid" },
    { id: "5", type: "FEE", currency_pair: "EURUSD", counterparty: "Barclays", amount_usd: 450, status: "CONFIRMED", details: "Settlement fee" },
    { id: "6", type: "MARKUP", currency_pair: "USDCHF", counterparty: "UBS", amount_usd: 2830, status: "CONFIRMED", details: "Spread 35bps above mid" },
    { id: "7", type: "UNHEDGED_IMPACT", currency_pair: "GBPEUR", counterparty: "Deutsche", amount_usd: 14500, status: "ANALYTICAL", details: "Estimated opportunity cost" },
  ],
};

function fmtUSD(n: number, opts?: { compact?: boolean }) {
  if (opts?.compact && Math.abs(n) >= 1000) {
    return `$${(n / 1000).toFixed(1)}k`;
  }
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
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

function FindingTypeBadge({ type }: { type: FindingType }) {
  const map: Record<FindingType, { bg: string; color: string; label: string }> = {
    MARKUP: { bg: "#DBEAFE", color: "#1C62F2", label: "MARKUP" },
    FEE: { bg: "#FEF3C7", color: "#D97706", label: "FEE" },
    UNHEDGED_IMPACT: { bg: "#FEE2E2", color: "#DC2626", label: "UNHEDGED" },
  };
  const cfg = map[type] ?? map.MARKUP;
  return (
    <span
      style={{
        fontFamily: S.fontMono,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.06em",
        padding: "2px 7px",
        borderRadius: 4,
        background: cfg.bg,
        color: cfg.color,
        whiteSpace: "nowrap",
      }}
    >
      {cfg.label}
    </span>
  );
}

function SimpleBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(4, (value / max) * 100) : 4;
  return (
    <div
      style={{
        height: 12,
        background: S.bgSub,
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: color,
          borderRadius: 4,
          transition: "width 0.4s ease",
        }}
      />
    </div>
  );
}

type Tab = "findings" | "by_pair" | "by_counterparty" | "evidence";

export default function RunDetailPage() {
  const params = useParams();
  const run_id = params?.run_id as string;
  const { token, user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>("findings");
  const [rechartsWorks, setRechartsWorks] = useState(true);

  // Check if this is a demo run via session storage
  const [demoRunData, setDemoRunData] = useState<AuditRunDetail | null>(null);
  useEffect(() => {
    const stored = sessionStorage.getItem("audit_demo_run");
    if (stored) {
      try {
        setDemoRunData(JSON.parse(stored));
      } catch {
        // ignore
      }
    }
  }, []);

  const isDemo =
    run_id === "demo-sample-run" ||
    run_id?.includes("demo") ||
    demoRunData?.run_id === run_id;

  const { data: fetchedRun, isLoading, error } = useQuery<AuditRunDetail>({
    queryKey: ["audit-run", run_id],
    queryFn: () => api.get<AuditRunDetail>(`/v1/audit-lab/runs/${run_id}`),
    enabled: !!token && !!run_id && !isDemo,
    retry: 1,
  });

  const run: AuditRunDetail | undefined = isDemo ? (demoRunData ?? DEMO_RUN) : fetchedRun;

  // Aggregate by pair
  const byPairMap = new Map<string, number>();
  run?.findings?.forEach((f) => {
    if (f.type !== "UNHEDGED_IMPACT") {
      byPairMap.set(f.currency_pair, (byPairMap.get(f.currency_pair) ?? 0) + f.amount_usd);
    }
  });
  const byPairData = Array.from(byPairMap.entries())
    .map(([pair, amount_usd]) => ({ pair, amount_usd }))
    .sort((a, b) => b.amount_usd - a.amount_usd);

  // Aggregate by counterparty
  const byCptyMap = new Map<string, number>();
  run?.findings?.forEach((f) => {
    if (f.type !== "UNHEDGED_IMPACT") {
      byCptyMap.set(f.counterparty, (byCptyMap.get(f.counterparty) ?? 0) + f.amount_usd);
    }
  });
  const byCptyData = Array.from(byCptyMap.entries())
    .map(([counterparty, amount_usd]) => ({ counterparty, amount_usd }))
    .sort((a, b) => b.amount_usd - a.amount_usd);

  const maxPair = byPairData[0]?.amount_usd ?? 1;
  const maxCpty = byCptyData[0]?.amount_usd ?? 1;

  const handleExport = async () => {
    if (!token || !run_id) return;
    try {
      const res = await fetch(`${API_BASE}/v1/audit-lab/runs/${run_id}/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit_run_${run_id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fall back to exporting the run data we have
      if (run) {
        const blob = new Blob([JSON.stringify(run, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `audit_run_${run_id}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "findings", label: "Findings" },
    { key: "by_pair", label: "By Pair" },
    { key: "by_counterparty", label: "By Counterparty" },
    { key: "evidence", label: "Evidence Rail" },
  ];

  const isLite = (user as { plan?: string } | null)?.plan === "lite";

  if (isLoading && !isDemo) {
    return (
      <div style={{ minHeight: "100vh", background: S.bgDeep, fontFamily: S.fontUI }}>
        <PageHeader title="Audit Run" subtitle="Loading…" />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 300,
            fontFamily: S.fontMono,
            fontSize: 13,
            color: S.textTertiary,
          }}
        >
          Loading run data…
        </div>
      </div>
    );
  }

  if ((error || !run) && !isDemo) {
    return (
      <div style={{ minHeight: "100vh", background: S.bgDeep, fontFamily: S.fontUI }}>
        <PageHeader title="Audit Run" subtitle="Not found" />
        <div
          style={{
            maxWidth: 500,
            margin: "60px auto",
            padding: "0 24px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 12 }}>❌</div>
          <div
            style={{
              fontFamily: S.fontHeading,
              fontSize: 17,
              fontWeight: 700,
              color: S.textPrimary,
              marginBottom: 8,
            }}
          >
            Run not found
          </div>
          <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.textSecondary, marginBottom: 20 }}>
            This audit run may have been deleted or does not exist.
          </div>
          <Link
            href="/audit-lab"
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              fontWeight: 700,
              color: S.accentCyan,
              textDecoration: "none",
            }}
          >
            ← Back to Audit Lab
          </Link>
        </div>
      </div>
    );
  }

  const savings = (run?.markup_total_usd ?? 0) + (run?.total_fees_usd ?? 0);

  return (
    <div style={{ minHeight: "100vh", background: S.bgDeep, fontFamily: S.fontUI }}>
      <PageHeader
        title="Audit Run"
        subtitle={run ? fmtDate(run.created_at) : ""}
        action={
          <Link
            href="/audit-lab"
            style={{
              fontFamily: S.fontMono,
              fontSize: 12,
              color: S.textSecondary,
              textDecoration: "none",
              border: `1px solid ${S.soft}`,
              padding: "6px 12px",
              borderRadius: 6,
            }}
          >
            ← All Runs
          </Link>
        }
      />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px 60px" }}>
        {/* Demo watermark banner */}
        {isDemo && (
          <div
            style={{
              background: "#FFFBEB",
              border: "2px solid #FCD34D",
              borderRadius: 8,
              padding: "10px 16px",
              marginBottom: 18,
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontFamily: S.fontUI,
              fontSize: 13,
              color: "#92400E",
              fontWeight: 600,
            }}
          >
            <span style={{ fontSize: 16 }}>⚠️</span>
            DEMO DATA — Sample transactions, real analysis
          </div>
        )}

        {/* Trust signal */}
        <div
          style={{
            background: "#EFF6FF",
            border: "1px solid #BFDBFE",
            borderRadius: 8,
            padding: "9px 14px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: "#1E40AF",
            fontFamily: S.fontUI,
          }}
        >
          <span>🔒</span>
          <span>Your data is encrypted and auto-deletes in 30 days. Never used to train models.</span>
        </div>

        {/* 3 KPI Cards — THE MONEY SHOT */}
        {run && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 16,
              marginBottom: 20,
            }}
          >
            {/* BANK MARKUPS */}
            <div
              style={{
                background: S.bgPanel,
                border: `1px solid ${S.rim}`,
                borderRadius: 12,
                padding: "22px 22px 18px",
                borderTop: `3px solid ${S.accentRed}`,
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
                Bank Markups
              </div>
              <div
                style={{
                  fontFamily: S.fontHeading,
                  fontSize: 32,
                  fontWeight: 800,
                  color: run.markup_total_usd > 0 ? S.accentRed : S.statusPass,
                  lineHeight: 1,
                  marginBottom: 6,
                }}
              >
                {fmtUSD(run.markup_total_usd)}
              </div>
              <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.textSecondary }}>
                Spread charged above mid-market
              </div>
            </div>

            {/* FEES CHARGED */}
            <div
              style={{
                background: S.bgPanel,
                border: `1px solid ${S.rim}`,
                borderRadius: 12,
                padding: "22px 22px 18px",
                borderTop: `3px solid ${S.accentAmber}`,
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
                Fees Charged
              </div>
              <div
                style={{
                  fontFamily: S.fontHeading,
                  fontSize: 32,
                  fontWeight: 800,
                  color: run.total_fees_usd > 0 ? S.accentAmber : S.statusPass,
                  lineHeight: 1,
                  marginBottom: 6,
                }}
              >
                {fmtUSD(run.total_fees_usd)}
              </div>
              <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.textSecondary }}>
                Explicit fees &amp; commissions
              </div>
            </div>

            {/* UNHEDGED IMPACT */}
            <div
              style={{
                background: S.bgPanel,
                border: `1px solid ${S.rim}`,
                borderRadius: 12,
                padding: "22px 22px 18px",
                borderTop: `3px solid ${S.accentCyan}`,
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
                Unhedged Impact*
              </div>
              <div
                style={{
                  fontFamily: S.fontHeading,
                  fontSize: 32,
                  fontWeight: 800,
                  color: S.accentCyan,
                  lineHeight: 1,
                  marginBottom: 6,
                }}
              >
                {fmtUSD(run.unhedged_impact_usd)}
              </div>
              <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.textSecondary }}>
                Reference baseline · what-if analysis
              </div>
            </div>
          </div>
        )}

        {/* Unhedged footnote */}
        <div
          style={{
            fontFamily: S.fontMono,
            fontSize: 10,
            color: S.textTertiary,
            marginBottom: 16,
            paddingLeft: 2,
          }}
        >
          * Reference baseline — analytical what-if, not a factual loss claim
        </div>

        {/* Headline finding */}
        {run && run.markup_total_usd > 0 && (
          <div
            style={{
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 10,
              padding: "16px 20px",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 20 }}>💡</span>
            <div
              style={{
                fontFamily: S.fontUI,
                fontSize: 15,
                fontWeight: 600,
                color: S.textPrimary,
              }}
            >
              Your banks charged you{" "}
              <span style={{ color: S.accentRed }}>{fmtUSD(run.markup_total_usd)}</span> more than
              mid-market rates on{" "}
              <span style={{ color: S.textPrimary }}>{run.transaction_count} transactions</span>.
            </div>
          </div>
        )}

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 0,
            borderBottom: `2px solid ${S.rim}`,
            marginBottom: 20,
          }}
        >
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.06em",
                color: activeTab === t.key ? S.accentCyan : S.textTertiary,
                background: "none",
                border: "none",
                borderBottom: `2px solid ${activeTab === t.key ? S.accentCyan : "transparent"}`,
                marginBottom: -2,
                padding: "10px 18px",
                cursor: "pointer",
                transition: "color 0.12s",
                textTransform: "uppercase",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* TAB: Findings */}
        {activeTab === "findings" && (
          <div
            style={{
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            {/* Table header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "100px 100px 1fr 110px 90px 1fr",
                gap: 8,
                padding: "10px 18px",
                background: S.bgSub,
                borderBottom: `1px solid ${S.rim}`,
              }}
            >
              {["Type", "Pair", "Counterparty", "Amount USD", "Status", "Details"].map((h) => (
                <div
                  key={h}
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    color: S.textTertiary,
                    textTransform: "uppercase",
                  }}
                >
                  {h}
                </div>
              ))}
            </div>

            {run?.findings?.length === 0 && (
              <div
                style={{
                  padding: "36px 18px",
                  textAlign: "center",
                  fontFamily: S.fontUI,
                  fontSize: 13,
                  color: S.textTertiary,
                }}
              >
                No findings detected.
              </div>
            )}

            {run?.findings?.map((f, i) => (
              <div
                key={f.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "100px 100px 1fr 110px 90px 1fr",
                  gap: 8,
                  padding: "13px 18px",
                  borderBottom: i < (run.findings.length - 1) ? `1px solid ${S.rim}` : "none",
                  alignItems: "center",
                }}
              >
                <div>
                  <FindingTypeBadge type={f.type} />
                </div>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    fontWeight: 600,
                    color: S.textPrimary,
                  }}
                >
                  {f.currency_pair}
                </div>
                <div
                  style={{
                    fontFamily: S.fontUI,
                    fontSize: 13,
                    color: S.textSecondary,
                  }}
                >
                  {f.counterparty}
                </div>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 13,
                    fontWeight: 700,
                    color: f.type === "UNHEDGED_IMPACT" ? S.accentCyan : S.accentRed,
                  }}
                >
                  {fmtUSD(f.amount_usd)}
                </div>
                <div>
                  <span
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.05em",
                      padding: "2px 6px",
                      borderRadius: 3,
                      background: f.status === "CONFIRMED" ? "#D1FAE5" : "#FEF3C7",
                      color: f.status === "CONFIRMED" ? S.statusPass : S.accentAmber,
                    }}
                  >
                    {f.status}
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: S.fontUI,
                    fontSize: 12,
                    color: S.textTertiary,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {f.details ?? "—"}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB: By Pair */}
        {activeTab === "by_pair" && (
          <div
            style={{
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 10,
              padding: "20px 20px",
            }}
          >
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: S.textTertiary,
                textTransform: "uppercase",
                marginBottom: 16,
              }}
            >
              Markup + Fees by Currency Pair
            </div>

            {byPairData.length === 0 && (
              <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.textTertiary, textAlign: "center", padding: "32px 0" }}>
                No data available.
              </div>
            )}

            {byPairData.length > 0 && (
              <>
                {/* Recharts chart */}
                {rechartsWorks && (
                  <div style={{ width: "100%", height: 220, marginBottom: 20 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={byPairData}
                        margin={{ top: 4, right: 16, left: 16, bottom: 4 }}
                      >
                        <XAxis
                          dataKey="pair"
                          tick={{ fontFamily: S.fontMono, fontSize: 11, fill: S.textSecondary }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontFamily: S.fontMono, fontSize: 10, fill: S.textTertiary }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) => fmtUSD(v, { compact: true })}
                        />
                        <Tooltip
                          formatter={(v: number | undefined) => [fmtUSD(v ?? 0), "Total Markup+Fees"] as [string, string]}
                          contentStyle={{
                            fontFamily: S.fontMono,
                            fontSize: 11,
                            border: `1px solid ${S.rim}`,
                            borderRadius: 6,
                          }}
                        />
                        <Bar dataKey="amount_usd" radius={[4, 4, 0, 0]}>
                          {byPairData.map((_, idx) => (
                            <Cell
                              key={idx}
                              fill={["#1C62F2", "#3B82F6", "#60A5FA", "#93C5FD", "#BFDBFE"][idx % 5]}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Fallback visual bars */}
                {!rechartsWorks && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                    {byPairData.map((d) => (
                      <div key={d.pair} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, color: S.textPrimary, width: 72, flexShrink: 0 }}>
                          {d.pair}
                        </div>
                        <div style={{ flex: 1 }}>
                          <SimpleBar value={d.amount_usd} max={maxPair} color={S.accentCyan} />
                        </div>
                        <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.accentRed, width: 90, textAlign: "right", flexShrink: 0 }}>
                          {fmtUSD(d.amount_usd)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Table */}
                <div>
                  {byPairData.map((d, i) => (
                    <div
                      key={d.pair}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                        padding: "10px 0",
                        borderBottom: i < byPairData.length - 1 ? `1px solid ${S.rim}` : "none",
                      }}
                    >
                      <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 600, color: S.textPrimary, width: 80 }}>
                        {d.pair}
                      </span>
                      <div style={{ flex: 1 }}>
                        <SimpleBar value={d.amount_usd} max={maxPair} color={S.accentCyan} />
                      </div>
                      <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.accentRed, width: 90, textAlign: "right" }}>
                        {fmtUSD(d.amount_usd)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB: By Counterparty */}
        {activeTab === "by_counterparty" && (
          <div
            style={{
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 10,
              padding: "20px 20px",
            }}
          >
            <div
              style={{
                fontFamily: S.fontMono,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                color: S.textTertiary,
                textTransform: "uppercase",
                marginBottom: 16,
              }}
            >
              Markup + Fees by Counterparty (Bank)
            </div>

            {byCptyData.length === 0 && (
              <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.textTertiary, textAlign: "center", padding: "32px 0" }}>
                No data available.
              </div>
            )}

            {byCptyData.length > 0 && (
              <div>
                {byCptyData.map((d, i) => (
                  <div
                    key={d.counterparty}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "160px 1fr 110px",
                      alignItems: "center",
                      gap: 16,
                      padding: "12px 0",
                      borderBottom: i < byCptyData.length - 1 ? `1px solid ${S.rim}` : "none",
                    }}
                  >
                    <div style={{ fontFamily: S.fontUI, fontSize: 13, fontWeight: 600, color: S.textPrimary }}>
                      {d.counterparty}
                    </div>
                    <div>
                      <SimpleBar value={d.amount_usd} max={maxCpty} color={S.accentAmber} />
                    </div>
                    <div
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 13,
                        fontWeight: 700,
                        color: S.accentRed,
                        textAlign: "right",
                      }}
                    >
                      {fmtUSD(d.amount_usd)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: Evidence Rail */}
        {activeTab === "evidence" && run && (
          <div
            style={{
              background: S.bgPanel,
              border: `1px solid ${S.rim}`,
              borderRadius: 10,
              padding: "24px 24px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 20,
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    color: S.textTertiary,
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  SHA-256 Hash Chain
                </div>
                <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.textSecondary }}>
                  Tamper-evident fingerprint of this audit run
                </div>
              </div>
              <button
                onClick={handleExport}
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  background: S.bgSub,
                  color: S.textPrimary,
                  border: `1px solid ${S.soft}`,
                  borderRadius: 6,
                  padding: "8px 14px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                ⬇ Export JSON
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                {
                  label: "Run Hash",
                  sublabel: "Tamper-evident fingerprint",
                  value: run.run_hash,
                  accent: S.accentCyan,
                },
                {
                  label: "Inputs Hash",
                  sublabel: "Hash of the input transaction dataset",
                  value: run.inputs_hash,
                  accent: S.statusPass,
                },
                {
                  label: "Outputs Hash",
                  sublabel: "Hash of the findings output",
                  value: run.outputs_hash,
                  accent: S.accentAmber,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    background: S.bgSub,
                    border: `1px solid ${S.rim}`,
                    borderLeft: `3px solid ${item.accent}`,
                    borderRadius: 8,
                    padding: "14px 16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        color: item.accent,
                        textTransform: "uppercase",
                      }}
                    >
                      {item.label}
                    </span>
                    <span style={{ fontFamily: S.fontUI, fontSize: 11, color: S.textTertiary }}>
                      — {item.sublabel}
                    </span>
                  </div>
                  <div
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 11,
                      color: S.textPrimary,
                      wordBreak: "break-all",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {item.value ?? "—"}
                  </div>
                </div>
              ))}

              <div
                style={{
                  background: S.bgSub,
                  border: `1px solid ${S.rim}`,
                  borderLeft: `3px solid ${S.textTertiary}`,
                  borderRadius: 8,
                  padding: "14px 16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <span
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      color: S.textTertiary,
                      textTransform: "uppercase",
                    }}
                  >
                    Methodology Version
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    fontWeight: 600,
                    color: S.textPrimary,
                  }}
                >
                  {run.methodology_version ?? "—"}
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 16,
                fontFamily: S.fontMono,
                fontSize: 10,
                color: S.textTertiary,
                lineHeight: 1.5,
              }}
            >
              Hash chain ensures audit results cannot be altered retroactively. Each run is
              cryptographically linked to its inputs and outputs using SHA-256.
            </div>
          </div>
        )}

        {/* Upgrade CTA */}
        {(isLite || isDemo) && savings > 0 && (
          <div
            style={{
              marginTop: 28,
              background: S.bgPanel,
              border: `2px solid ${S.accentCyan}`,
              borderRadius: 12,
              padding: "22px 24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 14,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: S.fontHeading,
                  fontSize: 16,
                  fontWeight: 700,
                  color: S.textPrimary,
                  marginBottom: 4,
                }}
              >
                💡 Save up to {fmtUSD(Math.round(savings * 4), { compact: false })}/quarter
              </div>
              <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.textSecondary }}>
                By hedging at better rates and timing — stop overpaying your bank on every transaction.
              </div>
            </div>
            <Link
              href="/settings?upgrade=true"
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.06em",
                background: S.accentCyan,
                color: "#fff",
                padding: "11px 22px",
                borderRadius: 8,
                textDecoration: "none",
                display: "inline-block",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              Start Free SMB Trial — 14 days →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
