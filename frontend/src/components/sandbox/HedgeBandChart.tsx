"use client";

interface Props {
  hedgeBands: Record<string, unknown> | undefined;
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

export default function HedgeBandChart({ hedgeBands }: Props) {
  if (!hedgeBands) {
    return (
      <div style={{ padding: "16px", fontFamily: S.fontUI, fontSize: 13, color: S.tertiary }}>
        No hedge band data
      </div>
    );
  }

  const violations = hedgeBands.violations as Array<{ bucket: string; ratio: number; band: string }> | undefined;
  const overall = hedgeBands.overall_status as string | undefined;
  const bandMin = (hedgeBands.band_min as number | undefined) ?? 0.80;
  const bandMax = (hedgeBands.band_max as number | undefined) ?? 1.25;

  const statusColor = overall === "PASS" ? S.green : overall === "WARN" ? S.amber : S.red;

  return (
    <div>
      <div style={{ padding: "8px 14px", borderBottom: `1px solid ${S.rim}`, background: S.panel, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, textTransform: "uppercase" }}>
          Hedge Bands (IFRS 9: {(bandMin*100).toFixed(0)}%\u2013{(bandMax*100).toFixed(0)}%)
        </span>
        {overall && (
          <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: statusColor, padding: "2px 8px", border: `1px solid ${statusColor}`, borderRadius: 2 }}>
            \u25cf {overall}
          </span>
        )}
      </div>

      {violations && violations.length > 0 ? (
        <div style={{ padding: "12px 14px" }}>
          <div style={{ fontFamily: S.fontUI, fontSize: 12, color: S.amber, marginBottom: 10 }}>
            {violations.length} band violation{violations.length > 1 ? "s" : ""} detected
          </div>
          {violations.map((v, i) => (
            <div key={i} style={{
              padding: "8px 12px", marginBottom: 6, border: `1px solid ${S.amber}`, borderRadius: 3,
              background: `color-mix(in srgb, ${S.amber} 6%, transparent)`,
            }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.amber }}>
                {v.bucket}: {(v.ratio * 100).toFixed(1)}% \u2014 {v.band}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: "12px 14px" }}>
          <div style={{ padding: "10px 14px", border: `1px solid ${S.green}`, borderRadius: 3, background: `color-mix(in srgb, ${S.green} 6%, transparent)`, fontFamily: S.fontUI, fontSize: 13, color: S.green }}>
            \u2713 All buckets within IFRS 9 hedge effectiveness band ({(bandMin*100).toFixed(0)}%\u2013{(bandMax*100).toFixed(0)}%)
          </div>
          {/* Show remaining fields */}
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
            {Object.entries(hedgeBands).filter(([k]) => !["violations","overall_status","band_min","band_max"].includes(k)).slice(0, 6).map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${S.soft}` }}>
                <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>{k.replace(/_/g, " ")}</span>
                <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.primary }}>{typeof v === "number" ? v.toLocaleString("en", { maximumFractionDigits: 4 }) : String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
