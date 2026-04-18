// frontend/src/lib/api/tcaClient.ts
//
// Pre-Trade TCA API client.
//
// Backend mounts the router at /api/v1/tca/* — dashboardFetch prepends
// the API_BASE (which is "/api" in dev and the Render origin + "/api"
// in prod), so callers pass "/v1/tca/...".

import { dashboardFetch } from "@/lib/api/dashboardClient";

export class TCAApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "TCAApiError";
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
    throw new TCAApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export interface TCABreakdown {
  slippage_cost: number;
  broker_commission: number;
  exchange_fee: number;
  clearing_fee: number;
  vol_drift_adjustment: number;
  total_cost: number;
  total_cost_bps: number;
}

export interface TCABenchmark {
  historical_avg_bps_same_pair: number;
  percentile: number;
  sample_size: number;
}

export interface TCAEstimate {
  estimate_id: string;
  estimate_type: "pre_trade" | "post_calc";
  created_at: string;
  inputs: Record<string, unknown>;
  breakdown: TCABreakdown;
  benchmark: TCABenchmark | null;
  market_snapshot_id: string;
  reconciled_at: string | null;
  actual_cost_usd: number | null;
  variance_bps: number | null;
}

export interface AccuracyBucket {
  key: string;
  sample_size: number;
  mean_variance_bps: number;
  stdev_variance_bps: number;
  mae_bps: number;
  rmse_bps: number;
  bias_direction: "OVER_ESTIMATE" | "UNDER_ESTIMATE" | "NEUTRAL";
}

export interface AccuracyReport {
  period: string;
  group_by: "pair" | "instrument" | "month";
  total_reconciled: number;
  buckets: AccuracyBucket[];
}

export interface PreTradeEstimateRequest {
  pair: string;
  notional_usd: number;
  direction: "BUY" | "SELL";
  instrument: "FWD" | "SPOT" | "NDF" | "OPT";
  execution_window_hours: number;
  market_snapshot_id?: string | null;
}

export async function estimatePreTrade(
  token: string,
  req: PreTradeEstimateRequest,
): Promise<TCAEstimate> {
  return _fetchJson<TCAEstimate>("/v1/tca/pre-trade/estimate", token, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function listEstimates(
  token: string,
  opts: { type?: string; reconciled?: boolean; limit?: number; offset?: number } = {},
): Promise<TCAEstimate[]> {
  const p = new URLSearchParams();
  if (opts.type) p.set("type", opts.type);
  if (opts.reconciled !== undefined) p.set("reconciled", String(opts.reconciled));
  if (opts.limit) p.set("limit", String(opts.limit));
  if (opts.offset) p.set("offset", String(opts.offset));
  const qs = p.toString();
  return _fetchJson<TCAEstimate[]>(`/v1/tca/estimates${qs ? `?${qs}` : ""}`, token);
}

export async function getEstimate(token: string, id: string): Promise<TCAEstimate> {
  return _fetchJson<TCAEstimate>(`/v1/tca/estimates/${id}`, token);
}

export async function getCalcRunTCA(token: string, runId: string): Promise<TCAEstimate | null> {
  try {
    return await _fetchJson<TCAEstimate>(`/v1/tca/calc-runs/${runId}`, token);
  } catch (e: unknown) {
    if (e instanceof TCAApiError && e.status === 404) return null;
    throw e;
  }
}

export async function reconcileEstimate(
  token: string,
  estimateId: string,
  settlementEventId: string,
): Promise<TCAEstimate> {
  return _fetchJson<TCAEstimate>(`/v1/tca/estimates/${estimateId}/reconcile`, token, {
    method: "POST",
    body: JSON.stringify({ settlement_event_id: settlementEventId }),
  });
}

export async function getAccuracyReport(
  token: string,
  period: string,
  groupBy: "pair" | "instrument" | "month" = "pair",
): Promise<AccuracyReport> {
  const p = new URLSearchParams({ period, group_by: groupBy });
  return _fetchJson<AccuracyReport>(`/v1/tca/accuracy-report?${p.toString()}`, token);
}
