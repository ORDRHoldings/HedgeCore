#!/usr/bin/env python3
"""
run_4eyes_execute.py

Complete the 4-eyes workflow:
  - Authenticate both users
  - Check existing proposal state (ea8c4fdf...)
  - If APPROVED -> execute it directly
  - If PROPOSED -> approve + execute
  - If EXECUTED/not found -> re-create full workflow
  - Verify position -> HEDGED
"""

import json
import sys
import urllib.request
import urllib.error
import urllib.parse

BASE_URL = "https://hedgecore.onrender.com"
POSITION_ID = "fee81949-29da-48a2-9cdc-63fd2cc14abd"
KNOWN_PROPOSAL_ID = "ea8c4fdf-361f-485c-880d-6a9409e163bd"

# Credentials
MAKER_EMAIL    = "demo"
MAKER_PASS     = "demo"
CHECKER_EMAIL  = "c.ortega@synexcapital.com"
CHECKER_PASS   = "COrtg@2026!"


def api(method, path, body=None, token=None, api_key=None):
    url = BASE_URL + path
    data = json.dumps(body).encode() if body else None
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if api_key:
        headers["X-API-Key"] = api_key
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            body = json.loads(raw)
        except Exception:
            body = {"raw": raw.decode(errors="replace")}
        return e.code, body


def login(email, password):
    status, data = api("POST", "/v1/auth/login",
                       {"email": email, "password": password})
    if status == 200:
        return data.get("access_token") or data.get("token")
    print(f"  AUTH FAIL {email}: {status} {data}")
    return None


def pp(label, status, data):
    ok = "✓" if status < 300 else "✗"
    print(f"  {ok} [{status}] {label}")
    print(f"    {json.dumps(data, indent=None)[:300]}")
    return data


# ── 1. Authenticate ──────────────────────────────────────────────────────────
print("\n═══════════════════════════════════════════════════════════════")
print("  ORDR Terminal — 4-Eyes Execute Step")
print("═══════════════════════════════════════════════════════════════\n")

print("STEP A: Authenticate")
maker_token   = login(MAKER_EMAIL, MAKER_PASS)
checker_token = login(CHECKER_EMAIL, CHECKER_PASS)
if not maker_token or not checker_token:
    sys.exit(1)
print(f"  ✓ maker_token   = {maker_token[:40]}...")
print(f"  ✓ checker_token = {checker_token[:40]}...")

# ── 2. Check existing proposal ───────────────────────────────────────────────
print(f"\nSTEP B: Check proposal {KNOWN_PROPOSAL_ID}")
status, prop = api("GET", f"/v1/proposals/{KNOWN_PROPOSAL_ID}", token=checker_token)
pp("GET proposal", status, prop)

proposal_id = None
prop_status = None

if status == 200:
    prop_status = prop.get("status")
    proposal_id = prop.get("id") or KNOWN_PROPOSAL_ID
    print(f"  → Proposal status: {prop_status}")
else:
    print("  → Proposal not found or error — will check position for active proposal")

# ── 3. Check position's active proposal if needed ───────────────────────────
if not proposal_id or prop_status in ("EXECUTED", "REJECTED", "WITHDRAWN"):
    print(f"\nSTEP B2: Check position {POSITION_ID} for active proposal")
    status2, pos_proposals = api("GET", f"/v1/proposals/position/{POSITION_ID}",
                                  token=checker_token)
    pp("GET position proposals", status2, pos_proposals)
    if status2 == 200 and isinstance(pos_proposals, list):
        for p in pos_proposals:
            if p.get("status") in ("PROPOSED", "APPROVED"):
                proposal_id = p["id"]
                prop_status = p["status"]
                print(f"  → Found active proposal: {proposal_id} ({prop_status})")
                break

# ── 4. Re-check position execution_status ───────────────────────────────────
print(f"\nSTEP C: Check position execution_status")
s, pos = api("GET", f"/v1/positions/{POSITION_ID}", token=maker_token)
pp("GET position", s, pos)
pos_exec_status = pos.get("execution_status", "UNKNOWN")
print(f"  → execution_status: {pos_exec_status}")

if pos_exec_status == "HEDGED":
    print("\n  🎉 POSITION IS ALREADY HEDGED — workflow complete!")
    sys.exit(0)

