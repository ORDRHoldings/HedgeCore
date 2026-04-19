// frontend/src/lib/api/webhookClient.ts
//
// Webhook endpoint management API client.
// Backend mounts router at /api/v1/webhooks.

import { dashboardFetch } from "@/lib/api/dashboardClient";

export class WebhookApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "WebhookApiError";
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
    throw new WebhookApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  is_active: boolean;
  created_at: string | null;
}

// Only returned on creation — secret is not persisted in plaintext
export interface WebhookRegisterResponse extends WebhookEndpoint {
  secret: string;
}

export interface WebhookCreateBody {
  url: string;
  description?: string;
  events?: string[];
}

export async function listWebhookEndpoints(token: string): Promise<WebhookEndpoint[]> {
  return _fetchJson<WebhookEndpoint[]>("/api/v1/webhooks", token);
}

export async function createWebhookEndpoint(
  token: string,
  body: WebhookCreateBody,
): Promise<WebhookRegisterResponse> {
  return _fetchJson<WebhookRegisterResponse>("/api/v1/webhooks", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteWebhookEndpoint(token: string, id: string): Promise<void> {
  await _fetchJson<void>(`/api/v1/webhooks/${id}`, token, { method: "DELETE" });
}
