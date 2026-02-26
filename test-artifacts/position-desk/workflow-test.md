# Position Desk End-to-End Workflow Test
**Test Date**: 2026-02-26
**Test Standard**: BlackRock Aladdin / Bloomberg Terminal
**Objective**: Verify complete position lifecycle with full audit trail

---

## Test Environment Setup

### Prerequisites
- ✅ Backend running: `hedgecore.onrender.com`
- ✅ Frontend deployed: `hedgecore.vercel.app`
- ✅ Database: `hedge_user@dpg-d6abjuq48b3s73bqss00-a.oregon-postgres.render.com/hedge`
- ✅ User: `demo/demo` (admin, superuser)
- ✅ Company: DemoCompany (UUID: 11111111-1111-1111-1111-111111111111)

---

## Position Desk Workflow Tests

### Test 1: CSV Upload → Position Creation
**Objective**: Verify bulk upload creates audited positions

**Steps**:
1. Navigate to `/upload-csv`
2. Upload `sample-positions.csv` (see below)
3. Verify validation results
4. Confirm import
5. Check audit trail

**Expected Results**:
- ✅ All 5 positions imported
- ✅ Validation errors = 0
- ✅ Import logged to `audit_events` table
- ✅ User = demo, timestamp = UTC
- ✅ Positions visible in Position Desk

**Sample CSV** (`sample-positions.csv`):
```csv
record_id,entity,type,currency,amount,value_date
POS-001,Synexiun LATAM,AR,MXN,5000000,2026-03-15
POS-002,Synexiun Brasil,AP,BRL,2000000,2026-03-20
POS-003,Synexiun Mexico,AR,MXN,3500000,2026-04-01
POS-004,Synexiun Europe,AR,EUR,1500000,2026-03-25
POS-005,Synexiun Asia,AP,CNY,8000000,2026-04-10
```

**Audit Trail Verification**:
```sql
SELECT
  event_type,
  actor_email,
  position_id,
  changes_json,
  created_at
FROM audit_events
WHERE event_type = 'POSITION_IMPORT'
ORDER BY created_at DESC
LIMIT 5;
```

---

### Test 2: Manual Position Entry
**Objective**: Create single position via manual form

**Steps**:
1. Navigate to `/input?tab=manual`
2. Fill form:
   - Record ID: `POS-006`
   - Entity: `Synexiun Corp`
   - Type: `AR` (Receivable)
   - Currency: `USD`
   - Amount: `1,000,000`
   - Value Date: `2026-03-30`
3. Click "Add Position"
4. Verify position appears in table

**Expected Results**:
- ✅ Position created with status = `NEW`
- ✅ Execution status = `NEW`
- ✅ Created by = `demo`
- ✅ Timestamp = current UTC
- ✅ Audit event logged

---

### Test 3: Position Lifecycle (NEW → HEDGED)
**Objective**: Test complete lifecycle with 4-eyes approval

**Lifecycle States**:
```
NEW → POLICY_ASSIGNED → READY_TO_EXECUTE → HEDGED
```

#### Step 3.1: Assign Policy (NEW → POLICY_ASSIGNED)
1. Navigate to `/position-desk`
2. Select position `POS-001`
3. Click "ASSIGN POLICY"
4. Choose policy template: `Conservative Hedge`
5. Confirm assignment

**Expected**:
- ✅ Status = `POLICY_ASSIGNED`
- ✅ `policy_id` populated
- ✅ Audit event: `POLICY_ASSIGNED`
- ✅ Next step tooltip: "Run hedge engine"

#### Step 3.2: Mark Ready (POLICY_ASSIGNED → READY_TO_EXECUTE)
1. Run hedge calculation (backend)
2. Get `calculation_run_id`
3. Click "MARK READY" on position
4. Enter run ID
5. Confirm

**Expected**:
- ✅ Status = `READY_TO_EXECUTE`
- ✅ `calculation_run_id` populated
- ✅ Audit event: `MARKED_READY`
- ✅ Next step tooltip: "Click PROPOSE for 4-eyes"

#### Step 3.3: Execute (READY_TO_EXECUTE → HEDGED)
1. Click "PROPOSE" button
2. Create execution proposal (4-eyes workflow)
3. Get supervisor approval
4. Execute from staging

