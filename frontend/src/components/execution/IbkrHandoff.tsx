"use client";

import { useState } from 'react';
import type { BucketResult } from '../../api/types';
import type { InstrumentMapping } from '../../utils/symbolMapper';

interface Props {
  mapping: InstrumentMapping;
  bucket: BucketResult;
  baseCcy?: string;
}

function getBrokerSide(actionMxn: number): string {
  if (actionMxn > 0) return 'BUY';
  if (actionMxn < 0) return 'SELL';
  return 'N/A';
}

export default function IbkrHandoff({ mapping, bucket, baseCcy = 'MXN' }: Props) {
  const [showModal, setShowModal] = useState(false);

  const ibkrUrl = mapping.ibkr_symbol
    ? 'https://www.interactivebrokers.com/en/trading/products-702-futures.php'
    : 'https://www.interactivebrokers.com/en/trading/products-702-currencies.php';

  const hasAction = bucket.action_mxn !== 0 && !bucket.suppressed;

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-3 py-1.5 text-sm rounded border border-[var(--accent-cyan)]/20 bg-[var(--accent-cyan)]/5 text-[var(--accent-cyan)] hover:bg-[var(--accent-cyan)]/10 transition-colors"
      >
        Open in IBKR
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[var(--bg-sub)] border border-[var(--border-rim)] rounded-xl shadow-xl p-6 max-w-md mx-4 space-y-4">
            <h3 className="font-semibold text-lg text-[var(--text-primary)]">
              IBKR Execution Steps
              <span className="ml-2 text-xs font-mono text-[var(--text-tertiary)]">{baseCcy}</span>
            </h3>

            {mapping.ibkr_symbol ? (
              hasAction ? (
                <div className="space-y-3 text-sm text-[var(--text-secondary)]">
                  <ol className="list-decimal list-inside space-y-2">
                    <li>Open IBKR Trader Workstation or Client Portal</li>
                    <li>Search for symbol: <span className="font-mono font-bold text-[var(--accent-cyan)] bg-[var(--bg-deep)] px-2 py-0.5 rounded">{mapping.ibkr_symbol}</span></li>
                    <li>Select <strong className="text-[var(--text-primary)]">{mapping.display_label}</strong></li>
                    <li>Choose contract: <strong className="text-[var(--text-primary)]">{mapping.expiry_label}</strong></li>
                    <li>Action: <strong className="text-[var(--text-primary)]">{getBrokerSide(bucket.action_mxn)}</strong></li>
                    <li>Quantity: <strong className="text-[var(--text-primary)]">{mapping.suggested_contracts ?? 0} contracts</strong></li>
                  </ol>
                  <p className="text-xs text-[var(--accent-amber)] mt-3">
                    Verify contract sizing before execution.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">No execution required.</p>
              )
            ) : (
              <div className="text-sm text-[var(--text-secondary)] space-y-2">
                <p>This instrument is OTC (NDF/Forward). Contact your FX desk or prime broker directly.</p>
                <p>Reference: <strong className="text-[var(--text-primary)]">{mapping.display_label}</strong></p>
                <p>Currency: <strong className="text-[var(--text-primary)]">{baseCcy}</strong></p>
                {mapping.basis_risk_note && (
                  <p className="text-[var(--accent-amber)] text-xs mt-2">⚠ {mapping.basis_risk_note}</p>
                )}
              </div>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <a
                href={ibkrUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 text-sm bg-[var(--accent-cyan)] text-[var(--bg-deep)] font-medium rounded hover:brightness-110 transition-colors"
              >
                Go to IBKR
              </a>
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm border border-[var(--border-rim)] text-[var(--text-secondary)] rounded hover:bg-white/5 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
