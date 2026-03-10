/**
 * chartUtils.test.ts -- Tests for chart utility functions
 *
 * Covers: intervalToMs, getBarCountdown, getMarketStatus,
 *         getSessionColor, formatVolume, toggleFullscreen, exportScreenshot
 *
 * Test environment: node (no jsdom). DOM-dependent tests use manual mocks.
 */

import {
  intervalToMs,
  getBarCountdown,
  getMarketStatus,
  getSessionColor,
  formatVolume,
  toggleFullscreen,
  exportScreenshot,
} from "@/components/chart/core/utils";
import type { MarketSession } from "@/components/chart/core/utils";

/* ============================================================
   intervalToMs
   ============================================================ */

describe("intervalToMs", () => {
  it("returns correct ms for minute intervals", () => {
    expect(intervalToMs("1min")).toBe(60_000);
    expect(intervalToMs("3min")).toBe(180_000);
    expect(intervalToMs("5min")).toBe(300_000);
    expect(intervalToMs("15min")).toBe(900_000);
    expect(intervalToMs("30min")).toBe(1_800_000);
  });

  it("returns correct ms for hour intervals", () => {
    expect(intervalToMs("1h")).toBe(3_600_000);
    expect(intervalToMs("4h")).toBe(14_400_000);
  });

  it("returns correct ms for day/week/month intervals", () => {
    expect(intervalToMs("1day")).toBe(86_400_000);
    expect(intervalToMs("1week")).toBe(604_800_000);
    expect(intervalToMs("1month")).toBe(2_592_000_000);
  });

  it("returns 0 for unknown interval", () => {
    expect(intervalToMs("unknown")).toBe(0);
    expect(intervalToMs("")).toBe(0);
    expect(intervalToMs("2h")).toBe(0);
  });
});

/* ============================================================
   getBarCountdown
   ============================================================ */

describe("getBarCountdown", () => {
  it('returns "--:--" for unknown interval', () => {
    expect(getBarCountdown("bad", 1000000)).toBe("--:--");
  });

  it('returns "--:--" for zero timestamp', () => {
    expect(getBarCountdown("1h", 0)).toBe("--:--");
  });

  it('returns "00s" when bar time has passed', () => {
    const pastTs = Math.floor(Date.now() / 1000) - 7200; // 2 hours ago
    expect(getBarCountdown("1h", pastTs)).toBe("00s");
  });

  it("returns formatted countdown with hours and minutes", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const result = getBarCountdown("4h", nowSec);
    expect(result).toMatch(/\dh \d{2}m/);
  });

  it("returns formatted countdown with minutes and seconds", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const result = getBarCountdown("5min", nowSec);
    expect(result).toMatch(/\dm \d{2}s/);
  });

  it("returns seconds-only for very short remaining", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const ts = nowSec - (60_000 - 30_000) / 1000; // 30s remaining on 1min bar
    const result = getBarCountdown("1min", ts);
    expect(result).toMatch(/\d+s/);
  });
});

/* ============================================================
   getMarketStatus
   ============================================================ */

