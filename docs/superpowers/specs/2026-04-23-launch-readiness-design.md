# Launch Readiness — Design Spec

**Date:** 2026-04-23
**Sprint:** Production Readiness + E2E Coverage (extended)
**Target:** Fortune 500 / BlackRock / Bloomberg quality v1.0.0-rc1
**Status:** Approved — execution underway

---

## Goal

Close all launch blockers and high-priority quality gaps identified in the 2026-04-23 audit. Deliver a v1.0.0-rc1 release candidate that is safe for institutional onboarding.

## Non-Goals

- No new UI features beyond the connector hub
- No new engine logic
- No new governance rules
- No changes to R1–R8 risk taxonomy, strategy-instrument mapping, middleware order, WORM tables, or hash chain semantics
- No modifications to frozen files (`engine_v1/kernel.py`, `validator.py`, `audit.py`, `security.py`, WORM models) without explicit ADR

---

## Scope — 6 Tracks

### Track 1 — ERP/Accounting Live Connectors

Five tier-1 providers. Real OAuth, real API calls, real data, full governance.

| Provider | Auth | API | Surface |
|---|---|---|---|
| QuickBooks Online | OAuth 2.0 (Intuit) | v3 REST | GL post, COA pull, journal sync, TB pull |
| Xero | OAuth 2.0 (PKCE) | Accounting API v2 | Same + org-tenant scoping |
| NetSuite | OAuth 2.0 + TBA fallback | SuiteTalk REST | Same + class/dept dims |
| Sage Intacct | Session auth + REST | Platform Services v3 | Same + entity dims |
| Dynamics 365 Finance | Azure AD OAuth 2.0 | OData v4 | Same + financial dims |

**Architecture (adapter pattern, single contract):**

```
backend/app/connectors/
  base.py                   # ConnectorProtocol: authorize_url, exchange_code,
                            #   refresh, post_journal, pull_coa, pull_trial_balance,
                            #   health_check, revoke
  oauth_state.py            # OAuth state store (Redis-backed, CSRF-safe, 10m TTL)
  token_vault.py            # Fernet-encrypted token storage in company.settings JSONB
  rate_limiter.py           # Per-connector TokenBucket (QBO=500/min, Xero=60/min,
                            #   NetSuite=10/sec, Intacct=100/min, D365=600/min)
  retry.py                  # Exponential backoff + circuit breaker per tenant+provider
  errors.py                 # Normalized ConnectorError hierarchy
  quickbooks/
    client.py               # httpx AsyncClient, typed responses
    adapter.py              # GL journal → QBO JournalEntry payload mapping
    webhook.py              # Intuit webhook signature verification (HMAC-SHA256)
    mapping.py              # ORDR COA → QBO Account ref
  xero/ ... (same layout)
  netsuite/ ...
  sage_intacct/ ...
  dynamics365/ ...
  registry.py               # provider_id → connector class
```

**Endpoints (additive to existing `v1_connectors.py`):**

```
GET    /v1/connectors/providers                    # list supported + feature flags
GET    /v1/connectors/{provider}/authorize         # → OAuth authorize URL + state
POST   /v1/connectors/{provider}/callback          # exchange code, store token
POST   /v1/connectors/{provider}/refresh           # manual refresh
DELETE /v1/connectors/{provider}                   # revoke + wipe tokens
GET    /v1/connectors/{provider}/status            # health, last_sync, rate_budget
POST   /v1/connectors/{provider}/sync              # pull COA + TB (idempotent, WORM-audited)
POST   /v1/connectors/{provider}/post-journal/{id} # post existing journal_entry to ERP
POST   /v1/connectors/webhooks/{provider}          # inbound webhook (HMAC verified)
```

**Governance / safety:**

- Every live call recorded in `audit_events` with provider, endpoint, status, latency, tenant
- Every posted journal gets `external_ref` stored on `JournalEntry` (append-only)
- 4-eyes: `post-journal` requires `approved` state + separate `checker` RBAC (reuses existing maker/checker guard)
- Dry-run flag (`?dry_run=true`) validates payload without posting — returns what would be sent
- Rate-limit breach → queue + retry with backoff, never drop
- Circuit breaker: 5 consecutive 5xx → disable provider for tenant for 10 min, Sentry alert
- Paper mode preserved as tenant-level toggle
- Token encryption: Fernet with key from `CONNECTOR_ENCRYPTION_KEY` env (rotated independently from `JWT_SECRET`)
- **Frozen files untouched.** New `token_vault.py` lives in `connectors/`, not in `core/security.py`.

