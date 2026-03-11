"use client";

/**
 * Admin Monitor — Platform Operations Dashboard
 *
 * Superuser-only control center for ORDR Terminal operations.
 * Displays system health, service status, database statistics,
 * engine module status, live activity feed, and platform metrics.
 *
 * Bloomberg NOC aesthetic: dark panels, green/amber/red status indicators,
 * monospace data, real-time pulse animations.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { PageShell } from "@/components/layout/PageShell";
import { Monitor } from "lucide-react";

// ── Design Tokens ────────────────────────────────────────────────────────────
const T = {
  fontUI:   "'IBM Plex Sans', var(--font-terminal, sans-serif)",
  fontMono: "'IBM Plex Mono', var(--font-terminal-mono, monospace)",
  // Deep dark NOC background
  bgDeep:    "#0A0E1A",
  bgPanel:   "#111827",
  bgCard:    "#1A2236",
  bgCardAlt: "#151D2E",
  bgHover:   "#1E293B",
  border:    "#1E293B",
  borderLit: "#2D3A54",
  // Text
  text:      "#E2E8F0",
  textDim:   "#94A3B8",
  textFaint: "#475569",
  textWhite: "#F8FAFC",
  // Status
  green:     "#10B981",
  greenDim:  "rgba(16,185,129,0.12)",
  greenGlow: "rgba(16,185,129,0.30)",
  amber:     "#F59E0B",
  amberDim:  "rgba(245,158,11,0.12)",
  amberGlow: "rgba(245,158,11,0.30)",
  red:       "#EF4444",
  redDim:    "rgba(239,68,68,0.12)",
  redGlow:   "rgba(239,68,68,0.30)",
  blue:      "#3B82F6",
  blueDim:   "rgba(59,130,246,0.12)",
  blueGlow:  "rgba(59,130,246,0.30)",
  cyan:      "#06B6D4",
  cyanDim:   "rgba(6,182,212,0.10)",
} as const;

// ── Types ────────────────────────────────────────────────────────────────────
interface ServiceInfo {
  name: string;
  status: "running" | "degraded" | "stopped" | "unknown";
  uptime_seconds?: number;
  last_check?: string;
  details?: string;
}

interface TableInfo {
  name: string;
  row_count: number;
  last_insert?: string;
}

interface EngineModule {
  name: string;
  file_exists: boolean;
  status: "wired" | "unwired";
  imported_by?: string;
}

interface ErrorGroup {
  event_type: string;
  count: number;
  latest?: string;
}

interface ActivityEvent {
  id: string;
  event_type: string;
  description: string;
  entity_type?: string;
  actor_email?: string;
  company_name?: string;
  created_at?: string;
  hash?: string;
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
}

interface FunnelStep {
  label: string;
  count: number;
  pct: number;
}

interface HealthData {
  status: string;
  database: string;
  timestamp: string;
  python_version?: string;
  uptime_seconds?: number;
  memory_mb?: number;
  db_connections?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h < 24) return `${h}h ${m}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ── Status Badge Component ───────────────────────────────────────────────────
function StatusDot({ status }: { status: string }) {
  const color =
    status === "running" || status === "online" || status === "ok" || status === "wired"
      ? T.green
      : status === "degraded" || status === "unknown"
        ? T.amber
        : T.red;
  const glow =
    color === T.green ? T.greenGlow : color === T.amber ? T.amberGlow : T.redGlow;

  return (
    <span style={{
      display: "inline-block",
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: color,
      boxShadow: `0 0 6px ${glow}`,
      animation: status === "running" || status === "online" || status === "ok" ? "nocPulse 2s ease-in-out infinite" : "none",
    }} />
  );
}

// ── Metric Card ──────────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, color }: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div style={{
      background: T.bgCard,
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      padding: "16px 20px",
      minWidth: 140,
      flex: "1 1 140px",
    }}>
      <div style={{
        fontFamily: T.fontMono,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.14em",
        color: T.textDim,
        textTransform: "uppercase",
        marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: T.fontMono,
        fontSize: 28,
        fontWeight: 700,
        color: color ?? T.textWhite,
        lineHeight: 1,
      }}>
        {typeof value === "number" ? formatNumber(value) : value}
      </div>
      {sub && (
        <div style={{
          fontFamily: T.fontUI,
          fontSize: 12,
          color: T.textFaint,
          marginTop: 4,
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Panel Header ─────────────────────────────────────────────────────────────
function PanelHeader({ title, icon, count, action }: {
  title: string;
  icon: string;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "12px 16px",
      borderBottom: `1px solid ${T.border}`,
      background: T.bgCardAlt,
      borderRadius: "8px 8px 0 0",
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{
        fontFamily: T.fontMono,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.12em",
        color: T.textDim,
        textTransform: "uppercase",
        flex: 1,
      }}>
        {title}
      </span>
      {count !== undefined && (
        <span style={{
          fontFamily: T.fontMono,
          fontSize: 12,
          fontWeight: 600,
          color: T.cyan,
          background: T.cyanDim,
          padding: "2px 8px",
          borderRadius: 4,
        }}>
          {count}
        </span>
      )}
      {action}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

export default function AdminMonitorPage() {
  const { user, token, isAuthenticated } = useAuth();

  // Data states
  const [health, setHealth] = useState<HealthData | null>(null);
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [engines, setEngines] = useState<EngineModule[]>([]);
  const [errors, setErrors] = useState<ErrorGroup[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [funnel, setFunnel] = useState<FunnelStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [restartLoading, setRestartLoading] = useState<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch all data
  const fetchAll = useCallback(async () => {
    if (!token) return;

    const endpoints = [
      { key: "health",   path: "/v1/admin/monitor/health" },
      { key: "services", path: "/v1/admin/monitor/services" },
      { key: "tables",   path: "/v1/admin/monitor/tables" },
      { key: "engines",  path: "/v1/admin/monitor/engine" },
      { key: "errors",   path: "/v1/admin/monitor/errors" },
      { key: "activity", path: "/v1/admin/activity?limit=50" },
      { key: "metrics",  path: "/v1/admin/metrics?days=30" },
      { key: "funnel",   path: "/v1/admin/metrics/funnel?days=30" },
    ];

    const results = await Promise.allSettled(
      endpoints.map(async ep => {
        const res = await dashboardFetch(ep.path, token);
        if (!res.ok) return { key: ep.key, data: null };
        return { key: ep.key, data: await res.json() };
      })
    );

    for (const result of results) {
      if (result.status !== "fulfilled" || !result.value?.data) continue;
      const { key, data } = result.value;
      switch (key) {
        case "health": {
          // Map backend shape to our HealthData
          setHealth({
            status: data.status === "healthy" ? "ok" : data.status,
            database: data.database?.reachable ? "ok" : "down",
            timestamp: data.timestamp_utc ?? data.timestamp ?? "",
            python_version: data.python_version,
            uptime_seconds: data.uptime_seconds,
            memory_mb: data.memory?.rss_mb,
            db_connections: data.database?.active_connections,
          });
          break;
        }
        case "services": {
          const svcList = Array.isArray(data) ? data : data.services ?? [];
          setServices(svcList.map((s: Record<string, unknown>) => ({
            name: s.name === "backend_api" ? "Backend API"
              : s.name === "database" ? "Database"
              : s.name === "redis" ? "Redis"
              : s.name === "celery" ? "Celery Worker"
              : String(s.name ?? ""),
            status: String(s.status ?? "unknown"),
            uptime_seconds: typeof s.uptime_seconds === "number" ? s.uptime_seconds : undefined,
            details: s.uptime_human ? String(s.uptime_human) : undefined,
          }) as ServiceInfo));
          break;
        }
        case "tables":   setTables(Array.isArray(data) ? data : data.tables ?? []); break;
        case "engines":  setEngines(Array.isArray(data) ? data : data.modules ?? []); break;
        case "errors":   setErrors(Array.isArray(data) ? data : data.by_type ?? []); break;
        case "activity": setActivity(Array.isArray(data) ? data : []); break;
        case "metrics":  setMetrics(data); break;
        case "funnel":   setFunnel(data.steps ?? []); break;
      }
    }

    setLoading(false);
    setLastRefresh(new Date());
  }, [token]);

  useEffect(() => {
    fetchAll();
    refreshTimer.current = setInterval(fetchAll, 30_000); // Refresh every 30s
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  }, [fetchAll]);

  const handleRestart = async (service: string) => {
    if (!token) return;
    setRestartLoading(service);
    try {
      const res = await dashboardFetch(`/v1/admin/monitor/restart/${service}`, token, { method: "POST" });
      if (res.ok) {
        // Refresh data after restart
        setTimeout(fetchAll, 1000);
      }
    } catch { /* ignore */ }
    setRestartLoading(null);
  };

  // Auth gate
  if (!isAuthenticated || !user) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: T.bgDeep, color: T.textDim, fontFamily: T.fontMono }}>
        Not authenticated
      </div>
    );
  }

  if (!user.is_superuser) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", background: T.bgDeep, color: T.red, fontFamily: T.fontMono,
        flexDirection: "column", gap: 12,
      }}>
        <span style={{ fontSize: 48, opacity: 0.3 }}>&#x26D4;</span>
        <span style={{ fontSize: 13, letterSpacing: "0.1em" }}>SUPERUSER ACCESS REQUIRED</span>
        <span style={{ fontSize: 12, color: T.textFaint }}>This page is restricted to platform administrators</span>
      </div>
    );
  }

  const serviceColor = (s: string) =>
    s === "running" ? T.green : s === "degraded" ? T.amber : s === "stopped" ? T.red : T.textFaint;

  const wiredCount = engines.filter(e => e.status === "wired").length;
  const totalEngines = engines.length;

  return (
    <PageShell icon={Monitor} title="Admin Monitor" breadcrumb={["Dashboard", "Admin Monitor"]} noPadding>
      <style>{`
        @keyframes nocPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes scanline {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .noc-row:hover {
          background: ${T.bgHover} !important;
        }
      `}</style>

      <div style={{
        color: T.text,
        fontFamily: T.fontUI,
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Scanline overlay effect */}
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          pointerEvents: "none",
          zIndex: 999,
          background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
          opacity: 0.5,
        }} />

        {/* Header bar */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 32px",
          borderBottom: `1px solid ${T.border}`,
          background: "rgba(17,24,39,0.95)",
          backdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: `linear-gradient(135deg, ${T.blue} 0%, #6366F1 100%)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: `0 2px 12px ${T.blueGlow}`,
            }}>
              <span style={{ fontFamily: T.fontMono, fontSize: 14, fontWeight: 800, color: "#fff" }}>O</span>
            </div>
            <div>
              <div style={{
                fontFamily: T.fontMono,
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: "0.16em",
                color: T.textWhite,
              }}>
                ORDR TERMINAL
              </div>
              <div style={{
                fontFamily: T.fontMono,
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: "0.2em",
                color: T.textFaint,
                marginTop: 1,
              }}>
                PLATFORM OPERATIONS CENTER
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {/* Live indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <StatusDot status={health?.status === "ok" ? "online" : "degraded"} />
              <span style={{
                fontFamily: T.fontMono,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.1em",
                color: health?.status === "ok" ? T.green : T.amber,
              }}>
                {health?.status === "ok" ? "ALL SYSTEMS OPERATIONAL" : "CHECKING..."}
              </span>
            </div>

            {/* Last refresh */}
            <span style={{
              fontFamily: T.fontMono,
              fontSize: 12,
              color: T.textFaint,
            }}>
              {lastRefresh.toLocaleTimeString()} UTC
            </span>

            {/* Refresh button */}
            <button
              onClick={() => { setLoading(true); fetchAll(); }}
              style={{
                fontFamily: T.fontMono,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.08em",
                color: T.blue,
                background: T.blueDim,
                border: `1px solid rgba(59,130,246,0.2)`,
                borderRadius: 6,
                padding: "6px 14px",
                cursor: "pointer",
                transition: "all 100ms",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(59,130,246,0.2)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = T.blueDim; }}
            >
              {loading ? "LOADING..." : "REFRESH"}
            </button>
          </div>
        </div>

        {/* Main content */}
        <div style={{ padding: "24px 32px", maxWidth: 1600, margin: "0 auto" }}>

          {/* ── Row 1: Key Metrics ─────────────────────────────────────────── */}
          <div style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 24,
            animation: "fadeSlideUp 300ms ease-out",
          }}>
            <MetricCard label="Total Users" value={metrics?.total_users ?? 0} sub={`+${metrics?.signups_in_period ?? 0} this period`} color={T.blue} />
            <MetricCard label="Active Users" value={metrics?.active_users_in_period ?? 0} sub={`${metrics?.period_days ?? 30}d window`} color={T.green} />
            <MetricCard label="Companies" value={metrics?.total_companies ?? 0} sub={`${metrics?.enterprise_companies ?? 0} enterprise`} />
            <MetricCard label="Calc Runs" value={metrics?.calc_runs_in_period ?? 0} sub={`${metrics?.period_days ?? 30}d window`} color={T.cyan} />
            <MetricCard label="Audit Runs" value={metrics?.audit_runs_in_period ?? 0} sub="Audit Lab analyses" />
            <MetricCard
              label="System Uptime"
              value={health?.uptime_seconds ? formatUptime(health.uptime_seconds) : "—"}
              sub={health?.python_version ? `Python ${health.python_version}` : undefined}
              color={T.green}
            />
            <MetricCard
              label="Memory"
              value={health?.memory_mb ? `${health.memory_mb}MB` : "—"}
              sub={health?.db_connections ? `${health.db_connections} DB conns` : undefined}
              color={T.amber}
            />
          </div>

          {/* ── Row 2: Services + Health (2 panels) ────────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24, animation: "fadeSlideUp 400ms ease-out" }}>

            {/* Services Panel */}
            <div style={{ background: T.bgPanel, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
              <PanelHeader title="Service Status" icon="&#x1F6E0;" count={services.length} />
              <div style={{ padding: 0 }}>
                {services.length === 0 ? (
                  <div style={{ padding: 24, textAlign: "center", color: T.textFaint, fontFamily: T.fontMono, fontSize: 12 }}>
                    Loading services...
                  </div>
                ) : (
                  services.map((svc, i) => (
                    <div
                      key={svc.name}
                      className="noc-row"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 16px",
                        borderBottom: i < services.length - 1 ? `1px solid ${T.border}` : "none",
                        transition: "background 80ms",
                      }}
                    >
                      <StatusDot status={svc.status} />
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontFamily: T.fontMono,
                          fontSize: 12,
                          fontWeight: 600,
                          color: T.text,
                        }}>
                          {svc.name}
                        </div>
                        {svc.details && (
                          <div style={{ fontFamily: T.fontUI, fontSize: 12, color: T.textFaint, marginTop: 1 }}>
                            {svc.details}
                          </div>
                        )}
                      </div>
                      <span style={{
                        fontFamily: T.fontMono,
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: "0.06em",
                        color: serviceColor(svc.status),
                        textTransform: "uppercase",
                      }}>
                        {svc.status}
                      </span>
                      {svc.uptime_seconds !== undefined && (
                        <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.textFaint }}>
                          {formatUptime(svc.uptime_seconds)}
                        </span>
                      )}
                      {svc.name === "Backend API" && (
                        <button
                          onClick={() => handleRestart("cache")}
                          disabled={restartLoading === "cache"}
                          style={{
                            fontFamily: T.fontMono, fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
                            color: T.amber, background: T.amberDim,
                            border: `1px solid rgba(245,158,11,0.2)`, borderRadius: 4, padding: "3px 8px",
                            cursor: restartLoading === "cache" ? "wait" : "pointer",
                            opacity: restartLoading === "cache" ? 0.5 : 1,
                          }}
                        >
                          {restartLoading === "cache" ? "..." : "CLEAR CACHE"}
                        </button>
                      )}
                      {svc.name === "Celery Worker" && (
                        <button
                          onClick={() => handleRestart("scheduler")}
                          disabled={restartLoading === "scheduler"}
                          style={{
                            fontFamily: T.fontMono, fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
                            color: T.amber, background: T.amberDim,
                            border: `1px solid rgba(245,158,11,0.2)`, borderRadius: 4, padding: "3px 8px",
                            cursor: restartLoading === "scheduler" ? "wait" : "pointer",
                            opacity: restartLoading === "scheduler" ? 0.5 : 1,
                          }}
                        >
                          {restartLoading === "scheduler" ? "..." : "RESTART"}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Conversion Funnel */}
            <div style={{ background: T.bgPanel, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
              <PanelHeader title="Conversion Funnel" icon="&#x1F4CA;" count={funnel.length} />
              <div style={{ padding: 16 }}>
                {funnel.map((step, i) => (
                  <div key={step.label} style={{ marginBottom: i < funnel.length - 1 ? 12 : 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.text }}>
                        {step.label}
                      </span>
                      <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.textDim }}>
                        {step.count} ({step.pct}%)
                      </span>
                    </div>
                    <div style={{
                      height: 6,
                      borderRadius: 3,
                      background: T.bgCard,
                      overflow: "hidden",
                    }}>
                      <div style={{
                        height: "100%",
                        width: `${Math.max(step.pct, 2)}%`,
                        borderRadius: 3,
                        background: i === 0
                          ? T.blue
                          : i === funnel.length - 1
                            ? T.green
                            : `linear-gradient(90deg, ${T.blue}, ${T.cyan})`,
                        transition: "width 500ms ease-out",
                      }} />
                    </div>
                  </div>
                ))}
                {funnel.length === 0 && (
                  <div style={{ textAlign: "center", color: T.textFaint, fontFamily: T.fontMono, fontSize: 12, padding: 16 }}>
                    No funnel data
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Row 3: Database Tables + Engine Modules ────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24, animation: "fadeSlideUp 500ms ease-out" }}>

            {/* Database Tables */}
            <div style={{ background: T.bgPanel, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
              <PanelHeader title="Database Tables" icon="&#x1F4BE;" count={tables.length} />
              <div style={{ maxHeight: 380, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: `${T.border} transparent` }}>
                {/* Header row */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 100px 120px",
                  gap: 8,
                  padding: "8px 16px",
                  borderBottom: `1px solid ${T.border}`,
                  background: T.bgCardAlt,
                  position: "sticky",
                  top: 0,
                }}>
                  <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", color: T.textFaint, textTransform: "uppercase" }}>Table</span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", color: T.textFaint, textTransform: "uppercase", textAlign: "right" }}>Rows</span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", color: T.textFaint, textTransform: "uppercase", textAlign: "right" }}>Last Insert</span>
                </div>
                {tables.map((t, i) => (
                  <div
                    key={t.name}
                    className="noc-row"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 100px 120px",
                      gap: 8,
                      padding: "8px 16px",
                      borderBottom: i < tables.length - 1 ? `1px solid ${T.border}` : "none",
                      transition: "background 80ms",
                    }}
                  >
                    <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.text }}>{t.name}</span>
                    <span style={{
                      fontFamily: T.fontMono,
                      fontSize: 12,
                      fontWeight: 600,
                      color: t.row_count > 0 ? T.green : T.textFaint,
                      textAlign: "right",
                    }}>
                      {formatNumber(t.row_count)}
                    </span>
                    <span style={{
                      fontFamily: T.fontMono,
                      fontSize: 12,
                      color: T.textFaint,
                      textAlign: "right",
                    }}>
                      {t.last_insert ? timeAgo(t.last_insert) : "—"}
                    </span>
                  </div>
                ))}
                {tables.length === 0 && (
                  <div style={{ padding: 24, textAlign: "center", color: T.textFaint, fontFamily: T.fontMono, fontSize: 12 }}>
                    Loading table stats...
                  </div>
                )}
              </div>
            </div>

            {/* Engine Modules */}
            <div style={{ background: T.bgPanel, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
              <PanelHeader
                title="Engine Modules"
                icon="&#x2699;"
                count={totalEngines}
                action={
                  <span style={{
                    fontFamily: T.fontMono,
                    fontSize: 12,
                    color: wiredCount === totalEngines ? T.green : T.amber,
                  }}>
                    {wiredCount}/{totalEngines} wired
                  </span>
                }
              />
              <div style={{ maxHeight: 380, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: `${T.border} transparent` }}>
                {engines.map((eng, i) => (
                  <div
                    key={eng.name}
                    className="noc-row"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "7px 16px",
                      borderBottom: i < engines.length - 1 ? `1px solid ${T.border}` : "none",
                      transition: "background 80ms",
                    }}
                  >
                    <StatusDot status={eng.status} />
                    <span style={{
                      fontFamily: T.fontMono,
                      fontSize: 12,
                      color: T.text,
                      flex: 1,
                    }}>
                      {eng.name}
                    </span>
                    {eng.imported_by && (
                      <span style={{
                        fontFamily: T.fontMono,
                        fontSize: 12,
                        color: T.textFaint,
                        maxWidth: 140,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {eng.imported_by}
                      </span>
                    )}
                    <span style={{
                      fontFamily: T.fontMono,
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      color: eng.status === "wired" ? T.green : T.textFaint,
                      background: eng.status === "wired" ? T.greenDim : "rgba(71,85,105,0.1)",
                      padding: "2px 6px",
                      borderRadius: 3,
                    }}>
                      {eng.status.toUpperCase()}
                    </span>
                  </div>
                ))}
                {engines.length === 0 && (
                  <div style={{ padding: 24, textAlign: "center", color: T.textFaint, fontFamily: T.fontMono, fontSize: 12 }}>
                    Loading engine modules...
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Row 4: Error Summary + Live Activity ───────────────────────── */}
          <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 16, marginBottom: 24, animation: "fadeSlideUp 600ms ease-out" }}>

            {/* Error Summary */}
            <div style={{ background: T.bgPanel, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
              <PanelHeader title="Errors (24h)" icon="&#x26A0;" count={errors.reduce((a, e) => a + e.count, 0)} />
              <div style={{ padding: 0 }}>
                {errors.length === 0 ? (
                  <div style={{
                    padding: 32,
                    textAlign: "center",
                    color: T.green,
                    fontFamily: T.fontMono,
                    fontSize: 12,
                  }}>
                    <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.5 }}>&#x2713;</div>
                    No errors in last 24h
                  </div>
                ) : (
                  errors.map((err, i) => (
                    <div
                      key={err.event_type}
                      className="noc-row"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 16px",
                        borderBottom: i < errors.length - 1 ? `1px solid ${T.border}` : "none",
                        transition: "background 80ms",
                      }}
                    >
                      <span style={{
                        fontFamily: T.fontMono,
                        fontSize: 12,
                        color: T.red,
                        flex: 1,
                      }}>
                        {err.event_type}
                      </span>
                      <span style={{
                        fontFamily: T.fontMono,
                        fontSize: 12,
                        fontWeight: 700,
                        color: T.red,
                        background: T.redDim,
                        padding: "2px 8px",
                        borderRadius: 4,
                      }}>
                        {err.count}
                      </span>
                      {err.latest && (
                        <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.textFaint }}>
                          {timeAgo(err.latest)}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Live Activity Feed */}
            <div style={{ background: T.bgPanel, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
              <PanelHeader title="Live Activity Feed" icon="&#x1F4E1;" count={activity.length} />
              <div style={{ maxHeight: 400, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: `${T.border} transparent` }}>
                {activity.map((evt, i) => (
                  <div
                    key={evt.id}
                    className="noc-row"
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "8px 16px",
                      borderBottom: i < activity.length - 1 ? `1px solid ${T.border}` : "none",
                      transition: "background 80ms",
                    }}
                  >
                    {/* Event type badge */}
                    <span style={{
                      fontFamily: T.fontMono,
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: "0.04em",
                      color: evt.event_type?.includes("error") || evt.event_type?.includes("fail")
                        ? T.red
                        : evt.event_type?.includes("create") || evt.event_type?.includes("insert")
                          ? T.green
                          : T.blue,
                      background: evt.event_type?.includes("error") || evt.event_type?.includes("fail")
                        ? T.redDim
                        : evt.event_type?.includes("create") || evt.event_type?.includes("insert")
                          ? T.greenDim
                          : T.blueDim,
                      padding: "2px 6px",
                      borderRadius: 3,
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                      marginTop: 2,
                    }}>
                      {evt.event_type}
                    </span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: T.fontUI,
                        fontSize: 12,
                        color: T.text,
                        lineHeight: 1.4,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        {evt.description}
                      </div>
                      <div style={{ display: "flex", gap: 12, marginTop: 2 }}>
                        {evt.actor_email && (
                          <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.textFaint }}>
                            {evt.actor_email}
                          </span>
                        )}
                        {evt.company_name && (
                          <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.textFaint }}>
                            {evt.company_name}
                          </span>
                        )}
                        {evt.hash && (
                          <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.textFaint, opacity: 0.6 }}>
                            #{evt.hash}
                          </span>
                        )}
                      </div>
                    </div>

                    <span style={{
                      fontFamily: T.fontMono,
                      fontSize: 12,
                      color: T.textFaint,
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}>
                      {evt.created_at ? timeAgo(evt.created_at) : ""}
                    </span>
                  </div>
                ))}
                {activity.length === 0 && (
                  <div style={{ padding: 32, textAlign: "center", color: T.textFaint, fontFamily: T.fontMono, fontSize: 12 }}>
                    No activity yet
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Row 5: Platform Info Footer ────────────────────────────────── */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            background: T.bgPanel,
            border: `1px solid ${T.border}`,
            borderRadius: 8,
            animation: "fadeSlideUp 700ms ease-out",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.textFaint }}>
                ORDR Terminal v1.0.0
              </span>
              <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.textFaint }}>
                {health?.timestamp ? `Server: ${new Date(health.timestamp).toISOString()}` : ""}
              </span>
              <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.textFaint }}>
                {health?.python_version ? `Python ${health.python_version}` : ""}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.textFaint }}>
                Logged in as: {user.email}
              </span>
              <span style={{
                fontFamily: T.fontMono, fontSize: 12, fontWeight: 600,
                color: T.amber, background: T.amberDim,
                padding: "2px 6px", borderRadius: 3,
              }}>
                SUPERUSER
              </span>
            </div>
          </div>

        </div>
      </div>
    </PageShell>
  );
}
