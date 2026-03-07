---
name: reconcile
description: Check if repo truth is aligned. Compares actual code counts, routes, models, engines, hooks, and settings against state files and memory.db. Reports ALIGNED, STALE, CONTRADICTION, or NOT VERIFIED. Use when user says "reconcile", "truth check", "repo alignment", or "verify state".
---

Run the truth reconciliation script and report findings.

## Steps

1. Run: `python scripts/reconcile_truth.py`
2. Review each check result (ALIGNED / STALE / CONTRADICTION / NOT VERIFIED)
3. For any STALE or CONTRADICTION findings, update the relevant state file or memory.db entry
4. Re-run to confirm all checks pass

## Output Format
```
TRUTH RECONCILIATION — [date]
[check_name]: [ALIGNED|STALE|CONTRADICTION|NOT VERIFIED] — [detail]
...
Summary: [aligned_count] aligned, [stale_count] stale, [contradiction_count] contradictions, [unverified_count] not verified
```

## Rules
- Never ignore a CONTRADICTION — fix the source of truth
- STALE items should be updated or marked with a date caveat
- NOT VERIFIED items need a concrete plan to verify or accept as-is
