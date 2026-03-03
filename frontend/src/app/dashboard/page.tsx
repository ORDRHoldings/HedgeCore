"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import type { UserContext } from "@/lib/authContext";

import KpiSummaryWidget       from "@/components/dashboard/widgets/KpiSummaryWidget";
import FxRatesWidget          from "@/components/dashboard/widgets/FxRatesWidget";
import RecentRunsWidget       from "@/components/dashboard/widgets/RecentRunsWidget";
import PendingApprovalsWidget from "@/components/dashboard/widgets/PendingApprovalsWidget";
import WidgetErrorBoundary    from "@/components/ui/WidgetErrorBoundary";

import {
  Layers, TrendingUp, Shield, FileText, BarChart2,
  BookOpen, Settings, Clock, Activity, Users, RefreshCw,
} from "lucide-react";

/* ── Tokens ──────────────────────────────────────────────────────────────── */
const T = {
  bg:        "#F8FAFC",
  panel:     "#FFFFFF",
  sub:       "#F1F5F9",
  rim:       "#E2E8F0",
  soft:      "#CBD5E1",
  rule:      "rgba(0,0,0,0.05)",
  blue:      "#1C62F2",
  blueDim:   "rgba(28,98,242,0.06)",
  blueBdr:   "rgba(28,98,242,0.18)",
  primary:   "#0F172A",
  secondary: "#334155",
  muted:     "#94A3B8",
  mono:      "'JetBrains Mono','IBM Plex Mono',monospace",
  ui:        "'Inter','IBM Plex Sans',sans-serif",
} as const;

/* ── Hub links ───────────────────────────────────────────────────────────── */
const HUB = [
  { Icon: Layers,     label: "POSITIONS",  href: "/position-desk"  },
  { Icon: TrendingUp, label: "HEDGE DESK", href: "/hedge-desk"     },
  { Icon: Shield,     label: "POLICY",     href: "/policy-desk"    },
  { Icon: Clock,      label: "STAGING",    href: "/staging"        },
  { Icon: BarChart2,  label: "REPORTS",    href: "/reports"        },
  { Icon: FileText,   label: "AUDIT",      href: "/audit-trail"    },
  { Icon: BookOpen,   label: "WIKI",       href: "/hedgewiki"      },
  { Icon: Activity,   label: "RUNS",       href: "/run-viewer"     },
  { Icon: Users,      label: "ACCESS",     href: "/access-control" },
  { Icon: Settings,   label: "SETTINGS",   href: "/settings"       },
] as const;

/* ── Formatters ──────────────────────────────────────────────────────────── */
function fmtAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5)    return "just now";
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

/* ── Quadrant label ──────────────────────────────────────────────────────── */
function Label({ index, title, sub }: { index: string; title: string; sub: string }) {
  return (
    <div style={{
      height: 36, flexShrink: 0,
      display: "flex", alignItems: "center", gap: 10,
      padding: "0 16px",
      background: T.sub,
      borderBottom: `1px solid ${T.rim}`,
    }}>
      <span style={{
        fontFamily: T.mono, fontSize: 15, color: T.muted,
        letterSpacing: "0.1em", fontWeight: 700,
      }}>
        {index}
      </span>
      <span style={{ width: 1, height: 12, background: T.rim, flexShrink: 0 }} />
      <span style={{
        fontFamily: T.mono, fontSize: 15, fontWeight: 700,
        color: T.primary, letterSpacing: "0.1em",
      }}>
        {title}
      </span>
      <span style={{
        fontFamily: T.ui, fontSize: 15,
        color: T.muted,
      }}>
        {sub}
      </span>
    </div>
  );
}

