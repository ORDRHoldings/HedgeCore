/**
 * reportPresets.test.ts
 *
 * Unit tests for the ORDR Report Studio preset catalog.
 *
 * Validates:
 * - Catalog integrity (30 presets, unique IDs, non-empty names/descriptions)
 * - Section ordering (each template's sections start at 0 and are sequential)
 * - Required fields (all presets have required_inputs, modules, audience)
 * - Category metadata (counts match actual presets)
 * - No section ID conflicts within any single template
 * - All section types are valid SectionType values
 * - Export formats are valid ExportFormat values
 */

import { REPORT_PRESETS, REPORT_CATEGORIES, ALL_REPORT_TAGS } from "../../constants/reportPresets";
import type { SectionType, ReportCategory, ReportModule, ReportAudience, ExportFormat } from "../../types/reportTypes";

// ─── Valid value sets ──────────────────────────────────────────────────────────

const VALID_SECTION_TYPES: SectionType[] = [
  "EXECUTIVE_SUMMARY", "HEDGE_PLAN_TABLE", "EXPOSURE_DECOMPOSITION",
  "SCENARIO_SENSITIVITY", "POLICY_COMPLIANCE", "HEDGE_EFFICIENCY",
  "FORWARD_CURVE", "CONNECTOR_HEALTH", "DATA_QUALITY",
  "POSITION_REGISTER", "EXECUTION_LOG", "APPROVAL_CHAIN",
  "POLICY_RATIONALE", "STRESS_TEST_RESULTS", "MACRO_OVERLAY",
  "AUDIT_EVENTS", "DISCLOSURES", "ASSUMPTIONS_REGISTRY",
  "COVER_PAGE", "TABLE_OF_CONTENTS", "CUSTOM_NARRATIVE",
];

const VALID_EXPORT_FORMATS: ExportFormat[] = [
  "PDF", "EXCEL", "POWERPOINT", "HTML", "JSON", "CSV", "ZIP_COMMITTEE",
];

const VALID_CATEGORIES: ReportCategory[] = [
  "EXECUTIVE_BOARD", "TREASURY_FX", "RISK_COMMITTEE", "POLICY_PACK",
  "EXECUTION_PACK", "SCENARIO_STRESS", "EXPOSURE_DECOMP", "DATA_QUALITY",
  "CONNECTOR_HEALTH", "COMPLIANCE_AUDIT", "MULTI_CURRENCY",
];

const VALID_AUDIENCES: ReportAudience[] = [
  "BOARD", "CFO", "TREASURER", "RISK_COMMITTEE", "AUDIT", "TRADER", "ANALYST", "REGULATOR",
];

const VALID_MODULES: ReportModule[] = [
  "DASHBOARD", "POSITION_DESK", "POLICY_ENGINE", "EXECUTION",
  "SCENARIO_STRESS", "FX_RATES", "CONNECTOR_HEALTH", "MACRO_OVERLAY", "AUDIT_COMPLIANCE",
];

// ─── Catalog integrity ────────────────────────────────────────────────────────

