/**
 * policyClient.ts — /api/v1/policies REST client
 */
import axios from "axios";
import type { PolicyConfig } from "./types";
import type { PolicyPreset } from "@/constants/policyPresets";
import type { QuestionnaireAnswers, AIPolicyResult, AIPolicyRecommendation } from "@/app/api/policy-ai/route";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

function authHeaders(token?: string) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PolicyTemplate {
  id: string;
  company_id: string | null;   // null → system template
  name: string;
  short_name: string;
  description: string | null;
  risk_posture: "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE";
  category: "CORPORATE" | "FINANCIAL" | "SOVEREIGN" | "SECTOR";
  config: PolicyConfig;
  version: number;
  is_system: boolean;
  created_at: string;
}

export interface PolicyInstance {
  id: string;
  company_id: string;
  branch_id: string | null;
  template_id: string;
  activated_by: string;
  activated_at: string;
  is_active: boolean;
  template: PolicyTemplate | null;
}

// ---------------------------------------------------------------------------
// List templates
// ---------------------------------------------------------------------------

export async function listPolicyTemplates(
  token?: string,
): Promise<PolicyTemplate[]> {
  const { data } = await axios.get(`${BASE}/v1/policies/templates`, {
    headers: authHeaders(token),
  });
  return data as PolicyTemplate[];
}

// ---------------------------------------------------------------------------
// Get active policy instance for the caller's company+branch
// ---------------------------------------------------------------------------

export async function getActivePolicy(
  token?: string,
): Promise<PolicyInstance | null> {
  const { data } = await axios.get(`${BASE}/v1/policies/active`, {
    headers: authHeaders(token),
  });
  return (data as PolicyInstance | null) ?? null;
}

// ---------------------------------------------------------------------------
// Activate a policy template
// ---------------------------------------------------------------------------

export async function activatePolicy(
  templateId: string,
  token?: string,
): Promise<PolicyInstance> {
  const { data } = await axios.post(
    `${BASE}/v1/policies/activate`,
    { template_id: templateId },
    { headers: authHeaders(token) },
  );
  return data as PolicyInstance;
}

// ---------------------------------------------------------------------------
// Create a company-specific template
// ---------------------------------------------------------------------------

export interface CreateTemplatePayload {
  name: string;
  short_name: string;
  description?: string;
  risk_posture: "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE";
  category: "CORPORATE" | "FINANCIAL" | "SOVEREIGN" | "SECTOR";
  config: PolicyConfig;
}

export async function createPolicyTemplate(
  payload: CreateTemplatePayload,
  token?: string,
): Promise<PolicyTemplate> {
  const { data } = await axios.post(`${BASE}/v1/policies/templates`, payload, {
    headers: authHeaders(token),
  });
  return data as PolicyTemplate;
}

// ---------------------------------------------------------------------------
// AI Policy Suggestion — calls the Next.js /api/policy-ai route (server-side)
// No auth required — the Claude API key lives on the server.
// ---------------------------------------------------------------------------

export type { QuestionnaireAnswers, AIPolicyResult, AIPolicyRecommendation };

export async function suggestPolicyAI(
  answers: QuestionnaireAnswers,
): Promise<AIPolicyResult> {
  const res = await fetch("/api/policy-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) {
    throw new Error(`Policy AI request failed: HTTP ${res.status}`);
  }
  return (await res.json()) as AIPolicyResult;
}

// ---------------------------------------------------------------------------
// Update an existing company template (PATCH)
// ---------------------------------------------------------------------------

export interface UpdateTemplatePayload {
  name?: string;
  short_name?: string;
  description?: string;
  risk_posture?: "CONSERVATIVE" | "MODERATE" | "AGGRESSIVE";
  category?: "CORPORATE" | "FINANCIAL" | "SOVEREIGN" | "SECTOR";
  config?: PolicyConfig;
}

export async function updatePolicyTemplate(
  templateId: string,
  payload: UpdateTemplatePayload,
  token?: string,
): Promise<PolicyTemplate> {
  const { data } = await axios.patch(
    `${BASE}/v1/policies/templates/${templateId}`,
    payload,
    { headers: authHeaders(token) },
  );
  return data as PolicyTemplate;
}

