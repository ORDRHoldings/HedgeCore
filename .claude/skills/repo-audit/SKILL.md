---
name: repo-audit
description: Scan repository health — dead code, missing tests, broken imports, lint issues, security problems. Use when user says "audit the repo", "check repo health", or "repo scan".
---

Scan repository health: dead code, missing tests, broken imports, stale dependencies, security issues.

## Steps
1. Check for unused imports: `cd backend && python -m ruff check app/ --select F401`
2. Check for TODO/FIXME/HACK: `grep -rn "TODO\|FIXME\|HACK" backend/app/ frontend/src/ --include="*.py" --include="*.ts" --include="*.tsx" | wc -l`
3. Check for hardcoded secrets: `grep -rn "password\|secret\|api_key" --include="*.py" --include="*.ts" | grep -v test | grep -v ".md" | head -10`
4. Check frontend build: `cd frontend && npx next build 2>&1 | tail -5`
5. Check backend lint: `cd backend && python -m ruff check app/ 2>&1 | tail -5`

## Output Format
```
REPO AUDIT — [date]
- Lint issues: [count]
- TODOs: [count]
- Security: [CLEAN | count issues]
- Build: [PASS | FAIL]
- Lint: [PASS | FAIL]
```

Keep output under 50 lines. Summarize, don't dump.
