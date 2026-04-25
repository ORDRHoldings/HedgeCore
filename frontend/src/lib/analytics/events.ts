/**
 * CTA Event Tracking -- lightweight, privacy-respecting event layer.
 * Logs to localStorage journal; dev-only console trace via logger.
 * Replace trackEvent body when a real analytics provider is added.
 */

import { logger } from "@/lib/logger";

export interface CTAEvent {
  action: string;       // "click_launch_terminal" | "click_contact_sales" | etc.
  label?: string;       // additional context
  variant?: string;     // A/B variant (data-variant from html)
  theme?: string;       // active theme id
  timestamp: string;    // ISO
}

const EVENTS_KEY = "ordr_cta_events";
const MAX_EVENTS = 200;

/** Get current A/B variant from html data attribute */
function getVariant(): string {
  if (typeof document === "undefined") return "unknown";
  return document.documentElement.getAttribute("data-variant") ?? "unknown";
}

function getTheme(): string {
  if (typeof document === "undefined") return "unknown";
  return document.documentElement.getAttribute("data-theme") ?? "unknown";
}

/** Track a CTA event. Replace body with real provider when ready. */
export function trackEvent(action: string, label?: string): void {
  const event: CTAEvent = {
    action,
    label,
    variant: getVariant(),
    theme: getTheme(),
    timestamp: new Date().toISOString(),
  };

  logger.debug("[ORDR Event]", event);

  // Persist to localStorage journal (for later batch upload)
  try {
    const raw = localStorage.getItem(EVENTS_KEY);
    const events: CTAEvent[] = raw ? JSON.parse(raw) : [];
    events.push(event);
    // Keep only last MAX_EVENTS
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
  } catch { /* quota -- ignore */ }
}

/** Flush all stored events (for batch upload). Returns and clears. */
export function flushEvents(): CTAEvent[] {
  try {
    const raw = localStorage.getItem(EVENTS_KEY);
    if (!raw) return [];
    localStorage.removeItem(EVENTS_KEY);
    return JSON.parse(raw);
  } catch { return []; }
}
