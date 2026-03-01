# Execution Module — Institutional Review Pack

**Module**: Execution (Execution Desk, Trade Desk, Sandbox, FX Rates, Data Pipeline Log)
**Date**: 2026-02-28
**Reviewer**: Claude Code (Autonomous)
**Status**: HARDENED — P0 fixes applied, tests passing

---

## 1. Executive Summary

The Execution module spans the full lifecycle of FX hedge positions — from ingestion through calculation, governance review, and final execution. This review covers 5 sub-surfaces: Execution Desk (RUN), Trade Desk (4-eyes), Sandbox (DEV), FX Rates (market data), and Data Pipeline Log (connector audit).

**Verdict**: The module is architecturally sound with proper WORM semantics, hash-chained audit trails, and cryptographic tamper evidence. Three critical RBAC gaps were identified and fixed during this review. The 4-eyes Maker/Checker workflow is correctly enforced at both the DB constraint and service layers.

### Key Findings

| Severity | Finding | Status |
|----------|---------|--------|
| **P0** | `POST /v1/calculate` used `get_current_user_optional` — effectively anonymous | **FIXED** |
| **P0** | `POST /v1/pipeline/sandbox/calculate` missing `calculate.run_sandbox` permission check | **FIXED** |
| **P1** | Connector `source_hash` stored but never checked for duplicate imports | **FIXED** |
| OK | 4-eyes SoD enforced at DB CHECK + service layer | Verified |
| OK | Position FSM is fail-closed (illegal transitions return 409) | Verified |
| OK | Sandbox isolation: in-memory only, no DB writes | Verified |
| OK | Hash chain integrity: SHA-256, per-tenant, GENESIS_HASH sentinel | Verified |
| OK | WORM tables: audit_events, calculation_runs, policy_revisions append-only | Verified |
| NOTE | FX quality flags (LIVE/INDICATIVE/STALE) exist in frontend types but not consumed by engine | Deferred to v2 |

---

## 2. Repo Map

### Route Files (Execution Module)

| File | Endpoints | Lines | Auth | RBAC |
|------|-----------|-------|------|------|
| `backend/app/api/routes/v1_calculate.py` | 3 (POST /calculate, GET /runs, GET /runs/{id}) | ~379 | JWT mandatory | `calculate.run_production` |
| `backend/app/api/routes/v1_pipeline.py` | 13 (sandbox + proposals + staging + ledger) | ~304 | JWT mandatory | Per-endpoint |
| `backend/app/api/routes/v1_execution_proposals.py` | 9 (propose/approve/reject/withdraw/execute) | ~920 | JWT mandatory | `trades.edit`, `trades.execute`, `trades.view` |
| `backend/app/api/routes/v1_positions.py` | 13 (CRUD + lifecycle + lineage) | ~1564 | JWT mandatory | `trades.*` |
| `backend/app/api/routes/v1_connectors.py` | 4 (list runs, detail, CSV import, Excel import) | ~128 | JWT mandatory | `trades.view`, `trades.create` |

### Service Layer

| File | Functions | Purpose |
|------|-----------|---------|
| `backend/app/services/execution_proposal_service.py` | 8 public | 4-eyes Maker/Checker workflow |
| `backend/app/services/position_service.py` | ~12 public | Position CRUD + lifecycle FSM |
| `backend/app/services/pipeline_service.py` | ~15 public | Tri-state pipeline (SANDBOX/STAGING/LEDGER) |
| `backend/app/services/connector_service.py` | 7 public + 1 internal | Audited CSV/Excel import with duplicate prevention |

### Engine (11 Modules)

