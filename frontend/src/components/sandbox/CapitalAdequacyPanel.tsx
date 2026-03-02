"use client";

interface Props {
  capitalAdequacy: Record<string, unknown> | undefined;
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

export default function CapitalAdequacyPanel({ capitalAdequacy }: Props) {
  if (!capitalAdequacy) {
    return (
      <div style={{ padding: "16px", fontFamily: S.fontUI, fontSize: 13, color: S.tertiary }}>
        No capital adequacy data
      </div>
    );
  }

  const ca = capitalAdequacy;

  const metrics: Array<[string, unknown, string?]> = [
    ["SA-CCR EAD", ca.ead_usd ?? ca.ead, "USD"],
    ["CVA Capital", ca.cva_capital ?? ca.cva, "USD"],
    ["ISDA SIMM IM", ca.simm_im ?? ca.initial_margin_simm, "USD"],
    ["Leverage Ratio Exp.", ca.leverage_ratio_exposure, "USD"],
    ["RWA FX", ca.rwa_fx ?? ca.rwa, "USD"],
    ["Capital Charge", ca.total_capital_charge ?? ca.capital_charge, "USD"],
    ["Tier 1 Req.", ca.tier1_requirement, "%"],
  ];

  const overall = ca.overall_status as string | undefined;
  const statusColor = overall === "PASS" ? S.green : overall === "WARN" ? S.amber : S.red;

  return (
    <div>
      <div style={{ padding: "8px 14px", borderBottom: `1px solid ${S.rim}`, background: S.panel, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, textTransform: "uppercase" }}>
          Capital Adequacy (SA-CCR / Basel III)
        </span>
        {overall && (
          <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: statusColor, padding: "2px 8px", border: `1px solid ${statusColor}`, borderRadius: 2 }}>
            \u25cf {overall}
          </span>
        )}
      </div>
      <div>
        {metrics.filter(([, v]) => v != null).map(([label, value, unit], i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 14px", borderBottom: `1px solid ${S.soft}` }}>
            <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>{label}</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 600, color: S.primary }}>
                {typeof value === "number"
                  ? unit === "%"
                    ? `${value.toFixed(2)}%`
                    : `$${value.toLocaleString("en", { maximumFractionDigits: 0 })}`
                  : String(value)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
