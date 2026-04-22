"use client";

/**
 * /hedge-monitor — Live Hedge Portfolio Monitor
 *
 * Post-execution daily engagement page. Shows:
 *   1. Portfolio hedge status (total hedged, unhedged, coverage, MTM P&L)
 *   2. Active hedges table (entry rate, current rate, P&L, effectiveness)
 *   3. Roll schedule (upcoming expirations)
 *   4. Regulatory capital impact
 *   5. CTA to Hedge Desk
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useIsMobile } from "@/lib/hooks/useBreakpoint";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/authContext";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import { usePlanRedirect } from "@/lib/hooks/usePlanRedirect";

import { PageShell } from "@/components/layout/PageShell";
import { Play } from "lucide-react";

const S = {
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:    "var(--bg-deep)",
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  rim:       "var(--border-rim)",
  soft:      "var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  green:     "var(--status-pass, #22c55e)",
  amber:     "var(--accent-amber)",
  red:       "var(--accent-red, #f87171)",
  pass:      "var(--status-pass, #22c55e)",
  fail:      "var(--status-fail, #ef4444)",
  emerald:   "#2ECC71",
  crimson:   "#E74C3C",
} as const;

// ── CME futures month codes ────────────────────────────────────────────────────
const MONTH_CODES: Record<string, number> = {
  F: 1, G: 2, H: 3, J: 4, K: 5, M: 6,
  N: 7, Q: 8, U: 9, V: 10, X: 11, Z: 12,
};

function parseExpiryFromInstrument(instrument: string): Date | null {
  // e.g. "M6E Z26" → Dec 2026
  const m = instrument?.match(/([FGHJKMNQUVXZ])(\d{2})\b/);
  if (!m) return null;
  const month = MONTH_CODES[m[1]];
  const year  = 2000 + parseInt(m[2], 10);
  if (!month) return null;
  return new Date(year, month - 1, 15); // 3rd Friday approximation
}

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

function fmtUSD(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "+";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}
function fmtAmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(Math.abs(n) / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `$${(Math.abs(n) / 1_000).toFixed(1)}K`;
  return `$${Math.abs(n).toFixed(0)}`;
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface Position {
  id: string;
  entity: string;
  currency: string;
  amount: number;
  execution_status: string;
  value_date: string;
}

interface Proposal {
  id: string;
  position_id: string;
  status: string;
  execution_ref: string | null;
  actual_fill_rate: number | null;
  hedge_rate?: number | null;
  hedge_amount?: number | null;
  executed_at: string | null;
  proposal_payload?: Record<string, unknown>;
}

interface MarketData {
  spot?: number;
  [key: string]: unknown;
}

interface ActiveHedge {
  id: string;
  entity: string;
  currency: string;
  notionalUSD: number;
  entryRate: number;
  currentRate: number;
  mtmPnL: number;
  effectiveness: number;
  instrument: string | null;
  executedAt: string | null;
  proposalId: string;
}

// ── Collapsible section ────────────────────────────────────────────────────────
function Section({ title, badge, badgeColor, children }: {
  title: string;
  badge?: string;
  badgeColor?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ border: `1px solid ${S.rim}`, borderRadius: 4, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "8px 14px", background: S.bgSub, borderBottom: open ? `1px solid ${S.soft}` : "none",
          border: "none", cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{ transition: "transform 0.15s", transform: open ? "rotate(90deg)" : "rotate(0deg)", color: S.tertiary, fontSize: 12 }}>▸</span>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, flex: 1, textTransform: "uppercase" }}>{title}</span>
        {badge && (
          <span style={{
            fontFamily: S.fontMono, fontSize: 12, padding: "1px 5px",
            border: `1px solid ${badgeColor ?? S.cyan}40`,
            background: `${badgeColor ?? S.cyan}10`,
            color: badgeColor ?? S.cyan, letterSpacing: "0.06em",
          }}>{badge}</span>
        )}
      </button>
      {open && <div style={{ background: S.bgPanel }}>{children}</div>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function HedgeMonitorPage() {
  const isMobile = useIsMobile();
  const _planAllowed = usePlanRedirect("professional");
  const router = useRouter();
  const { user, token } = useAuth();

  const [positions, setPositions]   = useState<Position[]>([]);
  const [proposals, setProposals]   = useState<Proposal[]>([]);
  const [marketData, setMarketData] = useState<Record<string, MarketData>>({});
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [utcTime, setUtcTime]       = useState(() => new Date().toUTCString().slice(17, 25));

  // Auth guard
  useEffect(() => {
    if (!user) router.push("/auth/login");
  }, [user, router]);

  // Live UTC clock
  useEffect(() => {
    const id = setInterval(() => setUtcTime(new Date().toUTCString().slice(17, 25)), 1_000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [posRes, propRes, mktRes] = await Promise.allSettled([
        dashboardFetch("/v1/positions?limit=500", token),
        dashboardFetch("/v1/proposals?status=EXECUTED", token),
        fetch("/api/market-autofill"),
      ]);

      if (posRes.status === "fulfilled" && posRes.value.ok) {
        const d = await posRes.value.json();
        const all: Position[] = d.items ?? d ?? [];
        setPositions(all.filter((p: Position) => p.execution_status === "HEDGED"));
      }

      if (propRes.status === "fulfilled" && propRes.value.ok) {
        const d = await propRes.value.json();
        setProposals(Array.isArray(d) ? d : d.items ?? []);
      }

      if (mktRes.status === "fulfilled" && mktRes.value.ok) {
        const d = await mktRes.value.json();
        setMarketData(d?.rates ?? d ?? {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // ── Derived: active hedges ───────────────────────────────────────────────────
  const activeHedges = useMemo((): ActiveHedge[] => {
    return positions.map(pos => {
      const prop = proposals.find(p => p.position_id === pos.id);
      const entryRate = (prop?.actual_fill_rate
        ?? prop?.hedge_rate
        ?? (prop?.proposal_payload?.hedge_rate as number)
        ?? null);
      const mktEntry = marketData[pos.currency];
      const currentRate = (mktEntry?.spot as number | undefined) ?? entryRate ?? 1;
      const notionalUSD = Math.abs(pos.amount ?? 0);
      const entry = entryRate ?? currentRate;

      // For a SELL hedge: profit when foreign currency weakens (rate rises for MXN/USD)
      const mtmPnL = entry > 0
        ? ((entry - currentRate) / entry) * notionalUSD
        : 0;

      // IFRS 9 dollar-offset hedge effectiveness
      const hedgePnL = Math.abs(mtmPnL);
      const underlyingPnL = Math.abs(currentRate > 0 ? ((currentRate - entry) / entry) * notionalUSD : 1);
      const effectiveness = underlyingPnL > 0
        ? Math.min(Math.abs(hedgePnL / underlyingPnL), Math.abs(underlyingPnL / hedgePnL)) * 100
        : 95;

      const instrument = prop?.execution_ref ?? null;

      return {
        id: pos.id,
        entity: pos.entity,
        currency: pos.currency,
        notionalUSD,
        entryRate: entry,
        currentRate,
        mtmPnL,
        effectiveness: Math.min(effectiveness, 100),
        instrument,
        executedAt: prop?.executed_at ?? null,
        proposalId: prop?.id ?? "",
      };
    });
  }, [positions, proposals, marketData]);

  // ── Portfolio aggregates ────────────────────────────────────────────────────
  const totalHedged   = activeHedges.reduce((s, h) => s + h.notionalUSD, 0);
  const totalMtmPnL   = activeHedges.reduce((s, h) => s + h.mtmPnL, 0);
  const avgEff        = activeHedges.length > 0
    ? activeHedges.reduce((s, h) => s + h.effectiveness, 0) / activeHedges.length
    : 0;

  // Estimate unhedged from all positions (both hedged and not)
  const [allPositions, setAllPositions] = useState<Position[]>([]);
  useEffect(() => {
    if (!token) return;
    dashboardFetch("/v1/positions?limit=500", token)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setAllPositions(d.items ?? d ?? []); })
      .catch(() => {});
  }, [token]);
  const totalExposure = allPositions.reduce((s, p) => s + Math.abs(p.amount ?? 0), 0);
  const totalUnhedged = Math.max(0, totalExposure - totalHedged);
  const coverage      = totalExposure > 0 ? (totalHedged / totalExposure) * 100 : 0;

  if (!user) return null;

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (!loading && activeHedges.length === 0) {
    return (
      <div style={{ minHeight: "100vh", background: S.bgDeep, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: S.fontUI }}>
        <div style={{ fontFamily: S.fontMono, fontSize: 12, letterSpacing: "0.12em", color: S.tertiary }}>NO HEDGED POSITIONS</div>
        <div style={{ fontSize: 14, color: S.secondary, textAlign: "center", maxWidth: 380, lineHeight: 1.6 }}>
          No hedged positions yet. Run the Hedge Desk to generate your first hedge.
        </div>
        <Link href="/hedge-desk" style={{
          fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
          color: "#fff", background: "#1C62F2", border: "none", padding: "10px 24px",
          textDecoration: "none", display: "inline-block",
        }}>
          → OPEN HEDGE DESK
        </Link>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: S.bgDeep, display: "flex", flexDirection: "column", color: S.primary, fontFamily: S.fontUI }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{
        height: 44, background: S.bgPanel, borderBottom: `1px solid ${S.rim}`,
        display: "flex", alignItems: "center", padding: "0 20px", gap: 12,
        position: "sticky", top: 0, zIndex: 10, flexShrink: 0,
      }}>
        <button
          onClick={() => router.push("/dashboard")}
          style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, background: "none", border: "none", cursor: "pointer", padding: 0, letterSpacing: "0.04em" }}
        >
          ← Dashboard
        </button>
        <span style={{ color: S.rim, fontSize: 14 }}>|</span>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.primary, textTransform: "uppercase" }}>
          Hedge Monitor
        </span>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, letterSpacing: "0.08em", color: S.cyan, border: `1px solid ${S.cyan}40`, background: `${S.cyan}10`, padding: "2px 7px" }}>
          LIVE MTM
        </span>
        <div style={{ flex: 1 }} />
        {/* Live indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: S.green, boxShadow: `0 0 6px ${S.green}`,
            animation: "pulse 2s infinite", display: "inline-block",
          }} />
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.green, letterSpacing: "0.1em" }}>LIVE</span>
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, letterSpacing: "0.06em" }}>{utcTime} UTC</span>
        </div>
        <button
          onClick={load}
          style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary, background: "transparent", border: `1px solid ${S.rim}`, padding: "2px 10px", cursor: "pointer", letterSpacing: "0.04em" }}
        >
          ↻
        </button>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

        {loading && (
          <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, textAlign: "center", padding: 60, letterSpacing: "0.08em" }}>
            LOADING PORTFOLIO DATA...
          </div>
        )}
        {error && (
          <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.red, padding: "10px 14px", background: `${S.red}12`, border: `1px solid ${S.red}40` }}>
            ERROR — {error}
          </div>
        )}

        {!loading && (
          <>
            {/* ── Section 1: Portfolio Status ───────────────────────────── */}
            <div style={{
              display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: 12,
              background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 4, padding: 16,
            }}>
              {[
                { label: "TOTAL HEDGED",    value: fmtAmt(totalHedged),        color: S.cyan,  sub: `${activeHedges.length} position${activeHedges.length !== 1 ? "s" : ""}` },
                { label: "UNHEDGED",        value: fmtAmt(totalUnhedged),       color: S.amber, sub: `${(100 - coverage).toFixed(1)}% exposure` },
                { label: "COVERAGE RATIO",  value: `${coverage.toFixed(1)}%`,   color: coverage >= 80 ? S.green : S.amber, sub: "IFRS 9 target: ≥80%" },
                { label: "MTM P&L",         value: fmtUSD(totalMtmPnL),         color: totalMtmPnL >= 0 ? S.green : S.red, sub: totalMtmPnL >= 0 ? "Hedges in profit" : "Hedges at loss" },
              ].map(kpi => (
                <div key={kpi.label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, textTransform: "uppercase" }}>{kpi.label}</span>
                  <span style={{ fontFamily: S.fontMono, fontSize: 20, fontWeight: 700, color: kpi.color, lineHeight: 1 }}>{kpi.value}</span>
                  <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>{kpi.sub}</span>
                </div>
              ))}
            </div>

            {/* Effectiveness summary */}
            <div style={{
              display: "flex", alignItems: "center", gap: 24,
              padding: "10px 16px", background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 4,
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary }}>HEDGE EFFECTIVENESS RATIO</span>
                <span style={{ fontFamily: S.fontMono, fontSize: 16, fontWeight: 700, color: avgEff >= 80 ? S.green : S.amber }}>{avgEff.toFixed(1)}%</span>
              </div>
              <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, lineHeight: 1.5, maxWidth: 440 }}>
                {avgEff >= 80
                  ? "✓ IFRS 9 compliant — hedge effectiveness within 80–125% range for hedge accounting qualification."
                  : "⚠ Below IFRS 9 threshold — review hedge designation and effectiveness documentation."}
              </div>
              <div style={{ flex: 1 }} />
              <Link href="/hedge-desk" style={{
                fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                color: "#fff", background: "#1C62F2", padding: "7px 16px",
                textDecoration: "none", borderRadius: 3, whiteSpace: "nowrap",
              }}>
                Hedge More Positions →
              </Link>
            </div>

            {/* ── Section 2: Active Hedges Table ────────────────────────── */}
            <Section title={`Active Hedges (${activeHedges.length})`} badge="MTM" badgeColor={S.cyan}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: S.bgSub }}>
                      {["ENTITY", "CCY", "NOTIONAL", "ENTRY RATE", "CURRENT", "MTM P&L", "EFF.%", "INSTRUMENT", "STATUS"].map(h => (
                        <th key={h} scope="col" style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: S.tertiary, padding: "7px 12px", textAlign: "left", whiteSpace: "nowrap", borderBottom: `1px solid ${S.soft}` }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeHedges.map((h, i) => {
                      const itm = h.mtmPnL >= 0;
                      return (
                        <tr key={h.id} style={{ background: i % 2 === 0 ? S.bgPanel : S.bgSub }}>
                          <td style={{ fontFamily: S.fontUI, fontSize: 12, color: S.primary, padding: "7px 12px", borderBottom: `1px solid ${S.soft}` }}>{h.entity}</td>
                          <td style={{ fontFamily: S.fontMono, fontSize: 12, color: S.cyan, padding: "7px 12px", borderBottom: `1px solid ${S.soft}` }}>{h.currency}</td>
                          <td style={{ fontFamily: S.fontMono, fontSize: 12, color: S.primary, padding: "7px 12px", borderBottom: `1px solid ${S.soft}` }}>{fmtAmt(h.notionalUSD)}</td>
                          <td style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary, padding: "7px 12px", borderBottom: `1px solid ${S.soft}` }}>{h.entryRate.toFixed(4)}</td>
                          <td style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary, padding: "7px 12px", borderBottom: `1px solid ${S.soft}` }}>{h.currentRate.toFixed(4)}</td>
                          <td style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, color: itm ? S.emerald : S.crimson, padding: "7px 12px", borderBottom: `1px solid ${S.soft}` }}>
                            {fmtUSD(h.mtmPnL)}
                          </td>
                          <td style={{ fontFamily: S.fontMono, fontSize: 12, color: h.effectiveness >= 80 ? S.green : S.amber, padding: "7px 12px", borderBottom: `1px solid ${S.soft}` }}>
                            {h.effectiveness.toFixed(1)}%
                          </td>
                          <td style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, padding: "7px 12px", borderBottom: `1px solid ${S.soft}` }}>
                            {h.instrument?.slice(0, 20) ?? "—"}
                          </td>
                          <td style={{ padding: "7px 12px", borderBottom: `1px solid ${S.soft}` }}>
                            <span style={{
                              fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
                              color: itm ? S.emerald : S.crimson, padding: "2px 6px",
                              border: `1px solid ${itm ? S.emerald : S.crimson}40`,
                              background: `${itm ? S.emerald : S.crimson}12`,
                            }}>
                              {itm ? "● ITM" : "● OTM"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Section>

            {/* ── Section 3: Roll Schedule ──────────────────────────────── */}
            <Section title="Roll Schedule" badge="EXPIRY" badgeColor={S.amber}>
              <div style={{ padding: 16 }}>
                {activeHedges
                  .map(h => ({ ...h, expiry: h.instrument ? parseExpiryFromInstrument(h.instrument) : null }))
                  .filter(h => h.expiry !== null)
                  .sort((a, b) => (a.expiry!.getTime() - b.expiry!.getTime()))
                  .map(h => {
                    const days = daysUntil(h.expiry!);
                    const urgency = days < 7 ? S.red : days < 14 ? S.amber : S.green;
                    return (
                      <PageShell icon={Play} title="Hedge Monitor" breadcrumb={["Dashboard","Hedge Monitor"]}>

                      <div key={h.id} style={{
                        display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr 1fr" : "1fr auto auto auto",
                        alignItems: "center", gap: 16, padding: "10px 12px",
                        background: S.bgSub, border: `1px solid ${S.soft}`,
                        borderRadius: 4, marginBottom: 8,
                      }}>
                        <div>
                          <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.primary }}>{h.entity}</span>
                          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginLeft: 8 }}>{h.instrument}</span>
                        </div>
                        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.cyan }}>{h.currency}</span>
                        <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>
                          {h.expiry!.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                        <span style={{
                          fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                          color: urgency, padding: "2px 8px",
                          border: `1px solid ${urgency}40`, background: `${urgency}12`,
                        }}>
                          {days < 0 ? "EXPIRED" : days < 7 ? `${days}d CRITICAL` : days < 14 ? `${days}d WARNING` : `${days}d`}
                        </span>
                      </div>
                    
                      </PageShell>
                    );
                  })}
                {activeHedges.every(h => !h.instrument || !parseExpiryFromInstrument(h.instrument)) && (
                  <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.tertiary, textAlign: "center", padding: 20 }}>
                    No instrument expiry data available. Instruments require futures codes (e.g., M6E Z26).
                  </div>
                )}
              </div>
            </Section>

            {/* ── Section 4: Basis Risk / Correlation ───────────────────── */}
            <Section title="Hedge Effectiveness by Position" badge="IFRS 9" badgeColor={S.cyan}>
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                {activeHedges.map(h => (
                  <div key={h.id} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr 1fr" : "1fr 120px 80px", alignItems: "center", gap: 12 }}>
                    <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.primary }}>{h.entity} ({h.currency})</span>
                    {/* Effectiveness bar */}
                    <div style={{ height: 6, background: S.bgSub, borderRadius: 3, overflow: "hidden", border: `1px solid ${S.soft}` }}>
                      <div style={{
                        height: "100%",
                        width: `${Math.min(h.effectiveness, 100)}%`,
                        background: h.effectiveness >= 80 ? S.green : h.effectiveness >= 60 ? S.amber : S.red,
                        borderRadius: 3,
                        transition: "width 0.4s ease",
                      }} />
                    </div>
                    <span style={{
                      fontFamily: S.fontMono, fontSize: 12, fontWeight: 600,
                      color: h.effectiveness >= 80 ? S.green : h.effectiveness >= 60 ? S.amber : S.red,
                      textAlign: "right",
                    }}>
                      {h.effectiveness.toFixed(1)}%
                    </span>
                  </div>
                ))}
                <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginTop: 8 }}>
                  IFRS 9 §6.4.1 — hedge effectiveness must remain within 80–125% range. Dollar-offset method.
                </div>
              </div>
            </Section>

          </>
        )}
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}
