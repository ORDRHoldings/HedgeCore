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

/** Build a demo CalculateRequest for the given pair */
export function buildDemoRequest(pairId: string): CalculateRequest {
  const meta = getPairMeta(pairId);
  if (!meta) throw new Error(`Unknown pair: ${pairId}`);

  const spot = meta.demoSpot;
  const ccy = meta.localCcy as FuturesCurrency;
  const isNdf = meta.isNdf;

  // Scale exposure to ~$1M-$5M USD equivalent
  const usdTargetM1 = 5_000_000;
  const usdTargetM2 = 3_000_000;
  const usdTargetM3 = 2_000_000;

  // For inverted pairs (EUR/USD = EUR is local), exposure is in EUR
  // For direct pairs (USD/MXN = MXN is local), exposure is in MXN
  const exp1 = meta.isInverted ? Math.round(usdTargetM1 * spot) : Math.round(usdTargetM1 * spot);
  const exp2 = meta.isInverted ? Math.round(usdTargetM2 * spot) : Math.round(usdTargetM2 * spot);
  const exp3 = meta.isInverted ? Math.round(usdTargetM3 * spot) : Math.round(usdTargetM3 * spot);

  // Forward points (small percentage of spot for demo)
  const fwdPts1 = meta.forwardPointFormat === "PERCENTAGE" ? 0.002 : spot * 0.002;
  const fwdPts2 = meta.forwardPointFormat === "PERCENTAGE" ? 0.004 : spot * 0.004;
  const fwdPts3 = meta.forwardPointFormat === "PERCENTAGE" ? 0.006 : spot * 0.006;

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
      spot_usdmxn: pairId === "USDMXN" ? spot : 18.97, // legacy field
      forward_points_by_month: {
        [bk1]: pairId === "USDMXN" ? 0.0220 : fwdPts1,
        [bk2]: pairId === "USDMXN" ? 0.0440 : fwdPts2,
        [bk3]: pairId === "USDMXN" ? 0.0660 : fwdPts3,
      },
      provider_metadata: {
        source: "DEMO",
        primary_currency: ccy,
        pair: pairId,
        settlement_type: isNdf ? "NDF" : "DELIVERABLE",
        spot_rate: spot,
        // Multi-currency extension fields embedded in provider_metadata
        fx_rates: {
          EURUSD: 1.085, GBPUSD: 1.267,
          USDJPY: 149.0, USDCHF: 0.889, USDCAD: 1.362,
          AUDUSD: 0.654, NZDUSD: 0.613,
          USDSEK: 10.52, USDNOK: 10.61, USDDKK: 6.91,
          USDMXN: 18.97, USDBRL: 4.95, USDCOP: 4050.0,
          USDCLP: 925.0, USDPEN: 3.72,
          USDINR: 83.5, USDKRW: 1330.0, USDTWD: 31.5,
          USDPHP: 56.4, USDIDR: 15650.0, USDTHB: 35.2, USDMYR: 4.72,
          USDZAR: 18.8, USDTRY: 32.1, USDPLN: 4.05, USDHUF: 362.0,
        },
        pair_forward_points: {
          [pairId]: { [bk1]: fwdPts1, [bk2]: fwdPts2, [bk3]: fwdPts3 },
        },
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
