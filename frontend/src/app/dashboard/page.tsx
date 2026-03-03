"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import type { UserContext } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import OnboardingModal from "@/components/onboarding/OnboardingModal";

import KpiSummaryWidget       from "@/components/dashboard/widgets/KpiSummaryWidget";
import FxRatesWidget          from "@/components/dashboard/widgets/FxRatesWidget";
import RecentRunsWidget       from "@/components/dashboard/widgets/RecentRunsWidget";
import PendingApprovalsWidget from "@/components/dashboard/widgets/PendingApprovalsWidget";
import WidgetErrorBoundary    from "@/components/ui/WidgetErrorBoundary";

import {
  LayoutGrid, TrendingUp, Shield, FileText, BarChart2,
  BookOpen, Settings, Clock, RefreshCw, Layers,
  Activity, Users,
} from "lucide-react";

/* ── Design tokens ─────────────────────────────────────────────────────────── */
const T = {
  bgDeep:   "var(--bg-deep)",
  bgPanel:  "var(--bg-panel)",
  bgSub:    "var(--bg-sub)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  cyan:     "var(--accent-cyan)",
  cyanDim:  "color-mix(in srgb, var(--accent-cyan) 10%, transparent)",
  cyanBdr:  "color-mix(in srgb, var(--accent-cyan) 22%, transparent)",
  amber:    "var(--accent-amber)",
  green:    "var(--status-pass)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  mono:     "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  ui:       "var(--font-terminal,'IBM Plex Sans',sans-serif)",
} as const;

/* ── Hub navigation links ──────────────────────────────────────────────────── */
const HUB_LINKS = [
  { icon: Layers,    label: "POSITION DESK", href: "/position-desk",  desc: "FX exposures" },
  { icon: TrendingUp,label: "HEDGE DESK",    href: "/hedge-desk",     desc: "Calculate & execute" },
  { icon: Shield,    label: "POLICY DESK",   href: "/policy-desk",    desc: "Governance rules" },
  { icon: Clock,     label: "STAGING",       href: "/staging",        desc: "Approval queue" },
  { icon: BarChart2, label: "REPORTS",       href: "/reports",        desc: "Analytics & export" },
  { icon: FileText,  label: "AUDIT TRAIL",   href: "/audit-trail",    desc: "Event ledger" },
  { icon: BookOpen,  label: "HEDGEWIKI",     href: "/hedgewiki",      desc: "Knowledge base" },
  { icon: Activity,  label: "RUN VIEWER",    href: "/run-viewer",     desc: "Calculation history" },
  { icon: Users,     label: "ACCESS",        href: "/access-control", desc: "Roles & permissions" },
  { icon: Settings,  label: "SETTINGS",      href: "/settings",       desc: "Preferences" },
] as const;

/* ── Section config ────────────────────────────────────────────────────────── */
const SECTIONS = [
  { num: "01", label: "PORTFOLIO",  desc: "Exposure & coverage" },
  { num: "02", label: "MARKET",     desc: "Live FX rates"       },
  { num: "03", label: "PIPELINE",   desc: "Recent calculations" },
  { num: "04", label: "GOVERNANCE", desc: "Pending approvals"   },
] as const;

/* ── formatAgo ─────────────────────────────────────────────────────────────── */
function formatAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5)   return "just now";
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

/* ── HubLink ───────────────────────────────────────────────────────────────── */
function HubLink({ icon: Icon, label, href, desc }: typeof HUB_LINKS[number]) {
  const router = useRouter();
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={() => router.push(href)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={desc}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
        padding: "10px 16px",
        background: hov ? T.cyanDim : "transparent",
        border: `1px solid ${hov ? T.cyanBdr : "transparent"}`,
        borderRadius: 3, cursor: "pointer",
        transition: "all 140ms ease", flexShrink: 0,
      }}
    >
      <Icon
        size={16}
        strokeWidth={1.5}
        style={{ color: hov ? T.cyan : T.tertiary, transition: "color 140ms" }}
      />
      <span style={{
        fontFamily: T.mono, fontSize: 8, letterSpacing: "0.12em",
        color: hov ? T.cyan : T.tertiary, transition: "color 140ms",
        whiteSpace: "nowrap",
      }}>
        {label}
      </span>
    </button>
  );
}

/* ── SectionHeader ─────────────────────────────────────────────────────────── */
function SectionHeader({ num, label, desc }: { num: string; label: string; desc: string }) {
  return (
    <div style={{
      height: 36, flexShrink: 0, display: "flex", alignItems: "center", gap: 12,
      padding: "0 16px", background: T.bgSub,
      borderBottom: `1px solid ${T.rim}`,
    }}>
      <span style={{
        fontFamily: T.mono, fontSize: 9, fontWeight: 700,
        color: T.tertiary, letterSpacing: "0.06em",
      }}>
        {num}
      </span>
      <span style={{
        fontFamily: T.mono, fontSize: 10, fontWeight: 700,
        color: T.primary, letterSpacing: "0.12em",
      }}>
        {label}
      </span>
      <span style={{ fontFamily: T.ui, fontSize: 10, color: T.tertiary }}>
        {desc}
      </span>
    </div>
  );
}

