"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/authContext";
import type { UserContext } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { T } from "@/lib/design/tokens";
import { PageShell } from "@/components/layout/PageShell";
import { KpiStrip } from "@/components/ui/KpiStrip";
import { Icon } from "@/components/ui/Icon";
import { LayoutDashboard, Play, BarChart3, Activity, ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ── Helpers ────────────────────────────────────────────────────────────── */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function fmtDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

function timeAgo(iso: string): string {
  if (!iso) return "—";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

/* ── Types ──────────────────────────────────────────────────────────────── */
interface DashboardData {
  newCount: number;
  monitorCount: number;
  hedgedCount: number;
  totalExposure: number;
  hedgeCoverage: number;
  pendingApprovals: number;
  openPositions: number;
  marketOnline: boolean;
}

interface FxRate {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  spread?: number;
  source?: string;
  as_of?: string;
}

interface MacroItem {
  label: string;
  value: number;
  display: string;
  trend: "up" | "down" | "flat";
  context: string;
  unit?: string;
}

interface RecentRun {
  id: string;
  created_at: string;
  status: string;
  currency_pair: string;
  notional: number;
  hedge_ratio: number;
  trade_count?: number;
  hedge_count?: number;
}

interface PipelineData {
  sandbox: { total: number; passed: number; rejected: number };
  staging: { total: number; approved: number; pending: number };
  ledger: { total: number; committed: number };
}

interface ActivityEvent {
  ts: string;
  user_name: string;
  action: string;
  module: string;
  status: string;
  description: string;
  branch?: string;
}

interface WidgetState {
  fxRates: FxRate[];
  fxChanges: Record<string, number>;
  macro: MacroItem[];
  recentRuns: RecentRun[];
  pipeline: PipelineData | null;
  activity: ActivityEvent[];
  loaded: boolean;
}

/* ── Mission Card ───────────────────────────────────────────────────────── */
function MissionCard({ href, icon, title, stat, statLabel, desc }: {
  href: string;
  icon: LucideIcon;
  title: string;
  stat: string | number;
  statLabel: string;
  desc: string;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div
        style={{
          background: T.bgPanel,
          border: `1px solid ${T.rim}`,
          borderRadius: 4,
          padding: "24px 20px",
          cursor: "pointer",
          transition: "border-color 150ms",
          minHeight: 160,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent-blue)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = T.rim; }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <Icon icon={icon} size={20} color={T.tertiary} />
            <span style={{ fontFamily: T.fontUI, fontSize: 14, fontWeight: 600, color: T.primary }}>
              {title}
            </span>
          </div>
          <div style={{ fontFamily: T.fontUI, fontSize: 13, color: T.secondary, lineHeight: 1.5 }}>
            {desc}
          </div>
        </div>
        <div style={{ marginTop: 16, display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: T.fontMono, fontSize: 28, fontWeight: 700, color: T.primary }}>
            {stat}
          </span>
          <span style={{ fontFamily: T.fontUI, fontSize: 12, color: T.tertiary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {statLabel}
          </span>
        </div>
      </div>
    </Link>
  );
}

/* ── Skeleton ───────────────────────────────────────────────────────────── */
function CardSkeleton() {
  return (
    <div style={{ background: T.bgPanel, border: `1px solid ${T.rim}`, borderRadius: 4, padding: "24px 20px", minHeight: 160 }}>
      <div style={{ height: 14, width: 120, background: T.soft, borderRadius: 2, marginBottom: 12 }} />
      <div style={{ height: 12, width: "80%", background: T.soft, borderRadius: 2, marginBottom: 8 }} />
      <div style={{ height: 12, width: "60%", background: T.soft, borderRadius: 2 }} />
      <div style={{ height: 28, width: 60, background: T.soft, borderRadius: 2, marginTop: 20 }} />
    </div>
  );
}

/* ── Widget Components ──────────────────────────────────────────────────── */
function SectionHeader({ title, badge }: { title: string; badge?: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      marginTop: 32, marginBottom: 16,
      paddingBottom: 10, borderBottom: `1px solid ${T.rim}`,
    }}>
      <span style={{
        fontFamily: T.fontMono, fontSize: 11, fontWeight: 700,
        letterSpacing: "0.14em", color: T.tertiary,
      }}>
        {title}
      </span>
      {badge && (
        <span style={{
          fontFamily: T.fontMono, fontSize: 9, fontWeight: 700,
          letterSpacing: "0.08em", color: T.pass,
          display: "inline-flex", alignItems: "center", gap: 5,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%",
            background: T.pass, boxShadow: `0 0 6px ${T.pass}`,
            display: "inline-block",
          }} />
          {badge}
        </span>
      )}
    </div>
  );
}

function FxRateCard({ pair, mid, bid, ask, change }: {
  pair: string; mid: number; bid: number; ask: number; change: number;
}) {
  const isUp = change > 0;
  const isDown = change < 0;
  const changeColor = isUp ? T.pass : isDown ? T.fail : T.tertiary;
  const arrow = isUp ? "\u25B2" : isDown ? "\u25BC" : "\u2014";
  const pairDisplay = pair.length >= 6 ? `${pair.slice(0, 3)}/${pair.slice(3)}` : pair;

  return (
    <div style={{
      background: T.bgPanel, border: `1px solid ${T.rim}`, borderRadius: 4,
      padding: "16px 14px", display: "flex", flexDirection: "column", gap: 4,
    }}>
      <div style={{
        fontFamily: T.fontMono, fontSize: 11, fontWeight: 600,
        color: T.secondary, letterSpacing: "0.04em",
      }}>
        {pairDisplay}
      </div>
      <div style={{
        fontFamily: T.fontMono, fontSize: 22, fontWeight: 700, color: T.primary,
      }}>
        {mid.toFixed(mid >= 100 ? 2 : 4)}
      </div>
      <div style={{ fontFamily: T.fontMono, fontSize: 11, fontWeight: 700, color: changeColor }}>
        {arrow} {change > 0 ? "+" : ""}{change.toFixed(2)}%
      </div>
      <div style={{
        display: "flex", gap: 12, fontFamily: T.fontMono,
        fontSize: 10, color: T.tertiary, marginTop: 2,
      }}>
        <span>B {bid.toFixed(bid >= 100 ? 2 : 4)}</span>
        <span>A {ask.toFixed(ask >= 100 ? 2 : 4)}</span>
      </div>
    </div>
  );
}

function MacroCard({ label, display, trend, context }: {
  label: string; display: string; trend: string; context: string;
}) {
  const trendColor = trend === "up" ? T.pass : trend === "down" ? T.fail : T.tertiary;
  const arrow = trend === "up" ? "\u25B2" : trend === "down" ? "\u25BC" : "\u2014";

  return (
    <div style={{
      background: T.bgPanel, border: `1px solid ${T.rim}`, borderRadius: 4,
      padding: "14px 16px", display: "flex", alignItems: "center",
    }}>
      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily: T.fontMono, fontSize: 10, color: T.tertiary,
          letterSpacing: "0.08em", marginBottom: 4,
        }}>
          {label.toUpperCase()}
        </div>
        <div style={{ fontFamily: T.fontMono, fontSize: 18, fontWeight: 700, color: T.primary }}>
          {display}
        </div>
      </div>
      <div style={{ textAlign: "right" as const }}>
        <div style={{ fontFamily: T.fontMono, fontSize: 14, fontWeight: 700, color: trendColor }}>
          {arrow}
        </div>
        {context && (
          <div style={{ fontFamily: T.fontUI, fontSize: 10, color: T.tertiary, marginTop: 2 }}>
            {context}
          </div>
        )}
      </div>
    </div>
  );
}

