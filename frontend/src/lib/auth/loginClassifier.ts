/**
 * loginClassifier.ts
 *
 * Pure error classification utility for the ORDR Terminal login page.
 * Extracted to a separate module so it can be unit-tested without
 * triggering Next.js 15.5 route-type-checker false positives on page exports.
 */

export type ErrKind = "auth" | "warmup" | "rate" | "server";

/**
 * Classifies a backend error string into one of four categories
 * used to drive typed error display on the login page.
 */
export function classifyError(msg: string): ErrKind {
  const m = msg.toLowerCase();
  if (m.includes("waking") || m.includes("moment") || m.includes("cold") || m.includes("sleep"))
    return "warmup";
  if (m.includes("rate") || m.includes("too many") || m.includes("429"))
    return "rate";
  if (
    m.includes("authentication") || m.includes("invalid") ||
    m.includes("credentials")   || m.includes("unauthorized")
  ) return "auth";
  return "server";
}
