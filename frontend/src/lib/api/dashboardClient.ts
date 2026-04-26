/**
 * lib/api/dashboardClient.ts
 * HedgeCalc — Shared fetch utility for dashboard widget API calls.
 *
 * Problem this solves:
 *   In production (Vercel), next.config.js returns empty rewrites[], so raw
 *   fetch("/api/v1/...") hits Vercel itself (no route) → "Failed to fetch".
 *   authContext.tsx already handles this correctly with a NEXT_PUBLIC_API_URL
 *   fallback. This module uses the same pattern so every widget resolves the
 *   correct backend origin regardless of environment.
 *
 * URL resolution order:
 *   1. NEXT_PUBLIC_API_URL env var  (set in Vercel project settings for prod)
 *   2. Hardcoded Vercel→Render fallback  (safety net if env var is missing)
 *   3. "/api"  (local dev — next.config.js rewrite handles proxying)
 */

import Cookies from "js-cookie";
import { API_BASE } from "@/lib/api/apiBase";
import {
  translateError,
  translateCaughtError,
  type TranslatedError,
} from "@/lib/errors/hedgeErrors";
export { API_BASE };

/** Read CSRF token from double-submit cookie (set by /auth/login). */
function getCsrfToken(): string {
  return Cookies.get("csrf_token") ?? "";
}

const CSRF_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

/** Default per-request timeout. Matches authContext login timeout (30 s). */
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Combine an optional caller-supplied signal with a timeout signal.
 * If the browser supports AbortSignal.any (Chrome 116+, FF 124+, Safari 17.4+)
 * we compose. Otherwise we fall back to whichever is available.
 */
function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const t = AbortSignal.timeout(timeoutMs);
  if (!signal) return t;
  // AbortSignal.any may not exist in older runtimes — guard.
  type AnyFn = (sigs: AbortSignal[]) => AbortSignal;
  const any = (AbortSignal as unknown as { any?: AnyFn }).any;
  return any ? any([signal, t]) : signal;
}

/**
 * Authenticated fetch for dashboard endpoints.
 *
 * @param path   Path relative to API_BASE, starting with "/".
 *               e.g. "/v1/dashboard/summary"
 * @param token  JWT access token from useAuth()
 * @param options  Optional additional RequestInit overrides. Pass `signal` to
 *                 add caller-side cancellation; a 15 s timeout is always
 *                 applied in addition.
 *
 * Usage:
 *   const res = await dashboardFetch("/v1/dashboard/summary", token);
 *   if (!res.ok) throw new Error(`HTTP ${res.status}`);
 *   const data = await res.json();
 */
export async function dashboardFetch(
  path: string,
  token: string,
  options?: RequestInit,
): Promise<Response> {
  const method = (options?.method ?? "GET").toUpperCase();
  const csrfHeaders: Record<string, string> = {};
  if (!CSRF_SAFE_METHODS.has(method)) {
    csrfHeaders["X-CSRF-Token"] = getCsrfToken();
  }

  const url = `${API_BASE}${path}`;
  // Don't set Content-Type for FormData — the browser must set it (with boundary).
  const isFormData = options?.body instanceof FormData;
  return fetch(url, {
    ...options,
    signal: withTimeout(options?.signal ?? undefined, DEFAULT_TIMEOUT_MS),
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      Authorization: `Bearer ${token}`,
      ...csrfHeaders,
      ...(options?.headers ?? {}),
    },
  });
}

/**
 * Result type for safeFetch — either success data or translated error.
 */
export type SafeResult<T = unknown> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: TranslatedError; status: number | null };

/**
 * Business-safe fetch wrapper for Hedge Desk components.
 *
 * Wraps dashboardFetch with automatic error translation so components
 * never need to display raw HTTP status codes or technical messages.
 *
 * Usage:
 *   const result = await safeFetch<PositionList>("/v1/positions?limit=200", token);
 *   if (!result.ok) {
 *     setError(result.error);  // TranslatedError with title, message, action
 *     return;
 *   }
 *   setPositions(result.data.items);
 */
export async function safeFetch<T = unknown>(
  path: string,
  token: string,
  options?: RequestInit,
): Promise<SafeResult<T>> {
  try {
    const res = await dashboardFetch(path, token, options);

    if (!res.ok) {
      let detail: string | undefined;
      try {
        const body = await res.json();
        if (typeof body?.detail === "string") {
          detail = body.detail;
        } else if (Array.isArray(body?.detail)) {
          detail = body.detail.map((d: { msg?: string }) => d.msg ?? "").join("; ");
        } else if (typeof body?.message === "string") {
          // Some endpoints return `message` instead of `detail`
          detail = body.message;
        }
      } catch {
        // body not JSON
      }
      return {
        ok: false,
        error: translateError(res.status, detail),
        status: res.status,
      };
    }

    const data = (await res.json()) as T;
    return { ok: true, data, status: res.status };
  } catch (err) {
    return {
      ok: false,
      error: translateCaughtError(err),
      status: null,
    };
  }
}

/**
 * safeFetch with automatic 401 → token refresh → retry.
 *
 * Pass the `refreshFn` from useAuth() to enable silent token refresh:
 *   const { refreshTokens } = useAuth();
 *   const result = await safeFetchWithRefresh("/v1/...", token, {}, refreshTokens);
 *
 * On 401 the refresh is attempted once; if successful the request is retried
 * with the new token. On subsequent 401 the error is returned to the caller.
 */
export async function safeFetchWithRefresh<T = unknown>(
  path: string,
  token: string,
  options?: RequestInit,
  refreshFn?: () => Promise<string | null>,
): Promise<SafeResult<T>> {
  const result = await safeFetch<T>(path, token, options);
  if (result.ok || result.status !== 401 || !refreshFn) return result;

  const newToken = await refreshFn();
  if (!newToken) return result;

  return safeFetch<T>(path, newToken, options);
}
