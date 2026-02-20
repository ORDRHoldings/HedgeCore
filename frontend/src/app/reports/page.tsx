"use client";

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useHedge } from '../../lib/hedgeContext';
import AppTopBar from '../../components/layout/AppTopBar';
import TabBar from '../../components/tabs/TabBar';
// ExportBar removed — available from results page only
import ExecutiveSummaryPanel from '../../components/reports/ExecutiveSummaryPanel';
import ExposureInsightsPanel from '../../components/reports/ExposureInsightsPanel';
import HedgeEfficiencyPanel from '../../components/reports/HedgeEfficiencyPanel';
import PolicyCompliancePanel from '../../components/reports/PolicyCompliancePanel';
import ScenarioSensitivityPanel from '../../components/reports/ScenarioSensitivityPanel';
import { riskPostureClassification } from '../../utils/reportCalcs';

const REPORT_TABS = [
  { key: 'executive', label: 'Executive Summary' },
  { key: 'exposure', label: 'Exposure Concentration' },
  { key: 'hedge', label: 'Hedge Efficiency' },
  { key: 'compliance', label: 'Policy Compliance' },
  { key: 'scenario', label: 'Scenario Sensitivity' },
];

const postureColors: Record<string, string> = {
  CONSERVATIVE: 'var(--accent-green)',
  BALANCED: 'var(--accent-cyan)',
  AGGRESSIVE: 'var(--accent-amber)',
};

export default function ReportsPage() {
  const { result, lastInputs } = useHedge();
  const [activeTab, setActiveTab] = useState('executive');

  const riskPosture = useMemo(() => {
    if (!result) return null;
    return riskPostureClassification(result.hedge_plan.summary, result.scenario_results.totals);
  }, [result]);

  if (!result || !lastInputs) {
    return (
      <div className="text-center py-20 text-[var(--text-secondary)]">
        <p className="text-lg mb-4">No engine run available.</p>
        <Link href="/" className="text-[var(--accent-cyan)] hover:underline">
          Return to Input to execute
        </Link>
      </div>
    );
  }

  const postureColor = riskPosture ? postureColors[riskPosture.posture] : 'var(--text-secondary)';

  return (
    <div className="space-y-6">
      {/* ── App top bar ── */}
      <AppTopBar currentModule="CurrencyFX" currentPath="/currency-fx" />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-[var(--text-primary)]">Reports &amp; Insights</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Run: {result.run_id.slice(0, 8)}... &middot; {new Date(result.run_envelope.timestamp).toLocaleString()}
            </p>
          </div>
          {riskPosture && (
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded-sm border"
              style={{
                color: postureColor,
                borderColor: postureColor,
                backgroundColor: `color-mix(in srgb, ${postureColor} 10%, transparent)`,
              }}
            >
              {riskPosture.posture}
            </span>
          )}
          {lastInputs.fixtureId && (
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded-sm border"
              style={{
                color: 'var(--accent-amber)',
                borderColor: 'var(--accent-amber)',
                backgroundColor: 'color-mix(in srgb, var(--accent-amber) 10%, transparent)',
              }}
            >
              FIXTURE: {lastInputs.fixtureId}
            </span>
          )}
        </div>
        <div className="no-print" />
      </div>

      {/* Sticky Tab Navigation */}
      <div className="sticky top-0 z-30 bg-[var(--bg-deep)]">
        <TabBar tabs={REPORT_TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === 'executive' && (
          <ExecutiveSummaryPanel
            summary={result.hedge_plan.summary}
            totals={result.scenario_results.totals}
            buckets={result.hedge_plan.buckets}
            trades={lastInputs.trades}
            hedges={lastInputs.hedges}
            market={lastInputs.market}
            validationReport={result.validation_report}
            policy={lastInputs.policy}
          />
        )}
        {activeTab === 'exposure' && (
          <ExposureInsightsPanel
            buckets={result.hedge_plan.buckets}
          />
        )}
        {activeTab === 'hedge' && (
          <HedgeEfficiencyPanel
            buckets={result.hedge_plan.buckets}
            summary={result.hedge_plan.summary}
          />
        )}
        {activeTab === 'compliance' && (
          <PolicyCompliancePanel
            buckets={result.hedge_plan.buckets}
            summary={result.hedge_plan.summary}
            policy={lastInputs.policy}
            validationReport={result.validation_report}
          />
        )}
        {activeTab === 'scenario' && (
          <ScenarioSensitivityPanel
            totals={result.scenario_results.totals}
            perBucket={result.scenario_results.per_bucket}
            summary={result.hedge_plan.summary}
          />
        )}
      </div>
    </div>
  );
}
