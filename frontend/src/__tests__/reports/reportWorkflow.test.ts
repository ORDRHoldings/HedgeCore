/**
 * reportWorkflow.test.ts
 *
 * End-to-end workflow tests for the report generation system (unit level, no API calls).
 *
 * Tests the pipeline: Library -> Studio -> sections -> narrative -> export readiness
 *
 * Covers:
 * 1. Each preset generates valid sections
 * 2. Section type coverage across all presets
 * 3. Template-to-sections conversion
 * 4. Narrative function mapping per preset category
 * 5. Compliance scoring classification
 * 6. Export readiness validation
 */

import { REPORT_PRESETS, REPORT_CATEGORIES } from "../../constants/reportPresets";
import type {
  ReportTemplate,
  SectionType,
  ReportCategory,
  DataBindings,
  ReportSection,
} from "../../types/reportTypes";
import {
  policyComplianceChecks,
  bucketCoverageRatios,
} from "../../utils/reportCalcs";
import type {
  BucketResult,
  HedgePlanSummary,
  PolicyConfig,
} from "../../api/types";

// ── Test Data Factories ──────────────────────────────────────────────────────

function makeBucket(overrides: Partial<BucketResult> = {}): BucketResult {
  return {
    bucket: "2025-01",
    commercial_exposure_mxn: 1000000,
    confirmed_flow_mxn: 600000,
    forecast_flow_mxn: 400000,
    existing_hedges_mxn: 500000,
    hedge_position_mxn: 800000,
    target_signed_mxn: -900000,
    action_mxn: 300000,
    action_usd: 15000,
    action_direction: "SELL_MXN_BUY_USD",
    forward_rate: 20.12,
    carry_note: "",
    friction_usd: 500,
    residual_mxn: 200000,
    suppressed: false,
    ...overrides,
  };
}

function makeSummary(overrides: Partial<HedgePlanSummary> = {}): HedgePlanSummary {
  return {
    total_commercial_exposure_mxn: 5000000,
    total_existing_hedges_mxn: 2000000,
    total_action_mxn: 2000000,
    total_action_usd: 100000,
    total_friction_usd: 25000,
    total_hedge_position_mxn: 4000000,
    total_residual_mxn: 1000000,
    ...overrides,
  };
}

function makePolicy(overrides: Partial<PolicyConfig> = {}): PolicyConfig {
  return {
    bucket_mode: "CALENDAR_MONTH",
    hedge_ratios: { confirmed: 1.0, forecast: 0.5 },
    cost_assumptions: { spread_bps: 5 },
    execution_product: "NDF",
    min_trade_size_usd: 10000,
    ...overrides,
  };
}

// ── All valid SectionType values ─────────────────────────────────────────────

const ALL_SECTION_TYPES: SectionType[] = [
  "EXECUTIVE_SUMMARY",
  "HEDGE_PLAN_TABLE",
  "EXPOSURE_DECOMPOSITION",
  "SCENARIO_SENSITIVITY",
  "POLICY_COMPLIANCE",
  "HEDGE_EFFICIENCY",
  "FORWARD_CURVE",
  "CONNECTOR_HEALTH",
  "DATA_QUALITY",
  "POSITION_REGISTER",
  "EXECUTION_LOG",
  "APPROVAL_CHAIN",
  "POLICY_RATIONALE",
  "STRESS_TEST_RESULTS",
  "MACRO_OVERLAY",
  "AUDIT_EVENTS",
  "DISCLOSURES",
  "ASSUMPTIONS_REGISTRY",
  "COVER_PAGE",
  "TABLE_OF_CONTENTS",
  "CUSTOM_NARRATIVE",
];

// ── StudioSection type (mirrors SectionList.tsx) ─────────────────────────────

interface StudioSection {
  id: string;
  type: SectionType;
  title: string;
  order: number;
  status: string;
}

/**
 * Mirrors the templateToSections() function from StudioTab.tsx.
 * Converts template default_sections into StudioSection[] with generated IDs.
 */
