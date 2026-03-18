"use client";

import { useEffect, useState, useCallback } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";

const S = {
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:    "var(--bg-deep)",
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  rim:       "var(--border-rim)",
  soft:      "var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber)",
  red:       "var(--accent-red)",
  pass:      "var(--status-pass)",
  fail:      "var(--status-fail)",
} as const;

interface PrevPeriod {
  signups: number;
  active_users: number;
  calc_runs: number;
  audit_runs: number;
}

interface PlatformMetrics {
  total_users: number;
  signups_in_period: number;
  active_users_in_period: number;
  total_companies: number;
  smb_companies: number;
  enterprise_companies: number;
  free_users: number;
  calc_runs_in_period: number;
  audit_runs_in_period: number;
  mrr_usd: number;
  period_days: number;
  conversions_in_period?: number;
  prev_period?: PrevPeriod;
}

interface FunnelStep {
  label: string;
  count: number;
  pct: number;
}

interface ActivityEvent {
  id: string;
  event_type: string;
  description: string;
  actor_email?: string | null;
  company_name?: string | null;
  hash?: string | null;
  created_at: string;
}

function calcDelta(current: number, prev: number): { pct: number; dir: "up" | "down" | "flat" } {
  if (prev === 0) return { pct: 0, dir: "flat" };
  const pct = Math.round(((current - prev) / prev) * 100);
  return { pct: Math.abs(pct), dir: pct > 0 ? "up" : pct < 0 ? "down" : "flat" };
}

function TrendBadge({ current, prev }: { current: number; prev: number }) {
  const delta = calcDelta(current, prev);
  if (delta.dir === "flat" && delta.pct === 0 && prev === 0) return null;
  const color = delta.dir === "up" ? S.pass : delta.dir === "down" ? S.fail : S.tertiary;
  const arrow = delta.dir === "up" ? "▲" : delta.dir === "down" ? "▼" : "—";
  return (
    <span style={{
      fontFamily: S.fontMono,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: "0.05em",
      color,
      background: `color-mix(in srgb,${color} 10%,transparent)`,
      border: `1px solid color-mix(in srgb,${color} 25%,transparent)`,
      padding: "2px 7px",
      borderRadius: 3,
      display: "inline-flex",
      alignItems: "center",
      gap: 3,
    }}>
      {arrow} {delta.pct}%
    </span>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: S.bgPanel,
      border: `1px solid ${S.rim}`,
      marginBottom: 20,
      overflow: "hidden",
    }}>
      <div style={{
        borderBottom: `1px solid ${S.rim}`,
        padding: "10px 16px",
        background: S.bgSub,
      }}>
        <span style={{
          fontFamily: S.fontMono,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: S.secondary,
        }}>
          {title}
        </span>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  color,
  prev,
}: {
  label: string;
  value: number | string;
  color: string;
  prev?: number;
}) {
  const numericValue = typeof value === "number" ? value : null;
  const hasTrend = prev !== undefined && numericValue !== null;
  return (
    <div style={{
      background: S.bgSub,
      border: `1px solid ${S.rim}`,
      padding: "14px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 6,
      minWidth: 150,
    }}>
      <span style={{
        fontFamily: S.fontMono,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.1em",
        color: S.tertiary,
        textTransform: "uppercase" as const,
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: S.fontMono,
        fontSize: 28,
        fontWeight: 700,
        color,
        lineHeight: 1,
      }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </span>
      {hasTrend && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
          <TrendBadge current={numericValue as number} prev={prev as number} />
          <span style={{
            fontFamily: S.fontMono,
            fontSize: 10,
            color: S.tertiary,
          }}>
            vs prev period
          </span>
        </div>
      )}
    </div>
  );
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  LOGIN: "var(--accent-cyan)",
  LOGOUT: "var(--text-tertiary)",
  CALCULATION_RUN: "var(--accent-amber)",
  POLICY_CREATED: "var(--status-pass)",
  POLICY_UPDATED: "var(--status-pass)",
  POSITION_CREATED: "var(--accent-cyan)",
  POSITION_UPDATED: "var(--accent-amber)",
  EXECUTION_PROPOSAL: "var(--accent-amber)",
  USER_CREATED: "var(--status-pass)",
  AUDIT_RUN: "var(--accent-cyan)",
};

