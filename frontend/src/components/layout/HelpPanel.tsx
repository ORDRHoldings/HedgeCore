"use client";

/**
 * HelpPanel.tsx — Collapsible right-side contextual help panel
 *
 * Sprint 1.8: Institutional Help System
 *
 * A 280px-wide collapsible panel that docks to the right side of any page.
 * Each page passes its own `sections` array defining help topics, variables,
 * workflow steps, and pipeline position for that specific module.
 *
 * Design: Bloomberg terminal style — dark, mono, low-friction.
 * The panel state (open/collapsed) is persisted to localStorage per-page.
 */

import { useState, useEffect, useCallback } from "react";

// ── Design tokens ──────────────────────────────────────────────────────────

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

// ── Help content types ─────────────────────────────────────────────────────

export interface HelpVariable {
  name:        string;        // e.g. "forward_points"
  type?:       string;        // e.g. "number (pips)" or "string"
  description: string;        // 1–2 sentence explanation
  example?:    string;        // e.g. "+0.3412" or "MXN"
  source?:     string;        // where this value comes from
}

export interface HelpWorkflowStep {
  step:        number;
  label:       string;        // e.g. "Load Positions"
  description: string;        // what happens in this step
  link?:       string;        // optional /path to navigate to this step
}

export interface HelpSection {
  id:          string;
  title:       string;        // section heading
  icon?:       string;        // single emoji or 2-char code
  type:        "text" | "variables" | "workflow" | "pipeline" | "glossary" | "formula";
  content?:    string;        // for "text" sections
  variables?:  HelpVariable[];
  steps?:      HelpWorkflowStep[];
  pipelinePos?: {             // for "pipeline" sections
    position:  number;        // 1-based position in the pipeline
    total:     number;        // total steps in pipeline
    label:     string;        // e.g. "Step 2 of 7: Market Data"
    prev?:     { label: string; href: string };
    next?:     { label: string; href: string };
    description: string;
  };
  glossary?:   { term: string; definition: string }[];
  formulas?: {
    label:       string;   // e.g. "Optimal Hedge Ratio"
    latex:       string;   // e.g. "H* = ρ(ΔS,ΔF) × (σS / σF)"
    explanation: string;   // 1-2 sentence explanation
    source?:     string;   // e.g. "Johnson (1960); IFRS 9.B6.4"
  }[];
}

export interface HelpPanelConfig {
  pageTitle:   string;        // module name shown at top of panel
  pageSubtitle?: string;      // optional subtitle / badge text
  sections:    HelpSection[];
}

// ── Props ──────────────────────────────────────────────────────────────────

interface HelpPanelProps {
  config:       HelpPanelConfig;
  storageKey:   string;       // localStorage key for open/collapsed state
  width?:       number;       // default 280
  activeSection?: string;     // auto-expand this section ID when changed
}

// ── Component ──────────────────────────────────────────────────────────────

