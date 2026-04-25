"use client";

/**
 * /portfolio — ORDR Portfolio Product Hub
 * Beta entry point. Loads live exposure summary, links to sub-views.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import { PageShell } from "@/components/layout/PageShell";
import {
  BarChart3, Shield, Activity, TrendingDown, AlertTriangle,
  ArrowRight, RefreshCw, ChevronRight,
} from "lucide-react";

/* ── Design tokens ───────────────────────────────────────────────────────── */
const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  panel:    "var(--bg-panel)",
  sub:      "var(--bg-sub)",
  deep:     "var(--bg-deep)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  amber:    "var(--accent-amber)",
  green:    "var(--status-pass,#22c55e)",
  red:      "var(--accent-red,#f87171)",
  blue:     "#3b82f6",
} as const;

/* ── Types ───────────────────────────────────────────────────────────────── */
interface CurrencyRow {
  currency: string;
  gross_exposure_usd: number;
  hedged_usd: number;
  unhedged_usd: number;
  hedge_ratio: number;
  weight_pct: number;
  var_99_1w: number;
  unhedged_var_99: number;
  vol_ann: number;
  liquidity: string;
  position_count: number;
  is_em: boolean;
}

interface PortfolioSummary {
  total_exposure_usd: number;
  total_hedged_usd: number;
  total_unhedged_usd: number;
  portfolio_hedge_ratio: number;
  currency_count: number;
  var_99_1w_undiversified: number;
  var_99_1w_diversified: number;
}

interface RunDay { date: string; runs: number; }

interface PortfolioData {
  as_of: string;
  summary: PortfolioSummary;
  currencies: CurrencyRow[];
  run_history: RunDay[];
}

/* ── Formatters ──────────────────────────────────────────────────────────── */
function fmtM(n: number) {
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number) { return `${(n * 100).toFixed(1)}%`; }

function ratioColor(r: number) {
  if (r >= 0.75) return S.green;
  if (r >= 0.50) return S.amber;
  return S.red;
}

function liquidityLabel(l: string) {
  const map: Record<string, string> = { VERY_HIGH: "V.HIGH", HIGH: "HIGH", MEDIUM: "MED", LOW: "LOW" };
  return map[l] ?? l;
}

function liquidityColor(l: string) {
  if (l === "VERY_HIGH" || l === "HIGH") return S.green;
  if (l === "MEDIUM") return S.amber;
  return S.red;
}

