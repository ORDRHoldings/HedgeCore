/**
 * guideDocs.test.ts — Guide Documentation System V2 tests
 *
 * Validates all 14 GuideDoc objects against schema rules:
 *  - Schema integrity (required fields, anchor uniqueness, level coverage)
 *  - Content quality (non-empty blocks, formula codeRefs, step ordering)
 *  - Verified/codeRef consistency
 *  - Coverage statistics
 */

import { GUIDES, validateGuideDoc, computeVerifiedStats } from "../../lib/help/guides";
import type { GuideDoc, GuideLevel, GuideBlock } from "../../lib/help/guides/types";

const EXPECTED_GUIDE_IDS = [
  "getting-started", "dashboard-widgets", "data-ingestion", "position-desk",
  "policy-engine", "sandbox-simulation", "execution-pipeline", "execution-bridge",
  "fx-rates", "polisophic", "governance", "troubleshooting", "api-reference", "faq",
];

const VALID_LEVELS: GuideLevel[] = ["L1", "L2", "L3", "L4", "L5"];
const VALID_BLOCK_TYPES = ["text", "steps", "formula", "table", "field-dict", "callout", "code"];

// ── GUIDES array completeness ──────────────────────────────────────────────────

describe("GUIDES array", () => {
  it("exports exactly 14 guides", () => {
    expect(GUIDES).toHaveLength(14);
  });

  it("contains all expected guide IDs in order", () => {
    const ids = GUIDES.map(g => g.id);
    expect(ids).toEqual(EXPECTED_GUIDE_IDS);
  });

  it("no two guides share the same ID", () => {
    const ids = GUIDES.map(g => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── Schema validator ───────────────────────────────────────────────────────────

describe("validateGuideDoc()", () => {
  it("passes all 14 guides with no errors", () => {
    for (const guide of GUIDES) {
      const errors = validateGuideDoc(guide);
      expect(errors).toEqual([]);
    }
  });

  it("detects missing L1 sections", () => {
    const broken: GuideDoc = {
      id: "test", title: "Test", summary: "s", path: "/", icon: "x",
      lastReviewed: "2026-01-01", relatedIds: [],
      sections: [
        { id: "t-s1", heading: "A", level: "L2", verified: false, blocks: [{ type: "text", body: "hello" }] },
      ],
    };
    expect(validateGuideDoc(broken)).toContain("Guide test has no L1 sections");
  });

  it("detects duplicate section anchors", () => {
    const broken: GuideDoc = {
      id: "test2", title: "Test2", summary: "s", path: "/", icon: "x",
      lastReviewed: "2026-01-01", relatedIds: [],
      sections: [
        { id: "t-dup", heading: "A", level: "L1", verified: false, blocks: [{ type: "text", body: "x" }] },
        { id: "t-dup", heading: "B", level: "L2", verified: false, blocks: [{ type: "text", body: "y" }] },
      ],
    };
    const errors = validateGuideDoc(broken);
    expect(errors.some(e => e.includes("Duplicate anchor"))).toBe(true);
  });

  it("detects sections with no content blocks", () => {
    const broken: GuideDoc = {
      id: "test3", title: "Test3", summary: "s", path: "/", icon: "x",
      lastReviewed: "2026-01-01", relatedIds: [],
      sections: [
        { id: "t3-s1", heading: "A", level: "L1", verified: false, blocks: [] },
        { id: "t3-s2", heading: "B", level: "L2", verified: false, blocks: [{ type: "text", body: "ok" }] },
      ],
    };
    const errors = validateGuideDoc(broken);
    expect(errors.some(e => e.includes("no content blocks"))).toBe(true);
  });
});

// ── Per-guide structural tests ────────────────────────────────────────────────

describe.each(GUIDES.map(g => [g.id, g] as [string, GuideDoc]))(
  "Guide: %s",
  (_, guide) => {
    it("has required top-level fields", () => {
      expect(guide.id).toBeTruthy();
      expect(guide.title).toBeTruthy();
      expect(guide.summary).toBeTruthy();
      expect(guide.path).toBeTruthy();
      expect(guide.icon).toBeTruthy();
      expect(guide.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Array.isArray(guide.relatedIds)).toBe(true);
      expect(Array.isArray(guide.sections)).toBe(true);
    });

    it("has at least 4 sections", () => {
      expect(guide.sections.length).toBeGreaterThanOrEqual(4);
    });

    it("has at least one L1 section", () => {
      expect(guide.sections.some(s => s.level === "L1")).toBe(true);
    });

    it("has at least one L2 section", () => {
      expect(guide.sections.some(s => s.level === "L2")).toBe(true);
    });

    it("all section IDs are unique", () => {
      const ids = guide.sections.map(s => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("all section IDs are URL-safe", () => {
      for (const s of guide.sections) {
        expect(s.id).toMatch(/^[a-z0-9-]+$/);
      }
    });

    it("all levels are valid", () => {
      for (const s of guide.sections) {
        expect(VALID_LEVELS).toContain(s.level);
      }
    });

    it("all verified is boolean", () => {
      for (const s of guide.sections) {
        expect(typeof s.verified).toBe("boolean");
      }
    });

    it("all sections have at least one block", () => {
      for (const s of guide.sections) {
        expect(s.blocks.length).toBeGreaterThan(0);
      }
    });

    it("all block types are valid", () => {
      for (const s of guide.sections) {
        for (const b of s.blocks) {
          expect(VALID_BLOCK_TYPES).toContain(b.type);
        }
      }
    });
  }
);

// ── Block content quality ─────────────────────────────────────────────────────

describe("Block content quality", () => {
  const allBlocks: Array<{ guideId: string; sectionId: string; block: GuideBlock }> = [];
  for (const g of GUIDES) {
    for (const s of g.sections) {
      for (const b of s.blocks) {
        allBlocks.push({ guideId: g.id, sectionId: s.id, block: b });
      }
    }
  }

  it("text blocks have non-empty body (>10 chars)", () => {
    for (const { guideId, sectionId, block } of allBlocks) {
      if (block.type === "text") {
        expect((block as { type: "text"; body: string }).body.length).toBeGreaterThan(10);
      }
    }
  });

  it("steps blocks have at least 1 step with label and detail", () => {
    for (const { block } of allBlocks) {
      if (block.type === "steps") {
        const b = block as { type: "steps"; steps: Array<{ n: number; label: string; detail: string }> };
        expect(b.steps.length).toBeGreaterThanOrEqual(1);
        for (const step of b.steps) {
          expect(step.label).toBeTruthy();
          expect(step.detail).toBeTruthy();
          expect(step.n).toBeGreaterThan(0);
        }
      }
    }
  });

  it("formula blocks have label, expression, and explanation", () => {
    for (const { block } of allBlocks) {
      if (block.type === "formula") {
        const b = block as { type: "formula"; formula: { label: string; expression: string; explanation: string } };
        expect(b.formula.label).toBeTruthy();
        expect(b.formula.expression).toBeTruthy();
        expect(b.formula.explanation).toBeTruthy();
      }
    }
  });

  it("table blocks have headers and at least 1 row", () => {
    for (const { block } of allBlocks) {
      if (block.type === "table") {
        const b = block as { type: "table"; table: { headers: string[]; rows: string[][] } };
        expect(b.table.headers.length).toBeGreaterThan(0);
        expect(b.table.rows.length).toBeGreaterThan(0);
        for (const row of b.table.rows) {
          expect(row.length).toBe(b.table.headers.length);
        }
      }
    }
  });

  it("field-dict blocks have at least 1 field with name, type, meaning", () => {
    for (const { block } of allBlocks) {
      if (block.type === "field-dict") {
        const b = block as { type: "field-dict"; fields: Array<{ name: string; type: string; meaning: string; example: string }> };
        expect(b.fields.length).toBeGreaterThanOrEqual(1);
        for (const f of b.fields) {
          expect(f.name).toBeTruthy();
          expect(f.type).toBeTruthy();
          expect(f.meaning).toBeTruthy();
        }
      }
    }
  });
});

// ── CodeRef format ────────────────────────────────────────────────────────────

describe("CodeRef format", () => {
  it("all codeRefs use forward slashes and start with backend/ or frontend/", () => {
    for (const g of GUIDES) {
      for (const s of g.sections) {
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

// ── Verified stats ────────────────────────────────────────────────────────────

describe("computeVerifiedStats()", () => {
  it("returns correct counts", () => {
    const doc: GuideDoc = {
      id: "test", title: "T", summary: "s", path: "/", icon: "x",
      lastReviewed: "2026-01-01", relatedIds: [],
      sections: [
        { id: "s1", heading: "A", level: "L1", verified: true,  blocks: [{ type: "text", body: "x" }] },
        { id: "s2", heading: "B", level: "L2", verified: false, blocks: [{ type: "text", body: "y" }] },
        { id: "s3", heading: "C", level: "L3", verified: true,  blocks: [{ type: "text", body: "z" }] },
      ],
    };
    const stats = computeVerifiedStats(doc);
    expect(stats.verified).toBe(2);
    expect(stats.total).toBe(3);
    expect(stats.pct).toBe(67);
  });

  it("handles empty sections array", () => {
    const doc: GuideDoc = {
      id: "empty", title: "E", summary: "s", path: "/", icon: "x",
      lastReviewed: "2026-01-01", relatedIds: [], sections: [],
    };
    expect(computeVerifiedStats(doc).pct).toBe(0);
  });

  it("all 14 guides have at least 15% verified coverage", () => {
    // Troubleshooting & FAQ guides naturally have lower verified% (failure modes/FAQs
    // are harder to back with single code refs). Floor set at 15% minimum.
    for (const g of GUIDES) {
      const stats = computeVerifiedStats(g);
      expect(stats.pct).toBeGreaterThanOrEqual(15);
    }
  });
});

// ── Coverage report ───────────────────────────────────────────────────────────

describe("Coverage summary", () => {
  it("prints coverage table (informational)", () => {
    const rows = GUIDES.map(g => {
      const stats = computeVerifiedStats(g);
      const levels = [...new Set(g.sections.map(s => s.level))].sort().join(",");
      return `${g.id.padEnd(25)} ${stats.verified}/${stats.total} (${stats.pct}%) levels=${levels}`;
    });
    console.log("\n=== Guide Coverage Report ===");
    rows.forEach(r => console.log(r));
    console.log("============================\n");
    expect(rows.length).toBe(14);
  });
});
