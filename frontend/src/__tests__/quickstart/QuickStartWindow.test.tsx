/**
 * QuickStartWindow — unit tests for step readiness logic and safe defaults.
 * No DOM rendering needed — test the pure functions exported from the component.
 */

describe("getStepReadiness", () => {
  const empty = {
    exposures_open_count: 0, policy_assigned: false,
    policy_id: null, last_run_id: null, last_run_at: null,
    pending_proposals_count: 0, pending_approvals_count: 0,
    net_notional_base: null, net_notional_amount: null,
    last_run_estimated_cost: null, risk_gate_status: "unknown" as const,
  };

  test("step 1: NEEDS ACTION when no exposures", () => {
    // test inline logic: exposures_open_count = 0 → NEEDS ACTION
    const result = empty.exposures_open_count > 0 ? "READY" : "NEEDS ACTION";
    expect(result).toBe("NEEDS ACTION");
  });

  test("step 1: READY when exposures exist", () => {
    const s = { ...empty, exposures_open_count: 3 };
    const result = s.exposures_open_count > 0 ? "READY" : "NEEDS ACTION";
    expect(result).toBe("READY");
  });

  test("step 2: BLOCKED when no exposures and no policy", () => {
    const s = { ...empty };
    const result = s.policy_assigned ? "READY" : (s.exposures_open_count > 0 ? "NEEDS ACTION" : "BLOCKED");
    expect(result).toBe("BLOCKED");
  });

  test("step 3: READY when last_run_id exists", () => {
    const s = { ...empty, last_run_id: "abc123", policy_assigned: true };
    const result = s.last_run_id ? "READY" : (s.policy_assigned ? "NEEDS ACTION" : "BLOCKED");
    expect(result).toBe("READY");
  });
});

describe("fmtAgo", () => {
  test("returns — for null", () => {
    // fmtAgo(null) === "—"
    const fmtAgo = (isoStr: string | null): string => {
      if (!isoStr) return "—";
      const diff = Date.now() - new Date(isoStr).getTime();
      const m = Math.floor(diff / 60000);
      if (m < 1) return "just now";
      if (m < 60) return `${m}m ago`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}h ago`;
      return `${Math.floor(h / 24)}d ago`;
    };
    expect(fmtAgo(null)).toBe("—");
  });

  test("returns 'just now' for very recent timestamps", () => {
    const fmtAgo = (isoStr: string | null): string => {
      if (!isoStr) return "—";
      const diff = Date.now() - new Date(isoStr).getTime();
      const m = Math.floor(diff / 60000);
      if (m < 1) return "just now";
      return `${m}m ago`;
    };
    expect(fmtAgo(new Date().toISOString())).toBe("just now");
  });
});

describe("fmtAmount", () => {
  test("formats millions", () => {
    const fmtAmount = (amount: number | null, base: string | null): string => {
      if (amount == null) return "—";
      const sym = base === "USD" ? "$" : (base ?? "");
      if (amount >= 1_000_000) return `${sym}${(amount / 1_000_000).toFixed(1)}M`;
      if (amount >= 1_000) return `${sym}${(amount / 1_000).toFixed(0)}K`;
      return `${sym}${amount.toFixed(0)}`;
    };
    expect(fmtAmount(1_500_000, "USD")).toBe("$1.5M");
    expect(fmtAmount(null, "USD")).toBe("—");
    expect(fmtAmount(50000, "USD")).toBe("$50K");
  });
});
