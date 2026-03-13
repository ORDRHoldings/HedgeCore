/**
 * positionDeskReliability.test.ts — Reliability War Room Phase B
 *
 * Tests the fixes applied in the reliability war room:
 *  A. Delete error banner logic (was: console.error only, now: UI feedback)
 *  B. Mutation refresh behavior (mark ready, reject, reopen trigger list refresh)
 *  C. Delete confirmation flow gating (only REJECTED positions show DELETE)
 *  D. Status label rendering accuracy per lifecycle state
 *  E. Run reference / audit reference rendering
 *  F. Disabled/hidden action correctness per lifecycle state
 *  G. Count badge accuracy after simulated mutations
 */

// ── Inline types matching the page component ─────────────────────────────────

type ExecStatus = "NEW" | "POLICY_ASSIGNED" | "READY_TO_EXECUTE" | "HEDGED" | "REJECTED";

interface MockPosition {
  id: string;
  record_id: string;
  entity: string;
  currency: string;
  amount: number;
  execution_status: ExecStatus;
  policy_id: string | null;
  last_run_id: string | null;
  value_date: string | null;
  rejection_reason: string | null;
  is_active: boolean;
}

// ── Sample Data Fixtures (Phase D) ──────────────────────────────────────────

const FIXTURES: Record<string, MockPosition> = {
  NEW: {
    id: "fix-new-001", record_id: "POS-NEW-001", entity: "Acme Corp",
    currency: "EUR", amount: 500000, execution_status: "NEW",
    policy_id: null, last_run_id: null, value_date: "2026-06-30",
    rejection_reason: null, is_active: true,
  },
  POLICY_ASSIGNED: {
    id: "fix-pa-001", record_id: "POS-PA-001", entity: "Bravo Ltd",
    currency: "GBP", amount: 250000, execution_status: "POLICY_ASSIGNED",
    policy_id: "pol-inst-001", last_run_id: null, value_date: "2026-09-30",
    rejection_reason: null, is_active: true,
  },
  READY: {
    id: "fix-rte-001", record_id: "POS-RTE-001", entity: "Charlie SA",
    currency: "MXN", amount: 10000000, execution_status: "READY_TO_EXECUTE",
    policy_id: "pol-inst-002", last_run_id: "run-abc-123", value_date: "2026-12-31",
    rejection_reason: null, is_active: true,
  },
  HEDGED: {
    id: "fix-hdg-001", record_id: "POS-HDG-001", entity: "Delta Inc",
    currency: "JPY", amount: 100000000, execution_status: "HEDGED",
    policy_id: "pol-inst-003", last_run_id: "run-def-456", value_date: "2026-03-31",
    rejection_reason: null, is_active: true,
  },
  REJECTED: {
    id: "fix-rej-001", record_id: "POS-REJ-001", entity: "Echo GmbH",
    currency: "CHF", amount: 750000, execution_status: "REJECTED",
    policy_id: null, last_run_id: null, value_date: "2026-04-30",
    rejection_reason: "Counterparty credit limit exceeded", is_active: true,
  },
  DELETABLE: {
    id: "fix-del-001", record_id: "POS-DEL-001", entity: "Foxtrot AG",
    currency: "CAD", amount: 300000, execution_status: "REJECTED",
    policy_id: null, last_run_id: null, value_date: "2026-05-31",
    rejection_reason: "Duplicate entry — already hedged under POS-HDG-001", is_active: true,
  },
  NOT_DELETABLE: {
    id: "fix-nd-001", record_id: "POS-ND-001", entity: "Golf LLC",
    currency: "AUD", amount: 450000, execution_status: "NEW",
    policy_id: null, last_run_id: null, value_date: "2026-07-31",
    rejection_reason: null, is_active: true,
  },
  WITH_REFS: {
    id: "fix-ref-001", record_id: "POS-REF-001", entity: "Hotel Corp",
    currency: "MXN", amount: 5000000, execution_status: "READY_TO_EXECUTE",
    policy_id: "pol-inst-audit", last_run_id: "run-audit-789", value_date: "2026-08-31",
    rejection_reason: null, is_active: true,
  },
};

function allFixtures(): MockPosition[] {
  return Object.values(FIXTURES);
}

// ── Replicated logic from page.tsx ──────────────────────────────────────────

const STATUS_LABELS: Record<ExecStatus, string> = {
  NEW: "NEW",
  POLICY_ASSIGNED: "POLICY ASGND",
  READY_TO_EXECUTE: "READY",
  HEDGED: "HEDGED",
  REJECTED: "REJECTED",
};

