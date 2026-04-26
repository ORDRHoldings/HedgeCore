"use client";

/**
 * WorkflowBreadcrumb — 6-step pipeline progress strip
 *
 * Shows the institutional hedge workflow phases:
 *   01 SELECT → 02 CALCULATE → 03 RISK → 04 REVIEW → 05 EXECUTE → 06 COMPLETE
 *
 * Renders as a 36px sticky bar below AppSidebar.
 * Active step gets cyan underline. Completed steps get green check.
 * Right side shows "NEXT: [STEP] →" CTA or "RETURN TO DASHBOARD".
 *
 * All steps operate within /hedge-desk — no cross-page navigation.
 */

import { useRouter } from "next/navigation";

export type WorkflowStep =
  | "ingest" | "policy" | "calculate" | "execute" | "results"  // legacy compat
  | "select" | "risk" | "review" | "complete" | "overview";     // pipeline phases

interface Props {
  active: WorkflowStep;
  /** Pipeline phase index (0-5). When provided, overrides step matching. */
  pipelinePhase?: number;
}

const STEPS: { key: WorkflowStep; label: string; num: string }[] = [
  { key: "select",    label: "SELECT",    num: "01" },
  { key: "calculate", label: "CALCULATE", num: "02" },
  { key: "risk",      label: "RISK",      num: "03" },
  { key: "review",    label: "REVIEW",    num: "04" },
  { key: "execute",   label: "EXECUTE",   num: "05" },
  { key: "complete",  label: "COMPLETE",  num: "06" },
];

// Map legacy step keys to pipeline index
const LEGACY_MAP: Record<string, number> = {
  ingest: 0, policy: 0, select: 0,
  calculate: 1,
  risk: 2,
  review: 3,
  execute: 4,
  results: 5, complete: 5,
};

const FM = "var(--font-terminal-mono,'IBM Plex Mono',monospace)";
const CYAN = "var(--accent-cyan)";
const GREEN = "var(--status-pass,#22c55e)";
const MUTED = "var(--text-tertiary)";
const RIM = "var(--border-rim)";

export default function WorkflowBreadcrumb({ active, pipelinePhase }: Props) {
  const router = useRouter();
  const activeIdx = pipelinePhase ?? LEGACY_MAP[active] ?? 0;

  return (
    <div
      style={{
        height: 36,
        background: "var(--bg-panel)",
        borderBottom: `1px solid ${RIM}`,
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        gap: 0,
        flexShrink: 0,
      }}
    >
      {/* Left: step pills */}
      {STEPS.map((step, i) => {
        const isActive = i === activeIdx;
        const isDone   = i < activeIdx;
        const color    = isActive ? CYAN : isDone ? GREEN : MUTED;
        const isLast   = i === STEPS.length - 1;

        return (
          <div key={step.key} style={{ display: "flex", alignItems: "center" }}>
            <button
              onClick={() => {
                // Steps are informational within /hedge-desk — clicking navigates to the pipeline
                if (isDone || isActive) {
                  router.push("/hedge-desk?mode=run");
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                height: 36,
                padding: "0 10px",
                background: isActive ? "rgba(28,98,242,0.08)" : "transparent",
                border: "none",
                borderBottom: isActive
                  ? `2px solid ${CYAN}`
                  : isDone
                  ? `2px solid ${GREEN}`
                  : "2px solid transparent",
                cursor: isDone || isActive ? "pointer" : "default",
                fontFamily: FM,
                fontSize: 12,
                fontWeight: isActive ? 700 : 500,
                letterSpacing: "0.12em",
                color,
                transition: "all 0.15s",
                opacity: !isDone && !isActive ? 0.6 : 1,
              }}
            >
              {/* Step indicator circle */}
              <span
                style={{
                  width: 15,
                  height: 15,
                  borderRadius: "50%",
                  border: `1.5px solid ${color}`,
                  background: isDone ? color : isActive && isLast ? GREEN : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  color: isDone ? "var(--bg-deep)" : isActive && isLast ? "var(--bg-deep)" : color,
                  flexShrink: 0,
                  fontFamily: FM,
                  borderColor: isActive && isLast ? GREEN : color,
                }}
              >
                {isDone || (isActive && isLast) ? "✓" : step.num}
              </span>
              {step.label}
            </button>

            {/* Connector arrow between steps */}
            {i < STEPS.length - 1 && (
              <span
                style={{
                  fontFamily: FM,
                  fontSize: 12,
                  color: MUTED,
                  padding: "0 2px",
                  userSelect: "none",
                }}
              >
                ›
              </span>
            )}
          </div>
        );
      })}

      {/* Right: contextual CTA */}
      <div style={{ flex: 1 }} />
      {activeIdx < STEPS.length - 1 ? (
        <span
          style={{
            fontFamily: FM,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: MUTED,
          }}
        >
          NEXT: {STEPS[activeIdx + 1]?.label}
        </span>
      ) : (
        <button
          onClick={() => router.push("/dashboard")}
          style={{
            fontFamily: FM,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.10em",
            color: GREEN,
            background: "rgba(5,150,105,0.08)",
            border: "1px solid rgba(5,150,105,0.25)",
            padding: "5px 14px",
            cursor: "pointer",
            borderRadius: 2,
            whiteSpace: "nowrap",
          }}
        >
          RETURN TO DASHBOARD
        </button>
      )}
    </div>
  );
}
