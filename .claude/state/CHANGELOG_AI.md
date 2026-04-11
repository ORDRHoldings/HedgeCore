# Changelog (AI-maintained)

## 2026-04-10 — Sprint 29: Compare Export, Dataset Clone & D.O. Sparkline

### Added
- **Compare modal EXPORT CSV** (`page.tsx`): EXPORT CSV button in compare modal header; pure client-side Blob download via `URL.createObjectURL`; columns: run_id, dataset, standard, do_ratio, r_squared, verdict, date.
- **Dataset clone endpoint** (`v1_hedge_effectiveness.py`): `POST /v1/hedge-effectiveness/datasets/{id}/clone` — copies period data + all metadata with '(Copy)' name suffix, new UUID, emits audit event.
- **Dataset clone UI** (`page.tsx`): amber copy-icon button in DatasetsTab row actions; `cloningId` state prevents double-click; `handleCloneDataset` in HedgeEffectivenessInner; reloads datasets after clone.
- **D.O. ratio trend sparkline** (`page.tsx`): ECharts SVG line chart (h=80) per dataset in accordion; shows chronological D.O. ratio across all runs; green dashed band lines at 0.80/1.25; data points coloured green/red by band membership; only rendered when ≥2 runs have D.O. data.

### Test evidence
- `npx tsc --noEmit` — CLEAN (no output)
- pytest: 4801 passed, 0 failed, 158 skipped
- Browser confirmation: PENDING

### Files changed
- `backend/app/api/routes/v1_hedge_effectiveness.py`
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `.claude/state/CURRENT_SPRINT.md`

---

## 2026-04-04 — Sprint 6: Regulatory Reporting (IFRS 9 / ASC 815) — session 2

### Fixed
- **PageShell-inside-RunsTab bug** on `hedge-effectiveness/page.tsx`: `<PageShell>` and `Play` were imported but PageShell wrapped RunsTab content incorrectly. Removed both imports and the erroneous wrapper.

### Added
- **At-risk hedges monitor** in `OverviewTab`: surfaces hedges whose effectiveness ratio is within 10% of the IFRS 9 boundaries (0.80 lower / 1.25 upper); amber warning card with ratio + trend indicator.
- **Methodology & Standards disclosure panel** in `ComplianceSection` (EVIDENCE tab) on run detail page: shows accounting standard, methodology version, dollar-offset test pass/fail, regression test pass/fail, hedge type, designation date; includes standards citations (IFRS 9.6.4.1 / ASC 815-20-25).

### Test evidence
- `npx tsc --noEmit` — CLEAN
- `npx next build` — PASSED (after cache clean)
- pytest: 4801 passed, 0 failed, 158 skipped
- Browser confirmation: PENDING (item 6.1 XML download buttons)

### Files changed
- `frontend/src/app/hedge-effectiveness/page.tsx`
- `frontend/src/app/hedge-effectiveness/runs/[run_id]/page.tsx`

---

## 2026-04-04 — Sprint 6: Regulatory Reporting (IFRS 9 / ASC 815) — session 1 (partial)

### Added
- **IFRS 9 + ASC 815 XML download buttons** in run detail page header (`/hedge-effectiveness/runs/[run_id]`): cyan-styled buttons calling `dashboardFetch` to `/v1/hedge-effectiveness/runs/{run_id}/ifrs9-xml` and `/asc815-xml`; `downloading` state prevents double-click
- **`designation_date`** added to `RunDetail` TypeScript interface and header metadata strip

### Fixed
- **PageShell-inside-map bug**: `<PageShell>` was placed inside `traces.map()` loop, wrapping each trace card in a full page shell. Removed entirely (import dropped).

### Test evidence
- `npx tsc --noEmit` — CLEAN
- `npx next build` — PASSED
- pytest: 4801 passed, 0 failed, 158 skipped
- Browser confirmation: PENDING

### Files changed
- `frontend/src/app/hedge-effectiveness/runs/[run_id]/page.tsx` (1 file)

---

## 2026-04-04 — Production Auth + Dashboard Fixes

### Fixed
- **`/auth/me` → 401 / dashboard black screen**: Schema drift — ORM model columns existed in code but not in the production PostgreSQL DB. `users.ui_preferences` and 5 `companies` columns (`sso_provider`, `sso_domain`, `stripe_customer_id`, `stripe_subscription_id`, `plan_tier`) were absent. SQLAlchemy `SELECT *` failed with `UndefinedColumnError` → broad `except Exception` swallowed it as 401 → `fetchMe()` returned null → `user=null` → dashboard `return null` (black screen).
- **`_ensure_tables()` gap**: Added `ALTER TABLE` statements for all 6 missing columns. Column additions are now applied on every Render restart (idempotent `ADD COLUMN IF NOT EXISTS`). Alembic migrations 0012 + 0013 created as canonical schema records.
- **`User.ui_preferences` deferred**: Marked as `deferred()` in ORM so it is excluded from the default `SELECT` even before the column is added to the DB.
- **`/auth/me` exception handler**: Changed broad `except Exception → 401` to return HTTP 500 with exception type, so DB errors are distinguishable from JWT auth failures.
- **Dashboard `toFixed` crashes**: `rate.bid/mid/ask` can be null when market data is unavailable. Guarded all 6 `.toFixed()` call sites with `?? 0`. Made `fmtUsd()` accept `null|undefined`, returning `"—"` instead of crashing. Guarded `hedgeCoverage` and `hedge_ratio` null cases.

### Browser confirmed
- Login → `/dashboard` navigates correctly
- `/auth/me` returns HTTP 200 with user, roles (63 permissions), company context
- "Good morning, Demo" greeting visible; sidebar, KPI strip, TradingView chart all render
- Zero JS errors, no error boundary triggered
- Page sweep: dashboard, hedge-desk, audit-lab, sandbox, reports all OK

### Test evidence
- Backend: 4801 passed, 0 failed, 158 skipped (unchanged)
- Commits: 006b593 → ba269ba → 10ce559 → 14e7ab8 → d1063b6 → 4a6f8ae

---

## 2026-03-29 — Sprint 5: Scale & Performance

### Added
- **k6 load test**: `docs/performance/k6-load-test.js` — 100 VU scenario; `docs/performance/load-test-baseline.md` committed with pending note; full staging run required to close done criteria
- **Redis market data cache**: `backend/app/core/redis_client.py` — fail-open singleton (graceful if Redis unavailable), 60s TTL, cache hit/miss counters exposed on `GET /system/health`
- **Connection pool tuning**: `DB_POOL_SIZE=20`, `DB_MAX_OVERFLOW=10`, `DB_POOL_TIMEOUT=30`, `DB_POOL_PRE_PING=True` added to Settings; `create_engine_from_url()` helper in `backend/app/core/db.py`
- **Webhook support**: `POST/GET/DELETE /v1/webhooks`; `WebhookEndpoint` + `WebhookDeliveryLog` models; HMAC-SHA256 payload signing; 5-attempt exponential backoff (1m/5m/15m/60m/give-up); WORM audit event written on each delivery attempt; session-isolated `_fire_webhook` background task; 4 wired events: position.created, calculation.completed, proposal.approved, proposal.rejected
- **Horizontal scaling contract**: `docs/architecture/horizontal-scaling-contract.md`; `SYSTEM_BOUNDARIES.md` updated with multi-instance topology diagram; Redis rate limit wiring confirmed stateless

### Test evidence
- Backend: 4801 passed, 0 failed, 158 skipped
- 12 new test files; 27 files changed, 2196 insertions
- Branch feat/enterprise-sprint5-scale-perf merged to master

### Human actions required
- Run k6 full load test against Render staging (100 VUs, 5 min) — populate docs/performance/load-test-baseline.md
- Add WORKOS_API_KEY, WORKOS_CLIENT_ID to Render env vars
- Add STRIPE_SECRET_KEY_TEST, STRIPE_WEBHOOK_SECRET to Render env vars
- Add SENTRY_DSN to Render + Vercel env vars
- Run scripts/scrub-git-secrets.sh (git history scrub)
- Rotate all API keys

---

## 2026-03-28 — Sprint 4: Compliance Pipeline

### Added
- **SOC2 Evidence Table**: `compliance_evidence` WORM table (DB-level NO UPDATE/DELETE triggers); nightly export job at 02:00 UTC collecting `user_count`, `policy_change_count`, `failed_auth_count` per tenant
- **SOC2 Controls Matrix**: `docs/compliance/soc2-controls-matrix.md` — CC6/CC7/CC8/CC9/A1/C1 mapped to existing controls
- **GDPR Anonymisation Job**: nightly at 01:00 UTC; SHA-256 hashes email + full_name for accounts older than `GDPR_RETENTION_DAYS` (default 730 days); row retained for WORM FK integrity
- **GDPR Data Rights**: `GET /v1/user/data-export` (Art. 15), `DELETE /v1/user/account` (Art. 17 erasure via anonymisation)
- **GDPR DPA Document**: `docs/compliance/gdpr-dpa-status.md` — sub-processor DPA status, data flows, retention schedule
- **PostgreSQL RLS**: `backend/app/core/rls.py` — `inject_tenant_rls()` uses `SET LOCAL` (transaction-scoped, safe with async connection pool); Alembic migration `k1a2b3c4d5e6` adds RLS policies on `positions` and `calculation_runs`
- **`get_session_with_rls` dependency**: composite FastAPI Depends() that injects tenant context before yielding session
- **Vendor Security Registry**: `docs/compliance/vendor-registry.md` — 10 vendors with data classification, DPA status, fallback plans
- **DB migrations**: `j1a2b3c4d5e6` (compliance_evidence), `k1a2b3c4d5e6` (RLS policies)

### Test evidence
- Backend: 4767 passed, 0 failed, 158 skipped

### Human actions required
- Sign WorkOS DPA before enabling SSO for enterprise clients
- Verify Sentry PII scrubbing config matches gdpr-dpa-status.md requirements
- Add `GDPR_RETENTION_DAYS` env var to Render if non-default retention needed

