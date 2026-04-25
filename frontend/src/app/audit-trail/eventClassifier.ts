/**
 * Pure helper that maps a backend `audit_events.event_type` string to the UI
 * bucket the audit-trail page renders it under.
 *
 * Order matters: the VOICE bucket has the highest precedence so that any event
 * starting with `voice_` (per ADR-0016 control 7) lands in the dedicated tab
 * regardless of substring overlaps with other buckets. Tests in
 * `__tests__/eventClassifier.test.ts` enforce this precedence as a contract.
 */

export type EventType =
  | "PROPOSAL"
  | "APPROVAL"
  | "EXECUTION"
  | "POLICY"
  | "IMPORT"
  | "VOICE"
  | "SYSTEM";

export function inferEventType(event_type: string): EventType {
  const t = event_type.toLowerCase();
  if (t.startsWith("voice_"))                                              return "VOICE";
  if (t.includes("approved") || t.includes("approval"))                    return "APPROVAL";
  if (t.includes("executed") || t.includes("hedged") || t.includes("execution")) return "EXECUTION";
  if (t.startsWith("proposal.") || t.startsWith("position.") ||
      t.startsWith("calculation.") || t.startsWith("run."))                return "PROPOSAL";
  if (t.startsWith("policy."))                                             return "POLICY";
  if (t.startsWith("import.") || t.startsWith("connector."))               return "IMPORT";
  return "SYSTEM";
}
