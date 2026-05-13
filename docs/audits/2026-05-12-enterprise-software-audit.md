# ORDR TreasuryFX Enterprise Software Audit

Date: 2026-05-12
Repository: `D:\Synexiun\1-SynexFund\ORDR TreasuryFX`
Audit mode: static code review, architecture review, local verification, security best-practice review, UI/UX review, and product/market benchmark.

## 1. Executive Summary

ORDR TreasuryFX is a serious commercial product in an advanced prototype / early enterprise-readiness stage. It has meaningful institutional design strengths: deterministic FX hedge logic, policy-bound workflows, WORM/audit concepts, RBAC, multi-step execution governance, a broad treasury terminal surface, and a credible product wedge around governed corporate FX hedging.

It is not yet production-grade for institutional deployment. The largest blockers are not missing screens. They are control integrity problems: broken database migrations, inconsistent API-key/auth enforcement, a schema-health information disclosure bug, a broken MFA login path, unauthenticated or weakly authenticated AI routes, public browser API-key patterns, incomplete database-enforced tenant isolation, and verification gates that do not pass locally.

Overall current score: **6.4 / 10**

Target 10/10 positioning: **best-in-class governed FX treasury operating system for corporate treasury and fund treasury teams**, not a full Bloomberg Terminal or BlackRock Aladdin clone.

## 2. Assumptions

- The target customer is institutional or serious commercial treasury: CFO, treasurer, risk manager, fund operations, controller, or audit/compliance user.
- The standard is enterprise SaaS: secure auth, deterministic workflows, strong tenancy, clean migrations, testable releases, observability, data provenance, and formal operational runbooks.
- The benchmark is not exact feature parity with Bloomberg or Aladdin. Bloomberg and Aladdin are multi-decade market infrastructure platforms. ORDR's credible wedge is narrower: FX treasury governance, hedge decisioning, auditability, and AI-assisted reporting.
- This was not a live penetration test, load test, or deployment runtime test. Findings are based on code, config, docs, and local command verification.

## 3. Benchmark Standard

External benchmark sources used:

- Bloomberg Terminal positions itself as an integrated solution for data, news, research, analytics, access to a global community, multi-asset execution, portfolio analytics, and collaboration. Source: https://professional.bloomberg.com/products/bloomberg-terminal/
- Bloomberg MARS is a multi-asset risk platform powered by Bloomberg pricing, market data, risk, collateral, valuation, XVA, and hedge accounting tooling. Source: https://professional.content.cirrus.bloomberg.com/professional2023/products/risk/mars/
- BlackRock Aladdin Enterprise is a unified investment lifecycle platform across asset classes with portfolio construction, performance, operations, accounting, trading/data integrations, risk, and scale. Source: https://www.blackrock.com/aladdin/offerings/aladdin-enterprise
- UI/UX review used the current Vercel Web Interface Guidelines, covering accessibility, focus, forms, animation, typography, content handling, navigation state, theming, and performance. Source: https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md

Conclusion: ORDR cannot currently compete as a broad market-data/risk/IBOR platform. It can compete as a focused, governed FX treasury workflow product if the control plane is hardened.

## 4. Scorecard

| Area | Score | Enterprise interpretation |
|---|---:|---|
| Overall | 6.4 | Strong product foundation, not production-ready |
| Backend/API architecture | 7.0 | Broad API surface and good middleware intent, but route/auth sprawl |
| Hedge engine/business logic | 7.4 | Deterministic and traceable, but needs formal model governance |
| Governance/audit/compliance | 7.0 | Good WORM/hash/approval concepts, incomplete DB-level enforceability |
| Database/migrations | 5.2 | Schema richness offset by broken Alembic chain |
| Security/auth/tenant isolation | 5.8 | Good primitives, critical consistency gaps |
| Frontend architecture | 7.0 | Strong Next/React structure, fragmented clients and local state |
| UI/UX/institutional polish | 6.3 | Rich terminal, inconsistent system and stale product copy |
| Data flow/integrations | 6.0 | Many connectors and flows, weak system-of-record boundaries |
| AI readiness | 5.3 | Good advisory intent, weak auth/cost/provenance controls |
| Testing/CI/release readiness | 5.4 | CI exists, local verification currently fails key gates |
| Observability/operations | 6.0 | Sentry/docs/runbooks exist, runtime gates and SLO evidence incomplete |
| Business/product strategy | 7.2 | Strong niche if positioned as governed FX treasury, not broad terminal |

