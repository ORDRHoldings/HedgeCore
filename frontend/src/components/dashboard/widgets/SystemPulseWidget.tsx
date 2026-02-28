"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity, X, Clock, AlertTriangle,
  FileText, Shield, Layers, ArrowRight, Zap,
  Database, Target, RefreshCw, WifiOff, ServerCrash,
} from "lucide-react";
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

type LoadPhase =
  | "loading"      // First attempt, spinner
  | "retrying"     // Retrying after failure
  | "done"         // Data loaded successfully
  | "error_conn"   // Network/connection refused (backend offline)
  | "error_srv";   // Backend returned 4xx/5xx and retries exhausted

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [3000, 6000, 12000];

function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

interface Props {
  token: string;
  user: UserContext;
  onRemove?: () => void;
}

/* ─── Arc gauge ─────────────────────────────────────────────────────────── */
function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const s = polarToXY(cx, cy, r, startDeg);
  const e = polarToXY(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

function HealthGauge({
  score, color, status, size = 160,
}: { score: number; color: string; status: string; size?: number }) {
  const cx = size / 2;
  const cy = size * 0.58;
  const r = size * 0.38;
  const sw = size * 0.07;
  const START = 150;
  const SWEEP = 240;
  const bgPath = arcPath(cx, cy, r, START, START + SWEEP);
  const scoreAngle = (score / 100) * SWEEP;
  const fgPath = scoreAngle > 1 ? arcPath(cx, cy, r, START, START + scoreAngle) : "";

  const ticks = [0, 25, 50, 75, 100].map((v) => {
    const a = START + (v / 100) * SWEEP;
    const inner = polarToXY(cx, cy, r - sw * 0.7, a);
    const outer = polarToXY(cx, cy, r + sw * 0.3, a);
    return { inner, outer, v };
  });

  return (
    <svg width={size} height={size * 0.72} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={S.red} />
          <stop offset="40%" stopColor={S.amber} />
          <stop offset="100%" stopColor={S.green} />
        </linearGradient>
        <filter id="gauge-glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <path d={bgPath} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={sw} strokeLinecap="round" />
      {fgPath && (
        <path d={fgPath} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" filter="url(#gauge-glow)" />
      )}
      {ticks.map((tk) => (
        <line key={tk.v} x1={tk.inner.x} y1={tk.inner.y} x2={tk.outer.x} y2={tk.outer.y}
          stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
      ))}
      <text x={cx} y={cy - 4} textAnchor="middle"
        style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: size * 0.2, fontWeight: 700, fill: color }}>
        {score}
      </text>
      <text x={cx} y={cy + size * 0.1} textAnchor="middle"
        style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: size * 0.075, fill: "rgba(255,255,255,0.4)", letterSpacing: "0.06em" }}>
        /100
      </text>
      <text x={cx} y={cy + size * 0.21} textAnchor="middle"
        style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: size * 0.07, fontWeight: 700, fill: color, letterSpacing: "0.12em" }}>
        {status}
      </text>
    </svg>
  );
}

