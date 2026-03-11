"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, X, Calendar } from "lucide-react";
import type { UserContext } from "@/lib/authContext";
import type { EconEvent } from "@/lib/market/types";

const S = {
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  bgPanel:   "var(--bg-panel)",
  bgDeep:    "var(--bg-deep)",
  bgSub:     "var(--bg-sub)",
  rim:       "var(--border-rim)",
  soft:      "var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber,#F59E0B)",
  green:     "var(--status-pass,#34d399)",
  red:       "var(--accent-red,#f87171)",
} as const;

const POLL_MS = 900_000;

const IMPACT_STYLES: Record<string, { color: string; label: string }> = {
  high:   { color: "var(--accent-red,#f87171)",       label: "HIGH"   },
  medium: { color: "var(--accent-amber,#F59E0B)",      label: "MED"    },
  low:    { color: "var(--text-tertiary)",             label: "LOW"    },
};

function groupByDay(events: EconEvent[]): [string, EconEvent[]][] {
  const map = new Map<string, EconEvent[]>();
  for (const e of events) {
    const day = e.time.slice(0, 10);
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(e);
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
}

function formatDay(iso: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  if (iso === today) return "TODAY";
  if (iso === tomorrow) return "TOMORROW";
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
}

function formatTime(isoLike: string): string {
  const parts = isoLike.split(" ");
  if (parts.length >= 2) return parts[1].slice(0, 5);
  return isoLike.slice(11, 16) || "—";
}

interface Props {
  token: string;
  user: UserContext;
  onRemove?: () => void;
}

export default function EconCalendarWidget({ onRemove }: Props) {
  const [events, setEvents] = useState<EconEvent[]>([]);
  const [lastFetch, setLastFetch] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCalendar = useCallback(async () => {
    setFetching(true);
    setError(null);
    try {
      const res = await fetch("/api/market/calendar/econ");
      const json = await res.json() as { events?: EconEvent[]; error?: string };
      if (json.error && (!json.events || json.events.length === 0)) {
        setError(json.error);
      } else {
        setEvents(json.events ?? []);
        setLastFetch(new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchCalendar();
    const id = setInterval(fetchCalendar, POLL_MS);
    return () => clearInterval(id);
  }, [fetchCalendar]);

  const grouped = groupByDay(events);

  return (
    <div style={{ background: S.bgPanel, border: `1px solid ${S.rim}`, borderRadius: 6, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 200 }}>
      {/* Header */}
      <div className="widget-drag-handle" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${S.rim}`, background: S.bgDeep, flexShrink: 0, cursor: "grab" }}>
        <span aria-hidden="true" style={{ fontFamily: "monospace", fontSize: 13, color: S.tertiary, cursor: "grab", flexShrink: 0, lineHeight: 1, userSelect: "none" }}>⠿</span>
        <Calendar size={12} color={S.cyan} />
        <span style={{ fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: S.primary, flex: 1, textTransform: "uppercase" }}>
          Economic Calendar
        </span>
        {lastFetch && (
          <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>{lastFetch}</span>
        )}
        <button onClick={fetchCalendar} disabled={fetching} title="Refresh" style={{ background: "transparent", border: "none", cursor: fetching ? "default" : "pointer", padding: 2, display: "flex", alignItems: "center", opacity: fetching ? 0.4 : 1 }}>
          <RefreshCw size={11} color={S.tertiary} />
        </button>
        {onRemove && (
          <button onClick={onRemove} title="Remove widget" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}>
            <X size={12} color={S.tertiary} />
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {fetching && events.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
            LOADING…
          </div>
        ) : error ? (
          <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.red }}>ERROR</span>
            <span style={{ fontFamily: S.fontUI, fontSize: 12, color: S.tertiary, textAlign: "center" }}>{error}</span>
            <button onClick={fetchCalendar} style={{ fontFamily: S.fontMono, fontSize: 12, color: S.cyan, background: "transparent", border: `1px solid ${S.cyan}`, padding: "3px 10px", cursor: "pointer" }}>RETRY</button>
          </div>
        ) : grouped.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center" }}>
            <span style={{ fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>NO EVENTS IN NEXT 7 DAYS</span>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: S.bgSub }}>
                {["Time", "Country", "Event", "Impact", "Actual", "Est", "Prev"].map((h) => (
                  <th key={h} style={{
                    fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
                    color: S.tertiary, textTransform: "uppercase", textAlign: "left",
                    padding: "5px 8px", borderBottom: `1px solid ${S.rim}`, whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map(([day, dayEvents]) => (
                <>
                  {/* Day separator */}
                  <tr key={`hdr-${day}`} style={{ background: `color-mix(in srgb, ${S.bgSub} 70%, transparent)` }}>
                    <td colSpan={7} style={{
                      padding: "5px 8px",
                      fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em",
                      color: S.cyan,
                      borderBottom: `1px solid ${S.soft}`,
                    }}>
                      {formatDay(day)}
                    </td>
                  </tr>
                  {dayEvents.map((ev, idx) => {
                    const imp = IMPACT_STYLES[ev.impact] ?? IMPACT_STYLES.low;
                    return (
                      <tr key={`${day}-${idx}`} style={{
                        borderBottom: `1px solid ${S.soft}`,
                        background: idx % 2 === 0 ? "transparent" : `color-mix(in srgb, ${S.bgSub} 30%, transparent)`,
                      }}>
                        <td style={{ padding: "6px 8px", fontFamily: S.fontMono, fontSize: 12, color: S.secondary, whiteSpace: "nowrap" }}>
                          {formatTime(ev.time)}
                        </td>
                        <td style={{ padding: "6px 8px", fontFamily: S.fontMono, fontSize: 12, fontWeight: 700, color: S.primary, whiteSpace: "nowrap" }}>
                          {ev.country}
                        </td>
                        <td style={{ padding: "6px 8px", fontFamily: S.fontUI, fontSize: 12, color: S.primary, maxWidth: 180 }}>
                          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {ev.event}
                          </span>
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <span style={{
                            fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                            color: imp.color,
                            background: `color-mix(in srgb, ${imp.color} 12%, transparent)`,
                            border: `1px solid color-mix(in srgb, ${imp.color} 30%, transparent)`,
                            padding: "1px 4px", borderRadius: 2,
                          }}>{imp.label}</span>
                        </td>
                        <td style={{ padding: "6px 8px", fontFamily: S.fontMono, fontSize: 12, color: ev.actual ? S.primary : S.tertiary, fontWeight: ev.actual ? 700 : 400 }}>
                          {ev.actual ?? "—"}
                        </td>
                        <td style={{ padding: "6px 8px", fontFamily: S.fontMono, fontSize: 12, color: S.secondary }}>
                          {ev.estimate ?? "—"}
                        </td>
                        <td style={{ padding: "6px 8px", fontFamily: S.fontMono, fontSize: 12, color: S.tertiary }}>
                          {ev.prev ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: "5px 10px", borderTop: `1px solid ${S.soft}`, background: S.bgSub,
        fontFamily: S.fontMono, fontSize: 12, color: S.tertiary,
        display: "flex", justifyContent: "space-between",
      }}>
        <span>Finnhub · 7-day economic calendar</span>
        <span>Indicative only — not investment advice</span>
      </div>
    </div>
  );
}
