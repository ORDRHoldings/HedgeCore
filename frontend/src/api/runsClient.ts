/**
 * runsClient.ts — /api/v1/runs REST client
 *
 * Sprint 1.3: Run Viewer + Explain Mode
 *   - listRuns()     : GET /v1/runs?limit=N  → summary list for run history
 *   - fetchRunDetail(): GET /v1/runs/{id}    → full RunEnvelope + TraceLite JSONB
 *
 * The full run detail is used by /run-viewer to render the TraceLite narrative
 * audit trail and RunEnvelope hash chain verification.
 */

import type { RunEnvelope, TraceLite } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

function getApiKey(): string {
  if (process.env.NEXT_PUBLIC_HEDGECALC_API_KEY) return process.env.NEXT_PUBLIC_HEDGECALC_API_KEY;
  if (typeof window !== "undefined") {
    return localStorage.getItem("hc_api_key") ?? "HC_DEV_KEY_001";
  }
  return "HC_DEV_KEY_001";
}

function getAuthHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-API-Key": getApiKey(),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

// ── Response shapes ────────────────────────────────────────────────────────────

export interface RunSummary {
  run_id:       string;
  inputs_hash:  string;
  outputs_hash: string;
  run_hash:     string;
  trade_count:  number;
  hedge_count:  number;
  created_at:   string;
}

export interface RunListResponse {
  items: RunSummary[];
  total: number;
}

export interface RunDetailResponse {
  run_id:       string;
  run_envelope: RunEnvelope | null;
  trace_lite:   TraceLite | null;
  trade_count:  number;
  hedge_count:  number;
  inputs_hash:  string;
  outputs_hash: string;
  run_hash:     string;
  created_at:   string | null;
  // Sprint 1.0 policy version pinning
  policy_revision_id?: string | null;
  policy_hash?:        string | null;
}

// ── API functions ──────────────────────────────────────────────────────────────

export async function listRuns(
  token?: string,
  limit = 50,
): Promise<RunListResponse> {
  const res = await fetch(`${BASE}/v1/runs?limit=${limit}`, {
    headers: getAuthHeaders(token),
  });
  if (!res.ok) throw new Error(`GET /v1/runs failed: ${res.status} ${res.statusText}`);
  return res.json() as Promise<RunListResponse>;
}

export async function fetchRunDetail(
  runId: string,
  token?: string,
): Promise<RunDetailResponse> {
  const res = await fetch(`${BASE}/v1/runs/${encodeURIComponent(runId)}`, {
    headers: getAuthHeaders(token),
  });
  if (res.status === 404) throw new Error(`Run "${runId}" not found`);
  if (!res.ok) throw new Error(`GET /v1/runs/${runId} failed: ${res.status} ${res.statusText}`);
  return res.json() as Promise<RunDetailResponse>;
}