// ---------------------------------------------------------------------------
// Delete a company template (only non-system templates)
// ---------------------------------------------------------------------------

export async function deletePolicyTemplate(
  templateId: string,
  token?: string,
): Promise<void> {
  await axios.delete(`${BASE}/v1/policies/templates/${templateId}`, {
    headers: authHeaders(token),
  });
}

// ---------------------------------------------------------------------------
// Deactivate the currently active policy (POST to /policies/deactivate)
// ---------------------------------------------------------------------------

export async function deactivatePolicy(token?: string): Promise<void> {
  await axios.post(
    `${BASE}/v1/policies/deactivate`,
    {},
    { headers: authHeaders(token) },
  );
}

// ---------------------------------------------------------------------------
// Duplicate a template (creates a new company-specific copy)
// Uses createPolicyTemplate with a "(Copy)" name suffix
// ---------------------------------------------------------------------------

export async function duplicatePolicyTemplate(
  source: PolicyTemplate,
  token?: string,
): Promise<PolicyTemplate> {
  const payload: CreateTemplatePayload = {
    name: `${source.name} (Copy)`,
    short_name: `${source.short_name}-COPY`.slice(0, 20).toUpperCase(),
    description: source.description ?? undefined,
    risk_posture: source.risk_posture,
    category: source.category,
    config: source.config,
  };
  return createPolicyTemplate(payload, token);
}

// Re-export the PolicyPreset type for consumers that import from policyClient
export type { PolicyPreset };

// ---------------------------------------------------------------------------
// Favorites
// ---------------------------------------------------------------------------

export interface PolicyFavorite {
  id: string;
  user_id: string;
  template_id: string;
  notes: string | null;
  created_at: string;
  template: PolicyTemplate | null;
}

export async function listFavorites(token?: string): Promise<PolicyFavorite[]> {
  const { data } = await axios.get(`${BASE}/v1/policies/favorites`, {
    headers: authHeaders(token),
  });
  return data as PolicyFavorite[];
}

export async function addFavorite(
  templateId: string,
  notes?: string,
  token?: string,
): Promise<PolicyFavorite> {
  const { data } = await axios.post(
    `${BASE}/v1/policies/favorites/${templateId}`,
    notes ? { notes } : {},
    { headers: authHeaders(token) },
  );
  return data as PolicyFavorite;
}

export async function removeFavorite(
  templateId: string,
  token?: string,
): Promise<void> {
  await axios.delete(`${BASE}/v1/policies/favorites/${templateId}`, {
    headers: authHeaders(token),
  });
}

// ---------------------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------------------

export async function exportPolicyTemplate(
  templateId: string,
  token?: string,
): Promise<Blob> {
  const response = await axios.get(
    `${BASE}/v1/policies/templates/${templateId}/export`,
    {
      headers: authHeaders(token),
      responseType: 'blob',
    },
  );
  return response.data as Blob;
}

export async function importPolicyTemplate(
  exportBlob: Record<string, unknown>,
  nameOverride?: string,
  shortNameOverride?: string,
  token?: string,
): Promise<PolicyTemplate> {
  const { data } = await axios.post(
    `${BASE}/v1/policies/templates/import`,
    {
      export_blob: exportBlob,
      name_override: nameOverride,
      short_name_override: shortNameOverride,
    },
    { headers: authHeaders(token) },
  );
  return data as PolicyTemplate;
}

// ---------------------------------------------------------------------------
// Seed status
// ---------------------------------------------------------------------------

export interface PolicySeedStatus {
  seeded: boolean;
  count: number;
  expected_count: number;
  missing_short_names: string[];
}

export async function getPolicyTemplateSeedStatus(
  token?: string,
): Promise<PolicySeedStatus> {
  const { data } = await axios.get(`${BASE}/v1/policies/templates/seed-status`, {
    headers: authHeaders(token),
  });
  return data as PolicySeedStatus;
}