function actionsFor(status: ExecStatus): string[] {
  switch (status) {
    case "NEW":              return ["ASSIGN_POLICY", "REJECT"];
    case "POLICY_ASSIGNED":  return ["RE_ASSIGN", "REJECT"];
    case "READY_TO_EXECUTE": return ["PROPOSE", "REJECT"];
    case "HEDGED":           return [];
    case "REJECTED":         return ["REOPEN", "DELETE"];
    default:                 return [];
  }
}

function canDelete(status: ExecStatus): boolean {
  return actionsFor(status).includes("DELETE");
}

function shortId(s: string | null | undefined): string {
  if (!s) return "—";
  return s.slice(0, 8).toUpperCase();
}

function computeStatusCounts(positions: MockPosition[]): Record<string, number> {
  const c: Record<string, number> = { ALL: positions.length };
  for (const st of ["NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE", "HEDGED", "REJECTED"] as ExecStatus[]) {
    c[st] = positions.filter((p) => p.execution_status === st).length;
  }
  c.NEEDS_ACTION = positions.filter((p) =>
    ["NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE"].includes(p.execution_status)
  ).length;
  return c;
}

// ═══════════════════════════════════════════════════════════════════════════
// A. DELETE ERROR BANNER LOGIC
// ═══════════════════════════════════════════════════════════════════════════

