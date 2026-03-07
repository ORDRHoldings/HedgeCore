/**
 * lib/draftPersistence.ts
 * Local draft persistence for the Hedge Desk pipeline.
 *
 * Saves the current pipeline phase + lightweight state identifiers
 * to localStorage so operators can resume after session expiry,
 * browser refresh, or network interruption.
 *
 * Only stores IDs and phase number — not full payloads — to stay
 * well within localStorage limits (~5MB).
 */

const STORAGE_KEY_PREFIX = "ordr_hedge_draft_";

export interface HedgeDraft {
  phase: number;
  positionIds: string[];
  positionCount: number;
  policyInstanceId?: string;
  runId?: string;
  riskVerdict?: string;
  riskDecisionHash?: string;
  proposalIds?: string[];
  governanceMode: "solo" | "team";
  savedAt: string; // ISO timestamp
}

function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

/** Save current pipeline state as a resumable draft. */
export function saveDraft(userId: string, draft: HedgeDraft): void {
  try {
    const payload = JSON.stringify({ ...draft, savedAt: new Date().toISOString() });
    localStorage.setItem(storageKey(userId), payload);
  } catch {
    // localStorage full or unavailable — silent fail, not critical
  }
}

/** Load a saved draft, or null if none exists / expired. */
export function loadDraft(userId: string): HedgeDraft | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as HedgeDraft;

    // Expire drafts older than 24 hours
    const savedAt = new Date(draft.savedAt);
    const age = Date.now() - savedAt.getTime();
    if (age > 24 * 60 * 60 * 1000) {
      clearDraft(userId);
      return null;
    }

    return draft;
  } catch {
    return null;
  }
}

/** Check if a resumable draft exists. */
export function hasDraft(userId: string): boolean {
  return loadDraft(userId) !== null;
}

/** Clear the saved draft. */
export function clearDraft(userId: string): void {
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    // silent
  }
}

/** Format the draft age as a human-readable string. */
export function draftAge(draft: HedgeDraft): string {
  const ms = Date.now() - new Date(draft.savedAt).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return "over a day ago";
}
