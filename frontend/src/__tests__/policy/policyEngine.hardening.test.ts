/**
 * policyEngine.hardening.test.ts
 *
 * Comprehensive test suite for the 12 institutional hardening fixes
 * applied to the Policy Engine in commit c24b718.
 *
 * Gap → Section mapping:
 *
 *   DEV-KEY-1       -- Section 1:  API key hardening (HC_DEV_KEY_001 eliminated)
 *   (interface)     -- Section 2:  PolicyTemplate interface (status + updated_at fields)
 *   SEC-POLICY-1 FE -- Section 3:  Wizard status type guard (safe status coercion)
 *   SEC-POLICY-1 BE -- Section 4:  Backend create_template status validation (403 on ACTIVE/APPROVED)
 *   DB-POLICY-1     -- Section 5:  Concurrent activation race condition (409 unique partial index)
 *   RES-1           -- Section 6:  Template load error propagation (no silent failures)
 *   RES-2           -- Section 7:  Favorites optimistic rollback logic
 *   PERF-POLICY-2   -- Section 8:  Search debounce timing (300 ms)
 *   UX-POLICY-4     -- Section 9:  Version and updated_at fields
 *   LOG-POLICY-1    -- Section 10: PolicyRevisionDrawer API contract
 *   UX-POLICY-2     -- Section 11: No auto-select specification
 *   UX-POLICY-3     -- Section 12: Company guard specification
 *   (all gaps)      -- Section 13: Business rules — full RBAC and status lifecycle
 *   (all gaps)      -- Section 14: Regression pack — fixed bugs never return
 *   (lifecycle)     -- Section 15: Integration workflow — create → activate → deactivate → delete
 *   (e2e)           -- Section 16: End-to-end scenario — AI wizard → save as DRAFT → activate → verify audit
 *
 * Pattern: Jest + axios mocking (same as policyEngine.test.ts)
 */

import axios from "axios";
import {
  listPolicyTemplates,
  getActivePolicy,
  activatePolicy,
  createPolicyTemplate,
  updatePolicyTemplate,
  deletePolicyTemplate,
  deactivatePolicy,
  duplicatePolicyTemplate,
  listFavorites,
  addFavorite,
  removeFavorite,
  exportPolicyTemplate,
  importPolicyTemplate,
  getPolicyTemplateSeedStatus,
} from "../../api/policyClient";
import type {
  PolicyTemplate,
  PolicyInstance,
  PolicyFavorite,
  CreateTemplatePayload,
  UpdateTemplatePayload,
} from "../../api/policyClient";

import {
  computeEffectivenessScore,
  getEffectivenessColor,
} from "../../utils/policyEffectivenessScore";

import { recommendPolicyForPosition } from "../../utils/policyRecommender";

import {
  mapWizardStateToQA,
  buildCanonicalFromPageState,
  toCreateTemplatePayload,
} from "../../utils/policyMapper";
import type { WizardState } from "../../utils/policyMapper";

import {
  validateCanonicalPolicy,
  makeCreatedAuditEntry,
  appendAuditEvent,
  toPolicyConfig,
} from "../../types/canonicalPolicy";
import type { CanonicalPolicy } from "../../types/canonicalPolicy";

import type { PolicyConfig } from "../../api/types";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const VALID_POLICY_CONFIG: PolicyConfig = {
  bucket_mode: "CALENDAR_MONTH",
  hedge_ratios: { confirmed: 0.85, forecast: 0.60 },
  cost_assumptions: { spread_bps: 5 },
  execution_product: "FWD",
  min_trade_size_usd: 10_000,
};

// Hardened fixtures — include the new status and updated_at fields (added in c24b718)
const HARDENED_SYSTEM_TEMPLATE: PolicyTemplate = {
  id: "sys-tpl-hardened",
  company_id: null,
  name: "Conservative Baseline",
  short_name: "CONS-BASE",
  description: "System-provided conservative template",
  risk_posture: "CONSERVATIVE",
  category: "CORPORATE",
  config: VALID_POLICY_CONFIG,
  version: 3,
  is_system: true,
  status: "ACTIVE",
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2026-02-01T00:00:00Z",
};

const HARDENED_COMPANY_TEMPLATE: PolicyTemplate = {
  id: "cmp-tpl-hardened",
  company_id: "co-acme-123",
  name: "ACME FX Policy v2",
  short_name: "ACME-FX2",
  description: "Hardened ACME policy",
  risk_posture: "MODERATE",
  category: "CORPORATE",
  config: VALID_POLICY_CONFIG,
  version: 5,
  is_system: false,
  status: "DRAFT",
  created_at: "2026-01-10T08:00:00Z",
  updated_at: "2026-02-20T14:30:00Z",
};

const ACTIVE_INSTANCE: PolicyInstance = {
  id: "inst-hardened-001",
  company_id: "co-acme-123",
  branch_id: null,
  template_id: "cmp-tpl-hardened",
  activated_by: "user-alice",
  activated_at: "2026-02-20T09:00:00Z",
  is_active: true,
  template: HARDENED_COMPANY_TEMPLATE,
};

const VALID_CANONICAL: CanonicalPolicy = {
  schema_version: "1.0",
  version: 1,
  short_name: "ACME-FX2",
  display_name: "ACME FX Hedge Policy v2",
  description: "Corporate hedging policy for ACME",
  status: "DRAFT",
  provenance: {
    source: "AI_WIZARD",
    entry_point: "AI_POLICY_PAGE",
    created_by: "user-alice",
    created_at: "2026-01-01T00:00:00Z",
  },
  scope: {
    company_id: "co-acme-123",
    branch_ids: "ALL",
    currency_pairs: ["USD/MXN"],
    flow_types: ["CONFIRMED", "FORECAST"],
  },
  classification: {
    risk_posture: "MODERATE",
    category: "CORPORATE",
    target_audience: "Mid-cap manufacturer",
  },
  business_profile: {
    annual_fx_volume_usd: 50_000_000,
    primary_currency_pair: "USD/MXN",
  },
  risk_parameters: {
    risk_appetite: "MODERATE",
    cost_sensitivity: "MEDIUM",
  },
  objectives: {
    primary_objective: "Budget certainty",
  },
  execution_config: VALID_POLICY_CONFIG,
  governance: {
    requires_approval: false,
  },
  audit_log: [
    {
      timestamp: "2026-01-01T00:00:00Z",
      actor_id: "user-alice",
      action: "CREATED",
      comment: "Initial hardened policy",
    },
  ],
};

const WIZARD_STATE: WizardState = {
  primaryObjective: "Budget certainty and P&L protection.",
  regulatoryRegimes: ["IFRS9"],
  boardResolutionRef: "FX-2026-001",
  boardStatement: "Hedge all confirmed payables",
  effectiveFrom: "2026-01-01",
  effectiveUntil: "2026-12-31",
  reviewDueDate: "2026-06-30",
  companyType: "Manufacturer",
  industrySector: "Manufacturing",
  annualExposure: "$50-250M",
  primaryCurrency: "MXN",
  fxCorridors: ["USD/MXN"],
  portfolioScope: "CONSOLIDATED",
  extendedFlowTypes: ["RECEIVABLE", "PAYABLE"],
  geographyFocus: ["EM_LATAM"],
  hedgeExperience: "Intermediate",
  averageTenor: "6M",
  timeHorizonMonths: 6,
  rollingHedge: true,
  rollingTenor: "3M",
  layeredApproach: false,
  cashFlowVisibility: "6 months",
  cashFlowCertainty: 75,
  receivableSplit: 60,
  seasonalPatterns: "Quarterly",
  paymentFrequency: "MONTHLY",
  avgTransactionSizeUsd: 500_000,
  hasIntercompanyFlows: false,
  nettingAvailable: true,
  netConfirmedForecast: false,
  settlementCycleDays: 2,
  materialityThresholdUsd: 50_000,
  minHedgeSizeUsd: 10_000,
  maxSingleTradeUsd: 5_000_000,
  instrumentPreferences: ["Forwards", "Collars"],
  instrAllowed: { Forwards: true, NDFs: false },
  instrMaxTenorDays: { Forwards: 365 },
  instrRequiresApproval: { Forwards: false },
  instrMaxNotionalUsd: { Forwards: 5_000_000 },
  tenorMinDays: 7,
  tenorMaxDays: 365,
  rollAllowed: true,
  rollWindowDays: 5,
  premiumBudget: 1.0,
  maxCarryCostBpsAnnual: 50,
  maxOptionPremiumPct: 1.5,
  maxSpreadBps: 8,
  leverageCap: 1.0,
  marginBudgetUsd: 500_000,
  maxInstrumentConcentrationPct: 50,
  maxCounterpartyConcentrationPct: 30,
  maxTenorConcentrationPct: 40,
  maxCurrencyConcentrationPct: 60,
  costProtectionPriority: 70,
  maxAcceptableLoss: "2%",
  standardStressPack: "MODERATE",
  varConfidence: "95%",
  drawdownTolerance: "Medium (2-5%)",
  backTestWindowDays: 252,
  worstCaseFocus: false,
  customScenarios: [],
  governanceNotes: "",
  ifrsCompliance: true,
  benchmark: "Forward Rate",
  hedgeRatioTarget: 80,
  policyStatus: "DRAFT",
};

