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

export interface AccountAuditEvent {
  id: string;
  event_type: string;
  chain_seq: number;
  performed_by: string;
  created_at: string;
}

export interface AccountPositionRow {
  account_id: string;
  nickname: string;
  currency: string;
  ledger_balance: string | null;
  available_balance: string | null;
  balance_date: string | null;
  status: string;
}

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
  _fetchJson<AccountAuditEvent[]>(`/v1/cash/accounts/${id}/audit`, token);

// ── Position endpoints ───────────────────────────────────────────────────

export const getConsolidatedPosition = (token: string, asOfDate?: string) =>
  _fetchJson<ConsolidatedPosition>(`/v1/cash/positions/consolidated${asOfDate ? `?as_of_date=${asOfDate}` : ""}`, token);

export const getEntityPosition = (token: string, asOfDate?: string) =>
  _fetchJson<EntityPositionResponse>(`/v1/cash/positions/by-entity${asOfDate ? `?as_of_date=${asOfDate}` : ""}`, token);

export const getAccountPosition = (token: string) =>
  _fetchJson<AccountPositionRow[]>("/v1/cash/positions/by-account", token);

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
  const q = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params ?? {})
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    )
  ).toString();
  return _fetchJson<AccountAuditEvent[]>(`/v1/cash/audit/events${q ? `?${q}` : ""}`, token);
};

// ── Forecast ────────────────────────────────────────────────────────────

export interface ForecastBucket {
  period_start: string;
  period_end: string;
  opening_balance: string;
  inflows: string;
  outflows: string;
  closing_balance: string;
  confidence_breakdown: Record<string, string>;
  liquidity_gap: boolean;
  by_currency: Record<string, {
    opening_balance: string;
    inflows: string;
    outflows: string;
    closing_balance: string;
  }>;
}

export interface ForecastResponse {
  as_of_date: string;
  horizon: string;
  entity_id: string | null;
  buckets: ForecastBucket[];
}

export interface LiquidityGap {
  period_start: string;
  period_end: string;
  currency: string;
  closing_balance: string;
  gap_threshold: string;
  shortfall: string;
}

export interface VarianceRow {
  period_start: string;
  period_end: string;
  forecast_closing: string;
  actual_closing: string | null;
  variance: string | null;
  variance_pct: string | null;
}

export interface ForecastItem {
  id: string;
  company_id: string;
  label: string;
  direction: string;
  amount: string;
  currency: string;
  confidence: string;
  recurrence: string;
  start_date: string;
  end_date: string | null;
  day_of_month: number | null;
  entity_id: string | null;
  account_id: string | null;
  is_active: boolean;
  created_at: string;
}

export async function getEntityForecast(token: string, entityId: string, horizon = "13w"): Promise<ForecastResponse> {
  return _fetchJson(`/v1/cash/forecast/${entityId}?horizon=${horizon}`, token);
}

export async function getConsolidatedForecast(token: string, horizon = "13w"): Promise<ForecastResponse> {
  return _fetchJson(`/v1/cash/forecast/consolidated?horizon=${horizon}`, token);
}

export async function getLiquidityGaps(token: string, entityId?: string): Promise<{ as_of_date: string; gaps: LiquidityGap[] }> {
  const params = entityId ? `?entity_id=${entityId}` : "";
  return _fetchJson(`/v1/cash/forecast/liquidity-gaps${params}`, token);
}

