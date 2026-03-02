"use client";

interface Props {
  marginBreakdown: Record<string, unknown> | undefined;
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

export default function MarginBreakdownTable({ marginBreakdown }: Props) {
  if (!marginBreakdown) {
    return (
      <div style={{ padding: "16px", fontFamily: S.fontUI, fontSize: 13, color: S.tertiary }}>
        No margin breakdown data
      </div>
    );
  }

  const mb = marginBreakdown;
  const initialMargin = mb.initial_margin as number | undefined;
  const maintenanceMargin = mb.maintenance_margin as number | undefined;
  const stressAddon = mb.stress_addon as number | undefined;
  const totalRequired = mb.total_required as number | undefined;

  const rows: Array<{ label: string; value: number | undefined; highlight?: boolean }> = [
    { label: "Initial Margin", value: initialMargin },
    { label: "Maintenance Margin", value: maintenanceMargin },
    { label: "Stress Add-on", value: stressAddon },
    { label: "Total Required", value: totalRequired, highlight: true },
  ];

  return (
    <div>
      <div style={{ padding: "8px 14px", borderBottom: `1px solid ${S.rim}`, background: S.panel }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, textTransform: "uppercase" }}>
          Margin Breakdown
        </span>
      </div>
      <div>
        {rows.filter(r => r.value != null).map(r => (
          <div key={r.label} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "9px 14px", borderBottom: `1px solid ${S.soft}`,
            background: r.highlight ? `color-mix(in srgb, ${S.cyan} 5%, transparent)` : undefined,
          }}>
            <span style={{ fontFamily: S.fontUI, fontSize: 12, color: r.highlight ? S.primary : S.secondary }}>{r.label}</span>
            <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: r.highlight ? 700 : 500, color: r.highlight ? S.cyan : S.primary }}>
              ${r.value!.toLocaleString("en", { maximumFractionDigits: 0 })}
            </span>
          </div>
        ))}
        {/* Show remaining fields */}
        {Object.entries(mb).filter(([k]) => !["initial_margin","maintenance_margin","stress_addon","total_required"].includes(k)).slice(0, 6).map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", borderBottom: `1px solid ${S.soft}` }}>
            <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>{k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</span>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.primary }}>
              {typeof v === "number" ? v.toLocaleString("en", { maximumFractionDigits: 4 }) : String(v)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