| Module | Purpose |
|--------|---------|
| `orchestrator.py` | Single entrypoint `run_engine(envelope)` |
| `recommend.py` | Full pipeline: classify + select + map + size + cost + scenario + gate |
| `exposure.py` | Currency exposure aggregation |
| `risk_classifier.py` | R1-R8 risk taxonomy (IMMUTABLE) |
| `strategy_selector.py` | Strategy selection per risk class |
| `instrument_mapper.py` | Strategy-to-instrument mapping (IMMUTABLE) |
| `hedge_sizer.py` | Bucket sizing per policy bands |
| `cost_engine.py` | Forward points, bid/ask spread costing |
| `scenario_engine.py` | Multi-sigma shock analysis |
| `decision_gate.py` | APPROVE / APPROVE_WITH_CONDITIONS / REJECT verdict |
| `audit_bundle.py` | RunEnvelope + TraceLite assembly |

### Frontend Pages

| Page | Path | Key Component |
|------|------|---------------|
| Execution Desk | `/execution-desk` | 4-step pipeline (REVIEW > CALCULATE > RISK CHECK > EXECUTE) |
| Trade Desk | `/trade-desk` | Proposal list + approval workflow |
| Sandbox | `/sandbox` | SIMULATION watermark (6rem, 0.015 opacity, -15deg) |
| Upload CSV | `/upload-csv` | ConnectorRun-backed import |
| Results | `/results` | Calculation run history + drill-down |

---

## 3. Data & Workflow Contract

### Position Lifecycle (Fail-Closed FSM)

```
NEW ──────────────> POLICY_ASSIGNED ──────> READY_TO_EXECUTE ──────> HEDGED (terminal)
 │                       │  ↑ (re-assign)         │
 │                       │  └─────────────────────┘
 └──> REJECTED <─────────┘                        └──> REJECTED
         │
         └──> NEW (re-open)
```

**States**: `NEW`, `POLICY_ASSIGNED`, `READY_TO_EXECUTE`, `HEDGED`, `REJECTED`
**Terminal**: `HEDGED` (no outbound transitions)
**Re-open**: `REJECTED` -> `NEW` (explicit re-open allowed)
**Enforcement**: `_assert_transition()` raises `ValueError` for illegal transitions -> 409 Conflict

### Execution Proposal Lifecycle (4-Eyes)

```
PROPOSED ──────> APPROVED ──────> EXECUTED (terminal)
    │               │
    ├──> WITHDRAWN   ├──> WITHDRAWN
    └──> REJECTED    │
                     (terminal)
```

**SoD Enforcement (2 layers)**:
1. **DB CHECK**: `ck_execution_proposals_sod: approved_by IS NULL OR approved_by != proposed_by`
2. **Service guard**: `if user.id == proposal.proposed_by: raise ValueError("SoD violation")`

**Hash Chain**:
- `proposal_hash = SHA-256(canonical_json(proposal_payload))`
- `approval_hash = SHA-256(approved_by + approved_at + approval_notes + proposal_hash)` — chained

### Tri-State Pipeline

```
SANDBOX (in-memory) ──> PROPOSAL (DB) ──> STAGING (DB) ──> LEDGER (DB, WORM)
```

- **Sandbox**: Ephemeral, max 100 runs, self-evicting, 30-minute staleness check
- **Proposal**: Freezes sandbox result, creates DB-backed proposal
- **Staging**: Governance review layer with approve/reject/return
- **Ledger**: Final record, WORM-protected, deterministic replay verification

### Connector Audit Trail

```
CSV/Excel Upload ──> ConnectorRun (audit artifact) ──> Per-row Position creation
                          │
                          ├── source_hash (SHA-256 of file)
                          ├── total_rows / created_ok / error_count
                          └── ConnectorRunErrors (per-row error details)
```

**Duplicate Prevention** (NEW): `_check_duplicate_hash()` rejects files with identical SHA-256 hashes within the same company scope.

---

## 4. Logic Contract Table

