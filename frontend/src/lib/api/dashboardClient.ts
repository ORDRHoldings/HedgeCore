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
export { API_BASE };

/** Read CSRF token from double-submit cookie (set by /auth/login). */
function getCsrfToken(): string {
  return Cookies.get("csrf_token") ?? "";
}

const CSRF_SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

/**
 * Authenticated fetch for dashboard endpoints.
 *
 * @param path   Path relative to API_BASE, starting with "/".
 *               e.g. "/v1/dashboard/summary"
 * @param token  JWT access token from useAuth()
 * @param options  Optional additional RequestInit overrides
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
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...csrfHeaders,
      ...(options?.headers ?? {}),
    },
  });
}
