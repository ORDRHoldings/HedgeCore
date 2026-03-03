"use client";

import { useState, useEffect } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import type { BucketResult } from "@/api/types";
import {
  CheckCircleIcon, AlertCircleIcon, LoaderIcon, ChevronLeftIcon,
  CopyIcon, ExternalLinkIcon, ShieldCheckIcon, UserCheckIcon,
  ActivityIcon,
} from "lucide-react";

// ─── Design tokens ──────────────────────────────────────────────────────────
const S = {
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  bgDeep:    "var(--bg-deep)",
  rim:       "var(--border-rim)",
  soft:      "var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber)",
  red:       "var(--accent-red,#E74C3C)",
  green:     "var(--status-pass,#22c55e)",
  mono:      "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  ui:        "var(--font-terminal,'IBM Plex Sans',sans-serif)",
} as const;

// ─── CME contract specifications (reference data — margins from CME exchange) ─
const CME_SPECS: Record<string, {
  symbol: string; name: string; contract_size: number;
  currency: string; margin_est: number; tick_size: number; tick_value: number;
}> = {
  MXN: { symbol: "M6M", name: "Mexican Peso Futures",      contract_size: 500_000,    currency: "MXN", margin_est: 1800, tick_size: 0.000025,  tick_value: 12.50 },
  EUR: { symbol: "6E",  name: "Euro FX Futures",           contract_size: 125_000,    currency: "EUR", margin_est: 2200, tick_size: 0.00005,   tick_value: 6.25  },
  GBP: { symbol: "6B",  name: "British Pound Futures",     contract_size: 62_500,     currency: "GBP", margin_est: 1900, tick_size: 0.0001,    tick_value: 6.25  },
  JPY: { symbol: "6J",  name: "Japanese Yen Futures",      contract_size: 12_500_000, currency: "JPY", margin_est: 2000, tick_size: 0.0000005, tick_value: 6.25  },
  CAD: { symbol: "6C",  name: "Canadian Dollar Futures",   contract_size: 100_000,    currency: "CAD", margin_est: 1500, tick_size: 0.00005,   tick_value: 5.00  },
  CHF: { symbol: "6S",  name: "Swiss Franc Futures",       contract_size: 125_000,    currency: "CHF", margin_est: 2100, tick_size: 0.0001,    tick_value: 12.50 },
  AUD: { symbol: "6A",  name: "Australian Dollar Futures", contract_size: 100_000,    currency: "AUD", margin_est: 1400, tick_size: 0.0001,    tick_value: 10.00 },
  NZD: { symbol: "6N",  name: "NZ Dollar Futures",         contract_size: 100_000,    currency: "NZD", margin_est: 1300, tick_size: 0.0001,    tick_value: 10.00 },
};

const DEFAULT_SPEC = CME_SPECS.MXN;

// ─── Market snapshot types ───────────────────────────────────────────────────
interface FxRateEntry { symbol: string; bid: number; ask: number; mid: number; }
interface MarketSnap  { rates: FxRateEntry[]; source: string; cachedAt: number; }

// ─── IBKR deep link helpers ──────────────────────────────────────────────────
function ibkrNativeUrl(spec: typeof CME_SPECS[string], side: string, qty: number, rate: number): string {
  return `ibkr://order?symbol=${spec.symbol}&secType=FUT&exchange=CME&side=${side}&quantity=${qty}&orderType=LMT&lmtPrice=${rate.toFixed(5)}&currency=USD&tif=GTC`;
}
function openIbkr(spec: typeof CME_SPECS[string], side: string, qty: number, rate: number): void {
  window.open(ibkrNativeUrl(spec, side, qty, rate), "_self");
  setTimeout(() => window.open(`https://www.interactivebrokers.com/en/trading/order-ticket.php?symbol=${spec.symbol}&side=${side}&quantity=${qty}`, "_blank", "noopener,noreferrer"), 2000);
}

