"use client";

/**
 * SmbExposureCard — 4-KPI grid for SMB dashboard.
 * Shows total MXN exposure, hedge coverage %, open positions, pending actions.
 */
import { useEffect, useState } from "react";
import { TrendingUp, Shield, Layers, AlertCircle } from "lucide-react";
import { dashboardFetch } from "@/lib/api/dashboardClient";

const S = {
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgPanel: "var(--bg-panel)",
  rim: "var(--border-rim)",
  soft: "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)",
  amber: "var(--accent-amber)",
  pass: "var(--status-pass)",
  fail: "var(--accent-red,#B91C1C)",
} as const;

interface Props {
  token: string;
}

interface Summary {
  total_exposure_usd: number;
  hedge_coverage_pct: number;
  open_positions: number;
  pending_approvals: number;
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default function SmbExposureCard({ token }: Props) {
  const [data, setData] = useState<Summary | null>(null);

  useEffect(() => {
    dashboardFetch("/v1/dashboard/summary", token)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setData({
            total_exposure_usd: d.total_exposure_usd ?? 0,
            hedge_coverage_pct: d.hedge_coverage_pct ?? 0,
            open_positions: d.open_positions ?? d.active_proposals ?? 0,
            pending_approvals: d.pending_approvals ?? 0,
          });
        }
      })
      .catch(() => {});
  }, [token]);

  const cards = [
    {
      label: "MXN EXPOSURE",
      value: data ? fmtUsd(data.total_exposure_usd) : "—",
      sub: "Total notional (USD equiv.)",
      icon: <TrendingUp size={16} />,
      color: S.cyan,
    },
    {
      label: "HEDGE COVERAGE",
      value: data ? `${data.hedge_coverage_pct.toFixed(0)}%` : "—",
      sub: data && data.hedge_coverage_pct >= 80 ? "On target" : "Below target",
      icon: <Shield size={16} />,
      color: data && data.hedge_coverage_pct >= 80 ? S.pass : S.amber,
    },
    {
      label: "OPEN POSITIONS",
      value: data ? `${data.open_positions}` : "—",
      sub: "Active FX exposures",
      icon: <Layers size={16} />,
      color: S.secondary,
    },
    {
      label: "PENDING",
      value: data ? `${data.pending_approvals}` : "—",
      sub: data && data.pending_approvals > 0 ? "Needs your attention" : "All clear",
      icon: <AlertCircle size={16} />,
      color: data && data.pending_approvals > 0 ? S.amber : S.pass,
    },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: S.soft, borderRadius: 2, overflow: "hidden" }}>
      {cards.map((c) => (
        <div
          key={c.label}
          style={{
            background: S.bgPanel,
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: c.color, display: "flex" }}>{c.icon}</span>
            <span
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.1em",
                color: S.tertiary,
                textTransform: "uppercase",
              }}
            >
              {c.label}
            </span>
          </div>
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 28,
              fontWeight: 700,
              color: S.primary,
              lineHeight: 1,
            }}
          >
            {c.value}
          </span>
          <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>
            {c.sub}
          </span>
        </div>
      ))}
    </div>
  );
}
