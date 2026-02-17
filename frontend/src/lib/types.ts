// HedgeCalc API Types – matching backend/app/api/schemas/hedge.py

export interface Position {
  instrument_id: string;
  quantity: number;
}

export interface InstrumentMeta {
  asset_class: "futures" | "perp" | "options";
  underlying: string;
  contract_multiplier: number;
}

export interface MarketInput {
  prices: Record<string, number>;
  option_deltas?: Record<string, number>;
  sensitivities?: Record<string, Record<string, number>>;
}

export interface ScenarioShock {
  equity_move_pct: number;
  vol_move_pct?: number;
}

export interface Scenario {
  scenario_id?: string;
  shocks: ScenarioShock;
}

export interface HedgeRequest {
  positions: Position[];
  instrument_meta: Record<string, InstrumentMeta>;
  market: MarketInput;
  scenarios: Scenario[];
  assumptions?: Record<string, unknown>;
  policy?: Record<string, unknown>;
}

export interface WorstCaseValue {
  kind: "number" | "text";
  number?: number;
  text?: string;
}

export interface HedgeSummary {
  cost_total_usd: number;
  holding_period_days?: number;
  hedge_effectiveness: Record<string, number | null>;
  worst_case: Record<string, WorstCaseValue>;
}

export interface HedgeRunResponse {
  status: "approved" | "rejected";
  plan_id: string;
  bundle_id?: string;
  decision: string | Record<string, unknown>;
  summary?: HedgeSummary;
  meta?: {
    duration_ms: number;
    engine: string;
    version: string;
  };
  reason?: string;
  details?: Record<string, unknown>;
}

// Engine demo endpoints
export interface EngineCatalog {
  strategies: Record<string, string[]>;
  instruments: Array<{
    id: string;
    name: string;
    asset_class: string;
  }>;
}

export interface EngineRecommendation {
  request_id: string;
  recommendation: {
    risk_code: string;
    strategy: string;
    instrument: string;
    size: number;
    estimated_cost: number;
    expected_protection_pct: number;
  };
}

export interface EngineSimulation {
  request_id: string;
  result: {
    unhedged_pnl: number;
    hedged_pnl: number;
    hedge_cost: number;
    protection_pct: number;
    scenario: string;
  };
}
