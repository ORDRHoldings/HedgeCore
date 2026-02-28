/**
 * econ-calendar.test.ts
 *
 * Unit tests for the /api/market/calendar/econ route logic.
 * Tests the pure buildEconEvents function in isolation.
 */

import { buildEconEvents } from "../../lib/market/transforms";
import type { EconEvent } from "../../lib/market/types";

const makeRawEvent = (overrides: Record<string, unknown> = {}) => ({
  time: "2026-03-01 08:30:00",
  country: "US",
  event: "GDP Growth Rate QoQ",
  impact: "high",
  actual: "2.5",
  estimate: "2.4",
  prev: "2.1",
  ...overrides,
});

// ─── buildEconEvents ──────────────────────────────────────────────────────────

describe("buildEconEvents", () => {
  it("maps a valid raw event to EconEvent shape", () => {
    const raw = [makeRawEvent()];
    const result = buildEconEvents(raw);

    expect(result).toHaveLength(1);
    const ev = result[0];
    expect(ev.time).toBe("2026-03-01 08:30:00");
    expect(ev.country).toBe("US");
    expect(ev.event).toBe("GDP Growth Rate QoQ");
    expect(ev.impact).toBe("high");
    expect(ev.actual).toBe("2.5");
    expect(ev.estimate).toBe("2.4");
    expect(ev.prev).toBe("2.1");
  });

  it("normalises impact values to high / medium / low", () => {
    const cases: Array<[string, EconEvent["impact"]]> = [
      ["high", "high"],
      ["HIGH", "high"],
      ["medium", "medium"],
      ["med", "medium"],
      ["MEDIUM", "medium"],
      ["low", "low"],
      ["LOW", "low"],
      ["", "low"],
      [undefined as unknown as string, "low"],
    ];
    for (const [input, expected] of cases) {
      const [ev] = buildEconEvents([makeRawEvent({ impact: input })]);
      expect(ev.impact).toBe(expected);
    }
  });

  it("filters out items with no event name", () => {
    const raw = [makeRawEvent({ event: undefined }), makeRawEvent({ event: "CPI" })];
    const result = buildEconEvents(raw);
    expect(result).toHaveLength(1);
    expect(result[0].event).toBe("CPI");
  });

  it("filters out items with no time", () => {
    const raw = [makeRawEvent({ time: undefined }), makeRawEvent()];
    const result = buildEconEvents(raw);
    expect(result).toHaveLength(1);
  });

  it("sorts events by time ascending", () => {
    const raw = [
      makeRawEvent({ time: "2026-03-03 14:00:00", event: "B" }),
      makeRawEvent({ time: "2026-03-01 08:30:00", event: "A" }),
      makeRawEvent({ time: "2026-03-05 10:00:00", event: "C" }),
    ];
    const result = buildEconEvents(raw);
    expect(result.map((e: EconEvent) => e.event)).toEqual(["A", "B", "C"]);
  });

  it("returns empty array for empty input", () => {
    expect(buildEconEvents([])).toEqual([]);
  });

  it("handles null actual/estimate/prev as null", () => {
    const raw = [makeRawEvent({ actual: null, estimate: null, prev: null })];
    const result = buildEconEvents(raw);
    expect(result[0].actual).toBeNull();
    expect(result[0].estimate).toBeNull();
    expect(result[0].prev).toBeNull();
  });

  it("handles undefined actual/estimate/prev as null", () => {
    const raw = [makeRawEvent({ actual: undefined, estimate: undefined, prev: undefined })];
    const result = buildEconEvents(raw);
    expect(result[0].actual).toBeNull();
    expect(result[0].estimate).toBeNull();
    expect(result[0].prev).toBeNull();
  });

  it("returns all fields as correct types", () => {
    const [ev] = buildEconEvents([makeRawEvent()]);
    expect(typeof ev.time).toBe("string");
    expect(typeof ev.country).toBe("string");
    expect(typeof ev.event).toBe("string");
    expect(["high", "medium", "low"]).toContain(ev.impact);
  });
});
