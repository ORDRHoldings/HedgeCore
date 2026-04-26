"use client";

import React, { useMemo } from 'react';
import type { BucketResult } from '../../api/types';
import { fmtMXN, fmtPct, fmtCompact } from '../../utils/formatters';
import {
  flowComposition,
  concentrationAnalysis,
  cashflowVolatility,
} from '../../utils/reportCalcs';
import { generateExposureNarrative } from '../../utils/reportNarratives';
import NarrativeSection from './NarrativeSection';

const FLOW_BAR_TEXT_DARK = '#000';
const FLOW_BAR_TEXT_LIGHT = '#fff';

interface ExposureInsightsPanelProps {
  buckets: BucketResult[];
}

const ExposureInsightsPanel: React.FC<ExposureInsightsPanelProps> = ({ buckets }) => {
  const composition = useMemo(() => flowComposition(buckets), [buckets]);
  const concentration = useMemo(() => concentrationAnalysis(buckets), [buckets]);
  const volatility = useMemo(() => cashflowVolatility(buckets), [buckets]);
  const narrativeParagraphs = useMemo(() => generateExposureNarrative(buckets), [buckets]);

  const hhiLabel = useMemo(() => {
    if (concentration.herfindahlIndex > 0.25) return { text: 'Concentrated', color: 'var(--accent-red)' };
    if (concentration.herfindahlIndex >= 0.15) return { text: 'Moderate', color: 'var(--accent-amber)' };
    return { text: 'Diversified', color: 'var(--accent-green)' };
  }, [concentration.herfindahlIndex]);

  const totalExposure = useMemo(
    () => buckets.reduce((s, b) => s + Math.abs(b.commercial_exposure_mxn), 0),
    [buckets],
  );

  const confirmedTotal = composition.confirmedTotal;
  const forecastTotal = composition.forecastTotal;
  const flowTotal = confirmedTotal + forecastTotal || 1;
  const confirmedPctStr = ((confirmedTotal / flowTotal) * 100).toFixed(0) + '%';
  const forecastPctStr = ((forecastTotal / flowTotal) * 100).toFixed(0) + '%';
  const confirmedWidthStr = (confirmedTotal / flowTotal) * 100 + '%';
  const forecastWidthStr = (forecastTotal / flowTotal) * 100 + '%';

  const insightText =
    'Exposure is ' + hhiLabel.text.toLowerCase() + ' across ' + buckets.length + ' bucket' +
    (buckets.length !== 1 ? 's' : '') + '. The peak bucket (' + concentration.peakBucket +
    ') accounts for ' + fmtPct(totalExposure > 0 ? concentration.peakAmount / totalExposure : 0) +
    ' of total commercial exposure. Cashflow variability coefficient is ' +
    volatility.coefficientOfVariation.toFixed(2) + ', indicating ' +
    (volatility.coefficientOfVariation > 0.5 ? 'high' : volatility.coefficientOfVariation > 0.25 ? 'moderate' : 'low') +
    ' timing dispersion.';

  return (
    <div>
      <h2 className="section-title">
        <span className="section-number">2</span>
        Exposure Insights
      </h2>

      {/* Concentration Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-soft)', borderRadius: '0.5rem', padding: '1rem' }}>
          <div style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
            Peak Bucket
          </div>
          <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            {concentration.peakBucket}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            {fmtMXN(concentration.peakAmount)} &mdash;{' '}
            {fmtPct(totalExposure > 0 ? concentration.peakAmount / totalExposure : 0)} of total
          </div>
        </div>
        <div style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-soft)', borderRadius: '0.5rem', padding: '1rem' }}>
          <div style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
            Concentration (HHI)
          </div>
          <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            {concentration.herfindahlIndex.toFixed(4)}
          </div>
          <div style={{ marginTop: '0.25rem' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', background: hhiLabel.color + '22', color: hhiLabel.color }}>
              {hhiLabel.text}
            </span>
          </div>
        </div>
      </div>

      {/* Confirmed vs Forecast Bar */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
          Flow Composition
        </div>
        <div style={{ display: 'flex', height: '24px', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-soft)' }}>
          <div style={{ width: confirmedWidthStr, background: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 600, color: FLOW_BAR_TEXT_DARK, minWidth: confirmedTotal > 0 ? '40px' : 0 }}>
            {confirmedTotal > 0 && confirmedPctStr}
          </div>
          <div style={{ width: forecastWidthStr, background: 'var(--accent-indigo)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 600, color: FLOW_BAR_TEXT_LIGHT, minWidth: forecastTotal > 0 ? '40px' : 0 }}>
            {forecastTotal > 0 && forecastPctStr}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
          <span>
            <span style={{ color: 'var(--accent-cyan)', marginRight: '4px' }}>&#9632;</span>
            Confirmed {fmtCompact(confirmedTotal)}
          </span>
          <span>
            <span style={{ color: 'var(--accent-indigo)', marginRight: '4px' }}>&#9632;</span>
            Forecast {fmtCompact(forecastTotal)}
          </span>
        </div>
      </div>

      {/* Cashflow Timing */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-soft)', borderRadius: '0.5rem', padding: '1rem' }}>
          <div style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
            Peak Cashflow Bucket
          </div>
          <div style={{ fontSize: '20px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            {concentration.peakBucket}
          </div>
        </div>
        <div style={{ background: 'var(--bg-deep)', border: '1px solid var(--border-soft)', borderRadius: '0.5rem', padding: '1rem' }}>
          <div style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
            Volatility Metrics
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginTop: '0.5rem' }}>
            Std Dev: <strong>{fmtCompact(volatility.stdDev)}</strong>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginTop: '0.25rem' }}>
            Coefficient of Variation: <strong>{volatility.coefficientOfVariation.toFixed(2)}</strong>
          </div>
        </div>
      </div>

      {/* Deterministic Insight */}
      <div style={{ borderLeft: '4px solid var(--accent-cyan)', paddingLeft: '1rem', paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.625' }}>
          {insightText}
        </p>
      </div>

      {/* Institutional Narrative */}
      <NarrativeSection paragraphs={narrativeParagraphs} />
    </div>
  );
};

export default ExposureInsightsPanel;
