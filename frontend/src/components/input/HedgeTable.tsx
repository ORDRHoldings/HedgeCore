"use client";

import type { HedgeRow } from '../../api/types';
import { fmtMXN } from '../../utils/formatters';

interface Props {
  hedges: HedgeRow[];
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
  /** Primary currency label for notional display (e.g. "MXN", "EUR").
   *  The hedge engine always records notional_mxn in the base currency field;
   *  for non-MXN pairs this field holds the local-currency notional.
   *  The label corrects the display without touching the data model. */
  baseCcy?: string;
}

/** Maps hedge direction codes to display labels using the actual currency */
function directionLabel(direction: string, ccy: string): string {
  if (direction === 'SELL_MXN_BUY_USD') return `SELL ${ccy}`;
  if (direction === 'BUY_MXN_SELL_USD') return `BUY ${ccy}`;
  return direction;
}

export default function HedgeTable({ hedges, onEdit, onRemove, baseCcy }: Props) {
  if (hedges.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
        No existing hedges. Add hedges manually or upload a CSV file.
      </div>
    );
  }

  const displayCcy = baseCcy ?? 'local';

  const totalNotional = hedges.reduce((sum, h) => sum + h.notional_mxn, 0);
  const activeCount   = hedges.filter(h => h.status === 'ACTIVE').length;
  const lockedCount   = hedges.filter(h => h.status === 'LOCKED').length;

  return (
    <div>
      <div className="table-caption">
        <span>Total: {hedges.length}</span>
        <span>Active: {activeCount}</span>
        <span>Locked: {lockedCount}</span>
        <span>Notional: {fmtMXN(totalNotional)} {displayCcy}</span>
      </div>

      <div className="overflow-x-auto bg-white border border-[var(--border-rim)] rounded-sm">
        <table className="table-enterprise">
          <thead>
            <tr>
              <th>ID</th>
              <th>Instrument</th>
              <th>Direction</th>
              <th className="numeric">Notional {displayCcy}</th>
              <th>Value Date</th>
              <th>Status</th>
              <th style={{ width: 32 }}></th>
            </tr>
          </thead>
          <tbody>
            {hedges.map((h, i) => (
              <tr
                key={i}
                className="cursor-pointer"
                onClick={() => onEdit(i)}
              >
                <td className="font-mono text-[var(--text-primary)]">{h.hedge_id}</td>
                <td className="text-center">
                  <span className="inline-block px-2 py-0.5 rounded text-[12px] font-medium bg-[var(--bg-sub)] text-[var(--text-secondary)]">
                    {h.instrument}
                  </span>
                </td>
                <td className="text-center">{directionLabel(h.direction, displayCcy)}</td>
                <td className="numeric">{fmtMXN(h.notional_mxn)}</td>
                <td className="text-center font-mono">{h.value_date}</td>
                <td className="text-center">
                  <span className={`inline-block px-2 py-0.5 rounded text-[12px] font-medium ${
                    h.status === 'ACTIVE'
                      ? 'bg-[var(--accent-green)]/10 text-[var(--accent-green)]'
                      : 'bg-[var(--bg-sub)] text-[var(--text-secondary)]'
                  }`}>
                    {h.status}
                  </span>
                </td>
                <td>
                  <button
                    onClick={e => { e.stopPropagation(); onRemove(i); }}
                    className="text-[var(--accent-red)]/40 hover:text-[var(--accent-red)] text-lg leading-none"
                  >
                    &times;
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