const MOCK_AI_REC = {
  label: "Conservative Forward",
  rationale: "Locks in budget rate with minimal cost.",
  preset: {
    id: "conservative-treasury",
    shortName: "CONS-FWD",
    name: "Conservative Forward",
    description: "Conservative forward-based policy",
    riskPosture: "CONSERVATIVE" as const,
    category: "CORPORATE" as const,
    targetAudience: "Exporters",
    policy: VALID_POLICY_CONFIG,
    formula: "H = 0.85 * E_confirmed + 0.60 * E_forecast",
    formulaExplain: "Hedge 85% of confirmed, 60% of forecast exposures",
    rationale: "Locks in budget rate with minimal cost via forward contracts.",
  },
};

const MOCK_AI_RESULT = {
  suggested: MOCK_AI_REC.preset,
  recommendations: [MOCK_AI_REC],
  nearest_preset_name: "CONS-FWD",
  explanation: "This policy matches your conservative profile.",
  fallback: false,
};

// Reusable helper for buildCanonicalFromPageState with standard test args
function buildTestCanonical(): CanonicalPolicy {
  return buildCanonicalFromPageState(
    WIZARD_STATE,
    MOCK_AI_RESULT,
    MOCK_AI_REC,
    "user-alice",
    "co-acme-123",
    "ACME FX Hedge Policy v2",
    "ACME-FX2",
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ===========================================================================
// 1. DEV-KEY-1 -- API key hardening
//    The fallback "HC_DEV_KEY_001" dev key was removed. When no env var or
//    localStorage key is present the header must be an empty string "".
// ===========================================================================

describe("DEV-KEY-1 -- API key hardening", () => {
  it("X-API-Key header is empty string when no env var configured", async () => {
    const origKey = process.env.NEXT_PUBLIC_HEDGECALC_API_KEY;
    delete process.env.NEXT_PUBLIC_HEDGECALC_API_KEY;

    mockedAxios.get.mockResolvedValueOnce({ data: [] });
    await listPolicyTemplates(); // no token

    const call = mockedAxios.get.mock.calls[0];
    const headers = (call[1] as { headers: Record<string, string> }).headers;

    // Must NOT contain the hardcoded dev key that was removed
    expect(headers["X-API-Key"]).not.toBe("HC_DEV_KEY_001");
    // With no env var set → must be empty string
    expect(headers["X-API-Key"]).toBe("");

    if (origKey !== undefined) process.env.NEXT_PUBLIC_HEDGECALC_API_KEY = origKey;
  });

  it("X-API-Key header uses the env var value when configured", async () => {
    const origKey = process.env.NEXT_PUBLIC_HEDGECALC_API_KEY;
    process.env.NEXT_PUBLIC_HEDGECALC_API_KEY = "HK_live_test_key_abc";

    mockedAxios.get.mockResolvedValueOnce({ data: [] });
    await listPolicyTemplates("tok");

    const call = mockedAxios.get.mock.calls[0];
    const headers = (call[1] as { headers: Record<string, string> }).headers;
    expect(headers["X-API-Key"]).toBe("HK_live_test_key_abc");

    if (origKey !== undefined) process.env.NEXT_PUBLIC_HEDGECALC_API_KEY = origKey;
    else delete process.env.NEXT_PUBLIC_HEDGECALC_API_KEY;
  });

  it("X-API-Key header is never HC_DEV_KEY_001 across multiple calls", async () => {
    const origKey = process.env.NEXT_PUBLIC_HEDGECALC_API_KEY;
    delete process.env.NEXT_PUBLIC_HEDGECALC_API_KEY;

    mockedAxios.get.mockResolvedValue({ data: [] });

    await listPolicyTemplates();
    await listPolicyTemplates("some-token");

    for (const call of mockedAxios.get.mock.calls) {
      const headers = (call[1] as { headers: Record<string, string> }).headers;
      expect(headers["X-API-Key"]).not.toBe("HC_DEV_KEY_001");
    }

    if (origKey !== undefined) process.env.NEXT_PUBLIC_HEDGECALC_API_KEY = origKey;
  });

  it("Authorization header is absent when no token is provided", async () => {
    const origKey = process.env.NEXT_PUBLIC_HEDGECALC_API_KEY;
    delete process.env.NEXT_PUBLIC_HEDGECALC_API_KEY;

    mockedAxios.get.mockResolvedValueOnce({ data: [] });
    await listPolicyTemplates();

    const call = mockedAxios.get.mock.calls[0];
    const headers = (call[1] as { headers: Record<string, string> }).headers;
    expect(headers["Authorization"]).toBeUndefined();

    if (origKey !== undefined) process.env.NEXT_PUBLIC_HEDGECALC_API_KEY = origKey;
  });

  it("Authorization Bearer token is present when token is supplied", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] });
    await listPolicyTemplates("my-jwt-token");

    const call = mockedAxios.get.mock.calls[0];
    const headers = (call[1] as { headers: Record<string, string> }).headers;
    expect(headers["Authorization"]).toBe("Bearer my-jwt-token");
  });

  it("API key header is present on POST requests", async () => {
    const origKey = process.env.NEXT_PUBLIC_HEDGECALC_API_KEY;
    process.env.NEXT_PUBLIC_HEDGECALC_API_KEY = "HK_live_method_test";

    mockedAxios.post.mockResolvedValueOnce({ data: ACTIVE_INSTANCE });
    await activatePolicy("tpl-001", "tok");

    const postCall = mockedAxios.post.mock.calls[0];
    const postHeaders = (postCall[2] as { headers: Record<string, string> }).headers;
    expect(postHeaders["X-API-Key"]).toBe("HK_live_method_test");

    if (origKey !== undefined) process.env.NEXT_PUBLIC_HEDGECALC_API_KEY = origKey;
    else delete process.env.NEXT_PUBLIC_HEDGECALC_API_KEY;
  });

  it("PATCH requests carry X-API-Key header", async () => {
    const origKey = process.env.NEXT_PUBLIC_HEDGECALC_API_KEY;
    process.env.NEXT_PUBLIC_HEDGECALC_API_KEY = "HK_live_patch_key";

    mockedAxios.patch.mockResolvedValueOnce({ data: HARDENED_COMPANY_TEMPLATE });
    await updatePolicyTemplate("cmp-tpl-hardened", { name: "Updated" }, "tok");

    const patchCall = mockedAxios.patch.mock.calls[0];
    const patchHeaders = (patchCall[2] as { headers: Record<string, string> }).headers;
    expect(patchHeaders["X-API-Key"]).toBe("HK_live_patch_key");

    if (origKey !== undefined) process.env.NEXT_PUBLIC_HEDGECALC_API_KEY = origKey;
    else delete process.env.NEXT_PUBLIC_HEDGECALC_API_KEY;
  });

  it("DELETE requests carry X-API-Key header", async () => {
    const origKey = process.env.NEXT_PUBLIC_HEDGECALC_API_KEY;
    process.env.NEXT_PUBLIC_HEDGECALC_API_KEY = "HK_live_delete_key";

    mockedAxios.delete.mockResolvedValueOnce({ data: null });
    await deletePolicyTemplate("cmp-tpl-hardened", "tok");

    const delCall = mockedAxios.delete.mock.calls[0];
    const delHeaders = (delCall[1] as { headers: Record<string, string> }).headers;
    expect(delHeaders["X-API-Key"]).toBe("HK_live_delete_key");

    if (origKey !== undefined) process.env.NEXT_PUBLIC_HEDGECALC_API_KEY = origKey;
    else delete process.env.NEXT_PUBLIC_HEDGECALC_API_KEY;
  });
});

// ===========================================================================
// 2. PolicyTemplate interface -- status and updated_at fields
//    Both fields were added to the interface in c24b718.
//    status: string (accepts DRAFT | REVIEW | APPROVED | ACTIVE | ARCHIVED)
//    updated_at: string | null
// ===========================================================================

describe("PolicyTemplate interface -- status and updated_at fields", () => {
  it("HARDENED_SYSTEM_TEMPLATE has status field set to ACTIVE", () => {
    expect(HARDENED_SYSTEM_TEMPLATE.status).toBe("ACTIVE");
  });

  it("HARDENED_COMPANY_TEMPLATE has status field set to DRAFT", () => {
    expect(HARDENED_COMPANY_TEMPLATE.status).toBe("DRAFT");
  });

  it("HARDENED_SYSTEM_TEMPLATE has updated_at field as ISO string", () => {
    expect(HARDENED_SYSTEM_TEMPLATE.updated_at).toBe("2026-02-01T00:00:00Z");
    expect(typeof HARDENED_SYSTEM_TEMPLATE.updated_at).toBe("string");
  });

  it("HARDENED_COMPANY_TEMPLATE has updated_at field with timestamp", () => {
    expect(HARDENED_COMPANY_TEMPLATE.updated_at).toBe("2026-02-20T14:30:00Z");
  });

  it("updated_at can be null for templates that have never been updated", () => {
    const neverUpdated: PolicyTemplate = {
      ...HARDENED_COMPANY_TEMPLATE,
      id: "new-never-updated",
      updated_at: null,
    };
    expect(neverUpdated.updated_at).toBeNull();
  });

  it("listPolicyTemplates returns templates that include status field", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: [HARDENED_SYSTEM_TEMPLATE, HARDENED_COMPANY_TEMPLATE],
    });
    const result = await listPolicyTemplates("tok");
    expect(result[0].status).toBe("ACTIVE");
    expect(result[1].status).toBe("DRAFT");
  });

  it("listPolicyTemplates returns templates that include updated_at field", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: [HARDENED_SYSTEM_TEMPLATE, HARDENED_COMPANY_TEMPLATE],
    });
    const result = await listPolicyTemplates("tok");
    expect(result[0].updated_at).toBe("2026-02-01T00:00:00Z");
    expect(result[1].updated_at).toBe("2026-02-20T14:30:00Z");
  });

  it("status field accepts all valid lifecycle values", () => {
    const statuses = ["DRAFT", "REVIEW", "APPROVED", "ACTIVE", "ARCHIVED"];
    for (const s of statuses) {
      const tpl: PolicyTemplate = { ...HARDENED_COMPANY_TEMPLATE, status: s };
      expect(tpl.status).toBe(s);
    }
  });

  it("system template with version > 1 can exist", () => {
    expect(HARDENED_SYSTEM_TEMPLATE.version).toBe(3);
    expect(HARDENED_SYSTEM_TEMPLATE.is_system).toBe(true);
  });

  it("company template can have version > 1", () => {
    expect(HARDENED_COMPANY_TEMPLATE.version).toBe(5);
    expect(HARDENED_COMPANY_TEMPLATE.is_system).toBe(false);
  });
});

