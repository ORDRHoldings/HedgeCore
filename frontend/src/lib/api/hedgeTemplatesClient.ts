// frontend/src/lib/api/hedgeTemplatesClient.ts
//
// Hedge Templates Library API client (P2-C).
// Backend mounts router at /v1/hedge-templates/*.

import { dashboardFetch } from "@/lib/api/dashboardClient";

export class HedgeTemplateApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HedgeTemplateApiError";
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
    } catch { /* noop */ }
    throw new HedgeTemplateApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export type InstrumentKind =
  | "FORWARD" | "VANILLA_CALL" | "VANILLA_PUT" | "NDF" | "COLLAR";

export type Direction = "BUY" | "SELL";

export type TemplateCategory =
  | "FORWARD" | "OPTION" | "LAYERED" | "ROLLING" | "COLLAR" | "MIXED";

export interface InstrumentLeg {
  instrument: InstrumentKind;
  weight: number;
  tenor_days: number | null;
  strike_pct: number | null;
  direction: Direction;
  tranche_label: string | null;
}

export interface HedgeTemplate {
  id: string;
  company_id: string | null;
  name: string;
  short_name: string;
  description: string | null;
  category: TemplateCategory;
  instrument_mix: InstrumentLeg[];
  version: number;
  is_system: boolean;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface TemplateListResponse {
  items: HedgeTemplate[];
  total: number;
}

export interface AppliedLeg {
  instrument: InstrumentKind;
  notional: number;
  currency: string;
  value_date: string;
  strike_pct: number | null;
  direction: Direction;
  tranche_label: string | null;
  weight: number;
}

export interface ApplyResponse {
  template_id: string;
  position_id: string;
  legs: AppliedLeg[];
  total_notional: number;
  currency: string;
}

export async function listTemplates(
  token: string,
  opts: { category?: string; include_inactive?: boolean } = {},
): Promise<TemplateListResponse> {
  const params = new URLSearchParams();
  if (opts.category) params.set("category", opts.category);
  if (opts.include_inactive) params.set("include_inactive", "true");
  const q = params.toString();
  return _fetchJson<TemplateListResponse>(
    `/v1/hedge-templates${q ? `?${q}` : ""}`,
    token,
  );
}

export async function getTemplate(token: string, id: string): Promise<HedgeTemplate> {
  return _fetchJson<HedgeTemplate>(`/v1/hedge-templates/${id}`, token);
}

export async function createTemplate(
  token: string,
  body: {
    name: string;
    short_name: string;
    category: TemplateCategory;
    description?: string;
    instrument_mix: InstrumentLeg[];
  },
): Promise<HedgeTemplate> {
  return _fetchJson<HedgeTemplate>("/v1/hedge-templates", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateTemplate(
  token: string,
  id: string,
  body: Partial<{
    name: string;
    description: string;
    category: TemplateCategory;
    instrument_mix: InstrumentLeg[];
    is_active: boolean;
  }>,
): Promise<HedgeTemplate> {
  return _fetchJson<HedgeTemplate>(`/v1/hedge-templates/${id}`, token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteTemplate(token: string, id: string): Promise<void> {
  await _fetchJson<void>(`/v1/hedge-templates/${id}`, token, { method: "DELETE" });
}

export async function applyTemplate(
  token: string, templateId: string, positionId: string,
): Promise<ApplyResponse> {
  return _fetchJson<ApplyResponse>(
    `/v1/hedge-templates/${templateId}/apply`, token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position_id: positionId }),
    },
  );
}
