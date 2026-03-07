/**
 * currencyContext.ts
 *
 * Single canonical source of currency context for a given set of trades + market.
 *
 * Rules:
 *  1. baseCcy  = the dominant currency in the trades set (most total notional).
 *                If all trades share one currency that is baseCcy.
 *                If multi-currency, baseCcy = the one with highest aggregate absolute amount.
 *  2. pairLabel = USD/{baseCcy} for most currencies; {baseCcy}/USD for "price" currencies
 *                 (EUR, GBP, AUD, NZD, CHF) where 1 CCY > 1 USD.
 *  3. isMultiCcy = trades include more than one distinct currency.
 *  4. spotRangeFor(ccy) = [min, max] for spot validation per currency.
 *
 * All UI labels must call these helpers — never hard-code "MXN" in display strings.
 */

import type { TradeRow, MarketSnapshot } from '../api/types';

/** Currencies quoted as price-currency (CCY/USD, i.e. 1 CCY > 1 USD) */
const PRICE_CCY = new Set(['EUR', 'GBP', 'AUD', 'NZD', 'CHF']);

/** Reasonable spot rate ranges per currency (vs USD, using the correct quotation).
 *  Used for client-side validation of market.spot_rate field (which holds whatever
 *  pair's spot was configured). Ranges are intentionally wide to allow for future volatility.
 */
const SPOT_RANGES: Record<string, [number, number]> = {
  MXN: [10.0, 30.0],
  BRL: [3.5, 8.0],
  CLP: [600, 1400],
  COP: [2500, 6000],
  EUR: [0.75, 1.30],   // EUR/USD (price)
  GBP: [0.65, 1.10],   // GBP/USD (price)
  CHF: [0.80, 1.10],   // CHF/USD (price, approx 1 CHF ~ 1.1 USD or 0.9 USD)
  AUD: [0.55, 0.85],   // AUD/USD (price)
  NZD: [0.50, 0.80],   // NZD/USD (price)
  JPY: [100.0, 165.0],
  CNY: [6.0, 8.5],
  HKD: [7.6, 8.0],
  KRW: [1100, 1500],
  SGD: [1.2, 1.5],
  TWD: [28.0, 36.0],
  INR: [70.0, 95.0],
  CAD: [1.2, 1.5],
  SEK: [9.0, 13.0],
  NOK: [9.0, 13.0],
  DKK: [6.0, 8.0],
  PLN: [3.5, 5.0],
  CZK: [20.0, 28.0],
  HUF: [300.0, 420.0],
  ZAR: [14.0, 22.0],
  TRY: [20.0, 50.0],
  RUB: [60.0, 130.0],
};

/** Default range if currency not in table (permissive). */
const DEFAULT_RANGE: [number, number] = [0.0001, 100_000];

export interface CurrencyContext {
  /** The primary/dominant trade currency. */
  baseCcy: string;
  /** The label for the FX pair (e.g. "USD/MXN", "EUR/USD", "USD/JPY"). */
  pairLabel: string;
  /** True when trades span more than one currency. */
  isMultiCcy: boolean;
  /** All distinct currencies present in trades. */
  allCurrencies: string[];
  /** Spot [min, max] valid range for the baseCcy pair. */
  spotRange: [number, number];
  /** Human-readable label for amounts (e.g. "MXN", "EUR", "JPY"). */
  amountLabel: string;
  /** Human-readable label for the spot rate input (e.g. "USD/MXN Spot", "EUR/USD Spot"). */
  spotLabel: string;
}

/**
 * Derive currency context from current trades + market.
 * This is the single canonical call — pass its result to every component that
 * needs to display currency labels or validate spot ranges.
 */
export function deriveCurrencyContext(
  trades: TradeRow[],
  market: MarketSnapshot,
): CurrencyContext {
  // --- Step 1: find all currencies present in trades ----------------------
  const ccyTotals: Record<string, number> = {};
  for (const t of trades) {
    const c = t.currency ?? 'MXN';
    ccyTotals[c] = (ccyTotals[c] ?? 0) + Math.abs(t.amount);
  }

  const allCurrencies = Object.keys(ccyTotals);

  // --- Step 2: baseCcy = currency with highest total absolute notional -----
  let baseCcy = 'MXN';   // safe default
  if (allCurrencies.length > 0) {
    baseCcy = allCurrencies.reduce((a, b) => (ccyTotals[a] >= ccyTotals[b] ? a : b));
  }

  // --- Step 3: check provider_metadata for authoritative currency override --
  // primary_currency in provider_metadata is always authoritative — it tells us
  // which currency the market snapshot's spot/forward data is expressed in.
  // This is critical for multi-currency fixtures (F09) and high-notional-count
  // currencies like JPY where raw amount ordering is misleading.
  const meta = market.provider_metadata ?? {};
  const metaPrimary = typeof meta['primary_currency'] === 'string' ? meta['primary_currency'] : null;
  const metaPair    = typeof meta['currency_pair'] === 'string' ? meta['currency_pair'] : null;

  if (metaPrimary && metaPrimary !== 'USD') {
    // Explicit primary_currency always wins — this is the market operator's intent
    baseCcy = metaPrimary;
  } else if (allCurrencies.length === 1) {
    // Single-currency trades with no metadata override: trivially correct
    baseCcy = allCurrencies[0];
  } else if (allCurrencies.length > 1 && !metaPrimary) {
    // Multi-currency without explicit override: use trades-derived dominant
    // (already set above from raw amounts; left as-is)
  } else if (metaPair && !metaPrimary) {
    // Fall back to pair label parsing only if no primary_currency is set
    const parts = metaPair.split('/');
    if (parts.length === 2) {
      const [from, to] = parts;
      if (from !== 'USD') baseCcy = from;
      else if (to !== 'USD') baseCcy = to;
    }
  }

  // --- Step 4: derive pair label -------------------------------------------
  const isPriceCcy = PRICE_CCY.has(baseCcy);
  const pairLabel  = isPriceCcy ? `${baseCcy}/USD` : `USD/${baseCcy}`;

  // --- Step 5: spot range --------------------------------------------------
  const spotRange = SPOT_RANGES[baseCcy] ?? DEFAULT_RANGE;

  return {
    baseCcy,
    pairLabel,
    isMultiCcy: allCurrencies.length > 1,
    allCurrencies,
    spotRange,
    amountLabel: baseCcy,
    spotLabel: `${pairLabel} Spot`,
  };
}

/**
 * Format a number as compact notation with the correct currency label appended.
 * e.g. fmtCcy(14_500_000, 'MXN') → "14.5M MXN"
 *      fmtCcy(2_800_000, 'EUR')  → "2.8M EUR"
 */
export function fmtCcy(amount: number, ccy: string): string {
  const compact = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount);
  return `${compact} ${ccy}`;
}

/**
 * Format a number as a plain decimal with the correct currency label.
 * e.g. fmtCcyFull(14_500_000, 'MXN') → "14,500,000 MXN"
 */
export function fmtCcyFull(amount: number, ccy: string): string {
  const full = new Intl.NumberFormat('en-US', {
    style: 'decimal',
    maximumFractionDigits: 0,
  }).format(amount);
  return `${full} ${ccy}`;
}

/**
 * Get spot validation range for a given currency.
 * Used by validator.ts and MarketSnapshotPanel to replace the single hardcoded
 * SPOT_MIN/SPOT_MAX that only applied to MXN.
 */
export function getSpotRange(ccy: string): [number, number] {
  return SPOT_RANGES[ccy] ?? DEFAULT_RANGE;
}
