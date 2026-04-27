import { dashboardFetch } from "@/lib/api/dashboardClient";

export interface WebhookEndpoint {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  channel_type: string;
  is_active: boolean;
  created_at: string | null;
}

export interface WebhookRegisterRequest {
  url: string;
  description?: string;
  events: string[];
  channel_type: "generic" | "slack" | "teams";
}

export interface WebhookTestResult {
  success: boolean;
  status_code: number | null;
  error: string | null;
}

async function parseOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
      else if (typeof body?.message === "string") detail = body.message;
    } catch {
      // body not JSON
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export async function listWebhooks(token: string): Promise<WebhookEndpoint[]> {
  const res = await dashboardFetch("/v1/webhooks", token);
  return parseOrThrow<WebhookEndpoint[]>(res);
}

export async function registerWebhook(
  token: string,
  body: WebhookRegisterRequest
): Promise<WebhookEndpoint & { secret: string }> {
  const res = await dashboardFetch("/v1/webhooks", token, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return parseOrThrow<WebhookEndpoint & { secret: string }>(res);
}

export async function deleteWebhook(token: string, id: string): Promise<void> {
  const res = await dashboardFetch(`/v1/webhooks/${id}`, token, { method: "DELETE" });
  await parseOrThrow<void>(res);
}

export async function testWebhook(
  token: string,
  id: string
): Promise<WebhookTestResult> {
  const res = await dashboardFetch(`/v1/webhooks/${id}/test`, token, {
    method: "POST",
  });
  return parseOrThrow<WebhookTestResult>(res);
}
