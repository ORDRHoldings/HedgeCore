"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { ScenarioTotalResult } from '../../api/types';
import { fmtSigma } from '../../utils/formatters';

interface Props { totals: ScenarioTotalResult[] }

const TOOLTIP_STYLE = {
  backgroundColor: '#070B14',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '8px',
  color: '#F3F4F6',
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
        <XAxis dataKey="sigma" fontSize={12} tick={{ fill: '#9CA3AF' }} />
        <YAxis fontSize={12} tickFormatter={v => `$${v}K`} tick={{ fill: '#9CA3AF' }} />
        <Tooltip
          formatter={(v: number) => `$${v.toFixed(1)}K`}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: '#9CA3AF' }}
        />
        <Legend />
        <Bar dataKey="Unhedged" fill="#4B5563" />
        <Bar dataKey="Hedged" fill="#00E5FF" />
        <Bar dataKey="Benefit" fill="#22C55E" />
      </BarChart>
    </ResponsiveContainer>
  );
}