export async function runForecastScenario(
  token: string,
  payload: { horizon?: string; inflow_shift?: string; outflow_shift?: string; entity_id?: string },
): Promise<ForecastResponse> {
  return _fetchJson("/v1/cash/forecast/scenarios", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function getForecastVariance(token: string, entityId?: string): Promise<{ entity_id: string | null; rows: VarianceRow[] }> {
  const params = entityId ? `?entity_id=${entityId}` : "";
  return _fetchJson(`/v1/cash/forecast/variance${params}`, token);
}

export async function getForecastItems(token: string, activeOnly = true): Promise<ForecastItem[]> {
  return _fetchJson(`/v1/cash/forecast/items?active_only=${activeOnly}`, token);
}

export async function createForecastItem(
  token: string,
  payload: {
    label: string; direction: string; amount: string; currency: string;
    recurrence: string; start_date: string; confidence?: string;
    end_date?: string; day_of_month?: number; entity_id?: string;
  },
): Promise<ForecastItem> {
  return _fetchJson("/v1/cash/forecast/items", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateForecastItem(
  token: string,
  itemId: string,
  payload: { label?: string; amount?: string; confidence?: string; end_date?: string; is_active?: boolean },
): Promise<ForecastItem> {
  return _fetchJson(`/v1/cash/forecast/items/${itemId}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// ── Intercompany Netting ───────────────────────────────────────────────

export interface IntercompanyObligation {
  id: string;
  company_id: string;
  debtor_entity_id: string;
  creditor_entity_id: string;
  amount: string;
  currency: string;
  due_date: string;
  reference: string | null;
  status: "PENDING" | "NETTED" | "SETTLED" | "CANCELLED";
  created_by: string;
  created_at: string;
}

export interface NettingProposal {
  id: string;
  company_id: string;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "EXECUTED" | "REJECTED";
  entity_a_id: string;
  entity_b_id: string;
  currency: string;
  gross_payable: string;
  gross_receivable: string;
  net_amount: string;
  net_direction: "A2B" | "B2A";
  savings: string;
  obligation_ids: string[];
  proposed_by: string;
  approved_by: string | null;
  proposed_at: string;
  approved_at: string | null;
  executed_at: string | null;
}

export interface NettingSavings {
  total_savings: string;
  netting_count: number;
  savings_by_currency: Record<string, string>;
}

export async function listObligations(token: string, status?: string): Promise<IntercompanyObligation[]> {
  const params = status ? `?status=${status}` : "";
  return _fetchJson(`/v1/cash/netting/obligations${params}`, token);
}

export async function createObligation(
  token: string,
  payload: {
    debtor_entity_id: string; creditor_entity_id: string;
    amount: string; currency: string; due_date: string; reference?: string;
  },
): Promise<IntercompanyObligation> {
  return _fetchJson("/v1/cash/netting/obligations", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function cancelObligation(token: string, id: string): Promise<void> {
  return _fetchJson(`/v1/cash/netting/obligations/${id}`, token, { method: "DELETE" });
}

export async function listProposals(token: string): Promise<NettingProposal[]> {
  return _fetchJson("/v1/cash/netting/proposals", token);
}

export async function generateProposals(token: string): Promise<NettingProposal[]> {
  return _fetchJson("/v1/cash/netting/proposals/generate", token, { method: "POST" });
}

export async function approveProposal(token: string, id: string): Promise<NettingProposal> {
  return _fetchJson(`/v1/cash/netting/proposals/${id}/approve`, token, { method: "POST" });
}

export async function executeProposal(token: string, id: string): Promise<NettingProposal> {
  return _fetchJson(`/v1/cash/netting/proposals/${id}/execute`, token, { method: "POST" });
}

export async function getNettingSavings(token: string): Promise<NettingSavings> {
  return _fetchJson("/v1/cash/netting/savings", token);
}

// ── Bank Statements ────────────────────────────────────────────────

export interface BankStatementRecord {
  id: string;
  company_id: string;
  account_id: string;
  statement_date: string;
  opening_balance: string;
  closing_balance: string;
  currency: string;
  format: "MT940" | "CAMT053" | "BAI2";
  transaction_count: number;
  filename: string | null;
  created_at: string;
}

export interface BankTransactionRecord {
  id: string;
  statement_id: string;
  account_id: string;
  tx_date: string;
  value_date: string | null;
  amount: string;
  currency: string;
  direction: "DEBIT" | "CREDIT";
  description: string | null;
  reference: string | null;
  counterparty: string | null;
  tx_code: string | null;
  reconciliation_status: "UNMATCHED" | "MATCHED" | "EXCEPTION";
  created_at: string;
}

export async function listStatements(token: string, accountId?: string): Promise<BankStatementRecord[]> {
  const params = accountId ? `?account_id=${accountId}` : "";
  return _fetchJson(`/v1/cash/statements/${params}`, token);
}

export async function getStatementDetail(token: string, id: string): Promise<BankStatementRecord> {
  return _fetchJson(`/v1/cash/statements/${id}`, token);
}

export async function getStatementTransactions(token: string, id: string): Promise<BankTransactionRecord[]> {
  return _fetchJson(`/v1/cash/statements/${id}/transactions`, token);
}

export async function listBankTransactions(
  token: string,
  params?: { account_id?: string; date_from?: string; date_to?: string; status?: string },
): Promise<BankTransactionRecord[]> {
  const q = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params ?? {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
    )
  ).toString();
  return _fetchJson(`/v1/cash/statements/transactions${q ? `?${q}` : ""}`, token);
}

export async function uploadStatement(
  token: string,
  file: File,
  accountId: string,
  format?: string,
): Promise<{ statement: BankStatementRecord; transaction_count: number; duplicate: boolean }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("account_id", accountId);
  if (format) formData.append("format", format);

  const res = await dashboardFetch("/v1/cash/statements/upload", token, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const b = await res.json(); if (b?.detail) detail = b.detail; } catch { /* noop */ }
    throw new Error(detail);
  }
  return res.json();
}

// ── Reconciliation (Phase 2e) ─────────────────────────────────────

export interface ReconciliationRunResponse {
  matched: number;
  unmatched: number;
  exceptions: number;
}

export interface ReconciliationSummary {
  account_id: string;
  total_transactions: number;
  matched: number;
  unmatched: number;
  exceptions: number;
  match_rate: number;
}

export interface ManualMatchPayload {
  transaction_id: string;
  settlement_id?: string;
  journal_id?: string;
}

export async function runReconciliation(token: string, accountId: string): Promise<ReconciliationRunResponse> {
  return _fetchJson("/v1/cash/reconciliation/run", token, {
    method: "POST",
    body: JSON.stringify({ account_id: accountId }),
  });
}

export async function getReconciliationSummary(token: string, accountId: string): Promise<ReconciliationSummary> {
  return _fetchJson(`/v1/cash/reconciliation/summary?account_id=${accountId}`, token);
}

export async function manualMatch(token: string, payload: ManualMatchPayload): Promise<void> {
  return _fetchJson("/v1/cash/reconciliation/match", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function markException(token: string, txId: string): Promise<void> {
  return _fetchJson(`/v1/cash/reconciliation/exception/${txId}`, token, { method: "POST" });
}

export async function unmatchTransaction(token: string, txId: string): Promise<void> {
  return _fetchJson(`/v1/cash/reconciliation/unmatch/${txId}`, token, { method: "POST" });
}

// ── Cash Pools (Phase 2f) ─────────────────────────────────────────

export interface TreasuryPoolEntity {
  id: string;
  company_id: string;
  name: string;
  entity_type: "SUBSIDIARY" | "BRANCH" | "FUND" | "HOLDING" | "SPV";
  base_currency: string;
  country_code: string;
  erp_ref: string | null;
  parent_entity_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CashPool {
  id: string;
  company_id: string;
  name: string;
  pool_type: "NOTIONAL" | "PHYSICAL" | "ZBA";
  header_account_id: string;
  currency: string;
  base_currency: string;
  is_active: boolean;
  member_count: number;
  created_by: string;
  created_at: string;
}

export interface PoolMemberBalance {
  account_id: string;
  entity_id: string;
  ledger_balance: string;
  target_balance: string | null;
  excess: string | null;
  is_exception: boolean;
}

export interface PoolBalance {
  pool_id: string;
  pool_type: string;
  consolidated_balance: string;
  header_balance: string | null;
  currency: string;
  member_balances: PoolMemberBalance[];
}

export interface SweepPreview {
  source_account_id: string;
  destination_account_id: string;
  amount: string;
  currency: string;
  direction: "CONCENTRATION" | "DISTRIBUTION";
}

export interface SweepRecord {
  id: string;
  pool_id: string;
  source_account_id: string;
  destination_account_id: string;
  amount: string;
  currency: string;
  direction: "CONCENTRATION" | "DISTRIBUTION";
  status: "PENDING" | "EXECUTED" | "FAILED" | "CANCELLED";
  triggered_by: string;
  created_at: string;
}

export async function listTreasuryPoolEntities(token: string): Promise<TreasuryPoolEntity[]> {
  return _fetchJson("/v1/cash/pools/entities", token);
}

export async function createTreasuryPoolEntity(
  token: string,
  payload: { name: string; entity_type?: string; base_currency: string; country_code: string; erp_ref?: string; parent_entity_id?: string },
): Promise<TreasuryPoolEntity> {
  return _fetchJson("/v1/cash/pools/entities", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listCashPools(token: string): Promise<CashPool[]> {
  return _fetchJson("/v1/cash/pools/", token);
}

export async function createCashPool(
  token: string,
  payload: { name: string; pool_type: string; header_account_id: string; currency: string; base_currency: string },
): Promise<CashPool> {
  return _fetchJson("/v1/cash/pools/", token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getPoolDetail(token: string, poolId: string): Promise<CashPool & { members: Array<{ id: string; pool_id: string; account_id: string; entity_id: string; participation_type: string; target_balance: string | null; created_at: string }> }> {
  return _fetchJson(`/v1/cash/pools/${poolId}`, token);
}

export async function addPoolMember(
  token: string,
  poolId: string,
  payload: { account_id: string; entity_id: string; participation_type?: string; target_balance?: string },
): Promise<unknown> {
  return _fetchJson(`/v1/cash/pools/${poolId}/members`, token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getPoolBalance(token: string, poolId: string): Promise<PoolBalance> {
  return _fetchJson(`/v1/cash/pools/${poolId}/balance`, token);
}

export async function calculateSweeps(token: string, poolId: string): Promise<SweepPreview[]> {
  return _fetchJson(`/v1/cash/pools/${poolId}/sweeps/calculate`, token, { method: "POST" });
}

export async function executeSweeps(token: string, poolId: string): Promise<{ sweep_count: number }> {
  return _fetchJson(`/v1/cash/pools/${poolId}/sweeps/execute`, token, { method: "POST" });
}

export async function listSweeps(token: string, poolId: string): Promise<SweepRecord[]> {
  return _fetchJson(`/v1/cash/pools/${poolId}/sweeps`, token);
}

// ── Payment Initiation — Phase 2 §4.4 ────────────────────────────────────

export interface Beneficiary {
  id: string;
  company_id: string;
  name: string;
  bank_name: string;
  bank_code: string;
  account_number: string;
  country_code: string;
  currency: string;
  payment_types: string[];
  is_active: boolean;
  created_at: string;
}

export interface PaymentInstruction {
  id: string;
  company_id: string;
  beneficiary_id: string;
  beneficiary_name: string;
  payment_type: string;
  amount: string;
  currency: string;
  execution_date: string;
  reference: string;
  memo: string | null;
  status: string;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  transmission_mode: string;
  transmitted_at: string | null;
  instruction_hash: string;
  created_at: string;
}

export interface PaymentListResponse {
  items: PaymentInstruction[];
  total: number;
}

export const listBeneficiaries = (token: string, activeOnly = true) =>
  _fetchJson<Beneficiary[]>(`/v1/payments/beneficiaries?active_only=${activeOnly}`, token);

export const createBeneficiary = (token: string, body: {
  name: string; bank_name: string; bank_code: string; account_number: string;
  country_code: string; currency: string; payment_types: string[];
}) => _fetchJson<Beneficiary>("/v1/payments/beneficiaries", token, {
  method: "POST", body: JSON.stringify(body),
});

export const updateBeneficiary = (token: string, id: string, body: {
  name?: string; bank_name?: string; is_active?: boolean; payment_types?: string[];
}) => _fetchJson<Beneficiary>(`/v1/payments/beneficiaries/${id}`, token, {
  method: "PATCH", body: JSON.stringify(body),
});

export const deactivateBeneficiary = (token: string, id: string) =>
  _fetchJson<void>(`/v1/payments/beneficiaries/${id}`, token, { method: "DELETE" });

export const initiatePayment = (token: string, body: {
  beneficiary_id: string; payment_type: string; amount: string;
  currency: string; execution_date: string; reference: string; memo?: string;
}) => _fetchJson<PaymentInstruction>("/v1/payments/initiate", token, {
  method: "POST", body: JSON.stringify(body),
});

export const listPayments = (token: string, params?: {
  status?: string; payment_type?: string; date_from?: string; date_to?: string;
  limit?: number; offset?: number;
}) => {
  const q = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params ?? {}).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
    )
  ).toString();
  return _fetchJson<PaymentListResponse>(`/v1/payments/${q ? `?${q}` : ""}`, token);
};

export const getPayment = (token: string, id: string) =>
  _fetchJson<PaymentInstruction>(`/v1/payments/${id}`, token);

export const approvePayment = (token: string, id: string) =>
  _fetchJson<PaymentInstruction>(`/v1/payments/${id}/approve`, token, { method: "POST" });

export const rejectPayment = (token: string, id: string, reason: string) =>
  _fetchJson<PaymentInstruction>(`/v1/payments/${id}/reject`, token, {
    method: "POST", body: JSON.stringify({ reason }),
  });

export const transmitPayment = (token: string, id: string) =>
  _fetchJson<PaymentInstruction>(`/v1/payments/${id}/transmit`, token, { method: "POST" });

export type PaymentMessageFormat = "mt103" | "pain001";

export interface PaymentMessageResponse {
  payment_id: string;
  format: PaymentMessageFormat;
  content: string;
  message_hash: string;
  message_reference: string;
  payment_type: string;
  supported_formats: PaymentMessageFormat[];
  instruction_hash: string;
}

export const getPaymentMessage = (
  token: string, id: string, format: PaymentMessageFormat = "mt103",
) => _fetchJson<PaymentMessageResponse>(
  `/v1/payments/${id}/message?format=${format}`, token,
);

export const cancelPayment = (token: string, id: string) =>
  _fetchJson<PaymentInstruction>(`/v1/payments/${id}/cancel`, token, { method: "POST" });