## 5. Critical Blockers

### P0-1. Alembic migration chain is broken

Evidence:
- `backend/migrations/versions/0022_cash_forecast.py:11-12` has `revision = "0022"` and `down_revision = "0021"`.
- `backend/migrations/versions/0021_cash_audit_events.py:10-11` has `revision = "0021_cash_audit_events"` and `down_revision = "0020_cash_balances"`.
- Local command `alembic heads` fails with `KeyError: '0021'`.

Impact: production deploys and schema upgrades cannot be trusted. This blocks enterprise release.

Fix:
- Change `0022_cash_forecast.py` down revision to `0021_cash_audit_events`, or create a compatibility bridge revision if deployed environments already contain `0021`.
- Add CI gates: `alembic heads`, `alembic history --verbose`, upgrade from empty DB, upgrade from latest prod snapshot, and downgrade policy where supported.
- Remove app-start schema mutation as a release mechanism.

### P0-2. Schema health endpoint leaks full diagnostics when any X-API-Key header is present

Evidence:
- `backend/app/middleware/api_key_auth.py:55-70` marks `/api/system/schema-health` public.
- `backend/app/api/routes/system.py:132-172` returns redacted output when no `X-API-Key` is present, but returns full diagnostics when a header is present, assuming middleware has already validated it.

Impact: unauthenticated users can send a fake `X-API-Key` and receive internal schema topology, missing objects, and readiness detail.

Fix:
- Remove `/api/system/schema-health` from middleware public paths for full diagnostics.
- Split into `/schema-health/public` and `/schema-health/admin`.
- Require `get_api_key_principal` or JWT + `system.schema.read` for full diagnostics.
- Add tests for no key, fake key, valid key without permission, valid key with permission.

### P0-3. API-key authentication has split-brain implementation

Evidence:
- `backend/app/middleware/api_key_auth.py:98-128` uses an in-memory hash map and bootstraps only `HC_DEV_KEY_001` outside production.
- DB-backed API-key verification exists in `backend/app/services/api_keys.py` and `backend/app/deps/api_key_auth.py`.
- Frontend clients attach browser-visible API keys in several places, including `frontend/src/api/client.ts:15-24`, `frontend/src/api/policyClient.ts`, and `frontend/src/api/runsClient.ts`.

Impact: real DB-issued API keys can be rejected by middleware before route dependencies execute. Browser-exposed keys cannot be treated as secrets.

Fix:
- Replace middleware API-key verification with the canonical DB-backed verifier or remove API-key middleware and enforce at router dependency boundaries.
- Never use `NEXT_PUBLIC_*` for privileged server-to-server keys.
- Treat browser API access as JWT-user scoped, not API-key scoped.

### P0-4. MFA login flow is broken

Evidence:
- Backend login returns access token in JSON and sets only `csrf_token` and httpOnly `rt` cookie in `backend/app/api/routes/auth.py:421-444`.
- Frontend login reads `document.cookie` for an `access_token` cookie in `frontend/src/app/auth/login/page.tsx:164-197`.
- `frontend/src/lib/authContext.tsx:215-224` correctly stores the access token in memory, but the login page does not use that returned token for MFA status.

Impact: users can be routed to dashboard without an MFA challenge check. Later route-level MFA gates may still block sensitive actions, but the login experience and security posture are inconsistent.

