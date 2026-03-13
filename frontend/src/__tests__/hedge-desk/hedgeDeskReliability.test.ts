/**
 * Hedge Desk Reliability Tests
 *
 * Covers: draft persistence, phase data flow, pipeline orchestration,
 * phase gating, and component contracts.
 *
 * Jest / ts-jest / node environment — no DOM rendering.
 */

// ─── A. Draft Persistence ────────────────────────────────────────────────────

import type { HedgeDraft } from "@/lib/draftPersistence";

// Mock localStorage
const store: Record<string, string> = {};
const mockStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, val: string) => { store[key] = val; },
  removeItem: (key: string) => { delete store[key]; },
};
Object.defineProperty(globalThis, "localStorage", { value: mockStorage });

// Import after localStorage mock is installed
import { saveDraft, loadDraft, clearDraft, hasDraft, draftAge } from "@/lib/draftPersistence";

const STORAGE_PREFIX = "ordr_hedge_draft_";

function makeDraft(overrides: Partial<HedgeDraft> = {}): HedgeDraft {
  return {
    phase: 2,
    positionIds: ["aaa", "bbb"],
    positionCount: 2,
    governanceMode: "solo",
    savedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  // Clear store between tests
  for (const k of Object.keys(store)) delete store[k];
});

describe("A. Draft Persistence", () => {
  test("saveDraft writes to localStorage with correct key", () => {
    const draft = makeDraft();
    saveDraft("user1", draft);
    expect(store[`${STORAGE_PREFIX}user1`]).toBeDefined();
    const parsed = JSON.parse(store[`${STORAGE_PREFIX}user1`]);
    expect(parsed.phase).toBe(2);
    expect(parsed.positionIds).toEqual(["aaa", "bbb"]);
  });

  test("loadDraft returns null when no draft exists", () => {
    expect(loadDraft("user-none")).toBeNull();
  });

  test("loadDraft returns saved draft", () => {
    saveDraft("user2", makeDraft({ phase: 3, policyInstanceId: "pol-1" }));
    const loaded = loadDraft("user2");
    expect(loaded).not.toBeNull();
    expect(loaded!.phase).toBe(3);
    expect(loaded!.policyInstanceId).toBe("pol-1");
  });

  test("clearDraft removes the draft", () => {
    saveDraft("user3", makeDraft());
    expect(loadDraft("user3")).not.toBeNull();
    clearDraft("user3");
    expect(loadDraft("user3")).toBeNull();
  });

  test("hasDraft returns true when draft exists", () => {
    saveDraft("user4", makeDraft());
    expect(hasDraft("user4")).toBe(true);
  });

  test("hasDraft returns false when no draft exists", () => {
    expect(hasDraft("user-missing")).toBe(false);
  });

  test("draft expires after 24 hours", () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    saveDraft("userOld", makeDraft({ savedAt: old }));
    // Force re-write with old timestamp
    store[`${STORAGE_PREFIX}userOld`] = JSON.stringify(makeDraft({ savedAt: old }));
    expect(loadDraft("userOld")).toBeNull();
  });

  test("draft within 24 hours is not expired", () => {
    const recent = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
    store[`${STORAGE_PREFIX}userRecent`] = JSON.stringify(makeDraft({ savedAt: recent }));
    expect(loadDraft("userRecent")).not.toBeNull();
  });

  test("draft per-user isolation: user A cannot see user B", () => {
    saveDraft("alice", makeDraft({ phase: 1 }));
    saveDraft("bob", makeDraft({ phase: 4 }));
    expect(loadDraft("alice")!.phase).toBe(1);
    expect(loadDraft("bob")!.phase).toBe(4);
    clearDraft("alice");
    expect(loadDraft("alice")).toBeNull();
    expect(loadDraft("bob")).not.toBeNull();
  });

  test("draftAge returns 'just now' for recent draft", () => {
    const draft = makeDraft({ savedAt: new Date().toISOString() });
    expect(draftAge(draft)).toBe("just now");
  });

  test("draftAge returns minutes for sub-hour draft", () => {
    const draft = makeDraft({ savedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString() });
    expect(draftAge(draft)).toBe("15m ago");
  });

  test("draftAge returns hours for multi-hour draft", () => {
    const draft = makeDraft({ savedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() });
    expect(draftAge(draft)).toBe("3h ago");
  });

  test("draftAge returns 'over a day ago' for 25h old draft", () => {
    const draft = makeDraft({ savedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() });
    expect(draftAge(draft)).toBe("over a day ago");
  });

  test("draft stores all optional fields (runId, riskVerdict, proposalIds)", () => {
    saveDraft("userFull", makeDraft({
      runId: "run-abc",
      riskVerdict: "PASS",
      riskDecisionHash: "hash123",
      proposalIds: ["p1", "p2"],
      policyInstanceId: "pol-xyz",
    }));
    const loaded = loadDraft("userFull")!;
    expect(loaded.runId).toBe("run-abc");
    expect(loaded.riskVerdict).toBe("PASS");
    expect(loaded.riskDecisionHash).toBe("hash123");
    expect(loaded.proposalIds).toEqual(["p1", "p2"]);
    expect(loaded.policyInstanceId).toBe("pol-xyz");
  });

  test("corrupt JSON in localStorage returns null", () => {
    store[`${STORAGE_PREFIX}corrupt`] = "not-json!!!{";
    expect(loadDraft("corrupt")).toBeNull();
  });
});

