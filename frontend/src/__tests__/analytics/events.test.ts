/**
 * @jest-environment jsdom
 *
 * CTA Event Tracking tests.
 * Validates: trackEvent persists to localStorage, getVariant/getTheme read
 * data attributes, flushEvents clears and returns, MAX_EVENTS cap.
 */

import { trackEvent, flushEvents } from "@/lib/analytics/events";
import type { CTAEvent } from "@/lib/analytics/events";

const EVENTS_KEY = "ordr_cta_events";

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
  // Reset data attributes
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-variant");
});

// ── trackEvent ──────────────────────────────────────────────────────────────

describe("trackEvent", () => {
  it("persists an event to localStorage", () => {
    trackEvent("click_launch_terminal", "hero");
    const raw = localStorage.getItem(EVENTS_KEY);
    expect(raw).toBeTruthy();
    const events: CTAEvent[] = JSON.parse(raw!);
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe("click_launch_terminal");
    expect(events[0].label).toBe("hero");
  });

  it("includes ISO timestamp", () => {
    trackEvent("click_test");
    const events: CTAEvent[] = JSON.parse(localStorage.getItem(EVENTS_KEY)!);
    expect(events[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("reads data-variant from document", () => {
    document.documentElement.setAttribute("data-variant", "dark");
    trackEvent("click_test");
    const events: CTAEvent[] = JSON.parse(localStorage.getItem(EVENTS_KEY)!);
    expect(events[0].variant).toBe("dark");
  });

  it("reads data-theme from document", () => {
    document.documentElement.setAttribute("data-theme", "ordr-default");
    trackEvent("click_test");
    const events: CTAEvent[] = JSON.parse(localStorage.getItem(EVENTS_KEY)!);
    expect(events[0].theme).toBe("ordr-default");
  });

  it("falls back to 'unknown' when data attributes are missing", () => {
    trackEvent("click_test");
    const events: CTAEvent[] = JSON.parse(localStorage.getItem(EVENTS_KEY)!);
    expect(events[0].variant).toBe("unknown");
    expect(events[0].theme).toBe("unknown");
  });

  it("appends multiple events", () => {
    trackEvent("click_a");
    trackEvent("click_b");
    trackEvent("click_c");
    const events: CTAEvent[] = JSON.parse(localStorage.getItem(EVENTS_KEY)!);
    expect(events).toHaveLength(3);
    expect(events.map(e => e.action)).toEqual(["click_a", "click_b", "click_c"]);
  });

  it("caps at MAX_EVENTS (200), dropping oldest", () => {
    // Pre-populate with 199 events
    const seed: CTAEvent[] = Array.from({ length: 199 }, (_, i) => ({
      action: `event_${i}`,
      variant: "dark",
      theme: "ordr-default",
      timestamp: new Date().toISOString(),
    }));
    localStorage.setItem(EVENTS_KEY, JSON.stringify(seed));

    // Add 2 more (total 201 -> should be trimmed to 200)
    trackEvent("event_199");
    trackEvent("event_200");

    const events: CTAEvent[] = JSON.parse(localStorage.getItem(EVENTS_KEY)!);
    expect(events.length).toBeLessThanOrEqual(200);
    // Oldest events should have been dropped
    expect(events[events.length - 1].action).toBe("event_200");
  });

  it("handles label being undefined", () => {
    trackEvent("click_no_label");
    const events: CTAEvent[] = JSON.parse(localStorage.getItem(EVENTS_KEY)!);
    expect(events[0].label).toBeUndefined();
  });
});

// ── flushEvents ─────────────────────────────────────────────────────────────

describe("flushEvents", () => {
  it("returns empty array when no events exist", () => {
    expect(flushEvents()).toEqual([]);
  });

  it("returns all events and clears storage", () => {
    trackEvent("click_a");
    trackEvent("click_b");

    const flushed = flushEvents();
    expect(flushed).toHaveLength(2);
    expect(flushed[0].action).toBe("click_a");
    expect(flushed[1].action).toBe("click_b");

    // Storage should be cleared
    expect(localStorage.getItem(EVENTS_KEY)).toBeNull();
  });

  it("subsequent flush returns empty after first flush", () => {
    trackEvent("click_x");
    flushEvents();
    expect(flushEvents()).toEqual([]);
  });
});

// ── CTAEvent interface ──────────────────────────────────────────────────────

describe("CTAEvent shape", () => {
  it("event has all required fields", () => {
    trackEvent("click_get_access", "nav");
    const events: CTAEvent[] = JSON.parse(localStorage.getItem(EVENTS_KEY)!);
    const event = events[0];
    expect(event).toHaveProperty("action");
    expect(event).toHaveProperty("variant");
    expect(event).toHaveProperty("theme");
    expect(event).toHaveProperty("timestamp");
    // label is optional but present when provided
    expect(event).toHaveProperty("label", "nav");
  });
});
