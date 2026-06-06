"use client";

import { useState, useCallback } from "react";
import { dashboardFetch } from "@/lib/api/dashboardClient";
import type { BucketResult } from "@/api/types";
import { translateError, translateCaughtError, type TranslatedError } from "@/lib/errors/hedgeErrors";
import HedgeErrorBanner from "./ErrorBanner";
import {
  CheckCircleIcon, AlertCircleIcon, LoaderIcon, ChevronLeftIcon,
  CopyIcon, ExternalLinkIcon, ShieldCheckIcon, UserCheckIcon,
  AlertTriangleIcon, InfoIcon,
  ZapIcon, XCircleIcon,
} from "lucide-react";
import { T, CME_SPECS, DEFAULT_CME_SPEC } from "./tokens";
import type { CmeSpec } from "./tokens";

const DEFAULT_SPEC = DEFAULT_CME_SPEC;

// High-contrast button-text on saturated green CTA fills.
const PHC = { black: "#000" } as const;

// ─── IBKR deep link helpers ──────────────────────────────────────────────────
function ibkrNativeUrl(spec: CmeSpec, side: string, qty: number, rate: number): string {
  return `ibkr://order?symbol=${spec.symbol}&secType=FUT&exchange=CME&side=${side}&quantity=${qty}&orderType=LMT&lmtPrice=${rate.toFixed(5)}&currency=USD&tif=GTC`;
}
function openIbkr(spec: CmeSpec, side: string, qty: number, rate: number): void {
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
  spec: CmeSpec; side: string; contracts: number;
  margin: number; notional: number; estCost: number; hedgeEffectiveness: number; currency: string;
}

/**
 * Extract the foreign currency code from a bucket's action_direction.
 * e.g. "SELL_MXN_BUY_USD" -> "MXN", "BUY_EUR_SELL_USD" -> "EUR"
 * Falls back to the provided default currency.
 */
function extractCurrencyFromDirection(direction: string | null, fallback: string): string {
  if (!direction) return fallback;
  // Pattern: (SELL|BUY)_{CCY}_(BUY|SELL)_USD
  const match = direction.match(/(?:SELL|BUY)_([A-Z]{3})_(?:SELL|BUY)_/i);
  if (match) return match[1].toUpperCase();
  return fallback;
}

function computeTicket(bucket: BucketResult, defaultCurrency = "MXN"): TicketMetrics {
  const currency = extractCurrencyFromDirection(bucket.action_direction, defaultCurrency);
  const spec = CME_SPECS[currency] ?? DEFAULT_SPEC;
  const contracts = Math.max(1, Math.ceil(Math.abs(bucket.action_mxn) / spec.contract_size));
  const margin = contracts * spec.margin_est;
  const notional = contracts * spec.contract_size;
  const estCost = Math.abs(bucket.action_usd) * 0.0005;
  const hedgeEffectiveness = parseFloat(Math.min(100, (notional / Math.abs(bucket.action_mxn || 1)) * 100).toFixed(1));
  const side = (bucket.action_direction ?? "").includes("SELL") && (bucket.action_direction ?? "").startsWith("SELL") ? "SELL" : "BUY";
  return { spec, side, contracts, margin, notional, estCost, hedgeEffectiveness, currency };
}

// ─── IBKR execution types ────────────────────────────────────────────────────
type IBKRStatus = "idle" | "connecting" | "executing" | "filled" | "error";

interface IBKRFillResult {
  currency_pair: string;
  action: string;
  fill_price: number;
  fill_quantity: number;
  status: string;
  exec_id?: string;
  error?: string;
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
  const [error, setError]                       = useState<TranslatedError | null>(null);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [done, setDone]                         = useState(false);
  const [copiedRow, setCopiedRow]               = useState<number | null>(null);
  const [showConfirm, setShowConfirm]           = useState(false);

  // ── IBKR execution state ─────────────────────────────────────────────────
  const [ibkrStatus, setIbkrStatus]   = useState<IBKRStatus>("idle");
  const [ibkrResults, setIbkrResults] = useState<IBKRFillResult[]>([]);
  const [ibkrError, setIbkrError]     = useState<string | null>(null);

  // ── Buckets ───────────────────────────────────────────────────────────────
  // calcResult may be the full CalculateResult { calcResponse, marketSnapshot, ... }
  // or the raw engine response. Extract the engine response for field access.
  const engineResponse = (calcResult.calcResponse ?? calcResult) as Record<string, unknown>;
  const hedgePlan = engineResponse.hedge_plan as { buckets?: BucketResult[]; summary?: Record<string, number> } | undefined;
  const buckets: BucketResult[] = (hedgePlan?.buckets ?? []).filter(b => !b.suppressed && Math.abs(b.action_mxn) > 0);
  const runId = (engineResponse.run_id as string) ?? "";

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

