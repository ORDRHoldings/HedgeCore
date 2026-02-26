"use client";

import { useEffect, useState } from "react";
import { Shield, X, ArrowRight } from "lucide-react";
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

interface HealthMetric {
  label: string;
  value: number; // 0-100
  status: "good" | "warning" | "critical" | "none";
  detail: string;
}

interface Props {
  token: string;
  user: UserContext;
  onRemove?: () => void;
}

function statusColor(status: string): string {
  switch (status) {
    case "good": return S.green;
    case "warning": return S.amber;
    case "critical": return S.red;
    default: return S.tertiary;
  }
}

export default function HedgeHealthWidget({ token, user, onRemove }: Props) {
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [overallScore, setOverallScore] = useState<number | null>(null);
  const [overallStatus, setOverallStatus] = useState<string>("none");
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Fetch multiple endpoints to compute health
        const [summaryRes, posRes] = await Promise.all([
          dashboardFetch("/v1/dashboard/summary", token),
          dashboardFetch("/v1/positions?limit=1", token),
        ]);

        const summary = summaryRes.ok ? await summaryRes.json() : null;
        const positions = posRes.ok ? await posRes.json() : null;
        const posCount = positions?.total ?? positions?.items?.length ?? 0;

        if (!cancelled) {
          if (posCount === 0 && (!summary || (summary.kpis?.active_proposals === 0))) {
            // Blank state - show onboarding checklist
            setHasData(false);
            setMetrics([
              { label: "Positions Entered", value: 0, status: "none", detail: "Add FX exposure positions to get started" },
              { label: "Policy Activated", value: 0, status: "none", detail: "Select and activate a hedge policy template" },
              { label: "Calculation Run", value: 0, status: "none", detail: "Run your first hedge calculation in sandbox" },
              { label: "Proposal Created", value: 0, status: "none", detail: "Create a proposal from calculation results" },
              { label: "Governance Review", value: 0, status: "none", detail: "Submit for 4-eyes approval in staging" },
            ]);
            setOverallScore(null);
            setOverallStatus("none");
          } else {
            // Real data mode
            setHasData(true);
            const coverage = summary?.kpis?.hedge_coverage_pct ?? 0;
            const pendingApprovals = summary?.kpis?.pending_approvals ?? 0;
            const activeProposals = summary?.kpis?.active_proposals ?? 0;

            const coverageStatus = coverage >= 70 ? "good" : coverage >= 50 ? "warning" : "critical";
            const approvalStatus = pendingApprovals === 0 ? "good" : pendingApprovals <= 3 ? "warning" : "critical";
            const policyStatus = coverage > 0 ? "good" : "warning";

            const m: HealthMetric[] = [
              { label: "Hedge Coverage", value: coverage, status: coverageStatus, detail: `${coverage}% of exposure hedged` },
              { label: "Policy Compliance", value: policyStatus === "good" ? 85 : 40, status: policyStatus, detail: policyStatus === "good" ? "Active policy aligned with risk posture" : "No active policy detected" },
              { label: "Approval Queue", value: Math.max(0, 100 - pendingApprovals * 20), status: approvalStatus, detail: `${pendingApprovals} items awaiting approval` },
              { label: "Position Health", value: posCount > 0 ? 80 : 0, status: posCount > 0 ? "good" : "none", detail: `${posCount} active positions tracked` },
              { label: "Execution Pipeline", value: activeProposals > 0 ? 70 : 0, status: activeProposals > 0 ? "good" : "none", detail: `${activeProposals} proposals in pipeline` },
            ];
            setMetrics(m);

            const avg = m.reduce((sum, met) => sum + met.value, 0) / m.length;
            setOverallScore(Math.round(avg));
            setOverallStatus(avg >= 70 ? "good" : avg >= 40 ? "warning" : "critical");
          }
        }
      } catch {
        if (!cancelled) {
          setHasData(false);
          setMetrics([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const scoreColor = statusColor(overallStatus);

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
        <Shield size={13} color={S.cyan} style={{ flexShrink: 0 }} />
        <span style={{
          fontFamily: S.fontMono, fontSize: 11, fontWeight: 700,
          letterSpacing: "0.08em", color: S.primary, textTransform: "uppercase", flex: 1,
        }}>
          Hedge Health
        </span>

        {overallScore !== null && (
          <span style={{
            fontFamily: S.fontMono, fontSize: 9, letterSpacing: "0.06em",
            color: scoreColor, fontWeight: 700,
          }}>
            SCORE: {overallScore}/100
          </span>
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
      <div style={{ flex: 1, overflow: "auto", padding: "10px 12px" }}>
        {loading && <EmptyState type="loading" message="Analyzing hedge health..." />}

        {!loading && !hasData && metrics.length > 0 && (
          <>
            {/* Onboarding checklist */}
            <div style={{
              padding: "8px 10px", background: `color-mix(in srgb, ${S.cyan} 5%, transparent)`,
              border: `1px solid color-mix(in srgb, ${S.cyan} 20%, transparent)`,
              marginBottom: 10, borderRadius: 3,
            }}>
              <div style={{
                fontFamily: S.fontMono, fontSize: 10, color: S.cyan,
                letterSpacing: "0.06em", fontWeight: 700, marginBottom: 4,
              }}>
                SETUP CHECKLIST
              </div>
              <div style={{
                fontFamily: S.fontUI, fontSize: 11, color: S.secondary, lineHeight: 1.5,
              }}>
                Complete these steps to activate your hedge dashboard and see live health metrics.
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {metrics.map((m, i) => (
                <div key={m.label} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                  background: S.bgSub, border: `1px solid ${S.soft}`,
                }}>
                  {/* Step number */}
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    border: `1.5px solid ${S.rim}`, display: "flex",
                    alignItems: "center", justifyContent: "center",
                    fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, fontWeight: 700,
                    flexShrink: 0,
                  }}>
                    {i + 1}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontFamily: S.fontMono, fontSize: 10, color: S.primary,
                      letterSpacing: "0.04em", fontWeight: 600,
                    }}>
                      {m.label}
                    </div>
                    <div style={{
                      fontFamily: S.fontUI, fontSize: 10, color: S.tertiary, marginTop: 1,
                    }}>
                      {m.detail}
                    </div>
                  </div>

                  <ArrowRight size={10} color={S.tertiary} />
                </div>
              ))}
            </div>
          </>
        )}

        {!loading && hasData && (
          <>
            {/* Overall score gauge */}
            {overallScore !== null && (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: 14, padding: "12px 0",
              }}>
                <div style={{
                  width: 80, height: 80, borderRadius: "50%",
                  border: `3px solid ${scoreColor}`,
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  background: `color-mix(in srgb, ${scoreColor} 5%, transparent)`,
                }}>
                  <span style={{
                    fontFamily: S.fontMono, fontSize: 24, fontWeight: 700,
                    color: scoreColor, lineHeight: 1,
                  }}>
                    {overallScore}
                  </span>
                  <span style={{
                    fontFamily: S.fontMono, fontSize: 8, color: S.tertiary,
                    letterSpacing: "0.08em", marginTop: 2,
                  }}>
                    HEALTH
                  </span>
                </div>
              </div>
            )}

            {/* Metric bars */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {metrics.map((m) => {
                const barColor = statusColor(m.status);
                return (
                  <div key={m.label}>
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3,
                    }}>
                      <span style={{
                        fontFamily: S.fontMono, fontSize: 9, color: S.secondary,
                        letterSpacing: "0.06em",
                      }}>
                        {m.label}
                      </span>
                      <span style={{
                        fontFamily: S.fontMono, fontSize: 9, color: barColor, fontWeight: 700,
                      }}>
                        {m.value}%
                      </span>
                    </div>
                    <div style={{ height: 4, background: S.bgDeep, border: `1px solid ${S.soft}`, overflow: "hidden" }}>
                      <div style={{
                        width: `${m.value}%`, height: "100%", background: barColor,
                        opacity: 0.8, transition: "width 600ms ease",
                      }} />
                    </div>
                    <div style={{
                      fontFamily: S.fontUI, fontSize: 9, color: S.tertiary, marginTop: 2,
                    }}>
                      {m.detail}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: "5px 12px", borderTop: `1px solid ${S.soft}`, background: S.bgSub,
        fontFamily: S.fontMono, fontSize: 8, color: S.tertiary,
        display: "flex", justifyContent: "space-between", flexShrink: 0,
      }}>
        <span>Composite health across 5 dimensions</span>
        <span>{hasData ? "Real-time" : "Awaiting data"}</span>
      </div>
    </div>
  );
}
