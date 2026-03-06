"use client";

import { useState, useEffect, useCallback } from "react";
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

const PERIODS = ["Last 7 days", "Last 30 days", "Last 90 days"] as const;

const KPI_DATA: Record<string, { signups: number; dau: number; conversions: number; mrr: string }> = {
  "Last 7 days": { signups: 12, dau: 38, conversions: 2, mrr: "$14,200" },
  "Last 30 days": { signups: 47, dau: 41, conversions: 8, mrr: "$14,200" },
  "Last 90 days": { signups: 134, dau: 45, conversions: 23, mrr: "$14,200" },
};

const STATIC_FUNNEL_STEPS = [
  { label: "Signup", count: 134, pct: 100 },
  { label: "Upload Data", count: 89, pct: 66 },
  { label: "Audit Complete", count: 61, pct: 46 },
  { label: "SMB Trial Start", count: 31, pct: 23 },
  { label: "Paid Conversion", count: 23, pct: 17 },
];

const TOP_TENANTS = [
  { name: "Meridian Capital", runs: 591, positions: 812, tier: "ENTERPRISE", mrr: "$4,200" },
  { name: "Apex Treasury", runs: 214, positions: 340, tier: "ENTERPRISE", mrr: "$4,200" },
  { name: "NordicFX Ltd", runs: 38, positions: 55, tier: "SMB", mrr: "$890" },
  { name: "Volta FX", runs: 12, positions: 28, tier: "SMB", mrr: "$890" },
  { name: "DemoCo", runs: 7, positions: 12, tier: "SMB", mrr: "$890" },
];

function KpiCard({ label, value, sub, color }: { label: string; value: string | number; sub: string; color?: string }) {
  return (
    <div
      style={{
        background: S.bgPanel,
        border: `1px solid ${S.rim}`,
        borderTop: `3px solid ${color ?? S.accentCyan}`,
        borderRadius: 6,
        padding: "20px 24px",
      }}
    >
      <div style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.textTertiary, marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ fontFamily: S.fontMono, fontSize: 32, fontWeight: 700, color: S.textPrimary, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textTertiary, marginTop: 6 }}>{sub}</div>
    </div>
  );
}

interface ApiMetrics {
  period_days: number; total_users: number; signups_in_period: number;
  active_users_in_period: number; total_companies: number; smb_companies: number;
  enterprise_companies: number; free_users: number; calc_runs_in_period: number;
  audit_runs_in_period: number; mrr_usd: number; conversions_in_period: number;
}

interface FunnelStep { label: string; count: number; pct: number; }
interface ApiFunnel { period_days: number; steps: FunnelStep[]; }

