/**
 * currencySymbolMap.ts
 *
 * Maps FuturesCurrency codes to TradingView symbols and CME/ICE futures specs.
 * Used by ExecutionBridge and symbolMapper to produce correct per-currency charts
 * and contract calculations instead of hardcoding MXN/6M everywhere.
 */

export interface CurrencyTvSpec {
  /** TradingView symbol for the spot pair (FX_IDC:... or OANDA:...) */
  tvSpotSymbol: string;
  /** TradingView symbol for the nearest futures contract */
  tvFuturesSymbol: string;
  /** CME / ICE IBKR ticker for futures */
  ibkrSymbol: string | null;
  /** Display label for the futures instrument */
  futuresDescription: string;
  /** NDF display label for the tenor  */
  ndfLabel: string;
  /** Contract size in base currency units */
  contractSize: number;
  /** Estimated margin per contract (USD) */
  marginEstimate: number;
  /** Is this instrument an NDF (non-deliverable) vs physical forward? */
  isNdf: boolean;
}

// Currencies quoted as CCY/USD (price currency, 1 CCY > 1 USD)
const _PRICE_CCY = new Set(['EUR', 'GBP', 'AUD', 'NZD', 'CHF']);


/**
 * Per-currency TradingView + futures specifications.
 * Keys are ISO 4217 currency codes (matching FUTURES_CURRENCY_LIST).
 */
