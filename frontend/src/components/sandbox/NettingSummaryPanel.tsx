"use client";

interface Props {
  currencyNetting?: Record<string, unknown> | undefined;
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
  green:    "var(--status-pass,#22c55e)",
} as const;

export default function NettingSummaryPanel({ currencyNetting }: Props) {
  if (!currencyNetting) {
    return (
      <div style={{ padding: "16px", fontFamily: S.fontUI, fontSize: 13, color: S.tertiary }}>
        No currency netting data
      </div>
    );
  }

  const cn = currencyNetting;
  const pairs = cn.pairs as Array<{ pair: string; gross: number; net: number; netting_ratio: number }> | undefined;
  const totalGross = cn.total_gross_usd as number | undefined;
  const totalNet = cn.total_net_usd as number | undefined;
  const nettingBenefit = cn.netting_benefit_usd as number | undefined;

  return (
    <div>
      <div style={{ padding: "8px 14px", borderBottom: `1px solid ${S.rim}`, background: S.panel, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, textTransform: "uppercase" }}>
          Currency Netting Summary
        </span>
        {nettingBenefit != null && (
          <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.green }}>
            Benefit: ${nettingBenefit.toLocaleString("en", { maximumFractionDigits: 0 })}
          </span>
        )}
      </div>

      {totalGross != null && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0, borderBottom: `1px solid ${S.rim}` }}>
          {[["Total Gross", totalGross], ["Total Net", totalNet ?? 0], ["Netting Benefit", nettingBenefit ?? 0]].map(([label, value]) => (
            <div key={label as string} style={{ padding: "10px 14px", borderRight: `1px solid ${S.soft}` }}>
              <div style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.tertiary, letterSpacing: "0.08em", marginBottom: 4 }}>{label as string}</div>
              <div style={{ fontFamily: S.fontMono, fontSize: 14, fontWeight: 700, color: label === "Netting Benefit" ? S.green : S.primary }}>
                ${(value as number).toLocaleString("en", { maximumFractionDigits: 0 })}
              </div>
            </div>
          ))}
        </div>
      )}

      {pairs && pairs.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: S.sub }}>
              {["Pair", "Gross", "Net", "Netting Ratio"].map(h => (
                <th key={h} style={{ padding: "7px 14px", fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.tertiary, textAlign: "left", borderBottom: `1px solid ${S.rim}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pairs.map((p, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${S.soft}` }}>
                <td style={{ padding: "8px 14px", fontFamily: S.fontMono, fontSize: 12, color: S.cyan }}>{p.pair}</td>
                <td style={{ padding: "8px 14px", fontFamily: S.fontMono, fontSize: 12, color: S.primary }}>${p.gross?.toLocaleString("en", { maximumFractionDigits: 0 })}</td>
                <td style={{ padding: "8px 14px", fontFamily: S.fontMono, fontSize: 12, color: S.primary }}>${p.net?.toLocaleString("en", { maximumFractionDigits: 0 })}</td>
                <td style={{ padding: "8px 14px", fontFamily: S.fontMono, fontSize: 12, color: S.green }}>{(p.netting_ratio * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(!pairs || pairs.length === 0) && (
        <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
          {Object.entries(cn).slice(0, 8).map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${S.soft}` }}>
              <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>{k.replace(/_/g, " ")}</span>
              <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.primary }}>{typeof v === "number" ? v.toLocaleString("en", { maximumFractionDigits: 4 }) : String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