function PipelineStage({ label, total, details }: {
  label: string;
  total: number;
  details: { label: string; value: number; color: string }[];
}) {
  return (
    <div style={{ flex: 1, textAlign: "center" as const }}>
      <div style={{
        fontFamily: T.fontMono, fontSize: 10, fontWeight: 700,
        letterSpacing: "0.1em", color: T.tertiary, marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{ fontFamily: T.fontMono, fontSize: 28, fontWeight: 700, color: T.primary }}>
        {total}
      </div>
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 2, marginTop: 6 }}>
        {details.map(d => (
          <div key={d.label} style={{ fontFamily: T.fontMono, fontSize: 10, color: d.color }}>
            {d.value} {d.label.toLowerCase()}
          </div>
        ))}
      </div>
    </div>
  );
}

function WidgetSkeleton({ height }: { height?: number }) {
  return (
    <div style={{
      background: T.bgPanel, border: `1px solid ${T.rim}`, borderRadius: 4,
      padding: 20, minHeight: height ?? 120,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <span style={{
        fontFamily: T.fontMono, fontSize: 10, color: T.tertiary,
        letterSpacing: "0.1em",
      }}>
        LOADING...
      </span>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user, token } = useAuth();

  const [ready, setReady] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setReady(true); }, []);

  useEffect(() => {
    if (ready && !isLoading && !isAuthenticated) router.replace("/auth/login");
  }, [ready, isLoading, isAuthenticated, router]);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [posRes, statusRes] = await Promise.allSettled([
        dashboardFetch("/v1/positions", token),
        dashboardFetch("/v1/market-data/status", token),
      ]);

      let newCount = 0, monitorCount = 0, hedgedCount = 0, totalExposure = 0, openPositions = 0;
      if (posRes.status === "fulfilled" && posRes.value.ok) {
        const positions = await posRes.value.json();
        const list = Array.isArray(positions) ? positions : (positions?.items ?? []);
        newCount = list.filter((p: Record<string, unknown>) => p.lifecycle_status === "NEW").length;
        monitorCount = list.filter((p: Record<string, unknown>) =>
          p.lifecycle_status === "HEDGED" || p.lifecycle_status === "READY_TO_EXECUTE"
        ).length;
        hedgedCount = list.filter((p: Record<string, unknown>) => p.lifecycle_status === "HEDGED").length;
        openPositions = list.length;
        totalExposure = list.reduce((sum: number, p: Record<string, unknown>) =>
          sum + (Number(p.notional_amount) || 0), 0
        );
      }

      const marketOnline = statusRes.status === "fulfilled" && statusRes.value.ok;
      const hedgeCoverage = openPositions > 0 ? Math.round((hedgedCount / openPositions) * 100) : 0;

      setData({ newCount, monitorCount, hedgedCount, totalExposure, hedgeCoverage, pendingApprovals: 0, openPositions, marketOnline });
    } catch {
      setData({ newCount: 0, monitorCount: 0, hedgedCount: 0, totalExposure: 0, hedgeCoverage: 0, pendingApprovals: 0, openPositions: 0, marketOnline: false });
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchData();
    const id = setInterval(fetchData, 60_000);
    return () => clearInterval(id);
  }, [token, fetchData]);

  /* ── Widget data ─────────────────────────────────────────────────────── */
  const [widgets, setWidgets] = useState<WidgetState>({
    fxRates: [], fxChanges: {}, macro: [], recentRuns: [],
    pipeline: null, activity: [], loaded: false,
  });

  const fetchWidgets = useCallback(async () => {
    if (!token) return;
    const [fxRes, changeRes, macroRes, runsRes, pipeRes, actRes] = await Promise.allSettled([
      dashboardFetch("/v1/market-data/live/fx-rates?pairs=EURUSD,USDJPY,GBPUSD,AUDUSD,USDCHF,USDCAD", token),
      dashboardFetch("/v1/market-data/live/fx-change?pairs=EURUSD,USDJPY,GBPUSD,AUDUSD,USDCHF,USDCAD", token),
      dashboardFetch("/v1/market-data/live/macro", token),
      dashboardFetch("/v1/dashboard/recent-runs", token),
      dashboardFetch("/v1/dashboard/pipeline-status", token),
      dashboardFetch("/v1/dashboard/team-activity", token),
    ]);

    let fxRates: FxRate[] = [];
    if (fxRes.status === "fulfilled" && fxRes.value.ok) {
      const d = await fxRes.value.json();
      fxRates = Array.isArray(d) ? d : (d.rates ?? []);
    }

    let fxChanges: Record<string, number> = {};
    if (changeRes.status === "fulfilled" && changeRes.value.ok) {
      const d = await changeRes.value.json();
      fxChanges = d.changes ?? {};
    }

    let macro: MacroItem[] = [];
    if (macroRes.status === "fulfilled" && macroRes.value.ok) {
      const d = await macroRes.value.json();
      const raw = d.macroData ?? d;
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        macro = Object.values(raw).filter((v): v is MacroItem =>
          v != null && typeof v === "object" && "label" in v
        );
      }
    }

    let recentRuns: RecentRun[] = [];
    if (runsRes.status === "fulfilled" && runsRes.value.ok) {
      const d = await runsRes.value.json();
      recentRuns = Array.isArray(d) ? d : (d.items ?? []);
    }

    let pipeline: PipelineData | null = null;
    if (pipeRes.status === "fulfilled" && pipeRes.value.ok) {
      pipeline = await pipeRes.value.json();
    }

    let activity: ActivityEvent[] = [];
    if (actRes.status === "fulfilled" && actRes.value.ok) {
      const d = await actRes.value.json();
      activity = Array.isArray(d) ? d : (d.items ?? []);
    }

    setWidgets({ fxRates, fxChanges, macro, recentRuns, pipeline, activity, loaded: true });
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchWidgets();
    const id = setInterval(fetchWidgets, 30_000);
    return () => clearInterval(id);
  }, [token, fetchWidgets]);

  if (!ready || isLoading) {
    return (
      <div style={{
        height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: T.bgDeep, fontFamily: T.fontMono, fontSize: 14,
        color: T.tertiary, letterSpacing: "0.18em",
      }}>
        LOADING...
      </div>
    );
  }
  if (!isAuthenticated || !user || !token) return null;

  const u = user as UserContext;
  const firstName = (u.full_name ?? u.email).split(" ")[0];
  const companyName = u.company?.name ?? "";
  const role = u.roles?.[0] ?? "";

  return (
    <PageShell icon={LayoutDashboard} title="Mission Control">
      {/* Greeting */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: T.fontUI, fontSize: 20, fontWeight: 700, color: T.primary }}>
          {greeting()}, {firstName}
        </div>
        <div style={{ fontFamily: T.fontUI, fontSize: 13, color: T.secondary, marginTop: 4 }}>
          {fmtDate()}
          {companyName && <span> &middot; {companyName}</span>}
          {role && <span> &middot; {role.replace(/_/g, " ").toUpperCase()}</span>}
        </div>
      </div>

      {/* Mission Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        {loading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
          <>
            <MissionCard
              href="/hedge-desk?mode=run"
              icon={Play}
              title="New Hedge"
              stat={data?.newCount ?? 0}
              statLabel="positions awaiting hedge"
              desc="Start a new hedge run for unhedged positions."
            />
            <MissionCard
              href="/hedge-monitor"
              icon={Activity}
              title="Monitor"
              stat={data?.monitorCount ?? 0}
              statLabel="active hedges"
              desc="Track live hedges, MTM P&L, drift alerts."
            />
            <MissionCard
              href="/market-intelligence"
              icon={BarChart3}
              title="Market Data"
              stat={data?.marketOnline ? "LIVE" : "OFFLINE"}
              statLabel={data?.marketOnline ? "market feed active" : "feed unavailable"}
              desc="FX heatmap, indices, commodities, economic calendar."
            />
          </>
        )}
      </div>

      {/* KPI Strip */}
      <KpiStrip
        loading={loading}
        items={[
          { label: "Total Exposure", value: data ? fmtUsd(data.totalExposure) : "—" },
          { label: "Hedge Coverage", value: data ? `${data.hedgeCoverage}%` : "—" },
          { label: "Open Positions", value: data?.openPositions ?? "—" },
          { label: "Pending Approvals", value: data?.pendingApprovals ?? 0 },
          { label: "Hedged", value: data?.hedgedCount ?? 0 },
        ]}
      />

      {/* ── Market Pulse ──────────────────────────────────────────────── */}
      <SectionHeader title="MARKET PULSE" badge={widgets.fxRates.length > 0 ? "LIVE" : undefined} />

      {!widgets.loaded ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => <WidgetSkeleton key={i} height={130} />)}
        </div>
      ) : widgets.fxRates.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
          {widgets.fxRates.map(rate => (
            <FxRateCard
              key={rate.symbol}
              pair={rate.symbol}
              mid={rate.mid}
              bid={rate.bid}
              ask={rate.ask}
              change={widgets.fxChanges[rate.symbol] ?? 0}
            />
          ))}
        </div>
      ) : (
        <div style={{
          background: T.bgPanel, border: `1px solid ${T.rim}`, borderRadius: 4,
          padding: "24px 20px", textAlign: "center" as const,
          fontFamily: T.fontMono, fontSize: 11, color: T.tertiary,
          letterSpacing: "0.08em",
        }}>
          MARKET DATA UNAVAILABLE
        </div>
      )}

      {/* Macro indicators */}
      {widgets.macro.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(widgets.macro.length, 5)}, 1fr)`,
          gap: 12, marginTop: 12,
        }}>
          {widgets.macro.map(m => (
            <MacroCard
              key={m.label}
              label={m.label}
              display={m.display}
              trend={m.trend}
              context={m.context}
            />
          ))}
        </div>
      )}

      {/* ── Operations ────────────────────────────────────────────────── */}
      <SectionHeader title="OPERATIONS" />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Recent Runs */}
        <div style={{
          background: T.bgPanel, border: `1px solid ${T.rim}`, borderRadius: 4,
          overflow: "hidden",
        }}>
          <div style={{
            padding: "10px 16px", borderBottom: `1px solid ${T.rim}`,
            fontFamily: T.fontMono, fontSize: 10, fontWeight: 700,
            letterSpacing: "0.1em", color: T.tertiary,
          }}>
            RECENT CALCULATION RUNS
          </div>
          {!widgets.loaded ? (
            <div style={{ padding: 20, fontFamily: T.fontMono, fontSize: 10, color: T.tertiary }}>
              LOADING...
            </div>
          ) : widgets.recentRuns.length === 0 ? (
            <div style={{
              padding: "32px 20px", textAlign: "center" as const,
              fontFamily: T.fontMono, fontSize: 11, color: T.tertiary,
            }}>
              No calculation runs yet
            </div>
          ) : (
            <div>
              {widgets.recentRuns.slice(0, 5).map(run => (
                <div key={run.id} style={{
                  display: "grid", gridTemplateColumns: "70px 80px 80px 50px 80px",
                  gap: 8, padding: "10px 16px", alignItems: "center",
                  borderBottom: `1px solid ${T.soft}`,
                }}>
                  <span style={{ fontFamily: T.fontMono, fontSize: 10, color: T.tertiary }}>
                    {timeAgo(run.created_at)}
                  </span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 11, fontWeight: 600, color: T.primary }}>
                    {run.currency_pair}
                  </span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.secondary }}>
                    {fmtUsd(run.notional)}
                  </span>
                  <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.secondary }}>
                    {run.hedge_ratio}%
                  </span>
                  <span style={{
                    fontFamily: T.fontMono, fontSize: 9, fontWeight: 700,
                    color: run.status === "COMPLETE" ? T.pass : run.status === "FAILED" ? T.fail : T.warn,
                    display: "inline-flex", alignItems: "center", gap: 4,
                  }}>
                    <span style={{
                      width: 5, height: 5, borderRadius: "50%",
                      background: run.status === "COMPLETE" ? T.pass : run.status === "FAILED" ? T.fail : T.warn,
                    }} />
                    {run.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pipeline Status */}
        <div style={{
          background: T.bgPanel, border: `1px solid ${T.rim}`, borderRadius: 4,
          overflow: "hidden",
        }}>
          <div style={{
            padding: "10px 16px", borderBottom: `1px solid ${T.rim}`,
            fontFamily: T.fontMono, fontSize: 10, fontWeight: 700,
            letterSpacing: "0.1em", color: T.tertiary,
          }}>
            GOVERNANCE PIPELINE
          </div>
          {!widgets.loaded ? (
            <div style={{ padding: 20, fontFamily: T.fontMono, fontSize: 10, color: T.tertiary }}>
              LOADING...
            </div>
          ) : !widgets.pipeline ? (
            <div style={{
              padding: "32px 20px", textAlign: "center" as const,
              fontFamily: T.fontMono, fontSize: 11, color: T.tertiary,
            }}>
              Pipeline data unavailable
            </div>
          ) : (
            <div style={{
              padding: "20px 16px",
              display: "flex", alignItems: "flex-start", gap: 8,
            }}>
              <PipelineStage label="SANDBOX" total={widgets.pipeline.sandbox.total} details={[
                { label: "Passed", value: widgets.pipeline.sandbox.passed, color: T.pass },
                { label: "Rejected", value: widgets.pipeline.sandbox.rejected, color: T.fail },
              ]} />
              <div style={{ display: "flex", alignItems: "center", paddingTop: 28, color: T.tertiary }}>
                <ArrowRight size={16} />
              </div>
              <PipelineStage label="STAGING" total={widgets.pipeline.staging.total} details={[
                { label: "Approved", value: widgets.pipeline.staging.approved, color: T.pass },
                { label: "Pending", value: widgets.pipeline.staging.pending, color: T.warn },
              ]} />
              <div style={{ display: "flex", alignItems: "center", paddingTop: 28, color: T.tertiary }}>
                <ArrowRight size={16} />
              </div>
              <PipelineStage label="LEDGER" total={widgets.pipeline.ledger.total} details={[
                { label: "Committed", value: widgets.pipeline.ledger.committed, color: T.pass },
              ]} />
            </div>
          )}
        </div>
      </div>

      {/* ── Activity Feed ─────────────────────────────────────────────── */}
      {widgets.activity.length > 0 && (
        <>
          <SectionHeader title="TEAM ACTIVITY" />
          <div style={{
            background: T.bgPanel, border: `1px solid ${T.rim}`, borderRadius: 4,
            padding: "12px 16px",
          }}>
            {widgets.activity.slice(0, 8).map((ev, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                padding: "10px 0",
                borderBottom: i < Math.min(widgets.activity.length, 8) - 1
                  ? `1px solid ${T.soft}` : "none",
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: "50%", marginTop: 5, flexShrink: 0,
                  background: ev.status === "success" ? T.pass
                    : ev.status === "error" ? T.fail : T.accent,
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: T.fontUI, fontSize: 12, color: T.primary, lineHeight: 1.4 }}>
                    <span style={{ fontWeight: 600 }}>{ev.user_name || "System"}</span>
                    {" "}
                    <span style={{ color: T.secondary }}>{ev.description || ev.action}</span>
                  </div>
                  <div style={{
                    fontFamily: T.fontMono, fontSize: 10, color: T.tertiary, marginTop: 3,
                    display: "flex", gap: 8,
                  }}>
                    <span>{ev.module}</span>
                    <span>{"\u00B7"}</span>
                    <span>{timeAgo(ev.ts)}</span>
                    {ev.branch && <><span>{"\u00B7"}</span><span>{ev.branch}</span></>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
}