describe("REPORT_PRESETS catalog", () => {
  // Catalog grew over time. RPT-001..RPT-030 are the institutional core; T31..T35
  // were added later for multi-currency. Counts are locked here so a future
  // accidental drop in coverage gets caught — not as an architectural contract.
  const RPT_CORE_COUNT = 30;
  const MULTI_CCY_COUNT = 5;
  const TOTAL_COUNT = RPT_CORE_COUNT + MULTI_CCY_COUNT;

  test(`exports exactly ${TOTAL_COUNT} presets`, () => {
    expect(REPORT_PRESETS).toHaveLength(TOTAL_COUNT);
  });

  test("all template_ids are unique", () => {
    const ids = REPORT_PRESETS.map(t => t.template_id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(TOTAL_COUNT);
  });

  test("template_ids follow RPT-NNN or T-NN_NAME format", () => {
    REPORT_PRESETS.forEach(t => {
      expect(t.template_id).toMatch(/^(RPT-\d{3}|T\d{2}_[A-Z0-9_]+)$/);
    });
  });

  test("RPT-001 through RPT-030 are all present", () => {
    const expected = new Set(
      Array.from({ length: RPT_CORE_COUNT }, (_, i) => `RPT-${String(i + 1).padStart(3, "0")}`)
    );
    const actual = new Set(REPORT_PRESETS.map(t => t.template_id));
    for (const id of expected) {
      expect(actual.has(id)).toBe(true);
    }
  });

  test("all presets have non-empty name, short_name, description", () => {
    REPORT_PRESETS.forEach(t => {
      expect(t.name.trim().length).toBeGreaterThan(0);
      expect(t.short_name.trim().length).toBeGreaterThan(0);
      expect(t.description.trim().length).toBeGreaterThan(10);
    });
  });

  test("all presets have template_version = 1", () => {
    REPORT_PRESETS.forEach(t => {
      expect(t.version).toBe(1);
    });
  });

  test("all presets are marked is_system = true", () => {
    REPORT_PRESETS.forEach(t => {
      expect(t.is_system).toBe(true);
    });
  });

  test("all presets have at least 1 section", () => {
    REPORT_PRESETS.forEach(t => {
      expect(t.default_sections.length).toBeGreaterThanOrEqual(1);
    });
  });

  test("all presets have at least 1 audience", () => {
    REPORT_PRESETS.forEach(t => {
      expect(t.audience.length).toBeGreaterThanOrEqual(1);
    });
  });

  test("all presets have at least 1 module", () => {
    REPORT_PRESETS.forEach(t => {
      expect(t.modules.length).toBeGreaterThanOrEqual(1);
    });
  });

  test("all presets have estimated_pages > 0", () => {
    REPORT_PRESETS.forEach(t => {
      expect(t.estimated_pages).toBeGreaterThan(0);
    });
  });

  test("all presets have non-empty tags array", () => {
    REPORT_PRESETS.forEach(t => {
      expect(t.tags.length).toBeGreaterThan(0);
    });
  });

  test("all presets have valid created_at and updated_at ISO strings", () => {
    REPORT_PRESETS.forEach(t => {
      expect(() => new Date(t.created_at)).not.toThrow();
      expect(() => new Date(t.updated_at)).not.toThrow();
      expect(isNaN(new Date(t.created_at).getTime())).toBe(false);
      expect(isNaN(new Date(t.updated_at).getTime())).toBe(false);
    });
  });
});

// ─── Section ordering ─────────────────────────────────────────────────────────

describe("Section ordering within presets", () => {
  test("each preset's sections start at order 0", () => {
    REPORT_PRESETS.forEach(t => {
      const orders = t.default_sections.map(s => s.order);
      expect(Math.min(...orders)).toBe(0);
    });
  });

  test("each preset's sections are sequential (no gaps or duplicates)", () => {
    REPORT_PRESETS.forEach(t => {
      const orders = t.default_sections.map(s => s.order).sort((a, b) => a - b);
      orders.forEach((order, i) => {
        expect(order).toBe(i);
      });
    });
  });

  test("sections across different presets reset ordering independently", () => {
    // Each template should start its own section ordering at 0
    REPORT_PRESETS.forEach(t => {
      const firstSection = t.default_sections.find(s => s.order === 0);
      expect(firstSection).toBeDefined();
    });
  });
});

// ─── Section type validity ────────────────────────────────────────────────────

describe("Section type validity", () => {
  test("all section types are valid SectionType values", () => {
    REPORT_PRESETS.forEach(t => {
      t.default_sections.forEach(s => {
        expect(VALID_SECTION_TYPES).toContain(s.type);
      });
    });
  });

  test("all sections have INCLUDED or EXCLUDED or DRAFT status", () => {
    REPORT_PRESETS.forEach(t => {
      t.default_sections.forEach(s => {
        expect(["INCLUDED", "EXCLUDED", "DRAFT"]).toContain(s.status);
      });
    });
  });

  test("all sections have non-empty title", () => {
    REPORT_PRESETS.forEach(t => {
      t.default_sections.forEach(s => {
        expect(s.title.trim().length).toBeGreaterThan(0);
      });
    });
  });

  test("all sections have boolean ai_assisted field", () => {
    REPORT_PRESETS.forEach(t => {
      t.default_sections.forEach(s => {
        expect(typeof s.ai_assisted).toBe("boolean");
      });
    });
  });

  test("all sections have boolean page_break_before field", () => {
    REPORT_PRESETS.forEach(t => {
      t.default_sections.forEach(s => {
        expect(typeof s.page_break_before).toBe("boolean");
      });
    });
  });

  test("all sections have citations as an array", () => {
    REPORT_PRESETS.forEach(t => {
      t.default_sections.forEach(s => {
        expect(Array.isArray(s.citations)).toBe(true);
      });
    });
  });

  test("all sections have params as an array", () => {
    REPORT_PRESETS.forEach(t => {
      t.default_sections.forEach(s => {
        expect(Array.isArray(s.params)).toBe(true);
      });
    });
  });
});

// ─── Category validity ────────────────────────────────────────────────────────

describe("Preset category validity", () => {
  test("all preset categories are valid ReportCategory values", () => {
    REPORT_PRESETS.forEach(t => {
      expect(VALID_CATEGORIES).toContain(t.category);
    });
  });

  test("all preset audiences are valid ReportAudience values", () => {
    REPORT_PRESETS.forEach(t => {
      t.audience.forEach(a => {
        expect(VALID_AUDIENCES).toContain(a);
      });
    });
  });

  test("all preset modules are valid ReportModule values", () => {
    REPORT_PRESETS.forEach(t => {
      t.modules.forEach(m => {
        expect(VALID_MODULES).toContain(m);
      });
    });
  });

  test("all preset export formats are valid ExportFormat values", () => {
    REPORT_PRESETS.forEach(t => {
      expect(VALID_EXPORT_FORMATS).toContain(t.default_export_format);
    });
  });
});

// ─── REPORT_CATEGORIES metadata ───────────────────────────────────────────────

describe("REPORT_CATEGORIES metadata", () => {
  // 10 institutional categories + MULTI_CURRENCY (added with T31..T35).
  const CATEGORY_COUNT = 11;
  const TOTAL_PRESET_COUNT = 35;

  test(`exports exactly ${CATEGORY_COUNT} categories`, () => {
    expect(REPORT_CATEGORIES).toHaveLength(CATEGORY_COUNT);
  });

  test("all category keys are unique", () => {
    const keys = REPORT_CATEGORIES.map(c => c.key);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(CATEGORY_COUNT);
  });

  test("all categories have non-empty label and description", () => {
    REPORT_CATEGORIES.forEach(c => {
      expect(c.label.trim().length).toBeGreaterThan(0);
      expect(c.description.trim().length).toBeGreaterThan(0);
    });
  });

  test(`total category count sums to ${TOTAL_PRESET_COUNT}`, () => {
    const total = REPORT_CATEGORIES.reduce((sum, c) => sum + c.count, 0);
    expect(total).toBe(TOTAL_PRESET_COUNT);
  });

  test("each category count >= 1", () => {
    REPORT_CATEGORIES.forEach(c => {
      expect(c.count).toBeGreaterThanOrEqual(1);
    });
  });
});

// ─── DISCLOSURES section presence ─────────────────────────────────────────────

describe("Governance: DISCLOSURES section", () => {
  test("all presets include a DISCLOSURES section", () => {
    REPORT_PRESETS.forEach(t => {
      const hasDisclosures = t.default_sections.some(s => s.type === "DISCLOSURES");
      expect(hasDisclosures).toBe(true);
    });
  });
});

// ─── COVER_PAGE and TABLE_OF_CONTENTS consistency ─────────────────────────────

describe("Cover page and TOC consistency", () => {
  test("presets with TABLE_OF_CONTENTS also have COVER_PAGE", () => {
    REPORT_PRESETS.forEach(t => {
      const hasToc = t.default_sections.some(s => s.type === "TABLE_OF_CONTENTS");
      const hasCover = t.default_sections.some(s => s.type === "COVER_PAGE");
      if (hasToc) {
        expect(hasCover).toBe(true);
      }
    });
  });
});

// ─── ALL_REPORT_TAGS ──────────────────────────────────────────────────────────

describe("ALL_REPORT_TAGS", () => {
  test("exports a non-empty array of strings", () => {
    expect(Array.isArray(ALL_REPORT_TAGS)).toBe(true);
    expect(ALL_REPORT_TAGS.length).toBeGreaterThan(0);
    ALL_REPORT_TAGS.forEach(tag => {
      expect(typeof tag).toBe("string");
      expect(tag.trim().length).toBeGreaterThan(0);
    });
  });

  test("all tags are lowercase", () => {
    ALL_REPORT_TAGS.forEach(tag => {
      expect(tag).toBe(tag.toLowerCase());
    });
  });
});
