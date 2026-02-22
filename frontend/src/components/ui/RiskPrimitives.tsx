"use client";

/**
 * RiskPrimitives.tsx
 * Shared primitive components for risk score display.
 * Used by both /polisophic page and the PolisophicMiniWidget on the dashboard.
 */

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  rim:     "var(--border-rim)",
  soft:    "var(--border-soft)",
  pass:    "var(--status-pass)",
  amber:   "var(--accent-amber)",
  fail:    "var(--accent-red,#B91C1C)",
  secondary: "var(--text-secondary)",
} as const;

export type Regime = "HIGH" | "ELEVATED" | "MODERATE" | "LOW";

export function RegimeChip({ regime }: { regime: Regime | string }) {
  const map: Record<string, { color: string; border: string }> = {
    HIGH:     { color: S.fail,      border: S.fail },
    ELEVATED: { color: S.amber,     border: S.amber },
    MODERATE: { color: S.secondary, border: S.rim },
    LOW:      { color: S.pass,      border: S.pass },
  };
  const { color, border } = map[regime] ?? map.MODERATE;
  return (
    <span style={{
      fontFamily: S.fontMono,
      fontSize: "0.6875rem",
      letterSpacing: "0.06em",
      padding: "1px 5px",
      border: `1px solid ${border}`,
      color,
    }}>
      {regime}
    </span>
  );
}

export function ScoreBar({ score, max = 100 }: { score: number; max?: number }) {
  const pct = Math.min((score / max) * 100, 100);
  const color = score >= 75 ? S.fail : score >= 55 ? S.amber : S.pass;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{
        width: 64, height: 5,
        background: S.soft,
        position: "relative" as const,
        flexShrink: 0,
      }}>
        <div style={{
          position: "absolute", left: 0, top: 0,
          height: "100%", width: `${pct}%`,
          background: color,
          transition: "width 0.3s",
        }} />
      </div>
      <span style={{
        fontFamily: S.fontMono,
        fontSize: "0.6875rem",
        color,
        fontWeight: 600,
        minWidth: 20,
      }}>
        {score}
      </span>
    </div>
  );
}