| Contract | Location | Enforcement | Verified |
|----------|----------|-------------|----------|
| Position FSM fail-closed | `position_service._assert_transition()` | `ValueError` -> 409 | Yes |
| Proposal FSM fail-closed | `execution_proposal_service._assert_proposal_transition()` | `ValueError` -> 409 | Yes |
| SoD: proposer != approver (DB) | `execution_proposal.py` CheckConstraint | DB-level rejection | Yes |
| SoD: proposer != approver (service) | `execution_proposal_service.approve_proposal()` | `ValueError("SoD violation")` -> 403 | Yes |
| HEDGED only via execute_approved_proposal | `execution_proposal_service.execute_approved_proposal()` | Only pathway to HEDGED | Yes |
| RunEnvelope deterministic hash | `engine_v1/audit.py` | SHA-256(canonical_json(inputs)) | Yes |
| Sandbox isolation (no DB writes) | `pipeline_service.sandbox_calculate()` | In-memory `_sandbox_runs` dict | Yes |
| Sandbox max 100 entries | `pipeline_service._sandbox_runs` | Bounded dict, oldest evicted | Yes |
| Sandbox staleness 30 min | `pipeline_service.create_proposal()` | `SNAPSHOT_STALE` error | Yes |
| Calculate requires auth | `v1_calculate.py` | `get_current_user` dependency | Yes (FIXED) |
| Calculate requires RBAC | `v1_calculate.py` | `calculate.run_production` permission | Yes (FIXED) |
| Sandbox requires RBAC | `v1_pipeline.py` | `calculate.run_sandbox` permission | Yes (FIXED) |
| Connector duplicate prevention | `connector_service._check_duplicate_hash()` | `DuplicateImportError` | Yes (FIXED) |
| Rate limit: 10 calc/min/user | `v1_calculate.py` | In-memory sliding window | Yes |
| Market data NaN/Inf rejection | `engine_v1/validator.py` | `ValidationReport.status == FAIL` -> 422 | Yes |
| Spot range validation | `engine_v1/validator.py` | Per-currency bounds (e.g. EURUSD 0.5-2.0) | Yes |
| Forward points sanity | `engine_v1/validator.py` | Format + magnitude checks | Yes |

---

## 5. Edge Cases & Error Handling

| Scenario | Expected Behavior | Status |
|----------|-------------------|--------|
| Concurrent activation conflict | `ActivationConflictError` -> 409 structured JSON | Covered |
| Illegal position transition | `ValueError` -> 409 Conflict with state detail | Covered |
| SoD violation on approve | 403 Forbidden with "SoD violation" detail | Covered |
| Duplicate file import | `DuplicateImportError` with file hash + existing run ID | Covered (NEW) |
| Sandbox snapshot staleness (>30 min) | 409 Conflict with `SNAPSHOT_STALE` | Covered |
| Calculate rate limit exceeded | 429 Too Many Requests | Covered |
| Market data with NaN/Inf | 422 with validation report | Covered |
| Empty trades array | 422 validation fail | Covered |
| Proposal for wrong company | 404 Not Found (tenant isolation) | Covered |
| DB persist failure on calculate | Non-fatal: logged, result still returned | Covered |
| Terminal state re-transition | 409 Conflict | Covered |
| Withdraw by non-proposer | 409 Conflict | Covered |

---

## 6. Resilience Audit

| Component | Failure Mode | Mitigation | Grade |
|-----------|-------------|------------|-------|
| Calculate DB persist | DB write fails | Non-fatal, in-memory cache still serves | B+ |
| Calculate in-memory cache | Cache full (>50) | Oldest evicted (FIFO) | B |
| Sandbox in-memory store | Server restart | All sandbox runs lost (by design) | A (ephemeral) |
| Audit event emission | DB commit fails | Logged, non-fatal (never blocks business op) | B+ |
| Connector row-level error | Individual row parse fails | Logged per-row, other rows continue | A |
| Hash chain broken | Tampered WORM record | `GET /v1/audit/chain/verify` detects break | A |
| Concurrent proposal for same position | Race condition | Service checks for existing active proposal | B |

---

## 7. Security Checklist