---

## 2026-03-28 — Sprint 3: SSO + Billing

### Added
- **WorkOS SSO**: `POST /auth/sso/callback` — exchanges WorkOS code for ORDR JWT; `sso_provider` + `sso_domain` on Company model; SSO users get stub password `!sso-no-password!`
- **Stripe billing**: `POST /v1/billing/webhook` — handles `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`; STRIPE_LIVE_MODE gate; `stripe.api_key` set at startup
- **Plan enforcement**: `require_plan_tier()` FastAPI dependency (starter=0, professional=1, enterprise=2); raises HTTP 402 if company tier is below required minimum
- **Self-service signup**: `POST /v1/signup` — atomically creates Company + admin User + GENESIS audit event in one transaction; 409 on duplicate email
- **GENESIS hash chain**: `provision_tenant()` passes `prev_event_hash="0"*64` to first audit event; verified by integration tests in `test_genesis_hash_chain.py`
- **Frontend signup wizard**: `/signup` — 3-step wizard (company name -> credentials -> success); calls `POST /api/v1/signup`
- **Scalar API docs**: `GET /docs` — Scalar OpenAPI reference UI pointing at `/openapi.json`
- **DB migration**: `h1a2b3c4d5e6` — adds `sso_provider`, `sso_domain`, `stripe_customer_id`, `stripe_subscription_id`, `plan_tier` to `companies` table

### Dependencies added
- `workos>=4.0.0`
- `stripe>=8.0.0`
- `sentry-sdk[fastapi]>=2.0.0` (Sprint 2, carried through)

### Test evidence
- Backend: pytest run — 4746 passed, 0 failed, 156 skipped
- Frontend: TypeScript clean (no new errors)

### Human actions still required
- Add `WORKOS_API_KEY`, `WORKOS_CLIENT_ID` to Render env vars
- Add `STRIPE_SECRET_KEY_TEST`, `STRIPE_WEBHOOK_SECRET` to Render env vars
- Add `SENTRY_DSN` to Render + Vercel env vars (Sprint 2)
- Run Blueprint Sync on Render after render.yaml changes

---

## 2026-03-28 — Sprint 2: Infrastructure Upgrade

### Completed (automated)
- render.yaml: upgraded hedgecore + hedgecore-preview to plan: starter (eliminates cold starts)
- render.yaml: upgraded hedgecore-db + hedgecore-preview-db to plan: starter (private networking eligible)
- render.yaml: added Redis service blocks (hedgecore-redis, hedgecore-preview-redis, Starter plan, allkeys-lru)
- render.yaml: REDIS_URL wired via fromService (not secrets group) for both services
- render.yaml: added daily backup cron (02:00 UTC) + monthly restore-verify cron (01:00 UTC on 1st)
- rate_limit.py: _RedisTokenBucket.consume changed from fail-OPEN to fail-CLOSED (spec 2.3)
- rate_limit.py: import redis moved to module level for testability
- app/core/sentry_config.py: created PII-scrubbing Sentry init module (scrub_pii_before_send + init_sentry)
- app/main.py: wired init_sentry() at startup (no-op when SENTRY_DSN unset)
- requirements.txt: added sentry-sdk[fastapi]>=2.0.0
- frontend: added @sentry/nextjs, sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts
- frontend/next.config.js: wrapped with withSentryConfig (source maps gated on SENTRY_AUTH_TOKEN)
- scripts/backup/: added b2_upload.sh, backup_and_upload.sh, Dockerfile.backup
- scripts/render/: added cron_backup.sh, cron_restore_verify.sh
- docs/ops/uptime-monitoring.md: created uptime monitoring runbook
- tests: added test_rate_limit_failclosed.py (4 tests) + test_sentry_pii_scrub.py (4 tests)
- ci.yml: added SENTRY_DSN="" to pytest env for no-op path coverage

### Manual Steps Required (operator)
- Render dashboard: switch DATABASE_URL in hedgecore-secrets to internal hostname
- Render dashboard: add B2_ACCOUNT_ID, B2_APP_KEY, B2_BUCKET, VERIFY_DB_URL to hedgecore-secrets
- Render dashboard: run Blueprint Sync to provision Redis services + activate cron jobs
- BetterUptime: register production + preview monitors (see docs/ops/uptime-monitoring.md)
- Vercel: add NEXT_PUBLIC_SENTRY_DSN + SENTRY_DSN to frontend environment variables
- Sentry: create "ORDR Terminal Backend" + "ORDR Terminal Frontend" projects, get DSNs

---

## 2026-03-27 — Operations hardening: 16 gaps closed (commits 1a09c88–eba3fe9)

### Summary
Closed 16 identified operations gaps across CI/CD, backup automation, disaster recovery, monitoring, developer documentation, database maintenance, and local infrastructure. Coverage gate raised from 40% to 60% (actual 75%). All 17 plan tasks executed via subagent-driven development with spec review.

### Changes
- **CI/CD**: gitleaks secret scan job, Dependabot (pip/npm/actions), Trivy container CVE scan, coverage gate 40%→60%
- **Backup**: `scripts/backup/pg_backup.sh` + `restore_verify.sh` with size validation and table checks
- **Docs**: `backup-restore.md` (RTO=4h/RPO=24h), `disaster-recovery-plan.md` (5 playbooks), `sla-slo.md`, `monitoring-setup.md` (UptimeRobot+Sentry), `onboarding.md`, `incident-postmortem-template.md`, `data-retention-policy.md`, `db-maintenance.md`
- **Infra**: `infra/docker/docker-compose.yml` rewritten (postgres+backend+frontend dev stack), `frontend/Dockerfile` replaced (multi-stage Alpine), `output:standalone` added to `next.config.js`

### Deferred
- S-01 secret rotation (operator action), C-04 mypy hard gate, I-01 Render blueprint sync

---

## 2026-03-25 — Infrastructure hardening + live market data fix (commits d1af599–b8db71f)

### Summary
Two-session run. Resolved 11 architectural audit issues (hardening branch → master), fixed production market data pipeline, stamped production DB, and added cold-start mitigation.

### Key Fixes
- **`fix(middleware)`**: `/api/v1/market-data/live/*` added to public_prefixes in APIKeyAuthMiddleware. Was returning 401, silently falling back to exchangerate-api.com. Now live via TwelveData: EURUSD 1.1564, USDJPY 159.35, USDMXN 17.78.
- **Production DB stamp**: `alembic_version` → `2026_03_24_baseline` via direct psql (PYTHONPATH conflict with D:\StopMug forced bypass).
- **`infra(render)`**: `hedgecore-keepalive` cron — pings `/api/health` every 14 min, prevents free-tier cold-start 503s. Activate via blueprint sync.
- **Governance files committed**: `policy_rules.py` (22 SIG_* constants) + `test_kernel_governance.py` (18 tests).
- **ordr-market**: Chart engine refactor + indicators (ADX, Bollinger, Ichimoku, RSI, Supertrend, VWAP, Volume Profile).

### 11 Hardening Issues (all resolved)
1. DDL-as-code → Alembic migrations, 31-model env.py
2. Seed user rehash → bcrypt verify-before-hash
3. Deprecated `@app.on_event` → lifespan context manager
4. Alembic baseline migration created and stamped in prod
5. SQLite backdoor → WARNING log + ALLOW_INDICATIVE_FALLBACK=false in prod
6. CORS localhost → removed from production
7. Free-tier cold starts → keepalive cron (RISK-INF-01, severity MEDIUM)
8. OpenAI phantom dep → commented out
9. Redis fallback → startup observability logging
10. Tenant isolation → 18 tests (cross-tenant, SoD)
11. synex-kernel → removed from requirements.txt (private, not on PyPI)

### Test Baseline
4684 passed, 0 failed, 156 skipped

### Sprint: Live Market Data Integration — 4/7 complete
- Done: #3 sandbox autofill, #4 TwelveData wired, #5 dashboard FX verified, #6 frontend-v2 (no-op)
- Blocked: #2 IBKR (needs TWS port 4001), #7 risk closure
- Manual: #1 secret rotation (Render + Vercel dashboards)

## 2026-03-24 — Backend audit fixes + brand cleanup (commit 20612ec)
- Gated `_sync_seed_users()` to non-production ENV — prevents bcrypt rehashing on every prod boot
- Moved APScheduler into lifespan context manager; removed deprecated `@app.on_event` decorators
- Stripped localhost entries from production CORS_ALLOW_ORIGINS in render.yaml
- Solutions index page (`/solutions`) fully rewritten with 6 solution cards, platform stats, terminal panels, SVG diagram, 3-pillar proof section
- Brand cleanup: removed all "Synexiun" and GitHub references from frontend; rebranded to ORDR Terminal / ORDR Edge
- Contact page (`/contact`) overhauled: inquiry tiles, qualification form, right sidebar, ICP profiles, FAQ accordion
- ORDR Portfolio hub (`/portfolio`) created: KPI strip, currency breakdown table, run history, nav cards
- Portfolio multi-pair page wired to live `/v1/analytics/portfolio` data with LIVE/DEMO badge
- AppSidebar updated: added `/portfolio` entry, downgraded tier gate to "professional" for portfolio pages
- Tests: 4670 passed, 154 skipped, 0 failed

## 2026-03-23 — Landing page: ORDR Journal + GOLDX Coin (commit 81f255c)
- Added Section 12 (ORDR Journal) + Section 13 (GOLDX Coin) to home landing page
- Built /products/ordr-journal — equity curve SVG, P&L bar chart, 8-feature grid, live demo CTA
- Built /products/goldx — XAU/USD price chart, tokenomics donut, how-it-works, ecosystem cards
- Stats strip updated 8→10 products; hero copy updated accordingly
- Build: tsc --noEmit clean, next build clean

