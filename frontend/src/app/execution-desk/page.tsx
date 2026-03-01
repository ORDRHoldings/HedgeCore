"use client";

/**
 * /execution-desk — 4-Step Execution Pipeline
 *
 * ORDR Terminal's institutional hedge execution workflow.
 * Converts policy-assigned positions into IBKR-ready futures contract tickets.
 *
 * Pipeline:
 *   Step 1: REVIEW     — Select positions to hedge
 *   Step 2: CALCULATE  — Run hedge engine, review plan
 *   Step 3: RISK CHECK — Compliance gates, VaR, stress test
 *   Step 4: EXECUTE    — Contract tickets, IBKR export, mark HEDGED
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { useAuth } from "@/lib/authContext";
import type { AppDispatch, RootState } from "@/lib/store";
import { listPositionsThunk } from "@/lib/store/slices/positionSlice";
import type { PositionRow } from "@/api/positionClient";
import type { CalculateResponse } from "@/api/types";
import type { ComplianceCheck, PortfolioRisk, PortfolioStressResult } from "@/utils/executionAnalytics";

import WorkflowBreadcrumb from "@/components/layout/WorkflowBreadcrumb";
import PipelineProgress from "@/components/execution/PipelineProgress";
import StepReview from "@/components/execution/StepReview";
import StepCalculate from "@/components/execution/StepCalculate";
import StepRiskCheck from "@/components/execution/StepRiskCheck";
import StepExecute from "@/components/execution/StepExecute";

import type { PipelineStep } from "@/lib/execution/pipelineState";

const S = {
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:    "var(--bg-deep)",
  bgPanel:   "var(--bg-panel)",
  rim:       "var(--border-rim)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
} as const;

export default function ExecutionDeskPage() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { user, token } = useAuth();

  const { positions, loading } = useSelector((s: RootState) => s.positions);

  // Pipeline state
  const [step, setStep] = useState<PipelineStep>(1);
  const [selectedPositions, setSelectedPositions] = useState<PositionRow[]>([]);
  const [calcResult, setCalcResult] = useState<CalculateResponse | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [riskDecisionHash, setRiskDecisionHash] = useState<string | null>(null);
  const [riskVerdict, setRiskVerdict] = useState<string | null>(null);

  // Load positions on mount
  useEffect(() => {
    if (token) dispatch(listPositionsThunk({ token }));
  }, [token, dispatch]);

  // Filter: POLICY_ASSIGNED and READY_TO_EXECUTE positions are both eligible for execution
  const readyPositions = useMemo(
    () => positions.filter(
      (p) => p.execution_status === "POLICY_ASSIGNED" || p.execution_status === "READY_TO_EXECUTE"
    ),
    [positions]
  );

  // Step 1 → 2: User selected positions
  const handleReviewProceed = useCallback((selected: PositionRow[]) => {
    setSelectedPositions(selected);
    setStep(2);
  }, []);

  // Step 2 → 3: Engine ran, plan approved
  const handleCalcApprove = useCallback((result: CalculateResponse, id: string) => {
    setCalcResult(result);
    setRunId(id);
    setStep(3);
  }, []);

  // Step 3 → 4: Risk checks passed
  const handleRiskPass = useCallback(
    (_checks: ComplianceCheck[], _stress: PortfolioStressResult | null, _risk: PortfolioRisk | null, decisionHash: string | null, verdict: string | null) => {
      setRiskDecisionHash(decisionHash);
      setRiskVerdict(verdict);
      setStep(4);
    },
    []
  );

  // Step 4 complete: Refresh positions and navigate to position desk
  const handleExecutionComplete = useCallback(() => {
    if (token) dispatch(listPositionsThunk({ token }));
    router.push('/position-desk');
  }, [token, dispatch, router]);

  // Navigate back between steps
  const goBack = useCallback(() => {
    setStep((s) => Math.max(1, s - 1) as PipelineStep);
  }, []);

  // Allow clicking completed steps in progress bar
  const handleStepClick = useCallback((target: PipelineStep) => {
    if (target < step) setStep(target);
  }, [step]);

  // Auth guard
  if (!user) {
    return (
      <div style={{ padding: 40, fontFamily: S.fontMono, color: S.secondary, fontSize: 12 }}>
        Authentication required.{" "}
        <button
          onClick={() => router.push("/auth/login")}
          style={{ color: S.primary, background: "none", border: "none", cursor: "pointer", fontFamily: S.fontMono }}
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: S.bgDeep, overflow: "hidden" }}>
      {/* Workflow breadcrumb: Position Desk → Policy Desk → Execution Desk */}
      <WorkflowBreadcrumb active="execution" />

      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          height: 44,
          flexShrink: 0,
          padding: "0 20px",
          background: S.bgPanel,
          borderBottom: `1px solid ${S.rim}`,
        }}
      >
        <button
          onClick={() => router.push("/dashboard")}
          style={{
            fontFamily: S.fontMono,
            fontSize: 10,
            color: S.tertiary,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          ← Dashboard
        </button>
        <span style={{ color: S.rim }}>|</span>
        <span
          style={{
            fontFamily: S.fontUI,
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: S.primary,
          }}
        >
          Execution Desk
        </span>
        <span
          style={{
            fontFamily: S.fontMono,
            fontSize: 9,
            color: S.cyan,
            border: `1px solid rgba(0,255,255,0.3)`,
            background: "rgba(0,255,255,0.06)",
            padding: "1px 5px",
            letterSpacing: "0.06em",
          }}
        >
          PIPELINE
        </span>
        {readyPositions.length > 0 && (
          <span
            style={{
              fontFamily: S.fontMono,
              fontSize: 9,
              fontWeight: 700,
              color: S.primary,
              background: "var(--bg-sub)",
              border: `1px solid #374151`,
              padding: "1px 7px",
              letterSpacing: "0.06em",
            }}
          >
            {readyPositions.length} READY
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary }}>
          {positions.length} total positions
        </span>
        <button
          onClick={() => token && dispatch(listPositionsThunk({ token }))}
          title="Refresh positions"
          style={{
            fontFamily: S.fontMono,
            fontSize: 10,
            color: S.primary,
            background: "transparent",
            border: `1px solid #374151`,
            padding: "2px 8px",
            cursor: "pointer",
          }}
        >
          ↻ Refresh
        </button>
      </header>

      {/* Pipeline progress indicator */}
      <PipelineProgress step={step} onStepClick={handleStepClick} />

      {/* Step content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {step === 1 && (
          <StepReview
            positions={readyPositions}
            loading={loading}
            onProceed={handleReviewProceed}
          />
        )}
        {step === 2 && token && (
          <StepCalculate
            positions={selectedPositions}
            token={token}
            onApprove={handleCalcApprove}
            onBack={goBack}
          />
        )}
        {step === 3 && token && (
          <StepRiskCheck
            positions={selectedPositions}
            calcResult={calcResult}
            token={token}
            runId={runId}
            onPass={handleRiskPass}
            onBack={goBack}
          />
        )}
        {step === 4 && token && runId && (
          <StepExecute
            positions={selectedPositions}
            calcResult={calcResult}
            runId={runId}
            token={token}
            riskDecisionHash={riskDecisionHash}
            riskVerdict={riskVerdict}
            onBack={goBack}
            onComplete={handleExecutionComplete}
          />
        )}
      </div>
    </div>
  );
}
