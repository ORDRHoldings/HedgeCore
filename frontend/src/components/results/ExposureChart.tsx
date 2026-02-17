"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { BucketResult } from '../../api/types';

interface Props { buckets: BucketResult[] }

const TOOLTIP_STYLE = {
  backgroundColor: '#070B14',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: '8px',
  color: '#F3F4F6',
};

export default function ExposureChart({ buckets }: Props) {
  const data = buckets.map(b => ({
    bucket: b.bucket,
    Confirmed: b.confirmed_flow_mxn / 1e6,
    Forecast: b.forecast_flow_mxn / 1e6,
    'Existing Hedges': b.existing_hedges_mxn / 1e6,
    Residual: b.residual_mxn / 1e6,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis dataKey="bucket" fontSize={12} tick={{ fill: '#9CA3AF' }} />
        <YAxis fontSize={12} tickFormatter={v => `${v}M`} tick={{ fill: '#9CA3AF' }} />
        <Tooltip
          formatter={(v: number) => `${v.toFixed(1)}M MXN`}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: '#9CA3AF' }}
        />
        <Legend />
        <Bar dataKey="Confirmed" fill="#00E5FF" stackId="exposure" />
        <Bar dataKey="Forecast" fill="#5C6BC0" stackId="exposure" />
        <Bar dataKey="Existing Hedges" fill="#6B7280" />
        <Bar dataKey="Residual" fill="#F59E0B" />
      </BarChart>
    </ResponsiveContainer>
  );
}