## 2026-03-22 — Sprint: Live Market Data Integration (commits 8f5e911, a3eb5e5)
- Removed all hardcoded BIS spot rates and carry assumptions (14 files, -432 lines)
- All provider failures now return 503 instead of stale fallback data
- Fixed Twelve Data: new key + User-Agent header on httpx client (was 403)
- Verified 5 providers live: Twelve Data, Alpha Vantage, Finnhub, exchangerate-api.com, yfinance
- IBKR fully wired (ib_insync installed, graceful fallback) — needs TWS on port 4001
- JWT_SECRET added to local backend/.env (rotate Render/Vercel env vars separately)
- Fixed StopMug editable install path collision: backend/conftest.py + pytest.ini pythonpath
- Updated 5 CIP tests to assert 0.0 (live-only contract, no hardcoded rates)
- Result: 4615 passed, 0 failed, 154 skipped
- Risk #5 closed; new sprint "Live Market Data Integration" opened (7 items)

## 2026-03-20 — Sprint Complete: Regulatory Reporting Exports (commit 62abe85)

### Summary
Full regulatory exports sprint delivered. 7 items, 6 files changed. Added export_ifrs9_xml pure service function (6th serializer, ordr: namespace). Added ISDA and FINRA-17a4 endpoints to v1_reports.py following existing EMIR/MiFID pattern. Added IFRS9-xml and ASC815-xml endpoints to v1_hedge_effectiveness.py with tenant-scoped helpers. Extended RegulatoryTab.tsx: 7-card trade-repo section + new hedge accounting section (IFRS9 + ASC815 with separate run selector). API_CONTRACTS.md updated. 4615 tests pass, frontend build clean.

### Changes
- **`backend/app/services/regulatory_export.py`**: Added `export_ifrs9_xml(run_data, results, periods, *, standard)` — XML with `ordr:` namespace, sections: header/hedgeDesignation/effectivenessResults/periods/auditTrace.
- **`backend/tests/test_regulatory_export.py`**: Added `TestExportIfrs9Xml` (11 tests), `test_isda_export_via_public_api`, `test_ifrs9_xml_round_trip`.
- **`backend/app/api/routes/v1_reports.py`**: Added `GET /{run_id}/isda` (ISDA XML, builds transactions from buckets) and `GET /{run_id}/finra-17a4` (pipe-delimited TXT, SHA-256 hash chain from AuditEvent).
- **`backend/app/api/routes/v1_hedge_effectiveness.py`**: Added `_build_ifrs9_run_data`, `_fetch_eff_run_and_dataset` helpers + `GET /runs/{run_id}/ifrs9-xml` and `GET /runs/{run_id}/asc815-xml` endpoints.
- **`frontend/src/app/reports/components/tabs/RegulatoryTab.tsx`**: ISDA + FINRA-17a4 added to FORMAT_CARDS. New `EffFormatCard` interface. `EFF_FORMAT_CARDS` (IFRS9 + ASC815). `fetchEffRuns` reads `r.run_id`. Hedge accounting section with HR divider, section header, effectiveness run selector, card grid.
- **`docs/architecture/API_CONTRACTS.md`**: Documented ISDA, FINRA-17a4, IFRS9-xml, ASC815-xml endpoints.

## 2026-03-19 — Sprint Complete: Market Intelligence & Portfolio Expansion (commit 856b576)

### Summary
Full sprint 5 options delivered in one session: watchlist backend persistence, portfolio correlation heatmap + concentration alerts + hedge recommendations, settings audit (all 12 tabs already complete), governance hash chain visualization + audit event grouping, and custom alert rules engine. 9/9 items. 5 commits. Build: 0 errors across all.

### Changes Summary
- **Option A** (05b4a00): Watchlist backend (UserWatchlist model, /v1/watchlists CRUD), useMarketTicker WebSocket hook, WatchlistsTab backend sync + localStorage fallback
- **Option B** (052b566): Portfolio Multi — 26×26 correlation heatmap, concentration bar chart with alerts, 5 hedge recommendations panel
- **Option C** (no code): Settings audit confirmed all 12 tabs fully implemented
- **Option D** (66e972a): Ledger CHAIN VIEW (blockchain block visualization), Audit Trail GROUPED VIEW (entity grouping + impact analysis)
- **Option E** (856b576): Signals Alert Rules Engine — custom rule builder, live WebSocket evaluation, cooldown enforcement, fired alerts log

## 2026-03-19 — Option A: Watchlist Backend Persistence + WebSocket Ticker (commit 05b4a00)

### Summary
Full-stack Option A complete. Watchlists now backed by PostgreSQL (`user_watchlists` table) with owner-scoped CRUD API. Frontend WatchlistsTab rewired to backend-first load with localStorage fallback and debounced save. New `useMarketTicker` WebSocket hook delivers live bid/ask/mid ticks from `/ws/market` with auto-reconnect. Build verified, 10 files changed, 651 insertions.

### Changes
- **`backend/app/models/user_watchlist.py`** (NEW): UserWatchlist model — UUID PK, user_id FK w/ CASCADE, name (unique per user), symbols (JSON), timestamps. SQLite-compat JSON type.
- **`backend/app/api/routes/v1_watchlists.py`** (NEW): CRUD router at `/v1/watchlists`. GET (list), POST (create, 409 on dupe), PUT (update symbols by ID), DELETE (404 on miss). Owner-scoped; symbols normalized to uppercase.
- **`backend/app/main.py`**: DDL for `user_watchlists` table (JSONB, UUID PK, user FK, index) added to `_ensure_tables()`.
- **`backend/app/api/router.py`**: Registered `v1_watchlists_router`.
- **`frontend/src/lib/hooks/useMarketTicker.ts`** (NEW): WebSocket hook — derives wss:// URL from `NEXT_PUBLIC_API_URL`, subscribes/unsubscribes symbol delta on change, reconnects after 3s, returns `TickMap` (bid/ask/mid/ts per symbol).
- **`frontend/src/app/market-intelligence/page.tsx`**: Passes `token` prop from `useAuth()` to `WatchlistsTab`.
- **`frontend/src/app/market-intelligence/components/tabs/WatchlistsTab.tsx`**: Full rewrite — backend-first load, localStorage fallback, background create if no server watchlists, debounced 800ms PUT save, `SyncBadge` (SYNCED/LOCAL), live price strip with ticks in symbol pills.

## 2026-03-18 — UI Polish: TradingView, Login Dark Theme, Particle Fix (commit ce9e7ef)

### Summary
Three frontend UX improvements. Dashboard Market Pulse now features a TradingView Advanced Chart with FX news feed. Login page stripped of all blue accents — now black on dark gray. Particle animation calmed from jittery to smooth drift. 152 lines changed. Build: 0 errors.

### Changes
- **`dashboard/page.tsx`**: Replaced 6-column FX rate card grid with 2-column layout: TradingView Advanced Chart widget (left, 420px, interactive watchlist for 6 FX pairs) + compact rate cards (right, 300px). Added TradingView Timeline widget for live FX news & analysis (340px). Added `useRef` import, `TradingViewChart` and `TradingViewTimeline` inline components.
- **`auth/login/page.tsx`**: Changed design tokens — `accent` from `var(--accent-cyan)` to `#888888`, `accentHover` to `#999999`, `accentGlow` to `rgba(255,255,255,0.06)`, `borderFocus` to `#555555`, `panelAlpha` to `rgba(10,10,14,0.97)`. Buttons now `#1a1a1e` with `1px solid rgba(255,255,255,0.08)` border. Top accent line uses white gradient. Particle config: speed 2.2→0.5, saturation 72→0, connectionDist 145→120, lineOpacity 0.28→0.12, hueSpeedMultiplier 5→0, hues monochrome.

## 2026-03-18 — Mission Control Dashboard Upgrade (commit a38be03)

### Summary
Transformed the Mission Control page from a basic 3-card layout into a data-rich command center. Added Market Pulse (6 FX rate cards + macro indicators), Operations (Recent Runs table + Governance Pipeline visualization), and Team Activity timeline. 491 lines added, 6 parallel API fetches with 30s auto-refresh.

### Changes
- **`dashboard/page.tsx`**: Added `SectionHeader`, `FxRateCard`, `MacroCard`, `PipelineStage`, `WidgetSkeleton` components. New `WidgetState` interface with `fetchWidgets()` fetching 6 endpoints via Promise.allSettled. Market Pulse: 6-column FX rate grid + macro indicator row. Operations: 2-column grid with Recent Runs table (5 rows) + Pipeline Status (Sandbox→Staging→Ledger). Team Activity: timeline with status dots, module tags, timestamps.

## 2026-03-18 — Admin Hub Command Center Upgrade

### Summary
Transformed admin hub into a modern professional command center with data presentation features. 742 lines of new/changed code across 7 files. Tests: 4602 passed, 0 failed. TypeScript: 0 errors.

### Backend changes
- **`v1_admin_metrics.py`**: Added `prev_period` block to GET /v1/admin/metrics — compares current window to same-length prior window (signups, DAU, calc_runs, audit_runs).
- **`v1_devops.py`**: Added `done_count` scalar to /v1/devops/status response — fixes frontend sprint progress always showing 0%.
- **`v1_admin_users.py`**: Added `POST /v1/admin/users` endpoint — superuser-only user creation (email, password, full_name, is_superuser, company_id). Returns 409 on duplicate email.

### Frontend changes
- **`MetricsTab.tsx`**: Added `TrendBadge` component (▲/▼/— with %) on all 4 trending KPI cards (signups, active users, calc runs, audit runs). 4-column KPI grid with 28px numbers. Enhanced conversion funnel: 32px gradient bars with overlaid labels + `▼ N pp drop-off` rows between steps.
- **`DevOpsTab.tsx`**: Fixed hardcoded `doneCount = 0` bug — now uses `data.done_count ?? 0`. Added `done_count?` to DevOpsData interface.
- **`UsersTab.tsx`**: Added `CreateUserModal` — email, password, full_name, superuser toggle. "+ CREATE USER" button in toolbar. POSTs to `/v1/admin/users`, prepends created user to list.
- **`RolesTab.tsx`**: Added `EditPermissionsModal` for non-system roles — full permission checklist pre-populated from current role. PUTs to `/v1/admin/roles/{id}/permissions`. "EDIT PERMISSIONS" button in right pane header, hidden for system roles.

