# Policy Engine — QA Test Stories
**Sprint:** Policy Engine Hardening
**Author:** QA Engineering
**Standard:** Bloomberg / BlackRock Institutional Grade
**Last Updated:** 2026-02-24
**Scope:** FXDemo — Policy Engine (`/policies`, `/ai-policy-wizard`, `/saved-policies`)
**Regulatory Refs:** IFRS 9.6.5, Basel III Op Risk, BCBS FRTB MAR23, SEC 17a-4, CFTC 1.31, ISDA 2002/2022

---

## Overview

This document defines acceptance test stories for the Policy Engine module covering:
- Policy Library (60 system presets)
- AI Policy Wizard (7-phase questionnaire)
- Saved Policies (CRUD, lifecycle, WORM audit)

**Pass criteria:** All TC cells populated with PASS. Zero FAIL or BLOCKED.
**Blocking defects:** Any FAIL in WORM, activation, or security stories blocks release.

---

## Story PE-001: Policy Library — Display and Filter
**Given** I am on the Policy Library (`/policies`)
**When** I load the page
**Then** all 60 system presets are visible and filterable by category and search

**Priority:** P1 - Blocking
**Components:** `policies/page.tsx`, `POLICY_PRESETS`

### Test Cases
| # | Steps | Expected | Pass/Fail |
|---|-------|----------|-----------|
| TC-001-1 | Navigate to `/policies`. | Page loads with preset grid. Category bar shows ALL / CORPORATE / FINANCIAL / SOVEREIGN / SECTOR counts. | |
| TC-001-2 | Click `CORPORATE` category chip. | Grid filters to corporate presets only. Count badge matches displayed cards. | |
| TC-001-3 | Type "airline" in the search box. | Only presets matching "airline" in name/description appear. | |
| TC-001-4 | Clear search. Click `ALL`. | All 60 presets visible again. | |
| TC-001-5 | Click `? HELP` button in header. | PolicyHelpPanel slides in from the right. | |
| TC-001-6 | With no active policy, inspect each preset card. | No card shows "ACTIVE" badge. | |
| TC-001-7 | Verify system preset cards do NOT show Edit/Delete buttons. | Only system-level view actions visible. | |
| TC-001-8 | Inspect a preset card formula field. | Formula renders in monospace. Not empty. | |

---

## Story PE-002: Policy Activation from Library
**Given** I am logged in as a real (non-demo) user with policy.activate permission
**When** I click `ACTIVATE POLICY` on a preset card
**Then** the policy is saved as the active instance for my company+branch

**Priority:** P1 - Blocking
**Components:** `activatePolicy()`, `POST /v1/policies/activate`, PolicyRevision WORM

### Test Cases
| # | Steps | Expected | Pass/Fail |
|---|-------|----------|-----------|
| TC-002-1 | Click `ACTIVATE POLICY` on "Balanced Corporate (BLNC)". | Toast: "Policy activated: BLNC". Card shows "ACTIVE" badge. | |
| TC-002-2 | Refresh the page. | "BLNC" card still shows "ACTIVE" — state persisted in DB. | |
| TC-002-3 | Activate a second policy "Conservative Treasury (CNSV)". | BLNC loses "ACTIVE". CNSV gains "ACTIVE". Only one active at a time. | |
| TC-002-4 | Activate with no DB template found. | Toast: "Template not found in database". No crash. | |
| TC-002-5 | Activate while unauthenticated. | Redirect to login or toast: "Not authenticated". | |
| TC-002-6 | `GET /v1/policies/active` after activation. | Returns PolicyInstance with `is_active=true`, `template_id` matching activated template. | |
| TC-002-7 | Check `GET /v1/policies/revisions/instance/{id}`. | Returns ≥1 PolicyRevision row with non-null `policy_hash`. | |

---

## Story PE-003: AI Policy Wizard — Phase Navigation
**Given** I am on the AI Policy Wizard (`/ai-policy-wizard`)
**When** I step through all 7 phases
**Then** each phase validates inputs before advancing

