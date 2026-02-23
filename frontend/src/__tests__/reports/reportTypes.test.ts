/**
 * reportTypes.test.ts
 *
 * Runtime shape validation for the ORDR Report System data model.
 *
 * Tests that objects conforming to our TypeScript interfaces
 * have expected runtime characteristics — catching any drift
 * between the type system and runtime expectations.
 */

import type {
  ReportSection,
  ReportTemplate,
  ReportDefinition,
  ReportRun,
  AIReportPlan,
  DataBindings,
  ReportValidationIssue,
  ReportSchedule,
  ExportArtifact,
  DisclosureEntry,
  AssumptionEntry,
} from "../../types/reportTypes";

// ─── Factory helpers ──────────────────────────────────────────────────────────

function makeSection(overrides: Partial<ReportSection> = {}): ReportSection {
  return {
    id: "sec-001",
    type: "EXECUTIVE_SUMMARY",
    title: "Executive Summary",
    order: 0,
    status: "INCLUDED",
    params: [],
    ai_assisted: false,
    citations: [],
    page_break_before: false,
    ...overrides,
  };
}

// Template sections omit the 'id' field (assigned at instantiation time)
function makeDefaultSection(): Omit<ReportSection, "id"> {
  return {
    type: "EXECUTIVE_SUMMARY",
    title: "Executive Summary",
    order: 0,
    status: "INCLUDED",
    params: [],
    ai_assisted: false,
    citations: [],
    page_break_before: false,
  };
}

