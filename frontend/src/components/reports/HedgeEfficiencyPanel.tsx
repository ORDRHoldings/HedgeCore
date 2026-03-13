"use client";

import React, { useMemo } from 'react';
import type { BucketResult, HedgePlanSummary } from '../../api/types';
import { fmtMXN, fmtPct } from '../../utils/formatters';
import { bucketCoverageRatios, instrumentMix } from '../../utils/reportCalcs';
import { generateHedgeEfficiencyNarrative } from '../../utils/reportNarratives';
import NarrativeSection from './NarrativeSection';

interface HedgeEfficiencyPanelProps {
  buckets: BucketResult[];
  summary: HedgePlanSummary;
}

type CoverageStatus = 'OVER' | 'MATCHED' | 'UNDER';

const statusColor: Record<CoverageStatus, string> = {
  UNDER: 'var(--accent-amber)',
  MATCHED: 'var(--accent-green)',
  OVER: 'var(--accent-cyan)',
};

const HedgeEfficiencyPanel: React.FC<HedgeEfficiencyPanelProps> = ({ buckets, summary }) => {
  const coverageData = useMemo(() => bucketCoverageRatios(buckets), [buckets]);
  const mix = useMemo(() => instrumentMix(buckets), [buckets]);
  const narrativeParagraphs = useMemo(
    () => generateHedgeEfficiencyNarrative(buckets, summary),
    [buckets, summary],
  );

  const maxRatio = useMemo(
    () => Math.max(...coverageData.map((d) => d.ratio), 1),
    [coverageData],
  );

  const residualBias = useMemo(() => {
    if (summary.total_residual_mxn > 0) return 'LONG MXN (under-hedged)';
    if (summary.total_residual_mxn < 0) return 'SHORT MXN (over-hedged)';
    return 'NEUTRAL';
  }, [summary.total_residual_mxn]);

  const getStatus = (ratio: number): CoverageStatus =>
    ratio > 1.05 ? 'OVER' : ratio >= 0.95 ? 'MATCHED' : 'UNDER';

  return (
    <div>
      <h2 className="section-title">
        <span className="section-number">3</span>
        Hedge Efficiency
      </h2>

      {/* Per-Bucket Coverage Bars */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
          Coverage by Bucket
        </div>
        {coverageData.map((d) => {
          const status = getStatus(d.ratio);
          const barWidth = Math.min((d.ratio / maxRatio) * 100, 100) + '%';
          return (
            <div key={d.bucket} style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem', gap: '0.5rem' }}>
              <div style={{ width: '80px', fontSize: '13px', fontFamily: 'monospace', color: 'var(--text-secondary)', flexShrink: 0, textAlign: 'right' }}>
                {d.bucket}
              </div>
              <div style={{ flex: 1, height: '18px', background: 'var(--bg-deep)', borderRadius: '3px', overflow: 'hidden', border: '1px solid var(--border-soft)' }}>
                <div style={{ width: barWidth, height: '100%', background: statusColor[status], borderRadius: '2px', transition: 'width 0.3s' }} />
              </div>
              <div style={{ width: '50px', fontSize: '13px', fontFamily: 'monospace', color: 'var(--text-primary)', flexShrink: 0 }}>
                {fmtPct(d.ratio)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Coverage Detail Table */}
      <div className="table-caption">Coverage Detail</div>
      <table className="table-enterprise" style={{ width: '100%', marginBottom: '1.5rem' }}>
        <thead>
          <tr>
            <th>Bucket</th>
            <th style={{ textAlign: 'right' }}>Commercial MXN</th>
            <th style={{ textAlign: 'right' }}>Hedge Position MXN</th>
            <th style={{ textAlign: 'right' }}>Coverage %</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {coverageData.map((d, idx) => {
            const status = getStatus(d.ratio);
            const b = buckets[idx];
            return (
              <tr key={d.bucket}>
                <td style={{ fontFamily: 'monospace' }}>{d.bucket}</td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmtMXN(b?.commercial_exposure_mxn ?? 0)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmtMXN(b?.hedge_position_mxn ?? 0)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmtPct(d.ratio)}</td>
                <td>
                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', background: statusColor[status] + '22', color: statusColor[status] }}>
                    {status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Instrument Mix */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
          Instrument Mix
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
          <div style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-soft)', borderRadius: '0.5rem', padding: '0.75rem', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent-red)' }}>{mix.sellCount}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Sell (Reduce)</div>
          </div>
          <div style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-soft)', borderRadius: '0.5rem', padding: '0.75rem', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent-green)' }}>{mix.buyCount}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Buy (Add)</div>
          </div>
          <div style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-soft)', borderRadius: '0.5rem', padding: '0.75rem', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-secondary)' }}>{mix.suppressedCount}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Suppressed</div>
          </div>
        </div>
      </div>

      {/* Residual Directional Bias */}
      <div style={{ borderLeft: '4px solid var(--accent-cyan)', paddingLeft: '1rem', paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.625' }}>
          Residual directional bias:{' '}
          <strong style={{ color: 'var(--text-primary)' }}>{residualBias}</strong> with{' '}
          {fmtMXN(Math.abs(summary.total_residual_mxn))} net residual exposure.
        </p>
      </div>

      {/* Institutional Narrative */}
      <NarrativeSection paragraphs={narrativeParagraphs} />
    </div>
  );
};

export default HedgeEfficiencyPanel;