Fix:
- Change `login()` to return `{ success, accessToken, user, mfaRequired }` or expose a post-login MFA status method that uses the in-memory token.
- Backend should ideally return an explicit login state: `MFA_REQUIRED`, `MFA_NOT_ENABLED`, `LOGIN_COMPLETE`.
- Add e2e tests for MFA enabled, MFA disabled, invalid code, expired code, and unreachable MFA status endpoint.

### P0-5. AI routes are under-protected

Evidence:
- `frontend/src/app/api/policy-ai/route.ts:607-638` accepts POST and calls Claude/fallback with no authentication check.
- `frontend/src/app/api/report-ai/route.ts:176-188` checks only that the Authorization header starts with `Bearer `, but does not verify the JWT before using server-side AI.

Impact: anonymous or fake-auth callers can consume AI credits, submit sensitive treasury data to model providers, and generate business artifacts outside tenant authorization.

Fix:
- Validate JWT with the backend or shared auth verifier before AI calls.
- Require tenant, user, plan tier, rate limit, and cost budget.
- Log prompt hash, model, token count, output hash, citations, and user action.
- Add schema validation and output validation for all AI responses.

## 6. Backend/API Assessment

Strengths:
- FastAPI architecture is broad and feature-rich.
- `backend/app/api/router.py` centralizes many route modules.
- `backend/app/main.py` includes structured problem responses, health checks, OpenAPI metadata, idempotency header exposure, and security headers.
- Middleware coverage includes governance, audit headers, rate limiting, idempotency, API key auth, CSRF, CORS, and IP allowlist.
- JWT decoding validates algorithm, audience, issuer, and expiry in `backend/app/core/security.py:201-219`.
- Redis-backed rate limiting appears designed to be atomic and fail-closed in high-risk paths.

Weaknesses:
- `backend/app/main.py:1717-1729` runs Alembic upgrade and `_ensure_tables()` during app startup. This is operationally risky and can hide migration drift.
- API-key logic is duplicated across middleware, deps, and core security.
- Some diagnostics and public endpoints depend on comments rather than enforceable auth invariants.
- OpenAPI/docs exposure is disabled in main app config, which is positive, but middleware still treats docs paths as public. Verify runtime exposure by environment.
- Docker production healthcheck in `docker-compose.prod.yml:26-31` uses `/health`, but implemented health endpoint is `/api/health` in `backend/app/main.py:2447`.

10/10 target:
- Every route has a declared auth mode, tenant model, RBAC permission, idempotency policy, audit behavior, and response model.
- Public routes are explicitly enumerated and security-tested.
- App startup never mutates production schema.

## 7. Domain Logic and Hedge Engine

Strengths:
- Engine design favors deterministic, reproducible calculation.
- `engine_v1` appears structured around pure kernel functions, input/output hashing, trace events, and run envelopes.
- The product has a mature domain vocabulary: position lifecycle, policy revisions, staging/ledger separation, 4-eyes approval, audit verification, hedge effectiveness, market snapshots, and scenario packs.

Weaknesses:
- The financial model is credible for a focused FX hedge workflow, but not yet Bloomberg MARS/Aladdin-grade.
- Missing or incomplete capabilities for vendor-grade risk:
  - independent model validation pack,
  - formal pricing model inventory,
  - benchmark reconciliation to market/broker quotes,
  - valuation controls for forwards, NDFs, options, swaps, collateral, counterparty, and XVA,
  - intraday P&L/revaluation,
  - portfolio-level risk decomposition with explainable attribution,
  - market data entitlement controls.
- `backend/app/api/routes/voice_agent.py:180-183` falls back to hardcoded `17.24` if a live FX rate is unavailable, which conflicts with institutional data governance.

10/10 target:
- Golden datasets per currency pair and instrument.
- Model validation document per engine version.
- Signed calculation envelopes with source market snapshot IDs.
- Fail-closed market data behavior for production calculations.
- Formal separation of calculation, recommendation, approval, and execution.

## 8. Database and Data Governance

