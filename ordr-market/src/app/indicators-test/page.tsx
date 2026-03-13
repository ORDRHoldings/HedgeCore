'use client';
/**
 * ORDR Market — Indicator Test Harness
 *
 * Runs all 77 indicators against 300 mock EURUSD bars.
 * Groups by category. Shows PASS / EMPTY / ERROR per indicator.
 * Navigate to /indicators-test in dev server.
 */
import { useMemo, useState } from 'react';
import {
  computeSMA, computeEMA, computeWMA, computeSMMA, computeDEMA, computeTEMA,
  computeHMA, computeALMA, computeLSMA, computeMcGinley, computeVWMA,
  computeEnvelope, computeMARibbon, computeAlligator, computeIchimoku,
  computeBollinger, computeKeltner, computeDonchian, computeBBPercentB, computeBBWidth,
  computeSuperTrend, computeParabolicSAR, computeChandelierExit,
  computeChandeKrollStop, computeZigzag,
  computeAutoFib, computeAutoFibExtension,
  computeRSI, computeMACD, computeStochastic, computeStochRSI, computeWilliamsR,
  computeCCI, computeADX, computeAroon, computeAO, computeBOP, computeBBTrend,
  computeBullBearPower, computeChaikinOscillator, computeCMO, computeChoppiness,
  computeChopZone, computeConnorsRSI, computeCoppock, computeDPO, computeFisher,
  computeMassIndex, computeMomentum, computePPO, computeROC, computeRVI,
  computeSMI, computeTRIX, computeTSI, computeUltimateOscillator, computeVortex,
  computeVWAP, computeVolumeProfile, computeOBV, computeCMF, computeADL,
  computeCVD, computeCVI, computeNetVolume, computePVT, computeVolumeOscillator,
  computeAdvanceDecline,
  computeATR, computeHistoricalVolatility,
  computePivotPoints, computeADR, computeCorrelation, computeMFI, computeEFI, computeEOM,
  computeKlinger, computeKST,
  emaFromValues,
} from '@/components/chart/indicators';
import type { Bar } from '@/components/chart/indicators';

// ── Mock data ────────────────────────────────────────────────────────────────
function generateMockBars(count = 300): Bar[] {
  const bars: Bar[] = [];
  let price = 1.08250;
  const ms = 30 * 60 * 1000;
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const open  = price;
    const drift = (Math.random() - 0.487) * 0.0024;
    const pull  = (1.08300 - price) * 0.004;
    const close = +(open + drift + pull).toFixed(5);
    const range = Math.abs(drift) * 1.4 + Math.random() * 0.0014;
    const high  = +(Math.max(open, close) + range * (0.4 + Math.random() * 0.4)).toFixed(5);
    const low   = +(Math.min(open, close) - range * (0.3 + Math.random() * 0.4)).toFixed(5);
    bars.push({ t: now - (count - i) * ms, o: open, h: high, l: low, c: close,
      v: Math.floor(38_000 + Math.random() * 140_000) });
    price = close;
  }
  return bars;
}

// ── Result type ───────────────────────────────────────────────────────────────
type Status = 'PASS' | 'EMPTY' | 'ERROR';
interface Result {
  name: string;
  fn: string;
  params: string;
  status: Status;
  len: number;
  last: string;
  error?: string;
}

// ── Format last value ─────────────────────────────────────────────────────────
function fmt(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return isFinite(v) ? v.toFixed(5) : String(v);
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    const keys = Object.keys(v as object).filter(k => k !== 't').slice(0, 3);
    return keys.map(k => {
      const val = (v as Record<string, unknown>)[k];
      return `${k}: ${typeof val === 'number' ? (isFinite(val) ? val.toFixed(5) : String(val)) : String(val)}`;
    }).join('  ');
  }
  return String(v);
}

function run(name: string, fn: string, params: string, call: () => unknown): Result {
  try {
    const r = call();
    if (r === null || r === undefined) {
      return { name, fn, params, status: 'EMPTY', len: 0, last: 'null' };
    }
    if (Array.isArray(r)) {
      if (r.length === 0) return { name, fn, params, status: 'EMPTY', len: 0, last: '[]' };
      const last = r[r.length - 1];
      return { name, fn, params, status: 'PASS', len: r.length, last: fmt(last) };
    }
    if (typeof r === 'object') {
      const keys = Object.keys(r as object);
      return { name, fn, params, status: 'PASS', len: 1, last: fmt(r) };
    }
    return { name, fn, params, status: 'PASS', len: 1, last: fmt(r) };
  } catch (e) {
    return { name, fn, params, status: 'ERROR', len: 0, last: '', error: String(e) };
  }
}