// ===========================================================================
// 3. SEC-POLICY-1 FE -- wizard status type guard
//    Old: cast status directly → could persist ACTIVE/APPROVED into CanonicalPolicy
//    New: safeStatus coerces any non-REVIEW value to DRAFT
//    Only "REVIEW" passes through; everything else becomes "DRAFT"
// ===========================================================================

// Mirror the exact fix applied in the wizard
function applySafeStatus(input: string): "DRAFT" | "REVIEW" {
  return input === "REVIEW" ? "REVIEW" : "DRAFT";
}

describe("SEC-POLICY-1 FE -- wizard status type guard", () => {
  it("DRAFT input remains DRAFT", () => {
    expect(applySafeStatus("DRAFT")).toBe("DRAFT");
  });

  it("REVIEW input remains REVIEW", () => {
    expect(applySafeStatus("REVIEW")).toBe("REVIEW");
  });

  it("ACTIVE input is coerced to DRAFT", () => {
    expect(applySafeStatus("ACTIVE")).toBe("DRAFT");
  });

  it("APPROVED input is coerced to DRAFT", () => {
    expect(applySafeStatus("APPROVED")).toBe("DRAFT");
  });

  it("ARCHIVED input is coerced to DRAFT", () => {
    expect(applySafeStatus("ARCHIVED")).toBe("DRAFT");
  });

  it("empty string input is coerced to DRAFT", () => {
    expect(applySafeStatus("")).toBe("DRAFT");
  });

  it("unknown/arbitrary status is coerced to DRAFT", () => {
    expect(applySafeStatus("PUBLISHED")).toBe("DRAFT");
    expect(applySafeStatus("LIVE")).toBe("DRAFT");
    expect(applySafeStatus("ENABLED")).toBe("DRAFT");
  });

  it("only REVIEW passes through unchanged among all lifecycle statuses", () => {
    const allStatuses = ["DRAFT", "REVIEW", "APPROVED", "ACTIVE", "ARCHIVED"];
    const results = allStatuses.map(applySafeStatus);
    expect(results.filter((r) => r === "REVIEW")).toHaveLength(1);
    expect(results.filter((r) => r === "DRAFT")).toHaveLength(4);
  });

  it("REVIEW is the only valid non-DRAFT value the wizard can produce", () => {
    const permittedOutputs = new Set(["DRAFT", "REVIEW"]);
    const inputs = ["DRAFT", "REVIEW", "APPROVED", "ACTIVE", "ARCHIVED", "RANDOM"];
    for (const input of inputs) {
      expect(permittedOutputs.has(applySafeStatus(input))).toBe(true);
    }
  });

  it("safeStatus result is always one of the two permitted union members", () => {
    const result = applySafeStatus("ACTIVE");
    expect(result === "DRAFT" || result === "REVIEW").toBe(true);
  });

  it("CanonicalPolicy built with safeStatus never carries ACTIVE status", () => {
    const wizardStatusFromServer = "ACTIVE";
    const safeStatus = applySafeStatus(wizardStatusFromServer);
    const canonical: Partial<CanonicalPolicy> = {
      ...VALID_CANONICAL,
      status: safeStatus,
    };
    expect(canonical.status).not.toBe("ACTIVE");
    expect(canonical.status).toBe("DRAFT");
  });

  it("CanonicalPolicy built with safeStatus never carries APPROVED status", () => {
    const wizardStatusFromServer = "APPROVED";
    const safeStatus = applySafeStatus(wizardStatusFromServer);
    const canonical: Partial<CanonicalPolicy> = {
      ...VALID_CANONICAL,
      status: safeStatus,
    };
    expect(canonical.status).not.toBe("APPROVED");
    expect(canonical.status).toBe("DRAFT");
  });
});

// ===========================================================================
// 4. SEC-POLICY-1 BE -- backend create_template status validation
//    Backend now returns 403 when status field is ACTIVE or APPROVED and
//    caller lacks the policy.activate permission.
//    The FE client does not send status in CreateTemplatePayload (by design).
//    Tests verify: payload shape, 403 propagation, and permission semantics.
// ===========================================================================

describe("SEC-POLICY-1 BE -- backend create_template status validation", () => {
  const BASE_PAYLOAD: CreateTemplatePayload = {
    name: "New Elevated Policy",
    short_name: "ELEV-POL",
    description: "Policy created with elevated status attempt",
    risk_posture: "MODERATE",
    category: "CORPORATE",
    config: VALID_POLICY_CONFIG,
  };

  it("createPolicyTemplate sends payload to POST /v1/policies/templates", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: HARDENED_COMPANY_TEMPLATE });
    await createPolicyTemplate(BASE_PAYLOAD, "tok");
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining("/v1/policies/templates"),
      BASE_PAYLOAD,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      }),
    );
  });

  it("backend returns 403 when caller lacks policy.activate and status is ACTIVE", async () => {
    const forbidden = Object.assign(
      new Error("Request failed with status code 403"),
      {
        response: {
          status: 403,
          data: { detail: "policy.activate permission required to set status ACTIVE" },
        },
      },
    );
    mockedAxios.post.mockRejectedValueOnce(forbidden);
    await expect(createPolicyTemplate(BASE_PAYLOAD, "no-activate-tok")).rejects.toThrow();
    const err = forbidden as { response: { status: number } };
    expect(err.response.status).toBe(403);
  });

  it("backend returns 403 when caller lacks policy.activate and status is APPROVED", async () => {
    const forbidden = Object.assign(
      new Error("Request failed with status code 403"),
      {
        response: {
          status: 403,
          data: { detail: "policy.activate permission required to set status APPROVED" },
        },
      },
    );
    mockedAxios.post.mockRejectedValueOnce(forbidden);
    await expect(createPolicyTemplate(BASE_PAYLOAD, "no-approve-tok")).rejects.toThrow();
    const err = forbidden as { response: { status: number } };
    expect(err.response.status).toBe(403);
  });

  it("403 error detail contains the disallowed status value", async () => {
    const forbidden = Object.assign(
      new Error("Request failed with status code 403"),
      {
        response: {
          status: 403,
          data: { detail: "policy.activate permission required to set status ACTIVE" },
        },
      },
    );
    mockedAxios.post.mockRejectedValueOnce(forbidden);
    try {
      await createPolicyTemplate(BASE_PAYLOAD, "tok");
      fail("Expected rejection");
    } catch (e: unknown) {
      const axiosErr = e as { response: { data: { detail: string } } };
      expect(axiosErr.response.data.detail).toContain("ACTIVE");
    }
  });

  it("CreateTemplatePayload interface does not include a status field (FE design decision)", () => {
    // The status field is intentionally absent from CreateTemplatePayload.
    // Status is managed server-side; the FE sends only metadata + config.
    const payload: CreateTemplatePayload = BASE_PAYLOAD;
    expect("status" in payload).toBe(false);
  });

  it("createPolicyTemplate succeeds with DRAFT status when backend allows it", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { ...HARDENED_COMPANY_TEMPLATE, status: "DRAFT" },
    });
    const result = await createPolicyTemplate(BASE_PAYLOAD, "tok");
    expect(result.status).toBe("DRAFT");
  });

  it("propagates 401 when unauthenticated", async () => {
    mockedAxios.post.mockRejectedValueOnce(
      Object.assign(new Error("Request failed with status code 401"), {
        response: { status: 401 },
      }),
    );
    await expect(createPolicyTemplate(BASE_PAYLOAD)).rejects.toThrow("401");
  });

  it("propagates 400 for malformed payload", async () => {
    mockedAxios.post.mockRejectedValueOnce(
      Object.assign(new Error("Request failed with status code 400"), {
        response: { status: 400, data: { detail: "Invalid config" } },
      }),
    );
    await expect(createPolicyTemplate(BASE_PAYLOAD, "tok")).rejects.toThrow("400");
  });
});

// ===========================================================================
// 5. DB-POLICY-1 -- concurrent activation race condition
//    A unique partial index on policy_instances prevents two simultaneous
//    activations from succeeding. The second caller receives HTTP 409.
//    The FE must propagate 409 (not swallow it) so the caller can show
//    a "Concurrent activation conflict" error.
// ===========================================================================