/* ── DashboardPage ─────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user, token } = useAuth();
  const [ready,      setReady]      = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastTs,     setLastTs]     = useState(Date.now());
  const [agoLabel,   setAgoLabel]   = useState("just now");
  const agoRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setReady(true); }, []);
  useEffect(() => {
    if (ready && !isLoading && !isAuthenticated) router.replace("/auth/login");
  }, [ready, isLoading, isAuthenticated, router]);

  // Live "last refreshed" countdown
  useEffect(() => {
    if (agoRef.current) clearInterval(agoRef.current);
    setAgoLabel(formatAgo(lastTs));
    agoRef.current = setInterval(() => setAgoLabel(formatAgo(lastTs)), 10_000);
    return () => { if (agoRef.current) clearInterval(agoRef.current); };
  }, [lastTs]);

  function handleRefresh() {
    setRefreshKey(k => k + 1);
    setLastTs(Date.now());
  }

  if (!ready || isLoading) {
    return (
      <div style={{
        height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: T.bgDeep, fontFamily: T.mono, fontSize: 11,
        color: T.tertiary, letterSpacing: "0.2em",
      }}>
        LOADING…
      </div>
    );
  }
  if (!isAuthenticated || !user || !token) return null;

  const u = user as UserContext;

  // Calculate grid height: viewport minus header(44) and hub(56)
  const gridH = "calc(100vh - 44px - 56px)";
  const cellH = `calc((100vh - 44px - 56px) / 2)`;

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      background: T.bgDeep, fontFamily: T.ui, color: T.primary,
      overflow: "hidden",
    }}>
      {/* L-13 onboarding */}
      {u.id && <OnboardingModal userId={u.id} />}

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div style={{
        height: 44, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px",
        background: T.bgPanel, borderBottom: `1px solid ${T.rim}`,
      }}>
        {/* Left: brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <LayoutGrid size={14} style={{ color: T.cyan }} strokeWidth={1.5} />
          <span style={{
            fontFamily: T.mono, fontSize: 11, fontWeight: 700,
            color: T.cyan, letterSpacing: "0.22em",
          }}>
            ORDR TERMINAL
          </span>
          <span style={{
            fontFamily: T.mono, fontSize: 9, color: T.tertiary,
            letterSpacing: "0.08em",
          }}>
            DASHBOARD
          </span>
        </div>

        {/* Right: refresh */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: T.mono, fontSize: 9, color: T.tertiary, letterSpacing: "0.06em" }}>
            {agoLabel}
          </span>
          <button
            onClick={handleRefresh}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              fontFamily: T.mono, fontSize: 9, letterSpacing: "0.1em",
              color: T.secondary, background: "none",
              border: `1px solid ${T.soft}`, padding: "5px 12px",
              borderRadius: 2, cursor: "pointer",
            }}
          >
            <RefreshCw size={11} strokeWidth={1.5} />
            REFRESH
          </button>
        </div>
      </div>

      {/* ── 2×2 Grid ─────────────────────────────────────────────────────────── */}
      <div style={{
        flex: 1, display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "1fr 1fr",
        height: gridH,
        overflow: "hidden",
      }}>

        {/* 01 · PORTFOLIO */}
        <div style={{
          display: "flex", flexDirection: "column",
          borderRight: `1px solid ${T.rim}`,
          borderBottom: `1px solid ${T.rim}`,
          overflow: "hidden",
          height: cellH,
        }}>
          <SectionHeader {...SECTIONS[0]} />
          <div style={{ flex: 1, overflow: "hidden" }}>
            <WidgetErrorBoundary widgetId="kpi_summary">
              <KpiSummaryWidget token={token} user={u} key={`kpi-${refreshKey}`} />
            </WidgetErrorBoundary>
          </div>
        </div>

        {/* 02 · MARKET */}
        <div style={{
          display: "flex", flexDirection: "column",
          borderBottom: `1px solid ${T.rim}`,
          overflow: "hidden",
          height: cellH,
        }}>
          <SectionHeader {...SECTIONS[1]} />
          <div style={{ flex: 1, overflow: "hidden" }}>
            <WidgetErrorBoundary widgetId="fx_rates">
              <FxRatesWidget token={token} user={u} key={`fx-${refreshKey}`} />
            </WidgetErrorBoundary>
          </div>
        </div>

        {/* 03 · PIPELINE */}
        <div style={{
          display: "flex", flexDirection: "column",
          borderRight: `1px solid ${T.rim}`,
          overflow: "hidden",
          height: cellH,
        }}>
          <SectionHeader {...SECTIONS[2]} />
          <div style={{ flex: 1, overflow: "hidden" }}>
            <WidgetErrorBoundary widgetId="recent_runs">
              <RecentRunsWidget token={token} key={`runs-${refreshKey}`} />
            </WidgetErrorBoundary>
          </div>
        </div>

        {/* 04 · GOVERNANCE */}
        <div style={{
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          height: cellH,
        }}>
          <SectionHeader {...SECTIONS[3]} />
          <div style={{ flex: 1, overflow: "hidden" }}>
            <WidgetErrorBoundary widgetId="pending_approvals">
              <PendingApprovalsWidget token={token} user={u} key={`approvals-${refreshKey}`} />
            </WidgetErrorBoundary>
          </div>
        </div>
      </div>

      {/* ── Hub navigation ───────────────────────────────────────────────────── */}
      <div style={{
        height: 56, flexShrink: 0,
        display: "flex", alignItems: "center",
        padding: "0 12px",
        background: T.bgPanel,
        borderTop: `1px solid ${T.rim}`,
        overflow: "hidden",
        gap: 0,
      }}>
        <span style={{
          fontFamily: T.mono, fontSize: 8, letterSpacing: "0.18em",
          color: T.tertiary, marginRight: 12, whiteSpace: "nowrap", flexShrink: 0,
        }}>
          HUB
        </span>
        <div style={{ width: 1, height: 24, background: T.rim, marginRight: 8, flexShrink: 0 }} />
        <div style={{
          display: "flex", alignItems: "center", flex: 1,
          overflowX: "auto", gap: 0,
        }}>
          {HUB_LINKS.map(link => (
            <HubLink key={link.href} {...link} />
          ))}
        </div>
      </div>
    </div>
  );
}
