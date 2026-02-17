"use client";

import type { BucketResult, ScenarioBucketResult } from '../../api/types';
import { fmtUSD } from '../../utils/formatters';

interface Props {
  bucket: BucketResult;
  worstCase: ScenarioBucketResult | null;
  /** Scenario base currency (e.g. 'JPY', 'EUR', 'MXN'). REQUIRED — no MXN default. */
  baseCcy: string;
}

function fmtNotional(amount: number, ccy: string): string {
  return `${amount.toLocaleString('en', { maximumFractionDigits: 0 })} ${ccy}`;
}

export default function ConfidencePanel({ bucket, worstCase, baseCcy }: Props) {
  return (
    <div className="bg-[var(--bg-deep)] border border-[var(--border-soft)] rounded-lg p-4 space-y-3 text-sm">
      <h4 className="font-semibold text-[var(--text-primary)]">Deterministic Risk Metrics</h4>

      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="text-[var(--text-secondary)]">Commercial Exposure</span>
          <span className="font-mono text-[var(--text-primary)]">
            {fmtNotional(bucket.commercial_exposure_mxn, baseCcy)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-secondary)]">Hedge Position</span>
          <span className="font-mono text-[var(--accent-green)]">
            {fmtNotional(bucket.hedge_position_mxn, baseCcy)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-secondary)]">Residual</span>
          <span className={`font-mono ${Math.abs(bucket.residual_mxn) > 0 ? 'text-[var(--accent-amber)]' : 'text-[var(--accent-green)]'}`}>
            {fmtNotional(bucket.residual_mxn, baseCcy)}
          </span>
        </div>
      </div>

      <hr className="border-[var(--border-soft)]" />

      {worstCase && (
        <div className="flex justify-between">
          <span className="text-[var(--text-secondary)]">Worst-case &Delta;</span>
          <span className="font-mono text-[var(--accent-red)]">{fmtUSD(worstCase.hedge_benefit_usd)}</span>
        </div>
      )}

      <div className="flex justify-between">
        <span className="text-[var(--text-secondary)]">Friction Est.</span>
        <span className="font-mono text-[var(--text-primary)]">{fmtUSD(bucket.friction_usd)}</span>
      </div>
    </div>
  );
}
