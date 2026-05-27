// frontend/src/lib/api/regulatorySubmissionClient.ts
//
// Regulatory Submissions API client.
//
// Backend mounts router at /v1/regulatory-submissions/*.

import { dashboardFetch } from "@/lib/api/dashboardClient";

export class RegulatoryApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "RegulatoryApiError";
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
    throw new RegulatoryApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export type SubmissionFramework =
  | "EMIR"
  | "MIFID_II"
  | "DODD_FRANK"
  | "ISDA"
  | "FINRA_17A4"
  | "IFRS9";

export type SubmissionStatus =
  | "PENDING"
  | "SUBMITTED"
  | "ACKNOWLEDGED"
  | "REJECTED"
  | "FAILED";

export interface RegulatorySubmission {
  id: string;
  tenant_id: string;
  framework: SubmissionFramework;
  uti: string;
  source_run_id: string | null;
  status: SubmissionStatus;
  document_bytes: number;
  document_hash: string;
  submitted_at: string | null;
  ack_received_at: string | null;
  ack_reference: string | null;
  rejection_reason: string | null;
  retry_count: number;
  created_at: string;
  created_by_user_id: string;
  updated_at: string;
}

export interface SubmissionCreateRequest {
  framework: SubmissionFramework;
  source_run_id?: string | null;
  uti?: string | null;
}

export interface AcknowledgmentRequest {
  ack_reference: string;
  ack_received_at?: string | null;
}

export interface RejectionRequest {
  rejection_reason: string;
}

export interface SubmissionStats {
  total: number;
  pending: number;
  submitted: number;
  acknowledged: number;
  rejected: number;
  failed: number;
  ack_rate_pct: number;
}

export interface ListFilters {
  framework?: SubmissionFramework;
  status?: SubmissionStatus;
  source_run_id?: string;
  limit?: number;
}

// -------------------------- endpoints --------------------------

export async function createSubmission(
  token: string,
  body: SubmissionCreateRequest,
): Promise<RegulatorySubmission> {
  return _fetchJson<RegulatorySubmission>("/v1/regulatory-submissions", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function listSubmissions(
  token: string,
  filters: ListFilters = {},
): Promise<RegulatorySubmission[]> {
  const params = new URLSearchParams();
  if (filters.framework) params.set("framework", filters.framework);
  if (filters.status) params.set("status", filters.status);
  if (filters.source_run_id) params.set("source_run_id", filters.source_run_id);
  if (filters.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  const url = qs
    ? `/v1/regulatory-submissions?${qs}`
    : "/v1/regulatory-submissions";
  return _fetchJson<RegulatorySubmission[]>(url, token);
}

export async function getSubmission(
  token: string,
  id: string,
): Promise<RegulatorySubmission> {
  return _fetchJson<RegulatorySubmission>(`/v1/regulatory-submissions/${id}`, token);
}

export async function getStats(token: string): Promise<SubmissionStats> {
  return _fetchJson<SubmissionStats>("/v1/regulatory-submissions/stats", token);
}

export async function markSubmitted(
  token: string,
  id: string,
  submittedAt?: string,
): Promise<RegulatorySubmission> {
  return _fetchJson<RegulatorySubmission>(
    `/v1/regulatory-submissions/${id}/submit`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submitted_at: submittedAt ?? null }),
    },
  );
}

export async function acknowledge(
  token: string,
  id: string,
  body: AcknowledgmentRequest,
): Promise<RegulatorySubmission> {
  return _fetchJson<RegulatorySubmission>(
    `/v1/regulatory-submissions/${id}/acknowledge`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export async function rejectSubmission(
  token: string,
  id: string,
  body: RejectionRequest,
): Promise<RegulatorySubmission> {
  return _fetchJson<RegulatorySubmission>(
    `/v1/regulatory-submissions/${id}/reject`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export async function markFailed(
  token: string,
  id: string,
  body: RejectionRequest,
): Promise<RegulatorySubmission> {
  return _fetchJson<RegulatorySubmission>(
    `/v1/regulatory-submissions/${id}/mark-failed`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}
