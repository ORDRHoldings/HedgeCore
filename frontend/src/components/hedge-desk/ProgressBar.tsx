"use client";

import { CheckIcon } from "lucide-react";
import { T } from "./tokens";

/* ── Aliases for backward compat inside this file ─────────────────────────── */

const HD = T;

interface ProgressBarProps {
  phases: string[];
  currentPhase: number;
  completedPhases: Set<number>;
  onPhaseClick: (i: number) => void;
  positionCount?: number;
  runId?: string | null;
  instruction?: string | null;
}

export default function ProgressBar({
  phases,
  currentPhase,
  completedPhases,
  onPhaseClick,
  positionCount = 0,
  runId,
  instruction,
}: ProgressBarProps) {
  function getSubtitle(label: string): string | null {
    const upper = label.toUpperCase();
    if (upper === "SELECT")        return `${positionCount} selected`;
    if (upper === "ASSIGN POLICY") return `${positionCount} pos`;
    if (upper === "CALCULATE")     return runId ? `run: ${runId.slice(0, 8)}` : `${positionCount} pos`;
    if (upper === "COMPLETE")      return "done";
    // RISK, REVIEW, EXECUTE
    return runId ? `run: ${runId.slice(0, 8)}` : null;
  }
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      background: HD.bgPanel,
      borderBottom: `1px solid ${HD.rim}`,
    }}>
    <div style={{
      display: "flex",
      alignItems: "center",
      padding: "16px 24px 12px",
      gap: 0,
      overflowX: "auto",
    }}>
      {phases.map((label, i) => {
        const isActive    = i === currentPhase;
        const isCompleted = completedPhases.has(i);
        const isPending   = !isActive && !isCompleted;
        const isClickable = isCompleted;

        // Circle color
        const circleBg    = isCompleted ? HD.emerald : isActive ? HD.royal : "transparent";
        const circleBorder = isCompleted ? HD.emerald : isActive ? HD.royal : HD.slate;
        const circleColor  = isCompleted || isActive ? "#ffffff" : HD.slate;

        // Label color
        const labelColor = isCompleted ? HD.emerald : isActive ? HD.royal : HD.slate;
        const labelWeight = isActive ? 700 : isCompleted ? 600 : 400;

        // Connector line color
        const lineColor = isCompleted ? HD.emerald : HD.soft;

        return (
          <div key={label} style={{ display: "flex", alignItems: "center", flex: i < phases.length - 1 ? 1 : 0 }}>
            {/* Phase node */}
            <div
              onClick={() => isClickable && onPhaseClick(i)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                cursor: isClickable ? "pointer" : "default",
                flexShrink: 0,
                transition: "opacity 0.15s",
                opacity: isPending && !isActive ? 0.6 : 1,
              }}
            >
              {/* Circle */}
              <div style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: circleBg,
                border: `2px solid ${circleBorder}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s",
                boxShadow: isActive ? `0 0 0 3px color-mix(in srgb,${HD.royal} 20%,transparent)` : "none",
              }}>
                {isCompleted ? (
                  <CheckIcon size={14} color="#ffffff" strokeWidth={3} />
                ) : (
                  <span style={{
                    fontFamily: HD.fontMono,
                    fontSize: 10,
                    fontWeight: 700,
                    color: circleColor,
                    lineHeight: 1,
                  }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                )}
              </div>

              {/* Label */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <span style={{
                  fontFamily: HD.fontMono,
                  fontSize: 10,
                  fontWeight: labelWeight,
                  color: labelColor,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                  transition: "color 0.2s",
                }}>
                  {label}
                </span>
                {isActive && (() => {
                  const sub = getSubtitle(label);
                  return sub ? (
                    <span style={{
                      fontFamily: HD.fontMono,
                      fontSize: 9,
                      fontWeight: 400,
                      color: HD.secondary,
                      letterSpacing: "0.04em",
                      whiteSpace: "nowrap",
                    }}>
                      {sub}
                    </span>
                  ) : null;
                })()}
              </div>
            </div>

            {/* Connector line (between nodes) */}
            {i < phases.length - 1 && (
              <div style={{
                flex: 1,
                height: 2,
                minWidth: 24,
                maxWidth: 60,
                background: lineColor,
                margin: "0 8px",
                marginBottom: 22,
                transition: "background 0.2s",
              }} />
            )}
          </div>
        );
      })}
    </div>

    {/* Phase instruction guide */}
    {instruction && (
      <div style={{
        padding: "0 24px 10px",
        fontFamily: HD.fontUI,
        fontSize: 12,
        color: HD.secondary,
        letterSpacing: "0.01em",
        lineHeight: 1,
      }}>
        {instruction}
      </div>
    )}
    </div>
  );
}
