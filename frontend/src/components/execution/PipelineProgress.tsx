"use client";

/**
 * PipelineProgress — 4-step horizontal progress indicator
 *
 * Shows: REVIEW → CALCULATE → RISK CHECK → EXECUTE
 * Active step is cyan, completed steps green, future steps muted.
 */

import type { PipelineStep } from "@/lib/execution/pipelineState";

const FM = "var(--font-terminal-mono,'IBM Plex Mono',monospace)";
const CYAN = "var(--accent-cyan)";
const GREEN = "var(--status-pass,#22c55e)";
const MUTED = "var(--text-tertiary)";
const RIM = "var(--border-rim)";

const STEPS: { num: PipelineStep; label: string; desc: string }[] = [
  { num: 1, label: "REVIEW",     desc: "Select positions" },
  { num: 2, label: "CALCULATE",  desc: "Run hedge engine" },
  { num: 3, label: "RISK CHECK", desc: "Compliance & VaR" },
  { num: 4, label: "EXECUTE",    desc: "Contract tickets" },
];

interface Props {
  step: PipelineStep;
  onStepClick?: (step: PipelineStep) => void;
}

export default function PipelineProgress({ step, onStepClick }: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: 48,
        padding: "0 20px",
        gap: 0,
        background: "var(--bg-panel)",
        borderBottom: `1px solid ${RIM}`,
        flexShrink: 0,
      }}
    >
      {STEPS.map((s, i) => {
        const isActive = s.num === step;
        const isDone = s.num < step;
        const color = isActive ? CYAN : isDone ? GREEN : MUTED;
        const canClick = isDone && onStepClick;

        return (
          <div key={s.num} style={{ display: "flex", alignItems: "center" }}>
            <button
              onClick={() => canClick && onStepClick(s.num)}
              disabled={!canClick}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                height: 48,
                padding: "0 16px",
                background: isActive ? "rgba(0,255,255,0.05)" : "transparent",
                border: "none",
                borderBottom: isActive
                  ? `2px solid ${CYAN}`
                  : isDone
                    ? `2px solid ${GREEN}`
                    : "2px solid transparent",
                cursor: canClick ? "pointer" : "default",
                fontFamily: FM,
                transition: "all 0.15s",
              }}
            >
              {/* Step circle */}
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  border: `1.5px solid ${color}`,
                  background: isDone ? color : isActive ? "rgba(0,255,255,0.12)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  color: isDone ? "var(--bg-deep)" : color,
                  flexShrink: 0,
                  fontFamily: FM,
                }}
              >
                {isDone ? "✓" : s.num}
              </span>
              <div style={{ textAlign: "left" }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: isActive ? 700 : 500,
                    letterSpacing: "0.10em",
                    color,
                    lineHeight: 1.2,
                  }}
                >
                  {s.label}
                </div>
                <div
                  style={{
                    fontSize: 8,
                    color: MUTED,
                    letterSpacing: "0.04em",
                    lineHeight: 1.2,
                  }}
                >
                  {s.desc}
                </div>
              </div>
            </button>

            {/* Connector */}
            {i < STEPS.length - 1 && (
              <span
                style={{
                  display: "inline-block",
                  width: 24,
                  height: 1,
                  background: isDone ? GREEN : RIM,
                  margin: "0 2px",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