## 2026-03-18 — Market Data TwelveData Fallback: Risk ID-2 mitigated (commit 905ef79)

### Summary
Backend live market data routes now fall back to TwelveData when IBKR is disabled (production). Previously all 5 endpoints returned 503 in production. Now: IBKR (primary) → TwelveData (institutional fallback) → 503. Tests: 4602 passed, 0 failed.

### Changes
- **`backend/app/api/routes/v1_market_data_live.py`**: Added `_get_td_provider()` lazy-init singleton. All data endpoints (fx-rates, equity-quotes, quote, fx-change) now try IBKR first, fall back to TwelveData if IBKR disabled or fails. `source` field in response reflects active provider (`"ibkr"` vs `"twelvedata"`).
- **`backend/tests/test_market_data_live.py`**: Updated all test patches to use `_get_ibkr_provider` (was `_get_provider`). Added `_td_provider` reset in fixture. Added `test_twelvedata_fallback_when_ibkr_disabled` test. Updated behavior tests: provider fail → 503 (was 502) since fallback chain exhausted. 26 tests, all passing.

## 2026-03-18 — Regulatory Reporting Fix: Risk ID-5 mitigated (commits c955f0e..b85a6c6)

### Summary
EMIR/MiFID II/Dodd-Frank exports now read real LEI data from company settings instead of hardcoded "NOT_PROVIDED". Added full regulatory settings UI. Tests: 4601 passed, 0 failed.

### Changes
- **`backend/app/api/routes/v1_regulatory_settings.py`** (new): `GET /v1/settings/regulatory` + `PATCH /v1/settings/regulatory` — reads/writes `company.settings["regulatory"]` JSONB (no migration). Returns `lei_configured` derived flag.
- **`backend/app/api/routes/v1_reports.py`**: `_build_reg_run_data()` made async, now queries company for LEI. All 3 callers (emir, mifid, dodd-frank) updated.
- **`backend/app/api/router.py`**: Registered `v1_regulatory_settings_router`.
- **`frontend/src/app/settings/types/settings.ts`**: Added `REGULATORY` tab to union, TABS, and HASH_MAP.
- **`frontend/src/app/settings/page.tsx`**: Wired `RegulatorySettingsTab`.
- **`frontend/src/app/settings/components/tabs/RegulatorySettingsTab.tsx`** (new): LEI form with 3 LEI inputs, venue code, framework checkboxes (EMIR/MIFID2/DODD_FRANK), financial counterparty toggle, status banner (green/amber), save button.
- **`frontend/src/app/reports/components/tabs/RegulatoryTab.tsx`**: LEI status banner above run selector — amber warning with link to settings when unconfigured, green badge when ready.

## 2026-03-18 — Coverage Push Round 3: +534 new tests, 68% → 75.6% (commits 6f264b0..a1737ed)

### Summary
Crossed 75% coverage target. Added 9 test files covering services and route handlers. 4601 passed, 0 failed, 75.6% coverage.

### Changes
- **`test_ep_service_coverage.py`** (40 tests): execution_proposal_service — proposal lifecycle, SoD checks, second approval, execute gate
- **`test_api_keys_service_coverage.py`** (26 tests): create/rotate/revoke/verify API keys
- **`test_pipeline_db_coverage.py`** (51 tests): proposal/staging/ledger CRUD, converters
- **`test_rbac_service_coverage.py`** (31 tests): roles, permissions, hierarchy — 100% coverage
- **`test_snapshot_services_coverage.py`** (78 tests): geo/volatility/options/market snapshot services
- **`test_positions_coverage.py`** (45 tests): all v1_positions endpoints
- **`test_policies_coverage.py`** (38 tests): all v1_policies endpoints
- **`test_pipeline_routes_coverage.py`** (48 tests): staging/ledger/replay pipeline routes
- **`test_risk_analytics_coverage.py`** (43 tests): VaR, stress, scenario, exposure endpoints
- **`test_audit_lab_routes_coverage.py`** (51 tests): all 13 audit lab endpoints
- **`test_export_routes_coverage.py`** (32 tests): export positions/runs/policy/audit
- **`test_reports_routes_coverage.py`** (43 tests): saved reports CRUD, schedules, regulatory exports
- **`test_hedge_effectiveness_coverage.py`** (34 tests): dataset upload, assessments, IFRS9, evidence binder

## 2026-03-18 — Coverage Push Round 2: +143 new tests, 66% → 68% (commits a01ec25..6f264b0)

### Summary
Added 3 new test files covering pipeline service, execution proposals routes, and v1_calculate routes. 4041 passed, 0 failed, 68% coverage.

### Changes
- **`tests/test_pipeline_service_coverage.py`** (45 tests): sandbox_calculate, proposal creation/staging/ledger ops
- **`tests/test_execution_proposals_coverage.py`** (62 tests): all proposal endpoints, auth rejection, approve/reject flows, MFA gate, SoD checks
- **`tests/test_calculate_coverage.py`** (36 tests): calculate endpoint, input validation, RBAC, rate limit, schema gate, market snapshot path, list/get runs

## 2026-03-18 — Coverage Push: +243 new tests, 64% → 66% (commits 4eecf5d..a01ec25)

### Summary
Added 4 new test files covering dashboard routes, engine modules, auth routes, and policy service. 3901 passed, 0 failed, 66% coverage.

### Changes
- **`tests/test_dashboard_routes.py`** (39 tests): dashboard summary, recent-runs, pending-approvals, team-activity, aggregate — auth rejection + happy paths + helper unit tests
- **`tests/test_engine_coverage.py`** (165 tests): `strategy_selector.py` helpers (`_as_*`, `_clamp01`, axis helpers, `select_strategies`) + `instrument_catalog.py` validators and models
- **`tests/test_auth_coverage.py`** (21 tests): register validation, login failures, refresh bad token, `/me` auth checks, logout
- **`tests/test_policy_service_coverage.py`** (19 tests): get_active_policy, list_revisions, activate_policy, create/update/delete template, deactivate

### Note
Engine agent surfaced pre-existing bug: `strategy_selector.py` references `DisclosureCode.DISCLOSED_AXIS_ALIAS_MAPPING` which doesn't exist in the enum — any alias-mapped axis call raises `AttributeError`. Flagged, not introduced.

## 2026-03-18 — Test Suite Hardening (commit f083b1d, pushed to master)

### Summary
Resolved 22 cross-test contamination failures. Test baseline: 3658 passed, 0 failed, 150 skipped (PG-only), 64% coverage. Coverage risk mitigated.

### Changes
- **`backend/tests/conftest.py`**: Added `reset_rate_limiter_state` autouse fixture — traverses `app.middleware_stack` to find `RateLimitMiddleware` instance and clears `_buckets` before/after each test. Fixes spurious 429 contamination across test files.
- **`backend/tests/test_report_studio_governance.py`**: Fixed 9 hardcoded `FXDemo` absolute paths → `TreasuryFX`. Tests had been copied from sibling project without updating paths, causing `FileNotFoundError` on all 34 governance assertions.
- **`backend/tests/test_security_config.py`**: Fixed `parents[3]` → `parents[2]` for repo root resolution. `.gitignore` lives at `TreasuryFX/` (2 levels up from tests/), not `HedgeCalc/` (3 levels).

### Validation
- Full suite: `3658 passed, 0 failed, 150 skipped in 22s`
- Coverage: 64% (up from 59%, risk ID 3 mitigated)

## 2026-03-18 — Audit Lab UX Overhaul (6 commits, pushed to master)

### Summary
Complete UX overhaul of the Audit Lab section — rebuilt as a trust-building first-impression surface for prospective clients. Six chunks delivered via subagent-driven development with two-stage spec + quality review per chunk.

### Changes
- **`frontend/src/lib/fixtures/audit-lab-demo.ts`**: Enriched `DEMO_DATASET` — markupByMonth (3 months), 11 transactions with `spread_classification`, 3 findings, 3 trustSignals; `getDemoCounterpartyStats()` helper
- **`frontend/src/app/audit-lab/demo/page.tsx`**: Rebuilt from 80→230 lines — six-act narrative: hero h1, 4-cell KPI strip, MarkupByMonthChart (ECharts, SSR-safe dynamic()), CounterpartyMatrix callout, findings with SevBadge, trust rail, CTA → signup/login, disclaimer
- **`frontend/src/app/audit-lab/upload/page.tsx`**: Added `downloadSampleCsv()`, `lastYearPeriod()` helpers; sample CSV download button; renamed progress steps; hidden UUID; benchmark tooltip; enriched upload success banner
- **`frontend/src/app/audit-lab/page.tsx`**: Removed BETA badge; datasets empty state with guided "Upload" CTA + "See a sample result" link; run list shows source filename + period + row count from `datasetMap`
- **`frontend/src/app/audit-lab/runs/[run_id]/page.tsx`**: 5-KPI grid, export hierarchy (Board Summary primary / Evidence Binder secondary / XLSX tertiary), SHA-256 hash badge (12-char preview + full title), expandable findings rows with `React.Fragment key`, Verification tab with tamper-evident context block
- **`frontend/src/components/layout/AppSidebar.tsx`**: "Activity Log" label (was "Audit Trail") to fix naming collision with governance `/audit-trail`
- **`frontend/src/app/audit-lab/audit-trail/page.tsx`**: Title/heading renamed to "Activity Log"; breadcrumb updated

