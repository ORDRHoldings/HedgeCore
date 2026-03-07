"use client";

/**
 * WorkflowGuide — "Where am I" guidance strip
 *
 * 32px bar rendered immediately below the breadcrumb on every workflow page.
 * Shows step N of 5, instruction text, and a dynamic status indicator.
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
  "/position-desk":        { step: 1, instruction: "Load, import, or connect FX exposures",                          next: "Assign policy" },
  "/input":                { step: 1, instruction: "Enter new FX exposure details manually",                         next: "Save & view positions" },
  "/position-desk/import": { step: 1, instruction: "Upload CSV/XLSX with FX exposure data",                          next: "Review & import" },
  "/policy-desk":          { step: 2, instruction: "Bind a policy to each position to govern hedge parameters",       next: "Calculate hedges" },
  "/calculate":            { step: 3, instruction: "Select positions, review market data, run the hedge engine",       next: "Review results" },
  "/hedge-desk":           { step: 4, instruction: "Execute the hedge pipeline: propose, review, approve",             next: "View results" },
  "/results":              { step: 5, instruction: "Review hedge schedule, rationale, and audit artifacts",            next: "" },
};

interface Props {
  active: WorkflowStep;
  pathname?: string;
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

export default function WorkflowGuide({ active, pathname, statusText, statusColor, complete }: Props) {
  // Resolve config from pathname or from active step
  const path = pathname ?? (
    active === "ingest" ? "/position-desk" :
    active === "policy" ? "/policy-desk" :
    active === "calculate" ? "/calculate" :
    active === "execute" ? "/hedge-desk" :
    "/results"
  );
  const config = GUIDE_MAP[path] ?? GUIDE_MAP["/position-desk"]!;

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
          ✓ WORKFLOW COMPLETE
        </span>
        <span style={{
          fontFamily: FU,
          fontSize: 11,
          color: "var(--text-secondary)",
        }}>
          Hedge schedule generated. Review artifacts below.
        </span>
      </div>
    );
  }

  const resolvedColor = statusColor ? COLOR_MAP[statusColor] : (config.step === 5 ? GREEN : CYAN);
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
        STEP {config.step} OF 5
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
