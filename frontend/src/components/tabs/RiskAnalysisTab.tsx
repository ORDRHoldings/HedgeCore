"use client";

import type { ScenarioResults, HedgePlanSummary } from '../../api/types';
import ScenarioChart from '../results/ScenarioChart';
import ScenarioTable from '../results/ScenarioTable';
import RiskMetricsPanel from './RiskMetricsPanel';

interface Props {
  scenarioResults: ScenarioResults;
  summary: HedgePlanSummary;
}

export default function RiskAnalysisTab({ scenarioResults, summary }: Props) {
  return (
    <div className="space-y-6">
      <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] backdrop-blur-[14px] rounded-xl p-4">
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Scenario Analysis</h3>
        <ScenarioChart totals={scenarioResults.totals} />
      </div>

      <RiskMetricsPanel totals={scenarioResults.totals} summary={summary} />

      <div className="bg-[var(--bg-panel)] border border-[var(--border-rim)] backdrop-blur-[14px] rounded-xl p-4">
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Scenario Totals</h3>
        <ScenarioTable totals={scenarioResults.totals} />
      </div>
    </div>
  );
}
