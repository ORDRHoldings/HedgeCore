"use client";

import React, { useEffect, useState } from "react";
import {
  Activity, X, CheckCircle2, Clock, AlertTriangle, Users,
  FileText, Shield, Layers, ArrowRight, TrendingUp, Zap,
  Database, BarChart3, Target,
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

function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
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

  // Calculate system health score
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

  const healthStatus = healthScore !== null
    ? healthScore >= 80 ? "OPTIMAL" : healthScore >= 50 ? "DEGRADED" : "CRITICAL"
    : "UNKNOWN";

  return (
    <div style={{
      background: S.bgPanel,
      border: `1px solid ${S.rim}`,
      borderRadius: 8,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      height: "100%",
      position: "relative",
    }}>
      {/* Animated gradient background */}
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 120,
        background: `linear-gradient(135deg,
          color-mix(in srgb, ${healthColor} 8%, transparent),
          color-mix(in srgb, ${S.cyan} 5%, transparent))`,
        opacity: 0.6,
        pointerEvents: "none",
      }} />

      {/* Header */}
      <div className="widget-drag-handle" style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 14px",
        borderBottom: `1px solid ${S.rim}`,
        background: `linear-gradient(to right, ${S.bgDeep}, color-mix(in srgb, ${S.bgDeep} 95%, ${healthColor}))`,
        flexShrink: 0,
        cursor: "grab",
        position: "relative",
        zIndex: 1,
      }}>
        <div style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: `linear-gradient(135deg, ${healthColor}, color-mix(in srgb, ${healthColor} 70%, transparent))`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 0 20px color-mix(in srgb, ${healthColor} 40%, transparent)`,
        }}>
          <Activity size={16} color="#fff" strokeWidth={2.5} />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: S.fontMono,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: S.primary,
            textTransform: "uppercase",
          }}>
            System Pulse
          </div>
          {data && (
            <div style={{
              fontFamily: S.fontUI,
              fontSize: 9,
              color: S.tertiary,
              marginTop: 2,
            }}>
              {data.is_company_wide ? data.company_name : `${data.company_name} · ${data.branch_name}`}
            </div>
          )}
        </div>

        {healthScore !== null && (
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 12px",
            background: `color-mix(in srgb, ${healthColor} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${healthColor} 30%, transparent)`,
            borderRadius: 20,
          }}>
            <Zap size={12} color={healthColor} fill={healthColor} />
            <span style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              fontWeight: 700,
              color: healthColor,
              letterSpacing: "0.06em",
            }}>
              {healthScore}/100
            </span>
            <span style={{
              fontFamily: S.fontMono,
              fontSize: 8,
              color: healthColor,
              letterSpacing: "0.08em",
              opacity: 0.8,
            }}>
              {healthStatus}
            </span>
          </div>
        )}

        {onRemove && (
          <button onClick={onRemove} title="Remove widget" style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: S.tertiary,
            display: "flex",
            alignItems: "center",
            padding: 4,
            opacity: 0.6,
            transition: "opacity 200ms",
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = "1"}
          onMouseLeave={(e) => e.currentTarget.style.opacity = "0.6"}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", position: "relative", zIndex: 1 }}>
        {loading && (
          <div style={{ padding: 16 }}>
            <EmptyState type="loading" message="Loading system metrics..." />
          </div>
        )}

        {error && !loading && (
          <div style={{
            padding: "24px 20px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            textAlign: "center",
          }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: `color-mix(in srgb, ${S.cyan} 10%, transparent)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <Activity size={24} color={S.cyan} style={{ opacity: 0.5 }} />
            </div>
            <div style={{
              fontFamily: S.fontMono,
              fontSize: 11,
              color: S.secondary,
              letterSpacing: "0.04em",
              fontWeight: 600,
            }}>
              AWAITING DATA
            </div>
            <div style={{
              fontFamily: S.fontUI,
              fontSize: 11,
              color: S.tertiary,
              lineHeight: 1.6,
              maxWidth: 280,
            }}>
              System metrics will populate once positions are ingested and hedge calculations are executed.
            </div>
            <div style={{
              fontFamily: S.fontMono,
              fontSize: 9,
              color: S.cyan,
              letterSpacing: "0.06em",
              background: `color-mix(in srgb, ${S.cyan} 8%, transparent)`,
              border: `1px solid color-mix(in srgb, ${S.cyan} 20%, transparent)`,
              borderRadius: 4,
              padding: "4px 12px",
              marginTop: 4,
            }}>
              POSITION DESK → INGEST DATA
            </div>
          </div>
        )}

        {!loading && !error && kpis && (
          <>
            {/* Hero Metric - Total Exposure */}
            <div style={{
              padding: "20px",
              background: `linear-gradient(to bottom,
                color-mix(in srgb, ${S.bgDeep} 50%, transparent),
                transparent)`,
              borderBottom: `1px solid ${S.soft}`,
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}>
                <Layers size={12} color={S.cyan} />
                <span style={{
                  fontFamily: S.fontMono,
                  fontSize: 9,
                  color: S.tertiary,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}>
                  Total FX Exposure
                </span>
              </div>
              <div style={{
                fontFamily: S.fontMono,
                fontSize: 36,
                fontWeight: 700,
                color: S.cyan,
                lineHeight: 1,
                letterSpacing: "-0.02em",
                textShadow: `0 0 30px color-mix(in srgb, ${S.cyan} 20%, transparent)`,
              }}>
                {formatCompact(kpis.total_exposure_usd)}
              </div>
              <div style={{
                fontFamily: S.fontUI,
                fontSize: 10,
                color: S.tertiary,
                marginTop: 6,
              }}>
                {data?.is_company_wide ? "Company-wide" : data?.branch_name} · {data?.branch_currency} basis
              </div>
            </div>

            {/* KPI Grid */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 0,
            }}>
              {/* Hedge Coverage */}
              <div style={{
                padding: "16px 20px",
                borderRight: `1px solid ${S.soft}`,
                borderBottom: `1px solid ${S.soft}`,
              }}>
                <div style={{display: "flex", alignItems: "center", gap: 6, marginBottom: 10}}>
                  <Shield size={11} color={healthColor} />
                  <span style={{
                    fontFamily: S.fontMono,
                    fontSize: 8,
                    color: S.tertiary,
                    letterSpacing: "0.08em",
                  }}>
                    HEDGE COVERAGE
                  </span>
                </div>
                <div style={{
                  fontFamily: S.fontMono,
                  fontSize: 28,
                  fontWeight: 700,
                  color: healthColor,
                  lineHeight: 1,
                  marginBottom: 6,
                }}>
                  {kpis.hedge_coverage_pct}%
                </div>
                <div style={{ width: "100%", height: 6, background: S.bgDeep, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{
                    width: `${Math.min(kpis.hedge_coverage_pct, 100)}%`,
                    height: "100%",
                    background: `linear-gradient(90deg, ${healthColor}, color-mix(in srgb, ${healthColor} 60%, transparent))`,
                    transition: "width 600ms ease",
                  }} />
                </div>
                <div style={{
                  fontFamily: S.fontUI,
                  fontSize: 9,
                  color: S.tertiary,
                  marginTop: 6,
                }}>
                  {kpis.hedge_coverage_pct >= 70 ? "Above threshold" : kpis.hedge_coverage_pct >= 50 ? "Near threshold" : "Below threshold"}
                </div>
              </div>

              {/* Active Proposals */}
              <div style={{
                padding: "16px 20px",
                borderBottom: `1px solid ${S.soft}`,
              }}>
                <div style={{display: "flex", alignItems: "center", gap: 6, marginBottom: 10}}>
                  <FileText size={11} color={S.cyan} />
                  <span style={{
                    fontFamily: S.fontMono,
                    fontSize: 8,
                    color: S.tertiary,
                    letterSpacing: "0.08em",
                  }}>
                    ACTIVE PROPOSALS
                  </span>
                </div>
                <div style={{
                  fontFamily: S.fontMono,
                  fontSize: 28,
                  fontWeight: 700,
                  color: kpis.active_proposals > 0 ? S.cyan : S.tertiary,
                  lineHeight: 1,
                  marginBottom: 8,
                }}>
                  {kpis.active_proposals}
                </div>
                <div style={{
                  fontFamily: S.fontUI,
                  fontSize: 9,
                  color: S.tertiary,
                }}>
                  {kpis.active_proposals > 0 ? "In execution pipeline" : "No active proposals"}
                </div>
              </div>

              {/* Pending Approvals */}
              <div style={{
                padding: "16px 20px",
                borderRight: `1px solid ${S.soft}`,
                borderBottom: `1px solid ${S.soft}`,
              }}>
                <div style={{display: "flex", alignItems: "center", gap: 6, marginBottom: 10}}>
                  <Clock size={11} color={kpis.pending_approvals > 0 ? S.amber : S.green} />
                  <span style={{
                    fontFamily: S.fontMono,
                    fontSize: 8,
                    color: S.tertiary,
                    letterSpacing: "0.08em",
                  }}>
                    PENDING APPROVALS
                  </span>
                </div>
                <div style={{
                  fontFamily: S.fontMono,
                  fontSize: 28,
                  fontWeight: 700,
                  color: kpis.pending_approvals === 0 ? S.green : kpis.pending_approvals <= 3 ? S.amber : S.red,
                  lineHeight: 1,
                  marginBottom: 8,
                }}>
                  {kpis.pending_approvals}
                </div>
                <div style={{
                  fontFamily: S.fontUI,
                  fontSize: 9,
                  color: S.tertiary,
                }}>
                  {kpis.pending_approvals === 0 ? "Queue clear" : "Needs 4-eyes review"}
                </div>
              </div>

              {/* Open Alerts */}
              <div style={{
                padding: "16px 20px",
                borderBottom: `1px solid ${S.soft}`,
              }}>
                <div style={{display: "flex", alignItems: "center", gap: 6, marginBottom: 10}}>
                  <AlertTriangle size={11} color={kpis.open_alerts > 0 ? S.amber : S.green} />
                  <span style={{
                    fontFamily: S.fontMono,
                    fontSize: 8,
                    color: S.tertiary,
                    letterSpacing: "0.08em",
                  }}>
                    OPEN ALERTS
                  </span>
                </div>
                <div style={{
                  fontFamily: S.fontMono,
                  fontSize: 28,
                  fontWeight: 700,
                  color: kpis.open_alerts === 0 ? S.green : kpis.open_alerts <= 2 ? S.amber : S.red,
                  lineHeight: 1,
                  marginBottom: 8,
                }}>
                  {kpis.open_alerts}
                </div>
                <div style={{
                  fontFamily: S.fontUI,
                  fontSize: 9,
                  color: S.tertiary,
                }}>
                  {kpis.open_alerts === 0 ? "No issues detected" : "Requires attention"}
                </div>
              </div>
            </div>

            {/* Pipeline Funnel */}
            <div style={{
              padding: "16px 20px",
              background: S.bgSub,
              borderTop: `1px solid ${S.soft}`,
            }}>
              <div style={{
                fontFamily: S.fontMono,
                fontSize: 9,
                color: S.tertiary,
                letterSpacing: "0.08em",
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}>
                <Target size={10} color={S.tertiary} />
                TRI-STATE PIPELINE
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {[
                  { label: "SANDBOX", count: Math.max(0, kpis.active_proposals ?? 0), color: S.cyan },
                  { label: "STAGING", count: kpis.pending_approvals ?? 0, color: S.amber },
                  { label: "LEDGER", count: 0, color: S.green },
                ].map((stage, i) => (
                  <React.Fragment key={stage.label}>
                    <div style={{
                      flex: 1,
                      padding: "12px 14px",
                      textAlign: "center",
                      background: `linear-gradient(135deg,
                        color-mix(in srgb, ${stage.color} 8%, transparent),
                        color-mix(in srgb, ${stage.color} 3%, transparent))`,
                      border: `1px solid color-mix(in srgb, ${stage.color} 25%, transparent)`,
                      borderRadius: 6,
                      position: "relative",
                      overflow: "hidden",
                    }}>
                      <div style={{
                        fontFamily: S.fontMono,
                        fontSize: 22,
                        fontWeight: 700,
                        color: stage.color,
                        lineHeight: 1,
                        marginBottom: 4,
                      }}>
                        {stage.count}
                      </div>
                      <div style={{
                        fontFamily: S.fontMono,
                        fontSize: 7,
                        color: stage.color,
                        letterSpacing: "0.06em",
                        opacity: 0.7,
                      }}>
                        {stage.label}
                      </div>
                    </div>
                    {i < 2 && (
                      <ArrowRight size={12} color={S.tertiary} style={{ opacity: 0.4, flexShrink: 0 }} />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: "8px 14px",
        borderTop: `1px solid ${S.soft}`,
        background: S.bgDeep,
        fontFamily: S.fontMono,
        fontSize: 8,
        color: S.tertiary,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Database size={9} color={S.tertiary} />
          <span>Real-time KPIs · Institutional governance</span>
        </div>
        <span>{data?.company_name ?? "ORDR"}</span>
      </div>

      <style>{`
        @keyframes pulse-glow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
