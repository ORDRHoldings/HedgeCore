"use client";

/**
 * HelpPanelV2.tsx — Institutional Help Panel V2
 *
 * Upgrades over V1:
 *  - 5-level depth selector (L1–L5) with per-key localStorage persistence
 *  - Full-text search across section titles and content
 *  - Multi-section accordion (multiple open simultaneously)
 *  - Per-section level badge, verified/unverified badge, anchor copy-link button
 *  - Callout boxes (info / warning / caution / regulatory)
 *  - Code-ref chips (filename:line) below section content
 *  - Auto-expand via activeSection prop
 *  - Print CSS: all sections expanded, full width
 *  - 360px wide (vs 280px V1)
 *
 * Design: Bloomberg terminal — dark, mono, institutional.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  ModuleHelp,
  HelpV2Section,
  HelpLevel,
  CodeRef,
  Callout,
} from "@/lib/help/types";
import { LEVEL_META } from "@/lib/help/types";

// ── Design tokens ─────────────────────────────────────────────────────────────

const S = {
  fontUI:    "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono:  "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep:    "var(--bg-deep)",
  bgPanel:   "var(--bg-panel)",
  bgSub:     "var(--bg-sub)",
  rim:       "var(--border-rim)",
  soft:      "var(--border-soft)",
  primary:   "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary:  "var(--text-tertiary)",
  cyan:      "var(--accent-cyan)",
  amber:     "var(--accent-amber)",
  pass:      "var(--status-pass,#4ade80)",
  fail:      "var(--accent-red,#B91C1C)",
} as const;

// ── Props ─────────────────────────────────────────────────────────────────────

interface HelpPanelV2Props {
  module:         ModuleHelp;
  storageKey:     string;
  width?:         number;
  activeSection?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns only the filename (last path segment) from a file path */
function basename(filePath: string): string {
  return filePath.split(/[/\\]/).pop() ?? filePath;
}

/** Builds a human-readable code chip label */
function codeChipLabel(ref: CodeRef): string {
  const name = basename(ref.file);
  if (ref.line) return `${name}:${ref.line}`;
  if (ref.symbol) return `${name}#${ref.symbol}`;
  return name;
}

/** Determines callout accent colour */
function calloutColor(type: Callout["type"]): string {
  switch (type) {
    case "info":       return "#22D3EE"; // cyan
    case "warning":    return "#F87171"; // red
    case "caution":    return "#F59E0B"; // amber
    case "regulatory": return "#A78BFA"; // purple
  }
}

function calloutBg(type: Callout["type"]): string {
  switch (type) {
    case "info":       return "rgba(34,211,238,0.07)";
    case "warning":    return "rgba(248,113,113,0.07)";
    case "caution":    return "rgba(245,158,11,0.07)";
    case "regulatory": return "rgba(167,139,250,0.07)";
  }
}

