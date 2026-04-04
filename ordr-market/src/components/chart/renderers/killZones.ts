/**
 * killZones.ts — ICT Kill Zone vertical bands
 *
 * Renders semi-transparent vertical bands for the three canonical ICT Kill Zones
 * (UTC times):
 *   London KZ  : 07:00 – 09:00  (02:00 – 04:00 EST)
 *   NY AM KZ   : 12:00 – 14:00  (07:00 – 09:00 EST)
 *   NY PM KZ   : 19:00 – 20:00  (14:00 – 15:00 EST)
 *
 * Only active for intraday timeframes (avg bar interval < 4 h).
 */

import type { Bar } from "../indicators/types";
import type { ChartLayout, Viewport } from "../core/data";
import { indexToX } from "../core/data";

// ── Kill Zone definitions ─────────────────────────────────────────────────────

type KillZone = "london" | "nyam" | "nypm";

const KZ_STYLE: Record<KillZone, { fill: string; label: string; labelColor: string }> = {
  london: { fill: "rgba(33,150,243,0.10)",  label: "LKZ",  labelColor: "rgba(33,150,243,0.70)"  },
  nyam:   { fill: "rgba(76,175,80,0.10)",   label: "NYKZ", labelColor: "rgba(76,175,80,0.70)"   },
  nypm:   { fill: "rgba(255,152,0,0.10)",   label: "PM",   labelColor: "rgba(255,152,0,0.70)"   },
};

function killZoneForHour(h: number): KillZone | null {
  if (h >= 7  && h < 9)  return "london";
  if (h >= 12 && h < 14) return "nyam";
  if (h >= 19 && h < 20) return "nypm";
  return null;
}

// ── Renderer ──────────────────────────────────────────────────────────────────

/**
 * Draw ICT Kill Zone bands behind the candles.
 * Bands span the full chart height (price-agnostic — time-only).
 */
export function drawKillZones(
  ctx: CanvasRenderingContext2D,
  bars: Bar[],
  layout: ChartLayout,
  viewport: Viewport,
): void {
  if (bars.length < 2) return;

  // Only intraday bars (< 4 h average interval)
  const avgMs = (bars[bars.length - 1].t - bars[0].t) / Math.max(1, bars.length - 1);
  if (avgMs >= 4 * 3_600_000) return;

  const { startIndex, endIndex } = viewport;
  const { chartLeft, chartWidth, mainTop, mainHeight } = layout;
  const barPx  = chartWidth / Math.max(1, endIndex - startIndex);
  const halfPx = Math.max(1, barPx * 0.5);

  // Accumulate kill zone bar ranges grouped by (zone, date)
  interface KZAcc { zone: KillZone; first: number; last: number }
  const acc = new Map<string, KZAcc>();

  const iStart = Math.max(0, Math.floor(startIndex) - 1);
  const iEnd   = Math.min(bars.length - 1, Math.ceil(endIndex) + 1);

  for (let i = iStart; i <= iEnd; i++) {
    const d    = new Date(bars[i].t);
    const zone = killZoneForHour(d.getUTCHours());
    if (!zone) continue;

    const key = `${zone}_${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
    const ex  = acc.get(key);
    if (!ex) {
      acc.set(key, { zone, first: i, last: i });
    } else {
      ex.last = i;
    }
  }

  if (acc.size === 0) return;

  ctx.save();
  ctx.font         = 'bold 8px "IBM Plex Mono", monospace';
  ctx.textBaseline = "top";
  ctx.textAlign    = "left";

  for (const { zone, first, last } of acc.values()) {
    const style = KZ_STYLE[zone];
    const x1 = indexToX(first, startIndex, endIndex, chartLeft, chartWidth) - halfPx;
    const x2 = indexToX(last,  startIndex, endIndex, chartLeft, chartWidth) + halfPx;

    const rx1 = Math.max(chartLeft, x1);
    const rx2 = Math.min(chartLeft + chartWidth, x2);
    if (rx2 <= rx1) continue;

    ctx.fillStyle = style.fill;
    ctx.fillRect(rx1, mainTop, rx2 - rx1, mainHeight);

    ctx.fillStyle = style.labelColor;
    ctx.fillText(style.label, rx1 + 3, mainTop + 4);
  }

  ctx.restore();
}