### Validation
- `npx tsc --noEmit` — EXIT:0 (clean)
- `npx next build` — all pages compiled successfully
- Pushed: `bd39911..dfbc180` → origin/master (7 commits including frontend-v2 deletion)

## 2026-03-15 — Simulation Lab Live Data Wiring

### Summary
Fixed the Simulation Lab (`/sandbox`) to use live market data from the app's actual data sources instead of static BIS/EOD hardcoded values.

### Changes (commit bd39911)
- **`frontend/src/app/sandbox/page.tsx`**:
  - Fixed critical GET→POST bug in `useLiveSpot`: was calling `GET /api/market-autofill` (405 always) — changed to `POST` with JSON body
  - Extracted `fetchLiveMarket(currency, tradeDates)` helper: calls `POST /api/market-autofill` returning full `LiveMarketData` (spot + forward_points + provider_metadata)
  - `handlePairChange`: now async, injects live market snapshot into `CalculateRequest` before dispatching to engine
  - Auto-run effect: fetches live market before initial calculation, falls back to demo fixtures only if API unreachable
  - `liveRefreshed` effect: silently re-runs calculation when live data arrives after render if result used fallback data
  - Compliance badges: IFRS 9 now tied to actual `coverageRatio` (80–125%), others show grey until calculation runs, MiFID II RTS 25 reflects actual live data status

### Data Flow (after fix)
`POST /api/market-autofill` → IBKR `GET /v1/market-data/live/fx-rates` (primary) → exchangerate-api.com (fallback) → BIS demo (last resort)
Forwards: Finnhub CME futures (primary) → carry-differential estimate (fallback)
Injects: `market.spot_rate`, `market.forward_points_by_month`, `market.provider_metadata` into `CalculateRequest` before `POST /sandbox/calculate`

---

## 2026-03-15 — Admin Hub (8-Tab Unified Admin Section)

### Summary
Replaced two broken admin pages (`/admin-monitor`, `/devops`) with a unified, fully-tested 8-tab Admin Hub at `/admin`.

### Frontend (10 commits: 279ee8f → b8aa115)
- **`frontend/src/app/admin/page.tsx`** (new): Hub shell — PageShell, two-layer superuser auth gate (DeniedCard), tab routing via `?tab=` URL param, lazy `dynamic()` imports for all 8 tabs
- **`frontend/src/app/admin/components/AdminTabBar.tsx`** (new): 8-tab bar with cyan active underline, exports `AdminTab` union type
- **`frontend/src/app/admin/components/tabs/OperationsTab.tsx`** (new): Health KPIs, service status, DB tables, engine modules, error summary, live activity feed — 30s auto-refresh, restart actions
- **`frontend/src/app/admin/components/tabs/UsersTab.tsx`** (new): Paginated cross-tenant user table, search, edit drawer, REVOKE SESSIONS 2-step confirm
- **`frontend/src/app/admin/components/tabs/TenantsTab.tsx`** (new): Tenant list, create modal (auto-slug, 400 inline error), edit drawer, SUSPEND confirm
- **`frontend/src/app/admin/components/tabs/RolesTab.tsx`** (new): Two-column RBAC catalog, permission groups, create role modal with checklist
- **`frontend/src/app/admin/components/tabs/ApiKeysTab.tsx`** (new): Create/revoke flow with show-once token + COPY, audit log, DELETE 204 handling
- **`frontend/src/app/admin/components/tabs/MetricsTab.tsx`** (new): KPI cards, CSS funnel chart, period selector (7d/30d/90d), activity feed
- **`frontend/src/app/admin/components/tabs/ConfigTab.tsx`** (new): 4 independent sections (feature flags, maintenance mode, rate limits, CORS) with IN-MEMORY badges + per-section SAVE
- **`frontend/src/app/admin/components/tabs/DevOpsTab.tsx`** (new): Sprint progress, risk heat map, architecture freeze, sessions, decisions, validations — 30s auto-refresh
- **`frontend/src/components/layout/AppSidebar.tsx`**: Admin nav updated to `/admin`
- Deleted: `frontend/src/app/admin-monitor/`, `frontend/src/app/devops/`

### Backend tests (5 commits)
- **`backend/tests/test_admin_users_v1.py`**: 7 tests (GET, PATCH, revoke-sessions, auth)
- **`backend/tests/test_admin_tenants_v1.py`**: 5 tests marked `@requires_postgres` (ANY() syntax)
- **`backend/tests/test_admin_roles_v1.py`**: 5 tests (roles, permissions, auth)
- **`backend/tests/test_admin_config_v1.py`**: 7 tests (GET, PATCH feature flags, maintenance, CORS)
- **`backend/tests/test_admin_metrics_v1.py`**: 11 tests marked `@requires_postgres`
- **`frontend/e2e/admin.spec.ts`**: E2E spec covering all 8 tabs

### Validation
- 19 backend admin tests pass on SQLite; 16 skip (requires_postgres — correct)
- TypeScript: `npx tsc --noEmit` — zero errors
- Next.js build: clean
- Pushed to master (f4202d6)

---

## 2026-03-15 — Governance Section UI/UX Overhaul

### Summary
Fixed broken layouts across all 5 governance pages (Staging Queue, Ledger, Run Viewer, Position Lineage, Hedge Wiki).

### Commits: 76aa215
- **`frontend/src/app/staging/page.tsx`**: Removed outer flex wrapper, added noPadding + refresh + cross-links
- **`frontend/src/app/ledger/page.tsx`**: Complete rewrite — inline-styled table, PASS/WARN badges, cross-links
- **`frontend/src/app/run-viewer/page.tsx`**: Removed redundant chrome layers, added wiki link
- **`frontend/src/app/lineage/page.tsx`**: Added PageShell wrapper + HelpPanelV2 layout
- **`frontend/src/app/hedgewiki/page.tsx`**: Fixed outer div, updated breadcrumb to Governance

---

## 2026-03-15 — Audit Lab POST /runs HTTP 500 Fix

### Root Cause
- asyncpg infers `TIMESTAMPTZ` OID for `market_snapshots.as_of` column; passing Python `str` values for `buffer_start`/`buffer_end` raises `DataError: invalid input for query argument $2: expected datetime.date, got 'str'`

### Fix (5 commits: a0ca117, 26b9c1a, 77ca4ed, 3abd259, 30b3c6f)
- **`v1_audit_lab.py`**: Pass `buffer_start`/`buffer_end` as `datetime.date` objects (removed `str()` wrapping); added `CAST()` for all UUID/JSONB params in `audit_runs`, `audit_findings`, `audit_reports` INSERTs; `create_audit_run` thin wrapper + `_create_audit_run_inner` for error surfacing
- **`test_audit_lab_upgrade.py`**: `inspect.getsource(_create_audit_run_inner)` instead of wrapper
- **`main.py`**: Debug exception handler (reverted to safe form in final commit)

### Validation
- 442/442 audit_lab tests pass (`python -m pytest tests/ -k audit_lab -q`)
- Render deploy pending manual trigger

---

## 2026-03-15 — IBKR Gateway Live Data + WebSocket Streaming for ORDR Market Charts

### IBKR Real-Time Data Pipeline (ordr-market)
- **`backend/app/services/market_stream.py`** (new): `MarketStreamManager` singleton — dedicated IB connection (clientId+20), IBKR `reqMktData` streaming via `pendingTickersEvent`, fallback to 1.5s snapshot polling if Gateway unreachable
- **`backend/app/api/routes/v1_ws_market.py`** (new): Public WebSocket at `/ws/market` — subscribe/unsubscribe/ping protocol, 30s keepalive
- **`backend/app/api/router.py`**: Registered WS router
- **`backend/app/main.py`**: Stream manager shutdown wired into lifespan finally block
- **`ordr-market/src/hooks/useMarketWebSocket.ts`** (new): Frontend WS hook — auto-reconnect (3s), symbol re-subscribe without reconnect, `ws://`↔`wss://` auto-derived from `NEXT_PUBLIC_API_URL`
- **`ordr-market/src/components/workspace/ChartCore.tsx`**: Replaced mock data generator with real IBKR data — `usePublicChartData` for historical OHLCV bars, `useMarketWebSocket` for live tick updates to last bar
- **`ordr-market/.env.local`** (new): `NEXT_PUBLIC_API_URL=http://localhost:8000`
- **NEXUS** (ordr-market): First-time init — 28 tables, 8 agents, genesis seeded

### Test Evidence
- Backend: `3545 passed, 0 failed` (excl. 2 pre-existing unrelated failures)
- TypeScript: `tsc --noEmit` clean

## 2026-03-14 — IBKR Paper Trading + Colorful Login (commit 732b2a0)

### IBKR Integration (ADR-0005)
- **IBKRExecutor service** (`ibkr_executor.py`): ib_insync-based FX order execution with connect/disconnect, contract resolution cache, MKT/LMT orders, fill-wait with timeout, batch execution
- **3 API endpoints** (`v1_ibkr.py`): GET /v1/ibkr/status, POST /v1/ibkr/connect, POST /v1/ibkr/execute
- **PhaseExecute rewrite**: Removed Live Market Snapshot section, added IBKR execution flow with confirmation overlay, fill tracking, weighted avg price, auto-HEDGED position marking
- **ADR-0005**: Documents broker execution exception for paper trading (v1 freeze extension)
- **56 new tests**: 35 executor service + 21 route tests, all passing

### Login Page
- **Colorful particle field**: useParticleField hook extended with HSL color-shifting mode (treasury pastels: cyan, blue, lavender, teal, rose, mint), sinusoidal oscillation between white and accent hues
- Login page canvas opacity 0.6→0.7, saturation 35, lightness 86

## 2026-03-14 — Deep Security Audit: Admin + Hedge Desk + Pipeline (commit af2357a)

