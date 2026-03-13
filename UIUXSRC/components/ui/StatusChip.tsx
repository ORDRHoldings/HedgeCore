"use client";

export type ChipStatus =
  | "PASS"
  | "FAIL"
  | "WARN"
  | "BLOCK"
  | "PENDING"
  | "DRAFT"
  | "AUTHORIZED"
  | "REJECTED"
  | "RETURNED";

export interface StatusChipProps {
  status: ChipStatus;
  size?: "sm" | "md";
  style?: React.CSSProperties;
}

type ColorSet = { bg: string; text: string; dot: string };

const colorMap: Record<ChipStatus, ColorSet> = {
  PASS:       { bg: "rgba(5, 150, 105, 0.08)",   text: "var(--accent-green)",    dot: "var(--accent-green)" },
  AUTHORIZED: { bg: "rgba(5, 150, 105, 0.08)",   text: "var(--accent-green)",    dot: "var(--accent-green)" },
  FAIL:       { bg: "rgba(220, 38, 38, 0.08)",   text: "var(--accent-red)",      dot: "var(--accent-red)" },
  REJECTED:   { bg: "rgba(220, 38, 38, 0.08)",   text: "var(--accent-red)",      dot: "var(--accent-red)" },
  BLOCK:      { bg: "rgba(220, 38, 38, 0.08)",   text: "var(--accent-red)",      dot: "var(--accent-red)" },
  WARN:       { bg: "rgba(217, 119, 6, 0.08)",   text: "var(--accent-amber)",    dot: "var(--accent-amber)" },
  PENDING:    { bg: "rgba(217, 119, 6, 0.08)",   text: "var(--accent-amber)",    dot: "var(--accent-amber)" },
  DRAFT:      { bg: "rgba(217, 119, 6, 0.08)",   text: "var(--accent-amber)",    dot: "var(--accent-amber)" },
  RETURNED:   { bg: "rgba(156, 163, 175, 0.08)", text: "var(--text-secondary)",  dot: "var(--text-secondary)" },
};

const sizeConfig = {
  sm: { padding: "2px 6px", fontSize: 12, dotSize: 4, gap: 4 },
  md: { padding: "2px 8px", fontSize: 13, dotSize: 6, gap: 6 },
};

/**
 * Status badge chip with colored dot indicator.
 * Uses CSS variables for theming.
 */
export default function StatusChip({
  status,
  size = "md",
  style,
}: StatusChipProps) {
  const colors = colorMap[status];
  const s = sizeConfig[size];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: s.gap,
        borderRadius: 999,
        fontWeight: 500,
        lineHeight: 1,
        whiteSpace: "nowrap",
        fontFamily: "var(--font-terminal-mono, 'IBM Plex Mono', monospace)",
        padding: s.padding,
        fontSize: s.fontSize,
        background: colors.bg,
        color: colors.text,
        ...style,
      }}
    >
      <span
        style={{
          width: s.dotSize,
          height: s.dotSize,
          borderRadius: "50%",
          flexShrink: 0,
          background: colors.dot,
        }}
      />
      {status}
    </span>
  );
}
