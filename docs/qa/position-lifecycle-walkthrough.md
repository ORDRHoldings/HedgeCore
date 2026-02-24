# Position Lifecycle — End-to-End Walkthrough
**Standard:** Bloomberg / BlackRock Institutional
**Route:** `/input` → `/position-desk`
**Author:** QA Engineering
**Last Updated:** 2026-02-24
**Status Sequence:** `NEW → POLICY_ASSIGNED → READY_TO_EXECUTE → HEDGED`
**Regulatory Refs:** SEC 17a-4, CFTC 1.31, ISO 8601, Basel III Op Risk

---

## Purpose

This walkthrough creates a single real FX exposure position and drives it through
every lifecycle stage, applying every function available on the Position Desk.
It documents the exact API calls fired, the audit events written, the Redux state
transitions, and the expected UI states at each stage.

---

## Pre-conditions

| Check | Value |
|-------|-------|
| Environment | Production or staging |
| Auth | Logged in as a real (non-demo) user — token must NOT start with `demo_token_` |
| Policy | At least one active hedge policy configured for the user's branch |
| Backend | `GET /api/health` → `{"status":"ok","service":"HedgeCalc API"}` |
| Audit trail | `GET /api/v1/audit/` accessible (compliance role or admin) |

---

## Stage 0 — Baseline Audit Count

Before creating the position, record the current audit event count for your user.
This is used for verification in Stage 5.

```http
GET /api/v1/audit/?limit=1
Authorization: Bearer <token>
X-API-Key: <api_key>
```

Note the `id` of the most recent audit event. All subsequent events in this
walkthrough should have higher IDs.

---

## Stage 1 — Create Position (NEW)

### 1A — Via Manual Entry Form (Ingestion Desk → Manual Entry tab)

Navigate to `/input`. Confirm the **Manual Entry** tab is active.

Fill the Bloomberg inline form:

| Field | Value | Notes |
|-------|-------|-------|
| RECORD ID | `WALK-2026-001` | Must be unique. Immutable after save. |
| ENTITY | `SYNEX TREASURY` | Counterparty / business unit |
| FLOW TYPE | `AP` (Accounts Payable) | Outgoing FX exposure |
| CURRENCY | `MXN` | Exposure currency |
| AMOUNT | `500000` | Notional in MXN |
| VALUE DATE | `2026-06-30` | Use InlineDatePicker — click calendar or type |
| DESCRIPTION | `Lifecycle walkthrough test` | Optional |

Click **+ ADD POSITION**.

### 1B — Expected UI State After Add

```
Position table row:
  ID:           WALK-2026-001
  Entity:       SYNEX TREASURY
  Type:         AP
  CCY:          MXN
  Amount:       500,000
  Value Date:   2026-06-30
  Status:       [NEW]          ← amber chip
  Exec Status:  [NEW]          ← amber badge
  Ingested At:  [timestamp]    ← ISO 8601 UTC
```

### 1C — Backend API Call Fired

```http
POST /api/v1/positions/
Authorization: Bearer <token>
X-API-Key: <api_key>
Content-Type: application/json

{
  "record_id":   "WALK-2026-001",
  "entity":      "SYNEX TREASURY",
  "flow_type":   "AP",
  "currency":    "MXN",
  "amount":      500000,
  "value_date":  "2026-06-30",
  "description": "Lifecycle walkthrough test"
}
```

### 1D — Audit Event Written (WORM)

```json
{
  "event_type": "INGEST",
  "description": "Position WALK-2026-001 created via manual entry",
  "payload": {
    "action":     "CREATE",
    "record_id":  "WALK-2026-001",
    "entity":     "SYNEX TREASURY",
    "flow_type":  "AP",
    "currency":   "MXN",
    "amount":     500000.0,
    "value_date": "2026-06-30",
    "status":     "NEW"
  }
}
```

### 1E — Verification

- [ ] Position appears in table with status `NEW`
- [ ] `created_at` and `updated_at` are non-null ISO 8601 timestamps
- [ ] Audit event count increased by 1
- [ ] `record_id` field is grayed-out and locked (cannot be edited)
- [ ] Toast shows: "Position added"

---

## Stage 2 — Edit Position (still NEW)

Click the **pencil icon** on the `WALK-2026-001` row to open the TradeModal in edit mode.

### 2A — Changes to Apply

| Field | Change | From | To |
|-------|--------|------|----|
| AMOUNT | Update notional | 500,000 | 750,000 |
| DESCRIPTION | Update notes | Lifecycle walkthrough test | Lifecycle walkthrough — revised notional |

Do NOT change RECORD ID (it is locked / greyed with `cursor: not-allowed`).

Click **UPDATE**.

### 2B — Backend API Call Fired

```http
PUT /api/v1/positions/<position_id>
Authorization: Bearer <token>
X-API-Key: <api_key>
Content-Type: application/json

{
  "amount":      750000,
  "description": "Lifecycle walkthrough — revised notional"
}
```

### 2C — Audit Event Written (WORM)

