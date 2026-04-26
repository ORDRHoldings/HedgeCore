"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { RefreshCw, CheckCircle, AlertTriangle, XCircle, Zap } from "lucide-react";
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HealthData {
  status: string;
  uptime_human: string;
  database: { reachable: boolean; latency_ms: number | null; active_connections: number | null };
  memory: { rss_mb: number; vms_mb: number; percent: number } | null;
}

interface ServiceItem {
  name: string;
  status: string;
  uptime_human: string | null;
  last_check: string;
}

interface TableItem {
  name: string;
  row_count: number | null;
  last_insert: string | null;
  error: string | null;
}

interface EngineModule {
  name: string;
  file_exists: boolean;
  imported_by: string | null;
  is_loaded: boolean;
  status: string;
}

interface ErrorGroup {
  event_type: string;
  count: number;
  last_seen: string | null;
}

interface ActivityEvent {
  id: string;
  event_type: string;
  description: string | null;
  entity_type: string | null;
  actor_email: string | null;
  company_name: string | null;
  created_at: string | null;
  hash: string | null;
}

interface AllData {
  health: HealthData | null;
  services: ServiceItem[];
  tables: TableItem[];
  engineModules: EngineModule[];
  engineStats: { total_modules: number; wired: number; unwired: number } | null;
  errors: { by_type: ErrorGroup[]; period_hours: number } | null;
  activity: ActivityEvent[];
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

interface ToastMsg { id: number; text: string; ok: boolean }

function Toast({ msg, onDone }: { msg: ToastMsg; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      background: msg.ok ? "var(--status-pass)" : "var(--status-fail)",
      color: "var(--bg-deep)", fontFamily: S.fontMono, fontSize: 12,
      padding: "8px 16px", borderRadius: 4, boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      transition: "opacity .2s",
    }}>
      {msg.text}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionCard helper
// ---------------------------------------------------------------------------

function SectionCard({ title, children, action }: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div style={{
      background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6,
      marginBottom: 16, overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 14px", borderBottom: `1px solid ${S.rim}`,
        background: S.bgSub,
      }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.cyan, letterSpacing: "0.08em" }}>
          {title}
        </span>
        {action}
      </div>
      <div style={{ padding: "12px 14px" }}>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function statusColor(status: string): string {
  if (status === "running" || status === "wired" || status === "loaded") return S.pass;
  if (status === "degraded" || status === "registered") return S.amber;
  if (status === "not_configured" || status === "not_available") return S.secondary;
  return S.fail;
}

function StatusDot({ status }: { status: string }) {
  return (
    <span style={{
      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
      background: statusColor(status), marginRight: 6, flexShrink: 0,
    }} />
  );
}

function fmtTs(ts: string | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

// ---------------------------------------------------------------------------
// KPI Strip
// ---------------------------------------------------------------------------

interface KpiProps { label: string; value: string; color?: string }

function Kpi({ label, value, color }: KpiProps) {
  return (
    <div style={{
      background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 4,
      padding: "10px 14px", minWidth: 100,
    }}>
      <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.1em", marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontFamily: S.fontMono, fontSize: 16, color: color ?? S.primary, fontWeight: 600 }}>
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function OperationsTab({ token }: { token: string }) {
  const [data, setData] = useState<AllData>({
    health: null, services: [], tables: [], engineModules: [],
    engineStats: null, errors: null, activity: [],
  });
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string>("");
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const toastId = useRef(0);

  const addToast = (text: string, ok: boolean) => {
    const id = ++toastId.current;
    setToasts(prev => [...prev, { id, text, ok }]);
  };

  const removeToast = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  const fetchAll = useCallback(async () => {
    try {
      const [healthRes, servicesRes, tablesRes, engineRes, errorsRes, activityRes] =
        await Promise.allSettled([
          dashboardFetch("/v1/admin/monitor/health", token),
          dashboardFetch("/v1/admin/monitor/services", token),
          dashboardFetch("/v1/admin/monitor/tables", token),
          dashboardFetch("/v1/admin/monitor/engine", token),
          dashboardFetch("/v1/admin/monitor/errors?hours=24", token),
          dashboardFetch("/v1/admin/activity?limit=50", token),
        ]);

      const safeJson = async (r: PromiseSettledResult<Response>) => {
        if (r.status === "fulfilled" && r.value.ok) return r.value.json();
        return null;
      };

      const [health, services, tables, engine, errors, activity] = await Promise.all([
        safeJson(healthRes),
        safeJson(servicesRes),
        safeJson(tablesRes),
        safeJson(engineRes),
        safeJson(errorsRes),
        safeJson(activityRes),
      ]);

      setData({
        health: health ?? null,
        services: services?.services ?? [],
        tables: tables?.tables ?? [],
        engineModules: engine?.modules ?? [],
        engineStats: engine ? { total_modules: engine.total_modules, wired: engine.wired, unwired: engine.unwired } : null,
        errors: errors ? { by_type: errors.by_type ?? [], period_hours: errors.period_hours ?? 24 } : null,
        activity: Array.isArray(activity) ? activity : [],
      });
      setLastRefresh(new Date().toLocaleTimeString());
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handleRestart = async (service: string) => {
    try {
      const res = await dashboardFetch(`/v1/admin/monitor/restart/${service}`, token, { method: "POST" });
      const json = await res.json();
      addToast(res.ok ? `${service}: ${json.message ?? "done"}` : `Error: ${json.detail ?? "failed"}`, res.ok);
    } catch {
      addToast(`${service}: request failed`, false);
    }
  };

  const h = data.health;

  return (
    <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.primary }}>
      {/* Header bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${S.rim}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Zap size={14} color={S.cyan} />
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.cyan, letterSpacing: "0.08em" }}>
            PLATFORM OPERATIONS
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {lastRefresh && (
            <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
              refreshed {lastRefresh}
            </span>
          )}
          <button
            onClick={fetchAll}
            disabled={loading}
            style={{
              background: "transparent", border: `1px solid ${S.rim}`, borderRadius: 4,
              color: S.secondary, cursor: "pointer", padding: "4px 8px",
              display: "flex", alignItems: "center", gap: 4, fontSize: 11,
            }}
          >
            <RefreshCw size={11} />
            REFRESH
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <Kpi label="UPTIME" value={h?.uptime_human ?? "—"} color={S.pass} />
        <Kpi
          label="DB LATENCY"
          value={h?.database?.latency_ms != null ? `${h.database.latency_ms} ms` : "—"}
          color={h?.database?.latency_ms != null && h.database.latency_ms > 100 ? S.amber : S.pass}
        />
        <Kpi
          label="MEMORY RSS"
          value={h?.memory?.rss_mb != null ? `${h.memory.rss_mb} MB` : "—"}
        />
        <Kpi
          label="DB CONNECTIONS"
          value={h?.database?.active_connections != null ? String(h.database.active_connections) : "—"}
        />
        {data.engineStats && (
          <>
            <Kpi label="ENGINE MODULES" value={String(data.engineStats.total_modules)} />
            <Kpi label="WIRED" value={String(data.engineStats.wired)} color={S.pass} />
            <Kpi
              label="UNWIRED"
              value={String(data.engineStats.unwired)}
              color={data.engineStats.unwired > 0 ? S.amber : S.pass}
            />
          </>
        )}
      </div>

      {/* Service Status */}
      <SectionCard title="SERVICE STATUS">
        {data.services.length === 0 ? (
          <span style={{ color: S.tertiary, fontSize: 12 }}>No service data</span>
        ) : (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {data.services.map(svc => (
              <div key={svc.name} style={{
                background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 6,
                padding: "10px 14px", minWidth: 160,
              }}>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
                  <StatusDot status={svc.status} />
                  <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.primary, fontWeight: 600 }}>
                    {svc.name.replace(/_/g, " ").toUpperCase()}
                  </span>
                </div>
                <div style={{ fontFamily: S.fontMono, fontSize: 10, color: statusColor(svc.status), marginBottom: 4 }}>
                  {svc.status.toUpperCase()}
                </div>
                {svc.uptime_human && (
                  <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
                    UP {svc.uptime_human}
                  </div>
                )}
                {(svc.name === "cache" || svc.name === "scheduler") && (
                  <button
                    onClick={() => handleRestart(svc.name)}
                    style={{
                      marginTop: 8, background: "transparent", border: `1px solid ${S.rim}`,
                      borderRadius: 3, color: S.secondary, cursor: "pointer",
                      padding: "2px 8px", fontSize: 10, fontFamily: S.fontMono,
                    }}
                  >
                    RESTART
                  </button>
                )}
              </div>
            ))}
            {/* Always show restartable services even if not in list */}
            {["cache", "scheduler"].filter(s => !data.services.find(sv => sv.name === s)).map(svc => (
              <div key={svc} style={{
                background: S.bgSub, border: `1px solid ${S.rim}`, borderRadius: 6,
                padding: "10px 14px", minWidth: 160,
              }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.primary, fontWeight: 600, marginBottom: 6 }}>
                  {svc.toUpperCase()}
                </div>
                <button
                  onClick={() => handleRestart(svc)}
                  style={{
                    background: "transparent", border: `1px solid ${S.rim}`,
                    borderRadius: 3, color: S.secondary, cursor: "pointer",
                    padding: "2px 8px", fontSize: 10, fontFamily: S.fontMono,
                  }}
                >
                  CLEAR CACHE / RESTART
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Database Tables */}
      <SectionCard title="DATABASE TABLES">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: S.fontMono, fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                {["TABLE", "ROWS", "LAST INSERT"].map(h => (
                  <th scope="col" key={h} style={{
                    textAlign: "left", padding: "4px 10px", color: S.tertiary,
                    fontWeight: 500, fontSize: 10, letterSpacing: "0.07em",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.tables.map(t => (
                <tr key={t.name} style={{ borderBottom: `1px solid ${S.soft}` }}>
                  <td style={{ padding: "5px 10px", color: S.primary }}>{t.name}</td>
                  <td style={{ padding: "5px 10px", color: t.error ? S.fail : S.cyan }}>
                    {t.error ? "ERR" : (t.row_count ?? "—")}
                  </td>
                  <td style={{ padding: "5px 10px", color: S.secondary }}>{fmtTs(t.last_insert)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Engine Modules */}
      <SectionCard title="ENGINE MODULES">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {data.engineModules.map(m => (
            <span key={m.name} style={{
              fontFamily: S.fontMono, fontSize: 10, padding: "3px 8px",
              borderRadius: 3, border: `1px solid ${S.rim}`,
              background: S.bgSub,
              color: m.status === "wired" ? S.pass
                : m.status === "registered" ? S.amber
                : m.status === "loaded" ? S.cyan
                : m.status === "unwired" ? S.fail
                : S.tertiary,
            }}>
              {m.name}
            </span>
          ))}
        </div>
        {data.engineModules.length > 0 && (
          <div style={{ marginTop: 10, fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, display: "flex", gap: 14 }}>
            <span style={{ color: S.pass }}>wired</span>
            <span style={{ color: S.amber }}>registered</span>
            <span style={{ color: S.cyan }}>loaded</span>
            <span style={{ color: S.fail }}>unwired</span>
          </div>
        )}
      </SectionCard>

      {/* Error Summary */}
      <SectionCard title={`ERROR SUMMARY — LAST ${data.errors?.period_hours ?? 24}H`}>
        {!data.errors || data.errors.by_type.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: S.pass, fontFamily: S.fontMono, fontSize: 12 }}>
            <CheckCircle size={14} />
            NO ERRORS RECORDED
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: S.fontMono, fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${S.rim}` }}>
                {["EVENT TYPE", "COUNT", "LAST SEEN"].map(h => (
                  <th scope="col" key={h} style={{
                    textAlign: "left", padding: "4px 10px", color: S.tertiary,
                    fontWeight: 500, fontSize: 10, letterSpacing: "0.07em",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.errors.by_type.map(e => (
                <tr key={e.event_type} style={{ borderBottom: `1px solid ${S.soft}` }}>
                  <td style={{ padding: "5px 10px", color: S.fail }}>{e.event_type}</td>
                  <td style={{ padding: "5px 10px", color: S.amber }}>{e.count}</td>
                  <td style={{ padding: "5px 10px", color: S.secondary }}>{fmtTs(e.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* Live Activity Feed */}
      <SectionCard title="LIVE ACTIVITY FEED">
        {data.activity.length === 0 ? (
          <span style={{ color: S.tertiary, fontSize: 12, fontFamily: S.fontMono }}>No recent activity</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 360, overflowY: "auto" }}>
            {data.activity.map(ev => (
              <div key={ev.id} style={{
                display: "grid",
                gridTemplateColumns: "140px 1fr 160px 140px 160px",
                alignItems: "center", gap: 8,
                padding: "5px 8px", borderRadius: 4,
                background: S.bgSub, borderLeft: `3px solid ${S.cyan}`,
                fontFamily: S.fontMono, fontSize: 10,
              }}>
                <span style={{
                  background: S.bgDeep, color: S.cyan, padding: "2px 6px",
                  borderRadius: 3, border: `1px solid ${S.rim}`, overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {ev.event_type}
                </span>
                <span style={{ color: S.secondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ev.description ?? "—"}
                </span>
                <span style={{ color: S.tertiary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ev.actor_email ?? "—"}
                </span>
                <span style={{ color: S.tertiary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {ev.company_name ?? "—"}
                </span>
                <span style={{ color: S.tertiary }}>{fmtTs(ev.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Toasts */}
      {toasts.map(t => (
        <Toast key={t.id} msg={t} onDone={() => removeToast(t.id)} />
      ))}
    </div>
  );
}

// Suppress unused import warnings
void AlertTriangle;
void XCircle;