Strengths:
- The schema covers positions, policies, runs, staging, ledger, audit events, cash, bank statements, payments, counterparties, regulatory artifacts, intelligence logs, and webhooks.
- UUID-heavy design is appropriate for public IDs.
- Calculation runs and audit event models show strong lineage intent.
- RLS migration exists for positions and calculation runs.

Weaknesses:
- Broken migration chain is the biggest database risk.
- `backend/migrations/versions/k1a2b3c4d5e6_rls_positions_calculation_runs.py:18-23` explicitly does not force RLS, so the table owner bypasses RLS. Tenant isolation remains primarily application-layer.
- App startup fallback schema creation can drift from migrations.
- WORM behavior must be verified at DB trigger level for all critical tables, not only modeled in code.
- System-of-record boundaries are blurry where frontend localStorage stores operational state.

10/10 target:
- Migration-first database management.
- Forced RLS or non-owner app role.
- Immutable audit/ledger/run triggers.
- Data lineage for every number shown in reports.
- Restore drills and schema drift detection in CI/CD.

## 9. Frontend Architecture

Strengths:
- Next.js 15.5, React 19, TypeScript 5.9 is a modern stack.
- Root layout and client provider split are sensible.
- `frontend/src/lib/authContext.tsx` uses in-memory access token and httpOnly refresh cookie strategy.
- The terminal covers many workflows: dashboard, hedge desk, policy, execution, reports, audit lab, market intelligence, cash, debt, IR risk, TCA, connectors, support, settings.
- Local `npx tsc --noEmit` passed.

Weaknesses:
- Frontend API access is fragmented across multiple clients and base URL strategies.
- Several clients still support `NEXT_PUBLIC_*` API keys.
- Raw `fetch` and localStorage persist too much operational state.
- The landing page is a product catalog/marketing page, not an auth-aware institutional terminal entry.
- `frontend/src/app/page.tsx` contains stale March/April 2026 launch copy as of 2026-05-12.
- Existing build log indicates large route bundles, notably `results` and `reports`; this should be managed with bundle splitting and dynamic imports.

10/10 target:
- One canonical authenticated API client.
- Route-level auth and permission registry.
- Server-verified Next API routes.
- App shell optimized for daily treasury operations, not marketing-first entry.
- URL-reflected state for desks, filters, tabs, and selected entities.

## 10. UI/UX Assessment

Strengths:
- Dense terminal-style workflows are appropriate for treasury users.
- The app has strong domain-specific screens rather than generic SaaS pages.
- Icons, panels, and workflow phases are broadly aligned with an operational product.

Weaknesses:
- Design-token drift: global CSS tokens, terminal tokens, local `T`/`S` objects, and hardcoded hex values coexist.
- ESLint reports hardcoded hex/style warnings, especially in `frontend/src/app/settings/notifications/page.tsx:35-37` and related lines.
- Some typography is too small for institutional daily use, with repeated 10px/12px labels.
- Direct TradingView script injection uses `innerHTML` to configure script tags in `frontend/src/app/dashboard/page.tsx:301-348`; values are static, but it increases CSP and third-party script risk.
- Onboarding/help exists, but the first-run user journey is fragmented across quickstart, help, docs, and individual module pages.
- Stale product status dates undermine trust.

10/10 target:
- Unified design system with token ownership.
- Accessibility audit: labels, focus-visible, aria-labels, reduced motion, keyboard flows, semantic headings, and screen-reader status.
- Every table/card handles long content, empty states, stale states, and permission-denied states.
- A treasury operator can complete first value in under 15 minutes: connect data, import positions, assign policy, calculate hedge, export committee report.

## 11. Security Report

Security review references:
- FastAPI security best practices: explicit dependencies, strict JWT, safe cookies/CSRF, response shaping, SSRF/file/injection controls.
- Next.js/React security best practices: server-side auth for route handlers, no secrets in `NEXT_PUBLIC_*`, runtime validation, safe CSP, no dangerous DOM sinks, no frontend-only authorization.

### Critical / High Findings

