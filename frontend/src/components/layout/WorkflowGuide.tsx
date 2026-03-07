"use client";

/**
 * WorkflowGuide — "Where am I" guidance strip
 *
 * 32px bar rendered immediately below the breadcrumb on every workflow page.
 * Shows step N of 6, instruction text, and a dynamic status indicator.
 */

import type { WorkflowStep } from "./WorkflowBreadcrumb";

const FM = "var(--font-terminal-mono,'IBM Plex Mono',monospace)";
const FU = "var(--font-terminal,'IBM Plex Sans',sans-serif)";
const CYAN = "var(--accent-cyan)";
const GREEN = "var(--status-pass,#22c55e)";
const RIM = "var(--border-rim)";

interface GuideConfig {
  step: number;
  instruction: string;
  next: string;
}

const GUIDE_MAP: Record<string, GuideConfig> = {
  // Pipeline phases (primary flow — all within /hedge-desk)
  "select":    { step: 1, instruction: "Select positions to include in this hedge run",           next: "Generate hedge plan" },
  "calculate": { step: 2, instruction: "Confirm market snapshot and generate the hedge plan",     next: "Review risk assessment" },
  "risk":      { step: 3, instruction: "Review compliance, VaR, and pre-trade cost assessment",   next: "Review & approve" },
  "review":    { step: 4, instruction: "Review execution plan and submit for approval",           next: "Execute trades" },
  "execute":   { step: 5, instruction: "Confirm trade tickets and record execution fills",        next: "Complete" },
  "complete":  { step: 0, instruction: "Hedge run complete. Review summary and next steps.",      next: "" },
  "overview":  { step: 0, instruction: "Hedge Desk — Start a new run or resume an existing one", next: "" },
  // Legacy page paths (still functional for direct URL access)
  "/position-desk":        { step: 1, instruction: "Load, import, or connect FX exposures",                          next: "Assign policy" },
  "/input":                { step: 1, instruction: "Enter new FX exposure details manually",                         next: "Save & view positions" },
  "/position-desk/import": { step: 1, instruction: "Upload CSV/XLSX with FX exposure data",                          next: "Review & import" },
  "/policy-desk":          { step: 2, instruction: "Bind a policy to each position to govern hedge parameters",       next: "Calculate hedges" },
  "/calculate":            { step: 3, instruction: "Select positions, review market data, run the hedge engine",       next: "Review results" },
  "/hedge-desk":           { step: 4, instruction: "Execute the hedge pipeline: propose, review, approve",             next: "View results" },
  "/results":              { step: 5, instruction: "Review hedge schedule, rationale, and audit artifacts",            next: "" },
};

const TOTAL_STEPS = 5;

interface Props {
  active: WorkflowStep;
  pathname?: string;
  /** Pipeline phase index (0-5). When provided, resolves guide from phase. */
  pipelinePhase?: number;
  /** Optional dynamic status text — overrides default "next" */
  statusText?: string;
  /** Optional status color override */
  statusColor?: "amber" | "green" | "cyan";
  /** Show completion banner instead of guide strip */
  complete?: boolean;
}

const COLOR_MAP = {
  amber: "var(--accent-amber)",
  green: GREEN,
  cyan:  CYAN,
};

const PHASE_KEYS: string[] = ["select", "calculate", "risk", "review", "execute", "complete"];

export default function WorkflowGuide({ active, pathname, pipelinePhase, statusText, statusColor, complete }: Props) {
  // Resolve config: prefer pipelinePhase, then pathname, then active key
  let config: GuideConfig;
  if (pipelinePhase !== undefined && PHASE_KEYS[pipelinePhase]) {
    config = GUIDE_MAP[PHASE_KEYS[pipelinePhase]] ?? GUIDE_MAP["select"]!;
  } else if (pathname && GUIDE_MAP[pathname]) {
    config = GUIDE_MAP[pathname]!;
  } else {
    config = GUIDE_MAP[active] ?? GUIDE_MAP["select"]!;
  }

  if (complete) {
    return (
      <div style={{
        height: 32,
        background: `color-mix(in srgb, ${GREEN} 6%, transparent)`,
        borderBottom: `1px solid ${RIM}`,
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        gap: 10,
        flexShrink: 0,
      }}>
        <span style={{
          fontFamily: FM,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: GREEN,
        }}>
          WORKFLOW COMPLETE
        </span>
        <span style={{
          fontFamily: FU,
          fontSize: 11,
          color: "var(--text-secondary)",
        }}>
          Hedge run complete. Review summary below or start a new run.
        </span>
      </div>
    );
  }

  if (config.step === 0) {
    // Overview mode — no step number
    return (
      <div style={{
        height: 32,
        background: `color-mix(in srgb, ${CYAN} 4%, transparent)`,
        borderBottom: `1px solid ${RIM}`,
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        gap: 16,
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: FU, fontSize: 11, color: "var(--text-secondary)", flex: 1 }}>
          {config.instruction}
        </span>
      </div>
    );
  }

  const resolvedColor = statusColor ? COLOR_MAP[statusColor] : (config.step === TOTAL_STEPS ? GREEN : CYAN);
  const resolvedStatus = statusText ?? config.next;

  return (
    <div style={{
      height: 32,
      background: `color-mix(in srgb, ${CYAN} 4%, transparent)`,
      borderBottom: `1px solid ${RIM}`,
      display: "flex",
      alignItems: "center",
      padding: "0 20px",
      gap: 16,
      flexShrink: 0,
    }}>
      {/* Left: step badge */}
      <span style={{
        fontFamily: FM,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.1em",
        color: CYAN,
        flexShrink: 0,
      }}>
        STEP {config.step} OF {TOTAL_STEPS}
      </span>

      {/* Center: instruction */}
      <span style={{
        fontFamily: FU,
        fontSize: 11,
        color: "var(--text-secondary)",
        flex: 1,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}>
        {config.instruction}
      </span>

      {/* Right: status */}
      {resolvedStatus && (
        <span style={{
          fontFamily: FM,
          fontSize: 10,
          color: resolvedColor,
          flexShrink: 0,
        }}>
          {resolvedStatus}
        </span>
      )}
    </div>
  );
}