  // ── Execute (mark hedged) ───────────────────────────────────────────────
  const handleMarkHedged = useCallback(async (ibkrFillPrice?: number) => {
    if (proposalIds.length === 0) {
      setError(translateError(400, "No execution proposals available. Return to Review step."));
      return;
    }
    setExecuting(true); setError(null); setAwaitingApproval(false);
    const parsedFillPrice = ibkrFillPrice ?? (fillPrice ? parseFloat(fillPrice) : 0);
    try {
      const results = await Promise.allSettled(
        proposalIds.map(async (id) => {
          // Step 1: Approve the proposal (required before execution)
          // Solo mode: same user can approve; Team mode: SoD enforced server-side
          const approveRes = await dashboardFetch(`/v1/proposals/${id}/approve`, token, {
            method: "PATCH",
            body: JSON.stringify({ approval_notes: "Approved via hedge desk pipeline" }),
          });
          // 403 in team mode = SoD violation (different checker needed)
          if (approveRes.status === 403 && governanceMode === "team") {
            throw Object.assign(new Error("AWAITING_APPROVAL"), { code: 409 });
          }
          // 409 = already approved or wrong state — proceed to execute anyway
          if (!approveRes.ok && approveRes.status !== 409) {
            const errData = await approveRes.json().catch(() => ({}));
            throw new Error((errData as { detail?: string }).detail ?? `Approve failed: HTTP ${approveRes.status}`);
          }

          // Step 2: Execute the approved proposal → transitions position to HEDGED
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
      if (has409) {
        setError(translateError(409, "Proposals must be approved before execution. Restart the pipeline and verify Solo Mode is active in your company settings."));
        setExecuting(false);
        return;
      }
      if (hasOther) {
        const f = results.find(r => r.status === "rejected" && (r.reason as { code?: number })?.code !== 409);
        setError(translateCaughtError((f as PromiseRejectedResult).reason));
        setExecuting(false);
        return;
      }
      saveTradeHistory({
        id: `TH-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        timestamp: new Date().toISOString(), run_id: runId, positions: proposalIds,
        legs: buckets.map(b => { const m = computeTicket(b); return { bucket: b.bucket, symbol: m.spec.symbol, contracts: m.contracts, forward_rate: b.forward_rate, action_usd: b.action_usd, action_mxn: b.action_mxn, margin_req: m.margin, side: m.side }; }),
        total_contracts: totals.contracts, total_action_usd: totals.actionUsd, total_margin: totals.margin,
        risk_verdict: (engineResponse.risk_verdict as string) ?? "APPROVED",
        ...(parsedFillPrice > 0 ? { fill_price: parsedFillPrice } : {}), status: "HEDGED",
      });
      setDone(true); onComplete({ fillPrice: parsedFillPrice, proposalIds });
    } catch (e) {
      setError(translateCaughtError(e));
    } finally { setExecuting(false); }
  }, [proposalIds, fillPrice, token, totals, governanceMode, runId, buckets, engineResponse, onComplete]);

  // ── IBKR Execute ───────────────────────────────────────────────────────
  const handleIBKRExecute = useCallback(async () => {
    setIbkrError(null);
    setIbkrResults([]);
    setIbkrStatus("connecting");

    try {
      // 1. Check IBKR status
      const statusRes = await dashboardFetch("/v1/ibkr/status", token);
      if (!statusRes.ok) {
        throw new Error("Failed to check IBKR status");
      }
      const statusData = await statusRes.json() as { connected: boolean; enabled: boolean; error?: string };

      if (!statusData.enabled) {
        throw new Error("IBKR integration is not enabled on the server. Contact your administrator.");
      }

      // 2. Connect if not connected
      if (!statusData.connected) {
        const connectRes = await dashboardFetch("/v1/ibkr/connect", token, { method: "POST", body: JSON.stringify({}) });
        if (!connectRes.ok) {
          const errBody = await connectRes.json().catch(() => ({}));
          throw new Error((errBody as { detail?: string }).detail ?? "Failed to connect to IBKR Gateway");
        }
      }

      setIbkrStatus("executing");

      // 3. Build orders from trade tickets
      const orders = buckets.map(b => {
        const m = computeTicket(b);
        const pair = `USD${m.currency}`;
        return {
          currency_pair: pair,
          action: m.side,
          quantity: m.contracts * m.spec.contract_size,
          order_type: "MKT",
        };
      });

      // 4. Execute via IBKR
      const execRes = await dashboardFetch("/v1/ibkr/execute", token, {
        method: "POST",
        body: JSON.stringify({
          proposal_id: proposalIds[0] ?? "",
          orders,
        }),
      });

      if (!execRes.ok) {
        const errBody = await execRes.json().catch(() => ({}));
        throw new Error((errBody as { detail?: string }).detail ?? `IBKR execution failed: HTTP ${execRes.status}`);
      }

      const execData = await execRes.json() as {
        success: boolean;
        fills: IBKRFillResult[];
        weighted_avg_price: number;
        total_notional: number;
        message: string;
      };

      setIbkrResults(execData.fills);

      if (execData.success) {
        setIbkrStatus("filled");
        // Use IBKR fill price for the proposal record
        const ibkrFillPrice = execData.weighted_avg_price > 0 ? execData.weighted_avg_price : undefined;
        if (ibkrFillPrice) {
          setFillPrice(ibkrFillPrice.toFixed(6));
        }
        // Proceed to mark hedged with IBKR fill price
        await handleMarkHedged(ibkrFillPrice);
      } else {
        // Partial fills or errors
        setIbkrStatus("error");
        setIbkrError(execData.message);
      }

    } catch (err) {
      setIbkrStatus("error");
      setIbkrError(err instanceof Error ? err.message : "IBKR execution failed");
    }
  }, [token, buckets, proposalIds, handleMarkHedged]);

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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", background: T.bgPanel }}>

      {/* ── Step header ─────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px",
        background: T.bgSub,
        borderBottom: `1px solid ${T.rim}`,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", color: T.tertiary }}>STEP 6 OF 7</span>
            <span style={{ width: 1, height: 14, background: T.soft, display: "inline-block" }} />
            <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", color: T.primary }}>EXECUTION CONFIRMATION</span>
          </div>
          <span style={{ fontFamily: T.fontUI, fontSize: 12, color: T.secondary }}>
            Review trade tickets, execute via IBKR, and confirm execution
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "color-mix(in srgb, var(--status-pass,#22c55e) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--status-pass,#22c55e) 25%, transparent)", padding: "4px 12px", borderRadius: 2 }}>
            <ShieldCheckIcon size={12} color={T.green} />
            <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, color: T.green, letterSpacing: "0.1em" }}>RISK: APPROVE</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "color-mix(in srgb, var(--accent-cyan) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-cyan) 25%, transparent)", padding: "4px 12px", borderRadius: 2 }}>
            <UserCheckIcon size={12} color={T.cyan} />
            <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, color: T.cyan, letterSpacing: "0.1em" }}>4-EYES: {governanceMode === "team" ? "MAKER" : "SOLO"}</span>
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 0 20px" }}>

        {/* ── Disclaimer — design-intent framing ──────────────────────── */}
        {buckets.length > 0 && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 10,
            background: "color-mix(in srgb, var(--accent-amber) 8%, transparent)",
            border: "1px solid color-mix(in srgb, var(--accent-amber) 25%, transparent)",
            borderRadius: 3, padding: "10px 14px", marginBottom: 16,
          }}>
            <AlertTriangleIcon size={14} color={T.amber} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontFamily: T.fontUI, fontSize: 12, color: T.amber, lineHeight: "1.5" }}>
              ORDR Treasury will execute these trade tickets via IBKR Gateway. Review all tickets carefully before confirming.
            </span>
          </div>
        )}

        {/* ── TRADE TICKETS — fixed table ─────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", color: T.tertiary }}>TRADE TICKETS</span>
            <span style={{ fontFamily: T.fontMono, fontSize: 12, background: T.soft, color: T.tertiary, padding: "1px 7px", borderRadius: 10 }}>
              {buckets.length > 0 ? `${buckets.length} LEG${buckets.length !== 1 ? "S" : ""}` : "NO ACTIVE LEGS"}
            </span>
          </div>

          {buckets.length === 0 ? (
            <div style={{ padding: "24px 20px", background: T.bgSub, border: `1px solid ${T.soft}`, borderRadius: 4, textAlign: "center" }}>
              <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.tertiary, letterSpacing: "0.08em" }}>NO ACTIONABLE BUCKETS — ALL POSITIONS SUPPRESSED OR ZERO</span>
            </div>
          ) : (
            /* ── Fixed execution table ── */
            <div style={{ border: `1px solid ${T.rim}`, borderRadius: 4, overflow: "hidden" }}>
              {/* Table header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "36px 1fr 90px 72px 90px 110px 100px 100px 80px 100px",
                background: T.bgSub,
                borderBottom: `1px solid ${T.rim}`,
                padding: "0 12px",
              }}>
                {["#","INSTRUMENT","DIRECTION","CNTRTS","FWD RATE","NOTIONAL","TOTAL USD","MARGIN","COST","EFF%"].map((h, i) => (
                  <div key={h} style={{
                    padding: "8px 6px",
                    fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em",
                    color: T.tertiary, textAlign: i === 0 ? "center" : "left",
                    whiteSpace: "nowrap",
                  }}>{h}</div>
                ))}
              </div>

              {/* Table rows */}
              {buckets.map((b, i) => {
                const m = computeTicket(b);
                const displayRate = fillPrice && parseFloat(fillPrice) > 0 ? parseFloat(fillPrice) : b.forward_rate;
                const dirLabel = m.side === "SELL" ? "SELL MXN" : "BUY MXN";
                const effColor = m.hedgeEffectiveness >= 95 ? T.green : m.hedgeEffectiveness >= 80 ? T.amber : T.red;
                const isCopied = copiedRow === i;

                return (
                  <div key={b.bucket ?? i} style={{ borderBottom: i < buckets.length - 1 ? `1px solid ${T.soft}` : "none" }}>
                    {/* Main data row */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "36px 1fr 90px 72px 90px 110px 100px 100px 80px 100px",
                      padding: "0 12px",
                      background: i % 2 === 0 ? T.bgPanel : T.bgSub,
                      alignItems: "center",
                    }}>
                      <div style={{ padding: "12px 6px", fontFamily: T.fontMono, fontSize: 12, color: T.tertiary, textAlign: "center" }}>{i + 1}</div>
                      <div style={{ padding: "12px 6px" }}>
                        <div style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, color: T.primary }}>{m.spec.symbol}</div>
                        <div style={{ fontFamily: T.fontMono, fontSize: 12, color: T.tertiary, marginTop: 2 }}>{m.spec.name}</div>
                      </div>
                      <div style={{ padding: "12px 6px" }}>
                        <span style={{
                          fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
                          color: m.side === "SELL" ? T.red : T.cyan,
                          background: m.side === "SELL" ? "color-mix(in srgb, var(--accent-red,#DC2626) 10%, transparent)" : "color-mix(in srgb, var(--accent-cyan) 10%, transparent)",
                          border: m.side === "SELL" ? "1px solid color-mix(in srgb, var(--accent-red,#DC2626) 25%, transparent)" : "1px solid color-mix(in srgb, var(--accent-cyan) 25%, transparent)",
                          padding: "2px 6px", borderRadius: 2, whiteSpace: "nowrap",
                        }}>{dirLabel}</span>
                      </div>
                      <div style={{ padding: "12px 6px", fontFamily: T.fontMono, fontSize: 13, fontWeight: 700, color: T.primary }}>{fmt(m.contracts)}</div>
                      <div style={{ padding: "12px 6px", fontFamily: T.fontMono, fontSize: 13, fontWeight: 700, color: T.cyan }}>{fmtRate(displayRate)}</div>
                      <div style={{ padding: "12px 6px" }}>
                        <div style={{ fontFamily: T.fontMono, fontSize: 12, color: T.primary }}>{fmt(m.notional)}</div>
                        <div style={{ fontFamily: T.fontMono, fontSize: 12, color: T.tertiary, marginTop: 1 }}>{m.currency} · {fmt(m.spec.contract_size)}/ct</div>
                      </div>
                      <div style={{ padding: "12px 6px", fontFamily: T.fontMono, fontSize: 13, fontWeight: 700, color: T.primary }}>{fmtUsd(b.action_usd)}</div>
                      <div style={{ padding: "12px 6px", fontFamily: T.fontMono, fontSize: 13, fontWeight: 700, color: T.amber }}>{fmtUsd(m.margin)}</div>
                      <div style={{ padding: "12px 6px", fontFamily: T.fontMono, fontSize: 12, color: T.secondary }}>{fmtUsd(m.estCost)}</div>
                      <div style={{ padding: "12px 6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ flex: 1, height: 3, background: T.soft, borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ width: `${m.hedgeEffectiveness}%`, height: "100%", background: effColor, borderRadius: 2, transition: "width 0.4s" }} />
                          </div>
                          <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, color: effColor, flexShrink: 0 }}>{m.hedgeEffectiveness}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Action row */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "6px 12px 8px",
                      background: i % 2 === 0 ? T.bgPanel : T.bgSub,
                      borderTop: `1px solid ${T.soft}`,
                    }}>
                      <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.tertiary, marginRight: 4 }}>
                        TICK {m.spec.tick_size} · TICK VALUE ${m.spec.tick_value} · CONTRACT {fmt(m.spec.contract_size)} {m.currency}
                      </span>
                      <div style={{ flex: 1 }} />
                      <button
                        onClick={() => openIbkr(m.spec, m.side, m.contracts, displayRate)}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
                          color: T.royal, background: "color-mix(in srgb,#1C62F2 8%,transparent)",
                          border: "1px solid color-mix(in srgb,#1C62F2 25%,transparent)",
                          padding: "4px 10px", borderRadius: 2, cursor: "pointer",
                        }}
                      >
                        <ExternalLinkIcon size={10} color={T.royal} />OPEN IN IBKR
                      </button>
                      <button
                        onClick={() => copyRow(b, i)}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
                          color: isCopied ? T.green : T.tertiary,
                          background: "transparent", border: `1px solid ${T.soft}`,
                          padding: "4px 10px", borderRadius: 2, cursor: "pointer",
                        }}
                      >
                        <CopyIcon size={10} color={isCopied ? T.green : T.tertiary} />
                        {isCopied ? "COPIED" : "COPY"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── IBKR Execution Results ─────────────────────────────────── */}
        {ibkrStatus === "filled" && ibkrResults.length > 0 && (
          <div style={{
            marginBottom: 16,
            background: T.bgSub,
            border: `1px solid color-mix(in srgb, var(--status-pass,#22c55e) 40%, transparent)`,
            borderRadius: 4,
            overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 16px",
              background: "color-mix(in srgb, var(--status-pass,#22c55e) 8%, transparent)",
              borderBottom: `1px solid color-mix(in srgb, var(--status-pass,#22c55e) 20%, transparent)`,
            }}>
              <CheckCircleIcon size={14} color={T.green} />
              <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.14em", color: T.green }}>
                IBKR EXECUTION CONFIRMED
              </span>
              <div style={{ flex: 1 }} />
              <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.secondary }}>
                {ibkrResults.length} fill{ibkrResults.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Fill results table */}
            <div style={{ padding: "0" }}>
              {/* Table header */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 80px 100px 120px 140px",
                padding: "6px 16px",
                borderBottom: `1px solid ${T.soft}`,
              }}>
                {["PAIR", "SIDE", "FILL PRICE", "FILL QTY", "EXEC ID"].map(h => (
                  <div key={h} style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: T.tertiary, padding: "4px 0" }}>
                    {h}
                  </div>
                ))}
              </div>

              {/* Fill rows */}
              {ibkrResults.map((fill, idx) => (
                <div key={idx} style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 80px 100px 120px 140px",
                  padding: "8px 16px",
                  borderBottom: idx < ibkrResults.length - 1 ? `1px solid ${T.soft}` : "none",
                  background: idx % 2 === 0 ? "transparent" : T.bgPanel,
                }}>
                  <div style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 700, color: T.primary }}>{fill.currency_pair}</div>
                  <div style={{
                    fontFamily: T.fontMono, fontSize: 12, fontWeight: 700,
                    color: fill.action === "SELL" ? T.red : T.cyan,
                  }}>{fill.action}</div>
                  <div style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 700, color: T.cyan }}>
                    {fill.fill_price > 0 ? fill.fill_price.toFixed(4) : "--"}
                  </div>
                  <div style={{ fontFamily: T.fontMono, fontSize: 13, color: T.primary }}>{fmt(fill.fill_quantity)}</div>
                  <div style={{ fontFamily: T.fontMono, fontSize: 12, color: T.tertiary }}>{fill.exec_id ?? "--"}</div>
                </div>
              ))}
            </div>

            {/* Aggregates */}
            <div style={{
              display: "flex", alignItems: "center", gap: 24,
              padding: "10px 16px",
              borderTop: `1px solid ${T.soft}`,
              background: T.bgPanel,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.tertiary, letterSpacing: "0.08em" }}>TOTAL NOTIONAL</span>
                <span style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 700, color: T.primary }}>
                  {fmtUsd(ibkrResults.reduce((s, f) => s + f.fill_quantity * f.fill_price, 0))}
                </span>
              </div>
              <span style={{ width: 1, height: 14, background: T.soft, display: "inline-block" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.tertiary, letterSpacing: "0.08em" }}>WAVG FILL</span>
                <span style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 700, color: T.cyan }}>
                  {(() => {
                    const totalNot = ibkrResults.reduce((s, f) => s + f.fill_quantity * f.fill_price, 0);
                    const totalQty = ibkrResults.reduce((s, f) => s + f.fill_quantity, 0);
                    return totalQty > 0 ? (totalNot / totalQty).toFixed(4) : "--";
                  })()}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Fill price input ─────────────────────────────────────────── */}
        <div style={{
          background: T.bgSub, border: `1px solid ${T.soft}`, borderRadius: 4,
          padding: "12px 16px", marginBottom: 12,
          display: "flex", alignItems: "center", gap: 16,
        }}>
          <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: T.tertiary, flexShrink: 0 }}>
            FILL PRICE (OPTIONAL)
          </span>
          <input
            type="number" step="0.000001" min="0"
            value={fillPrice} onChange={e => setFillPrice(e.target.value)}
            placeholder="Auto-filled from IBKR, or enter manually"
            disabled={!fillOk}
            style={{
              flex: 1, fontFamily: T.fontMono, fontSize: 13, color: T.primary,
              background: T.bgPanel, border: `1px solid ${T.soft}`,
              borderRadius: 3, padding: "7px 12px", outline: "none", minWidth: 0,
            }}
          />
        </div>

        {/* ── Post-execution context ─────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "10px 14px", marginBottom: 16,
          background: T.bgSub, border: `1px solid ${T.soft}`, borderRadius: 3,
        }}>
          <InfoIcon size={13} color={T.secondary} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontFamily: T.fontUI, fontSize: 12, color: T.secondary, lineHeight: "1.5" }}>
            Once confirmed, all positions will be marked HEDGED and the execution will be recorded in the audit trail. This action cannot be undone.
          </span>
        </div>

        {/* ── Total summary row ────────────────────────────────────────── */}
        {buckets.length > 0 && (
          <div style={{
            background: T.bgSub, border: `1px solid ${T.rim}`, borderRadius: 4,
            marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", overflow: "hidden",
          }}>
            {([
              ["TOTAL CONTRACTS",  fmt(totals.contracts),          T.primary],
              ["TOTAL NOTIONAL",   fmtUsd(totals.actionUsd),       T.primary],
              ["TOTAL MARGIN REQ", fmtUsd(totals.margin),          T.amber],
              ["EST TOTAL COST",   fmtUsd(totals.cost),            T.secondary],
            ] as const).map(([label, value, color], idx) => (
              <div key={label} style={{ padding: "14px 18px", borderRight: idx < 3 ? `1px solid ${T.soft}` : "none" }}>
                <div style={{ fontFamily: T.fontMono, fontSize: 12, letterSpacing: "0.12em", color: T.tertiary, marginBottom: 6 }}>{label}</div>
                <div style={{ fontFamily: T.fontMono, fontSize: 20, fontWeight: 700, color }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Pre-Confirmation Checklist ────────────────────────────────── */}
        {buckets.length > 0 && !done && (
          <div style={{
            background: "color-mix(in srgb, var(--accent-amber) 6%, transparent)",
            border: "1px solid color-mix(in srgb, var(--accent-amber) 20%, transparent)",
            borderRadius: 4, padding: "14px 16px", marginBottom: 16,
          }}>
            <div style={{
              fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em",
              color: T.amber, marginBottom: 10,
            }}>
              BEFORE CONFIRMING, VERIFY:
            </div>
            {[
              "All trade tickets are correct (instrument, direction, quantity)",
              "IBKR Gateway is running and account has sufficient margin",
              "Fill prices are within acceptable slippage tolerance",
            ].map((item, idx) => (
              <div key={idx} style={{
                display: "flex", alignItems: "flex-start", gap: 10,
                marginBottom: idx < 2 ? 8 : 0,
              }}>
                <div style={{
                  width: 16, height: 16, borderRadius: 2, flexShrink: 0, marginTop: 1,
                  border: `1.5px solid color-mix(in srgb, var(--accent-amber) 50%, transparent)`,
                  background: "color-mix(in srgb, var(--accent-amber) 4%, transparent)",
                }} />
                <span style={{ fontFamily: T.fontUI, fontSize: 12, color: T.secondary, lineHeight: "1.4" }}>{item}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Notices ──────────────────────────────────────────────────── */}
        {awaitingApproval && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px", background: "color-mix(in srgb, var(--accent-amber) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--accent-amber) 30%, transparent)", borderRadius: 4, marginBottom: 16 }}>
            <AlertCircleIcon size={15} color={T.amber} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <div style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, color: T.amber, letterSpacing: "0.08em", marginBottom: 4 }}>AWAITING CHECKER APPROVAL</div>
              <div style={{ fontFamily: T.fontUI, fontSize: 13, color: T.secondary }}>One or more proposals are pending checker sign-off. Check the staging queue.</div>
            </div>
          </div>
        )}
        {error && (
          <div style={{ marginBottom: 16 }}>
            <HedgeErrorBanner
              error={error}
              onRetry={() => { setError(null); handleMarkHedged(); }}
              onReconnect={() => window.location.href = "/auth/login"}
              onGoBack={onBack}
              onDismiss={() => setError(null)}
            />
          </div>
        )}
        {done && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "color-mix(in srgb, var(--status-pass,#22c55e) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--status-pass,#22c55e) 25%, transparent)", borderRadius: 4, marginBottom: 16 }}>
            <CheckCircleIcon size={15} color={T.green} />
            <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, color: T.green, letterSpacing: "0.08em" }}>HEDGED SUCCESSFULLY — ADVANCING PIPELINE...</span>
          </div>
        )}
        <div style={{ height: 20 }} />
      </div>

      {/* ── Unified action bar ───────────────────────────────────────────── */}
      <div style={{
        position: "sticky", bottom: 0, zIndex: 10,
        background: T.bgSub, borderTop: `2px solid ${T.rim}`,
        padding: "14px 24px", display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: 16, flexShrink: 0,
      }}>
        {/* Left — Back */}
        <button onClick={onBack} style={{
          display: "flex", alignItems: "center", gap: 5, background: "none",
          border: `1px solid ${T.soft}`, borderRadius: 3,
          padding: "10px 18px", cursor: "pointer",
        }}>
          <ChevronLeftIcon size={13} color={T.tertiary} />
          <span style={{ fontFamily: T.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: T.tertiary }}>BACK</span>
        </button>

        {/* Center — Status */}
        <span style={{ fontFamily: T.fontMono, fontSize: 12, color: proposalIds.length === 0 ? T.amber : T.secondary, letterSpacing: "0.04em" }}>
          {proposalIds.length === 0
            ? "No proposals — return to Review step"
            : `${proposalIds.length} proposal${proposalIds.length !== 1 ? "s" : ""} · ${governanceMode === "team" ? "4-eyes approval required" : "solo mode"}`
          }
        </span>

        {/* Right — Primary CTA */}
        <button
          onClick={() => setShowConfirm(true)} disabled={!fillOk || proposalIds.length === 0}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: done ? T.tertiary : executing ? "color-mix(in srgb, var(--status-pass,#22c55e) 60%, #000)" : T.green,
            color: PHC.black, border: "none", borderRadius: 3, padding: "12px 28px",
            cursor: !fillOk ? "default" : "pointer",
            fontFamily: T.fontMono, fontSize: 13, fontWeight: 700, letterSpacing: "0.1em",
            transition: "background 0.2s ease",
          }}
        >
          {executing && <LoaderIcon size={14} color="#000" style={{ animation: "spin 1s linear infinite" }} />}
          {done && <CheckCircleIcon size={14} color="#000" />}
          {done
            ? "EXECUTION CONFIRMED"
            : executing
              ? "EXECUTING..."
              : `CONFIRM EXECUTION — ${buckets.length} leg${buckets.length !== 1 ? "s" : ""}, ${fmt(totals.contracts)} contracts →`
          }
        </button>
      </div>

      {/* ── Execution confirmation overlay ─────────────────────────────── */}
      {showConfirm && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,0.55)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: T.bgPanel,
            border: `1px solid ${T.rim}`,
            borderRadius: 6,
            padding: "28px 32px",
            maxWidth: 520,
            width: "100%",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            display: "flex", flexDirection: "column", gap: 16,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <AlertTriangleIcon size={20} color={T.amber} />
              <span style={{
                fontFamily: T.fontMono, fontSize: 14, fontWeight: 700,
                letterSpacing: "0.12em", color: T.amber,
              }}>
                CONFIRM EXECUTION
              </span>
            </div>
            <span style={{
              fontFamily: T.fontUI, fontSize: 13, color: T.secondary, lineHeight: "1.6",
            }}>
              This will submit {buckets.length} order{buckets.length !== 1 ? "s" : ""} to IBKR Gateway and mark
              all positions as <strong style={{ fontFamily: T.fontMono, color: T.primary }}>HEDGED</strong>.
              This action is irreversible and will be recorded in the audit trail.
            </span>

            {/* ── IBKR execution progress ── */}
            {ibkrStatus !== "idle" && (
              <div style={{
                background: T.bgSub,
                border: `1px solid ${T.soft}`,
                borderRadius: 4,
                padding: "12px 14px",
              }}>
                {ibkrStatus === "connecting" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <LoaderIcon size={14} color={T.cyan} style={{ animation: "spin 1s linear infinite" }} />
                    <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.cyan, letterSpacing: "0.08em" }}>
                      CONNECTING TO IBKR GATEWAY...
                    </span>
                  </div>
                )}
                {ibkrStatus === "executing" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <ZapIcon size={14} color={T.amber} style={{ animation: "spin 1s linear infinite" }} />
                    <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.amber, letterSpacing: "0.08em" }}>
                      EXECUTING {buckets.length} ORDER{buckets.length !== 1 ? "S" : ""}...
                    </span>
                  </div>
                )}
                {ibkrStatus === "filled" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <CheckCircleIcon size={14} color={T.green} />
                    <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.green, letterSpacing: "0.08em" }}>
                      ALL ORDERS FILLED — RECORDING EXECUTION...
                    </span>
                  </div>
                )}
                {ibkrStatus === "error" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <XCircleIcon size={14} color={T.red} />
                      <span style={{ fontFamily: T.fontMono, fontSize: 12, color: T.red, letterSpacing: "0.08em" }}>
                        IBKR EXECUTION FAILED
                      </span>
                    </div>
                    {ibkrError && (
                      <div style={{
                        fontFamily: T.fontMono, fontSize: 12, color: T.secondary,
                        background: T.bgPanel, padding: "8px 10px", borderRadius: 3,
                        border: `1px solid ${T.soft}`, lineHeight: "1.5",
                      }}>
                        {ibkrError}
                      </div>
                    )}

                    {/* Fill results if any partial fills */}
                    {ibkrResults.length > 0 && (
                      <div style={{ marginTop: 4 }}>
                        {ibkrResults.map((fill, idx) => (
                          <div key={idx} style={{
                            display: "flex", alignItems: "center", gap: 12,
                            padding: "4px 0",
                            fontFamily: T.fontMono, fontSize: 12,
                          }}>
                            <span style={{ color: T.primary, minWidth: 70 }}>{fill.currency_pair}</span>
                            <span style={{ color: fill.action === "SELL" ? T.red : T.cyan, minWidth: 40 }}>{fill.action}</span>
                            <span style={{ color: fill.status === "Filled" ? T.green : fill.status === "Error" ? T.red : T.amber }}>
                              {fill.status}
                            </span>
                            {fill.fill_price > 0 && (
                              <span style={{ color: T.cyan }}>{fill.fill_price.toFixed(4)}</span>
                            )}
                            {fill.error && (
                              <span style={{ color: T.red, fontSize: 12 }}>{fill.error}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              justifyContent: "flex-end",
              marginTop: 4,
            }}>
              <button
                onClick={() => { setShowConfirm(false); setIbkrStatus("idle"); setIbkrError(null); setIbkrResults([]); }}
                disabled={ibkrStatus === "connecting" || ibkrStatus === "executing"}
                style={{
                  fontFamily: T.fontMono, fontSize: 12, fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: T.tertiary, background: "transparent",
                  border: `1px solid ${T.soft}`,
                  padding: "9px 20px", borderRadius: 3,
                  cursor: ibkrStatus === "connecting" || ibkrStatus === "executing" ? "default" : "pointer",
                  opacity: ibkrStatus === "connecting" || ibkrStatus === "executing" ? 0.5 : 1,
                }}
              >
                CANCEL
              </button>

              {/* Manual fallback when IBKR fails */}
              {ibkrStatus === "error" && (
                <button
                  onClick={() => { setShowConfirm(false); setIbkrStatus("idle"); setIbkrError(null); setIbkrResults([]); handleMarkHedged(); }}
                  style={{
                    fontFamily: T.fontMono, fontSize: 12, fontWeight: 700,
                    letterSpacing: "0.08em",
                    color: T.amber, background: "color-mix(in srgb, var(--accent-amber) 10%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--accent-amber) 30%, transparent)",
                    padding: "9px 20px", borderRadius: 3, cursor: "pointer",
                  }}
                >
                  PROCEED WITHOUT IBKR (MANUAL)
                </button>
              )}

              {/* Primary action — execute via IBKR */}
              {ibkrStatus !== "error" && ibkrStatus !== "filled" && (
                <button
                  onClick={handleIBKRExecute}
                  disabled={ibkrStatus === "connecting" || ibkrStatus === "executing"}
                  style={{
                    fontFamily: T.fontMono, fontSize: 12, fontWeight: 700,
                    letterSpacing: "0.08em",
                    color: PHC.black, background: T.green,
                    border: "none",
                    padding: "9px 20px", borderRadius: 3,
                    cursor: ibkrStatus === "connecting" || ibkrStatus === "executing" ? "default" : "pointer",
                    opacity: ibkrStatus === "connecting" || ibkrStatus === "executing" ? 0.7 : 1,
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  {(ibkrStatus === "connecting" || ibkrStatus === "executing") && (
                    <LoaderIcon size={12} color="#000" style={{ animation: "spin 1s linear infinite" }} />
                  )}
                  {ibkrStatus === "idle" ? "EXECUTE VIA IBKR" : "EXECUTING..."}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