# ── 5. Need to (re)propose if no active proposal ────────────────────────────
if not proposal_id or prop_status not in ("PROPOSED", "APPROVED"):
    print(f"\nSTEP D: No active proposal — creating new one")
    if pos_exec_status != "READY_TO_EXECUTE":
        print(f"  ✗ Position is {pos_exec_status}, cannot propose. Exiting.")
        sys.exit(1)
    s, new_prop = api("POST", "/v1/proposals/", token=maker_token, body={
        "position_id":   POSITION_ID,
        "execution_ref": "IBKR-E2E-ORDR-001",
        "hedge_amount":  192534.55025003332,
        "hedge_rate":    20.369,
        "run_id":        "5ad242b1-1b1b-4575-acb1-c45f2197d6ac",
        "notes":         "E2E lifecycle test proposal - ORDR Terminal QA",
    })
    pp("POST /v1/proposals/ (new)", s, new_prop)
    if s not in (200, 201):
        print("  ✗ Failed to create proposal. Exiting.")
        sys.exit(1)
    proposal_id = new_prop["id"]
    prop_status = new_prop["status"]
    print(f"  → New proposal: {proposal_id} ({prop_status})")

# ── 6. Approve if PROPOSED ───────────────────────────────────────────────────
if prop_status == "PROPOSED":
    print(f"\nSTEP E: Approve proposal {proposal_id} as c.ortega (checker)")
    s, appr = api("POST", f"/v1/proposals/{proposal_id}/approve",
                  token=checker_token,
                  body={"approval_notes": "E2E QA approval — SoD check passed"})
    pp("POST /approve", s, appr)
    if s not in (200, 201):
        print("  ✗ Approve failed. Exiting.")
        sys.exit(1)
    prop_status = appr.get("status")
    print(f"  → Proposal status: {prop_status}")
    print(f"  → approval_hash: {appr.get('approval_hash')}")

# ── 7. Execute ───────────────────────────────────────────────────────────────
if prop_status == "APPROVED":
    print(f"\nSTEP F: Execute proposal {proposal_id} as c.ortega")
    s, exec_resp = api("POST", f"/v1/proposals/{proposal_id}/execute",
                       token=checker_token, body={})
    pp("POST /execute", s, exec_resp)

    if s in (200, 201):
        exec_prop = exec_resp.get("proposal", exec_resp)
        exec_pos  = exec_resp.get("position", {})
        print(f"\n  → Proposal status : {exec_prop.get('status')}")
        print(f"  → Position exec   : {exec_pos.get('execution_status')}")
        print(f"  → executed_at     : {exec_prop.get('executed_at')}")
        print(f"  → execution_ref   : {exec_prop.get('execution_ref')}")
        print(f"  → hedge_amount    : {exec_pos.get('hedge_amount')}")
        print(f"  → hedge_rate      : {exec_pos.get('hedge_rate')}")
    else:
        print(f"  ✗ Execute FAILED: {s} {exec_resp}")
        sys.exit(1)
else:
    print(f"  ✗ Proposal not in APPROVED state: {prop_status}")
    sys.exit(1)

# ── 8. Verify HEDGED ─────────────────────────────────────────────────────────
print(f"\nSTEP G: Verify position is HEDGED")
s, final_pos = api("GET", f"/v1/positions/{POSITION_ID}", token=maker_token)
pp("GET position (final)", s, final_pos)

final_status = final_pos.get("execution_status")
print(f"\n  → Final execution_status: {final_status}")

if final_status == "HEDGED":
    print("\n  🎉 SUCCESS — Position is HEDGED!")
    print(f"  → execution_ref  : {final_pos.get('execution_ref')}")
    print(f"  → hedge_amount   : {final_pos.get('hedge_amount')}")
    print(f"  → hedge_rate     : {final_pos.get('hedge_rate')}")
    print(f"  → executed_at    : {final_pos.get('executed_at')}")
    print("\n  ✓ 4-Eyes SoD workflow COMPLETE")
    print("  ✓ MAKER:   demo (NYC branch)")
    print("  ✓ CHECKER: c.ortega (MXC branch) — SoD enforced cross-branch")
    sys.exit(0)
else:
    print(f"\n  ✗ FAIL — expected HEDGED, got {final_status}")
    sys.exit(1)
