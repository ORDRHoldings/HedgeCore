/**
 * lib/errors/hedgeErrors.ts
 * Centralized error translation for the Hedge Desk workflow.
 *
 * Converts raw HTTP / network / auth errors into calm, business-safe
 * messages suitable for an institutional operator console.
 * Every translated error includes a recommended next action.
 */

export type ErrorAction =
  | "retry"
  | "reconnect"
  | "go_back"
  | "resume_draft"
  | "add_positions"
  | "assign_policy"
  | "contact_support"
  | "wait";

export interface TranslatedError {
  title: string;
  message: string;
  actionLabel: string;
  actionType: ErrorAction;
  severity: "info" | "warning" | "critical";
}

/**
 * Translate a raw HTTP response or network error into a business-safe error.
 * Use this instead of exposing `HTTP 401` / `request failed` to operators.
 */
export function translateError(
  status: number | null,
  rawMessage?: string,
): TranslatedError {
  // Network / fetch failure (status is null)
  if (status === null) {
    if (rawMessage?.includes("AbortError") || rawMessage?.includes("timeout")) {
      return {
        title: "Request timed out",
        message: "The server is taking longer than expected. This is usually temporary.",
        actionLabel: "Retry",
        actionType: "retry",
        severity: "warning",
      };
    }
    return {
      title: "Connection issue",
      message: "Unable to reach the server. Check your network connection and retry.",
      actionLabel: "Retry",
      actionType: "retry",
      severity: "warning",
    };
  }

  // Auth / session
  if (status === 401) {
    return {
      title: "Session expired",
      message: "Your session has expired. Reconnect to continue. No data was lost.",
      actionLabel: "Reconnect",
      actionType: "reconnect",
      severity: "warning",
    };
  }

  if (status === 403) {
    return {
      title: "Insufficient permissions",
      message: "You don't have permission for this action. Contact your administrator if this is unexpected.",
      actionLabel: "Go back",
      actionType: "go_back",
      severity: "warning",
    };
  }

  // Not found
  if (status === 404) {
    return {
      title: "Not found",
      message: "This item was not found or may have been archived.",
      actionLabel: "Go back",
      actionType: "go_back",
      severity: "info",
    };
  }

  // Conflict (e.g. SoD, state transition violations)
  if (status === 409) {
    const msg = rawMessage?.toLowerCase() ?? "";
    if (msg.includes("approved") || msg.includes("proposal")) {
      return {
        title: "Approval required",
        message: "This action requires prior approval. Ensure proposals are approved before proceeding.",
        actionLabel: "Go back",
        actionType: "go_back",
        severity: "warning",
      };
    }
    return {
      title: "Action conflict",
      message: "This action could not be completed due to a state conflict. Please review and retry.",
      actionLabel: "Retry",
      actionType: "retry",
      severity: "warning",
    };
  }

  // Validation
  if (status === 422) {
    return {
      title: "Validation issue",
      message: rawMessage
        ? sanitizeBackendMessage(rawMessage)
        : "Some inputs could not be processed. Review the highlighted fields and try again.",
      actionLabel: "Review inputs",
      actionType: "go_back",
      severity: "warning",
    };
  }

  // Rate limit
  if (status === 429) {
    return {
      title: "Rate limited",
      message: "Too many requests. Please wait a moment before trying again.",
      actionLabel: "Wait",
      actionType: "wait",
      severity: "info",
    };
  }

  // Server errors
  if (status >= 500) {
    return {
      title: "System error",
      message: "Something went wrong on our end. Your draft is saved. Please retry or contact support if this persists.",
      actionLabel: "Retry",
      actionType: "retry",
      severity: "critical",
    };
  }

  // Fallback for other 4xx
  return {
    title: "Request failed",
    message: rawMessage
      ? sanitizeBackendMessage(rawMessage)
      : "The request could not be completed. Please try again.",
    actionLabel: "Retry",
    actionType: "retry",
    severity: "warning",
  };
}

/**
 * Translate a caught Error object (from fetch failures, timeouts, etc.)
 */
export function translateCaughtError(error: unknown): TranslatedError {
  if (error instanceof TypeError && error.message === "Failed to fetch") {
    return translateError(null);
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return translateError(null, "AbortError");
  }
  const msg = error instanceof Error ? error.message : String(error);

  // Check for embedded HTTP status
  const httpMatch = msg.match(/HTTP\s+(\d{3})/i);
  if (httpMatch) {
    return translateError(parseInt(httpMatch[1], 10), msg);
  }

  return translateError(null, msg);
}

/**
 * Extract a user-safe error message from a fetch Response.
 * Reads the response body once; returns a TranslatedError.
 */
export async function translateResponse(res: Response): Promise<TranslatedError> {
  let detail: string | undefined;
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") {
      detail = body.detail;
    } else if (Array.isArray(body?.detail)) {
      detail = body.detail.map((d: { msg?: string }) => d.msg ?? "").join("; ");
    } else if (typeof body?.message === "string") {
      detail = body.message;
    }
  } catch {
    // body not JSON — that's fine
  }
  return translateError(res.status, detail);
}

/**
 * Strip technical jargon from backend error messages.
 * Removes stack traces, internal class names, SQL references.
 */
function sanitizeBackendMessage(raw: string): string {
  // Remove JSON-like technical detail
  let msg = raw
    .replace(/\bHTTP\s+\d{3}\b/gi, "")
    .replace(/\b(sqlalchemy|psycopg|asyncpg|traceback|file\s+"[^"]+"|line\s+\d+)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Truncate overly long messages
  if (msg.length > 200) {
    msg = msg.slice(0, 197) + "...";
  }

  // Fallback if sanitization left nothing useful
  if (msg.length < 5) {
    return "An issue occurred while processing your request.";
  }

  // Capitalize first letter
  return msg.charAt(0).toUpperCase() + msg.slice(1);
}

/**
 * Context-specific empty state messages for Hedge Desk phases.
 */
export const HEDGE_EMPTY_STATES = {
  no_positions: {
    title: "No eligible positions",
    message: "No positions are ready for hedging. Import positions and assign policies to get started.",
    actionLabel: "Go to Position Desk",
    actionType: "add_positions" as ErrorAction,
  },
  no_policy: {
    title: "No active policy",
    message: "A hedge policy is required before calculating. Select a policy or create one from a template.",
    actionLabel: "Select Policy",
    actionType: "assign_policy" as ErrorAction,
  },
  no_market_data: {
    title: "Market data unavailable",
    message: "Live market rates could not be loaded. The system will retry automatically. You can also proceed with the last known snapshot.",
    actionLabel: "Retry",
    actionType: "retry" as ErrorAction,
  },
  no_runs: {
    title: "No calculation runs yet",
    message: "Start a new hedge run to generate your first calculation.",
    actionLabel: "Start New Run",
    actionType: "add_positions" as ErrorAction,
  },
  no_active_hedges: {
    title: "No active hedges",
    message: "Complete a hedge run and execute trades to see active hedges here.",
    actionLabel: "Start Hedge Run",
    actionType: "add_positions" as ErrorAction,
  },
} as const;
