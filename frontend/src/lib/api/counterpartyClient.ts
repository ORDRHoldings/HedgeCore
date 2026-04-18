// frontend/src/lib/api/counterpartyClient.ts
//
// Counterparty Hub API client.
//
// Backend mounts router at /api/v1/counterparties/*.

import { dashboardFetch } from "@/lib/api/dashboardClient";

export class CounterpartyApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "CounterpartyApiError";
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
    throw new CounterpartyApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export type LimitType = "notional" | "pfe" | "settlement" | "isda_threshold";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface Counterparty {
  id: string;
  tenant_id: string;
  name: string;
  internal_code: string | null;
  legal_entity_name: string | null;
  lei: string | null;
  credit_rating: string | null;
  rating_agency: string | null;
  country_iso: string | null;
  active: boolean;
  last_exposure_usd: number | null;
  last_pfe_usd: number | null;
  risk_level_cached: RiskLevel | null;
  last_scored_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CounterpartyCreateRequest {
  name: string;
  internal_code?: string | null;
  legal_entity_name?: string | null;
  lei?: string | null;
  credit_rating?: string | null;
  rating_agency?: string | null;
  country_iso?: string | null;
}

export interface CounterpartyUpdateRequest {
  name?: string;
  internal_code?: string | null;
  legal_entity_name?: string | null;
  lei?: string | null;
  credit_rating?: string | null;
  rating_agency?: string | null;
  country_iso?: string | null;
  active?: boolean;
}

export interface CreditLimit {
  id: string;
  counterparty_id: string;
  tenant_id: string;
  limit_type: LimitType;
  limit_amount_usd: number;
  currency: string;
  effective_date: string;
  expiry_date: string | null;
  active: boolean;
  created_at: string;
  created_by_user_id: string;
}

export interface CreditLimitCreateRequest {
  counterparty_id: string;
  limit_type: LimitType;
  limit_amount_usd: number;
  currency?: string;
  effective_date: string;
  expiry_date?: string | null;
}

export interface ExposureBreakdown {
  counterparty_id: string;
  counterparty_name: string;
  gross_notional_usd: number;
  net_notional_usd: number;
  pfe_97_5: number;
  mark_to_market: number;
  isda_threshold: number;
  exposure_above_threshold: number;
  concentration_pct: number;
}

export interface LimitBreach {
  limit_id: string;
  limit_type: LimitType;
  limit_amount_usd: number;
  actual_amount_usd: number;
  utilization_pct: number;
  severity: "WARNING" | "BREACH";
}

export interface ExposureResponse {
  counterparty_id: string;
  counterparty_name: string;
  as_of: string;
  exposure: ExposureBreakdown;
  limits: CreditLimit[];
  breaches: LimitBreach[];
  risk_level: RiskLevel;
}

export interface PortfolioRiskResponse {
  as_of: string;
  total_gross_usd: number;
  total_net_usd: number;
  total_pfe_usd: number;
  largest_cp_pct: number;
  risk_level: RiskLevel;
  exposures: ExposureBreakdown[];
}

export interface ExposurePosition {
  counterparty_id?: string;
  counterparty_name?: string;
  notional_usd: number;
  mtm_usd?: number;
  isda_threshold_usd?: number;
}

// ---------------- Counterparty CRUD ----------------

export async function listCounterparties(
  token: string,
  includeInactive = false,
): Promise<Counterparty[]> {
  const qs = includeInactive ? "?include_inactive=true" : "";
  return _fetchJson<Counterparty[]>(`/v1/counterparties${qs}`, token);
}

export async function getCounterparty(token: string, id: string): Promise<Counterparty> {
  return _fetchJson<Counterparty>(`/v1/counterparties/${id}`, token);
}

export async function createCounterparty(
  token: string,
  req: CounterpartyCreateRequest,
): Promise<Counterparty> {
  return _fetchJson<Counterparty>("/v1/counterparties", token, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function updateCounterparty(
  token: string,
  id: string,
  req: CounterpartyUpdateRequest,
): Promise<Counterparty> {
  return _fetchJson<Counterparty>(`/v1/counterparties/${id}`, token, {
    method: "PATCH",
    body: JSON.stringify(req),
  });
}

// ---------------- Credit Limits ----------------

export async function listCreditLimits(
  token: string,
  counterpartyId: string,
  includeInactive = false,
): Promise<CreditLimit[]> {
  const qs = includeInactive ? "?include_inactive=true" : "";
  return _fetchJson<CreditLimit[]>(`/v1/counterparties/${counterpartyId}/limits${qs}`, token);
}

export async function createCreditLimit(
  token: string,
  counterpartyId: string,
  req: CreditLimitCreateRequest,
): Promise<CreditLimit> {
  return _fetchJson<CreditLimit>(`/v1/counterparties/${counterpartyId}/limits`, token, {
    method: "POST",
    body: JSON.stringify(req),
  });
}

export async function deactivateCreditLimit(
  token: string,
  counterpartyId: string,
  limitId: string,
): Promise<CreditLimit> {
  return _fetchJson<CreditLimit>(
    `/v1/counterparties/${counterpartyId}/limits/${limitId}`,
    token,
    { method: "DELETE" },
  );
}

// ---------------- Exposure ----------------

export async function computeExposure(
  token: string,
  counterpartyId: string,
  positions: ExposurePosition[],
  volatilityAnnual = 0.10,
  timeHorizonYears = 1.0,
): Promise<ExposureResponse> {
  return _fetchJson<ExposureResponse>(
    `/v1/counterparties/${counterpartyId}/exposure`,
    token,
    {
      method: "POST",
      body: JSON.stringify({
        positions,
        volatility_annual: volatilityAnnual,
        time_horizon_years: timeHorizonYears,
      }),
    },
  );
}

export async function computePortfolioRisk(
  token: string,
  positions: ExposurePosition[],
  volatilityAnnual = 0.10,
  timeHorizonYears = 1.0,
): Promise<PortfolioRiskResponse> {
  return _fetchJson<PortfolioRiskResponse>(
    "/v1/counterparties/portfolio-risk",
    token,
    {
      method: "POST",
      body: JSON.stringify({
        positions,
        volatility_annual: volatilityAnnual,
        time_horizon_years: timeHorizonYears,
      }),
    },
  );
}