// ─── Formatters ──────────────────────────────────────────────────────────────
function fmt(n: number, dec = 0): string { return new Intl.NumberFormat("en-US", { maximumFractionDigits: dec }).format(n); }
function fmtUsd(n: number): string { return "$" + fmt(Math.abs(n), 0); }
function fmtRate(n: number): string { return n.toFixed(4); }

// ─── Trade history ───────────────────────────────────────────────────────────
interface TradeHistoryEntry {
  id: string; timestamp: string; run_id: string; positions: string[];
  legs: Array<{ bucket: string; symbol: string; contracts: number; forward_rate: number;
    action_usd: number; action_mxn: number; margin_req: number; side: string; }>;
  total_contracts: number; total_action_usd: number; total_margin: number;
  risk_verdict: string; fill_price?: number; status: "HEDGED";
}

function saveTradeHistory(entry: TradeHistoryEntry): void {
  try {
    const existing: TradeHistoryEntry[] = JSON.parse(localStorage.getItem("ordr_trade_history") ?? "[]");
    existing.unshift(entry);
    localStorage.setItem("ordr_trade_history", JSON.stringify(existing.slice(0, 100)));
  } catch { /* localStorage may be unavailable */ }
}

// ─── Ticket metrics ──────────────────────────────────────────────────────────
interface TicketMetrics {
  spec: typeof CME_SPECS[string]; side: string; contracts: number;
  margin: number; notional: number; estCost: number; hedgeEffectiveness: number; currency: string;
}

function computeTicket(bucket: BucketResult): TicketMetrics {
  const currency = "MXN";
  const spec = CME_SPECS[currency] ?? DEFAULT_SPEC;
  const contracts = Math.max(1, Math.ceil(Math.abs(bucket.action_mxn) / spec.contract_size));
  const margin = contracts * spec.margin_est;
  const notional = contracts * spec.contract_size;
  const estCost = Math.abs(bucket.action_usd) * 0.0005;
  const hedgeEffectiveness = parseFloat(Math.min(100, (notional / Math.abs(bucket.action_mxn || 1)) * 100).toFixed(1));
  const side = bucket.action_direction === "SELL_MXN_BUY_USD" ? "SELL" : "BUY";
  return { spec, side, contracts, margin, notional, estCost, hedgeEffectiveness, currency };
}

