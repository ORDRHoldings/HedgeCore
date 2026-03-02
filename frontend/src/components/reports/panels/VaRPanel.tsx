"use client";

import type { BucketResult, ScenarioTotalResult } from "../../../api/types";
import { BucketBarChart } from "../EChartsWrapper";
import { fmtUSD } from "../../../utils/formatters";

// ── RPT-02: VaR/CVaR Report Panel ─────────────────────────────────────────────

interface VaRPanelProps {
  extendedData?: {
    factor_covariance?: {
      eigenvalues?: number[];
      condition_number?: number;
    } | null;
    mctr?: Record<string, number> | null;
  } | null;
  buckets: BucketResult[];
  scenarioTotals: ScenarioTotalResult[];
}

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel: "var(--bg-panel)",
  bgDeep: "var(--bg-deep)",
  bgSub: "var(--bg-sub)",
  rim: "var(--border-rim)",
  soft: "var(--border-soft)",
  textPrimary: "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textTertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan)",
  amber: "var(--accent-amber)",
  red: "var(--accent-red)",
  green: "var(--status-pass)",
} as const;

function KpiTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: S.bgDeep,
      border: `1px solid ${S.soft}`,
      borderRadius: 4,
      padding: "12px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}>
      <span style={{ fontSize: 10, fontFamily: S.fontMono, color: S.textTertiary, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {label}
      </span>
      <span style={{ fontSize: 20, fontFamily: S.fontMono, fontWeight: 700, color: color ?? S.textPrimary, lineHeight: 1.2 }}>
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: 10, fontFamily: S.fontMono, color: S.textTertiary }}>
          {sub}
        </span>
      )}
    </div>
  );
}

export default function VaRPanel({ extendedData, buckets, scenarioTotals }: VaRPanelProps) {
  if (scenarioTotals.length === 0) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        gap: 10,
        background: S.bgSub,
        border: `1px solid ${S.soft}`,
        borderRadius: 4,
      }}>
        <span style={{ fontSize: 12, fontFamily: S.fontMono, color: S.textTertiary, textAlign: "center" }}>
          Extended calculation required — run POST /v1/calculate/extended
        </span>
      </div>
    );
  }

  // Sort totals by sigma ascending (most negative first = worst)
  const sorted = [...scenarioTotals].sort((a, b) => a.sigma - b.sigma);

  // VaR 95%: scenario closest to -1σ (negative tail, ~-5% spot move)
  const sigma1 = sorted.find(t => t.sigma <= -0.01) ?? sorted[0];
  // VaR 99%: scenario at most negative sigma (2σ tail)
  const sigma2 = sorted[0];

  const var95 = sigma1 ? sigma1.total_hedge_benefit_usd : null;
  const var99 = sigma2 ? sigma2.total_hedge_benefit_usd : null;

  // CVaR: average of worst 20% scenarios (negative hedge benefit = loss)
  const worstCount = Math.max(1, Math.floor(sorted.length * 0.2));
  const worstScenarios = sorted.slice(0, worstCount);
  const cvar = worstScenarios.length > 0
    ? worstScenarios.reduce((s, t) => s + t.total_hedge_benefit_usd, 0) / worstScenarios.length
    : null;

  // Diversification ratio from eigenvalues
  let divRatio: string = "N/A";
  const eigenvalues = extendedData?.factor_covariance?.eigenvalues;
  if (eigenvalues && eigenvalues.length > 1) {
    const sumEigen = eigenvalues.reduce((s, v) => s + v, 0);
    const maxEigen = Math.max(...eigenvalues);
    const ratio = sumEigen > 0 ? maxEigen / sumEigen : null;
    if (ratio !== null) {
      divRatio = `${(ratio * 100).toFixed(1)}%`;
    }
  }

  // Chart data: σ levels on x-axis, USD loss (negative hedge benefit) on y-axis
  const chartData = scenarioTotals
    .slice()
    .sort((a, b) => a.sigma - b.sigma)
    .map(t => ({
      label: `${(t.sigma * 100).toFixed(0)}%σ`,
      value: Math.abs(Math.min(0, t.total_hedge_benefit_usd)),
      color: t.total_hedge_benefit_usd < 0 ? "#F87171" : "#4ADE80",
    }));

  const var95Display = var95 != null ? fmtUSD(Math.abs(Math.min(0, var95))) : "—";
  const var99Display = var99 != null ? fmtUSD(Math.abs(Math.min(0, var99))) : "—";
  const cvarDisplay = cvar != null ? fmtUSD(Math.abs(Math.min(0, cvar))) : "—";
  const var95Color = (var95 != null && var95 < 0) ? S.red : S.green;
  const var99Color = (var99 != null && var99 < 0) ? S.red : S.green;
  const cvarColor = (cvar != null && cvar < 0) ? S.red : S.green;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, fontFamily: S.fontMono, color: S.textTertiary, letterSpacing: "0.1em", textTransform: "uppercase" }}>
          VaR / CVaR ANALYSIS
        </span>
        <span style={{ fontSize: 10, fontFamily: S.fontMono, color: S.textTertiary }}>
          {scenarioTotals.length} scenarios
        </span>
      </div>

      {/* KPI Tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        <KpiTile
          label="VaR 95%"
          value={var95Display}
          sub="worst -1σ scenario"
          color={var95Color}
        />
        <KpiTile
          label="VaR 99%"
          value={var99Display}
          sub="worst -2σ scenario"
          color={var99Color}
        />
        <KpiTile
          label="CVaR (Expected Shortfall)"
          value={cvarDisplay}
          sub={`avg of worst ${worstCount} scenario${worstCount !== 1 ? "s" : ""}`}
          color={cvarColor}
        />
        <KpiTile
          label="Diversification Ratio"
          value={divRatio}
          sub={eigenvalues ? `${eigenvalues.length} factors` : "extended data required"}
          color={divRatio === "N/A" ? S.textTertiary : S.cyan}
        />
      </div>

      {/* Scenario Loss Bar Chart */}
      <div style={{ background: S.bgDeep, border: `1px solid ${S.soft}`, borderRadius: 4, padding: "12px 12px 4px" }}>
        <div style={{ fontSize: 10, fontFamily: S.fontMono, color: S.textTertiary, marginBottom: 8, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Scenario Loss by Sigma Level (USD)
        </div>
        <BucketBarChart
          data={chartData}
          yLabel="Loss USD"
          height={180}
        />
      </div>

      {/* Methodology note */}
      <div style={{
        fontSize: 10,
        fontFamily: S.fontMono,
        color: S.textTertiary,
        borderLeft: `2px solid ${S.rim}`,
        paddingLeft: 10,
        lineHeight: 1.6,
      }}>
        VaR estimated from deterministic scenario ladder. Not Monte Carlo. For regulatory VaR (Basel III / FRTB), historical simulation over 250+ trading days is required.
      </div>
    </div>
  );
}
