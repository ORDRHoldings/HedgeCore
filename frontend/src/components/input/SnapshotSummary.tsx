"use client";

import { useRouter } from 'next/navigation';
import type { TradeRow, HedgeRow, MarketSnapshot, PolicyConfig } from '../../api/types';
import { fmtMXN, fmtCompact, fmtPct } from '../../utils/formatters';
import { deriveCurrencyContext } from '../../utils/currencyContext';

interface Props {
  trades: TradeRow[];
  hedges: HedgeRow[];
  market: MarketSnapshot;
  policy: PolicyConfig;
  fixtureId: string | null;
  fixtureLabel: string | null;
  validationState: 'PASS' | 'FAIL' | 'PENDING';
  integrityScore?: number;
  onEditInputs: () => void;
  onGeneratePlan: () => void;
  canGenerate: boolean;
  loading: boolean;
}

const S = {
  fontUI:   "'IBM Plex Sans', sans-serif",
  fontMono: "'IBM Plex Mono', monospace",
  bgPanel:  'var(--bg-panel)',
  bgSub:    'var(--bg-sub)',
  borderRim:'var(--border-rim)',
  borderSoft:'var(--border-soft)',
  textPrimary:   'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textTertiary:  'var(--text-tertiary)',
  accentCyan:    'var(--accent-cyan)',
  accentAmber:   'var(--accent-amber)',
} as const;

function SectionHeader({ index, title, count }: { index: string; title: string; count?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, paddingBottom: 8 }}>
      <span style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: S.textTertiary, letterSpacing: '0.06em' }}>{index}</span>
      <span style={{ fontFamily: S.fontUI, fontSize: '0.8125rem', fontWeight: 600, color: S.textPrimary }}>{title}</span>
      {count && <span style={{ fontFamily: S.fontMono, fontSize: '0.75rem', color: S.textTertiary, marginLeft: 'auto' }}>{count}</span>}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: S.borderRim, marginBottom: 14 }} />;
}

function TH({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th scope="col" style={{
      padding: '5px 10px 5px 0',
      fontFamily: S.fontMono, fontSize: '0.75rem', fontWeight: 500,
      letterSpacing: '0.07em', textTransform: 'uppercase', color: S.textTertiary,
      textAlign: right ? 'right' : 'left', whiteSpace: 'nowrap',
      borderBottom: `1px solid ${S.borderRim}`,
    }}>{children}</th>
  );
}

function TD({ children, mono, right, muted, style: extraStyle, colSpan }: {
  children: React.ReactNode;
  mono?: boolean;
  right?: boolean;
  muted?: boolean;
  style?: React.CSSProperties;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} style={{
      padding: '7px 10px 7px 0',
      fontFamily: mono ? S.fontMono : S.fontUI,
      fontSize: '0.75rem',
      color: muted ? S.textTertiary : S.textSecondary,
      textAlign: right ? 'right' : 'left',
      borderBottom: `1px solid ${S.borderSoft}`,
      ...extraStyle,
    }}>{children}</td>
  );
}

