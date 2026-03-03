/**
 * pipelineNextStep.ts — Smart pipeline next-step resolver
 *
 * Pure function: given current positions and active policy state,
 * returns the correct next navigation step with readiness signal and
 * human-readable reason. Used in the Position Desk header CTA.
 *
 * Extracted here so it can be unit-tested independently of the page component.
 */

// ── Design token shims (resolved at call-site via the page's S object) ──────
// The function receives color strings as arguments so it remains framework-agnostic.

export type ReadinessLevel = "READY" | "NEEDS_ACTION" | "BLOCKED";

export interface PipelineNextStep {
  label: string;
  href: string;
  reason: string;
  readiness: ReadinessLevel;
  color: string;
}

// Minimal subset of PositionRow used by this function (avoids importing the
// full Redux type from the call-site).
export interface PipelinePosition {
  is_active?: boolean | null;
  execution_status: string;
}

// Minimal subset of PolicyInstance used by this function.
export interface PipelinePolicy {
  id: string;
}

interface ColorTokens {
  amber: string;
  cyan: string;
  pass: string;
}

/**
 * getPipelineNextStep
 *
 * Evaluates the five lifecycle states in priority order and returns the
 * single most-actionable next step for the operator.
 *
 * Priority order (first match wins):
 *  1. No active positions at all → go create exposures (/input)
 *  2. Any position has no policy (NEW status) → go assign policy (/policy-desk)
 *  3. Positions have policy but need a run (POLICY_ASSIGNED) → go calculate (/hedge-desk)
 *  4. Positions are ready to execute (READY_TO_EXECUTE) → go execute (/execution-desk)
 *  5. All hedged → return to dashboard
 */
export function getPipelineNextStep(
  positions: PipelinePosition[],
  activePolicy: PipelinePolicy | null,
  colors: ColorTokens,
): PipelineNextStep {
  const activePositions = (positions ?? []).filter(
    (p) => p.is_active !== false,
  );

  if (activePositions.length === 0) {
    return {
      label: "Add Exposure",
      href: "/input",
      reason: "No exposures yet. Create your first FX position.",
      readiness: "NEEDS_ACTION",
      color: colors.amber,
    };
  }

  // Any position with no policy assigned yet
  const unpoliciedCount = activePositions.filter(
    (p) => p.execution_status === "NEW",
  ).length;

  if (unpoliciedCount > 0 || !activePolicy) {
    return {
      label: "02 — Policy Desk",
      href: "/policy-desk",
      reason: `${unpoliciedCount} position(s) need a policy assigned.`,
      readiness: "NEEDS_ACTION",
      color: colors.amber,
    };
  }

  // All positions have policy. Check if any need a hedge run.
  const needsRunCount = activePositions.filter(
    (p) => p.execution_status === "POLICY_ASSIGNED",
  ).length;

  if (needsRunCount > 0) {
    return {
      label: "03 — Hedge Desk",
      href: "/hedge-desk",
      reason: `${needsRunCount} position(s) ready to calculate.`,
      readiness: "READY",
      color: colors.cyan,
    };
  }

  // Positions have runs. Check if awaiting 4-eyes execution.
  const readyToExecCount = activePositions.filter(
    (p) => p.execution_status === "READY_TO_EXECUTE",
  ).length;

  if (readyToExecCount > 0) {
    return {
      label: "04 — Execution Desk",
      href: "/execution-desk",
      reason: `${readyToExecCount} position(s) awaiting 4-eyes execution.`,
      readiness: "READY",
      color: colors.pass,
    };
  }

  // All positions are HEDGED (or REJECTED with no actionable ones).
  return {
    label: "All Complete",
    href: "/dashboard",
    reason: "All positions are HEDGED. Review the dashboard for monitoring.",
    readiness: "READY",
    color: colors.pass,
  };
}
