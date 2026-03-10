/**
 * sessions.test.ts -- Tests for session highlighting renderer
 */

import {
  SESSIONS,
  normaliseSessionKey,
  isInSession,
  findSessionRanges,
  drawSessions,
} from "@/components/chart/renderers/sessions";
import type { SessionConfig } from "@/components/chart/renderers/sessions";
import type { Bar } from "@/components/chart/indicators/types";
import type { ChartLayout, Viewport } from "@/components/chart/core/data";
import { computeLayout } from "@/components/chart/core/data";

// ── Helpers ──────────────────────────────────────────────

/** Create a bar at a specific UTC hour */
function barAtHour(index: number, hourUTC: number, dayOffset: number = 0): Bar {
  const d = new Date(Date.UTC(2025, 0, 1 + dayOffset, hourUTC, 0, 0));
  return {
    t: Math.floor(d.getTime() / 1000),
    o: 1.1,
    h: 1.12,
    l: 1.08,
    c: 1.11,
    v: 1000,
  };
}

/** Create bars for a full 24-hour day at 1-hour intervals */
function barsFor24Hours(dayOffset: number = 0): Bar[] {
  return Array.from({ length: 24 }, (_, h) => barAtHour(h, h, dayOffset));
}

function createMockCtx(): CanvasRenderingContext2D {
  return {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    font: "",
    textAlign: "",
    textBaseline: "",
    fillRect: jest.fn(),
    fillText: jest.fn(),
    strokeRect: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
    fill: jest.fn(),
    arc: jest.fn(),
    setLineDash: jest.fn(),
    measureText: jest.fn().mockReturnValue({ width: 40 }),
    quadraticCurveTo: jest.fn(),
    closePath: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
  } as unknown as CanvasRenderingContext2D;
}

// ── SESSIONS constant ────────────────────────────────────