SEC-001: Schema-health information disclosure
- Severity: High
- Location: `backend/app/middleware/api_key_auth.py:55-70`, `backend/app/api/routes/system.py:132-172`
- Impact: fake API-key header unlocks full diagnostics.
- Fix: require verified auth/RBAC for full diagnostics.

SEC-002: Browser-exposed API-key pattern
- Severity: High
- Location: `frontend/src/api/client.ts:15-24`, `frontend/src/lib/api.ts:10-15`, `frontend/src/api/policyClient.ts`
- Impact: public bundle can leak keys intended for server-to-server use.
- Fix: remove privileged API keys from browser; use JWT or BFF.

SEC-003: Weak AI route authentication
- Severity: High
- Location: `frontend/src/app/api/policy-ai/route.ts:607-638`, `frontend/src/app/api/report-ai/route.ts:176-188`
- Impact: AI cost abuse, data exposure, tenant bypass.
- Fix: verify JWT and tenant before model calls.

SEC-004: MFA login bypass/inconsistency
- Severity: High
- Location: `frontend/src/app/auth/login/page.tsx:164-197`, `backend/app/api/routes/auth.py:421-444`
- Impact: MFA challenge is not reliably presented.
- Fix: explicit MFA login state and token handling.

SEC-005: RLS not enforceable against app owner
- Severity: High
- Location: `backend/migrations/versions/k1a2b3c4d5e6_rls_positions_calculation_runs.py:18-23`
- Impact: DB-level tenant boundary is defense-in-depth only, not hard isolation.
- Fix: use non-owner app role or force RLS after compatibility work.

SEC-006: CSP allows unsafe script behavior
- Severity: Medium
- Location: `backend/app/main.py:2202-2212`
- Evidence: `script-src 'self' 'unsafe-inline' 'unsafe-eval'`
- Impact: weaker XSS containment.
- Fix: move to nonce/hash CSP and isolate third-party widgets.

SEC-007: WebSocket auth uses query token
- Severity: Medium
- Location: `backend/app/api/routes/voice_agent.py:7-9`, `backend/app/api/routes/voice_agent.py:135`
- Impact: query tokens can leak through logs/referrers/proxies.
- Fix: keep tokens short-lived, validate Origin, rate-limit sessions, prefer ephemeral token exchange.

SEC-008: Hardcoded market fallback in AI voice flow
- Severity: Medium
- Location: `backend/app/api/routes/voice_agent.py:180-183`
- Impact: inaccurate financial output can be produced under data outage.
- Fix: fail closed or return clearly non-executable indicative response.

SEC-009: Third-party script injection pattern
- Severity: Medium
- Location: `frontend/src/app/dashboard/page.tsx:301-348`
- Impact: complicates CSP, increases third-party script blast radius.
- Fix: isolate TradingView widgets, document CSP exception, avoid mutable `innerHTML` where possible.

SEC-010: CI security scans are warn-only
- Severity: Medium
- Location: `.github/workflows/ci.yml`
- Evidence: Trivy uses `exit-code: 0`.
- Impact: critical/high image findings do not block release.
- Fix: baseline then move critical vulnerabilities to blocking mode.

## 12. AI Readiness

Strengths:
- AI is generally framed as advisory and proposal-oriented.
- Report AI prompt uses placeholder constraints and "never invent numbers" language.
- Backend intelligence service logs token usage and hashes prompts.
- Voice tooling has governance concepts: tool descriptions, instruction hashes, transcript/memory features.

Weaknesses:
- Auth and tenant verification are inconsistent on Next AI routes.
- Cost controls are not visible as enforceable budgets.
- Prompt/output lineage is not consistently WORM-audited.
- AI outputs lack robust evidence checking and citation validation.
- Hardcoded market fallback conflicts with financial governance.
- Model names/env names are inconsistent across backend and deployment config.

