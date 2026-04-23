# Current Sprint

Sprint: Production Readiness + E2E Coverage
Status: IN PROGRESS
Started: 2026-04-22

## Goal
Make ORDR Terminal production-ready with comprehensive E2E test coverage across every section. Fix all known UI/UX bugs, runtime errors, and missing API contracts.

## Quick Fixes (Done Today)
| # | Fix | Status |
|---|-----|--------|
| Q1 | Navbar: "Hedge Desk" → "Treasury Suite" | ✅ Done |
| Q2 | Login autofill: white-on-white text in browser password managers | ✅ Done |
| Q3 | Missing backend routes: `/v1/connectors/accounting/import`, `/v1/connectors/erp/sync` | ✅ Done (paper-mode stubs) |

---

## Phase 1: UI/UX Hardening (P0)

| # | Item | Status | Notes |
|---|------|--------|-------|
| U1 | Login page theme-aware inputs | OPEN | Hardcoded `#131317` / `#e8e8ef` breaks light themes; should use CSS vars |
| U2 | Accounting-connection page: OAuth popup 404 handling | OPEN | `/api/accounting-oauth-start` exists but shows raw 404 if OAuth fails; needs user-friendly error state |
| U3 | ERP-integration page: probe/sync error states | OPEN | Same as above — needs graceful degradation when ERP is unreachable |
| U4 | Mobile responsive audit: verify all 121 pages on 375px–768px | OPEN | Spot-check 10% of pages for overflow, unreadable text, broken tables |
| U5 | Dark/light theme toggle: verify all pages render correctly in both modes | OPEN | Login page is hardcoded dark; marketing pages may have issues |
| U6 | Consistent empty states across all data tables | OPEN | Some pages show blank screen when no data; others show "No data" message |
| U7 | Loading skeletons for async data fetching | OPEN | Many pages show "Loading..." text instead of proper skeleton UI |

---

## Phase 2: API Contract Hardening (P0)

| # | Item | Status | Notes |
|---|------|--------|-------|
| A1 | Stub routes → real implementations | OPEN | `/v1/connectors/accounting/import` and `/erp/sync` are paper-mode stubs |
| A2 | API response standardization | OPEN | Some endpoints return plain strings instead of JSON `{ detail: ... }` |
| A3 | Error handling middleware: ensure all 4xx/5xx return consistent shape | OPEN | `{ error: "code", detail: "message", status: N }` |
| A4 | OpenAPI schema drift: run scalar docs validation | OPEN | Some Pydantic models have `Optional[X] = None` vs `X | None` inconsistencies |
| A5 | Rate limiting: verify all public endpoints are protected | OPEN | `/api/health` is open; check `/api/v1/*` all require X-API-Key or JWT |
| A6 | CORS preflight: test from Vercel preview domains | OPEN | Preview CORS now in env group; verify after Render blueprint sync |

---

## Phase 3: E2E Test Suite (P1) — Playwright

### Coverage Target: Every Nav Section

```
frontend/e2e/
├── auth/
│   ├── login.spec.ts           — login flow, MFA, error states, autofill visual
│   ├── logout.spec.ts          — session cleanup, redirect
│   └── password-reset.spec.ts  — if applicable
├── dashboard/
│   └── dashboard.spec.ts       — KPIs load, widgets render, navigation
├── treasury-suite/
│   ├── hedge-desk.spec.ts      — overview, active run, monitor
│   ├── trade-history.spec.ts   — table loads, filters work
│   ├── position-desk.spec.ts   — CRUD operations
│   ├── gl-postings.spec.ts     — journal entries, approve/post/reject
│   ├── settlement.spec.ts      — settlement workflow
│   ├── erp-sync.spec.ts        — sync button, paper-mode message
│   ├── cash-positions.spec.ts  — cash table, charts
│   ├── cash-forecast.spec.ts   — forecast chart, gap analysis
│   ├── intercompany-netting.spec.ts — netting proposal flow
│   ├── bank-statements.spec.ts — upload, reconciliation
│   ├── payments.spec.ts        — payment initiation, 4-eyes approval
│   ├── debt.spec.ts            — debt facilities, maturity calendar
│   ├── ir-risk.spec.ts         — DV01 ladder, swap calculator
│   ├── counterparties.spec.ts  — counterparty list, credit limits
│   ├── pre-trade-tca.spec.ts   — TCA estimate form
│   ├── hedge-effectiveness.spec.ts — runs, datasets, IFRS 9 flags
│   ├── regulatory-submissions.spec.ts — submission lifecycle
│   └── natural-hedging.spec.ts — AR/AP offset calculator
├── reports/
│   └── reports.spec.ts         — studio, library, saved, regulatory
├── audit-lab/
│   └── audit-lab.spec.ts       — upload, compare, trends
├── market/
│   └── market.spec.ts          — heatmap, calendar, companies, watchlists
├── research/
│   └── sandbox.spec.ts         — simulation lab, methodology
├── governance/
│   ├── audit-trail.spec.ts     — hash chain verification
│   ├── ledger.spec.ts          — immutable records
│   └── staging.spec.ts         — 4-eyes queue
├── settings/
│   └── settings.spec.ts        — all tabs, form validation
├── accounting/
│   ├── accounting-connection.spec.ts — OAuth flow, import button
│   ├── erp-integration.spec.ts — connector config, probe, sync
│   └── gl-accounts.spec.ts     — COA mappings
└── smoke/
    └── full-journey.spec.ts    — login → hedge desk → report → logout
```

