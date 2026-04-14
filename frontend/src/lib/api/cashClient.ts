// frontend/src/lib/api/cashClient.ts
/**
 * Type-safe API client for Treasury Suite Phase 2a cash endpoints.
 * All calls go through dashboardFetch for CSRF + auth (identical pattern to glClient.ts).
 *
 * Note: dashboardFetch returns Promise<Response>. The _fetchJson helper below
 * adds error checking and JSON parsing, matching the glClient.ts pattern exactly.
 */
import { dashboardFetch } from "@/lib/api/dashboardClient";

// Helper: error-raising fetch + JSON parse (mirrors glClient.ts _fetchJson)
async function _fetchJson<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const res = await dashboardFetch(path, token, options);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const b = await res.json(); if (b?.detail) detail = b.detail; } catch { /* noop */ }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

// ── Types ────────────────────────────────────────────────────────────────

export interface LegalEntity {
  id: string;
  company_id: string;
  parent_entity_id: string | null;
  legal_name: string;
  short_name: string;
  lei: string | null;
  giin: string | null;
  country: string;
  functional_currency: string;
  reporting_currency: string;
  status: "ACTIVE" | "DORMANT" | "LIQUIDATED";
  version: number;
  created_at: string;
  updated_at: string;
}

export interface BankAccount {
  id: string;
  entity_id: string;
  bank_name: string;
  bank_bic: string | null;
  account_number: string | null;  // masked unless cfo
  iban: string | null;             // masked unless cfo
  account_type: string;
  currency: string;
  nickname: string;
  status: "PENDING_VERIFICATION" | "ACTIVE" | "FROZEN" | "CLOSED";
  overdraft_limit: string;
  min_balance_threshold: string | null;
  gl_debit_code: string | null;
  gl_credit_code: string | null;
  version: number;
  created_by: string;
  created_at: string;
}

export interface BankConnection {
  id: string;
  provider: "TRUELAYER" | "PLAID";
  institution_name: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED" | "ERROR";
  consecutive_failure_count: number;
  last_successful_pull_at: string | null;
  last_error_message: string | null;
  created_at: string;
}

export interface CashBalance {
  id: string;
  account_id: string;
  balance_date: string;
  ledger_balance: string;
  available_balance: string;
  in_transit_debit: string;
  in_transit_credit: string;
  currency: string;
  source: string;
  reconciliation_status: string;
  created_at: string;
}

export interface CurrencyPosition {
  currency: string;
  ledger_balance: string;
  available_balance: string;
  in_transit_net: string;
  account_count: number;
}

export interface ConsolidatedPosition {
  as_of_date: string;
  positions: CurrencyPosition[];
}

export interface EntityPosition {
  entity_id: string;
  entity_name: string;
  currency: string;
  ledger_balance: string;
  available_balance: string;
}

export interface EntityPositionResponse {
  as_of_date: string;
  positions: EntityPosition[];
}

// ── Entity endpoints ─────────────────────────────────────────────────────

export const listEntities = (token: string, params?: { status?: string }) =>
  _fetchJson<LegalEntity[]>(`/v1/cash/entities${params?.status ? `?status=${params.status}` : ""}`, token);

export const createEntity = (token: string, payload: Partial<LegalEntity>) =>
  _fetchJson<LegalEntity>("/v1/cash/entities", token, { method: "POST", body: JSON.stringify(payload) });

export const getEntity = (token: string, id: string) =>
  _fetchJson<LegalEntity>(`/v1/cash/entities/${id}`, token);

export const updateEntity = (token: string, id: string, payload: Partial<LegalEntity>) =>
  _fetchJson<LegalEntity>(`/v1/cash/entities/${id}`, token, { method: "PATCH", body: JSON.stringify(payload) });

export const closeEntity = (token: string, id: string, status: "DORMANT" | "LIQUIDATED") =>
  _fetchJson<LegalEntity>(`/v1/cash/entities/${id}/close`, token, { method: "POST", body: JSON.stringify({ status }) });

// ── Account endpoints ────────────────────────────────────────────────────

export const listAccounts = (token: string, params?: { entity_id?: string; status?: string }) => {
  const q = new URLSearchParams((params ?? {}) as Record<string, string>).toString();
  return _fetchJson<BankAccount[]>(`/v1/cash/accounts${q ? `?${q}` : ""}`, token);
};

export const getAccount = (token: string, id: string) =>
  _fetchJson<BankAccount>(`/v1/cash/accounts/${id}`, token);