```json
{
  "event_type": "LIFECYCLE",
  "description": "Position WALK-2026-001 updated",
  "payload": {
    "action":      "UPDATE",
    "amount":      750000,
    "description": "Lifecycle walkthrough — revised notional"
  }
}
```

### 2D — Verification

- [ ] Amount now shows `750,000` in table
- [ ] Status remains `NEW` (update does not change lifecycle status)
- [ ] Audit event count increased by 1 more
- [ ] Toast shows: "Position updated"
- [ ] No crash — modal closes cleanly

---

## Stage 3 — Assign Policy (NEW → POLICY_ASSIGNED)

Navigate to `/position-desk`. Find the `WALK-2026-001` row.

Click the **Assign Policy** button (the policy chip button on the row).

Select an active policy from the dropdown (e.g., "Natural Hedge - Conservative").

Click **Assign**.

### 3A — Backend API Call Fired

```http
PATCH /api/v1/positions/<position_id>/assign-policy
Authorization: Bearer <token>
X-API-Key: <api_key>
Content-Type: application/json

{
  "policy_id": "<policy_uuid>"
}
```

### 3B — Expected State After Assign

```
Status:       [POLICY_ASSIGNED]   ← cyan chip
Exec Status:  [POLICY_ASSIGNED]   ← cyan badge
Policy:       Natural Hedge - Conservative
```

### 3C — Audit Event Written (WORM)

```json
{
  "event_type": "LIFECYCLE",
  "description": "Policy assigned to WALK-2026-001",
  "payload": {
    "action":    "POLICY_ASSIGNED",
    "policy_id": "<policy_uuid>"
  }
}
```

### 3D — Verification

- [ ] Status chip changes from amber `NEW` to cyan `POLICY_ASSIGNED`
- [ ] Policy column shows assigned policy name
- [ ] Audit event count increased by 1
- [ ] Toast shows: "Policy assigned"

---

## Stage 4 — Mark Ready to Execute (POLICY_ASSIGNED → READY_TO_EXECUTE)

On the Position Desk row for `WALK-2026-001`, click **Mark Ready**.

### 4A — Backend API Call Fired

```http
PATCH /api/v1/positions/<position_id>/mark-ready
Authorization: Bearer <token>
X-API-Key: <api_key>
```

### 4B — Expected State After Mark Ready

```
Status:       [READY_TO_EXECUTE]  ← bright cyan chip
Exec Status:  [READY_TO_EXECUTE]  ← bright cyan badge
```

### 4C — Audit Event Written (WORM)

```json
{
  "event_type": "LIFECYCLE",
  "description": "Position WALK-2026-001 marked READY_TO_EXECUTE",
  "payload": {
    "action": "MARK_READY"
  }
}
```

### 4D — Verification

- [ ] Status chip changes to `READY_TO_EXECUTE`
- [ ] Execute button is now active (not disabled)
- [ ] Audit event count increased by 1

---

## Stage 5 — Execute via IBKR (READY_TO_EXECUTE → HEDGED)

On the `WALK-2026-001` row, click the **EXECUTE** button (green chip).

The IBKR execution confirmation modal opens.

Fill:
| Field | Value |
|-------|-------|
| IBKR Order Reference | `IBKR-TEST-20260224-001` |
| Hedge Amount | `750000` |
| Hedge Rate | `17.85` |

Click **Confirm Execute**.

### 5A — Backend API Call Fired

```http
PATCH /api/v1/positions/<position_id>/execute
Authorization: Bearer <token>
X-API-Key: <api_key>
Content-Type: application/json

{
  "execution_ref": "IBKR-TEST-20260224-001",
  "hedge_amount":  750000,
  "hedge_rate":    17.85
}
```

### 5B — Expected State After Execute

```
Status:        [HEDGED]           ← green chip
Exec Status:   [HEDGED]           ← green badge
Hedge Amount:  750,000
Hedge Rate:    17.85
Executed At:   [timestamp]
IBKR Ref:      IBKR-TEST-20260224-001
```

### 5C — Audit Event Written (WORM)

```json
{
  "event_type": "EXECUTION",
  "description": "Position WALK-2026-001 executed via IBKR",
  "payload": {
    "action":         "EXECUTE",
    "execution_ref":  "IBKR-TEST-20260224-001",
    "hedge_amount":   750000,
    "hedge_rate":     17.85
  }
}
```

### 5D — Verification

- [ ] Status chip is green `HEDGED`
- [ ] `executed_at` timestamp is non-null
- [ ] Edit button is disabled (executed positions are immutable)
- [ ] Audit event count increased by 1
- [ ] Toast shows: "Position WALK-2026-001 marked HEDGED · ref: IBKR-TEST-20260224-001"

---

## Stage 6 — Audit Trail Verification

Run the full audit trail query for this position:

```http
GET /api/v1/audit/?position_id=<position_id>
Authorization: Bearer <token>
X-API-Key: <api_key>
```

### 6A — Expected Audit Chain

