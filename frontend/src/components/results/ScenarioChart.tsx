"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { ScenarioTotalResult } from '../../api/types';
import { fmtSigma } from '../../utils/formatters';

interface Props { totals: ScenarioTotalResult[] }

// Recharts chart palette: deliberately distinct stack hues. Outside the T scale
// because chart series need higher-saturation, non-overlapping colors than the
// chrome tokens provide.
const C = {
  tooltipBg: '#070B14',
  tooltipFg: '#F3F4F6',
  axisFg:    '#9CA3AF',
} as const;

const TOOLTIP_STYLE = {
  backgroundColor: C.tooltipBg,
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '8px',
  color: C.tooltipFg,
};

export default function ScenarioChart({ totals }: Props) {
  const data = totals.map(t => ({
    sigma: fmtSigma(t.sigma),
    Unhedged: t.total_unhedged_usd / 1e3,
    Hedged: t.total_hedged_usd / 1e3,
    Benefit: t.total_hedge_benefit_usd / 1e3,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="sigma" fontSize={12} tick={{ fill: C.axisFg }} />
        <YAxis fontSize={12} tickFormatter={v => `$${v}K`} tick={{ fill: C.axisFg }} />
        <Tooltip
          formatter={(v: number) => `$${v.toFixed(1)}K`}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: C.axisFg }}
        />
        <Legend />
        <Bar dataKey="Unhedged" fill="#4B5563" />
        <Bar dataKey="Hedged" fill="#00E5FF" />
        <Bar dataKey="Benefit" fill="#22C55E" />
      </BarChart>
    </ResponsiveContainer>
  );
}
