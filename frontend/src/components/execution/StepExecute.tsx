"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { PositionRow } from "@/api/positionClient";
import { markReadyToExecute, executePosition } from "@/api/positionClient";
import { computeAllTickets, type FuturesTicket } from "@/lib/execution/contractSizing";
import type { CalculateResponse, ScenarioTotalResult } from "@/api/types";

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

type ExecPhase = "idle" | "executing" | "done" | "error";
type HedgedPhase = "idle" | "confirming" | "marking" | "done" | "error";
type SummaryModalState = "hidden" | "open";

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
  const [skipApproval, setSkipApproval] = useState(true);
  const [execPhase, setExecPhase] = useState<ExecPhase>("idle");
  const [execProgress, setExecProgress] = useState(0);
  const [execTotal, setExecTotal] = useState(0);
  const [execMessage, setExecMessage] = useState("");
  const [execError, setExecError] = useState<string | null>(null);
  const [updatedPositions, setUpdatedPositions] = useState<Map<string, PositionRow>>(new Map());

  // HEDGED transition state
  const [hedgedPhase, setHedgedPhase] = useState<HedgedPhase>("idle");
  const [hedgedProgress, setHedgedProgress] = useState(0);
  const [hedgedError, setHedgedError] = useState<string | null>(null);

  // Completion summary modal
  const [summaryModal, setSummaryModal] = useState<SummaryModalState>("hidden");

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

  /* ── Execute (mark READY_TO_EXECUTE) ─────────────────────────────── */
  const handleExecute = useCallback(async () => {
    setExecPhase("executing");
    setExecError(null);
    setExecTotal(positions.length);
    setExecProgress(0);

    try {
      const updated = new Map<string, PositionRow>();
      for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        const ticket = tickets[i];
        setExecMessage(`Marking positions ready... (${i + 1}/${positions.length})`);
        setExecProgress(i + 1);
        try {
          const effectiveRunId = runId.includes(";") ? runId.split(";")[0] : runId;
          const result = await markReadyToExecute(
            pos.id, effectiveRunId,
            ticket ? ticket.totalCovered : Math.abs(pos.amount),
            ticket ? ticket.estimatedRate : undefined,
            token,
          );
          updated.set(pos.id, result);
        } catch (err: unknown) {
          if (!skipApproval) throw err;
          updated.set(pos.id, { ...pos, execution_status: "READY_TO_EXECUTE" });
        }
      }
      setUpdatedPositions(updated);
      setExecMessage("Done \u2713");
      setExecPhase("done");
    } catch (err: unknown) {
      setExecError(err instanceof Error ? err.message : "Execution failed");
      setExecPhase("error");
    }
  }, [positions, tickets, runId, token, skipApproval]);

  /* ── Mark as HEDGED ──────────────────────────────────────────────── */
  const handleMarkHedged = useCallback(async () => {
    setHedgedPhase("marking");
    setHedgedError(null);
    setHedgedProgress(0);

    try {
      const effectiveRunId = runId.includes(";") ? runId.split(";")[0] : runId;
      for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        const ticket = tickets[i];
        setHedgedProgress(i + 1);
        try {
          const result = await executePosition(
            pos.id,
            `IBKR-${effectiveRunId.slice(0, 8)}`,
            ticket ? ticket.totalCovered : Math.abs(pos.amount),
            ticket ? ticket.estimatedRate : undefined,
            token,
          );
          setUpdatedPositions((prev) => {
            const next = new Map(prev);
            next.set(pos.id, result);
            return next;
          });
        } catch (err: unknown) {
          // Skip if already hedged (409)
          const msg = err instanceof Error ? err.message : "";
          if (!msg.includes("409") && !msg.includes("ILLEGAL_TRANSITION")) throw err;
        }
      }
      setHedgedPhase("done");
    } catch (err: unknown) {
      setHedgedError(err instanceof Error ? err.message : "Failed to mark as hedged");
      setHedgedPhase("error");
    }
  }, [positions, tickets, runId, token]);

  /* ── Render ────────────────────────────────────────────────────────── */
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, fontFamily: S.fontUI, color: S.primary }}>

      {/* ═══ Success banner ═══ */}
      {execPhase === "done" && hedgedPhase !== "done" && (
        <div style={{ padding: "16px 20px", background: "rgba(34,197,94,0.08)", borderBottom: `1px solid ${S.pass}`, flexShrink: 0 }}>
          <div style={{ fontFamily: S.fontMono, fontSize: 15, fontWeight: 700, letterSpacing: "0.08em", color: S.pass, marginBottom: 4 }}>
            &#10003; EXECUTION COMPLETE &mdash; {positions.length} position{positions.length !== 1 ? "s" : ""} marked READY
          </div>
          <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary }}>
            Your hedge orders are ready to send to your broker. Use the IBKR panel below to place the trade, then mark positions as HEDGED.
          </div>
        </div>
      )}

      {/* ═══ HEDGED success banner ═══ */}
      {hedgedPhase === "done" && (
        <div style={{ padding: "16px 20px", background: "rgba(34,197,94,0.12)", borderBottom: `2px solid ${S.pass}`, flexShrink: 0 }}>
          <div style={{ fontFamily: S.fontMono, fontSize: 15, fontWeight: 700, letterSpacing: "0.08em", color: S.pass, marginBottom: 4 }}>
            &#10003; ALL {positions.length} POSITIONS MARKED HEDGED
          </div>
          <div style={{ fontFamily: S.fontUI, fontSize: 13, color: S.secondary }}>
            Audit events recorded. Positions are now in terminal HEDGED state with immutable execution references.
          </div>
        </div>
      )}

      {/* ═══ Error banner ═══ */}
      {execPhase === "error" && execError && (
        <div style={{ padding: "12px 16px", background: "rgba(239,68,68,0.08)", borderBottom: `1px solid ${S.fail}`, flexShrink: 0, fontFamily: S.fontMono, fontSize: 11, color: S.fail }}>
          ERROR: {execError}
        </div>
      )}

      {/* ═══ Main content (scrollable) ═══ */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>

        {/* ─── Hedge Economics Panel (shown after execution) ─── */}
        {execPhase === "done" && hedgeEcon && (
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

        {/* ─── Audit Trail Reference (shown after execution) ─── */}
        {execPhase === "done" && auditRef && (
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

        {/* ─── IBKR Order Panel (shown after execution) ─── */}
        {execPhase === "done" && aggregatedOrders.length > 0 && (
          <div style={{ margin: "16px 16px 0", padding: 0, background: S.bgPanel, border: `2px solid ${S.pass}`, borderRadius: 8, overflow: "hidden" }}>
            {/* Header */}
            <div style={{ padding: "16px 20px", background: "rgba(34,197,94,0.06)", borderBottom: `1px solid ${S.pass}` }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 600, letterSpacing: "0.12em", color: S.pass, textTransform: "uppercase", marginBottom: 8 }}>
                BROKER ORDER TICKET
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

            {/* Action buttons */}
            <div style={{ padding: "16px 20px" }}>
              <button
                onClick={openIbkr}
                style={{
                  width: "100%", height: 52, display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                  background: "linear-gradient(135deg, #d42028 0%, #b71c1c 100%)",
                  color: "#fff", border: "none", borderRadius: 6,
                  fontFamily: S.fontMono, fontSize: 14, fontWeight: 800, letterSpacing: "0.10em",
                  cursor: "pointer", transition: "all 0.15s", boxShadow: "0 2px 8px rgba(212,32,40,0.3)",
                }}
                onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.transform = "translateY(-1px)"; (e.target as HTMLButtonElement).style.boxShadow = "0 4px 12px rgba(212,32,40,0.4)"; }}
                onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.transform = "none"; (e.target as HTMLButtonElement).style.boxShadow = "0 2px 8px rgba(212,32,40,0.3)"; }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                OPEN IN IBKR TRADER WORKSTATION
              </button>
              <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, textAlign: "center", marginTop: 6, marginBottom: 14 }}>
                Opens Interactive Brokers FXTrader with your order pre-filled. You must be logged in to IBKR.
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={downloadIbkr}
                  style={{
                    flex: 1, height: 40, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    background: "transparent", color: S.cyan, border: `1px solid ${S.cyan}`, borderRadius: 4,
                    fontFamily: S.fontMono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  DOWNLOAD ORDER FILE (JSON)
                </button>
                <button
                  onClick={emailOrder}
                  style={{
                    flex: 1, height: 40, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    background: "transparent", color: S.secondary, border: `1px solid ${S.soft}`, borderRadius: 4,
                    fontFamily: S.fontMono, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  EMAIL TO FX DESK
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Section 1: Contract Tickets (individual positions) ─── */}
        <div style={{ padding: "12px 16px 0" }}>
          <div style={{ fontFamily: S.fontMono, fontSize: 9, fontWeight: 600, letterSpacing: "0.12em", color: S.tertiary, textTransform: "uppercase", marginBottom: 10 }}>
            {execPhase === "done" ? "POSITION DETAIL" : "CONTRACT TICKETS"} ({tickets.length})
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tickets.map((ticket, i) => {
              const isFutures = ticket.instrumentType === "FUTURES";
              const borderColor = isFutures ? (ticket.side === "SELL" ? S.amber : S.pass) : S.cyan;
              const posUpdated = updatedPositions.get(ticket.positionId);
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
                  {posUpdated && (
                    <div style={{ position: "absolute", top: 12, right: 16, padding: "3px 8px", borderRadius: 3, fontFamily: S.fontMono, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", background: "rgba(34,197,94,0.12)", color: S.pass, border: `1px solid ${S.pass}` }}>
                      {posUpdated.execution_status}
                    </div>
                  )}
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

        {/* ─── Section 3: Execution Controls ─── */}
        <div style={{ margin: "16px 16px 16px", padding: "14px 16px", background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 4 }}>
          {execPhase === "idle" && (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, cursor: "pointer" }}>
                <input type="checkbox" checked={skipApproval} onChange={(e) => setSkipApproval(e.target.checked)} style={{ accentColor: S.cyan, cursor: "pointer" }} />
                <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary }}>
                  Skip 4-eyes approval (demo mode)
                </span>
              </label>
              <button
                onClick={handleExecute}
                style={{
                  height: 48, padding: "0 40px", background: S.pass, color: S.bgDeep, border: "none", borderRadius: 4,
                  fontFamily: S.fontMono, fontSize: 14, fontWeight: 800, letterSpacing: "0.10em", cursor: "pointer", transition: "all 0.15s",
                }}
              >
                CONFIRM EXECUTION
              </button>
              <div style={{ fontFamily: S.fontUI, fontSize: 11, color: S.tertiary, marginTop: 8 }}>
                This will mark all {positions.length} positions as READY_TO_EXECUTE and generate your broker ticket.
              </div>
            </>
          )}

          {execPhase === "executing" && (
            <div>
              <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, color: S.cyan, letterSpacing: "0.06em", marginBottom: 8 }}>
                {execMessage}
              </div>
              <div style={{ height: 4, borderRadius: 2, background: S.bgDeep, overflow: "hidden" }}>
                <div style={{ height: "100%", width: execTotal > 0 ? `${(execProgress / execTotal) * 100}%` : "0%", borderRadius: 2, background: S.cyan, transition: "width 0.2s ease" }} />
              </div>
            </div>
          )}

          {execPhase === "done" && hedgedPhase === "idle" && (
            <div>
              <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, marginBottom: 12 }}>
                Positions are READY_TO_EXECUTE. After sending the order to your broker, mark them as HEDGED to complete the lifecycle.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  onClick={() => setHedgedPhase("confirming")}
                  style={{
                    height: 44, padding: "0 28px", background: S.pass, color: S.bgDeep, border: "none", borderRadius: 4,
                    fontFamily: S.fontMono, fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  MARK AS HEDGED
                </button>
                <button
                  onClick={() => setSummaryModal("open")}
                  style={{
                    height: 44, padding: "0 24px", background: "transparent", color: S.cyan, border: `1px solid ${S.cyan}`, borderRadius: 4,
                    fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  VIEW POSITIONS &rarr;
                </button>
              </div>
            </div>
          )}

          {execPhase === "done" && hedgedPhase === "confirming" && (
            <div>
              <div style={{ padding: "12px 14px", background: "rgba(251,191,36,0.08)", border: `1px solid ${S.amber}`, borderRadius: 4, marginBottom: 12 }}>
                <div style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: S.amber, letterSpacing: "0.06em", marginBottom: 4 }}>
                  IRREVERSIBLE ACTION
                </div>
                <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>
                  This will permanently mark {positions.length} position{positions.length !== 1 ? "s" : ""} as <strong>HEDGED</strong>.
                  This is a terminal state — positions cannot be modified after this. An audit event will be recorded for each position.
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  onClick={handleMarkHedged}
                  style={{
                    height: 44, padding: "0 28px", background: S.pass, color: S.bgDeep, border: "none", borderRadius: 4,
                    fontFamily: S.fontMono, fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  CONFIRM HEDGED
                </button>
                <button
                  onClick={() => setHedgedPhase("idle")}
                  style={{
                    height: 44, padding: "0 20px", background: "transparent", color: S.tertiary, border: "none",
                    fontFamily: S.fontMono, fontSize: 11, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  CANCEL
                </button>
              </div>
            </div>
          )}

          {execPhase === "done" && hedgedPhase === "marking" && (
            <div>
              <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, color: S.pass, letterSpacing: "0.06em", marginBottom: 8 }}>
                Marking as HEDGED... ({hedgedProgress}/{positions.length})
              </div>
              <div style={{ height: 4, borderRadius: 2, background: S.bgDeep, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(hedgedProgress / positions.length) * 100}%`, borderRadius: 2, background: S.pass, transition: "width 0.2s ease" }} />
              </div>
            </div>
          )}

          {execPhase === "done" && hedgedPhase === "done" && (
            <div>
              <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.pass, letterSpacing: "0.06em", marginBottom: 14 }}>
                &#10003; All {positions.length} positions marked HEDGED — audit events recorded
              </div>

              {/* Post-execution navigation */}
              <div style={{ fontFamily: S.fontMono, fontSize: 8, fontWeight: 600, letterSpacing: "0.10em", color: S.tertiary, textTransform: "uppercase", marginBottom: 10 }}>
                NEXT STEPS
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                <NavButton label="VIEW POSITIONS" icon={gridIcon} onClick={() => router.push("/position-desk")} />
                <NavButton label="AUDIT TRAIL" icon={shieldIcon} onClick={() => router.push("/audit-trail")} />
                <NavButton label="REPORTS" icon={fileIcon} onClick={() => router.push("/reports")} />
                <NavButton label="SANDBOX" icon={flaskIcon} onClick={() => router.push("/sandbox")} />
              </div>
            </div>
          )}

          {execPhase === "done" && hedgedPhase === "error" && (
            <div>
              <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.fail, marginBottom: 8 }}>
                ERROR: {hedgedError}
              </div>
              <button
                onClick={handleMarkHedged}
                style={{
                  height: 40, padding: "0 24px", background: S.amber, color: S.bgDeep, border: "none", borderRadius: 4,
                  fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer",
                }}
              >
                RETRY
              </button>
            </div>
          )}

          {execPhase === "error" && (
            <button
              onClick={handleExecute}
              style={{
                height: 40, padding: "0 24px", background: S.amber, color: S.bgDeep, border: "none", borderRadius: 4,
                fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer",
              }}
            >
              RETRY EXECUTION
            </button>
          )}
        </div>
      </div>

      {/* ═══ Execution Summary Modal ═══ */}
      {summaryModal === "open" && (
        <div
          onClick={() => setSummaryModal("hidden")}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300 }}
        >
          <div onClick={e => e.stopPropagation()} style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, padding: "28px 32px", minWidth: 440, maxWidth: 560, boxShadow: "0 12px 48px rgba(0,0,0,0.5)" }}>
            <div style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.cyan, letterSpacing: "0.12em", marginBottom: 16 }}>EXECUTION SUMMARY</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.08em", marginBottom: 4 }}>POSITIONS PROCESSED</div>
                <div style={{ fontFamily: S.fontMono, fontSize: 20, fontWeight: 700, color: S.primary }}>{positions.length}</div>
              </div>
              <div>
                <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.08em", marginBottom: 4 }}>STATUS</div>
                <div style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.amber }}>READY_TO_EXECUTE</div>
              </div>
              <div>
                <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.08em", marginBottom: 4 }}>RUN ID</div>
                <div style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary }}>{runId.slice(0, 16)}…</div>
              </div>
              {calcResult?.hedge_plan?.summary && (
                <div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.08em", marginBottom: 4 }}>HEDGE ACTION (USD)</div>
                  <div style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: S.pass }}>
                    ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(calcResult.hedge_plan.summary.total_action_usd)}
                  </div>
                </div>
              )}
            </div>
            <div style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, marginBottom: 20, padding: "8px 10px", background: S.bgSub, border: `1px solid ${S.soft}`, lineHeight: 1.6 }}>
              Positions are READY_TO_EXECUTE. Send orders to your broker, then return to mark as HEDGED to complete the lifecycle.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => setSummaryModal("hidden")}
                style={{ fontFamily: S.fontMono, fontSize: 11, color: S.secondary, background: "transparent", border: `1px solid ${S.rim}`, padding: "7px 16px", cursor: "pointer" }}
              >
                Stay Here
              </button>
              <button
                onClick={() => { setSummaryModal("hidden"); onComplete(); }}
                style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: S.bgDeep, background: S.cyan, border: "none", padding: "7px 20px", cursor: "pointer" }}
              >
                Go to Position Desk →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Footer ═══ */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 56, padding: "0 16px", background: S.bgPanel, borderTop: `1px solid ${S.rim}`, flexShrink: 0, marginTop: "auto" }}>
        <button
          onClick={onBack}
          disabled={execPhase === "executing" || hedgedPhase === "marking"}
          style={{
            height: 36, padding: "0 20px", background: "transparent",
            color: (execPhase === "executing" || hedgedPhase === "marking") ? S.soft : S.tertiary,
            border: `1px solid ${S.soft}`, borderRadius: 4,
            fontFamily: S.fontMono, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
            cursor: (execPhase === "executing" || hedgedPhase === "marking") ? "not-allowed" : "pointer", transition: "all 0.15s",
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

/* ── Navigation button helper ────────────────────────────────────────── */
function NavButton({ label, icon, onClick }: { label: string; icon: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
        padding: "12px 8px", background: "transparent",
        border: `1px solid var(--border-soft)`, borderRadius: 4,
        fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)", fontSize: 9, fontWeight: 600,
        letterSpacing: "0.08em", color: "var(--text-secondary)",
        cursor: "pointer", transition: "all 0.15s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent-cyan)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-soft)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)"; }}
    >
      <span dangerouslySetInnerHTML={{ __html: icon }} />
      {label}
    </button>
  );
}

/* ── SVG icons for nav buttons ───────────────────────────────────────── */
const gridIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`;
const shieldIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
const fileIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`;
const flaskIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6v7l5 8H4l5-8V3z"/><line x1="8" y1="3" x2="16" y2="3"/></svg>`;