describe("SESSIONS", () => {
  it("exports 4 default session configs", () => {
    expect(SESSIONS).toHaveLength(4);
    expect(SESSIONS.map((s) => s.name)).toEqual(["Sydney", "Tokyo", "London", "New York"]);
  });

  it("each session has valid hour ranges", () => {
    for (const s of SESSIONS) {
      expect(s.startHourUTC).toBeGreaterThanOrEqual(0);
      expect(s.startHourUTC).toBeLessThan(24);
      expect(s.endHourUTC).toBeGreaterThanOrEqual(0);
      expect(s.endHourUTC).toBeLessThan(24);
      expect(s.color).toMatch(/^rgba\(/);
    }
  });
});

// ── normaliseSessionKey ──────────────────────────────────

describe("normaliseSessionKey", () => {
  it("lowercases and removes spaces", () => {
    expect(normaliseSessionKey("New York")).toBe("newyork");
    expect(normaliseSessionKey("London")).toBe("london");
    expect(normaliseSessionKey("TOKYO")).toBe("tokyo");
    expect(normaliseSessionKey("  Syd ney ")).toBe("sydney");
  });
});

// ── isInSession ──────────────────────────────────────────

describe("isInSession", () => {
  it("detects hours within a normal (non-wrapping) range", () => {
    // London: 8-17
    expect(isInSession(8, 8, 17)).toBe(true);
    expect(isInSession(16, 8, 17)).toBe(true);
    expect(isInSession(17, 8, 17)).toBe(false);
    expect(isInSession(7, 8, 17)).toBe(false);
  });

  it("detects hours within a midnight-wrapping range", () => {
    // Sydney: 22-7
    expect(isInSession(22, 22, 7)).toBe(true);
    expect(isInSession(23, 22, 7)).toBe(true);
    expect(isInSession(0, 22, 7)).toBe(true);
    expect(isInSession(6, 22, 7)).toBe(true);
    expect(isInSession(7, 22, 7)).toBe(false);
    expect(isInSession(21, 22, 7)).toBe(false);
  });

  it("handles edge case: start==end means empty session", () => {
    // When start==end, normal range: hourUTC >= 5 && hourUTC < 5 is always false
    expect(isInSession(5, 5, 5)).toBe(false);
    expect(isInSession(4, 5, 5)).toBe(false);
  });
});

// ── findSessionRanges ────────────────────────────────────

describe("findSessionRanges", () => {
  it("finds contiguous London session bars in a 24h day", () => {
    const bars = barsFor24Hours();
    const london = SESSIONS.find((s) => s.name === "London")!;
    const ranges = findSessionRanges(bars, 0, 23, london);

    // London: hours 8-16 (endHourUTC=17 is exclusive)
    expect(ranges.length).toBe(1);
    expect(ranges[0][0]).toBe(8); // bar index 8 = hour 8
    expect(ranges[0][1]).toBe(16); // bar index 16 = hour 16
  });

  it("finds contiguous Sydney session bars (midnight wrap)", () => {
    const bars = barsFor24Hours();
    const sydney = SESSIONS.find((s) => s.name === "Sydney")!;
    const ranges = findSessionRanges(bars, 0, 23, sydney);

    // Sydney: 22-7 -> bars 0-6 and 22-23 (two ranges within one day)
    expect(ranges.length).toBe(2);
    expect(ranges[0]).toEqual([0, 6]); // hours 0-6
    expect(ranges[1]).toEqual([22, 23]); // hours 22-23
  });

  it("returns empty array when no bars match", () => {
    const bars = barsFor24Hours();
    const custom: SessionConfig = {
      name: "Test",
      color: "rgba(0,0,0,0.1)",
      startHourUTC: 3,
      endHourUTC: 4,
    };
    // Only hour 3 is in range
    const ranges = findSessionRanges(bars, 5, 10, custom);
    expect(ranges.length).toBe(0);
  });

  it("handles single-bar range", () => {
    const bars = barsFor24Hours();
    const london = SESSIONS.find((s) => s.name === "London")!;
    const ranges = findSessionRanges(bars, 10, 10, london);
    // Hour 10 is in London session
    expect(ranges.length).toBe(1);
    expect(ranges[0]).toEqual([10, 10]);
  });
});

// ── drawSessions ─────────────────────────────────────────

describe("drawSessions", () => {
  const bars = barsFor24Hours();
  const layout: ChartLayout = computeLayout(1200, 600, 0);
  const viewport: Viewport = {
    startIndex: 0,
    endIndex: 23,
    priceMin: 1.08,
    priceMax: 1.12,
  };

  it("does nothing when enabledSessions is empty", () => {
    const ctx = createMockCtx();
    drawSessions(ctx, bars, layout, viewport, []);
    expect(ctx.fillRect).not.toHaveBeenCalled();
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it("does nothing when bars array is empty", () => {
    const ctx = createMockCtx();
    drawSessions(ctx, [], layout, viewport, ["london"]);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it("draws fillRect for enabled London session", () => {
    const ctx = createMockCtx();
    drawSessions(ctx, bars, layout, viewport, ["london"]);
    // Should have drawn at least one fillRect
    expect(ctx.fillRect).toHaveBeenCalled();
  });

  it("draws labels for wide-enough bands", () => {
    const ctx = createMockCtx();
    drawSessions(ctx, bars, layout, viewport, ["london"]);
    // London occupies 9 hours out of 24 -- should be wide enough for a label
    expect(ctx.fillText).toHaveBeenCalled();
    const calls = (ctx.fillText as jest.Mock).mock.calls;
    const labelCall = calls.find((c: string[]) => typeof c[0] === "string" && c[0].includes("LONDON"));
    expect(labelCall).toBeDefined();
  });

  it("handles multiple enabled sessions", () => {
    const ctx = createMockCtx();
    drawSessions(ctx, bars, layout, viewport, ["london", "newyork", "tokyo"]);
    // Should have drawn multiple fillRects (at least 3 bands total)
    const fillRectCount = (ctx.fillRect as jest.Mock).mock.calls.length;
    expect(fillRectCount).toBeGreaterThanOrEqual(3);
  });

  it("ignores unknown session names", () => {
    const ctx = createMockCtx();
    drawSessions(ctx, bars, layout, viewport, ["mars"]);
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
});
