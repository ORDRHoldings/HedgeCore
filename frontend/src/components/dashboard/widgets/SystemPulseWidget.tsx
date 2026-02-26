"use client";

import React, { useEffect, useState } from "react";
import {
  Activity, X, CheckCircle2, Clock, AlertTriangle, Users,
  FileText, Shield, Layers, ArrowRight, CircleDot,
} from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import type { UserContext } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  soft: "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)",
  amber: "var(--accent-amber)",
  green: "var(--status-pass,#15803D)",
  red: "var(--accent-red,#B91C1C)",
} as const;

interface DashboardSummary {
  branch_name: string;
  company_name: string;
  role: string;
  hierarchy_level: number;
  is_company_wide: boolean;
  branch_currency: string;
  kpis: {
    active_proposals: number;
    pending_approvals: number;
    total_exposure_usd: number;
    hedge_coverage_pct: number;
    open_alerts: number;
    team_size: number;
  };
}

interface PulseMetric {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  value: string | number;
  status: "good" | "warning" | "critical" | "neutral";
  detail: string;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function statusDot(status: string): string {
  switch (status) {
    case "good": return S.green;
    case "warning": return S.amber;
    case "critical": return S.red;
    default: return S.tertiary;
  }
}

interface Props {
  token: string;
  user: UserContext;
  onRemove?: () => void;
}

export default function SystemPulseWidget({ token, user, onRemove }: Props) {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await dashboardFetch("/v1/dashboard/summary", token);
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) setData(json);
        } else if (!cancelled) setError(true);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const kpis = data?.kpis;

  const metrics: PulseMetric[] = kpis ? [
    {
      icon: Layers, label: "TOTAL EXPOSURE",
      value: formatCompact(kpis.total_exposure_usd),
      status: "neutral",
      detail: data?.is_company_wide ? "Company-wide" : data?.branch_name ?? "",
    },
    {
      icon: Shield, label: "HEDGE COVERAGE",
      value: `${kpis.hedge_coverage_pct}%`,
      status: kpis.hedge_coverage_pct >= 70 ? "good" : kpis.hedge_coverage_pct >= 50 ? "warning" : "critical",
      detail: kpis.hedge_coverage_pct >= 70 ? "Above policy threshold" : kpis.hedge_coverage_pct >= 50 ? "Near threshold" : "Below threshold",
    },
    {
      icon: FileText, label: "ACTIVE PROPOSALS",
      value: kpis.active_proposals,
      status: kpis.active_proposals > 0 ? "good" : "neutral",
      detail: kpis.active_proposals > 0 ? "In execution pipeline" : "No proposals",
    },
    {
      icon: Clock, label: "PENDING APPROVALS",
      value: kpis.pending_approvals,
      status: kpis.pending_approvals === 0 ? "good" : kpis.pending_approvals <= 3 ? "warning" : "critical",
      detail: kpis.pending_approvals === 0 ? "Queue clear" : "Needs 4-eyes review",
    },
    {
      icon: AlertTriangle, label: "OPEN ALERTS",
      value: kpis.open_alerts,
      status: kpis.open_alerts === 0 ? "good" : kpis.open_alerts <= 2 ? "warning" : "critical",
      detail: kpis.open_alerts === 0 ? "No issues" : "Requires attention",
    },
    {
      icon: Users, label: "TEAM",
      value: kpis.team_size,
      status: "neutral",
      detail: `Active ${data?.role?.replace(/_/g, " ") ?? "users"}`,
    },
  ] : [];

  // Pipeline state summary
  const pipelineSummary = kpis ? {
    sandbox: Math.max(0, (kpis.active_proposals ?? 0)),
    staging: kpis.pending_approvals ?? 0,
    ledger: 0, // Would come from separate endpoint
  } : null;

  // Overall system health
  const healthScore = kpis
    ? Math.round(
        (
          (kpis.hedge_coverage_pct >= 70 ? 100 : kpis.hedge_coverage_pct * 1.4) +
          (kpis.pending_approvals === 0 ? 100 : Math.max(0, 100 - kpis.pending_approvals * 25)) +
          (kpis.open_alerts === 0 ? 100 : Math.max(0, 100 - kpis.open_alerts * 30))
        ) / 3,
      )
    : null;

  const healthColor = healthScore !== null
    ? healthScore >= 80 ? S.green : healthScore >= 50 ? S.amber : S.red
    : S.tertiary;

  return (
    <div style={{
      background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6,
      display: "flex", flexDirection: "column", overflow: "hidden", height: "100%",
    }}>
      {/* Header */}
      <div className="widget-drag-handle" style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
        borderBottom: `1px solid ${S.rim}`, background: S.bgDeep, flexShrink: 0, cursor: "grab",
      }}>
        <Activity size={13} color={S.cyan} style={{ flexShrink: 0 }} />
        <span style={{
          fontFamily: S.fontMono, fontSize: 11, fontWeight: 700,
          letterSpacing: "0.08em", color: S.primary, textTransform: "uppercase",
        }}>
          System Pulse
        </span>

        {data && (
          <span style={{
            fontFamily: S.fontMono, fontSize: 8, letterSpacing: "0.08em",
            color: S.cyan, background: `color-mix(in srgb, ${S.cyan} 10%, transparent)`,
            border: `1px solid color-mix(in srgb, ${S.cyan} 25%, transparent)`,
            borderRadius: 3, padding: "1px 5px", textTransform: "uppercase",
          }}>
            {data.is_company_wide ? "COMPANY" : data.branch_name}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {healthScore !== null && (
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: healthColor, boxShadow: `0 0 6px ${healthColor}`,
              display: "inline-block",
            }} />
            <span style={{
              fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
              color: healthColor, letterSpacing: "0.06em",
            }}>
              {healthScore}/100
            </span>
          </div>
        )}

        {onRemove && (
          <button onClick={onRemove} title="Remove widget" style={{
            background: "none", border: "none", cursor: "pointer",
            color: S.tertiary, display: "flex", alignItems: "center", padding: 2,
          }}>
            <X size={12} />
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {loading && (
          <div style={{ padding: 12 }}>
            <EmptyState type="loading" message="Loading system data..." />
          </div>
        )}

        {error && !loading && (
          <div style={{ padding: 12 }}>
            <EmptyState type="error" message="Failed to load KPI data" />
          </div>
        )}

        {!loading && !error && kpis && (
          <>
            {/* Health bar */}
            {healthScore !== null && (
              <div style={{ padding: "10px 14px 6px", borderBottom: `1px solid ${S.soft}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{
                    fontFamily: S.fontMono, fontSize: 8, color: S.tertiary,
                    letterSpacing: "0.08em",
                  }}>
                    SYSTEM HEALTH
                  </span>
                  <span style={{
                    fontFamily: S.fontMono, fontSize: 8, color: healthColor,
                    letterSpacing: "0.06em", fontWeight: 700,
                  }}>
                    {healthScore >= 80 ? "HEALTHY" : healthScore >= 50 ? "DEGRADED" : "CRITICAL"}
                  </span>
                </div>
                <div style={{
                  height: 6, background: S.bgDeep, border: `1px solid ${S.soft}`,
                  borderRadius: 3, overflow: "hidden",
                }}>
                  <div style={{
                    width: `${healthScore}%`, height: "100%",
                    background: `linear-gradient(90deg, ${healthColor}, color-mix(in srgb, ${healthColor} 70%, transparent))`,
                    borderRadius: 2,
                    transition: "width 600ms ease",
                  }} />
                </div>
              </div>
            )}

            {/* KPI Grid */}
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0,
            }}>
              {metrics.map((m, i) => {
                const MIcon = m.icon;
                const dotColor = statusDot(m.status);
                return (
                  <div key={m.label} style={{
                    padding: "12px 12px 10px",
                    borderRight: (i + 1) % 3 !== 0 ? `1px solid ${S.soft}` : "none",
                    borderBottom: i < 3 ? `1px solid ${S.soft}` : "none",
                    display: "flex", flexDirection: "column", gap: 4,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <MIcon size={10} color={S.tertiary} />
                      <span style={{
                        fontFamily: S.fontMono, fontSize: 7.5, color: S.tertiary,
                        letterSpacing: "0.06em", flex: 1,
                      }}>
                        {m.label}
                      </span>
                      <span style={{
                        width: 5, height: 5, borderRadius: "50%",
                        background: dotColor, display: "inline-block",
                        flexShrink: 0,
                      }} />
                    </div>
                    <div style={{
                      fontFamily: S.fontMono, fontSize: 18, fontWeight: 700,
                      color: S.primary, lineHeight: 1,
                    }}>
                      {m.value}
                    </div>
                    <div style={{
                      fontFamily: S.fontUI, fontSize: 9, color: S.tertiary, lineHeight: 1.2,
                    }}>
                      {m.detail}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pipeline funnel */}
            {pipelineSummary && (
              <div style={{
                padding: "10px 14px", borderTop: `1px solid ${S.soft}`,
              }}>
                <div style={{
                  fontFamily: S.fontMono, fontSize: 8, color: S.tertiary,
                  letterSpacing: "0.08em", marginBottom: 8,
                }}>
                  PIPELINE FUNNEL
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                  {[
                    { label: "SANDBOX", count: pipelineSummary.sandbox, color: S.cyan },
                    { label: "STAGING", count: pipelineSummary.staging, color: S.amber },
                    { label: "LEDGER", count: pipelineSummary.ledger, color: S.green },
                  ].map((stage, i) => (
                    <React.Fragment key={stage.label}>
                      <div style={{
                        flex: 1, padding: "8px 10px", textAlign: "center",
                        background: `color-mix(in srgb, ${stage.color} 5%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${stage.color} 20%, transparent)`,
                        borderRadius: 4,
                      }}>
                        <div style={{
                          fontFamily: S.fontMono, fontSize: 16, fontWeight: 700,
                          color: stage.color, lineHeight: 1, marginBottom: 2,
                        }}>
                          {stage.count}
                        </div>
                        <div style={{
                          fontFamily: S.fontMono, fontSize: 7, color: stage.color,
                          letterSpacing: "0.06em", opacity: 0.8,
                        }}>
                          {stage.label}
                        </div>
                      </div>
                      {i < 2 && (
                        <ArrowRight size={10} color={S.tertiary} style={{ margin: "0 4px", flexShrink: 0 }} />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!loading && !error && !kpis && (
          <div style={{ padding: 12 }}>
            <EmptyState type="empty" title="No data yet" message="System metrics will appear once positions are entered." />
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: "5px 12px", borderTop: `1px solid ${S.soft}`, background: S.bgSub,
        fontFamily: S.fontMono, fontSize: 8, color: S.tertiary,
        display: "flex", justifyContent: "space-between", flexShrink: 0,
      }}>
        <span>Real-time KPIs · Tri-state pipeline</span>
        <span>{data?.company_name ?? "ORDR"}</span>
      </div>
    </div>
  );
}
