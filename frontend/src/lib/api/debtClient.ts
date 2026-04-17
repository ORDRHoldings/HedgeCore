// frontend/src/lib/api/debtClient.ts
import { dashboardFetch } from "@/lib/api/dashboardClient";

async function _fetchJson<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const res = await dashboardFetch(path, token, options);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const b = await res.json(); if (b?.detail) detail = b.detail; } catch { /* noop */ }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export interface DebtFacility {
  id: string;
  counterparty: string;
  facility_type: string;
  currency: string;
  committed_amount: number;
  drawn_amount: number;
  maturity_date: string;
  days_to_maturity?: number;
  status: string;
}

export interface DebtCovenant {
  type: string;
  threshold: number;
  current_value: number;
  headroom_pct: number;
  status: "COMPLIANT" | "WARNING" | "BREACH";
}

export interface DebtSchedulePeriod {
  period_start: string;
  period_end: string;
  principal_payment: number;
  interest_payment: number;
  total_payment: number;
  outstanding_balance: number;
}

export interface IRSwap {
  id: string;
  instrument_type: string;
  notional: number;
  fixed_rate: number;
  last_npv: number;
  last_dv01: number;
  status: string;
}

export interface DV01Ladder {
  "1Y": number;
  "2Y": number;
  "5Y": number;
  "10Y": number;
  "30Y": number;
}

export interface EffectivenessResult {
  run_id: string;
  ratio: number;
  passed: boolean;
  method: string;
}

// ── Debt ────────────────────────────────────────────────────────────────────

export const listFacilities = (token: string): Promise<DebtFacility[]> =>
  _fetchJson("/v1/debt/facilities", token);

export const getFacility = (id: string, token: string): Promise<DebtFacility> =>
  _fetchJson(`/v1/debt/facilities/${id}`, token);

export const createFacility = (body: Partial<DebtFacility>, token: string) =>
  _fetchJson("/v1/debt/facilities", token, { method: "POST", body: JSON.stringify(body) });

export const getMaturityCalendar = (token: string): Promise<DebtFacility[]> =>
  _fetchJson("/v1/debt/maturity-calendar", token);

export const getDebtSchedule = (facilityId: string, token: string): Promise<{ periods: DebtSchedulePeriod[]; total_interest_expense: number; weighted_avg_life: number }> =>
  _fetchJson(`/v1/debt/facilities/${facilityId}/schedule`, token);

export const getCovenants = (facilityId: string, token: string): Promise<DebtCovenant[]> =>
  _fetchJson(`/v1/debt/covenants?facility_id=${facilityId}`, token);

export const getExposure = (token: string): Promise<{ currency: string; committed: number; drawn: number }[]> =>
  _fetchJson("/v1/debt/exposure", token);

// ── IR Risk ──────────────────────────────────────────────────────────────────

export const listSwaps = (token: string): Promise<IRSwap[]> =>
  _fetchJson("/v1/ir-risk/swaps", token);

export const createSwap = (body: Partial<IRSwap>, token: string) =>
  _fetchJson("/v1/ir-risk/swaps", token, { method: "POST", body: JSON.stringify(body) });

export const mtmAll = (token: string) =>
  _fetchJson("/v1/ir-risk/mtm-all", token, { method: "POST" });

export const getDV01Ladder = (token: string): Promise<DV01Ladder> =>
  _fetchJson("/v1/ir-risk/dv01-ladder", token);

export const runEffectiveness = (body: { swap_id: string; facility_id?: string; method: string }, token: string): Promise<EffectivenessResult> =>
  _fetchJson("/v1/ir-risk/effectiveness", token, { method: "POST", body: JSON.stringify(body) });