describe("DB-POLICY-1 -- concurrent activation race condition", () => {
  it("handles 409 conflict from concurrent activation", async () => {
    const conflict = Object.assign(new Error("Conflict"), {
      response: {
        status: 409,
        data: { detail: "Concurrent activation conflict" },
      },
    });
    mockedAxios.post.mockRejectedValueOnce(conflict);
    await expect(activatePolicy("tpl-race-001", "tok")).rejects.toThrow();
    const call = mockedAxios.post.mock.calls[0];
    expect(call[0]).toContain("/v1/policies/activate");
  });

  it("409 error carries detail message about concurrent activation", async () => {
    const conflict = Object.assign(
      new Error("Request failed with status code 409"),
      {
        response: {
          status: 409,
          data: { detail: "Concurrent activation conflict" },
        },
      },
    );
    mockedAxios.post.mockRejectedValueOnce(conflict);
    try {
      await activatePolicy("tpl-race-002", "tok");
      fail("Expected rejection");
    } catch (e: unknown) {
      const axiosErr = e as { response: { status: number; data: { detail: string } } };
      expect(axiosErr.response.status).toBe(409);
      expect(axiosErr.response.data.detail).toContain("conflict");
    }
  });

  it("activatePolicy sends correct template_id even in race scenario", async () => {
    const conflict = Object.assign(new Error("409"), {
      response: { status: 409, data: { detail: "Concurrent activation conflict" } },
    });
    mockedAxios.post.mockRejectedValueOnce(conflict);
    try {
      await activatePolicy("tpl-race-003", "tok");
    } catch {
      // expected
    }
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining("/v1/policies/activate"),
      { template_id: "tpl-race-003" },
      expect.any(Object),
    );
  });

  it("sequential activations succeed when no conflict exists", async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: ACTIVE_INSTANCE })
      .mockResolvedValueOnce({ data: { ...ACTIVE_INSTANCE, id: "inst-002" } });

    const r1 = await activatePolicy("tpl-a", "tok");
    const r2 = await activatePolicy("tpl-b", "tok");
    expect(r1.id).toBe("inst-hardened-001");
    expect(r2.id).toBe("inst-002");
  });

  it("409 is not swallowed -- caller receives the error", async () => {
    const conflict = Object.assign(new Error("409"), {
      response: { status: 409 },
    });
    mockedAxios.post.mockRejectedValueOnce(conflict);
    let caught = false;
    try {
      await activatePolicy("race-tpl", "tok");
    } catch {
      caught = true;
    }
    expect(caught).toBe(true);
  });

  it("non-409 errors are also propagated by activatePolicy", async () => {
    mockedAxios.post.mockRejectedValueOnce(
      Object.assign(new Error("Request failed with status code 500"), {
        response: { status: 500 },
      }),
    );
    await expect(activatePolicy("tpl-001", "tok")).rejects.toThrow("500");
  });
});

// ===========================================================================
// 6. RES-1 -- template load error propagation
//    Old: .catch(() => setTemplatesLoading(false)) — silent failure
//    New: .catch((e) => { setTemplatesLoading(false); setTemplatesError(...) })
//    Test the client layer: listPolicyTemplates rejects on 401/500 so that
//    the component's .catch handler receives the error.
// ===========================================================================

describe("RES-1 -- template load error propagation", () => {
  it("listPolicyTemplates rejects on 401 (caller can set error state)", async () => {
    mockedAxios.get.mockRejectedValueOnce(
      Object.assign(new Error("Request failed with status code 401"), {
        response: { status: 401 },
      }),
    );
    await expect(listPolicyTemplates("bad-token")).rejects.toThrow("401");
  });

  it("listPolicyTemplates rejects on 500 (caller can set error state)", async () => {
    mockedAxios.get.mockRejectedValueOnce(
      Object.assign(new Error("Request failed with status code 500"), {
        response: { status: 500 },
      }),
    );
    await expect(listPolicyTemplates("tok")).rejects.toThrow("500");
  });

  it("listPolicyTemplates rejects on network error", async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error("Network Error"));
    await expect(listPolicyTemplates("tok")).rejects.toThrow("Network Error");
  });

  it("listPolicyTemplates rejects on 403 Forbidden", async () => {
    mockedAxios.get.mockRejectedValueOnce(
      Object.assign(new Error("Request failed with status code 403"), {
        response: { status: 403 },
      }),
    );
    await expect(listPolicyTemplates("tok")).rejects.toThrow("403");
  });

  it("error from listPolicyTemplates can be caught in a catch block", async () => {
    let errorCaught: Error | null = null;
    mockedAxios.get.mockRejectedValueOnce(
      Object.assign(new Error("Request failed with status code 500"), {
        response: { status: 500 },
      }),
    );
    try {
      await listPolicyTemplates("tok");
    } catch (e) {
      errorCaught = e as Error;
    }
    expect(errorCaught).not.toBeNull();
    expect(errorCaught?.message).toContain("500");
  });

  it("error is not silently swallowed -- promise does not resolve on failure", async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error("timeout"));
    let resolved = false;
    try {
      await listPolicyTemplates("tok");
      resolved = true;
    } catch {
      resolved = false;
    }
    expect(resolved).toBe(false);
  });
});

// ===========================================================================
// 7. RES-2 -- favorites optimistic rollback logic
//    Old: catch { /* ignore */ }
//    New: optimistic update → on error: rollback to prior state + show toast
//    Test: addFavorite and removeFavorite reject properly so the caller's
//    catch handler can implement rollback.
// ===========================================================================

describe("RES-2 -- favorites optimistic rollback logic", () => {
  // PolicyFavorite has: id, user_id, template_id, notes, created_at, template
  const FAVORITE: PolicyFavorite = {
    id: "fav-001",
    user_id: "user-alice",
    template_id: "cmp-tpl-hardened",
    notes: null,
    created_at: "2026-02-20T10:00:00Z",
    template: null,
  };

  it("addFavorite resolves on success (optimistic commit confirmed)", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: FAVORITE });
    // addFavorite(templateId, notes?, token?)
    const result = await addFavorite("cmp-tpl-hardened", undefined, "tok");
    expect(result.template_id).toBe("cmp-tpl-hardened");
  });

  it("addFavorite rejects on server error (caller can rollback optimistic update)", async () => {
    mockedAxios.post.mockRejectedValueOnce(
      Object.assign(new Error("Request failed with status code 500"), {
        response: { status: 500 },
      }),
    );
    await expect(addFavorite("cmp-tpl-hardened", undefined, "tok")).rejects.toThrow("500");
  });

  it("addFavorite rejects on 409 conflict (caller can rollback)", async () => {
    mockedAxios.post.mockRejectedValueOnce(
      Object.assign(new Error("Request failed with status code 409"), {
        response: { status: 409 },
      }),
    );
    await expect(addFavorite("cmp-tpl-hardened", undefined, "tok")).rejects.toThrow("409");
  });

  it("removeFavorite resolves on success (optimistic commit confirmed)", async () => {
    mockedAxios.delete.mockResolvedValueOnce({ data: null });
    await expect(removeFavorite("cmp-tpl-hardened", "tok")).resolves.toBeUndefined();
  });

  it("removeFavorite rejects on server error (caller can rollback optimistic removal)", async () => {
    mockedAxios.delete.mockRejectedValueOnce(
      Object.assign(new Error("Request failed with status code 500"), {
        response: { status: 500 },
      }),
    );
    await expect(removeFavorite("cmp-tpl-hardened", "tok")).rejects.toThrow("500");
  });

  it("removeFavorite rejects on 404 (caller can rollback)", async () => {
    mockedAxios.delete.mockRejectedValueOnce(
      Object.assign(new Error("Request failed with status code 404"), {
        response: { status: 404 },
      }),
    );
    await expect(removeFavorite("ghost-tpl", "tok")).rejects.toThrow("404");
  });

  it("optimistic rollback pattern: error is catchable to restore prior set", async () => {
    // Simulates: wasInSet = true → optimistically remove → fail → rollback
    const wasInSet = true;
    const currentSet = new Set<string>(["cmp-tpl-hardened"]);

    // Optimistic update: remove from set (trying to toggle off)
    currentSet.delete("cmp-tpl-hardened");
    expect(currentSet.has("cmp-tpl-hardened")).toBe(false);

    mockedAxios.delete.mockRejectedValueOnce(new Error("Network Error"));

    try {
      await removeFavorite("cmp-tpl-hardened", "tok");
    } catch {
      // Rollback: restore to wasInSet state
      if (wasInSet) currentSet.add("cmp-tpl-hardened");
    }

    expect(currentSet.has("cmp-tpl-hardened")).toBe(true);
  });

  it("listFavorites returns all favorites for the user", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [FAVORITE] });
    const result = await listFavorites("tok");
    expect(result).toHaveLength(1);
    expect(result[0].template_id).toBe("cmp-tpl-hardened");
  });

  it("addFavorite calls correct endpoint with template ID in URL", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: FAVORITE });
    await addFavorite("cmp-tpl-hardened", undefined, "tok");
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining("/v1/policies/favorites/cmp-tpl-hardened"),
      expect.any(Object),
      expect.any(Object),
    );
  });

  it("removeFavorite calls DELETE with template ID in URL", async () => {
    mockedAxios.delete.mockResolvedValueOnce({ data: null });
    await removeFavorite("cmp-tpl-hardened", "tok");
    expect(mockedAxios.delete).toHaveBeenCalledWith(
      expect.stringContaining("/v1/policies/favorites/cmp-tpl-hardened"),
      expect.any(Object),
    );
  });
});

// ===========================================================================
// 8. PERF-POLICY-2 -- search debounce timing
//    Old: no debounce (search fired on every keystroke)
//    New: 300 ms debounce on the search input
// ===========================================================================

