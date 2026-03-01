"use client";

import { CheckIcon } from "lucide-react";

const HD = {
  navy:    "#0A1F44",
  royal:   "#1C62F2",
  emerald: "#2ECC71",
  crimson: "#E74C3C",
  slate:   "#8A9AB5",
  bgPanel: "var(--bg-panel)",
  bgSub:   "var(--bg-sub)",
  bgDeep:  "var(--bg-deep)",
  rim:     "var(--border-rim)",
  soft:    "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:    "var(--accent-cyan)",
  amber:   "var(--accent-amber)",
  fontUI:  "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:"var(--font-terminal-mono,'IBM Plex Mono',monospace)",
} as const;

interface ProgressBarProps {
  phases: string[];
  currentPhase: number;
  completedPhases: Set<number>;
  onPhaseClick: (i: number) => void;
}

export default function ProgressBar({
  phases,
  currentPhase,
  completedPhases,
  onPhaseClick,
}: ProgressBarProps) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      padding: "16px 24px",
      background: HD.bgPanel,
      borderBottom: `1px solid ${HD.rim}`,
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
            </div>

            {/* Connector line (between nodes) */}
            {i < phases.length - 1 && (
              <div style={{
                flex: 1,
                height: 2,
                minWidth: 24,
                maxWidth: 80,
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
  );
}
