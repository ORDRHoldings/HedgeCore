/**
 * policyClient.ts — /api/v1/policies REST client
 */
import axios from "axios";
import type { PolicyConfig } from "./types";

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