**Priority:** P1 - Blocking
**Components:** `ai-policy-wizard/page.tsx`, wizard state machine

### Test Cases
| # | Steps | Expected | Pass/Fail |
|---|-------|----------|-----------|
| TC-003-1 | Navigate to `/ai-policy-wizard`. | Phase A shown. Phase progress bar at step 1/14. | |
| TC-003-2 | Click Next without selecting `primaryObjective`. | Validation error shown. Step does not advance. | |
| TC-003-3 | Select "Cost Reduction" as objective. Click Next. | Advances to step 2. Completed set includes step 0. | |
| TC-003-4 | Click Back from step 2. | Returns to step 1. Previous selections intact. | |
| TC-003-5 | Complete all phases A-F (steps 0-12). | Reaches Phase G. AI loading spinner shown. | |
| TC-003-6 | Phase G loads: AI result renders. | 3 recommendation cards shown. First card auto-selected. | |
| TC-003-7 | Click "Start Over". | All wizard state reset. Step returns to 0. | |
| TC-003-8 | Complete wizard in < 2 minutes (speed test). | No race conditions. State is consistent at each step. | |

---

## Story PE-004: AI Wizard — Questionnaire Data Loading
**Given** I am on Phase A-F of the wizard
**When** I interact with each question field
**Then** all dropdowns, sliders, and toggles load and function correctly

**Priority:** P1 - Blocking
**Components:** WizardState INITIAL_STATE, step renderers

### Test Cases
| # | Steps | Expected | Pass/Fail |
|---|-------|----------|-----------|
| TC-004-1 | Phase A1: Primary Objective dropdown. | Shows 5+ options: Cost Reduction, P&L Stability, Cash Flow Certainty, etc. | |
| TC-004-2 | Phase A2: Company Type field. | Free text or dropdown with 8+ company types. | |
| TC-004-3 | Phase B1: FX Corridors multiselect. | At least 10 currency pairs selectable. Selected pairs persist on Back/Next. | |
| TC-004-4 | Phase B3: Materiality threshold slider. | Shows dollar value. Dragging updates displayed value in real time. | |
| TC-004-5 | Phase C1: Instruments grid. | NDF and FWD toggles shown. Enabling/disabling persists in state. | |
| TC-004-6 | Phase D1: Hedge ratio sliders. | Confirmed (0–100%) and Forecast (0–100%) sliders independent. | |
| TC-004-7 | Phase D1: Set Forecast > Confirmed. | Warning shown: "Forecast ratio should not exceed confirmed (hedge accounting convention)". | |
| TC-004-8 | Phase E1: Stress scenario toggles. | At least 3 stress scenarios (+20% FX shock, EM crisis, GFC replay). Each toggleable. | |

---

## Story PE-005: AI Wizard — Policy Save to Database
**Given** I have completed the wizard and AI recommendations are shown
**When** I click "Save as Draft" or "Save as Final"
**Then** the policy is persisted as a PolicyTemplate in the database

**Priority:** P1 - CRITICAL
**Components:** `createPolicyTemplate()`, `POST /v1/policies/templates`

### Test Cases
| # | Steps | Expected | Pass/Fail |
|---|-------|----------|-----------|
| TC-005-1 | Complete wizard. AI results shown. First recommendation auto-selected. | Policy Name and Tag pre-filled from recommendation. Save button enabled. | |
| TC-005-2 | Clear Policy Name. Click Save. | Error: "Policy name is required". Save blocked. | |
| TC-005-3 | Fill Policy Name "My Q1 Hedge Policy". Click "Save as Draft". | `POST /v1/policies/templates` called. Toast: "Policy saved". `saved=true`. | |
| TC-005-4 | Navigate to `/saved-policies`. | New policy "My Q1 Hedge Policy" visible in "My Policies" tab. | |
| TC-005-5 | Inspect saved template in DB: `GET /v1/policies/templates`. | Template has correct `name`, `short_name`, `config.hedge_ratios`, `risk_posture`. | |
| TC-005-6 | Click "Save and Activate". | Template created AND immediately activated. `GET /v1/policies/active` returns new instance. | |
| TC-005-7 | Save with `company_id = null` (unscoped user). | Error: "Not authenticated — please log in again". No template created. | |
| TC-005-8 | Save with server 422 validation error. | Error message shows server detail: "Validation error from server: {detail}". | |

