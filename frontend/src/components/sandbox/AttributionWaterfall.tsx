"use client";

interface Props {
  navAttribution: Record<string, unknown> | undefined;
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

export default function AttributionWaterfall({ navAttribution }: Props) {
  if (!navAttribution) {
    return (
      <div style={{ padding: "16px", fontFamily: S.fontUI, fontSize: 13, color: S.tertiary }}>
        No NAV attribution data
      </div>
    );
  }

  // Extract factors from navAttribution
  const factors = (navAttribution.factors as Array<{ name: string; contribution: number }> | undefined) ?? [];
  const total = (navAttribution.total_pnl as number | undefined) ?? 0;
  const maxAbs = Math.max(...factors.map(f => Math.abs(f.contribution)), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <div style={{ padding: "8px 14px", borderBottom: `1px solid ${S.rim}`, background: S.panel, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, textTransform: "uppercase" }}>NAV Attribution Waterfall</span>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: total >= 0 ? S.green : S.red }}>
          {total >= 0 ? "+" : ""}{total.toLocaleString("en", { maximumFractionDigits: 0 })} USD
        </span>
      </div>
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {factors.length === 0 ? (
          // Show key-value pairs if no structured factors
          Object.entries(navAttribution).slice(0, 8).map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: `1px solid ${S.soft}` }}>
              <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, textTransform: "capitalize" }}>
                {k.replace(/_/g, " ")}
              </span>
              <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 600, color: S.primary }}>
                {typeof v === "number" ? v.toLocaleString("en", { maximumFractionDigits: 4 }) : String(v)}
              </span>
            </div>
          ))
        ) : (
          factors.map((f, i) => {
            const isPos = f.contribution >= 0;
            const pct = (Math.abs(f.contribution) / maxAbs) * 100;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, width: 140, flexShrink: 0 }}>{f.name}</span>
                <div style={{ flex: 1, position: "relative", height: 18, background: S.sub, borderRadius: 2 }}>
                  <div style={{
                    position: "absolute",
                    top: 0, bottom: 0,
                    [isPos ? "left" : "right"]: 0,
                    width: `${pct}%`,
                    background: isPos ? S.green : S.red,
                    borderRadius: 2,
                    opacity: 0.6,
                  }} />
                </div>
                <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: isPos ? S.green : S.red, width: 80, textAlign: "right" }}>
                  {isPos ? "+" : ""}{f.contribution.toLocaleString("en", { maximumFractionDigits: 0 })}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