export const createAccount = (token: string, payload: Partial<BankAccount> & { account_number?: string; iban?: string }) =>
  _fetchJson<BankAccount>("/v1/cash/accounts", token, { method: "POST", body: JSON.stringify(payload) });

export const verifyAccount = (token: string, id: string) =>
  _fetchJson<BankAccount>(`/v1/cash/accounts/${id}/verify`, token, { method: "POST" });

export const freezeAccount = (token: string, id: string) =>
  _fetchJson<BankAccount>(`/v1/cash/accounts/${id}/freeze`, token, { method: "POST" });

export const unfreezeAccount = (token: string, id: string) =>
  _fetchJson<BankAccount>(`/v1/cash/accounts/${id}/unfreeze`, token, { method: "POST" });

export const closeAccount = (token: string, id: string) =>
  _fetchJson<BankAccount>(`/v1/cash/accounts/${id}/close`, token, { method: "POST" });

export const getAccountBalances = (token: string, id: string, params?: { date_from?: string; date_to?: string }) => {
  const q = new URLSearchParams((params ?? {}) as Record<string, string>).toString();
  return _fetchJson<CashBalance[]>(`/v1/cash/accounts/${id}/balances${q ? `?${q}` : ""}`, token);
};

export const getAccountAudit = (token: string, id: string) =>
  _fetchJson<object[]>(`/v1/cash/accounts/${id}/audit`, token);

// ── Position endpoints ───────────────────────────────────────────────────

export const getConsolidatedPosition = (token: string, asOfDate?: string) =>
  _fetchJson<ConsolidatedPosition>(`/v1/cash/positions/consolidated${asOfDate ? `?as_of_date=${asOfDate}` : ""}`, token);

export const getEntityPosition = (token: string, asOfDate?: string) =>
  _fetchJson<EntityPositionResponse>(`/v1/cash/positions/by-entity${asOfDate ? `?as_of_date=${asOfDate}` : ""}`, token);

export const getAccountPosition = (token: string) =>
  _fetchJson<object[]>("/v1/cash/positions/by-account", token);

export const enterBalance = (token: string, payload: Partial<CashBalance>) =>
  _fetchJson<CashBalance>("/v1/cash/balances", token, { method: "POST", body: JSON.stringify(payload) });

export const bulkEnterBalances = (token: string, rows: Partial<CashBalance>[]) =>
  _fetchJson<{ created: number }>("/v1/cash/balances/bulk", token, { method: "POST", body: JSON.stringify({ rows }) });

export const reconcileBalance = (token: string, balanceId: string, payload: { status: string; note?: string }) =>
  _fetchJson<CashBalance>(`/v1/cash/balances/${balanceId}/reconcile`, token, { method: "POST", body: JSON.stringify(payload) });

export const pullBalances = (token: string, connectionId: string) =>
  _fetchJson<{ message: string }>(`/v1/cash/pull/${connectionId}`, token, { method: "POST" });

// ── Connection endpoints ─────────────────────────────────────────────────

export const listConnections = (token: string) =>
  _fetchJson<BankConnection[]>("/v1/cash/connections", token);

export const getAuthUrl = (token: string, provider: string, redirectUri: string) =>
  _fetchJson<{ url: string; connection_id: string }>(
    `/v1/cash/connections/auth-url?provider=${provider}&redirect_uri=${encodeURIComponent(redirectUri)}`,
    token,
  );

export const handleCallback = (token: string, state: string, code: string) =>
  _fetchJson<BankConnection>("/v1/cash/connections/callback", token, {
    method: "POST",
    body: JSON.stringify({ state, code }),
  });

export const refreshConnection = (token: string, id: string) =>
  _fetchJson<BankConnection>(`/v1/cash/connections/${id}/refresh`, token, { method: "POST" });

export const reactivateConnection = (token: string, id: string) =>
  _fetchJson<BankConnection>(`/v1/cash/connections/${id}/reactivate`, token, { method: "POST" });

export const revokeConnection = (token: string, id: string) =>
  _fetchJson<void>(`/v1/cash/connections/${id}`, token, { method: "DELETE" });

// ── Audit endpoints ──────────────────────────────────────────────────────

export const verifyCashChain = (token: string) =>
  _fetchJson<{ ok: boolean; broken_at_seq?: number; event_count?: number }>("/v1/cash/audit/chain-verify", token);

export const listCashAuditEvents = (token: string, params?: { account_id?: string; event_type?: string; limit?: number }) => {
  const q = new URLSearchParams((params ?? {}) as Record<string, string>).toString();
  return _fetchJson<object[]>(`/v1/cash/audit/events${q ? `?${q}` : ""}`, token);
};
