import type { PolicyConfig } from '../api/types';

export interface PolicyPreset {
  id: string;
  name: string;
  description: string;
  targetAudience: string;
  riskPosture: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
  policy: PolicyConfig;
}

export const POLICY_PRESETS: PolicyPreset[] = [
  {
    id: 'conservative-treasury',
    name: 'Conservative Treasury',
    description: 'Full coverage of confirmed exposures, minimal forecast hedging. Board-mandated hedge policies.',
    targetAudience: 'Investment-grade corporates, regulated entities',
    riskPosture: 'CONSERVATIVE',
    policy: {
      bucket_mode: 'CALENDAR_MONTH',
      hedge_ratios: { confirmed: 1.0, forecast: 0.25 },
      cost_assumptions: { spread_bps: 3.0 },
      execution_product: 'FWD',
      min_trade_size_usd: 100000,
    },
  },
  {
    id: 'balanced-corporate',
    name: 'Balanced Corporate',
    description: 'Full confirmed coverage, moderate forecast hedging. Standard mid-market FX program.',
    targetAudience: 'Mid-market corporates, manufacturing',
    riskPosture: 'MODERATE',
    policy: {
      bucket_mode: 'CALENDAR_MONTH',
      hedge_ratios: { confirmed: 1.0, forecast: 0.5 },
      cost_assumptions: { spread_bps: 5.0 },
      execution_product: 'NDF',
      min_trade_size_usd: 50000,
    },
  },
  {
    id: 'active-risk-mgmt',
    name: 'Active Risk Management',
    description: 'High coverage across confirmed and forecast flows. Active FX risk mandate.',
    targetAudience: 'Large corporates, frequent hedgers',
    riskPosture: 'AGGRESSIVE',
    policy: {
      bucket_mode: 'CALENDAR_MONTH',
      hedge_ratios: { confirmed: 1.0, forecast: 0.75 },
      cost_assumptions: { spread_bps: 4.0 },
      execution_product: 'NDF',
      min_trade_size_usd: 25000,
    },
  },
  {
    id: 'cost-sensitive',
    name: 'Cost-Sensitive Hedger',
    description: 'Confirmed-only coverage with wider spread assumption. Hedges only firm commitments.',
    targetAudience: 'SMEs, cost-constrained treasuries',
    riskPosture: 'CONSERVATIVE',
    policy: {
      bucket_mode: 'CALENDAR_MONTH',
      hedge_ratios: { confirmed: 0.8, forecast: 0.0 },
      cost_assumptions: { spread_bps: 8.0 },
      execution_product: 'NDF',
      min_trade_size_usd: 75000,
    },
  },
  {
    id: 'full-protection',
    name: 'Full Protection',
    description: 'Maximum hedge coverage for all flows. Low risk appetite, material FX exposure.',
    targetAudience: 'Import-dependent manufacturers, regulated utilities',
    riskPosture: 'AGGRESSIVE',
    policy: {
      bucket_mode: 'CALENDAR_MONTH',
      hedge_ratios: { confirmed: 1.0, forecast: 1.0 },
      cost_assumptions: { spread_bps: 5.0 },
      execution_product: 'FWD',
      min_trade_size_usd: 50000,
    },
  },
];