export default function HelpPanel({
  config,
  storageKey,
  width = 280,
  activeSection,
}: HelpPanelProps) {
  const [open, setOpen]             = useState(false);
  const [expandedSection, setExpanded] = useState<string | null>(null);
  const [mounted, setMounted]       = useState(false);

  // Hydration-safe: only read localStorage after mount
  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(`help_panel_${storageKey}`);
      if (saved === "open") setOpen(true);
    } catch {}
  }, [storageKey]);

  const toggle = useCallback(() => {
    setOpen(prev => {
      const next = !prev;
      try {
        localStorage.setItem(`help_panel_${storageKey}`, next ? "open" : "closed");
      } catch {}
      return next;
    });
  }, [storageKey]);

  const toggleSection = useCallback((id: string) => {
    setExpanded(prev => prev === id ? null : id);
  }, []);

  // Auto-expand section when activeSection changes externally (e.g., wizard phase changes)
  useEffect(() => {
    if (activeSection) {
      setExpanded(activeSection);
    }
  }, [activeSection]);

  // Collapse button (always visible on right edge)
  const toggleBtn = (
    <button
      onClick={toggle}
      title={open ? "Close help panel" : "Open help panel"}
      style={{
        position:       "absolute",
        left:           open ? -30 : -30,
        top:            "50%",
        transform:      "translateY(-50%)",
        width:          30,
        height:         64,
        background:     S.bgPanel,
        border:         `1px solid ${S.rim}`,
        borderRight:    open ? "none" : undefined,
        borderLeft:     open ? `1px solid ${S.rim}` : undefined,
        cursor:         "pointer",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        color:          S.tertiary,
        fontFamily:     S.fontMono,
        fontSize:       10,
        writingMode:    "vertical-rl" as const,
        letterSpacing:  "0.08em",
        zIndex:         10,
        flexShrink:     0,
      }}
    >
      {open ? "▶ CLOSE" : "◀ HELP"}
    </button>
  );

  if (!mounted) return null;

  return (
    <div
      style={{
        position:    "relative",
        width:       open ? width : 0,
        minWidth:    open ? width : 0,
        flexShrink:  0,
        transition:  "width 200ms ease, min-width 200ms ease",
        overflow:    "visible",
      }}
    >
      {/* Toggle tab (always visible) */}
      {toggleBtn}

      {/* Panel body */}
      {open && (
        <div
          style={{
            width:        width,
            height:       "100%",
            background:   S.bgPanel,
            borderLeft:   `1px solid ${S.rim}`,
            display:      "flex",
            flexDirection:"column",
            overflowY:    "auto",
            overflowX:    "hidden",
          }}
        >
          {/* Panel header */}
          <div style={{
            padding:      "12px 16px",
            borderBottom: `1px solid ${S.rim}`,
            background:   S.bgSub,
            flexShrink:   0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
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
              fontFamily:  S.fontUI,
              fontSize:    12,
              fontWeight:  600,
              color:       S.primary,
              lineHeight:  1.2,
            }}>{config.pageTitle}</div>
            {config.pageSubtitle && (
              <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.06em", marginTop: 3 }}>
                {config.pageSubtitle}
              </div>
            )}
          </div>

          {/* Sections */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {config.sections.map(section => (
              <div key={section.id} style={{ borderBottom: `1px solid ${S.soft}` }}>
                {/* Section header (accordion trigger) */}
                <button
                  onClick={() => toggleSection(section.id)}
                  style={{
                    width:         "100%",
                    display:       "flex",
                    alignItems:    "center",
                    gap:           8,
                    padding:       "9px 16px",
                    background:    expandedSection === section.id
                      ? `color-mix(in srgb, ${S.cyan} 5%, transparent)`
                      : "transparent",
                    border:        "none",
                    cursor:        "pointer",
                    textAlign:     "left" as const,
                    borderBottom:  expandedSection === section.id ? `1px solid ${S.soft}` : "none",
                  }}
                >
                  {section.icon && (
                    <span style={{ fontSize: 12, flexShrink: 0 }}>{section.icon}</span>
                  )}
                  <span style={{
                    fontFamily:    S.fontUI,
                    fontSize:      11,
                    fontWeight:    600,
                    color:         expandedSection === section.id ? S.cyan : S.primary,
                    flex:          1,
                    lineHeight:    1.3,
                  }}>{section.title}</span>
                  <span style={{ color: S.tertiary, fontSize: 10, fontFamily: S.fontMono }}>
                    {expandedSection === section.id ? "▲" : "▼"}
                  </span>
                </button>

                {/* Section content */}
                {expandedSection === section.id && (
                  <div style={{ padding: "10px 16px 14px" }}>

                    {/* TEXT section */}
                    {section.type === "text" && section.content && (
                      <p style={{
                        fontFamily:  S.fontUI,
                        fontSize:    11,
                        color:       S.secondary,
                        lineHeight:  1.7,
                        margin:      0,
                        whiteSpace:  "pre-line" as const,
                      }}>{section.content}</p>
                    )}

                    {/* VARIABLES section */}
                    {section.type === "variables" && section.variables && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {section.variables.map(v => (
                          <div key={v.name} style={{
                            background:   S.bgSub,
                            border:       `1px solid ${S.soft}`,
                            padding:      "8px 10px",
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

                    {/* WORKFLOW section */}
                    {section.type === "workflow" && section.steps && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                        {section.steps.map((step, i) => (
                          <div key={step.step} style={{ display: "flex", gap: 10 }}>
                            {/* Connector line */}
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                              <div style={{
                                width:        20, height: 20, borderRadius: "50%",
                                background:   `color-mix(in srgb, ${S.cyan} 15%, transparent)`,
                                border:       `1px solid ${S.cyan}`,
                                display:      "flex", alignItems: "center", justifyContent: "center",
                                fontFamily:   S.fontMono, fontSize: 9, fontWeight: 700, color: S.cyan,
                                flexShrink:   0,
                              }}>{step.step}</div>
                              {i < section.steps!.length - 1 && (
                                <div style={{ width: 1, flex: 1, minHeight: 8, background: S.soft }} />
                              )}
                            </div>
                            {/* Step content */}
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

                    {/* PIPELINE section */}
                    {section.type === "pipeline" && section.pipelinePos && (
                      <div>
                        {/* Position indicator */}
                        <div style={{ marginBottom: 10 }}>
                          <div style={{
                            fontFamily:    S.fontMono, fontSize: 9, color: S.cyan,
                            letterSpacing: "0.07em", marginBottom: 4,
                          }}>{section.pipelinePos.label}</div>
                          {/* Progress bar */}
                          <div style={{ height: 4, background: S.soft, position: "relative" as const }}>
                            <div style={{
                              position: "absolute", left: 0, top: 0, height: "100%",
                              width: `${(section.pipelinePos.position / section.pipelinePos.total) * 100}%`,
                              background: S.cyan,
                            }} />
                          </div>
                        </div>
                        <p style={{ fontFamily: S.fontUI, fontSize: 11, color: S.secondary, lineHeight: 1.6, margin: "0 0 10px" }}>
                          {section.pipelinePos.description}
                        </p>
                        {/* Prev / Next nav */}
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                          {section.pipelinePos.prev ? (
                            <a href={section.pipelinePos.prev.href} style={{
                              fontFamily: S.fontMono, fontSize: 9, color: S.tertiary,
                              textDecoration: "none", border: `1px solid ${S.rim}`, padding: "3px 7px",
                            }}>← {section.pipelinePos.prev.label}</a>
                          ) : <div />}
                          {section.pipelinePos.next && (
                            <a href={section.pipelinePos.next.href} style={{
                              fontFamily: S.fontMono, fontSize: 9, color: S.cyan,
                              textDecoration: "none", border: `1px solid ${S.cyan}`, padding: "3px 7px",
                            }}>{section.pipelinePos.next.label} →</a>
                          )}
                        </div>
                      </div>
                    )}

                    {/* GLOSSARY section */}
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

                    {/* FORMULA section */}
                    {section.type === "formula" && section.formulas && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {section.formulas.map((f, i) => (
                          <div key={i} style={{
                            background:   S.bgSub,
                            border:       `1px solid ${S.soft}`,
                            padding:      "10px 12px",
                          }}>
                            <div style={{
                              fontFamily:    S.fontMono,
                              fontSize:      9,
                              color:         S.cyan,
                              letterSpacing: "0.10em",
                              marginBottom:  4,
                              textTransform: "uppercase" as const,
                            }}>{f.label}</div>
                            <div style={{
                              fontFamily:  S.fontMono,
                              fontSize:    13,
                              fontWeight:  700,
                              color:       S.primary,
                              marginBottom: 6,
                              lineHeight:  1.4,
                              wordBreak:   "break-all" as const,
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
                              }}>
                                &#x2197; {f.source}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Panel footer */}
          <div style={{
            padding:    "8px 16px",
            borderTop:  `1px solid ${S.rim}`,
            background: S.bgSub,
            flexShrink: 0,
          }}>
            <div style={{ fontFamily: S.fontMono, fontSize: 9, color: S.tertiary, letterSpacing: "0.06em" }}>
              ORDR · HedgeCore v1.0 · IFRS 9 Compliant
            </div>
            <a href="/hedgewiki" style={{
              fontFamily:    S.fontMono, fontSize: 9, color: S.cyan,
              textDecoration: "none", letterSpacing: "0.06em",
            }}>
              Open HedgeWiki for full documentation →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
