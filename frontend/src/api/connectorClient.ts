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