### Admin Section (10 criticals fixed)
- **Unauthenticated DB wipe**: `seed-companies` gated behind `require_superuser` + production env block
- **WORM compliance**: Removed DELETE/TRUNCATE on audit_events, calculation_runs, policy_revisions
- **Credential leak**: Stripped plaintext passwords from seed response
- **API key creation**: Delegated to service with proper Argon2id hashing (was missing secret_hash)
- **API key auth escalation**: Replaced `validate_api_key` with `require_superuser` on management endpoints
- **Dual Base class**: `api_key_audit.py` now uses `app.core.db.Base` (was invisible to migrations)
- **Token version**: JWT `ver` claim now validated in `get_current_user` — forced logout works
- **Auth consolidation**: 3 files fixed to import `get_current_user` from `dependencies.py` (not `security.py`)
- **Frontend auth gates**: admin-monitor + devops pages guard data fetches before superuser check

### Hedge Desk Pipeline (5 criticals fixed)
- **Tenant isolation**: `company_id` column added to `proposals` + `ledger_entries` tables
- **Scoped queries**: `list_proposals`, `get_proposal`, `list_ledger`, `get_ledger` all filter by tenant
- **RBAC**: All proposal + ledger endpoints now require permission checks

### Hedge Desk Workflow (6 high fixes)
- **Data flow**: `calcResult` stores full object (marketSnapshot no longer lost between phases)
- **Currency**: PhaseExecute extracts currency from bucket dynamically (was hardcoded MXN)
- **CME_SPECS**: Consolidated into shared `tokens.ts` (was duplicated in Review + Execute)
- **Execution safety**: Confirmation overlay before irreversible HEDGED marking
- **Hash chain**: Pipeline events query prev hash per-tenant (was always GENESIS_HASH)
- **Terminal guard**: Block field mutations on HEDGED/REJECTED positions

### Backend Hardening (3 high fixes)
- **Dual-key**: Removed route-layer override — service is single source of truth
- **Governance default**: `"solo"` → `"team"` (fail-closed SoD)
- **DB models**: `__import__` hack removed, int→UUID FK types fixed, Float→Numeric for monetary columns

### Evidence
- 95 new tests across 6 test files
- 3475 backend tests passed, 134 skipped, 0 failed
- Frontend TypeScript clean, build passes
- 35 files changed, +2015 -206 lines

## 2026-03-14 — Marketing Site Redesign: Tailwind + SVG Diagrams (commit 88af206)
- **Full redesign**: Replaced inline-style C/F theme system with Tailwind CSS classes and enterprise grid aesthetic.
- **Home page**: 12 sections with 3 inline SVG diagram components (SvgArchitecture 3-layer platform, SvgHashChain WORM audit blocks, SvgPillars 5 infrastructure pillars).
- **Custom CSS**: `bg-grid`/`bg-grid-dark` patterns, `section-label` with `::before` dash, `mkt-card` hover top-border animation, `status-dot` with `pulse-dot` keyframe.
- **Nav rebuild**: Products/Solutions mega-dropdowns with icons, ORDR Market removed as standalone link (only in Products dropdown). Mobile overlay simplified.
- **Footer rebuild**: 5-column dark layout (brand+status, products, solutions, company, legal) with external link support.
- **Secondary pages**: About (Engine/AI panels, Core Values, Numbers Strip), Contact (form+cards+system status), Products index (2-col grid with AI Boundary boxes).
- **Product CTAs**: All "Get Started" → "Request Demo", /auth/login → /contact across 5 product detail pages.
- **Layout**: MarketingLayout simplified (no C/F imports), theme.ts preserved for product detail backward compat.
- 15 files changed, +889 -1630 lines (-741 net).

## 2026-03-13 — ORDR Market Embedded Mode + Workspace Refactor (commit 99ef12b)
- **ChartEngine embedded mode**: 12 new props for external config sync (indicators, sub-panes, chart type, drawing mode, magnet/hide/lock/delete-all).
- **Theme**: `syncThemeWithCSS()` for CSS variable integration.
- **priceLine**: New `drawIndicatorLegend()` for sub-pane indicator labels.
- **IndicatorsPanel**: Expanded with category groups and search filtering.
- **WorkspaceProvider**: External state management for embedded chart integration.
- **ChartCore/CommandBar**: Refactored for workspace integration, simplified rendering.
- 16 files changed, +1056 -733 lines.

## 2026-03-13 — Professional FinTech Marketing Website (commit 7bb2a2d)
- **Landing page**: Complete rewrite with 10 animated sections — ticker tape, metrics counters, scroll-triggered animations, hero gradient, feature grid, use cases, CTA.
- **7 product pages**: Treasury, Market, Portfolio, Labs, Polisophic, HedgeWiki, FinHub — each with hero, animated metrics, feature cards, use cases, CTA.
- **6 solution pages**: Corporate Treasury, Risk Management, Asset Management, Banking, Insurance, Energy — industry-specific content with relevant product mapping.
- **Pricing**: 3 tiers (Essentials $299/mo, Professional $799/mo, Enterprise custom) with feature comparison and FAQ.
- **About**: Company story, leadership team (4 executives), values section.
- **Contact**: Form with role selector + contact info cards.
- **Shared infra**: `MarketingLayout` (nav+footer wrapper), `MarketingNav` (529L, product/solution dropdowns, mobile hamburger, theme toggle), `MarketingFooter` (271L, 5-column layout), `theme.ts` (DARK/LIGHT presets, fonts), `useMarketingTheme` hook.
- **ClientProviders**: `/products`, `/solutions`, `/pricing`, `/about`, `/contact` added as public route prefixes.
- **Fix**: React hooks rules violations — `useCounter` in `.map()` callbacks replaced with `MetricCounter` component across all 7 product pages.
- 25 files changed, +5647 -420 lines.

## 2026-03-13 — Report Studio: Formal Narratives + Library Bridge (commit bb0c613)
- **Library → Studio bridge**: Fixed dead `onSelectPreset` callback — clicking a preset in Library now loads it into Studio tab via `pendingPresetId` state.
- **Narrative engine**: 7 generators producing multi-paragraph institutional prose (executive summary, exposure, hedge efficiency, scenario, compliance, VaR, hedge accounting).
- **NarrativeSection component**: Shared renderer with type-coded left borders (OVERVIEW/ANALYSIS/FINDING/METHODOLOGY/RECOMMENDATION/DISCLAIMER).
- **Enhanced panels**: 5 report panels now render narrative sections below existing metrics.
- **Tests**: 135+ new tests — 65 unit (reportCalcs), 40 narrative, 30+ workflow.

## 2026-03-13 — UIUXSRC Portable Design System (commit bae6972)
- **New package**: Created standalone `UIUXSRC/` design system — portable, framework-agnostic UI component library.
- **7 theme presets**: Treasury Dark, Midnight, Slate, Arctic, Bloomberg, Nord, Solarized — all with CSS variable tokens.
- **13 components**: Button, ActionButton, Card, KpiTile, KpiStrip, StatusChip, EmptyState, Spinner, Icon, PageHeader, PageShell + ThemeProvider + contrast validator.
- **Integration guide**: `CLAUDE.md` (253 lines) with usage patterns, token reference, component API docs. `README.md` with quick start.
- **Design tokens**: `tokens.ts` (centralized S object), `globals.css` (341 lines of CSS variables), WCAG contrast validation utility.
- **Research**: `UIUX Research/` added with deep-research-report.md + Treasury Software Color Theme Research.docx.
- 20 new files, +2595 lines. No build impact (standalone package).

## 2026-03-13 — Stale Route Cleanup (commit 4458175)
- **Fix**: Updated 8 files with dead references to `/market-overview` and `/fx-market` after page deletion.
- **Files**: dashboard/page.tsx, help/page.tsx, Nav.tsx, DashboardHelpPanel.tsx, CommandHubWidget.tsx, QuickActionsWidget.tsx, ClientProviders.tsx, helpContent.ts.
- All routes now point to `/market-intelligence` with appropriate tab params.

## 2026-03-13 — Unified Market Intelligence Dashboard (commit 243febf)
- **Consolidation**: Replaced 3 disconnected market pages (`/market-intelligence`, `/market-overview`, `/fx-market`) with single tabbed Market Intelligence Dashboard at `/market-intelligence`.
- **6 tabs**: Overview (5-layer command page: ticker tape, hotlists, heatmap, calendar, breadth, sectors, technicals, news), Heatmap (full-viewport with Stocks/ETFs/Forex/Crypto selector), Calendar (economic events), Companies (symbol search + overview + technicals), Watchlists (localStorage persistence + screener + mini charts), Signals (passive technicals grid + news stream).
- **New components** (17 files): `TradingViewWidget.tsx` (generic script-injection embed wrapper), `MarketTabBar.tsx`, `MarketControlBar.tsx`, `types.ts`, 5 overview sub-components (LeftColumn, CenterColumn, RightColumn, BelowFoldModules, MarketPulseStrip), 6 tab components (OverviewTab, HeatmapTab, CalendarTab, CompaniesTab, WatchlistsTab, SignalsTab).
- **Sidebar**: MARKET section updated from 3 separate items to 6 tab-linked items, prefixes narrowed to `["/market-intelligence"]`.
- **Deleted**: `market-overview/page.tsx`, `fx-market/page.tsx`.
- **Build**: PASS (next build clean). No backend changes.

## 2026-03-12 — ORDR Market Workspace Redesign (ordr-market/)
- **Full UI rebuild**: Replaced dark-theme top-bar + raw ChartEngine mount with institutional light-theme trading workstation shell
- **New workspace/ layer** (4 files, 1,485 lines): `tokens.ts` (design system), `primitives.tsx` (7 atomic components), `MockCandleChart.tsx` (Canvas 2D chart), `ChartWorkspace.tsx` (shell assembly)
- **Layout**: 40px top bar · 40px left drawing rail (20 tools) · flex chart canvas · 40px right utility rail · 28px bottom strip — chart occupies ~88% viewport
- **Design system**: Cool neutral palette (`#F0F3FA` / `#FAFBFE`), muted blue/salmon candles, Inter + JetBrains Mono fonts, token-driven spacing/radii/shadows
- **Canvas chart**: 250-bar mock OHLCV, 7px narrow candles, S/R dashed levels, ghost watermark, price/time axes, volume zone, ResizeObserver responsive
- **Interactive states**: Hover/active on all buttons, floating drawing palette on draw-mode activation, paper trading toggle, timeframe + chart-type selectors
- **Build**: Clean — 0 TS errors, 0 warnings. Merged PR #1 → master. Deployed to Vercel (auto).

