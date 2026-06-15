# ORDR TreasuryFX — Project Constitution

> Institutional FX hedge calculation and governance platform. Treasury and risk
> management for corporate FX exposure. v1 architecture is frozen: no ML, no
> auto-learning, no broker execution, no stateful decision logic.

---

## 1. Execution Mode

| Rule | Meaning |
|------|---------|
| **AUTONOMOUS** | Once the user approves a plan or issues a task, execute every step end-to-end. Do not pause to ask "Should I continue?" or "Proceed?". Confirm only before destructive operations on production data (DB drops, force pushes). |
| **TERSE** | No "Let me now…" / "Next I'll…" narration. State intent in one line, work, report results. |
| **PARALLEL** | Independent work runs in parallel via concurrent tool calls. Never serialize what can be parallelized. |
| **DONE = browser-verified** | A task is not done until the deliverable is exercised in a real browser via `mcp__claude-in-chrome__*` and a screenshot is captured. Tests alone do not certify done. |

---

## 2. Architecture Snapshot

| Layer | Stack | Path |
|-------|-------|------|
| Backend | Python 3.12, FastAPI 0.121, Starlette 0.49, SQLAlchemy async, Alembic 1.18, asyncpg | `backend/` |
| Frontend | Next.js 15.5 App Router, React 19.1, TypeScript 5.9 | `frontend/` |
| Database | PostgreSQL 17 (Render) with Row-Level Security forced on tenant-scoped tables | — |
| Deploy | Render.com (backend, blueprint sync), Vercel (frontend), Render Postgres | — |
| Observability | Structured logs (FastAPI logger), Sentry (planned, RISK-OPS-MON-01) | — |

---

## 3. Immutable Rules (v1 Freeze)

1. **Architecture freeze** — no ML, auto-learning, broker execution, stateful decision logic.
2. **R1–R8 risk taxonomy** — never modify.
3. **Strategy-to-Instrument mapping** — never modify.
4. **Middleware order** — `Audit → Rate Limit → Auth`. Never reorder.
5. **WORM tables** — `audit_events`, `calculation_runs`, `policy_revisions` are append-only. No UPDATE, no DELETE triggers.
6. **Hash chain** — SHA-256, per-tenant, `GENESIS_HASH = 64 × '0'`.
7. **Frozen-file ADR rule** — files listed in `.claude/rules/architecture.md` require an ADR in `docs/architecture/adr/` to modify. Next ADR number = 0022 (`0021-migration-metadata-completeness` is proposed; last accepted: `0020-enterprise-audit-hardening`).

Violation of any rule above blocks merge to master.

---

## 4. Operating Framework

Structured Claude Code operating layout. The framework is the contract — agents follow rules, rules cite canon, canon defines the system.

| Layer | Location | Purpose | Count |
|-------|----------|---------|-------|
| Rules | `.claude/rules/` | Domain-scoped coding rules | 6 (architecture, backend, frontend, releases, security, testing) |
| Agents | `.claude/agents/` | Specialized subagents | 6 (architect, historian, implementer, quant-auditor, release-guardian, reviewer) |
| Skills | `.claude/skills/` | Reusable workflows | 9 (done, freeze-check, merge-gate, reconcile, repo-audit, sprint-update, status, task-rollup, validation-gate) |
| State | `.claude/state/` | Working memory (markdown + SQLite) | 7 files + 2 DBs |
| Canon | `docs/architecture/` | Architecture freeze, ADRs, truth tables, threat model | 18 ADRs (numbered through 0021) + 5 canon docs |

### Agent Workflow (typical handoff)

1. **historian** — load `.claude/state/CURRENT_STATE.md` + `CURRENT_SPRINT.md` at session start
2. **architect** — verify freeze and scope before any structural change; produce ADR if needed
3. **implementer** — execute scoped engineering work against rules
4. **quant-auditor** — review changes touching `engine_v1/`, math, or risk metrics
5. **reviewer** — pre-merge regression and contract-drift check
6. **release-guardian** — issue ready-to-merge verdict
7. **historian** — record what changed in state files

---

## 5. Memory & State

| Tier | Location | Lifecycle |
|------|----------|-----------|
| Hot | `.claude/state/CURRENT_STATE.md`, `.claude/state/CURRENT_SPRINT.md` | Loaded at session start |
| Risks | `.claude/state/OPEN_RISKS.md` | Single source of truth for open risks; consult before risk-bearing changes |
| Changelog | `.claude/state/CHANGELOG_AI.md` | Append-only narrative of what shipped, why |
| Structured | `.claude/state/memory.db` (SQLite) | Queryable history: work items, risks, decisions, validation runs |
| Auto-memory | `~/.claude/projects/D--Synexiun-1-SynexFund-ORDR-TreasuryFX/memory/` | Cross-session feedback/project/reference memories. Index: `MEMORY.md` |

State is written back by **historian** at the end of each work arc. Risks open and close in `OPEN_RISKS.md`; commits referencing a `RISK-*` ID must update the corresponding entry.

---

## 6. Validation Contract

