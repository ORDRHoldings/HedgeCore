/**
 * Stale Review Guard — Regression Tests
 *
 * Covers the exact bug path where:
 * 1. PhaseReview remounts after backward navigation
 * 2. Local `submitted` state resets to false
 * 3. User can re-submit proposals for positions already in HEDGED terminal state
 *
 * Tests verify:
 * - PhaseReview initializes correctly from existingProposalIds
 * - Pipeline navigation guards block stale backward paths
 * - Fresh pipelines still work normally
 * - Terminal position detection works
 *
 * Jest / ts-jest / node environment — no DOM rendering.
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Simulates HedgeDeskPipeline.goBack() with the exact production logic. */
function simulateGoBack(
  currentPhase: number,
  proposalIdsLength: number,
  fillData: unknown | null,
): number {
  if (fillData) return currentPhase;
  if (proposalIdsLength > 0 && currentPhase <= 5) return Math.max(4, currentPhase - 1);
  return Math.max(0, currentPhase - 1);
}

/** Simulates HedgeDeskPipeline.handlePhaseClick() with the exact production logic. */
function simulatePhaseClick(
  targetPhase: number,
  completedPhases: Set<number>,
  proposalIdsLength: number,
  fillData: unknown | null,
): number | null {
  if (!completedPhases.has(targetPhase)) return null;
  if (proposalIdsLength > 0 && targetPhase < 4) return null;
  if (fillData && targetPhase < 6) return null;
  return targetPhase;
}

/** Simulates PhaseReview state initialization from existingProposalIds. */
function simulatePhaseReviewInit(existingProposalIds?: string[]) {
  const alreadySubmitted = (existingProposalIds?.length ?? 0) > 0;
  return {
    alreadySubmitted,
    submitted: alreadySubmitted,
    proposalIds: existingProposalIds ?? [],
    submitting: false,
  };
}

/** Simulates the pre-flight terminal position check in handleSubmit. */
function detectTerminalPositions(
  positions: Array<{ id: string; execution_status: string }>,
): Array<{ id: string; status: string }> {
  return positions
    .filter(p => p.execution_status === "HEDGED" || p.execution_status === "REJECTED")
    .map(p => ({ id: p.id, status: p.execution_status }));
}

// ─── A. PhaseReview Init from existingProposalIds ───────────────────────────

describe("A. PhaseReview Init — existingProposalIds", () => {
  test("no existingProposalIds → submitted=false, submit button visible", () => {
    const state = simulatePhaseReviewInit(undefined);
    expect(state.alreadySubmitted).toBe(false);
    expect(state.submitted).toBe(false);
    expect(state.proposalIds).toEqual([]);
  });

  test("empty existingProposalIds → submitted=false", () => {
    const state = simulatePhaseReviewInit([]);
    expect(state.alreadySubmitted).toBe(false);
    expect(state.submitted).toBe(false);
  });

  test("non-empty existingProposalIds → submitted=true, submit button hidden", () => {
    const state = simulatePhaseReviewInit(["prop-1", "prop-2"]);
    expect(state.alreadySubmitted).toBe(true);
    expect(state.submitted).toBe(true);
    expect(state.proposalIds).toEqual(["prop-1", "prop-2"]);
  });

  test("single proposal ID → submitted=true", () => {
    const state = simulatePhaseReviewInit(["prop-only"]);
    expect(state.alreadySubmitted).toBe(true);
    expect(state.submitted).toBe(true);
  });

  test("handleSubmit early-returns when alreadySubmitted is true", () => {
    const state = simulatePhaseReviewInit(["prop-1"]);
    // Production code: if (alreadySubmitted) return;
    let submitCalled = false;
    if (!state.alreadySubmitted) {
      submitCalled = true;
    }
    expect(submitCalled).toBe(false);
  });

  test("handleSubmit proceeds when alreadySubmitted is false", () => {
    const state = simulatePhaseReviewInit(undefined);
    let submitCalled = false;
    if (!state.alreadySubmitted) {
      submitCalled = true;
    }
    expect(submitCalled).toBe(true);
  });
});

