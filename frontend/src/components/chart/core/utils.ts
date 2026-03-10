/**
 * utils.ts -- Chart utility functions
 *
 * Screenshot export, fullscreen toggle, bar countdown,
 * market session detection, volume formatting.
 */

/* ═══════════════════════════════════════════════════════
   Screenshot Export
   ═══════════════════════════════════════════════════════ */

/**
 * Export canvas as PNG image download.
 * Adds a small "ORDR Terminal" watermark in bottom-right before export.
 */
export function exportScreenshot(canvas: HTMLCanvasElement, symbol: string): void {
  const w = canvas.width;
  const h = canvas.height;

  // Clone canvas so the live chart is not modified
  const clone = document.createElement("canvas");
  clone.width = w;
  clone.height = h;
  const ctx = clone.getContext("2d");
  if (!ctx) return;

  ctx.drawImage(canvas, 0, 0);

  // Watermark
  const dpr = window.devicePixelRatio || 1;
  const fontSize = Math.round(10 * dpr);
  ctx.font = `${fontSize}px 'IBM Plex Mono', monospace`;
  ctx.fillStyle = "rgba(120,123,134,0.5)";
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";

  const now = new Date();
  const ts = now.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  ctx.fillText(`ORDR Terminal  ${ts}`, w - 10 * dpr, h - 6 * dpr);

  // Trigger download
  clone.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    a.download = `ORDR_${symbol}_${stamp}.png`;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

/* ═══════════════════════════════════════════════════════
   Fullscreen Toggle
   ═══════════════════════════════════════════════════════ */

/**
 * Toggle fullscreen mode on an element.
 */
export function toggleFullscreen(element: HTMLElement): void {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    element.requestFullscreen();
  }
}

/* ═══════════════════════════════════════════════════════
   Bar Countdown
   ═══════════════════════════════════════════════════════ */

/** Parse an interval string to milliseconds. */
export function intervalToMs(interval: string): number {
  const map: Record<string, number> = {
    "1min": 60_000,
    "3min": 180_000,
    "5min": 300_000,
    "15min": 900_000,
    "30min": 1_800_000,
    "1h": 3_600_000,
    "4h": 14_400_000,
    "1day": 86_400_000,
    "1week": 604_800_000,
    "1month": 2_592_000_000,
  };
  return map[interval] ?? 0;
}

/**
 * Calculate time remaining until next bar close.
 * Returns formatted string like "2h 34m" or "12m 45s" or "45s".
 * `lastBarTimestamp` is in SECONDS (unix epoch).
 */