A task is **DONE** only when all of the following hold:

- Code implemented
- Tests pass (or explicitly marked `[NOT VERIFIED]` with reason)
- Feature exercised in a real browser via `mcp__claude-in-chrome__*` with a screenshot captured as evidence
- For sprint items: user explicitly confirms the result is acceptable
- State files updated (`CURRENT_STATE.md`, `OPEN_RISKS.md`, `CHANGELOG_AI.md` as relevant)

Do **not** mark items `[PENDING BROWSER CONFIRMATION]` and wait — that blocks sprints indefinitely. Perform the browser check autonomously, escalate only if broken.

Current backend baseline (2026-05-25): **5514 passed / 160 skipped / 0 failed** on SQLite. CI coverage gate: 70% minimum (target: 75%+).

---

## 7. Quick Reference

| Topic | Path |
|-------|------|
| Backend coding rules | `.claude/rules/backend.md` |
| Frontend coding rules | `.claude/rules/frontend.md` |
| Security rules | `.claude/rules/security.md` |
| Testing rules | `.claude/rules/testing.md` |
| Release rules | `.claude/rules/releases.md` |
| Architecture rules + ADR discipline | `.claude/rules/architecture.md` |
| Architecture freeze (canonical) | `docs/architecture/architecture-freeze.md` |
| Engine truth table | `docs/architecture/ENGINE_TRUTH_TABLE.md` |
| API contracts | `docs/architecture/API_CONTRACTS.md` |
| DB schema canon | `docs/architecture/DB_CANON.md` |
| System boundaries | `docs/architecture/SYSTEM_BOUNDARIES.md` |
| Threat model | `docs/architecture/threat-model.md` |
| ADR directory | `docs/architecture/adr/` |
| Current project state | `.claude/state/CURRENT_STATE.md` |
| Active sprint | `.claude/state/CURRENT_SPRINT.md` |
| Open risks | `.claude/state/OPEN_RISKS.md` |
| AI changelog | `.claude/state/CHANGELOG_AI.md` |
| Memory DB | `.claude/state/memory.db` |

---

## 8. Risk Register (snapshot — verify against `OPEN_RISKS.md`)

| ID | Severity | Status | Summary |
|----|----------|--------|---------|
| RISK-AUTH-RLS-01 | MEDIUM → LOW | Mitigated 2026-05-24 | API-key auth path doesn't inject tenant RLS; startup guard (`assert_api_key_routes_safe`) blocks non-allowlisted usage |
| RISK-AUTH-RLS-02 | HIGH | Closed 2026-05-24 | `dashboard.py::_resolve_user` JWT path bypassed RLS injection; `set_tenant_rls_context` now called after user lookup |
| RISK-CI-PG-01 | MEDIUM | Advisory | `requires_postgres` tests don't run in CI; advisory `backend-postgres` job exists but is `continue-on-error: true` |
| RISK-CI-PG-02 | MEDIUM | Open (advisory) | `audit_logs` DuplicateTable in alembic chain on fresh Postgres |
| RISK-CI-E2E-01 | HIGH | Advisory | Full E2E Playwright suite never finished in CI window; smoke subset (44 tests) wired |
| RISK-OPS-MON-01 | HIGH | Open | No backend 5xx alert; no Render auto-rollback. Directly enabled the 2026-05-13 → 2026-05-16 silent RLS outage |
| RISK-ERP-01 | MEDIUM | Open | No tenant has live QuickBooks/Xero/NetSuite credentials; posting adapters run in paper mode |
| RISK-RLS-PROD-01 | P1 | Closed 2026-05-16 | `SET LOCAL` rejects bind params on asyncpg; replaced with `set_config(name, value, true)` |

---

## 9. Production Gotchas

### 9.1 RLS injection — parallel auth helpers silently empty data

Migration `0036_force_rls_tenant_context` forces RLS on `positions` and `calculation_runs`. The policy clause is:

```sql
company_id::text = COALESCE(
    NULLIF(current_setting('app.current_tenant_id', true), ''),
    '00000000-0000-0000-0000-000000000000'
)
```

`TenantRLSAsyncSession.execute()` auto-injects `app.current_tenant_id` from a request-local ContextVar before every query. If a route uses a parallel auth helper (`_resolve_user`, direct `decode_token`, etc.) instead of `Depends(get_current_user)` from `app/core/dependencies.py`, the ContextVar stays at its default `None` → policy matches the NO_TENANT sentinel → all queries against RLS-forced tables silently return empty rows.

**Rule:** any route that reads `positions` or `calculation_runs` must depend on `get_current_user`, or mirror its RLS injection explicitly: `set_tenant_rls_context(tenant_id, bypass=user.is_superuser)`. Do **not** add an explicit `await inject_tenant_rls(db, ...)` if existing tests use `AsyncMock(side_effect=[...])` — it consumes 2 mocked execute slots and breaks pre-allocated sequences.

Two startup guards enforce this structurally (both fire from `app/main.py` lifespan):

