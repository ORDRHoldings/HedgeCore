"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { PositionRow } from "@/api/positionClient";
import { computeAllTickets, type FuturesTicket } from "@/lib/execution/contractSizing";
import type { CalculateResponse, ScenarioTotalResult } from "@/api/types";
import { dashboardFetch } from "@/lib/api/dashboardClient";

/* ── Design tokens ─────────────────────────────────────────────────────── */
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
  amber:     "var(--accent-amber)",
  pass:      "var(--status-pass,#22c55e)",
  fail:      "var(--accent-red,#ef4444)",
} as const;

/* ── Formatters ────────────────────────────────────────────────────────── */
const fmtNum = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const fmtDec = new Intl.NumberFormat("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const fmtUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const fmtPct = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtBps = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/* ── Props ─────────────────────────────────────────────────────────────── */
interface Props {
  positions: PositionRow[];
  calcResult: CalculateResponse | null;
  runId: string;
  token: string;
  onBack: () => void;
  onComplete: () => void;
}

type SubmitPhase = "idle" | "submitting" | "submitted" | "error";

/* ── Aggregate order for IBKR ─────────────────────────────────────────── */
interface AggregatedOrder {
  symbol: string;
  contractName: string;
  exchange: string;
  currency: string;
  side: "BUY" | "SELL";
  contracts: number;
  contractSize: number;
  totalNotional: number;
  avgRate: number;
  settlementMonth: string;
  ticketCount: number;
}

function aggregateTickets(tickets: FuturesTicket[]): AggregatedOrder[] {
  const map = new Map<string, AggregatedOrder>();
  for (const t of tickets) {
    if (t.instrumentType !== "FUTURES" || t.contracts <= 0) continue;
    const key = `${t.symbol}_${t.side}_${t.settlementMonth}`;
    const existing = map.get(key);
    if (existing) {
      existing.contracts += t.contracts;
      existing.totalNotional += t.totalCovered;
      existing.avgRate = (existing.avgRate * existing.ticketCount + t.estimatedRate) / (existing.ticketCount + 1);
      existing.ticketCount += 1;
    } else {
      map.set(key, {
        symbol: t.symbol,
        contractName: t.contractName,
        exchange: t.exchange,
        currency: t.currency,
        side: t.side,
        contracts: t.contracts,
        contractSize: t.contractSize,
        totalNotional: t.totalCovered,
        avgRate: t.estimatedRate,
        settlementMonth: t.settlementMonth,
        ticketCount: 1,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.contracts - a.contracts);
}

/* ── Hedge economics computation ──────────────────────────────────────── */
interface HedgeEconomics {
  coveragePct: number;
  residualMxn: number;
  totalFrictionUsd: number;
  costBps: number;
  carryBps: number;
  worstCaseProtectionUsd: number;
  scenarios: { sigma: number; shockedSpot: number; unhedgedUsd: number; hedgedUsd: number; benefitUsd: number }[];
  totalExposureMxn: number;
  totalHedgePositionMxn: number;
  spot: number;
}

function computeEconomics(cr: CalculateResponse): HedgeEconomics {
  const summary = cr.hedge_plan.summary;
  const totals = cr.scenario_results.totals;
  const buckets = cr.hedge_plan.buckets;

  const coveragePct = summary.total_commercial_exposure_mxn !== 0
    ? (summary.total_hedge_position_mxn / summary.total_commercial_exposure_mxn) * 100
    : 0;

  const costBps = summary.total_action_usd !== 0
    ? (summary.total_friction_usd / summary.total_action_usd) * 10000
    : 0;

  // Spot from zero-sigma scenario
  const spotScenario = totals.find((t: ScenarioTotalResult) => t.sigma === 0);
  const spot = spotScenario?.shocked_spot ?? 0;

  // Average forward rate across active buckets
  const activeBuckets = buckets.filter((b) => !b.suppressed && b.forward_rate > 0);
  const avgFwd = activeBuckets.length > 0
    ? activeBuckets.reduce((s, b) => s + b.forward_rate, 0) / activeBuckets.length
    : 0;
  const carryBps = spot !== 0 ? ((avgFwd - spot) / spot) * 10000 : 0;

  // Worst-case protection (max sigma)
  const positiveSigmas = totals.filter((t: ScenarioTotalResult) => t.sigma > 0);
  const maxSigma = positiveSigmas.reduce((best: ScenarioTotalResult | null, t: ScenarioTotalResult) =>
    !best || t.sigma > best.sigma ? t : best, null);

  const scenarios = positiveSigmas
    .sort((a: ScenarioTotalResult, b: ScenarioTotalResult) => a.sigma - b.sigma)
    .map((t: ScenarioTotalResult) => ({
      sigma: t.sigma,
      shockedSpot: t.shocked_spot,
      unhedgedUsd: t.total_unhedged_usd,
      hedgedUsd: t.total_hedged_usd,
      benefitUsd: t.total_hedge_benefit_usd,
    }));

  return {
    coveragePct,
    residualMxn: summary.total_residual_mxn,
    totalFrictionUsd: summary.total_friction_usd,
    costBps,
    carryBps,
    worstCaseProtectionUsd: maxSigma?.total_hedge_benefit_usd ?? 0,
    scenarios,
    totalExposureMxn: summary.total_commercial_exposure_mxn,
    totalHedgePositionMxn: summary.total_hedge_position_mxn,
    spot,
  };
}

/* ── Component ─────────────────────────────────────────────────────────── */
export default function StepExecute({
  positions, calcResult, runId, token, onBack, onComplete,
}: Props) {
  const router = useRouter();
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>("idle");
  const [submitProgress, setSubmitProgress] = useState(0);
  const [submitTotal, setSubmitTotal] = useState(0);
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdProposalIds, setCreatedProposalIds] = useState<string[]>([]);

  /* ── Compute tickets ──────────────────────────────────────────────── */
  const tickets: FuturesTicket[] = useMemo(() => {
    const forwardRates: Record<string, number> = {};
    if (calcResult) {
      const buckets = calcResult.hedge_plan?.buckets;
      if (buckets) {
        const hasCcyPrefix = buckets.some((b) => b.bucket.includes(" "));
        const singleCcy = !hasCcyPrefix && positions.length > 0 ? positions[0].currency : null;
        for (const b of buckets) {
          if (b.forward_rate && b.forward_rate !== 0) {
            if (hasCcyPrefix) {
              const ccy = b.bucket.split(" ")[0];
              if (ccy) forwardRates[ccy] = b.forward_rate;
            } else if (singleCcy) {
              forwardRates[singleCcy] = b.forward_rate;
            }
          }
        }
      }
    }
    return computeAllTickets(positions, Object.keys(forwardRates).length > 0 ? forwardRates : undefined);
  }, [positions, calcResult]);

  /* ── Aggregated orders (what a real trader would send) ────────────── */
  const aggregatedOrders = useMemo(() => aggregateTickets(tickets), [tickets]);

  /* ── Summary metrics ──────────────────────────────────────────────── */
  const totalContracts = useMemo(() => tickets.reduce((s, t) => s + t.contracts, 0), [tickets]);
  const totalNotionalCovered = useMemo(() => tickets.reduce((s, t) => s + t.totalCovered, 0), [tickets]);
  const totalResidual = useMemo(() => tickets.reduce((s, t) => s + t.residual, 0), [tickets]);
  const totalFriction = useMemo(() => tickets.reduce((s, t) => s + t.estimatedCostUsd, 0), [tickets]);

  const primaryCcy = tickets[0]?.currency ?? "MXN";
  const avgSpot = aggregatedOrders[0]?.avgRate ?? 1;
  const PRICE_CCY = new Set(["EUR", "GBP", "AUD", "NZD", "CHF"]);
  const totalNotionalUsd = avgSpot > 0
    ? (PRICE_CCY.has(primaryCcy) ? totalNotionalCovered * avgSpot : totalNotionalCovered / avgSpot)
    : totalNotionalCovered;

  /* ── Hedge economics ─────────────────────────────────────────────── */
  const hedgeEcon = useMemo(() => calcResult ? computeEconomics(calcResult) : null, [calcResult]);

  /* ── Policy / audit reference ────────────────────────────────────── */
  const auditRef = useMemo(() => {
    if (!calcResult) return null;
    return {
      runId: calcResult.run_id,
      engineVersion: calcResult.run_envelope.engine_version,
      bucketCount: calcResult.hedge_plan.buckets.length,
      policyHash: calcResult.run_envelope.policy_hash,
      inputsHash: calcResult.run_envelope.inputs_hash,
      outputsHash: calcResult.run_envelope.outputs_hash,
    };
  }, [calcResult]);

  /* ── Build IBKR JSON ──────────────────────────────────────────────── */
  const buildIbkrPayload = useCallback(() => {
    const orders = aggregatedOrders.map((agg) => ({
      msgType: "D" as const,
      clOrdID: `ORDR_${agg.symbol}_${agg.side}_${Date.now()}`,
      symbol: agg.symbol,
      secType: "FUT",
      exchange: "CME",
      side: agg.side === "SELL" ? "2" : "1",
      orderQty: agg.contracts,
      ordType: "2" as const,
      price: parseFloat(agg.avgRate.toFixed(5)),
      timeInForce: "1" as const,
      account: "DU1234567",
      currency: "USD",
      transactTime: new Date().toISOString(),
      text: `ORDR Terminal: ${agg.side} ${agg.contracts}\u00D7${agg.symbol} ${agg.contractName}, settle ${agg.settlementMonth}`,
    }));
    return {
      orders,
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: "demo@ordr-terminal",
        totalOrders: orders.length,
        totalContracts,
        runId,
        positionCount: positions.length,
      },
    };
  }, [aggregatedOrders, totalContracts, runId, positions.length]);

  /* ── Download IBKR JSON ────────────────────────────────────────────── */
  const downloadIbkr = useCallback(() => {
    const payload = buildIbkrPayload();
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ORDR_IBKR_${runId.slice(0, 8)}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [buildIbkrPayload, runId]);

  /* ── Open IBKR TWS deep-link ───────────────────────────────────────── */
  const openIbkr = useCallback(() => {
    const primary = aggregatedOrders[0];
    if (!primary) return;
    const pair = `${primary.symbol}USD`;
    const side = primary.side === "SELL" ? "SELL" : "BUY";
    const url = `https://ndg.interactivebrokers.com/fxtrader?pair=${pair}&side=${side}&notional=${Math.round(totalNotionalUsd)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [aggregatedOrders, totalNotionalUsd]);

  /* ── Email to execution desk ───────────────────────────────────────── */
  const emailOrder = useCallback(() => {
    const primary = aggregatedOrders[0];
    if (!primary) return;
    const subject = encodeURIComponent(
      `ORDR Terminal: ${primary.side} ${totalContracts}\u00D7${primary.symbol} ${primary.contractName} — ${primary.settlementMonth}`
    );
    const bodyLines = aggregatedOrders.map(
      (o) => `${o.side} ${o.contracts} x ${o.symbol} (${o.contractName}) @ ${fmtDec.format(o.avgRate)} - ${o.settlementMonth} - ${o.exchange}`
    );
    bodyLines.push("", `Total Contracts: ${totalContracts}`, `Total Notional: ${fmtNum.format(totalNotionalCovered)} ${primaryCcy}`, `Run ID: ${runId}`);
    const body = encodeURIComponent(bodyLines.join("\n"));
    window.open(`mailto:fx-desk@company.com?subject=${subject}&body=${body}`, "_self");
  }, [aggregatedOrders, totalContracts, totalNotionalCovered, primaryCcy, runId]);

  /* ── Submit proposals (4-eyes) ────────────────────────────────────── */
  const handleSubmitForApproval = useCallback(async () => {
    setSubmitPhase("submitting");
    setSubmitError(null);
    setSubmitTotal(positions.length);
    setSubmitProgress(0);

    const effectiveRunId = runId.includes(";") ? runId.split(";")[0] : runId;
    const ids: string[] = [];

    try {
      for (let i = 0; i < positions.length; i++) {
        const position = positions[i];
        setSubmitMessage(`Submitting proposal ${i + 1} of ${positions.length}...`);
        setSubmitProgress(i + 1);

        const buckets = calcResult?.hedge_plan?.buckets;
        const firstBucket = buckets?.[0];

        const res = await dashboardFetch("/v1/proposals", token, {
          method: "POST",
          body: JSON.stringify({
            position_id: position.id,
            execution_ref: `EXEC-${effectiveRunId.slice(0, 8).toUpperCase()}-${position.id.slice(0, 4).toUpperCase()}`,
            hedge_amount: firstBucket?.action_usd ?? null,
            hedge_rate: firstBucket?.forward_rate ?? null,
            run_id: effectiveRunId,
            notes: "Submitted via Execution Desk",
          }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status} for position ${position.id.slice(0, 8)}: ${text}`);
        }

        const data = await res.json();
        if (data?.id) ids.push(data.id as string);
      }

      setCreatedProposalIds(ids);
      setSubmitMessage("Done");
      setSubmitPhase("submitted");
      onComplete();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed");
      setSubmitPhase("error");
    }
  }, [positions, calcResult, runId, token, onComplete]);

  /* ── Render ────────────────────────────────────────────────────────── */
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, fontFamily: S.fontUI, color: S.primary }}>

      {/* ═══ Error banner ═══ */}
      {submitPhase === "error" && submitError && (
        <div style={{ padding: "12px 16px", background: "rgba(239,68,68,0.08)", borderBottom: `1px solid ${S.fail}`, flexShrink: 0, fontFamily: S.fontMono, fontSize: 11, color: S.fail }}>
          ERROR: {submitError}
        </div>
      )}

      {/* ═══ Main content (scrollable) ═══ */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>

        {/* ─── AWAITING APPROVAL panel (shown after successful submission) ─── */}
        {submitPhase === "submitted" && (
          <div style={{ margin: "16px 16px 0", padding: "28px 24px", background: S.bgPanel, border: `2px solid ${S.cyan}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: S.cyan, textTransform: "uppercase", marginBottom: 6 }}>
              PROPOSALS SUBMITTED
            </div>
            <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, marginBottom: 20 }}>
              Awaiting checker approval before execution
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 600, letterSpacing: "0.10em", color: S.tertiary, textTransform: "uppercase", marginBottom: 8 }}>
                PROPOSAL IDs ({createdProposalIds.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {createdProposalIds.length > 0 ? (
                  createdProposalIds.map((id) => (
                    <div key={id} style={{ fontFamily: S.fontMono, fontSize: 12, color: S.primary, padding: "6px 10px", background: S.bgSub, border: `1px solid ${S.soft}`, borderRadius: 3 }}>
                      {id.slice(0, 8).toUpperCase()}
                      <span style={{ color: S.tertiary, fontSize: 10, marginLeft: 8 }}>{id}</span>
                    </div>
                  ))
                ) : (
                  <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>
                    {positions.length} proposal{positions.length !== 1 ? "s" : ""} created (IDs not returned by server)
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => router.push("/staging")}
              style={{
                height: 48, padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                background: S.cyan, color: S.bgDeep, border: "none", borderRadius: 4,
                fontFamily: S.fontMono, fontSize: 13, fontWeight: 800, letterSpacing: "0.10em",
                cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.85"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
            >
              VIEW STAGING QUEUE &rarr;
            </button>
          </div>
        )}

        {/* ─── IBKR Order Preview Panel (shown before submission as preview) ─── */}
        {submitPhase !== "submitted" && aggregatedOrders.length > 0 && (
          <div style={{ margin: "16px 16px 0", padding: 0, background: S.bgPanel, border: `1px solid ${S.soft}`, borderRadius: 8, overflow: "hidden" }}>
            {/* Header */}
            <div style={{ padding: "16px 20px", background: S.bgSub, borderBottom: `1px solid ${S.soft}` }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 600, letterSpacing: "0.12em", color: S.tertiary, textTransform: "uppercase", marginBottom: 8 }}>
                BROKER ORDER PREVIEW (PRE-APPROVAL)
              </div>
              {aggregatedOrders.map((agg, i) => (
                <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: i < aggregatedOrders.length - 1 ? 8 : 0 }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: agg.side === "SELL" ? S.fail : S.pass }}>
                    {agg.side}
                  </span>
                  <span style={{ fontFamily: S.fontMono, fontSize: 28, fontWeight: 800, color: S.primary, lineHeight: 1 }}>
                    {agg.contracts}
                  </span>
                  <span style={{ fontFamily: S.fontMono, fontSize: 16, fontWeight: 600, color: S.secondary }}>
                    &times; {agg.symbol}
                  </span>
                  <span style={{ fontFamily: S.fontUI, fontSize: 14, color: S.secondary }}>
                    {agg.contractName}
                  </span>
                </div>
              ))}
              <div style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, marginTop: 8 }}>
                {aggregatedOrders.map((agg, i) => (
                  <span key={i}>
                    {i > 0 && " \u00B7 "}
                    @ {fmtDec.format(agg.avgRate)} &middot; {agg.settlementMonth} &middot; {agg.exchange}
                  </span>
                ))}
              </div>
              <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginTop: 6 }}>
                {aggregatedOrders.map((agg, i) => (
                  <div key={i}>
                    {fmtNum.format(agg.contractSize)} {agg.currency}/contract &middot; Total: {fmtNum.format(agg.totalNotional)} {agg.currency} &middot; From {agg.ticketCount} position{agg.ticketCount !== 1 ? "s" : ""}
                  </div>
                ))}
              </div>
            </div>

            {/* Secondary action buttons (download / email — preview only) */}
            <div style={{ padding: "12px 20px", display: "flex", gap: 10 }}>
              <button
                onClick={openIbkr}
                style={{
                  flex: 1, height: 36, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  background: "transparent", color: S.secondary, border: `1px solid ${S.soft}`, borderRadius: 4,
                  fontFamily: S.fontMono, fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                PREVIEW IN IBKR
              </button>
              <button
                onClick={downloadIbkr}
                style={{
                  flex: 1, height: 36, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  background: "transparent", color: S.cyan, border: `1px solid ${S.cyan}`, borderRadius: 4,
                  fontFamily: S.fontMono, fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                DOWNLOAD ORDER FILE
              </button>
              <button
                onClick={emailOrder}
                style={{
                  flex: 1, height: 36, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  background: "transparent", color: S.secondary, border: `1px solid ${S.soft}`, borderRadius: 4,
                  fontFamily: S.fontMono, fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                EMAIL TO FX DESK
              </button>
            </div>
          </div>
        )}

        {/* ─── Hedge Economics Panel ─── */}
        {submitPhase !== "submitted" && hedgeEcon && (
          <div style={{ margin: "16px 16px 0", padding: "14px 16px", background: S.bgSub, border: `1px solid ${S.soft}`, borderRadius: 4 }}>
            <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 600, letterSpacing: "0.12em", color: S.tertiary, textTransform: "uppercase", marginBottom: 12 }}>
              HEDGE ECONOMICS
            </div>

            {/* Plain-English summary */}
            <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary, marginBottom: 14, lineHeight: 1.6, padding: "10px 14px", background: S.bgPanel, border: `1px solid ${S.soft}`, borderRadius: 4 }}>
              This hedge covers <strong style={{ color: S.primary }}>{fmtPct.format(hedgeEcon.coveragePct)}%</strong> of
              your {primaryCcy} exposure at a cost of <strong style={{ color: S.amber }}>{fmtBps.format(hedgeEcon.costBps)} bps</strong> (~{fmtUsd.format(hedgeEcon.totalFrictionUsd)}).
              {hedgeEcon.scenarios.length > 0 && (
                <> At a {hedgeEcon.scenarios[hedgeEcon.scenarios.length - 1]?.sigma}&sigma; adverse move, the hedge saves approximately <strong style={{ color: S.pass }}>{fmtUsd.format(hedgeEcon.worstCaseProtectionUsd)}</strong>.</>
              )}
            </div>

            {/* Metrics grid */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "baseline", marginBottom: 16 }}>
              <SummaryCell label="Coverage Ratio" value={`${fmtPct.format(hedgeEcon.coveragePct)}%`} color={hedgeEcon.coveragePct >= 80 ? S.pass : S.amber} />
              <SummaryCell label="Residual Exposure" value={`${fmtNum.format(hedgeEcon.residualMxn)} ${primaryCcy}`} color={hedgeEcon.residualMxn > 0 ? S.amber : S.pass} />
              <SummaryCell label="Spread Cost" value={fmtUsd.format(hedgeEcon.totalFrictionUsd)} color={S.amber} />
              <SummaryCell label="Cost (bps)" value={`${fmtBps.format(hedgeEcon.costBps)} bps`} />
              <SummaryCell label="Carry Impact" value={`${hedgeEcon.carryBps >= 0 ? "+" : ""}${fmtBps.format(hedgeEcon.carryBps)} bps`} color={hedgeEcon.carryBps >= 0 ? S.pass : S.amber} />
              <SummaryCell label="Worst-Case Protection" value={fmtUsd.format(hedgeEcon.worstCaseProtectionUsd)} color={S.pass} />
            </div>

            {/* Scenario table */}
            {hedgeEcon.scenarios.length > 0 && (
              <>
                <div style={{ fontFamily: S.fontMono, fontSize: 8, fontWeight: 600, letterSpacing: "0.10em", color: S.tertiary, textTransform: "uppercase", marginBottom: 6 }}>
                  STRESS SCENARIO ANALYSIS
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: S.fontMono, fontSize: 10 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${S.soft}` }}>
                      {["Scenario", "Shocked Spot", "Unhedged P&L", "Hedged P&L", "Hedge Benefit"].map((h) => (
                        <th key={h} style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600, fontSize: 8, letterSpacing: "0.08em", color: S.tertiary, textTransform: "uppercase" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {hedgeEcon.scenarios.map((sc) => (
                      <tr key={sc.sigma} style={{ borderBottom: `1px solid ${S.soft}` }}>
                        <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: S.primary }}>{sc.sigma}&sigma;</td>
                        <td style={{ padding: "5px 8px", textAlign: "right", color: S.secondary }}>{fmtDec.format(sc.shockedSpot)}</td>
                        <td style={{ padding: "5px 8px", textAlign: "right", color: S.fail }}>{fmtUsd.format(sc.unhedgedUsd)}</td>
                        <td style={{ padding: "5px 8px", textAlign: "right", color: S.amber }}>{fmtUsd.format(sc.hedgedUsd)}</td>
                        <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: S.pass }}>{fmtUsd.format(sc.benefitUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}

        {/* ─── Audit Trail Reference ─── */}
        {submitPhase !== "submitted" && auditRef && (
          <div style={{ margin: "12px 16px 0", padding: "10px 16px", background: S.bgSub, border: `1px solid ${S.soft}`, borderRadius: 4 }}>
            <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 600, letterSpacing: "0.12em", color: S.tertiary, textTransform: "uppercase", marginBottom: 8 }}>
              AUDIT TRAIL REFERENCE
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20, fontFamily: S.fontMono, fontSize: 10, color: S.secondary }}>
              <span>Run: <span style={{ color: S.primary }}>{auditRef.runId.slice(0, 12)}...</span></span>
              <span>Engine: <span style={{ color: S.primary }}>{auditRef.engineVersion}</span></span>
              <span>Buckets: <span style={{ color: S.primary }}>{auditRef.bucketCount}</span></span>
              <span>Policy: <span style={{ color: S.cyan }}>{auditRef.policyHash.slice(0, 12)}...</span></span>
              <span>Inputs: <span style={{ color: S.cyan }}>{auditRef.inputsHash.slice(0, 12)}...</span></span>
              <span>Outputs: <span style={{ color: S.cyan }}>{auditRef.outputsHash.slice(0, 12)}...</span></span>
            </div>
          </div>
        )}

        {/* ─── Section 1: Contract Tickets (individual positions) ─── */}
        <div style={{ padding: "12px 16px 0" }}>
          <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 600, letterSpacing: "0.12em", color: S.tertiary, textTransform: "uppercase", marginBottom: 10 }}>
            CONTRACT TICKETS ({tickets.length})
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tickets.map((ticket, i) => {
              const isFutures = ticket.instrumentType === "FUTURES";
              const borderColor = isFutures ? (ticket.side === "SELL" ? S.amber : S.pass) : S.cyan;
              return (
                <div key={i} style={{ background: S.bgSub, border: `1px solid ${S.soft}`, borderLeft: `4px solid ${borderColor}`, borderRadius: 4, padding: "14px 16px", position: "relative" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: ticket.side === "SELL" ? S.fail : S.pass }}>
                      {ticket.side}
                    </span>
                    {isFutures && ticket.contracts > 0 && (
                      <span style={{ fontFamily: S.fontMono, fontSize: 24, fontWeight: 800, color: S.primary, lineHeight: 1 }}>
                        {ticket.contracts}
                      </span>
                    )}
                    {isFutures && ticket.contracts > 0 && (
                      <span style={{ fontFamily: S.fontMono, fontSize: 14, fontWeight: 600, color: S.secondary }}>
                        &times; {ticket.symbol}
                      </span>
                    )}
                    <span style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary }}>
                      {ticket.contractName}
                    </span>
                    {!isFutures && (
                      <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 3, fontSize: 8, fontFamily: S.fontMono, fontWeight: 700, letterSpacing: "0.08em", background: "rgba(0,255,255,0.10)", color: S.cyan, border: `1px solid ${S.cyan}` }}>
                        VIA OTC COUNTERPARTY
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, marginBottom: 10 }}>
                    @ {fmtDec.format(ticket.estimatedRate)} &middot; {ticket.settlementMonth} &middot; {ticket.exchange}
                  </div>
                  <div style={{ height: 1, background: S.soft, marginBottom: 10 }} />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontFamily: S.fontMono, fontSize: 10, color: S.secondary, lineHeight: 1.6 }}>
                    {isFutures && <span>{fmtNum.format(ticket.contractSize)} {ticket.currency}/contract</span>}
                    {isFutures && (<><span style={{ color: S.soft }}>&middot;</span><span>Covers: <span style={{ color: S.primary, fontWeight: 600 }}>{fmtNum.format(ticket.totalCovered)} {ticket.currency}</span></span></>)}
                    {!isFutures && <span>Notional: <span style={{ color: S.primary, fontWeight: 600 }}>{fmtNum.format(ticket.notional)} {ticket.currency}</span></span>}
                    <span style={{ color: S.soft }}>&middot;</span>
                    <span>Residual: <span style={{ color: ticket.residual > 0 ? S.amber : S.pass, fontWeight: 600 }}>{fmtNum.format(ticket.residual)} {ticket.currency}</span></span>
                    <span style={{ color: S.soft }}>&middot;</span>
                    <span>Entity: <span style={{ color: S.primary }}>{ticket.entity}</span></span>
                    <span style={{ color: S.soft }}>&middot;</span>
                    <span>Position: <span style={{ color: S.primary }}>{ticket.recordId}</span></span>
                    {ticket.estimatedCostUsd > 0 && (<><span style={{ color: S.soft }}>&middot;</span><span>Est. Cost: <span style={{ color: S.amber }}>{fmtUsd.format(ticket.estimatedCostUsd)}</span></span></>)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Section 2: Execution Summary ─── */}
        <div style={{ margin: "16px 16px 0", padding: "14px 16px", background: S.bgSub, border: `1px solid ${S.soft}`, borderRadius: 4 }}>
          <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 600, letterSpacing: "0.12em", color: S.tertiary, textTransform: "uppercase", marginBottom: 10 }}>
            EXECUTION SUMMARY
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "baseline" }}>
            <SummaryCell label="Total Contracts" value={aggregatedOrders.map((o) => `${o.symbol}: ${o.contracts}`).join(" \u00B7 ") || "OTC only"} />
            <SummaryCell label="Notional Covered" value={`${fmtNum.format(totalNotionalCovered)} ${primaryCcy}`} />
            <SummaryCell label="USD Equivalent" value={fmtUsd.format(totalNotionalUsd)} />
            <SummaryCell label="Est. Friction" value={fmtUsd.format(totalFriction)} color={totalFriction > 0 ? S.amber : undefined} />
            <SummaryCell label="Residual" value={`${fmtNum.format(totalResidual)} ${primaryCcy}`} color={totalResidual > 0 ? S.amber : S.pass} />
          </div>
        </div>

        {/* ─── Section 3: Submission Controls ─── */}
        {submitPhase !== "submitted" && (
          <div style={{ margin: "16px 16px 16px", padding: "14px 16px", background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 4 }}>
            {submitPhase === "idle" && (
              <>
                <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, marginBottom: 14, padding: "10px 12px", background: "rgba(0,200,255,0.05)", border: `1px solid rgba(0,200,255,0.15)`, borderRadius: 4 }}>
                  Submitting will create an <strong style={{ color: S.primary }}>ExecutionProposal</strong> for each position. A checker must approve in the Staging Queue before any position is marked HEDGED.
                </div>
                <button
                  onClick={handleSubmitForApproval}
                  style={{
                    height: 48, padding: "0 40px", background: S.cyan, color: S.bgDeep, border: "none", borderRadius: 4,
                    fontFamily: S.fontMono, fontSize: 14, fontWeight: 800, letterSpacing: "0.10em", cursor: "pointer", transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.85"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
                >
                  SUBMIT FOR APPROVAL (4-EYES)
                </button>
                <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, marginTop: 8 }}>
                  This will create {positions.length} proposal{positions.length !== 1 ? "s" : ""} pending checker approval.
                </div>
              </>
            )}

            {submitPhase === "submitting" && (
              <div>
                <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, color: S.cyan, letterSpacing: "0.06em", marginBottom: 8 }}>
                  {submitMessage}
                </div>
                <div style={{ height: 4, borderRadius: 2, background: S.bgDeep, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: submitTotal > 0 ? `${(submitProgress / submitTotal) * 100}%` : "0%", borderRadius: 2, background: S.cyan, transition: "width 0.2s ease" }} />
                </div>
              </div>
            )}

            {submitPhase === "error" && (
              <div>
                <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.fail, marginBottom: 8 }}>
                  ERROR: {submitError}
                </div>
                <button
                  onClick={handleSubmitForApproval}
                  style={{
                    height: 40, padding: "0 24px", background: S.amber, color: S.bgDeep, border: "none", borderRadius: 4,
                    fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer",
                  }}
                >
                  RETRY SUBMISSION
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ Footer ═══ */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, padding: "0 16px", background: S.bgPanel, borderTop: `1px solid ${S.rim}`, flexShrink: 0, marginTop: "auto" }}>
        <button
          onClick={onBack}
          disabled={submitPhase === "submitting"}
          style={{
            height: 36, padding: "0 20px", background: "transparent",
            color: submitPhase === "submitting" ? S.soft : S.tertiary,
            border: `1px solid ${S.soft}`, borderRadius: 4,
            fontFamily: S.fontMono, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
            cursor: submitPhase === "submitting" ? "not-allowed" : "pointer", transition: "all 0.15s",
          }}
        >
          &#9666; BACK TO RISK CHECK
        </button>
        <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, letterSpacing: "0.06em" }}>
          RUN: {runId.slice(0, 12)}...
        </span>
      </div>
    </div>
  );
}

/* ── Summary cell helper ─────────────────────────────────────────────── */
function SummaryCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)", fontSize: 8, fontWeight: 600, letterSpacing: "0.10em", color: "var(--text-tertiary)", textTransform: "uppercase" as const, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)", fontSize: 14, fontWeight: 700, color: color ?? "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}

/* ── SVG icons for nav buttons ───────────────────────────────────────── */
// (kept for potential future use)
// const gridIcon = `<svg .../>`;
// const shieldIcon = `<svg .../>`;
// const fileIcon = `<svg .../>`;
// const flaskIcon = `<svg .../>`;
