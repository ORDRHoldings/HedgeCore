"use client";

import { useEffect, useState } from "react";
import { Activity, X, ArrowRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import Link from "next/link";
import type { UserContext } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel:  "var(--bg-panel)",
  bgSub:    "var(--bg-sub)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  amber:    "var(--accent-amber)",
  green:    "var(--status-pass,#22c55e)",
  red:      "var(--accent-red,#f87171)",
} as const;

interface Props {
  token: string;
  user:  UserContext;
  onRemove?: () => void;
}

interface MonitorSummary {
  total_mtm_pnl:       number;
  effectiveness_score: number; // 0-1
  active_hedges:       number;
  coverage_pct:        number; // 0-1
  next_roll_days:      number | null;
}

function fmt(n: number, dp = 0): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: dp }).format(n);
}

function fmtPnl(n: number): string {
  const abs = Math.abs(n);
  const s   = n < 0 ? "-" : "+";
  if (abs >= 1_000_000) return `${s}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${s}$${(abs / 1_000).toFixed(1)}K`;
  return `${s}$${fmt(abs, 0)}`;
}

export default function HedgeMonitorWidget({ token, onRemove }: Props) {
  const [data,    setData]    = useState<MonitorSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Derive summary from positions + proposals
        const [posRes, propRes] = await Promise.all([
          dashboardFetch("/v1/positions?limit=500", token),
          dashboardFetch("/v1/proposals?status=EXECUTED&limit=200", token),
        ]);
        const positions  = posRes.ok  ? (await posRes.json()  as Record<string, unknown>[]) : [];
        const proposals  = propRes.ok ? (await propRes.json() as Record<string, unknown>[]) : [];

        const hedgedPos  = positions.filter(p => p.execution_status === "HEDGED");
        const totalPos   = positions.length;

        // MTM P&L: sum over proposals with entry_rate vs current implied rate (use hedge_rate as proxy)
        let mtm = 0;
        for (const p of proposals) {
          const amount = (p.hedge_amount as number) ?? 0;
          const rate   = (p.hedge_rate   as number) ?? 0;
          // Treat each fill as flat MTM (no live rate feed in widget — use 0 delta for safety)
          mtm += amount * rate * 0; // placeholder until live rate available
        }

        // Coverage
        const coverage = totalPos > 0 ? hedgedPos.length / totalPos : 0;

        // Effectiveness: ratio of proposals that passed risk gate
        const approved = proposals.filter(p => {
          const v = (p.risk_verdict as string ?? "").toUpperCase();
          return v === "APPROVE" || v === "APPROVED" || v === "PASS";
        });
        const effectiveness = proposals.length > 0 ? approved.length / proposals.length : 0;

        // Next roll: earliest maturity_date across proposals
        let nextRollDays: number | null = null;
        const now = Date.now();
        for (const p of proposals) {
          const md = p.maturity_date as string | null;
          if (!md) continue;
          const diff = Math.ceil((new Date(md).getTime() - now) / 86_400_000);
          if (diff >= 0 && (nextRollDays === null || diff < nextRollDays)) nextRollDays = diff;
        }

        setData({
          total_mtm_pnl:       mtm,
          effectiveness_score: effectiveness,
          active_hedges:       proposals.length,
          coverage_pct:        coverage,
          next_roll_days:      nextRollDays,
        });
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  const pnlColor = !data ? S.tertiary : data.total_mtm_pnl > 0 ? S.green : data.total_mtm_pnl < 0 ? S.red : S.secondary;
  const effColor = !data ? S.tertiary : data.effectiveness_score >= 0.8 ? S.green : data.effectiveness_score >= 0.6 ? S.amber : S.red;
  const covColor = !data ? S.tertiary : data.coverage_pct >= 0.8 ? S.green : data.coverage_pct >= 0.5 ? S.amber : S.red;

  const PnlIcon = !data ? Minus : data.total_mtm_pnl > 0 ? TrendingUp : data.total_mtm_pnl < 0 ? TrendingDown : Minus;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: S.bgPanel }}>
      {/* Header */}
      <div
        className="widget-drag-handle"
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px",
          background: S.bgSub,
          borderBottom: `1px solid ${S.rim}`,
          cursor: "grab", flexShrink: 0,
        }}
      >
        <Activity size={14} color={S.green} />
        <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: S.primary, flex: 1 }}>
          HEDGE MONITOR
        </span>
        <span style={{
          fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
          color: S.green,
          background: `color-mix(in srgb,${S.green} 12%,transparent)`,
          border: `1px solid color-mix(in srgb,${S.green} 25%,transparent)`,
          padding: "1px 5px", borderRadius: 2,
        }}>
          LIVE
        </span>
        {onRemove && (
          <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: S.tertiary, display: "flex", alignItems: "center" }}>
            <X size={13} />
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
        {loading ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.1em" }}>LOADING...</span>
          </div>
        ) : !data ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>NO DATA</span>
          </div>
        ) : (
          <>
            {/* MTM P&L */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: `color-mix(in srgb,${pnlColor} 6%,${S.bgSub})`, border: `1px solid color-mix(in srgb,${pnlColor} 20%,transparent)`, borderRadius: 3 }}>
              <PnlIcon size={18} color={pnlColor} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.1em", marginBottom: 2 }}>MTM P&L</div>
                <div style={{ fontFamily: S.fontMono, fontSize: 18, fontWeight: 700, color: pnlColor, letterSpacing: "0.04em" }}>
                  {fmtPnl(data.total_mtm_pnl)}
                </div>
              </div>
            </div>

            {/* Stats grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {/* Effectiveness */}
              <div style={{ padding: "8px 10px", background: S.bgSub, border: `1px solid ${S.soft}`, borderRadius: 3 }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.1em", marginBottom: 4 }}>EFFECTIVENESS</div>
                <div style={{ fontFamily: S.fontMono, fontSize: 15, fontWeight: 700, color: effColor }}>{fmt(data.effectiveness_score * 100, 0)}%</div>
                <div style={{ height: 3, borderRadius: 2, background: S.soft, marginTop: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${data.effectiveness_score * 100}%`, background: effColor, borderRadius: 2, transition: "width 400ms ease" }} />
                </div>
              </div>

              {/* Coverage */}
              <div style={{ padding: "8px 10px", background: S.bgSub, border: `1px solid ${S.soft}`, borderRadius: 3 }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.1em", marginBottom: 4 }}>COVERAGE</div>
                <div style={{ fontFamily: S.fontMono, fontSize: 15, fontWeight: 700, color: covColor }}>{fmt(data.coverage_pct * 100, 0)}%</div>
                <div style={{ height: 3, borderRadius: 2, background: S.soft, marginTop: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${data.coverage_pct * 100}%`, background: covColor, borderRadius: 2, transition: "width 400ms ease" }} />
                </div>
              </div>

              {/* Active hedges */}
              <div style={{ padding: "8px 10px", background: S.bgSub, border: `1px solid ${S.soft}`, borderRadius: 3 }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.1em", marginBottom: 4 }}>ACTIVE HEDGES</div>
                <div style={{ fontFamily: S.fontMono, fontSize: 15, fontWeight: 700, color: S.cyan }}>{data.active_hedges}</div>
              </div>

              {/* Next roll */}
              <div style={{ padding: "8px 10px", background: S.bgSub, border: `1px solid ${S.soft}`, borderRadius: 3 }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.1em", marginBottom: 4 }}>NEXT ROLL</div>
                <div style={{ fontFamily: S.fontMono, fontSize: 15, fontWeight: 700, color: data.next_roll_days !== null && data.next_roll_days <= 7 ? S.amber : S.primary }}>
                  {data.next_roll_days !== null ? `${data.next_roll_days}d` : "—"}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer link */}
      <Link
        href="/hedge-monitor"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          padding: "8px 14px",
          borderTop: `1px solid ${S.soft}`,
          fontFamily: S.fontMono, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
          color: S.cyan, textDecoration: "none",
          background: "color-mix(in srgb, var(--accent-cyan) 4%, transparent)",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "color-mix(in srgb, var(--accent-cyan) 8%, transparent)")}
        onMouseLeave={e => (e.currentTarget.style.background = "color-mix(in srgb, var(--accent-cyan) 4%, transparent)")}
      >
        OPEN FULL MONITOR <ArrowRight size={11} />
      </Link>
    </div>
  );
}
