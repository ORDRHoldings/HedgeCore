---
name: validation-gate
description: Run backend tests + lint + frontend build and record evidence to memory.db. Use when user says "validate", "run gate", or "validation gate".
---

Run tests, lint, and build. Record results to memory.db.

## Steps
1. Backend lint: `cd backend && python -m ruff check app/ 2>&1 | tail -3`
2. Backend tests: `cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short 2>&1 | tail -10`
3. Frontend types: `cd frontend && npx tsc --noEmit 2>&1 | tail -5`
4. Frontend build: `cd frontend && npx next build 2>&1 | tail -5`
5. Record results to `.claude/state/memory.db`:
   ```sql
   INSERT INTO validation_runs (run_date, run_type, result, details, evidence)
   VALUES (datetime('now'), 'gate', 'pass|fail', ?, ?);
   ```

## Output Format
```
VALIDATION GATE — [date]
Backend lint:  [PASS | FAIL (N issues)]
Backend tests: [PASS (N passed) | FAIL (details)]
Frontend tsc:  [PASS | FAIL (N errors)]
Frontend build: [PASS | FAIL]
Overall: PASS | FAIL
```