**Expected**:
- ✅ Status = `HEDGED`
- ✅ Proposal created
- ✅ Staging artifact created
- ✅ Ledger entry created (after approval)
- ✅ Audit trail complete

---

### Test 4: Position Rejection & Reopen
**Objective**: Test rejection workflow

**Steps**:
1. Select position `POS-002`
2. Click "REJECT"
3. Enter reason: "Duplicate entry - already hedged externally"
4. Confirm rejection
5. Verify status = `REJECTED`
6. Click "REOPEN"
7. Verify status returns to `NEW`

**Expected**:
- ✅ Status changes: `NEW` → `REJECTED` → `NEW`
- ✅ Rejection reason stored
- ✅ Audit events logged for both actions
- ✅ Rejection reason visible on hover

---

### Test 5: Bulk Operations
**Objective**: Test bulk policy assignment

**Steps**:
1. Navigate to `/position-desk`
2. Filter: `NEW` status
3. Select 3 positions (checkboxes)
4. Click "BULK ASSIGN"
5. Choose policy: `Aggressive Hedge`
6. Confirm

**Expected**:
- ✅ All 3 positions → `POLICY_ASSIGNED`
- ✅ Same policy_id for all
- ✅ Single audit event with multiple positions
- ✅ Bulk operation logged

---

### Test 6: Filtering & Search
**Objective**: Verify filtering capabilities

**Filter Tests**:
- ✅ Status filter: `NEW`, `POLICY_ASSIGNED`, `READY_TO_EXECUTE`, `HEDGED`, `REJECTED`
- ✅ Currency filter: `MXN`, `BRL`, `EUR`, `USD`, `CNY`
- ✅ Date range filter
- ✅ Search by record_id
- ✅ "NEEDS ACTION" preset (NEW + POLICY_ASSIGNED + READY)

**Expected**:
- ✅ Filters combine correctly (AND logic)
- ✅ Result counts accurate
- ✅ Clear filters works
- ✅ URL params update

---

### Test 7: Execution Desk Integration
**Objective**: Test handoff from Position Desk → Execution Desk

**Steps**:
1. Position Desk: Assign policy to `POS-003`
2. Navigate to `/execution-desk`
3. Verify `POS-003` appears in queue
4. Select position
5. Run Monte Carlo simulation
6. Export results to CSV

**Expected**:
- ✅ Only `POLICY_ASSIGNED` positions show
- ✅ Simulation runs successfully
- ✅ Results exportable
- ✅ Execution history logged

---

## Audit Trail Requirements

### Audit Events Table Schema
```sql
CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  actor_email VARCHAR(255),
  position_id UUID,
  changes_json JSONB,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  company_id UUID NOT NULL,
  hash_chain_prev VARCHAR(64),
  hash_chain_current VARCHAR(64)
);
```

### Required Audit Events
- ✅ `POSITION_CREATED` - Manual or CSV import
- ✅ `POSITION_IMPORT` - Bulk CSV upload
- ✅ `POLICY_ASSIGNED` - Policy attachment
- ✅ `POLICY_BULK_ASSIGNED` - Bulk policy assignment
- ✅ `MARKED_READY` - Ready to execute
- ✅ `POSITION_REJECTED` - Rejection with reason
- ✅ `POSITION_REOPENED` - Reopen after rejection
- ✅ `EXECUTION_PROPOSED` - 4-eyes proposal created
- ✅ `POSITION_EXECUTED` - Execution confirmed
- ✅ `POSITION_UPDATED` - Any field change
- ✅ `POSITION_DELETED` - Soft delete

### Audit Trail Verification Query
```sql
-- Full lifecycle audit trail for single position
SELECT
  ae.event_type,
  ae.actor_email,
  ae.changes_json,
  ae.created_at,
  p.record_id,
  p.execution_status
FROM audit_events ae
JOIN positions p ON ae.position_id = p.id
WHERE p.record_id = 'POS-001'
ORDER BY ae.created_at ASC;
```

