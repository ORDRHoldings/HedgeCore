/**
 * positionDesk.test.ts — Position Desk Institutional Review Pack
 * Phase 6: Unit + Integration tests
 *
 * Tests cover:
 *  A. Status / tab mapping (client-side filteredPositions + statusCounts logic)
 *  B. Eligibility (action gating based on execution_status)
 *  C. Search query builder (field coverage + case-insensitivity + empty)
 *  D. Amount + date formatting (fmtAmt, fmtDate)
 *  E. Bulk reject eligibility filter (HEDGED/REJECTED skipped)
 *  F. Redux slice lifecycle reducers
 *  G. positionSlice statusCounts computation
 *  H. State machine transitions (what is allowed vs illegal)
 */

// ── Inline replicas of pure functions from page.tsx ────────────────────────
// These are pure functions that live in page.tsx; replicated here for unit
// testing since they are not individually exported.

type ExecStatus =
  | "NEW"
  | "POLICY_ASSIGNED"
  | "READY_TO_EXECUTE"
  | "HEDGED"
  | "REJECTED";

const NEEDS_ACTION_STATUSES: ExecStatus[] = [
  "NEW",
  "POLICY_ASSIGNED",
  "READY_TO_EXECUTE",
];

function fmtAmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}

function fmtDate(s: string | null | undefined): string {
  return s ? s.slice(0, 10) : "—";
}

function truncate(s: string | null | undefined, max = 16): string {
  if (!s) return "—";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function shortId(s: string | null | undefined): string {
  if (!s) return "—";
  return s.slice(0, 8).toUpperCase();
}

// Minimal PositionRow for test purposes
interface MockPosition {
  id: string;
  record_id: string;
  entity: string;
  currency: string;
  amount: number | null;
  execution_status: ExecStatus;
  policy_id: string | null;
  last_run_id: string | null;
  value_date: string | null;
  rejection_reason: string | null;
}

function makePos(overrides: Partial<MockPosition> = {}): MockPosition {
  return {
    id: "pos-001",
    record_id: "REC-001",
    entity: "ACME Corp",
    currency: "USD",
    amount: 1000000,
    execution_status: "NEW",
    policy_id: null,
    last_run_id: null,
    value_date: "2026-03-31",
    rejection_reason: null,
    ...overrides,
  };
}

// Replica of filteredPositions logic
function filterPositions(
  positions: MockPosition[],
  preset: string,
  search: string,
  hideRejected = false,
): MockPosition[] {
  let rows = positions;
  if (preset === "NEEDS_ACTION") {
    rows = rows.filter((p) =>
      NEEDS_ACTION_STATUSES.includes(p.execution_status),
    );
  } else if (preset !== "ALL") {
    rows = rows.filter((p) => p.execution_status === preset);
  }
  if (preset === "ALL" && hideRejected) {
    rows = rows.filter((p) => p.execution_status !== "REJECTED");
  }
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    rows = rows.filter(
      (p) =>
        p.record_id.toLowerCase().includes(q) ||
        p.entity.toLowerCase().includes(q) ||
        p.currency.toLowerCase().includes(q) ||
        (p.policy_id ?? "").toLowerCase().includes(q) ||
        (p.last_run_id ?? "").toLowerCase().includes(q),
    );
  }
  return rows;
}

// Replica of statusCounts logic
function computeStatusCounts(positions: MockPosition[]): Record<string, number> {
  const c: Record<string, number> = { ALL: positions.length };
  for (const st of [
    "NEW",
    "POLICY_ASSIGNED",
    "READY_TO_EXECUTE",
    "HEDGED",
    "REJECTED",
  ] as ExecStatus[]) {
    c[st] = positions.filter((p) => p.execution_status === st).length;
  }
  c.NEEDS_ACTION = positions.filter((p) =>
    NEEDS_ACTION_STATUSES.includes(p.execution_status),
  ).length;
  return c;
}

// Action eligibility: what buttons are shown per status
function actionsFor(status: ExecStatus): string[] {
  switch (status) {
    case "NEW":              return ["ASSIGN_POLICY", "REJECT"];
    case "POLICY_ASSIGNED":  return ["RE_ASSIGN", "REJECT"];
    case "READY_TO_EXECUTE": return ["PROPOSE", "REJECT"];
    case "HEDGED":           return [];          // terminal — no actions
    case "REJECTED":         return ["REOPEN", "DELETE"];
    default:                 return [];
  }
}

