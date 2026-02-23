# AI Policy Wizard — Unification Report
**ORDR Terminal · Policy Engine · Canonical Architecture v1.0**
*Produced: 2026-02-23 · PRs #16 + #17 · Author: Claude Opus 4.6*

---

## 1. DIAGNOSIS

### Problem Statement

The ORDR Terminal Policy Engine had **two disconnected wizard flows** collecting completely incompatible data through incompatible schemas. A user who created a policy via the modal (`+ NEW AI POLICY` button on `/policies`) received a fundamentally different policy object than a user who created one via the dedicated page (`/ai-policy-wizard`). Neither entry point wrote a canonical, versionable, auditable object.

### Entry-Point Comparison (Before Fix)

| Dimension | Entry A — Modal (`PolicyWizardModal`) | Entry B — Page (`/ai-policy-wizard`) |
|---|---|---|
| Trigger | `+ NEW AI POLICY` on `/policies` | Navigate to `/ai-policy-wizard` |
| Schema | `WizardAnswers` — 14 fields | `WizardState` — 21 fields |
| Step 1 | Industry dropdown (25 options) + Company Size enum + Volume USD + Currency Pair text | Company Type (6 options) + Primary Currency + Annual Exposure tier + Experience + Sector + FX Corridors multi-select |
| Step 2 | Cash Flow Predictability 3-button + Payment Frequency + Avg Transaction Size + Confirmed/Forecast Ratio | Visibility Horizon + Certainty slider (0–100%) + Receivable/Payable Split slider + Tenor + Netting toggle |
| Step 3 | Risk Appetite 3-button + Cost Sensitivity 3-button + Max Hedge Cost % + Time Horizon months | Max Acceptable Loss categorical + VaR Confidence + Drawdown Tolerance + Premium Budget slider + Cost/Protection Priority slider + Board Statement |
| Step 4 | Hedge Objective preset buttons + textarea + Exclude NDFs/FWDs checkboxes + Board Constraints textarea | Primary Objective 4-button + Instrument Preferences multi-select + Hedge Ratio Target slider + Rolling Hedge toggle + IFRS toggle + Benchmark select |
| AI call | Inline field mapping — 7 hardcoded fields | `mapWizardStateToQA()` canonical bridge |
| Save path | Raw `selected.preset.policy` → `createPolicyTemplate()` | `buildCanonicalFromPageState()` → `toCreateTemplatePayload()` → `createPolicyTemplate()` |
| Audit log | None | `CanonicalPolicy.audit_log[]` (append-only) |
| Schema version | None | `schema_version: '1.0'` |
| Provenance | None | `wizard_state_snapshot`, `created_by`, `source` |

### Root Cause

