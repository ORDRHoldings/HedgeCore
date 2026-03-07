---
name: freeze-check
description: Verify no frozen architecture components were modified in current changes. Use when user says "check freeze", "freeze check", or "architecture check".
---

Verify no frozen architecture components were modified.

## Frozen Patterns
- `backend/app/engine_v1/kernel.py`
- `backend/app/engine_v1/validator.py`
- `backend/app/engine_v1/audit.py`
- `backend/app/models/audit_event.py`
- `backend/app/models/calculation_run.py`
- `backend/app/models/policy_revision.py`

## Steps
1. Get changed files: `git diff --name-only HEAD~1` (or vs master)
2. Check each changed file against frozen patterns.
3. If frozen file modified, check for ADR reference in commit message.
4. Report verdict.

## Output Format
```
FREEZE CHECK — [date]
Changed files: [count]
Frozen files touched: [list or "none"]
ADR coverage: [all covered | missing for: ...]
Verdict: PASS | VIOLATION
```
