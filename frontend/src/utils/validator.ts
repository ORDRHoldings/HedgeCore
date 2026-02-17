import type { TradeRow, HedgeRow, MarketSnapshot, PolicyConfig } from '../api/types';
import { FUTURES_CURRENCY_LIST } from '../api/types';
import { POINTS_ABS_MAX, BUCKET_RE } from '../constants/validation';
import { deriveCurrencyContext } from './currencyContext';

/** Set of all valid futures currency codes for O(1) lookup */
const VALID_CURRENCIES: Set<string> = new Set(
  FUTURES_CURRENCY_LIST.map(c => c.code as string),
);

export interface ClientValidationError {
  code: string;
  field: string;
  message: string;
  severity: 'CRITICAL' | 'WARNING';
}

export interface ClientValidationResult {
  status: 'PASS' | 'FAIL';
  errors: ClientValidationError[];
  warnings: ClientValidationError[];
  canCalculate: boolean;
}

function err(code: string, field: string, message: string): ClientValidationError {
  return { code, field, message, severity: 'CRITICAL' };
}

function warn(code: string, field: string, message: string): ClientValidationError {
  return { code, field, message, severity: 'WARNING' };
}

function getBucket(dateStr: string): string {
  return dateStr.slice(0, 7); // YYYY-MM
}

