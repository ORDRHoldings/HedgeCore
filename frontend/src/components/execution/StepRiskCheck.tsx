"use client";

import { useState, useEffect, useCallback } from "react";
import type { PositionRow } from "@/api/positionClient";
import {
  runMonteCarloSimulation,
  calculatePortfolioRisk,
  performComplianceChecks,
  runStressTest,
  type MonteCarloResult,
  type PortfolioRisk,
  type ComplianceCheck,
  type PortfolioStressResult,
} from "@/utils/executionAnalytics";

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
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const fmtPct = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/* ── Props ─────────────────────────────────────────────────────────────── */
interface Props {
  positions: PositionRow[];
  calcResult: Record<string, unknown> | null;
  token: string;
  runId: string | null;
  onPass: (
    checks: ComplianceCheck[],
    stressResults: PortfolioStressResult | null,
    portfolioRisk: PortfolioRisk | null,
    riskDecisionHash: string | null,
    riskVerdict: string | null,
  ) => void;
  onBack: () => void;
}

/* ── Progress phases ───────────────────────────────────────────────────── */
type Phase = "idle" | "compliance" | "montecarlo" | "portfolio" | "stress" | "done";

const PHASE_LABELS: Record<Phase, string> = {
  idle: "Initializing...",
  compliance: "Running compliance checks...",
  montecarlo: "Running Monte Carlo simulation...",
  portfolio: "Calculating portfolio risk...",
  stress: "Running stress test...",
  done: "All checks complete",
};

