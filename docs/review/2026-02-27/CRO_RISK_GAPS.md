# CRO / Risk Officer — Governance & Controls Review
**Review Date**: 2026-02-27
**Lens**: Chief Risk Officer — controls, auditability, gating, status correctness, approvals

---

## Part A — Controls Assessment

### A1. What is Correctly Implemented ✓

| Control | Implementation | Verification |
|---------|---------------|-------------|
| **4-Eyes Approval** | Maker/Checker separation enforced in `v1_execution_proposals.py` — same actor cannot propose + approve (SoD, 400 error) | Backend enforcement verified |
| **WORM Audit Events** | `audit_events` table is append-only with SHA-256 hash chain; `POST /v1/audit` writes only, no DELETE/UPDATE endpoint exists | Verified in `v1_audit.py` |
| **Chain Integrity Verification** | `GET /v1/audit/chain/verify` recomputes hashes and detects tampering | Endpoint exists and is tested |
| **Policy Revision Pinning** | Every `CalculationRun` pins a `policy_revision_id` at calculation time (WORM FK) | Verified in `v1_calculate.py` |
| **RunEnvelope Hashing** | SHA-256 hashes for inputs, outputs, trades, hedges, market, policy stored per run | RunEnvelope structure verified |
| **RBAC Permission Gates** | All API routes check `_check_permission()` before business logic | Verified across all route files |
| **Position Lifecycle Gating** | Invalid state transitions return 409 Conflict — cannot skip states | Backend enforcement verified |
| **Rejection with Reason** | REJECTED state requires reason string; stored in DB | Verified in position model |
| **Policy Deactivation Guard** | Active policy cannot be deleted — only deactivated | `v1_policies.py` soft-delete guard |
| **Multi-tenant Scoping** | All data filtered by `company_id`; scope resolution for branch access | Verified in all v1 routes |

---

### A2. CRO Risk Gaps — What is Missing or Broken

#### RISK-001 (HIGH): Audit Trail UI Not Connected to Backend WORM Table
**Severity**: HIGH — Governance-critical
**Finding**: The `/audit-trail` page reads from `localStorage` keys (`ordr_last_run_meta`, `ordr_connector_runs`, `ordr_policy_history`, etc.). The backend has a fully implemented `GET /v1/audit` API with a SHA-256 hash-chained, PostgreSQL-persisted audit table.
**Risk**:
- Audit trail presented to governance/board is session-scoped and device-specific
- Clearing browser data or opening a new session loses the entire audit trail
- The "Verify Chain Integrity" button performs simulated client-side verification, not calling `GET /v1/audit/chain/verify`
- A real auditor would find this trail insufficient under ISDA, IFRS 9, or EMIR audit requirements
**Required Fix**: Connect the Audit Trail page to `GET /v1/audit` endpoint and use the backend chain verification API
**Files**: `frontend/src/app/audit-trail/page.tsx`

---

#### RISK-002 (HIGH): No Rate/Market Data Audit Trail
**Severity**: HIGH
**Finding**: The calculation engine uses a market snapshot (spot rates, forward points) that is hash-persisted in `market_hash`. However, the source of these rates (Alpha Vantage, manual entry, ERP feed) is not audited in a way that's visible to a CRO. The Data Pipeline Log in the UI is either missing (`/execution-history` 404) or reads from localStorage (`/import-history`).
**Risk**: Calculation reproducibility requires knowing exactly what market data was used. If the source is not audited:
- Cannot prove which source provided the rates for a given run
- Cannot detect a compromised or stale rate feed
**Required Fix**: Emit an audit event for every market data snapshot used in a calculation. Show source, timestamp, and hash in Run Viewer.

---

#### RISK-003 (MEDIUM): Risk Check in Execution Pipeline is Not Wired to Backend
**Severity**: MEDIUM
**Finding**: Step 3 "Risk Check" in the Execution Desk (`StepRiskCheck` component) appears to compute compliance checks client-side using `executionAnalytics.ts` utilities. It does not call a backend risk validation endpoint.
**Risk**:
- Risk thresholds should be governed by Settings → Policy Limits, which are persisted to backend
- If the frontend reads policy limits from localStorage (as Settings does in demo mode), risk checks can be bypassed by clearing localStorage
- VaR and stress test thresholds are configurable; they must be policy-governed
**Required Fix**: Backend should expose `POST /v1/risk-check` (or fold into calculate pipeline) that enforces policy limits server-side.

---

