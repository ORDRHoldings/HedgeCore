"use client";

import type { TradeRow } from '../../api/types';
import { fmtMXN } from '../../utils/formatters';

interface Props {
  trades: TradeRow[];
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
  /** Primary currency label derived from currency context (e.g. "MXN", "EUR", "JPY").
   *  Defaults to "local" if not provided. */
  baseCcy?: string;
}

export default function TradeTable({ trades, onEdit, onRemove, baseCcy }: Props) {
  if (trades.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--text-secondary)] text-sm">
        No trades loaded. Add trades manually or upload a CSV file.
      </div>
    );
  }

  // Derive display currency label: use prop if passed, else detect from first trade,
  // else fall back to "local". This is deterministic — no random defaulting.
  const displayCcy = baseCcy
    ?? (trades.length > 0 ? trades[0].currency : 'local');

  // Multi-currency: check if all trades share the same currency
  const isMultiCcy = new Set(trades.map(t => t.currency)).size > 1;

  const totalAmount = trades.reduce((sum, t) => sum + t.amount, 0);
  const confirmedCount = trades.filter(t => t.status === 'CONFIRMED').length;
  const forecastCount  = trades.filter(t => t.status === 'FORECAST').length;

  return (
    <div>
      <div className="table-caption">
        <span>Total: {trades.length}</span>
        <span>Confirmed: {confirmedCount}</span>
        <span>Forecast: {forecastCount}</span>
        {!isMultiCcy && (
          <span>Net Exposure: {fmtMXN(totalAmount)} {displayCcy}</span>
        )}
        {isMultiCcy && (
          <span style={{ color: 'var(--accent-amber)' }}>Multi-currency — see breakdown below</span>
        )}
      </div>

      <div className="overflow-x-auto bg-white border border-[var(--border-rim)] rounded-sm">
        <table className="table-enterprise">
          <thead>
            <tr>
              <th>ID</th>
              <th>Entity</th>
              <th>Type</th>
              <th>CCY</th>
              <th className="numeric">Amount</th>
              <th>Value Date</th>
              <th>Status</th>
              <th>Description</th>
              <th style={{ width: 32 }}></th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t, i) => (
              <tr
                key={i}
                className="cursor-pointer"
                onClick={() => onEdit(i)}
              >
                <td className="font-mono text-[var(--text-primary)]">{t.record_id}</td>
                <td className="text-[var(--text-primary)]">{t.entity}</td>
                <td className="text-center">
                  <span className={`inline-block px-2 py-0.5 rounded text-[12px] font-medium ${
                    t.type === 'AR'
                      ? 'bg-[var(--accent-green)]/10 text-[var(--accent-green)]'
                      : 'bg-[var(--accent-red)]/10 text-[var(--accent-red)]'
                  }`}>
                    {t.type}
                  </span>
                </td>
                <td className="text-center font-mono text-[var(--text-secondary)] text-xs">
                  {t.currency}
                </td>
                <td className="numeric">{fmtMXN(t.amount)}</td>
                <td className="text-center font-mono">{t.value_date}</td>
                <td className="text-center">
                  <span className={`inline-block px-2 py-0.5 rounded text-[12px] font-medium ${
                    t.status === 'CONFIRMED'
                      ? 'bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]'
                      : 'bg-[var(--accent-amber)]/10 text-[var(--accent-amber)]'
                  }`}>
                    {t.status}
                  </span>
                </td>
                <td className="text-[var(--text-secondary)] truncate max-w-[200px]">{t.description}</td>
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