export default function MetricsPage() {
  const { user } = useAuthStore();
  const [period, setPeriod] = useState<typeof PERIODS[number]>("Last 30 days");
  const [metrics, setMetrics] = useState<ApiMetrics | null>(null);
  const [funnel, setFunnel] = useState<FunnelStep[] | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  const periodDays = period === "Last 7 days" ? 7 : period === "Last 90 days" ? 90 : 30;

  const load = useCallback(async () => {
    try {
      setLoadingMetrics(true);
      const [m, f] = await Promise.all([
        api.get<ApiMetrics>(`/v1/admin/metrics?days=${periodDays}`),
        api.get<ApiFunnel>(`/v1/admin/metrics/funnel?days=${periodDays}`),
      ]);
      setMetrics(m);
      setFunnel(f.steps);
    } catch { /* falls back to mock data below */ }
    finally { setLoadingMetrics(false); }
  }, [periodDays]);

  useEffect(() => { load(); }, [load]);

  if (!user?.is_superuser) return <NotFound />;

  const funnelSteps = funnel ?? STATIC_FUNNEL_STEPS;

  // Fall back to local mock if API not available
  const kpi = metrics ? {
    signups: metrics.signups_in_period,
    dau: metrics.active_users_in_period,
    conversions: metrics.conversions_in_period,
    mrr: `$${metrics.mrr_usd.toLocaleString()}`,
  } : KPI_DATA[period];

  return (
    <div style={{ padding: "28px 32px", minHeight: "calc(100vh - 92px)", background: S.bgDeep }}>
      {loadingMetrics && <div style={{ padding:"10px 16px",marginBottom:20,fontFamily:S.fontMono,fontSize:11,color:S.textTertiary }}>Loading metrics...</div>}
      {!loadingMetrics && !metrics && (
        <div style={{ padding:"10px 16px",background:"#FFFBEB",border:`1px solid ${S.accentAmber}`,borderRadius:5,marginBottom:20,fontFamily:S.fontMono,fontSize:11,color:S.accentAmber }}>
          Metrics API unavailable — showing estimated data
        </div>
      )}

      {/* Header + Period selector */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.accentRed, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 4 }}>
            COMMAND CENTER / METRICS
          </div>
          <h1 style={{ fontFamily: S.fontMono, fontSize: 20, fontWeight: 700, color: S.textPrimary, margin: 0 }}>
            PLATFORM METRICS
          </h1>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                fontFamily: S.fontMono,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.05em",
                color: period === p ? S.bgPanel : S.textSecondary,
                background: period === p ? S.accentCyan : S.bgPanel,
                border: `1px solid ${period === p ? S.accentCyan : S.rim}`,
                borderRadius: 4,
                padding: "6px 12px",
                cursor: "pointer",
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
        <KpiCard label="SIGNUPS" value={kpi.signups} sub={period} color={S.accentCyan} />
        <KpiCard label="DAILY ACTIVE USERS" value={kpi.dau} sub="avg DAU" color={S.statusPass} />
        <KpiCard label="CONVERSIONS" value={kpi.conversions} sub="Free → SMB" color={S.accentAmber} />
        <KpiCard label="MRR" value={kpi.mrr} sub="monthly recurring" color={S.accentRed} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Funnel */}
        <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
          <div style={{ padding: "12px 20px", borderBottom: `1px solid ${S.rim}`, background: S.bgSub }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: S.textPrimary }}>
              CONVERSION FUNNEL
            </span>
          </div>
          <div style={{ padding: "20px" }}>
            {funnelSteps.map((step, i) => (
              <div key={step.label} style={{ marginBottom: i < funnelSteps.length - 1 ? 16 : 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.textSecondary, fontWeight: 600 }}>
                    {step.label}
                  </span>
                  <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.textPrimary }}>
                      {step.count}
                    </span>
                    <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.textTertiary }}>
                      {step.pct}%
                    </span>
                  </div>
                </div>
                <div style={{ height: 8, background: S.bgSub, borderRadius: 4, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${step.pct}%`,
                      background: i === 0
                        ? S.accentCyan
                        : i === funnelSteps.length - 1
                        ? S.statusPass
                        : `rgba(28,98,242,${0.85 - i * 0.15})`,
                      borderRadius: 4,
                      transition: "width 0.4s ease",
                    }}
                  />
                </div>
                {i < funnelSteps.length - 1 && (
                  <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.textTertiary, marginTop: 3, textAlign: "right" }}>
                    ↓ {Math.round((funnelSteps[i + 1].count / step.count) * 100)}% continue
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Top Tenants by Usage */}
        <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, overflow: "hidden" }}>
          <div style={{ padding: "12px 20px", borderBottom: `1px solid ${S.rim}`, background: S.bgSub }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: S.textPrimary }}>
              TOP TENANTS BY USAGE
            </span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                {["COMPANY", "TIER", "RUNS", "POSITIONS", "MRR"].map((h) => (
                  <th key={h} style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: S.textTertiary, padding: "8px 14px", textAlign: "left" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TOP_TENANTS.map((t) => (
                <tr key={t.name} style={{ borderBottom: `1px solid ${S.rim}` }}>
                  <td style={{ padding: "10px 14px", fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, color: S.textPrimary }}>
                    {t.name}
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        color: t.tier === "ENTERPRISE" ? S.accentCyan : S.statusPass,
                        background: t.tier === "ENTERPRISE" ? "#EFF6FF" : "#D1FAE5",
                        padding: "1px 6px",
                        borderRadius: 3,
                      }}
                    >
                      {t.tier}
                    </span>
                  </td>
                  <td style={{ padding: "10px 14px", fontFamily: S.fontMono, fontSize: 12, color: S.textSecondary }}>{t.runs}</td>
                  <td style={{ padding: "10px 14px", fontFamily: S.fontMono, fontSize: 12, color: S.textSecondary }}>{t.positions}</td>
                  <td style={{ padding: "10px 14px", fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, color: S.statusPass }}>{t.mrr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