/* ── Main page ───────────────────────────────────────────────────────────── */
export default function PortfolioPage() {
  const { token } = useAuth();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [asOf, setAsOf] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setErr(null);
    try {
      const res = await dashboardFetch("/v1/analytics/portfolio", token);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const d: PortfolioData = await res.json();
      setData(d);
      setAsOf(new Date(d.as_of).toLocaleString("en-US", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
      }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const s = data?.summary;

  return (
    <PageShell title="ORDR Portfolio" icon={BarChart3}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap",
        padding: "16px 24px", borderBottom: `1px solid ${S.rim}`,
        background: S.deep,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 15, fontWeight: 700, color: S.primary, letterSpacing: "0.04em" }}>
                ORDR PORTFOLIO
              </span>
              <span style={{
                fontFamily: S.fontMono, fontSize: 9, fontWeight: 700,
                color: S.amber, border: `1px solid ${S.amber}`,
                padding: "1px 6px", borderRadius: 2, letterSpacing: "0.1em",
              }}>
                BETA
              </span>
            </div>
            <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
              Multi-currency risk decomposition · R1-R8 taxonomy · WORM audit
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {asOf && (
            <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
              AS OF {asOf}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              fontFamily: S.fontMono, fontSize: 11, fontWeight: 600,
              color: S.cyan, background: "transparent",
              border: `1px solid ${S.rim}`, borderRadius: 3,
              padding: "5px 12px", cursor: "pointer",
            }}
          >
            <RefreshCw size={11} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            REFRESH
          </button>
        </div>
      </div>

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {err && (
        <div style={{
          margin: "16px 24px", padding: "10px 16px",
          background: "rgba(248,113,113,0.08)", border: `1px solid ${S.red}`,
          borderRadius: 4, display: "flex", alignItems: "center", gap: 8,
        }}>
          <AlertTriangle size={14} color={S.red} />
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.red }}>
            {err} — <button onClick={load} style={{ color: S.red, background: "none", border: "none", cursor: "pointer", fontFamily: S.fontMono, fontSize: 12, textDecoration: "underline" }}>retry</button>
          </span>
        </div>
      )}

      {/* ── Summary KPI strip ────────────────────────────────────────────── */}
      <div style={{
        display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr 1fr" : "repeat(6,1fr)",
        borderBottom: `1px solid ${S.rim}`,
      }}>
        {[
          { label: "TOTAL EXPOSURE",   val: s ? fmtM(s.total_exposure_usd)          : "—", sub: `${s?.currency_count ?? "—"} currencies` },
          { label: "HEDGED",           val: s ? fmtM(s.total_hedged_usd)             : "—", sub: s ? fmtPct(s.portfolio_hedge_ratio) + " ratio" : "—", color: S.green },
          { label: "UNHEDGED",         val: s ? fmtM(s.total_unhedged_usd)           : "—", sub: s ? fmtPct(1 - s.portfolio_hedge_ratio) + " residual" : "—", color: S.red },
          { label: "HEDGE RATIO",      val: s ? fmtPct(s.portfolio_hedge_ratio)      : "—", color: s ? ratioColor(s.portfolio_hedge_ratio) : S.tertiary },
          { label: "VaR 99% 1W (DIV)", val: s ? fmtM(s.var_99_1w_diversified)       : "—", sub: "diversified", color: S.amber },
          { label: "VaR 99% 1W (UNDIV)",val: s ? fmtM(s.var_99_1w_undiversified)    : "—", sub: "undiversified" },
        ].map((k) => (
          <div key={k.label} style={{
            padding: "14px 20px", borderRight: `1px solid ${S.rim}`,
            background: loading ? S.sub : S.panel,
          }}>
            <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 600, color: S.tertiary, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
              {k.label}
            </div>
            <div style={{ fontFamily: S.fontMono, fontSize: 16, fontWeight: 700, color: k.color ?? S.primary, marginBottom: 2 }}>
              {k.val}
            </div>
            {k.sub && <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Main layout: currency table + access cards ───────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 320px", gap: 0 }}>

        {/* Currency breakdown table */}
        <div style={{ borderRight: `1px solid ${S.rim}` }}>
          <div style={{
            padding: "10px 20px", borderBottom: `1px solid ${S.rim}`,
            background: S.sub, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap",
          }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.tertiary, letterSpacing: "0.1em" }}>
              CURRENCY EXPOSURE BREAKDOWN
            </span>
            <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
              {data ? `${data.currencies.length} pairs` : "—"}
            </span>
          </div>

          {loading && !data && (
            <div style={{ padding: "32px 24px", textAlign: "center" }}>
              <RefreshCw size={20} color={S.tertiary} style={{ animation: "spin 1s linear infinite" }} />
              <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, marginTop: 8 }}>LOADING PORTFOLIO DATA…</div>
            </div>
          )}

          {data && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: S.sub }}>
                  {["CCY", "GROSS", "HEDGED", "UNHEDGED", "RATIO", "VaR 99%", "VOL", "LIQ", "POSITIONS"].map(h => (
                    <th key={h} style={{
                      padding: "7px 14px", fontFamily: S.fontMono, fontSize: 10, fontWeight: 700,
                      color: S.tertiary, textAlign: h === "CCY" ? "left" : "right",
                      borderBottom: `1px solid ${S.rim}`, whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.currencies.map((row, i) => (
                  <tr key={row.currency} style={{
                    background: i % 2 === 0 ? S.panel : S.sub,
                    borderBottom: `1px solid ${S.soft}`,
                  }}>
                    <td style={{ padding: "9px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.cyan }}>{row.currency}</span>
                        {row.is_em && (
                          <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.amber, border: `1px solid ${S.amber}`, padding: "0 4px", borderRadius: 2 }}>EM</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "9px 14px", fontFamily: S.fontMono, fontSize: 11, color: S.primary, textAlign: "right" }}>{fmtM(row.gross_exposure_usd)}</td>
                    <td style={{ padding: "9px 14px", fontFamily: S.fontMono, fontSize: 11, color: S.green, textAlign: "right" }}>{fmtM(row.hedged_usd)}</td>
                    <td style={{ padding: "9px 14px", fontFamily: S.fontMono, fontSize: 11, color: row.unhedged_usd > 0 ? S.amber : S.tertiary, textAlign: "right" }}>{fmtM(row.unhedged_usd)}</td>
                    <td style={{ padding: "9px 14px", textAlign: "right" }}>
                      <span style={{
                        fontFamily: S.fontMono, fontSize: 11, fontWeight: 700,
                        color: ratioColor(row.hedge_ratio),
                      }}>{fmtPct(row.hedge_ratio)}</span>
                    </td>
                    <td style={{ padding: "9px 14px", fontFamily: S.fontMono, fontSize: 11, color: S.red, textAlign: "right" }}>{fmtM(row.unhedged_var_99)}</td>
                    <td style={{ padding: "9px 14px", fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, textAlign: "right" }}>{fmtPct(row.vol_ann)}</td>
                    <td style={{ padding: "9px 14px", textAlign: "right" }}>
                      <span style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 600, color: liquidityColor(row.liquidity) }}>
                        {liquidityLabel(row.liquidity)}
                      </span>
                    </td>
                    <td style={{ padding: "9px 14px", fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, textAlign: "right" }}>{row.position_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}

          {!loading && !data && !err && (
            <div style={{ padding: "40px 24px", textAlign: "center" }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
                No position data. Add positions in the Exposures desk first.
              </div>
              <Link href="/positions" style={{
                display: "inline-block", marginTop: 12,
                fontFamily: S.fontMono, fontSize: 11, color: S.cyan, textDecoration: "none",
              }}>GO TO EXPOSURES →</Link>
            </div>
          )}
        </div>

        {/* Right sidebar: access cards + run history */}
        <div style={{ display: "flex", flexDirection: "column" }}>

          {/* Nav cards */}
          {[
            {
              href: "/portfolio-risk",
              icon: TrendingDown,
              title: "Risk Analytics",
              desc: "R1-R8 risk taxonomy · VaR · CVaR · Monte Carlo · concentration · hedge effectiveness",
              badge: "LIVE DATA",
              badgeColor: S.green,
            },
            {
              href: "/portfolio-multi",
              icon: BarChart3,
              title: "Multi-Pair Matrix",
              desc: "26-pair correlation heatmap · concentration alerts · group view · hedge recommendations",
              badge: "26 PAIRS",
              badgeColor: S.cyan,
            },
            {
              href: "/portfolio-risk",
              icon: Shield,
              title: "IFRS 9 Effectiveness",
              desc: "Hedge effectiveness tests · dollar-offset · regression R² · quarterly reporting",
              badge: "WORM AUDIT",
              badgeColor: S.amber,
            },
            {
              href: "/portfolio-risk",
              icon: Activity,
              title: "Scenario Analysis",
              desc: "6 historical shocks · COVID flash crash · USD surge 2022 · EM selloff 2015",
              badge: "DETERMINISTIC",
              badgeColor: S.tertiary,
            },
          ].map((card) => (
            <Link key={card.title} href={card.href} style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              padding: "16px 18px",
              borderBottom: `1px solid ${S.rim}`,
              textDecoration: "none", background: S.panel,
              transition: "background 0.1s",
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 4, flexShrink: 0,
                background: S.sub, display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <card.icon size={15} color={S.cyan} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.primary }}>{card.title}</span>
                  <span style={{
                    fontFamily: S.fontMono, fontSize: 8, fontWeight: 700,
                    color: card.badgeColor, border: `1px solid ${card.badgeColor}`,
                    padding: "0 4px", borderRadius: 2, letterSpacing: "0.06em",
                  }}>{card.badge}</span>
                </div>
                <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, lineHeight: 1.5 }}>{card.desc}</div>
              </div>
              <ChevronRight size={12} color={S.tertiary} style={{ flexShrink: 0, marginTop: 4 }} />
            </Link>
          ))}

          {/* Run history */}
          <div style={{
            padding: "12px 18px", borderBottom: `1px solid ${S.rim}`,
            background: S.sub,
          }}>
            <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 600, color: S.tertiary, letterSpacing: "0.1em", marginBottom: 8 }}>
              CALCULATION RUNS — LAST 30 DAYS
            </div>
            {data?.run_history && data.run_history.length > 0 ? (
              <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 40 }}>
                {data.run_history.slice(-14).map((r) => {
                  const maxRuns = Math.max(...data.run_history.map(x => x.runs), 1);
                  const h = Math.max(4, (r.runs / maxRuns) * 36);
                  return (
                    <div
                      key={r.date}
                      title={`${r.date}: ${r.runs} runs`}
                      style={{
                        flex: 1, height: h, borderRadius: 2,
                        background: S.cyan, opacity: 0.7,
                      }}
                    />
                  );
                })}
              </div>
            ) : (
              <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
                No calculation runs in the last 30 days.
              </div>
            )}
          </div>

          {/* Quick nav to positions */}
          <div style={{ padding: "16px 18px", background: S.panel }}>
            <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 600, color: S.tertiary, letterSpacing: "0.1em", marginBottom: 10 }}>
              QUICK ACTIONS
            </div>
            {[
              { href: "/positions",      label: "Manage Positions" },
              { href: "/hedge-plan",     label: "Generate Hedge Plan" },
              { href: "/audit-lab",      label: "Audit Lab" },
              { href: "/sandbox",        label: "Scenario Studio" },
            ].map((a) => (
              <Link key={a.href} href={a.href} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "6px 0", borderBottom: `1px solid ${S.soft}`,
                fontFamily: S.fontMono, fontSize: 11, color: S.secondary,
                textDecoration: "none",
              }}>
                {a.label}
                <ArrowRight size={11} color={S.tertiary} />
              </Link>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </PageShell>
  );
}