// ── Category type ─────────────────────────────────────────────────────────────
interface Category { label: string; results: Result[] }

// ── Build all tests ───────────────────────────────────────────────────────────
function buildTests(bars: Bar[]): Category[] {
  return [
    {
      label: '1 · Moving Averages (15)',
      results: [
        run('SMA',             'computeSMA',        'bars, period=20',                  () => computeSMA(bars, 20)),
        run('EMA',             'computeEMA',        'bars, period=20',                  () => computeEMA(bars, 20)),
        run('EMA (helper)',    'emaFromValues',     'values[], period=20',              () => emaFromValues(bars.map(b=>b.c), 20)),
        run('WMA',             'computeWMA',        'bars, period=20',                  () => computeWMA(bars, 20)),
        run('SMMA',            'computeSMMA',       'bars, period=14',                  () => computeSMMA(bars, 14)),
        run('DEMA',            'computeDEMA',       'bars, period=20',                  () => computeDEMA(bars, 20)),
        run('TEMA',            'computeTEMA',       'bars, period=20',                  () => computeTEMA(bars, 20)),
        run('HMA',             'computeHMA',        'bars, period=9',                   () => computeHMA(bars, 9)),
        run('ALMA',            'computeALMA',       'bars, period=9, offset=0.85, σ=6', () => computeALMA(bars, 9, 0.85, 6)),
        run('LSMA',            'computeLSMA',       'bars, period=25',                  () => computeLSMA(bars, 25)),
        run('McGinley Dynamic','computeMcGinley',   'bars, period=14',                  () => computeMcGinley(bars, 14)),
        run('VWMA',            'computeVWMA',       'bars, period=20',                  () => computeVWMA(bars, 20)),
        run('Envelope',        'computeEnvelope',   'bars, period=20, pct=2.5',         () => computeEnvelope(bars, 20, 2.5)),
        run('MA Ribbon',       'computeMARibbon',   'bars',                             () => computeMARibbon(bars)),
        run('Alligator',       'computeAlligator',  'bars',                             () => computeAlligator(bars)),
        run('Ichimoku',        'computeIchimoku',   'bars, t=9, k=26, sB=52',          () => computeIchimoku(bars, 9, 26, 52)),
      ],
    },
    {
      label: '2 · Bands & Channels (5)',
      results: [
        run('Bollinger Bands',  'computeBollinger',   'bars, period=20, stdDev=2',    () => computeBollinger(bars, 20, 2)),
        run('Keltner Channel',  'computeKeltner',     'bars, ema=20, atr=10, mult=1.5', () => computeKeltner(bars, 20, 10, 1.5)),
        run('Donchian Channel', 'computeDonchian',    'bars, period=20',              () => computeDonchian(bars, 20)),
        run('BB %B',            'computeBBPercentB',  'bars, period=20, stdDev=2',    () => computeBBPercentB(bars, 20, 2)),
        run('BB Width',         'computeBBWidth',     'bars, period=20, stdDev=2',    () => computeBBWidth(bars, 20, 2)),
      ],
    },
    {
      label: '3 · Trend / Stop Systems (5)',
      results: [
        run('SuperTrend',       'computeSuperTrend',     'bars, period=10, mult=3',     () => computeSuperTrend(bars, 10, 3)),
        run('Parabolic SAR',    'computeParabolicSAR',   'bars, afStart=0.02, max=0.2', () => computeParabolicSAR(bars, 0.02, 0.2)),
        run('Chandelier Exit',  'computeChandelierExit', 'bars, period=22, mult=3',     () => computeChandelierExit(bars, 22, 3)),
        run('Chande Kroll Stop','computeChandeKrollStop','bars, p=10, q=9, x=1.5',      () => computeChandeKrollStop(bars, 10, 9, 1.5)),
        run('ZigZag',           'computeZigzag',         'bars, deviation=0.1',         () => computeZigzag(bars, 0.1)),
      ],
    },
    {
      label: '4 · Fibonacci (2)',
      results: [
        run('Auto Fib Retracement', 'computeAutoFib',          'bars, lookback=50', () => computeAutoFib(bars, 50)),
        run('Auto Fib Extension',   'computeAutoFibExtension', 'bars, lookback=50', () => computeAutoFibExtension(bars, 50)),
      ],
    },
    {
      label: '5 · Oscillators & Momentum (22)',
      results: [
        run('RSI',               'computeRSI',              'bars, period=14',                       () => computeRSI(bars, 14)),
        run('MACD',              'computeMACD',             'bars, fast=12, slow=26, sig=9',         () => computeMACD(bars, 12, 26, 9)),
        run('Stochastic',        'computeStochastic',       'bars, k=14, d=3',                       () => computeStochastic(bars, 14, 3)),
        run('Stochastic RSI',    'computeStochRSI',         'bars, rsi=14, st=14, ks=3, ds=3',       () => computeStochRSI(bars, 14, 14, 3, 3)),
        run('Williams %R',       'computeWilliamsR',        'bars, period=14',                       () => computeWilliamsR(bars, 14)),
        run('CCI',               'computeCCI',              'bars, period=20',                       () => computeCCI(bars, 20)),
        run('ADX',               'computeADX',              'bars, period=14',                       () => computeADX(bars, 14)),
        run('Aroon',             'computeAroon',            'bars, period=25',                       () => computeAroon(bars, 25)),
        run('Awesome Oscillator','computeAO',               'bars',                                  () => computeAO(bars)),
        run('Balance of Power',  'computeBOP',              'bars, period=14',                       () => computeBOP(bars, 14)),
        run('BB Trend',          'computeBBTrend',          'bars, fast=20, slow=50',                () => computeBBTrend(bars, 20, 50)),
        run('Bull/Bear Power',   'computeBullBearPower',    'bars, period=13',                       () => computeBullBearPower(bars, 13)),
        run('Chaikin Oscillator','computeChaikinOscillator','bars, fast=3, slow=10',                 () => computeChaikinOscillator(bars, 3, 10)),
        run('CMO',               'computeCMO',              'bars, period=14',                       () => computeCMO(bars, 14)),
        run('Choppiness Index',  'computeChoppiness',       'bars, period=14',                       () => computeChoppiness(bars, 14)),
        run('Chop Zone',         'computeChopZone',         'bars, period=30',                       () => computeChopZone(bars, 30)),
        run('Connors RSI',       'computeConnorsRSI',       'bars, rsi=3, streak=2, pct=100',        () => computeConnorsRSI(bars, 3, 2, 100)),
        run('Coppock Curve',     'computeCoppock',          'bars, wma=10, roc1=14, roc2=11',        () => computeCoppock(bars, 10, 14, 11)),
        run('DPO',               'computeDPO',              'bars, period=21',                       () => computeDPO(bars, 21)),
        run('Fisher Transform',  'computeFisher',           'bars, period=9',                        () => computeFisher(bars, 9)),
        run('Mass Index',        'computeMassIndex',        'bars, ema=9, sum=25',                   () => computeMassIndex(bars, 9, 25)),
        run('Momentum',          'computeMomentum',         'bars, period=10',                       () => computeMomentum(bars, 10)),
        run('PPO',               'computePPO',              'bars, fast=12, slow=26, sig=9',         () => computePPO(bars, 12, 26, 9)),
        run('ROC',               'computeROC',              'bars, period=9',                        () => computeROC(bars, 9)),
        run('RVI',               'computeRVI',              'bars, period=10',                       () => computeRVI(bars, 10)),
        run('SMI Ergodic',       'computeSMI',              'bars, k=13, d=25, sig=9',               () => computeSMI(bars, 13, 25, 9)),
        run('TRIX',              'computeTRIX',             'bars, period=18',                       () => computeTRIX(bars, 18)),
        run('TSI',               'computeTSI',              'bars, long=25, short=13, sig=13',       () => computeTSI(bars, 25, 13, 13)),
        run('Ultimate Oscillator','computeUltimateOscillator','bars, p1=7, p2=14, p3=28',           () => computeUltimateOscillator(bars, 7, 14, 28)),
        run('Vortex',            'computeVortex',           'bars, period=14',                       () => computeVortex(bars, 14)),
      ],
    },
    {
      label: '6 · Volume Indicators (11)',
      results: [
        run('VWAP',              'computeVWAP',             'bars',                   () => computeVWAP(bars)),
        run('Volume Profile',    'computeVolumeProfile',    'bars, levels=50',        () => computeVolumeProfile(bars, 50)),
        run('OBV',               'computeOBV',              'bars',                   () => computeOBV(bars)),
        run('CMF',               'computeCMF',              'bars, period=20',        () => computeCMF(bars, 20)),
        run('ADL',               'computeADL',              'bars',                   () => computeADL(bars)),
        run('CVD',               'computeCVD',              'bars',                   () => computeCVD(bars)),
        run('CVI',               'computeCVI',              'bars, period=14',        () => computeCVI(bars, 14)),
        run('Net Volume',        'computeNetVolume',        'bars, period=1',         () => computeNetVolume(bars, 1)),
        run('PVT',               'computePVT',              'bars',                   () => computePVT(bars)),
        run('Volume Oscillator', 'computeVolumeOscillator', 'bars, fast=5, slow=10', () => computeVolumeOscillator(bars, 5, 10)),
        run('Advance/Decline',   'computeAdvanceDecline',   'bars',                   () => computeAdvanceDecline(bars)),
      ],
    },
    {
      label: '7 · Volatility (2)',
      results: [
        run('ATR',                  'computeATR',                 'bars, period=10', () => computeATR(bars, 10)),
        run('Historical Volatility','computeHistoricalVolatility','bars, period=21', () => computeHistoricalVolatility(bars, 21)),
      ],
    },
    {
      label: '8 · Misc / Statistical (6)',
      results: [
        run('Pivot Points',  'computePivotPoints', 'bars',           () => computePivotPoints(bars)),
        run('ADR',           'computeADR',         'bars, period=14',() => computeADR(bars, 14)),
        run('Correlation',   'computeCorrelation', 'bars, period=20',() => computeCorrelation(bars, 20)),
        run('MFI',           'computeMFI',         'bars, period=14',() => computeMFI(bars, 14)),
        run('EFI',           'computeEFI',         'bars, period=13',() => computeEFI(bars, 13)),
        run('EOM',           'computeEOM',         'bars, period=14',() => computeEOM(bars, 14)),
      ],
    },
    {
      label: '9 · Klinger & KST (2)',
      results: [
        run('KVO (Klinger)', 'computeKlinger', 'bars, short=34, long=55, sig=13', () => computeKlinger(bars, 34, 55, 13)),
        run('KST',           'computeKST',     'bars',                            () => computeKST(bars)),
      ],
    },
  ];
}

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ s }: { s: Status }) {
  const styles: Record<Status, { bg: string; color: string }> = {
    PASS:  { bg: '#E8F5E9', color: '#2E7D32' },
    EMPTY: { bg: '#FFF8E1', color: '#F57F17' },
    ERROR: { bg: '#FFEBEE', color: '#C62828' },
  };
  const st = styles[s];
  return (
    <span style={{
      display: 'inline-block', padding: '1px 8px', borderRadius: 3,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
      background: st.bg, color: st.color, fontFamily: 'monospace',
    }}>
      {s}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function IndicatorsTestPage() {
  const bars = useMemo(() => generateMockBars(300), []);
  const categories = useMemo(() => buildTests(bars), [bars]);

  const allResults = categories.flatMap(c => c.results);
  const pass  = allResults.filter(r => r.status === 'PASS').length;
  const empty = allResults.filter(r => r.status === 'EMPTY').length;
  const error = allResults.filter(r => r.status === 'ERROR').length;
  const total = allResults.length;

  const [expanded, setExpanded] = useState<Record<number, boolean>>(() => {
    const init: Record<number, boolean> = {};
    categories.forEach((_, i) => { init[i] = true; });
    return init;
  });

  return (
    <div style={{
      minHeight: '100vh', background: '#F0F3FA',
      fontFamily: "'Inter',-apple-system,sans-serif",
      padding: '24px 32px',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#131722', letterSpacing: '-0.01em' }}>
          ORDR Market — Indicator Test Harness
        </div>
        <div style={{ fontSize: 13, color: '#787B86', marginTop: 4 }}>
          300 mock EURUSD 30m bars · {total} indicators tested
        </div>

        {/* Summary badges */}
        <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
          <span style={{ background: '#E8F5E9', color: '#2E7D32', fontWeight: 700,
            padding: '4px 14px', borderRadius: 6, fontSize: 13 }}>
            ✓ {pass} PASS
          </span>
          <span style={{ background: '#FFF8E1', color: '#F57F17', fontWeight: 700,
            padding: '4px 14px', borderRadius: 6, fontSize: 13 }}>
            ⚠ {empty} EMPTY
          </span>
          <span style={{ background: '#FFEBEE', color: '#C62828', fontWeight: 700,
            padding: '4px 14px', borderRadius: 6, fontSize: 13 }}>
            ✗ {error} ERROR
          </span>
          <span style={{ color: '#B2B5BE', fontSize: 13 }}>
            {((pass / total) * 100).toFixed(0)}% pass rate
          </span>
        </div>
      </div>

      {/* Categories */}
      {categories.map((cat, ci) => {
        const catPass  = cat.results.filter(r => r.status === 'PASS').length;
        const catError = cat.results.filter(r => r.status === 'ERROR').length;
        const catEmpty = cat.results.filter(r => r.status === 'EMPTY').length;
        const isOpen   = expanded[ci] !== false;

        return (
          <div key={ci} style={{
            background: '#FFFFFF', border: '1px solid #E0E3EB', borderRadius: 8,
            marginBottom: 16, overflow: 'hidden',
          }}>
            {/* Category header */}
            <div
              onClick={() => setExpanded(prev => ({ ...prev, [ci]: !isOpen }))}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 18px', cursor: 'pointer',
                background: '#FAFBFE', borderBottom: isOpen ? '1px solid #E0E3EB' : 'none',
                userSelect: 'none',
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: '#131722', flex: 1 }}>
                {cat.label}
              </span>
              <span style={{ fontSize: 11, color: '#2E7D32', fontWeight: 600 }}>{catPass} pass</span>
              {catEmpty > 0 && <span style={{ fontSize: 11, color: '#F57F17', fontWeight: 600 }}>{catEmpty} empty</span>}
              {catError > 0 && <span style={{ fontSize: 11, color: '#C62828', fontWeight: 600 }}>{catError} error</span>}
              <span style={{ fontSize: 13, color: '#B2B5BE' }}>{isOpen ? '▲' : '▼'}</span>
            </div>

            {/* Results table */}
            {isOpen && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#F7F8FC' }}>
                    {['Indicator', 'Function', 'Parameters', 'Status', 'Output', 'Last Value'].map(h => (
                      <th key={h} style={{
                        padding: '6px 14px', textAlign: 'left', fontWeight: 600,
                        color: '#787B86', fontSize: 11, letterSpacing: '0.04em',
                        borderBottom: '1px solid #ECEEF6',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cat.results.map((r, ri) => (
                    <tr key={ri} style={{
                      borderBottom: ri < cat.results.length - 1 ? '1px solid #ECEEF6' : 'none',
                      background: r.status === 'ERROR' ? '#FFF5F5'
                        : r.status === 'EMPTY' ? '#FFFEF0' : 'transparent',
                    }}>
                      <td style={{ padding: '8px 14px', fontWeight: 600, color: '#131722' }}>
                        {r.name}
                      </td>
                      <td style={{ padding: '8px 14px', fontFamily: 'monospace',
                        fontSize: 11, color: '#2962FF' }}>
                        {r.fn}
                      </td>
                      <td style={{ padding: '8px 14px', fontFamily: 'monospace',
                        fontSize: 11, color: '#787B86', maxWidth: 260 }}>
                        {r.params}
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <StatusPill s={r.status} />
                      </td>
                      <td style={{ padding: '8px 14px', fontFamily: 'monospace',
                        fontSize: 11, color: r.len > 0 ? '#131722' : '#B2B5BE' }}>
                        {r.len > 0 ? `${r.len} points` : '—'}
                      </td>
                      <td style={{ padding: '8px 14px', fontFamily: 'monospace',
                        fontSize: 11, color: r.status === 'ERROR' ? '#C62828' : '#131722',
                        maxWidth: 340, wordBreak: 'break-all' }}>
                        {r.status === 'ERROR' ? `⚠ ${r.error}` : r.last}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      <div style={{ marginTop: 24, fontSize: 11, color: '#B2B5BE', textAlign: 'center' }}>
        ORDR Market Indicator Test Harness · {new Date().toISOString().slice(0, 10)}
      </div>
    </div>
  );
}
