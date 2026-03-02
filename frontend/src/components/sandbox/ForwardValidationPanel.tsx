"use client";

interface Props {
  forwardValidation: Record<string, unknown> | undefined;
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

export default function ForwardValidationPanel({ forwardValidation }: Props) {
  if (!forwardValidation) {
    return (
      <div style={{ padding: "16px", fontFamily: S.fontUI, fontSize: 13, color: S.tertiary }}>
        No forward validation data
      </div>
    );
  }

  const fv = forwardValidation;
  const buckets = fv.buckets as Array<{ bucket: string; theoretical: number; market: number; delta_bps: number; status: string }> | undefined;

  return (
    <div>
      <div style={{ padding: "8px 14px", borderBottom: `1px solid ${S.rim}`, background: S.panel }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, textTransform: "uppercase" }}>
          Forward Rate Validation
        </span>
      </div>

      {buckets && buckets.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: S.sub }}>
              {["Bucket", "Theoretical", "Market", "Delta", "Status"].map(h => (
                <th key={h} style={{ padding: "7px 14px", fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.tertiary, textAlign: "left", borderBottom: `1px solid ${S.rim}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {buckets.map((b, i) => {
              const sc = b.status === "PASS" ? S.green : b.status === "WARN" ? S.amber : S.red;
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${S.soft}` }}>
                  <td style={{ padding: "8px 14px", fontFamily: S.fontMono, fontSize: 11, color: S.tertiary }}>{b.bucket}</td>
                  <td style={{ padding: "8px 14px", fontFamily: S.fontMono, fontSize: 12, color: S.primary }}>{b.theoretical?.toFixed(4)}</td>
                  <td style={{ padding: "8px 14px", fontFamily: S.fontMono, fontSize: 12, color: S.primary }}>{b.market?.toFixed(4)}</td>
                  <td style={{ padding: "8px 14px", fontFamily: S.fontMono, fontSize: 12, color: Math.abs(b.delta_bps ?? 0) > 5 ? S.amber : S.primary }}>{b.delta_bps?.toFixed(1)} bps</td>
                  <td style={{ padding: "8px 14px" }}>
                    <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: sc, padding: "2px 7px", border: `1px solid ${sc}`, borderRadius: 2 }}>\u25cf {b.status}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
          {Object.entries(fv).slice(0, 10).map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${S.soft}` }}>
              <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>{k.replace(/_/g, " ")}</span>
              <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.primary }}>{typeof v === "number" ? v.toLocaleString("en", { maximumFractionDigits: 6 }) : String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