function makeTemplate(overrides: Partial<ReportTemplate> = {}): ReportTemplate {
  return {
    template_id: "RPT-001",
    version: 1,
    name: "Board Pack",
    short_name: "Board Pack",
    description: "Board-level FX risk summary.",
    category: "EXECUTIVE_BOARD",
    audience: ["BOARD", "CFO"],
    modules: ["DASHBOARD", "FX_RATES"],
    default_sections: [makeDefaultSection()],
    required_inputs: ["run_envelope_id", "policy_id"],
    default_export_format: "PDF",
    is_system: true,
    tags: ["board", "quarterly"],
    estimated_pages: 8,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeDefinition(overrides: Partial<ReportDefinition> = {}): ReportDefinition {
  return {
    report_id: "rpt-def-001",
    template_id: "RPT-001",
    template_version: 1,
    name: "Q1 2026 Board Pack",
    description: "Board pack for Q1 2026 review.",
    owner: "analyst@corp.com",
    tenant_id: "tenant-001",
    status: "DRAFT",
    sections: [makeSection({ id: "sec-001" })],
    bindings: { reporting_currency: "USD" },
    export_formats: ["PDF"],
    tags: ["board", "q1"],
    version: 1,
    created_at: "2026-02-01T00:00:00Z",
    updated_at: "2026-02-23T00:00:00Z",
    ...overrides,
  };
}

function makePlan(overrides: Partial<AIReportPlan> = {}): AIReportPlan {
  return {
    plan_id: "plan-001",
    goal: "BOARD_UPDATE",
    goal_description: "Q1 Board update",
    selected_modules: ["DASHBOARD"],
    proposed_sections: [makeSection()],
    narrative_scaffolds: {
      EXECUTIVE_SUMMARY: "AI-ASSISTED NARRATIVE: Placeholder text with [TOKEN].",
    },
    disclosures_generated: ["This report is for internal use only."],
    citations: ["run_id:RUN-001", "policy_id:POL-001"],
    model_version: "claude-opus-4-6",
    generated_at: "2026-02-23T10:00:00Z",
    is_ai_assisted: true,
    ...overrides,
  };
}

// ─── ReportSection shape ──────────────────────────────────────────────────────

describe("ReportSection shape", () => {
  test("has all required fields", () => {
    const s = makeSection();
    expect(s).toHaveProperty("id");
    expect(s).toHaveProperty("type");
    expect(s).toHaveProperty("title");
    expect(s).toHaveProperty("order");
    expect(s).toHaveProperty("status");
    expect(s).toHaveProperty("params");
    expect(s).toHaveProperty("ai_assisted");
    expect(s).toHaveProperty("citations");
    expect(s).toHaveProperty("page_break_before");
  });

  test("params is an array", () => {
    const s = makeSection({ params: [] });
    expect(Array.isArray(s.params)).toBe(true);
  });

  test("citations is an array of strings", () => {
    const s = makeSection({ citations: ["run_id:001", "policy_id:POL-001"] });
    expect(Array.isArray(s.citations)).toBe(true);
    s.citations.forEach(c => expect(typeof c).toBe("string"));
  });

  test("status is one of the valid enum values", () => {
    const validStatuses = ["INCLUDED", "EXCLUDED", "DRAFT"];
    const s = makeSection({ status: "INCLUDED" });
    expect(validStatuses).toContain(s.status);
  });

  test("narrative is optional string", () => {
    const s1 = makeSection();
    const s2 = makeSection({ narrative: "AI-ASSISTED NARRATIVE: Overview of [EXPOSURE]." });
    expect(s1.narrative).toBeUndefined();
    expect(typeof s2.narrative).toBe("string");
  });
});

// ─── ReportTemplate shape ─────────────────────────────────────────────────────

describe("ReportTemplate shape", () => {
  test("has all required fields", () => {
    const t = makeTemplate();
    expect(t).toHaveProperty("template_id");
    expect(t).toHaveProperty("version");
    expect(t).toHaveProperty("name");
    expect(t).toHaveProperty("short_name");
    expect(t).toHaveProperty("description");
    expect(t).toHaveProperty("category");
    expect(t).toHaveProperty("audience");
    expect(t).toHaveProperty("modules");
    expect(t).toHaveProperty("default_sections");
    expect(t).toHaveProperty("required_inputs");
    expect(t).toHaveProperty("default_export_format");
    expect(t).toHaveProperty("is_system");
    expect(t).toHaveProperty("tags");
    expect(t).toHaveProperty("estimated_pages");
    expect(t).toHaveProperty("created_at");
    expect(t).toHaveProperty("updated_at");
  });

  test("audience is a non-empty array", () => {
    const t = makeTemplate();
    expect(Array.isArray(t.audience)).toBe(true);
    expect(t.audience.length).toBeGreaterThan(0);
  });

  test("modules is a non-empty array", () => {
    const t = makeTemplate();
    expect(Array.isArray(t.modules)).toBe(true);
    expect(t.modules.length).toBeGreaterThan(0);
  });

  test("default_sections includes Omit<id> sections", () => {
    const t = makeTemplate();
    t.default_sections.forEach(s => {
      // default_sections omits 'id' — they should NOT have an id property
      expect(s).not.toHaveProperty("id");
      expect(s).toHaveProperty("type");
      expect(s).toHaveProperty("order");
    });
  });

  test("version is a positive integer", () => {
    const t = makeTemplate({ version: 1 });
    expect(Number.isInteger(t.version)).toBe(true);
    expect(t.version).toBeGreaterThan(0);
  });
});

// ─── ReportDefinition shape ───────────────────────────────────────────────────

describe("ReportDefinition shape", () => {
  test("has all required fields", () => {
    const d = makeDefinition();
    expect(d).toHaveProperty("report_id");
    expect(d).toHaveProperty("template_id");
    expect(d).toHaveProperty("template_version");
    expect(d).toHaveProperty("name");
    expect(d).toHaveProperty("description");
    expect(d).toHaveProperty("owner");
    expect(d).toHaveProperty("tenant_id");
    expect(d).toHaveProperty("status");
    expect(d).toHaveProperty("sections");
    expect(d).toHaveProperty("bindings");
    expect(d).toHaveProperty("export_formats");
    expect(d).toHaveProperty("tags");
    expect(d).toHaveProperty("version");
    expect(d).toHaveProperty("created_at");
    expect(d).toHaveProperty("updated_at");
  });

  test("status is a valid ReportStatus value", () => {
    const validStatuses = ["DRAFT", "REVIEW", "APPROVED", "FINAL", "ARCHIVED"];
    const d = makeDefinition({ status: "DRAFT" });
    expect(validStatuses).toContain(d.status);
  });

  test("sections is an array", () => {
    const d = makeDefinition();
    expect(Array.isArray(d.sections)).toBe(true);
  });

  test("export_formats is an array", () => {
    const d = makeDefinition({ export_formats: ["PDF", "EXCEL"] });
    expect(Array.isArray(d.export_formats)).toBe(true);
    expect(d.export_formats.length).toBeGreaterThan(0);
  });

  test("schedule is optional", () => {
    const d1 = makeDefinition();
    const schedule: ReportSchedule = {
      frequency: "MONTHLY",
      recipients: ["cfo@corp.com"],
      auto_export_format: "PDF",
      active: true,
    };
    const d2 = makeDefinition({ schedule });
    expect(d1.schedule).toBeUndefined();
    expect(d2.schedule).toBeDefined();
    expect(d2.schedule?.frequency).toBe("MONTHLY");
  });

  test("ai_plan is optional", () => {
    const d1 = makeDefinition();
    const d2 = makeDefinition({ ai_plan: makePlan() });
    expect(d1.ai_plan).toBeUndefined();
    expect(d2.ai_plan).toBeDefined();
  });
});

// ─── DataBindings shape ───────────────────────────────────────────────────────

describe("DataBindings shape", () => {
  test("all fields are optional — empty bindings is valid", () => {
    const b: DataBindings = {};
    expect(Object.keys(b)).toHaveLength(0);
  });

  test("can have all fields populated", () => {
    const b: DataBindings = {
      run_envelope_id: "RUN-001",
      portfolio_snapshot_id: "PORT-SNAP-001",
      market_snapshot_id: "MKT-SNAP-001",
      policy_id: "POL-001",
      policy_version: 3,
      connector_run_ids: ["CR-001", "CR-002"],
      scenario_pack: "CRISIS_2024",
      as_of_date: "2026-02-23",
      reporting_currency: "USD",
      period_start: "2026-01-01",
      period_end: "2026-03-31",
    };
    expect(b.run_envelope_id).toBe("RUN-001");
    expect(b.policy_version).toBe(3);
    expect(Array.isArray(b.connector_run_ids)).toBe(true);
  });
});

// ─── AIReportPlan governance shape ───────────────────────────────────────────

describe("AIReportPlan governance shape", () => {
  test("is_ai_assisted is always true (literal type)", () => {
    const plan = makePlan();
    expect(plan.is_ai_assisted).toBe(true);
    expect(plan.is_ai_assisted).toStrictEqual(true);
  });

  test("narrative_scaffolds is a Record<string, string>", () => {
    const plan = makePlan();
    expect(typeof plan.narrative_scaffolds).toBe("object");
    Object.entries(plan.narrative_scaffolds).forEach(([k, v]) => {
      expect(typeof k).toBe("string");
      expect(typeof v).toBe("string");
    });
  });

  test("disclosures_generated is an array of strings", () => {
    const plan = makePlan();
    expect(Array.isArray(plan.disclosures_generated)).toBe(true);
    plan.disclosures_generated.forEach(d => expect(typeof d).toBe("string"));
  });

  test("citations is an array of strings", () => {
    const plan = makePlan();
    expect(Array.isArray(plan.citations)).toBe(true);
    plan.citations.forEach(c => expect(typeof c).toBe("string"));
  });

  test("generated_at is a valid ISO date string", () => {
    const plan = makePlan();
    const d = new Date(plan.generated_at);
    expect(isNaN(d.getTime())).toBe(false);
  });

  test("goal_description is a non-empty string", () => {
    const plan = makePlan({ goal_description: "Q1 board review" });
    expect(plan.goal_description.trim().length).toBeGreaterThan(0);
  });
});

// ─── ReportValidationIssue shape ──────────────────────────────────────────────

describe("ReportValidationIssue shape", () => {
  test("has code, severity, and message fields", () => {
    const issue: ReportValidationIssue = {
      code: "MISSING_BINDING",
      severity: "ERROR",
      message: "run_envelope_id is required but not bound.",
      suggestion: "Bind a run_id in the Data Bindings step.",
    };
    expect(issue.code).toBe("MISSING_BINDING");
    expect(["ERROR", "WARNING", "INFO"]).toContain(issue.severity);
    expect(issue.message.length).toBeGreaterThan(0);
  });

  test("section_id and suggestion are optional", () => {
    const issue: ReportValidationIssue = {
      code: "STALE_SNAPSHOT",
      severity: "WARNING",
      message: "Market snapshot is older than 24 hours.",
    };
    expect(issue.section_id).toBeUndefined();
    expect(issue.suggestion).toBeUndefined();
  });
});

// ─── DisclosureEntry & AssumptionEntry shapes ─────────────────────────────────

describe("DisclosureEntry shape", () => {
  test("has all required fields", () => {
    const d: DisclosureEntry = {
      id: "disc-001",
      category: "REGULATORY",
      text: "This report references IFRS 9 hedge accounting criteria.",
      applies_to: ["HEDGE_EFFICIENCY", "POLICY_COMPLIANCE"],
      mandatory: true,
    };
    expect(d.id).toBe("disc-001");
    expect(["REGULATORY", "METHODOLOGY", "DATA", "LIMITATION", "LEGAL"]).toContain(d.category);
    expect(Array.isArray(d.applies_to)).toBe(true);
    expect(typeof d.mandatory).toBe("boolean");
  });
});

describe("AssumptionEntry shape", () => {
  test("has all required fields", () => {
    const a: AssumptionEntry = {
      id: "asmp-001",
      label: "Hedge Ratio — Confirmed",
      value: "80%",
      source: "Policy v3 §4.2",
      applies_to: ["POLICY_COMPLIANCE", "HEDGE_PLAN_TABLE"],
    };
    expect(a.id).toBe("asmp-001");
    expect(a.value).toBe("80%");
    expect(a.source).toContain("Policy");
    expect(Array.isArray(a.applies_to)).toBe(true);
  });
});
