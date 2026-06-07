# ORDR TreasuryFX — Comprehensive Launch-Readiness Audit
**Date:** 2026-05-29  
**Auditor:** Multi-role product architect, principal engineer, security reviewer, UI/UX auditor, database architect, API reviewer, QA lead, launch-readiness consultant  
**Repo:** `D:\Synexiun\1-SynexFund\ORDR TreasuryFX`  
**Branch audited:** `master` @ `48a8734` (per `CURRENT_STATE.md`)  
**Rule:** No source code modified. Every claim cites file paths or observable state.

---

## 1. EXECUTIVE SUMMARY

### What this product is
ORDR TreasuryFX ("ORDR Terminal") is an **institutional FX hedge calculation and governance platform**. It provides:
- Deterministic hedge calculations with a tri-state pipeline (SANDBOX → STAGING → LEDGER)
- 4-eyes approval workflow (maker + separate checker)
- WORM (Write-Once-Read-Many) audit trail with SHA-256 hash chaining
- Role-based access control (9 roles, 41 permissions)
- Treasury suite: cash positions/forecast, debt & IR risk, counterparty scoring, pre-trade TCA
- Accounting/ERP connectors (QuickBooks, Xero, NetSuite, Sage Intacct, Dynamics 365)
- Intelligence tier (Anthropic AI advisory queries)
- Regulatory submissions & hedge effectiveness (IFRS 9 / ASC 815)

### Current Maturity Level
**Demo-ready, not beta-ready.** The codebase is large (~412 backend Python files, ~780 frontend TS/TSX files, 121 pages, 89 route modules, 5514 passing tests), architecturally opinionated, and heavily guarded (RLS, WORM, startup guards, canonical-auth enforcement). However, **~35+ frontend routes return `null` (blank screens)**, **the Dockerfile healthcheck is broken** (`/health` instead of `/api/health`), **~40 database tables exist only in raw DDL** (`_ensure_tables()`) and not in Alembic migrations, and **operational monitoring is incomplete**.

### Launch-Readiness Verdict
**Demo-ready only. Not soft-launch ready.**

The core calculation engine, auth stack, and audit trail are production-grade. However, the frontend has **~35 empty pages** navigable from the sidebar, **multiple pages with faked/mock data presented as real**, a **broken Docker healthcheck** that would cause container restart loops, and **massive schema drift** between Alembic and raw DDL. These are not polish issues — they are structural and operational defects that would destroy user trust and operational stability.

### Biggest Strengths
1. **Extensive test coverage:** 5514 backend tests passing, 70% coverage hard gate, mypy strict on `engine_v1/`, 75 frontend jest suites green.
2. **Architectural discipline:** Frozen v1 architecture (no ML, no broker execution), ADR process (20 accepted ADRs), canonical auth/RLS startup guards.
3. **Security depth:** Row-level security (RLS) forced on tenant tables, WORM tables with PG triggers, SHA-256 hash chain, Argon2id+pepper API keys, CSRF double-submit cookies.
4. **Domain completeness:** 89 route modules covering FX hedging, treasury, accounting, compliance, risk analytics, and regulatory reporting.
5. **State management:** SQLite memory DB, risk register (`OPEN_RISKS.md`), sprint tracking (`CURRENT_SPRINT.md`), and AI changelog.

### Biggest Risks
1. **~35 frontend pages return `null`** — users navigate to blank screens (`/debt`, `/ir-risk`, `/counterparties`, `/pre-trade-tca`, `/intelligence`, `/payments`, `/settlement`, `/gl-postings`, etc.).
2. **Broken Dockerfile healthcheck** — `backend/Dockerfile` uses `/health` (404) instead of `/api/health`. Container will restart-loop in Docker/K8s.
3. **Massive schema drift** — `_ensure_tables()` in `main.py` contains ~1,700 lines of raw DDL creating ~40 tables NOT in Alembic. The baseline migration is a no-op stamp.
4. **Missing Alembic model imports** — `migrations/env.py` missing ~25 model imports. `alembic revision --autogenerate` would generate destructive drop/create migrations.
5. **Mock/faked data presented as real** — `/database-connection` fakes a "Test Connection" success, `/status` shows static "99.98%" uptime, `/polisophic` is entirely hardcoded.
6. **RISK-OPS-MON-01 (HIGH/Open):** No Sentry 5xx alert rule, no Render auto-rollback. Already caused a 3-day silent production outage (2026-05-13 → 2026-05-16).
7. **Empty infrastructure artifacts** — `infra/k8s/backend.yaml`, `infra/k8s/frontend.yaml`, `infra/terraform/main.tf` are all 0 bytes.
8. **In-process scheduler risk** — APScheduler cron jobs lost on crash/redeploy.
9. **Render.yaml / config mismatch** — `OPENAI_API_KEY_V` in `render.yaml` but `config.py` expects `OPENAI_API_KEY`.
10. **Live ERP credentials absent** — all posting adapters run in paper mode (RISK-ERP-01).

### Top 10 Things Blocking a 10/10 Product
1. **Fix or hide ~35 empty frontend pages** — currently navigable blank screens
2. **Fix Dockerfile healthcheck path** — `/health` → `/api/health`
3. **Reconcile schema drift** — migrate `_ensure_tables()` DDL into proper Alembic baseline
4. **Add missing model imports to `migrations/env.py`**
5. **Label or remove mock/faked data pages** — `/database-connection`, `/status`, `/polisophic`
6. **Operational monitoring dashboard** — Sentry 5xx rule + Render auto-rollback (RISK-OPS-MON-01)
7. **Wire Sentry DSN + fix `OPENAI_API_KEY` env mismatch**
8. **Empty infra artifacts** — delete or populate K8s/Terraform files
9. **E2E CI promotion** — only 2 genuine E2E specs for 80+ routes
10. **Live ERP credentials & end-to-end posting verification** (RISK-ERP-01)

---

## 2. REPOSITORY ARCHITECTURE

### Folder Structure
```
backend/     Python 3.12, FastAPI 0.121, SQLAlchemy async, Alembic, asyncpg
frontend/    Next.js 15.5 (App Router), React 19.1, TypeScript 5.9, Tailwind v4
docs/        Architecture ADRs, runbooks, compliance docs, incident post-mortems
infra/       Docker, k8s (EMPTY), nginx, Terraform (EMPTY)
scripts/     CI helpers, render deploy scripts, secret scrub
mcp-server/  Separate Python MCP server
.claude/     Agent rules, skills, state (SQLite), memory
```

### Monorepo or Single App
**Poly-repo layout within a single Git repository.** Backend and frontend are fully separate apps with independent build systems, package managers (`pip` vs `npm`), and deployment targets (`Render` vs `Vercel`). They share only API contracts and documentation.

### Separation of Concerns
| Layer | Quality | Evidence |
|-------|---------|----------|
| Routes | Strong | `backend/app/api/routes/*.py` — 89 files, ~450+ endpoints, each scoped to a domain |
| Services | Strong | `backend/app/services/*.py` — 72 files, business logic isolated from HTTP |
| Models | Strong | `backend/app/models/*.py` — 52 files, ORM entities with relationships |
| Schemas | Moderate | `backend/app/schemas_v1/*.py` — 24 files; some schemas inline in routes |
| Frontend pages | **Weak** | `frontend/src/app/**/page.tsx` — 121 pages; **~35 return `null`** |
| Components | Strong | `frontend/src/components/` — 343 TSX files |
| API client | Moderate | `frontend/src/lib/*Client.ts` — per-domain clients exist but consistency varies |

### Naming Consistency
- Backend: `snake_case` files, `PascalCase` classes, `v1_` prefix on route files. Generally consistent.
- Frontend: `camelCase` files, `PascalCase` components. Mixed conventions in `lib/` (`api.ts` vs `cashClient.ts` vs `position-desk.ts`).

### Dependency Management
- Backend: `requirements.txt` with exact pins (good). 81 lines including `argon2-cffi`, `cryptography`, `fastapi`, `sqlalchemy`, `asyncpg`.
- Frontend: `package.json` with caret ranges (moderate risk). Key deps: `next@15.5.12`, `react@19.1.0`, `echarts@6.0.0`, `recharts@2.15.3`, `zod@4.1.12`, `@sentry/nextjs@10.47.0`.
- Lock files: `package-lock.json` present and regenerated (commit `52e7e3a`). No `yarn.lock` or `pnpm-lock.yaml`.

### Configuration Quality
- `backend/app/core/config.py` — pydantic-settings with Vault/AWS SM fallback, secret validators, test-stable defaults.
- `.env.example` at repo root (53 lines, incomplete).
- `backend/.env.example` (79 lines, still missing many critical vars).
- `render.yaml` — IaC for Render with env group references.
- `vercel.json` — frontend deployment config.
- **Weakness:** Some env vars have hardcoded fallbacks in frontend. `.env.example` missing `ALLOWED_IPS`, `RATE_LIMIT_ENABLED`, `API_KEY_PEPPER`, `SENTRY_DSN`, `REDIS_URL`, `CONNECTOR_ENCRYPTION_KEY`, `WORKOS_API_KEY`, `OPENAI_API_KEY`, `TWELVEDATA_API_KEY`.

### Environment Handling
- 4 environments: `test` (SQLite), `dev` (local PG), `staging` (Render preview), `production` (Render).
- `ALLOW_SQLITE_DEMO=true` permits SQLite in dev.
- CORS origins explicitly whitelisted in `render.yaml` and `VercelPreviewCORSMiddleware`.
- **Risk:** `backend/.env` and `frontend/.env.local` exist on disk (untracked but present).