1. `assert_api_key_routes_safe(app)` — `app/deps/api_key_auth.py`. Walks every `APIRoute`'s dependant graph; any route using `get_api_key_principal` that isn't in `API_KEY_AUTH_ALLOWLIST` blocks startup.
2. `assert_routes_have_canonical_auth(app)` — `app/core/dependencies.py`. The structural inverse: every route must have `get_current_user` OR `get_api_key_principal` in its dependant tree, OR be explicitly listed in `NO_AUTH_ROUTE_ALLOWLIST` with a justification comment. This is the guard that would have caught RISK-AUTH-RLS-02 (dashboard's `_resolve_user`) at startup instead of in production three days later.

Adding a new no-auth route requires editing the allowlist with a one-line justification — reviewers are expected to challenge new entries.

### 9.2 Schema drift (ORM vs prod DB)

ORM model has columns absent from production DB (e.g. `users.ui_preferences`, `companies.stripe_customer_id`) → SQLAlchemy `SELECT *` raises `ProgrammingError` → `/auth/me` returns 500, swallowed as 401 → dashboard black screen for all users.

**Fix pattern:** add `ALTER TABLE … ADD COLUMN IF NOT EXISTS` to `_ensure_tables()` in `backend/app/core/db.py`. Mark large JSONB columns `deferred()` on the ORM model to avoid loading them on every query.

### 9.3 PageShell nesting

`PageShell` is a full-page layout wrapper. Never nest it inside a component that already renders inside a PageShell layout (e.g. inside `RunsTab`, inside a map callback). Symptom: double header, broken layout. Fix: remove the inner `PageShell` import entirely.

### 9.4 Redis cache is fail-open (intentional)

A Redis outage must **not** block market data. The cache client is fail-open by design — Redis errors fall through silently. Do not change this to fail-closed.

### 9.5 GitHub Actions billing-block looks like test failure

When org billing/quota is exhausted, every CI job fails in 2–4 seconds with `steps: []` (empty array) and `BlobNotFound` on log retrieval. Push succeeds, only execution is blocked. **Do not bisect commits or "fix" the failing jobs** — verify with `gh run view <id> --json jobs --jq '.jobs[] | {name, startedAt, completedAt, steps: [.steps[].name]}'`. Sub-5s + empty `steps` = infrastructure, not code. Continue committing local-validated work; the validation is deferred, not blocked.

---

## 10. Build & Deploy

```bash
# Frontend build (Next.js)
cd frontend && npx next build

# Frontend type check (no emit)
cd frontend && npx tsc --noEmit

# Backend dev server
cd backend && python -m uvicorn app.main:app --reload

# Backend full suite (SQLite — fast loop)
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
  DATABASE_URL="sqlite+aiosqlite://" \
  python -m pytest tests/ -x -q --tb=short

# Backend route-layer smoke (131 tests, fast)
cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
  DATABASE_URL="sqlite+aiosqlite://" \
  python -m pytest tests/test_routes_smoke.py -q

# E2E smoke project (44 Playwright tests)
cd frontend && npx playwright test --project=smoke

# Alembic
cd backend && alembic upgrade head
cd backend && alembic revision --autogenerate -m "description"
cd backend && alembic heads   # verify single head after a merge

# psql (Render production)
"C:\Program Files\PostgreSQL\17\bin\psql.exe" \
  "postgresql://hedge_user:...@dpg-...render.com/hedge"
```

### Branches and deploys

- `master` → production (Render backend auto-deploy, Vercel frontend auto-deploy)
- `dev` → preview (hedgecore-preview + hedgecore-preview-db)
- `feat/*`, `fix/*`, `hardening/*` → CI runs, no auto-deploy

### CI hard gates (must be green before merge)

1. Backend (Python 3.12) — pytest with 70% coverage minimum
2. Frontend (Node 20) — `tsc --noEmit` + `next build`
3. Architecture Governance — freeze and ADR checks
4. Secret scan (gitleaks)
5. Docker build

Advisory jobs (do not block): `Backend Postgres tests`, `E2E (Playwright)`, `E2E Smoke (Playwright)`.

### Rollback

- Backend: Render dashboard → Deploy → select previous commit
- Frontend: Vercel dashboard → Deployments → redeploy previous
- Database: no auto-rollback. `alembic downgrade -1` if the migration supports it; otherwise restore from Render's PITR snapshot

---

## 11. Pointers for first-time agents

If you are loading this project for the first time in a session:

1. Read `.claude/state/CURRENT_STATE.md` for the active arc and last sessions
2. Read `.claude/state/CURRENT_SPRINT.md` for sprint scope
3. Read `.claude/state/OPEN_RISKS.md` for live risks
4. Verify auto-memory: `~/.claude/projects/D--Synexiun-1-SynexFund-ORDR-TreasuryFX/memory/MEMORY.md`
5. Check `git log --oneline -10` for recent landings
6. Confirm CI health: `gh run list --limit 3 --branch master`

When in doubt, the canon files in `docs/architecture/` are authoritative over anything in `.claude/state/`, which is authoritative over anything in this CLAUDE.md.
