/**
 * lib/help/types.ts — Extended Help System V2 schema
 *
 * Institutional documentation stack with 5 levels (L1–L5), verified code refs,
 * anchor deep-links, and callout annotations.
 *
 * L1  Quick Orientation     — what the module does, who uses it
 * L2  Operational Workflow  — step-by-step how to use it
 * L3  Logic & Formulas      — engine math, algorithms, decision rules
 * L4  Controls, Audit & Failure Modes — permissions, audit trail, edge cases
 * L5  Institutional / Committee Pack  — regulatory context, governance posture
 */

// ── Level metadata ────────────────────────────────────────────────────────────

export type HelpLevel = 1 | 2 | 3 | 4 | 5;

export const LEVEL_META: Record<HelpLevel, { label: string; description: string; color: string; bg: string }> = {
  1: { label: "L1", description: "Quick Orientation",          color: "#22D3EE", bg: "rgba(34,211,238,0.08)"  },
  2: { label: "L2", description: "Operational Workflow",       color: "#34D399", bg: "rgba(52,211,153,0.08)"  },
  3: { label: "L3", description: "Logic & Formulas",           color: "#A78BFA", bg: "rgba(167,139,250,0.08)" },
  4: { label: "L4", description: "Controls & Audit",           color: "#F59E0B", bg: "rgba(245,158,11,0.08)"  },
  5: { label: "L5", description: "Institutional Pack",         color: "#F87171", bg: "rgba(248,113,113,0.08)" },
};

// ── Code reference ────────────────────────────────────────────────────────────

export interface CodeRef {
  /** Relative path from repo root, e.g. "backend/app/engine/recommend.py" */
  file: string;
  /** Line number (optional) */
  line?: number;
  /** Symbol name — function, class, or constant, e.g. "build_recommendation" */
  symbol?: string;
}

// ── Callout annotation ────────────────────────────────────────────────────────

export interface Callout {
  type: "info" | "warning" | "caution" | "regulatory";
  text: string;
}

// ── Re-export base types from HelpPanel for compatibility ────────────────────

export interface HelpVariable {
  name:        string;
  type?:       string;
  description: string;
  example?:    string;
  source?:     string;
}

export interface HelpWorkflowStep {
  step:        number;
  label:       string;
  description: string;
  link?:       string;
}

// ── Section ───────────────────────────────────────────────────────────────────

export interface HelpV2Section {
  id:       string;
  /** URL-safe anchor for deep-linking: "#positions-lifecycle" */
  anchor:   string;
  title:    string;
  icon?:    string;

  /** Minimum level at which this section is visible (sections at level ≤ selected are shown) */
  level:    HelpLevel;

  type: "text" | "variables" | "workflow" | "pipeline" | "glossary" | "formula";

  /** true = every claim backed by codeRefs; false = shows [Unverified] badge */
  verified: boolean;

  /** Source code locations that back this section's claims */
  codeRefs?: CodeRef[];

  /** Optional callout box rendered above section content */
  callout?: Callout;

  content?:    string;
  variables?:  HelpVariable[];
  steps?:      HelpWorkflowStep[];
  pipelinePos?: {
    position:    number;
    total:       number;
    label:       string;
    prev?:       { label: string; href: string };
    next?:       { label: string; href: string };
    description: string;
  };
  glossary?: { term: string; definition: string }[];
  formulas?: {
    label:       string;
    latex:       string;
    explanation: string;
    source?:     string;
    codeRef?:    CodeRef;
  }[];
}

// ── Module ────────────────────────────────────────────────────────────────────

export interface ModuleHelp {
  moduleId:     string;
  pageTitle:    string;
  pageSubtitle?: string;
  sections:     HelpV2Section[];
}

// ── Validator ─────────────────────────────────────────────────────────────────

/** Returns list of validation errors (empty = valid) */
export function validateModuleHelp(m: ModuleHelp): string[] {
  const errors: string[] = [];
  const anchors = new Set<string>();

  for (const s of m.sections) {
    if (!s.id)     errors.push(`Section missing id in module ${m.moduleId}`);
    if (!s.anchor) errors.push(`Section ${s.id} missing anchor`);
    if (anchors.has(s.anchor)) errors.push(`Duplicate anchor "${s.anchor}" in module ${m.moduleId}`);
    anchors.add(s.anchor);

    if (s.verified && (!s.codeRefs || s.codeRefs.length === 0)) {
      // Allow verified=true without codeRefs for text sections that describe UI behaviour
      // (not every claim requires a line-level ref). We do warn for formula sections.
      if (s.type === "formula") {
        errors.push(`Formula section ${s.id} is verified but has no codeRefs`);
      }
    }
  }

  return errors;
}
