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

import { RefreshCw } from "lucide-react";

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
        height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
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
      height: "100%",
      display: "flex",
      flexDirection: "column",
      background: T.bg,
      overflow: "hidden",
    }}>

      {/* ── Context strip ──────────────────────────────────────────────── */}
      <div style={{
        height: 36, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px",
        background: T.panel,
        borderBottom: `1px solid ${T.rim}`,
      }}>
        <span style={{
          fontFamily: T.mono, fontSize: 11, fontWeight: 600,
          color: T.muted, letterSpacing: "0.14em",
        }}>
          DASHBOARD
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{
            fontFamily: T.mono, fontSize: 11,
            color: T.muted, letterSpacing: "0.06em",
          }}>
            {ago}
          </span>
          <button
            onClick={refresh}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              fontFamily: T.mono, fontSize: 11, letterSpacing: "0.1em",
              color: T.secondary, background: "none",
              border: `1px solid ${T.soft}`,
              padding: "3px 10px", borderRadius: 2, cursor: "pointer",
            }}
          >
            <RefreshCw size={10} strokeWidth={1.5} />
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
    </div>
  );
}
