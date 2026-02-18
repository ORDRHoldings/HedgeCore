import axios from 'axios';
import type { CalculateRequest, CalculateResponse } from './types';

// ── Base URL resolution ─────────────────────────────────────────────────────
// Priority: NEXT_PUBLIC_API_URL env var > detect production hostname > local proxy
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== 'undefined' && window.location.hostname === 'hedgecore.vercel.app'
    ? 'https://hedgecore.onrender.com/api'
    : '/api');

const api = axios.create({ baseURL: `${API_BASE}/v1` });

// Attach X-API-Key header on every request.
// In local/demo the bootstrap key HC_DEV_KEY_001 is always accepted by the backend.
// Override via NEXT_PUBLIC_HEDGECALC_API_KEY in .env.local for other environments.
api.interceptors.request.use((config) => {
  const key =
    process.env.NEXT_PUBLIC_HEDGECALC_API_KEY ??
    (typeof window !== 'undefined'
      ? localStorage.getItem('hc_api_key') ?? 'HC_DEV_KEY_001'
      : 'HC_DEV_KEY_001');
  config.headers['X-API-Key'] = key;
  return config;
});

export async function calculate(req: CalculateRequest): Promise<CalculateResponse> {
  const { data } = await api.post<CalculateResponse>('/calculate', req);
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