// ─── Props ───────────────────────────────────────────────────────────────────
interface PhaseExecuteProps {
  proposalIds: string[];
  calcResult: Record<string, unknown>;
  token: string;
  governanceMode: "solo" | "team";
  onComplete: (fillData: { fillPrice: number; proposalIds: string[] }) => void;
  onBack: () => void;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function PhaseExecute({
  proposalIds, calcResult, token, governanceMode, onComplete, onBack,
}: PhaseExecuteProps) {
  const [fillPrice, setFillPrice]               = useState<string>("");
  const [executing, setExecuting]               = useState(false);
  const [error, setError]                       = useState<string | null>(null);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [done, setDone]                         = useState(false);
  const [copiedRow, setCopiedRow]               = useState<number | null>(null);

  // ── Live market snapshot (from /api/market/fx/rates) ─────────────────────
  const [marketSnap, setMarketSnap]   = useState<MarketSnap | null>(null);
  const [snapLoading, setSnapLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setSnapLoading(true);
      try {
        const res = await fetch("/api/market/fx/rates");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as MarketSnap;
        if (!cancelled) setMarketSnap(data);
      } catch {
        // fail silently — panel hides on error
      } finally {
        if (!cancelled) setSnapLoading(false);
      }
    };
    load();
    // Refresh every 60 s (matches server cache TTL)
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // ── Buckets ───────────────────────────────────────────────────────────────
  const hedgePlan = calcResult.hedge_plan as { buckets?: BucketResult[]; summary?: Record<string, number> } | undefined;
  const buckets: BucketResult[] = (hedgePlan?.buckets ?? []).filter(b => !b.suppressed && Math.abs(b.action_mxn) > 0);
  const runId = (calcResult.run_id as string) ?? "";

  const totals = buckets.reduce(
    (acc, b) => {
      const m = computeTicket(b);
      acc.contracts += m.contracts; acc.notional += m.notional;
      acc.margin += m.margin; acc.cost += m.estCost;
      acc.actionUsd += Math.abs(b.action_usd);
      return acc;
    },
    { contracts: 0, notional: 0, margin: 0, cost: 0, actionUsd: 0 },
  );

  const fillOk = !executing && !done;

  // ── Execute ───────────────────────────────────────────────────────────────
  const handleMarkHedged = async () => {
    setExecuting(true); setError(null); setAwaitingApproval(false);
    const parsedFillPrice = fillPrice ? parseFloat(fillPrice) : 0;
    try {
      const results = await Promise.allSettled(
        proposalIds.map(async (id) => {
          const execRes = await dashboardFetch(`/v1/proposals/${id}/execute`, token, { method: "POST", body: JSON.stringify({}) });
          if (execRes.status === 409) throw Object.assign(new Error("NOT_APPROVED"), { code: 409 });
          if (!execRes.ok) {
            const errData = await execRes.json().catch(() => ({}));
            throw new Error((errData as { detail?: string }).detail ?? `HTTP ${execRes.status}`);
          }
          if (parsedFillPrice > 0) {
            await dashboardFetch(`/v1/proposals/${id}/fill`, token, {
              method: "PATCH",
              body: JSON.stringify({ fill_price: parsedFillPrice, fill_notional: totals.actionUsd,
                fill_currency: "MXN", fill_timestamp: new Date().toISOString() }),
            }).catch(() => undefined);
          }
        }),
      );
      const has409   = results.some(r => r.status === "rejected" && (r.reason as { code?: number })?.code === 409);
      const hasOther = results.some(r => r.status === "rejected" && (r.reason as { code?: number })?.code !== 409);
      // Team mode: show staging-queue notice and halt
      if (has409 && governanceMode === "team") { setAwaitingApproval(true); setExecuting(false); return; }
      // Solo mode: proposals must already be APPROVED — 409 means something went wrong upstream
      if (has409) throw new Error("PROPOSAL_NOT_APPROVED — proposals were not approved before execution. Please restart the pipeline and ensure Solo Mode is active on your company settings.");
      if (hasOther) { const f = results.find(r => r.status === "rejected" && (r.reason as { code?: number })?.code !== 409); throw (f as PromiseRejectedResult).reason; }
      saveTradeHistory({
        id: `TH-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        timestamp: new Date().toISOString(), run_id: runId, positions: proposalIds,
        legs: buckets.map(b => { const m = computeTicket(b); return { bucket: b.bucket, symbol: m.spec.symbol, contracts: m.contracts, forward_rate: b.forward_rate, action_usd: b.action_usd, action_mxn: b.action_mxn, margin_req: m.margin, side: m.side }; }),
        total_contracts: totals.contracts, total_action_usd: totals.actionUsd, total_margin: totals.margin,
        risk_verdict: (calcResult.risk_verdict as string) ?? "APPROVED",
        ...(parsedFillPrice > 0 ? { fill_price: parsedFillPrice } : {}), status: "HEDGED",
      });
      setDone(true); onComplete({ fillPrice: parsedFillPrice, proposalIds });
    } catch (e) {
      if (e instanceof Error) setError(e.message);
      else if (e !== null && typeof e === "object") {
        const obj = e as Record<string, unknown>;
        setError(typeof obj.message === "string" ? obj.message : typeof obj.detail === "string" ? obj.detail : JSON.stringify(e));
      } else setError("Execution failed");
    } finally { setExecuting(false); }
  };

  // ── Copy ticket row ───────────────────────────────────────────────────────
  const copyRow = (b: BucketResult, i: number) => {
    const m = computeTicket(b);
    const displayRate = fillPrice && parseFloat(fillPrice) > 0 ? parseFloat(fillPrice) : b.forward_rate;
    const text = [
      `TICKET #${i + 1} — ${b.bucket ?? `BUCKET ${i + 1}`}`,
      `Instrument: ${m.spec.symbol} — ${m.spec.name} (CME)`,
      `Direction: ${m.side === "SELL" ? "SELL MXN / BUY USD" : "BUY MXN / SELL USD"}`,
      `Contracts: ${m.contracts}  |  Forward Rate: ${fmtRate(displayRate)}`,
      `Notional: ${fmt(m.notional)} ${m.currency}  |  Total USD: ${fmtUsd(b.action_usd)}`,
      `Margin Req: ${fmtUsd(m.margin)}  |  Est Cost: ${fmtUsd(m.estCost)}`,
    ].join("\n");
    navigator.clipboard.writeText(text).then(() => { setCopiedRow(i); setTimeout(() => setCopiedRow(null), 2000); }).catch(() => undefined);
  };

  // ── Helpers for market panel ──────────────────────────────────────────────
  const spotMxn = marketSnap?.rates?.find(r => r.symbol === "USDMXN");
  const snapTs  = marketSnap ? new Date(marketSnap.cachedAt).toISOString().slice(11, 19) + " UTC" : null;
  const srcLive = marketSnap?.source === "live" || marketSnap?.source === "cache";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", background: S.bgPanel }}>

      {/* ── Header strip ────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 20px",
        background: S.bgSub,
        borderBottom: `1px solid var(--border-rim)`,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            <ChevronLeftIcon size={13} color="var(--text-tertiary)" />
            <span style={{ fontFamily: S.mono, fontSize: 11, color: "var(--text-tertiary)", letterSpacing: "0.07em" }}>BACK TO REVIEW</span>
          </button>
          <span style={{ width: 1, height: 14, background: "var(--border-soft)", display: "inline-block" }} />
          <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", color: "var(--text-primary)" }}>EXECUTION TERMINAL</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "color-mix(in srgb, var(--status-pass,#22c55e) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--status-pass,#22c55e) 25%, transparent)", padding: "4px 12px", borderRadius: 2 }}>
            <ShieldCheckIcon size={12} color={S.green} />
            <span style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.green, letterSpacing: "0.1em" }}>RISK: APPROVE</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "color-mix(in srgb, var(--accent-cyan) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-cyan) 25%, transparent)", padding: "4px 12px", borderRadius: 2 }}>
            <UserCheckIcon size={12} color={S.cyan} />
            <span style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, color: S.cyan, letterSpacing: "0.1em" }}>4-EYES: {governanceMode === "team" ? "MAKER" : "SOLO"}</span>
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 0 20px" }}>

        {/* ── LIVE MARKET SNAPSHOT panel ──────────────────────────────── */}
        <div style={{
          marginBottom: 16,
          background: S.bgSub,
          border: `1px solid var(--border-rim)`,
          borderRadius: 3,
          overflow: "hidden",
        }}>
          {/* Panel header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "7px 14px",
            borderBottom: `1px solid var(--border-soft)`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ActivityIcon size={12} color="var(--accent-cyan)" />
              <span style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: S.tertiary }}>
                LIVE MARKET SNAPSHOT
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {snapLoading ? (
                <LoaderIcon size={10} color={S.tertiary} style={{ animation: "spin 1s linear infinite" }} />
              ) : (
                <span style={{
                  fontFamily: S.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
                  color: srcLive ? S.green : S.amber,
                  background: srcLive ? "color-mix(in srgb, var(--status-pass,#22c55e) 10%, transparent)" : "color-mix(in srgb, var(--accent-amber) 10%, transparent)",
                  border: srcLive ? "1px solid color-mix(in srgb, var(--status-pass,#22c55e) 25%, transparent)" : "1px solid color-mix(in srgb, var(--accent-amber) 25%, transparent)",
                  padding: "2px 8px", borderRadius: 2,
                }}>
                  {srcLive ? "● LIVE" : "◌ INDICATIVE"}
                </span>
              )}
              {snapTs && !snapLoading && (
                <span style={{ fontFamily: S.mono, fontSize: 9, color: S.tertiary }}>
                  as of {snapTs}
                </span>
              )}
            </div>
          </div>

          {/* Rate cells */}
          <div style={{ display: "flex", flexWrap: "wrap" }}>
            {snapLoading ? (
              <div style={{ padding: "12px 16px", fontFamily: S.mono, fontSize: 11, color: S.tertiary }}>
                Fetching live rates…
              </div>
            ) : marketSnap?.rates?.length ? (
              marketSnap.rates.map(r => (
                <div key={r.symbol} style={{
                  padding: "10px 18px",
                  borderRight: `1px solid var(--border-soft)`,
                  borderBottom: `1px solid var(--border-soft)`,
                  minWidth: 130,
                }}>
                  <div style={{ fontFamily: S.mono, fontSize: 9, color: S.tertiary, letterSpacing: "0.12em", marginBottom: 4 }}>
                    {r.symbol}
                  </div>
                  <div style={{ fontFamily: S.mono, fontSize: 14, fontWeight: 700, color: S.primary, marginBottom: 2 }}>
                    {r.mid.toFixed(4)}
                  </div>
                  <div style={{ fontFamily: S.mono, fontSize: 9, color: S.tertiary }}>
                    {r.bid.toFixed(4)} / {r.ask.toFixed(4)}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: "12px 16px", fontFamily: S.mono, fontSize: 11, color: S.tertiary }}>
                Market data unavailable
              </div>
            )}
          </div>

          {/* Calc-rate vs spot comparison (MXN only) */}
          {spotMxn && buckets.length > 0 && (() => {
            const b0 = buckets[0];
            const fwdUsed = parseFloat(fillPrice) > 0 ? parseFloat(fillPrice) : b0.forward_rate;
            const premium = ((fwdUsed - spotMxn.mid) / spotMxn.mid * 100).toFixed(2);
            const premAmt = fwdUsed - spotMxn.mid;
            return (
              <div style={{
                display: "flex", alignItems: "center", gap: 24,
                padding: "7px 14px",
                borderTop: `1px solid var(--border-soft)`,
                background: S.bgPanel,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: S.mono, fontSize: 10, color: S.tertiary, letterSpacing: "0.08em" }}>SPOT USDMXN</span>
                  <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.primary }}>{spotMxn.mid.toFixed(4)}</span>
                </div>
                <span style={{ width: 1, height: 14, background: "var(--border-soft)", display: "inline-block" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: S.mono, fontSize: 10, color: S.tertiary, letterSpacing: "0.08em" }}>FWD RATE USED</span>
                  <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.cyan }}>{fwdUsed.toFixed(4)}</span>
                </div>
                <span style={{ width: 1, height: 14, background: "var(--border-soft)", display: "inline-block" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: S.mono, fontSize: 10, color: S.tertiary, letterSpacing: "0.08em" }}>FWD PREMIUM</span>
                  <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: premAmt >= 0 ? S.green : S.red }}>
                    {premAmt >= 0 ? "+" : ""}{premAmt.toFixed(4)} ({premium}%)
                  </span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* ── TRADE TICKETS — fixed table ─────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontFamily: S.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", color: S.tertiary }}>TRADE TICKETS</span>
            <span style={{ fontFamily: S.mono, fontSize: 10, background: "var(--border-soft)", color: S.tertiary, padding: "1px 7px", borderRadius: 10 }}>
              {buckets.length > 0 ? `${buckets.length} LEG${buckets.length !== 1 ? "S" : ""}` : "NO ACTIVE LEGS"}
            </span>
          </div>

          {/* Disclaimer */}
          {buckets.length > 0 && (
            <div style={{
              background: "color-mix(in srgb, var(--accent-amber) 8%, transparent)",
              border: "1px solid color-mix(in srgb, var(--accent-amber) 25%, transparent)",
              borderRadius: 3, padding: "5px 12px", marginBottom: 10,
              fontFamily: S.ui, fontSize: 11, color: "var(--accent-amber)",
            }}>
              &#9888;&#160;&#160;ORDR Terminal does not submit orders electronically. These tickets require manual entry into your broker platform (IBKR or equivalent).
            </div>
          )}

          {buckets.length === 0 ? (
            <div style={{ padding: "24px 20px", background: S.bgSub, border: `1px solid var(--border-soft)`, borderRadius: 4, textAlign: "center" }}>
              <span style={{ fontFamily: S.mono, fontSize: 12, color: S.tertiary, letterSpacing: "0.08em" }}>NO ACTIONABLE BUCKETS — ALL POSITIONS SUPPRESSED OR ZERO</span>
            </div>
          ) : (
            /* ── Fixed execution table ── */
            <div style={{ border: `1px solid var(--border-rim)`, borderRadius: 4, overflow: "hidden" }}>
              {/* Table header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "36px 1fr 90px 72px 90px 110px 100px 100px 80px 100px",
                background: S.bgSub,
                borderBottom: `1px solid var(--border-rim)`,
                padding: "0 12px",
              }}>
                {["#","INSTRUMENT","DIRECTION","CNTRTS","FWD RATE","NOTIONAL","TOTAL USD","MARGIN","COST","EFF%"].map((h, i) => (
                  <div key={h} style={{
                    padding: "8px 6px",
                    fontFamily: S.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
                    color: S.tertiary, textAlign: i === 0 ? "center" : "left",
                    whiteSpace: "nowrap",
                  }}>{h}</div>
                ))}
              </div>

              {/* Table rows */}
              {buckets.map((b, i) => {
                const m = computeTicket(b);
                const displayRate = fillPrice && parseFloat(fillPrice) > 0 ? parseFloat(fillPrice) : b.forward_rate;
                const dirLabel = m.side === "SELL" ? "SELL MXN" : "BUY MXN";
                const effColor = m.hedgeEffectiveness >= 95 ? S.green : m.hedgeEffectiveness >= 80 ? S.amber : S.red;
                const isCopied = copiedRow === i;

                return (
                  <div key={b.bucket ?? i} style={{ borderBottom: i < buckets.length - 1 ? `1px solid var(--border-soft)` : "none" }}>
                    {/* Main data row */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "36px 1fr 90px 72px 90px 110px 100px 100px 80px 100px",
                      padding: "0 12px",
                      background: i % 2 === 0 ? S.bgPanel : S.bgSub,
                      alignItems: "center",
                    }}>
                      <div style={{ padding: "12px 6px", fontFamily: S.mono, fontSize: 11, color: S.tertiary, textAlign: "center" }}>{i + 1}</div>
                      <div style={{ padding: "12px 6px" }}>
                        <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.primary }}>{m.spec.symbol}</div>
                        <div style={{ fontFamily: S.mono, fontSize: 10, color: S.tertiary, marginTop: 2 }}>{m.spec.name}</div>
                      </div>
                      <div style={{ padding: "12px 6px" }}>
                        <span style={{
                          fontFamily: S.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                          color: m.side === "SELL" ? S.red : S.cyan,
                          background: m.side === "SELL" ? "color-mix(in srgb, var(--accent-red,#E74C3C) 10%, transparent)" : "color-mix(in srgb, var(--accent-cyan) 10%, transparent)",
                          border: m.side === "SELL" ? "1px solid color-mix(in srgb, var(--accent-red,#E74C3C) 25%, transparent)" : "1px solid color-mix(in srgb, var(--accent-cyan) 25%, transparent)",
                          padding: "2px 6px", borderRadius: 2, whiteSpace: "nowrap",
                        }}>{dirLabel}</span>
                      </div>
                      <div style={{ padding: "12px 6px", fontFamily: S.mono, fontSize: 13, fontWeight: 700, color: S.primary }}>{fmt(m.contracts)}</div>
                      <div style={{ padding: "12px 6px", fontFamily: S.mono, fontSize: 13, fontWeight: 700, color: S.cyan }}>{fmtRate(displayRate)}</div>
                      <div style={{ padding: "12px 6px" }}>
                        <div style={{ fontFamily: S.mono, fontSize: 12, color: S.primary }}>{fmt(m.notional)}</div>
                        <div style={{ fontFamily: S.mono, fontSize: 9, color: S.tertiary, marginTop: 1 }}>{m.currency} · {fmt(m.spec.contract_size)}/ct</div>
                      </div>
                      <div style={{ padding: "12px 6px", fontFamily: S.mono, fontSize: 13, fontWeight: 700, color: S.primary }}>{fmtUsd(b.action_usd)}</div>
                      <div style={{ padding: "12px 6px", fontFamily: S.mono, fontSize: 13, fontWeight: 700, color: S.amber }}>{fmtUsd(m.margin)}</div>
                      <div style={{ padding: "12px 6px", fontFamily: S.mono, fontSize: 12, color: S.secondary }}>{fmtUsd(m.estCost)}</div>
                      <div style={{ padding: "12px 6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ flex: 1, height: 3, background: "var(--border-soft)", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ width: `${m.hedgeEffectiveness}%`, height: "100%", background: effColor, borderRadius: 2, transition: "width 0.4s" }} />
                          </div>
                          <span style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, color: effColor, flexShrink: 0 }}>{m.hedgeEffectiveness}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Action row */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "6px 12px 8px",
                      background: i % 2 === 0 ? S.bgPanel : S.bgSub,
                      borderTop: `1px solid var(--border-soft)`,
                    }}>
                      <span style={{ fontFamily: S.mono, fontSize: 9, color: S.tertiary, marginRight: 4 }}>
                        TICK {m.spec.tick_size} · TICK VALUE ${m.spec.tick_value} · CONTRACT {fmt(m.spec.contract_size)} {m.currency}
                      </span>
                      <div style={{ flex: 1 }} />
                      <button
                        onClick={() => openIbkr(m.spec, m.side, m.contracts, displayRate)}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          fontFamily: S.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                          color: "#1C62F2", background: "color-mix(in srgb,#1C62F2 8%,transparent)",
                          border: "1px solid color-mix(in srgb,#1C62F2 25%,transparent)",
                          padding: "4px 10px", borderRadius: 2, cursor: "pointer",
                        }}
                      >
                        <ExternalLinkIcon size={10} color="#1C62F2" />OPEN IN IBKR
                      </button>
                      <button
                        onClick={() => copyRow(b, i)}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          fontFamily: S.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                          color: isCopied ? S.green : S.tertiary,
                          background: "transparent", border: `1px solid var(--border-soft)`,
                          padding: "4px 10px", borderRadius: 2, cursor: "pointer",
                        }}
                      >
                        <CopyIcon size={10} color={isCopied ? S.green : S.tertiary} />
                        {isCopied ? "COPIED" : "COPY"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Fill price input ─────────────────────────────────────────── */}
        <div style={{
          background: S.bgSub, border: `1px solid var(--border-soft)`, borderRadius: 4,
          padding: "12px 16px", marginBottom: 16,
          display: "flex", alignItems: "center", gap: 16,
        }}>
          <span style={{ fontFamily: S.mono, fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, flexShrink: 0 }}>
            FILL PRICE (OPTIONAL)
          </span>
          <input
            type="number" step="0.000001" min="0"
            value={fillPrice} onChange={e => setFillPrice(e.target.value)}
            placeholder="Leave blank to use forward rate"
            style={{
              flex: 1, fontFamily: S.mono, fontSize: 13, color: S.primary,
              background: S.bgPanel, border: `1px solid var(--border-soft)`,
              borderRadius: 3, padding: "7px 12px", outline: "none", minWidth: 0,
            }}
          />
        </div>

        {/* ── Total summary row ────────────────────────────────────────── */}
        {buckets.length > 0 && (
          <div style={{
            background: S.bgSub, border: `1px solid var(--border-rim)`, borderRadius: 4,
            marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", overflow: "hidden",
          }}>
            {([
              ["TOTAL CONTRACTS",  fmt(totals.contracts),          S.primary],
              ["TOTAL NOTIONAL",   fmtUsd(totals.actionUsd),       S.primary],
              ["TOTAL MARGIN REQ", fmtUsd(totals.margin),          S.amber],
              ["EST TOTAL COST",   fmtUsd(totals.cost),            S.secondary],
            ] as const).map(([label, value, color], idx) => (
              <div key={label} style={{ padding: "14px 18px", borderRight: idx < 3 ? `1px solid var(--border-soft)` : "none" }}>
                <div style={{ fontFamily: S.mono, fontSize: 10, letterSpacing: "0.12em", color: S.tertiary, marginBottom: 6 }}>{label}</div>
                <div style={{ fontFamily: S.mono, fontSize: 20, fontWeight: 700, color }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Notices ──────────────────────────────────────────────────── */}
        {awaitingApproval && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", background: "color-mix(in srgb, var(--accent-amber) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-amber) 30%, transparent)", borderRadius: 4, marginBottom: 16 }}>
            <AlertCircleIcon size={15} color={S.amber} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.amber, letterSpacing: "0.08em", marginBottom: 4 }}>AWAITING CHECKER APPROVAL</div>
              <div style={{ fontFamily: S.ui, fontSize: 13, color: S.secondary }}>One or more proposals are pending checker sign-off. Check the staging queue.</div>
            </div>
          </div>
        )}
        {error && (
          <div style={{ padding: "10px 14px", background: "color-mix(in srgb, var(--accent-red,#E74C3C) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-red,#E74C3C) 30%, transparent)", borderRadius: 4, marginBottom: 16 }}>
            <span style={{ fontFamily: S.mono, fontSize: 12, color: S.red }}>{error}</span>
          </div>
        )}
        {done && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "color-mix(in srgb, var(--status-pass,#22c55e) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--status-pass,#22c55e) 25%, transparent)", borderRadius: 4, marginBottom: 16 }}>
            <CheckCircleIcon size={15} color={S.green} />
            <span style={{ fontFamily: S.mono, fontSize: 12, fontWeight: 700, color: S.green, letterSpacing: "0.08em" }}>HEDGED SUCCESSFULLY — ADVANCING PIPELINE...</span>
          </div>
        )}
        <div style={{ height: 80 }} />
      </div>

      {/* ── Sticky bottom bar ────────────────────────────────────────────── */}
      <div style={{
        position: "sticky", bottom: 0, zIndex: 10,
        background: S.bgSub, borderTop: `2px solid var(--border-rim)`,
        padding: "16px 24px", display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: 16, flexShrink: 0,
      }}>
        <span style={{ fontFamily: S.mono, fontSize: 11, color: S.secondary, letterSpacing: "0.04em" }}>
          {proposalIds.length} proposal{proposalIds.length !== 1 ? "s" : ""} —&nbsp;
          4-eyes approval required after submission
        </span>
        <button
          onClick={handleMarkHedged} disabled={!fillOk}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: done ? S.tertiary : executing ? "color-mix(in srgb, var(--status-pass,#22c55e) 60%, #000)" : S.green,
            color: "#000", border: "none", borderRadius: 3, padding: "14px 32px",
            cursor: !fillOk ? "default" : "pointer",
            fontFamily: S.mono, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em",
            transition: "background 0.2s ease",
          }}
        >
          {executing && <LoaderIcon size={14} color="#000" style={{ animation: "spin 1s linear infinite" }} />}
          {done && <CheckCircleIcon size={14} color="#000" />}
          {done ? "EXECUTION CONFIRMED" : executing ? "EXECUTING..." : "CONFIRM EXECUTION"}
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