export function getBarCountdown(interval: string, lastBarTimestamp: number): string {
  const ms = intervalToMs(interval);
  if (ms === 0 || lastBarTimestamp === 0) return "--:--";

  const nextBarMs = (lastBarTimestamp * 1000) + ms;
  const remainingMs = nextBarMs - Date.now();

  if (remainingMs <= 0) return "00s";

  const totalSec = Math.ceil(remainingMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

/* ═══════════════════════════════════════════════════════
   Market Status
   ═══════════════════════════════════════════════════════ */

export type MarketSession = "london" | "newyork" | "tokyo" | "sydney" | "closed";

/** Session time ranges in ET (Eastern Time) hours (0-23). */
const SESSION_RANGES: { session: MarketSession; startET: number; endET: number }[] = [
  // Sydney: 5pm-2am ET  (17-26 i.e. wraps midnight)
  { session: "sydney", startET: 17, endET: 26 },
  // Tokyo: 7pm-4am ET   (19-28 i.e. wraps midnight)
  { session: "tokyo", startET: 19, endET: 28 },
  // London: 3am-12pm ET
  { session: "london", startET: 3, endET: 12 },
  // New York: 8am-5pm ET
  { session: "newyork", startET: 8, endET: 17 },
];

/**
 * Get current UTC offset for US Eastern Time.
 * Returns -4 during DST (Mar-Nov), -5 during EST (Nov-Mar).
 */
function getETOffset(now: Date): number {
  // DST: second Sunday of March to first Sunday of November
  const year = now.getUTCFullYear();

  // Second Sunday of March
  const mar1 = new Date(Date.UTC(year, 2, 1));
  const marSun2 = 8 + ((7 - mar1.getUTCDay()) % 7);
  const dstStart = Date.UTC(year, 2, marSun2, 7); // 2am ET = 7am UTC

  // First Sunday of November
  const nov1 = new Date(Date.UTC(year, 10, 1));
  const novSun1 = 1 + ((7 - nov1.getUTCDay()) % 7);
  const dstEnd = Date.UTC(year, 10, novSun1, 6); // 2am ET = 6am UTC

  const ts = now.getTime();
  return ts >= dstStart && ts < dstEnd ? -4 : -5;
}

/**
 * Determine current FX market session(s).
 * FX is 24/5 (Sunday 5pm ET to Friday 5pm ET).
 */
export function getMarketStatus(now?: Date): {
  sessions: MarketSession[];
  isOpen: boolean;
  label: string;
} {
  const d = now ?? new Date();
  const offset = getETOffset(d);
  const etHour = (d.getUTCHours() + offset + 24) % 24;
  const etMinute = d.getUTCMinutes();
  const etFrac = etHour + etMinute / 60;

  // Day of week in ET
  let etDay = d.getUTCDay();
  const utcHour = d.getUTCHours();
  // If UTC day shifted from ET perspective (e.g. UTC is next day but ET is still previous)
  if (utcHour + offset < 0) etDay = (etDay + 6) % 7;
  if (utcHour + offset >= 24) etDay = (etDay + 1) % 7;

  // FX market closed: Saturday all day, Sunday before 5pm ET, Friday after 5pm ET
  const closed =
    etDay === 6 || // Saturday
    (etDay === 0 && etFrac < 17) || // Sunday before 5pm
    (etDay === 5 && etFrac >= 17);  // Friday after 5pm

  if (closed) {
    return { sessions: ["closed"], isOpen: false, label: "Closed" };
  }

  // Determine active sessions
  const active: MarketSession[] = [];
  for (const { session, startET, endET } of SESSION_RANGES) {
    // Handle wrap-around (sessions that cross midnight)
    // etFrac is 0-24, but some sessions use >24 to represent next-day hours
    const inRange =
      (etFrac >= startET && etFrac < endET) ||
      (etFrac + 24 >= startET && etFrac + 24 < endET);
    if (inRange) active.push(session);
  }

  if (active.length === 0) {
    // Edge case: should not happen during open hours, but fallback
    return { sessions: [], isOpen: true, label: "Open" };
  }

  const labelMap: Record<MarketSession, string> = {
    london: "London",
    newyork: "New York",
    tokyo: "Tokyo",
    sydney: "Sydney",
    closed: "Closed",
  };
  const label = active.map((s) => labelMap[s]).join(" \u00B7 ");
  return { sessions: active, isOpen: true, label };
}

/**
 * Get session color for rendering.
 */
export function getSessionColor(session: MarketSession): string {
  switch (session) {
    case "london": return "#2196F3";
    case "newyork": return "#4CAF50";
    case "tokyo": return "#FF9800";
    case "sydney": return "#9C27B0";
    case "closed": return "#545B69";
  }
}

/* ═══════════════════════════════════════════════════════
   Volume Formatter
   ═══════════════════════════════════════════════════════ */

/**
 * Format volume with K/M/B suffixes.
 */
export function formatVolume(vol: number): string {
  if (vol >= 1e9) return (vol / 1e9).toFixed(1) + "B";
  if (vol >= 1e6) return (vol / 1e6).toFixed(1) + "M";
  if (vol >= 1e3) return (vol / 1e3).toFixed(1) + "K";
  return vol.toFixed(0);
}
