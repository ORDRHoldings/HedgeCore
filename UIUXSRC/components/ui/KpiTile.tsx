"use client";

export interface KpiTileProps {
  label: string;
  value: string | number;
  previousValue?: string | number;
  delta?: string;
  deltaDirection?: "positive" | "negative" | "neutral";
  unit?: string;
  style?: React.CSSProperties;
}

/**
 * Single KPI display tile with optional delta indicator.
 * Uses CSS variables for theming.
 */
export default function KpiTile({
  label,
  value,
  previousValue,
  delta,
  deltaDirection = "neutral",
  unit,
  style,
}: KpiTileProps) {
  const deltaColor =
    deltaDirection === "positive"
      ? "var(--accent-green)"
      : deltaDirection === "negative"
      ? "var(--accent-red)"
      : "var(--text-tertiary)";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: "8px 12px",
        background: "var(--bg-panel)",
        border: "1px solid var(--border-rim)",
        borderRadius: 4,
        ...style,
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          fontFamily: "var(--font-terminal, 'IBM Plex Sans', sans-serif)",
          color: "var(--text-secondary)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          lineHeight: 1,
        }}
      >
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "var(--font-terminal-mono, 'IBM Plex Mono', monospace)",
            fontVariantNumeric: "tabular-nums",
            color: "var(--text-primary)",
            lineHeight: 1.2,
          }}
        >
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{unit}</span>
        )}
      </div>
      {(previousValue !== undefined || delta) && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, lineHeight: 1 }}>
          {previousValue !== undefined && (
            <span
              style={{
                color: "var(--text-tertiary)",
                textDecoration: "line-through",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {previousValue}
            </span>
          )}
          {delta && (
            <span
              style={{
                fontWeight: 500,
                fontVariantNumeric: "tabular-nums",
                color: deltaColor,
              }}
            >
              {delta}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