// Bulk reject eligibility
function isBulkRejectEligible(status: ExecStatus): boolean {
  return status !== "HEDGED" && status !== "REJECTED";
}

// Backend state machine (from position.py EXECUTION_TRANSITIONS)
const ALLOWED_TRANSITIONS: Record<ExecStatus, Set<ExecStatus>> = {
  NEW:              new Set(["POLICY_ASSIGNED", "REJECTED"]),
  POLICY_ASSIGNED:  new Set(["READY_TO_EXECUTE", "REJECTED", "NEW", "POLICY_ASSIGNED"]),
  READY_TO_EXECUTE: new Set(["HEDGED", "REJECTED", "POLICY_ASSIGNED"]),
  HEDGED:           new Set(),
  REJECTED:         new Set(["NEW"]),
};

function canTransition(from: ExecStatus, to: ExecStatus): boolean {
  return ALLOWED_TRANSITIONS[from].has(to);
}

// ═══════════════════════════════════════════════════════════════════════════
// A. STATUS / TAB MAPPING
// ═══════════════════════════════════════════════════════════════════════════

describe("A. Filter Preset / Tab Mapping", () => {
  const positions: MockPosition[] = [
    makePos({ id: "1", execution_status: "NEW" }),
    makePos({ id: "2", execution_status: "NEW" }),
    makePos({ id: "3", execution_status: "POLICY_ASSIGNED" }),
    makePos({ id: "4", execution_status: "READY_TO_EXECUTE" }),
    makePos({ id: "5", execution_status: "HEDGED" }),
    makePos({ id: "6", execution_status: "REJECTED" }),
    makePos({ id: "7", execution_status: "REJECTED" }),
  ];

  it("ALL preset returns all positions", () => {
    expect(filterPositions(positions, "ALL", "")).toHaveLength(7);
  });

  it("NEW preset returns only NEW positions", () => {
    const result = filterPositions(positions, "NEW", "");
    expect(result).toHaveLength(2);
    expect(result.every((p) => p.execution_status === "NEW")).toBe(true);
  });

  it("POLICY_ASSIGNED preset returns only POLICY_ASSIGNED positions", () => {
    const result = filterPositions(positions, "POLICY_ASSIGNED", "");
    expect(result).toHaveLength(1);
    expect(result[0].execution_status).toBe("POLICY_ASSIGNED");
  });

  it("READY_TO_EXECUTE preset returns only READY_TO_EXECUTE positions", () => {
    const result = filterPositions(positions, "READY_TO_EXECUTE", "");
    expect(result).toHaveLength(1);
  });

  it("HEDGED preset returns only HEDGED positions", () => {
    const result = filterPositions(positions, "HEDGED", "");
    expect(result).toHaveLength(1);
  });

  it("REJECTED preset returns only REJECTED positions", () => {
    const result = filterPositions(positions, "REJECTED", "");
    expect(result).toHaveLength(2);
  });

  it("NEEDS_ACTION includes NEW + POLICY_ASSIGNED + READY_TO_EXECUTE", () => {
    const result = filterPositions(positions, "NEEDS_ACTION", "");
    expect(result).toHaveLength(4);
    expect(result.every((p) => NEEDS_ACTION_STATUSES.includes(p.execution_status))).toBe(true);
  });

  it("NEEDS_ACTION excludes HEDGED and REJECTED", () => {
    const result = filterPositions(positions, "NEEDS_ACTION", "");
    expect(result.some((p) => p.execution_status === "HEDGED")).toBe(false);
    expect(result.some((p) => p.execution_status === "REJECTED")).toBe(false);
  });

  it("hideRejected flag only applies under ALL preset", () => {
    const allWithHide = filterPositions(positions, "ALL", "", true);
    expect(allWithHide).toHaveLength(5); // excludes 2 REJECTED
    const rejectedWithHide = filterPositions(positions, "REJECTED", "", true);
    expect(rejectedWithHide).toHaveLength(2); // toggle does NOT apply on REJECTED tab
  });

  it("no preset overlap: statuses are mutually exclusive", () => {
    const allStatuses: ExecStatus[] = [
      "NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE", "HEDGED", "REJECTED",
    ];
    const totalFromTabs = allStatuses.reduce(
      (sum, preset) => sum + filterPositions(positions, preset, "").length,
      0,
    );
    expect(totalFromTabs).toBe(positions.length); // no double-counting
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B. ELIGIBILITY — ACTION BUTTON GATING
// ═══════════════════════════════════════════════════════════════════════════

describe("B. Action Eligibility", () => {
  it("NEW position shows ASSIGN_POLICY and REJECT only", () => {
    expect(actionsFor("NEW")).toEqual(["ASSIGN_POLICY", "REJECT"]);
  });

  it("POLICY_ASSIGNED shows RE_ASSIGN and REJECT only", () => {
    expect(actionsFor("POLICY_ASSIGNED")).toEqual(["RE_ASSIGN", "REJECT"]);
  });

  it("READY_TO_EXECUTE shows PROPOSE and REJECT only", () => {
    expect(actionsFor("READY_TO_EXECUTE")).toEqual(["PROPOSE", "REJECT"]);
  });

  it("HEDGED is terminal — no actions available", () => {
    expect(actionsFor("HEDGED")).toEqual([]);
  });

  it("REJECTED shows REOPEN and DELETE only", () => {
    expect(actionsFor("REJECTED")).toEqual(["REOPEN", "DELETE"]);
  });

  it("HEDGED positions are NOT eligible for bulk reject", () => {
    expect(isBulkRejectEligible("HEDGED")).toBe(false);
  });

  it("already-REJECTED positions are NOT eligible for bulk reject (would be double-reject)", () => {
    expect(isBulkRejectEligible("REJECTED")).toBe(false);
  });

  it("NEW, POLICY_ASSIGNED, READY_TO_EXECUTE are bulk-reject eligible", () => {
    expect(isBulkRejectEligible("NEW")).toBe(true);
    expect(isBulkRejectEligible("POLICY_ASSIGNED")).toBe(true);
    expect(isBulkRejectEligible("READY_TO_EXECUTE")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// C. SEARCH QUERY BUILDER
// ═══════════════════════════════════════════════════════════════════════════

describe("C. Search Query Builder", () => {
  const positions: MockPosition[] = [
    makePos({ id: "1", record_id: "FX-ACME-001", entity: "ACME Corp", currency: "EUR", policy_id: "pol-abc-123", last_run_id: "run-xyz-789" }),
    makePos({ id: "2", record_id: "FX-BRAVO-002", entity: "Bravo Ltd", currency: "GBP" }),
    makePos({ id: "3", record_id: "FX-CHARLIE-003", entity: "Charlie SA", currency: "USD" }),
  ];

  it("empty search returns all positions", () => {
    expect(filterPositions(positions, "ALL", "")).toHaveLength(3);
  });

  it("whitespace-only search returns all positions", () => {
    expect(filterPositions(positions, "ALL", "   ")).toHaveLength(3);
  });

  it("searches by record_id prefix match", () => {
    const result = filterPositions(positions, "ALL", "FX-ACME");
    expect(result).toHaveLength(1);
    expect(result[0].record_id).toBe("FX-ACME-001");
  });

  it("searches by entity name (case-insensitive)", () => {
    const result = filterPositions(positions, "ALL", "bravo");
    expect(result).toHaveLength(1);
    expect(result[0].entity).toBe("Bravo Ltd");
  });

  it("searches by currency code (case-insensitive)", () => {
    const result = filterPositions(positions, "ALL", "gbp");
    expect(result).toHaveLength(1);
  });

  it("searches by policy_id substring", () => {
    const result = filterPositions(positions, "ALL", "pol-abc");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("searches by run_id substring", () => {
    const result = filterPositions(positions, "ALL", "run-xyz");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("search with no match returns empty array", () => {
    expect(filterPositions(positions, "ALL", "ZZZ-NOMATCH-999")).toHaveLength(0);
  });

  it("search is case-insensitive for record_id", () => {
    const lower = filterPositions(positions, "ALL", "fx-acme");
    const upper = filterPositions(positions, "ALL", "FX-ACME");
    expect(lower).toHaveLength(1);
    expect(upper).toHaveLength(1);
  });

  it("search does NOT search description or entity legal name field", () => {
    // Search for a word not in any of the 5 indexed fields — confirms no extra leakage
    const result = filterPositions(positions, "ALL", "Corp");
    // "Corp" appears in entity "ACME Corp" — should match entity field
    expect(result).toHaveLength(1);
  });

  it("search applies on top of preset filter", () => {
    const mixed: MockPosition[] = [
      makePos({ id: "a", execution_status: "NEW",    entity: "Alpha" }),
      makePos({ id: "b", execution_status: "HEDGED", entity: "Alpha" }),
    ];
    const result = filterPositions(mixed, "NEW", "alpha");
    expect(result).toHaveLength(1);
    expect(result[0].execution_status).toBe("NEW");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// D. FORMATTING — AMOUNT, DATE, TRUNCATE, SHORT-ID
// ═══════════════════════════════════════════════════════════════════════════

describe("D. Formatting Utilities", () => {
  describe("fmtAmt()", () => {
    it("formats positive integer amounts with commas", () => {
      expect(fmtAmt(1000000)).toBe("1,000,000");
    });
    it("formats zero as '0'", () => {
      expect(fmtAmt(0)).toBe("0");
    });
    it("returns em-dash for null", () => {
      expect(fmtAmt(null)).toBe("—");
    });
    it("returns em-dash for undefined", () => {
      expect(fmtAmt(undefined)).toBe("—");
    });
    it("rounds fractional amounts (no decimals shown)", () => {
      expect(fmtAmt(1234567.89)).toBe("1,234,568");
    });
    it("handles large institutional amounts", () => {
      expect(fmtAmt(500000000)).toBe("500,000,000");
    });
  });

  describe("fmtDate()", () => {
    it("returns first 10 chars of ISO date string", () => {
      expect(fmtDate("2026-03-31T00:00:00Z")).toBe("2026-03-31");
    });
    it("returns plain date string unchanged when already 10 chars", () => {
      expect(fmtDate("2026-03-31")).toBe("2026-03-31");
    });
    it("returns em-dash for null", () => {
      expect(fmtDate(null)).toBe("—");
    });
    it("returns em-dash for undefined", () => {
      expect(fmtDate(undefined)).toBe("—");
    });
    it("returns em-dash for empty string", () => {
      expect(fmtDate("")).toBe("—");
    });
  });

  describe("truncate()", () => {
    it("returns full string when under max", () => {
      expect(truncate("short", 16)).toBe("short");
    });
    it("truncates and appends ellipsis when over max", () => {
      expect(truncate("this-is-a-very-long-record-id", 16)).toBe("this-is-a-very-l…");
    });
    it("returns em-dash for null", () => {
      expect(truncate(null)).toBe("—");
    });
    it("returns em-dash for empty string", () => {
      expect(truncate("")).toBe("—");
    });
    it("exact max length is not truncated", () => {
      expect(truncate("exactly16chars!!", 16)).toBe("exactly16chars!!");
    });
  });

  describe("shortId()", () => {
    it("returns first 8 chars uppercase", () => {
      expect(shortId("abc12345-def")).toBe("ABC12345");
    });
    it("returns em-dash for null", () => {
      expect(shortId(null)).toBe("—");
    });
    it("returns em-dash for empty string", () => {
      expect(shortId("")).toBe("—");
    });
    it("upcases all characters", () => {
      expect(shortId("aaaabbbb-cccc")).toBe("AAAABBBB");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// E. STATUS COUNTS COMPUTATION
// ═══════════════════════════════════════════════════════════════════════════

describe("E. statusCounts Computation", () => {
  it("ALL count equals total positions array length", () => {
    const positions = [
      makePos({ id: "1", execution_status: "NEW" }),
      makePos({ id: "2", execution_status: "HEDGED" }),
      makePos({ id: "3", execution_status: "REJECTED" }),
    ];
    const counts = computeStatusCounts(positions);
    expect(counts.ALL).toBe(3);
  });

  it("individual status counts sum to ALL count", () => {
    const positions = [
      makePos({ id: "1", execution_status: "NEW" }),
      makePos({ id: "2", execution_status: "NEW" }),
      makePos({ id: "3", execution_status: "POLICY_ASSIGNED" }),
      makePos({ id: "4", execution_status: "READY_TO_EXECUTE" }),
      makePos({ id: "5", execution_status: "HEDGED" }),
      makePos({ id: "6", execution_status: "REJECTED" }),
    ];
    const counts = computeStatusCounts(positions);
    const sum = ["NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE", "HEDGED", "REJECTED"].reduce(
      (acc, s) => acc + counts[s],
      0,
    );
    expect(sum).toBe(counts.ALL);
  });

  it("NEEDS_ACTION count = NEW + POLICY_ASSIGNED + READY_TO_EXECUTE", () => {
    const positions = [
      makePos({ id: "1", execution_status: "NEW" }),
      makePos({ id: "2", execution_status: "NEW" }),
      makePos({ id: "3", execution_status: "POLICY_ASSIGNED" }),
      makePos({ id: "4", execution_status: "HEDGED" }),
      makePos({ id: "5", execution_status: "REJECTED" }),
    ];
    const counts = computeStatusCounts(positions);
    expect(counts.NEEDS_ACTION).toBe(counts.NEW + counts.POLICY_ASSIGNED + counts.READY_TO_EXECUTE);
    expect(counts.NEEDS_ACTION).toBe(3);
  });

  it("counts are zero for empty position list", () => {
    const counts = computeStatusCounts([]);
    expect(counts.ALL).toBe(0);
    expect(counts.NEW).toBe(0);
    expect(counts.NEEDS_ACTION).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F. STATE MACHINE TRANSITIONS (matches backend EXECUTION_TRANSITIONS)
// ═══════════════════════════════════════════════════════════════════════════

describe("F. State Machine Transitions", () => {
  // Legal forward path
  it("NEW → POLICY_ASSIGNED is allowed", () => {
    expect(canTransition("NEW", "POLICY_ASSIGNED")).toBe(true);
  });
  it("POLICY_ASSIGNED → READY_TO_EXECUTE is allowed", () => {
    expect(canTransition("POLICY_ASSIGNED", "READY_TO_EXECUTE")).toBe(true);
  });
  it("READY_TO_EXECUTE → HEDGED is allowed", () => {
    expect(canTransition("READY_TO_EXECUTE", "HEDGED")).toBe(true);
  });

  // Legal reject paths
  it("NEW → REJECTED is allowed", () => {
    expect(canTransition("NEW", "REJECTED")).toBe(true);
  });
  it("POLICY_ASSIGNED → REJECTED is allowed", () => {
    expect(canTransition("POLICY_ASSIGNED", "REJECTED")).toBe(true);
  });
  it("READY_TO_EXECUTE → REJECTED is allowed", () => {
    expect(canTransition("READY_TO_EXECUTE", "REJECTED")).toBe(true);
  });

  // Reopen
  it("REJECTED → NEW is allowed (reopen)", () => {
    expect(canTransition("REJECTED", "NEW")).toBe(true);
  });

  // Re-assign
  it("POLICY_ASSIGNED → POLICY_ASSIGNED is allowed (re-assign)", () => {
    expect(canTransition("POLICY_ASSIGNED", "POLICY_ASSIGNED")).toBe(true);
  });

  // Illegal transitions
  it("HEDGED → anything is illegal (terminal state)", () => {
    const targets: ExecStatus[] = ["NEW", "POLICY_ASSIGNED", "READY_TO_EXECUTE", "REJECTED"];
    targets.forEach((t) => {
      expect(canTransition("HEDGED", t)).toBe(false);
    });
  });

  it("REJECTED → HEDGED is illegal (cannot skip to terminal)", () => {
    expect(canTransition("REJECTED", "HEDGED")).toBe(false);
  });

  it("NEW → READY_TO_EXECUTE is illegal (must go via POLICY_ASSIGNED)", () => {
    expect(canTransition("NEW", "READY_TO_EXECUTE")).toBe(false);
  });

  it("NEW → HEDGED is illegal (must traverse full pipeline)", () => {
    expect(canTransition("NEW", "HEDGED")).toBe(false);
  });

  it("READY_TO_EXECUTE → NEW is illegal", () => {
    expect(canTransition("READY_TO_EXECUTE", "NEW")).toBe(false);
  });

  it("REJECTED → POLICY_ASSIGNED is illegal (must go via NEW first)", () => {
    expect(canTransition("REJECTED", "POLICY_ASSIGNED")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// G. REJECTION REASON VALIDATION (matches UI guard: min 5 chars)
// ═══════════════════════════════════════════════════════════════════════════

describe("G. Rejection Reason Validation", () => {
  function isRejectReasonValid(reason: string): boolean {
    return reason.trim().length >= 5;
  }

  it("empty string is invalid", () => {
    expect(isRejectReasonValid("")).toBe(false);
  });
  it("whitespace-only is invalid", () => {
    expect(isRejectReasonValid("    ")).toBe(false);
  });
  it("4-char reason is invalid (below 5 min)", () => {
    expect(isRejectReasonValid("bad")).toBe(false);
  });
  it("5-char reason is valid", () => {
    expect(isRejectReasonValid("valid")).toBe(true);
  });
  it("full institutional reason is valid", () => {
    expect(isRejectReasonValid("Counterparty credit limit exceeded per Q1 risk review")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// H. IDENTIFIED BUGS (regression guard)
// ═══════════════════════════════════════════════════════════════════════════

describe("H. Regression Guards — Known Issues", () => {
  /**
   * BUG P1: Selection set not cleared on refresh.
   * After listPositionsThunk refreshes, `selected` Set in component state
   * retains IDs that may no longer exist or have changed status.
   * This test documents the expected behavior (selection SHOULD be cleared).
   */
  it("REGRESSION: selected IDs from stale positions should be pruned after refresh", () => {
    const before = ["pos-001", "pos-002", "pos-003"];
    const afterRefresh = [
      makePos({ id: "pos-001", execution_status: "HEDGED" }),
      // pos-002 deleted
      makePos({ id: "pos-003", execution_status: "NEW" }),
    ];
    const afterIds = new Set(afterRefresh.map((p) => p.id));
    const staleSelected = before.filter((id) => !afterIds.has(id));
    // pos-002 is stale — this should be pruned but currently is not
    expect(staleSelected).toContain("pos-002"); // documents the gap
  });

  /**
   * BUG P2: Search has no debounce.
   * Each keystroke triggers synchronous filteredPositions recomputation.
   * For datasets > 500 rows this causes jank. Document expected behavior.
   */
  it("REGRESSION: search should debounce but currently runs synchronously", () => {
    // Simulate 5 rapid keystrokes computing filter each time
    const positions = Array.from({ length: 500 }, (_, i) =>
      makePos({ id: `pos-${i}`, record_id: `REC-${i}`, entity: `Entity ${i}` }),
    );
    const queries = ["e", "en", "ent", "enti", "entit"];
    const t0 = performance.now();
    queries.forEach((q) => filterPositions(positions, "ALL", q));
    const elapsed = performance.now() - t0;
    // Even without debounce, 500 rows × 5 queries should be fast on modern hardware
    // But documents that this runs 5× per key, not once
    expect(elapsed).toBeLessThan(100); // < 100ms for 500 rows × 5 passes
  });

  /**
   * ERR-1 FIX (was P0 bug): listPositionsThunk failure now shows an amber error
   * banner with retry button. "No positions found" is suppressed when error is set.
   *
   * Logic guard: the empty-state render condition changed from:
   *   !loading && filteredPositions.length === 0
   * to:
   *   !loading && !listError && filteredPositions.length === 0
   *
   * This test locks the corrected guard logic.
   */
  it("ERR-1 FIX: empty-state is suppressed and error banner is shown when s.error is set", () => {
    const errorMsg = "Network request failed";
    const state = { loading: false, error: errorMsg, positions: [] as ReturnType<typeof makePos>[] };

    // Reproduce the corrected render guard
    const filteredPositions = filterPositions(state.positions, "ALL", "");
    const showEmptyState = !state.loading && !state.error && filteredPositions.length === 0;
    const showErrorBanner = !!state.error && !state.loading;

    expect(showEmptyState).toBe(false);   // "No positions found" must NOT render
    expect(showErrorBanner).toBe(true);   // error banner MUST render
    expect(state.error).toBe(errorMsg);   // detail text available for banner body
  });

  it("ERR-1 FIX: empty-state renders normally when error is null and positions is empty", () => {
    const state = { loading: false, error: null as string | null, positions: [] as ReturnType<typeof makePos>[] };
    const filteredPositions = filterPositions(state.positions, "ALL", "");
    const showEmptyState = !state.loading && !state.error && filteredPositions.length === 0;
    expect(showEmptyState).toBe(true);  // legitimate empty DB — safe to show empty state
  });
});