10/10 AI target:
- AI may propose, summarize, explain, and draft, but never silently execute.
- All AI outputs cite run IDs, policy IDs, market snapshot IDs, and data sources.
- Every model call has tenant, user, purpose, prompt hash, output hash, token count, cost, model version, and retention policy.
- Sensitive actions require explicit user confirmation and server-side policy enforcement.

## 13. Testing and Verification

Local verification performed:

- `frontend: npx tsc --noEmit` passed.
- `frontend: npx eslint src --format stylish --max-warnings=0` failed with 19 warnings, mostly hardcoded hex and unused values.
- `backend: alembic heads` failed with `KeyError: '0021'`.
- `backend: alembic history --verbose` failed with the same migration chain issue.
- `backend: python -m pytest --collect-only -q` using the local backend venv failed with `ModuleNotFoundError: No module named 'backend.app'` for `tests/test_contract_cost_and_scenario_case01.py`.
- `ruff` and `mypy` were configured in CI but unavailable in the local backend venv inspected.

CI strengths:
- Backend lint, mypy, strict `engine_v1` mypy, pytest coverage, frontend typecheck, contrast check, Next build, Playwright, governance scripts, Docker build, Trivy, and gitleaks are defined.

CI gaps:
- Backend local environment does not currently reproduce the intended CI tooling cleanly.
- Mypy full app is advisory, not blocking.
- Trivy is warn-only.
- No visible CI gate for Alembic integrity.
- No visible route auth matrix tests.

## 14. Infrastructure and Operations

Strengths:
- Render/Vercel/K8s/Docker assets exist.
- Docs cover monitoring, backup/restore, SLO/SLA, incident response, secret rotation, data retention, business continuity, and sales/security evidence.
- Sentry packages are present.
- Production compose uses read-only filesystem and tmpfs for backend.

Weaknesses:
- Docker prod healthcheck points to `/health`, while FastAPI exposes `/api/health`.
- App-start migrations are operationally risky.
- Observability appears documented but not fully proven by automated checks.
- No evidence of canary deployment, rollback validation, restore drill automation, or synthetic transaction gates.

10/10 target:
- Release pipeline: build, migration dry run, schema drift check, test, security scan, deploy, smoke, synthetic workflow, rollback.
- On-call dashboards for API latency, DB errors, Redis/rate-limit failures, AI spend, connector failures, market data stale rate, and execution proposal lifecycle.

## 15. Business and Product Strategy

Strengths:
- The strongest wedge is governed FX hedging for treasury teams.
- Product language and workflows show strong domain understanding.
- Existing docs and sales artifacts suggest strong go-to-market thinking.
- ORDR can win where Bloomberg/Aladdin are too broad, expensive, or investment-manager oriented.

Weaknesses:
- Marketing and product surfaces are mixed together.
- The product risks over-claiming relative to Bloomberg/BlackRock breadth.
- Some launch/status copy is stale, which reduces buyer trust.
- Enterprise buyers will ask for SOC 2, SSO/SCIM, data lineage, DR evidence, audit export, permission matrix, and model validation. Some docs exist, but code and verification must match.

Recommended positioning:
- Do not position as "Bloomberg replacement" or "Aladdin replacement."
- Position as "governed FX treasury execution and reporting control plane."
- Best buyer: corporate treasury teams with recurring FX exposure, audit burden, policy governance pain, and insufficient tooling between spreadsheets and large enterprise systems.

## 16. Roadmap to 10/10

### Phase 0: Stop-ship fixes, 1-2 weeks

1. Fix Alembic chain and add migration integrity CI.
2. Fix schema-health auth disclosure.
3. Fix MFA login flow.
4. Protect all AI routes with real JWT verification and rate limits.
5. Remove privileged browser API-key patterns.
6. Correct Docker healthcheck.
7. Make backend test collection pass locally and in CI.
8. Add smoke tests for auth, tenant isolation, schema health, AI auth, and hedge calculation.

### Phase 1: Enterprise control plane, 30 days

