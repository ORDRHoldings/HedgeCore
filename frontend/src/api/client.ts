import axios from 'axios';
import type { CalculateRequest, CalculateResponse, MarketSnapshot } from './types';

// ── Base URL resolution ─────────────────────────────────────────────────────
// Priority: NEXT_PUBLIC_API_URL env var > detect production hostname > local proxy
const _PROD_HOSTNAMES = ['hedgecore.vercel.app', 'ordr-terminal.vercel.app'];
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== 'undefined' && _PROD_HOSTNAMES.includes(window.location.hostname)
    ? 'https://hedgecore.onrender.com/api'
    : '/api');

const api = axios.create({ baseURL: `${API_BASE}/v1` });

// Attach a dev-only X-API-Key override when explicitly set in localStorage.
// Production browser requests must authenticate with user-scoped Bearer tokens.
api.interceptors.request.use((config) => {
  const key = process.env.NODE_ENV === "development" && typeof window !== 'undefined'
    ? localStorage.getItem('hc_api_key') ?? ""
    : "";
  if (key) config.headers['X-API-Key'] = key;
  return config;
});

export async function calculate(req: CalculateRequest, token?: string): Promise<CalculateResponse> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const { data } = await api.post<CalculateResponse>('/calculate', req, { headers });
  return data;
}

export interface MarketSnapshotResponse {
  snapshot_id: string;
  market_snapshot_hash: string;
  provider: string;
  data_class: string;
  as_of: string;
  fetched_at: string;
  primary_currency: string;
  spot_rate: number;
  is_synthetic_forward: boolean;
  payload: MarketSnapshot;
}

/**
 * Persist a MarketSnapshot payload to the backend WORM store.
 * Returns the snapshot_id (UUID) which can be passed to calculate().
 * Idempotent: same payload → same snapshot_id returned.
 */
export async function persistMarketSnapshot(
  payload: MarketSnapshot,
): Promise<MarketSnapshotResponse> {
  const { data } = await api.post<MarketSnapshotResponse>('/market-snapshots', { payload });
  return data;
}

export async function uploadTradesCsv(file: File) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post('/upload/trades', form);
  return data;
}

export async function uploadHedgesCsv(file: File) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post('/upload/hedges', form);
  return data;
}

export function getExportUrl(type: 'pdf' | 'excel' | 'zip', runId: string) {
  return `${API_BASE}/v1/export/${type}/${runId}`;
}
