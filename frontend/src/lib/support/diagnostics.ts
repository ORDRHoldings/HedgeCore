/**
 * diagnostics.ts — Diagnostics Bundle Generator
 *
 * Collects system state for support ticket attachment.
 * NEVER includes: auth tokens, passwords, API keys, raw request/response bodies.
 * All data is explicitly allowlisted — no broad object dumps.
 */

export interface DiagnosticsBundle {
  schema_version: "1.0";
  generated_at: string;           // ISO timestamp
  consent: true;                  // only generated after explicit user consent

  // Identity (non-sensitive)
  tenant_id: string | null;
  user_id: string | null;
  roles: string[];
  branch_code: string | null;

  // Platform
  platform_version: string;       // e.g. "v2.0.0"
  next_version: string;           // process.env.NEXT_PUBLIC_VERSION or "unknown"
  user_agent: string;
  current_route: string;          // window.location.pathname + search (no hash)
  viewport: string;               // "1920x1080"
  locale: string;                 // navigator.language

  // Backend health (result of GET /api/health, 5s timeout)
  backend_status: "ok" | "error" | "timeout" | "unknown";
  backend_latency_ms: number | null;
  backend_url: string;            // NEXT_PUBLIC_API_URL, not the token

  // Recent API calls metadata (last 10, no tokens, no payloads)
  recent_api_calls: ApiCallMeta[];

  // Recent UI errors (last 5, sanitized)
  recent_errors: UiErrorMeta[];
}

export interface ApiCallMeta {
  ts: string;          // ISO
  method: string;
  path: string;        // pathname only, no query params that may contain sensitive data
  status: number | null;
  duration_ms: number | null;
}

export interface UiErrorMeta {
  ts: string;
  message: string;     // error.message only, no stack
  component?: string;  // if available
}

// In-memory ring buffer for API call tracking
const MAX_API_CALLS = 10;
const MAX_UI_ERRORS = 5;
const _apiCalls: ApiCallMeta[] = [];
const _uiErrors: UiErrorMeta[] = [];

export function trackApiCall(meta: ApiCallMeta): void {
  _apiCalls.unshift(meta);
  if (_apiCalls.length > MAX_API_CALLS) _apiCalls.pop();
}

export function trackUiError(meta: UiErrorMeta): void {
  _uiErrors.unshift(meta);
  if (_uiErrors.length > MAX_UI_ERRORS) _uiErrors.pop();
}

/**
 * Generate a diagnostics bundle. Requires explicit user consent.
 * Never call this without a consent UI — the `consent` param enforces this.
 */
export async function generateDiagnosticsBundle(
  opts: {
    consent: true;
    tenantId?: string | null;
    userId?: string | null;
    roles?: string[];
    branchCode?: string | null;
    platformVersion?: string;
    apiBaseUrl?: string;
  }
): Promise<DiagnosticsBundle> {
  const apiBase = opts.apiBaseUrl ?? process.env.NEXT_PUBLIC_API_URL ?? "";

  // Backend health check (non-blocking, 5s timeout)
  let backendStatus: DiagnosticsBundle["backend_status"] = "unknown";
  let backendLatency: number | null = null;
  try {
    const t0 = Date.now();
    const r = await fetch(`${apiBase}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    backendLatency = Date.now() - t0;
    backendStatus = r.ok ? "ok" : "error";
  } catch (e: unknown) {
    backendStatus = (e instanceof Error && e.name === "TimeoutError") ? "timeout" : "error";
  }

  return {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    consent: true,

    tenant_id: opts.tenantId ?? null,
    user_id: opts.userId ?? null,
    roles: opts.roles ?? [],
    branch_code: opts.branchCode ?? null,

    platform_version: opts.platformVersion ?? "v2.0.0",
    next_version: process.env.NEXT_PUBLIC_VERSION ?? "unknown",
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "ssr",
    current_route: typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : "ssr",
    viewport: typeof window !== "undefined"
      ? `${window.innerWidth}x${window.innerHeight}`
      : "unknown",
    locale: typeof navigator !== "undefined" ? navigator.language : "unknown",

    backend_status: backendStatus,
    backend_latency_ms: backendLatency,
    backend_url: apiBase,   // no token, just the base URL

    recent_api_calls: [..._apiCalls],
    recent_errors: [..._uiErrors],
  };
}