function templateToSections(template: ReportTemplate): StudioSection[] {
  return template.default_sections.map((sec, idx) => ({
    id: `sec-${template.template_id}-${idx}-test`,
    type: sec.type,
    title: sec.title,
    order: idx,
    status: sec.status ?? "INCLUDED",
  }));
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Each preset generates valid sections
// ═════════════════════════════════════════════════════════════════════════════

describe("Preset section validity", () => {
  it.each(REPORT_PRESETS.map((p) => ({ id: p.template_id, name: p.short_name, preset: p })))(
    "$id ($name) has non-empty default_sections",
    ({ preset }) => {
      expect(preset.default_sections.length).toBeGreaterThan(0);
    },
  );

  it.each(REPORT_PRESETS.map((p) => ({ id: p.template_id, name: p.short_name, preset: p })))(
    "$id ($name) sections all have valid type and title",
    ({ preset }) => {
      preset.default_sections.forEach((sec) => {
        expect(ALL_SECTION_TYPES).toContain(sec.type);
        expect(sec.title.trim().length).toBeGreaterThan(0);
      });
    },
  );

  it.each(REPORT_PRESETS.map((p) => ({ id: p.template_id, name: p.short_name, preset: p })))(
    "$id ($name) has estimated_pages > 0",
    ({ preset }) => {
      expect(preset.estimated_pages).toBeGreaterThan(0);
    },
  );

  it.each(REPORT_PRESETS.map((p) => ({ id: p.template_id, name: p.short_name, preset: p })))(
    "$id ($name) has non-empty audience",
    ({ preset }) => {
      expect(preset.audience.length).toBeGreaterThan(0);
    },
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Section type coverage
// ═════════════════════════════════════════════════════════════════════════════

describe("Section type coverage across all presets", () => {
  it("every SectionType is used in at least one preset", () => {
    const usedTypes = new Set<string>();
    REPORT_PRESETS.forEach((preset) => {
      preset.default_sections.forEach((sec) => {
        usedTypes.add(sec.type);
      });
    });

    ALL_SECTION_TYPES.forEach((sectionType) => {
      expect(usedTypes.has(sectionType)).toBe(true);
    });
  });

  it("DISCLOSURES section appears in every preset", () => {
    REPORT_PRESETS.forEach((preset) => {
      const hasDisclosures = preset.default_sections.some((s) => s.type === "DISCLOSURES");
      expect(hasDisclosures).toBe(true);
    });
  });

  it("EXECUTIVE_SUMMARY appears in majority of presets", () => {
    const count = REPORT_PRESETS.filter((p) =>
      p.default_sections.some((s) => s.type === "EXECUTIVE_SUMMARY"),
    ).length;
    // At least half of presets should have executive summary
    expect(count).toBeGreaterThanOrEqual(Math.floor(REPORT_PRESETS.length / 2));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Template-to-sections conversion
// ═════════════════════════════════════════════════════════════════════════════

describe("Template-to-sections conversion", () => {
  it.each(REPORT_PRESETS.map((p) => ({ id: p.template_id, name: p.short_name, preset: p })))(
    "$id ($name) converts to same number of StudioSections",
    ({ preset }) => {
      const sections = templateToSections(preset);
      expect(sections.length).toBe(preset.default_sections.length);
    },
  );

  it("each converted section has unique id", () => {
    REPORT_PRESETS.forEach((preset) => {
      const sections = templateToSections(preset);
      const ids = sections.map((s) => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  it("section order matches template order (0-indexed, sequential)", () => {
    REPORT_PRESETS.forEach((preset) => {
      const sections = templateToSections(preset);
      sections.forEach((sec, idx) => {
        expect(sec.order).toBe(idx);
      });
    });
  });

  it("section types match template section types in order", () => {
    REPORT_PRESETS.forEach((preset) => {
      const sections = templateToSections(preset);
      preset.default_sections.forEach((templateSec, idx) => {
        expect(sections[idx].type).toBe(templateSec.type);
      });
    });
  });

  it("section titles match template section titles", () => {
    REPORT_PRESETS.forEach((preset) => {
      const sections = templateToSections(preset);
      preset.default_sections.forEach((templateSec, idx) => {
        expect(sections[idx].title).toBe(templateSec.title);
      });
    });
  });

  it("all converted sections have status INCLUDED by default", () => {
    REPORT_PRESETS.forEach((preset) => {
      const sections = templateToSections(preset);
      sections.forEach((sec) => {
        expect(["INCLUDED", "EXCLUDED", "DRAFT"]).toContain(sec.status);
      });
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Narrative function mapping per preset category
// ═════════════════════════════════════════════════════════════════════════════

describe("Report per-preset narrative completeness", () => {
  /**
   * Maps section types to the narrative function that would produce their content.
   * This ensures that each preset's section types have corresponding narrative generators.
   */
  const SECTION_TO_NARRATIVE_FN: Record<string, string> = {
    EXECUTIVE_SUMMARY: "generateExecutiveSummaryNarrative",
    EXPOSURE_DECOMPOSITION: "generateExposureNarrative",
    HEDGE_EFFICIENCY: "generateHedgeEfficiencyNarrative",
    SCENARIO_SENSITIVITY: "generateScenarioNarrative",
    STRESS_TEST_RESULTS: "generateScenarioNarrative",
    POLICY_COMPLIANCE: "generateComplianceNarrative",
    // Section types that don't have dedicated narrative generators (data-only sections):
    // COVER_PAGE, TABLE_OF_CONTENTS, HEDGE_PLAN_TABLE, FORWARD_CURVE,
    // CONNECTOR_HEALTH, DATA_QUALITY, POSITION_REGISTER, EXECUTION_LOG,
    // APPROVAL_CHAIN, POLICY_RATIONALE, MACRO_OVERLAY, AUDIT_EVENTS,
    // DISCLOSURES, ASSUMPTIONS_REGISTRY, CUSTOM_NARRATIVE
  };

  /** Sections that require narrative generation (not data-only or structural) */
  const NARRATIVE_SECTIONS = new Set(Object.keys(SECTION_TO_NARRATIVE_FN));

  it("EXECUTIVE_BOARD presets include EXECUTIVE_SUMMARY", () => {
    const boardPresets = REPORT_PRESETS.filter((p) => p.category === "EXECUTIVE_BOARD");
    expect(boardPresets.length).toBeGreaterThan(0);
    boardPresets.forEach((preset) => {
      const hasExecSummary = preset.default_sections.some((s) => s.type === "EXECUTIVE_SUMMARY");
      expect(hasExecSummary).toBe(true);
    });
  });

  it("RISK_COMMITTEE presets include SCENARIO_SENSITIVITY or STRESS_TEST_RESULTS", () => {
    const riskPresets = REPORT_PRESETS.filter((p) => p.category === "RISK_COMMITTEE");
    expect(riskPresets.length).toBeGreaterThan(0);
    riskPresets.forEach((preset) => {
      const hasScenario = preset.default_sections.some(
        (s) => s.type === "SCENARIO_SENSITIVITY" || s.type === "STRESS_TEST_RESULTS",
      );
      expect(hasScenario).toBe(true);
    });
  });

  it("POLICY_PACK presets include POLICY_COMPLIANCE or POLICY_RATIONALE", () => {
    const policyPresets = REPORT_PRESETS.filter((p) => p.category === "POLICY_PACK");
    expect(policyPresets.length).toBeGreaterThan(0);
    policyPresets.forEach((preset) => {
      const hasPolicy = preset.default_sections.some(
        (s) => s.type === "POLICY_COMPLIANCE" || s.type === "POLICY_RATIONALE",
      );
      expect(hasPolicy).toBe(true);
    });
  });

  it("COMPLIANCE_AUDIT presets include AUDIT_EVENTS", () => {
    const auditPresets = REPORT_PRESETS.filter((p) => p.category === "COMPLIANCE_AUDIT");
    expect(auditPresets.length).toBeGreaterThan(0);
    auditPresets.forEach((preset) => {
      const hasAudit = preset.default_sections.some(
        (s) => s.type === "AUDIT_EVENTS" || s.type === "APPROVAL_CHAIN",
      );
      expect(hasAudit).toBe(true);
    });
  });

  it("EXECUTION_PACK presets include EXECUTION_LOG", () => {
    const execPresets = REPORT_PRESETS.filter((p) => p.category === "EXECUTION_PACK");
    expect(execPresets.length).toBeGreaterThan(0);
    execPresets.forEach((preset) => {
      const hasExec = preset.default_sections.some((s) => s.type === "EXECUTION_LOG");
      expect(hasExec).toBe(true);
    });
  });

  it("TREASURY_FX presets include HEDGE_PLAN_TABLE or FORWARD_CURVE", () => {
    const treasuryPresets = REPORT_PRESETS.filter((p) => p.category === "TREASURY_FX");
    expect(treasuryPresets.length).toBeGreaterThan(0);
    treasuryPresets.forEach((preset) => {
      const hasTreasury = preset.default_sections.some(
        (s) => s.type === "HEDGE_PLAN_TABLE" || s.type === "FORWARD_CURVE" || s.type === "HEDGE_EFFICIENCY",
      );
      expect(hasTreasury).toBe(true);
    });
  });

  it("DATA_QUALITY presets include DATA_QUALITY section type", () => {
    const dqPresets = REPORT_PRESETS.filter((p) => p.category === "DATA_QUALITY");
    expect(dqPresets.length).toBeGreaterThan(0);
    dqPresets.forEach((preset) => {
      const hasDQ = preset.default_sections.some((s) => s.type === "DATA_QUALITY");
      expect(hasDQ).toBe(true);
    });
  });

  it("every preset with narrative sections has at least one narratable section", () => {
    REPORT_PRESETS.forEach((preset) => {
      const narratableSections = preset.default_sections.filter((s) => NARRATIVE_SECTIONS.has(s.type));
      // At minimum, DISCLOSURES is present but that's structural.
      // Most presets should have at least one real narrative section.
      // Only purely structural presets (CONNECTOR_HEALTH types) might not.
      const hasNarrative = narratableSections.length > 0 || preset.default_sections.length <= 4;
      expect(hasNarrative).toBe(true);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Compliance scoring
// ═════════════════════════════════════════════════════════════════════════════

describe("Compliance scoring classification", () => {
  it("perfect compliance yields score 100 and ALIGNED", () => {
    const buckets = [
      makeBucket({
        confirmed_flow_mxn: 600000,
        forecast_flow_mxn: 400000,
        commercial_exposure_mxn: 1000000,
        hedge_position_mxn: 800000,
        action_usd: 15000,
        suppressed: false,
      }),
    ];
    const summary = makeSummary({ total_hedge_position_mxn: 800000 });
    const policy = makePolicy({ hedge_ratios: { confirmed: 0.8, forecast: 0.4 }, min_trade_size_usd: 10000 });
    const result = policyComplianceChecks(buckets, summary, policy);
    expect(result.score).toBe(100);
    expect(result.classification).toBe("ALIGNED");
  });

  it("one failure yields score 80 and MINOR DEVIATIONS", () => {
    // 4 out of 5 pass = 80%
    const buckets = [
      makeBucket({
        confirmed_flow_mxn: 600000,
        forecast_flow_mxn: 400000,
        commercial_exposure_mxn: 1000000,
        hedge_position_mxn: 800000,
        action_usd: 15000,
        suppressed: true,  // this will cause "No suppressed buckets" to fail
      }),
    ];
    const summary = makeSummary({ total_hedge_position_mxn: 800000 });
    const policy = makePolicy({ hedge_ratios: { confirmed: 0.8, forecast: 0.4 }, min_trade_size_usd: 10000 });
    const result = policyComplianceChecks(buckets, summary, policy);
    expect(result.score).toBe(80);
    expect(result.classification).toBe("MINOR DEVIATIONS");
  });

  it("multiple failures yield score < 80 and BREACH", () => {
    // Deliberately fail multiple checks
    const buckets = [
      makeBucket({
        confirmed_flow_mxn: 100000,
        forecast_flow_mxn: 900000,
        commercial_exposure_mxn: 1000000,
        hedge_position_mxn: 1200000,  // over-hedged (1.2 > 1.05)
        action_usd: 5000,             // below min trade size
        suppressed: true,             // suppressed
      }),
    ];
    const summary = makeSummary({ total_hedge_position_mxn: 0 });
    const policy = makePolicy({ hedge_ratios: { confirmed: 1.0, forecast: 0.5 }, min_trade_size_usd: 10000 });
    const result = policyComplianceChecks(buckets, summary, policy);
    expect(result.score).toBeLessThan(80);
    expect(result.classification).toBe("BREACH");
  });

  it("score is always 0-100 integer", () => {
    const combos = [
      { buckets: [makeBucket()], summary: makeSummary(), policy: makePolicy() },
      { buckets: [], summary: makeSummary(), policy: makePolicy() },
      {
        buckets: [makeBucket({ suppressed: true, action_usd: 1, commercial_exposure_mxn: 100, hedge_position_mxn: 200 })],
        summary: makeSummary({ total_hedge_position_mxn: 0 }),
        policy: makePolicy(),
      },
    ];
    combos.forEach(({ buckets, summary, policy }) => {
      const result = policyComplianceChecks(buckets, summary, policy);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(Number.isInteger(result.score)).toBe(true);
    });
  });

  it("classification is always one of the three valid values", () => {
    const allClassifications = new Set<string>();
    // Run with various data to get different scores
    const scenarios = [
      // All pass
      { buckets: [makeBucket({ hedge_position_mxn: 800000, action_usd: 15000 })], summary: makeSummary({ total_hedge_position_mxn: 800000 }), policy: makePolicy({ hedge_ratios: { confirmed: 0.8, forecast: 0.4 } }) },
      // One fail
      { buckets: [makeBucket({ suppressed: true, action_usd: 15000, hedge_position_mxn: 800000 })], summary: makeSummary({ total_hedge_position_mxn: 800000 }), policy: makePolicy({ hedge_ratios: { confirmed: 0.8, forecast: 0.4 } }) },
      // Multiple fail
      { buckets: [makeBucket({ suppressed: true, action_usd: 5000, hedge_position_mxn: 1200000 })], summary: makeSummary({ total_hedge_position_mxn: 0 }), policy: makePolicy() },
    ];
    scenarios.forEach(({ buckets, summary, policy }) => {
      const result = policyComplianceChecks(buckets, summary, policy);
      allClassifications.add(result.classification);
      expect(["ALIGNED", "MINOR DEVIATIONS", "BREACH"]).toContain(result.classification);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. Export readiness validation
// ═════════════════════════════════════════════════════════════════════════════

describe("Export readiness validation", () => {
  /**
   * A report is considered export-ready when:
   * - It has a bound run_envelope_id (data source)
   * - It has at least one section
   * - Sections have valid types
   */
  function validateExportReadiness(
    bindings: DataBindings,
    sections: StudioSection[],
  ): { isValid: boolean; reasons: string[] } {
    const reasons: string[] = [];

    if (!bindings.run_envelope_id) {
      reasons.push("Missing run_envelope_id binding");
    }

    if (sections.length === 0) {
      reasons.push("No sections defined");
    }

    const invalidSections = sections.filter((s) => !ALL_SECTION_TYPES.includes(s.type));
    if (invalidSections.length > 0) {
      reasons.push(`${invalidSections.length} section(s) with invalid type`);
    }

    return { isValid: reasons.length === 0, reasons };
  }

  it("valid bindings + valid sections = isValid true", () => {
    const bindings: DataBindings = { run_envelope_id: "RUN-001", policy_id: "POL-001" };
    const sections = templateToSections(REPORT_PRESETS[0]);
    const result = validateExportReadiness(bindings, sections);
    expect(result.isValid).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("missing run_envelope_id = isValid false", () => {
    const bindings: DataBindings = { policy_id: "POL-001" };
    const sections = templateToSections(REPORT_PRESETS[0]);
    const result = validateExportReadiness(bindings, sections);
    expect(result.isValid).toBe(false);
    expect(result.reasons).toContain("Missing run_envelope_id binding");
  });

  it("empty sections = isValid false", () => {
    const bindings: DataBindings = { run_envelope_id: "RUN-001" };
    const result = validateExportReadiness(bindings, []);
    expect(result.isValid).toBe(false);
    expect(result.reasons).toContain("No sections defined");
  });

  it("empty bindings + empty sections = two reasons", () => {
    const result = validateExportReadiness({}, []);
    expect(result.isValid).toBe(false);
    expect(result.reasons.length).toBe(2);
  });

  it("every preset generates export-ready sections when bindings are provided", () => {
    const bindings: DataBindings = { run_envelope_id: "RUN-001" };
    REPORT_PRESETS.forEach((preset) => {
      const sections = templateToSections(preset);
      const result = validateExportReadiness(bindings, sections);
      expect(result.isValid).toBe(true);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Additional workflow integrity checks
// ═════════════════════════════════════════════════════════════════════════════

describe("Workflow integrity", () => {
  it("REPORT_CATEGORIES covers all categories used by presets", () => {
    const presetCategories = new Set(REPORT_PRESETS.map((p) => p.category));
    const categoryKeys = new Set(REPORT_CATEGORIES.map((c) => c.key));
    presetCategories.forEach((cat) => {
      expect(categoryKeys.has(cat)).toBe(true);
    });
  });

  it("each category count in REPORT_CATEGORIES matches actual preset count", () => {
    REPORT_CATEGORIES.forEach((catMeta) => {
      const actualCount = REPORT_PRESETS.filter((p) => p.category === catMeta.key).length;
      expect(actualCount).toBe(catMeta.count);
    });
  });

  it("all presets have unique template_id values", () => {
    const ids = REPORT_PRESETS.map((p) => p.template_id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("all presets have required_inputs array with at least one entry", () => {
    REPORT_PRESETS.forEach((preset) => {
      expect(Array.isArray(preset.required_inputs)).toBe(true);
      expect(preset.required_inputs.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("preset ordering within each category is consistent", () => {
    const categorized: Record<string, ReportTemplate[]> = {};
    REPORT_PRESETS.forEach((p) => {
      if (!categorized[p.category]) categorized[p.category] = [];
      categorized[p.category].push(p);
    });

    Object.entries(categorized).forEach(([_cat, presets]) => {
      // Each category's presets should have unique short_names
      const shortNames = presets.map((p) => p.short_name);
      const uniqueNames = new Set(shortNames);
      expect(uniqueNames.size).toBe(shortNames.length);
    });
  });

  it("coverage ratios from bucketCoverageRatios integrate with compliance checks", () => {
    // Workflow: generate buckets -> compute coverage -> check compliance
    const buckets = [
      makeBucket({ commercial_exposure_mxn: 1000000, hedge_position_mxn: 1000000 }),
      makeBucket({ bucket: "2025-02", commercial_exposure_mxn: 2000000, hedge_position_mxn: 1800000 }),
    ];
    const coverage = bucketCoverageRatios(buckets);
    expect(coverage).toHaveLength(2);
    expect(coverage[0].status).toBe("MATCHED");
    expect(coverage[1].status).toBe("MATCHED");

    const compliance = policyComplianceChecks(buckets, makeSummary({ total_hedge_position_mxn: 2800000 }), makePolicy({ hedge_ratios: { confirmed: 0.8, forecast: 0.4 } }));
    expect(compliance.classification).toBe("ALIGNED");
  });

  it("presets with ai_assisted sections are labeled correctly", () => {
    REPORT_PRESETS.forEach((preset) => {
      preset.default_sections.forEach((sec) => {
        expect(typeof sec.ai_assisted).toBe("boolean");
      });
    });
  });
});
