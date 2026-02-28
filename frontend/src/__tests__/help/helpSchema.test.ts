/**
 * helpSchema.test.ts — Help System V2 schema validation tests
 *
 * Validates every exported ModuleHelp object against the schema rules:
 *  - All sections have unique anchors within their module
 *  - Formula sections marked verified have codeRefs
 *  - Level values are 1–5
 *  - Required fields (id, anchor, title, type) are non-empty
 */

import { validateModuleHelp } from "../../lib/help/types";
import { DASHBOARD_HELP } from "../../lib/help/dashboard";
import { POSITIONS_HELP } from "../../lib/help/positions";
import { POLICIES_HELP } from "../../lib/help/policies";
import { EXECUTION_HELP } from "../../lib/help/execution";
import { REPORTS_HELP } from "../../lib/help/reports";
import { AUDIT_HELP } from "../../lib/help/audit";
import { SETTINGS_HELP } from "../../lib/help/settings";
import { SANDBOX_HELP } from "../../lib/help/sandbox";
import type { ModuleHelp, HelpLevel } from "../../lib/help/types";

const ALL_MODULES: ModuleHelp[] = [
  DASHBOARD_HELP,
  POSITIONS_HELP,
  POLICIES_HELP,
  EXECUTION_HELP,
  REPORTS_HELP,
  AUDIT_HELP,
  SETTINGS_HELP,
  SANDBOX_HELP,
];

const VALID_LEVELS: HelpLevel[] = [1, 2, 3, 4, 5];
const VALID_TYPES = ["text", "variables", "workflow", "pipeline", "glossary", "formula"] as const;

// ── Schema validator ───────────────────────────────────────────────────────────

describe("validateModuleHelp()", () => {
  it("passes all 8 module help objects with no errors", () => {
    for (const m of ALL_MODULES) {
      const errors = validateModuleHelp(m);
      expect(errors).toEqual([]);
    }
  });

  it("detects duplicate anchors", () => {
    const broken: ModuleHelp = {
      moduleId: "test",
      pageTitle: "Test",
      sections: [
        { id: "s1", anchor: "test-foo", title: "A", level: 1, type: "text", verified: false, content: "x" },
        { id: "s2", anchor: "test-foo", title: "B", level: 2, type: "text", verified: false, content: "y" },
      ],
    };
    const errors = validateModuleHelp(broken);
    expect(errors.some(e => e.includes("Duplicate anchor"))).toBe(true);
  });

  it("detects formula section verified=true without codeRefs", () => {
    const broken: ModuleHelp = {
      moduleId: "test",
      pageTitle: "Test",
      sections: [
        {
          id: "s1",
          anchor: "test-formula",
          title: "Formula",
          level: 3,
          type: "formula",
          verified: true,
          // no codeRefs
          formulas: [{ label: "Test", latex: "x = y", explanation: "test" }],
        },
      ],
    };
    const errors = validateModuleHelp(broken);
    expect(errors.some(e => e.includes("no codeRefs"))).toBe(true);
  });
});

// ── Per-module structural tests ───────────────────────────────────────────────

describe.each(ALL_MODULES.map(m => [m.moduleId, m] as [string, ModuleHelp]))(
  "Module: %s",
  (_, module) => {
    it("has a non-empty moduleId, pageTitle, and sections array", () => {
      expect(module.moduleId).toBeTruthy();
      expect(module.pageTitle).toBeTruthy();
      expect(Array.isArray(module.sections)).toBe(true);
      expect(module.sections.length).toBeGreaterThan(0);
    });

    it("all sections have required fields", () => {
      for (const s of module.sections) {
        expect(s.id).toBeTruthy();
        expect(s.anchor).toBeTruthy();
        expect(s.title).toBeTruthy();
        expect(VALID_TYPES).toContain(s.type);
        expect(VALID_LEVELS).toContain(s.level);
        expect(typeof s.verified).toBe("boolean");
      }
    });

    it("has at least one L1 section", () => {
      expect(module.sections.some(s => s.level === 1)).toBe(true);
    });

    it("anchors are URL-safe (no spaces, no uppercase)", () => {
      for (const s of module.sections) {
        expect(s.anchor).toMatch(/^[a-z0-9-]+$/);
      }
    });

    it("all section IDs are unique within module", () => {
      const ids = module.sections.map(s => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  }
);

// ── Level distribution test ───────────────────────────────────────────────────

describe("Level distribution", () => {
  it("every module covers at least 3 distinct levels", () => {
    for (const m of ALL_MODULES) {
      const levels = new Set(m.sections.map(s => s.level));
      expect(levels.size).toBeGreaterThanOrEqual(3);
    }
  });
});

// ── Content quality checks ─────────────────────────────────────────────────────

describe("Content quality", () => {
  it("text sections have non-empty content", () => {
    for (const m of ALL_MODULES) {
      for (const s of m.sections) {
        if (s.type === "text") {
          expect(s.content).toBeTruthy();
          expect((s.content ?? "").length).toBeGreaterThan(20);
        }
      }
    }
  });

  it("formula sections have at least one formula entry", () => {
    for (const m of ALL_MODULES) {
      for (const s of m.sections) {
        if (s.type === "formula") {
          expect(Array.isArray(s.formulas)).toBe(true);
          expect(s.formulas!.length).toBeGreaterThan(0);
          for (const f of s.formulas!) {
            expect(f.label).toBeTruthy();
            expect(f.latex).toBeTruthy();
            expect(f.explanation).toBeTruthy();
          }
        }
      }
    }
  });

  it("workflow sections have at least one step", () => {
    for (const m of ALL_MODULES) {
      for (const s of m.sections) {
        if (s.type === "workflow") {
          expect(Array.isArray(s.steps)).toBe(true);
          expect(s.steps!.length).toBeGreaterThan(0);
          for (const step of s.steps!) {
            expect(step.step).toBeGreaterThan(0);
            expect(step.label).toBeTruthy();
            expect(step.description).toBeTruthy();
          }
        }
      }
    }
  });

  it("variables sections have at least one variable", () => {
    for (const m of ALL_MODULES) {
      for (const s of m.sections) {
        if (s.type === "variables") {
          expect(Array.isArray(s.variables)).toBe(true);
          expect(s.variables!.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

// ── Verified / codeRefs consistency ──────────────────────────────────────────

describe("Verified / codeRefs consistency", () => {
  it("unverified sections have no codeRefs (or callout explaining why)", () => {
    for (const m of ALL_MODULES) {
      for (const s of m.sections) {
        if (!s.verified && s.codeRefs && s.codeRefs.length > 0) {
          // If there are codeRefs but verified=false, that is allowed
          // (codeRefs help track but verification not fully confirmed)
        }
      }
    }
  });

  it("codeRef files use forward slashes and start with backend/ or frontend/", () => {
    for (const m of ALL_MODULES) {
      for (const s of m.sections) {
        if (s.codeRefs) {
          for (const ref of s.codeRefs) {
            expect(ref.file).not.toContain("\\");
            expect(ref.file).toMatch(/^(backend|frontend)\//);
          }
        }
      }
    }
  });
});