---

## Story PE-006: Saved Policies — CRUD Operations
**Given** I am on the Saved Policies page (`/saved-policies`)
**When** I perform CRUD operations on custom policies
**Then** all operations succeed and UI reflects DB state

**Priority:** P1 - Blocking
**Components:** `saved-policies/page.tsx`, updatePolicyTemplate, deletePolicyTemplate

### Test Cases
| # | Steps | Expected | Pass/Fail |
|---|-------|----------|-----------|
| TC-006-1 | Open `/saved-policies`. Verify "My Policies" tab. | Custom policies (non-system, company_id matches mine) shown. | |
| TC-006-2 | Click Edit on a custom policy. | Edit modal opens pre-filled with current name, description, risk posture. | |
| TC-006-3 | In Edit modal: change name to "Updated Policy Name". Click Save. | `PATCH /v1/policies/templates/{id}` called. Toast: "Updated Policy Name updated". Card refreshes. | |
| TC-006-4 | Try to Edit a system template. | Edit button not shown on system template cards. No edit modal. | |
| TC-006-5 | Click Delete on a non-active custom policy. | Confirm modal shown: "This action is irreversible." | |
| TC-006-6 | Confirm deletion. | `DELETE /v1/policies/templates/{id}` called. Policy removed from list. Toast: "deleted". | |
| TC-006-7 | Try to Delete the currently active policy. | Error toast: "Cannot delete an active policy template. Deactivate it first." Policy remains. | |
| TC-006-8 | Click Duplicate on any policy. | New policy "X (Copy)" created in "My Policies" tab. Tab auto-switches to show it. | |

---

## Story PE-007: Policy Activation and Deactivation Lifecycle
**Given** I am on the Saved Policies page
**When** I activate and deactivate policies
**Then** only one policy is active at a time and WORM audit trail is maintained

**Priority:** P1 - Blocking
**Components:** activatePolicy, deactivatePolicy, PolicyRevision

### Test Cases
| # | Steps | Expected | Pass/Fail |
|---|-------|----------|-----------|
| TC-007-1 | Activate Policy A. | Policy A shows green "ACTIVE" badge. | |
| TC-007-2 | Activate Policy B while A is active. | Policy A loses badge. Policy B gains badge. Only one ACTIVE in DB. | |
| TC-007-3 | Click Deactivate on Policy B. | Confirm modal: "This will deactivate the currently active policy." | |
| TC-007-4 | Confirm deactivation. | `POST /v1/policies/deactivate` called. No policy shows ACTIVE badge. | |
| TC-007-5 | Refresh page after deactivation. | No active policy badge visible. `GET /v1/policies/active` returns null. | |
| TC-007-6 | Check PolicyRevision after activation. | `GET /v1/policies/revisions/instance/{id}` returns revision with `policy_hash` non-null. | |
| TC-007-7 | Try to activate a system template. | Activation succeeds (system templates are activatable). | |
| TC-007-8 | Activate while network offline. | Error toast: "Failed to activate. Please try again." No UI state corruption. | |

---

## Story PE-008: WORM Audit Trail Integrity
**Given** policy operations have been performed
**When** I inspect the audit trail
**Then** every activation creates an immutable, hash-chained PolicyRevision

**Priority:** P1 - CRITICAL (Regulatory)
**Components:** PolicyRevision model, `GET /v1/policies/revisions/`
**Regulatory:** SEC 17a-4, CFTC 1.31 — immutable records required