function calloutPrefix(type: Callout["type"]): string {
  switch (type) {
    case "info":       return "ℹ INFO";
    case "warning":    return "⚠ WARNING";
    case "caution":    return "⚡ CAUTION";
    case "regulatory": return "⚖ REGULATORY";
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Callout annotation box rendered above section content */
function CalloutBox({ callout }: { callout: Callout }) {
  const color = calloutColor(callout.type);
  const bg    = calloutBg(callout.type);
  return (
    <div style={{
      background:   bg,
      borderLeft:   `3px solid ${color}`,
      padding:      "7px 10px",
      marginBottom: 10,
    }}>
      <div style={{
        fontFamily:    S.fontMono,
        fontSize:      8,
        fontWeight:    700,
        color:         color,
        letterSpacing: "0.10em",
        marginBottom:  4,
      }}>{calloutPrefix(callout.type)}</div>
      <p style={{
        fontFamily: S.fontUI,
        fontSize:   10,
        color:      S.secondary,
        lineHeight: 1.55,
        margin:     0,
      }}>{callout.text}</p>
    </div>
  );
}

/** Row of code reference chips below section content */
function CodeRefs({ refs }: { refs: CodeRef[] }) {
  return (
    <div style={{
      display:    "flex",
      flexWrap:   "wrap",
      gap:        4,
      marginTop:  10,
      paddingTop: 8,
      borderTop:  `1px solid ${S.soft}`,
    }}>
      {refs.map((ref, i) => (
        <span
          key={i}
          title={ref.symbol ? `${ref.file}  ${ref.symbol}` : ref.file}
          style={{
            fontFamily:    S.fontMono,
            fontSize:      9,
            color:         S.tertiary,
            background:    S.bgSub,
            border:        `1px solid ${S.soft}`,
            padding:       "2px 6px",
            letterSpacing: "0.03em",
            cursor:        "default",
          }}
        >
          {codeChipLabel(ref)}
        </span>
      ))}
    </div>
  );
}

/** Rendered body for a single section (the 6 content types) */
function SectionBody({ section }: { section: HelpV2Section }) {
  return (
    <>
      {/* Callout */}
      {section.callout && <CalloutBox callout={section.callout} />}

      {/* TEXT */}
      {section.type === "text" && section.content && (
        <p style={{
          fontFamily: S.fontUI,
          fontSize:   11,
          color:      S.secondary,
          lineHeight: 1.7,
          margin:     0,
          whiteSpace: "pre-line",
        }}>{section.content}</p>
      )}

      {/* VARIABLES */}
      {section.type === "variables" && section.variables && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {section.variables.map(v => (
            <div key={v.name} style={{
              background: S.bgSub,
              border:     `1px solid ${S.soft}`,
              padding:    "8px 10px",
            }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 3 }}>
                <span style={{
                  fontFamily:    S.fontMono,
                  fontSize:      10,
                  fontWeight:    700,
                  color:         S.cyan,
                  letterSpacing: "0.04em",
                }}>{v.name}</span>
                {v.type && (
                  <span style={{
                    fontFamily:    S.fontMono,
                    fontSize:      9,
                    color:         S.tertiary,
                    letterSpacing: "0.04em",
                  }}>{v.type}</span>
                )}
              </div>
              <p style={{
                fontFamily: S.fontUI,
                fontSize:   10,
                color:      S.secondary,
                lineHeight: 1.55,
                margin:     "0 0 4px",
              }}>{v.description}</p>
              {v.example && (
                <div style={{ display: "flex", gap: 4, alignItems: "baseline", marginTop: 2 }}>
                  <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, flexShrink: 0 }}>e.g.</span>
                  <span style={{ fontFamily: S.fontMono, fontSize: 9, color: S.amber }}>{v.example}</span>
                </div>
              )}
              {v.source && (
                <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, marginTop: 2 }}>
                  ← {v.source}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* WORKFLOW */}
      {section.type === "workflow" && section.steps && (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {section.steps.map((step, i) => (
            <div key={step.step} style={{ display: "flex", gap: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                <div style={{
                  width:          20,
                  height:         20,
                  borderRadius:   "50%",
                  background:     `color-mix(in srgb, ${S.cyan} 15%, transparent)`,
                  border:         `1px solid ${S.cyan}`,
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  fontFamily:     S.fontMono,
                  fontSize:       9,
                  fontWeight:     700,
                  color:          S.cyan,
                  flexShrink:     0,
                }}>{step.step}</div>
                {i < section.steps!.length - 1 && (
                  <div style={{ width: 1, flex: 1, minHeight: 8, background: S.soft }} />
                )}
              </div>
              <div style={{ paddingBottom: i < section.steps!.length - 1 ? 10 : 0, paddingTop: 1 }}>
                <div style={{ fontFamily: S.fontUI, fontSize: 11, fontWeight: 600, color: S.primary, marginBottom: 2 }}>
                  {step.link
                    ? <a href={step.link} style={{ color: S.cyan, textDecoration: "none" }}>{step.label} →</a>
                    : step.label
                  }
                </div>
                <p style={{ fontFamily: S.fontUI, fontSize: 10, color: S.secondary, lineHeight: 1.55, margin: 0 }}>
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PIPELINE */}
      {section.type === "pipeline" && section.pipelinePos && (
        <div>
          <div style={{ marginBottom: 10 }}>
            <div style={{
              fontFamily:    S.fontMono,
              fontSize:      9,
              color:         S.cyan,
              letterSpacing: "0.07em",
              marginBottom:  4,
            }}>{section.pipelinePos.label}</div>
            <div style={{ height: 4, background: S.soft, position: "relative" }}>
              <div style={{
                position:   "absolute",
                left:       0,
                top:        0,
                height:     "100%",
                width:      `${(section.pipelinePos.position / section.pipelinePos.total) * 100}%`,
                background: S.cyan,
              }} />
            </div>
          </div>
          <p style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, lineHeight: 1.6, margin: "0 0 10px" }}>
            {section.pipelinePos.description}
          </p>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
            {section.pipelinePos.prev ? (
              <a href={section.pipelinePos.prev.href} style={{
                fontFamily:     S.fontMono,
                fontSize:       9,
                color:          S.tertiary,
                textDecoration: "none",
                border:         `1px solid ${S.rim}`,
                padding:        "3px 7px",
              }}>← {section.pipelinePos.prev.label}</a>
            ) : <div />}
            {section.pipelinePos.next && (
              <a href={section.pipelinePos.next.href} style={{
                fontFamily:     S.fontMono,
                fontSize:       9,
                color:          S.cyan,
                textDecoration: "none",
                border:         `1px solid ${S.cyan}`,
                padding:        "3px 7px",
              }}>{section.pipelinePos.next.label} →</a>
            )}
          </div>
        </div>
      )}

      {/* GLOSSARY */}
      {section.type === "glossary" && section.glossary && (
        <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {section.glossary.map(g => (
            <div key={g.term} style={{ borderLeft: `2px solid ${S.cyan}`, paddingLeft: 8 }}>
              <dt style={{ fontFamily: S.fontMono, fontSize: 10, fontWeight: 700, color: S.cyan, marginBottom: 2 }}>{g.term}</dt>
              <dd style={{ fontFamily: S.fontUI, fontSize: 10, color: S.secondary, lineHeight: 1.55, margin: 0 }}>{g.definition}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* FORMULA */}
      {section.type === "formula" && section.formulas && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {section.formulas.map((f, i) => (
            <div key={i} style={{
              background: S.bgSub,
              border:     `1px solid ${S.soft}`,
              padding:    "10px 12px",
            }}>
              <div style={{
                fontFamily:    S.fontMono,
                fontSize:      9,
                color:         S.cyan,
                letterSpacing: "0.10em",
                marginBottom:  4,
                textTransform: "uppercase",
              }}>{f.label}</div>
              <div style={{
                fontFamily:   S.fontMono,
                fontSize:     13,
                fontWeight:   700,
                color:        S.primary,
                marginBottom: 6,
                lineHeight:   1.4,
                wordBreak:    "break-all",
              }}>{f.latex}</div>
              <p style={{
                fontFamily: S.fontUI,
                fontSize:   10,
                color:      S.secondary,
                lineHeight: 1.55,
                margin:     "0 0 4px",
              }}>{f.explanation}</p>
              {f.source && (
                <div style={{
                  fontFamily:    S.fontMono,
                  fontSize:      9,
                  color:         S.tertiary,
                  letterSpacing: "0.04em",
                  marginTop:     2,
                }}>&#x2197; {f.source}</div>
              )}
              {f.codeRef && <CodeRefs refs={[f.codeRef]} />}
            </div>
          ))}
        </div>
      )}

      {/* Code refs (section-level, shown for all non-formula types) */}
      {section.type !== "formula" && section.codeRefs && section.codeRefs.length > 0 && (
        <CodeRefs refs={section.codeRefs} />
      )}
    </>
  );
}

// ── Level Selector ────────────────────────────────────────────────────────────

interface LevelSelectorProps {
  selected: HelpLevel;
  onChange: (level: HelpLevel) => void;
}

function LevelSelector({ selected, onChange }: LevelSelectorProps) {
  const levels: HelpLevel[] = [1, 2, 3, 4, 5];
  return (
    <div style={{
      display:      "flex",
      gap:          0,
      borderBottom: `1px solid ${S.rim}`,
      background:   S.bgDeep,
      flexShrink:   0,
    }}>
      {levels.map(lvl => {
        const meta    = LEVEL_META[lvl];
        const active  = selected === lvl;
        return (
          <button
            key={lvl}
            onClick={() => onChange(lvl)}
            title={`${meta.label} — ${meta.description}`}
            style={{
              flex:          1,
              padding:       "7px 0",
              background:    active ? meta.bg : "transparent",
              border:        "none",
              borderBottom:  active ? `2px solid ${meta.color}` : "2px solid transparent",
              cursor:        "pointer",
              fontFamily:    S.fontMono,
              fontSize:      10,
              fontWeight:    active ? 700 : 500,
              color:         active ? meta.color : S.tertiary,
              letterSpacing: "0.06em",
              transition:    "color 120ms, background 120ms, border-color 120ms",
            }}
          >
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Anchor copy button ────────────────────────────────────────────────────────

function AnchorCopyButton({ anchor }: { anchor: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const url = `${window.location.origin}${window.location.pathname}?section=${anchor}`;
      navigator.clipboard.writeText(url).catch(() => {/* silent */});
    } catch {/* silent */}
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }, [anchor]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <button
      onClick={handleCopy}
      title={`Copy link to #${anchor}`}
      style={{
        background:    "transparent",
        border:        "none",
        cursor:        "pointer",
        fontFamily:    S.fontMono,
        fontSize:      14,
        color:         copied ? S.pass : S.tertiary,
        padding:       "0 4px",
        lineHeight:    1,
        flexShrink:    0,
        transition:    "color 120ms",
      }}
    >
      {copied ? "✓" : "#"}
    </button>
  );
}

// ── Section accordion item ────────────────────────────────────────────────────

interface SectionItemProps {
  section:     HelpV2Section;
  isExpanded:  boolean;
  onToggle:    () => void;
}

function SectionItem({ section, isExpanded, onToggle }: SectionItemProps) {
  const levelMeta = LEVEL_META[section.level];

  return (
    <div style={{ borderBottom: `1px solid ${S.soft}` }}>
      {/* Header */}
      <button
        onClick={onToggle}
        style={{
          width:          "100%",
          display:        "flex",
          alignItems:     "center",
          gap:            6,
          padding:        "9px 14px 9px 12px",
          background:     isExpanded
            ? `color-mix(in srgb, ${S.cyan} 4%, transparent)`
            : "transparent",
          border:         "none",
          borderBottom:   isExpanded ? `1px solid ${S.soft}` : "none",
          cursor:         "pointer",
          textAlign:      "left",
        }}
      >
        {/* Icon */}
        {section.icon && (
          <span style={{ fontSize: 12, flexShrink: 0, lineHeight: 1 }}>{section.icon}</span>
        )}

        {/* Title */}
        <span style={{
          fontFamily: S.fontUI,
          fontSize:   11,
          fontWeight: 600,
          color:      isExpanded ? S.cyan : S.primary,
          flex:       1,
          lineHeight: 1.3,
        }}>{section.title}</span>

        {/* Level badge */}
        <span style={{
          fontFamily:    S.fontMono,
          fontSize:      8,
          fontWeight:    700,
          color:         levelMeta.color,
          background:    levelMeta.bg,
          padding:       "1px 4px",
          letterSpacing: "0.06em",
          flexShrink:    0,
        }}>{levelMeta.label}</span>

        {/* Verified / Unverified badge */}
        {section.verified ? (
          <span style={{
            fontFamily:    S.fontMono,
            fontSize:      8,
            fontWeight:    700,
            color:         S.pass,
            background:    "rgba(74,222,128,0.08)",
            padding:       "1px 4px",
            letterSpacing: "0.05em",
            flexShrink:    0,
          }}>✓ VERIFIED</span>
        ) : (
          <span style={{
            fontFamily:    S.fontMono,
            fontSize:      8,
            fontWeight:    700,
            color:         S.amber,
            background:    "rgba(245,158,11,0.08)",
            padding:       "1px 4px",
            letterSpacing: "0.05em",
            flexShrink:    0,
          }}>[UNVERIFIED]</span>
        )}

        {/* Anchor copy link */}
        <AnchorCopyButton anchor={section.anchor} />

        {/* Chevron */}
        <span style={{ color: S.tertiary, fontSize: 9, fontFamily: S.fontMono, flexShrink: 0 }}>
          {isExpanded ? "▲" : "▼"}
        </span>
      </button>

      {/* Body */}
      {isExpanded && (
        <div style={{ padding: "10px 14px 14px 12px" }}>
          <SectionBody section={section} />
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HelpPanelV2({
  module,
  storageKey,
  width = 360,
  activeSection,
}: HelpPanelV2Props) {
  const [open,          setOpen]          = useState(false);
  const [level,         setLevel]         = useState<HelpLevel>(2);
  const [expanded,      setExpanded]      = useState<Set<string>>(new Set());
  const [search,        setSearch]        = useState("");
  const [mounted,       setMounted]       = useState(false);

  // ── Hydration-safe init ────────────────────────────────────────────────────
  useEffect(() => {
    setMounted(true);
    try {
      const savedOpen = localStorage.getItem(`help_panel_${storageKey}`);
      if (savedOpen === "open") setOpen(true);

      const savedLevel = localStorage.getItem(`help_v2_level_${storageKey}`);
      if (savedLevel) {
        const parsed = parseInt(savedLevel, 10) as HelpLevel;
        if ([1, 2, 3, 4, 5].includes(parsed)) setLevel(parsed);
      }
    } catch {/* storage unavailable */}
  }, [storageKey]);

  // ── Toggle panel open/closed ───────────────────────────────────────────────
  const toggle = useCallback(() => {
    setOpen(prev => {
      const next = !prev;
      try { localStorage.setItem(`help_panel_${storageKey}`, next ? "open" : "closed"); } catch {}
      return next;
    });
  }, [storageKey]);

  // ── Level change ───────────────────────────────────────────────────────────
  const handleLevelChange = useCallback((lvl: HelpLevel) => {
    setLevel(lvl);
    try { localStorage.setItem(`help_v2_level_${storageKey}`, String(lvl)); } catch {}
  }, [storageKey]);

  // ── Accordion toggle ───────────────────────────────────────────────────────
  const toggleSection = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // ── Auto-expand from prop ──────────────────────────────────────────────────
  useEffect(() => {
    if (activeSection) {
      setExpanded(prev => {
        const next = new Set(prev);
        next.add(activeSection);
        return next;
      });
    }
  }, [activeSection]);

  // ── Section filtering ──────────────────────────────────────────────────────
  const visibleSections = module.sections.filter(s => {
    if (s.level > level) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    if (s.title.toLowerCase().includes(q)) return true;
    if (s.content?.toLowerCase().includes(q)) return true;
    if (s.glossary?.some(g => g.term.toLowerCase().includes(q) || g.definition.toLowerCase().includes(q))) return true;
    if (s.variables?.some(v => v.name.toLowerCase().includes(q) || v.description.toLowerCase().includes(q))) return true;
    return false;
  });

  // ── Toggle button (fixed when closed, absolute when open) ─────────────────
  const toggleBtn = (
    <button
      onClick={toggle}
      title={open ? "Close help panel" : "Open help panel"}
      style={{
        position:       open ? "absolute" : "fixed",
        left:           open ? -30 : undefined,
        right:          open ? undefined : 0,
        top:            "50%",
        transform:      "translateY(-50%)",
        width:          30,
        height:         64,
        background:     open ? S.bgPanel : "#F97316",
        border:         open ? `1px solid ${S.rim}` : "1px solid #EA580C",
        borderRight:    open ? "none" : undefined,
        borderLeft:     open ? `1px solid ${S.rim}` : undefined,
        cursor:         "pointer",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        color:          open ? S.tertiary : "#FFFFFF",
        fontFamily:     S.fontMono,
        fontSize:       10,
        fontWeight:     open ? undefined : 700,
        writingMode:    "vertical-rl",
        letterSpacing:  "0.08em",
        zIndex:         100,
        flexShrink:     0,
        boxShadow:      open ? undefined : "0 2px 8px rgba(249,115,22,0.30)",
      }}
    >
      {open ? "▶ CLOSE" : "◀ HELP"}
    </button>
  );

  if (!mounted) return null;

  return (
    <>
      {/* Print styles: full width, all sections visible */}
      <style>{`
        @media print {
          .help-panel-v2 {
            position: static !important;
            width: 100% !important;
            min-width: 100% !important;
            height: auto !important;
            border-left: none !important;
          }
          .help-panel-v2-toggle { display: none !important; }
          .help-panel-v2-body { height: auto !important; overflow: visible !important; }
          .help-panel-v2-section-body { display: block !important; }
        }
      `}</style>

      <div
        className="help-panel-v2"
        style={{
          position:   "sticky",
          top:        0,
          alignSelf:  "flex-start",
          height:     "100vh",
          width:      open ? width : 0,
          minWidth:   open ? width : 0,
          flexShrink: 0,
          transition: "width 200ms ease, min-width 200ms ease",
          overflow:   "visible",
          zIndex:     50,
        }}
      >
        {/* Toggle tab */}
        <div className="help-panel-v2-toggle">
          {toggleBtn}
        </div>

        {/* Panel body */}
        {open && (
          <div
            style={{
              width:         width,
              height:        "100vh",
              background:    S.bgPanel,
              borderLeft:    `1px solid ${S.rim}`,
              display:       "flex",
              flexDirection: "column",
              overflow:      "hidden",
            }}
          >
            {/* ── Panel header ──────────────────────────────────────────── */}
            <div style={{
              padding:      "12px 14px 10px",
              borderBottom: `1px solid ${S.rim}`,
              background:   S.bgSub,
              flexShrink:   0,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                <span style={{
                  fontFamily:    S.fontMono,
                  fontSize:      9,
                  letterSpacing: "0.10em",
                  color:         S.cyan,
                  fontWeight:    700,
                }}>? HELP</span>
                <span style={{ color: S.rim }}>·</span>
                <span style={{
                  fontFamily:    S.fontMono,
                  fontSize:      9,
                  letterSpacing: "0.07em",
                  color:         S.tertiary,
                }}>ORDR PLATFORM</span>
              </div>
              <div style={{
                fontFamily: S.fontUI,
                fontSize:   13,
                fontWeight: 600,
                color:      S.primary,
                lineHeight: 1.2,
              }}>{module.pageTitle}</div>
              {module.pageSubtitle && (
                <div style={{
                  fontFamily:    S.fontMono,
                  fontSize:      9,
                  color:         S.tertiary,
                  letterSpacing: "0.06em",
                  marginTop:     3,
                }}>{module.pageSubtitle}</div>
              )}
            </div>

            {/* ── Level selector ────────────────────────────────────────── */}
            <LevelSelector selected={level} onChange={handleLevelChange} />

            {/* ── Level description strip ───────────────────────────────── */}
            <div style={{
              padding:      "5px 14px",
              borderBottom: `1px solid ${S.soft}`,
              background:   LEVEL_META[level].bg,
              flexShrink:   0,
            }}>
              <span style={{
                fontFamily:    S.fontMono,
                fontSize:      9,
                color:         LEVEL_META[level].color,
                letterSpacing: "0.06em",
              }}>
                Showing up to {LEVEL_META[level].label} — {LEVEL_META[level].description}
              </span>
            </div>

            {/* ── Search ───────────────────────────────────────────────── */}
            <div style={{
              padding:      "8px 14px",
              borderBottom: `1px solid ${S.soft}`,
              background:   S.bgPanel,
              flexShrink:   0,
            }}>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search help…"
                style={{
                  width:         "100%",
                  boxSizing:     "border-box",
                  background:    S.bgSub,
                  border:        `1px solid ${S.rim}`,
                  padding:       "5px 9px",
                  fontFamily:    S.fontMono,
                  fontSize:      11,
                  color:         S.primary,
                  outline:       "none",
                }}
              />
            </div>

            {/* ── Sections ─────────────────────────────────────────────── */}
            <div
              className="help-panel-v2-body"
              style={{ flex: 1, overflowY: "auto" }}
            >
              {visibleSections.length === 0 ? (
                <div style={{
                  padding:    "24px 14px",
                  fontFamily: S.fontMono,
                  fontSize:   10,
                  color:      S.tertiary,
                  textAlign:  "center",
                  letterSpacing: "0.06em",
                }}>
                  {search.trim() ? "NO RESULTS MATCHING SEARCH" : `NO SECTIONS AT ${LEVEL_META[level].label}`}
                </div>
              ) : (
                visibleSections.map(section => (
                  <div key={section.id} className="help-panel-v2-section-body">
                    <SectionItem
                      section={section}
                      isExpanded={expanded.has(section.id)}
                      onToggle={() => toggleSection(section.id)}
                    />
                  </div>
                ))
              )}
            </div>

            {/* ── Panel footer ─────────────────────────────────────────── */}
            <div style={{
              padding:    "8px 14px",
              borderTop:  `1px solid ${S.rim}`,
              background: S.bgSub,
              flexShrink: 0,
            }}>
              <div style={{
                fontFamily:    S.fontMono,
                fontSize:      9,
                color:         S.tertiary,
                letterSpacing: "0.06em",
                marginBottom:  3,
              }}>
                ORDR · HedgeCore v1.0 · IFRS 9 Compliant
              </div>
              <a
                href="/hedgewiki"
                style={{
                  fontFamily:     S.fontMono,
                  fontSize:       9,
                  color:          S.cyan,
                  textDecoration: "none",
                  letterSpacing:  "0.06em",
                }}
              >
                Open HedgeWiki →
              </a>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