/* ── HubItem ─────────────────────────────────────────────────────────────── */
function HubItem({ Icon, label, href }: typeof HUB[number]) {
  const router = useRouter();
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={() => router.push(href)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: 5, padding: "0 18px",
        background: hov ? T.blueDim : "none",
        border: "none",
        borderRight: `1px solid ${T.rim}`,
        cursor: "pointer",
        height: "100%",
        transition: "background 130ms",
      }}
    >
      <Icon
        size={15} strokeWidth={1.4}
        style={{ color: hov ? T.blue : T.muted, transition: "color 130ms" }}
      />
      <span style={{
        fontFamily: T.mono, fontSize: 15, letterSpacing: "0.1em",
        color: hov ? T.blue : T.muted,
        transition: "color 130ms", whiteSpace: "nowrap",
      }}>
        {label}
      </span>
    </button>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, user, token } = useAuth();

  const [ready,  setReady]  = useState(false);
  const [rKey,   setRKey]   = useState(0);
  const [lastTs, setLastTs] = useState(Date.now());
  const [ago,    setAgo]    = useState("just now");
  const ivRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { setReady(true); }, []);

  useEffect(() => {
    if (ready && !isLoading && !isAuthenticated) router.replace("/auth/login");
  }, [ready, isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (ivRef.current) clearInterval(ivRef.current);
    setAgo(fmtAgo(lastTs));
    ivRef.current = setInterval(() => setAgo(fmtAgo(lastTs)), 10_000);
    return () => { if (ivRef.current) clearInterval(ivRef.current); };
  }, [lastTs]);

  function refresh() { setRKey(k => k + 1); setLastTs(Date.now()); }

  if (!ready || isLoading) {
    return (
      <div style={{
        height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: T.bg, fontFamily: T.mono, fontSize: 14,
        color: T.muted, letterSpacing: "0.18em",
      }}>
        LOADING…
      </div>
    );
  }
  if (!isAuthenticated || !user || !token) return null;

  const u = user as UserContext;

  return (
    <div style={{
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      background: T.bg,
      overflow: "hidden",
    }}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div style={{
        height: 44, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px",
        background: T.panel,
        borderBottom: `1px solid ${T.rim}`,
        boxShadow: "0 1px 3px rgba(15,23,42,0.04)",
      }}>
        <span style={{
          fontFamily: T.mono, fontSize: 14, fontWeight: 700,
          color: T.blue, letterSpacing: "0.22em",
        }}>
          ⬡ ORDR TERMINAL
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            fontFamily: T.mono, fontSize: 14,
            color: T.muted, letterSpacing: "0.06em",
          }}>
            {ago}
          </span>
          <button
            onClick={refresh}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              fontFamily: T.mono, fontSize: 14, letterSpacing: "0.1em",
              color: T.secondary, background: "none",
              border: `1px solid ${T.soft}`,
              padding: "5px 12px", borderRadius: 2, cursor: "pointer",
            }}
          >
            <RefreshCw size={11} strokeWidth={1.5} />
            REFRESH
          </button>
        </div>
      </div>

      {/* ── 2 × 2 grid ───────────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        display: "grid",
        gridTemplate: "1fr 1fr / 1fr 1fr",
        overflow: "hidden",
        minHeight: 0,
      }}>

        {/* 01 · PORTFOLIO */}
        <div style={{
          display: "flex", flexDirection: "column", overflow: "hidden",
          borderRight: `1px solid ${T.rim}`,
          borderBottom: `1px solid ${T.rim}`,
        }}>
          <Label index="01" title="PORTFOLIO" sub="Exposure & coverage" />
          <div style={{ flex: 1, overflow: "hidden" }}>
            <WidgetErrorBoundary widgetId="kpi_summary">
              <KpiSummaryWidget token={token} user={u} key={`kpi-${rKey}`} />
            </WidgetErrorBoundary>
          </div>
        </div>

        {/* 02 · MARKET */}
        <div style={{
          display: "flex", flexDirection: "column", overflow: "hidden",
          borderBottom: `1px solid ${T.rim}`,
        }}>
          <Label index="02" title="MARKET" sub="Live FX rates" />
          <div style={{ flex: 1, overflow: "hidden" }}>
            <WidgetErrorBoundary widgetId="fx_rates">
              <FxRatesWidget token={token} user={u} key={`fx-${rKey}`} />
            </WidgetErrorBoundary>
          </div>
        </div>

        {/* 03 · PIPELINE */}
        <div style={{
          display: "flex", flexDirection: "column", overflow: "hidden",
          borderRight: `1px solid ${T.rim}`,
        }}>
          <Label index="03" title="PIPELINE" sub="Recent calculations" />
          <div style={{ flex: 1, overflow: "hidden" }}>
            <WidgetErrorBoundary widgetId="recent_runs">
              <RecentRunsWidget token={token} key={`runs-${rKey}`} />
            </WidgetErrorBoundary>
          </div>
        </div>

        {/* 04 · GOVERNANCE */}
        <div style={{
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          <Label index="04" title="GOVERNANCE" sub="Pending approvals" />
          <div style={{ flex: 1, overflow: "hidden" }}>
            <WidgetErrorBoundary widgetId="pending_approvals">
              <PendingApprovalsWidget token={token} user={u} key={`gov-${rKey}`} />
            </WidgetErrorBoundary>
          </div>
        </div>

      </div>

      {/* ── Hub ──────────────────────────────────────────────────────────── */}
      <div style={{
        height: 56, flexShrink: 0,
        display: "flex", alignItems: "stretch",
        background: T.panel,
        borderTop: `1px solid ${T.rim}`,
        overflow: "hidden",
        boxShadow: "0 -1px 3px rgba(15,23,42,0.04)",
      }}>
        {/* Hub label */}
        <div style={{
          display: "flex", alignItems: "center", padding: "0 18px",
          borderRight: `1px solid ${T.rim}`,
          flexShrink: 0,
        }}>
          <span style={{
            fontFamily: T.mono, fontSize: 15, letterSpacing: "0.2em",
            color: T.muted, fontWeight: 700,
          }}>
            HUB
          </span>
        </div>

        {/* Links */}
        <div style={{
          display: "flex", alignItems: "stretch",
          flex: 1, overflow: "hidden",
        }}>
          {HUB.map(h => <HubItem key={h.href} {...h} />)}
        </div>
      </div>

    </div>
  );
}
