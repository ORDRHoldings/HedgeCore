"use client";

interface Props {
  liquidityResult: Record<string, unknown> | undefined;
}

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  panel:    "var(--bg-panel)",
  sub:      "var(--bg-sub)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  amber:    "var(--accent-amber)",
  green:    "var(--status-pass,#22c55e)",
  red:      "var(--accent-red,#f87171)",
} as const;

export default function LiquidityDashboard({ liquidityResult }: Props) {
  if (!liquidityResult) {
    return (
      <div style={{ padding: "16px", fontFamily: S.fontUI, fontSize: 13, color: S.tertiary }}>
        No liquidity estimate data
      </div>
    );
  }

  const lr = liquidityResult;
  const buckets = lr.bucket_scores as Array<{ bucket: string; score: number; adv_pct: number }> | undefined;
  const totalScore = lr.total_score as number | undefined;
  const scoreLabel = lr.score_label as string | undefined;

  const scoreColor = (s: number) => s >= 0.7 ? S.green : s >= 0.4 ? S.amber : S.red;

  return (
    <div>
      <div style={{ padding: "8px 14px", borderBottom: `1px solid ${S.rim}`, background: S.panel, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, textTransform: "uppercase" }}>
          Liquidity Estimates
        </span>
        {totalScore != null && (
          <span style={{
            fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
            color: scoreColor(totalScore),
            padding: "2px 8px", borderRadius: 2,
            border: `1px solid ${scoreColor(totalScore)}`,
            background: `color-mix(in srgb, ${scoreColor(totalScore)} 10%, transparent)`,
          }}>
            {scoreLabel ?? `Score: ${(totalScore * 100).toFixed(0)}`}
          </span>
        )}
      </div>

      {buckets && buckets.length > 0 ? (
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          {buckets.map((b, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 11, color: S.tertiary, width: 60 }}>{b.bucket}</span>
              <div style={{ flex: 1, height: 16, background: S.sub, borderRadius: 2, position: "relative", overflow: "hidden" }}>
                <div style={{
                  position: "absolute", top: 0, bottom: 0, left: 0,
                  width: `${Math.min(b.score * 100, 100)}%`,
                  background: scoreColor(b.score),
                  opacity: 0.7,
                  borderRadius: 2,
                }} />
              </div>
              <span style={{ fontFamily: S.fontMono, fontSize: 11, fontWeight: 700, color: scoreColor(b.score), width: 40, textAlign: "right" }}>
                {(b.score * 100).toFixed(0)}%
              </span>
              {b.adv_pct != null && (
                <span style={{ fontFamily: S.fontMono, fontSize: 10, color: S.tertiary, width: 60 }}>
                  {b.adv_pct.toFixed(1)}% ADV
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
          {Object.entries(lr).slice(0, 10).map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${S.soft}` }}>
              <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>{k.replace(/_/g, " ")}</span>
              <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.primary }}>
                {typeof v === "number" ? v.toLocaleString("en", { maximumFractionDigits: 4 }) : String(v)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