## 2026-03-09 — Audit Lab Canonical Truth Pass
- **Reclassification**: Prior "37/40 production-ready" claim corrected to conservative truth: 3/40 OPERATIONALLY PROVEN, 33/40 CODE COMPLETE (synthetic data only), 3/40 PARTIAL, 1/40 STUB/BLOCKED.
- **Mandatory downgrades**: Items 5 (source-inspection test), 21 (programmatic XLSX), 22 (mocked pdfplumber), 25 (hand-crafted SWIFT fixture), 26 (synthetic forward points), 37 (unvalidated ISDA/FINRA schemas) → CODE COMPLETE. Item 29 (benchmark provider never imported) → STUB/BLOCKED.
- **P3 reclassified**: Document parsing foundation, not OCR-grade document intelligence.
- **P6 reclassified**: Regulatory format stubs, not schema-validated compliance exports.
- **Canonical truth memo**: `docs/audits/2026-03-09-audit-lab-canonical-truth-memo.md`
- **State files corrected**: CURRENT_STATE.md inflated claims removed, new HIGH risk added for real-data gap.

## 2026-03-09 — Audit Lab Blocker Fixes + P4 Pipeline Integration + 1-to-1 Audit
- **Blocker: Regulatory export** — ISDA XML now loads actual transactions from audit_transactions (not findings), builds proper SELL/BUY trade legs, includes `<auditSummary>` section with findings count/total. FINRA 17a-4 field mappings fixed (finding_id, timestamp, category, severity, description).
- **Blocker: Review queue** — Backend `GET /review-queue` endpoint returns low-confidence transactions (confidence < 0.8) with RBAC `audit.review` permission. `POST /review-queue/{id}/resolve` supports approve/reject/correct (WORM-safe append). Frontend fully upgraded from stub run-list to functional confidence-based review interface with KPIs, filter tabs, color-coded confidence cells, approve/reject buttons.
- **Blocker: Run detail response** — Now returns `rate_variance_results`, `counterparty_scores`, `natural_hedges`, `outlier_count` from report_json (was missing analytics fields).
- **Blocker: Trends endpoint** — Now includes `counterparty_breakdown` aggregate for frontend trend dashboard.
- **P4 Item 26 (Forward Points)** — `forward_points` field on BenchmarkEntry, applied in `_compute_markup()` when `value_date != trade_date`.
- **P4 Item 27 (Intraday)** — `trade_time` field on AuditTransactionInput (structural only, no hourly matching logic).
- **P4 Item 28 (Cross-Rate)** — `_synthesize_cross_rate()` wired into `_compute_markup()` as fallback before rejection. Synthetic benchmarks tagged `SYNTHETIC_CROSS`.
- **P4 Item 30 (Size Normalization)** — `size_adjusted_markup_bps` on MarkupFinding, computed during markup analysis against 3-tier expected spreads.
- Tests: +53 new (20 P4 engine + 33 review queue/regulatory). Total: 3157 passed, 134 skipped, 0 failed. Frontend build clean.

## 2026-03-09 — Audit Lab Production Hardening Sprint
- **Dataclass fix**: `spread_classification` field moved after required fields (Python dataclass ordering rule)
- **SQLite compat**: bid_rate/ask_rate benchmark query wrapped in try/except fallback
- **RBAC permissions**: 4 new permissions registered (audit.review, audit.export, audit.schedule, audit.benchmark_fetch) + role mappings for supervisor/risk_analyst
- **Analytics wiring**: `_detect_outliers()`, `_score_counterparties()`, `_detect_natural_hedges()` now called inside `run_audit_engine()` with results stored in `AuditEngineResult`
- **Finding persistence**: OUTLIER findings now persisted to audit_findings WORM table; report JSON includes analytics data
- **Rename**: `UnhedgedImpactResult` → `RateVarianceResult`, `UNHEDGED_IMPACT` → `RATE_VARIANCE` finding type, `total_unhedged_impact_usd` → `total_rate_variance_usd` — all with `@property` backward compat aliases
- **Exposure gap**: pair normalization fixed (alphabetical sort, not concatenation order)
- **Pydantic schemas**: Updated with rate_variance, analytics fields, backward compat
- **Frontend**: Run detail page updated for rate_variance + analytics types
- **Tests**: +53 upgrade tests (RBAC, exposure gap, spread classification) + 35 parser fixture tests with real sample files
- Validation: 3104 passed, 134 skipped, 0 failed. Frontend build clean.

## 2026-03-09 — Audit Lab Institutional Upgrade (40 items, P0-P6)
- **P0 Foundation** (Items 1-7): Alembic migration with FK constraints + 4 composite indexes on audit tables. ORM models for 5 audit tables (`audit_lab.py`). Batch INSERT replacing per-row loop. Date range filter ±30 days on market_snapshots. 10MB file size limit. Admin metrics `uploaded_by→created_by` + status case fix. Benchmark staleness limit (7-day default, configurable).
- **P1 Markup Methodology** (Items 8-13): Signed markup (removed `abs()`) with ADVERSE/FAVORABLE/AT_MARKET direction. Bid/ask columns on market_snapshots (migration + model). Within-spread classification (WITHIN_SPREAD/OUTSIDE_SPREAD/SPREAD_UNKNOWN). MXN default removal (fail-closed on null currency). CSV preview component. Transaction drill-down endpoint + 5th tab.
- **P2 Visualization + Reporting** (Items 14-20): MarkupByMonthChart (ECharts bar), RateScatterChart (scatter), CounterpartyMatrix (heatmap). Client-side PDF/XLSX/CSV export (`auditLabExport.ts`). Run comparison page. "unhedged_impact" → "rate_variance" rename noted (backward compat).
- **P3 Document Intelligence** (Items 21-25): Shared parser module (`audit_lab_parsers.py`) with XLSX/PDF/SWIFT MT300 parsers. Field confidence scoring (CSV=1.0, XLSX=0.8-1.0, PDF=0.5-0.9, SWIFT=0.95). Review queue stub page.
- **P4 Market Data Depth** (Items 26-30): Forward point integration in engine. Cross-rate synthesis (EUR/GBP via USD legs). Trade-size spread normalization with 3-tier thresholds. Benchmark provider abstract interface + stubs (Refinitiv, Bloomberg, Alpha Vantage). Intraday rate support (trade_time field).
- **P5 Advanced Analytics** (Items 31-35): Z-score outlier detection per pair. Counterparty best execution scoring (composite 0-100). Natural hedge detection (offsetting same-day flows). Exposure gap analysis endpoint. Trend analysis endpoint.
- **P6 Regulatory + Governance** (Items 36-40): Board-ready executive summary PDF function. ISDA XML + FINRA 17a-4 export stubs. Audit trail page. Schedule CRUD service. Trend dashboard page.
- **Cross-cutting**: Pydantic response models for all endpoints (`schemas_v1/audit_lab.py`). Upload switched from raw `fetch()` to `dashboardFetch()`. 3 new sidebar nav items (Compare, Audit Trail, Trends). Methodology version bumped to 1.1.0.
- Net: +3200 lines backend, +1800 lines frontend. 18 new backend files, 8 new frontend files. 44 new tests.
- Validation: 3051 passed, 134 skipped, 0 failed. Frontend build clean.

## 2026-03-08 — Policy Engine Post-Reconstruction Hardening (7 phases)
- **Phase 1** (forward curves): Created `forward_curve_service.py` + `v1_forward_curves.py` — 4 RBAC-gated endpoints (POST create, GET by id, GET latest/{pair}, GET pair/{pair}). Hash-idempotent CRUD, 24h staleness evaluation (V-023), data provenance classification (LIVE/DELAYED/INDICATIVE/SYNTHETIC). Tests: hash determinism, staleness, provenance validation.
- **Phase 2** (wizard deepening): Extended `policy-ai/route.ts` AI system prompt with `extended_policy` schema (6 sections: volatility, scenarios, decision_gate, netting, instruments, effectiveness). Added response parsing with validation/clamping (lookback_days [20,252], var_confidence [0.90,0.99], max_cost_bps [25,150]). Output now ExtendedPolicyConfig-level, not preset-shaped.
- **Phase 3** (volatility overlay): Created `vol_overlay.py` (Layer 2) — band widening by vol regime (LOW=0.9, NORMAL=1.0, ELEVATED=1.15, CRISIS=1.30), ratio adjustment (clamp cur/base [0.85,1.15]), region-aware fallback vols (G10=8%, EM_LATAM=14%, EM_ASIA=10%, EM_CEEMEA=16%). Created `volatility_snapshot_service.py` + `v1_volatility_snapshots.py` (3 endpoints). 24 tests: parity (4), regime (7), widening (5), adjustment (6), fallbacks (5).
- **Phase 4** (geopolitical overlay): Created `geo_overlay.py` (Layer 3) — linear ratio haircut when corridor risk score exceeds escalation threshold (default 0.7, max haircut 10%). Created `geo_snapshot_service.py` + `v1_geo_snapshots.py` (4 endpoints). 26 currency pairs mapped to geopolitical corridors. 18 tests: parity (4), corridors (4), haircut math (6), application (3), active overlay (4).
- **Phase 5** (backtesting): Created `backtesting.py` — deterministic single-period evaluation (hedged/unhedged PnL, effectiveness, cost), multi-period backtest with max drawdown + aggregate metrics, policy comparison with recommendation. SHA-256 report hash. All labeled `grading: 'HEURISTIC'`. 13 tests: period eval (5), multi-period (5), comparison (2), edge cases (1).
- **Phase 6** (netting overlay): Created `netting_overlay.py` (Layer 6) — same-pair/same-flow-type netting (conservative), cross-flow netting (aggressive, opt-in), savings tracking (~3% margin savings Almgren-Chriss estimate), legs eliminated tracking. 12 tests: parity (4), netting (7), active overlay (2).
- **Phase 7** (governance hardening): Wired `apply_second_approval()` in execution_proposal_service — enforces SoD (second approver ≠ maker AND ≠ primary checker), chained hash linking to approval_hash. Added `_determine_second_approval_required()` ($1M threshold). Added dual-key gate in `execute_approved_proposal()`. Created 15 dual-key E2E tests + 12 multi-tenant isolation tests.
- **Route registration**: All 3 new route modules registered in `api/router.py` (219 total routes).
- **Whitepaper**: Created `overlay-activation-contracts.md` — activation contracts for all overlays with parity proofs, fallback behavior, grading labels.
- **Overlay parity**: ALL overlays neutral by default (disabled). When disabled: multipliers=1.0, adjustments=[], haircut=0.0, exposures pass through. v1 parity mathematically preserved.
- Net: +2400 lines new code, +119 new tests. 13 new files created, 4 existing files modified.
- Validation: 2725 passed, 134 skipped, 0 failed. Frontend build clean.