### Scalability of Architecture
- Backend is stateless; Redis used for rate-limiting and OAuth state (fail-open by design).
- Database is PostgreSQL 17 with RLS; connection pool size 20.
- File upload uses local temp (`/tmp`) — will not scale to multi-instance without shared storage or object storage.
- No CDN configuration for static assets (relies on Vercel's edge).
- No horizontal auto-scaling config in `render.yaml`.
- **Risk:** In-memory rate limiting fallback is per-process — ineffective for multi-node Render deployments.

### Architecture Scores

| Category | Score | Evidence | Strengths | Weaknesses | Fixes for 10/10 |
|----------|-------|----------|-----------|------------|-----------------|
| Architecture | **6/10** | 89 route modules, 72 services, 52 models, 20 ADRs | Domain-driven modular design, frozen v1 scope, ADR discipline | Poly-repo without shared packages, no API versioning beyond `v1`, file upload not cloud-native, empty infra artifacts | Add shared types package, add object storage abstraction, delete or populate empty K8s/Terraform files |
| Maintainability | **6/10** | 5514 tests, ruff lint, mypy strict on engine_v1, pre-commit config | Strong test baseline, lint gates, documented gotchas | `any`-type sweep incomplete, ~35 empty frontend pages, 65 migrations with defensive guards, raw DDL in main.py | Complete `any` sweep, hide empty pages, refactor migration chain, remove raw DDL from main.py |
| Modularity | **8/10** | Per-domain clients, per-domain route files, connector registry pattern | Clear module boundaries, registry pattern for ERP connectors | Some frontend pages mix data fetching and presentation, no strict BFF layer, duplicate session factory | Extract data-fetching hooks from pages, delete `core/session.py` duplicate |
| Developer Experience | **6/10** | `uvicorn --reload`, `next dev`, seed scripts, `alembic` commands, CI hard gates | Fast local dev, seeded demo data, documented build steps | E2E tests require running dev server, no `Makefile` or `taskfile`, wrong Docker healthcheck, Windows-specific psql path in docs | Add `Makefile`/`justfile`, fix Docker healthcheck, containerize full dev stack |

---

## 3. BACKEND AUDIT

### Framework and Entry Points
- **Framework:** FastAPI 0.121.0 + Starlette 0.49.1
- **Entry:** `backend/app/main.py` (2628 lines) — lifespan-managed startup with `_ensure_tables()` (~1,700 lines raw DDL), `run_alembic_upgrade()`, scheduler init, and two startup guards (`assert_api_key_routes_safe`, `assert_routes_have_canonical_auth`).
- **ASGI:** uvicorn, gunicorn in Docker.

### API Routes/Controllers
89 route files registering ~450+ endpoints. Key modules:

| Module | Purpose | Files | Connected APIs | DB Usage | Frontend Usage | Score | Gaps | Fixes |
|--------|---------|-------|---------------|----------|---------------|-------|------|-------|
| Positions | CRUD + lifecycle + bulk import | `v1_positions.py` (14 routes) | Full | `positions` (RLS) | `/position-desk` | 8/10 | No counterparty FK on Position ORM (v1 freeze) | Add counterparty_id in v1.5 |
| Calculation | Hedge engine runs | `v1_calculate.py` (4), `v1_calculate_multi.py` (1) | Full | `calculation_runs` (RLS), `staging_artifacts` | `/calculate`, `/run-viewer` | 9/10 | None major | — |
| Dashboard | KPIs, recent runs, approvals | `dashboard.py` (7 routes) | Full | `positions`, `calculation_runs` | `/dashboard` | 8/10 | Was RLS-bypassed (fixed); aggregate queries may be slow at scale | Add materialized views for aggregates |
| Execution Proposals | 4-eyes SoD workflow | `v1_execution_proposals.py` (13) | Full | `execution_proposals` | `/staging`, `/staging/[id]` | 9/10 | None major | — |
| Cash Forecast | 13w/12m forecasting | `v1_cash_forecast.py` (9) | Full | `cash_forecast_items`, `cash_forecast_snapshots` | `/cash-forecast` | 8/10 | None major | — |
| Debt | Facilities, drawdowns, covenants | `v1_debt.py` (8) | Full | `debt_facilities`, `drawdowns`, `covenants` | `/debt` (returns `null` ⚠️) | 7/10 | Frontend page empty | Build `/debt` page |
| IR Risk | Swap valuation, DV01 | `v1_ir_risk.py` (7) | Full | `ir_swaps`, `vol_snapshots`, `hedge_runs` | `/ir-risk` (returns `null` ⚠️) | 7/10 | Frontend page empty | Build `/ir-risk` page |
| Counterparty | Scoring + credit limits | `v1_counterparty.py` (9) | Full | `counterparties`, `credit_limits` | `/counterparties` (returns `null` ⚠️) | 7/10 | Frontend page empty | Build `/counterparties` page |
| TCA | Pre-trade cost estimates | `v1_tca.py` (6) | Full | `transaction_cost_estimates` (WORM) | `/pre-trade-tca` (returns `null` ⚠️) | 7/10 | Frontend page empty | Build `/pre-trade-tca` page |
| Connectors | ERP framework + 5 providers | `v1_connectors.py` (17) | Full (paper mode) | `connectors`, `company.settings` JSONB | `/connectors/hub` | 7/10 | No live credentials (RISK-ERP-01); NetSuite adapter stubbed | Provision OAuth creds, enable live mode |
| Intelligence | AI advisory queries | `v1_intelligence.py` (4) | Full | `intelligence_query_logs` | `/intelligence` (returns `null` ⚠️) | 6/10 | Frontend page empty | Build `/intelligence` page |
| Bank Connections | TrueLayer/Plaid OAuth | `v1_bank_connections.py` (6) | Partial | `bank_connections` | `/settings/bank-connections` | 5/10 | `exchange_code` and `get_balances` raise `NotImplementedError` | Implement live bank pull |
| Market Data | IBKR forward points | `v1_market_data_live.py` (5) | Partial | `market_snapshots` | `/market` | 6/10 | `_compute_cip_forward_points` returns `0.0` | Implement live CIP forward curve |
| Voice | Voice terminal token + transcript | `v1_voice_token.py`, `v1_voice_transcript.py`, `v1_voice_memory.py` | Partial | Minimal | Unverified | 5/10 | Requires `OPENAI_API_KEY_V`; `/v1/voice/token` returns 503 if missing; `render.yaml` / `config.py` env mismatch | Populate correct env var, add fallback UI |
| Webhooks | Slack/Teams notifications | `v1_webhooks.py` (5) | Full | `webhook_endpoints` | `/settings/notifications` | 8/10 | None major | — |
| Admin | Metrics, config, tenants, users | `v1_admin_*.py` (multiple) | Full | Various | `/admin` | 7/10 | Some admin routes may lack audit logging | Add audit events to all admin mutations |
| Auth | JWT login, refresh, passwordless | `auth.py` (6), `auth_passwordless.py` (2), `v1_mfa.py` (5) | Full | `users`, `refresh_tokens`, `auth_audit_logs` | `/auth/login`, `/auth/logout` | 8/10 | Passwordless path limited; MFA exists but adoption unverified | Complete MFA enforcement policy |
| DevOps | Internal dashboard | `v1_devops.py` (5) | Internal | `.claude/state/memory.db` | None | 3/10 | **Reads local SQLite `memory.db`** — will fail/leak in prod | Guard by env check or remove from production builds |

### Services/Use Cases
72 service files in `backend/app/services/`. Business logic is generally well-isolated.

**Placeholder/Mock/Stub Services:**
| File | Issue | Evidence |
|------|-------|----------|
| `services/market_data/ibkr_provider.py` | `_compute_cip_forward_points` always returns `0.0` | Subagent output line 379 |
| `services/bank_connection_service.py` | TrueLayer/Plaid `exchange_code` and `get_balances` raise `NotImplementedError` | Subagent output line 398 |
| `services/erp_adapters/netsuite.py` | `pull_open_invoices` returns `[]` with log warning | Subagent output line 422 |
| `services/erp_adapters/base.py` | Only Xero has live pull | Subagent output line 421 |
| `engine_v1/swap_valuator.py` | `ACT/ACT` day count raises `NotImplementedError` | Subagent output line 490 |

### Validation
- Pydantic v2 schemas for most endpoints.
- **Gap:** Some admin/devops routes use inline `dict` returns.
- **Gap:** `v1_devops.py` (5 routes) — not all responses typed, reads local files.

### Error Handling
- Structured error handlers in `main.py`: `http_exception_handler`, `validation_exception_handler`, `unhandled_exception_handler`.
- Consistent 4xx/5xx JSON shape enforced.
- **Gap:** Some legacy routes may still return plain strings.
- **Gap:** Frontend has silent `catch { /* noop */ }` blocks (`database-connection/page.tsx`, `portfolio-multi/page.tsx`).

### Auth and Authorization
- **JWT:** HS256, 30-min access / 7-day refresh. `PyJWT` + `python-jose`.
- **Password:** Argon2id + pepper (upgraded from bcrypt in `fbc1eb1`).
- **RBAC:** 9 roles, 41 permissions, hierarchy levels 0–15. `Role`, `Permission`, `RolePermission` models.
- **API Keys:** `HK_live_` prefix, HMAC-SHA256 hashed in DB. Argon2id verification.
- **CSRF:** Double-submit cookie enabled (`CSRFMiddleware`).
- **Rate Limiting:** `RateLimitMiddleware` + `slowapi`. **In-memory fallback is per-process** — ineffective for multi-node Render.
- **RLS:** Tenant context injected via `TenantRLSAsyncSession`. Force RLS on `positions` and `calculation_runs` (migration 0036).
- **Startup Guards:**
  1. `assert_api_key_routes_safe` — blocks API-key auth on business routes
  2. `assert_routes_have_canonical_auth` — every route must have `get_current_user` or `get_api_key_principal` or be allowlisted

### Middleware Stack (Canonical Order)
`AuditHeadersMiddleware` → `RateLimitMiddleware` → `IPAllowlistMiddleware` → `CORSMiddleware` → `VercelPreviewCORSMiddleware` → `CSRFMiddleware` → `IdempotencyMiddleware` → `APIKeyAuthMiddleware` → `GZipMiddleware`

### Background Jobs / Workers
- `AsyncIOScheduler` in `main.py` lifespan.
- Cron jobs: hash-chain verify (02:30 UTC), GDPR anonymize (01:00 UTC), market data scheduler, audit cleanup.
- **Risk:** APScheduler runs **in-process**. If backend crashes or redeploys, all scheduled jobs are interrupted. No external scheduler (Celery Beat, RQ Scheduler) used for main app jobs.

### External Integrations
- **Market Data:** Finnhub (`FINNHUB_API_KEY`), TwelveData, yfinance, IBKR (`ib_insync`). **IBKR forward points stubbed (`0.0`).**
- **AI:** Anthropic (`ANTHROPIC_API_KEY`), OpenAI Realtime (`OPENAI_API_KEY_V` — **mismatch with `config.py`**).
- **ERP:** QuickBooks, Xero, NetSuite, Sage Intacct, Dynamics 365 (all in paper mode; NetSuite pull stubbed).
- **Banking:** TrueLayer, Plaid (OAuth init works; live pull raises `NotImplementedError`).
- **Auth:** WorkOS (`WORKOS_API_KEY`, `WORKOS_CLIENT_ID`) — SSO.
- **Payments:** Stripe (`STRIPE_SECRET_KEY`).
- **Monitoring:** Sentry (`SENTRY_DSN`) — DSN may be unconfigured in prod (RISK-OPS-MON-01).

### Logging & Observability
- Structured JSON logging via `structlog` + `sentry_config.py`.
- Sentry SDK integrated with FastAPI.
- **Gap:** No 5xx alert rule (RISK-OPS-MON-01). No Render auto-rollback. No custom metrics dashboard.

### Security Posture
- Strong on auth, RLS, WORM, hash chain, input validation, CSRF, CORS whitelist.
- **Gap:** API-key path does not inject tenant RLS context (mitigated by startup guard, not fixed structurally).
- **Gap:** `v1_devops.py` reads `.claude/state/memory.db` — could leak internal state in production.
- **Gap:** Empty security files (`app/security/auth.py`, `app/security/jwt.py`) — harmless but confusing.
- **Gap:** Audit middleware uses `jose.jwt` while rest of app uses `jwt` (PyJWT) — minor inconsistency.

### Performance Bottlenecks
- Dashboard aggregate queries (`dashboard.py`) hit `positions` and `calculation_runs` with RLS overhead. No materialized views.
- `engine_v1/` calculations are deterministic but may be CPU-intensive for large portfolios. No async job queue for heavy runs.
- Frontend bundle: 190 kB first load JS (within 200 kB target).

### Missing Backend Capabilities
- Real-time WebSocket market data exists (`v1_ws_market.py`) but coverage unverified.
- No GraphQL layer (intentional per v1 freeze).
- No multi-region deployment config.
- No read-replica routing.

---

## 4. FRONTEND AUDIT

### Framework and Structure
- **Framework:** Next.js 15.5 App Router, React 19.1, TypeScript 5.9.
- **Styling:** Tailwind CSS v4.
- **State:** Redux Toolkit (`authSlice`, `hedgeSlice`, `pipelineSlice`, `terminalSlice`) + React Context (`AuthContext`, `HedgeContext`) + local state.
- **Charts:** ECharts 6 + Recharts.
- **Forms:** Uncontrolled + controlled mix; Zod used for validation in some flows.
- **Icons:** Lucide React.
- **Notable absences:** No `@tanstack/react-query` — raw `fetch`/`axios` with manual loading states. No `@radix-ui/react-dialog` — custom modals throughout.

### Routes / Pages
121 `page.tsx` files across `frontend/src/app/`.

#### Core Application (Connected to APIs)
| Screen/Page | Purpose | Components | API/Data Source | Backend Connected? | UX Quality | Gaps | Fixes |
|-------------|---------|------------|-----------------|-------------------|------------|------|-------|
| `/dashboard` | KPIs, recent runs, pending approvals | Dashboard widgets, charts | `dashboardClient.ts` → `/api/v1/dashboard/aggregate` | ✅ Yes | 8/10 | Aggregate query may be slow; no real-time updates | Add SSE/WebSocket for live KPIs |
| `/position-desk` | Position CRUD + lifecycle | Position table, filters, forms | `positions.ts` → `/api/v1/positions` | ✅ Yes | 8/10 | Mobile table scroll handled | Add bulk action UX improvements |
| `/calculate` | Run hedge calculation | Step wizard, forms | `api.ts` → `/api/hedge/run` | ✅ Yes | 8/10 | Engine catalog uses real endpoint | Add calculation progress indicator |
| `/cash-forecast` | 13w/12m forecast | Tabs: forecast, gaps, variance, items | `cashClient.ts` → `/api/v1/cash-forecast` | ✅ Yes | 7/10 | Complex tab state | Add forecast share/export |
| `/settings/*` | Notifications, bank accounts, GL accounts, legal entities, connectors | Forms, tables | Various `*Client.ts` | ✅ Yes | 7/10 | None major | — |
| `/auth/login` | Login + MFA | Form, autofill fix | `auth.ts` → `/api/v1/auth/login` | ✅ Yes | 8/10 | Theme-aware inputs fixed | Add passwordless UX polish |

#### Pages with Static / Mock / Faked Data ⚠️
| Route | File | Issue |
|-------|------|-------|
| `/polisophic` | `app/polisophic/page.tsx` | **Hardcoded static data** — risk events, scores, scenarios, alerts. Badge says "STATIC DATA". No API calls. Uses local `const C = { pageBg: "#f0f2f7", ... }` |
| `/status` | `app/status/page.tsx` | **Static uptime/status page** — hardcoded "99.98%", no live monitoring API. Uses `const HEX = { green: "#059669", ... }` |
| `/database-connection` | `app/database-connection/page.tsx` | **Mocked discovery** — `mockColumns`, `mockPreview`, `mockPreviewData`, simulated progress bars. "Test Connection" faked with `setTimeout` + `setConnectionStatus("connected")`. Not a real connector. |
| `/portfolio-multi` | `app/portfolio-multi/page.tsx` | Has **FALLBACK_EXPOSURE** demo data. Defaults to "demo" mode. Shows "DEMO" badge when live data absent. |
| `/terminal` | `app/terminal/page.tsx` | Shows "DEMO" mode chip regardless of actual engine state. |

#### Pages with Minimal / Placeholder Content (Return `null`) 🔴
**~35 routes return `null` or are empty shells.** Users can navigate to these via the sidebar but see blank screens:

`/hedge-monitor`, `/trade-history`, `/hedge-effectiveness`, `/gl-postings`, `/settlement`, `/bank-statements`, `/intercompany-netting`, `/cash-positions`, `/ir-risk`, `/debt`, `/counterparties`, `/connectors`, `/erp-integration`, `/accounting-connection`, `/payments`, `/regulatory-submissions`, `/natural-hedging`, `/pre-trade-tca`, `/intelligence`, `/ai-policy-wizard`, `/sandbox`, `/scenario-studio`, `/methodology`, `/lineage`, `/hedgewiki`, `/committee-pack`, `/run-viewer`, `/audit-trail`, `/chart`, `/import-history`, `/ledger`, `/market`, `/signup`

**Evidence:** Subagent frontend audit, lines 523–556.

> **Critical Finding:** `ComingSoon` component exists (`components/ui/ComingSoon.tsx`) but is **not used** in any page route (grep found 0 matches in `app/`).

### Mock / Static Data Usage
- **`/audit-lab/demo`** — explicitly uses fixture data. Documented as demo page.
- **`/polisophic`** — entirely hardcoded static data presented as enterprise-gated feature.
- **`/status`** — static uptime percentages with no live health API.
- **`/database-connection`** — faked connection test with mock data.
- **`/portfolio-multi`** — silent fallback to `FALLBACK_EXPOSURE` demo data.
- **Marketing pages** (`/products/*`, `/solutions/*`, `/welcome`, `/about`) — static content, expected for SaaS.

### Design System Consistency
- Tailwind v4 with custom tokens in `UIUXSRC/tokens/` and `UIUXSRC/theme/`.
- `globals.css` with responsive breakpoints (`--bp-sm/md/lg`).
- `PageShell` full-page layout wrapper — documented gotcha about nesting.
- **Design System Violations:** Many pages define local hardcoded color objects instead of importing canonical tokens `T`:
  - `app/polisophic/page.tsx`: `const C = { pageBg: "#f0f2f7", cardBg: "#ffffff", ... }`
  - `app/status/page.tsx`: Hardcoded hex values (`#166534`, `#DCFCE7`)
  - `app/database-connection/page.tsx`: `const HEX = { cyan: "#1C62F2", green: "#059669", ... }`
  - `app/cash-forecast/page.tsx`: `const C = { white: "#fff", red: "#ef4444", green: "#22c55e" }`

### Mobile / Responsive
- Mobile hamburger sidebar, viewport meta, safe-area insets, 44px touch targets.
- Spot-checked 12 pages; 6 table overflow fixes, 4 flexWrap fixes, 2 modal widths, 8 touch targets.
- **Not fully verified across all 121 pages.**

### Accessibility
- No explicit `axe-core` or Lighthouse CI gate found.
- `quickstart_accessibility.spec.ts` exists in E2E — component-level candidate.
- **Gap:** No systematic a11y audit documented.

### Form UX
- Controlled inputs with validation.
- Zod schemas for some forms.
- **Gap:** Not all forms have inline validation (some validate on submit only).

### E2E Tests
- **Only 2 genuine E2E specs** in `frontend/src/tests/e2e/specs/` (`login.spec.ts`, `hedges.spec.ts`).
- `frontend/e2e/` directory has 52 `.ts` files but many are helper/fixture files or in different directory structure.
- **Critical gap:** No E2E coverage for cash management, forecasts, payments, policy engine, report builder, settings, admin, mobile responsiveness, error states.

---

## 5. FRONTEND ↔ BACKEND CONNECTION MATRIX

| Frontend Feature | File/Route | API Called | Backend Handler | DB Table/Model | Status | Problem | Fix |
|------------------|------------|------------|-----------------|----------------|--------|---------|-----|
| Dashboard KPIs | `/dashboard` | `dashboardClient.ts` → `/api/v1/dashboard/aggregate` | `dashboard.py::aggregate` | `positions`, `calculation_runs` | ✅ Fully connected | None | — |
| Position List | `/position-desk` | `positions.ts` → `/api/v1/positions` | `v1_positions.py::list_positions` | `positions` (RLS) | ✅ Fully connected | None | — |
| Hedge Calculation | `/calculate` | `api.ts` → `POST /api/hedge/run` | `hedge.py::run_hedge` | `calculation_runs` | ✅ Fully connected | None | — |
| Staging Queue | `/staging` | `execution.ts` → `/api/v1/execution-proposals` | `v1_execution_proposals.py::list_proposals` | `execution_proposals` | ✅ Fully connected | None | — |
| Cash Forecast | `/cash-forecast` | `cashClient.ts` → `/api/v1/cash-forecast` | `v1_cash_forecast.py::get_forecast` | `cash_forecast_items` | ✅ Fully connected | None | — |
| Debt Facilities | `/debt` | `debtClient.ts` → `/api/v1/debt` | `v1_debt.py::list_facilities` | `debt_facilities` | ❌ **Frontend exists, page empty** | `/debt/page.tsx` returns `null` | Build debt page |
| IR Risk Swaps | `/ir-risk` | `debtClient.ts` → `/api/v1/ir-risk` | `v1_ir_risk.py::list_swaps` | `ir_swaps` | ❌ **Frontend exists, page empty** | `/ir-risk/page.tsx` returns `null` | Build IR risk page |
| Counterparty Hub | `/counterparties` | `counterpartyClient.ts` → `/api/v1/counterparties` | `v1_counterparty.py::list` | `counterparties` | ❌ **Frontend exists, page empty** | `/counterparties/page.tsx` returns `null` | Build counterparty page |
| Pre-Trade TCA | `/pre-trade-tca` | `tcaClient.ts` → `/api/v1/tca/estimate` | `v1_tca.py::estimate` | `transaction_cost_estimates` | ❌ **Frontend exists, page empty** | `/pre-trade-tca/page.tsx` returns `null` | Build TCA page |
| Connector Hub | `/connectors/hub` | `connectorClient.ts` → `/api/v1/connectors` | `v1_connectors.py::list_status` | `connectors` | ✅ Fully connected | Returns paper mode | Provision live credentials |
| Intelligence | `/intelligence` | `intelligenceClient.ts` → `/api/v1/intelligence` | `v1_intelligence.py` | `intelligence_query_logs` | ❌ **Frontend exists, page empty** | `/intelligence/page.tsx` returns `null` | Build intelligence page |
| GL Postings | `/gl-postings` | `glClient.ts` → `/api/v1/gl` | `v1_gl.py::list_entries` | `journal_entries` | ❌ **Frontend exists, page empty** | `/gl-postings/page.tsx` returns `null` | Build GL postings page |
| Settlement | `/settlement` | `glClient.ts` → `/api/v1/settlement` | `v1_settlement.py::list` | `settlement_events` | ❌ **Frontend exists, page empty** | `/settlement/page.tsx` returns `null` | Build settlement page |
| Payments | `/payments` | `cashClient.ts` → `/api/v1/payments` | `v1_payments.py::list` | `payment_instructions` | ❌ **Frontend exists, page empty** | `/payments/page.tsx` returns `null` | Build payments page |
| Audit Lab Demo | `/audit-lab/demo` | `audit-lab-demo.ts` — fixtures | **None** (static) | N/A | ⚠️ Mock only | Pure demo page | Either connect to real data or clearly label "Demo" |
| Polisophic | `/polisophic` | None — hardcoded | None | N/A | ⚠️ Mock only | Entirely static data | Add persistent "Demonstration Data" banner |
| Status | `/status` | None — hardcoded | None | N/A | ⚠️ Mock only | Static "99.98%" uptime | Connect to live health API or label as static |
| Database Connection | `/database-connection` | None — faked | None | N/A | ⚠️ Mock only | Faked test connection | Implement real probe or show "Simulated Preview" |
| Voice Terminal | Unconfirmed | Unconfirmed | `v1_voice_token.py` | N/A | ❓ Unverified | Requires `OPENAI_API_KEY_V`; env mismatch | Verify UI route and env var |

### Matrix Summary
- **Fully connected:** ~20 core business features
- **Frontend exists but page empty:** ~35 routes (debt, IR risk, counterparties, TCA, intelligence, GL postings, settlement, payments, etc.)
- **Mock only:** 4 (`/audit-lab/demo`, `/polisophic`, `/status`, `/database-connection`)
- **Unverified:** Voice terminal route

---

## 6. API AUDIT

### REST Structure
- All endpoints under `/api/v1/*` (with legacy `/api/*` aliases for some routes).
- 89 route files, ~450+ endpoints.
- No GraphQL, no gRPC.

### Endpoint Consistency
- Naming: plural nouns (`/positions`, `/cash-forecasts`, `/counterparties`).
- Methods: standard REST (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`).
- Lifecycle transitions use `PATCH` (good).

### Request/Response Validation
- Pydantic v2 models for most endpoints.
- **Gap:** Some admin/devops routes use inline `dict` returns.
- **Gap:** `v1_devops.py` (5 routes) — not all responses typed, reads local SQLite.

### Pagination / Filtering / Sorting
- Present on list endpoints (`skip`, `limit`, `sort`, `filter`).
- Not uniformly applied across all 89 route files.

### Authentication
- JWT bearer token on most routes.
- API key (`X-API-Key` header) on diagnostic routes only (enforced by startup guard).
- MFA optional (separate `v1_mfa.py` routes).

### Authorization
- RBAC enforced via `require_permission` dependencies.
- Role hierarchy (0–15) checked in service layer.
- Plan tier gating (`professional`, `enterprise`) on some features.

### Error Contracts
- Structured JSON: `{ "detail": "...", "code": "...", "field": "..." }` (standardized in sprint Phase 2).
- **Gap:** Not all endpoints return the same error schema. Some legacy routes may deviate.

### API Documentation
- FastAPI auto-generates OpenAPI/Swagger at `/docs`.
- `docs/architecture/API_CONTRACTS.md` exists.
- **Gap:** Enterprise procurement may require static API docs.

### API Matrix (Sample)

| Endpoint | Method | Purpose | Request Schema | Response Schema | Used by Frontend? | Tested? | Score | Issues |
|----------|--------|---------|---------------|-----------------|-------------------|---------|-------|--------|
| `/api/v1/auth/login` | POST | JWT issuance | `LoginRequest` | `TokenResponse` | ✅ | ✅ | 9/10 | None |
| `/api/v1/auth/me` | GET | Current user | — | `UserResponse` | ✅ | ✅ | 9/10 | None |
| `/api/v1/dashboard/aggregate` | GET | KPIs | — | `DashboardAggregate` | ✅ | ✅ | 8/10 | May need caching |
| `/api/v1/positions` | GET | List | `PositionFilter` | `List[PositionResponse]` | ✅ | ✅ | 9/10 | None |
| `/api/v1/debt` | GET | List facilities | `DebtFilter` | `List[DebtFacility]` | ❌ (page empty) | ✅ | 8/10 | Frontend not built |
| `/api/v1/ir-risk` | GET | List swaps | `IRSwapFilter` | `List[IRSwap]` | ❌ (page empty) | ✅ | 8/10 | Frontend not built |
| `/api/v1/counterparties` | GET | List | `CounterpartyFilter` | `List[Counterparty]` | ❌ (page empty) | ✅ | 8/10 | Frontend not built |
| `/api/v1/tca/estimate` | POST | Estimate cost | `TCAEstimateRequest` | `TCAEstimateResponse` | ❌ (page empty) | ✅ | 9/10 | Frontend not built |
| `/api/v1/connectors` | GET | Status | — | `List[ConnectorStatus]` | ✅ | ✅ | 7/10 | Paper mode only |
| `/api/v1/intelligence/query` | POST | AI query | `IntelligenceQuery` | `IntelligenceResponse` | ❌ (page empty) | ✅ | 7/10 | Frontend not built |
| `/api/v1/voice/token` | GET | Voice token | — | `VoiceTokenResponse` | ❓ | ❓ | 4/10 | Env mismatch (`OPENAI_API_KEY_V` vs `OPENAI_API_KEY`) |
| `/api/health` | GET | Health check | — | `HealthResponse` | ✅ | ✅ | 8/10 | Upgraded to DB+Redis probe |

---

## 7. DATABASE AUDIT

### Database Type
PostgreSQL 17 (Render) with asyncpg driver. SQLite (`aiosqlite`) used for CI and local dev.

### ORM / Schema
SQLAlchemy 2.0 async ORM. 52 model files.

### Migrations
65 migration files in `backend/migrations/versions/`.
- Head: `0036_force_rls_tenant_context`.
- Single head verified (`alembic heads`).
- Multiple merge heads exist.
- `2026_03_24_baseline_full_schema.py` is a **no-op stamp** — `pass` in `upgrade()`.

### Critical Schema Drift 🔴
**File:** `backend/app/main.py` (lines 367–1734)

The `_ensure_tables()` function contains **~1,700 lines of raw DDL** that creates ~40 tables, indexes, WORM triggers, and `ALTER TABLE` statements that are **NOT reflected in any Alembic migration**.

**Tables created ONLY in `_ensure_tables()` (missing from Alembic chain):**
- `market_snapshots`, `audit_datasets`, `audit_transactions`, `audit_runs`, `audit_findings`, `audit_reports`
- `decision_runs`, `decision_proposals`, `execution_packets`
- `hedge_effectiveness_datasets`, `hedge_effectiveness_runs`
- `support_tickets`, `ticket_events`
- `user_watchlists`, `webhook_endpoints`, `webhook_delivery_logs`
- `import_batches`, `compliance_evidence`, `api_keys`
- `auth_audit_logs` (with custom ENUMs)
- `user_mfa`, `calculation_runs`, `connector_runs`, `connector_run_errors`

**Risk:** If `_ensure_tables()` is removed, production databases will lose the ability to recreate these tables on new environments.

### Missing Model Imports in Alembic env.py 🔴
**File:** `backend/migrations/env.py` (lines 51–84)

Many model modules are **not imported** into the Alembic metadata. `alembic revision --autogenerate` will generate destructive drop/create migrations for existing tables.

**Missing imports include:**
`app.models.bank_statement`, `app.models.cash`, `app.models.cash_forecast`, `app.models.cash_netting`, `app.models.cash_pool`, `app.models.compliance_evidence`, `app.models.counterparty`, `app.models.custom_report_template`, `app.models.debt`, `app.models.equity_snapshot`, `app.models.hedge_template`, `app.models.import_batch`, `app.models.intelligence`, `app.models.ir_risk`, `app.models.journal_entry`, `app.models.ledger`, `app.models.market_data`, `app.models.market_snapshot`, `app.models.options_snapshot`, `app.models.organization`, `app.models.payment`, `app.models.proposal`, `app.models.regulatory_submission`, `app.models.report_schedule`, `app.models.saved_report`, `app.models.settlement_event`, `app.models.support_ticket`, `app.models.transaction_cost_estimate`, `app.models.treasury_transaction`, `app.models.webhook`

### Models / Entities
Key tables:

| Table/Model | Purpose | Used By Backend | Used By Frontend | Relationships | Risks | Score | Fixes |
|-------------|---------|-----------------|------------------|---------------|-------|-------|-------|
| `users` | Auth identity | All | `/auth`, `/settings` | `company`, `refresh_tokens`, `audit_logs` | Schema drift (`ui_preferences`, `token_version`, `is_superuser` added late) | 8/10 | Ensure `_ensure_tables` keeps prod aligned |
| `companies` | Tenant root | All | Implicit (RLS scope) | `users`, `positions`, `calculation_runs` | Schema drift (`stripe_customer_id`, `sso_billing` added late) | 8/10 | Same |
| `positions` | FX positions | `v1_positions.py` | `/position-desk` | `company`, `policy_instances` | RLS forced (0036) | 9/10 | None |
| `calculation_runs` | Hedge runs | `v1_calculate.py` | `/calculate`, `/dashboard` | `company`, `staging_artifacts` | RLS forced (0036), WORM | 9/10 | None |
| `execution_proposals` | 4-eyes queue | `v1_execution_proposals.py` | `/staging` | `company`, `positions` | WORM | 9/10 | None |
| `audit_events` | Hash-chain audit | All mutation paths | `/audit-trail` | `company` | WORM, PG trigger | 9/10 | None |
| `journal_entries` | GL entries | `v1_gl.py` | `/gl-postings` (empty) | `company`, `ledger_entries` | WORM, 5-state machine | 9/10 | Build frontend page |
| `treasury_transactions` | Transaction spine | `v1_payments.py`, `v1_cash_positions.py` | `/payments` (empty), `/cash-positions` (empty) | `company` | WORM, PG trigger | 9/10 | Build frontend pages |
| `debt_facilities` | Debt master | `v1_debt.py` | `/debt` (empty) | `company`, `drawdowns`, `covenants` | WORM | 9/10 | Build frontend page |
| `ir_swaps` | Interest rate swaps | `v1_ir_risk.py` | `/ir-risk` (empty) | `company` | WORM | 9/10 | Build frontend page |
| `counterparties` | Counterparty master | `v1_counterparty.py` | `/counterparties` (empty) | `company`, `credit_limits` | Standard | 8/10 | Build frontend page |
| `transaction_cost_estimates` | TCA estimates | `v1_tca.py` | `/pre-trade-tca` (empty) | `company`, `settlement_events` | WORM | 9/10 | Build frontend page |
| `connectors` | ERP connector state | `v1_connectors.py` | `/connectors/hub` | `company` | Standard | 7/10 | No live creds |
| `intelligence_query_logs` | AI query audit | `v1_intelligence.py` | `/intelligence` (empty) | `company` | Standard | 8/10 | Build frontend page |

### Indexes
- Composite indexes present on heavily queried tables.
- `f81cffe7f9ee` added performance composite indexes.
- **Gap:** No explicit query plan analysis provided.

### Constraints
- Foreign keys with `ON DELETE` rules.
- Unique constraints.
- `CHECK` constraints on enums.
- **Gap:** No explicit `EXCLUDE` constraints for temporal ranges.

### Seed Data
- `seed_company.py` creates DemoCo + demo/demo user.
- `_seed_roles()` in `main.py` creates default roles.
- `_seed_permissions()` populates 41 permissions.

### Audit Fields
- `created_at`, `updated_at` on most tables.
- `created_by`, `updated_by` on some tables.
- **Gap:** Not all tables have `updated_by`.

### Soft Deletes
- Present on `positions` (`deleted_at` column).
- Not uniformly applied.

### Multi-Tenancy
- RLS on `positions` and `calculation_runs`.
- Tenant context via `app.current_tenant_id`.
- **Gap:** Not all tenant-scoped tables have RLS forced.

### Backup / Restore Readiness
- Render provides auto-backups and PITR.
- `pg_backup.sh` and `restore_verify.sh` scripts exist.
- **Gap:** Monthly restore verification not executed.

---

## 8. DATAFLOW ANALYSIS

### Authentication Flow
```
User → /auth/login → auth.py::login → User lookup + bcrypt/Argon2id verify
→ JWT access + refresh tokens → localStorage/cookies
→ Every request: JWT decode → get_current_user → set_tenant_rls_context
→ TenantRLSAsyncSession.execute() injects app.current_tenant_id
→ RLS policy filters rows
```
**Failure points:**
- JWT secret rotation requires logout-all.
- RLS contextvar race conditions (mitigated by startup guards).
- `_resolve_user` deleted (fixed RISK-AUTH-RLS-02).

### Create Position Flow
```
User → /position-desk → POST /api/v1/positions → v1_positions.py::create
→ position_service.create → validate lifecycle (NEW)
→ INSERT positions (RLS auto-filters) → INSERT audit_event (hash chain)
→ return PositionResponse → UI updates
```

### Run Hedge Calculation Flow
```
User → /calculate → POST /api/hedge/run → hedge.py::run_hedge
→ HedgeRequest validation → hedge_service.run_calculation
→ engine_v1 deterministic calculation → INSERT calculation_run (RLS)
→ INSERT staging_artifacts → INSERT audit_event
→ return HedgeRunResponse → /run-viewer
```
**Failure points:**
- Large portfolio calculations are CPU-bound (no job queue).
- Engine v1 is frozen — no ML enhancements permitted.

### 4-Eyes Approval Flow
```
Maker → /staging → POST /api/v1/execution-proposals → create proposal (PENDING_APPROVAL)
→ Checker → /staging/[id] → PATCH /api/v1/execution-proposals/{id}/approve
→ v1_execution_proposals.py::approve → SoD check (maker ≠ checker)
→ UPDATE execution_proposal → INSERT ledger_entry (WORM)
→ INSERT audit_event → return
```

### ERP Posting Flow
```
User → /gl-postings (empty page) → would POST /api/v1/gl/post → gl_posting_service
→ validate APPROVED status → payload.assert_balanced()
→ connector.post_journal(tenant_id, payload) → OAuth refresh if needed
→ provider API call → INSERT ledger_entry (posted_ref)
→ INSERT audit_event → return
```
**Failure points:**
- `/gl-postings` page returns `null` — users cannot trigger this flow from UI.
- All providers run in paper mode (RISK-ERP-01).

---

## 9. BUSINESS LOGIC AUDIT

### Core Product Logic
- **Hedge calculation:** Deterministic, v1 frozen. No ML, no broker execution.
- **4-eyes SoD:** Enforced at service layer (`maker_id != checker_id`).
- **Position lifecycle:** `NEW → POLICY_ASSIGNED → READY_TO_EXECUTE → HEDGED | REJECTED`.
- **Tri-state pipeline:** `SANDBOX → STAGING → LEDGER`. WORM transitions.

### Domain Rules
- **Counterparty exposure:** Engine computes PFE; breach at ≥80%/100%.
- **Debt covenants:** Monitored but auto-enforcement unverified.
- **IFRS 9 hedge effectiveness:** 0.80–1.25 boundary. At-risk flags within 10%.
- **Cash forecast:** 13-week / 12-month horizons. Liquidity gap detection.

### Permissions
- 9 roles, 41 permissions, hierarchy 0–15.
- Plan tier gating (`professional`, `enterprise`).
- **Gap:** No ABAC beyond RBAC + plan tier.

### Subscription / Payment Logic
- Stripe integration present but `stripe_customer_id` on `companies` may be unpopulated.
- Billing routes (`v1_billing.py`) minimal (1 route).
- **Gap:** No full subscription lifecycle management visible.

### Admin Workflows
- Admin panel exists (`/admin`).
- **Gap:** Some admin mutations may lack WORM audit logging.
- **Gap:** `v1_devops.py` reads `.claude/state/memory.db` — internal state exposure risk.

### Edge Cases / Failure Modes
- Redis outage: fail-open (intentional).
- Market data feed down: scheduler logs ERROR, no crash.
- OAuth token refresh failure: handled in connector layer with retry.
- Bulk import failure: partial success handling unverified.
- **New:** Bank connection `exchange_code` raises `NotImplementedError` — graceful but incomplete.
- **New:** NetSuite ERP pull returns empty list — no error, just missing data.

---

## 10. UI/UX PRODUCT QUALITY AUDIT

### First Impression
- Login page is clean, theme-aware, logo conditional on dark/light mode.
- Dashboard loads KPIs and charts.
- **Gap:** Navigate to `/debt`, `/ir-risk`, `/counterparties` — blank screen. Destroys trust immediately.

### Visual Hierarchy
- Tailwind v4 with design tokens.
- Consistent card-based layout.
- **Gap:** Many pages bypass tokens with local `const C = {...}` color objects (`polisophic`, `status`, `database-connection`, `cash-forecast`).

### Navigation Clarity
- Sidebar with grouped sections.
- Mobile hamburger with backdrop.
- **Critical Gap:** ~35 sidebar items link to blank screens. Users click and see nothing.

### Dashboard Usefulness
- KPI strip, recent runs, pending approvals, FX rates, macro indicators.
- **Gap:** No custom widget configuration.

### Color / Spacing / Typography
- CSS variables for theming.
- Dark/light toggle present.
- **Gap:** Hardcoded colors in multiple pages create visual inconsistency.

### Professional Trust Level
- Security questionnaire, SOC2 controls matrix exist.
- **Gap:** `/status` page shows fake "99.98%" uptime — if discovered by prospects, destroys credibility.
- **Gap:** `/database-connection` fakes a successful connection test — same credibility risk.

### Empty States
- `EmptyState` component exists (200 lines, 6 types).
- **Gap:** ~35 pages return `null` instead of `<EmptyState />` or `<ComingSoon />`.
- **Gap:** `ComingSoon` component exists but is **not used anywhere**.

### Error States
- `extractErrorDetail` helper for typed error extraction.
- Per-feature React error boundaries (20 `error.tsx` files shipped).
- **Gap:** `app/error.tsx` uses Tailwind utilities (`text-red-600`, `bg-blue-600`) that may not match dark terminal theme.
- **Gap:** Some API calls silently swallow errors (`catch { /* noop */ }`).

### Loading States
- `Skeleton`, `SkeletonTable`, `SkeletonBlock` components created.
- Applied to 6 key pages.
- **Gap:** Not all async data fetching has skeletons.

### Mobile / Responsive
- Spot-checked 12 pages; 6 table overflow fixes.
- **Not verified across all 121 pages.**

### Accessibility
- No systematic `axe-core` audit.
- No a11y CI gate.

### Form UX
- Controlled inputs with validation.
- **Gap:** Not all forms have inline validation.

### User Onboarding
- Demo data seeded.
- **Gap:** No interactive product tour. No contextual help tooltips.

### Product Polish
- **Gap:** ~35 empty pages.
- **Gap:** Mock data presented as real on `/status`, `/database-connection`.
- **Gap:** No toast notification system verified.

### UI/UX Scores

| Category | Score | Strong | Weak | Must Change for 10/10 |
|----------|-------|--------|------|----------------------|
| Visual design | **6/10** | Tailwind tokens, theme toggle, card layout | Hardcoded colors in many pages, marketing pages thin | Complete color audit, use canonical tokens |
| UX clarity | **5/10** | Clear sidebar grouping, lifecycle labels | **~35 blank screens**, faked connection tests, static status page | Hide empty pages or render `ComingSoon`, fix faked data |
| Navigation | **6/10** | Mobile sidebar, grouped sections | ~35 sidebar links to blank screens | Remove or gate empty nav items |
| Dashboard quality | **7/10** | KPIs, charts, recent runs | No real-time, no custom widgets | Add SSE/WebSocket, widget config |
| Mobile/responsive | **6/10** | Touch targets, overflow scroll | Not all 121 pages verified | Systematic mobile verification |
| Accessibility | **5/10** | Some spec files | No axe-core gate, no systematic audit | Add `axe-core` + Lighthouse CI |
| Launch polish | **4/10** | Skeletons on key pages, error boundaries | **~35 empty pages**, mock data as real, no toast system | Hide empty pages, label mock data, add toast system |

---

## 11. SECURITY AUDIT

| Risk | Severity | File/Evidence | Exploit Scenario | Fix | Priority |
|------|----------|---------------|------------------|-----|----------|
| No 5xx alert / no auto-rollback | **HIGH** | `OPEN_RISKS.md::RISK-OPS-MON-01` | Deploy breaks prod; 3-day silent outage | Add Sentry 5xx rule + Render auto-rollback | P0 |
| Secrets in git history | **HIGH** | `OPEN_RISKS.md::R-001` | Credential leak from old commits | Run `scripts/scrub-git-secrets.sh` + force-push | P0 |
| `v1_devops.py` reads internal SQLite | **HIGH** | `backend/app/api/routes/v1_devops.py` | Leaks `.claude/state/memory.db` content | Guard by env check or remove from production | P0 |
| Dockerfile healthcheck wrong path | **HIGH** | `backend/Dockerfile` line 51 | Container restart-loop, deploy failure | Change `/health` → `/api/health` | P0 |
| Schema drift → 500 on `/auth/me` | **MEDIUM** | `CLAUDE.md::9.2` | ORM column absent from prod DB | `_ensure_tables` + `ADD COLUMN IF NOT EXISTS` | P1 |
| Mock data as real (status, db-conn) | **MEDIUM** | `app/status/page.tsx`, `app/database-connection/page.tsx` | Prospects discover faked data, trust destroyed | Add persistent demo banners or implement real | P1 |
| API-key auth no RLS injection | **MEDIUM→LOW** | `app/deps/api_key_auth.py` | If API-key used on business route, RLS returns empty | Startup guard blocks this | P1 |
| In-memory rate limit bypass | **MEDIUM** | `backend/app/middleware/rate_limit.py` | Attacker rotates across Render instances | Enforce Redis requirement in prod or add WAF | P1 |
| File upload size/type limits | **MEDIUM** | `v1_upload.py` (2 routes) | Unrestricted upload → DoS or malware | Verify strict size/type limits | P1 |
| Empty infra files | **LOW** | `infra/k8s/*.yaml`, `infra/terraform/main.tf` | Confusion, incomplete deployment | Delete or populate | P2 |
| Empty security files | **LOW** | `app/security/auth.py`, `app/security/jwt.py` | Confusion, dead code | Delete | P2 |
| `.env` files on disk | **LOW** | `backend/.env`, `frontend/.env.local` | Accidental commit risk | Add to `.gitignore` verify, consider git hooks | P2 |

### Security Score: **6/10**
- Strong auth, RLS, WORM, CSRF, hash chain, Argon2id.
- Weak on operational monitoring (already caused outage).
- Weak on secret hygiene (history scrub pending).
- New critical: `v1_devops.py` internal DB exposure, broken Docker healthcheck.

---

## 12. TESTING AND QA AUDIT

| Area | Existing Tests | Missing Tests | Risk | Recommended Tests | Score |
|------|---------------|---------------|------|-------------------|-------|
| Backend unit | 5514 passed, 160 skipped | Some edge cases in lifecycle transitions | Low | Property-based tests for engine_v1 | 9/10 |
| Backend integration | 154 PG-only tests passed locally | PG tests not in hard gate (RISK-CI-PG-01) | Medium | Promote `backend-postgres` to hard gate | 7/10 |
| API contract | `test_routes_smoke.py` (131 tests) | Not all 450+ endpoints covered | Medium | Expand smoke to all routes | 7/10 |
| Frontend unit (jest) | 75 suites, 3155 tests passed | Some component tests missing | Low | Add RTL tests for complex tables | 7/10 |
| E2E (Playwright) | **Only 2 specs** (`login`, `hedges`) | No coverage for 80+ routes | **High** | Add critical-path specs for all major flows | 3/10 |
| Security | Startup guards (9+7+3 tests) | Penetration test not automated | Medium | Add OWASP ZAP or similar | 6/10 |
| Performance | k6 doc exists, no baseline | No load test executed | Medium | Run 100 VU / 5 min staging test | 4/10 |
| Accessibility | 1 spec file | No systematic audit | Medium | Add axe-core + Lighthouse CI | 4/10 |

### Testing Score: **5/10**
- Excellent backend unit coverage.
- **E2E is critically deficient** — only 2 specs for 80+ routes.
- Performance and a11y testing are minimal.

---

## 13. DEVOPS / DEPLOYMENT / PRODUCTION READINESS

### Docker
- `backend/Dockerfile` — multi-stage build, `bookworm` base, Trivy-cleaned.
  - **🔴 CRITICAL BUG:** `HEALTHCHECK` uses `http://localhost:8000/health` but app only exposes `/api/health`. Returns 404. Container will restart-loop.
- `frontend/Dockerfile` — multi-stage Node 20 Alpine build. HEALTHCHECK correct.
- `docker-compose.prod.yml` — backend + Redis. Missing frontend, nginx, DB. Backend uses bare `uvicorn` (single worker) instead of Gunicorn.
- `infra/docker/docker-compose.yml` — **Same wrong healthcheck path** (`/health` instead of `/api/health`).

### CI/CD
- GitHub Actions: 5 hard gates (backend pytest 70%, frontend build, architecture governance, gitleaks, Docker).
- 3 advisory jobs (backend-postgres, E2E, E2E smoke).
- **Gap:** Billing block currently prevents CI execution (org-level, not code).
- **Gap:** CI uses `@v6` and `@master` action refs — supply-chain risk. Should pin SHAs.

### Environment Configs
- `render.yaml` — IaC with env groups.
  - **🔴 CRITICAL BUG:** References `OPENAI_API_KEY_V` but `config.py` expects `OPENAI_API_KEY`. Voice feature will not receive injected secret.
- `vercel.json` — minimal frontend config.
- `.env.example` — incomplete (missing `ALLOWED_IPS`, `RATE_LIMIT_ENABLED`, `API_KEY_PEPPER`, `SENTRY_DSN`, `REDIS_URL`, `CONNECTOR_ENCRYPTION_KEY`, `WORKOS_API_KEY`, `OPENAI_API_KEY`, `TWELVEDATA_API_KEY`, market data intervals).
- `backend/.env` and `frontend/.env.local` exist on disk (untracked but present).

### Empty Infrastructure Artifacts
- `infra/k8s/backend.yaml` — **0 bytes**
- `infra/k8s/frontend.yaml` — **0 bytes**
- `infra/terraform/main.tf` — **0 bytes**

### Build Scripts
- Frontend: `next build` (190 kB first load JS).
- Backend: `uvicorn app.main:app`.
- **Gap:** No `Makefile` or task runner.

### Deployment Target
- Render (backend) — starter tier ($7/mo).
- Vercel (frontend) — edge network.
- Render PostgreSQL — private networking.

### Health Checks
- `/api/health` — DB + Redis probe, 503 on failure.
- Docker health check: **BROKEN** (`/health` → 404).
- **Gap:** No deep health check (alembic version match, WORM chain integrity, critical table existence).

### Logging
- Structured JSON logs.
- Sentry integration.
- **Gap:** No log aggregation dashboard (Datadog, Grafana).

### Monitoring
- Sentry for error tracking (if DSN configured).
- **Gap:** No metrics dashboard. No Render auto-rollback.

### Database Migrations
- Alembic with 65 migrations.
- `_ensure_tables()` as safety net.
- **Gap:** ~40 tables exist only in raw DDL, not in migrations.
- **Gap:** No automatic rollback strategy.

### Rollback Strategy
- Backend: Render dashboard → select previous commit.
- Frontend: Vercel dashboard → redeploy previous.
- Database: No auto-rollback. PITR from Render.
- **Gap:** No blue/green or canary deployment.

### Production Secrets
- Render env groups: `hedgecore-secrets`, `hedgecore-preview-secrets`.
- **Gap:** Secret rotation not executed. Git history scrub not executed.
- **Gap:** `render.yaml` env var name mismatch (`OPENAI_API_KEY_V` vs `OPENAI_API_KEY`).

### DevOps Scores

| Category | Score | Reason |
|----------|-------|--------|
| Deployment readiness | **4/10** | Docker healthcheck broken, missing frontend/DB in compose, no blue/green |
| Observability | **4/10** | Sentry present but unconfigured; no metrics dashboard; no 5xx alerts |
| Scalability | **5/10** | Stateless but no HPA, no read replicas, no CDN |
| Operations readiness | **4/10** | Runbooks exist; no auto-rollback; secret rotation pending; broken healthcheck |

---

## 14. PERFORMANCE AUDIT

| Issue | Impact | Evidence | Fix | Expected Improvement |
|-------|--------|----------|-----|---------------------|
| Dashboard aggregate queries | High latency at scale | `dashboard.py` queries `positions` + `calculation_runs` with RLS | Add materialized views or caching layer | Sub-200ms p95 |
| Large position bulk import | Timeout / memory | `v1_positions.py::bulk` max 500 rows | Add background job queue (Celery/RQ) | Support 10k+ rows |
| Frontend bundle | 190 kB (okay) | `next build` output | Continue monitoring; add dynamic imports | < 150 kB |
| Engine CPU-bound calculations | Request blocking | `engine_v1/` runs synchronously in request | Offload to background job | Non-blocking API |
| No CDN for static assets | Slower global load | Vercel edge handles some; no explicit CDN config | Add Cloudflare or AWS CloudFront | Faster global TTFB |
| Redis cold start | Rate limit fallback | Render Redis free tier may sleep | Upgrade Redis or add keepalive | Consistent rate limiting |
| Missing DB query cache | Repeated identical queries | No query result caching visible | Add Redis query cache for market data | Reduced DB load |

---

## 15. PRODUCT LAUNCH READINESS SCORECARD

| Category | Score /10 | Launch Risk | Reason | Required Fixes for 10/10 |
|----------|-----------|-------------|--------|-------------------------|
| Architecture | **5/10** | High | Strong modular design, but empty infra files, unusual migration pattern, broken Docker healthcheck | Fix healthcheck, delete/populate empty K8s/Terraform, reconcile schema |
| Backend | **7/10** | Medium | 5514 tests, strong auth, RLS, WORM; but stubs (IBKR 0.0, bank NotImplemented, NetSuite empty), `v1_devops.py` leaks internal DB | Fix stubs, remove `v1_devops.py` from prod, add job queue |
| Frontend | **4/10** | **Critical** | ~35 empty pages, mock data presented as real, design system violations, only 2 E2E specs | Hide/build empty pages, label mock data, use canonical tokens, expand E2E |
| UI/UX | **4/10** | **Critical** | Good structure, but ~35 blank screens, faked connection tests, static status page, unused ComingSoon | Hide empty pages, fix faked data, add toast system |
| API | **7/10** | Low | 450+ endpoints, OpenAPI, typed schemas; but `v1_devops.py` exposed, some inline dicts | Remove `v1_devops.py` from prod, uniform pagination |
| Database | **5/10** | **High** | RLS, WORM, hash chain, 52 models; but ~40 tables only in raw DDL, missing env.py imports, schema drift | Migrate raw DDL to Alembic, add missing imports |
| Dataflow | **6/10** | Medium | Clear flows, 4-eyes enforced, WORM; but many frontend pages empty so flows are unreachable | Build empty frontend pages |
| Business logic | **7/10** | Medium | Deterministic engine, frozen v1, RBAC; but stubs in bank/ERP/market data | Implement stubbed services |
| Security | **6/10** | **High** | Strong controls, but operational blind spot, `v1_devops.py` internal leak, broken healthcheck | Fix healthcheck, remove `v1_devops.py`, add 5xx alerts |
| Testing | **5/10** | **High** | Great unit tests, E2E critically deficient (2 specs for 80+ routes) | Add E2E for all major flows |
| DevOps | **4/10** | **High** | Docker healthcheck broken, empty infra files, incomplete compose, no blue/green | Fix healthcheck, populate infra, complete compose |
| Observability | **4/10** | **High** | Sentry unconfigured, no metrics, no 5xx alerts | Configure Sentry DSN + alerts, add Grafana/Datadog |
| Performance | **6/10** | Medium | Acceptable now, scaling risks | Job queue, materialized views, CDN |
| Documentation | **6/10** | Low | 20 ADRs, runbooks, API contracts; but `.env.example` incomplete | Complete env template |
| Product completeness | **5/10** | **High** | Core features complete, but ~35 empty pages, ERP paper mode, bank stubs | Build empty pages, provision live credentials |
| Launch readiness | **5/10** | **High** | Core backend strong, frontend critically incomplete, ops gaps fatal | Close all P0 gaps below |

### Overall Product Score: **5.4/10**

### Current Launch Verdict: **Demo-ready only. Not soft-launch ready.**

**Why:**
- The **core backend** (hedge calculations, treasury workflows, audit trail, RBAC) is production-grade.
- The **frontend is critically incomplete** — ~35 pages return `null`, mock data is presented as real, and only 2 E2E specs exist.
- **Operational defects** — broken Docker healthcheck, massive schema drift, missing Alembic imports, empty infra artifacts.
- **Operational monitoring** has a proven blind spot that caused a 3-day outage.
- This product is safe for **internal demos and investor presentations** but **not safe for external users** until the ~35 empty pages are resolved and the Docker/schema issues are fixed.

---

## 16. GAP ANALYSIS

| Gap | Severity | Area | Evidence | Why It Matters | Fix | Expected Outcome | Effort |
|-----|----------|------|----------|---------------|-----|-----------------|--------|
| ~35 frontend pages return `null` | **P0** | Frontend | Subagent frontend audit lines 523–556 | Users navigate to blank screens; destroys trust | Hide sidebar links or render `<ComingSoon />` with "Coming Q3 2026" | No blank screens | 1–2 days |
| Broken Dockerfile healthcheck | **P0** | DevOps | `backend/Dockerfile` line 51 | Container restart-loop on deploy | Change `/health` → `/api/health` | Healthy containers | 30 min |
| Schema drift: ~40 tables only in raw DDL | **P0** | Database | `backend/app/main.py` lines 367–1734 | Cannot recreate tables without `_ensure_tables()` | Generate Alembic baseline migration with all DDL | Self-contained migrations | 2–3 days |
| Missing model imports in `migrations/env.py` | **P0** | Database | `backend/migrations/env.py` lines 51–84 | `autogenerate` would drop/create existing tables | Import all 52 model modules | Safe autogenerate | 2–4 hrs |
| `v1_devops.py` reads internal SQLite | **P0** | Security | `backend/app/api/routes/v1_devops.py` | Leaks `.claude/state/memory.db` in production | Guard by `ENV != production` or remove route | No internal state leak | 1 hr |
| No Sentry 5xx alert / no auto-rollback | **P0** | Ops | `OPEN_RISKS.md::RISK-OPS-MON-01` | Silent outages; already caused 3-day degradation | Add Sentry rule + enable Render toggle | Alert within 5 min | 2 hrs |
| Mock/faked data presented as real | **P1** | UI/UX | `app/status/page.tsx`, `app/database-connection/page.tsx`, `app/polisophic/page.tsx` | Prospects discover faked data, trust destroyed | Add persistent "Demonstration Data" banners | Transparent UX | 1 day |
| Secrets in git history | **P1** | Security | `OPEN_RISKS.md::R-001` | Credential leak risk | Run scrub script + force-push | Clean history | 4 hrs |
| `OPENAI_API_KEY_V` vs `OPENAI_API_KEY` mismatch | **P1** | DevOps | `render.yaml` line 65 vs `config.py` line 387 | Voice terminal receives no secret, returns 503 | Align env var names | Voice terminal works | 30 min |
| Empty infra files (K8s/Terraform) | **P1** | DevOps | `infra/k8s/*.yaml`, `infra/terraform/main.tf` (0 bytes) | Confusion, incomplete deployment | Delete or populate | Clean infra dir | 1 hr |
| E2E only 2 specs | **P1** | QA | `frontend/src/tests/e2e/specs/` | No automated end-to-end verification | Add critical-path specs for all major flows | Reliable E2E | 3–5 days |
| No live ERP credentials | **P1** | Product | `OPEN_RISKS.md::RISK-ERP-01` | Core value prop (live posting) unverified | Provision OAuth apps, populate env vars | Live GL posting demo | 1–2 days |
| In-memory rate limit bypass | **P1** | Security | `backend/app/middleware/rate_limit.py` | Attacker rotates across Render instances | Enforce Redis or add WAF | Consistent rate limiting | 1 day |
| PG-only tests advisory | **P1** | QA | `OPEN_RISKS.md::RISK-CI-PG-01` | PG-only bugs ship to prod (RLS incident) | Promote `backend-postgres` to hard gate | PG bugs caught in CI | 1 day |
| `.env.example` incomplete | **P2** | DevOps | `backend/.env.example` (79 lines) | Missing critical production variables | Add all `config.py` tunables | Complete env template | 2 hrs |
| In-process scheduler risk | **P2** | Backend | `backend/app/main.py` lines 1915–1949 | Jobs lost on crash/redeploy | Document risk, plan Celery/RQ | Resilient scheduling | 2–3 days |
| IBKR forward points stub (`0.0`) | **P2** | Product | `services/market_data/ibkr_provider.py` | CIP forward curve inaccurate | Implement live forward points | Accurate curves | 2–3 days |
| Bank connection stubs | **P2** | Product | `services/bank_connection_service.py` | TrueLayer/Plaid live pull not wired | Implement `exchange_code` + `get_balances` | Live bank data | 2–3 days |
| NetSuite ERP stub (empty list) | **P2** | Product | `services/erp_adapters/netsuite.py` | No NetSuite invoice pull | Implement OAuth 1.0a + pull | Live NetSuite data | 2–3 days |
| No materialized views for dashboard | **P2** | Performance | `dashboard.py` | Slow aggregates at scale | Add `MATERIALIZED VIEW` for KPIs | Sub-200ms dashboard | 1 day |
| No background job queue | **P2** | Backend | `main.py` uses `BackgroundTasks` | Large imports block event loop | Add Celery/RQ + Redis | Async heavy ops | 2–3 days |
| No CDN config | **P2** | Performance | No Cloudflare/CloudFront in infra | Slow global static asset delivery | Add CDN | Faster global TTFB | 2 hrs |
| Design system violations (hardcoded colors) | **P2** | UI/UX | `app/polisophic/page.tsx`, `app/status/page.tsx`, etc. | Visual inconsistency, maintenance debt | Replace local colors with `T` tokens | Consistent theme | 1–2 days |
| Silent catch blocks | **P2** | Frontend | `database-connection/page.tsx`, `portfolio-multi/page.tsx` | Errors invisible to users | Add error states or Sentry logging | Visible errors | 1 day |
| Empty security files | **P3** | Maintainability | `app/security/auth.py`, `app/security/jwt.py` | Confusion, dead code | Delete | Clean codebase | 30 min |
| `alembic.ini` placeholder password | **P3** | Security | `backend/alembic.ini` line 25 | Could confuse scanning tools | Use `<PLACEHOLDER>` or env var reference | Safe template | 30 min |

---

## 17. 10/10 ROADMAP

### Phase 1 — Launch Blockers (1–2 weeks)
| # | Task | Files/Modules | Expected Outcome |
|---|------|--------------|------------------|
| 1 | Hide or render `ComingSoon` on ~35 empty pages | `frontend/src/app/**/page.tsx`, `AppSidebar.tsx` | Zero blank screens |
| 2 | Fix Dockerfile healthcheck path | `backend/Dockerfile`, `infra/docker/docker-compose.yml` | Healthy containers |
| 3 | Reconcile schema drift — migrate `_ensure_tables()` to Alembic baseline | `backend/app/main.py`, `backend/migrations/versions/` | Self-contained migrations |
| 4 | Add missing model imports to `migrations/env.py` | `backend/migrations/env.py` | Safe autogenerate |
| 5 | Remove or guard `v1_devops.py` from production | `backend/app/api/routes/v1_devops.py` | No internal state leak |
| 6 | Wire Sentry 5xx alert + Render auto-rollback | `docs/runbooks/ops-monitoring.md`, Render/Sentry dashboards | RISK-OPS-MON-01 closed |
| 7 | Label mock/faked data pages clearly | `app/polisophic/page.tsx`, `app/status/page.tsx`, `app/database-connection/page.tsx` | Transparent demo UX |
| 8 | Fix `OPENAI_API_KEY` env mismatch | `render.yaml` or `config.py` | Voice terminal works |
| 9 | Scrub git secrets + rotate exposed creds | `scripts/scrub-git-secrets.sh`, Render/Vercel env vars | R-001 closed |
| 10 | Delete empty infra files or populate them | `infra/k8s/*.yaml`, `infra/terraform/main.tf` | Clean infra directory |

### Phase 2 — Product Completion (2–3 weeks)
| # | Task | Files/Modules | Expected Outcome |
|---|------|--------------|------------------|
| 11 | Build `/debt` page | `frontend/src/app/debt/page.tsx` | Debt facilities UI |
| 12 | Build `/ir-risk` page | `frontend/src/app/ir-risk/page.tsx` | IR swap calculator UI |
| 13 | Build `/counterparties` page | `frontend/src/app/counterparties/page.tsx` | Counterparty hub UI |
| 14 | Build `/pre-trade-tca` page | `frontend/src/app/pre-trade-tca/page.tsx` | TCA estimator UI |
| 15 | Build `/intelligence` page | `frontend/src/app/intelligence/page.tsx` | AI query UI |
| 16 | Build `/gl-postings`, `/settlement`, `/payments` pages | `frontend/src/app/*/page.tsx` | Accounting workflow UI |
| 17 | Complete any-type sweep | `frontend/src/**/*.ts{x}` | `tsc --noEmit` with `noImplicitAny` |
| 18 | Fix design system violations (hardcoded colors) | `frontend/src/app/**/page.tsx` | All pages use canonical tokens |
| 19 | Fix silent catch blocks | `frontend/src/app/**/page.tsx` | All errors visible or logged |
| 20 | Expand E2E to critical paths | `frontend/src/tests/e2e/specs/` | Coverage for all major flows |

### Phase 3 — Enterprise Hardening (2–3 weeks)
| # | Task | Files/Modules | Expected Outcome |
|---|------|--------------|------------------|
| 21 | Implement live ERP credentials & posting | `v1_connectors.py`, QBO/Xero/NS dev consoles | RISK-ERP-01 closed |
| 22 | Implement TrueLayer/Plaid live pull | `services/bank_connection_service.py` | Live bank data |
| 23 | Implement IBKR forward points | `services/market_data/ibkr_provider.py` | Accurate CIP curves |
| 24 | Implement NetSuite invoice pull | `services/erp_adapters/netsuite.py` | Live NetSuite data |
| 25 | Add background job queue (Celery/RQ) | `backend/app/tasks/`, `docker-compose.prod.yml` | Async heavy ops |
| 26 | Add materialized views for dashboard | `backend/app/models/dashboard_views.py`, migration | Dashboard p95 < 200ms |
| 27 | Add admin mutation WORM audit | `v1_admin_*.py` | Full admin traceability |
| 28 | Expand RLS to all tenant tables | Migrations for remaining tenant-scoped tables | Complete data isolation |
| 29 | Blue/green deployment pattern | `infra/`, `.github/workflows/` | Zero-downtime deploys |
| 30 | Complete `.env.example` | `backend/.env.example`, `.env.example` | Complete env template |

### Phase 4 — UI/UX Polish (1–2 weeks)
| # | Task | Files/Modules | Expected Outcome |
|---|------|--------------|------------------|
| 31 | Universal loading skeletons | `frontend/src/components/Skeleton*` | Every async page has skeleton |
| 32 | Toast/notification system | `frontend/src/components/Toast*` | Global feedback on mutations |
| 33 | Interactive onboarding tour | `frontend/src/components/Onboarding*` | Higher activation rate |
| 34 | Mobile responsive audit all 121 pages | `frontend/src/app/**/page.tsx` | Zero mobile layout bugs |
| 35 | Complete per-feature error boundaries | `frontend/src/app/**/error.tsx` | Every feature has boundary |
| 36 | Contextual help tooltips | `frontend/src/components/HelpTooltip*` | Reduced support tickets |
| 37 | Dark mode polish on all pages | `frontend/src/app/**/page.tsx` | Zero hardcoded colors |
| 38 | Modal focus trapping | `frontend/src/components/Modal*` | a11y compliance |
| 39 | Keyboard navigation audit | `frontend/src/app/` | Full keyboard operability |
| 40 | Print-friendly report layouts | `frontend/src/app/reports/` | PDF-ready layouts |

### Phase 5 — Scale, Observability, and Operations (2–3 weeks)
| # | Task | Files/Modules | Expected Outcome |
|---|------|--------------|------------------|
| 41 | Grafana/Datadog metrics dashboard | `infra/`, `backend/app/core/metrics.py` | Real-time latency/error dashboards |
| 42 | Log aggregation (Loki/CloudWatch) | `infra/`, `backend/app/core/logging_config.py` | Searchable logs |
| 43 | Horizontal pod autoscaling (k8s) | `infra/k8s/` | Auto-scale on CPU/memory |
| 44 | Multi-region deployment | `infra/terraform/` | EU/US regions |
| 45 | Database read replica auto-routing | `backend/app/core/db.py` | Analytics off primary |
| 46 | Redis Cluster / ElastiCache | `infra/`, `docker-compose.prod.yml` | Redis HA |
| 47 | CDN edge caching for API | `infra/nginx/` or Cloudflare | Cached public endpoints |
| 48 | Disaster recovery runbook drill | `docs/runbooks/dr.md` | Quarterly DR proven |
| 49 | Cost optimization (FinOps) | `infra/terraform/` | Right-sized resources |
| 50 | Chaos engineering baseline | `tests/chaos/` | Resilience proven |

---

## 18. FINAL DELIVERABLES

### A. One-Page Executive Summary
**ORDR TreasuryFX** is an institutional FX hedge calculation and governance platform with strong architectural discipline, extensive backend test coverage (5514 passing), and enterprise-grade security features (RLS, WORM, Argon2id, hash-chain audit). However, it is currently **demo-ready only, not soft-launch ready**. The frontend has **~35 empty pages** navigable from the sidebar, **multiple pages with faked/mock data presented as real**, a **broken Docker healthcheck** that would cause container restart loops, and **massive schema drift** (~40 tables exist only in 1,700 lines of raw DDL, not in Alembic migrations). Additionally, operational monitoring gaps already caused a 3-day silent production outage. With 2 weeks focused on the Phase 1 blockers, this product can reach **soft-launch ready**; 8–10 weeks of Phases 2–5 will bring it to **production-launch ready (10/10)**.

### B. Full Technical Audit
See Sections 2–14 above.

### C. Frontend-Backend Connection Matrix
See Section 5 above. ~20 core features fully connected; ~35 frontend routes exist but return `null` (empty); 4 pages use mock/faked data.

### D. API Matrix
See Section 6 above. ~450 endpoints across 89 route files; typed Pydantic schemas dominant; `v1_devops.py` should not be exposed in production.

### E. Database Matrix
See Section 7 above. 52 models, 65 migrations, RLS on 2 tables, WORM on 4+ tables, hash-chain verification cron. **~40 tables created only in raw DDL (`_ensure_tables()`), not in Alembic.**

### F. Dataflow/Workflow Maps
See Section 8 above. 6 critical workflows mapped. Many workflows (debt, IR risk, counterparties, TCA, payments, settlement) have backend implementations but **no frontend pages**.

### G. Module-by-Module 1–10 Scoring
See Section 15 scorecard.

### H. Gap List with Priority
See Section 16 above. 22 gaps: 6 P0, 9 P1, 6 P2, 3 P3.

### I. 10/10 Upgrade Roadmap
See Section 17 above. 5 phases, 50 tasks, 10–13 weeks total.

### J. Final Launch Verdict
**Demo-ready only. Not soft-launch ready (5.4/10).**

The core backend is solid, but the frontend has ~35 empty pages, mock data presented as real, and only 2 E2E specs. Operational defects (broken Docker healthcheck, schema drift, missing Alembic imports, empty infra files) make this unsafe for external users. Fix Phase 1 blockers before any external launch.

### K. Exact Next 10 Engineering Tasks in Order
1. **Hide or render `ComingSoon` on ~35 empty frontend pages** — highest user-facing impact
2. **Fix Dockerfile healthcheck** (`/health` → `/api/health`) — blocks Docker deployment
3. **Fix `infra/docker/docker-compose.yml` healthcheck** — same bug
4. **Reconcile schema drift** — migrate `_ensure_tables()` DDL into proper Alembic baseline migration
5. **Add missing model imports to `migrations/env.py`** — prevents destructive autogenerate
6. **Guard or remove `v1_devops.py` from production** — prevents internal state leak
7. **Add persistent "Demonstration Data" banners** to `/polisophic`, `/status`, `/database-connection`
8. **Fix `OPENAI_API_KEY` env mismatch** (`render.yaml` vs `config.py`)
9. **Wire Sentry 5xx alert + Render auto-rollback** — closes RISK-OPS-MON-01
10. **Delete empty infra files** (`infra/k8s/*.yaml`, `infra/terraform/main.tf`) or populate them

---

*End of Audit Report*
