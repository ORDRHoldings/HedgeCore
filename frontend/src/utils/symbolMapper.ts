import { getCurrencySpec } from './currencySymbolMap';

export const CONTRACT_SIZE_MXN = 500_000;

// Legacy constant kept for backward compatibility — CME Mexican Peso Futures (6M)
export const CME_6M_SPECS = {
  contractSize: 500_000,
  tickSize: 0.00001,
  tickValue: 5,
  marginEstimate: 2_500,
  description: 'CME Mexican Peso Futures (6M)',
  symbol: '6M',
};

export interface InstrumentMapping {
  tradingview_symbol: string;
  display_label: string;
  ibkr_symbol: string | null;
  expiry_label: string;
  /** Contract size in base currency units (field named _mxn for schema compat; holds generic notional) */
  contract_size_mxn: number | null;
  suggested_contracts: number | null;
  is_proxy: boolean;
  notional_usd?: number;
  margin_estimate_usd?: number;
  basis_risk_note?: string;
  /** The base currency this mapping was computed for */
  base_ccy: string;
}

const QUARTER_MAP: Record<number, { code: string; name: string; month: number }> = {
  1:  { code: 'H', name: 'Mar', month: 3 },
  2:  { code: 'H', name: 'Mar', month: 3 },
  3:  { code: 'H', name: 'Mar', month: 3 },
  4:  { code: 'M', name: 'Jun', month: 6 },
  5:  { code: 'M', name: 'Jun', month: 6 },
  6:  { code: 'M', name: 'Jun', month: 6 },
  7:  { code: 'U', name: 'Sep', month: 9 },
  8:  { code: 'U', name: 'Sep', month: 9 },
  9:  { code: 'U', name: 'Sep', month: 9 },
  10: { code: 'Z', name: 'Dec', month: 12 },
  11: { code: 'Z', name: 'Dec', month: 12 },
  12: { code: 'Z', name: 'Dec', month: 12 },
};

function parseBucket(bucket: string): { year: number; month: number } {
  const [y, m] = bucket.split('-').map(Number);
  return { year: y, month: m };
}

function formatMonthLabel(bucket: string): string {
  const { year, month } = parseBucket(bucket);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[month - 1]}-${String(year).slice(2)}`;
}

/**
 * Map a bucket+instrument combination to execution details.
 *
 * @param bucket         YYYY-MM calendar bucket
 * @param instrumentType NDF or FUTURES
 * @param actionNotional Action amount in base currency (was actionMxn, now currency-agnostic)
 * @param forwardRate    Forward rate for this bucket
 * @param baseCcy        Base currency code (e.g. 'MXN', 'EUR', 'JPY'). Defaults to 'MXN'.
 */
export function mapBucketToInstrument(
  bucket: string,
  instrumentType: 'NDF' | 'FUTURES',
  actionNotional: number,
  forwardRate?: number,
  baseCcy: string = 'MXN',
): InstrumentMapping {
  const { year, month } = parseBucket(bucket);
  const monthLabel = formatMonthLabel(bucket);
  const spec = getCurrencySpec(baseCcy);

  if (instrumentType === 'NDF') {
    return {
      tradingview_symbol: spec.tvSpotSymbol,
      display_label: `${spec.ndfLabel} ${monthLabel}`,
      ibkr_symbol: null,
      expiry_label: monthLabel,
      contract_size_mxn: null,
      suggested_contracts: null,
      is_proxy: false,
      base_ccy: baseCcy,
    };
  }

  // FUTURES mode — map to nearest CME quarterly
  const q = QUARTER_MAP[month];
  const tvSymbol = spec.tvFuturesSymbol;

  const contracts = spec.contractSize > 0
    ? Math.round(Math.abs(actionNotional) / spec.contractSize)
    : 0;
  const notionalUSD = forwardRate && forwardRate > 0
    ? Math.abs(actionNotional) / forwardRate
    : undefined;
  const marginEstimate = contracts * spec.marginEstimate;

  const isProxy = spec.isNdf || spec.ibkrSymbol === null;
  const proxyNote = isProxy ? ' (proxy)' : '';

  return {
    tradingview_symbol: tvSymbol,
    display_label: `${spec.futuresDescription.split(' ').slice(0, 3).join(' ')} ${q.name}-${String(year).slice(2)}${proxyNote}`,
    ibkr_symbol: spec.ibkrSymbol,
    expiry_label: `${q.name}-${String(year).slice(2)}`,
    contract_size_mxn: spec.contractSize,
    suggested_contracts: contracts,
    is_proxy: isProxy,
    notional_usd: notionalUSD,
    margin_estimate_usd: marginEstimate,
    basis_risk_note: isProxy
      ? `${spec.futuresDescription} — proxy instrument; verify liquidity before execution`
      : 'CME contracts settle quarterly; monthly exposures may require rolling positions',
    base_ccy: baseCcy,
  };
}
