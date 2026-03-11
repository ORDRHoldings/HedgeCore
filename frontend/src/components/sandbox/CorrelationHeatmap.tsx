"use client";

interface Props {
  factorCovariance: Record<string, unknown> | undefined;
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

function corrColor(v: number): string {
  if (v >= 0.7) return "color-mix(in srgb,var(--accent-cyan) 70%,transparent)";
  if (v >= 0.3) return "color-mix(in srgb,var(--accent-cyan) 35%,transparent)";
  if (v >= -0.3) return "var(--bg-sub)";
  if (v >= -0.7) return "color-mix(in srgb,var(--accent-red,#f87171) 35%,transparent)";
  return "color-mix(in srgb,var(--accent-red,#f87171) 70%,transparent)";
}

export default function CorrelationHeatmap({ factorCovariance }: Props) {
  if (!factorCovariance) {
    return (
      <div style={{ padding: "16px", fontFamily: S.fontUI, fontSize: 13, color: S.tertiary }}>
        No factor covariance data
      </div>
    );
  }

  // Try to extract a correlation matrix
  const matrix = factorCovariance.correlation_matrix as number[][] | undefined;
  const labels = factorCovariance.factor_labels as string[] | undefined;

  if (!matrix || !labels) {
    // Fallback: render key-value table
    return (
      <div style={{ padding: "12px 14px" }}>
        <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, marginBottom: 10 }}>
          FACTOR COVARIANCE
        </div>
        {Object.entries(factorCovariance).slice(0, 10).map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${S.soft}` }}>
            <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>{k.replace(/_/g, " ")}</span>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.primary }}>
              {typeof v === "number" ? v.toLocaleString("en", { maximumFractionDigits: 6 }) : String(v)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ padding: "12px 14px", overflowX: "auto" }}>
      <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, marginBottom: 10 }}>
        CORRELATION MATRIX
      </div>
      <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr>
            <th style={{ padding: "4px 8px", fontFamily: S.fontMono, color: S.tertiary }} />
            {labels.map(l => (
              <th key={l} style={{ padding: "4px 8px", fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, fontWeight: 700, textAlign: "center" }}>
                {l.slice(0, 6)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              <td style={{ padding: "4px 8px", fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, fontWeight: 700, whiteSpace: "nowrap" }}>
                {labels[i]?.slice(0, 8)}
              </td>
              {row.map((v, j) => (
                <td key={j} style={{
                  padding: "4px 8px", textAlign: "center",
                  fontFamily: S.fontMono, fontSize: 12, fontWeight: 600,
                  color: S.primary,
                  background: corrColor(v),
                  borderRadius: 2,
                  minWidth: 48,
                }}>
                  {v.toFixed(2)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary }}>Scale:</span>
        {[[-1, "\u22121.0"], [-0.5, "\u22120.5"], [0, "0.0"], [0.5, "+0.5"], [1, "+1.0"]].map(([v, label]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <div style={{ width: 14, height: 14, background: corrColor(v as number), borderRadius: 2 }} />
            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