/* ─── Coverage donut ring ──────────────────────────────────────────────── */
function CoverageRing({ pct, color, size = 64 }: { pct: number; color: string; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const circ = 2 * Math.PI * r;
  const filled = (Math.min(pct, 100) / 100) * circ;

  return (
    <svg width={size} height={size} style={{ display: "block" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={size * 0.1} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={size * 0.1}
        strokeDasharray={`${filled} ${circ - filled}`}
        strokeDashoffset={circ * 0.25}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 800ms ease" }} />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
        style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: size * 0.2, fontWeight: 700, fill: color }}>
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

/* ─── Pulse dots animation ─────────────────────────────────────────────── */
function PulseDots({ color }: { color: string }) {
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{
          width: 5, height: 5, borderRadius: "50%", background: color, display: "inline-block",
          animation: `pulse-dot 1.4s ease-in-out ${i * 0.22}s infinite`,
        }} />
      ))}
      <style>{`
        @keyframes pulse-dot {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </span>
  );
}

/* ─── Main Widget ──────────────────────────────────────────────────────── */
export default function SystemPulseWidget({ token, user, onRemove }: Props) {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [phase, setPhase] = useState<LoadPhase>("loading");
  const [retryCount, setRetryCount] = useState(0);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const cancelledRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchWithRetry = useCallback(async (attempt: number) => {
    if (cancelledRef.current) return;

    try {
      const res = await dashboardFetch("/v1/dashboard/summary", token);
      if (cancelledRef.current) return;

      if (res.ok) {
        const json = await res.json() as DashboardSummary;
        setData(json);
        setPhase("done");
        setLastRefreshed(new Date());
        setIsRefreshing(false);
      } else if (res.status >= 500 && attempt < MAX_RETRIES) {
        setPhase("retrying");
        setRetryCount(attempt + 1);
        retryTimerRef.current = setTimeout(() => fetchWithRetry(attempt + 1), RETRY_DELAYS_MS[attempt]);
      } else {
        setPhase(res.status >= 500 ? "error_conn" : "error_srv");
        setIsRefreshing(false);
      }
    } catch {
      if (cancelledRef.current) return;
      if (attempt < MAX_RETRIES) {
        setPhase("retrying");
        setRetryCount(attempt + 1);
        retryTimerRef.current = setTimeout(() => fetchWithRetry(attempt + 1), RETRY_DELAYS_MS[attempt]);
      } else {
        setPhase("error_conn");
        setIsRefreshing(false);
      }
    }
  }, [token]);

  const startFetch = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    setPhase("loading");
    setRetryCount(0);
    fetchWithRetry(0);
  }, [fetchWithRetry]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    startFetch();
  }, [startFetch]);

  useEffect(() => {
    cancelledRef.current = false;
    startFetch();
    return () => {
      cancelledRef.current = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [startFetch]);

  const kpis = data?.kpis;

  const healthScore = kpis
    ? Math.round(
        ((kpis.hedge_coverage_pct >= 70
          ? 100
          : kpis.hedge_coverage_pct * 1.4) +
          (kpis.pending_approvals === 0 ? 100 : Math.max(0, 100 - kpis.pending_approvals * 25)) +
          (kpis.open_alerts === 0 ? 100 : Math.max(0, 100 - kpis.open_alerts * 30))) / 3,
      )
    : null;

  const healthColor =
    healthScore !== null
      ? healthScore >= 80 ? S.green : healthScore >= 50 ? S.amber : S.red
      : S.tertiary;

  const healthStatus =
    healthScore !== null
      ? healthScore >= 80 ? "OPTIMAL" : healthScore >= 50 ? "DEGRADED" : "CRITICAL"
      : "UNKNOWN";

  const isLoading = phase === "loading" || phase === "retrying";

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
        position: "absolute", top: 0, left: 0, right: 0, height: 200,
        background: `linear-gradient(135deg,
          color-mix(in srgb, ${healthColor} 8%, transparent),
          color-mix(in srgb, ${S.cyan} 5%, transparent))`,
        opacity: 0.6, pointerEvents: "none",
      }} />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="widget-drag-handle" style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 14px", borderBottom: `1px solid ${S.rim}`,
        background: `linear-gradient(to right, ${S.bgDeep}, color-mix(in srgb, ${S.bgDeep} 95%, ${healthColor}))`,
        flexShrink: 0, cursor: "grab", position: "relative", zIndex: 1,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: `linear-gradient(135deg, ${healthColor}, color-mix(in srgb, ${healthColor} 70%, transparent))`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 0 20px color-mix(in srgb, ${healthColor} 40%, transparent)`,
        }}>
          <Activity size={16} color="#fff" strokeWidth={2.5} />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
            letterSpacing: "0.08em", color: S.primary, textTransform: "uppercase",
          }}>
            System Pulse
          </div>
          {data && (
            <div style={{ fontFamily: S.fontUI, fontSize: 9, color: S.tertiary, marginTop: 2 }}>
              {data.is_company_wide ? data.company_name : `${data.company_name} · ${data.branch_name}`}
              {" "}· <span style={{ color: S.cyan }}>{data.role}</span>
            </div>
          )}
          {isLoading && !data && (
            <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, marginTop: 2 }}>
              {phase === "retrying" ? `RETRY ${retryCount}/${MAX_RETRIES}` : "CONNECTING..."}
            </div>
          )}
        </div>

        {/* Refresh button (shown when data is loaded) */}
        {phase === "done" && (
          <button
            onClick={handleRefresh}
            title="Refresh metrics"
            disabled={isRefreshing}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: S.tertiary, display: "flex", alignItems: "center",
              padding: 4, opacity: 0.6, transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}
          >
            <RefreshCw size={13} style={{ animation: isRefreshing ? "spin 1s linear infinite" : "none" }} />
          </button>
        )}

        {onRemove && (
          <button onClick={onRemove} title="Remove widget" style={{
            background: "none", border: "none", cursor: "pointer",
            color: S.tertiary, display: "flex", alignItems: "center",
            padding: 4, opacity: 0.6,
          }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "auto", position: "relative", zIndex: 1 }}>

        {/* ── Loading / Retrying ─────────────────────────────────────── */}
        {isLoading && (
          <div style={{
            padding: "28px 20px", display: "flex", flexDirection: "column",
            alignItems: "center", gap: 14, textAlign: "center",
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%",
              background: `color-mix(in srgb, ${S.cyan} 10%, transparent)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: `1px solid color-mix(in srgb, ${S.cyan} 20%, transparent)`,
            }}>
              <Activity size={24} color={S.cyan} style={{ opacity: 0.8 }} />
            </div>
            <div>
              <div style={{
                fontFamily: S.fontMono, fontSize: 11, fontWeight: 700,
                color: S.secondary, letterSpacing: "0.08em", marginBottom: 6,
              }}>
                {phase === "retrying" ? `RETRY ${retryCount} / ${MAX_RETRIES}` : "CONNECTING TO HEDGECORE"}
              </div>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                <PulseDots color={S.cyan} />
              </div>
              <div style={{
                fontFamily: S.fontUI, fontSize: 11, color: S.tertiary,
                lineHeight: 1.6, maxWidth: 260,
              }}>
                {phase === "retrying"
                  ? `Backend cold start detected. Waiting ${(RETRY_DELAYS_MS[retryCount - 1] ?? 3000) / 1000}s before next attempt…`
                  : "Fetching live KPIs from the governance engine…"
                }
              </div>
            </div>
            {phase === "retrying" && (
              <div style={{
                fontFamily: S.fontMono, fontSize: 9, color: S.amber,
                letterSpacing: "0.06em", padding: "4px 12px",
                background: `color-mix(in srgb, ${S.amber} 8%, transparent)`,
                border: `1px solid color-mix(in srgb, ${S.amber} 20%, transparent)`,
                borderRadius: 4,
              }}>
                ⚡ RENDER COLD START — FREE TIER
              </div>
            )}
          </div>
        )}

        {/* ── Connection Error ───────────────────────────────────────── */}
        {phase === "error_conn" && (
          <div style={{
            padding: "24px 20px", display: "flex", flexDirection: "column",
            alignItems: "center", gap: 12, textAlign: "center",
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%",
              background: `color-mix(in srgb, ${S.amber} 10%, transparent)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: `1px solid color-mix(in srgb, ${S.amber} 25%, transparent)`,
            }}>
              <WifiOff size={22} color={S.amber} />
            </div>
            <div style={{
              fontFamily: S.fontMono, fontSize: 11, fontWeight: 700,
              color: S.amber, letterSpacing: "0.08em",
            }}>
              BACKEND OFFLINE
            </div>
            <div style={{
              fontFamily: S.fontUI, fontSize: 11, color: S.tertiary,
              lineHeight: 1.6, maxWidth: 270,
            }}>
              Could not reach the HedgeCore API after {MAX_RETRIES} attempts.
              The Render free tier may be sleeping — first request can take 30–60s.
            </div>
            <button
              onClick={handleRefresh}
              style={{
                fontFamily: S.fontMono, fontSize: 10, letterSpacing: "0.06em",
                padding: "7px 18px", cursor: "pointer",
                background: `color-mix(in srgb, ${S.cyan} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${S.cyan} 30%, transparent)`,
                borderRadius: 4, color: S.cyan, display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <RefreshCw size={11} />
              RETRY CONNECTION
            </button>
            <div style={{
              fontFamily: S.fontMono, fontSize: 9, color: S.tertiary,
              letterSpacing: "0.04em",
            }}>
              {user?.email ?? "demo"} · {MAX_RETRIES} retries exhausted
            </div>
          </div>
        )}

        {/* ── Server / Auth Error ────────────────────────────────────── */}
        {phase === "error_srv" && (
          <div style={{
            padding: "24px 20px", display: "flex", flexDirection: "column",
            alignItems: "center", gap: 12, textAlign: "center",
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%",
              background: `color-mix(in srgb, ${S.red} 10%, transparent)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: `1px solid color-mix(in srgb, ${S.red} 25%, transparent)`,
            }}>
              <ServerCrash size={22} color={S.red} />
            </div>
            <div style={{
              fontFamily: S.fontMono, fontSize: 11, fontWeight: 700,
              color: S.red, letterSpacing: "0.08em",
            }}>
              SERVER ERROR
            </div>
            <div style={{
              fontFamily: S.fontUI, fontSize: 11, color: S.tertiary,
              lineHeight: 1.6, maxWidth: 260,
            }}>
              The backend returned an unexpected error response.
              Check authentication or server logs.
            </div>
            <button
              onClick={handleRefresh}
              style={{
                fontFamily: S.fontMono, fontSize: 10, letterSpacing: "0.06em",
                padding: "7px 18px", cursor: "pointer",
                background: `color-mix(in srgb, ${S.cyan} 12%, transparent)`,
                border: `1px solid color-mix(in srgb, ${S.cyan} 30%, transparent)`,
                borderRadius: 4, color: S.cyan, display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <RefreshCw size={11} />
              RETRY
            </button>
          </div>
        )}

        {/* ── Loaded Data ────────────────────────────────────────────── */}
        {phase === "done" && kpis && healthScore !== null && (
          <>
            {/* Hero: Arc gauge */}
            <div style={{
              padding: "16px 20px 8px",
              background: `linear-gradient(to bottom, color-mix(in srgb, ${S.bgDeep} 50%, transparent), transparent)`,
              borderBottom: `1px solid ${S.soft}`,
              display: "flex", flexDirection: "column", alignItems: "center",
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                marginBottom: 4, alignSelf: "flex-start",
              }}>
                <Zap size={11} color={healthColor} fill={healthColor} />
                <span style={{
                  fontFamily: S.fontMono, fontSize: 9, color: S.tertiary,
                  letterSpacing: "0.1em", textTransform: "uppercase",
                }}>
                  System Health Score
                </span>
              </div>

              <HealthGauge score={healthScore} color={healthColor} status={healthStatus} size={148} />

              {/* Total exposure below gauge */}
              <div style={{ textAlign: "center", marginTop: -4 }}>
                <div style={{
                  fontFamily: S.fontMono, fontSize: 8, color: S.tertiary,
                  letterSpacing: "0.1em", marginBottom: 2,
                  display: "flex", alignItems: "center", gap: 4, justifyContent: "center",
                }}>
                  <Layers size={9} color={S.cyan} />
                  TOTAL FX EXPOSURE
                </div>
                <div style={{
                  fontFamily: S.fontMono, fontSize: 24, fontWeight: 700, color: S.cyan,
                  lineHeight: 1, letterSpacing: "-0.02em",
                  textShadow: `0 0 24px color-mix(in srgb, ${S.cyan} 25%, transparent)`,
                }}>
                  {formatCompact(kpis.total_exposure_usd)}
                </div>
                <div style={{ fontFamily: S.fontUI, fontSize: 9, color: S.tertiary, marginTop: 4 }}>
                  {data?.is_company_wide ? "Company-wide" : data?.branch_name} · {data?.branch_currency} basis
                </div>
              </div>
            </div>

            {/* KPI Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 0 }}>

              {/* Hedge Coverage */}
              <div style={{
                padding: "14px 16px",
                borderRight: `1px solid ${S.soft}`,
                borderBottom: `1px solid ${S.soft}`,
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <CoverageRing pct={kpis.hedge_coverage_pct} color={healthColor} size={52} />
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                    <Shield size={10} color={healthColor} />
                    <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, letterSpacing: "0.08em" }}>
                      HEDGE COVERAGE
                    </span>
                  </div>
                  <div style={{ fontFamily: S.fontUI, fontSize: 9, color: healthColor, fontWeight: 600 }}>
                    {kpis.hedge_coverage_pct >= 70 ? "Above threshold"
                      : kpis.hedge_coverage_pct >= 50 ? "Near threshold"
                      : kpis.hedge_coverage_pct > 0 ? "Below threshold"
                      : "No hedges yet"}
                  </div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, marginTop: 2 }}>
                    Target: ≥ 70%
                  </div>
                </div>
              </div>

              {/* Active Proposals */}
              <div style={{
                padding: "14px 16px", borderBottom: `1px solid ${S.soft}`,
                display: "flex", flexDirection: "column", justifyContent: "center",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
                  <FileText size={10} color={S.cyan} />
                  <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, letterSpacing: "0.08em" }}>
                    ACTIVE PROPOSALS
                  </span>
                </div>
                <div style={{
                  fontFamily: S.fontMono, fontSize: 32, fontWeight: 700,
                  color: kpis.active_proposals > 0 ? S.cyan : S.tertiary,
                  lineHeight: 1, marginBottom: 4,
                }}>
                  {kpis.active_proposals}
                </div>
                <div style={{ display: "flex", gap: 3, marginTop: 2 }}>
                  {[...Array(Math.min(kpis.active_proposals, 8))].map((_, i) => (
                    <div key={i} style={{
                      width: 6, height: 6, borderRadius: "50%", background: S.cyan,
                      opacity: 0.6 + (i / 8) * 0.4,
                    }} />
                  ))}
                  {kpis.active_proposals === 0 && (
                    <span style={{ fontFamily: S.fontUI, fontSize: 9, color: S.tertiary }}>
                      No active proposals
                    </span>
                  )}
                </div>
              </div>

              {/* Pending Approvals */}
              <div style={{ padding: "14px 16px", borderRight: `1px solid ${S.soft}`, borderBottom: `1px solid ${S.soft}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
                  <Clock size={10} color={kpis.pending_approvals > 0 ? S.amber : S.green} />
                  <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, letterSpacing: "0.08em" }}>
                    PENDING APPROVALS
                  </span>
                </div>
                <div style={{
                  fontFamily: S.fontMono, fontSize: 32, fontWeight: 700,
                  color: kpis.pending_approvals === 0 ? S.green : kpis.pending_approvals <= 3 ? S.amber : S.red,
                  lineHeight: 1, marginBottom: 6,
                }}>
                  {kpis.pending_approvals}
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 2 }}>
                    {[0, 1].map((i) => (
                      <div key={i} style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: i === 0 ? (kpis.pending_approvals > 0 ? S.amber : S.green) : S.bgDeep,
                        border: `1px solid ${S.soft}`,
                      }} />
                    ))}
                  </div>
                  <span style={{ fontFamily: S.fontUI, fontSize: 9, color: S.tertiary }}>
                    {kpis.pending_approvals === 0 ? "Queue clear" : "4-eyes review"}
                  </span>
                </div>
              </div>

              {/* Open Alerts */}
              <div style={{ padding: "14px 16px", borderBottom: `1px solid ${S.soft}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
                  <AlertTriangle size={10} color={kpis.open_alerts > 0 ? S.amber : S.green} />
                  <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary, letterSpacing: "0.08em" }}>
                    OPEN ALERTS
                  </span>
                </div>
                <div style={{
                  fontFamily: S.fontMono, fontSize: 32, fontWeight: 700,
                  color: kpis.open_alerts === 0 ? S.green : kpis.open_alerts <= 2 ? S.amber : S.red,
                  lineHeight: 1, marginBottom: 6,
                }}>
                  {kpis.open_alerts}
                </div>
                <div style={{ fontFamily: S.fontUI, fontSize: 9, color: S.tertiary }}>
                  {kpis.open_alerts === 0 ? "✓ No issues detected" : "⚠ Requires attention"}
                </div>
              </div>
            </div>

            {/* Pipeline Funnel */}
            <div style={{ padding: "14px 16px", background: S.bgSub, borderTop: `1px solid ${S.soft}` }}>
              <div style={{
                fontFamily: S.fontMono, fontSize: 9, color: S.tertiary,
                letterSpacing: "0.08em", marginBottom: 10,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <Target size={10} color={S.tertiary} />
                TRI-STATE PIPELINE
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {[
                  { label: "SANDBOX", count: Math.max(0, kpis.active_proposals ?? 0), color: S.cyan, icon: "◈" },
                  { label: "STAGING", count: kpis.pending_approvals ?? 0, color: S.amber, icon: "◉" },
                  { label: "LEDGER",  count: 0, color: S.green, icon: "◆" },
                ].map((stage, i) => (
                  <React.Fragment key={stage.label}>
                    <div style={{
                      flex: 1, padding: "10px 10px", textAlign: "center",
                      background: `linear-gradient(135deg,
                        color-mix(in srgb, ${stage.color} 10%, transparent),
                        color-mix(in srgb, ${stage.color} 4%, transparent))`,
                      border: `1px solid color-mix(in srgb, ${stage.color} 28%, transparent)`,
                      borderRadius: 6, position: "relative",
                    }}>
                      <div style={{
                        fontFamily: S.fontMono, fontSize: 7, color: stage.color,
                        letterSpacing: "0.06em", opacity: 0.7, marginBottom: 2,
                      }}>
                        {stage.icon} {stage.label}
                      </div>
                      <div style={{
                        fontFamily: S.fontMono, fontSize: 26, fontWeight: 700,
                        color: stage.color, lineHeight: 1,
                      }}>
                        {stage.count}
                      </div>
                      <div style={{
                        height: 2,
                        background: `color-mix(in srgb, ${stage.color} 20%, transparent)`,
                        borderRadius: 1, marginTop: 6, overflow: "hidden",
                      }}>
                        <div style={{
                          height: "100%",
                          width: `${Math.min((stage.count / 10) * 100, 100)}%`,
                          background: stage.color, transition: "width 600ms ease",
                        }} />
                      </div>
                    </div>
                    {i < 2 && (
                      <ArrowRight size={11} color={S.tertiary} style={{ opacity: 0.35, flexShrink: 0 }} />
                    )}
                  </React.Fragment>
                ))}
              </div>

              {/* Team info strip */}
              {kpis.team_size > 0 && (
                <div style={{
                  marginTop: 10, padding: "6px 10px",
                  background: `color-mix(in srgb, ${S.cyan} 5%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${S.cyan} 12%, transparent)`,
                  borderRadius: 4, display: "flex", alignItems: "center", gap: 8,
                }}>
                  <Database size={9} color={S.cyan} style={{ opacity: 0.7 }} />
                  <span style={{ fontFamily: S.fontMono, fontSize: 8, color: S.tertiary }}>
                    {kpis.team_size} TEAM MEMBER{kpis.team_size !== 1 ? "S" : ""} ·{" "}
                    LEVEL {data?.hierarchy_level} ACCESS ·{" "}
                    {data?.role?.replace(/_/g, " ").toUpperCase()}
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div style={{
        padding: "8px 14px", borderTop: `1px solid ${S.soft}`, background: S.bgDeep,
        fontFamily: S.fontMono, fontSize: 8, color: S.tertiary,
        display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Database size={9} color={S.tertiary} />
          <span>
            {phase === "done"
              ? lastRefreshed ? `Refreshed ${formatTime(lastRefreshed)}` : "Live KPIs"
              : phase === "retrying" ? `Retry ${retryCount}/${MAX_RETRIES}…`
              : phase === "error_conn" ? "Backend unreachable"
              : phase === "error_srv" ? "Server error"
              : "Connecting…"}
          </span>
        </div>
        <span style={{ color: phase === "done" ? S.green : phase.startsWith("error") ? S.red : S.amber }}>
          {phase === "done" ? "● LIVE" : phase === "retrying" ? "◌ RETRYING" : phase.startsWith("error") ? "✕ OFFLINE" : "◌ INIT"}
        </span>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