### Test Cases
| # | Steps | Expected | Pass/Fail |
|---|-------|----------|-----------|
| TC-008-1 | Activate Policy A. `GET /v1/policies/revisions/instance/{id}`. | Returns ≥1 revision. `policy_hash` is 64-char hex SHA-256. | |
| TC-008-2 | Activate Policy B (deactivates A). Fetch revisions for B. | New revision created for B with its own `policy_hash`. | |
| TC-008-3 | Attempt `DELETE /v1/policies/revisions/{id}` (or any mutation). | HTTP 405 Method Not Allowed. Revisions are immutable. | |
| TC-008-4 | Fetch revision diff `GET /v1/policies/revisions/{a}/diff/{b}`. | Returns structured diff: `fields_changed`, `fields_added`, `fields_removed`. | |
| TC-008-5 | Two activations of same template. | Two separate PolicyRevision rows. Same `policy_hash` (config unchanged). | |
| TC-008-6 | Modify template config. Reactivate. Fetch latest revision. | `policy_hash` is different from previous revision's hash. Tamper-evident. | |
| TC-008-7 | `created_by_email` in revision. | Matches the email of the user who activated the policy. | |
| TC-008-8 | `created_at` in all revisions. | ISO 8601 UTC. Monotonically increasing for successive activations. | |

---

## Story PE-009: Security — Authorization and Access Control
**Given** the Policy Engine API
**When** unauthorized or cross-company requests are made
**Then** all are rejected with appropriate HTTP status codes

**Priority:** P1 - CRITICAL (Security)
**Components:** `_check_permission()`, company_id scoping

### Test Cases
| # | Steps | Expected | Pass/Fail |
|---|-------|----------|-----------|
| TC-009-1 | `GET /v1/policies/templates` with no Authorization header. | HTTP 401 Unauthorized. | |
| TC-009-2 | `POST /v1/policies/activate` with no policy.activate permission. | HTTP 403 Forbidden. "Missing permission: policy.activate". | |
| TC-009-3 | `POST /v1/policies/templates` with no policy.create_preset permission. | HTTP 403 Forbidden. | |
| TC-009-4 | `PATCH /v1/policies/templates/{id}` on another company's template. | HTTP 404. Template not accessible. | |
| TC-009-5 | `DELETE /v1/policies/templates/{id}` on a system template. | HTTP 404. "System templates cannot be deleted". | |
| TC-009-6 | `PATCH /v1/policies/templates/{id}` on a system template. | HTTP 404. "System templates cannot be modified". | |
| TC-009-7 | Superuser: all operations succeed without explicit permissions. | HTTP 200/201/204 for all policy endpoints. | |
| TC-009-8 | `DELETE /v1/policies/templates/{id}` on the currently active template. | HTTP 422. "Cannot delete an active policy template. Deactivate it first." | |

---

## Story PE-010: Policy Template Validation
**Given** I attempt to create or update a policy template
**When** invalid data is submitted
**Then** the API returns 422 with detailed validation errors

**Priority:** P2
**Components:** `CreateTemplateRequest`, `UpdateTemplateRequest`, `PolicyConfigSchema`

### Test Cases
| # | Steps | Expected | Pass/Fail |
|---|-------|----------|-----------|
| TC-010-1 | POST with `name: ""` (empty string). | HTTP 422. "name: min_length 1". | |
| TC-010-2 | POST with `short_name` > 16 chars. | HTTP 422. "short_name: max_length 16". | |
| TC-010-3 | POST with `risk_posture: "RECKLESS"`. | HTTP 422. "risk_posture: pattern mismatch". | |
| TC-010-4 | POST with `hedge_ratios.confirmed: 1.5`. | HTTP 422. Ratio must be in [0, 1]. | |
| TC-010-5 | POST with `spread_bps: -1`. | HTTP 422. spread_bps must be ≥ 0. | |
| TC-010-6 | POST with `execution_product: "SWAP"`. | HTTP 422. Must be "NDF" or "FWD". | |
| TC-010-7 | PATCH with partial update `{name: "New Name"}`. | HTTP 200. Only name updated. All other fields unchanged. version incremented. | |
| TC-010-8 | PATCH with no body fields (all null). | HTTP 200. No-op. Template unchanged. | |

---

