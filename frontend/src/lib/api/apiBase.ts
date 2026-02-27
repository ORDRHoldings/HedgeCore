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
