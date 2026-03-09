/**
 * policyDetailDrawer.test.ts
 *
 * Unit tests for PolicyDetailDrawer supporting logic.
 * Since this project uses Jest without React Testing Library, these tests
 * validate the data contracts, effectiveness scoring integration, and
 * prop interface correctness that the drawer component relies on.
 */

import { POLICY_PRESETS } from "../../constants/policyPresets";
import type { PolicyPreset } from "../../constants/policyPresets";
import {
  computeEffectivenessScore,
  getEffectivenessColor,
} from "../../utils/policyEffectivenessScore";
import type { PolicyTemplate } from "../../api/policyClient";

// ── Design tokens (mirrors the drawer's S object) ─────────────────────────────

const S = {
  fontUI: "var(--font-terminal,'IBM Plex Sans',sans-serif)",
  fontMono: "var(--font-terminal-mono,'IBM Plex Mono',monospace)",
  bgDeep: "var(--bg-deep)",
  bgPanel: "var(--bg-panel)",
  bgSub: "var(--bg-sub,var(--bg-panel))",
  rim: "var(--border-rim)",
  soft: "var(--border-soft)",
  primary: "var(--text-primary)",
  secondary: "var(--text-secondary)",
  tertiary: "var(--text-tertiary)",
  cyan: "var(--accent-cyan,#22d3ee)",
  amber: "var(--accent-amber,#fbbf24)",
  pass: "var(--status-pass,#4ade80)",
  red: "var(--accent-red,#f87171)",
} as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeDbTemplate(overrides: Partial<PolicyTemplate> = {}): PolicyTemplate {
  return {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    company_id: null,
    name: "Test Template",
    short_name: "TEST",
    description: "A test template",
    risk_posture: "MODERATE",
    category: "CORPORATE",
    config: {
      bucket_mode: "CALENDAR_MONTH",
      hedge_ratios: { confirmed: 0.8, forecast: 0.5 },
      cost_assumptions: { spread_bps: 5.0 },
      execution_product: "NDF",
      min_trade_size_usd: 50000,
    },
    version: 3,
    is_system: true,
    status: "ACTIVE",
    created_at: "2026-01-15T10:30:00Z",
    updated_at: "2026-03-01T14:22:00Z",
    ...overrides,
  };
}

// ── Section 1: Preset data contract ────────────────────────────────────────────

describe("PolicyDetailDrawer — preset data contract", () => {
  it("every preset has the fields the drawer reads", () => {
    for (const preset of POLICY_PRESETS) {
      // Identity section fields
      expect(preset.category).toBeDefined();
      expect(["CORPORATE", "FINANCIAL", "SOVEREIGN", "SECTOR"]).toContain(
        preset.category,
      );
      expect(preset.riskPosture).toBeDefined();
      expect(["CONSERVATIVE", "MODERATE", "AGGRESSIVE"]).toContain(
        preset.riskPosture,
      );
      expect(preset.governance_tier).toBeDefined();
      expect(["STANDARD", "ENHANCED", "COMMITTEE"]).toContain(
        preset.governance_tier,
      );
      expect(preset.maturity_profile).toBeDefined();
      expect(["SHORT", "MEDIUM", "LONG", "MIXED"]).toContain(
        preset.maturity_profile,
      );
      expect(preset.accounting_mode).toBeDefined();
      expect(["FAIR_VALUE", "CASH_FLOW_HEDGE", "NET_INVESTMENT", "NONE"]).toContain(
        preset.accounting_mode,
      );
      expect(preset.evidence_grade).toBeDefined();
      expect(["BASIC", "DOCUMENTED", "AUDITED"]).toContain(
        preset.evidence_grade,
      );

      // Description section
      expect(typeof preset.description).toBe("string");
      expect(preset.description.length).toBeGreaterThan(0);
      expect(typeof preset.rationale).toBe("string");
      expect(preset.rationale.length).toBeGreaterThan(0);
      expect(typeof preset.targetAudience).toBe("string");
      expect(preset.targetAudience.length).toBeGreaterThan(0);

      // Methodology section
      expect(typeof preset.formula).toBe("string");
      expect(typeof preset.formulaExplain).toBe("string");
    }
  });
});

// ── Section 2: Effect surface (kernel-consumed fields) ─────────────────────────

