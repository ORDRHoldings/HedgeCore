-- Position Desk Audit Trail Verification Queries
-- Standard: BlackRock Aladdin / Bloomberg Terminal
-- Date: 2026-02-26

-- =============================================================================
-- 1. COMPLETE POSITION LIFECYCLE AUDIT
-- =============================================================================
-- Shows all events for a single position from creation to execution
SELECT
  ae.id,
  ae.event_type,
  ae.actor_email,
  ae.changes_json->>'from_status' AS from_status,
  ae.changes_json->>'to_status' AS to_status,
  ae.changes_json->>'policy_id' AS policy_id,
  ae.changes_json->>'run_id' AS run_id,
  ae.changes_json->>'reason' AS rejection_reason,
  ae.created_at,
  ae.hash_chain_current
FROM audit_events ae
JOIN positions p ON ae.position_id = p.id
WHERE p.record_id = 'POS-001'  -- Replace with target position
  AND p.company_id = '11111111-1111-1111-1111-111111111111'
ORDER BY ae.created_at ASC;

-- =============================================================================
-- 2. HASH CHAIN INTEGRITY VERIFICATION
-- =============================================================================
-- Detects tampering by verifying hash chain links
WITH chain AS (
  SELECT
    id,
    event_type,
    hash_chain_prev,
    hash_chain_current,
    created_at,
    LAG(hash_chain_current) OVER (PARTITION BY company_id ORDER BY created_at) AS expected_prev
  FROM audit_events
  WHERE company_id = '11111111-1111-1111-1111-111111111111'
)
SELECT
  id,
  event_type,
  created_at,
  CASE
    WHEN hash_chain_prev = expected_prev THEN '✓ VALID'
    WHEN hash_chain_prev = '0000000000000000000000000000000000000000000000000000000000000000'
      AND expected_prev IS NULL THEN '✓ GENESIS'
    ELSE '✗ BROKEN - TAMPERING DETECTED'
  END AS chain_status,
  hash_chain_prev AS this_prev,
  expected_prev AS should_be_prev
FROM chain
ORDER BY created_at DESC
LIMIT 100;

-- =============================================================================
-- 3. POSITION STATUS DISTRIBUTION
-- =============================================================================
-- Shows current state of all positions
SELECT
  execution_status,
  COUNT(*) AS count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS percentage,
  MIN(created_at) AS oldest,
  MAX(created_at) AS newest
FROM positions
WHERE company_id = '11111111-1111-1111-1111-111111111111'
GROUP BY execution_status
ORDER BY count DESC;

-- =============================================================================
-- 4. AUDIT EVENT FREQUENCY (Last 24 Hours)
-- =============================================================================
-- Shows activity volume by event type
SELECT
  event_type,
  COUNT(*) AS event_count,
  COUNT(DISTINCT actor_email) AS unique_actors,
  COUNT(DISTINCT position_id) AS unique_positions,
  MIN(created_at) AS first_occurrence,
  MAX(created_at) AS last_occurrence
FROM audit_events
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND company_id = '11111111-1111-1111-1111-111111111111'
GROUP BY event_type
ORDER BY event_count DESC;

-- =============================================================================
-- 5. LIFECYCLE TIME ANALYSIS
-- =============================================================================
-- Average time between lifecycle states (institutional SLA tracking)
WITH lifecycle_times AS (
  SELECT
    p.record_id,
    p.execution_status,
    MIN(CASE WHEN ae.event_type = 'POSITION_CREATED' THEN ae.created_at END) AS created_time,
    MIN(CASE WHEN ae.event_type = 'POLICY_ASSIGNED' THEN ae.created_at END) AS assigned_time,
    MIN(CASE WHEN ae.event_type = 'MARKED_READY' THEN ae.created_at END) AS ready_time,
    MIN(CASE WHEN ae.event_type = 'POSITION_EXECUTED' THEN ae.created_at END) AS executed_time
  FROM positions p
  LEFT JOIN audit_events ae ON ae.position_id = p.id
  WHERE p.company_id = '11111111-1111-1111-1111-111111111111'
  GROUP BY p.id, p.record_id, p.execution_status
)
SELECT
  COUNT(*) AS total_positions,
  ROUND(AVG(EXTRACT(EPOCH FROM (assigned_time - created_time)) / 3600), 2) AS avg_hours_created_to_assigned,
  ROUND(AVG(EXTRACT(EPOCH FROM (ready_time - assigned_time)) / 3600), 2) AS avg_hours_assigned_to_ready,
  ROUND(AVG(EXTRACT(EPOCH FROM (executed_time - ready_time)) / 3600), 2) AS avg_hours_ready_to_executed,
  ROUND(AVG(EXTRACT(EPOCH FROM (executed_time - created_time)) / 3600), 2) AS avg_total_lifecycle_hours
FROM lifecycle_times
WHERE executed_time IS NOT NULL;

-- =============================================================================
-- 6. USER ACTIVITY AUDIT
-- =============================================================================
-- Who did what, when (compliance reporting)
SELECT
  actor_email,
  event_type,
  COUNT(*) AS action_count,
  MIN(created_at) AS first_action,
  MAX(created_at) AS last_action
FROM audit_events
WHERE company_id = '11111111-1111-1111-1111-111111111111'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY actor_email, event_type
ORDER BY actor_email, action_count DESC;