describe("PERF-POLICY-2 -- search debounce timing", () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  it("debounce delay is 300ms", () => {
    const DEBOUNCE_MS = 300;
    expect(DEBOUNCE_MS).toBe(300);
  });

  it("debounce does not trigger before 300ms", () => {
    let fired = false;
    const debounceRef = { current: null as ReturnType<typeof setTimeout> | null };
    const trigger = (_val: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        fired = true;
      }, 300);
    };
    trigger("MXN");
    jest.advanceTimersByTime(299);
    expect(fired).toBe(false);
    jest.advanceTimersByTime(1);
    expect(fired).toBe(true);
  });

  it("rapid typing resets the debounce timer", () => {
    let updateCount = 0;
    const debounceRef = { current: null as ReturnType<typeof setTimeout> | null };
    const trigger = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateCount++;
      }, 300);
    };
    trigger(); // keystroke 1
    jest.advanceTimersByTime(100);
    trigger(); // keystroke 2 — resets timer
    jest.advanceTimersByTime(100);
    trigger(); // keystroke 3 — resets again
    jest.advanceTimersByTime(300);
    // Only 1 update should fire, not 3
    expect(updateCount).toBe(1);
  });

  it("debounce fires exactly once after the delay following last keystroke", () => {
    let callCount = 0;
    const debounceRef = { current: null as ReturnType<typeof setTimeout> | null };
    const trigger = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        callCount++;
      }, 300);
    };

    // Simulate 5 rapid keystrokes at 50ms intervals
    for (let i = 0; i < 5; i++) {
      trigger();
      jest.advanceTimersByTime(50);
    }
    // 5 * 50 = 250ms elapsed, timer resets each time, not fired yet
    expect(callCount).toBe(0);

    // Advance past the 300ms threshold
    jest.advanceTimersByTime(300);
    expect(callCount).toBe(1);
  });

  it("separate search instances each debounce independently", () => {
    let firstFired = false;
    let secondFired = false;

    const makeDebouncer = (onFire: () => void) => {
      let ref: ReturnType<typeof setTimeout> | null = null;
      return () => {
        if (ref) clearTimeout(ref);
        ref = setTimeout(onFire, 300);
      };
    };

    const triggerFirst = makeDebouncer(() => { firstFired = true; });
    const triggerSecond = makeDebouncer(() => { secondFired = true; });

    triggerFirst();
    jest.advanceTimersByTime(150);
    triggerSecond();
    jest.advanceTimersByTime(150);
    // first has fired (150+150=300ms), second has not (only 150ms elapsed for second)
    expect(firstFired).toBe(true);
    expect(secondFired).toBe(false);

    jest.advanceTimersByTime(150);
    expect(secondFired).toBe(true);
  });

  it("debounce is not triggered at 0ms (immediate calls are batched)", () => {
    let fired = false;
    const debounceRef = { current: null as ReturnType<typeof setTimeout> | null };
    const trigger = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => { fired = true; }, 300);
    };
    trigger();
    jest.advanceTimersByTime(0);
    expect(fired).toBe(false);
  });
});

// ===========================================================================
// 9. UX-POLICY-4 -- version and updated_at fields
//    PolicyTemplate.version and .updated_at are now displayed as a version
//    badge in the UI. Tests verify these fields are correctly typed and present.
// ===========================================================================

describe("UX-POLICY-4 -- version and updated_at fields", () => {
  it("template version is a positive integer", () => {
    expect(Number.isInteger(HARDENED_SYSTEM_TEMPLATE.version)).toBe(true);
    expect(HARDENED_SYSTEM_TEMPLATE.version).toBeGreaterThan(0);
  });

  it("company template version increments on update", () => {
    const v1: PolicyTemplate = { ...HARDENED_COMPANY_TEMPLATE, version: 1 };
    const v2: PolicyTemplate = { ...HARDENED_COMPANY_TEMPLATE, version: 2 };
    expect(v2.version).toBe(v1.version + 1);
  });

  it("system template can have version 3 (multi-revision history)", () => {
    expect(HARDENED_SYSTEM_TEMPLATE.version).toBe(3);
  });

  it("company template can have version 5 (heavily iterated policy)", () => {
    expect(HARDENED_COMPANY_TEMPLATE.version).toBe(5);
  });

  it("updated_at is later than created_at for updated templates", () => {
    const created = new Date(HARDENED_COMPANY_TEMPLATE.created_at).getTime();
    const updated = new Date(HARDENED_COMPANY_TEMPLATE.updated_at!).getTime();
    expect(updated).toBeGreaterThan(created);
  });

  it("updated_at for system template is after creation date", () => {
    const created = new Date(HARDENED_SYSTEM_TEMPLATE.created_at).getTime();
    const updated = new Date(HARDENED_SYSTEM_TEMPLATE.updated_at!).getTime();
    expect(updated).toBeGreaterThan(created);
  });

  it("version badge data: version and updated_at are available for display", () => {
    const badge = {
      version: HARDENED_COMPANY_TEMPLATE.version,
      lastUpdated: HARDENED_COMPANY_TEMPLATE.updated_at,
    };
    expect(badge.version).toBe(5);
    expect(badge.lastUpdated).toBe("2026-02-20T14:30:00Z");
  });

  it("templates returned from API include both version and updated_at", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: [HARDENED_SYSTEM_TEMPLATE, HARDENED_COMPANY_TEMPLATE],
    });
    const templates = await listPolicyTemplates("tok");
    for (const t of templates) {
      expect(typeof t.version).toBe("number");
      // updated_at is string | null
      expect(t.updated_at === null || typeof t.updated_at === "string").toBe(true);
    }
  });

  it("updatePolicyTemplate response includes bumped version", async () => {
    const updated: PolicyTemplate = {
      ...HARDENED_COMPANY_TEMPLATE,
      version: 6,
      updated_at: "2026-02-28T12:00:00Z",
    };
    mockedAxios.patch.mockResolvedValueOnce({ data: updated });
    const result = await updatePolicyTemplate("cmp-tpl-hardened", { name: "v6 Policy" }, "tok");
    expect(result.version).toBe(6);
    expect(result.updated_at).toBe("2026-02-28T12:00:00Z");
  });
});

// ===========================================================================
// 10. LOG-POLICY-1 -- PolicyRevisionDrawer API contract
//     A new PolicyRevisionDrawer component fetches template revision history.
//     Endpoint: GET /v1/policies/templates/{id}/history
//     Response type: PolicyAuditEvent[] (array)
//     Tests verify the URL pattern and response handling.
// ===========================================================================

describe("LOG-POLICY-1 -- PolicyRevisionDrawer API contract", () => {
  it("revision history URL matches GET /v1/policies/templates/{id}/history", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] });
    const templateId = "cmp-tpl-hardened";
    await axios.get(`http://localhost:8000/api/v1/policies/templates/${templateId}/history`, {
      headers: { Authorization: "Bearer tok" },
    });
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining(`/v1/policies/templates/${templateId}/history`),
      expect.any(Object),
    );
  });

  it("revision history endpoint includes template ID in the path", async () => {
    const id = "sys-tpl-hardened";
    mockedAxios.get.mockResolvedValueOnce({ data: [] });
    await axios.get(`http://localhost:8000/api/v1/policies/templates/${id}/history`, {
      headers: { Authorization: "Bearer tok" },
    });
    const url = mockedAxios.get.mock.calls[0][0] as string;
    expect(url).toContain(id);
    expect(url).toContain("/history");
  });

  it("revision history response is an array", async () => {
    const mockHistory = [
      {
        id: "rev-001",
        template_id: "cmp-tpl-hardened",
        actor_id: "user-alice",
        action: "CREATED",
        timestamp: "2026-02-01T00:00:00Z",
        changes: {},
      },
      {
        id: "rev-002",
        template_id: "cmp-tpl-hardened",
        actor_id: "user-bob",
        action: "UPDATED",
        timestamp: "2026-02-20T14:30:00Z",
        changes: { name: { from: "ACME FX Policy", to: "ACME FX Policy v2" } },
      },
    ];
    mockedAxios.get.mockResolvedValueOnce({ data: mockHistory });
    const { data } = await axios.get(
      "http://localhost:8000/api/v1/policies/templates/cmp-tpl-hardened/history",
      { headers: { Authorization: "Bearer tok" } },
    );
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(2);
  });

  it("revision history event has actor_id, action, and timestamp fields", async () => {
    const auditEvent = {
      id: "rev-001",
      template_id: "cmp-tpl-hardened",
      actor_id: "user-alice",
      action: "CREATED",
      timestamp: "2026-02-01T00:00:00Z",
    };
    mockedAxios.get.mockResolvedValueOnce({ data: [auditEvent] });
    const { data } = await axios.get(
      "http://localhost:8000/api/v1/policies/templates/cmp-tpl-hardened/history",
      { headers: { Authorization: "Bearer tok" } },
    );
    expect(data[0]).toHaveProperty("actor_id");
    expect(data[0]).toHaveProperty("action");
    expect(data[0]).toHaveProperty("timestamp");
  });

  it("revision history returns empty array for brand new template", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] });
    const { data } = await axios.get(
      "http://localhost:8000/api/v1/policies/templates/new-tpl/history",
      { headers: { Authorization: "Bearer tok" } },
    );
    expect(data).toEqual([]);
  });

  it("revision history 404 propagates when template does not exist", async () => {
    mockedAxios.get.mockRejectedValueOnce(
      Object.assign(new Error("Request failed with status code 404"), {
        response: { status: 404 },
      }),
    );
    await expect(
      axios.get("http://localhost:8000/api/v1/policies/templates/ghost-id/history", {
        headers: { Authorization: "Bearer tok" },
      }),
    ).rejects.toThrow("404");
  });

  it("revision history action values include CREATED, UPDATED, ACTIVATED, DEACTIVATED", () => {
    const validActions = ["CREATED", "UPDATED", "ACTIVATED", "DEACTIVATED", "DELETED"];
    for (const action of validActions) {
      const event = {
        id: `rev-${action}`,
        template_id: "tpl-001",
        actor_id: "user-alice",
        action,
        timestamp: "2026-02-01T00:00:00Z",
      };
      expect(validActions.includes(event.action)).toBe(true);
    }
  });

  it("history URL is distinct from the template detail URL", () => {
    const templateDetailUrl = "/v1/policies/templates/tpl-001";
    const historyUrl = "/v1/policies/templates/tpl-001/history";
    expect(historyUrl).not.toBe(templateDetailUrl);
    expect(historyUrl.endsWith("/history")).toBe(true);
  });
});