1. Build route security registry: auth mode, RBAC permission, tenant scope, audit event, rate limit, idempotency.
2. Unify API clients and auth flows across frontend.
3. Move operational state from localStorage to server-backed user/tenant storage where it affects business records.
4. Add forced RLS or non-owner app role.
5. Add immutable DB triggers for audit/run/ledger tables.
6. Add AI cost budgets, output validation, citation enforcement, and WORM AI provenance.
7. Consolidate design tokens and remove hardcoded colors.
8. Replace stale landing page with auth-aware terminal entry.

### Phase 2: Institutional workflow depth, 60-90 days

1. Model validation program: golden portfolios, price reconciliation, versioned methodology docs.
2. Data provenance badges in UI: live, cached, stale, manual, synthetic, vendor, as-of time.
3. Market data entitlement and provider abstraction.
4. Execution controls: pre-trade TCA, best-execution evidence, counterparty limits, post-trade confirmation.
5. Reconciliation across positions, policies, runs, proposals, executions, ledger, reports.
6. SSO/SCIM, enterprise admin, access review exports.
7. Synthetic monitoring for full user journey.

### Phase 3: Best-in-class expansion, 6-12 months

1. Multi-instrument risk: forwards, NDFs, swaps, options, collars.
2. Portfolio analytics: VaR/ES, stress, attribution, P&L explain, hedge effectiveness.
3. Data cloud/integration layer: ERP, banks, custodians, brokers, accounting, market data.
4. Audit and board reporting suite with immutable evidence packs.
5. AI copilots with permission-aware retrieval, citations, and workflow confirmations.
6. Formal enterprise trust program: SOC 2 readiness, pen test, vendor risk packet, DR evidence.

## 17. 10/10 Definition

ORDR reaches 10/10 when:

- A fresh production database can migrate cleanly and repeatably.
- No protected route is reachable without verified auth and tenant authorization.
- Every financial number has source, timestamp, transformation, and audit lineage.
- Every hedge recommendation is reproducible from signed inputs and model version.
- AI never invents data, never acts without approval, and is cost/tenant governed.
- UI is fast, accessible, consistent, and built for repeated treasury desk use.
- Onboarding gets a real buyer to first governed hedge/report quickly.
- CI blocks broken migrations, auth regressions, high-risk security issues, and failed core workflows.
- Operations can prove backup restore, incident response, monitoring, and rollback.

## 18. Final Verdict

The codebase has real product substance. The opportunity is not to add more features immediately. The priority is to make the control plane coherent: migrations, auth, tenant isolation, AI governance, data provenance, and verification. Once those are hardened, the product can credibly become a high-value FX treasury governance platform. Without those fixes, the current feature breadth increases risk because many workflows depend on controls that are not yet consistently enforced.

## 19. Remediation Status, 2026-05-12

Completed in the first hardening pass:

1. Alembic chain repaired and merged to one head.
2. Schema-health diagnostics restricted behind verified, scoped API keys.
3. Frontend MFA login flow corrected to complete MFA before token use.
4. AI routes moved behind verified Bearer-token checks.
5. Browser-exposed privileged API-key usage removed from production client code.
6. ERP probe route protected against unauthenticated SSRF, private-network targets, and non-HTTPS production probes.
7. Backend production startup changed to skip implicit Alembic/schema mutation unless explicitly enabled.
8. Tenant RLS now has request-local session injection plus a follow-up migration that forces RLS on `positions` and `calculation_runs`.
9. Next/Sentry App Router instrumentation updated, request PII/header scrubbing added, and deprecated build config removed.
10. CI and local checks strengthened for migration heads, backend lint/type tooling, frontend lint/build, and security scanning.

Remaining strategic work:

1. Route security registry and exhaustive auth matrix.
2. AI provenance, cost budget, citation enforcement, and model validation program.
3. Enterprise onboarding, SSO/SCIM, access review exports, and trust evidence pack.
4. Market-data entitlement/provider abstraction and deterministic lineage badges across the UI.
5. End-to-end browser/API/database synthetic monitoring for regulated workflows.