describe("PolicyDetailDrawer — effect surface kernel fields", () => {
  it("every preset has all 5 kernel-consumed fields", () => {
    for (const preset of POLICY_PRESETS) {
      const p = preset.policy;
      expect(typeof p.hedge_ratios.confirmed).toBe("number");
      expect(typeof p.hedge_ratios.forecast).toBe("number");
      expect(typeof p.cost_assumptions.spread_bps).toBe("number");
      expect(typeof p.execution_product).toBe("string");
      expect(typeof p.min_trade_size_usd).toBe("number");
    }
  });

  it("confirmed ratio renders as percentage correctly", () => {
    const preset = POLICY_PRESETS.find((p) => p.id === "full-protection");
    expect(preset).toBeDefined();
    expect(Math.round(preset!.policy.hedge_ratios.confirmed * 100)).toBe(100);
    expect(Math.round(preset!.policy.hedge_ratios.forecast * 100)).toBe(100);
  });

  it("min_trade_size_usd = 0 renders as 'None'", () => {
    const sme = POLICY_PRESETS.find((p) => p.id === "small-business");
    expect(sme).toBeDefined();
    expect(sme!.policy.min_trade_size_usd).toBe(0);
    // Drawer logic: min_trade_size_usd === 0 ? "None" : formatted
    const display =
      sme!.policy.min_trade_size_usd === 0
        ? "None"
        : `$${sme!.policy.min_trade_size_usd.toLocaleString()}`;
    expect(display).toBe("None");
  });

  it("non-zero min_trade_size_usd renders with dollar formatting", () => {
    const full = POLICY_PRESETS.find((p) => p.id === "full-protection");
    expect(full).toBeDefined();
    expect(full!.policy.min_trade_size_usd).toBeGreaterThan(0);
    const display = `$${full!.policy.min_trade_size_usd.toLocaleString()}`;
    expect(display).toMatch(/^\$[\d,]+$/);
  });
});

// ── Section 3: Effectiveness score integration ─────────────────────────────────

describe("PolicyDetailDrawer — effectiveness score", () => {
  it("computes a valid score for every preset", () => {
    for (const preset of POLICY_PRESETS) {
      const result = computeEffectivenessScore(
        preset.policy,
        preset.riskPosture,
      );
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(["INSTITUTIONAL", "STRONG", "MODERATE", "BASIC"]).toContain(
        result.badge,
      );
      expect(result.grading).toBe("HEURISTIC");
    }
  });

  it("returns all 5 component breakdowns with rationale strings", () => {
    const preset = POLICY_PRESETS[0];
    const result = computeEffectivenessScore(
      preset.policy,
      preset.riskPosture,
    );
    const keys = Object.keys(result.components);
    expect(keys).toEqual(
      expect.arrayContaining([
        "coverage",
        "efficiency",
        "ifrs9",
        "product",
        "sizeAccess",
      ]),
    );
    for (const comp of Object.values(result.components)) {
      expect(typeof comp.score).toBe("number");
      expect(typeof comp.max).toBe("number");
      expect(typeof comp.rationale).toBe("string");
      expect(comp.rationale.length).toBeGreaterThan(0);
    }
  });

  it("getEffectivenessColor returns a valid CSS value for all score tiers", () => {
    const sObj = S as unknown as Record<string, string>;
    // INSTITUTIONAL (>=85)
    expect(getEffectivenessColor(90, sObj)).toBe(S.cyan);
    // STRONG (>=70)
    expect(getEffectivenessColor(75, sObj)).toBe(S.pass);
    // MODERATE (>=50)
    expect(getEffectivenessColor(55, sObj)).toBe(S.amber);
    // BASIC (<50)
    const lowColor = getEffectivenessColor(30, sObj);
    // S has no "fail" key, so fallback to #f87171
    expect(lowColor).toBe("#f87171");
  });
});

// ── Section 4: Provenance section logic ────────────────────────────────────────

describe("PolicyDetailDrawer — provenance logic", () => {
  it("system template shows SYSTEM PRESET source", () => {
    const db = makeDbTemplate({ is_system: true });
    const source = db.is_system
      ? "SYSTEM PRESET \u00B7 SEEDED"
      : "CUSTOM \u00B7 unknown";
    expect(source).toBe("SYSTEM PRESET \u00B7 SEEDED");
  });

  it("custom template shows CUSTOM source", () => {
    const db = makeDbTemplate({ is_system: false });
    const source = db.is_system
      ? "SYSTEM PRESET \u00B7 SEEDED"
      : "CUSTOM \u00B7 unknown";
    expect(source).toBe("CUSTOM \u00B7 unknown");
  });

  it("no dbTemplate shows LOCAL PRESET source", () => {
    const dbTemplate: PolicyTemplate | null = null;
    const source = dbTemplate
      ? dbTemplate.is_system
        ? "SYSTEM PRESET \u00B7 SEEDED"
        : "CUSTOM \u00B7 unknown"
      : "LOCAL PRESET \u00B7 NO DB RECORD";
    expect(source).toBe("LOCAL PRESET \u00B7 NO DB RECORD");
  });

  it("template ID shows first 8 chars uppercased", () => {
    const db = makeDbTemplate({ id: "abcdef12-3456-7890-abcd-ef1234567890" });
    expect(db.id.slice(0, 8).toUpperCase()).toBe("ABCDEF12");
  });

  it("version renders with v prefix", () => {
    const db = makeDbTemplate({ version: 7 });
    expect(`v${db.version}`).toBe("v7");
  });

  it("created_at formats as a date string", () => {
    const db = makeDbTemplate({ created_at: "2026-02-15T08:00:00Z" });
    const formatted = new Date(db.created_at).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
    expect(typeof formatted).toBe("string");
    expect(formatted.length).toBeGreaterThan(0);
  });
});

