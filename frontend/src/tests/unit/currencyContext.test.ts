/**
 * currencyContext.test.ts
 *
 * Pure deterministic unit tests for the currency context utility.
 * Run with: npx ts-node --project tsconfig.json src/tests/unit/currencyContext.test.ts
 *
 * Tests cover:
 *  1. MXN single-currency dataset → correct baseCcy, pairLabel, spotRange
 *  2. EUR single-currency dataset → correct baseCcy, pairLabel, spotRange (price CCY)
 *  3. JPY single-currency dataset → correct baseCcy, pairLabel, spotRange
 *  4. Multi-currency dataset → isMultiCcy=true, dominant CCY selected
 *  5. Empty trades → MXN default
 *  6. Validator V-002: non-MXN currency accepted (not rejected)
 *  7. Validator V-011: spot range validation per currency (MXN range, EUR range, JPY range)
 */

import { deriveCurrencyContext, getSpotRange } from '../../utils/currencyContext';
import { validateAll } from '../../utils/validator';
import type { TradeRow, HedgeRow, MarketSnapshot, PolicyConfig } from '../../api/types';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, description: string): void {
  if (condition) {
    console.log(`  ✓ ${description}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL: ${description}`);
    failCount++;
  }
}

function assertEqual<T>(actual: T, expected: T, description: string): void {
  assert(actual === expected, `${description} — expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)}`);
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_MARKET_MXN: MarketSnapshot = {
  as_of: '2026-02-17T12:00:00Z',
  spot_usdmxn: 18.97,
  forward_points_by_month: { '2026-03': 0.048, '2026-04': 0.091 },
  provider_metadata: { source: 'test', currency_pair: 'USD/MXN' },
};

const BASE_MARKET_EUR: MarketSnapshot = {
  as_of: '2026-02-17T12:00:00Z',
  spot_usdmxn: 1.085,
  forward_points_by_month: { '2026-03': -0.002, '2026-04': -0.004 },
  provider_metadata: { source: 'test', currency_pair: 'EUR/USD', primary_currency: 'EUR' },
};

const BASE_MARKET_JPY: MarketSnapshot = {
  as_of: '2026-02-17T12:00:00Z',
  spot_usdmxn: 149.80,
  forward_points_by_month: { '2026-03': -0.200, '2026-04': -0.400 },
  provider_metadata: { source: 'test', currency_pair: 'USD/JPY', primary_currency: 'JPY' },
};

function makeTrade(currency: string, amount: number): TradeRow {
  return {
    record_id: `T-${currency}-${amount}`,
    entity: 'TestCo',
    type: 'AP',
    currency: currency as TradeRow['currency'],
    amount,
    value_date: '2026-03-15',
    status: 'CONFIRMED',
    description: '',
  };
}

function makeHedge(): HedgeRow {
  return {
    hedge_id: 'H-001',
    instrument: 'NDF',
    direction: 'SELL_MXN_BUY_USD',
    notional_mxn: 10_000_000,
    value_date: '2026-03-15',
    status: 'ACTIVE',
  };
}

const BASE_POLICY: PolicyConfig = {
  bucket_mode: 'CALENDAR_MONTH',
  hedge_ratios: { confirmed: 0.80, forecast: 0.50 },
  cost_assumptions: { spread_bps: 5 },
  execution_product: 'NDF',
  min_trade_size_usd: 500_000,
};

// ─── Test Suite ───────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════');
console.log(' TASK 1 UNIT TESTS: Currency Context + Validator');
console.log('══════════════════════════════════════════════════\n');

// ─── Suite 1: deriveCurrencyContext ──────────────────────────────────────────
console.log('Suite 1: deriveCurrencyContext — baseCcy resolution\n');

{
  const trades = [makeTrade('MXN', 14_500_000), makeTrade('MXN', 9_200_000)];
  const ctx = deriveCurrencyContext(trades, BASE_MARKET_MXN);
  assertEqual(ctx.baseCcy, 'MXN', '1.1 MXN trades → baseCcy=MXN');
  assertEqual(ctx.pairLabel, 'USD/MXN', '1.2 MXN → pairLabel=USD/MXN');
  assert(ctx.spotRange[0] === 10.0 && ctx.spotRange[1] === 30.0, '1.3 MXN → spotRange [10, 30]');
  assertEqual(ctx.isMultiCcy, false, '1.4 MXN-only → isMultiCcy=false');
  assertEqual(ctx.amountLabel, 'MXN', '1.5 MXN → amountLabel=MXN');
}

{
  const trades = [makeTrade('EUR', 2_800_000), makeTrade('EUR', 1_200_000)];
  const ctx = deriveCurrencyContext(trades, BASE_MARKET_EUR);
  assertEqual(ctx.baseCcy, 'EUR', '1.6 EUR trades → baseCcy=EUR');
  assertEqual(ctx.pairLabel, 'EUR/USD', '1.7 EUR → pairLabel=EUR/USD (price currency)');
  assert(ctx.spotRange[0] < 1.0 && ctx.spotRange[1] > 1.0, '1.8 EUR → spotRange contains 1.085');
  assertEqual(ctx.isMultiCcy, false, '1.9 EUR-only → isMultiCcy=false');
}

{
  const trades = [makeTrade('JPY', 280_000_000), makeTrade('JPY', 160_000_000)];
  const ctx = deriveCurrencyContext(trades, BASE_MARKET_JPY);
  assertEqual(ctx.baseCcy, 'JPY', '1.10 JPY trades → baseCcy=JPY');
  assertEqual(ctx.pairLabel, 'USD/JPY', '1.11 JPY → pairLabel=USD/JPY');
  assert(ctx.spotRange[0] >= 100 && ctx.spotRange[1] <= 170, '1.12 JPY → spotRange [100, 165]');
}

{
  const trades = [
    makeTrade('MXN', 14_500_000),
    makeTrade('EUR', 2_800_000),
    makeTrade('JPY', 280_000_000),  // dominant by absolute amount
    makeTrade('BRL', 5_000_000),
  ];
  const ctx = deriveCurrencyContext(trades, BASE_MARKET_JPY);
  assertEqual(ctx.isMultiCcy, true, '1.13 Mixed currencies → isMultiCcy=true');
  assertEqual(ctx.baseCcy, 'JPY', '1.14 JPY has highest notional → baseCcy=JPY');
  assert(ctx.allCurrencies.length === 4, '1.15 allCurrencies has 4 entries');
}

{
  // Empty trades: should not crash, should return safe default
  const ctx = deriveCurrencyContext([], BASE_MARKET_MXN);
  assertEqual(ctx.baseCcy, 'MXN', '1.16 Empty trades → baseCcy=MXN (safe default)');
  assertEqual(ctx.isMultiCcy, false, '1.17 Empty trades → isMultiCcy=false');
}

// ─── Suite 2: getSpotRange ────────────────────────────────────────────────────
console.log('\nSuite 2: getSpotRange — per-currency ranges\n');

{
  const [min, max] = getSpotRange('MXN');
  assert(min === 10.0 && max === 30.0, '2.1 MXN range is [10, 30]');
}
{
  const [min, max] = getSpotRange('EUR');
  assert(min < 1.0 && max > 1.0, '2.2 EUR range contains realistic EUR/USD values (0.75-1.30)');
}
{
  const [min, max] = getSpotRange('JPY');
  assert(min >= 100 && max <= 170, '2.3 JPY range is [100, 165]');
}
{
  const [min, max] = getSpotRange('TRY');
  assert(min >= 20 && max <= 55, '2.4 TRY range contains 32.85');
}
{
  const [min, max] = getSpotRange('UNKNOWN_CCY');
  assert(min === 0.0001 && max === 100_000, '2.5 Unknown currency → permissive default range');
}

// ─── Suite 3: validateAll — V-002 currency validation ────────────────────────
console.log('\nSuite 3: Validator V-002 — multi-currency acceptance\n');

{
  // MXN trades — should have no V-002 errors
  const trades = [makeTrade('MXN', 14_500_000)];
  const result = validateAll(trades, [makeHedge()], BASE_MARKET_MXN, BASE_POLICY);
  const v002 = result.errors.filter(e => e.code === 'V-002');
  assertEqual(v002.length, 0, '3.1 MXN trade: no V-002 error (was always accepted)');
}

{
  // EUR trades — previously caused V-002 CRITICAL. Now must be accepted.
  const trades = [makeTrade('EUR', 2_800_000), makeTrade('EUR', 1_400_000)];
  const result = validateAll(trades, [], BASE_MARKET_EUR, BASE_POLICY);
  const v002 = result.errors.filter(e => e.code === 'V-002');
  assertEqual(v002.length, 0, '3.2 EUR trades: V-002 ELIMINATED (multi-currency now accepted)');
}

{
  // JPY trades — previously caused V-002 CRITICAL. Now must be accepted.
  const trades = [makeTrade('JPY', 280_000_000)];
  const result = validateAll(trades, [], BASE_MARKET_JPY, BASE_POLICY);
  const v002 = result.errors.filter(e => e.code === 'V-002');
  assertEqual(v002.length, 0, '3.3 JPY trades: V-002 ELIMINATED');
}

{
  // Invalid currency — should still produce V-002
  const trades = [makeTrade('XYZ' as TradeRow['currency'], 1_000_000)];
  const result = validateAll(trades, [], BASE_MARKET_MXN, BASE_POLICY);
  const v002 = result.errors.filter(e => e.code === 'V-002');
  assert(v002.length > 0, '3.4 Invalid currency XYZ: V-002 still raised');
}

// ─── Suite 4: validateAll — V-011 per-currency spot range ────────────────────
console.log('\nSuite 4: Validator V-011 — per-currency spot range\n');

{
  // MXN fixture with correct spot 18.97 → no V-011
  const trades = [makeTrade('MXN', 14_500_000)];
  const result = validateAll(trades, [], BASE_MARKET_MXN, BASE_POLICY);
  const v011 = result.errors.filter(e => e.code === 'V-011');
  assertEqual(v011.length, 0, '4.1 MXN spot 18.97 in [10, 30]: V-011 not raised');
}

{
  // EUR fixture with spot 1.085 → no V-011 (EUR range is ~0.75-1.30)
  const trades = [makeTrade('EUR', 2_800_000)];
  const result = validateAll(trades, [], BASE_MARKET_EUR, BASE_POLICY);
  const v011 = result.errors.filter(e => e.code === 'V-011');
  assertEqual(v011.length, 0, '4.2 EUR spot 1.085 in [0.75, 1.30]: V-011 not raised');
}

{
  // JPY fixture with spot 149.80 → no V-011 (JPY range is 100-165)
  const trades = [makeTrade('JPY', 280_000_000)];
  const result = validateAll(trades, [], BASE_MARKET_JPY, BASE_POLICY);
  const v011 = result.errors.filter(e => e.code === 'V-011');
  assertEqual(v011.length, 0, '4.3 JPY spot 149.80 in [100, 165]: V-011 not raised');
}

{
  // Old bug: MXN-only SPOT_MAX=30 would reject JPY spot 149.80.
  // With per-currency ranges, JPY at 149.80 is valid.
  // Confirm the legacy MXN fixture (spot 18.97) still passes when loaded with MXN trades.
  const mxnTrades = [makeTrade('MXN', 5_000_000)];
  const mxnResult = validateAll(mxnTrades, [], BASE_MARKET_MXN, BASE_POLICY);
  const v011Mxn = mxnResult.errors.filter(e => e.code === 'V-011');
  assertEqual(v011Mxn.length, 0, '4.4 MXN regression: F01-style fixture still passes V-011');
}

{
  // EUR trades with MXN spot 18.97 — spot is wrong for EUR (should be ~1.08).
  // Spot 18.97 is NOT in EUR range [0.75, 1.30] → V-011 should fire.
  const trades = [makeTrade('EUR', 2_800_000)];
  const wrongMarket: MarketSnapshot = { ...BASE_MARKET_MXN }; // spot 18.97 wrong for EUR
  const result = validateAll(trades, [], wrongMarket, BASE_POLICY);
  const v011 = result.errors.filter(e => e.code === 'V-011');
  assert(v011.length > 0, '4.5 EUR trades with MXN spot 18.97: V-011 fires (wrong spot for EUR)');
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log(` RESULTS: ${passCount} passed, ${failCount} failed`);
console.log('══════════════════════════════════════════════════\n');

if (failCount > 0) {
  process.exit(1);
}
