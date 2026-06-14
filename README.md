# ORDR Treasury

**Institutional FX hedge calculation, governance, and audit platform.**

> Deterministic hedge sizing against a frozen R1–R8 risk taxonomy, routed through a
> tri-state 4-eyes governance pipeline, and sealed in a per-tenant, SHA-256 hash-chained
> WORM audit trail. One platform from raw exposure to regulator-ready record.

<!-- Verified against source on 2026-06-13 -->

| | |
|---|---|
| **Engine** | 60 deterministic modules (46 kernel + 14 orchestrator) · no ML, no auto-learning |
| **Backend** | 90 API route modules · 51 ORM models · 65 Alembic migrations |
| **Tests** | 5,514 passing / 160 skipped (PostgreSQL-only) · 70% coverage gate in CI |
| **Governance** | RBAC 9 roles × 63 permissions · WORM + hash chain · 18 ADRs · v1 frozen |
| **Status** | Production (`master`) · backend on Render · frontend on Vercel |

---

## Table of Contents

1. [What it is](#what-it-is)
2. [Platform capabilities](#platform-capabilities)
3. [Architecture](#architecture)
4. [Repository layout](#repository-layout)
5. [Quick start (local dev)](#quick-start-local-dev)
6. [Core concepts](#core-concepts)
7. [Key API endpoints](#key-api-endpoints)
8. [Security](#security)
9. [Testing](#testing)
10. [Deployment](#deployment)
11. [Architecture freeze & governance](#architecture-freeze--governance)
12. [Documentation map](#documentation-map)

---

## What it is

ORDR Treasury is a multi-tenant SaaS platform for **corporate and group treasury teams** that
need to hedge FX exposure and **prove every decision to an auditor or regulator**. It replaces the
spreadsheet-and-email workflow that most treasuries run on with a single system where:

- exposures are ingested, netted, and sized by a **deterministic engine** — same inputs, same hedge, every time;
- nothing reaches the ledger without an **independent second signature** (4-eyes, Separation of Duties);
- every run, policy revision, and approval is **append-only and tamper-evident** by construction of the database, not the goodwill of the application;
- hedge-accounting effectiveness (IFRS 9 / ASC 815) and trade-reporting obligations (EMIR, MiFID II, Dodd-Frank) are modelled against the artifacts each regime actually demands.

The v1 architecture is **frozen**: no machine learning, no auto-learning, no broker execution, and no
stateful decision logic. Determinism and auditability are the product.

---

## Platform capabilities

The platform spans **~86 product pages** and 90 backend route modules across the full hedge lifecycle.

### Exposure & hedging
- **Position desk** — ingest positions from ERP, FX feeds, CSV, or manual entry; net by currency, tenor, and entity. Lifecycle: `NEW → POLICY_ASSIGNED → READY_TO_EXECUTE → HEDGED | REJECTED`.
- **Deterministic hedge engine** — pure-function kernel sizes hedges against the frozen R1–R8 taxonomy and the strategy-to-instrument map. Fail-closed input validation rejects bad data before it reaches a calculation.
- **Hedge templates** — reusable, policy-bound hedge blueprints.
- **Natural hedging** — offset AR/AP per currency before sizing a single derivative.
- **Pre-trade TCA** — transaction-cost analysis with post-trade reconciliation and accuracy reporting.

### Cash & liquidity
- **Cash positions** — group treasury cash dashboard across legal entities and banks.
- **Cash-flow forecasting** — 13-week and 12-month projections, recurring-item expansion, scenario shifts, liquidity-gap detection, and variance vs. snapshot.
- **Cash pooling & intercompany netting** — sweep configuration and netting-matrix settlement optimization.
- **Bank connections & statements** — account registry, statement import, and auto-reconciliation.
- **Payments** — paper-mode payment initiation with 4-eyes approval and SWIFT / pain.001 message generation.

### Debt & interest-rate risk
- **Debt portfolio** — facilities, drawdowns, covenants, and a maturity calendar.
- **IR risk** — interest-rate swaps and swaptions with MTM, a DV01 ladder, and IFRS 9 hedge-effectiveness testing.

### Counterparty
- **Counterparty hub** — credit limits, potential-future-exposure (PFE) tracking, and limit-breach detection at ≥80% / 100% thresholds.

### Governance & audit
- **Tri-state pipeline** — `SANDBOX → STAGING → LEDGER` with maker/checker control and Separation of Duties.
- **WORM audit vault** — `audit_events`, `calculation_runs`, and `policy_revisions` are append-only; a per-tenant SHA-256 hash chain makes every record provable.
- **Audit Lab** — forensic FX cost analysis: quantify bank markup, fees, and unhedged variance from uploaded data; compare runs; immutable activity log; trend analysis.
- **Lineage** — multi-level provenance graph from market data to ledger entry.

### Compliance & reporting
- **Regulatory submissions** — EMIR / MiFID II / Dodd-Frank trade-reporting submission lifecycle.
- **Hedge-accounting compliance** — IFRS 9 and ASC 815 effectiveness testing, at-risk monitoring near the 0.80 / 1.25 boundary, and committee packs.
- **Report Studio** — 35 institutional report presets across 11 categories (board, risk committee, policy, execution, scenario, compliance, multi-currency), exportable as PDF, Excel, or a ZIP committee pack.

### Intelligence (advisory only)
- **AI query & commentary** — natural-language treasury queries and report-commentary drafting via the Anthropic API. Advisory by contract (ADR-0014): the AI **never writes to WORM tables**. CMD+K global overlay; prompt hashes stored, never raw prompts.

### Integrations
- **ERP / accounting** — connector framework with five providers: QuickBooks, Xero, NetSuite, Sage Intacct, Dynamics 365. GL posting currently runs in **paper mode** (journals generated and validated end-to-end, ready for live per-tenant credentials).
- **Market data** — live FX feed with snapshot WORM storage (forward curves, volatility, equity).
- **SSO** — WorkOS-backed enterprise single sign-on.

---

## Architecture

```
backend/    Python 3.12 · FastAPI 0.121 · Starlette 0.49 · SQLAlchemy async · Alembic 1.18 · asyncpg
frontend/   Next.js 15.5 (App Router) · React 19.1 · TypeScript 5.9
database    PostgreSQL 17 · Row-Level Security FORCED on tenant-scoped tables
```

### The engine (frozen v1)

| Layer | Path | Modules | Role |
|-------|------|---------|------|
| Orchestrator | `backend/app/engine/` | 14 | Coordinates a run: exposure → risk classification → strategy → sizing → audit bundle |
| Kernel | `backend/app/engine_v1/` | 46 | Pure deterministic functions: hedge kernel, validators, scenarios, IR/swap valuation, hash chain |

No non-deterministic logic may enter `engine_v1/`, and the validator may never be bypassed. Both rules
are enforced by the architecture freeze (see [below](#architecture-freeze--governance)).

### Middleware order (never reordered)

```
Audit  →  Rate Limit  →  Auth
```

### Deployment

| Service | Provider | URL |
|---------|----------|-----|
| Frontend (product) | Vercel | `ordr-treasury.vercel.app` |
| Backend API | Render.com | `hedgecore.onrender.com` |
| Database | Render PostgreSQL | managed instance |
| Marketing site | Vercel | `ordr-terminal.vercel.app` *(separate repo)* |

> `hedgecore.vercel.app` 307-redirects to `ordr-treasury.vercel.app` (canonical product URL).

---

## Repository layout

```
backend/
  app/
    api/routes/      90 FastAPI route modules (v1_*.py)
    engine/          14 orchestrator modules
    engine_v1/       46 deterministic kernel modules
    models/          51 SQLAlchemy ORM models
    connectors/      ERP connector framework + 5 providers
    core/            db, security, dependencies, RLS context
    middleware/      audit / rate-limit / auth / governance
    services/        business orchestration
    schemas_v1/      Pydantic v2 request/response contracts
  migrations/        65 Alembic migrations
  tests/             pytest suite (5,514 passing)
frontend/
  src/app/           Next.js App Router (~86 pages + marketing landing at /)
  src/components/     AppSidebar, widgets, pipeline providers, intelligence
  src/lib/            api clients, auth context, widget registry
docs/                architecture canon, ADRs, runbooks, compliance, sales
.claude/             operating framework: rules, agents, skills, state
infra/               deployment manifests
mcp-server/          standalone market-data MCP server (auxiliary)
```

---

## Quick start (local dev)

### Prerequisites
- Python 3.12+
- Node.js 20+
- PostgreSQL 17 (or run against SQLite for the fast test loop)

### Backend
```bash
cd backend
pip install -r requirements.txt
export DATABASE_URL="postgresql+asyncpg://user:pass@localhost:5432/hedge"
export JWT_SECRET="<at least 32 characters>"
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm ci
# frontend/.env.local:
#   NEXT_PUBLIC_API_URL=http://localhost:8000/api
npm run dev
```

### Seed a demo tenant
```bash
cd backend
python seed_company.py     # demo company + demo/demo user + 9 seeded roles
```

Swagger UI: `http://localhost:8000/docs`

---

## Core concepts

### Position lifecycle
```
NEW → POLICY_ASSIGNED → READY_TO_EXECUTE → HEDGED | REJECTED
```

### Tri-state governance pipeline
```
SANDBOX (calculation_runs) → STAGING (staging_artifacts) → LEDGER (ledger_entries)
```
The maker of a proposal is structurally barred from approving it (Separation of Duties).

### WORM audit & hash chain
`audit_events`, `calculation_runs`, and `policy_revisions` are append-only — no UPDATE, no DELETE — at
the database level. Each record commits the SHA-256 of the previous one, per tenant, from a fixed genesis
(`GENESIS_HASH = 64 × '0'`). Alter any record and every downstream hash fails verification.

### R1–R8 risk taxonomy (frozen)
Transaction · Translation · Economic · Contingent · Pre-transaction · Operating · Tax · Competitive.
Each risk class maps to a strategy and a permitted instrument set; the mapping is part of the frozen v1 contract.

---

## Key API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/auth/login` | JWT access + refresh tokens |
| GET | `/api/v1/auth/me` | Current user + roles + permissions |
| GET | `/api/v1/dashboard/aggregate` | KPIs + recent runs + pending approvals |
| GET | `/api/v1/positions` | List positions (RLS-scoped) |
| POST | `/api/v1/runs` | Run a hedge calculation (returns hash-chained envelope) |
| GET | `/api/v1/runs/{id}` | Retrieve a calculation result |
| POST | `/api/v1/proposals` | Submit an execution proposal into the pipeline |
| GET | `/api/v1/tca/...` | Pre-trade transaction-cost analysis |
| GET | `/api/v1/cash/forecast` | Cash-flow forecast (13w / 12m) |
| GET | `/api/v1/counterparties` | Counterparty exposure & limits |
| POST | `/api/v1/reports/...` | Generate a Report Studio preset |

Full contract: `http://localhost:8000/docs` and `docs/architecture/API_CONTRACTS.md`.

---

## Security

Verified against `backend/app/core/security.py` and `backend/app/services/api_keys.py`.

- **Passwords** — bcrypt (per-password salt).
- **API keys** — `HK_live_{keyid}.{secret}` format; the secret is HMAC-SHA256'd with a server-side pepper, then **Argon2id**-hashed at rest and verified in constant time. Route usage is allow-listed at startup.
- **JWT** — HS256, 30-minute access + 7-day refresh; `JWT_SECRET` must be ≥ 32 chars; production rejects dev defaults.
- **CSRF** — double-submit cookie + `X-CSRF-Token` header on mutations (JWT Bearer requests are exempt).
- **RBAC** — 9 roles × 63 permissions, hierarchy levels 0–15, fail-closed (a missing permission is denied, never defaulted).
- **Separation of Duties** — the same user cannot make *and* check an execution proposal.
- **Forced Row-Level Security** — PostgreSQL RLS is FORCED on tenant-scoped tables; a request without a tenant context returns zero rows. Two startup guards (`assert_api_key_routes_safe`, `assert_routes_have_canonical_auth`) block deployment if any route could bypass tenant injection.
- **WORM + hash chain** — append-only audit tables; per-tenant, genesis-anchored SHA-256 chain.
- **Rate limiting** — 60 req/min token bucket per principal.
- **Headers** — `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`; CORS is an explicit allow-list per environment (no wildcard in production).
- **Connector tokens** — Fernet `MultiFernet` with zero-downtime key rotation via `CONNECTOR_ENCRYPTION_KEY`, independent of `JWT_SECRET`.

Vulnerability disclosure: see [`SECURITY.md`](SECURITY.md). Operational procedures: `docs/ops/runbook.md`.

---

## Testing

```bash
# Backend — full suite (SQLite fast loop)
cd backend
JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
  DATABASE_URL="sqlite+aiosqlite://" \
  python -m pytest tests/ -x -q --tb=short

# Backend — route-layer smoke (fast)
python -m pytest tests/test_routes_smoke.py -q

# Frontend — type check + build
cd frontend
npx tsc --noEmit
npx next build

# E2E smoke (44 Playwright tests)
npx playwright test --project=smoke
```

Current baseline: **5,514 passed / 160 skipped / 0 failed** on SQLite. CI coverage gate: 70% minimum
(target 75%+). The `requires_postgres` marker auto-skips PostgreSQL-only tests on SQLite.

---

## Deployment

`master` is production and auto-deploys (Render backend, Vercel frontend). `dev` is the preview
environment; `feat/*`, `fix/*`, and `hardening/*` run CI without deploying.

### CI hard gates (must be green before merge)
1. Backend (Python 3.12) — pytest with 70% coverage minimum
2. Frontend (Node 20) — `tsc --noEmit` + `next build`
3. Architecture Governance — freeze & ADR checks
4. Secret scan (gitleaks)
5. Docker build

Advisory (non-blocking): Backend Postgres tests, E2E (Playwright), E2E Smoke.

### Required environment variables
- **Backend**: `DATABASE_URL`, `JWT_SECRET` (≥ 32 chars), `ENV`, `CORS_ALLOW_ORIGINS`
- **Frontend**: `NEXT_PUBLIC_API_URL`

### Rollback
- **Backend**: Render dashboard → Deploy → select previous commit.
- **Frontend**: Vercel dashboard → Deployments → redeploy previous.
- **Database**: no auto-rollback; `alembic downgrade -1` if the migration supports it, else restore from PITR.

---

## Architecture freeze & governance

The v1 architecture is **frozen**. The following are immutable without an Architecture Decision Record:

1. No ML, auto-learning, broker execution, or stateful decision logic.
2. R1–R8 risk taxonomy and the strategy-to-instrument mapping.
3. Middleware order `Audit → Rate Limit → Auth`.
4. WORM semantics on `audit_events`, `calculation_runs`, `policy_revisions`.
5. SHA-256 hash chain, per-tenant, `GENESIS_HASH = 64 × '0'`.

Files listed in `.claude/rules/architecture.md` (the engine kernel, validators, audit hash chain, WORM
models, and `core/security.py`) require an ADR in `docs/architecture/adr/` to modify. There are 18 ADRs
(numbered through 0021); the next number is 0022.

---

## Documentation map

| Topic | Path |
|-------|------|
| Architecture freeze (canonical) | `docs/architecture/architecture-freeze.md` |
| Engine truth table | `docs/architecture/ENGINE_TRUTH_TABLE.md` |
| API contracts | `docs/architecture/API_CONTRACTS.md` |
| DB schema canon | `docs/architecture/DB_CANON.md` |
| System boundaries | `docs/architecture/SYSTEM_BOUNDARIES.md` |
| Threat model | `docs/architecture/threat-model.md` |
| ADR directory | `docs/architecture/adr/` |
| Operations runbook | `docs/ops/runbook.md` |
| Product guide | `docs/guides/product-guide.md` |
| Trust center | `docs/trust-center/` |
| Project constitution (agents) | `CLAUDE.md` |

---

© 2026 Synexiun · ORDR Treasury. Institutional FX hedge governance.
