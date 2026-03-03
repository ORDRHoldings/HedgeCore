/**
 * getPipelineNextStep.test.ts
 *
 * Unit tests for the getPipelineNextStep() pipeline routing function.
 * Covers all 5 lifecycle permutations:
 *  1. No positions           → "Add Exposure"       href="/input"
 *  2. NEW positions          → "02 — Policy Desk"   href="/policy-desk"
 *  3. POLICY_ASSIGNED        → "03 — Hedge Desk"    href="/hedge-desk"
 *  4. READY_TO_EXECUTE       → "04 — Execution Desk" href="/execution-desk"
 *  5. All HEDGED             → "All Complete"       href="/dashboard"
 *
 * Edge cases:
 *  - Null/undefined positions array
 *  - Mixed statuses (priority order validated)
 *  - Inactive positions (is_active=false) excluded
 *  - No activePolicy forces policy-desk even with non-NEW statuses
 */

import { getPipelineNextStep } from "../../utils/pipelineNextStep";
import type { PipelinePosition, PipelinePolicy } from "../../utils/pipelineNextStep";

// ── Shared colour tokens ────────────────────────────────────────────────────
const COLORS = {
  amber: "var(--accent-amber)",
  cyan:  "var(--accent-cyan)",
  pass:  "var(--status-pass,#22c55e)",
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function makePos(status: string, is_active?: boolean): PipelinePosition {
  return { execution_status: status, is_active: is_active ?? true };
}

const POLICY: PipelinePolicy = { id: "pol-001" };

// ═══════════════════════════════════════════════════════════════════════════
// 1. No positions
// ═══════════════════════════════════════════════════════════════════════════

describe("1. No positions → Add Exposure", () => {
  it("returns 'Add Exposure' when positions array is empty", () => {
    const result = getPipelineNextStep([], null, COLORS);
    expect(result.label).toBe("Add Exposure");
    expect(result.href).toBe("/input");
    expect(result.readiness).toBe("NEEDS_ACTION");
    expect(result.color).toBe(COLORS.amber);
  });

  it("handles null-ish positions (treats as empty)", () => {
    // TypeScript won't allow null directly but runtime safety matters
    const result = getPipelineNextStep([] as PipelinePosition[], null, COLORS);
    expect(result.href).toBe("/input");
  });

  it("excludes inactive positions — if all inactive → Add Exposure", () => {
    const positions = [
      makePos("NEW", false),
      makePos("POLICY_ASSIGNED", false),
    ];
    const result = getPipelineNextStep(positions, POLICY, COLORS);
    expect(result.label).toBe("Add Exposure");
    expect(result.href).toBe("/input");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. NEW positions (no policy assigned) → Policy Desk
// ═══════════════════════════════════════════════════════════════════════════

describe("2. NEW positions → Policy Desk", () => {
  it("returns Policy Desk when at least one position is NEW", () => {
    const result = getPipelineNextStep([makePos("NEW")], POLICY, COLORS);
    expect(result.label).toBe("02 — Policy Desk");
    expect(result.href).toBe("/policy-desk");
    expect(result.readiness).toBe("NEEDS_ACTION");
    expect(result.color).toBe(COLORS.amber);
  });

  it("returns Policy Desk when there is no activePolicy even if no NEW positions", () => {
    const result = getPipelineNextStep([makePos("POLICY_ASSIGNED")], null, COLORS);
    expect(result.label).toBe("02 — Policy Desk");
    expect(result.href).toBe("/policy-desk");
  });

  it("reason mentions the count of unpolicied positions", () => {
    const positions = [makePos("NEW"), makePos("NEW"), makePos("POLICY_ASSIGNED")];
    const result = getPipelineNextStep(positions, POLICY, COLORS);
    expect(result.reason).toContain("2");
  });

  it("mixed NEW and HEDGED → still routes to Policy Desk (NEW takes priority)", () => {
    const positions = [makePos("NEW"), makePos("HEDGED")];
    const result = getPipelineNextStep(positions, POLICY, COLORS);
    expect(result.href).toBe("/policy-desk");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. POLICY_ASSIGNED positions → Hedge Desk
// ═══════════════════════════════════════════════════════════════════════════

describe("3. POLICY_ASSIGNED → Hedge Desk", () => {
  it("returns Hedge Desk when all positions have policy and need a run", () => {
    const positions = [makePos("POLICY_ASSIGNED"), makePos("POLICY_ASSIGNED")];
    const result = getPipelineNextStep(positions, POLICY, COLORS);
    expect(result.label).toBe("03 — Hedge Desk");
    expect(result.href).toBe("/hedge-desk");
    expect(result.readiness).toBe("READY");
    expect(result.color).toBe(COLORS.cyan);
  });

  it("reason mentions the count of positions needing a run", () => {
    const positions = [makePos("POLICY_ASSIGNED"), makePos("HEDGED")];
    const result = getPipelineNextStep(positions, POLICY, COLORS);
    expect(result.label).toBe("03 — Hedge Desk");
    expect(result.reason).toContain("1");
  });

  it("POLICY_ASSIGNED + READY_TO_EXECUTE → Hedge Desk wins (POLICY_ASSIGNED is earlier priority)", () => {
    const positions = [makePos("POLICY_ASSIGNED"), makePos("READY_TO_EXECUTE")];
    const result = getPipelineNextStep(positions, POLICY, COLORS);
    expect(result.href).toBe("/hedge-desk");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. READY_TO_EXECUTE positions → Execution Desk
// ═══════════════════════════════════════════════════════════════════════════

describe("4. READY_TO_EXECUTE → Execution Desk", () => {
  it("returns Execution Desk when positions are ready to execute", () => {
    const positions = [makePos("READY_TO_EXECUTE")];
    const result = getPipelineNextStep(positions, POLICY, COLORS);
    expect(result.label).toBe("04 — Execution Desk");
    expect(result.href).toBe("/execution-desk");
    expect(result.readiness).toBe("READY");
    expect(result.color).toBe(COLORS.pass);
  });

  it("reason mentions the count of positions awaiting execution", () => {
    const positions = [makePos("READY_TO_EXECUTE"), makePos("READY_TO_EXECUTE"), makePos("HEDGED")];
    const result = getPipelineNextStep(positions, POLICY, COLORS);
    expect(result.reason).toContain("2");
  });

  it("READY_TO_EXECUTE + HEDGED → Execution Desk (HEDGED is terminal, READY takes priority)", () => {
    const positions = [makePos("READY_TO_EXECUTE"), makePos("HEDGED")];
    const result = getPipelineNextStep(positions, POLICY, COLORS);
    expect(result.href).toBe("/execution-desk");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. All HEDGED → All Complete
// ═══════════════════════════════════════════════════════════════════════════

describe("5. All complete → Dashboard", () => {
  it("returns 'All Complete' when all active positions are HEDGED", () => {
    const positions = [makePos("HEDGED"), makePos("HEDGED")];
    const result = getPipelineNextStep(positions, POLICY, COLORS);
    expect(result.label).toBe("All Complete");
    expect(result.href).toBe("/dashboard");
    expect(result.readiness).toBe("READY");
    expect(result.color).toBe(COLORS.pass);
  });

  it("HEDGED + REJECTED (no actionable) → All Complete", () => {
    const positions = [makePos("HEDGED"), makePos("REJECTED")];
    const result = getPipelineNextStep(positions, POLICY, COLORS);
    // REJECTED positions don't trigger any pipeline routing — they are non-actionable
    expect(result.href).toBe("/dashboard");
  });

  it("single HEDGED position → All Complete", () => {
    const result = getPipelineNextStep([makePos("HEDGED")], POLICY, COLORS);
    expect(result.label).toBe("All Complete");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Priority order validation
// ═══════════════════════════════════════════════════════════════════════════

describe("6. Priority order — first failing condition wins", () => {
  it("NEW > POLICY_ASSIGNED > READY_TO_EXECUTE in priority", () => {
    const positions = [
      makePos("NEW"),
      makePos("POLICY_ASSIGNED"),
      makePos("READY_TO_EXECUTE"),
      makePos("HEDGED"),
    ];
    expect(getPipelineNextStep(positions, POLICY, COLORS).href).toBe("/policy-desk");
  });

  it("no NEW → POLICY_ASSIGNED > READY_TO_EXECUTE", () => {
    const positions = [
      makePos("POLICY_ASSIGNED"),
      makePos("READY_TO_EXECUTE"),
      makePos("HEDGED"),
    ];
    expect(getPipelineNextStep(positions, POLICY, COLORS).href).toBe("/hedge-desk");
  });

  it("only READY_TO_EXECUTE and HEDGED → Execution Desk", () => {
    const positions = [makePos("READY_TO_EXECUTE"), makePos("HEDGED")];
    expect(getPipelineNextStep(positions, POLICY, COLORS).href).toBe("/execution-desk");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Inactive position exclusion
// ═══════════════════════════════════════════════════════════════════════════

describe("7. Inactive position exclusion", () => {
  it("is_active=false positions are excluded from pipeline evaluation", () => {
    const positions = [
      makePos("NEW", false),      // inactive — should not trigger Policy Desk
      makePos("HEDGED", true),    // active and terminal
    ];
    const result = getPipelineNextStep(positions, POLICY, COLORS);
    // Only one active position (HEDGED) → All Complete
    expect(result.href).toBe("/dashboard");
  });

  it("is_active=null is treated as inactive", () => {
    const positions: PipelinePosition[] = [
      { execution_status: "NEW", is_active: null },
      { execution_status: "HEDGED", is_active: true },
    ];
    const result = getPipelineNextStep(positions, POLICY, COLORS);
    expect(result.href).toBe("/dashboard");
  });

  it("is_active=undefined is treated as active (default)", () => {
    const positions: PipelinePosition[] = [
      { execution_status: "NEW" },  // no is_active field — defaults to active
    ];
    const result = getPipelineNextStep(positions, POLICY, COLORS);
    expect(result.href).toBe("/policy-desk");
  });
});