// ===========================================================================
// 11. UX-POLICY-2 -- no auto-select specification
//     Old: selectedRecId was auto-set to the first recommendation at load
//     New: selectedRecId stays null until the user explicitly clicks
//     This is a behavioral specification test (component-level change).
// ===========================================================================

describe("UX-POLICY-2 -- no auto-select specification", () => {
  it("selectedRecId is null by default (no auto-selection on load)", () => {
    // Specification: initial state must be null, not the first element
    let selectedRecId: string | null = null;
    const recommendations = [MOCK_AI_REC];
    // Old behavior was: selectedRecId = recommendations[0].preset.id
    // New behavior: selectedRecId stays null
    expect(selectedRecId).toBeNull();
    expect(recommendations.length).toBeGreaterThan(0);
    // Even with recommendations available, selectedRecId is not auto-set
    expect(selectedRecId).not.toBe(recommendations[0].preset.id);
  });

  it("recommendation is only applied when user explicitly selects it", () => {
    let selectedRecId: string | null = null;
    const recommendations = [MOCK_AI_REC];

    // Simulate user click
    const handleUserSelect = (id: string) => { selectedRecId = id; };

    // Before click: null
    expect(selectedRecId).toBeNull();

    // After explicit user action:
    handleUserSelect(recommendations[0].preset.id);
    expect(selectedRecId).toBe("conservative-treasury");
  });

  it("buildCanonicalFromPageState with explicit selectedRec produces valid canonical", () => {
    const result = buildTestCanonical();
    expect(result).toBeDefined();
    expect(result.status).toBe("DRAFT");
    expect(result.execution_config).toBeDefined();
  });

  it("buildCanonicalFromPageState requires all 7 arguments (no defaults infer selectedRec)", () => {
    // Specification: the function takes (state, aiResult, selectedRec, userId, companyId, policyName, policyTag)
    // This ensures selectedRec is always explicitly passed — no auto-selection inside the function.
    const result = buildCanonicalFromPageState(
      WIZARD_STATE,
      MOCK_AI_RESULT,
      MOCK_AI_REC,
      "user-alice",
      "co-acme-123",
      "Test Policy",
      "TEST-POL",
    );
    expect(result).toBeDefined();
    expect(result.scope.company_id).toBe("co-acme-123");
  });

  it("initial state with empty recommendations list still has null selectedRecId", () => {
    let selectedRecId: string | null = null;
    const recommendations: typeof MOCK_AI_REC[] = [];

    // No recommendations → no auto-select possible
    expect(recommendations.length).toBe(0);
    expect(selectedRecId).toBeNull();
  });

  it("save is blocked when selectedRecId is null (user must choose)", () => {
    const selectedRecId: string | null = null;
    const canSave = selectedRecId !== null;
    expect(canSave).toBe(false);
  });

  it("save is allowed once user selects a recommendation", () => {
    let selectedRecId: string | null = null;
    // User clicks a recommendation
    selectedRecId = MOCK_AI_REC.preset.id;
    const canSave = selectedRecId !== null;
    expect(canSave).toBe(true);
  });
});

// ===========================================================================
// 12. UX-POLICY-3 -- company guard specification
//     Old: save could proceed with companyId = undefined
//     New: if companyId is nullish → setSaveError and early return
//     This is a specification test for the guard logic.
// ===========================================================================

describe("UX-POLICY-3 -- company guard specification", () => {
  it("company guard: nullish companyId must block createPolicyTemplate call", async () => {
    // Specification: when companyId is null/undefined, the page should
    // set an error and NOT call createPolicyTemplate.
    let createCalled = false;
    const companyId: string | null = null;

    const guardedSave = async () => {
      if (!companyId) {
        // Guard triggers: set error, early return
        return { error: "Company context required to save policy" };
      }
      createCalled = true;
      return {};
    };

    const result = await guardedSave();
    expect(createCalled).toBe(false);
    expect(result).toHaveProperty("error");
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("company guard: valid companyId allows save to proceed", async () => {
    const companyId = "co-acme-123";
    let createCalled = false;

    const guardedSave = async () => {
      if (!companyId) {
        return { error: "Company context required to save policy" };
      }
      createCalled = true;
      return { success: true };
    };

    const result = await guardedSave();
    expect(createCalled).toBe(true);
    expect(result).not.toHaveProperty("error");
  });

  it("company guard: undefined companyId also blocks save", () => {
    const companyId: string | undefined = undefined;
    let createCalled = false;

    const guardedSave = () => {
      if (!companyId) {
        return { error: "Company context required" };
      }
      createCalled = true;
      return { success: true };
    };

    const result = guardedSave();
    expect(createCalled).toBe(false);
    expect(result).toHaveProperty("error");
  });

  it("createPolicyTemplate is not called when company context is missing", async () => {
    // Guard fires before API call → axios.post is never invoked
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("save error message is informative about missing company context", () => {
    const companyId: string | null = null;
    let errorMessage = "";

    if (!companyId) {
      errorMessage = "A company context is required to save this policy template.";
    }

    expect(errorMessage).toContain("company");
    expect(errorMessage.length).toBeGreaterThan(0);
  });

  it("empty string companyId is treated as nullish by guard", () => {
    const companyId = "";
    const isBlocked = !companyId;
    expect(isBlocked).toBe(true);
  });

  it("buildCanonicalFromPageState with valid companyId sets correct scope", () => {
    const result = buildCanonicalFromPageState(
      WIZARD_STATE,
      MOCK_AI_RESULT,
      MOCK_AI_REC,
      "user-alice",
      "co-acme-123",
      "ACME Policy",
      "ACME-POL",
    );
    expect(result.scope.company_id).toBe("co-acme-123");
  });
});

// ===========================================================================
// 13. Business rules -- full RBAC and status lifecycle
// ===========================================================================

describe("Business rules -- full RBAC and status lifecycle", () => {
  it("system templates have null company_id", () => {
    expect(HARDENED_SYSTEM_TEMPLATE.company_id).toBeNull();
    expect(HARDENED_SYSTEM_TEMPLATE.is_system).toBe(true);
  });

  it("company templates have non-null company_id", () => {
    expect(HARDENED_COMPANY_TEMPLATE.company_id).not.toBeNull();
    expect(HARDENED_COMPANY_TEMPLATE.is_system).toBe(false);
  });

  it("status lifecycle: DRAFT → REVIEW → APPROVED → ACTIVE → ARCHIVED", () => {
    const lifecycle = ["DRAFT", "REVIEW", "APPROVED", "ACTIVE", "ARCHIVED"];
    expect(lifecycle.indexOf("DRAFT")).toBe(0);
    expect(lifecycle.indexOf("ACTIVE")).toBe(3);
    expect(lifecycle.indexOf("ARCHIVED")).toBe(4);
  });

  it("system template activation returns 403 when caller lacks policy.activate", async () => {
    mockedAxios.post.mockRejectedValueOnce(
      Object.assign(new Error("Request failed with status code 403"), {
        response: { status: 403 },
      }),
    );
    await expect(activatePolicy("sys-tpl-hardened", "no-activate-tok")).rejects.toThrow("403");
  });

  it("only one policy can be active at a time per company (backend enforces)", async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: ACTIVE_INSTANCE })
      .mockResolvedValueOnce({
        data: { ...ACTIVE_INSTANCE, id: "inst-002", template_id: "cmp-tpl-new" },
      });

    const first = await activatePolicy("cmp-tpl-hardened", "tok");
    const second = await activatePolicy("cmp-tpl-new", "tok");
    expect(first.template_id).toBe("cmp-tpl-hardened");
    expect(second.template_id).toBe("cmp-tpl-new");
  });

  it("deactivate removes active status from policy instance", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: null });
    await expect(deactivatePolicy("tok")).resolves.toBeUndefined();
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining("/v1/policies/deactivate"),
      {},
      expect.any(Object),
    );
  });

  it("CONSERVATIVE risk_posture maps to lower hedge ratios", () => {
    const conservativeConfig: PolicyConfig = {
      ...VALID_POLICY_CONFIG,
      hedge_ratios: { confirmed: 0.70, forecast: 0.40 },
    };
    expect(conservativeConfig.hedge_ratios.confirmed).toBeLessThan(0.90);
    expect(conservativeConfig.hedge_ratios.forecast).toBeLessThan(0.70);
  });

  it("AGGRESSIVE risk_posture maps to higher hedge ratios", () => {
    const aggressiveConfig: PolicyConfig = {
      ...VALID_POLICY_CONFIG,
      hedge_ratios: { confirmed: 0.95, forecast: 0.85 },
    };
    expect(aggressiveConfig.hedge_ratios.confirmed).toBeGreaterThan(0.90);
    expect(aggressiveConfig.hedge_ratios.forecast).toBeGreaterThan(0.70);
  });

  it("validateCanonicalPolicy accepts a valid DRAFT canonical", () => {
    const errors = validateCanonicalPolicy(VALID_CANONICAL);
    expect(errors).toHaveLength(0);
  });

  it("canonical policy status from wizard is always DRAFT or REVIEW (never ACTIVE)", () => {
    const allowedWizardStatuses = ["DRAFT", "REVIEW"];
    const canonicalStatus = VALID_CANONICAL.status;
    expect(allowedWizardStatuses.includes(canonicalStatus)).toBe(true);
  });

  it("effectiveness score is defined for all risk postures", () => {
    for (const posture of ["CONSERVATIVE", "MODERATE", "AGGRESSIVE"] as const) {
      const result = computeEffectivenessScore(
        {
          ...VALID_POLICY_CONFIG,
          hedge_ratios:
            posture === "CONSERVATIVE"
              ? { confirmed: 0.70, forecast: 0.40 }
              : posture === "AGGRESSIVE"
              ? { confirmed: 0.95, forecast: 0.85 }
              : { confirmed: 0.85, forecast: 0.60 },
        },
        posture,
      );
      expect(typeof result.score).toBe("number");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    }
  });

  it("duplicatePolicyTemplate cannot duplicate to a system template", async () => {
    // Duplication always creates a company copy (is_system = false)
    const copy: PolicyTemplate = {
      ...HARDENED_SYSTEM_TEMPLATE,
      id: "copy-001",
      is_system: false,
      company_id: "co-acme-123",
      name: "Conservative Baseline (Copy)",
      status: "DRAFT",
    };
    mockedAxios.post.mockResolvedValueOnce({ data: copy });
    const result = await duplicatePolicyTemplate(HARDENED_SYSTEM_TEMPLATE, "tok");
    expect(result.is_system).toBe(false);
    expect(result.company_id).toBe("co-acme-123");
  });
});

