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
  pass:      "var(--status-pass,#22c55e)",
} as const;

// ── Inline step bar (replaces PipelineProgress import) ────────────────────────
const STEP_DEFS: { num: PipelineStep; label: string }[] = [
  { num: 1, label: "POSITION REVIEW" },
  { num: 2, label: "CALCULATE" },
  { num: 3, label: "RISK GATE" },
  { num: 4, label: "EXECUTE" },
];

interface StepBarProps {
  step: PipelineStep;
  onStepClick?: (s: PipelineStep) => void;
}

function StepBar({ step, onStepClick }: StepBarProps) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      height: 32, padding: "0 20px", gap: 0,
      background: "var(--bg-panel)", borderBottom: `1px solid ${S.rim}`,
      flexShrink: 0,
    }}>
      {STEP_DEFS.map((s, i) => {
        const isActive = s.num === step;
        const isDone   = s.num < step;
        const canClick = isDone && !!onStepClick;

        const color = isActive ? S.cyan : isDone ? S.pass : S.tertiary;
        const bg    = isActive ? "var(--bg-panel)" : "transparent";
        const borderLeft = isActive ? `2px solid ${S.cyan}` : "2px solid transparent";

        return (
          <div key={s.num} style={{ display: "flex", alignItems: "center", height: "100%" }}>
            <button
              onClick={() => canClick && onStepClick(s.num)}
              disabled={!canClick}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                height: 32, padding: "0 14px",
                background: bg,
                border: "none",
                borderLeft,
                cursor: canClick ? "pointer" : "default",
                fontFamily: S.fontMono,
                fontSize: 9,
                fontWeight: isActive ? 700 : 500,
                letterSpacing: "0.09em",
                color,
                textTransform: "uppercase",
                whiteSpace: "nowrap",
                transition: "all 0.12s",
              }}
            >
              {isDone ? (
                <span style={{ color: S.pass, fontSize: 9 }}>✓</span>
              ) : (
                <span style={{ fontSize: 9, fontWeight: 700, color }}>{s.num}</span>
              )}
              {s.label}
            </button>

            {/* Connector line between steps */}
            {i < STEP_DEFS.length - 1 && (
              <div style={{
                width: 20, height: 1,
                background: isDone ? S.pass : S.rim,
                flexShrink: 0,
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Exposure sub-strip ─────────────────────────────────────────────────────────
interface ExposureStripProps {
  selectedPositions: PositionRow[];
  runId: string | null;
}

function ExposureStrip({ selectedPositions, runId }: ExposureStripProps) {
  if (selectedPositions.length === 0) return null;

  const totalNotional = selectedPositions.reduce((sum, p) => sum + Math.abs(p.amount ?? 0), 0);
  const currencies = [...new Set(selectedPositions.map(p => p.currency).filter(Boolean))];

  const fmt = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return String(n);
  };

  const parts: string[] = [
    `${selectedPositions.length} POSITION${selectedPositions.length !== 1 ? "S" : ""} SELECTED`,
    `EXPOSURE: ${fmt(totalNotional)}`,
  ];
  if (currencies.length > 0) parts.push(`CURRENCIES: ${currencies.join(", ")}`);
  if (runId) parts.push(`RUN: ${runId.slice(0, 8)}`);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      height: 32, padding: "0 20px",
      background: "var(--bg-sub)", borderBottom: `1px solid ${S.rim}`,
      flexShrink: 0,
    }}>
      {parts.map((part, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.07em" }}>
            {part}
          </span>
          {i < parts.length - 1 && (
            <span style={{ color: S.rim, fontSize: 9, fontFamily: S.fontMono }}>·</span>
          )}
        </span>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
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

  // Allow clicking completed steps in step bar
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
        {/* Back button: only shown when step > 1 */}
        {step > 1 && (
          <>
            <button
              onClick={goBack}
              style={{
                fontFamily: S.fontMono,
                fontSize: 9,
                color: S.tertiary,
                background: "transparent",
                border: `1px solid ${S.rim}`,
                padding: "2px 8px",
                cursor: "pointer",
                letterSpacing: "0.04em",
              }}
            >
              ← Back
            </button>
            <span style={{ color: S.rim }}>|</span>
          </>
        )}
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

      {/* Step bar (replaces PipelineProgress) */}
      <StepBar step={step} onStepClick={handleStepClick} />

      {/* Exposure sub-strip: shown when positions are selected */}
      <ExposureStrip selectedPositions={selectedPositions} runId={runId} />

      {/* Step content — flex:1 + overflow:auto ensures scrollability without page overflow */}
      <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
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
            calcResult={calcResult as Record<string, unknown> | null}
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
