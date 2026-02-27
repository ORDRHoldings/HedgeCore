"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { PositionRow } from "@/api/positionClient";
import { markReadyToExecute } from "@/api/positionClient";
import { computeAllTickets, formatTicketSummary, type FuturesTicket } from "@/lib/execution/contractSizing";
import { CME_CONTRACTS } from "@/lib/constants/cmeContracts";

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
const fmtDec = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
const fmtUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

/* ── Props ─────────────────────────────────────────────────────────────── */
interface Props {
  positions: PositionRow[];
  calcResult: Record<string, unknown> | null;
  runId: string;
  token: string;
  onBack: () => void;
  onComplete: () => void;
}

/* ── Execution state ───────────────────────────────────────────────────── */
type ExecPhase = "idle" | "executing" | "done" | "error";

/* ── Component ─────────────────────────────────────────────────────────── */
export default function StepExecute({
  positions,
  calcResult,
  runId,
  token,
  onBack,
  onComplete,
}: Props) {
  const [skipApproval, setSkipApproval] = useState(true);
  const [execPhase, setExecPhase] = useState<ExecPhase>("idle");
  const [execProgress, setExecProgress] = useState(0);
  const [execTotal, setExecTotal] = useState(0);
  const [execMessage, setExecMessage] = useState("");
  const [execError, setExecError] = useState<string | null>(null);
  const [updatedPositions, setUpdatedPositions] = useState<Map<string, PositionRow>>(new Map());

  /* ── Compute tickets on mount ──────────────────────────────────────── */
  const tickets: FuturesTicket[] = useMemo(() => {
    // Extract forward rates from calcResult — map by currency code
    // Merged buckets have keys like "EUR 2026-06", extract currency and use last rate per ccy
    const forwardRates: Record<string, number> = {};
    if (calcResult) {
      const plan = calcResult.hedge_plan as { buckets?: Array<{ bucket: string; forward_rate: number }> } | undefined;
      if (plan?.buckets) {
        for (const b of plan.buckets) {
          if (b.forward_rate && b.forward_rate !== 0) {
            // Bucket format: "EUR 2026-06" or "2026-06"
            const parts = b.bucket.split(" ");
            const ccy = parts.length > 1 ? parts[0] : null;
            if (ccy) {
              forwardRates[ccy] = b.forward_rate;
            }
          }
        }
      }
    }
    return computeAllTickets(positions, Object.keys(forwardRates).length > 0 ? forwardRates : undefined);
  }, [positions, calcResult]);

  /* ── Summary metrics ───────────────────────────────────────────────── */
  const contractSummary = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tickets) {
      if (t.instrumentType === "FUTURES" && t.contracts > 0) {
        map.set(t.symbol, (map.get(t.symbol) ?? 0) + t.contracts);
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1]);
  }, [tickets]);

  const totalNotionalCovered = useMemo(
    () => tickets.reduce((s, t) => s + t.totalCovered, 0),
    [tickets],
  );

  const totalResidual = useMemo(
    () => tickets.reduce((s, t) => s + t.residual, 0),
    [tickets],
  );

  const totalFriction = useMemo(
    () => tickets.reduce((s, t) => s + t.estimatedCostUsd, 0),
    [tickets],
  );

  /* ── Build IBKR JSON ───────────────────────────────────────────────── */
  const buildIbkrPayload = useCallback(() => {
    const orders = tickets.map((t) => ({
      msgType: "D" as const,
      clOrdID: `ORDR_${t.recordId}_${Date.now()}`,
      symbol: t.instrumentType === "FUTURES" ? t.symbol : `${t.currency}/USD`,
      side: t.side === "SELL" ? "2" : "1",
      orderQty: t.instrumentType === "FUTURES" ? t.contracts : t.notional,
      ordType: "2" as const,
      price: t.estimatedRate,
      timeInForce: "1" as const,
      account: "DU1234567",
      currency: "USD",
      transactTime: new Date().toISOString(),
      text: `ORDR Terminal: ${t.side} ${t.instrumentType === "FUTURES" ? `${t.contracts}\u00D7${t.symbol}` : `${fmtNum.format(t.notional)} ${t.currency} NDF`} ${t.currency} hedge, settle ${t.settlementMonth}`,
    }));

    return {
      orders,
      metadata: {
        generatedAt: new Date().toISOString(),
        generatedBy: "demo@ordr-terminal",
        totalOrders: orders.length,
        totalContracts: tickets.reduce((s, t) => s + t.contracts, 0),
        runId,
      },
    };
  }, [tickets, runId]);

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

  /* ── Execute ───────────────────────────────────────────────────────── */
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
        setExecMessage(
          `Marking positions ready... (${i + 1}/${positions.length})`,
        );
        setExecProgress(i + 1);

        try {
          // Use first run_id if multiple (per-currency calculations produce multiple)
          const effectiveRunId = runId.includes(";") ? runId.split(";")[0] : runId;
          const result = await markReadyToExecute(
            pos.id,
            effectiveRunId,
            ticket ? ticket.totalCovered : Math.abs(pos.amount),
            ticket ? ticket.estimatedRate : undefined,
            token,
          );
          updated.set(pos.id, result);
        } catch (err: unknown) {
          // In demo mode, continue on error (position may already be transitioned)
          if (!skipApproval) throw err;
          updated.set(pos.id, { ...pos, execution_status: "READY_TO_EXECUTE" });
        }
      }

      setUpdatedPositions(updated);
      setExecMessage("Done \u2713");
      setExecPhase("done");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Execution failed";
      setExecError(msg);
      setExecPhase("error");
    }
  }, [positions, tickets, runId, token, skipApproval]);

  /* ── Ticket card border color ──────────────────────────────────────── */
  function ticketBorderColor(ticket: FuturesTicket): string {
    if (ticket.instrumentType !== "FUTURES") return S.cyan;
    return ticket.side === "SELL" ? S.amber : S.pass;
  }

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        fontFamily: S.fontUI,
        color: S.primary,
      }}
    >
      {/* ═══ Success banner ═══ */}
      {execPhase === "done" && (
        <div
          style={{
            padding: "14px 16px",
            background: "rgba(34,197,94,0.08)",
            borderBottom: `1px solid ${S.pass}`,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: S.pass,
            }}
          >
            EXECUTION COMPLETE &mdash; {positions.length} position
            {positions.length !== 1 ? "s" : ""} processed
          </span>
          <button
            onClick={downloadIbkr}
            style={{
              height: 32,
              padding: "0 16px",
              background: "transparent",
              color: S.cyan,
              border: `1px solid ${S.cyan}`,
              borderRadius: 4,
              fontFamily: S.fontMono,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.06em",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            &darr; DOWNLOAD IBKR TICKET (JSON)
          </button>
        </div>
      )}

      {/* ═══ Error banner ═══ */}
      {execPhase === "error" && execError && (
        <div
          style={{
            padding: "12px 16px",
            background: "rgba(239,68,68,0.08)",
            borderBottom: `1px solid ${S.fail}`,
            flexShrink: 0,
            fontFamily: S.fontMono,
            fontSize: 11,
            color: S.fail,
          }}
        >
          ERROR: {execError}
        </div>
      )}

      {/* ═══ Main content (scrollable) ═══ */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {/* ─── Section 1: Contract Tickets ─── */}
        <div style={{ padding: "12px 16px 0" }}>
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.12em",
              color: S.tertiary,
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            CONTRACT TICKETS ({tickets.length})
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tickets.map((ticket, i) => {
              const isFutures = ticket.instrumentType === "FUTURES";
              const borderColor = ticketBorderColor(ticket);
              const posUpdated = updatedPositions.get(ticket.positionId);

              return (
                <div
                  key={i}
                  style={{
                    background: S.bgSub,
                    border: `1px solid ${S.soft}`,
                    borderLeft: `4px solid ${borderColor}`,
                    borderRadius: 4,
                    padding: "14px 16px",
                    position: "relative",
                  }}
                >
                  {/* Top line: SIDE + contracts + symbol + name */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 10,
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        color: ticket.side === "SELL" ? S.fail : S.pass,
                      }}
                    >
                      {ticket.side}
                    </span>
                    {isFutures && ticket.contracts > 0 && (
                      <span
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 24,
                          fontWeight: 800,
                          color: S.primary,
                          lineHeight: 1,
                        }}
                      >
                        {ticket.contracts}
                      </span>
                    )}
                    {isFutures && ticket.contracts > 0 && (
                      <span
                        style={{
                          fontFamily: S.fontMono,
                          fontSize: 14,
                          fontWeight: 600,
                          color: S.secondary,
                        }}
                      >
                        &times; {ticket.symbol}
                      </span>
                    )}
                    <span
                      style={{
                        fontFamily: S.fontUI,
                        fontSize: 13,
                        color: S.secondary,
                      }}
                    >
                      {ticket.contractName}
                    </span>

                    {/* OTC badge */}
                    {!isFutures && (
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 3,
                          fontSize: 8,
                          fontFamily: S.fontMono,
                          fontWeight: 700,
                          letterSpacing: "0.08em",
                          background: "rgba(0,255,255,0.10)",
                          color: S.cyan,
                          border: `1px solid ${S.cyan}`,
                        }}
                      >
                        VIA OTC COUNTERPARTY
                      </span>
                    )}
                  </div>

                  {/* Second line: rate, month, exchange */}
                  <div
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 11,
                      color: S.tertiary,
                      marginBottom: 10,
                    }}
                  >
                    @ {fmtDec.format(ticket.estimatedRate)}
                    {" \u00B7 "}
                    {ticket.settlementMonth}
                    {" \u00B7 "}
                    {ticket.exchange}
                  </div>

                  {/* Divider */}
                  <div
                    style={{
                      height: 1,
                      background: S.soft,
                      marginBottom: 10,
                    }}
                  />

                  {/* Detail line */}
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 16,
                      fontFamily: S.fontMono,
                      fontSize: 10,
                      color: S.secondary,
                      lineHeight: 1.6,
                    }}
                  >
                    {isFutures && (
                      <span>
                        {fmtNum.format(ticket.contractSize)} {ticket.currency}
                        /contract
                      </span>
                    )}
                    {isFutures && (
                      <>
                        <span style={{ color: S.soft }}>&middot;</span>
                        <span>
                          Covers:{" "}
                          <span style={{ color: S.primary, fontWeight: 600 }}>
                            {fmtNum.format(ticket.totalCovered)} {ticket.currency}
                          </span>
                        </span>
                      </>
                    )}
                    {!isFutures && (
                      <span>
                        Notional:{" "}
                        <span style={{ color: S.primary, fontWeight: 600 }}>
                          {fmtNum.format(ticket.notional)} {ticket.currency}
                        </span>
                      </span>
                    )}
                    <span style={{ color: S.soft }}>&middot;</span>
                    <span>
                      Residual:{" "}
                      <span
                        style={{
                          color: ticket.residual > 0 ? S.amber : S.pass,
                          fontWeight: 600,
                        }}
                      >
                        {fmtNum.format(ticket.residual)} {ticket.currency}
                      </span>
                    </span>
                    <span style={{ color: S.soft }}>&middot;</span>
                    <span>
                      Entity:{" "}
                      <span style={{ color: S.primary }}>{ticket.entity}</span>
                    </span>
                    <span style={{ color: S.soft }}>&middot;</span>
                    <span>
                      Position:{" "}
                      <span style={{ color: S.primary }}>
                        {ticket.recordId}
                      </span>
                    </span>
                    {ticket.estimatedCostUsd > 0 && (
                      <>
                        <span style={{ color: S.soft }}>&middot;</span>
                        <span>
                          Est. Cost:{" "}
                          <span style={{ color: S.amber }}>
                            {fmtUsd.format(ticket.estimatedCostUsd)}
                          </span>
                        </span>
                      </>
                    )}
                  </div>

                  {/* Updated status badge (post-execution) */}
                  {posUpdated && (
                    <div
                      style={{
                        position: "absolute",
                        top: 12,
                        right: 16,
                        padding: "3px 8px",
                        borderRadius: 3,
                        fontFamily: S.fontMono,
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        background: "rgba(34,197,94,0.12)",
                        color: S.pass,
                        border: `1px solid ${S.pass}`,
                      }}
                    >
                      {posUpdated.execution_status}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ─── Section 2: Execution Summary ─── */}
        <div
          style={{
            margin: "16px 16px 0",
            padding: "14px 16px",
            background: S.bgSub,
            border: `1px solid ${S.soft}`,
            borderRadius: 4,
          }}
        >
          <div
            style={{
              fontFamily: S.fontMono,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: "0.12em",
              color: S.tertiary,
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            EXECUTION SUMMARY
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 24,
              alignItems: "baseline",
            }}
          >
            {/* Contracts by symbol */}
            <div>
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 8,
                  fontWeight: 600,
                  letterSpacing: "0.10em",
                  color: S.tertiary,
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                Contracts
              </div>
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 14,
                  fontWeight: 700,
                  color: S.primary,
                }}
              >
                {contractSummary.length > 0
                  ? contractSummary
                      .map(([sym, count]) => `${sym}: ${count}`)
                      .join(" \u00B7 ")
                  : "OTC only"}
              </div>
            </div>

            {/* Total notional */}
            <div>
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 8,
                  fontWeight: 600,
                  letterSpacing: "0.10em",
                  color: S.tertiary,
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                Notional Covered
              </div>
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 14,
                  fontWeight: 700,
                  color: S.primary,
                }}
              >
                {fmtNum.format(totalNotionalCovered)}
              </div>
            </div>

            {/* Friction */}
            <div>
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 8,
                  fontWeight: 600,
                  letterSpacing: "0.10em",
                  color: S.tertiary,
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                Est. Friction
              </div>
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 14,
                  fontWeight: 700,
                  color: totalFriction > 0 ? S.amber : S.tertiary,
                }}
              >
                {fmtUsd.format(totalFriction)}
              </div>
            </div>

            {/* Residual */}
            <div>
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 8,
                  fontWeight: 600,
                  letterSpacing: "0.10em",
                  color: S.tertiary,
                  textTransform: "uppercase",
                  marginBottom: 4,
                }}
              >
                Residual (Unhedged)
              </div>
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 14,
                  fontWeight: 700,
                  color: totalResidual > 0 ? S.amber : S.pass,
                }}
              >
                {fmtNum.format(totalResidual)}
              </div>
            </div>
          </div>
        </div>

        {/* ─── Section 3: Execution Controls ─── */}
        <div
          style={{
            margin: "16px 16px 16px",
            padding: "14px 16px",
            background: S.bgPanel,
            border: `1px solid ${S.rim}`,
            borderRadius: 4,
          }}
        >
          {execPhase === "idle" && (
            <>
              {/* Skip 4-eyes checkbox */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 14,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={skipApproval}
                  onChange={(e) => setSkipApproval(e.target.checked)}
                  style={{ accentColor: S.cyan, cursor: "pointer" }}
                />
                <span
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 11,
                    color: S.secondary,
                  }}
                >
                  Skip 4-eyes approval (demo mode)
                </span>
              </label>

              {/* Execute button */}
              <button
                onClick={handleExecute}
                style={{
                  height: 48,
                  padding: "0 40px",
                  background: S.pass,
                  color: S.bgDeep,
                  border: "none",
                  borderRadius: 4,
                  fontFamily: S.fontMono,
                  fontSize: 14,
                  fontWeight: 800,
                  letterSpacing: "0.10em",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                CONFIRM EXECUTION
              </button>
            </>
          )}

          {execPhase === "executing" && (
            <div>
              <div
                style={{
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  fontWeight: 600,
                  color: S.cyan,
                  letterSpacing: "0.06em",
                  marginBottom: 8,
                }}
              >
                {execMessage}
              </div>
              <div
                style={{
                  height: 4,
                  borderRadius: 2,
                  background: S.bgDeep,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width:
                      execTotal > 0
                        ? `${(execProgress / execTotal) * 100}%`
                        : "0%",
                    borderRadius: 2,
                    background: S.cyan,
                    transition: "width 0.2s ease",
                  }}
                />
              </div>
            </div>
          )}

          {execPhase === "done" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <button
                onClick={downloadIbkr}
                style={{
                  height: 40,
                  padding: "0 20px",
                  background: "transparent",
                  color: S.cyan,
                  border: `1px solid ${S.cyan}`,
                  borderRadius: 4,
                  fontFamily: S.fontMono,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                &darr; DOWNLOAD IBKR TICKET
              </button>
              <button
                onClick={onComplete}
                style={{
                  height: 40,
                  padding: "0 20px",
                  background: S.cyan,
                  color: S.bgDeep,
                  border: "none",
                  borderRadius: 4,
                  fontFamily: S.fontMono,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                VIEW POSITIONS &rarr;
              </button>
            </div>
          )}

          {execPhase === "error" && (
            <button
              onClick={handleExecute}
              style={{
                height: 40,
                padding: "0 24px",
                background: S.amber,
                color: S.bgDeep,
                border: "none",
                borderRadius: 4,
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.08em",
                cursor: "pointer",
              }}
            >
              RETRY EXECUTION
            </button>
          )}
        </div>
      </div>

      {/* ═══ Footer: navigation ═══ */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 56,
          padding: "0 16px",
          background: S.bgPanel,
          borderTop: `1px solid ${S.rim}`,
          flexShrink: 0,
          marginTop: "auto",
        }}
      >
        <button
          onClick={onBack}
          disabled={execPhase === "executing"}
          style={{
            height: 36,
            padding: "0 20px",
            background: "transparent",
            color: execPhase === "executing" ? S.soft : S.tertiary,
            border: `1px solid ${S.soft}`,
            borderRadius: 4,
            fontFamily: S.fontMono,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.08em",
            cursor: execPhase === "executing" ? "not-allowed" : "pointer",
            transition: "all 0.15s",
          }}
        >
          &#9666; BACK TO RISK CHECK
        </button>
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 10,
            color: S.tertiary,
            letterSpacing: "0.06em",
          }}
        >
          RUN: {runId.slice(0, 12)}...
        </span>
      </div>
    </div>
  );
}