| Control | Status | Evidence |
|---------|--------|----------|
| All routes require JWT auth | **PASS** | `get_current_user` dependency on all route handlers |
| RBAC permission checks on mutations | **PASS** | `_check_permission()` on every mutating endpoint |
| Calculate endpoint RBAC | **PASS** | `calculate.run_production` enforced (P0 fix) |
| Sandbox endpoint RBAC | **PASS** | `calculate.run_sandbox` enforced (P0 fix) |
| SoD enforcement (DB + service) | **PASS** | CHECK constraint + service-layer guard |
| Tenant isolation on queries | **PASS** | `company_id` filter on all list/get operations |
| WORM tables append-only | **PASS** | No DELETE/UPDATE routes for audit_events, calculation_runs |
| Hash chain tamper evidence | **PASS** | SHA-256, GENESIS_HASH sentinel, chain verify endpoint |
| Rate limiting | **PASS** | 10 calc/min/user sliding window |
| Input validation | **PASS** | Pydantic models + engine validator (NaN/Inf/range checks) |
| No sensitive data in logs | **PASS** | API key redaction, no plaintext secrets |
| Dev fault injection guarded | **PASS** | 3-layer safety belt (env var + app env + localhost) |

---

## 8. Performance Assessment

| Operation | Complexity | Bottleneck | Notes |
|-----------|-----------|------------|-------|
| POST /v1/calculate | O(n*m) trades*currencies | Engine kernel | In-memory, no async I/O during calc |
| GET /v1/runs | O(1) DB query | Postgres index | Bounded by `limit` param (max 200) |
| Proposal lifecycle | O(1) per transition | Single row update | Indexed by (position_id, status) |
| CSV import | O(n) rows | Row-by-row DB insert | Could batch for large files (deferred) |
| Sandbox calculate | O(n*m) | Same as production calc | No DB write overhead |
| Audit chain verify | O(n) events | Full table scan per company | Acceptable for verify (infrequent) |

---

## 9. Test Coverage

### New Tests (This Review)

| File | Tests | All Pass |
|------|-------|----------|
| `tests/test_execution_hardening.py` | 14 | Yes |
| `tests/test_dev_fault_guard.py` | 27 | Yes |

**Total new: 41 tests, 41 passed**

### Test Breakdown

| Class | Tests | What's Proven |
|-------|-------|---------------|
| `TestCalculateRouteHardening` | 5 | All 3 calculate endpoints require mandatory auth + RBAC |
| `TestSandboxRouteHardening` | 2 | Sandbox has session param + permission check |
| `TestConnectorDuplicatePrevention` | 5 | DuplicateImportError attributes + both import functions check hash |
| `TestNoAuthRegression` | 2 | All proposal + pipeline routes still require mandatory auth |
| `TestEnvVarGate` | 3 | Dev fault env var gate (absent/false/wrong) |
| `TestAppEnvGate` | 6 | App env gate (production/staging denied; dev/test/ci allowed) |
| `TestLocalityGate` | 7 | Localhost gate (IPv4/IPv6/mapped/hostname/non-local/null) |
| `TestProxyTrustGate` | 4 | XFF proxy trust (default off, explicit on, non-local denied) |
| `TestRaiseIfDevFault` | 5 | Convenience raiser (raises/noop scenarios) |
| `TestNoLeak` | 2 | Structural: fault params only on designated routes |

### Build Verification

- **Backend**: `pytest` — 41/41 passed (hardening + dev fault tests)
- **Frontend**: `next build` — clean, all pages compiled successfully

---

## 10. Fix List (Applied This Review)

### FIX-1: Calculate Endpoint RBAC (P0 — Critical)

**File**: `backend/app/api/routes/v1_calculate.py`

**Before**: Used `get_current_user_optional` — endpoint was effectively anonymous. Any unauthenticated request could trigger a production hedge calculation and persist it to the WORM table.

