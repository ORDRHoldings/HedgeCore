"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { UserContext } from "@/lib/authContext";
import type { PositionRow } from "@/api/positionClient";
import type { CalculateResult } from "./PhaseCalculate";
import { saveDraft, loadDraft, clearDraft, draftAge, type HedgeDraft } from "@/lib/draftPersistence";

import ProgressBar       from "./ProgressBar";
import PhaseSelect       from "./PhaseSelect";
import PhaseAssignPolicy from "./PhaseAssignPolicy";
import PhaseCalculate    from "./PhaseCalculate";
import PhaseRisk         from "./PhaseRisk";
import PhaseReview       from "./PhaseReview";
import PhaseExecute      from "./PhaseExecute";
import PhaseComplete     from "./PhaseComplete";

const HD = {
  bgDeep:  "var(--bg-deep)",
  bgPanel: "var(--bg-panel)",
  fontMono:"var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI:  "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  tertiary: "var(--text-tertiary)",
  secondary: "var(--text-secondary)",
  primary: "var(--text-primary)",
  cyan:    "var(--accent-cyan)",
  amber:   "var(--accent-amber)",
  rim:     "var(--border-rim)",
} as const;

const PHASES = ["SELECT", "ASSIGN POLICY", "CALCULATE", "RISK", "REVIEW", "EXECUTE", "COMPLETE"];

