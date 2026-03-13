"use client";

import React, { useMemo } from 'react';
import type {
  BucketResult,
  HedgePlanSummary,
  ScenarioTotalResult,
  TradeRow,
  HedgeRow,
  MarketSnapshot,
  ValidationReport,
  PolicyConfig,
} from '../../api/types';
import { fmtMXN, fmtUSD, fmtPct } from '../../utils/formatters';
import { scenarioKpis, generateExecutiveNarrative } from '../../utils/reportCalcs';
import { generateExecutiveSummaryNarrative } from '../../utils/reportNarratives';
import NarrativeSection from './NarrativeSection';

interface ExecutiveSummaryPanelProps {
  summary: HedgePlanSummary;
  totals: ScenarioTotalResult[];
  buckets: BucketResult[];
  trades: TradeRow[];
  hedges: HedgeRow[];
  market: MarketSnapshot;
  validationReport: ValidationReport;
  policy: PolicyConfig;
}

const ExecutiveSummaryPanel: React.FC<ExecutiveSummaryPanelProps> = ({
  summary,
  totals,
  buckets,
  trades,
  hedges,
  market,
  validationReport,
  policy,
}) => {
  const kpis = useMemo(() => scenarioKpis(totals, summary), [totals, summary]);

  const narrative = useMemo(
    () => generateExecutiveNarrative(buckets, summary, totals, policy),
    [buckets, summary, totals, policy],
  );

  const existingCoverage = useMemo(() => {
    if (summary.total_commercial_exposure_mxn === 0) return 0;
    return Math.abs(summary.total_existing_hedges_mxn / summary.total_commercial_exposure_mxn);
  }, [summary]);

  const coverageRatio = useMemo(() => {
    if (summary.total_commercial_exposure_mxn === 0) return 0;
    return Math.abs(summary.total_hedge_position_mxn / summary.total_commercial_exposure_mxn);
  }, [summary]);

  const narrativeParagraphs = useMemo(
    () => generateExecutiveSummaryNarrative(buckets, summary, totals, policy, validationReport),
    [buckets, summary, totals, policy, validationReport],
  );

  const kpiCards = useMemo(
    () => [
      { label: 'Total Exposure', value: fmtMXN(summary.total_commercial_exposure_mxn) },
      { label: 'Existing Coverage', value: fmtPct(existingCoverage) },
      { label: 'New Action Required', value: fmtMXN(summary.total_action_mxn) },
      { label: 'Net Hedge Position', value: fmtMXN(summary.total_hedge_position_mxn) },
      { label: 'Residual Exposure', value: fmtMXN(summary.total_residual_mxn) },
      { label: 'Total Friction', value: fmtUSD(summary.total_friction_usd) },
      { label: 'Coverage Ratio', value: fmtPct(coverageRatio) },
      { label: 'Worst-Case Impact', value: fmtUSD(kpis.worstCaseLoss) },
    ],
    [summary, existingCoverage, coverageRatio, kpis],
  );

  const validationColor =
    validationReport.status === 'PASS'
      ? 'var(--accent-green)'
      : 'var(--accent-red)';

  return (
    <div>
      <h2 className="section-title">
        <span className="section-number">1</span>
        Executive Summary
      </h2>

      {/* KPI Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '1rem',
        }}
      >
        {kpiCards.map((card) => (
          <div
            key={card.label}
            style={{
              background: 'var(--bg-deep)',
              border: '1px solid var(--border-soft)',
              borderRadius: '0.5rem',
              padding: '1rem',
            }}
          >
            <div
              style={{
                fontSize: '13px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--text-secondary)',
              }}
            >
              {card.label}
            </div>
            <div
              style={{
                fontSize: '28px',
                fontFamily: 'monospace',
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginTop: '0.25rem',
              }}
            >
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Executive Narrative */}
      <div
        style={{
          background: 'var(--bg-deep)',
          borderLeft: '4px solid var(--accent-cyan)',
          paddingLeft: '1rem',
          paddingTop: '0.75rem',
          paddingBottom: '0.75rem',
          marginTop: '1.5rem',
        }}
      >
        {narrative.map((line: string, i: number) => (
          <p
            key={i}
            style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              lineHeight: '1.625',
              marginBottom: '0.25rem',
            }}
          >
            {line}
          </p>
        ))}
      </div>

      {/* Data Integrity */}
      <div
        style={{
          borderTop: '1px solid var(--border-soft)',
          paddingTop: '1rem',
          marginTop: '1.5rem',
        }}
      >
        <div
          style={{
            fontSize: '13px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-secondary)',
            marginBottom: '0.75rem',
          }}
        >
          Data Integrity
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.75rem',
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
              {trades.length}
            </span>{' '}
            trades loaded
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
              {hedges.length}
            </span>{' '}
            existing hedges
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Snapshot mode:{' '}
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
              {String(market.provider_metadata?.source ?? 'manual')}
            </span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Validation:{' '}
            <span style={{ color: validationColor, fontWeight: 600 }}>
              {validationReport.status.toUpperCase()}
            </span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Timestamp:{' '}
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
              {new Date().toISOString().slice(0, 19)}
            </span>
          </div>
        </div>
      </div>

      {/* Institutional Narrative */}
      <NarrativeSection paragraphs={narrativeParagraphs} />
    </div>
  );
};

export default ExecutiveSummaryPanel;