export default function SnapshotSummary({
  trades, hedges, market, policy,
  fixtureId, fixtureLabel,
  validationState, integrityScore,
  onEditInputs, onGeneratePlan, canGenerate, loading,
}: Props) {
  const router = useRouter();

  // ── Derived metrics ─────────────────────────────────────────────────────
  const netMxn = trades.reduce((s, t) => s + t.amount, 0);
  const confirmedTrades = trades.filter(t => t.status === 'CONFIRMED');
  const forecastTrades  = trades.filter(t => t.status === 'FORECAST');
  const confirmedNet = confirmedTrades.reduce((s, t) => s + t.amount, 0);
  const forecastNet  = forecastTrades.reduce((s, t) => s + t.amount, 0);

  const buckets = market.forward_points_by_month;
  const bucketKeys = Object.keys(buckets).sort();

  // Net per bucket (simple: assign by value_date month)
  const bucketMap: Record<string, number> = {};
  trades.forEach(t => {
    const month = t.value_date.slice(0, 7);
    if (buckets[month] !== undefined) {
      bucketMap[month] = (bucketMap[month] || 0) + t.amount;
    }
  });

  // Currencies (from trades)
  const currencyMap: Record<string, { ar: number; ap: number }> = {};
  trades.forEach(t => {
    const c = t.currency || 'MXN';
    if (!currencyMap[c]) currencyMap[c] = { ar: 0, ap: 0 };
    if (t.type === 'AR') currencyMap[c].ar += t.amount;
    else currencyMap[c].ap += t.amount;
  });

  // Top contributors
  const topTrades = [...trades]
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 5);

  // Data quality: any missing fields
  const exceptions = trades.filter(t => !t.record_id || !t.entity || !t.value_date || !t.amount);

  const asOf = market.as_of.replace('T', ' ').slice(0, 19) + ' UTC';
  const hedgeNotional = hedges.reduce((s, h) => s + h.notional_mxn, 0);

  // ── Currency context (single canonical source for all labels) ────────────
  const ctx = deriveCurrencyContext(trades, market);
  const ccy = ctx.baseCcy;   // short alias used throughout JSX labels

  const integrityColor =
    integrityScore === undefined ? S.textTertiary :
    integrityScore >= 95 ? 'var(--status-pass)' :
    integrityScore >= 70 ? S.accentAmber : 'var(--accent-red)';

  return (
    <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '16px 16px' }}>
      {/* ── Top header strip: summary mode indicator + actions ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 14px', background: S.bgSub,
        border: `1px solid ${S.borderRim}`, marginBottom: 16,
        fontFamily: S.fontMono, fontSize: '0.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: S.textTertiary, letterSpacing: '0.06em' }}>SNAPSHOT SUMMARY</span>
          {fixtureLabel && (
            <>
              <span style={{ color: S.borderRim }}>|</span>
              <span style={{ color: S.accentAmber }}>{fixtureLabel}</span>
            </>
          )}
          <span style={{ color: S.borderRim }}>|</span>
          <span style={{ color: S.textTertiary }}>AS OF </span>
          <span style={{ color: S.textSecondary }}>{asOf}</span>
          <span style={{ color: S.borderRim }}>|</span>
          <span style={{ color: integrityColor }}>
            {validationState === 'PASS' ? '● PASS' : validationState === 'FAIL' ? '● FAIL' : '● PENDING'}
            {integrityScore !== undefined && ` · INT ${integrityScore}/100`}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={onEditInputs}
            style={{
              fontFamily: S.fontUI, fontSize: '0.75rem', fontWeight: 500,
              padding: '3px 10px', border: `1px solid ${S.borderRim}`,
              color: S.textSecondary, background: 'transparent', cursor: 'pointer',
            }}
          >
            Edit Inputs
          </button>
          <button
            onClick={onGeneratePlan}
            disabled={!canGenerate || loading}
            style={{
              fontFamily: S.fontUI, fontSize: '0.75rem', fontWeight: 600,
              padding: '3px 12px',
              border: `1px solid ${canGenerate && !loading ? S.accentCyan : S.borderRim}`,
              color: canGenerate && !loading ? S.accentCyan : S.textTertiary,
              background: 'transparent',
              cursor: canGenerate && !loading ? 'pointer' : 'not-allowed',
              opacity: canGenerate ? 1 : 0.5,
            }}
          >
            {loading ? 'Computing…' : 'Generate Hedge Plan →'}
          </button>
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 16 }}>

        {/* ── LEFT: Primary data tables ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Exposure Ledger Summary */}
          <section>
            <SectionHeader index="A" title="Exposure Ledger Summary" count={`${trades.length} positions`} />
            <Divider />
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <TH>Metric</TH>
                <TH right>Value</TH>
                <TH>Detail</TH>
              </tr></thead>
              <tbody>
                <tr>
                  <TD>Total Positions</TD>
                  <TD mono right><strong style={{ color: S.textPrimary }}>{trades.length}</strong></TD>
                  <TD muted>{confirmedTrades.length} confirmed · {forecastTrades.length} forecast</TD>
                </tr>
                <tr>
                  <TD>Net Exposure</TD>
                  <TD mono right><strong style={{ color: S.textPrimary }}>{fmtCompact(netMxn)} {ccy}</strong></TD>
                  <TD muted>{fmtMXN(netMxn)}</TD>
                </tr>
                <tr>
                  <TD>Confirmed Net</TD>
                  <TD mono right>{fmtCompact(confirmedNet)} {ccy}</TD>
                  <TD muted>{fmtPct(policy.hedge_ratios.confirmed)} hedge ratio applied</TD>
                </tr>
                <tr>
                  <TD>Forecast Net</TD>
                  <TD mono right>{fmtCompact(forecastNet)} {ccy}</TD>
                  <TD muted>{fmtPct(policy.hedge_ratios.forecast)} hedge ratio applied</TD>
                </tr>
                <tr>
                  <TD>Existing Hedges</TD>
                  <TD mono right>{fmtCompact(hedgeNotional)} {ccy}</TD>
                  <TD muted>{hedges.length} instruments · {hedges.filter(h => h.status === 'ACTIVE').length} active</TD>
                </tr>
                <tr>
                  <TD>Spot Rate</TD>
                  <TD mono right>{market.spot_rate > 0 ? market.spot_rate.toFixed(4) : '--'}</TD>
                  <TD muted>{ctx.pairLabel} · {String(market.provider_metadata?.source ?? 'manual')}</TD>
                </tr>
                <tr>
                  <TD>Policy Applied</TD>
                  <TD mono right style={{ color: S.accentCyan }}>{policy.execution_product}</TD>
                  <TD muted>{policy.bucket_mode} · min {policy.min_trade_size_usd?.toLocaleString() ?? '--'} USD</TD>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Net Exposure by Currency */}
          <section>
            <SectionHeader index="B" title="Net Exposure by Currency" count={`${Object.keys(currencyMap).length} pairs`} />
            <Divider />
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <TH>Currency</TH>
                <TH right>AR</TH>
                <TH right>AP</TH>
                <TH right>Net</TH>
              </tr></thead>
              <tbody>
                {Object.entries(currencyMap).map(([ccy, v]) => (
                  <tr key={ccy}>
                    <TD mono><strong style={{ color: S.textPrimary }}>{ccy}</strong></TD>
                    <TD mono right style={{ color: 'var(--status-pass)' }}>{fmtCompact(v.ar)}</TD>
                    <TD mono right style={{ color: 'var(--accent-red)' }}>{fmtCompact(v.ap)}</TD>
                    <TD mono right><strong style={{ color: S.textPrimary }}>{fmtCompact(v.ar - v.ap)}</strong></TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Net Exposure by Tenor Bucket */}
          <section>
            <SectionHeader index="C" title="Net Exposure by Tenor Bucket" count={`${bucketKeys.length} buckets`} />
            <Divider />
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <TH>Bucket</TH>
                <TH right>Net Exp ({ccy})</TH>
                <TH right>Fwd Points</TH>
                <TH>Execution</TH>
              </tr></thead>
              <tbody>
                {bucketKeys.map(bk => (
                  <tr key={bk}>
                    <TD mono><strong style={{ color: S.textPrimary }}>{bk}</strong></TD>
                    <TD mono right>{bucketMap[bk] !== undefined ? fmtCompact(bucketMap[bk]) : '—'}</TD>
                    <TD mono right>{buckets[bk].toFixed(3)}</TD>
                    <TD>
                      <button
                        onClick={() => router.push(`/execution?bucket=${bk}`)}
                        style={{
                          fontFamily: S.fontMono, fontSize: '0.75rem', fontWeight: 500,
                          padding: '1px 6px', border: `1px solid ${S.borderRim}`,
                          color: S.textTertiary, background: 'transparent', cursor: 'pointer',
                          letterSpacing: '0.04em',
                        }}
                      >
                        View Chart →
                      </button>
                    </TD>
                  </tr>
                ))}
                {bucketKeys.length === 0 && (
                  <tr><TD muted colSpan={4}>No forward buckets configured in market snapshot.</TD></tr>
                )}
              </tbody>
            </table>
          </section>

          {/* Top Contributors */}
          <section>
            <SectionHeader index="D" title="Top Contributors by Notional" count={`top ${topTrades.length}`} />
            <Divider />
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <TH>ID</TH>
                <TH>Entity</TH>
                <TH>Type</TH>
                <TH>CCY</TH>
                <TH right>Amount</TH>
                <TH>Value Date</TH>
                <TH>Status</TH>
              </tr></thead>
              <tbody>
                {topTrades.map((t, i) => (
                  <tr key={i}>
                    <TD mono>{t.record_id}</TD>
                    <TD>{t.entity}</TD>
                    <TD mono style={{ color: t.type === 'AR' ? 'var(--status-pass)' : 'var(--accent-red)' }}>{t.type}</TD>
                    <TD mono muted>{t.currency}</TD>
                    <TD mono right><strong style={{ color: S.textPrimary }}>{fmtCompact(t.amount)}</strong></TD>
                    <TD mono>{t.value_date}</TD>
                    <TD mono muted>{t.status}</TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Data Quality & Exceptions */}
          <section>
            <SectionHeader index="E" title="Data Quality & Exceptions" count={exceptions.length > 0 ? `${exceptions.length} issues` : 'clean'} />
            <Divider />
            {exceptions.length === 0 ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 0', fontFamily: S.fontMono, fontSize: '0.75rem',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--status-pass)', display: 'inline-block' }} />
                <span style={{ color: 'var(--status-pass)' }}>No data quality exceptions detected · {trades.length} rows validated</span>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <TH>Row ID</TH>
                  <TH>Field</TH>
                  <TH>Issue</TH>
                </tr></thead>
                <tbody>
                  {exceptions.map((t, i) => (
                    <tr key={i}>
                      <TD mono>{t.record_id || '—'}</TD>
                      <TD>{!t.record_id ? 'record_id' : !t.entity ? 'entity' : !t.value_date ? 'value_date' : 'amount'}</TD>
                      <TD muted>Missing required field</TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        {/* ── RIGHT: Evidence / Audit Trail ── */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{
            background: S.bgSub, border: `1px solid ${S.borderRim}`,
            padding: '14px 14px',
          }}>
            <SectionHeader index="AUD" title="Evidence Trail" />
            <Divider />
            <dl style={{ display: 'flex', flexDirection: 'column', gap: 0, margin: 0 }}>
              {[
                { dt: 'Dataset ID',    dd: fixtureId ?? '—', mono: true },
                { dt: 'Import Method', dd: fixtureId ? 'Fixture (deterministic)' : 'Manual entry', mono: false },
                { dt: 'Positions',     dd: `${trades.length}`, mono: true },
                { dt: 'Hedge Lines',   dd: `${hedges.length}`, mono: true },
                { dt: 'Buckets',       dd: `${bucketKeys.length}`, mono: true },
                { dt: 'Policy',        dd: policy.execution_product, mono: true },
                { dt: `Spot ${ctx.pairLabel}`, dd: market.spot_rate > 0 ? market.spot_rate.toFixed(4) : '—', mono: true },
                { dt: 'Currency Pair', dd: ctx.pairLabel + (ctx.isMultiCcy ? ' + multi' : ''), mono: true },
                { dt: 'Snap As-of',    dd: asOf, mono: true },
                { dt: 'Snap Source',   dd: String(market.provider_metadata?.source ?? '—'), mono: false },
                { dt: 'Trace ID',      dd: '—', mono: true },
                { dt: 'Run ID',        dd: '—', mono: true },
              ].map(({ dt, dd, mono }, i, arr) => (
                <div key={dt} style={{
                  display: 'grid', gridTemplateColumns: '1fr auto',
                  alignItems: 'start', gap: 8, padding: '6px 0',
                  borderBottom: i < arr.length - 1 ? `1px solid ${S.borderSoft}` : 'none',
                }}>
                  <dt style={{ fontFamily: S.fontUI, fontSize: '0.75rem', color: S.textTertiary, fontWeight: 400 }}>{dt}</dt>
                  <dd style={{ margin: 0, fontFamily: mono ? S.fontMono : S.fontUI, fontSize: '0.75rem', color: S.textSecondary, wordBreak: 'break-all', maxWidth: 120, textAlign: 'right' }}>{dd}</dd>
                </div>
              ))}
            </dl>
            <div style={{ paddingTop: 12, borderTop: `1px solid ${S.borderSoft}` }}>
              <button
                onClick={() => router.push('/ledger')}
                style={{
                  fontFamily: S.fontMono, fontSize: '0.75rem', fontWeight: 500,
                  padding: '3px 8px', border: `1px solid ${S.borderRim}`,
                  color: S.textTertiary, background: 'transparent', cursor: 'pointer',
                  letterSpacing: '0.04em', width: '100%', textAlign: 'center',
                }}
              >
                View Trace Slice →
              </button>
            </div>
          </div>
        </aside>

      </div>{/* /grid */}
    </div>
  );
}