**Frontend:**

- `/settings/connectors` redesigned as hub: card per provider, state, last sync, test-connection
- OAuth callback page extended for all five providers via `provider` query param
- Per-provider config modal (realm_id for QBO, tenant_id for Xero, account_id for NetSuite, company_id for Intacct, tenant for D365)
- `[LIVE]` / `[PAPER]` / `[ERROR]` status badges

**Testing:**

- VCR-recorded cassettes per provider (real API calls recorded once, replayed in CI)
- Sandbox credentials in `.env.test`: QBO sandbox, Xero demo company, NetSuite sandbox, Intacct sandbox, D365 trial
- 5 providers × ~12 scenarios = ~60 new integration tests
- E2E: one Playwright test per provider — authorize → connect (mocked callback) → sync → disconnect

---

### Track 2 — Frontend Production Hardening

**Code quality sweep:**

- Logger facade at `frontend/src/lib/logger.ts` — `logger.debug/info/warn/error`; no-op in production (`NODE_ENV === 'production'`)
- Remove/guard all 22 `console.log` calls in `frontend/src/lib/` and core paths
- Eliminate `any` types in 38 flagged pages — use existing schema types from `@/lib/api/*Client.ts`
- Per-feature React error boundaries wrapping each nav section (Treasury Suite, Accounting, Reports, Governance, Intelligence, Research, Market)
- Each boundary: Sentry tag + user context, feature-scoped fallback, not blank page

**Loading + empty states:**

- Audit last ~40 pages for `EmptyState` + `Skeleton` coverage (Phase 1 started this; verify tail)

**Bundle + performance:**

- Route-level code splitting audit — any page > 200 kB First Load JS gets lazy-imported chart/editor modules
- `next build --profile` baseline in `docs/ops/frontend-performance-baseline.md`

---

### Track 3 — E2E Test Suite Completion

Target: every nav section green in CI.

**Missing specs (9) to implement:**

```
treasury-suite/payments.spec.ts
treasury-suite/debt.spec.ts
treasury-suite/ir-risk.spec.ts
treasury-suite/counterparties.spec.ts
treasury-suite/regulatory-submissions.spec.ts
treasury-suite/natural-hedging.spec.ts
governance/audit-trail.spec.ts
governance/ledger.spec.ts
governance/staging.spec.ts
```

**Plus five ERP provider specs:**

```
accounting/quickbooks.spec.ts
accounting/xero.spec.ts
accounting/netsuite.spec.ts
accounting/sage-intacct.spec.ts
accounting/dynamics365.spec.ts
```

**Patterns:**

- Shared `e2e/fixtures/auth.ts` + `apiKey.ts` already exist — reuse
- Each spec: load page, assert critical selectors, interact with one write flow (dry-run where possible), assert success toast + server state
- Playwright config: `retries: 2` in CI, `trace: 'on-first-retry'`, `screenshot: 'only-on-failure'`
- `frontend/e2e/ci-smoke.spec.ts` — single 60s smoke: login → dashboard → one hedge calc → report → logout
- Target: 100% pass on chromium, webkit smoke only, firefox deferred

---

### Track 4 — Production Readiness Checklist Closure

**Security:**

- Push commits + run gitleaks on full origin history
- Execute `scripts/scrub-git-secrets.sh` (backup branch first, documented rollback)
- Verify `backend/.env` in `.gitignore`, audit all `NEXT_PUBLIC_*` for accidental secrets
- CORS origin whitelist: strip wildcards, pin explicit domains in `render.yaml`
- Add `SECURITY.md` (responsible disclosure, contact, SLA)

**Performance:**

- Execute k6 load test: `scripts/k6/` (100 VUs, 5 min) against staging, capture p95/p99 + error rate baseline
- DB pool tuning: verify `pool_size=20`, `max_overflow=10`, `pool_pre_ping=True` in `app/core/db.py`
- Index advisor run: `scripts/db/index_audit.py` — flag tables with seq_scan > 10k + no index

**Reliability:**

- Apply Render Blueprint sync (keepalive cron activation) — documented manual step
- `/api/health/deep` endpoint: probes DB + Redis + each configured ERP connector + Sentry DSN — per-dependency status
- Graceful degradation test: kill Redis in staging, verify site renders (fail-open cache)

**Observability:**

- Sentry DSN wiring check for production env (verify via test error)
- Confirm JSON structured logging active when `ENV=production`
- Grafana dashboards doc: request rate, error rate, p95 latency — `docs/ops/grafana-dashboards.md` with JSON exports