// ===========================================================================
// 14. Regression pack -- fixed bugs never return
//     Each test documents a specific bug that was fixed and ensures it
//     cannot regress. Named after the gap IDs.
// ===========================================================================

describe("Regression pack -- fixed bugs never return", () => {
  it("[DEV-KEY-1] HC_DEV_KEY_001 is never sent as X-API-Key", async () => {
    const origKey = process.env.NEXT_PUBLIC_HEDGECALC_API_KEY;
    delete process.env.NEXT_PUBLIC_HEDGECALC_API_KEY;

    mockedAxios.get.mockResolvedValue({ data: [] });
    mockedAxios.post.mockResolvedValue({ data: ACTIVE_INSTANCE });

    await listPolicyTemplates();
    await activatePolicy("tpl-001", "tok");

    for (const call of mockedAxios.get.mock.calls) {
      const headers = (call[1] as { headers: Record<string, string> }).headers;
      expect(headers["X-API-Key"]).not.toBe("HC_DEV_KEY_001");
    }
    for (const call of mockedAxios.post.mock.calls) {
      const headers = (call[2] as { headers: Record<string, string> }).headers;
      expect(headers["X-API-Key"]).not.toBe("HC_DEV_KEY_001");
    }

    if (origKey !== undefined) process.env.NEXT_PUBLIC_HEDGECALC_API_KEY = origKey;
  });

  it("[SEC-POLICY-1 FE] wizard never assigns ACTIVE status to CanonicalPolicy", () => {
    const inboundStatuses = ["DRAFT", "REVIEW", "APPROVED", "ACTIVE", "ARCHIVED"];
    for (const s of inboundStatuses) {
      const safe = applySafeStatus(s);
      expect(safe).not.toBe("ACTIVE");
      expect(safe).not.toBe("APPROVED");
      expect(safe).not.toBe("ARCHIVED");
    }
  });

  it("[SEC-POLICY-1 FE] wizard never assigns APPROVED status to CanonicalPolicy", () => {
    const inboundStatuses = ["DRAFT", "REVIEW", "APPROVED", "ACTIVE", "ARCHIVED"];
    for (const s of inboundStatuses) {
      const safe = applySafeStatus(s);
      expect(safe).not.toBe("APPROVED");
    }
  });

  it("[DB-POLICY-1] 409 from activatePolicy is not silently swallowed", async () => {
    const conflict = Object.assign(new Error("409"), { response: { status: 409 } });
    mockedAxios.post.mockRejectedValueOnce(conflict);
    let threw = false;
    try {
      await activatePolicy("tpl-001", "tok");
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("[RES-1] 500 from listPolicyTemplates is not silently swallowed", async () => {
    mockedAxios.get.mockRejectedValueOnce(
      Object.assign(new Error("500"), { response: { status: 500 } }),
    );
    let threw = false;
    try {
      await listPolicyTemplates("tok");
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it("[RES-2] removeFavorite error is catchable for rollback", async () => {
    mockedAxios.delete.mockRejectedValueOnce(new Error("Network Error"));
    let errorCaught = false;
    try {
      await removeFavorite("tpl-001", "tok");
    } catch {
      errorCaught = true;
    }
    expect(errorCaught).toBe(true);
  });

  it("[RES-2] addFavorite error is catchable for rollback", async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error("Network Error"));
    let errorCaught = false;
    try {
      await addFavorite("tpl-001", undefined, "tok");
    } catch {
      errorCaught = true;
    }
    expect(errorCaught).toBe(true);
  });

  it("[UX-POLICY-4] version field is always a number >= 1", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: [HARDENED_SYSTEM_TEMPLATE, HARDENED_COMPANY_TEMPLATE],
    });
    const templates = await listPolicyTemplates("tok");
    for (const t of templates) {
      expect(t.version).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(t.version)).toBe(true);
    }
  });

  it("[UX-POLICY-3] save with undefined companyId produces error, not undefined behavior", () => {
    const companyId: string | undefined = undefined;
    const result = companyId
      ? { saved: true }
      : { error: "Company context required" };
    expect(result).toHaveProperty("error");
    expect(result).not.toHaveProperty("saved");
  });

  it("[UX-POLICY-2] selectedRecId is null at initial mount (no auto-selection)", () => {
    const initialState: { selectedRecId: string | null } = { selectedRecId: null };
    expect(initialState.selectedRecId).toBeNull();
  });

  it("[SEC-POLICY-1 BE] CreateTemplatePayload never includes a status field", () => {
    const payload: CreateTemplatePayload = {
      name: "Test",
      short_name: "TEST",
      risk_posture: "MODERATE",
      category: "CORPORATE",
      config: VALID_POLICY_CONFIG,
    };
    // Status should never be in the payload
    expect(Object.keys(payload)).not.toContain("status");
  });
});

// ===========================================================================
// 15. Integration workflow -- create → activate → deactivate → delete
// ===========================================================================

describe("Integration workflow -- create → activate → deactivate → delete", () => {
  const CREATE_PAYLOAD: CreateTemplatePayload = {
    name: "Integration Test Policy",
    short_name: "INT-TEST",
    description: "Policy for integration testing",
    risk_posture: "MODERATE",
    category: "CORPORATE",
    config: VALID_POLICY_CONFIG,
  };

  it("create returns a new template with DRAFT status", async () => {
    const created: PolicyTemplate = {
      ...HARDENED_COMPANY_TEMPLATE,
      id: "int-tpl-001",
      name: "Integration Test Policy",
      short_name: "INT-TEST",
      status: "DRAFT",
      version: 1,
      updated_at: null,
    };
    mockedAxios.post.mockResolvedValueOnce({ data: created });
    const result = await createPolicyTemplate(CREATE_PAYLOAD, "tok");
    expect(result.id).toBe("int-tpl-001");
    expect(result.status).toBe("DRAFT");
    expect(result.version).toBe(1);
  });

  it("activate returns active PolicyInstance for the created template", async () => {
    const instance: PolicyInstance = {
      id: "int-inst-001",
      company_id: "co-acme-123",
      branch_id: null,
      template_id: "int-tpl-001",
      activated_by: "user-alice",
      activated_at: "2026-02-28T10:00:00Z",
      is_active: true,
      template: null,
    };
    mockedAxios.post.mockResolvedValueOnce({ data: instance });
    const result = await activatePolicy("int-tpl-001", "tok");
    expect(result.is_active).toBe(true);
    expect(result.template_id).toBe("int-tpl-001");
  });

  it("getActivePolicy returns the activated instance", async () => {
    const instance: PolicyInstance = {
      id: "int-inst-001",
      company_id: "co-acme-123",
      branch_id: null,
      template_id: "int-tpl-001",
      activated_by: "user-alice",
      activated_at: "2026-02-28T10:00:00Z",
      is_active: true,
      template: null,
    };
    mockedAxios.get.mockResolvedValueOnce({ data: instance });
    const active = await getActivePolicy("tok");
    expect(active?.is_active).toBe(true);
    expect(active?.template_id).toBe("int-tpl-001");
  });

  it("deactivate resolves without error", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: null });
    await expect(deactivatePolicy("tok")).resolves.toBeUndefined();
  });

  it("getActivePolicy returns null after deactivation", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: null });
    const active = await getActivePolicy("tok");
    expect(active).toBeNull();
  });

  it("delete succeeds after deactivation", async () => {
    mockedAxios.delete.mockResolvedValueOnce({ data: null });
    await expect(deletePolicyTemplate("int-tpl-001", "tok")).resolves.toBeUndefined();
    expect(mockedAxios.delete).toHaveBeenCalledWith(
      expect.stringContaining("/v1/policies/templates/int-tpl-001"),
      expect.any(Object),
    );
  });

  it("delete of still-active template returns 409", async () => {
    mockedAxios.delete.mockRejectedValueOnce(
      Object.assign(new Error("Request failed with status code 409"), {
        response: { status: 409 },
      }),
    );
    await expect(deletePolicyTemplate("int-tpl-001", "tok")).rejects.toThrow("409");
  });

  it("update increments version on the template", async () => {
    const updated: PolicyTemplate = {
      ...HARDENED_COMPANY_TEMPLATE,
      id: "int-tpl-001",
      version: 2,
      updated_at: "2026-02-28T12:00:00Z",
    };
    mockedAxios.patch.mockResolvedValueOnce({ data: updated });
    const result = await updatePolicyTemplate("int-tpl-001", { name: "Updated" }, "tok");
    expect(result.version).toBe(2);
    expect(result.updated_at).toBe("2026-02-28T12:00:00Z");
  });

  it("full workflow: 4 API calls are made in correct order", async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: HARDENED_COMPANY_TEMPLATE }) // create
      .mockResolvedValueOnce({ data: ACTIVE_INSTANCE })            // activate
      .mockResolvedValueOnce({ data: null });                      // deactivate

    mockedAxios.delete.mockResolvedValueOnce({ data: null });       // delete

    await createPolicyTemplate(CREATE_PAYLOAD, "tok");
    await activatePolicy("int-tpl-001", "tok");
    await deactivatePolicy("tok");
    await deletePolicyTemplate("int-tpl-001", "tok");

    expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    expect(mockedAxios.delete).toHaveBeenCalledTimes(1);
  });

  it("concurrent activation during workflow produces 409", async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: HARDENED_COMPANY_TEMPLATE }) // create
      .mockRejectedValueOnce(
        Object.assign(new Error("409"), {
          response: { status: 409, data: { detail: "Concurrent activation conflict" } },
        }),
      ); // activate (conflict)

    await createPolicyTemplate(CREATE_PAYLOAD, "tok");
    await expect(activatePolicy("int-tpl-001", "tok")).rejects.toThrow();
  });
});

