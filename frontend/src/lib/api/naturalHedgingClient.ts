// frontend/src/lib/api/naturalHedgingClient.ts
//
// Natural Hedging Optimizer API client.
//
// Backend mounts router at /api/v1/natural-hedging/*.

import { dashboardFetch } from "@/lib/api/dashboardClient";

export class NaturalHedgingApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "NaturalHedgingApiError";
    this.status = status;
  }
}

async function _fetchJson<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const res = await dashboardFetch(path, token, options);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const b = await res.json();
      if (b?.detail) detail = typeof b.detail === "string" ? b.detail : JSON.stringify(b.detail);
    } catch {
      /* noop */
    }
    throw new NaturalHedgingApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export interface NettingPair {
  original_pair_1: string;
  original_pair_2: string;
  synthetic_pair: string;
  original_notional_1: number;
  original_notional_2: number;
  netted_notional: number;
  savings_usd: number;
}

export interface CurrencyExposureNet {
  currency: string;
  gross_exposure: number;
  net_exposure: number;
  offset_amount: number;
}

export interface TriangulationCheck {
  pair_1: string;
  pair_2: string;
  synthetic_pair: string;
  synthetic_rate: number;
  market_rate: number | null;
  deviation_pct: number;
  status: string;
}

export interface NettingResult {
  currency_exposures: CurrencyExposureNet[];
  netting_pairs: NettingPair[];
  gross_notional_before: number;
  gross_notional_after: number;
  total_savings_usd: number;
  netting_efficiency_pct: number;
  redundant_legs_eliminated: number;
  triangulation_checks: TriangulationCheck[];
  triangulation_warnings: number;
}

export interface PerCurrencyBreakdown {
  ar: number;
  ap: number;
  net: number;
}

export interface FromPositionsResponse {
  source: {
    reporting_currency: string;
    derived_exposures: Record<string, number>;
    per_currency_breakdown: Record<string, PerCurrencyBreakdown>;
  };
  netting: NettingResult;
}

export async function analyzeExposures(
  token: string,
  exposures: Record<string, number>,
  fx_rates?: Record<string, number>,
): Promise<NettingResult> {
  return _fetchJson<NettingResult>("/api/v1/natural-hedging/analyze", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exposures, fx_rates: fx_rates ?? null }),
  });
}

export async function analyzeFromPositions(
  token: string,
  reporting_currency: string = "USD",
  fx_rates?: Record<string, number>,
  statuses?: string[],
): Promise<FromPositionsResponse> {
  return _fetchJson<FromPositionsResponse>(
    "/api/v1/natural-hedging/from-positions",
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reporting_currency,
        fx_rates: fx_rates ?? null,
        statuses: statuses ?? null,
      }),
    },
  );
}