| Seq | event_type | action | Description |
|-----|------------|--------|-------------|
| 1 | INGEST | CREATE | Position WALK-2026-001 created via manual entry |
| 2 | LIFECYCLE | UPDATE | Position WALK-2026-001 updated |
| 3 | LIFECYCLE | POLICY_ASSIGNED | Policy assigned to WALK-2026-001 |
| 4 | LIFECYCLE | MARK_READY | Position WALK-2026-001 marked READY_TO_EXECUTE |
| 5 | EXECUTION | EXECUTE | Position WALK-2026-001 executed via IBKR |

### 6B — WORM Integrity Checks

- [ ] Each event has a unique `id` (monotonically increasing)
- [ ] Each event has a non-null `created_at` ISO 8601 timestamp
- [ ] Each event has a `user_id` matching the test user
- [ ] No events can be deleted (DELETE on audit endpoint returns 405 Method Not Allowed)
- [ ] SHA-256 chain hash integrity passes (if chain-hash verification endpoint is available)

---

## Stage 7 — Rejection Path (Alternate: POLICY_ASSIGNED → REJECTED)

This stage tests the rejection branch. Create a second position:

| Field | Value |
|-------|-------|
| RECORD ID | `WALK-2026-002` |
| ENTITY | `SYNEX TREASURY` |
| FLOW TYPE | `AR` |
| CURRENCY | `MXN` |
| AMOUNT | `100000` |
| VALUE DATE | `2026-09-30` |

Assign a policy, then instead of marking ready, click **Reject** with reason:
`"Exposure below minimum hedge threshold — $100K < $250K floor"`

### 7A — Backend API Call Fired

```http
PATCH /api/v1/positions/<position_id>/reject
Authorization: Bearer <token>
X-API-Key: <api_key>
Content-Type: application/json

{
  "rejection_reason": "Exposure below minimum hedge threshold — $100K < $250K floor"
}
```

### 7B — Expected State After Reject

```
Status:           [REJECTED]     ← red chip
rejection_reason: Exposure below minimum hedge threshold...
```

### 7C — Verification

- [ ] Status chip is red `REJECTED`
- [ ] Rejection reason is visible in the row detail / tooltip
- [ ] Audit event written: `event_type=REJECTION`
- [ ] Position cannot be executed from REJECTED state

---

## Stage 8 — Reopen (REJECTED → NEW)

On the rejected `WALK-2026-002`, click **Reopen**.

```http
PATCH /api/v1/positions/<position_id>/reopen
Authorization: Bearer <token>
X-API-Key: <api_key>
```

Expected: status returns to `NEW`. Audit event written: `event_type=LIFECYCLE, action=REOPEN`.

---

## Stage 9 — Delete (Soft Delete)

On any `NEW` position (not HEDGED), click the **trash icon**. Confirm deletion.

```http
DELETE /api/v1/positions/<position_id>
Authorization: Bearer <token>
X-API-Key: <api_key>
```

### 9A — Verification

- [ ] Position disappears from the table
- [ ] Backend: row is soft-deleted (`deleted_at` non-null), NOT permanently removed
- [ ] Audit event written: `event_type=LIFECYCLE, action=DELETE`
- [ ] HEDGED positions: delete button is disabled / returns 422 Unprocessable Entity

---

## Full Lifecycle State Machine

```
                     ┌─────────────────────────────────────────────┐
                     │              POSITION LIFECYCLE              │
                     └─────────────────────────────────────────────┘

  CREATE ──────► NEW ──────► POLICY_ASSIGNED ──────► READY_TO_EXECUTE ──────► HEDGED
                  │                  │                       │
                  │                  └─────► REJECTED ◄──────┘
                  │                              │
                  │                          REOPEN
                  │                              │
                  └──────────────────────────────┘
                  │
               DELETE (soft) — allowed from NEW, POLICY_ASSIGNED
               DELETE (blocked) — not allowed from HEDGED
```

---

## Summary Checklist

| Stage | Action | API Endpoint | Audit Event | Status After |
|-------|--------|-------------|-------------|--------------|
| 1 | Create | `POST /v1/positions/` | INGEST/CREATE | NEW |
| 2 | Edit | `PUT /v1/positions/{id}` | LIFECYCLE/UPDATE | NEW |
| 3 | Assign Policy | `PATCH /v1/positions/{id}/assign-policy` | LIFECYCLE/POLICY_ASSIGNED | POLICY_ASSIGNED |
| 4 | Mark Ready | `PATCH /v1/positions/{id}/mark-ready` | LIFECYCLE/MARK_READY | READY_TO_EXECUTE |
| 5 | Execute | `PATCH /v1/positions/{id}/execute` | EXECUTION/EXECUTE | HEDGED |
| 6 | Reject | `PATCH /v1/positions/{id}/reject` | REJECTION/REJECT | REJECTED |
| 7 | Reopen | `PATCH /v1/positions/{id}/reopen` | LIFECYCLE/REOPEN | NEW |
| 8 | Delete | `DELETE /v1/positions/{id}` | LIFECYCLE/DELETE | (removed) |

**Total audit events for a full NEW→HEDGED run: 5 events minimum**
**All events are WORM-protected: append-only, user-attributed, tamper-evident**
