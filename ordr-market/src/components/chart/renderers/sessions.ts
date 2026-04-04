/**
 * sessions.ts -- TradingView-style session highlighting
 *
 * Renders semi-transparent vertical bands for major FX trading sessions
 * (Sydney, Tokyo, London, New York). Each bar is tested against UTC-hour
 * windows; contiguous runs of bars within a session form a single band.
 */

import type { Bar } from "../indicators/types";
import type { ChartLayout, Viewport } from "../core/data";
import { indexToX } from "../core/data";

// ── Types ────────────────────────────────────────────────

export interface SessionConfig {
  name: string;
  /** Semi-transparent fill color */
  color: string;
  /** UTC hour when session opens (0-23) */
  startHourUTC: number;
  /** UTC hour when session closes, exclusive (0-23, wraps at midnight) */
  endHourUTC: number;
}

// ── Default sessions ─────────────────────────────────────

export const SESSIONS: SessionConfig[] = [
  { name: "Sydney",   color: "rgba(156,39,176,0.18)",  startHourUTC: 22, endHourUTC: 7  },
  { name: "Tokyo",    color: "rgba(255,152,0,0.22)",   startHourUTC: 0,  endHourUTC: 9  },
  { name: "London",   color: "rgba(33,150,243,0.22)",  startHourUTC: 8,  endHourUTC: 17 },
  { name: "New York", color: "rgba(76,175,80,0.18)",   startHourUTC: 13, endHourUTC: 22 },
];

// ── Helpers ──────────────────────────────────────────────

/**
 * Normalised lookup key for matching enabledSessions strings to config.
 * "New York" -> "newyork", "London" -> "london"
 */
export function normaliseSessionKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "");
}

/**
 * Returns true when `hourUTC` falls inside the [start, end) window,
 * handling midnight wrap (e.g. Sydney 22:00 -> 07:00).
 */
export function isInSession(hourUTC: number, startHourUTC: number, endHourUTC: number): boolean {
  if (startHourUTC === endHourUTC) {
    // Zero-length session
    return false;
  }
  if (startHourUTC < endHourUTC) {
    // Normal range, e.g. London 8-17
    return hourUTC >= startHourUTC && hourUTC < endHourUTC;
  }
  // Wraps midnight, e.g. Sydney 22-7
  return hourUTC >= startHourUTC || hourUTC < endHourUTC;
}

/**
 * Identifies contiguous index ranges where bars belong to a session.
 * Returns an array of [firstIndex, lastIndex] pairs (inclusive).
 */
export function findSessionRanges(
  bars: Bar[],
  startIdx: number,
  endIdx: number,
  session: SessionConfig,
): [number, number][] {
  const ranges: [number, number][] = [];
  let rangeStart = -1;

  for (let i = startIdx; i <= endIdx; i++) {
    const bar = bars[i];
    if (!bar) continue;
    const hourUTC = new Date(bar.t * 1000).getUTCHours();
    const inside = isInSession(hourUTC, session.startHourUTC, session.endHourUTC);

    if (inside && rangeStart === -1) {
      rangeStart = i;
    } else if (!inside && rangeStart !== -1) {
      ranges.push([rangeStart, i - 1]);
      rangeStart = -1;
    }
  }
  // Close any open range
  if (rangeStart !== -1) {
    ranges.push([rangeStart, endIdx]);
  }
  return ranges;
}

// ── Renderer ─────────────────────────────────────────────

/**
 * Draw session highlight bands on the chart.
 *
 * For each enabled session, finds contiguous bar ranges that fall within
 * the session's UTC-hour window and draws a full-height filled rectangle
 * across the main chart area. A tiny muted label is placed at the top-center
 * of each band.
 *
 * @param enabledSessions - Normalised keys, e.g. ["london", "newyork"]
 */
export function drawSessions(
  ctx: CanvasRenderingContext2D,
  bars: Bar[],
  layout: ChartLayout,
  viewport: Viewport,
  enabledSessions: string[],
): void {
  if (enabledSessions.length === 0 || bars.length === 0) return;

  const { mainTop, mainHeight, chartLeft, chartWidth } = layout;
  const { startIndex, endIndex } = viewport;

  // Resolve which sessions to draw
  const enabledSet = new Set(enabledSessions.map((s) => s.toLowerCase().replace(/\s+/g, "")));
  const activeSessions = SESSIONS.filter((s) => enabledSet.has(normaliseSessionKey(s.name)));

  for (const session of activeSessions) {
    const ranges = findSessionRanges(bars, startIndex, endIndex, session);

    for (const [rStart, rEnd] of ranges) {
      // Compute pixel boundaries — extend half a bar-width on each side
      const barSpacing = chartWidth / Math.max(1, endIndex - startIndex);
      const halfBar = barSpacing * 0.5;
      const x1 = Math.max(chartLeft, indexToX(rStart, startIndex, endIndex, chartLeft, chartWidth) - halfBar);
      const x2 = Math.min(chartLeft + chartWidth, indexToX(rEnd, startIndex, endIndex, chartLeft, chartWidth) + halfBar);

      // Fill band
      ctx.fillStyle = session.color;
      ctx.fillRect(x1, mainTop, x2 - x1, mainHeight);

      // Label at top-center of band (tiny, muted)
      const labelX = (x1 + x2) / 2;
      const bandWidth = x2 - x1;
      // Only draw label if band is wide enough to fit text
      if (bandWidth > 40) {
        ctx.font = "bold 8px 'IBM Plex Mono', monospace";
        ctx.fillStyle = session.color.replace(/[\d.]+\)$/, "0.55)");
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(session.name.toUpperCase(), labelX, mainTop + 4);
        // Reset baseline
        ctx.textBaseline = "alphabetic";
      }
    }
  }
}