// ── Section 5: Risk posture color mapping ──────────────────────────────────────

describe("PolicyDetailDrawer — risk posture colors", () => {
  function riskPostureColor(posture: string): string {
    switch (posture.toUpperCase()) {
      case "CONSERVATIVE":
        return S.pass;
      case "MODERATE":
        return S.amber;
      case "AGGRESSIVE":
        return S.red;
      default:
        return S.tertiary;
    }
  }

  it("maps CONSERVATIVE to green (pass)", () => {
    expect(riskPostureColor("CONSERVATIVE")).toBe(S.pass);
  });

  it("maps MODERATE to amber", () => {
    expect(riskPostureColor("MODERATE")).toBe(S.amber);
  });

  it("maps AGGRESSIVE to red", () => {
    expect(riskPostureColor("AGGRESSIVE")).toBe(S.red);
  });
});

// ── Section 6: Governance tier color mapping ───────────────────────────────────

describe("PolicyDetailDrawer — governance tier colors", () => {
  function governanceTierColor(tier: string): string {
    switch (tier.toUpperCase()) {
      case "STANDARD":
        return S.pass;
      case "ENHANCED":
        return S.amber;
      case "COMMITTEE":
        return S.red;
      default:
        return S.tertiary;
    }
  }

  it("maps STANDARD to green (pass)", () => {
    expect(governanceTierColor("STANDARD")).toBe(S.pass);
  });

  it("maps ENHANCED to amber", () => {
    expect(governanceTierColor("ENHANCED")).toBe(S.amber);
  });

  it("maps COMMITTEE to red", () => {
    expect(governanceTierColor("COMMITTEE")).toBe(S.red);
  });
});

// ── Section 7: Field classification categories ─────────────────────────────────

describe("PolicyDetailDrawer — field classification", () => {
  const classifications = [
    {
      category: "KERNEL-BOUND",
      fields: "hedge_ratios, spread_bps, min_trade, product",
      status: "LIVE -- affects calculation",
    },
    {
      category: "OVERLAY CONTROLS",
      fields: "volatility, geopolitical, scenarios, effectiveness",
      status: "DISABLED BY DEFAULT",
    },
    {
      category: "GOVERNANCE",
      fields: "dual_key, governance_tier, evidence_grade",
      status: "AUDIT ONLY",
    },
    {
      category: "INFORMATIONAL",
      fields: "description, rationale, target_audience, formula",
      status: "DISPLAY ONLY",
    },
  ];

  it("has exactly 4 classification rows", () => {
    expect(classifications).toHaveLength(4);
  });

  it("KERNEL-BOUND contains the 4 engine-consumed field names", () => {
    const kb = classifications.find((c) => c.category === "KERNEL-BOUND");
    expect(kb).toBeDefined();
    expect(kb!.fields).toContain("hedge_ratios");
    expect(kb!.fields).toContain("spread_bps");
    expect(kb!.fields).toContain("min_trade");
    expect(kb!.fields).toContain("product");
    expect(kb!.status).toContain("LIVE");
  });

  it("OVERLAY CONTROLS are disabled by default", () => {
    const oc = classifications.find((c) => c.category === "OVERLAY CONTROLS");
    expect(oc).toBeDefined();
    expect(oc!.status).toBe("DISABLED BY DEFAULT");
  });
});

// ── Section 8: onOpenAudit callback contract ───────────────────────────────────

describe("PolicyDetailDrawer — onOpenAudit callback", () => {
  it("passes templateId, name, and shortName to callback", () => {
    const db = makeDbTemplate({ id: "test-uuid-1234" });
    const preset: Pick<PolicyPreset, "name" | "shortName"> = {
      name: "Balanced Corporate",
      shortName: "BLNC",
    };
    const calls: [string, string, string][] = [];
    const onOpenAudit = (tid: string, n: string, c: string) => {
      calls.push([tid, n, c]);
    };

    // Simulate the drawer's onClick handler
    onOpenAudit(db.id, preset.name, preset.shortName);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(["test-uuid-1234", "Balanced Corporate", "BLNC"]);
  });

  it("onOpenAudit is not called when dbTemplate is null", () => {
    const dbTemplate: PolicyTemplate | null = null;
    const calls: string[] = [];
    const onOpenAudit = (tid: string) => {
      calls.push(tid);
    };

    // The drawer only renders the button when onOpenAudit && dbTemplate
    if (onOpenAudit && dbTemplate) {
      onOpenAudit(dbTemplate.id);
    }

    expect(calls).toHaveLength(0);
  });
});
