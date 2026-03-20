/**
 * demoFixtures.ts — Demo calculation request fixtures for each currency pair.
 * Used by sandbox page auto-run when no real position data is loaded.
 * Each fixture uses BIS-calibrated spot rates from pairRegistry.ts.
 */

import type { CalculateRequest, FuturesCurrency } from "../api/types";
import { getPairMeta } from "./pairRegistry";

const today = new Date();
const m1 = new Date(today.getFullYear(), today.getMonth() + 1, 28).toISOString().slice(0, 10);
const m2 = new Date(today.getFullYear(), today.getMonth() + 2, 28).toISOString().slice(0, 10);
const m3 = new Date(today.getFullYear(), today.getMonth() + 3, 28).toISOString().slice(0, 10);
const bk1 = m1.slice(0, 7);
const bk2 = m2.slice(0, 7);
const bk3 = m3.slice(0, 7);

/** Build a demo CalculateRequest for the given pair.
 *
 * Market rates (spot_rate, forward_points_by_month) are intentionally empty.
 * The sandbox always calls market-autofill to populate live rates before
 * dispatching; this structure provides only the trade and policy skeleton.
 */
export function buildDemoRequest(pairId: string): CalculateRequest {
  const meta = getPairMeta(pairId);
  if (!meta) throw new Error(`Unknown pair: ${pairId}`);

  const ccy = meta.localCcy as FuturesCurrency;
  const isNdf = meta.isNdf;

  // Fixed representative notional amounts in local currency (not spot-derived)
  const exp1 = 5_000_000;
  const exp2 = 3_000_000;
  const exp3 = 2_000_000;

  return {
    trades: [
      {
        record_id: `DEMO-${pairId}-001`,
        entity: "DemoCompany",
        type: "AR",
        currency: ccy,
        amount: exp1,
        value_date: m1,
        status: "CONFIRMED",
        description: `Demo Q+1 export receivable (${ccy})`,
      },
      {
        record_id: `DEMO-${pairId}-002`,
        entity: "DemoCompany",
        type: "AP",
        currency: ccy,
        amount: exp2,
        value_date: m2,
        status: "FORECAST",
        description: `Demo supplier payment (${ccy})`,
      },
      {
        record_id: `DEMO-${pairId}-003`,
        entity: "DemoCompany",
        type: "AR",
        currency: ccy,
        amount: exp3,
        value_date: m3,
        status: "CONFIRMED",
        description: `Demo Q+3 export receivable (${ccy})`,
      },
    ],
    hedges: [],
    market: {
      as_of: today.toISOString().slice(0, 10),
      spot_rate: 0, // populated by market-autofill before submission
      forward_points_by_month: {}, // populated by market-autofill before submission
      provider_metadata: {
        source: "DEMO",
        primary_currency: ccy,
        pair: pairId,
        settlement_type: isNdf ? "NDF" : "DELIVERABLE",
      },
    },
    policy: {
      bucket_mode: "CALENDAR_MONTH",
      hedge_ratios: { confirmed: 0.80, forecast: 0.50 },
      cost_assumptions: { spread_bps: isNdf ? 8.0 : 5.0 },
      execution_product: isNdf ? "NDF" : "FWD",
      min_trade_size_usd: 0,
    },
    pair: pairId,
  };
}

/** Pre-built demo fixtures for common pairs (lazily evaluated) */
const _cache = new Map<string, CalculateRequest>();

export function getDemoRequest(pairId: string): CalculateRequest {
  if (!_cache.has(pairId)) {
    _cache.set(pairId, buildDemoRequest(pairId));
  }
  return _cache.get(pairId)!;
}