### Hash Chain Verification
```sql
-- Verify hash chain integrity (tamper detection)
WITH chain AS (
  SELECT
    id,
    hash_chain_prev,
    hash_chain_current,
    created_at,
    LAG(hash_chain_current) OVER (ORDER BY created_at) AS expected_prev
  FROM audit_events
  WHERE company_id = '11111111-1111-1111-1111-111111111111'
  ORDER BY created_at
)
SELECT
  id,
  created_at,
  CASE
    WHEN hash_chain_prev = expected_prev THEN 'VALID'
    WHEN hash_chain_prev = '0000000000000000000000000000000000000000000000000000000000000000'
      AND expected_prev IS NULL THEN 'GENESIS'
    ELSE 'BROKEN'
  END AS chain_status
FROM chain
WHERE hash_chain_prev != expected_prev OR expected_prev IS NULL;
```

---

## Performance Benchmarks

### Target Performance (BlackRock/Bloomberg Standard)
- ✅ Page load: < 2 seconds
- ✅ Position table render (1000 rows): < 500ms
- ✅ Filter application: < 100ms
- ✅ CSV upload (1000 rows): < 5 seconds
- ✅ Policy assignment: < 300ms
- ✅ Audit event write: < 50ms

### Monitoring Queries
```sql
-- Position count by status
SELECT
  execution_status,
  COUNT(*) AS count
FROM positions
WHERE company_id = '11111111-1111-1111-1111-111111111111'
GROUP BY execution_status;

-- Audit events in last 24 hours
SELECT
  event_type,
  COUNT(*) AS count
FROM audit_events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY event_type
ORDER BY count DESC;

-- Average time between lifecycle states
SELECT
  AVG(EXTRACT(EPOCH FROM (ready_time - assigned_time))) / 3600 AS avg_hours_assigned_to_ready,
  AVG(EXTRACT(EPOCH FROM (executed_time - ready_time))) / 3600 AS avg_hours_ready_to_executed
FROM (
  SELECT
    p.id,
    MIN(CASE WHEN ae.event_type = 'POLICY_ASSIGNED' THEN ae.created_at END) AS assigned_time,
    MIN(CASE WHEN ae.event_type = 'MARKED_READY' THEN ae.created_at END) AS ready_time,
    MIN(CASE WHEN ae.event_type = 'POSITION_EXECUTED' THEN ae.created_at END) AS executed_time
  FROM positions p
  JOIN audit_events ae ON ae.position_id = p.id
  GROUP BY p.id
) AS lifecycle;
```

---

## Compliance Checklist

### Data Integrity
- ✅ No orphaned positions (all have company_id)
- ✅ No duplicate record_ids within company
- ✅ All dates >= current date
- ✅ Amount != 0
- ✅ Currency in valid ISO 4217 list

### Audit Trail
- ✅ Every position change has audit event
- ✅ Hash chain unbroken (tamper detection)
- ✅ Actor attribution (who did what)
- ✅ Timestamp in UTC
- ✅ Changes JSON captures before/after state

### Access Control
- ✅ RBAC enforced (roles checked)
- ✅ Permissions validated (41 permissions)
- ✅ JWT auth required
- ✅ API keys validated (HK_live_ prefix)

### 4-Eyes Approval
- ✅ Maker/checker separation enforced
- ✅ Supervisor approval required for execution
- ✅ Proposal → Staging → Ledger pipeline
- ✅ Rejection with reason required

---

## Test Execution Checklist

- [ ] Run all 7 workflow tests
- [ ] Verify all audit events logged
- [ ] Check hash chain integrity
- [ ] Validate performance benchmarks
- [ ] Test error handling (invalid data)
- [ ] Test concurrent access (2+ users)
- [ ] Export audit trail to CSV
- [ ] Generate compliance report

---

## Expected Files

1. `/upload-csv` - CSV/Excel upload page ✅
2. `/input` - Manual entry page ✅
3. `/position-desk` - Control tower ✅
4. `/policy-desk` - Policy assignment ✅
5. `/execution-desk` - Execution hub ✅
6. `/database-connection` - SQL connector ✅
7. `/audit-trail` - Audit log viewer ✅

---

## Success Criteria

✅ All positions traceable from creation → execution
✅ Complete audit trail with hash chain
✅ 4-eyes approval enforced
✅ Performance meets institutional standards
✅ No data integrity violations
✅ All workflows tested and passing

**Status**: READY FOR TESTING