const CCY_SPEC_MAP: Record<string, CurrencyTvSpec> = {
  MXN: {
    tvSpotSymbol: 'FX_IDC:USDMXN',
    tvFuturesSymbol: 'CME:6M1!',
    ibkrSymbol: 'MXN',
    futuresDescription: 'CME Mexican Peso Futures (6M)',
    ndfLabel: 'USD/MXN NDF',
    contractSize: 500_000,
    marginEstimate: 2_500,
    isNdf: false,
  },
  EUR: {
    tvSpotSymbol: 'FX_IDC:EURUSD',
    tvFuturesSymbol: 'CME:6E1!',
    ibkrSymbol: 'EUR',
    futuresDescription: 'CME Euro Futures (6E)',
    ndfLabel: 'EUR/USD FWD',
    contractSize: 125_000,
    marginEstimate: 2_200,
    isNdf: false,
  },
  GBP: {
    tvSpotSymbol: 'FX_IDC:GBPUSD',
    tvFuturesSymbol: 'CME:6B1!',
    ibkrSymbol: 'GBP',
    futuresDescription: 'CME British Pound Futures (6B)',
    ndfLabel: 'GBP/USD FWD',
    contractSize: 62_500,
    marginEstimate: 2_000,
    isNdf: false,
  },
  JPY: {
    tvSpotSymbol: 'FX_IDC:USDJPY',
    tvFuturesSymbol: 'CME:6J1!',
    ibkrSymbol: 'JPY',
    futuresDescription: 'CME Japanese Yen Futures (6J)',
    ndfLabel: 'USD/JPY FWD',
    contractSize: 12_500_000,
    marginEstimate: 2_800,
    isNdf: false,
  },
  CAD: {
    tvSpotSymbol: 'FX_IDC:USDCAD',
    tvFuturesSymbol: 'CME:6C1!',
    ibkrSymbol: 'CAD',
    futuresDescription: 'CME Canadian Dollar Futures (6C)',
    ndfLabel: 'USD/CAD FWD',
    contractSize: 100_000,
    marginEstimate: 1_500,
    isNdf: false,
  },
  AUD: {
    tvSpotSymbol: 'FX_IDC:AUDUSD',
    tvFuturesSymbol: 'CME:6A1!',
    ibkrSymbol: 'AUD',
    futuresDescription: 'CME Australian Dollar Futures (6A)',
    ndfLabel: 'AUD/USD FWD',
    contractSize: 100_000,
    marginEstimate: 1_600,
    isNdf: false,
  },
  CHF: {
    tvSpotSymbol: 'FX_IDC:USDCHF',
    tvFuturesSymbol: 'CME:6S1!',
    ibkrSymbol: 'CHF',
    futuresDescription: 'CME Swiss Franc Futures (6S)',
    ndfLabel: 'CHF/USD FWD',
    contractSize: 125_000,
    marginEstimate: 2_100,
    isNdf: false,
  },
  NZD: {
    tvSpotSymbol: 'FX_IDC:NZDUSD',
    tvFuturesSymbol: 'CME:6N1!',
    ibkrSymbol: 'NZD',
    futuresDescription: 'CME New Zealand Dollar Futures (6N)',
    ndfLabel: 'NZD/USD FWD',
    contractSize: 100_000,
    marginEstimate: 1_400,
    isNdf: false,
  },
  BRL: {
    tvSpotSymbol: 'FX_IDC:USDBRL',
    tvFuturesSymbol: 'CME:6L1!',
    ibkrSymbol: null,
    futuresDescription: 'CME BRL Futures (6L) — proxy',
    ndfLabel: 'USD/BRL NDF',
    contractSize: 100_000,
    marginEstimate: 3_000,
    isNdf: true,
  },
  ZAR: {
    tvSpotSymbol: 'FX_IDC:USDZAR',
    tvFuturesSymbol: 'CME:6Z1!',
    ibkrSymbol: null,
    futuresDescription: 'CME ZAR Futures (6Z) — proxy',
    ndfLabel: 'USD/ZAR NDF',
    contractSize: 500_000,
    marginEstimate: 2_000,
    isNdf: true,
  },
  INR: {
    tvSpotSymbol: 'FX_IDC:USDINR',
    tvFuturesSymbol: 'CME:6I1!',
    ibkrSymbol: null,
    futuresDescription: 'CME INR Futures (6I) — proxy',
    ndfLabel: 'USD/INR NDF',
    contractSize: 5_000_000,
    marginEstimate: 2_500,
    isNdf: true,
  },
  CNH: {
    tvSpotSymbol: 'FX_IDC:USDCNH',
    tvFuturesSymbol: 'CME:6CNH1!',
    ibkrSymbol: null,
    futuresDescription: 'CME CNH Futures — proxy',
    ndfLabel: 'USD/CNH NDF',
    contractSize: 1_000_000,
    marginEstimate: 3_200,
    isNdf: true,
  },
  KRW: {
    tvSpotSymbol: 'FX_IDC:USDKRW',
    tvFuturesSymbol: 'CME:6KW1!',
    ibkrSymbol: null,
    futuresDescription: 'CME KRW Futures — proxy',
    ndfLabel: 'USD/KRW NDF',
    contractSize: 125_000_000,
    marginEstimate: 2_000,
    isNdf: true,
  },
  TRY: {
    tvSpotSymbol: 'FX_IDC:USDTRY',
    tvFuturesSymbol: 'CME:6TRY1!',
    ibkrSymbol: null,
    futuresDescription: 'CME TRY Futures — proxy',
    ndfLabel: 'USD/TRY NDF',
    contractSize: 500_000,
    marginEstimate: 4_000,
    isNdf: true,
  },
  SGD: {
    tvSpotSymbol: 'FX_IDC:USDSGD',
    tvFuturesSymbol: 'CME:6G1!',
    ibkrSymbol: null,
    futuresDescription: 'CME SGD Futures (6G)',
    ndfLabel: 'USD/SGD FWD',
    contractSize: 125_000,
    marginEstimate: 1_800,
    isNdf: false,
  },
  CLP: {
    tvSpotSymbol: 'FX_IDC:USDCLP',
    tvFuturesSymbol: 'FX_IDC:USDCLP',
    ibkrSymbol: null,
    futuresDescription: 'USD/CLP NDF (OTC only)',
    ndfLabel: 'USD/CLP NDF',
    contractSize: 100_000_000,
    marginEstimate: 2_000,
    isNdf: true,
  },
  COP: {
    tvSpotSymbol: 'FX_IDC:USDCOP',
    tvFuturesSymbol: 'FX_IDC:USDCOP',
    ibkrSymbol: null,
    futuresDescription: 'USD/COP NDF (OTC only)',
    ndfLabel: 'USD/COP NDF',
    contractSize: 1_000_000_000,
    marginEstimate: 2_000,
    isNdf: true,
  },
  PEN: {
    tvSpotSymbol: 'FX_IDC:USDPEN',
    tvFuturesSymbol: 'FX_IDC:USDPEN',
    ibkrSymbol: null,
    futuresDescription: 'USD/PEN NDF (OTC only)',
    ndfLabel: 'USD/PEN NDF',
    contractSize: 100_000,
    marginEstimate: 2_000,
    isNdf: true,
  },
  TWD: {
    tvSpotSymbol: 'FX_IDC:USDTWD',
    tvFuturesSymbol: 'FX_IDC:USDTWD',
    ibkrSymbol: null,
    futuresDescription: 'USD/TWD NDF (OTC only)',
    ndfLabel: 'USD/TWD NDF',
    contractSize: 5_000_000,
    marginEstimate: 2_000,
    isNdf: true,
  },
  SEK: {
    tvSpotSymbol: 'FX_IDC:USDSEK',
    tvFuturesSymbol: 'FX_IDC:USDSEK',
    ibkrSymbol: null,
    futuresDescription: 'USD/SEK FWD (OTC)',
    ndfLabel: 'USD/SEK FWD',
    contractSize: 1_000_000,
    marginEstimate: 1_500,
    isNdf: false,
  },
  NOK: {
    tvSpotSymbol: 'FX_IDC:USDNOK',
    tvFuturesSymbol: 'FX_IDC:USDNOK',
    ibkrSymbol: null,
    futuresDescription: 'USD/NOK FWD (OTC)',
    ndfLabel: 'USD/NOK FWD',
    contractSize: 1_000_000,
    marginEstimate: 1_500,
    isNdf: false,
  },
  DKK: {
    tvSpotSymbol: 'FX_IDC:USDDKK',
    tvFuturesSymbol: 'FX_IDC:USDDKK',
    ibkrSymbol: null,
    futuresDescription: 'USD/DKK FWD (OTC)',
    ndfLabel: 'USD/DKK FWD',
    contractSize: 1_000_000,
    marginEstimate: 1_500,
    isNdf: false,
  },
  HUF: {
    tvSpotSymbol: 'FX_IDC:USDHUF',
    tvFuturesSymbol: 'CME:6HU1!',
    ibkrSymbol: null,
    futuresDescription: 'CME HUF Futures (6HU) — proxy',
    ndfLabel: 'USD/HUF NDF',
    contractSize: 30_000_000,
    marginEstimate: 2_000,
    isNdf: true,
  },
  PLN: {
    tvSpotSymbol: 'FX_IDC:USDPLN',
    tvFuturesSymbol: 'CME:6PL1!',
    ibkrSymbol: null,
    futuresDescription: 'CME PLN Futures (6PL) — proxy',
    ndfLabel: 'USD/PLN NDF',
    contractSize: 500_000,
    marginEstimate: 2_000,
    isNdf: true,
  },
  CZK: {
    tvSpotSymbol: 'FX_IDC:USDCZK',
    tvFuturesSymbol: 'FX_IDC:USDCZK',
    ibkrSymbol: null,
    futuresDescription: 'USD/CZK FWD (OTC)',
    ndfLabel: 'USD/CZK FWD',
    contractSize: 4_000_000,
    marginEstimate: 2_000,
    isNdf: false,
  },
  ILS: {
    tvSpotSymbol: 'FX_IDC:USDILS',
    tvFuturesSymbol: 'FX_IDC:USDILS',
    ibkrSymbol: null,
    futuresDescription: 'USD/ILS NDF (OTC only)',
    ndfLabel: 'USD/ILS NDF',
    contractSize: 1_000_000,
    marginEstimate: 2_000,
    isNdf: true,
  },
};

/** Fallback spec for unlisted currencies */
const FALLBACK_SPEC: CurrencyTvSpec = {
  tvSpotSymbol: 'FX_IDC:USDMXN',
  tvFuturesSymbol: 'CME:6M1!',
  ibkrSymbol: null,
  futuresDescription: 'FX Forward (OTC)',
  ndfLabel: 'FX NDF',
  contractSize: 100_000,
  marginEstimate: 2_000,
  isNdf: true,
};

/**
 * Get the TradingView + futures spec for a given base currency.
 * Falls back to MXN spec if currency is not in the map.
 */
export function getCurrencySpec(ccy: string): CurrencyTvSpec {
  return CCY_SPEC_MAP[ccy] ?? FALLBACK_SPEC;
}

/**
 * Get the TradingView spot symbol for a given currency.
 * e.g. getCurrencyTvSymbol('EUR') → 'FX_IDC:EURUSD'
 *      getCurrencyTvSymbol('JPY') → 'FX_IDC:USDJPY'
 */
export function getTradingViewSymbol(ccy: string): string {
  return CCY_SPEC_MAP[ccy]?.tvSpotSymbol ?? FALLBACK_SPEC.tvSpotSymbol;
}
