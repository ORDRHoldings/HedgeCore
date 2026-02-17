"use client";

import type { BucketResult, ScenarioBucketResult } from '../../api/types';
import type { InstrumentMapping } from '../../utils/symbolMapper';
import { fmtUSD, fmtRate } from '../../utils/formatters';
import ConfidencePanel from './ConfidencePanel';
import CopyTicketButton from './CopyTicketButton';
import IbkrHandoff from './IbkrHandoff';

interface Props {
  bucket: BucketResult;
  mapping: InstrumentMapping;
  worstCase: ScenarioBucketResult | null;
  runId: string;
  /** Scenario base currency (e.g. 'JPY', 'EUR', 'MXN'). REQUIRED — no MXN default. */
  baseCcy: string;
}

/** BUY or SELL from the sign of the action notional.
 *  action_notional > 0 → hedge requires BUYING base ccy (buying the exposure hedge)
 *  action_notional < 0 → hedge requires SELLING base ccy */
function getBrokerSide(actionNotional: number): 'BUY' | 'SELL' | 'N/A' {
  if (actionNotional > 0) return 'BUY';
  if (actionNotional < 0) return 'SELL';
  return 'N/A';
}

/** Minimal direction label: "BUY JPY" or "SELL JPY" */
function getDirectionLabel(actionNotional: number, ccy: string): string {
  const side = getBrokerSide(actionNotional);
  if (side === 'N/A') return 'N/A';
  return `${side} ${ccy}`;
}

/** Notional formatted with scenario currency label */
function fmtNotional(amount: number, ccy: string): string {
  return `${Math.abs(amount).toLocaleString('en', { maximumFractionDigits: 0 })} ${ccy}`;
}

export default function BucketTicketCard({ bucket, mapping, worstCase, runId, baseCcy }: Props) {
  const isFutures = mapping.is_proxy;
  const hasAction = bucket.action_mxn !== 0 && !bucket.suppressed;
  const side = getBrokerSide(bucket.action_mxn);
  const contracts = mapping.suggested_contracts ?? 0;

  // Simplified header action label: "SELL 3 contracts" or "BUY 1 JPY contract"
  const headerAction = isFutures && hasAction
    ? `${side} ${contracts} ${contracts === 1 ? 'contract' : 'contracts'}`
    : hasAction
      ? getDirectionLabel(bucket.action_mxn, baseCcy)
      : 'No execution required';

  return (
    <div className="border border-[var(--border-rim)] rounded-xl bg-[var(--bg-panel)] backdrop-blur-[14px]">
      {/* ── Ticket header ── */}
      <div className="px-4 py-3 border-b border-[var(--border-soft)] bg-[var(--bg-deep)] rounded-t-xl">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h4 className="font-semibold text-[var(--text-primary)]">
              Bucket: {bucket.bucket}
            </h4>
            {/* Action badge */}
            {hasAction && (
              <span
                className={`text-xs font-mono font-bold px-2 py-0.5 border rounded ${
                  side === 'BUY'
                    ? 'border-[var(--accent-green)]/40 text-[var(--accent-green)] bg-[var(--accent-green)]/5'
                    : side === 'SELL'
                      ? 'border-[var(--accent-red)]/40 text-[var(--accent-red)] bg-[var(--accent-red)]/5'
                      : 'border-[var(--border-rim)] text-[var(--text-tertiary)]'
                }`}
              >
                {side}
              </span>
            )}
            {/* Instrument badge */}
            <span className="text-[9px] font-mono text-[var(--text-tertiary)] border border-[var(--border-soft)] px-1.5 py-0.5">
              {isFutures ? 'FUTURES' : 'NDF'}
            </span>
          </div>
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] tracking-widest">
            {baseCcy}
          </span>
        </div>

        {/* Simplified action line */}
        {hasAction && (
          <p className="text-base font-bold text-[var(--text-primary)] mt-1.5">
            {isFutures
              ? `${side} ${contracts} ${contracts === 1 ? 'contract' : 'contracts'}`
              : getDirectionLabel(bucket.action_mxn, baseCcy)
            }
          </p>
        )}

        {!hasAction && (
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            No execution required
          </p>
        )}
      </div>

      {/* ── Futures action banner (futures mode only) ── */}
      {isFutures && hasAction && (
        <div className="mx-4 mt-4 bg-[var(--accent-cyan)]/5 border border-[var(--accent-cyan)]/20 rounded-lg px-4 py-3">
          <p className="text-lg font-bold text-[var(--text-primary)]">
            {side} {contracts}{' '}
            {mapping.display_label} ({mapping.expiry_label})
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            {getDirectionLabel(bucket.action_mxn, baseCcy)}
          </p>
        </div>
      )}

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Trade details */}
        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            {/* Direction (NDF mode) */}
            {!isFutures && hasAction && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Direction</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {getDirectionLabel(bucket.action_mxn, baseCcy)}
                </span>
              </div>
            )}

            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Notional</span>
              <span className="font-mono text-[var(--text-primary)]">
                {fmtNotional(bucket.action_mxn, baseCcy)}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">USD Equiv</span>
              <span className="font-mono text-[var(--text-primary)]">
                {fmtUSD(Math.abs(bucket.action_usd))}
              </span>
            </div>

            {!isFutures && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Instrument</span>
                <span className="text-[var(--text-primary)]">{mapping.display_label}</span>
              </div>
            )}

            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">
                {isFutures ? 'Fwd Rate (ref)' : 'Fwd Rate'}
              </span>
              <span className="font-mono text-[var(--text-primary)]">
                {fmtRate(bucket.forward_rate)}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Carry</span>
              <span className="text-xs text-[var(--text-secondary)]">{bucket.carry_note}</span>
            </div>

            {!isFutures && mapping.suggested_contracts != null && (
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Contracts (approx)</span>
                <span className="font-mono text-[var(--text-primary)]">
                  ~{mapping.suggested_contracts}
                </span>
              </div>
            )}
          </div>

          {/* Futures contract breakdown */}
          {isFutures && hasAction && (
            <div className="mt-3 pt-3 border-t border-[var(--border-soft)]">
              <p className="text-xs font-medium text-[var(--text-secondary)] mb-2">
                Contract Calculation
              </p>
              <div className="space-y-1 text-xs font-mono">
                {mapping.contract_size_mxn != null && (
                  <div className="text-[var(--text-secondary)]">
                    {fmtNotional(bucket.action_mxn, baseCcy)} ÷{' '}
                    {mapping.contract_size_mxn.toLocaleString('en')} ={' '}
                    {mapping.suggested_contracts} contracts
                  </div>
                )}
                {mapping.notional_usd != null && (
                  <div className="text-[var(--text-secondary)]">
                    Notional USD: {fmtUSD(mapping.notional_usd)}
                  </div>
                )}
                {mapping.margin_estimate_usd != null && mapping.suggested_contracts != null && mapping.suggested_contracts > 0 && (
                  <div className="text-[var(--text-secondary)]">
                    Est. Margin: {fmtUSD(mapping.margin_estimate_usd)}
                  </div>
                )}
                {mapping.basis_risk_note && (
                  <div className="text-[var(--accent-amber)] mt-1">
                    ⚠ {mapping.basis_risk_note}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <CopyTicketButton
              bucket={bucket}
              mapping={mapping}
              runId={runId}
              baseCcy={baseCcy}
            />
            <IbkrHandoff mapping={mapping} bucket={bucket} baseCcy={baseCcy} />
          </div>
        </div>

        {/* Right: Confidence panel */}
        <ConfidencePanel bucket={bucket} worstCase={worstCase} baseCcy={baseCcy} />
      </div>
    </div>
  );
}
