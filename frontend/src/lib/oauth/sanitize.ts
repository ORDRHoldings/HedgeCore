/**
 * lib/oauth/sanitize.ts
 * Shared sanitisers for OAuth 2.0 callback pages (accounting, ERP, future
 * connectors). React already escapes JSX text, so the threat model here is
 * NOT XSS — it's:
 *   • Layout breakage from a 50KB attacker-supplied error_description
 *   • Control-char injection if the value is later logged or copied
 *   • localStorage key forging from an arbitrary ?system= query param
 *
 * Each consumer owns its own allowlist; this module only provides the
 * generic message sanitiser and an allowlist-checker factory.
 */

const MAX_OAUTH_MESSAGE_LEN = 280;

/**
 * Cap length, strip control chars, drop HTML angle brackets.
 * Returns null for empty/whitespace input so callers can use ?? fallback chains.
 */
export function sanitizeOauthMessage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/[<>]/g, "")
    .trim();
  if (!cleaned) return null;
  return cleaned.length > MAX_OAUTH_MESSAGE_LEN
    ? cleaned.slice(0, MAX_OAUTH_MESSAGE_LEN - 3) + "…"
    : cleaned;
}

/**
 * sessionStorage keys used to round-trip the OAuth `state` param across the
 * popup hop. Scoped per connector kind + system so two concurrent flows
 * cannot collide. sessionStorage (not localStorage) so the state evaporates
 * when the browser session ends.
 */
const OAUTH_STATE_PREFIX = "ordr_oauth_state";

export function oauthStateKey(kind: "accounting" | "erp", systemId: string): string {
  return `${OAUTH_STATE_PREFIX}_${kind}_${systemId}`;
}

/**
 * Generate a cryptographically random state value. Uses crypto.randomUUID()
 * where available (all evergreen browsers + Node 19+), with a getRandomValues
 * fallback. Never falls through to Math.random — we'd rather throw.
 */
export function generateOauthState(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("Web Crypto unavailable — refusing to start OAuth flow without secure state");
}

/**
 * Verify a returned `state` param matches one previously stashed in sessionStorage.
 * Always clears the stored state after the check (single-use), regardless of outcome.
 */
export function verifyAndClearOauthState(
  kind: "accounting" | "erp",
  systemId: string,
  returned: string | null,
): boolean {
  const key = oauthStateKey(kind, systemId);
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
  } catch {
    // sessionStorage unavailable — fail closed
    return false;
  }
  if (!stored || !returned) return false;
  // Constant-time compare for short strings — length check first short-circuits
  // when an attacker pads. Not strictly needed (these are ephemeral), but cheap.
  if (stored.length !== returned.length) return false;
  let diff = 0;
  for (let i = 0; i < stored.length; i++) {
    diff |= stored.charCodeAt(i) ^ returned.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Build an allowlist-validating system-id sanitiser.
 *
 * @param allowed system IDs that are permitted to round-trip into localStorage
 *                keys and UI labels.
 * @param caseInsensitive  when true (default), input is lowercased and
 *                matched against a lowercase set; when false, input must
 *                exactly match one of the allowed values.
 * @returns a function that returns the canonical id if allowed; otherwise null.
 */
export function makeSystemIdSanitizer(
  allowed: Iterable<string>,
  caseInsensitive: boolean = true,
): (raw: string) => string | null {
  if (caseInsensitive) {
    const set = new Set(Array.from(allowed, (a) => a.toLowerCase()));
    return (raw: string) => {
      const id = (raw ?? "").toLowerCase();
      return set.has(id) ? id : null;
    };
  }
  const set = new Set(allowed);
  return (raw: string) => (set.has(raw ?? "") ? raw : null);
}
