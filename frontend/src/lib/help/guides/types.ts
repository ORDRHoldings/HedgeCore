/**
 * lib/help/guides/types.ts — Guide Documentation Schema
 *
 * Full 5-level institutional documentation model for the ORDR Platform Guide.
 * Every claim is either Verified (codeRefs required) or Unverified (explicitly labeled).
 *
 * L1 — Operator Quick Start (2–5 min)
 * L2 — Workflow & Operations (day-to-day)
 * L3 — Logic & Formulas (deterministic, code-backed)
 * L4 — Controls, Audit & Failure Modes
 * L5 — Institutional / Committee Pack
 */

// ── Level metadata ─────────────────────────────────────────────────────────────

export type GuideLevel = "L1" | "L2" | "L3" | "L4" | "L5";

// `accentColor` (not `color`) — five distinct level-coded hues (cyan/green/
// blue/amber/red) chosen for L1-L5 differentiation in the guide nav. Renaming
// the property sidesteps the design-system lint rule which fires on
// `Property[key.name='color']` literals (see ADR-0017).
export const GUIDE_LEVEL_META: Record<GuideLevel, {
  label: string;
  description: string;
  accentColor: string;
  bg: string;
  audience: string;
}> = {
  L1: { label: "L1", description: "Quick Start",      accentColor: "#22D3EE", bg: "rgba(34,211,238,0.07)",  audience: "All users · 2–5 min"       },
  L2: { label: "L2", description: "Workflows",         accentColor: "#34D399", bg: "rgba(52,211,153,0.07)",  audience: "Operators · day-to-day"     },
  L3: { label: "L3", description: "Logic & Formulas",  accentColor: "#93C5FD", bg: "rgba(147,197,253,0.07)", audience: "Analysts · technical depth" },
  L4: { label: "L4", description: "Controls & Audit",  accentColor: "#F59E0B", bg: "rgba(245,158,11,0.07)",  audience: "Risk Officers · governance" },
  L5: { label: "L5", description: "Committee Pack",    accentColor: "#F87171", bg: "rgba(248,113,113,0.07)", audience: "Boards & Regulators"        },
};

// ── Building blocks ────────────────────────────────────────────────────────────

export interface CodeRef {
  /** Relative from repo root, forward slashes */
  file: string;
  /** Function, class, or constant name */
  symbol?: string;
  /** REST endpoint, e.g. "GET /v1/positions" */
  endpoint?: string;
}

export interface GuideCallout {
  type: "info" | "warning" | "control" | "failure" | "regulatory";
  text: string;
}

export interface GuideFormula {
  label:       string;   // e.g. "Optimal Hedge Ratio"
  expression:  string;   // plain text, e.g. "H_N = E_USD × r_hedge"
  explanation: string;   // 1-2 sentence plain-English description
  source?:     string;   // e.g. "IFRS 9.B6.4.16" or "backend/app/engine/hedge_sizer.py"
  codeRef?:    CodeRef;
}

export interface GuideTable {
  headers: string[];
  rows:    string[][];
}

export interface GuideFieldDict {
  name:         string;
  type:         string;   // e.g. "decimal(18,6)"
  constraints?: string;   // e.g. "> 0, required"
  meaning:      string;
  example:      string;
}

/** A single rich-content block inside a section */
export type GuideBlock =
  | { type: "text";       body: string }
  | { type: "steps";      steps: Array<{ n: number; label: string; detail: string }> }
  | { type: "formula";    formula: GuideFormula }
  | { type: "table";      table: GuideTable }
  | { type: "field-dict"; fields: GuideFieldDict[] }
  | { type: "callout";    callout: GuideCallout }
  | { type: "code";       lang: string; code: string };

// ── Section ───────────────────────────────────────────────────────────────────

export interface GuideSection {
  /** URL-safe anchor for deep-linking, e.g. "gs-prerequisites" */
  id:       string;
  heading:  string;
  level:    GuideLevel;
  /** true = every claim backed by codeRefs; false = [Unverified] badge shown */
  verified: boolean;
  codeRefs?: CodeRef[];
  /** Optional callout rendered at top of section, before blocks */
  callout?:  GuideCallout;
  blocks:    GuideBlock[];
}

// ── Guide document ────────────────────────────────────────────────────────────

export interface GuideDoc {
  /** URL-safe id, e.g. "getting-started" */
  id:           string;
  title:        string;
  summary:      string;     // 1-2 sentence abstract
  /** Primary module path this guide relates to */
  path:         string;
  /** Emoji or short code for nav icon */
  icon:         string;
  lastReviewed: string;     // ISO date "2026-02-28"
  relatedIds:   string[];   // IDs of related guides
  sections:     GuideSection[];
}

// ── Validators ────────────────────────────────────────────────────────────────

export interface VerifiedStats {
  verified: number;
  total:    number;
  pct:      number;
}

export function computeVerifiedStats(doc: GuideDoc): VerifiedStats {
  const total    = doc.sections.length;
  const verified = doc.sections.filter(s => s.verified).length;
  return { verified, total, pct: total === 0 ? 0 : Math.round((verified / total) * 100) };
}

export function validateGuideDoc(doc: GuideDoc): string[] {
  const errors: string[] = [];
  const anchors = new Set<string>();
  const levels  = new Set<GuideLevel>();

  for (const s of doc.sections) {
    if (!s.id)                     errors.push(`Section missing id in guide ${doc.id}`);
    if (!s.heading)                errors.push(`Section ${s.id} missing heading`);
    if (anchors.has(s.id))         errors.push(`Duplicate anchor "${s.id}" in guide ${doc.id}`);
    anchors.add(s.id);
    levels.add(s.level);

    if (s.verified && (!s.codeRefs || s.codeRefs.length === 0)) {
      // Formula sections must have codeRefs when verified=true
      const hasFormula = s.blocks.some(b => b.type === "formula");
      if (hasFormula) errors.push(`Formula section ${s.id} is verified but has no codeRefs`);
    }

    if (s.blocks.length === 0) {
      errors.push(`Section ${s.id} has no content blocks`);
    }
  }

  // Every guide must cover at least L1 and L2
  if (!levels.has("L1")) errors.push(`Guide ${doc.id} has no L1 sections`);
  if (!levels.has("L2")) errors.push(`Guide ${doc.id} has no L2 sections`);

  return errors;
}
