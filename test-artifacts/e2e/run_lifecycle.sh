#!/usr/bin/env bash
# =============================================================================
# ORDR Terminal — End-to-End Lifecycle Test Runner
# Version: 1.0.0
# Run: bash run_lifecycle.sh
# =============================================================================
set -euo pipefail

BASE="https://hedgecore.onrender.com/api"
API_KEY="HC_DEV_KEY_001"
ARTIFACTS="$(dirname "$0")"
LOG="$ARTIFACTS/logs/lifecycle_run.txt"
PASS_COUNT=0
FAIL_COUNT=0
OVERALL="PASS"

# Ensure log dir exists
mkdir -p "$ARTIFACTS/logs" "$ARTIFACTS/requests" "$ARTIFACTS/responses" "$ARTIFACTS/db"

ts() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
log()  { echo "[$(ts)] $1" | tee -a "$LOG"; }
pass() { PASS_COUNT=$((PASS_COUNT+1)); log "  ✅ PASS: $1"; }
fail() { FAIL_COUNT=$((FAIL_COUNT+1)); OVERALL="FAIL"; log "  ❌ FAIL: $1"; }
assert_eq() { [ "$1" = "$2" ] && pass "$3" || fail "$3 (expected=$2 got=$1)"; }
assert_ne() { [ "$1" != "$2" ] && pass "$3" || fail "$3 (expected NOT $2)"; }
assert_nonempty() { [ -n "$1" ] && pass "$2" || fail "$2 (empty)"; }

api_get() {
  local path="$1" token="${2:-}"
  local hdrs=(-H "X-API-Key: $API_KEY")
  [ -n "$token" ] && hdrs+=(-H "Authorization: Bearer $token")
  sleep 0.5  # rate limit guard
  curl -s "${hdrs[@]}" "$BASE$path" --max-time 60
}

api_post() {
  local path="$1" body="$2" token="${3:-}"
  local hdrs=(-H "X-API-Key: $API_KEY" -H "Content-Type: application/json")
  [ -n "$token" ] && hdrs+=(-H "Authorization: Bearer $token")
  sleep 0.5
  curl -s -X POST "${hdrs[@]}" -d "$body" "$BASE$path" --max-time 120
}

api_patch() {
  local path="$1" body="$2" token="${3:-}"
  local hdrs=(-H "X-API-Key: $API_KEY" -H "Content-Type: application/json")
  [ -n "$token" ] && hdrs+=(-H "Authorization: Bearer $token")
  sleep 0.5
  curl -s -X PATCH "${hdrs[@]}" -d "$body" "$BASE$path" --max-time 60
}

