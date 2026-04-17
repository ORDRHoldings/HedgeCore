# ORDR TreasuryFX — Constitution

## Execution Mode

**AUTONOMOUS EXECUTION**: Once the user approves a plan or gives a task instruction, execute ALL steps without pausing for confirmation. Do NOT ask "Should I proceed?", "Can I continue?", or any mid-task confirmations. Work silently until complete, then report what was accomplished. The only exception is destructive operations on production data (database drops, force pushes).

**NO VERBOSE OUTPUT**: Skip explanatory commentary during execution. No "Let me now...", "Next I'll...". Just do the work. Output only the final summary.

**PARALLEL EXECUTION**: Always launch independent tasks in parallel using the Task tool. Never serialize work that can be parallelized.

## Project Identity

- **Product**:  Institutional FX hedge calculation & governance platform
- **Domain**: Treasury/risk management for corporate FX exposure hedging
- **Stage**: v1 (architecture-frozen, no ML/auto-learning/broker execution)

## Architecture

- **Backend**: Python 3.12, FastAPI, SQLAlchemy async, PostgreSQL (`backend/`)
- **Frontend**: Next.js 15.5 (App Router), TypeScript 5.9, React 19 (`frontend/`)
- **Deploy**: Render.com (backend) + Vercel (frontend), Render PostgreSQL

## Immutable Rules (v1 Freeze)

1. **Architecture freeze**: No ML, auto-learning, broker execution, stateful logic
2. **R1-R8 Risk Taxonomy**: Never modify
3. **Strategy-Instrument mapping**: Never modify
4. **Middleware order**: Audit -> Rate Limit -> Auth
5. **WORM tables**: audit_events, calculation_runs, policy_revisions are append-only
6. **Hash chain**: SHA-256, per-tenant, GENESIS_HASH = 0000...0000
7. **Frozen files require ADR**: See `.claude/rules/architecture.md`

## Operating System

This repo uses a structured Claude Code operating framework:

| Layer | Location | Purpose |
|-------|----------|---------|
| Rules | `.claude/rules/` | Domain-scoped coding rules (6 files) |
| Agents | `.claude/agents/` | Specialized subagent definitions (6 agents) |
| Skills | `.claude/skills/` | Reusable skill definitions (5 skills) |
| Hooks | `.claude/hooks/` | Automated enforcement scripts (5 hooks) |
| State | `.claude/state/` | Working memory (SQLite + markdown files) |
| Canon | `docs/architecture/` | Architecture freeze + truth files |

### Workflow
1. **historian** loads project state from `.claude/state/`
2. **architect** checks freeze and scope before changes
3. **implementer** executes scoped engineering work
4. **quant_auditor** reviews engine/math changes (when relevant)
5. **reviewer** checks regressions and drift
6. **release_guardian** issues readiness verdict before merge
7. **historian** records what changed

### Memory
- **Hot**: `.claude/state/CURRENT_STATE.md` + `CURRENT_SPRINT.md` (loaded each session)
- **Structured**: `.claude/state/memory.db` (SQLite — queryable history, risks, decisions, ADRs)
- **Auto-memory**: `~/.claude/projects/.../memory/MEMORY.md` (cross-session context)

### Validation Contract
No task is complete until:
- Work is implemented
- Tests are run (or explicitly marked `[NOT VERIFIED]`)
- **Browser-confirmed**: feature is verified working in a real browser (not just passing tests)
- **User-approved**: user explicitly confirms the result is acceptable
- State is written back to memory
- Next step is recorded

**DONE = browser tested + user approved.** A sprint item or task is NOT marked done based on tests alone. Claude MUST perform autonomous browser verification using `mcp__claude-in-chrome__*` tools: navigate to the relevant page, exercise every deliverable, capture a screenshot as evidence, then mark items DONE. Only escalate to the user if something is broken. Do NOT mark `[PENDING BROWSER CONFIRMATION]` and wait — that blocks sprints indefinitely.

## Quick Reference

| What | Path |
|------|------|
| Backend rules | `.claude/rules/backend.md` |
| Frontend rules | `.claude/rules/frontend.md` |
| Security rules | `.claude/rules/security.md` |
| Testing rules | `.claude/rules/testing.md` |
| Release rules | `.claude/rules/releases.md` |
| Architecture freeze | `docs/architecture/architecture-freeze.md` |
| Engine truth table | `docs/architecture/ENGINE_TRUTH_TABLE.md` |
| API contracts | `docs/architecture/API_CONTRACTS.md` |
| DB schema canon | `docs/architecture/DB_CANON.md` |
| System boundaries | `docs/architecture/SYSTEM_BOUNDARIES.md` |
| Current state | `.claude/state/CURRENT_STATE.md` |
| Open risks | `.claude/state/OPEN_RISKS.md` |
| Changelog | `.claude/state/CHANGELOG_AI.md` |
| Memory DB | `.claude/state/memory.db` |

## Production Gotchas

**Schema drift (ORM vs prod DB)**
Symptom: `/auth/me` returns 500 swallowed as 401 → dashboard black screen for all users.
Root cause: ORM model has columns absent from the production DB (e.g. `users.ui_preferences`, `companies.stripe_customer_id`). SQLAlchemy `SELECT *` → `ProgrammingError`.
Fix: Add `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` to `_ensure_tables()` in `app/core/db.py`. Large JSONB columns should be marked `deferred()` in the ORM model to avoid loading them on every query.

**PageShell nesting**
`PageShell` is a full-page layout wrapper. Never nest it inside a component that already renders inside a PageShell layout (e.g. inside `RunsTab`, inside a map callback).
Symptom: double-header, broken layout. Fix: remove inner PageShell import entirely.

**Redis cache is fail-open (intentional)**
Redis outage must NOT block market data. The cache client is fail-open by design — a Redis error falls through silently. Do not change this to fail-closed.

## Build & Deploy

```bash
# Frontend build
cd frontend && npx next build

# Frontend TypeScript check (no emit)
cd frontend && npx tsc --noEmit

# Backend dev server
cd backend && python -m uvicorn app.main:app --reload

# Backend tests
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short

# Alembic migrations
cd backend && alembic upgrade head
cd backend && alembic revision --autogenerate -m "description"

# psql
"C:\Program Files\PostgreSQL\17\bin\psql.exe" "postgresql://hedge_user:...@dpg-...render.com/hedge"
```
