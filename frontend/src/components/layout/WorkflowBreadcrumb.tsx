"use client";

/**
 * WorkflowBreadcrumb — 4-step pipeline progress strip
 *
 * Shows the institutional workflow:
 *   01 POSITION DESK → 02 POLICY DESK → 03 HEDGE DESK → 04 EXECUTION DESK
 *
 * Renders as a 36px sticky bar below AppTopBar.
 * Active step gets cyan underline. Completed steps get green check.
 * Right side shows "NEXT: [STEP] →" CTA button.
 */

import { useRouter } from "next/navigation";

export type WorkflowStep = "position" | "policy" | "hedge" | "execution";

interface Props {
  active: WorkflowStep;
}

const STEPS: { key: WorkflowStep; label: string; href: string; num: string }[] = [
  { key: "position",  label: "POSITION DESK",  href: "/position-desk",  num: "01" },
  { key: "policy",    label: "POLICY DESK",    href: "/policy-desk",    num: "02" },
  { key: "hedge",     label: "HEDGE DESK",     href: "/hedge-desk",     num: "03" },
  { key: "execution", label: "EXECUTION DESK", href: "/execution-desk", num: "04" },
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
                background: isActive ? "rgba(0,255,255,0.05)" : "transparent",
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
                  background: isDone ? color : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 7,
                  fontWeight: 700,
                  color: isDone ? "var(--bg-deep)" : color,
                  flexShrink: 0,
                  fontFamily: FM,
                }}
              >
                {isDone ? "✓" : step.num}
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

      {/* Right: NEXT step CTA */}
      <div style={{ flex: 1 }} />
      {activeIdx < STEPS.length - 1 && (
        <button
          onClick={() => router.push(STEPS[activeIdx + 1].href)}
          style={{
            fontFamily: FM,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.10em",
            color: CYAN,
            background: "rgba(0,255,255,0.08)",
            border: "1px solid rgba(0,255,255,0.25)",
            padding: "5px 14px",
            cursor: "pointer",
            borderRadius: 2,
            whiteSpace: "nowrap",
          }}
        >
          NEXT: {STEPS[activeIdx + 1].label} →
        </button>
      )}
    </div>
  );
}