jq_get() { echo "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); v=d; $(echo "$2" | sed "s/\./]; v=v.get('/g" | sed "s/^/v=v.get('/"); print(v or '')" 2>/dev/null || echo ""; }
jq_path() { echo "$1" | python3 -c "
import sys, json
data = json.load(sys.stdin)
path = '$2'.split('.')
v = data
for k in path:
    if isinstance(v, dict): v = v.get(k)
    elif isinstance(v, list) and k.isdigit(): v = v[int(k)]
    else: v = None
    if v is None: break
print(v if v is not None else '')
" 2>/dev/null; }

# =============================================================================
# AUTHENTICATION
# =============================================================================
log "================================================================"
log "ORDR Terminal — E2E Lifecycle Test"
log "================================================================"
log "=== STEP 0B: Authentication ==="

sleep 1
DEMO_JSON=$(curl -s -X POST "$BASE/auth/login" -H "X-API-Key: $API_KEY" \
  -d "username=demo&password=demo" -H "Content-Type: application/x-www-form-urlencoded" --max-time 60)
TOKEN=$(echo "$DEMO_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
assert_nonempty "$TOKEN" "demo login"

sleep 2
# Force-reset seed user passwords (idempotent, ensures Render prod DB is in sync)
RESET_RESP=$(curl -s -X POST "$BASE/v1/seed/reset-passwords" -H "X-API-Key: $API_KEY" -H "Content-Type: application/json" --max-time 60)
RESET_COUNT=$(echo "$RESET_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('reset_count','?'))" 2>/dev/null)
log "Password reset response: reset_count=$RESET_COUNT"

sleep 1
# Use c.ortega (supervisor) as SoD approver — has trades.execute permission
ORTEGA_JSON=$(curl -s -X POST "$BASE/auth/login" -H "X-API-Key: $API_KEY" \
  --data-urlencode "username=c.ortega@synexcapital.com" --data-urlencode "password=COrtg@2026!" --max-time 60)
TOKEN2=$(echo "$ORTEGA_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
assert_nonempty "$TOKEN2" "c.ortega login (SoD approver / supervisor)"

ME=$(api_get "/auth/me" "$TOKEN")
DEMO_USER_ID=$(echo "$ME" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
DEMO_EMAIL=$(echo "$ME" | python3 -c "import sys,json; print(json.load(sys.stdin).get('email',''))" 2>/dev/null)
log "Maker: email=$DEMO_EMAIL id=$DEMO_USER_ID"

sleep 1
ME2=$(api_get "/auth/me" "$TOKEN2")
ORTEGA_EMAIL=$(echo "$ME2" | python3 -c "import sys,json; print(json.load(sys.stdin).get('email',''))" 2>/dev/null)
ORTEGA_ID=$(echo "$ME2" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
HAS_EXECUTE=$(echo "$ME2" | python3 -c "import sys,json; d=json.load(sys.stdin); print('YES' if 'trades.execute' in d.get('permissions',[]) else 'NO')" 2>/dev/null)
log "Checker: email=$ORTEGA_EMAIL id=$ORTEGA_ID has_execute=$HAS_EXECUTE"
assert_eq "$HAS_EXECUTE" "YES" "c.ortega has trades.execute permission"

# =============================================================================
# STEP 1 — Create Position
# =============================================================================
log ""
log "=== STEP 1: Create Position ==="
START_TS=$(ts)
# Use timestamp suffix to ensure uniqueness across test runs
RUN_SUFFIX=$(date -u '+%Y%m%d%H%M%S')
E2E_RECORD_ID="E2E-ORDR-${RUN_SUFFIX}"
log "Using record_id=$E2E_RECORD_ID"

POS_BODY="{
  \"record_id\": \"$E2E_RECORD_ID\",
  \"entity\": \"Synex Capital Partners\",
  \"flow_type\": \"AR\",
  \"currency\": \"MXN\",
  \"amount\": 2500000,
  \"value_date\": \"2026-06-15\",
  \"status\": \"CONFIRMED\",
  \"description\": \"E2E lifecycle test position - ORDR Terminal QA\"
}"
echo "$POS_BODY" > "$ARTIFACTS/requests/step1_create_position.json"

POS_RESP=$(api_post "/v1/positions" "$POS_BODY" "$TOKEN")
echo "$POS_RESP" > "$ARTIFACTS/responses/step1_create_position.json"

POSITION_ID=$(echo "$POS_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
EXEC_STATUS=$(echo "$POS_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('execution_status',''))" 2>/dev/null)

log "position_id=$POSITION_ID"
log "execution_status=$EXEC_STATUS"
assert_nonempty "$POSITION_ID" "position_id is UUID"
assert_eq "$EXEC_STATUS" "NEW" "execution_status=NEW"

# =============================================================================
# STEP 2 — Get Active Policy & Assign
# =============================================================================
log ""
log "=== STEP 2: Get Active Policy Instance ==="

POL_RESP=$(api_get "/v1/policies/active" "$TOKEN")
echo "$POL_RESP" > "$ARTIFACTS/responses/step2_active_policy.json"

POLICY_INSTANCE_ID=$(echo "$POL_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id','') if d else '')" 2>/dev/null)
log "active policy_instance_id=$POLICY_INSTANCE_ID"

# Always activate ACTV template to ensure a fresh PolicyRevision row is created.
# (BUG-3 fix: policy_revisions table was missing prior to this sprint;
# old instances may have no revision row. Re-activating always creates one.)
sleep 1
TEMPLATES=$(api_get "/v1/policies/templates" "$TOKEN")
ACTV_ID=$(echo "$TEMPLATES" | python3 -c "
import sys,json
templates = json.load(sys.stdin)
actv = next((t for t in templates if t.get('short_name') == 'ACTV'), None)
print(actv.get('id','') if actv else '')
" 2>/dev/null)
log "ACTV template_id=$ACTV_ID"

if [ -n "$ACTV_ID" ]; then
  sleep 1
  ACT_RESP=$(api_post "/v1/policies/activate" "{\"template_id\": \"$ACTV_ID\"}" "$TOKEN")
  POLICY_INSTANCE_ID=$(echo "$ACT_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
  log "Activated/refreshed policy_instance_id=$POLICY_INSTANCE_ID"
  echo "$ACT_RESP" > "$ARTIFACTS/responses/step2_activate_policy.json"
fi

if [ -z "$POLICY_INSTANCE_ID" ] || [ "$POLICY_INSTANCE_ID" = "None" ]; then
  log "ACTV activation failed — checking for existing active policy..."
  POLICY_INSTANCE_ID=$(echo "$POL_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('id','') if d else '')" 2>/dev/null)
  log "Fallback policy_instance_id=$POLICY_INSTANCE_ID"
fi

assert_nonempty "$POLICY_INSTANCE_ID" "policy_instance_id present"

log ""
log "=== STEP 2B: Assign Policy to Position ==="

ASSIGN_BODY="{\"policy_instance_id\": \"$POLICY_INSTANCE_ID\"}"
echo "$ASSIGN_BODY" > "$ARTIFACTS/requests/step2b_assign_policy.json"

ASSIGN_RESP=$(api_patch "/v1/positions/$POSITION_ID/assign-policy" "$ASSIGN_BODY" "$TOKEN")
echo "$ASSIGN_RESP" > "$ARTIFACTS/responses/step2b_assign_policy.json"

EXEC_STATUS2=$(echo "$ASSIGN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('execution_status',''))" 2>/dev/null)
log "execution_status after assign=$EXEC_STATUS2"
assert_eq "$EXEC_STATUS2" "POLICY_ASSIGNED" "execution_status=POLICY_ASSIGNED"

# =============================================================================
# STEP 3 — Run Hedge Calculation
# =============================================================================
log ""
log "=== STEP 3: Run Hedge Calculation ==="

CALC_BODY='{
  "trades": [
    {
      "record_id": "E2E-T-001",
      "entity": "Synex Capital Partners",
      "type": "AR",
      "currency": "MXN",
      "amount": 2500000.0,
      "value_date": "2026-06-15",
      "status": "CONFIRMED",
      "description": "E2E trade 1 - Jun AR"
    },
    {
      "record_id": "E2E-T-002",
      "entity": "Synex Capital Partners",
      "type": "AR",
      "currency": "MXN",
      "amount": 1800000.0,
      "value_date": "2026-07-15",
      "status": "CONFIRMED",
      "description": "E2E trade 2 - Jul AR"
    },
    {
      "record_id": "E2E-T-003",
      "entity": "Synex Capital Partners",
      "type": "AP",
      "currency": "MXN",
      "amount": 500000.0,
      "value_date": "2026-06-15",
      "status": "FORECAST",
      "description": "E2E trade 3 - Jun AP forecast"
    }
  ],
  "hedges": [],
  "market": {
    "as_of": "2026-02-25T12:00:00Z",
    "spot_usdmxn": 20.15,
    "forward_points_by_month": {
      "2026-01":0.035,"2026-02":0.072,"2026-03":0.108,"2026-04":0.145,
      "2026-05":0.182,"2026-06":0.219,"2026-07":0.256,"2026-08":0.293,
      "2026-09":0.330,"2026-10":0.367,"2026-11":0.404,"2026-12":0.441
    }
  },
  "policy": {
    "bucket_mode": "CALENDAR_MONTH",
    "hedge_ratios": {"confirmed":1.0,"forecast":0.75},
    "cost_assumptions": {"spread_bps":4},
    "execution_product": "NDF",
    "min_trade_size_usd": 25000
  }
}'
echo "$CALC_BODY" > "$ARTIFACTS/requests/step3_calculate.json"

CALC_RESP=$(api_post "/v1/calculate" "$CALC_BODY" "$TOKEN")
echo "$CALC_RESP" > "$ARTIFACTS/responses/step3_calculate.json"

RUN_ID=$(echo "$CALC_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('run_id',''))" 2>/dev/null)
VAL_STATUS=$(echo "$CALC_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('validation_report',{}).get('status',''))" 2>/dev/null)
BUCKET_COUNT=$(echo "$CALC_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('hedge_plan',{}).get('buckets',[])))" 2>/dev/null)
INPUTS_HASH=$(echo "$CALC_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('run_envelope',{}).get('inputs_hash',''))" 2>/dev/null)
OUTPUTS_HASH=$(echo "$CALC_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('run_envelope',{}).get('outputs_hash',''))" 2>/dev/null)
RUN_HASH=$(echo "$CALC_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('run_envelope',{}).get('run_hash',''))" 2>/dev/null)
TRADES_HASH=$(echo "$CALC_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('run_envelope',{}).get('trades_hash',''))" 2>/dev/null)
HEDGES_HASH=$(echo "$CALC_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('run_envelope',{}).get('hedges_hash',''))" 2>/dev/null)
MARKET_HASH=$(echo "$CALC_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('run_envelope',{}).get('market_hash',''))" 2>/dev/null)
POLICY_HASH=$(echo "$CALC_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('run_envelope',{}).get('policy_hash',''))" 2>/dev/null)

# Get bucket details for step 4
BUCKET0_RATE=$(echo "$CALC_RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
buckets = d.get('hedge_plan',{}).get('buckets',[])
if buckets: print(buckets[0].get('forward_rate', 20.369))
else: print('20.369')
" 2>/dev/null)
TOTAL_ACTION_USD=$(echo "$CALC_RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
s = d.get('hedge_plan',{}).get('summary',{})
print(abs(s.get('total_action_usd', 0) or s.get('total_action_usd_abs', 0)))
" 2>/dev/null)

log "run_id=$RUN_ID"
log "validation=$VAL_STATUS"
log "bucket_count=$BUCKET_COUNT"
log "total_action_usd=$TOTAL_ACTION_USD"
log "inputs_hash=${INPUTS_HASH:0:16}..."
log "outputs_hash=${OUTPUTS_HASH:0:16}..."
log "run_hash=${RUN_HASH:0:16}..."

assert_nonempty "$RUN_ID" "run_id present"
assert_eq "$VAL_STATUS" "PASS" "validation_report.status=PASS"
assert_ne "$BUCKET_COUNT" "0" "hedge_plan.buckets non-empty"
assert_nonempty "$INPUTS_HASH" "inputs_hash present"
assert_nonempty "$OUTPUTS_HASH" "outputs_hash present"
assert_nonempty "$RUN_HASH" "run_hash present"

# =============================================================================
# STEP 4 — Mark READY_TO_EXECUTE
# =============================================================================
log ""
log "=== STEP 4: Mark READY_TO_EXECUTE ==="

HEDGE_AMOUNT="$TOTAL_ACTION_USD"
HEDGE_RATE="$BUCKET0_RATE"

READY_BODY="{\"run_id\": \"$RUN_ID\", \"hedge_amount\": $HEDGE_AMOUNT, \"hedge_rate\": $HEDGE_RATE}"
echo "$READY_BODY" > "$ARTIFACTS/requests/step4_mark_ready.json"

READY_RESP=$(api_patch "/v1/positions/$POSITION_ID/ready" "$READY_BODY" "$TOKEN")
echo "$READY_RESP" > "$ARTIFACTS/responses/step4_mark_ready.json"

EXEC_STATUS3=$(echo "$READY_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('execution_status',''))" 2>/dev/null)
LAST_RUN_ID=$(echo "$READY_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('last_run_id',''))" 2>/dev/null)
log "execution_status=$EXEC_STATUS3 last_run_id=$LAST_RUN_ID"
assert_eq "$EXEC_STATUS3" "READY_TO_EXECUTE" "execution_status=READY_TO_EXECUTE"
assert_eq "$LAST_RUN_ID" "$RUN_ID" "last_run_id linked to run"

# =============================================================================
# STEP 5 — Create Execution Proposal (Maker)
# =============================================================================
log ""
log "=== STEP 5: Create Execution Proposal (Maker=demo) ==="

PROP_BODY="{
  \"position_id\": \"$POSITION_ID\",
  \"execution_ref\": \"IBKR-E2E-ORDR-001\",
  \"hedge_amount\": $HEDGE_AMOUNT,
  \"hedge_rate\": $HEDGE_RATE,
  \"run_id\": \"$RUN_ID\",
  \"notes\": \"E2E lifecycle test proposal - ORDR Terminal QA\"
}"
echo "$PROP_BODY" > "$ARTIFACTS/requests/step5_create_proposal.json"

PROP_RESP=$(api_post "/v1/proposals" "$PROP_BODY" "$TOKEN")
echo "$PROP_RESP" > "$ARTIFACTS/responses/step5_create_proposal.json"

PROPOSAL_ID=$(echo "$PROP_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
PROP_STATUS=$(echo "$PROP_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
PROP_HASH=$(echo "$PROP_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('proposal_hash',''))" 2>/dev/null)
log "proposal_id=$PROPOSAL_ID status=$PROP_STATUS hash=${PROP_HASH:0:16}..."
assert_nonempty "$PROPOSAL_ID" "proposal_id present"
assert_eq "$PROP_STATUS" "PROPOSED" "proposal.status=PROPOSED"

# =============================================================================
# STEP 5B — SoD Test: Try same-user approval (expect 409)
# =============================================================================
log ""
log "=== STEP 5B: SoD Test — same-user approval (expect 409/403) ==="

SOD_RESP=$(api_patch "/v1/proposals/$PROPOSAL_ID/approve" '{"approval_notes":"SoD test"}' "$TOKEN")
SOD_STATUS=$(echo "$SOD_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','') or d.get('detail',''))" 2>/dev/null)
log "SoD self-approve result: $SOD_STATUS"
echo "$SOD_RESP" > "$ARTIFACTS/responses/step5b_sod_test.json"
# If SoD is enforced, we expect an error (not APPROVED)
if echo "$SOD_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('status')!='APPROVED' else 1)" 2>/dev/null; then
  pass "SoD enforced: same-user cannot approve own proposal"
else
  fail "SoD NOT enforced: same-user approved own proposal"
fi

# =============================================================================
# STEP 5C — Approve with Checker (admin)
# =============================================================================
log ""
log "=== STEP 5C: Approve Proposal (Checker=c.ortega / supervisor) ==="

sleep 2  # Refresh c.ortega token if needed
ORTEGA_JSON=$(curl -s -X POST "$BASE/auth/login" -H "X-API-Key: $API_KEY" \
  --data-urlencode "username=c.ortega@synexcapital.com" --data-urlencode "password=COrtg@2026!" --max-time 60)
TOKEN2=$(echo "$ORTEGA_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)
assert_nonempty "$TOKEN2" "c.ortega token refresh (supervisor/SoD approver)"

APPROVE_BODY='{"approval_notes":"E2E lifecycle test approval - ORDR Terminal QA"}'
echo "$APPROVE_BODY" > "$ARTIFACTS/requests/step5c_approve.json"

APPROVE_RESP=$(api_patch "/v1/proposals/$PROPOSAL_ID/approve" "$APPROVE_BODY" "$TOKEN2")
echo "$APPROVE_RESP" > "$ARTIFACTS/responses/step5c_approve.json"

APPROVE_STATUS=$(echo "$APPROVE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
APPROVAL_HASH=$(echo "$APPROVE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('approval_hash',''))" 2>/dev/null)
log "proposal.status=$APPROVE_STATUS approval_hash=${APPROVAL_HASH:0:16}..."
assert_eq "$APPROVE_STATUS" "APPROVED" "proposal.status=APPROVED"
assert_nonempty "$APPROVAL_HASH" "approval_hash present"

# =============================================================================
# STEP 5D — Execute Proposal
# =============================================================================
log ""
log "=== STEP 5D: Execute Proposal ==="

EXEC_RESP=$(api_post "/v1/proposals/$PROPOSAL_ID/execute" '{}' "$TOKEN2")
echo "$EXEC_RESP" > "$ARTIFACTS/responses/step5d_execute_proposal.json"

EXEC_PROP_STATUS=$(echo "$EXEC_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
log "proposal.status after execute=$EXEC_PROP_STATUS"
assert_eq "$EXEC_PROP_STATUS" "EXECUTED" "proposal.status=EXECUTED"

# Verify position is HEDGED
sleep 1
POS_FINAL=$(api_get "/v1/positions/$POSITION_ID" "$TOKEN")
echo "$POS_FINAL" > "$ARTIFACTS/responses/step5d_position_final.json"
FINAL_EXEC=$(echo "$POS_FINAL" | python3 -c "import sys,json; print(json.load(sys.stdin).get('execution_status',''))" 2>/dev/null)
log "position.execution_status=$FINAL_EXEC"
assert_eq "$FINAL_EXEC" "HEDGED" "position.execution_status=HEDGED"

# =============================================================================
# STEP 6 — Audit Trail Verification
# =============================================================================
log ""
log "=== STEP 6: Audit Trail Verification ==="

VERIFY_RESP=$(api_get "/v1/audit/chain/verify" "$TOKEN")
echo "$VERIFY_RESP" > "$ARTIFACTS/responses/step6_audit_verify.json"

INTEGRITY=$(echo "$VERIFY_RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(d.get('integrity_score', d.get('status', d.get('valid', 'UNKNOWN'))))
" 2>/dev/null)
log "audit chain integrity=$INTEGRITY"

# Get audit events for this position
sleep 1
AUDIT_EVENTS=$(api_get "/v1/audit?entity_id=$POSITION_ID&limit=20" "$TOKEN")
echo "$AUDIT_EVENTS" > "$ARTIFACTS/responses/step6_audit_events.json"

EVENT_COUNT=$(echo "$AUDIT_EVENTS" | python3 -c "
import sys,json
d=json.load(sys.stdin)
items = d if isinstance(d,list) else d.get('items', d.get('events', []))
print(len(items))
" 2>/dev/null)
log "audit events for position: $EVENT_COUNT"

# Extract event types
echo "$AUDIT_EVENTS" | python3 -c "
import sys,json
d=json.load(sys.stdin)
items = d if isinstance(d,list) else d.get('items', d.get('events', []))
for e in items:
    print('  event:', e.get('event_type','?'), '|', e.get('description','?')[:60], '|', e.get('created_at','?')[:20])
" 2>/dev/null | tee -a "$LOG"

assert_ne "$EVENT_COUNT" "0" "audit events present for position"

# =============================================================================
# STEP 7 — Run Detail (Run Viewer data)
# =============================================================================
log ""
log "=== STEP 7: Run Detail (Run Viewer) ==="

RUN_DETAIL=$(api_get "/v1/runs/$RUN_ID" "$TOKEN")
echo "$RUN_DETAIL" > "$ARTIFACTS/responses/step7_run_detail.json"

RD_INPUTS_HASH=$(echo "$RUN_DETAIL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('inputs_hash','') or d.get('run_envelope',{}).get('inputs_hash',''))" 2>/dev/null)
RD_POLICY_REV=$(echo "$RUN_DETAIL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('policy_revision_id','') or '')" 2>/dev/null)
TRACE_COUNT=$(echo "$RUN_DETAIL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('trace_lite',{}).get('events',[])))" 2>/dev/null)

log "run_detail inputs_hash=${RD_INPUTS_HASH:0:16}..."
log "run_detail policy_revision_id=$RD_POLICY_REV"
log "trace events=$TRACE_COUNT"

# Assert hashes match
if [ "$RD_INPUTS_HASH" = "$INPUTS_HASH" ]; then
  pass "run_detail.inputs_hash matches calculate response"
else
  fail "inputs_hash mismatch: detail=$RD_INPUTS_HASH calc=$INPUTS_HASH"
fi

assert_ne "$TRACE_COUNT" "0" "trace_lite has events (>0)"

if [ -n "$RD_POLICY_REV" ] && [ "$RD_POLICY_REV" != "None" ]; then
  pass "policy_revision_id pinned in run_detail"
else
  fail "policy_revision_id NOT PINNED in run_detail (BUG: backend not returning field)"
fi

# =============================================================================
# STEP 8 — Committee Pack
# =============================================================================
log ""
log "=== STEP 8: Committee Pack ==="

COMMITTEE=$(api_get "/v1/export/committee-pack/$RUN_ID" "$TOKEN")
echo "$COMMITTEE" > "$ARTIFACTS/responses/step8_committee_pack.json"

CP_INPUTS_HASH=$(echo "$COMMITTEE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('run_envelope',{}).get('inputs_hash',''))" 2>/dev/null)
CP_BUCKETS=$(echo "$COMMITTEE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('hedge_plan',{}).get('buckets',[])))" 2>/dev/null)
CP_POLICY_REV=$(echo "$COMMITTEE" | python3 -c "import sys,json; d=json.load(sys.stdin); p=d.get('policy_revision'); print(p.get('id','') if p else '')" 2>/dev/null)

log "committee_pack inputs_hash=${CP_INPUTS_HASH:0:16}..."
log "committee_pack hedge_plan.buckets=$CP_BUCKETS"
log "committee_pack policy_revision=$CP_POLICY_REV"

if [ "$CP_INPUTS_HASH" = "$INPUTS_HASH" ]; then
  pass "committee_pack.run_envelope.inputs_hash matches"
else
  fail "inputs_hash mismatch in committee pack (calc=$INPUTS_HASH cp=$CP_INPUTS_HASH)"
fi

if [ "$CP_BUCKETS" != "0" ] && [ -n "$CP_BUCKETS" ]; then
  pass "committee_pack.hedge_plan.buckets non-empty ($CP_BUCKETS buckets)"
else
  fail "committee_pack.hedge_plan.buckets EMPTY (BUG: data not persisted)"
fi

if [ -n "$CP_POLICY_REV" ] && [ "$CP_POLICY_REV" != "None" ]; then
  pass "committee_pack.policy_revision present"
else
  fail "committee_pack.policy_revision NULL (BUG: policy not pinned at calc time)"
fi

# =============================================================================
# FINAL SUMMARY
# =============================================================================
log ""
log "================================================================"
log "=== E2E LIFECYCLE SUMMARY ==="
log "================================================================"
log "Environment:       https://hedgecore.onrender.com (Render)"
log "Frontend:          https://ordr-terminal.vercel.app"
log "Test Record:       $E2E_RECORD_ID"
log "Position ID:       $POSITION_ID"
log "Run ID:            $RUN_ID"
log "Proposal ID:       $PROPOSAL_ID"
log "Policy Instance:   $POLICY_INSTANCE_ID"
log "Maker:             demo (senior_analyst)"
log "Checker:           c.ortega@synexcapital.com (supervisor)"
log "---"
log "Final Position:    $FINAL_EXEC"
log "Final Proposal:    $EXEC_PROP_STATUS"
log "Audit Events:      $EVENT_COUNT"
log "Bucket Count:      $BUCKET_COUNT (engine) / $CP_BUCKETS (committee pack)"
log "Policy Pin:        $RD_POLICY_REV"
log "---"
log "SHA-256 Hashes:"
log "  inputs_hash:  $INPUTS_HASH"
log "  outputs_hash: $OUTPUTS_HASH"
log "  run_hash:     $RUN_HASH"
log "  trades_hash:  $TRADES_HASH"
log "  hedges_hash:  $HEDGES_HASH"
log "  market_hash:  $MARKET_HASH"
log "  policy_hash:  $POLICY_HASH"
log "---"
log "Tests PASSED: $PASS_COUNT"
log "Tests FAILED: $FAIL_COUNT"
log "OVERALL: $OVERALL"
log "================================================================"

# Write summary env file for report generation
cat > "$ARTIFACTS/lifecycle_vars.env" <<ENV
POSITION_ID=$POSITION_ID
RUN_ID=$RUN_ID
PROPOSAL_ID=$PROPOSAL_ID
POLICY_INSTANCE_ID=$POLICY_INSTANCE_ID
FINAL_EXEC_STATUS=$FINAL_EXEC
FINAL_PROP_STATUS=$EXEC_PROP_STATUS
BUCKET_COUNT=$BUCKET_COUNT
CP_BUCKET_COUNT=$CP_BUCKETS
POLICY_REV_ID=$RD_POLICY_REV
INPUTS_HASH=$INPUTS_HASH
OUTPUTS_HASH=$OUTPUTS_HASH
RUN_HASH=$RUN_HASH
TRADES_HASH=$TRADES_HASH
HEDGES_HASH=$HEDGES_HASH
MARKET_HASH=$MARKET_HASH
POLICY_HASH=$POLICY_HASH
PASS_COUNT=$PASS_COUNT
FAIL_COUNT=$FAIL_COUNT
OVERALL=$OVERALL
ENV

exit $([ "$OVERALL" = "PASS" ] && echo 0 || echo 1)