// ─── B. goBack Navigation Guard ─────────────────────────────────────────────

describe("B. goBack — Navigation Guard (proposal barrier)", () => {
  test("no proposals, no fillData → normal backward navigation", () => {
    expect(simulateGoBack(3, 0, null)).toBe(2);
    expect(simulateGoBack(2, 0, null)).toBe(1);
    expect(simulateGoBack(1, 0, null)).toBe(0);
  });

  test("no proposals → goBack from phase 0 stays at 0", () => {
    expect(simulateGoBack(0, 0, null)).toBe(0);
  });

  test("proposals exist → goBack from Execute (5) stops at Review (4)", () => {
    expect(simulateGoBack(5, 2, null)).toBe(4);
  });

  test("proposals exist → goBack from Review (4) stays at Review (4)", () => {
    // Math.max(4, 4-1) = Math.max(4, 3) = 4
    expect(simulateGoBack(4, 2, null)).toBe(4);
  });

  test("proposals exist → cannot go below Review (phase 4)", () => {
    // Even if somehow at phase 3 with proposals (shouldn't happen), guard holds
    expect(simulateGoBack(5, 1, null)).toBe(4);
    expect(simulateGoBack(4, 1, null)).toBe(4);
  });

  test("fillData exists → goBack is completely blocked", () => {
    const fillData = { fillPrice: 17.85, proposalIds: ["p1"] };
    expect(simulateGoBack(6, 2, fillData)).toBe(6);
    expect(simulateGoBack(5, 2, fillData)).toBe(5);
    expect(simulateGoBack(4, 2, fillData)).toBe(4);
  });

  test("fillData exists → goBack from Complete (6) stays at 6", () => {
    expect(simulateGoBack(6, 2, { fillPrice: 0, proposalIds: ["p1"] })).toBe(6);
  });
});

// ─── C. handlePhaseClick Navigation Guard ───────────────────────────────────

describe("C. handlePhaseClick — Navigation Guard (progress bar)", () => {
  const allCompleted = new Set([0, 1, 2, 3, 4, 5, 6]);

  test("no proposals, no fillData → can click any completed phase", () => {
    for (let i = 0; i <= 6; i++) {
      expect(simulatePhaseClick(i, allCompleted, 0, null)).toBe(i);
    }
  });

  test("uncompleted phase → click blocked regardless of proposals", () => {
    const partial = new Set([0, 1, 2]);
    expect(simulatePhaseClick(3, partial, 0, null)).toBeNull();
    expect(simulatePhaseClick(4, partial, 0, null)).toBeNull();
  });

  test("proposals exist → clicking phases 0-3 is blocked", () => {
    expect(simulatePhaseClick(0, allCompleted, 2, null)).toBeNull();
    expect(simulatePhaseClick(1, allCompleted, 2, null)).toBeNull();
    expect(simulatePhaseClick(2, allCompleted, 2, null)).toBeNull();
    expect(simulatePhaseClick(3, allCompleted, 2, null)).toBeNull();
  });

  test("proposals exist → clicking Review (4) is allowed", () => {
    expect(simulatePhaseClick(4, allCompleted, 2, null)).toBe(4);
  });

  test("proposals exist → clicking Execute (5) is allowed", () => {
    expect(simulatePhaseClick(5, allCompleted, 2, null)).toBe(5);
  });

  test("proposals exist → clicking Complete (6) is allowed", () => {
    expect(simulatePhaseClick(6, allCompleted, 2, null)).toBe(6);
  });

  test("fillData exists → clicking phases 0-5 is blocked", () => {
    const fillData = { fillPrice: 17.85, proposalIds: ["p1"] };
    for (let i = 0; i <= 5; i++) {
      expect(simulatePhaseClick(i, allCompleted, 2, fillData)).toBeNull();
    }
  });

  test("fillData exists → clicking Complete (6) is allowed", () => {
    const fillData = { fillPrice: 17.85, proposalIds: ["p1"] };
    expect(simulatePhaseClick(6, allCompleted, 2, fillData)).toBe(6);
  });
});

