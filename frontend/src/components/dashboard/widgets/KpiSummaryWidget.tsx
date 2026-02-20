"use client";

import { useEffect, useState } from "react";
import { BarChart3, X } from "lucide-react";
import KpiTile from "@/components/ui/KpiTile";
import type { UserContext } from "@/lib/authContext";

const S = {
  fontUI:        "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:      "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgPanel:       "var(--bg-panel)",
  bgSurface:     "var(--bg-surface)",
  border:        "var(--border-rim)",
  textPrimary:   "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textTertiary:  "var(--text-tertiary)",
  accentCyan:    "var(--accent-cyan,#22d3ee)",
  accentRed:     "var(--accent-red,#f87171)",
  accentGreen:   "var(--accent-green,#34d399)",
};

interface DashboardSummary {
  branch_name:     string;
  company_name:    string;
  role:            string;
  hierarchy_level: number;
  is_company_wide: boolean;
  branch_currency: string;
  kpis: {
    active_proposals:   number;
    pending_approvals:  number;
    total_exposure_usd: number;
    hedge_coverage_pct: number;
    open_alerts:        number;
    team_size:          number;
  };
}

interface KpiSummaryWidgetProps {
  token:     string;
  user:      UserContext;
  onRemove?: () => void;
}

function formatExposure(usd: number): string {
  return `$${(usd / 1_000_000).toFixed(1)}M`;
}

function hedgeDeltaDirection(pct: number): "positive" | "negative" | "neutral" {
  if (pct >= 70) return "positive";
  if (pct < 60)  return "negative";
  return "neutral";
}

export default function KpiSummaryWidget({
  token,
  user: _user,
  onRemove,
}: KpiSummaryWidgetProps) {
  const [data,    setData]    = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchSummary = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/v1/dashboard/summary", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: DashboardSummary = await res.json();
        if (!cancelled) setData(json);
      } catch (err: unknown) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchSummary();
    return () => { cancelled = true; };
  }, [token]);

  const scopeLabel = data
    ? data.is_company_wide
      ? "COMPANY-WIDE"
      : data.branch_name.toUpperCase()
    : null;

  return (
    <div
      style={{
        fontFamily:    S.fontUI,
        background:    S.bgPanel,
        border:        error ? `1px solid ${S.accentRed}` : `1px solid ${S.border}`,
        borderLeft:    error ? `3px solid ${S.accentRed}` : undefined,
        borderRadius:  6,
        display:       "flex",
        flexDirection: "column",
        minWidth:      0,
      }}
    >
      {/* Header */}
      <div
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          8,
          padding:      "8px 12px",
          borderBottom: `1px solid ${S.border}`,
          background:   S.bgSurface,
          borderRadius: "5px 5px 0 0",
        }}
      >
        <BarChart3 size={13} style={{ color: S.accentCyan, flexShrink: 0 }} />
        <span
          style={{
            fontFamily:    S.fontMono,
            fontSize:      11,
            fontWeight:    600,
            letterSpacing: "0.08em",
            color:         S.textPrimary,
            textTransform: "uppercase",
          }}
        >
          KPI Summary
        </span>

        {scopeLabel && (
          <span
            style={{
              fontFamily:    S.fontMono,
              fontSize:      9,
              fontWeight:    600,
              letterSpacing: "0.1em",
              color:         S.accentCyan,
              background:    `${S.accentCyan}18`,
              border:        `1px solid ${S.accentCyan}44`,
              borderRadius:  3,
              padding:       "1px 5px",
              textTransform: "uppercase",
            }}
          >
            {scopeLabel}
          </span>
        )}

        <div style={{ flex: 1 }} />

        {onRemove && (
          <button
            onClick={onRemove}
            style={{
              background: "none",
              border:     "none",
              cursor:     "pointer",
              padding:    2,
              color:      S.textTertiary,
              display:    "flex",
              alignItems: "center",
              lineHeight: 1,
            }}
            title="Remove widget"
            aria-label="Remove KPI Summary widget"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: 12 }}>
        {loading && (
          <p
            style={{
              fontFamily: S.fontMono,
              fontSize:   11,
              color:      S.textTertiary,
              textAlign:  "center",
              margin:     "16px 0",
            }}
          >
            Loading...
          </p>
        )}

        {error && !loading && (
          <p
            style={{
              fontFamily: S.fontMono,
              fontSize:   11,
              color:      S.accentRed,
              margin:     0,
            }}
          >
            Error loading metrics
          </p>
        )}

        {data && !loading && !error && (
          <div
            style={{
              display:             "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
              gap:                 8,
            }}
          >
            <KpiTile
              label="Total Exposure"
              value={formatExposure(data.kpis.total_exposure_usd)}
              deltaDirection="neutral"
            />
            <KpiTile
              label="Hedge Coverage"
              value={`${data.kpis.hedge_coverage_pct}%`}
              deltaDirection={hedgeDeltaDirection(data.kpis.hedge_coverage_pct)}
              delta={
                data.kpis.hedge_coverage_pct >= 70
                  ? "Above threshold"
                  : data.kpis.hedge_coverage_pct < 60
                  ? "Below threshold"
                  : "Near threshold"
              }
            />
            <KpiTile
              label="Active Proposals"
              value={data.kpis.active_proposals}
              deltaDirection="neutral"
            />
            <KpiTile
              label="Pending Approvals"
              value={data.kpis.pending_approvals}
              deltaDirection={data.kpis.pending_approvals > 0 ? "negative" : "neutral"}
              delta={data.kpis.pending_approvals > 0 ? "Needs action" : undefined}
            />
            <KpiTile
              label="Open Alerts"
              value={data.kpis.open_alerts}
              deltaDirection={data.kpis.open_alerts > 0 ? "negative" : "neutral"}
              delta={data.kpis.open_alerts > 0 ? "Requires review" : undefined}
            />
            <KpiTile
              label="Team"
              value={data.kpis.team_size}
              deltaDirection="neutral"
            />
          </div>
        )}
      </div>
    </div>
  );
}