**Data integrity:**

- Alembic baseline stamp verification on production DB — documented procedure
- `scripts/verify_hash_chain.py` — runs per tenant, flags broken chains; daily cron
- Backup cron present (`scripts/ops/pg_backup.sh`); add monthly restore verification cron
- GDPR anonymization: `scripts/ops/gdpr_anonymize.py`, weekly cron

---

### Track 5 — Open Work Items Closure

From `memory.db`:

- **id=19 Secret rotation** — expand checklist with exact Render + Vercel env var names; mark ops-ready with verification steps
- **id=20 IBKR TWS live test** — document activation runbook; wire live-mode feature flag
- **id=22 Sandbox end-to-end** — fix autofill → calculate with live spot; browser test
- **id=23 Dashboard FX rates live data** — verify + screenshot evidence
- **id=24 Close risk #2** — procedural once IBKR confirmed

---

### Track 6 — Release Governance

- `CHANGELOG_AI.md` + `CURRENT_STATE.md` + `CURRENT_SPRINT.md` updated per track
- ADR entries where required (new `CONNECTOR_ENCRYPTION_KEY`, per-provider rate limits, webhook verification paths — these do not touch frozen files, so ADRs are informational)
- Push to `origin/master` via fast-forward; CI green
- Tag `v1.0.0-rc1` on green
- Release Guardian verdict recorded before merge

---

## Execution Phases

```
Phase A (Days 1-3):   Track 2 code quality + Track 4 partial + Track 5 open items
Phase B (Days 4-10):  Track 1 ERP connectors
Phase C (Days 8-12):  Track 3 E2E (parallel with Phase B tail)
Phase D (Day 13):     Track 4 completion (perf baseline, hash-chain cron, Blueprint sync)
Phase E (Day 14):     Track 6 governance + tag v1.0.0-rc1
```

**Operator-dependent items** (queued, not blocking):
- Render env var secret rotation (human action)
- Blueprint Sync in Render dashboard
- k6 load test execution against live staging
- Sandbox credential provisioning (QBO/Xero/NetSuite/Intacct/D365)

---

## Success Criteria

- [ ] All 5 ERP connectors operational with sandbox credentials + recorded VCR tests
- [ ] `npx playwright test` passes with 0 failures on chromium
- [ ] `tsc --noEmit` clean
- [ ] `next build` exit 0 with no > 200 kB route bloat
- [ ] Backend tests > 95% pass rate (~5100+ passing)
- [ ] Gitleaks clean post-scrub on full history
- [ ] k6 p95 < 500ms at 100 VUs
- [ ] `/api/health/deep` returns green for all dependencies
- [ ] Hash-chain verifier cron green
- [ ] v1.0.0-rc1 tagged on green CI

---

## Risk Log (design-time)

| Risk | Severity | Mitigation |
|---|---|---|
| ERP provider API changes mid-build | M | VCR cassettes + explicit version pinning; one adapter module per provider isolates change |
| OAuth state CSRF via Redis outage | L | Fallback to signed-JWT state token when Redis unavailable (time-limited, per-tenant secret) |
| Webhook signature verification bypass | H | Strict HMAC + timestamp skew < 300s; reject unsigned payloads; log all verification failures |
| Rate limit breach cascades to 5xx storm | H | Per-tenant circuit breaker, Sentry alert, documented runbook |
| Key leak on `CONNECTOR_ENCRYPTION_KEY` | H | Separate rotation from JWT; Fernet supports key-rotation tokens natively; documented rotation SOP |
| Paper-mode regression | M | Paper-mode retained as tenant toggle; integration tests cover both paths |

---

## Open Questions (resolved)

1. Encryption key rollout — **approved:** new `CONNECTOR_ENCRYPTION_KEY` separate from `JWT_SECRET`
2. Sandbox credentials — **approved:** user provisions sandbox accounts; runbook will be generated
3. Frozen file changes — **approved:** no changes; new modules live in `connectors/`
4. Scope lock — **approved:** no new UI features beyond connector hub; no new engine logic; no new governance rules

---

## References

- Audit report: Explore agent output 2026-04-23
- Current sprint: `.claude/state/CURRENT_SPRINT.md`
- Open risks: `.claude/state/OPEN_RISKS.md`
- Architecture freeze: `docs/architecture/architecture-freeze.md`
- ADR template: `docs/architecture/adr/`