/* ── Component ─────────────────────────────────────────────────────────── */
export default function StepRiskCheck({
  positions,
  calcResult,
  token,
  runId,
  onPass,
  onBack,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [stepIndex, setStepIndex] = useState(0);

  const [complianceChecks, setComplianceChecks] = useState<ComplianceCheck[]>([]);
  const [mcResults, setMcResults] = useState<Map<string, MonteCarloResult>>(new Map());
  const [portfolioRisk, setPortfolioRisk] = useState<PortfolioRisk | null>(null);
  const [stressResults, setStressResults] = useState<PortfolioStressResult | null>(null);
  const [backendVerdict, setBackendVerdict] = useState<"APPROVE" | "APPROVE_WITH_CONDITIONS" | "REJECT" | null>(null);
  const [riskDecisionHash, setRiskDecisionHash] = useState<string | null>(null);
  const [backendCheckError, setBackendCheckError] = useState<string | null>(null);

  /* ── Run all checks sequentially on mount ─────────────────────────── */
  useEffect(() => {
    let cancelled = false;

    async function runAll() {
      // Step 1: Compliance
      setPhase("compliance");
      setStepIndex(1);
      await delay(300); // brief pause for UI feedback
      if (cancelled) return;
      const checks = performComplianceChecks(positions);
      setComplianceChecks(checks);

      // Step 2: Monte Carlo per position
      setPhase("montecarlo");
      setStepIndex(2);
      await delay(200);
      if (cancelled) return;
      const mcMap = new Map<string, MonteCarloResult>();
      for (const pos of positions) {
        if (cancelled) return;
        const result = runMonteCarloSimulation(pos, 10000, 30);
        mcMap.set(pos.id, result);
      }
      setMcResults(mcMap);

      // Step 3: Portfolio risk
      setPhase("portfolio");
      setStepIndex(3);
      await delay(200);
      if (cancelled) return;
      const pRisk = calculatePortfolioRisk(positions, mcMap);
      setPortfolioRisk(pRisk);

      // Step 4: Stress test
      setPhase("stress");
      setStepIndex(4);
      await delay(200);
      if (cancelled) return;
      const stress = runStressTest(positions, {
        id: "em_crisis",
        name: "EM Currency Crisis",
        description: "Emerging market stress: MXN/BRL/TRY down 25%",
        shocks: [
          { currency: "MXN", change: -0.25 },
          { currency: "BRL", change: -0.25 },
          { currency: "TRY", change: -0.25 },
        ],
      });
      setStressResults(stress);

      // Step 5: Backend risk-check gate (governance enforcement)
      if (token) {
        try {
          // Extract actual spot rates from calcResult if available
          const marketSnapshot: Record<string, number> = {};
          if (calcResult?.market_snapshot && typeof calcResult.market_snapshot === 'object') {
            const ms = calcResult.market_snapshot as Record<string, unknown>;
            const spot = ms.spot_rate;
            if (typeof spot === 'number' && spot > 0) {
              const pCcy = (ms.provider_metadata as Record<string, unknown>)?.primary_currency;
              const ccy = typeof pCcy === 'string' ? pCcy : positions[0]?.currency ?? 'MXN';
              marketSnapshot[`${ccy}USD`] = spot;
            }
          }
          // Fallback: use position currencies with placeholder if no real data
          if (Object.keys(marketSnapshot).length === 0) {
            for (const p of positions) {
              if (p.currency && !marketSnapshot[`${p.currency}USD`]) {
                marketSnapshot[`${p.currency}USD`] = 1;
              }
            }
          }

          const body: Record<string, unknown> = {
            position_ids: positions.map((p) => p.id),
            market_snapshot: marketSnapshot,
          };

          // Pass actual hedge plan from Step 2
          if (calcResult?.hedge_plan && typeof calcResult.hedge_plan === 'object') {
            body.hedge_plan = calcResult.hedge_plan;
          }

          // Include policy_instance_id if available
          const policyId = (positions[0] as { policy_id?: string | null })?.policy_id;
          if (policyId) body.policy_instance_id = policyId;
          // Use only the primary run_id (strip semicolons for multi-currency)
          if (runId) body.run_id = runId.includes(';') ? runId.split(';')[0] : runId;

          const { dashboardFetch } = await import("@/lib/api/dashboardClient");
          const res = await dashboardFetch("/v1/risk-check", token, {
            method: "POST",
            body: JSON.stringify(body),
          });
          if (res.ok) {
            const data = await res.json() as { verdict: string; decision_hash: string };
            setBackendVerdict(data.verdict as "APPROVE" | "APPROVE_WITH_CONDITIONS" | "REJECT");
            setRiskDecisionHash(data.decision_hash ?? null);
          } else {
            // Non-fatal: log but don't block (graceful degradation)
            setBackendCheckError(`Backend risk-check returned ${res.status}`);
          }
        } catch (e) {
          setBackendCheckError(e instanceof Error ? e.message : "Backend risk-check unavailable");
        }
      }

      // Done
      setPhase("done");
    }

    runAll();
    return () => { cancelled = true; };
  }, [positions, token, runId, calcResult]);

  /* ── Derived gate status ──────────────────────────────────────────── */
  const criticalFails = complianceChecks.filter(
    (c) => c.status === "FAIL" && c.critical,
  );
  const backendRejected = backendVerdict === "REJECT";
  const allPassed = phase === "done" && criticalFails.length === 0 && !backendRejected;
  const hasFails = phase === "done" && (criticalFails.length > 0 || backendRejected);

  /* ── Worst position by VaR ────────────────────────────────────────── */
  const worstByVaR = (() => {
    if (mcResults.size === 0) return null;
    let worst: MonteCarloResult | null = null;
    for (const r of mcResults.values()) {
      if (!worst || r.var95 < worst.var95) worst = r;
    }
    return worst;
  })();

  /* ── Handle proceed ───────────────────────────────────────────────── */
  const handleProceed = useCallback(() => {
    onPass(complianceChecks, stressResults, portfolioRisk, riskDecisionHash, backendVerdict);
  }, [onPass, complianceChecks, stressResults, portfolioRisk, riskDecisionHash, backendVerdict]);

  /* ── Status icon helper ───────────────────────────────────────────── */
  function statusIcon(status: ComplianceCheck["status"]): string {
    switch (status) {
      case "PASS": return "\u2713";
      case "FAIL": return "\u2717";
      case "WARN": return "\u26A0";
    }
  }

  function statusColor(status: ComplianceCheck["status"]): string {
    switch (status) {
      case "PASS": return S.pass;
      case "FAIL": return S.fail;
      case "WARN": return S.amber;
    }
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
      {/* ═══ Progress bar ═══ */}
      {phase !== "done" && (
        <div
          style={{
            padding: "12px 16px",
            background: S.bgSub,
            borderBottom: `1px solid ${S.rim}`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.06em",
                color: S.cyan,
              }}
            >
              {PHASE_LABELS[phase]}
            </span>
            <span
              style={{
                fontFamily: S.fontMono,
                fontSize: 12,
                color: S.tertiary,
              }}
            >
              {stepIndex}/4
            </span>
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
                width: `${(stepIndex / 4) * 100}%`,
                borderRadius: 2,
                background: S.cyan,
                transition: "width 0.3s ease",
              }}
            />
          </div>
        </div>
      )}

      {/* ═══ Gate banner ═══ */}
      {phase === "done" && (
        <div
          style={{
            padding: "14px 16px",
            background: allPassed
              ? "rgba(34,197,94,0.08)"
              : "rgba(239,68,68,0.08)",
            borderBottom: `1px solid ${allPassed ? S.pass : S.fail}`,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: allPassed ? S.pass : S.fail,
            }}
          >
            {allPassed
              ? "ALL RISK GATES PASSED \u2713"
              : `${criticalFails.length} RISK GATE(S) FAILED \u2717`}
          </span>
        </div>
      )}

      {/* ═══ Main content (scrollable) ═══ */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {/* ─── 2-column top grid ─── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 0,
          }}
        >
          {/* ─── Top-left: Compliance Gates ─── */}
          <div
            style={{
              borderRight: `1px solid ${S.rim}`,
              borderBottom: `1px solid ${S.rim}`,
            }}
          >
            <div
              style={{
                padding: "12px 16px 8px",
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.12em",
                color: S.tertiary,
                textTransform: "uppercase",
              }}
            >
              PRE-FLIGHT COMPLIANCE
            </div>

            {complianceChecks.length === 0 ? (
              <div
                style={{
                  padding: "20px 16px",
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  color: S.tertiary,
                  letterSpacing: "0.06em",
                }}
              >
                Waiting...
              </div>
            ) : (
              <div>
                {/* Header row */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 80px 2fr",
                    alignItems: "center",
                    height: 28,
                    padding: "0 16px",
                    background: S.bgSub,
                    borderBottom: `1px solid ${S.soft}`,
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    color: S.tertiary,
                    textTransform: "uppercase",
                  }}
                >
                  <span>CHECK</span>
                  <span style={{ textAlign: "center" }}>STATUS</span>
                  <span>MESSAGE</span>
                </div>
                {complianceChecks.map((check, i) => (
                  <div
                    key={i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 80px 2fr",
                      alignItems: "center",
                      minHeight: 34,
                      padding: "4px 16px",
                      borderBottom: `1px solid ${S.soft}`,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        fontWeight: 600,
                        color: S.primary,
                      }}
                    >
                      {check.checkName}
                    </span>
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        fontWeight: 700,
                        textAlign: "center",
                        color: statusColor(check.status),
                        letterSpacing: "0.06em",
                      }}
                    >
                      {statusIcon(check.status)} {check.status}
                    </span>
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        color: S.secondary,
                        lineHeight: 1.4,
                      }}
                    >
                      {check.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ─── Top-right: Risk Metrics ─── */}
          <div style={{ borderBottom: `1px solid ${S.rim}` }}>
            <div
              style={{
                padding: "12px 16px 8px",
                fontFamily: S.fontMono,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.12em",
                color: S.tertiary,
                textTransform: "uppercase",
              }}
            >
              PORTFOLIO RISK METRICS
            </div>

            {!portfolioRisk ? (
              <div
                style={{
                  padding: "20px 16px",
                  fontFamily: S.fontMono,
                  fontSize: 12,
                  color: S.tertiary,
                  letterSpacing: "0.06em",
                }}
              >
                Waiting...
              </div>
            ) : (
              <>
                {/* KPI grid 2×2 */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 1,
                    padding: "0 16px 12px",
                  }}
                >
                  {/* VaR 95% */}
                  <div
                    style={{
                      padding: "10px 12px",
                      background: S.bgSub,
                      borderRadius: 4,
                      marginRight: 4,
                      marginBottom: 4,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: "0.10em",
                        color: S.tertiary,
                        textTransform: "uppercase",
                        marginBottom: 4,
                      }}
                    >
                      VaR 95%
                    </div>
                    <div
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 18,
                        fontWeight: 700,
                        color: S.amber,
                        lineHeight: 1.1,
                      }}
                    >
                      {fmtNum.format(Math.abs(portfolioRisk.totalVar95))}
                    </div>
                  </div>

                  {/* CVaR 95% */}
                  <div
                    style={{
                      padding: "10px 12px",
                      background: S.bgSub,
                      borderRadius: 4,
                      marginLeft: 4,
                      marginBottom: 4,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: "0.10em",
                        color: S.tertiary,
                        textTransform: "uppercase",
                        marginBottom: 4,
                      }}
                    >
                      CVaR 95%
                    </div>
                    <div
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 18,
                        fontWeight: 700,
                        color: S.fail,
                        lineHeight: 1.1,
                      }}
                    >
                      {fmtNum.format(Math.abs(portfolioRisk.totalCVar95))}
                    </div>
                  </div>

                  {/* Concentration Index (HHI) */}
                  <div
                    style={{
                      padding: "10px 12px",
                      background: S.bgSub,
                      borderRadius: 4,
                      marginRight: 4,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: "0.10em",
                        color: S.tertiary,
                        textTransform: "uppercase",
                        marginBottom: 4,
                      }}
                    >
                      Concentration (HHI)
                    </div>
                    <div
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 18,
                        fontWeight: 700,
                        color:
                          portfolioRisk.concentrationRisk > 50
                            ? S.amber
                            : S.pass,
                        lineHeight: 1.1,
                      }}
                    >
                      {fmtDec.format(portfolioRisk.concentrationRisk)}%
                    </div>
                  </div>

                  {/* Diversification Benefit */}
                  <div
                    style={{
                      padding: "10px 12px",
                      background: S.bgSub,
                      borderRadius: 4,
                      marginLeft: 4,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: "0.10em",
                        color: S.tertiary,
                        textTransform: "uppercase",
                        marginBottom: 4,
                      }}
                    >
                      Diversification
                    </div>
                    <div
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 18,
                        fontWeight: 700,
                        color: S.pass,
                        lineHeight: 1.1,
                      }}
                    >
                      {fmtPct.format(portfolioRisk.diversificationBenefit)}%
                    </div>
                  </div>
                </div>

                {/* Worst position */}
                {worstByVaR && (
                  <div
                    style={{
                      padding: "8px 16px 12px",
                      fontFamily: S.fontMono,
                      fontSize: 12,
                      color: S.tertiary,
                    }}
                  >
                    Worst position:{" "}
                    <span style={{ color: S.primary, fontWeight: 600 }}>
                      {worstByVaR.recordId}
                    </span>
                    {" "}({worstByVaR.currency}) VaR95:{" "}
                    <span style={{ color: S.fail, fontWeight: 600 }}>
                      {fmtNum.format(Math.abs(worstByVaR.var95))}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ─── Bottom: Stress Test (full width) ─── */}
        <div style={{ padding: "0 0 16px" }}>
          <div
            style={{
              padding: "12px 16px 8px",
              fontFamily: S.fontMono,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.12em",
              color: S.tertiary,
              textTransform: "uppercase",
            }}
          >
            WORST-CASE SCENARIO: EM CURRENCY CRISIS
          </div>

          {!stressResults ? (
            <div
              style={{
                padding: "20px 16px",
                fontFamily: S.fontMono,
                fontSize: 12,
                color: S.tertiary,
                letterSpacing: "0.06em",
              }}
            >
              Waiting...
            </div>
          ) : (
            <>
              {/* Portfolio-level impact */}
              <div
                style={{
                  display: "flex",
                  gap: 24,
                  padding: "8px 16px 12px",
                  alignItems: "baseline",
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: "0.10em",
                      color: S.tertiary,
                      textTransform: "uppercase",
                      marginBottom: 4,
                    }}
                  >
                    Portfolio P&L Impact
                  </div>
                  <div
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 22,
                      fontWeight: 700,
                      color: stressResults.totalImpact < 0 ? S.fail : S.pass,
                      lineHeight: 1.1,
                    }}
                  >
                    {stressResults.totalImpact < 0 ? "-" : "+"}
                    {fmtNum.format(Math.abs(stressResults.totalImpact))}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: "0.10em",
                      color: S.tertiary,
                      textTransform: "uppercase",
                      marginBottom: 4,
                    }}
                  >
                    % Change
                  </div>
                  <div
                    style={{
                      fontFamily: S.fontMono,
                      fontSize: 22,
                      fontWeight: 700,
                      color:
                        stressResults.percentageImpact < 0 ? S.fail : S.pass,
                      lineHeight: 1.1,
                    }}
                  >
                    {fmtDec.format(stressResults.percentageImpact)}%
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    color: S.tertiary,
                  }}
                >
                  {stressResults.affectedPositions} of{" "}
                  {stressResults.totalPositions} positions affected
                </div>
              </div>

              {/* Per-currency impact table */}
              <div style={{ padding: "0 16px" }}>
                {/* Header */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "100px 100px 80px 1fr 100px",
                    alignItems: "center",
                    height: 28,
                    padding: "0 8px",
                    background: S.bgSub,
                    borderBottom: `1px solid ${S.rim}`,
                    fontFamily: S.fontMono,
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    color: S.tertiary,
                    textTransform: "uppercase",
                  }}
                >
                  <span>RECORD</span>
                  <span>CCY</span>
                  <span style={{ textAlign: "right" }}>SHOCK</span>
                  <span style={{ textAlign: "right" }}>P&L IMPACT</span>
                  <span style={{ textAlign: "right" }}>% IMPACT</span>
                </div>
                {stressResults.results.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "100px 100px 80px 1fr 100px",
                      alignItems: "center",
                      height: 30,
                      padding: "0 8px",
                      borderBottom: `1px solid ${S.soft}`,
                      opacity: r.shocked ? 1 : 0.5,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        color: S.secondary,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.recordId}
                    </span>
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        fontWeight: 600,
                        color: S.primary,
                      }}
                    >
                      {r.currency}
                      {r.shocked && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 12,
                            fontWeight: 700,
                            padding: "1px 4px",
                            borderRadius: 2,
                            background: "rgba(239,68,68,0.12)",
                            color: S.fail,
                          }}
                        >
                          SHOCKED
                        </span>
                      )}
                    </span>
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        textAlign: "right",
                        color: r.shocked ? S.fail : S.tertiary,
                      }}
                    >
                      {r.shocked
                        ? `${((r.stressedValue / r.baseValue - 1) * 100).toFixed(0)}%`
                        : "\u2014"}
                    </span>
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        fontWeight: 600,
                        textAlign: "right",
                        color: r.pnlImpact < 0 ? S.fail : r.pnlImpact > 0 ? S.pass : S.tertiary,
                      }}
                    >
                      {r.pnlImpact < 0 ? "-" : r.pnlImpact > 0 ? "+" : ""}
                      {fmtNum.format(Math.abs(r.pnlImpact))}
                    </span>
                    <span
                      style={{
                        fontFamily: S.fontMono,
                        fontSize: 12,
                        textAlign: "right",
                        color: r.percentageImpact < 0 ? S.fail : r.percentageImpact > 0 ? S.pass : S.tertiary,
                      }}
                    >
                      {fmtDec.format(r.percentageImpact)}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ═══ Footer: CTA buttons ═══ */}
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
          style={{
            height: 36,
            padding: "0 20px",
            background: "transparent",
            color: S.tertiary,
            border: `1px solid ${S.soft}`,
            borderRadius: 4,
            fontFamily: S.fontMono,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.08em",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          &#9666; BACK TO CALCULATION
        </button>
        {/* Backend risk verdict */}
        {phase === "done" && (
          <div style={{ fontFamily: S.fontMono, fontSize: 12, color: backendVerdict === "REJECT" ? S.fail : backendVerdict === "APPROVE" ? S.pass : S.amber, marginRight: "auto", display: "flex", alignItems: "center", gap: 4 }}>
            {backendCheckError ? (
              <span style={{ color: S.amber }}>&#9888; GATE: OFFLINE (client-only)</span>
            ) : backendVerdict ? (
              <span>GATE: {backendVerdict === "APPROVE" ? "✓ APPROVED" : backendVerdict === "APPROVE_WITH_CONDITIONS" ? "⚠ APPROVED WITH CONDITIONS" : "✗ REJECTED"}</span>
            ) : (
              <span style={{ color: S.tertiary }}>GATE: CHECKING...</span>
            )}
          </div>
        )}
        <button
          disabled={phase !== "done" || hasFails}
          onClick={handleProceed}
          style={{
            height: 36,
            padding: "0 24px",
            background:
              phase === "done" && !hasFails ? S.cyan : S.bgSub,
            color:
              phase === "done" && !hasFails ? S.bgDeep : S.tertiary,
            border: "none",
            borderRadius: 4,
            fontFamily: S.fontMono,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.10em",
            cursor:
              phase === "done" && !hasFails
                ? "pointer"
                : "not-allowed",
            opacity: phase === "done" && !hasFails ? 1 : 0.5,
            transition: "all 0.15s",
          }}
        >
          GENERATE TICKETS &#9656;
        </button>
      </div>
    </div>
  );
}

/* ── Util ──────────────────────────────────────────────────────────────── */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
