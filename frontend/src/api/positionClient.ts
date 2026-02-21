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

function authHeaders(token?: string) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Shape returned by the positions list endpoint */
export interface PositionRow extends TradeRow {
  id: string;
}

/** Per-currency exposure summary from GET /v1/positions/exposure */
export interface ExposureAggregation {
  currency: string;
  total_confirmed: number;
  total_forecast: number;
  count_confirmed: number;
  count_forecast: number;
}

/** Maps API PositionResponse → PositionRow (renames flow_type → type) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapToPositionRow(p: Record<string, any>): PositionRow {
  return {
    id:          p.id as string,
    record_id:   p.record_id as string,
    entity:      p.entity as string,
    type:        p.flow_type as "AR" | "AP",
    currency:    p.currency as FuturesCurrency,
    amount:      Number(p.amount),
    value_date:  p.value_date as string,
    status:      p.status as "CONFIRMED" | "FORECAST",
    description: (p.description as string) ?? "",
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
