// frontend/src/lib/api/glClient.ts
/**
 * Type-safe API client for GL, settlement, and ERP endpoints.
 * All calls go through dashboardFetch for CSRF + auth.
 */
import { dashboardFetch } from "@/lib/api/dashboardClient";

export interface GLAccountMapping {
  id: string;
  company_id: string;
  entry_type: string;
  standard: string;
  debit_account: string;
  credit_account: string;
  account_label: string;
  erp_system: string;
  created_at: string;
  updated_at: string;
}

export interface JournalEntry {
  id: string;
  company_id: string;
  run_id: string | null;
  ledger_entry_id: string | null;
  settlement_event_id: string | null;
  entry_type: string;
  standard: string;
  debit_account: string;
  credit_account: string;
  amount: number;
  currency: string;
  base_amount: number;
  base_currency: string;
  fx_rate_used: number;
  period_date: string;
  description: string;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "POSTED" | "REJECTED";
  posted_at: string | null;
  posted_to: string | null;
  posted_ref: string | null;
  chain_seq: number;
  created_at: string;
}

export interface SettlementEvent {
  id: string;
  ledger_entry_id: string;
  hedge_rate: number;
  actual_rate: number;
  rate_variance: number;
  pnl_impact: number;
  settlement_date: string;
  settlement_ref: string;
  status: string;
  created_at: string;
}

// Helper: shared error-raising fetch + JSON parse
async function _fetchJson<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const res = await dashboardFetch(path, token, options);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const b = await res.json(); if (b?.detail) detail = b.detail; } catch { /* noop */ }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

// ── GL Account Mappings ────────────────────────────────────────────────────

export async function listGLMappings(token: string): Promise<GLAccountMapping[]> {
  return _fetchJson<GLAccountMapping[]>("/v1/gl/account-mappings", token);
}

export async function upsertGLMapping(
  token: string,
  data: Omit<GLAccountMapping, "id" | "company_id" | "created_at" | "updated_at">
): Promise<GLAccountMapping> {
  return _fetchJson<GLAccountMapping>("/v1/gl/account-mappings", token, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Journal Entries ────────────────────────────────────────────────────────

export async function listJournalEntries(
  token: string,
  params?: { status?: string; run_id?: string }
): Promise<JournalEntry[]> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status_filter", params.status);
  if (params?.run_id) q.set("run_id", params.run_id);
  const qs = q.toString();
  return _fetchJson<JournalEntry[]>(`/v1/gl/journal-entries${qs ? "?" + qs : ""}`, token);
}

export async function generateJournalEntries(
  token: string,
  runId: string
): Promise<JournalEntry[]> {
  return _fetchJson<JournalEntry[]>(`/v1/gl/journal-entries/generate/${runId}`, token, {
    method: "POST",
  });
}

export async function approveJournalEntry(
  token: string,
  entryId: string
): Promise<JournalEntry> {
  return _fetchJson<JournalEntry>(`/v1/gl/journal-entries/${entryId}/approve`, token, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function rejectJournalEntry(
  token: string,
  entryId: string,
  reason: string
): Promise<JournalEntry> {
  return _fetchJson<JournalEntry>(`/v1/gl/journal-entries/${entryId}/reject`, token, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function postJournalEntry(
  token: string,
  entryId: string
): Promise<JournalEntry> {
  return _fetchJson<JournalEntry>(`/v1/gl/journal-entries/${entryId}/post`, token, {
    method: "POST",
  });
}

// ── Settlement ────────────────────────────────────────────────────────────

export async function listPendingSettlements(token: string): Promise<unknown[]> {
  return _fetchJson<unknown[]>("/v1/settlement/pending", token);
}

export async function confirmSettlement(
  token: string,
  ledgerEntryId: string,
  data: {
    actual_rate: number;
    settlement_ref: string;
    hedge_rate: number;
    hedge_notional: number;
    currency?: string;
    standard?: string;
  }
): Promise<SettlementEvent> {
  return _fetchJson<SettlementEvent>(`/v1/settlement/confirm/${ledgerEntryId}`, token, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── ERP Pull ──────────────────────────────────────────────────────────────

export async function triggerERPPull(
  token: string,
  connectorId: string
): Promise<{ source_system: string; invoices_fetched: number; positions_created: number; duplicates_skipped: number }> {
  return _fetchJson(`/v1/erp/pull/${connectorId}`, token, { method: "POST" });
}
