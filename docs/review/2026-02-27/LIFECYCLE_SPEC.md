# Position & Run Lifecycle Specification
**Review Date**: 2026-02-27
**Source**: Backend `v1_positions.py`, `v1_execution_proposals.py`, `v1_calculate.py`

---

## Part A — Position Lifecycle State Machine

### States

```
NEW ──────────────────────────────────────────────────► REJECTED
 │                                                           ▲
 │ assign-policy                                             │ reject (any state)
 ▼                                                           │
POLICY_ASSIGNED ─────────────────────────────────────────── ┘
 │                                                           ▲
 │ (auto or manual ready transition)                         │
 ▼                                                           │
READY_TO_EXECUTE ────────────────────────────────────────── ┘
 │
 │ execute (after ExecutionProposal → EXECUTED)
 ▼
HEDGED

REJECTED ──► reopen ──► NEW   (loop back)
```

### State Definitions

| State | Entry Criteria | Allowed Actions | UI Label | Required Audit Events |
|-------|---------------|-----------------|----------|----------------------|
| `NEW` | Position created via manual entry, CSV import, or connector | assign-policy, reject, edit, delete | `NEW` (grey) | `position.created` |
| `POLICY_ASSIGNED` | `PATCH /{id}/assign-policy` succeeds with valid `policy_instance_id` | mark-ready, reject, view | `POLICY_ASSIGNED` (blue) | `position.policy_assigned` |
| `READY_TO_EXECUTE` | `PATCH /{id}/ready` called OR auto-transition after assign | run-calculation, reject | `READY` (cyan) | `position.ready` |
| `HEDGED` | `PATCH /{id}/execute` called after ExecutionProposal.EXECUTED | view only (read-only) | `HEDGED` (green) | `position.hedged` |
| `REJECTED` | `PATCH /{id}/reject` called with reason string | reopen, view | `REJECTED` (red/amber) | `position.rejected` |

### Observed Inconsistency — CRITICAL

The Execution Desk (`execution-desk/page.tsx`) filters for `POLICY_ASSIGNED` positions only:
```typescript
const readyPositions = useMemo(
  () => positions.filter((p) => p.execution_status === "POLICY_ASSIGNED"),
  [positions]
);
```

**Problem**: This skips `READY_TO_EXECUTE` positions. The backend has a distinct `READY_TO_EXECUTE` state, but the frontend execution gate only checks `POLICY_ASSIGNED`. This means:
- If a position is manually transitioned to `READY_TO_EXECUTE` via the backend, it **disappears** from the Execution Desk
- The two-step (`POLICY_ASSIGNED → READY → HEDGED`) vs one-step (`POLICY_ASSIGNED → HEDGED`) intent is ambiguous

**Recommendation**: Either:
1. Filter for `execution_status in ["POLICY_ASSIGNED", "READY_TO_EXECUTE"]`, OR
2. Remove `READY_TO_EXECUTE` as a user-facing state and make it an internal transition (Policy Assigned automatically = Ready)

---

## Part B — Execution Proposal Lifecycle State Machine

```
PROPOSED ──► APPROVED ──► EXECUTED
    │              │
    │              └──► REJECTED (by checker)
    │
    └──► WITHDRAWN (by maker)
```

### 4-Eyes (SoD) Rules

| Action | Role Required | SoD Constraint |
|--------|--------------|----------------|
| Create proposal (PROPOSE) | `trades.edit` | Can be any user with permission |
| Approve/Reject (CHECKER) | `trades.execute` | Must be DIFFERENT user than proposer |
| Withdraw (MAKER) | `trades.edit` | Must be SAME user as proposer |
| Finalize EXECUTED | `trades.execute` | Checker who approved it |

**Backend enforcement**: Verified in `v1_execution_proposals.py` — same actor cannot propose + approve (400 error returned).

---

## Part C — Calculation Run Lifecycle

Runs are **WORM** (append-only). No state machine — runs are created and cannot be modified.

```
POST /v1/calculate
  → engine runs synchronously
  → CalculationRun persisted to DB with:
      - inputs_hash, outputs_hash, run_hash (SHA-256)
      - policy_revision_id (pinned at calculation time)
      - policy_hash
      - trace_lite (execution narrative)
  → Response returned immediately
```

### RunEnvelope Contents

| Field | Purpose |
|-------|---------|
| `run_id` | UUID, primary key |
| `run_hash` | SHA-256 of full run output |
| `inputs_hash` | SHA-256 of input positions + market snapshot |
| `outputs_hash` | SHA-256 of hedge plan output |
| `trades_hash` | SHA-256 of trade buckets |
| `hedges_hash` | SHA-256 of hedging instruments |
| `market_hash` | SHA-256 of market snapshot used |
| `policy_hash` | SHA-256 of policy revision used |
| `policy_revision_id` | FK to immutable PolicyRevision (WORM) |
| `engine_version` | e.g., "v1.0.0" |

---

## Part D — Policy Revision Lifecycle

Policy revisions are **WORM** (append-only). Each policy change creates a new revision, never modifying the existing one.

```
PolicyTemplate (mutable) ──► PolicyRevision (WORM snapshot) ──► PolicyInstance (active marker)
```

Each `CalculationRun` pins a `policy_revision_id` at the moment of calculation.

---

## Part E — Lifecycle Label Consistency Audit

| Backend `execution_status` | Backend `status` field | Frontend Label Observed | API Field Used |
|--------------------------|----------------------|------------------------|---------------|
| `NEW` | `NEW` | `NEW` (grey chip) | `execution_status` |
| `POLICY_ASSIGNED` | `POLICY_ASSIGNED` | `POLICY ASSIGNED` (blue) | `execution_status` |
| `READY_TO_EXECUTE` | `READY_TO_EXECUTE` | `READY` (cyan) | `execution_status` |
| `HEDGED` | `HEDGED` | `HEDGED` (green) | `execution_status` |
| `REJECTED` | `REJECTED` | `REJECTED` (red) | `execution_status` |

**No mismatches found** between backend enum values and frontend display labels (except the Execution Desk filter bug noted in BUG-005).

---

## Part F — Missing Lifecycle Transitions in UI

| Transition | Backend Endpoint | Frontend Exposure |
|-----------|-----------------|------------------|
| `REJECTED → NEW` (reopen) | `PATCH /{id}/reopen` | ✅ Present in Position Desk |
| `POLICY_ASSIGNED → READY_TO_EXECUTE` | `PATCH /{id}/ready` | ⚠️ Not clearly surfaced in Position Desk UI |
| Bulk-reopen multiple rejected positions | No bulk endpoint | ❌ Not available |
| Bulk-execute (mark as HEDGED) | `PATCH /{id}/execute` per position | ⚠️ Only one-by-one in Execution Desk |
