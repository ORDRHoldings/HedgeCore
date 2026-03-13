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
import { LayoutDashboard, Play, BarChart3, Activity } from "lucide-react";
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
    </PageShell>
  );
}