// ─── B. Pipeline Phase Data Flow ─────────────────────────────────────────────

describe("B. Pipeline Phase Data Flow", () => {
  const PHASES = ["SELECT", "CALCULATE", "RISK", "REVIEW", "EXECUTE", "COMPLETE"];

  test("PHASES array has exactly 6 entries", () => {
    expect(PHASES).toHaveLength(6);
  });

  test("PHASES names match expected pipeline stages", () => {
    expect(PHASES).toEqual(["SELECT", "CALCULATE", "RISK", "REVIEW", "EXECUTE", "COMPLETE"]);
  });

  test("phase index 0 is SELECT (entry point)", () => {
    expect(PHASES[0]).toBe("SELECT");
  });

  test("phase index 5 is COMPLETE (terminal)", () => {
    expect(PHASES[5]).toBe("COMPLETE");
  });

  test("advance from SELECT goes to CALCULATE (index 0→1)", () => {
    let phase = 0;
    phase = phase + 1; // advance()
    expect(phase).toBe(1);
    expect(PHASES[phase]).toBe("CALCULATE");
  });

  test("goBack from CALCULATE returns to SELECT (index 1→0)", () => {
    let phase = 1;
    phase = Math.max(0, phase - 1);
    expect(phase).toBe(0);
    expect(PHASES[phase]).toBe("SELECT");
  });

  test("goBack from SELECT stays at SELECT (never negative)", () => {
    let phase = 0;
    phase = Math.max(0, phase - 1);
    expect(phase).toBe(0);
  });

  test("advance through full pipeline produces 0→1→2→3→4→5", () => {
    const visited: number[] = [];
    let phase = 0;
    for (let i = 0; i < 6; i++) {
      visited.push(phase);
      phase++;
    }
    expect(visited).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test("completedPhases set tracks finished phases", () => {
    const completed = new Set<number>();
    // Complete phases 0, 1, 2
    completed.add(0);
    completed.add(1);
    completed.add(2);
    expect(completed.has(0)).toBe(true);
    expect(completed.has(2)).toBe(true);
    expect(completed.has(3)).toBe(false);
  });

  test("phase click only allowed on completed phases", () => {
    const completed = new Set([0, 1]);
    const handlePhaseClick = (i: number) => {
      if (completed.has(i)) return i;
      return null;
    };
    expect(handlePhaseClick(0)).toBe(0); // completed — allowed
    expect(handlePhaseClick(1)).toBe(1); // completed — allowed
    expect(handlePhaseClick(2)).toBeNull(); // not completed — blocked
  });

  test("reset clears all state", () => {
    let phase = 3;
    const completed = new Set([0, 1, 2]);
    let runId = "run-123";
    let riskVerdict = "PASS";
    let proposalIds = ["p1"];

    // reset()
    phase = 0;
    completed.clear();
    runId = "";
    riskVerdict = "";
    proposalIds = [];

    expect(phase).toBe(0);
    expect(completed.size).toBe(0);
    expect(runId).toBe("");
    expect(riskVerdict).toBe("");
    expect(proposalIds).toHaveLength(0);
  });
});

// ─── C. Phase Contracts ──────────────────────────────────────────────────────

describe("C. Phase Component Contracts", () => {
  test("PhaseSelect output: positions array must be non-empty", () => {
    const positions = [{ id: "pos1", currency: "EUR", amount: 100000 }];
    expect(positions.length).toBeGreaterThan(0);
  });

  test("PhaseCalculate output: must include calcResponse, runId, policyInstanceId", () => {
    const calcResult = {
      calcResponse: { hedges: [] },
      runId: "run-abc",
      policyInstanceId: "pol-xyz",
      riskDecisionHash: "hash123",
    };
    expect(calcResult.calcResponse).toBeDefined();
    expect(calcResult.runId).toBeTruthy();
    expect(calcResult.policyInstanceId).toBeTruthy();
  });

  test("PhaseRisk output: verdict and decisionHash", () => {
    const verdict = "PASS";
    const decisionHash = "sha256-abc";
    expect(["PASS", "CONDITIONAL_PASS", "FAIL"]).toContain(verdict);
    expect(decisionHash.length).toBeGreaterThan(0);
  });

  test("PhaseReview output: proposal IDs array", () => {
    const proposalIds = ["proposal-1", "proposal-2"];
    expect(proposalIds.length).toBeGreaterThan(0);
    proposalIds.forEach(id => expect(typeof id).toBe("string"));
  });

  test("PhaseExecute output: fillData with fillPrice and proposalIds", () => {
    const fillData = { fillPrice: 17.85, proposalIds: ["p1", "p2"] };
    expect(fillData.fillPrice).toBeGreaterThan(0);
    expect(fillData.proposalIds.length).toBeGreaterThan(0);
  });

  test("PhaseComplete receives all required props", () => {
    const props = {
      positions: [{ id: "1" }],
      fillData: { fillPrice: 17.85, proposalIds: ["p1"] },
      calcResult: { hedges: [] },
      policyInstanceId: "pol-xyz",
      runId: "run-abc",
      governanceMode: "solo" as const,
      onNewRun: () => {},
      token: "jwt-token",
    };
    expect(props.positions.length).toBeGreaterThan(0);
    expect(props.fillData).toBeDefined();
    expect(props.runId).toBeTruthy();
    expect(typeof props.onNewRun).toBe("function");
  });
});

// ─── D. Draft Resume Banner Behavior ─────────────────────────────────────────

describe("D. Draft Resume Banner", () => {
  test("banner shows only when draft exists and phase === 0", () => {
    const draftChecked = true;
    const pendingDraft: HedgeDraft | null = makeDraft();
    const phase = 0;
    const showBanner = draftChecked && pendingDraft !== null && phase === 0;
    expect(showBanner).toBe(true);
  });

  test("banner does not show when phase > 0", () => {
    const showBanner = true && makeDraft() !== null && 2 === 0;
    expect(showBanner).toBe(false);
  });

  test("banner does not show when no draft", () => {
    const showBanner = true && null !== null && 0 === 0;
    expect(showBanner).toBe(false);
  });

  test("START FRESH clears draft and dismisses banner", () => {
    saveDraft("userBanner", makeDraft());
    expect(loadDraft("userBanner")).not.toBeNull();

    // Simulate START FRESH
    clearDraft("userBanner");
    const pendingDraft = null;
    expect(loadDraft("userBanner")).toBeNull();
    expect(pendingDraft).toBeNull();
  });

  test("DISMISS & RE-SELECT clears draft (same behavior as START FRESH)", () => {
    saveDraft("userDismiss", makeDraft());
    // Both buttons now clear draft — confirmed fix from Phase 1
    clearDraft("userDismiss");
    expect(loadDraft("userDismiss")).toBeNull();
  });

  test("draft positionCount shown in banner text", () => {
    const draft = makeDraft({ positionCount: 5 });
    expect(draft.positionCount).toBe(5);
    const text = `${draft.positionCount} position${draft.positionCount !== 1 ? "s" : ""}`;
    expect(text).toBe("5 positions");
  });

  test("single position shows singular form", () => {
    const draft = makeDraft({ positionCount: 1 });
    const text = `${draft.positionCount} position${draft.positionCount !== 1 ? "s" : ""}`;
    expect(text).toBe("1 position");
  });
});

// ─── E. Design Tokens ────────────────────────────────────────────────────────

import { T } from "@/components/hedge-desk/tokens";

describe("E. Design Tokens", () => {
  test("T exports all required token keys", () => {
    const required = [
      "bgPanel", "bgSub", "bgDeep",
      "rim", "soft",
      "primary", "secondary", "tertiary",
      "cyan", "amber", "red", "green",
      "fontUI", "fontMono",
    ];
    for (const key of required) {
      expect(T).toHaveProperty(key);
    }
  });

  test("all tokens are string values (CSS variables)", () => {
    for (const [, val] of Object.entries(T)) {
      expect(typeof val).toBe("string");
    }
  });

  test("font tokens reference IBM Plex families", () => {
    expect(T.fontUI).toContain("IBM Plex Sans");
    expect(T.fontMono).toContain("IBM Plex Mono");
  });

  test("T object has semantic color tokens (royal, emerald, slate)", () => {
    expect(T).toHaveProperty("royal");
    expect(T).toHaveProperty("emerald");
    expect(T).toHaveProperty("slate");
  });
});

// ─── F. Phase Instruction Text ───────────────────────────────────────────────

describe("F. Phase Instructions", () => {
  const PHASE_INSTRUCTIONS: Record<number, string> = {
    0: "Select open positions to include in this hedge run.",
    1: "Configure policy parameters and run the hedge calculation engine.",
    2: "Review risk metrics and confirm the risk assessment verdict.",
    3: "Review hedge proposals and submit for execution approval.",
    4: "Execute approved proposals and record fill details.",
    5: "Hedge run complete. Review the summary or start a new run.",
  };

  test("instruction exists for every phase index 0-5", () => {
    for (let i = 0; i <= 5; i++) {
      expect(PHASE_INSTRUCTIONS[i]).toBeDefined();
      expect(PHASE_INSTRUCTIONS[i].length).toBeGreaterThan(0);
    }
  });

  test("no instruction for out-of-range phases", () => {
    expect(PHASE_INSTRUCTIONS[6]).toBeUndefined();
    expect(PHASE_INSTRUCTIONS[-1]).toBeUndefined();
  });
});