#### RISK-004 (MEDIUM): Execution Proposal "Execute" Final Step Not Gated on 4-Eyes Completion
**Severity**: MEDIUM
**Finding**: In the 4-eyes flow, `POST /{proposal_id}/execute` finalizes the trade. But the Execution Desk Step 4 may bypass this by calling `PATCH /positions/{id}/execute` directly (without going through the ExecutionProposal workflow).
**Risk**: Two parallel code paths may exist for position execution — one with 4-eyes approval, one without. This could allow a maker to execute without checker sign-off.
**Required Action**: Verify that `StepExecute` component exclusively uses the ExecutionProposal workflow (POST /proposals → PATCH /proposals/{id}/approve → POST /proposals/{id}/execute), and that `PATCH /positions/{id}/execute` is only called as a result of a completed ExecutionProposal.

---

#### RISK-005 (MEDIUM): Policy Template Import Has No Checksum Enforcement in UI
**Severity**: MEDIUM
**Finding**: `POST /v1/policies/templates/import` validates a SHA-256 checksum in the request body. However, the frontend policy import UI (if any) may not surface this checksum, allowing a user to upload a policy template JSON file without verifying its integrity.
**Risk**: If a policy template is tampered with before import, the checksum validation would catch it only if the checksum is transmitted correctly. If the frontend auto-computes the checksum client-side from the file, a malicious file could be crafted with a matching checksum.
**Required Fix**: Display the checksum of the imported file to the user and require them to confirm it matches the vendor-provided checksum before activating.

---

#### RISK-006 (LOW): "LIVE" Indicator Does Not Reflect Actual Backend Status
**Severity**: LOW
**Finding**: The green "● LIVE" indicator in AppTopBar is static — hardcoded green and "LIVE" regardless of backend health.
**Risk**: During backend outage, the UI shows "LIVE" — calculations would fail silently. Traders might attempt to execute based on stale data.
**Required Fix**: Poll `GET /health` every 60 seconds. Show DEGRADED (amber) or OFFLINE (red) with a descriptive message.

---

#### RISK-007 (LOW): Calculation Runs Not Cleaned Up / Rate-Limited
**Severity**: LOW
**Finding**: `POST /v1/calculate` persists every run to the database. There is no rate limiting on calculation runs in the route (the rate limiter is at the middleware level). A user could spam calculations.
**Risk**: In a multi-tenant environment, a single user could fill the `calculation_runs` table or trigger excessive Alpha Vantage API calls.
**Required Fix**: Add per-user rate limiting on `POST /v1/calculate` (e.g., max 10 runs per minute per user).

---

## Part B — Auditability Checklist

| Requirement | Status | Evidence |
|-------------|--------|---------|
| Every position state transition is logged | ✅ | `audit_events` emitted in all `v1_positions.py` lifecycle endpoints |
| Every policy activation is logged | ✅ | `audit_events` emitted in `POST /v1/policies/activate` |
| Every calculation run is persisted | ✅ | `calculation_runs` WORM table, non-deletable |
| Policy revision is pinned per run | ✅ | `policy_revision_id` FK in `calculation_runs` |
| 4-eyes approval trail is persisted | ✅ | `execution_proposals` table with maker/checker IDs |
| SHA-256 hash chain is maintained | ✅ | `v1_audit.py` with chain verification endpoint |
| Audit events visible in UI | ❌ | Audit Trail page reads localStorage, not backend |
| Run narrative (TraceLite) is persisted | ✅ | `trace_lite` in `calculation_runs` |
| Market data snapshot is hashed per run | ✅ | `market_hash` in RunEnvelope |
| Run can be replayed deterministically | ✅ (design intent) | Input hash + policy pin support replay |
| User access events are logged | ⚠️ | Login events exist; page visits not explicitly logged |
| Report generation events are logged | ❌ | No report audit events emitted |
| Export events are logged | ❌ | No export audit events emitted |

---

## Part C — What is Required for Full Institutional Readiness

### Immediate (Before Demo)
1. Connect Audit Trail UI to backend `GET /v1/audit` API
2. Fix the chain integrity button to call backend `GET /v1/audit/chain/verify`
3. Verify Execution Desk uses the 4-eyes ExecutionProposal pathway exclusively
4. Add "SIMULATED DATA" watermarks on any widget/page with mocked data

### Short-Term (v1.1)
5. Add backend risk-check endpoint that enforces policy limits server-side
6. Add report generation audit events
7. Add export audit events (who exported what, when, in what format)
8. Wire market data source into run audit events
9. Fix "LIVE" indicator to reflect real backend health

### Medium-Term (v2.0)
10. MFA enforcement for trades.execute permission
11. IP allowlisting for execution actions
12. Time-locked sessions for high-privilege roles (CFO, Head of Risk)
13. Dual-key approval for positions above a configurable USD threshold