### Test Patterns (Reusable)

```typescript
// e2e/fixtures/auth.ts
export async function login(page: Page, username: string, password: string) {
  await page.goto('/auth/login');
  await page.fill('#login-user', username);
  await page.fill('#login-pass', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('/dashboard');
}

// e2e/fixtures/apiKey.ts
export async function setApiKey(page: Page, apiKey: string) {
  // Inject API key into localStorage or handle via API route mock
}
```

### Environment

| Var | Purpose |
|-----|---------|
| `E2E_BASE_URL` | Target environment (default: `http://localhost:3000`) |
| `E2E_API_URL` | Backend URL (default: `http://localhost:8000/api`) |
| `E2E_USERNAME` | Test user login |
| `E2E_PASSWORD` | Test user password |
| `E2E_API_KEY` | Valid X-API-Key for authenticated endpoints |

---

## Phase 4: Production Readiness Checklist (P0)

### Security
- [ ] All secrets rotated (JWT_SECRET, TWELVEDATA_API_KEY, DB passwords)
- [ ] Git history scrubbed (`scripts/scrub-git-secrets.sh`)
- [ ] `backend/.env` never committed (verify `.gitignore`)
- [ ] `NEXT_PUBLIC_*` env vars contain no secrets
- [ ] API keys scoped per-tenant (not shared)
- [ ] CORS origins whitelist reviewed and minimal

### Performance
- [ ] `next build` generates < 200 kB First Load JS
- [ ] Backend cold start < 10s on starter tier
- [ ] Database connection pool tuned (pool_size=20)
- [ ] Redis cache hit ratio > 80% on market data

### Reliability
- [ ] Health check (`/api/health`) returns 200 with all dependencies OK
- [ ] Graceful degradation when Redis unavailable
- [ ] Graceful degradation when market data feed down
- [ ] All cron jobs have alerting on failure

### Observability
- [ ] Sentry DSN configured for production
- [ ] Structured JSON logging in production
- [ ] Key metrics dashboards: request rate, error rate, p95 latency

### Data Integrity
- [ ] Alembic baseline stamped on production DB
- [ ] WORM tables have hash-chain verification
- [ ] Daily backup cron running + monthly restore verification
- [ ] GDPR anonymisation job scheduled

---

## Completion Criteria

- [ ] All P0 items done
- [ ] E2E suite covers every nav section (minimum 1 test per page)
- [ ] `npx playwright test` passes with 0 failures
- [ ] `tsc --noEmit` clean
- [ ] `next build --no-lint` exit 0
- [ ] Backend tests: > 95% pass rate (known flakes documented)
- [ ] Security audit: gitleaks clean post-scrub
- [ ] Deployed to staging, smoke-tested end-to-end

---

## Estimated Effort

| Phase | Effort | Owner |
|-------|--------|-------|
| UI/UX Hardening | 2–3 days | Frontend |
| API Contract Hardening | 1–2 days | Backend |
| E2E Test Suite | 5–7 days | QA / Full-stack |
| Production Readiness | 1 day | DevOps |
| **Total** | **9–13 days** | |
