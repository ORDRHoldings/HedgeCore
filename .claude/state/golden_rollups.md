# Golden Rollups — Reference Examples

These are examples of high-quality session rollups. The historian agent should produce rollups in this style.

## Format Template
```
SESSION ROLLUP — [date]
Changed: [count] files ([category summary])
Summary: [2-3 sentences describing what was accomplished and why]
Decisions: [specific decisions with rationale, or "none"]
Risks: [new risks identified, or "none"]
Verified: [what was tested and the result]
Next: [concrete next step]
```

## Example 1: Feature Implementation
```
SESSION ROLLUP — 2026-03-06
Changed: 14 files (3 backend, 8 frontend, 3 tests)
Summary: Implemented IFRS 9/ASC 815 hedge effectiveness testing. Engine wrapper runs dollar-offset (0.80-1.25) and regression (R2>=0.80) analysis. 7 new API endpoints, 2 WORM tables, 2 frontend pages.
Decisions: Used engine wrapper pattern (engine/ delegates to engine_v1/) to preserve freeze. Added 2 new permissions (hedge_effectiveness.run, calculate.run_production).
Risks: None new.
Verified: 25 unit tests passing, ruff clean, frontend builds.
Next: Wire into calculation wizard results tab.
```

## Example 2: Bug Fix
```
SESSION ROLLUP — 2026-03-06
Changed: 4 files (2 backend, 1 frontend, 1 test)
Summary: Fixed _to_usd() currency conversion using hardcoded CCY_PER_USD set instead of broken rate>2.0 heuristic. EUR/GBP/AUD/NZD now correctly identified as "per USD" currencies.
Decisions: Explicit currency set over heuristic — deterministic and auditable.
Risks: None new.
Verified: Existing tests pass, manual spot-check with EUR=1.08 and MXN=17.5 confirms correct conversion direction.
Next: None — fix complete.
```

## Example 3: Infrastructure
```
SESSION ROLLUP — 2026-03-07
Changed: 28 files (new operating system framework)
Summary: Installed Claude Code multi-layer operating system: 6 rules, 6 agents, 5 skills, 5 hooks, SQLite memory.db, 4 architecture canon files. Hooks enforce freeze guard and config change awareness.
Decisions: Keep root CLAUDE.md (auto-loaded by Claude Code), Python hooks for Windows compat, memory.db + auto-memory coexist without duplication.
Risks: Hooks not yet verified in live session (require restart).
Verified: All 5 hook scripts compile, freeze guard blocks kernel.py (exit 2), allows dashboard.py (exit 0), memory.db has 10 tables with 22 seed rows.
Next: Test hooks in new session, add PostToolUse file_facts recording.
```

## Anti-Patterns (avoid these)
- "Made some changes to the codebase" — too vague
- "Fixed stuff" — no specifics
- 20-line rollup with full file lists — too long
- "Everything looks good" — no evidence
- Missing "Verified" section — unverified claims