## Story PE-011: Policy Lifecycle — Full End-to-End
**Given** I am starting from a clean state (no active policy)
**When** I run the complete policy lifecycle
**Then** every step succeeds with audit trail maintained

**Priority:** P1 - CRITICAL
**Components:** All policy endpoints

### Full Lifecycle Sequence
```
Create Template → Activate → Assign to Position → Update Template →
Deactivate → Reactivate → Version Diff → Delete
```

### Test Cases
| # | Steps | Expected | Pass/Fail |
|---|-------|----------|-----------|
| TC-011-1 | Run AI wizard → Save as "Lifecycle Test Policy" → `GET /v1/policies/templates`. | Template exists with is_system=false, correct config. | |
| TC-011-2 | Activate "Lifecycle Test Policy" → `GET /v1/policies/active`. | Returns instance with template enriched. is_active=true. | |
| TC-011-3 | From Position Desk, assign active policy to a position. | Position shows policy_id non-null. | |
| TC-011-4 | Update template name → `GET /v1/policies/templates/{id}`. | version = 2. name updated. | |
| TC-011-5 | `POST /v1/policies/deactivate` → `GET /v1/policies/active`. | Returns null. No active policy. | |
| TC-011-6 | Reactivate "Lifecycle Test Policy" → check PolicyRevision count. | 2 revision rows for this instance. | |
| TC-011-7 | `GET /v1/policies/revisions/{rev1}/diff/{rev2}`. | Returns meaningful diff. | |
| TC-011-8 | `DELETE /v1/policies/templates/{id}` after deactivation. | HTTP 204. Template removed. `GET /v1/policies/templates` no longer includes it. | |

---

## Story PE-012: Help Panel — Policy Documentation
**Given** I am on any policy page
**When** I click `? HELP`
**Then** the PolicyHelpPanel slides in with full documentation for that page

**Priority:** P2
**Components:** `PolicyHelpPanel.tsx`

### Test Cases
| # | Steps | Expected | Pass/Fail |
|---|-------|----------|-----------|
| TC-012-1 | Click `? HELP` on `/policies`. | Panel opens with "Policy Library" section active. | |
| TC-012-2 | Panel renders for AI Wizard. | "AI Wizard" section active. All 7 phases documented. | |
| TC-012-3 | Panel has "Templates" section. | Each of the 4 template categories has comprehensive whitepaper content. | |
| TC-012-4 | Click outside panel. | Panel closes. Page state unchanged. | |
| TC-012-5 | Template whitepaper shows formula. | Mathematical formula notation visible (H* = ΔS/ΔFX or equivalent). | |
| TC-012-6 | Tips & Errors block rendered. | At least 3 TIP/ERR entries per section. | |
| TC-012-7 | Field reference table rendered. | FIELD / DESCRIPTION / VALID VALUES / REGULATORY NOTE columns all populated. | |
| TC-012-8 | Panel has regulatory footer. | "SEC Rule 17a-4 · IFRS 9 · Basel III" visible at panel bottom. | |

---

## Regulatory Compliance Matrix

| Regulation | Requirement | Policy Engine Stories |
|------------|-------------|----------------------|
| IFRS 9.6.5 | Hedge designation documentation | PE-005, PE-008, PE-011 |
| Basel III Op Risk | Policy governance and approval | PE-007, PE-008, PE-009 |
| BCBS FRTB MAR23 | Quantitative hedging standards | PE-004, PE-010 |
| SEC 17a-4 | Electronic records immutability | PE-008 |
| CFTC 1.31 | Audit trail tamper-evidence | PE-008, PE-011 |
| ISDA 2022 | Product eligibility (NDF/FWD) | PE-004, PE-010 |

---

## Sign-Off Requirements

- [ ] All 12 stories executed (96 test cases)
- [ ] Zero FAIL on PE-002, PE-005, PE-007, PE-008, PE-009, PE-011 (critical stories)
- [ ] WORM stories (PE-008) countersigned by Compliance liaison
- [ ] Security stories (PE-009) countersigned by InfoSec
- [ ] Help panel stories (PE-012) reviewed by Product Owner
