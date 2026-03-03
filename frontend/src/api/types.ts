// Currencies with active CME / ICE futures contracts
export type FuturesCurrency =
  | 'MXN' | 'BRL' | 'CLP' | 'COP'   // LatAm
  | 'EUR' | 'GBP' | 'CHF' | 'SEK' | 'NOK' | 'DKK' | 'PLN' | 'CZK' | 'HUF'  // European
  | 'JPY' | 'CNY' | 'HKD' | 'KRW' | 'SGD' | 'TWD' | 'INR'  // Asia-Pacific
  | 'AUD' | 'NZD'                    // Oceania
  | 'CAD'                            // North America
  | 'ZAR' | 'TRY' | 'RUB';          // EMEA EM

export const FUTURES_CURRENCY_LIST: { code: FuturesCurrency; name: string; exchange: string }[] = [
  { code: 'MXN', name: 'Mexican Peso',            exchange: 'CME' },
  { code: 'BRL', name: 'Brazilian Real',           exchange: 'CME' },
  { code: 'CLP', name: 'Chilean Peso',             exchange: 'CME' },
  { code: 'COP', name: 'Colombian Peso',           exchange: 'CME' },
  { code: 'EUR', name: 'Euro',                     exchange: 'CME' },
  { code: 'GBP', name: 'British Pound',            exchange: 'CME' },
  { code: 'CHF', name: 'Swiss Franc',              exchange: 'CME' },
  { code: 'JPY', name: 'Japanese Yen',             exchange: 'CME' },
  { code: 'CNY', name: 'Chinese Yuan (Offshore)',  exchange: 'CME' },
  { code: 'HKD', name: 'Hong Kong Dollar',         exchange: 'CME' },
  { code: 'KRW', name: 'Korean Won',               exchange: 'CME' },
  { code: 'SGD', name: 'Singapore Dollar',         exchange: 'CME' },
  { code: 'TWD', name: 'Taiwan Dollar',            exchange: 'CME' },
  { code: 'INR', name: 'Indian Rupee',             exchange: 'CME' },
  { code: 'AUD', name: 'Australian Dollar',        exchange: 'CME' },
  { code: 'NZD', name: 'New Zealand Dollar',       exchange: 'CME' },
  { code: 'CAD', name: 'Canadian Dollar',          exchange: 'CME' },
  { code: 'SEK', name: 'Swedish Krona',            exchange: 'CME' },
  { code: 'NOK', name: 'Norwegian Krone',          exchange: 'CME' },
  { code: 'DKK', name: 'Danish Krone',             exchange: 'CME' },
  { code: 'PLN', name: 'Polish Zloty',             exchange: 'CME' },
  { code: 'CZK', name: 'Czech Koruna',             exchange: 'CME' },
  { code: 'HUF', name: 'Hungarian Forint',         exchange: 'CME' },
  { code: 'ZAR', name: 'South African Rand',       exchange: 'CME' },
  { code: 'TRY', name: 'Turkish Lira',             exchange: 'CME' },
  { code: 'RUB', name: 'Russian Ruble',            exchange: 'CME' },
];

export interface TradeRow {
  record_id: string;
  entity: string;
  type: 'AR' | 'AP';
  currency: FuturesCurrency;
  amount: number;           // always in local currency (not MXN equivalent)
  amount_usd_equiv?: number; // optional USD equivalent for display
  value_date: string;
  status: 'CONFIRMED' | 'FORECAST';
  description: string;
}

export interface HedgeRow {
  hedge_id: string;
  instrument: 'FWD' | 'NDF';
  direction: 'SELL_MXN_BUY_USD' | 'BUY_MXN_SELL_USD';
  notional_mxn: number;
  value_date: string;
  status: 'LOCKED' | 'ACTIVE';
}

export interface MarketSnapshot {
  as_of: string;
  spot_usdmxn: number;
  forward_points_by_month: Record<string, number>;
  provider_metadata: Record<string, unknown>;
}

export interface PolicyConfig {
  bucket_mode: 'CALENDAR_MONTH';
  hedge_ratios: { confirmed: number; forecast: number };
  cost_assumptions: { spread_bps: number };
  execution_product: 'NDF' | 'FWD';
  min_trade_size_usd: number;
  allow_indicative_proxy?: boolean;
}

export interface CalculateRequest {
  trades: TradeRow[];
  hedges: HedgeRow[];
  market: MarketSnapshot;
  policy: PolicyConfig;
  /** Optional: ID of a previously-persisted WORM market snapshot. */
  market_snapshot_id?: string;
  /** Optional: active currency pair, e.g. "EURUSD", "USDMXN". Passed to multi-currency engine. */
  pair?: string;
}

export interface ValidationErrorDetail {
  code: string;
  field: string;
  message: string;
  severity: 'CRITICAL' | 'WARNING';
}

export interface ValidationReport {
  status: 'PASS' | 'FAIL';
  errors: ValidationErrorDetail[];
  warnings: string[];
}

export interface BucketResult {
  bucket: string;
  confirmed_flow_mxn: number;
  forecast_flow_mxn: number;
  commercial_exposure_mxn: number;
  existing_hedges_mxn: number;
  target_signed_mxn: number;
  action_mxn: number;
  action_direction: string | null;
  forward_rate: number;
  carry_note: string;
  action_usd: number;
  friction_usd: number;
  suppressed: boolean;
  hedge_position_mxn: number;
  residual_mxn: number;
}

export interface HedgePlanSummary {
  total_commercial_exposure_mxn: number;
  total_existing_hedges_mxn: number;
  total_action_mxn: number;
  total_action_usd: number;
  total_friction_usd: number;
  total_hedge_position_mxn: number;
  total_residual_mxn: number;
}

export interface HedgePlan {
  buckets: BucketResult[];
  summary: HedgePlanSummary;
}

export interface ScenarioBucketResult {
  bucket: string;
  sigma: number;
  shocked_spot: number;
  unhedged_usd: number;
  hedged_usd: number;
  hedge_benefit_usd: number;
}

export interface ScenarioTotalResult {
  sigma: number;
  shocked_spot: number;
  total_unhedged_usd: number;
  total_hedged_usd: number;
  total_hedge_benefit_usd: number;
}

export interface ScenarioResults {
  sigmas: number[];
  per_bucket: ScenarioBucketResult[];
  totals: ScenarioTotalResult[];
}

export interface RunEnvelope {
  run_id: string;
  timestamp: string;
  engine_version: string;
  inputs_hash: string;
  outputs_hash: string;
  trades_hash: string;
  hedges_hash: string;
  market_hash: string;
  policy_hash: string;
  // Market snapshot provenance (populated when backend WORM snapshot used)
  market_snapshot_id?: string | null;
  market_snapshot_hash?: string | null;
  market_provider?: string | null;
  market_fetched_at?: string | null;
  market_as_of?: string | null;
  market_data_class?: string | null;
  market_is_synthetic_forward?: boolean | null;
}

export interface TraceEvent {
  step: string;
  timestamp: string;
  detail: string;
  data: Record<string, unknown>;
}

export interface TraceLite {
  run_id: string;
  events: TraceEvent[];
}

export interface CalculateResponse {
  run_id: string;
  validation_report: ValidationReport;
  hedge_plan: HedgePlan;
  scenario_results: ScenarioResults;
  run_envelope: RunEnvelope;
  trace_lite: TraceLite;
}