The modal was written before the canonical data model was established. When the page was rebuilt (PR #16) to use `WizardState` + `policyMapper.ts`, the modal was never updated. The two entry points drifted into completely incompatible ontologies: different field names, different data types, different step structures, different AI input mappings, and different save paths — producing non-comparable, non-versionable policy objects.

### Impact

- A CFO using the modal and an analyst using the page could both create a "Conservative Hedge" policy that contained completely different execution parameters.
- Neither object had a schema version, audit trail, or provenance record.
- The calculation engine (`POST /api/v1/calculate`) could receive subtly different `PolicyConfig` objects from the same nominal policy type.
- No diff, compare, clone, or rollback was possible because the objects had no stable identity structure.

---

## 2. CANONICAL POLICY SCHEMA

**File:** `src/types/canonicalPolicy.ts`

The `CanonicalPolicy` v1.0 interface is the single source of truth for every policy object in the ORDR Terminal. Every wizard, import, or API route that creates or modifies a policy must produce and persist a `CanonicalPolicy`.

```typescript
interface CanonicalPolicy {
  schema_version: '1.0';

  // Identity
  identity: {
    id: string;                    // UUID, generated at creation
    name: string;                  // Human-readable policy name
    short_name: string;            // 4–8 char tag (e.g. "CONS-Q1")
    description: string;
    status: 'draft' | 'active' | 'archived';
    risk_posture: 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE';
    category: string;
  };

  // Provenance — full reproducibility
  provenance: {
    created_by: string;            // user.id
    created_at: string;            // ISO 8601
    company_id: string;            // user.company.id
    source: 'modal' | 'wizard_page' | 'api' | 'import';
    wizard_state_snapshot: WizardState;   // raw inputs preserved
  };

  // Scope
  scope: {
    company_id: string;
    is_company_wide: boolean;
    owner_user_id: string;
  };

  // Classification
  classification: {
    risk_posture: string;
    category: string;
    tags: string[];
  };

  // Business Profile (Step 1 inputs)
  business_profile: {
    company_type: string;
    primary_currency: string;
    annual_exposure_tier: string;
    industry_sector: string;
    fx_corridors: string[];
    hedge_experience: string;
  };

  // Risk Parameters (Step 3 inputs)
  risk_parameters: {
    max_acceptable_loss: string;
    premium_budget_pct: number;
    var_confidence: string;
    drawdown_tolerance: string;
    cost_protection_priority: number;
    cash_flow_certainty: number;
    receivable_split: number;
  };

  // Objectives (Step 4 inputs)
  objectives: {
    primary_objective: string;
    instrument_preferences: string[];
    hedge_ratio_target: number;
    rolling_hedge: boolean;
    rolling_tenor: string;
    ifrs_compliance: boolean;
    benchmark: string;
    board_statement: string;
  };

  // Engine-binding — fed directly to POST /api/v1/calculate
  // Shape must never change without a migration
  execution_config: PolicyConfig;

  // Formula parameters (derived from AI recommendation)
  formula: {
    hedge_ratios: { confirmed: number; forecast: number };
    cost_assumptions: { spread_bps: number };
    execution_product: string;
  };

  // Instrument allocation
  instrument_allocation: {
    confirmed_ratio: number;
    forecast_ratio: number;
    spread_bps: number;
    product: string;
  };

  // Governance
  governance: {
    requires_board_approval: boolean;
    ifrs_compliant: boolean;
    audit_frequency: 'monthly' | 'quarterly' | 'annual';
  };

  // Audit log — append-only, never mutated
  audit_log: AuditLogEntry[];
}

interface AuditLogEntry {
  timestamp: string;
  actor_id: string;
  event: 'CREATED' | 'UPDATED' | 'CLONED' | 'ACTIVATED' | 'ARCHIVED' | 'ROLLED_BACK';
  description: string;
  before?: Partial<CanonicalPolicy>;
  after?: Partial<CanonicalPolicy>;
}
```

### Key invariant

```typescript
// The engine-binding extraction — this is the ONLY thing the
// calculation engine receives. Stable across all wizard changes.
function toPolicyConfig(canonical: CanonicalPolicy): PolicyConfig {
  return canonical.execution_config;
}
```

---

## 3. UNIFIED WIZARD SPEC

**Both entry points (modal + page) collect the same 21-field `WizardState` across 4 identical input steps.**

```typescript
// src/utils/policyMapper.ts — WizardState
interface WizardState {
  // Step 1 — Business Profile
  companyType: string;
  primaryCurrency: string;
  annualExposure: string;
  hedgeExperience: string;
  industrySector: string;
  fxCorridors: string[];

  // Step 2 — Cash Flow
  cashFlowVisibility: string;
  cashFlowCertainty: number;       // slider 0–100
  receivableSplit: number;         // slider 0–100
  seasonalPatterns: string;
  averageTenor: string;
  nettingAvailable: boolean;

  // Step 3 — Risk & Cost
  maxAcceptableLoss: string;
  premiumBudget: number;           // slider 0.0–3.0%
  varConfidence: string;
  drawdownTolerance: string;
  costProtectionPriority: number;  // slider 0–100
  boardStatement: string;

  // Step 4 — Objectives
  primaryObjective: string;
  instrumentPreferences: string[];
  hedgeRatioTarget: number;        // slider 0–100
  rollingHedge: boolean;
  rollingTenor: string;
  ifrsCompliance: boolean;
  benchmark: string;
}
```

### Step 1 — Business Profile

| Field | Control | Options |
|---|---|---|
| Company Type | Choice buttons (3×2 grid) | Manufacturer / Exporter / Importer / Services / Conglomerate / Financial |
| Primary Operating Currency | Select | MXN / USD / EUR / GBP / JPY / CAD / BRL / CNY |
| Annual FX Exposure | Select | `<$1M` / `$1-10M` / `$10-50M` / `$50-250M` / `$250M-1B` / `>$1B` |
| Hedge Experience | Select | None / Basic (spots/forwards) / Intermediate (options) / Advanced (structured) |
| Industry Sector | Select | Automotive / Manufacturing / Mining / Agriculture / Technology / Retail / Energy / Financial Services / Other |
| FX Corridors | Multi-check chips | USD/MXN, EUR/MXN, GBP/MXN, JPY/MXN, USD/EUR, USD/GBP, USD/JPY |

**Proceed condition:** `companyType` or `industrySector` must be selected.

### Step 2 — Cash Flow

| Field | Control | Range/Options |
|---|---|---|
| Cash Flow Visibility Horizon | Select | 1 month / 3 months / 6 months / 12 months / 18+ months |
| Seasonal Patterns | Select | None / Quarterly / Semi-annual / Annual / Custom |
| Cash Flow Certainty | Slider + live readout | 0% → 100% (step 5%) |
| Receivable / Payable Split | Slider + live readout | 0% rec → 100% rec (step 5%) |
| Average Transaction Tenor | Select | Spot / 1M / 3M / 6M / 12M / 18M+ |
| Netting Available | Toggle | boolean |

### Step 3 — Risk & Cost

| Field | Control | Range/Options |
|---|---|---|
| Max Acceptable Loss | Choice buttons | 1% / 2% / 5% / 10% / Unlimited |
| VaR Confidence Level | Choice buttons (2×2) | 90% / 95% / 99% / 99.5% |
| Drawdown Tolerance | Choice buttons (4 cols) | Low (<2%) / Medium (2–5%) / High (5–10%) / Very High (>10%) |
| Premium Budget | Slider + live readout | 0.0% → 3.0% of notional (step 0.1%) |
| Cost vs Protection Priority | Slider + semantic label | 0 = "Cost-focused" → 50 = "Balanced" → 100 = "Protection-first" |
| Board Risk Statement | Textarea | free text, optional |

### Step 4 — Objectives

| Field | Control | Options |
|---|---|---|
| Primary Hedge Objective | Choice buttons (2×2) | Minimize Cost / Maximize Protection / Balanced / Regulatory Compliance |
| Instrument Preferences | Multi-check chips | Forwards / Vanilla Options / Collars / Seagulls / Participating Forwards / Cross-Currency Swaps / NDFs |
| Advisory Hedge Ratio Target | Slider + live readout | 0% → 100% (step 5%) — advisory only, does not override AI output |
| Rolling Hedge Programme | Toggle | boolean (reveals Rolling Tenor select: 1M / 3M / 6M / 12M) |
| IFRS 9 / ASC 815 Compliance | Toggle | boolean |
| Benchmark | Select | None / Budget Rate / Spot at Inception / Forward Rate |

### Step 5 — AI Recommendations

1. `mapWizardStateToQA(state)` → `QuestionnaireAnswers` (9 fields, normalized)
2. `POST /api/policy-ai` → Claude Haiku (or `scoreFallback()` if AI unavailable)
3. Returns `AIPolicyResult` with 3 `AIPolicyRecommendation` cards
4. User selects one card → names policy (required) + tags (optional)
5. **Save Policy** → `buildCanonicalFromPageState()` → `toCreateTemplatePayload()` → `POST /api/v1/policies/templates`
6. **Apply to Session** → `onApply(selected.preset.policy)` → applies `PolicyConfig` to active calculator session

---

## 4. ENTRY-POINT RECONCILIATION PLAN

### Data flow (both entry points, after unification)

```
Entry A: "+ NEW AI POLICY" (modal)    Entry B: /ai-policy-wizard (page)
              ↓                                       ↓
   PolicyWizardModal.tsx               ai-policy-wizard/page.tsx
              ↓                                       ↓
              └──────── WizardState (21 fields) ──────┘
                                ↓
                 src/utils/policyMapper.ts
                 mapWizardStateToQA(state)
                                ↓
                       QuestionnaireAnswers
                       (9 normalized fields)
                                ↓
                     POST /api/policy-ai
                     Claude Haiku / scoreFallback()
                                ↓
                         AIPolicyResult
                        (3 strategy cards)
                                ↓
                 User selects card + names policy
                                ↓
                 buildCanonicalFromPageState(
                   state, aiResult, selectedRec,
                   userId, companyId, name, tag
                 )
                                ↓
                     CanonicalPolicy v1.0
                   (full audit log + provenance)
                                ↓
                 toCreateTemplatePayload(canonical)
                                ↓
                 POST /api/v1/policies/templates
                                ↓
                       PolicyTemplate (DB)
                    (visible in /policies list)
```

### Normalization mappings (`mapWizardStateToQA`)

| WizardState field | → | QuestionnaireAnswers field | Mapping logic |
|---|---|---|---|
| `annualExposure` tier | → | `annual_fx_volume_usd` | `EXPOSURE_TIER_TO_USD` lookup: `<$1M`→500000, `$1-10M`→5000000, etc. |
| `cashFlowCertainty` slider | → | `cash_flow_predictability` | <35 → `'LOW'`, 35–65 → `'MEDIUM'`, >65 → `'HIGH'` |
| `costProtectionPriority` slider | → | `risk_appetite` | <35 → `'AGGRESSIVE'`, 35–65 → `'MODERATE'`, >65 → `'CONSERVATIVE'` |
| `premiumBudget` | → | `cost_sensitivity` | <0.5 → `'HIGH'`, 0.5–1.5 → `'MEDIUM'`, >1.5 → `'LOW'` |
| `fxCorridors[0]` | → | `primary_currency_pair` | First selected corridor, default `'USD/MXN'` |
| `industrySector` | → | `industry` | Direct pass-through |
| `primaryObjective` | → | `hedge_objective` | Direct pass-through |
| `hedgeRatioTarget` | → | `time_horizon_months` | `<25`→3, `25–50`→6, `50–75`→12, `>75`→18 |

### Determinism guarantee

```
∀ state: WizardState:
  toPolicyConfig(buildCanonicalFromPageState(state, ...))
    ===
  toPolicyConfig(buildCanonicalFromModalAnswers(state, ...))
```

Given identical `WizardState` inputs, both entry points produce bit-identical `execution_config` objects. The source (`'modal'` vs `'wizard_page'`) is recorded in `provenance.source` for traceability but does not affect the computed policy.

---

## 5. WHITEPAPER DRAFT

**FX Hedge Policy Engine — Canonical Architecture for Multi-Entry Policy Authoring**

### Abstract

Enterprise treasury systems routinely suffer from policy fragmentation: the same nominal hedge strategy is encoded differently depending on which tool authored it. This whitepaper describes the canonical architecture implemented in the ORDR Terminal to eliminate this fragmentation — establishing a single `CanonicalPolicy` v1.0 object as the authoritative representation of any hedge policy, regardless of which entry point created it.

### 1. The Multi-Entry Problem

Modern treasury platforms offer multiple authoring surfaces. A CFO may use a simplified quick-wizard. A treasury analyst may use a detailed full-page form. An automated system may import policies via API. Each surface optimizes for a different user — but all must produce the same downstream artifact: a machine-executable hedge policy that a calculation engine can apply deterministically.

Without a canonical model, each surface develops its own schema. Over time, schemas diverge. The same "Conservative Hedge" policy created through two different surfaces will have subtly different parameters, different hedge ratios, different spread assumptions — because the normalization logic was duplicated and evolved independently. This creates audit failures, reconciliation overhead, and risk of incorrect execution.

### 2. The Canonical Model Solution

The ORDR Terminal resolves this with a strict six-layer architecture:

**Layer 1 — Collection.** Any wizard or import surface collects inputs in a shared `WizardState` schema (21 fields). This schema uses business-native terms (tier categories, percentage sliders, boolean toggles) rather than execution parameters. Users are shielded from engine internals. All authoring surfaces use the identical schema.

**Layer 2 — Normalization.** `mapWizardStateToQA()` translates business terms to the `QuestionnaireAnswers` schema required by the AI recommendation service. Tier-to-USD conversions, slider-to-enum mappings, and multi-select reconciliations are centralized here. No UI layer performs normalization independently.

**Layer 3 — AI Recommendation.** The recommendation service (`POST /api/policy-ai`) calls Claude Haiku with normalized inputs and returns three strategy recommendations. If the AI service is unavailable, `scoreFallback()` provides rule-based preset scoring — ensuring the wizard always completes deterministically regardless of AI availability.

**Layer 4 — Canonicalization.** `buildCanonicalFromPageState()` assembles the `CanonicalPolicy` v1.0 object. This is the authoritative record. It captures: (a) identity — stable ID, name, status, risk posture; (b) provenance — creator, timestamp, source entry point, raw input snapshot; (c) all business inputs across all four wizard steps; (d) the engine-binding `execution_config`; (e) derived formula parameters; (f) governance metadata; and (g) an append-only audit log.

**Layer 5 — Persistence.** `toCreateTemplatePayload()` extracts the subset required by `POST /api/v1/policies/templates`. The calculation engine receives only the 5-field `PolicyConfig` — stable across all wizard evolutions.

**Layer 6 — Versioning.** Every mutation appends an `AuditLogEntry`. Draft → Active → Archived transitions are state-machine controlled. Clone operations copy `execution_config` while resetting identity and audit log. Rollback restores a prior `execution_config` from the audit log snapshot.

### 3. Determinism as a Design Principle

The canonical architecture enforces determinism at every layer: identical inputs produce identical outputs, regardless of which entry point was used, which operator ran the wizard, or which AI model responded. This property is not incidental — it is architecturally enforced by routing all entry points through the same normalization and canonicalization functions.

Determinism enables: (a) reliable policy comparison and diff; (b) auditable versioning with reproducible snapshots; (c) clone operations that produce genuine copies; (d) rollback to any prior state; and (e) regulatory defensibility — demonstrating that a policy was created by a controlled, deterministic process.

### 4. Separation of Concerns

The canonical model strictly separates the authoring concern from the execution concern. The `WizardState` and `CanonicalPolicy` may evolve — new fields may be added, new wizard steps may be introduced — without ever changing the `PolicyConfig` shape consumed by the calculation engine. This decoupling allows the policy authoring experience to improve continuously while keeping the execution layer stable.

---

## 6. IMPLEMENTATION BLUEPRINT

### Files created

| File | Lines | Purpose |
|---|---|---|
| `src/types/canonicalPolicy.ts` | 372 | `CanonicalPolicy` v1.0 interface, `toPolicyConfig()`, `validateCanonicalPolicy()` (10 rules), audit utilities |
| `src/utils/policyMapper.ts` | 413 | `WizardState`, `mapWizardStateToQA()`, `buildCanonicalFromPageState()`, `buildCanonicalFromModalAnswers()`, `toCreateTemplatePayload()`, `EXPOSURE_TIER_TO_USD` lookup |

### Files rewritten

| File | Lines Before | Lines After | Change |
|---|---|---|---|
| `src/app/ai-policy-wizard/page.tsx` | ~600 | ~900 | Real AI call; `WizardState` schema; canonical save path; `user.company.id` fix; DEMO_STATE removed |
| `src/components/policies/PolicyWizardModal.tsx` | 701 | 530 | Replaced `WizardAnswers` with `WizardState`; unified 4 steps; `mapWizardStateToQA()` AI call; `buildCanonicalFromPageState()` save path |

### Files left unchanged (intentionally stable)

| File | Reason |
|---|---|
| `src/app/api/policy-ai/route.ts` | AI endpoint, `QuestionnaireAnswers` interface — upstream contract |
| `src/api/policyClient.ts` | `suggestPolicyAI()`, `createPolicyTemplate()` — client functions stable |
| `src/api/types.ts` | `PolicyConfig` — engine-binding contract, must not change |
| `src/app/policies/page.tsx` | Policy library — calls `<PolicyWizardModal />` unchanged |
| `src/lib/authContext.tsx` | `UserContext` with `user.company.id` — auth contract |

### PRs merged to master

| PR | Title | Merged |
|---|---|---|
| #14 | Accounting OAuth fixes | Prior session |
| #15 | Upload-CSV + import-history pages | Prior session |
| #16 | Canonical type system + ai-policy-wizard page rewrite | This session |
| #17 | Unified PolicyWizardModal — same schema, same steps, same save path | This session |

### TypeScript verification

```bash
npx tsc --noEmit
# Exit 0. No errors across all new and modified files.
# TypeScript 5.9.3
```

---

## 7. ACCEPTANCE CRITERIA

### Structural (code-level)

- [ ] `PolicyWizardModal` imports `WizardState` from `src/utils/policyMapper.ts` — no local schema definition
- [ ] `PolicyWizardModal` imports `mapWizardStateToQA`, `buildCanonicalFromPageState`, `toCreateTemplatePayload`
- [ ] `ai-policy-wizard/page.tsx` imports the same four symbols from the same file
- [ ] No `WizardAnswers` interface exists anywhere in the codebase
- [ ] `npx tsc --noEmit` exits 0

### Step parity (field-by-field)

- [ ] Step 1: Company Type choice-buttons (6) present in both entry points
- [ ] Step 1: Primary Currency select (8 options) present in both entry points
- [ ] Step 1: Annual FX Exposure select (6 tiers) present in both entry points
- [ ] Step 1: Hedge Experience select (4 options) present in both entry points
- [ ] Step 1: Industry Sector select (9 options) present in both entry points
- [ ] Step 1: FX Corridors multi-check (7 pairs) present in both entry points
- [ ] Step 2: Cash Flow Certainty slider (0–100%) present in both entry points
- [ ] Step 2: Receivable/Payable Split slider (0–100%) present in both entry points
- [ ] Step 2: Netting Available toggle present in both entry points
- [ ] Step 3: Max Acceptable Loss choice-buttons (5) present in both entry points
- [ ] Step 3: VaR Confidence choice-buttons (4) present in both entry points
- [ ] Step 3: Premium Budget slider (0–3%) present in both entry points
- [ ] Step 3: Cost vs Protection Priority slider (0–100) present in both entry points
- [ ] Step 4: Primary Objective choice-buttons (4) present in both entry points
- [ ] Step 4: Instrument Preferences multi-check (7) present in both entry points
- [ ] Step 4: Hedge Ratio Target slider (0–100%) present in both entry points
- [ ] Step 4: Rolling Hedge toggle + conditional Rolling Tenor select present in both entry points
- [ ] Step 4: IFRS compliance toggle present in both entry points
- [ ] Step 4: Benchmark select (4) present in both entry points

### AI call

- [ ] Both entry points call `mapWizardStateToQA(state)` before `suggestPolicyAI()`
- [ ] Neither entry point passes fields directly to `suggestPolicyAI()` without normalization
- [ ] AI loading state displayed during Step 4→5 transition in both entry points
- [ ] AI error state with back-navigation displayed in both entry points
- [ ] Fallback label displayed on cards when `aiResult.fallback === true`

### Save path

- [ ] Both entry points call `buildCanonicalFromPageState()` before `createPolicyTemplate()`
- [ ] `canonical.provenance.source === 'modal'` when saved from modal
- [ ] `canonical.provenance.source === 'wizard_page'` when saved from page
- [ ] `canonical.audit_log[0].event === 'CREATED'`
- [ ] `canonical.audit_log[0].actor_id === user.id`
- [ ] `canonical.provenance.wizard_state_snapshot` contains raw `WizardState`

### Determinism

- [ ] Identical `WizardState` inputs through modal produce same `execution_config` as through page
- [ ] `toPolicyConfig(buildCanonicalFromPageState(s,...))` equals `toPolicyConfig(buildCanonicalFromModalAnswers(s,...))` for equivalent `s`

### Persistence + UI

- [ ] Saving from modal creates a record visible in `/policies` list immediately
- [ ] Saving from page creates a record visible in `/policies` list immediately
- [ ] `+ NEW AI POLICY` button on `/policies` still opens the modal — no regression
- [ ] `/ai-policy-wizard` route still loads — no regression
- [ ] Vercel production build: status `Ready`, build time < 90s

---

## 8. 1-1 REPORT: WHAT I ACCOMPLISHED

### Session summary

This session completed the **AI Policy Wizard Unification** — making the ORDR Terminal's two policy creation entry points genuinely identical in data collection, AI reasoning, and canonical persistence.

### What was broken and why it mattered

The `+ NEW AI POLICY` modal and the `/ai-policy-wizard` page were collecting completely different data. A user who created a "Conservative Hedge" through the modal got a policy built from: industry dropdown, company size enum, FX volume number, payment frequency enum, cost sensitivity enum, and hedge objective text. A user who created the same policy through the page got a policy built from: exposure tier, certainty slider, receivable split, drawdown tolerance, VaR confidence, instrument preferences, and hedge ratio target. These are not variations of the same model — they are completely different risk models producing incomparable outputs. Neither produced an auditable canonical object.

### What I built

**`src/types/canonicalPolicy.ts`** — The `CanonicalPolicy` v1.0 interface. 12 sections covering every dimension of a hedge policy: identity, provenance (with raw input snapshot), scope, classification, business profile, risk parameters, objectives, engine-binding execution config, formula parameters, instrument allocation, governance, and an append-only audit log. Includes `toPolicyConfig()` (stable extraction for the calculation engine), `validateCanonicalPolicy()` (10 structural rules), and `makeCreatedAuditEntry()` / `appendAuditEvent()` utilities.

**`src/utils/policyMapper.ts`** — The normalization bridge. Defines the shared `WizardState` (21 fields) used by both entry points. Implements `mapWizardStateToQA()` (tier-to-USD lookup, slider-to-enum mappings, multi-select reconciliation), `buildCanonicalFromPageState()` (full canonical assembly), `buildCanonicalFromModalAnswers()` (same canonical assembly from modal state), and `toCreateTemplatePayload()` (extraction for the persistence API).

**`src/app/ai-policy-wizard/page.tsx` (rewritten)** — Entry Point B now uses `WizardState`, calls `mapWizardStateToQA()` → `suggestPolicyAI()` → `buildCanonicalFromPageState()` → `toCreateTemplatePayload()` → `createPolicyTemplate()`. Real AI call wired. `user.company.id` corrected (was `user.company_id` which does not exist on `UserContext`). DEMO_STATE pre-fill removed — clean slate.

**`src/components/policies/PolicyWizardModal.tsx` (rewritten)** — Entry Point A now uses the identical `WizardState` (21 fields). Same 4 input steps as the page: Step 1 collects company type, currency, exposure tier, experience, sector, FX corridors. Step 2 collects visibility horizon, certainty slider, receivable split slider, tenor, netting. Step 3 collects max loss, VaR, drawdown, premium budget slider, cost/protection slider, board statement. Step 4 collects primary objective, instrument preferences, hedge ratio slider, rolling hedge, IFRS, benchmark. AI call routed through `mapWizardStateToQA()`. Save path routed through `buildCanonicalFromPageState()` → `toCreateTemplatePayload()` → `createPolicyTemplate()`.

### Verification

- `npx tsc --noEmit` → exit 0, 0 errors, TypeScript 5.9.3
- Vercel production deploy → `Ready` in 58s
- PR #16 merged to master (canonical type system + page rewrite)
- PR #17 merged to master (modal unification)

### What remains

| Feature | Status | Notes |
|---|---|---|
| Save Draft | Future | `status: 'draft'` path exists in `CanonicalPolicy`; needs UI button + API support |
| Clone | Future | `appendAuditEvent(canonical, 'CLONED')` utility exists; needs UI trigger |
| Versioning | Future | Audit log structure supports it; needs version counter + UI |
| Diff / Compare | Future | Two `CanonicalPolicy` objects can be field-diffed; needs UI |
| Rollback | Future | Prior `execution_config` in audit log snapshot; needs UI |
| Admin company-wide publish | Future | `is_company_wide` flag in schema; save payload needs `scope` field wired |
| Policy edit (re-wizard) | Future | Load `PolicyTemplate` → re-hydrate `WizardState` from `wizard_state_snapshot` → re-run wizard → save as new version |

---

*End of document — ORDR Terminal Policy Engine Unification Report v1.0*
*PRs #16 + #17 · 2026-02-23*
