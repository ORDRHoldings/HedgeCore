"use client";

interface Props {
  tensorResult: Record<string, unknown> | undefined;
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
} as const;

export default function TensorDecompositionPanel({ tensorResult }: Props) {
  if (!tensorResult) {
    return (
      <div style={{ padding: "16px", fontFamily: S.fontUI, fontSize: 13, color: S.tertiary }}>
        No tensor decomposition data
      </div>
    );
  }

  const tr = tensorResult;
  const components = tr.components as Array<{ name: string; variance_explained: number; eigenvalue: number }> | undefined;
  const methodology = tr.methodology as string | undefined;

  return (
    <div>
      <div style={{ padding: "8px 14px", borderBottom: `1px solid ${S.rim}`, background: S.panel, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, textTransform: "uppercase" }}>
          Tensor / Factor Decomposition
        </span>
        {methodology && (
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{methodology}</span>
        )}
      </div>

      {components && components.length > 0 ? (
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          {components.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary, width: 24 }}>PC{i+1}</span>
              <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary, width: 120 }}>{c.name}</span>
              <div style={{ flex: 1, height: 16, background: S.sub, borderRadius: 2, position: "relative", overflow: "hidden" }}>
                <div style={{
                  position: "absolute", top: 0, bottom: 0, left: 0,
                  width: `${Math.min(c.variance_explained * 100, 100)}%`,
                  background: S.cyan, opacity: 0.6, borderRadius: 2,
                }} />
              </div>
              <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.cyan, width: 50, textAlign: "right" }}>
                {(c.variance_explained * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
          {Object.entries(tr).slice(0, 10).map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${S.soft}` }}>
              <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>{k.replace(/_/g, " ")}</span>
              <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.primary }}>
                {typeof v === "number" ? v.toLocaleString("en", { maximumFractionDigits: 6 }) : typeof v === "object" ? JSON.stringify(v).slice(0, 60) : String(v)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
