/**
 * positionClient.ts — /api/v1/positions REST client
 *
 * Field mapping at boundary:
 *   API (backend) uses  flow_type  → frontend TradeRow uses  type
 *   API response PositionResponse has an `id` UUID field
 */
import axios from "axios";
import type { TradeRow, FuturesCurrency } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

function getApiKey(): string {
  if (process.env.NEXT_PUBLIC_HEDGECALC_API_KEY) return process.env.NEXT_PUBLIC_HEDGECALC_API_KEY;
  if (typeof window !== "undefined") {
    return localStorage.getItem("hc_api_key") ?? "HC_DEV_KEY_001";
  }
  return "HC_DEV_KEY_001";
}

function authHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = { "X-API-Key": getApiKey() };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

/** Shape returned by the positions list endpoint */
export interface PositionRow extends TradeRow {
  id: string;
  // Lifecycle fields (Phase 0)
  execution_status: "NEW" | "POLICY_ASSIGNED" | "READY_TO_EXECUTE" | "HEDGED" | "REJECTED";
  policy_id:        string | null;
  last_run_id:      string | null;
  executed_at:      string | null;   // ISO timestamp
  execution_ref:    string | null;
  hedge_amount:     number | null;
  hedge_rate:       number | null;
  rejection_reason: string | null;
}

/** Per-currency exposure summary from GET /v1/positions/exposure */
export interface ExposureAggregation {
  currency: string;
  total_confirmed: number;
  total_forecast: number;
  count_confirmed: number;
  count_forecast: number;
}