## 2026-03-07 — Hedge Desk institutional redesign (Phase D)
- **D1** (nav cleanup): Removed WorkflowBreadcrumb + WorkflowGuide from run mode — both were hardcoded to step 1, never updated. ProgressBar is now single authoritative progress model with phase-aware instruction text. Reclaimed ~68px vertical space.
- **D2** (visual unification): Created `tokens.ts` shared design token file. Eliminated PhaseReview's hardcoded Bloomberg-dark palette (14 hex colors). All 7 phase files + ProgressBar now import from shared CSS-variable tokens. Zero hardcoded dark colors remain.
- **D3** (Step 2 rebuild): PhaseCalculate expanded from thin confirmation to "Prepare & Calculate" — exposure narrative, market context interpretation, post-calc recommendation preview (coverage/cost/legs), assumptions block, consequence-of-inaction note. No longer auto-advances after calculation.
- **D4** (Step 3 rebuild): PhaseRisk expanded — 5-constraint evaluation manifest with per-check PASS/FAIL, governance implications (solo vs 4-eyes), quant panels wrapped under "Quantitative Risk Analysis" header. SMB auto-skip now shows visible banner before advancing.
- **D5** (Step 4 rebuild): PhaseReview restructured as Decision Room — Decision Thesis at top (plain-English recommendation), compact step header replacing heavy identity bar, CME specs + audit provenance made collapsible, enhanced CTA with contextual info.
- **D6** (Step 5 reframe): PhaseExecute reframed as "Execution Confirmation" — pre-confirmation checklist, improved disclaimer framing, post-execution warning, CTA shows leg/contract counts.
- **D7** (Step 6 rebuild): PhaseComplete restructured — compact confirmation banner replacing giant checkmark, 3-path next actions (Monitor/Export/New Run), export options consolidated into dropdown card, reduced from 8 buttons to 3 cards.
- Net: +1660 lines, -917 lines across 10 files. 1 new file (tokens.ts).
- Validation: tsc --noEmit clean, next build success, 2444 backend tests passed (0 failed).
- Commit: 8360648

## 2026-03-07 — Hedge Desk redesign: Phases A + B + C
- **Phase A** (foundation): hedgeErrors.ts error translation, ErrorBanner.tsx, draftPersistence.ts, safeFetch wrapper in dashboardClient, EmptyState session-expired/network/no-permission states
- **Phase B** (navigation): AppSidebar simplified Hedge Desk section (6 items), HedgeDeskOverview landing page, dual-mode page.tsx (overview vs run), WorkflowBreadcrumb 6-step strip, WorkflowGuide step-of-5 bar, HedgeDeskPipeline draft persistence + goBack
- **Phase C** (pipeline unification): All 5 steps unified with consistent UX
  - Step 1 PhaseSelect: 3-tab intake (existing/manual/upload), shared basket, "STEP 1 OF 5" header
  - Step 2 PhaseCalculate: summary cards, unified action bar, "STEP 2 OF 5"
  - Step 3 PhaseRisk: verdict card with accent border, "STEP 3 OF 5"
  - Step 4 PhaseReview: targeted edits — step numbering, duplicate button removal, action bar
  - Step 5 PhaseExecute: step header, back moved to action bar
  - PhaseComplete: CSS variable tokens, completion header strip, inline audit trail
- Committed in 4 logical chunks: OS framework → Phase A → Phase B → Phase C
- Validation: tsc --noEmit + next build both pass clean

## 2026-03-07 — R-004 rotation closure + post-scrub verification
- Strengthened docs/ops/secret-rotation-checklist.md into operator-grade execution pack with verification commands and completion protocol
- Fixed ci_risk_gate.py: removed cursor-after-close bug, cleaned up dead code
- Promoted ci_risk_gate from advisory (continue-on-error) to hard blocker in CI
- Updated R-001 and R-004 mitigation text in OPEN_RISKS.md and memory.db
- Clarified R-001/R-004 relationship: rotation resolves both, git scrub is optional maintenance
- Both risks remain at current status (R-001 REDUCED, R-004 OPEN) — truthful, not inflated

## 2026-03-07 — R-001 secret scrub + rotation hardening
- Redacted 3 secrets from docs/audits/codebase-audit.md (OpenAI key, JWT_SECRET, DB password)
- Created docs/ops/secret-rotation-checklist.md (4 rotation items + post-rotation steps)
- Downgraded R-001 from CRITICAL/OPEN → HIGH/REDUCED (current files clean, history contains dead creds only)
- Updated OPEN_RISKS.md and memory.db to reflect 0 CRITICAL risks
- Pre-merge gate now passes without --allow-critical

## 2026-03-07 — Pre-merge governance gate
- Created scripts/pre_merge_gate.py: 5-check gate (truth, freeze, validation, completion, risks)
- Policy model: CONTRADICTION/frozen-diff/invalid-settings/compile-fail → BLOCK; STALE/open-work/missing-rollup → WARN
- Created /merge-gate skill for human/agent invocation
- Fixed freeze_check_precommit.py: added core/security.py (7th pattern)
- Wired pre-merge-gate into CI governance job
- Gate records verdict to memory.db validation_runs table
- Verdict: SAFE_TO_MERGE (with --allow-critical) or BLOCK

## 2026-03-07 — Phase 2 hardening: truth reconciliation + invariant enforcement
- Fixed 16 contradictions/stale claims across state files, MEMORY.md, CHANGELOG, rules
- Corrected DB_CANON.md: 31 → 35 DDL tables, fixed table name mismatches
- Added core/security.py to freeze guard (was in rules but not enforced)
- Upgraded freeze guard: 3-level (hard freeze + content invariant guards + warn-only)
- Invariant guards: WORM trigger removal blocked, SoD/auth edits warned
- Leaned prompt injection: max 1 rule, 20 lines, word-boundary matching (was 2 rules, 40 lines)
- Leaned SessionStart: 12 lines / 572 chars (was 27 lines / 842 chars)
- Added /done skill (completion discipline with evidence chain)
- Added /reconcile skill + scripts/reconcile_truth.py (truth alignment checker)
- Cleaned memory.db: removed test artifacts, seeded work_items, recorded validation
- Trimmed MEMORY.md: 188 → 82 lines, fixed all stale counts/names
- Closed OS Bootstrap sprint, opened Phase 2 Hardening sprint (8/8 done)
- Reconciliation result: 16 aligned, 0 stale, 0 contradictions

## 2026-03-07 — Operating system framework installed + 10 enhancements
- Created 6 rules files (.claude/rules/)
- Created 6 agent definitions (.claude/agents/)
- Created 6 skill definitions (.claude/skills/ — added /status)
- Created 6 state files (.claude/state/ — added golden_rollups.md)
- Created 4 architecture canon files (docs/architecture/)
- Initialized SQLite memory database (.claude/state/memory.db, 10 tables)
- Created 8 hook scripts (.claude/hooks/)
- Wired 6 hook commands across 5 events (SessionStart, UserPromptSubmit, 2x PreToolUse, PostToolUse, PreCompact)
- R1: .gitignore selective tracking (track .claude/ except memory.db + settings.local.json)
- R2: UserPromptSubmit auto-rule injection (detects intent, loads relevant rules)
- R3: /status skill (one-command project dashboard)
- R4: PostToolUse file_facts auto-recording (tracks all file changes in memory.db)
- R5: Pre-commit freeze-check hook (blocks commits to frozen files)
- R6: Weekly memory compaction script (scripts/compact_memory.py)
- R7: Decision recorder + architect workflow (records architectural decisions to DB)
- R8: CI governance job (freeze-check + risk-gate in GitHub Actions)
- R9: DevOps Console (/devops page + 5 backend endpoints + sidebar nav)
- R10: Golden rollups reference (.claude/state/golden_rollups.md)
- Slimmed root CLAUDE.md from 176 → 100 lines (pure constitution)

## 2026-03-06 — Major feature sprint
- Navigation: sidebar redesign (AppSidebar.tsx replaces AppTopBar)
- Calculate: 5-step guided calculation wizard (/calculate)
- Hedge Effectiveness: IFRS 9/ASC 815 testing (engine + 7 endpoints + 2 pages)
- Scenario Studio: Monte Carlo rewrite (composite risk endpoint + 4-tab ECharts)
- Admin Monitor: NOC dashboard (6 backend endpoints + /admin-monitor page)
- Test Coverage: 2158 passing, 59% coverage (up from 55%)
- Forensic audit cleanup: spot_rate rename, _to_usd fix, dead code removal
