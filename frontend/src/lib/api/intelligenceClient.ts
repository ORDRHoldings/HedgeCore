// frontend/src/lib/api/intelligenceClient.ts
import { dashboardFetch } from "@/lib/api/dashboardClient";

async function _fetchJson<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const res = await dashboardFetch(path, token, options);
  if (!res.ok) {
    let detail = res.statusText;
    try { const b = await res.json(); if (b?.detail) detail = b.detail; } catch { /* noop */ }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export interface QueryResponse {
  query_id: string;
  answer: string;
  data_refs: string[];
  tokens_used: number;
  latency_ms: number;
}

export interface CommentaryResponse {
  commentary_id: string;
  draft: string;
  report_type: string;
  tokens_used: number;
}

export interface IntelligenceSettingsResponse {
  enabled: boolean;
  queries_this_month: number;
  tokens_this_month: number;
  model: string;
}

export async function queryIntelligence(q: string, token: string): Promise<QueryResponse> {
  return _fetchJson<QueryResponse>("/v1/intelligence/query", token, {
    method: "POST",
    body: JSON.stringify({ q }),
  });
}

export async function draftCommentary(
  report_type: "hedge_effectiveness",
  report_id: string,
  token: string,
): Promise<CommentaryResponse> {
  return _fetchJson<CommentaryResponse>("/v1/intelligence/commentary", token, {
    method: "POST",
    body: JSON.stringify({ report_type, report_id }),
  });
}

export async function getIntelligenceSettings(token: string): Promise<IntelligenceSettingsResponse> {
  return _fetchJson<IntelligenceSettingsResponse>("/v1/intelligence/settings", token);
}

export async function patchIntelligenceSettings(
  enabled: boolean,
  token: string,
): Promise<IntelligenceSettingsResponse> {
  return _fetchJson<IntelligenceSettingsResponse>("/v1/intelligence/settings", token, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}
