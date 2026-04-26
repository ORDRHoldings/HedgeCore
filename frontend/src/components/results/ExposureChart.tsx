"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { BucketResult } from '../../api/types';

interface Props { buckets: BucketResult[] }

// Recharts chart palette: deliberately distinct stack hues (cyan/indigo/gray/
// amber). Outside the T scale because chart series need higher-saturation,
// non-overlapping colors than the chrome tokens provide.
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
        <XAxis dataKey="bucket" fontSize={12} tick={{ fill: C.axisFg }} />
        <YAxis fontSize={12} tickFormatter={v => `${v}M`} tick={{ fill: C.axisFg }} />
        <Tooltip
          formatter={(v: number) => `${v.toFixed(1)}M MXN`}
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: C.axisFg }}
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
