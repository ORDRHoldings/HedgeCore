"use client";

import { useState, useCallback } from "react";
import type { UserContext } from "@/lib/authContext";
import type { PositionRow } from "@/api/positionClient";
import type { CalculateResult } from "./PhaseCalculate";

import ProgressBar   from "./ProgressBar";
import PhaseSelect   from "./PhaseSelect";
import PhaseCalculate from "./PhaseCalculate";
import PhaseRisk     from "./PhaseRisk";
import PhaseReview   from "./PhaseReview";
import PhaseExecute  from "./PhaseExecute";
import PhaseComplete from "./PhaseComplete";

const HD = {
  bgDeep:  "var(--bg-deep)",
  bgPanel: "var(--bg-panel)",
  fontMono:"var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  tertiary: "var(--text-tertiary)",
} as const;

const PHASES = ["SELECT", "CALCULATE", "RISK", "REVIEW", "EXECUTE", "COMPLETE"];

interface HedgeDeskPipelineProps {
  token: string;
  user: UserContext;
  governanceMode: "solo" | "team";
}

export default function HedgeDeskPipeline({ token, user, governanceMode }: HedgeDeskPipelineProps) {
  const [phase, setPhase]                     = useState(0);
  const [completedPhases, setCompletedPhases] = useState<Set<number>>(new Set());

  // Phase data
  const [selectedPositions, setSelectedPositions] = useState<PositionRow[]>([]);
  const [calcResult, setCalcResult]               = useState<Record<string, unknown>>({});
  const [policyInstanceId, setPolicyInstanceId]   = useState<string | undefined>(undefined);
  const [runId, setRunId]                         = useState<string>("");
  const [riskVerdict, setRiskVerdict]             = useState<string>("");
  const [riskDecisionHash, setRiskDecisionHash]   = useState<string>("");
  const [proposalIds, setProposalIds]             = useState<string[]>([]);
  const [fillData, setFillData]                   = useState<{ fillPrice: number; proposalIds: string[] } | null>(null);

  const advance = useCallback(() => {
    setPhase(p => {
      const next = p + 1;
      setCompletedPhases(prev => new Set(prev).add(p));
      return next;
    });
  }, []);

  const goBack = useCallback(() => {
    setPhase(p => Math.max(0, p - 1));
  }, []);

  const reset = useCallback(() => {
    setPhase(0);
    setCompletedPhases(new Set());
    setSelectedPositions([]);
    setCalcResult({});
    setPolicyInstanceId(undefined);
    setRunId("");
    setRiskVerdict("");
    setRiskDecisionHash("");
    setProposalIds([]);
    setFillData(null);
  }, []);

  const handlePhaseClick = useCallback((i: number) => {
    if (completedPhases.has(i)) {
      setPhase(i);
    }
  }, [completedPhases]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: HD.bgPanel }}>
      {/* Progress bar */}
      <ProgressBar
        phases={PHASES}
        positionCount={selectedPositions.length}
        runId={runId || null}
        currentPhase={phase}
        completedPhases={completedPhases}
        onPhaseClick={handlePhaseClick}
      />

      {/* Phase content */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {/* Phase 0: SELECT */}
        {phase === 0 && (
          <div style={{ height: "100%", overflowY: "auto" }}>
            <PhaseSelect
              token={token}
              onComplete={(positions) => {
                setSelectedPositions(positions);
                advance();
              }}
            />
          </div>
        )}

        {/* Phase 1: CALCULATE */}
        {phase === 1 && (
          <div style={{ height: "100%", overflowY: "auto" }}>
            <PhaseCalculate
              positions={selectedPositions}
              token={token}
              onComplete={(result: CalculateResult) => {
                setCalcResult(result.calcResponse);
                setRunId(result.runId);
                setPolicyInstanceId(result.policyInstanceId);
                if (result.riskDecisionHash) setRiskDecisionHash(result.riskDecisionHash);
                advance();
              }}
              onBack={goBack}
            />
          </div>
        )}

        {/* Phase 2: RISK */}
        {phase === 2 && (
          <div style={{ height: "100%", overflowY: "auto" }}>
            <PhaseRisk
              positions={selectedPositions}
              calcResult={calcResult}
              policyInstanceId={policyInstanceId}
              token={token}
              planTier={user.plan_tier}
              onComplete={(verdict, decisionHash) => {
                setRiskVerdict(verdict);
                setRiskDecisionHash(decisionHash);
                advance();
              }}
              onBack={goBack}
            />
          </div>
        )}

        {/* Phase 3: REVIEW */}
        {phase === 3 && (
          <div style={{ height: "100%", overflowY: "auto" }}>
            <PhaseReview
              positions={selectedPositions}
              calcResult={calcResult}
              riskVerdict={riskVerdict}
              riskDecisionHash={riskDecisionHash}
              runId={runId}
              token={token}
              governanceMode={governanceMode}
              onComplete={(ids) => {
                setProposalIds(ids);
                advance();
              }}
              onBack={goBack}
            />
          </div>
        )}

        {/* Phase 4: EXECUTE */}
        {phase === 4 && (
          <div style={{ height: "100%", overflowY: "auto" }}>
            <PhaseExecute
              proposalIds={proposalIds}
              calcResult={calcResult}
              token={token}
              governanceMode={governanceMode}
              onComplete={(data) => {
                setFillData(data);
                advance();
              }}
              onBack={goBack}
            />
          </div>
        )}

        {/* Phase 5: COMPLETE */}
        {phase === 5 && (
          <div style={{ height: "100%", overflowY: "auto" }}>
            <PhaseComplete
              positions={selectedPositions}
              fillData={fillData}
              runId={runId}
              governanceMode={governanceMode}
              onNewRun={reset}
              token={token}
            />
          </div>
        )}

        {/* Safety fallback */}
        {phase > 5 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <span style={{ fontFamily: HD.fontMono, fontSize: 11, color: HD.tertiary }}>
              PIPELINE COMPLETE
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
