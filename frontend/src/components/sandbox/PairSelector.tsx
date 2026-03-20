"use client";

import { useState, useRef, useEffect } from "react";
import { PAIR_REGISTRY, GROUP_LABELS, type PairGroup } from "../../constants/pairRegistry";

const S = {
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  fontUI:   "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  panel:    "var(--bg-panel)",
  sub:      "var(--bg-sub)",
  rim:      "var(--border-rim)",
  soft:     "var(--border-soft)",
  primary:  "var(--text-primary)",
  secondary:"var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan:     "var(--accent-cyan)",
  amber:    "var(--accent-amber)",
  green:    "var(--status-pass,#22c55e)",
} as const;

const GROUP_ORDER: PairGroup[] = ["G10", "EM_LATAM", "EM_ASIA", "EM_CEEMEA"];

interface Props {
  value: string;
  onChange: (pairId: string) => void;
}

export default function PairSelector({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = PAIR_REGISTRY.find(p => p.id === value);
  const isNdf = selected?.isNdf ?? false;
  const isEm = selected?.group !== "G10";

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 7,
          fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
          padding: "4px 10px",
          border: `1px solid ${open ? S.cyan : S.rim}`,
          borderRadius: 3,
          background: open ? `color-mix(in srgb, ${S.cyan} 8%, ${S.panel})` : S.sub,
          color: S.primary,
          cursor: "pointer",
          transition: "border-color 100ms, background 100ms",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ color: S.cyan }}>{selected?.label ?? value}</span>
        {isNdf && (
          <span style={{
            fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
            color: S.amber, padding: "1px 5px",
            border: `1px solid ${S.amber}`, borderRadius: 2,
            background: `color-mix(in srgb, ${S.amber} 10%, transparent)`,
          }}>NDF</span>
        )}
        {isEm && !isNdf && (
          <span style={{
            fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
            color: S.secondary, padding: "1px 5px",
            border: `1px solid ${S.soft}`, borderRadius: 2,
          }}>EM</span>
        )}
        <span style={{ color: S.tertiary, fontSize: 12 }}>{open ? "▲" : "▼"}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
          background: S.panel, border: `1px solid ${S.rim}`, borderRadius: 4,
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          width: 260, maxHeight: 440, overflowY: "auto",
        }}>
          {GROUP_ORDER.map(group => {
            const pairs = PAIR_REGISTRY.filter(p => p.group === group);
            return (
              <div key={group}>
                <div style={{
                  padding: "7px 12px 4px",
                  fontFamily: S.fontMono, fontSize: 12, fontWeight: 700,
                  letterSpacing: "0.1em", color: S.tertiary,
                  textTransform: "uppercase",
                  borderTop: group !== "G10" ? `1px solid ${S.soft}` : undefined,
                  background: S.sub,
                }}>
                  {GROUP_LABELS[group]}
                </div>
                {pairs.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { onChange(p.id); setOpen(false); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      width: "100%", padding: "7px 14px",
                      fontFamily: S.fontMono, fontSize: 12,
                      background: p.id === value
                        ? `color-mix(in srgb, ${S.cyan} 10%, ${S.panel})`
                        : "transparent",
                      color: p.id === value ? S.cyan : S.primary,
                      border: "none", cursor: "pointer",
                      textAlign: "left",
                      borderBottom: `1px solid transparent`,
                    }}
                    onMouseEnter={e => { if (p.id !== value) (e.currentTarget as HTMLButtonElement).style.background = S.sub; }}
                    onMouseLeave={e => { if (p.id !== value) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                  >
                    <span style={{ flex: 1, fontWeight: p.id === value ? 700 : 400 }}>
                      {p.label}
                    </span>
                    {p.isNdf && (
                      <span style={{
                        fontFamily: S.fontMono, fontSize: 12, color: S.amber,
                        padding: "1px 4px", border: `1px solid ${S.amber}`, borderRadius: 2,
                        background: `color-mix(in srgb, ${S.amber} 8%, transparent)`,
                      }}>NDF</span>
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