const PHASE_INSTRUCTIONS: Record<number, string> = {
  0: "Select positions to include in this hedge run.",
  1: "Assign a hedge policy to each position before calculation.",
  2: "Configure policy parameters and run the hedge calculation engine.",
  3: "Review risk metrics and confirm the risk assessment verdict.",
  4: "Review hedge proposals and submit for execution approval.",
  5: "Execute approved proposals and record fill details.",
  6: "Hedge run complete. Review the summary or start a new run.",
};

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

  // Draft persistence
  const [pendingDraft, setPendingDraft] = useState<HedgeDraft | null>(null);
  const [draftChecked, setDraftChecked] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const userId = user.id ?? user.email ?? "anonymous";

  // Check for saved draft on mount
  useEffect(() => {
    const draft = loadDraft(userId);
    if (draft && draft.phase > 0) {
      setPendingDraft(draft);
    }
    setDraftChecked(true);
  }, [userId]);

  // Auto-save draft when phase or key data changes (debounced)
  useEffect(() => {
    if (!draftChecked || phase === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveDraft(userId, {
        phase,
        positionIds: selectedPositions.map(p => p.id),
        positionCount: selectedPositions.length,
        policyInstanceId,
        runId: runId || undefined,
        riskVerdict: riskVerdict || undefined,
        riskDecisionHash: riskDecisionHash || undefined,
        proposalIds: proposalIds.length > 0 ? proposalIds : undefined,
        governanceMode,
        savedAt: new Date().toISOString(),
      });
    }, 500);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [phase, selectedPositions.length, runId, proposalIds.length, draftChecked, userId, governanceMode, policyInstanceId, riskVerdict, riskDecisionHash, selectedPositions]);

  const advance = useCallback(() => {
    setPhase(p => {
      const next = p + 1;
      setCompletedPhases(prev => new Set(prev).add(p));
      return next;
    });
  }, []);

  const goBack = useCallback(() => {
    setPhase(p => {
      // Once execution is complete, don't allow going back
      if (fillData) return p;
      // Once proposals exist, don't go back past Review (phase 4)
      if (proposalIds.length > 0 && p <= 5) return Math.max(4, p - 1);
      return Math.max(0, p - 1);
    });
  }, [proposalIds.length, fillData]);

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
    clearDraft(userId);
  }, [userId]);

  const handlePhaseClick = useCallback((i: number) => {
    if (!completedPhases.has(i)) return;
    // Once proposals exist (phase >= 5), prevent navigating back to Review or earlier
    // to avoid re-submitting proposals for positions in terminal state.
    // Once execution started (phase >= 6), prevent all backward navigation.
    if (proposalIds.length > 0 && i < 4) return;
    if (fillData && i < 6) return;
    setPhase(i);
  }, [completedPhases, proposalIds.length, fillData]);

  const dismissDraft = () => {
    setPendingDraft(null);
    clearDraft(userId);
  };

  // Draft resume banner
  if (draftChecked && pendingDraft && phase === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: HD.bgPanel }}>
        <ProgressBar
          phases={PHASES}
          positionCount={0}
          runId={null}
          currentPhase={0}
          completedPhases={new Set()}
          onPhaseClick={() => {}}
          instruction={PHASE_INSTRUCTIONS[0]}
        />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
            padding: "40px 32px", maxWidth: 420,
            border: `1px solid ${HD.rim}`, borderRadius: 4,
            background: "color-mix(in srgb, var(--accent-amber) 4%, var(--bg-panel))",
          }}>
            <span style={{ fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: HD.amber }}>
              DRAFT IN PROGRESS
            </span>
            <span style={{ fontFamily: HD.fontUI, fontSize: 13, color: HD.secondary, textAlign: "center", lineHeight: 1.6 }}>
              You have an unsaved hedge run with {pendingDraft.positionCount} position{pendingDraft.positionCount !== 1 ? "s" : ""},
              saved {draftAge(pendingDraft)}.
              {pendingDraft.runId && (
                <> Run ID: <span style={{ fontFamily: HD.fontMono, color: HD.primary }}>{pendingDraft.runId.slice(0, 8)}</span></>
              )}
            </span>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={dismissDraft}
                style={{
                  fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
                  color: HD.tertiary, background: "transparent",
                  border: `1px solid ${HD.rim}`, padding: "7px 16px",
                  cursor: "pointer", borderRadius: 2,
                }}
              >
                START FRESH
              </button>
              <button
                onClick={() => {
                  // Clear stale draft and start fresh — positions must be re-selected
                  // since we only store IDs (not full PositionRow objects)
                  setPendingDraft(null);
                  clearDraft(userId);
                }}
                style={{
                  fontFamily: HD.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
                  color: "#fff", background: HD.cyan,
                  border: `1px solid ${HD.cyan}`, padding: "7px 16px",
                  cursor: "pointer", borderRadius: 2,
                }}
              >
                DISMISS &amp; RE-SELECT
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
        instruction={PHASE_INSTRUCTIONS[phase] ?? null}
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

        {/* Phase 1: ASSIGN POLICY */}
        {phase === 1 && (
          <div style={{ height: "100%", overflowY: "auto" }}>
            <PhaseAssignPolicy
              positions={selectedPositions}
              token={token}
              onComplete={(updatedPositions, instanceId) => {
                setSelectedPositions(updatedPositions);
                setPolicyInstanceId(instanceId);
                advance();
              }}
              onBack={goBack}
            />
          </div>
        )}

        {/* Phase 2: CALCULATE */}
        {phase === 2 && (
          <div style={{ height: "100%", overflowY: "auto" }}>
            <PhaseCalculate
              positions={selectedPositions}
              token={token}
              initialPolicyInstanceId={policyInstanceId}
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

        {/* Phase 3: RISK */}
        {phase === 3 && (
          <div style={{ height: "100%", overflowY: "auto" }}>
            <PhaseRisk
              positions={selectedPositions}
              calcResult={calcResult}
              policyInstanceId={policyInstanceId}
              token={token}
              planTier={user.plan_tier}
              governanceMode={governanceMode}
              onComplete={(verdict, decisionHash) => {
                setRiskVerdict(verdict);
                setRiskDecisionHash(decisionHash);
                advance();
              }}
              onBack={goBack}
            />
          </div>
        )}

        {/* Phase 4: REVIEW */}
        {phase === 4 && (
          <div style={{ height: "100%", overflowY: "auto" }}>
            <PhaseReview
              positions={selectedPositions}
              calcResult={calcResult}
              riskVerdict={riskVerdict}
              riskDecisionHash={riskDecisionHash}
              runId={runId}
              token={token}
              governanceMode={governanceMode}
              existingProposalIds={proposalIds}
              onComplete={(ids) => {
                setProposalIds(ids);
                advance();
              }}
              onBack={goBack}
            />
          </div>
        )}

        {/* Phase 5: EXECUTE */}
        {phase === 5 && (
          <div style={{ height: "100%", overflowY: "auto" }}>
            <PhaseExecute
              proposalIds={proposalIds}
              calcResult={calcResult}
              token={token}
              governanceMode={governanceMode}
              onComplete={(data) => {
                setFillData(data);
                clearDraft(userId);
                advance();
              }}
              onBack={goBack}
            />
          </div>
        )}

        {/* Phase 6: COMPLETE */}
        {phase === 6 && (
          <div style={{ height: "100%", overflowY: "auto" }}>
            <PhaseComplete
              positions={selectedPositions}
              fillData={fillData}
              calcResult={calcResult}
              policyInstanceId={policyInstanceId}
              runId={runId}
              governanceMode={governanceMode}
              onNewRun={reset}
              token={token}
            />
          </div>
        )}

        {/* Safety fallback */}
        {phase > 6 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
            <span style={{ fontFamily: HD.fontMono, fontSize: 12, color: HD.tertiary }}>
              PIPELINE COMPLETE
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
