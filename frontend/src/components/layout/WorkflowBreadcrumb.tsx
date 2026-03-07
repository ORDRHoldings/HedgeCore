"use client";

/**
 * WorkflowBreadcrumb — 5-step pipeline progress strip
 *
 * Shows the institutional workflow:
 *   01 INGEST → 02 POLICY → 03 CALCULATE → 04 EXECUTE → 05 RESULTS
 *
 * Renders as a 36px sticky bar below AppSidebar.
 * Active step gets cyan underline. Completed steps get green check.
 * Right side shows "NEXT: [STEP] →" CTA button, or "RETURN TO DASHBOARD"
 * on the final step.
 */

import { useRouter } from "next/navigation";

export type WorkflowStep = "ingest" | "policy" | "calculate" | "execute" | "results";

interface Props {
  active: WorkflowStep;
}

const STEPS: { key: WorkflowStep; label: string; href: string; num: string }[] = [
  { key: "ingest",    label: "INGEST",    href: "/position-desk", num: "01" },
  { key: "policy",    label: "POLICY",    href: "/policy-desk",   num: "02" },
  { key: "calculate", label: "CALCULATE", href: "/calculate",     num: "03" },
  { key: "execute",   label: "EXECUTE",   href: "/hedge-desk",    num: "04" },
  { key: "results",   label: "RESULTS",   href: "/results",       num: "05" },
];

const FM = "var(--font-terminal-mono,'IBM Plex Mono',monospace)";
const CYAN = "var(--accent-cyan)";
const GREEN = "var(--status-pass,#22c55e)";
const MUTED = "var(--text-tertiary)";
const RIM = "var(--border-rim)";

export default function WorkflowBreadcrumb({ active }: Props) {
  const router = useRouter();
  const activeIdx = STEPS.findIndex((s) => s.key === active);

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
        const isActive = step.key === active;
        const isDone   = i < activeIdx;
        const color    = isActive ? CYAN : isDone ? GREEN : MUTED;
        const isLast   = step.key === "results";

        return (
          <div key={step.key} style={{ display: "flex", alignItems: "center" }}>
            <button
              onClick={() => router.push(step.href)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
                height: 36,
                padding: "0 14px",
                background: isActive ? "rgba(28,98,242,0.08)" : "transparent",
                border: "none",
                borderBottom: isActive
                  ? `2px solid ${CYAN}`
                  : isDone
                  ? `2px solid ${GREEN}`
                  : "2px solid transparent",
                cursor: "pointer",
                fontFamily: FM,
                fontSize: 9,
                fontWeight: isActive ? 700 : 500,
                letterSpacing: "0.12em",
                color,
                transition: "all 0.15s",
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
                  fontSize: 7,
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
                  fontSize: 10,
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

      {/* Right: NEXT step CTA or RETURN TO DASHBOARD */}
      <div style={{ flex: 1 }} />
      {activeIdx < STEPS.length - 1 ? (
        <button
          onClick={() => router.push(STEPS[activeIdx + 1].href)}
          style={{
            fontFamily: FM,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.10em",
            color: CYAN,
            background: "rgba(28,98,242,0.08)",
            border: "1px solid rgba(28,98,242,0.25)",
            padding: "5px 14px",
            cursor: "pointer",
            borderRadius: 2,
            whiteSpace: "nowrap",
          }}
        >
          NEXT: {STEPS[activeIdx + 1].label} →
        </button>
      ) : (
        <button
          onClick={() => router.push("/dashboard")}
          style={{
            fontFamily: FM,
            fontSize: 9,
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
