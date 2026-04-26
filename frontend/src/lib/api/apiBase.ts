/**
 * lib/api/apiBase.ts
 * Single source of truth for the backend API base URL.
 *
 * Resolution order:
 *  1. NEXT_PUBLIC_API_URL env var  (set in Vercel project settings for prod)
 *  2. Hardcoded Vercel → Render fallback  (safety net if env var is missing)
 *  3. "/api"  (local dev — next.config.js rewrite handles proxying)
 */

const _PROD_HOSTNAMES = ["hedgecore.vercel.app", "ordr-terminal.vercel.app"];

export function getApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  try {
    if (
      typeof window !== "undefined" &&
      _PROD_HOSTNAMES.includes(window.location.hostname)
    ) {
      return "https://hedgecore.onrender.com/api";
    }
  } catch {
    /* SSR: location not available */
  }
  return "/api";
}

/** Resolved once at module load. */
export const API_BASE = getApiBase();

/**
 * Authentication-less fetch for endpoints called before a JWT exists
 * (signup, /v1/mfa/verify with provisional token in header, public health).
 *
 * Same URL resolution + 15 s timeout as dashboardFetch but no Bearer/CSRF
 * injection. Caller is responsible for any required auth headers.
 */
const PUBLIC_DEFAULT_TIMEOUT_MS = 15_000;

function publicWithTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const t = AbortSignal.timeout(timeoutMs);
  if (!signal) return t;
  type AnyFn = (sigs: AbortSignal[]) => AbortSignal;
  const any = (AbortSignal as unknown as { any?: AnyFn }).any;
  return any ? any([signal, t]) : signal;
}

export async function publicFetch(
  path: string,
  options?: RequestInit,
): Promise<Response> {
  const url = `${API_BASE}${path}`;
  const isFormData = options?.body instanceof FormData;
  return fetch(url, {
    ...options,
    signal: publicWithTimeout(options?.signal ?? undefined, PUBLIC_DEFAULT_TIMEOUT_MS),
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(options?.headers ?? {}),
    },
  });
}