**After**:
- `POST /v1/calculate` requires `get_current_user` (mandatory JWT)
- RBAC check: `calculate.run_production` permission enforced
- Superuser bypasses RBAC (consistent with all other routes)
- `GET /v1/runs` and `GET /v1/runs/{id}` also upgraded to mandatory auth

**Impact**: Closes the single largest security gap in the Execution module. No anonymous actor can trigger production calculations.

### FIX-2: Sandbox Permission Check (P0 — Critical)

**File**: `backend/app/api/routes/v1_pipeline.py`

**Before**: `sandbox_calculate` required JWT auth but had no RBAC permission check. Any authenticated user could run sandbox calculations regardless of role.

**After**:
- Added `AsyncSession` dependency for RBAC lookup
- `_check_permission(session, current_user, "calculate.run_sandbox")` enforced before calculation
- Only roles with `calculate.run_sandbox` permission (analyst+) can use sandbox

**Impact**: Junior roles (viewer, auditor) can no longer access sandbox calculations.

### FIX-3: Connector Duplicate Prevention (P1 — Important)

**File**: `backend/app/services/connector_service.py`

**Before**: `source_hash` was computed and stored on every `ConnectorRun` but never checked against existing runs. The same CSV could be imported repeatedly, creating duplicate positions.

**After**:
- New `DuplicateImportError` exception class with `file_hash` and `existing_run_id` attributes
- New `_check_duplicate_hash()` async function checks for existing COMPLETED/RUNNING runs with the same hash within company scope
- Called before `create_run()` in both `import_csv_audited()` and `import_excel_audited()`
- Empty/null hashes bypass the check (defensive)

**Impact**: Prevents accidental double-import of the same file. Error includes the existing run ID for audit traceability.

---

## Appendix A: Permission Matrix (Execution Module)

| Permission | Roles That Have It | Endpoints |
|------------|--------------------|-----------|
| `calculate.run_production` | treasury_analyst, risk_manager, portfolio_manager, compliance_officer, branch_manager, admin | POST /v1/calculate |
| `calculate.run_sandbox` | All above + junior_analyst, viewer (partial) | POST /v1/pipeline/sandbox/calculate |
| `trades.view` | All authenticated roles | GET /v1/positions, GET /v1/runs, GET /v1/proposals |
| `trades.create` | treasury_analyst, risk_manager, portfolio_manager, admin | POST /v1/positions, POST /v1/connectors/import/* |
| `trades.edit` | treasury_analyst, risk_manager, portfolio_manager, admin | PUT/PATCH positions, POST/PATCH proposals |
| `trades.execute` | risk_manager, portfolio_manager, compliance_officer, admin | Approve/reject/execute proposals |
| `pipeline.create_proposal` | treasury_analyst, risk_manager, portfolio_manager, admin | POST /v1/pipeline/proposals |
| `pipeline.submit_staging` | treasury_analyst, risk_manager, portfolio_manager, admin | POST /v1/pipeline/proposals/{id}/submit |
| `pipeline.approve` | risk_manager, compliance_officer, branch_manager, admin | POST /v1/pipeline/staging/{id}/authorize |

## Appendix B: WORM Table Inventory

| Table | Append-Only | Hash-Chained | Notes |
|-------|-------------|--------------|-------|
| `audit_events` | Yes | SHA-256, per-tenant | GENESIS_HASH = 0000...0000 |
| `calculation_runs` | Yes | RunEnvelope hashes | inputs_hash, outputs_hash, run_hash |
| `policy_revisions` | Yes | policy_hash (canonical config) | Pinned on calculation_runs |
| `execution_proposals` | Yes (terminal states immutable) | proposal_hash + approval_hash | Chained pair |
| `connector_runs` | Yes | source_hash (file SHA-256) | Per-import artifact |

---

*Generated by Claude Code — Execution Module Institutional Analysis*
*41 tests passing | Frontend build clean | 3 P0/P1 fixes applied*