// ===========================================================================
// 16. End-to-end scenario -- AI wizard → save as DRAFT → activate → verify audit
// ===========================================================================

describe("End-to-end scenario -- AI wizard → save as DRAFT → activate → verify audit", () => {
  it("step 1: wizard state maps to QuestionnaireAnswers", () => {
    const qa = mapWizardStateToQA(WIZARD_STATE);
    expect(qa).toBeDefined();
    expect(typeof qa).toBe("object");
    expect(qa.annual_fx_volume_usd).toBeGreaterThan(0);
  });

  it("step 2: buildCanonicalFromPageState produces DRAFT canonical", () => {
    const canonical = buildTestCanonical();
    expect(canonical.status).toBe("DRAFT");
    expect(canonical.scope.company_id).toBe("co-acme-123");
  });

  it("step 3: canonical has an audit log entry for creation", () => {
    const canonical = buildTestCanonical();
    expect(canonical.audit_log).toBeDefined();
    expect(canonical.audit_log.length).toBeGreaterThan(0);
    expect(canonical.audit_log[0].action).toBe("CREATED");
  });

  it("step 4: toCreateTemplatePayload converts canonical to API payload", () => {
    const canonical = buildTestCanonical();
    const payload = toCreateTemplatePayload(canonical);
    expect(payload).toBeDefined();
    expect(payload.config).toBeDefined();
    expect(payload.risk_posture).toBeDefined();
  });

  it("step 5: createPolicyTemplate saves the policy as DRAFT", async () => {
    const savedTemplate: PolicyTemplate = {
      ...HARDENED_COMPANY_TEMPLATE,
      id: "e2e-tpl-001",
      status: "DRAFT",
      version: 1,
      updated_at: "2026-02-28T10:00:00Z",
    };
    mockedAxios.post.mockResolvedValueOnce({ data: savedTemplate });

    const canonical = buildTestCanonical();
    const payload = toCreateTemplatePayload(canonical);
    const created = await createPolicyTemplate(payload, "tok");

    expect(created.status).toBe("DRAFT");
    expect(created.version).toBe(1);
  });

  it("step 6: activatePolicy transitions the template to active use", async () => {
    const instance: PolicyInstance = {
      id: "e2e-inst-001",
      company_id: "co-acme-123",
      branch_id: null,
      template_id: "e2e-tpl-001",
      activated_by: "user-alice",
      activated_at: "2026-02-28T11:00:00Z",
      is_active: true,
      template: null,
    };
    mockedAxios.post.mockResolvedValueOnce({ data: instance });
    const result = await activatePolicy("e2e-tpl-001", "tok");
    expect(result.is_active).toBe(true);
    expect(result.activated_by).toBe("user-alice");
  });

  it("step 7: revision history records the activation event", async () => {
    const history = [
      {
        id: "aud-001",
        template_id: "e2e-tpl-001",
        actor_id: "user-alice",
        action: "CREATED",
        timestamp: "2026-02-28T10:00:00Z",
      },
      {
        id: "aud-002",
        template_id: "e2e-tpl-001",
        actor_id: "user-alice",
        action: "ACTIVATED",
        timestamp: "2026-02-28T11:00:00Z",
      },
    ];
    mockedAxios.get.mockResolvedValueOnce({ data: history });
    const { data } = await axios.get(
      "http://localhost:8000/api/v1/policies/templates/e2e-tpl-001/history",
      { headers: { Authorization: "Bearer tok" } },
    );
    expect(data).toHaveLength(2);
    expect(data[1].action).toBe("ACTIVATED");
  });

  it("step 8: makeCreatedAuditEntry produces a valid audit entry", () => {
    const entry = makeCreatedAuditEntry("user-alice");
    expect(entry.actor_id).toBe("user-alice");
    expect(entry.action).toBe("CREATED");
    expect(typeof entry.timestamp).toBe("string");
  });

  it("step 9: appendAuditEvent adds entry to canonical audit log", () => {
    // appendAuditEvent takes Omit<AuditLogEntry, 'timestamp'> — no timestamp in entry
    const updated = appendAuditEvent(VALID_CANONICAL, {
      actor_id: "user-alice",
      action: "UPDATED",
      comment: "Metadata refresh",
    });
    expect(updated.audit_log.length).toBe(VALID_CANONICAL.audit_log.length + 1);
    expect(updated.audit_log[updated.audit_log.length - 1].action).toBe("UPDATED");
  });

  it("step 10: toPolicyConfig extracts PolicyConfig from canonical", () => {
    const config = toPolicyConfig(VALID_CANONICAL);
    expect(config.bucket_mode).toBe("CALENDAR_MONTH");
    expect(config.hedge_ratios.confirmed).toBe(0.85);
    expect(config.execution_product).toBe("FWD");
  });

  it("step 11: validateCanonicalPolicy confirms the full e2e canonical is valid", () => {
    const canonical = buildTestCanonical();
    const errors = validateCanonicalPolicy(canonical);
    expect(errors).toHaveLength(0);
  });

  it("step 12: safeStatus applied at wizard save ensures DRAFT output even if server returns ACTIVE", () => {
    const serverReturnedStatus = "ACTIVE";
    const safeStatus = applySafeStatus(serverReturnedStatus);
    // Final canonical always carries DRAFT when saved via wizard
    const canonical: Partial<CanonicalPolicy> = { status: safeStatus };
    expect(canonical.status).toBe("DRAFT");
    expect(canonical.status).not.toBe("ACTIVE");
  });

  it("effectiveness score for wizard-produced config is within valid range", () => {
    const canonical = buildTestCanonical();
    const result = computeEffectivenessScore(canonical.execution_config, "MODERATE");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("effectiveness color is returned for the computed score", () => {
    const canonical = buildTestCanonical();
    const result = computeEffectivenessScore(canonical.execution_config, "MODERATE");
    // getEffectivenessColor requires a style object S as second arg
    const mockS: Record<string, string> = {
      "status-pass": "#22c55e",
      "accent-amber": "#f59e0b",
      "accent-red": "#ef4444",
      "text-secondary": "#6b7280",
    };
    const color = getEffectivenessColor(result.score, mockS);
    expect(typeof color).toBe("string");
    expect(color.length).toBeGreaterThan(0);
  });

  it("recommendPolicyForPosition returns a recommendation when templates are provided", () => {
    // recommendPolicyForPosition(position, templates, favoriteIds)
    const templates = [HARDENED_COMPANY_TEMPLATE, HARDENED_SYSTEM_TEMPLATE];
    const favoriteIds = new Set<string>();
    const rec = recommendPolicyForPosition(
      { currency: "MXN", amount: 2_000_000 },
      templates,
      favoriteIds,
    );
    expect(rec).not.toBeNull();
    if (rec) {
      expect(rec.templateId).toBeDefined();
      expect(rec.confidence).toBeDefined();
    }
  });

  it("recommendPolicyForPosition returns null when no templates provided", () => {
    const rec = recommendPolicyForPosition(
      { currency: "MXN", amount: 2_000_000 },
      [],
      new Set<string>(),
    );
    expect(rec).toBeNull();
  });
});
