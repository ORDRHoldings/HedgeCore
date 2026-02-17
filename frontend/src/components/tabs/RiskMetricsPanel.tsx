"use client";

import type { ScenarioTotalResult, HedgePlanSummary } from '../../api/types';
import { fmtUSD, fmtMXN } from '../../utils/formatters';

interface Props {
  totals: ScenarioTotalResult[];
  summary: HedgePlanSummary;
}

function getWorstCaseImpact(totals: ScenarioTotalResult[]): string {
  const extreme = totals.filter(t => Math.abs(Math.abs(t.sigma) - 0.10) < 0.001);
  if (extreme.length === 0) return 'N/A';
  const worst = extreme.reduce((min, cur) =>
    cur.total_hedge_benefit_usd < min.total_hedge_benefit_usd ? cur : min,
  );
  return fmtUSD(worst.total_hedge_benefit_usd);
}

function getAverageLossReduction(totals: ScenarioTotalResult[]): string {
  if (totals.length === 0) return 'N/A';
  const sum = totals.reduce((acc, t) => acc + t.total_hedge_benefit_usd, 0);
  return fmtUSD(sum / totals.length);
}

export default function RiskMetricsPanel({ totals, summary }: Props) {
  const metrics = [
    {
      label: 'Worst-Case Net Portfolio Impact',
      sublabel: 'at \u00b110% Shock',
      value: getWorstCaseImpact(totals),
    },
    {
      label: 'Average Loss Reduction',
      sublabel: 'Across Scenarios',
      value: getAverageLossReduction(totals),
    },
    {
      label: 'Residual Sensitivity',
      sublabel: '',
      value: `${fmtMXN(summary.total_residual_mxn)} MXN`,
    },
    {
      label: 'Friction Cost',
      sublabel: '',
      value: fmtUSD(summary.total_friction_usd),
    },
  ];

  return (
    <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] backdrop-blur-[14px] rounded-xl p-4">
      <h4 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Deterministic Risk Metrics</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {metrics.map(m => (
          <div key={m.label} className="bg-[var(--bg-deep)] rounded-lg p-3 border border-[var(--border-soft)]">
            <div className="text-xs text-[var(--text-secondary)]">{m.label}</div>
            {m.sublabel && <div className="text-xs text-[var(--text-secondary)] opacity-60">{m.sublabel}</div>}
            <div className="text-lg font-mono font-semibold text-[var(--text-primary)] mt-1">{m.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