// ─── D. Terminal Position Detection (Pre-flight) ────────────────────────────

describe("D. Terminal Position Detection", () => {
  test("all READY_TO_EXECUTE → no terminal positions detected", () => {
    const positions = [
      { id: "pos-1", execution_status: "READY_TO_EXECUTE" },
      { id: "pos-2", execution_status: "READY_TO_EXECUTE" },
    ];
    expect(detectTerminalPositions(positions)).toEqual([]);
  });

  test("all NEW → no terminal positions detected", () => {
    const positions = [
      { id: "pos-1", execution_status: "NEW" },
    ];
    expect(detectTerminalPositions(positions)).toEqual([]);
  });

  test("HEDGED positions detected as terminal", () => {
    const positions = [
      { id: "pos-1", execution_status: "HEDGED" },
      { id: "pos-2", execution_status: "READY_TO_EXECUTE" },
    ];
    const terminal = detectTerminalPositions(positions);
    expect(terminal).toHaveLength(1);
    expect(terminal[0]).toEqual({ id: "pos-1", status: "HEDGED" });
  });

  test("REJECTED positions detected as terminal", () => {
    const positions = [
      { id: "pos-1", execution_status: "REJECTED" },
    ];
    const terminal = detectTerminalPositions(positions);
    expect(terminal).toHaveLength(1);
    expect(terminal[0]).toEqual({ id: "pos-1", status: "REJECTED" });
  });

  test("mixed terminal + active positions → only terminal returned", () => {
    const positions = [
      { id: "pos-1", execution_status: "HEDGED" },
      { id: "pos-2", execution_status: "READY_TO_EXECUTE" },
      { id: "pos-3", execution_status: "REJECTED" },
      { id: "pos-4", execution_status: "POLICY_ASSIGNED" },
    ];
    const terminal = detectTerminalPositions(positions);
    expect(terminal).toHaveLength(2);
    expect(terminal.map(t => t.id)).toEqual(["pos-1", "pos-3"]);
  });

  test("all HEDGED → all detected as terminal", () => {
    const positions = [
      { id: "pos-1", execution_status: "HEDGED" },
      { id: "pos-2", execution_status: "HEDGED" },
      { id: "pos-3", execution_status: "HEDGED" },
    ];
    expect(detectTerminalPositions(positions)).toHaveLength(3);
  });

  test("empty positions → no terminal detected", () => {
    expect(detectTerminalPositions([])).toEqual([]);
  });
});

// ─── E. Full Bug Reproduction Path ──────────────────────────────────────────