describe("getMarketStatus", () => {
  it("reports closed on Saturday", () => {
    // 2026-03-07 is Saturday, 12:00 UTC = 7:00 ET
    const sat = new Date(Date.UTC(2026, 2, 7, 12, 0, 0));
    const result = getMarketStatus(sat);
    expect(result.isOpen).toBe(false);
    expect(result.sessions).toContain("closed");
    expect(result.label).toBe("Closed");
  });

  it("reports closed on early Sunday", () => {
    // Sunday 2026-03-08 at 15:00 UTC = 11:00 ET (before 5pm ET)
    const sunEarly = new Date(Date.UTC(2026, 2, 8, 15, 0, 0));
    const result = getMarketStatus(sunEarly);
    expect(result.isOpen).toBe(false);
  });

  it("reports open on Sunday after 5pm ET (10pm UTC)", () => {
    const sunEvening = new Date(Date.UTC(2026, 2, 8, 22, 30, 0));
    const result = getMarketStatus(sunEvening);
    expect(result.isOpen).toBe(true);
  });

  it("reports closed on Friday after 5pm ET", () => {
    // Friday 2026-03-06 at 23:00 UTC = 18:00 ET (after 5pm)
    const friEvening = new Date(Date.UTC(2026, 2, 6, 23, 0, 0));
    const result = getMarketStatus(friEvening);
    expect(result.isOpen).toBe(false);
  });

  it("reports London session during London hours on a weekday", () => {
    // Wednesday 2026-03-04 at 08:00 UTC = 3:00 ET (London open 3-12)
    const wed = new Date(Date.UTC(2026, 2, 4, 8, 0, 0));
    const result = getMarketStatus(wed);
    expect(result.isOpen).toBe(true);
    expect(result.sessions).toContain("london");
  });

  it("reports New York session during NY hours on a weekday", () => {
    // Wednesday 2026-03-04 at 18:00 UTC = 13:00 ET
    const wed = new Date(Date.UTC(2026, 2, 4, 18, 0, 0));
    const result = getMarketStatus(wed);
    expect(result.isOpen).toBe(true);
    expect(result.sessions).toContain("newyork");
  });

  it("reports overlapping sessions (London + NY)", () => {
    // Wednesday 2026-03-04 at 13:00 UTC = 8:00 ET (London 3-12 + NY 8-17)
    const wed = new Date(Date.UTC(2026, 2, 4, 13, 0, 0));
    const result = getMarketStatus(wed);
    expect(result.isOpen).toBe(true);
    expect(result.sessions).toContain("london");
    expect(result.sessions).toContain("newyork");
    expect(result.label).toContain("\u00B7");
  });

  it("reports Tokyo session during Tokyo hours", () => {
    // Wednesday 2026-03-04 at 01:00 UTC = 20:00 previous day ET (Tue)
    const tue = new Date(Date.UTC(2026, 2, 4, 1, 0, 0));
    const result = getMarketStatus(tue);
    expect(result.isOpen).toBe(true);
    expect(result.sessions).toContain("tokyo");
  });

  it("returns an array of sessions", () => {
    const now = new Date(Date.UTC(2026, 2, 4, 10, 0, 0));
    const result = getMarketStatus(now);
    expect(Array.isArray(result.sessions)).toBe(true);
  });

  it("uses current time when no argument is given", () => {
    const result = getMarketStatus();
    expect(typeof result.isOpen).toBe("boolean");
    expect(typeof result.label).toBe("string");
    expect(Array.isArray(result.sessions)).toBe(true);
  });

  it("reports Sydney session during Sydney hours", () => {
    // Wednesday 2026-03-04 at 22:30 UTC = 17:30 ET (Sydney 17-26 ET)
    const wed = new Date(Date.UTC(2026, 2, 4, 22, 30, 0));
    const result = getMarketStatus(wed);
    expect(result.isOpen).toBe(true);
    expect(result.sessions).toContain("sydney");
  });
});

/* ============================================================
   getSessionColor
   ============================================================ */

