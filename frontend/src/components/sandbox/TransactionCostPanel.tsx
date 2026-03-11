"use client";

interface Props {
  transactionCosts: Record<string, unknown> | undefined;
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

function CostRow({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: string }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "8px 14px", borderBottom: `1px solid ${S.soft}`,
    }}>
      <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.secondary }}>{label}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 13, fontWeight: 700, color: accent ?? S.primary }}>{value}</span>
        {unit && <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{unit}</span>}
      </div>
    </div>
  );
}

export default function TransactionCostPanel({ transactionCosts }: Props) {
  if (!transactionCosts) {
    return (
      <div style={{ padding: "16px", fontFamily: S.fontUI, fontSize: 13, color: S.tertiary }}>
        No transaction cost data
      </div>
    );
  }

  const tc = transactionCosts;
  const totalCost = (tc.total_cost_usd as number | undefined) ?? (tc.total_cost as number | undefined);
  const spreadCost = (tc.spread_cost_usd as number | undefined) ?? (tc.spread_cost as number | undefined);
  const impactCost = (tc.market_impact_usd as number | undefined) ?? (tc.impact_cost as number | undefined);
  const spreadBps = tc.effective_spread_bps as number | undefined;
  const impactBps = tc.market_impact_bps as number | undefined;

  const rows: Array<{ label: string; value: string; unit?: string; accent?: string }> = [];

  if (totalCost != null) rows.push({ label: "Total Transaction Cost", value: `$${Math.abs(totalCost).toLocaleString("en", { maximumFractionDigits: 0 })}`, accent: S.amber });
  if (spreadCost != null) rows.push({ label: "Bid-Ask Spread Cost", value: `$${Math.abs(spreadCost).toLocaleString("en", { maximumFractionDigits: 0 })}` });
  if (impactCost != null) rows.push({ label: "Market Impact", value: `$${Math.abs(impactCost).toLocaleString("en", { maximumFractionDigits: 0 })}` });
  if (spreadBps != null) rows.push({ label: "Effective Spread", value: spreadBps.toFixed(1), unit: "bps" });
  if (impactBps != null) rows.push({ label: "Impact (bps)", value: impactBps.toFixed(1), unit: "bps" });

  // Add remaining fields
  Object.entries(tc).forEach(([k, v]) => {
    if (typeof v === "number" && !["total_cost_usd","total_cost","spread_cost_usd","spread_cost","market_impact_usd","impact_cost","effective_spread_bps","market_impact_bps"].includes(k)) {
      rows.push({ label: k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()), value: v.toLocaleString("en", { maximumFractionDigits: 4 }) });
    }
  });

  return (
    <div>
      <div style={{ padding: "8px 14px", borderBottom: `1px solid ${S.rim}`, background: S.panel }}>
        <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: S.tertiary, textTransform: "uppercase" }}>
          Transaction Cost Analysis
        </span>
      </div>
      {rows.length === 0 ? (
        Object.entries(tc).slice(0, 8).map(([k, v]) => (
          <CostRow key={k} label={k.replace(/_/g, " ")} value={String(v)} />
        ))
      ) : (
        rows.map(r => <CostRow key={r.label} {...r} />)
      )}
    </div>
  );
}