export function validateAll(
  trades: TradeRow[],
  hedges: HedgeRow[],
  market: MarketSnapshot,
  policy: PolicyConfig,
): ClientValidationResult {
  const all: ClientValidationError[] = [];

  // V-019: empty trades
  if (trades.length === 0) {
    all.push(err('V-019', 'trades', 'Trades list is empty. At least one trade is required.'));
  }

  const seenTradeIds = new Set<string>();
  const forwardBuckets = new Set(Object.keys(market.forward_points_by_month));

  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    const prefix = `trades[${i}]`;

    // V-001: amount <= 0
    if (t.amount <= 0) {
      all.push(err('V-001', `${prefix}.amount`, `Trade amount must be > 0, got ${t.amount}.`));
    }

    // V-002 (UPDATED): currency must be a CME/ICE-listed FuturesCurrency.
    // No longer restricted to MXN only. All 26 listed currencies are accepted.
    if (!VALID_CURRENCIES.has(t.currency)) {
      all.push(err('V-002', `${prefix}.currency`,
        `Currency '${t.currency}' is not a supported futures-listed currency.`));
    }

    // V-003: type not AR|AP
    if (t.type !== 'AR' && t.type !== 'AP') {
      all.push(err('V-003', `${prefix}.type`, `Type must be AR or AP, got ${t.type}.`));
    }

    // V-004: status not CONFIRMED|FORECAST
    if (t.status !== 'CONFIRMED' && t.status !== 'FORECAST') {
      all.push(err('V-004', `${prefix}.status`, `Status must be CONFIRMED or FORECAST, got ${t.status}.`));
    }

    // V-005: past value_date (WARNING)
    if (t.value_date && market.as_of) {
      const tradeDate = new Date(t.value_date);
      const asOf = new Date(market.as_of);
      if (tradeDate < asOf) {
        all.push(warn('V-005', `${prefix}.value_date`, `Value date ${t.value_date} is before market as_of.`));
      }
    }

    // V-006: duplicate record_id
    if (t.record_id) {
      if (seenTradeIds.has(t.record_id)) {
        all.push(err('V-006', `${prefix}.record_id`, `Duplicate record_id: ${t.record_id}.`));
      }
      seenTradeIds.add(t.record_id);
    }

    // V-014: trade bucket missing forward points
    if (t.value_date) {
      const bucket = getBucket(t.value_date);
      if (bucket && !forwardBuckets.has(bucket)) {
        all.push(err('V-014', `${prefix}.value_date`, `Trade bucket ${bucket} has no forward points.`));
      }
    }
  }

  // --- Hedge validations ---
  const seenHedgeIds = new Set<string>();

  for (let i = 0; i < hedges.length; i++) {
    const h = hedges[i];
    const prefix = `hedges[${i}]`;

    if (h.notional_mxn <= 0) {
      all.push(err('V-007', `${prefix}.notional_mxn`, `Notional must be > 0, got ${h.notional_mxn}.`));
    }

    if (h.direction !== 'SELL_MXN_BUY_USD' && h.direction !== 'BUY_MXN_SELL_USD') {
      all.push(err('V-008', `${prefix}.direction`, `Invalid direction: ${h.direction}.`));
    }

    if (h.instrument !== 'NDF' && h.instrument !== 'FWD') {
      all.push(err('V-009', `${prefix}.instrument`, `Instrument must be NDF or FWD, got ${h.instrument}.`));
    }

    if (h.hedge_id) {
      if (seenHedgeIds.has(h.hedge_id)) {
        all.push(err('V-010', `${prefix}.hedge_id`, `Duplicate hedge_id: ${h.hedge_id}.`));
      }
      seenHedgeIds.add(h.hedge_id);
    }

    if (h.value_date) {
      const bucket = getBucket(h.value_date);
      if (bucket && !forwardBuckets.has(bucket)) {
        all.push(warn('V-015', `${prefix}.value_date`, `Hedge bucket ${bucket} has no forward points.`));
      }
    }
  }

  // --- Market validations ---

  // V-011 (UPDATED): per-currency spot range validation.
  // Replaces the single hardcoded SPOT_MIN/SPOT_MAX (10-30) that only applied to MXN.
  const ctx = deriveCurrencyContext(trades, market);
  const [spotMin, spotMax] = ctx.spotRange;
  const spot = market.spot_usdmxn;

  if (spot <= 0 || spot < spotMin || spot > spotMax) {
    all.push(err('V-011', 'market.spot_usdmxn',
      `Spot ${ctx.pairLabel} must be in (${spotMin}..${spotMax}), got ${spot}.`));
  }

  // V-012: empty forward_points
  const fpKeys = Object.keys(market.forward_points_by_month);
  if (fpKeys.length === 0) {
    all.push(err('V-012', 'market.forward_points_by_month', 'Forward points map is empty.'));
  } else {
    for (const key of fpKeys) {
      if (!BUCKET_RE.test(key)) {
        all.push(err('V-013', `market.forward_points_by_month["${key}"]`,
          `Invalid bucket key format: ${key}. Expected YYYY-MM.`));
      }
      const val = market.forward_points_by_month[key];
      if (Math.abs(val) >= POINTS_ABS_MAX) {
        all.push(err('V-021', `market.forward_points_by_month["${key}"]`,
          `Forward points abs(${val}) >= ${POINTS_ABS_MAX}. Reject pips-like values.`));
      }
    }
  }

  // --- Policy validations ---
  if (policy.hedge_ratios.confirmed < 0 || policy.hedge_ratios.confirmed > 1) {
    all.push(err('V-016', 'policy.hedge_ratios.confirmed',
      `Confirmed ratio must be 0..1, got ${policy.hedge_ratios.confirmed}.`));
  }
  if (policy.hedge_ratios.forecast < 0 || policy.hedge_ratios.forecast > 1) {
    all.push(err('V-016', 'policy.hedge_ratios.forecast',
      `Forecast ratio must be 0..1, got ${policy.hedge_ratios.forecast}.`));
  }
  if (policy.min_trade_size_usd < 0) {
    all.push(err('V-017', 'policy.min_trade_size_usd',
      `Min trade size must be >= 0, got ${policy.min_trade_size_usd}.`));
  }
  if (policy.cost_assumptions.spread_bps < 0) {
    all.push(err('V-018', 'policy.cost_assumptions.spread_bps',
      `Spread must be >= 0, got ${policy.cost_assumptions.spread_bps}.`));
  }

  // --- Assemble result ---
  const errors = all.filter(e => e.severity === 'CRITICAL');
  const warnings = all.filter(e => e.severity === 'WARNING');
  const hasCritical = errors.length > 0;

  return {
    status: hasCritical ? 'FAIL' : 'PASS',
    errors,
    warnings,
    canCalculate: !hasCritical && trades.length > 0,
  };
}