/** Maps API PositionResponse → PositionRow (renames flow_type → type, includes lifecycle) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapToPositionRow(p: Record<string, any>): PositionRow {
  return {
    id:               p.id as string,
    record_id:        p.record_id as string,
    entity:           p.entity as string,
    type:             p.flow_type as "AR" | "AP",
    currency:         p.currency as FuturesCurrency,
    amount:           Number(p.amount),
    value_date:       p.value_date as string,
    status:           p.status as "CONFIRMED" | "FORECAST",
    description:      (p.description as string) ?? "",
    // Lifecycle fields
    execution_status: (p.execution_status as PositionRow["execution_status"]) ?? "NEW",
    policy_id:        (p.policy_id as string) ?? null,
    last_run_id:      (p.last_run_id as string) ?? null,
    executed_at:      (p.executed_at as string) ?? null,
    execution_ref:    (p.execution_ref as string) ?? null,
    hedge_amount:     p.hedge_amount != null ? Number(p.hedge_amount) : null,
    hedge_rate:       p.hedge_rate   != null ? Number(p.hedge_rate)   : null,
    rejection_reason: (p.rejection_reason as string) ?? null,
  };
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listPositions(
  token?: string,
  filters?: { status?: string; currency?: string; flow_type?: string },
): Promise<{ items: PositionRow[]; total: number }> {
  const params = new URLSearchParams();
  if (filters?.status)    params.set("status",    filters.status);
  if (filters?.currency)  params.set("currency",  filters.currency);
  if (filters?.flow_type) params.set("flow_type", filters.flow_type);
  const qs = params.toString() ? `?${params}` : "";
  const { data } = await axios.get(`${BASE}/v1/positions${qs}`, {
    headers: authHeaders(token),
  });
  return {
    items: (data.items as Record<string, unknown>[]).map(mapToPositionRow),
    total: data.total as number,
  };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createPosition(
  trade: TradeRow,
  token?: string,
): Promise<PositionRow> {
  const payload = {
    record_id:   trade.record_id,
    entity:      trade.entity,
    flow_type:   trade.type,        // rename: type → flow_type
    currency:    trade.currency,
    amount:      trade.amount,
    value_date:  trade.value_date,
    status:      trade.status,
    description: trade.description || null,
  };
  const { data } = await axios.post(`${BASE}/v1/positions`, payload, {
    headers: authHeaders(token),
  });
  return mapToPositionRow(data as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updatePosition(
  id: string,
  trade: Partial<TradeRow>,
  token?: string,
): Promise<PositionRow> {
  const payload: Record<string, unknown> = {};
  if (trade.entity      !== undefined) payload.entity      = trade.entity;
  if (trade.type        !== undefined) payload.flow_type   = trade.type;   // rename
  if (trade.currency    !== undefined) payload.currency    = trade.currency;
  if (trade.amount      !== undefined) payload.amount      = trade.amount;
  if (trade.value_date  !== undefined) payload.value_date  = trade.value_date;
  if (trade.status      !== undefined) payload.status      = trade.status;
  if (trade.description !== undefined) payload.description = trade.description || null;
  const { data } = await axios.put(`${BASE}/v1/positions/${id}`, payload, {
    headers: authHeaders(token),
  });
  return mapToPositionRow(data as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Delete (soft)
// ---------------------------------------------------------------------------

export async function deletePosition(id: string, token?: string): Promise<void> {
  await axios.delete(`${BASE}/v1/positions/${id}`, {
    headers: authHeaders(token),
  });
}

// ---------------------------------------------------------------------------
// CSV bulk import
// ---------------------------------------------------------------------------

export interface ImportResult {
  created: number;
  errors: { row: number; record_id?: string; error: string }[];
  total_rows: number;
}

export async function importPositionsCsv(
  file: File,
  token?: string,
): Promise<ImportResult> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await axios.post(`${BASE}/v1/positions/import`, form, {
    headers: {
      ...authHeaders(token),
      // Content-Type is set automatically by axios for FormData
    },
  });
  return data as ImportResult;
}

// ---------------------------------------------------------------------------
// Exposure aggregation
// ---------------------------------------------------------------------------

export async function getExposureAggregation(
  token?: string,
): Promise<ExposureAggregation[]> {
  const { data } = await axios.get(`${BASE}/v1/positions/exposure`, {
    headers: authHeaders(token),
  });
  return data as ExposureAggregation[];
}

// ---------------------------------------------------------------------------
// Lifecycle transitions (Phase 0 — regulated backbone)
// All return the updated PositionRow. Illegal transitions throw 409.
// ---------------------------------------------------------------------------

export async function assignPolicy(
  positionId: string,
  policyInstanceId: string,
  token?: string,
): Promise<PositionRow> {
  const { data } = await axios.patch(
    `${BASE}/v1/positions/${positionId}/assign-policy`,
    { policy_instance_id: policyInstanceId },
    { headers: authHeaders(token) },
  );
  return mapToPositionRow(data as Record<string, unknown>);
}

export async function markReadyToExecute(
  positionId: string,
  runId: string,
  hedgeAmount?: number,
  hedgeRate?: number,
  token?: string,
): Promise<PositionRow> {
  const { data } = await axios.patch(
    `${BASE}/v1/positions/${positionId}/ready`,
    { run_id: runId, hedge_amount: hedgeAmount ?? null, hedge_rate: hedgeRate ?? null },
    { headers: authHeaders(token) },
  );
  return mapToPositionRow(data as Record<string, unknown>);
}

export async function executePosition(
  positionId: string,
  executionRef: string,
  hedgeAmount?: number,
  hedgeRate?: number,
  token?: string,
): Promise<PositionRow> {
  const { data } = await axios.patch(
    `${BASE}/v1/positions/${positionId}/execute`,
    { execution_ref: executionRef, hedge_amount: hedgeAmount ?? null, hedge_rate: hedgeRate ?? null },
    { headers: authHeaders(token) },
  );
  return mapToPositionRow(data as Record<string, unknown>);
}

export async function rejectPosition(
  positionId: string,
  reason: string,
  token?: string,
): Promise<PositionRow> {
  const { data } = await axios.patch(
    `${BASE}/v1/positions/${positionId}/reject`,
    { reason },
    { headers: authHeaders(token) },
  );
  return mapToPositionRow(data as Record<string, unknown>);
}

export async function reopenPosition(
  positionId: string,
  token?: string,
): Promise<PositionRow> {
  const { data } = await axios.patch(
    `${BASE}/v1/positions/${positionId}/reopen`,
    {},
    { headers: authHeaders(token) },
  );
  return mapToPositionRow(data as Record<string, unknown>);
}

// ── Lineage (Sprint 1.4) ────────────────────────────────────────────────────

export interface LineageNode {
  id:     string;
  type:   "POSITION" | "POLICY" | "POLICY_REVISION" | "CALCULATION_RUN" | "EXECUTION_PROPOSAL";
  label:  string;
  status: string;
  fields: Record<string, unknown>;
  links:  Record<string, string>;
}

export interface LineageEdge {
  from:  string;
  to:    string;
  label: string;
}

export interface LineageResponse {
  position_id: string;
  nodes:       LineageNode[];
  edges:       LineageEdge[];
  summary: {
    node_count:           number;
    edge_count:           number;
    has_policy:           boolean;
    has_policy_revision:  boolean;
    has_run:              boolean;
    proposal_count:       number;
    execution_status:     string;
  };
}

export async function fetchPositionLineage(
  positionId: string,
  token?: string,
): Promise<LineageResponse> {
  const { data } = await axios.get(
    `${BASE}/v1/positions/${positionId}/lineage`,
    { headers: authHeaders(token) },
  );
  return data as LineageResponse;
}