describe("getSessionColor", () => {
  it("returns correct color for each session", () => {
    expect(getSessionColor("london")).toBe("#2196F3");
    expect(getSessionColor("newyork")).toBe("#4CAF50");
    expect(getSessionColor("tokyo")).toBe("#FF9800");
    expect(getSessionColor("sydney")).toBe("#9C27B0");
    expect(getSessionColor("closed")).toBe("#545B69");
  });

  it("returns a valid hex color string for all sessions", () => {
    const sessions: MarketSession[] = ["london", "newyork", "tokyo", "sydney", "closed"];
    for (const s of sessions) {
      expect(getSessionColor(s)).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

/* ============================================================
   formatVolume
   ============================================================ */

describe("formatVolume", () => {
  it("formats billions", () => {
    expect(formatVolume(1_500_000_000)).toBe("1.5B");
    expect(formatVolume(3_000_000_000)).toBe("3.0B");
  });

  it("formats millions", () => {
    expect(formatVolume(2_500_000)).toBe("2.5M");
    expect(formatVolume(10_000_000)).toBe("10.0M");
  });

  it("formats thousands", () => {
    expect(formatVolume(15_000)).toBe("15.0K");
    expect(formatVolume(1_234)).toBe("1.2K");
  });

  it("formats small numbers without suffix", () => {
    expect(formatVolume(999)).toBe("999");
    expect(formatVolume(0)).toBe("0");
    expect(formatVolume(42)).toBe("42");
  });

  it("handles boundary values", () => {
    expect(formatVolume(1000)).toBe("1.0K");
    expect(formatVolume(1_000_000)).toBe("1.0M");
    expect(formatVolume(1_000_000_000)).toBe("1.0B");
  });

  it("handles fractional volumes below 1000", () => {
    expect(formatVolume(500.7)).toBe("501");
  });
});

/* ============================================================
   toggleFullscreen (DOM-dependent, manual mocks)
   ============================================================ */

describe("toggleFullscreen", () => {
  it("calls requestFullscreen when not in fullscreen", () => {
    // Provide minimal global.document mock for node environment
    const origDoc = (global as Record<string, unknown>).document;
    const mockEl = { requestFullscreen: jest.fn().mockResolvedValue(undefined) };
    (global as Record<string, unknown>).document = { fullscreenElement: null };

    toggleFullscreen(mockEl as unknown as HTMLElement);
    expect(mockEl.requestFullscreen).toHaveBeenCalled();

    (global as Record<string, unknown>).document = origDoc;
  });

  it("calls exitFullscreen when already in fullscreen", () => {
    const origDoc = (global as Record<string, unknown>).document;
    const mockEl = {};
    const mockExitFullscreen = jest.fn().mockResolvedValue(undefined);
    (global as Record<string, unknown>).document = {
      fullscreenElement: mockEl,
      exitFullscreen: mockExitFullscreen,
    };

    toggleFullscreen(mockEl as unknown as HTMLElement);
    expect(mockExitFullscreen).toHaveBeenCalled();

    (global as Record<string, unknown>).document = origDoc;
  });
});

/* ============================================================
   exportScreenshot (DOM-dependent, manual mocks)
   ============================================================ */

describe("exportScreenshot", () => {
  let origDoc: unknown;
  let origURL: unknown;
  let origWindow: unknown;

  beforeEach(() => {
    origDoc = (global as Record<string, unknown>).document;
    origURL = (global as Record<string, unknown>).URL;
    origWindow = (global as Record<string, unknown>).window;
  });

  afterEach(() => {
    (global as Record<string, unknown>).document = origDoc;
    (global as Record<string, unknown>).URL = origURL;
    (global as Record<string, unknown>).window = origWindow;
  });

  it("creates a clone canvas, adds watermark, and triggers download", () => {
    const mockCtx = {
      drawImage: jest.fn(),
      fillText: jest.fn(),
      font: "",
      fillStyle: "",
      textAlign: "",
      textBaseline: "",
    };

    const mockToBlob = jest.fn((cb: (blob: Blob | null) => void) => {
      cb(new Blob(["fake"], { type: "image/png" }));
    });

    const mockCloneCanvas = {
      width: 0,
      height: 0,
      getContext: jest.fn().mockReturnValue(mockCtx),
      toBlob: mockToBlob,
    };

    const mockAnchor = {
      download: "",
      href: "",
      click: jest.fn(),
    };

    (global as Record<string, unknown>).document = {
      createElement: jest.fn((tag: string) => {
        if (tag === "canvas") return mockCloneCanvas;
        if (tag === "a") return mockAnchor;
        return {};
      }),
    };

    (global as Record<string, unknown>).URL = {
      createObjectURL: jest.fn().mockReturnValue("blob:fake"),
      revokeObjectURL: jest.fn(),
    };

    (global as Record<string, unknown>).window = {
      devicePixelRatio: 1,
    };

    // Source canvas mock
    const sourceCanvas = { width: 800, height: 600 };

    exportScreenshot(sourceCanvas as unknown as HTMLCanvasElement, "EURUSD");

    expect(mockCloneCanvas.getContext).toHaveBeenCalledWith("2d");
    expect(mockCtx.drawImage).toHaveBeenCalledWith(sourceCanvas, 0, 0);
    expect(mockCtx.fillText).toHaveBeenCalled();
    // Verify watermark text contains "ORDR Terminal"
    const textArg = mockCtx.fillText.mock.calls[0][0] as string;
    expect(textArg).toContain("ORDR Terminal");
    expect(mockToBlob).toHaveBeenCalled();
    // Verify download was triggered
    expect(mockAnchor.click).toHaveBeenCalled();
    expect(mockAnchor.download).toContain("ORDR_EURUSD_");
  });

  it("does nothing when getContext returns null", () => {
    const mockCloneCanvas = {
      width: 0,
      height: 0,
      getContext: jest.fn().mockReturnValue(null),
      toBlob: jest.fn(),
    };

    (global as Record<string, unknown>).document = {
      createElement: jest.fn().mockReturnValue(mockCloneCanvas),
    };

    (global as Record<string, unknown>).window = {
      devicePixelRatio: 1,
    };

    const sourceCanvas = { width: 100, height: 100 };

    // Should not throw
    expect(() => exportScreenshot(sourceCanvas as unknown as HTMLCanvasElement, "GBPUSD")).not.toThrow();
    // toBlob should NOT be called since ctx was null
    expect(mockCloneCanvas.toBlob).not.toHaveBeenCalled();
  });
});
