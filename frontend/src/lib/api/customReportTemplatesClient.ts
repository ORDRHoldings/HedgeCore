// frontend/src/lib/api/customReportTemplatesClient.ts
//
// Custom Report Templates API client (P2-B).
// Backend mounts router at /api/v1/custom-report-templates/*.

import { dashboardFetch } from "@/lib/api/dashboardClient";
import type { SectionType, SectionStatus, ReportCategory, ReportAudience } from "@/types/reportTypes";

export class CustomReportTemplateApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "CustomReportTemplateApiError";
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
    throw new CustomReportTemplateApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export interface CustomReportSectionSpec {
  type: SectionType;
  title: string;
  order: number;
  status: SectionStatus;
  page_break_before: boolean;
}

export interface CustomReportTemplate {
  id: string;
  company_id: string;
  user_id: string;
  name: string;
  short_name: string;
  description: string | null;
  category: ReportCategory;
  audience: ReportAudience[];
  sections: CustomReportSectionSpec[];
  default_bindings: Record<string, unknown>;
  tags: string[];
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface CustomReportTemplateListResponse {
  items: CustomReportTemplate[];
  total: number;
}

export interface CustomReportTemplateCreateBody {
  name: string;
  short_name: string;
  category: ReportCategory;
  description?: string;
  audience?: ReportAudience[];
  sections: CustomReportSectionSpec[];
  default_bindings?: Record<string, unknown>;
  tags?: string[];
}

export interface CustomReportTemplateUpdateBody {
  name?: string;
  description?: string;
  category?: ReportCategory;
  audience?: ReportAudience[];
  sections?: CustomReportSectionSpec[];
  default_bindings?: Record<string, unknown>;
  tags?: string[];
  is_active?: boolean;
}

export async function listCustomReportTemplates(
  token: string,
  opts: { category?: string; include_inactive?: boolean } = {},
): Promise<CustomReportTemplateListResponse> {
  const params = new URLSearchParams();
  if (opts.category) params.set("category", opts.category);
  if (opts.include_inactive) params.set("include_inactive", "true");
  const q = params.toString();
  return _fetchJson<CustomReportTemplateListResponse>(
    `/api/v1/custom-report-templates${q ? `?${q}` : ""}`,
    token,
  );
}

export async function getCustomReportTemplate(
  token: string, id: string,
): Promise<CustomReportTemplate> {
  return _fetchJson<CustomReportTemplate>(
    `/api/v1/custom-report-templates/${id}`, token,
  );
}

export async function createCustomReportTemplate(
  token: string, body: CustomReportTemplateCreateBody,
): Promise<CustomReportTemplate> {
  return _fetchJson<CustomReportTemplate>(
    "/api/v1/custom-report-templates", token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export async function updateCustomReportTemplate(
  token: string, id: string, body: CustomReportTemplateUpdateBody,
): Promise<CustomReportTemplate> {
  return _fetchJson<CustomReportTemplate>(
    `/api/v1/custom-report-templates/${id}`, token,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export async function deleteCustomReportTemplate(
  token: string, id: string,
): Promise<void> {
  await _fetchJson<void>(
    `/api/v1/custom-report-templates/${id}`, token,
    { method: "DELETE" },
  );
}