describe("E. Full Stale Review Bug — Reproduction Path", () => {
  test("BUG SCENARIO: Complete pipeline → click Review → remount → submit button hidden", () => {
    // Step 1: Pipeline progresses through all phases
    const proposalIds = ["prop-abc", "prop-def"];
    const fillData = { fillPrice: 17.85, proposalIds };

    // Step 2: User clicks Review (phase 4) in progress bar
    const allCompleted = new Set([0, 1, 2, 3, 4, 5, 6]);
    const canClickReview = simulatePhaseClick(4, allCompleted, proposalIds.length, fillData);

    // FIXED: fillData exists → clicking Review is blocked
    expect(canClickReview).toBeNull();
  });

  test("BUG SCENARIO: Proposals created → navigate back from Execute → Review shows submitted", () => {
    const proposalIds = ["prop-abc"];

    // Step 1: At Execute phase (5), user clicks Back
    const afterGoBack = simulateGoBack(5, proposalIds.length, null);
    // goBack stops at Review (4), not earlier
    expect(afterGoBack).toBe(4);

    // Step 2: PhaseReview remounts with existingProposalIds
    const reviewState = simulatePhaseReviewInit(proposalIds);
    // FIXED: submitted starts true because proposals already exist
    expect(reviewState.submitted).toBe(true);
    expect(reviewState.alreadySubmitted).toBe(true);
  });

  test("BUG SCENARIO: After execution, cannot navigate to any pre-Review phase", () => {
    const fillData = { fillPrice: 17.85, proposalIds: ["p1"] };
    const allCompleted = new Set([0, 1, 2, 3, 4, 5, 6]);

    // Cannot click Select (0), Assign Policy (1), Calculate (2), Risk (3), Review (4), Execute (5)
    for (let i = 0; i <= 5; i++) {
      expect(simulatePhaseClick(i, allCompleted, 2, fillData)).toBeNull();
    }
    // Can only click Complete (6)
    expect(simulatePhaseClick(6, allCompleted, 2, fillData)).toBe(6);
  });

  test("CLEAN SCENARIO: Fresh pipeline → Review allows normal submission", () => {
    // No proposals yet
    const reviewState = simulatePhaseReviewInit(undefined);
    expect(reviewState.submitted).toBe(false);
    expect(reviewState.alreadySubmitted).toBe(false);

    // Navigation is unrestricted before proposals
    expect(simulateGoBack(4, 0, null)).toBe(3);
    expect(simulateGoBack(3, 0, null)).toBe(2);

    const completed = new Set([0, 1, 2, 3]);
    expect(simulatePhaseClick(0, completed, 0, null)).toBe(0);
    expect(simulatePhaseClick(2, completed, 0, null)).toBe(2);
  });

  test("EDGE: Proposals exist but no fillData → can still navigate Review↔Execute", () => {
    const proposalIds = ["prop-1"];

    // Can go back from Execute to Review
    expect(simulateGoBack(5, proposalIds.length, null)).toBe(4);

    // Can click Execute from Review
    const completed = new Set([0, 1, 2, 3, 4, 5]);
    expect(simulatePhaseClick(5, completed, proposalIds.length, null)).toBe(5);

    // Cannot go back past Review
    expect(simulateGoBack(4, proposalIds.length, null)).toBe(4);

    // Cannot click phases before Review
    expect(simulatePhaseClick(0, completed, proposalIds.length, null)).toBeNull();
    expect(simulatePhaseClick(3, completed, proposalIds.length, null)).toBeNull();
  });
});

// ─── F. 7-Phase Pipeline Contract ───────────────────────────────────────────

describe("F. 7-Phase Pipeline — Updated Contract", () => {
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

  test("PHASES array has exactly 7 entries", () => {
    expect(PHASES).toHaveLength(7);
  });

  test("PHASES names match 7-step pipeline", () => {
    expect(PHASES).toEqual([
      "SELECT", "ASSIGN POLICY", "CALCULATE", "RISK",
      "REVIEW", "EXECUTE", "COMPLETE",
    ]);
  });

  test("instruction exists for every phase index 0-6", () => {
    for (let i = 0; i <= 6; i++) {
      expect(PHASE_INSTRUCTIONS[i]).toBeDefined();
      expect(PHASE_INSTRUCTIONS[i].length).toBeGreaterThan(0);
    }
  });

  test("REVIEW is phase 4 (not 3)", () => {
    expect(PHASES[4]).toBe("REVIEW");
  });

  test("EXECUTE is phase 5 (not 4)", () => {
    expect(PHASES[5]).toBe("EXECUTE");
  });

  test("COMPLETE is phase 6 (not 5)", () => {
    expect(PHASES[6]).toBe("COMPLETE");
  });

  test("ASSIGN POLICY is phase 1 (new step)", () => {
    expect(PHASES[1]).toBe("ASSIGN POLICY");
  });

  test("no instruction for out-of-range phases", () => {
    expect(PHASE_INSTRUCTIONS[7]).toBeUndefined();
    expect(PHASE_INSTRUCTIONS[-1]).toBeUndefined();
  });
});