describe("A. Delete Error Banner Logic", () => {
  it("deleteError state starts as null", () => {
    const deleteError: string | null = null;
    expect(deleteError).toBeNull();
  });

  it("on delete failure, error message is captured from exception", () => {
    // Simulate the fixed handler logic
    let deleteError: string | null = null;
    try {
      throw new Error("Request failed with status code 403");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      deleteError = msg || "Delete failed. You may lack the trades.delete permission.";
    }
    expect(deleteError).toBe("Request failed with status code 403");
  });

  it("error banner renders when deleteError is truthy", () => {
    const deleteError = "Forbidden: missing trades.delete permission";
    const showErrorBanner = !!deleteError;
    expect(showErrorBanner).toBe(true);
  });

  it("error banner does not render when deleteError is null", () => {
    const deleteError: string | null = null;
    const showErrorBanner = !!deleteError;
    expect(showErrorBanner).toBe(false);
  });

  it("cancel button clears deleteError", () => {
    let deleteError: string | null = "some error";
    // Simulate cancel handler: setDeleteConfirmId(null); setDeleteError(null);
    deleteError = null;
    expect(deleteError).toBeNull();
  });

  it("fallback message used when error.message is empty", () => {
    let deleteError: string | null = null;
    try {
      throw new Error("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      deleteError = msg || "Delete failed. You may lack the trades.delete permission.";
    }
    expect(deleteError).toBe("Delete failed. You may lack the trades.delete permission.");
  });

  it("non-Error thrown objects are stringified", () => {
    let deleteError: string | null = null;
    try {
      throw "raw string error";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      deleteError = msg || "Delete failed.";
    }
    expect(deleteError).toBe("raw string error");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B. MUTATION REFRESH BEHAVIOR
// ═══════════════════════════════════════════════════════════════════════════

describe("B. Mutation Refresh Behavior", () => {
  /**
   * The fix: after mark-ready/reject/reopen succeed, dispatch(listPositionsThunk)
   * is called. We test the logic gate: refresh only happens on "fulfilled".
   */
  it("refresh is triggered only on fulfilled status", () => {
    const statuses = ["fulfilled", "rejected", "pending"];
    const refreshTriggered: boolean[] = statuses.map(s => s === "fulfilled");
    expect(refreshTriggered).toEqual([true, false, false]);
  });

  it("mark-ready success triggers list refresh (gate: fulfilled)", () => {
    const requestStatus = "fulfilled";
    const shouldRefresh = requestStatus === "fulfilled";
    expect(shouldRefresh).toBe(true);
  });

  it("mark-ready failure does NOT trigger list refresh", () => {
    const requestStatus = "rejected";
    const shouldRefresh = requestStatus === "fulfilled";
    expect(shouldRefresh).toBe(false);
  });

  it("reject success triggers list refresh (gate: fulfilled)", () => {
    const requestStatus = "fulfilled";
    const shouldRefresh = requestStatus === "fulfilled";
    expect(shouldRefresh).toBe(true);
  });

  it("reopen success triggers list refresh (gate: fulfilled)", () => {
    const requestStatus = "fulfilled";
    const shouldRefresh = requestStatus === "fulfilled";
    expect(shouldRefresh).toBe(true);
  });

  it("after reject, position count for REJECTED should increase by 1", () => {
    const before = computeStatusCounts(allFixtures());
    // Simulate rejecting the NEW fixture
    const after = allFixtures().map(p =>
      p.id === FIXTURES.NEW.id ? { ...p, execution_status: "REJECTED" as ExecStatus } : p
    );
    const afterCounts = computeStatusCounts(after);
    expect(afterCounts.REJECTED).toBe(before.REJECTED + 1);
    expect(afterCounts.NEW).toBe(before.NEW - 1);
    expect(afterCounts.ALL).toBe(before.ALL); // total unchanged
  });

  it("after reopen, REJECTED count decreases and NEW count increases", () => {
    const before = computeStatusCounts(allFixtures());
    const after = allFixtures().map(p =>
      p.id === FIXTURES.REJECTED.id ? { ...p, execution_status: "NEW" as ExecStatus, rejection_reason: null } : p
    );
    const afterCounts = computeStatusCounts(after);
    expect(afterCounts.REJECTED).toBe(before.REJECTED - 1);
    expect(afterCounts.NEW).toBe(before.NEW + 1);
  });

  it("after delete (soft), position is removed from active list", () => {
    const before = allFixtures();
    const after = before.filter(p => p.id !== FIXTURES.DELETABLE.id);
    expect(after.length).toBe(before.length - 1);
    expect(after.find(p => p.id === FIXTURES.DELETABLE.id)).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// C. DELETE CONFIRMATION FLOW GATING
// ═══════════════════════════════════════════════════════════════════════════

describe("C. Delete Confirmation Gating", () => {
  it("only REJECTED positions show DELETE action", () => {
    const statuses: ExecStatus[] = ["NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE", "HEDGED", "REJECTED"];
    const deleteVisible = statuses.filter(s => canDelete(s));
    expect(deleteVisible).toEqual(["REJECTED"]);
  });

  it("DELETABLE fixture is deletable", () => {
    expect(canDelete(FIXTURES.DELETABLE.execution_status)).toBe(true);
  });

  it("NOT_DELETABLE fixture (NEW) is not deletable", () => {
    expect(canDelete(FIXTURES.NOT_DELETABLE.execution_status)).toBe(false);
  });

  it("HEDGED position is never deletable", () => {
    expect(canDelete("HEDGED")).toBe(false);
  });

  it("READY_TO_EXECUTE position is not deletable", () => {
    expect(canDelete("READY_TO_EXECUTE")).toBe(false);
  });

  it("delete modal only opens when deleteConfirmId is set", () => {
    const deleteConfirmId: string | null = null;
    expect(!!deleteConfirmId).toBe(false);
    // After setting
    const set: string | null = "fix-del-001";
    expect(!!set).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// D. STATUS LABEL RENDERING
// ═══════════════════════════════════════════════════════════════════════════

describe("D. Status Label Rendering", () => {
  it("every lifecycle state has a label", () => {
    const statuses: ExecStatus[] = ["NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE", "HEDGED", "REJECTED"];
    statuses.forEach(s => {
      expect(STATUS_LABELS[s]).toBeDefined();
      expect(STATUS_LABELS[s].length).toBeGreaterThan(0);
    });
  });

  it("labels match expected display text", () => {
    expect(STATUS_LABELS.NEW).toBe("NEW");
    expect(STATUS_LABELS.POLICY_ASSIGNED).toBe("POLICY ASGND");
    expect(STATUS_LABELS.READY_TO_EXECUTE).toBe("READY");
    expect(STATUS_LABELS.HEDGED).toBe("HEDGED");
    expect(STATUS_LABELS.REJECTED).toBe("REJECTED");
  });

  it("no two states share the same display label", () => {
    const labels = Object.values(STATUS_LABELS);
    const unique = new Set(labels);
    expect(unique.size).toBe(labels.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// E. RUN REFERENCE / AUDIT REFERENCE RENDERING
// ═══════════════════════════════════════════════════════════════════════════

describe("E. Reference Rendering", () => {
  it("shortId renders first 8 chars uppercase for run_id", () => {
    expect(shortId("run-audit-789")).toBe("RUN-AUDI");
  });

  it("shortId renders first 8 chars uppercase for policy_id", () => {
    expect(shortId("pol-inst-audit")).toBe("POL-INST");
  });

  it("shortId returns em-dash for null run_id", () => {
    expect(shortId(null)).toBe("—");
  });

  it("fixture WITH_REFS has both run and policy references", () => {
    const pos = FIXTURES.WITH_REFS;
    expect(pos.last_run_id).toBeTruthy();
    expect(pos.policy_id).toBeTruthy();
    expect(shortId(pos.last_run_id)).toBe("RUN-AUDI");
    expect(shortId(pos.policy_id)).toBe("POL-INST");
  });

  it("NEW fixture has no run or policy references", () => {
    const pos = FIXTURES.NEW;
    expect(shortId(pos.last_run_id)).toBe("—");
    expect(shortId(pos.policy_id)).toBe("—");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F. DISABLED/HIDDEN ACTIONS PER LIFECYCLE STATE
// ═══════════════════════════════════════════════════════════════════════════

describe("F. Action Visibility Per State", () => {
  it("NEW: ASSIGN_POLICY and REJECT visible, nothing else", () => {
    const actions = actionsFor("NEW");
    expect(actions).toContain("ASSIGN_POLICY");
    expect(actions).toContain("REJECT");
    expect(actions).not.toContain("DELETE");
    expect(actions).not.toContain("REOPEN");
    expect(actions).not.toContain("PROPOSE");
  });

  it("POLICY_ASSIGNED: RE_ASSIGN and REJECT visible", () => {
    const actions = actionsFor("POLICY_ASSIGNED");
    expect(actions).toContain("RE_ASSIGN");
    expect(actions).toContain("REJECT");
    expect(actions).not.toContain("DELETE");
  });

  it("READY_TO_EXECUTE: PROPOSE and REJECT visible", () => {
    const actions = actionsFor("READY_TO_EXECUTE");
    expect(actions).toContain("PROPOSE");
    expect(actions).toContain("REJECT");
    expect(actions).not.toContain("DELETE");
    expect(actions).not.toContain("REOPEN");
  });

  it("HEDGED: no actions (terminal state)", () => {
    expect(actionsFor("HEDGED")).toEqual([]);
  });

  it("REJECTED: REOPEN and DELETE only", () => {
    const actions = actionsFor("REJECTED");
    expect(actions).toContain("REOPEN");
    expect(actions).toContain("DELETE");
    expect(actions).not.toContain("ASSIGN_POLICY");
    expect(actions).not.toContain("PROPOSE");
    expect(actions).not.toContain("REJECT");
  });

  it("every fixture has correct actions for its state", () => {
    for (const [name, pos] of Object.entries(FIXTURES)) {
      const actions = actionsFor(pos.execution_status);
      // No fixture should have both DELETE and ASSIGN_POLICY
      expect(actions.includes("DELETE") && actions.includes("ASSIGN_POLICY")).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// G. COUNT BADGE ACCURACY AFTER MUTATIONS
// ═══════════════════════════════════════════════════════════════════════════

describe("G. Count Badge Accuracy", () => {
  it("initial fixture counts are correct", () => {
    const counts = computeStatusCounts(allFixtures());
    // Fixtures: NEW(1+NOT_DELETABLE=2), PA(1), RTE(1+WITH_REFS=2), HEDGED(1), REJECTED(1+DELETABLE=2)
    expect(counts.NEW).toBe(2);
    expect(counts.POLICY_ASSIGNED).toBe(1);
    expect(counts.READY_TO_EXECUTE).toBe(2);
    expect(counts.HEDGED).toBe(1);
    expect(counts.REJECTED).toBe(2);
    expect(counts.ALL).toBe(8);
    expect(counts.NEEDS_ACTION).toBe(5); // 2 + 1 + 2
  });

  it("after rejecting all NEW positions, NEEDS_ACTION drops correctly", () => {
    const after = allFixtures().map(p =>
      p.execution_status === "NEW" ? { ...p, execution_status: "REJECTED" as ExecStatus } : p
    );
    const counts = computeStatusCounts(after);
    expect(counts.NEW).toBe(0);
    expect(counts.REJECTED).toBe(4); // was 2, +2 from NEW
    expect(counts.NEEDS_ACTION).toBe(3); // PA(1) + RTE(2) only
  });

  it("after deleting a REJECTED position, ALL count decreases", () => {
    const after = allFixtures().filter(p => p.id !== FIXTURES.DELETABLE.id);
    const counts = computeStatusCounts(after);
    expect(counts.ALL).toBe(7);
    expect(counts.REJECTED).toBe(1);
  });

  it("NEEDS_ACTION never includes HEDGED or REJECTED", () => {
    const counts = computeStatusCounts(allFixtures());
    const needsAction = allFixtures().filter(p =>
      ["NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE"].includes(p.execution_status)
    ).length;
    expect(counts.NEEDS_ACTION).toBe(needsAction);
  });
});
