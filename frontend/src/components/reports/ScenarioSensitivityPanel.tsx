"use client";

import React, { useMemo } from 'react';
import type {
  ScenarioTotalResult,
  ScenarioBucketResult,
  HedgePlanSummary,
} from '../../api/types';
import { fmtUSD, fmtPct } from '../../utils/formatters';
import { scenarioKpis, vulnerabilityRanking } from '../../utils/reportCalcs';
import ScenarioChart from '../results/ScenarioChart';

interface ScenarioSensitivityPanelProps {
  totals: ScenarioTotalResult[];
  perBucket: ScenarioBucketResult[];
  summary: HedgePlanSummary;
}

const ScenarioSensitivityPanel: React.FC<ScenarioSensitivityPanelProps> = ({
  totals,
  perBucket,
  summary,
}) => {
  const kpis = useMemo(() => scenarioKpis(totals, summary), [totals, summary]);
  const ranking = useMemo(() => vulnerabilityRanking(perBucket, totals), [perBucket, totals]);

  const totalWorstCase = useMemo(
    () => ranking.reduce((s, r) => s + Math.abs(r.worstCaseImpact), 0) || 1,
    [ranking],
  );

  const kpiCards = useMemo(
    () => [
      { label: 'Worst-Case Loss', value: fmtUSD(kpis.worstCaseLoss) },
      { label: 'Avg Loss Reduction', value: fmtUSD(kpis.avgLossReduction) },
      { label: 'Tail Risk Reduction', value: fmtPct(kpis.tailRiskReductionPct) },
      { label: 'Efficiency Ratio', value: kpis.efficiencyPerDollar.toFixed(2) },
    ],
    [kpis],
  );

  return (
    <div>
      <h2 className="section-title">
        <span className="section-number">5</span>
        Scenario Sensitivity
      </h2>

      {/* Scenario KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        {kpiCards.map((card) => (
          <div key={card.label} style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-soft)', borderRadius: '0.5rem', padding: '0.75rem' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
              {card.label}
            </div>
            <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Scenario Chart */}
      <div style={{ marginBottom: '1.5rem' }}>
        <ScenarioChart totals={totals} />
      </div>

      {/* Vulnerability Ranking Table */}
      <div className="table-caption">Vulnerability Ranking</div>
      <table className="table-enterprise" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Bucket</th>
            <th style={{ textAlign: 'right' }}>Worst-Case Impact USD</th>
            <th style={{ textAlign: 'right' }}>% of Total</th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((row, i) => {
            const pctOfTotal = Math.abs(row.worstCaseImpact) / totalWorstCase;
            const isTop = i === 0;
            return (
              <tr
                key={row.bucket}
                style={
                  isTop
                    ? { backgroundColor: 'color-mix(in srgb, var(--accent-red) 5%, transparent)' }
                    : undefined
                }
              >
                <td style={{ fontFamily: 'monospace', fontWeight: isTop ? 700 : 400 }}>
                  {i + 1}
                </td>
                <td style={{ fontFamily: 'monospace' }}>{row.bucket}</td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                  {fmtUSD(row.worstCaseImpact)}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                  {fmtPct(pctOfTotal)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ScenarioSensitivityPanel;
