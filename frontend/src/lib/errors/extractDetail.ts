/**
 * lib/errors/extractDetail.ts
 *
 * Narrow a caught `unknown` (or axios-style error) down to a display string.
 * Replaces scattered `(e as any)?.response?.data?.detail ?? String(e)` patterns.
 */

export interface AxiosLikeError {
  response?: {
    data?: {
      detail?: string;
    };
  };
}

function isAxiosLikeError(value: unknown): value is AxiosLikeError {
  return (
    typeof value === "object" &&
    value !== null &&
    "response" in value &&
    typeof (value as { response?: unknown }).response === "object"
  );
}

/**
 * Prefer `error.response.data.detail` (FastAPI / axios convention); fall back
 * to `error.message` for native Error; last resort coerce to string.
 */
export function extractErrorDetail(error: unknown): string {
  if (isAxiosLikeError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string" && detail.length > 0) return detail;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
