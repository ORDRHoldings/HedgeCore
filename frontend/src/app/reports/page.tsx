"use client";

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useHedge } from '../../lib/hedgeContext';
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
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        minHeight: 480, padding: "80px 24px", gap: 16, textAlign: "center",
      }}>
        {/* briefcase icon */}
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
        </svg>
        <p style={{ fontFamily: "var(--font-terminal,'IBM Plex Sans',sans-serif)", fontSize: 15, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
          No engine run available
        </p>
        <p style={{ fontFamily: "var(--font-terminal,'IBM Plex Sans',sans-serif)", fontSize: 13, color: "var(--text-tertiary)", maxWidth: 400, margin: 0 }}>
          Generate a hedge plan from the Position Desk, or explore a pre-computed simulation in the Sandbox to see sample reports.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
          <Link
            href="/input"
            style={{
              fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
              fontSize: 11, fontWeight: 700, letterSpacing: "0.07em",
              color: "var(--bg-panel)", background: "var(--accent-cyan)",
              padding: "8px 18px", borderRadius: 2, textDecoration: "none",
            }}
          >
            GO TO POSITION DESK →
          </Link>
          <Link
            href="/sandbox"
            style={{
              fontFamily: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
              fontSize: 11, fontWeight: 700, letterSpacing: "0.07em",
              color: "var(--accent-cyan)",
              border: "1px solid var(--accent-cyan)",
              padding: "8px 18px", borderRadius: 2, textDecoration: "none",
            }}
          >
            VIEW DEMO SIMULATION →
          </Link>
        </div>
      </div>
    );
  }

  const postureColor = riskPosture ? postureColors[riskPosture.posture] : 'var(--text-secondary)';

  return (
    <div className="space-y-6">
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
