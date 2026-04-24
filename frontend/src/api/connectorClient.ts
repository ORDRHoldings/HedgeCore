/**
 * connectorClient.ts — /api/v1/connectors REST client
 *
 * Covers audited CSV/Excel import and ConnectorRun history queries.
 */
import axios from "axios";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

function authHeaders(token?: string) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConnectorRun {
  id: string;
  company_id: string;
  branch_id: string | null;
  triggered_by: string;
  connector_type: string;       // UPLOAD_CSV | UPLOAD_EXCEL | DATABASE | ERP | ACCOUNTING
  source_filename: string | null;
  source_hash: string | null;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  total_rows: number;
  created_ok: number;
  error_count: number;
  started_at: string;
  completed_at: string | null;
}

export interface ConnectorRunError {
  row_number: number | null;
  field_name: string | null;
  error_message: string;
}

export interface ConnectorRunDetail extends ConnectorRun {
  errors: ConnectorRunError[];
}

export interface ConnectorRunListResponse {
  items: ConnectorRun[];
  total: number;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export async function listConnectorRuns(
  token?: string,
  limit = 50,
): Promise<ConnectorRunListResponse> {
  const { data } = await axios.get(
    `${BASE}/v1/connectors/runs?limit=${limit}`,
    { headers: authHeaders(token) },
  );
  return data as ConnectorRunListResponse;
}

export async function getConnectorRunDetail(
  runId: string,
  token?: string,
): Promise<ConnectorRunDetail> {
  const { data } = await axios.get(
    `${BASE}/v1/connectors/runs/${runId}`,
    { headers: authHeaders(token) },
  );
  return data as ConnectorRunDetail;
}

// ---------------------------------------------------------------------------
// Audited imports
// ---------------------------------------------------------------------------

export async function importCsvAudited(
  file: File,
  token?: string,
): Promise<ConnectorRun> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await axios.post(`${BASE}/v1/connectors/import/csv`, form, {
    headers: authHeaders(token),
  });
  return data as ConnectorRun;
}

export async function importExcelAudited(
  file: File,
  token?: string,
): Promise<ConnectorRun> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await axios.post(`${BASE}/v1/connectors/import/excel`, form, {
    headers: authHeaders(token),
  });
  return data as ConnectorRun;
}

// ═════════════════════════════════════════════════════════════════════════════
// Live ERP / Accounting providers — /v1/connectors/{provider}/*
// ═════════════════════════════════════════════════════════════════════════════

export interface ProviderMeta {
  provider_id: string;
  display_name: string;
  auth_style: string;
}

export interface ConnectorStatus {
  provider_id: string;
  connected: boolean;
  realm_id: string | null;
  last_connected_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  circuit_open: boolean;
  paper_mode: boolean;
}

export interface ConnectorHealth {
  provider_id: string;
  healthy: boolean;
  latency_ms: number;
  detail: string;
}

export interface AuthorizeResponse {
  authorize_url: string | null;
  state: string;
  requires_form: boolean;
  form_fields: string[];
}

export interface COAAccount {
  external_id: string;
  code: string;
  name: string;
  type: string;
  subtype: string | null;
  currency: string | null;
  active: boolean;
  parent_external_id: string | null;
}

export interface COAResponse {
  provider_id: string;
  accounts: COAAccount[];
  fetched_at: string;
}

export async function listProviders(token?: string): Promise<ProviderMeta[]> {
  const { data } = await axios.get(`${BASE}/v1/connectors/providers`, {
    headers: authHeaders(token),
  });
  return (data?.providers as ProviderMeta[]) ?? [];
}

export async function getConnectorStatus(
  provider: string,
  token?: string,
): Promise<ConnectorStatus> {
  const { data } = await axios.get(`${BASE}/v1/connectors/${provider}/status`, {
    headers: authHeaders(token),
  });
  return data as ConnectorStatus;
}

export async function probeConnectorHealth(
  provider: string,
  token?: string,
): Promise<ConnectorHealth> {
  const { data } = await axios.get(`${BASE}/v1/connectors/${provider}/health`, {
    headers: authHeaders(token),
  });
  return data as ConnectorHealth;
}

export async function authorizeConnector(
  provider: string,
  extra: Record<string, string> = {},
  token?: string,
): Promise<AuthorizeResponse> {
  const { data } = await axios.post(
    `${BASE}/v1/connectors/${provider}/authorize`,
    { extra },
    { headers: authHeaders(token) },
  );
  return data as AuthorizeResponse;
}

export async function connectForm(
  provider: string,
  body: { state: string; fields: Record<string, string> },
  token?: string,
): Promise<ConnectorStatus> {
  const { data } = await axios.post(
    `${BASE}/v1/connectors/${provider}/connect-form`,
    body,
    { headers: authHeaders(token) },
  );
  return data as ConnectorStatus;
}

export async function disconnectConnector(
  provider: string,
  token?: string,
): Promise<void> {
  await axios.post(
    `${BASE}/v1/connectors/${provider}/disconnect`,
    {},
    { headers: authHeaders(token) },
  );
}

export async function pullCOA(
  provider: string,
  token?: string,
): Promise<COAResponse> {
  const { data } = await axios.get(`${BASE}/v1/connectors/${provider}/coa`, {
    headers: authHeaders(token),
  });
  return data as COAResponse;
}
