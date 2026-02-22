"use client";

import React, { useMemo } from 'react';
import type {
  BucketResult,
  HedgePlanSummary,
  PolicyConfig,
  ValidationReport,
} from '../../api/types';
import { fmtPct } from '../../utils/formatters';
import { policyComplianceChecks } from '../../utils/reportCalcs';

interface PolicyCompliancePanelProps {
  buckets: BucketResult[];
  summary: HedgePlanSummary;
  policy: PolicyConfig;
  validationReport: ValidationReport;
}

const PolicyCompliancePanel: React.FC<PolicyCompliancePanelProps> = ({
  buckets,
  summary,
  policy,
  validationReport,
}) => {
  const complianceResult = useMemo(
    () => policyComplianceChecks(buckets, summary, policy),
    [buckets, summary, policy],
  );

  const { checks, score: scorePct, classification: classLabel } = complianceResult;
  const passCount = checks.filter((c) => c.pass).length;
  const totalCount = checks.length;

  const classification = useMemo(() => {
    if (classLabel === 'ALIGNED') return { label: 'ALIGNED', color: 'var(--accent-green)' };
    if (classLabel === 'MINOR DEVIATIONS') return { label: 'MINOR DEVIATIONS', color: 'var(--accent-amber)' };
    return { label: 'BREACH', color: 'var(--accent-red)' };
  }, [classLabel]);

  return (
    <div>
      <h2 className="section-title">
        <span className="section-number">4</span>
        Policy Compliance
      </h2>

      {/* Compliance Score */}
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '48px', fontFamily: 'monospace', fontWeight: 700, color: classification.color }}>
          {scorePct}%
        </div>
        <div style={{ marginTop: '0.5rem' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, padding: '4px 12px', borderRadius: '4px', background: classification.color + '22', color: classification.color }}>
            {classification.label}
          </span>
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
          {passCount} of {totalCount} checks passed
        </div>
      </div>

      {/* Compliance Checklist */}
      <div style={{ marginBottom: '1.5rem' }}>
        {checks.map((check, i) => (
          <div
            key={i}
            style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.5rem 0', borderBottom: '1px solid var(--border-soft)' }}
          >
            <div style={{ fontSize: '16px', flexShrink: 0, width: '24px', textAlign: 'center', color: check.pass ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              {check.pass ? '\u2713' : '\u2717'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {check.label}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '0.125rem' }}>
                {check.detail}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Validation Warnings / Errors */}
      {(validationReport.errors.length > 0 || validationReport.warnings.length > 0) && (
        <div style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-soft)', borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1.5rem' }}>
          {validationReport.errors.map((err, i) => (
            <div key={'e-' + i} style={{ fontSize: '13px', color: 'var(--accent-red)', marginBottom: '0.25rem' }}>
              ERROR: {err.message ?? String(err)}
            </div>
          ))}
          {validationReport.warnings.map((warn, i) => (
            <div key={'w-' + i} style={{ fontSize: '13px', color: 'var(--accent-amber)', marginBottom: '0.25rem' }}>
              WARN: {warn}
            </div>
          ))}
        </div>
      )}

      {/* Policy Parameters Reference */}
      <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: '1rem', marginTop: '0.5rem' }}>
        <div style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
          Policy Parameters Reference
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <div>
            Bucket Mode: <strong style={{ color: 'var(--text-primary)' }}>{policy.bucket_mode}</strong>
          </div>
          <div>
            Confirmed Ratio:{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{fmtPct(policy.hedge_ratios.confirmed)}</strong>
          </div>
          <div>
            Forecast Ratio:{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{fmtPct(policy.hedge_ratios.forecast)}</strong>
          </div>
          <div>
            Spread:{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{policy.cost_assumptions.spread_bps} bps</strong>
          </div>
          <div>
            Product:{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{policy.execution_product}</strong>
          </div>
          <div>
            Min Trade:{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{'$' + policy.min_trade_size_usd.toLocaleString()}</strong>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PolicyCompliancePanel;
