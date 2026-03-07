---
name: merge-gate
description: Run the pre-merge governance gate. Checks truth alignment, freeze/invariants, validation, completion discipline, and risks. Returns SAFE_TO_MERGE or BLOCK verdict. Use when user says "merge gate", "can I merge", "merge check", "pre-merge", or "safe to merge".
---

Run the pre-merge governance gate and act on the result.

## Steps

1. Run: `python scripts/pre_merge_gate.py`
2. Review each check (PASS / FAIL / WARN)
3. If BLOCK: list blockers and fix each one before retrying
4. If SAFE_TO_MERGE: proceed with merge/PR
5. To allow merge despite CRITICAL risks: `python scripts/pre_merge_gate.py --allow-critical`

## Policy (hardcoded in script)
- CONTRADICTION in truth reconciliation → BLOCK
- Frozen file in git diff → BLOCK
- Invalid settings.json → BLOCK
- Hook compile failure → BLOCK
- CRITICAL risk → BLOCK (override: --allow-critical)
- STALE items → WARN only
- Open work items → WARN only
- Missing rollup → WARN only
- HIGH risks → WARN only

## Output Format
```
PRE-MERGE GATE — [timestamp]
  [+] Truth reconciliation: PASS — 16 aligned, 0 stale, 0 contradictions
  [+] Freeze/invariants: PASS — 7 patterns enforced
  [+] Validation: PASS — settings valid, hooks compile
  [~] Completion discipline: WARN — 2 open work items
  [!] Risk assessment: FAIL — 1 CRITICAL risk(s) open

  Blockers: 1
    ! Risk assessment: 1 CRITICAL risk(s) open

  Verdict: BLOCK
```