-- =============================================================================
-- 7. REJECTED POSITIONS REPORT
-- =============================================================================
-- All rejections with reasons
SELECT
  p.record_id,
  p.entity,
  p.currency,
  p.amount,
  ae.changes_json->>'reason' AS rejection_reason,
  ae.actor_email AS rejected_by,
  ae.created_at AS rejected_at,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM audit_events ae2
      WHERE ae2.position_id = p.id
        AND ae2.event_type = 'POSITION_REOPENED'
        AND ae2.created_at > ae.created_at
    ) THEN 'REOPENED'
    ELSE 'STILL REJECTED'
  END AS current_state
FROM positions p
JOIN audit_events ae ON ae.position_id = p.id
WHERE ae.event_type = 'POSITION_REJECTED'
  AND p.company_id = '11111111-1111-1111-1111-111111111111'
ORDER BY ae.created_at DESC;

-- =============================================================================
-- 8. BULK OPERATIONS TRACKING
-- =============================================================================
-- All bulk assignments
SELECT
  ae.id,
  ae.event_type,
  ae.actor_email,
  ae.metadata->>'position_count' AS positions_affected,
  ae.changes_json->>'policy_id' AS policy_assigned,
  ae.created_at,
  ae.metadata->>'bulk_operation_id' AS bulk_id
FROM audit_events ae
WHERE ae.event_type = 'POLICY_BULK_ASSIGNED'
  AND ae.company_id = '11111111-1111-1111-1111-111111111111'
ORDER BY ae.created_at DESC;

-- =============================================================================
-- 9. DATA INTEGRITY CHECKS
-- =============================================================================
-- Orphaned positions, invalid dates, zero amounts
SELECT
  'Orphaned positions (no company_id)' AS check_name,
  COUNT(*) AS violation_count
FROM positions
WHERE company_id IS NULL

UNION ALL

SELECT
  'Duplicate record_ids within company' AS check_name,
  COUNT(*) AS violation_count
FROM (
  SELECT record_id, company_id, COUNT(*) AS cnt
  FROM positions
  WHERE company_id = '11111111-1111-1111-1111-111111111111'
  GROUP BY record_id, company_id
  HAVING COUNT(*) > 1
) duplicates

UNION ALL

SELECT
  'Past value dates (should be future)' AS check_name,
  COUNT(*) AS violation_count
FROM positions
WHERE value_date < CURRENT_DATE
  AND company_id = '11111111-1111-1111-1111-111111111111'

UNION ALL

SELECT
  'Zero amount positions' AS check_name,
  COUNT(*) AS violation_count
FROM positions
WHERE amount = 0
  AND company_id = '11111111-1111-1111-1111-111111111111'

UNION ALL

SELECT
  'Positions without audit trail' AS check_name,
  COUNT(*) AS violation_count
FROM positions p
WHERE company_id = '11111111-1111-1111-1111-111111111111'
  AND NOT EXISTS (
    SELECT 1 FROM audit_events ae
    WHERE ae.position_id = p.id
  );

-- =============================================================================
-- 10. 4-EYES APPROVAL AUDIT
-- =============================================================================
-- Verify maker/checker separation
SELECT
  p.record_id,
  maker.actor_email AS proposed_by,
  checker.actor_email AS approved_by,
  proposal.created_at AS proposal_date,
  approval.created_at AS approval_date,
  EXTRACT(EPOCH FROM (approval.created_at - proposal.created_at)) / 3600 AS hours_to_approve,
  CASE
    WHEN maker.actor_email = checker.actor_email THEN '✗ VIOLATION - Same person'
    ELSE '✓ Valid separation of duties'
  END AS sod_check
FROM positions p
JOIN audit_events proposal ON proposal.position_id = p.id AND proposal.event_type = 'EXECUTION_PROPOSED'
JOIN audit_events approval ON approval.position_id = p.id AND approval.event_type = 'POSITION_EXECUTED'
JOIN LATERAL (SELECT actor_email FROM audit_events WHERE id = proposal.id) maker ON true
JOIN LATERAL (SELECT actor_email FROM audit_events WHERE id = approval.id) checker ON true
WHERE p.company_id = '11111111-1111-1111-1111-111111111111'
ORDER BY proposal.created_at DESC;

-- =============================================================================
-- 11. EXPORT AUDIT TRAIL TO CSV (Sample)
-- =============================================================================
-- Full audit trail for compliance export
\copy (
  SELECT
    ae.created_at AT TIME ZONE 'UTC' AS timestamp_utc,
    ae.event_type,
    ae.actor_email,
    p.record_id,
    p.entity,
    p.currency,
    p.amount,
    ae.changes_json->>'from_status' AS from_status,
    ae.changes_json->>'to_status' AS to_status,
    ae.hash_chain_current
  FROM audit_events ae
  JOIN positions p ON ae.position_id = p.id
  WHERE ae.company_id = '11111111-1111-1111-1111-111111111111'
    AND ae.created_at > NOW() - INTERVAL '30 days'
  ORDER BY ae.created_at ASC
) TO '/tmp/audit_trail_export.csv' WITH CSV HEADER;

-- =============================================================================
-- 12. PERFORMANCE MONITORING
-- =============================================================================
-- Slow queries, high volume events
SELECT
  event_type,
  COUNT(*) AS total_events,
  AVG(EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (ORDER BY created_at)))) AS avg_seconds_between_events,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (ORDER BY created_at)))) AS p95_seconds_between
FROM audit_events
WHERE company_id = '11111111-1111-1111-1111-111111111111'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY event_type
ORDER BY total_events DESC;
