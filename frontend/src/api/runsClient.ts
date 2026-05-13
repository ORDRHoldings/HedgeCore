/**
 * runsClient.ts — /api/v1/runs REST client
 *
 * Sprint 1.3: Run Viewer + Explain Mode
 *   - listRuns()     : GET /v1/runs?limit=N  → summary list for run history
 *   - fetchRunDetail(): GET /v1/runs/{id}    → full RunEnvelope + TraceLite JSONB
 *
 * Sprint 1.5: Committee Pack Generator
 *   - fetchCommitteePack(): GET /v1/export/committee-pack/{id}
 *       → DB-backed structured pack: envelope + trace + policy revision + hedge plan
 *
 * The full run detail is used by /run-viewer to render the TraceLite narrative
 * audit trail and RunEnvelope hash chain verification.
 */

import type { RunEnvelope, TraceLite } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

function getApiKey(): string {
  if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
    const stored = localStorage.getItem("hc_api_key");
    if (stored) return stored;
  }
  return "";
}

function getAuthHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = getApiKey();
  if (apiKey) headers["X-API-Key"] = apiKey;
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

// ── Sprint 1.5: Committee Pack ─────────────────────────────────────────────────

export interface CommitteePackMeta {
  run_id:          string;
  engine_version:  string;
  created_at:      string | null;
  trade_count:     number;
  hedge_count:     number;
  company_id:      string | null;
  generated_for:   string;
}

export interface CommitteePackEnvelope {
  run_id:         string | null;
  timestamp:      string | null;
  engine_version: string;
  inputs_hash:    string | null;
  outputs_hash:   string | null;
  run_hash:       string | null;
  trades_hash:    string | null;
  hedges_hash:    string | null;
  market_hash:    string | null;
  policy_hash:    string | null;
}

export interface CommitteePackTraceEvent {
  step:       string;
  timestamp:  string | null;
  detail:     string | null;
  data?:      Record<string, unknown>;
}

export interface CommitteePackTraceLite {
  run_id:  string | null;
  events:  CommitteePackTraceEvent[];
}

export interface CommitteePackPolicyRevision {
  id:                  string;
  policy_instance_id:  string;
  template_id:         string;
  company_id:          string;
  branch_id:           string | null;
  revision:            number;
  policy_hash:         string;
  canonical_policy:    Record<string, unknown>;
  created_by:          string;
  created_by_email:    string | null;
  change_reason:       string | null;
  prev_revision_id:    string | null;
  created_at:          string | null;
}

export interface CommitteePackBucket {
  bucket:              string;
  action_direction:    string;
  action_usd:          number;
  coverage_pct:        number;
  [key: string]:       unknown;
}

export interface CommitteePackHedgePlan {
  buckets:   CommitteePackBucket[];
  summary:   Record<string, unknown>;
  coverage:  unknown;
  base_ccy:  string | null;
}

export interface CommitteePackScenario {
  sigma:           number;
  hedge_benefit_usd: number;
  [key: string]:   unknown;
}

export interface CommitteePackRegulatory {
  framework:    string;
  standard_ref: string;
  emir_ref:     string;
  dodd_frank:   string;
  attestation:  string;
  worm_note:    string;
}

export interface CommitteePackResponse {
  meta:             CommitteePackMeta;
  run_envelope:     CommitteePackEnvelope;
  trace_lite:       CommitteePackTraceLite;
  policy_revision:  CommitteePackPolicyRevision | null;
  hedge_plan:       CommitteePackHedgePlan;
  scenarios:        CommitteePackScenario[];
  positions:        string[];
  regulatory:       CommitteePackRegulatory;
}

export async function fetchCommitteePack(
  runId: string,
  token?: string,
): Promise<CommitteePackResponse> {
  const res = await fetch(
    `${BASE}/v1/export/committee-pack/${encodeURIComponent(runId)}`,
    { headers: getAuthHeaders(token) },
  );
  if (res.status === 404) throw new Error(`Committee pack for run "${runId}" not found`);
  if (!res.ok) throw new Error(
    `GET /v1/export/committee-pack/${runId} failed: ${res.status} ${res.statusText}`,
  );
  return res.json() as Promise<CommitteePackResponse>;
}
