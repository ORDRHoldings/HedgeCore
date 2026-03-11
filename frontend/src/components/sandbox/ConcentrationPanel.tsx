"use client";

interface Props {
  concentration: Record<string, unknown> | undefined;
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

export default function ConcentrationPanel({ concentration }: Props) {
  if (!concentration) {
    return (
      <div style={{ padding: "16px", fontFamily: S.fontUI, fontSize: 13, color: S.tertiary }}>
        No concentration data
      </div>
    );
  }

  const checks = concentration.checks as Array<{ instrument: string; pct: number; limit: number; status: string }> | undefined;
  const hasBreach = concentration.has_breaches as boolean | undefined;

  return (
    <div>
      <div style={{ padding: "8px 14px", borderBottom: `1px solid ${S.rim}`, background: S.panel, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, textTransform: "uppercase" }}>
          Concentration Limits
        </span>
        {hasBreach != null && (
          <span style={{
            fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
            color: hasBreach ? S.red : S.green,
            padding: "2px 8px", borderRadius: 2,
            border: `1px solid ${hasBreach ? S.red : S.green}`,
          }}>
            {hasBreach ? "\u25cf BREACH" : "\u25cf PASS"}
          </span>
        )}
      </div>

      {checks && checks.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: S.sub }}>
              {["Instrument", "Allocation", "Limit", "Status"].map(h => (
                <th key={h} style={{ padding: "7px 14px", fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.tertiary, textAlign: "left", borderBottom: `1px solid ${S.rim}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {checks.map((c, i) => {
              const statusColor = c.status === "BREACH" ? S.red : c.status === "WARNING" ? S.amber : S.green;
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${S.soft}` }}>
                  <td style={{ padding: "9px 14px", fontFamily: S.fontMono, fontSize: 12, color: S.primary }}>{c.instrument}</td>
                  <td style={{ padding: "9px 14px", fontFamily: S.fontMono, fontSize: 12, color: S.primary }}>{(c.pct * 100).toFixed(1)}%</td>
                  <td style={{ padding: "9px 14px", fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{(c.limit * 100).toFixed(0)}%</td>
                  <td style={{ padding: "9px 14px" }}>
                    <span style={{
                      fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: statusColor,
                      padding: "2px 7px", borderRadius: 2, border: `1px solid ${statusColor}`,
                      background: `color-mix(in srgb, ${statusColor} 10%, transparent)`,
                    }}>\u25cf {c.status}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
          {Object.entries(concentration).slice(0, 10).map(([k, v]) => (
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