function eventColor(type: string): string {
  return EVENT_TYPE_COLORS[type] ?? "var(--text-tertiary)";
}

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function MetricsTab({ token }: { token: string }) {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [funnelSteps, setFunnelSteps] = useState<FunnelStep[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async (d: number) => {
    setLoading(true);
    setError(null);
    try {
      const [mRes, fRes] = await Promise.all([
        dashboardFetch(`/v1/admin/metrics?days=${d}`, token),
        dashboardFetch(`/v1/admin/metrics/funnel?days=${d}`, token),
      ]);
      if (!mRes.ok) throw new Error(`HTTP ${mRes.status}`);
      if (!fRes.ok) throw new Error(`HTTP ${fRes.status}`);
      const m = (await mRes.json()) as PlatformMetrics;
      const f = (await fRes.json()) as { steps: FunnelStep[] };
      setMetrics(m);
      setFunnelSteps(f.steps ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await dashboardFetch("/v1/admin/activity?limit=50", token);
      if (!res.ok) return;
      const data = (await res.json()) as ActivityEvent[];
      setActivity(data);
    } catch {
      // non-fatal
    }
  }, [token]);

  useEffect(() => {
    fetchMetrics(days);
    fetchActivity();
  }, [days, fetchMetrics, fetchActivity]);

  const PERIOD_OPTIONS: Array<7 | 30 | 90> = [7, 30, 90];

  return (
    <div style={{ padding: 24, fontFamily: S.fontUI }}>
      {/* Period selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <span style={{
          fontFamily: S.fontMono,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.07em",
          color: S.tertiary,
          marginRight: 4,
        }}>
          PERIOD
        </span>
        {PERIOD_OPTIONS.map((opt) => {
          const isSelected = days === opt;
          return (
            <button
              key={opt}
              onClick={() => setDays(opt)}
              style={{
                background: isSelected ? S.cyan : "transparent",
                color: isSelected ? S.bgDeep : S.tertiary,
                border: `1px solid ${isSelected ? S.cyan : S.rim}`,
                fontFamily: S.fontMono,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.07em",
                padding: "3px 10px",
                cursor: "pointer",
              }}
            >
              {opt}d
            </button>
          );
        })}
      </div>

      {error && (
        <div style={{
          background: `color-mix(in srgb,${S.red} 10%,transparent)`,
          border: `1px solid ${S.red}`,
          color: S.red,
          fontFamily: S.fontMono,
          fontSize: 11,
          padding: "8px 12px",
          marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{
          fontFamily: S.fontMono,
          fontSize: 11,
          color: S.tertiary,
          marginBottom: 16,
        }}>
          LOADING...
        </div>
      )}

      {/* KPI Cards */}
      <SectionCard title={`PLATFORM KPIs — LAST ${days} DAYS`}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,minmax(150px,1fr))",
          gap: 12,
        }}>
          <KpiCard label="TOTAL USERS" value={metrics?.total_users ?? 0} color={S.cyan} />
          <KpiCard
            label="SIGNUPS IN PERIOD"
            value={metrics?.signups_in_period ?? 0}
            color={S.pass}
            prev={metrics?.prev_period?.signups}
          />
          <KpiCard
            label="ACTIVE USERS"
            value={metrics?.active_users_in_period ?? 0}
            color={S.pass}
            prev={metrics?.prev_period?.active_users}
          />
          <KpiCard label="TOTAL COMPANIES" value={metrics?.total_companies ?? 0} color={S.cyan} />
          <KpiCard label="SMB COMPANIES" value={metrics?.smb_companies ?? 0} color={S.secondary} />
          <KpiCard label="ENTERPRISE COMPANIES" value={metrics?.enterprise_companies ?? 0} color={S.amber} />
          <KpiCard
            label="CALC RUNS"
            value={metrics?.calc_runs_in_period ?? 0}
            color={S.amber}
            prev={metrics?.prev_period?.calc_runs}
          />
          <KpiCard
            label="AUDIT RUNS"
            value={metrics?.audit_runs_in_period ?? 0}
            color={S.secondary}
            prev={metrics?.prev_period?.audit_runs}
          />
        </div>
      </SectionCard>

      {/* Conversion Funnel */}
      <SectionCard title="CONVERSION FUNNEL">
        {funnelSteps.length === 0 ? (
          <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
            No funnel data
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {funnelSteps.map((step, idx) => {
              const prev = idx > 0 ? funnelSteps[idx - 1] : null;
              const dropPp = prev !== null ? prev.pct - step.pct : 0;
              return (
                <div key={step.label}>
                  {/* Drop-off row between steps */}
                  {prev !== null && dropPp > 0 && (
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 0 4px 8px",
                      marginBottom: 4,
                    }}>
                      <span style={{
                        fontFamily: S.fontMono,
                        fontSize: 10,
                        fontWeight: 700,
                        color: S.amber,
                        letterSpacing: "0.04em",
                      }}>
                        ▼ -{dropPp} pp drop-off
                      </span>
                    </div>
                  )}
                  {/* Funnel step bar */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{
                      position: "relative",
                      background: S.bgSub,
                      border: `1px solid ${S.rim}`,
                      height: 32,
                      overflow: "hidden",
                    }}>
                      {/* Colored fill */}
                      <div style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        height: "100%",
                        width: `${step.pct}%`,
                        background: `linear-gradient(90deg, ${S.cyan}, color-mix(in srgb,${S.cyan} 45%,${S.bgSub}))`,
                        transition: "width 0.5s ease-out",
                      }} />
                      {/* Left label */}
                      <span style={{
                        position: "absolute",
                        left: 10,
                        top: "50%",
                        transform: "translateY(-50%)",
                        fontFamily: S.fontMono,
                        fontSize: 11,
                        fontWeight: 700,
                        color: S.primary,
                        letterSpacing: "0.06em",
                        zIndex: 1,
                        whiteSpace: "nowrap" as const,
                      }}>
                        {step.label.toUpperCase()} ({step.count})
                      </span>
                      {/* Right label */}
                      <span style={{
                        position: "absolute",
                        right: 10,
                        top: "50%",
                        transform: "translateY(-50%)",
                        fontFamily: S.fontMono,
                        fontSize: 11,
                        fontWeight: 700,
                        color: step.pct > 0 ? S.cyan : S.tertiary,
                        zIndex: 1,
                      }}>
                        {step.pct}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Live Activity Feed */}
      <SectionCard title="LIVE ACTIVITY FEED — LAST 50 EVENTS">
        {activity.length === 0 ? (
          <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
            No activity events
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {activity.map((ev) => (
              <div
                key={ev.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 1fr 160px 130px 130px",
                  gap: 10,
                  alignItems: "center",
                  padding: "7px 10px",
                  background: S.bgSub,
                  border: `1px solid ${S.rim}`,
                  fontSize: 11,
                }}
              >
                {/* Event type badge */}
                <span style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  color: eventColor(ev.event_type),
                  background: `color-mix(in srgb,${eventColor(ev.event_type)} 10%,transparent)`,
                  border: `1px solid color-mix(in srgb,${eventColor(ev.event_type)} 25%,transparent)`,
                  padding: "1px 6px",
                  whiteSpace: "nowrap" as const,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}>
                  {ev.event_type}
                </span>

                {/* Description */}
                <span style={{
                  fontFamily: S.fontUI,
                  fontSize: 12,
                  color: S.primary,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap" as const,
                }}>
                  {ev.description ?? "—"}
                </span>

                {/* Actor email */}
                <span style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  color: S.tertiary,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap" as const,
                }}>
                  {ev.actor_email ?? "—"}
                </span>

                {/* Company */}
                <span style={{
                  fontFamily: S.fontUI,
                  fontSize: 11,
                  color: S.secondary,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap" as const,
                }}>
                  {ev.company_name ?? "—"}
                </span>

                {/* Timestamp */}
                <span style={{
                  fontFamily: S.fontMono,
                  fontSize: 10,
                  color: S.tertiary,
                  textAlign: "right" as const,
                }}>
                  {ev.created_at ? formatTs(ev.created_at) : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
