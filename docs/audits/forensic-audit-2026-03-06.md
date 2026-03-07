# ORDR TERMINAL — FULL FORENSIC AUDIT REPORT
## Date: 2026-03-06 | Auditor: Claude Code (Opus 4.6) | Branch: master

---

# SECTION 1 — EXECUTIVE TRUTH SUMMARY

## 20 Most Important Findings

1. **The hedge calculation engine (engine_v1/kernel.py) is real, deterministic, and correctly implemented** — 13-step per-bucket computation with proper sign conventions, trace generation, and SHA-256 hashing. This is genuine IP.

2. **Multi-currency support is architecturally sound** — `spot_rate` field is now used generically for all currency pairs (renamed from legacy `spot_usdmxn`).

3. **The codebase has TWO engine layers that overlap** — `engine/` (12 modules, orchestrator layer) and `engine_v1/` (35 modules, production kernel). `engine/orchestrator.py` calls `engine_v1/` modules. Some `engine/` modules (cost_engine, scenario_engine, hedge_sizer) duplicate logic that also exists in `engine_v1/`. The boundary is unclear.

4. **35 engine_v1 modules exist but only ~8 are actively called from routes** — `validator.py`, `normalizer.py`, `kernel.py`, `scenarios.py`, `audit.py`, `hasher.py`, `kernel_multi.py`, `normalizer_multi.py` are production-active. The other 27 modules are **built but not wired into any route or orchestrator**.

5. **The Audit Lab engine and Decision Desk engine are fully implemented and tested** — `engine/audit_engine.py` (685 lines, markup/fee/unhedged-impact) and `engine/decision_engine.py` (668 lines, IBKR payload generation) are production-quality pure functions with deterministic hashing.

6. **86 frontend pages/routes exist but ~30 are placeholders or shallow screens** — Now gated with "Coming Soon" indicators to avoid trust erosion during demos.

7. **22 dashboard widgets registered but only ~7 are truly production-functional** — KPI Summary, Recent Runs, Pending Approvals, FX Rates, Exposure Summary, Team Activity, Quick Actions work. The rest are prototype-quality.

8. **The 4-eyes execution workflow (maker/checker) is fully implemented with SoD enforcement** — DB CHECK constraint, service-layer guard, hash-chained proposals. This is a genuine institutional feature.

9. **WORM tables and hash-chained audit trail are implemented** — `audit_events`, `calculation_runs`, `policy_revisions`, `ledger_entries` are append-only with SHA-256 chain. 16 NO_UPDATE/NO_DELETE triggers defined.

10. **Git history contains leaked secrets** — OpenAI API key, JWT secret, and database password were committed in prior commits. `gitleaks` is now in pre-commit but **history has not been scrubbed**. [REQUIRES MANUAL ACTION]

11. **The validator has 24 rejection codes (V-001 to V-024) and is production-quality** — Fail-closed semantics, per-currency spot ranges for 25 currencies, indicative fallback kill switch, snapshot staleness guard.

12. **There is no real market data integration in production** — The system uses `INDICATIVE_FALLBACK` rates or client-side proxy calls to Finnhub/Alpha Vantage.

13. **The scenario engine only does fixed-sigma spot shocks (+/-5%, +/-10%)** — No Monte Carlo, no VaR, no historical simulation.

14. **Frontend uses inline styles with CSS variables throughout** — Consistent `const S = {...}` pattern. Design tokens well-defined in `globals.css`.

15. **Authentication is production-hardened** — In-memory JWT (30min/15min for high-privilege), httpOnly refresh cookies, CSRF double-submit, bcrypt passwords, API keys (HK_live_ format).

16. **78 backend test files exist but coverage is fragmented** — CI gate is only 40% coverage.

17. **Celery was configured but unused** — Now removed (celery_app.py, example task, docker-compose worker deleted).

18. **The exports system (PDF/Excel/ZIP) is implemented** — `exports_v1/excel_builder.py`, `pdf_builder.py`, `zip_builder.py`.

19. **Voice/AI terminal exists but is a prototype** — `voice_agent.py` uses Claude 3.5 Sonnet via WebSocket.

20. **The database has 25+ ORM models mapping to 31+ tables** — Well-structured multi-tenant schema.

---

## 10 Highest-Risk Issues

| # | Risk | Severity | Evidence |
|---|------|----------|----------|
| 1 | **Leaked secrets in git history** | CRITICAL | OpenAI key, JWT secret, DB password in prior commits |
| 2 | **27 engine_v1 modules built but unwired** | HIGH | margin_model, capital_adequacy, hedge_accounting, etc. |
| 3 | **No institutional market data feed** | HIGH | Relies on yfinance + hardcoded fallbacks |
| 4 | **Scenario engine limited to spot shocks only** | MEDIUM | No VaR, no Monte Carlo, no multi-factor stress |
| 5 | **~30 placeholder frontend pages** | MEDIUM | Now gated with Coming Soon |
| 6 | **Dual engine layers with unclear boundary** | MEDIUM | `engine/` vs `engine_v1/` |
| 7 | **CI coverage gate at 40%** | MEDIUM | Many engine_v1 modules have zero test coverage |
| 8 | **No SSO/SAML/OIDC** | MEDIUM | Only password + optional MFA |
| 9 | **No real-time WebSocket updates** | LOW | Dashboard requires polling |
| 10 | **No position import workflow** | LOW | CSV upload exists but no production pipeline |

---

## 10 Strongest Assets

1. **Deterministic, hash-chained calculation engine** — kernel.py is genuinely production-quality
2. **24-code fail-closed validator** — V-001 to V-024 with per-currency spot ranges
3. **WORM audit trail with SHA-256 hash chain** — Real tamper-evident governance
4. **4-eyes execution workflow with SoD** — DB-enforced separation of duties
5. **Multi-tenant RBAC** — 9 roles, 41 permissions, hierarchy levels, plan tiers
6. **Audit Lab engine** — Real markup/fee/unhedged-impact analysis with trace
7. **Decision Desk engine** — Deterministic action classification with IBKR payloads
8. **Policy versioning with revision pinning** — WORM policy_revisions
9. **Comprehensive API surface** — 110+ endpoints covering full workflow
10. **Institutional design system** — IBM Plex fonts, CSS variables, consistent widget pattern

---

## Changes Applied During This Audit

### Immediate Corrections (Implemented)

1. **Renamed `spot_usdmxn` to `spot_rate`** — Schema, kernel, validator, scenarios, all engine modules, services, tests, frontend (~50 file touches)
2. **Fixed `_to_usd()` heuristic** — Replaced `rate > 2.0` heuristic with explicit `_CCY_PER_USD` currency classification set in `audit_engine.py`
3. **Removed dead Celery infrastructure** — Deleted `celery_app.py`, `tasks/example.py`, removed celery worker from `docker-compose.yml`, removed `celery` from `requirements.txt`
4. **Removed legacy routes directory** — Deleted `app/routes/` (3 files: health.py, auth.py, engine.py) and removed engine_router import from `main.py`
5. **Removed legacy audit_logs DB writes** — Stripped AuditLog DB writes from `middleware/audit.py` (structured logging is sufficient), updated `audit_cleanup.py` to only clean `auth_audit_logs`
6. **Gated placeholder pages** — Added `ComingSoon` component and applied to ~20 empty/placeholder frontend pages

### Items Requiring Manual Action

1. **Git history scrub** — Run `git-filter-repo` to remove OpenAI key, JWT secret, DB password from prior commits
2. **Secret rotation** — Generate new JWT_SECRET (64+ chars), rotate OpenAI key, change DB password
3. **Database migration** — The `audit_logs` table still exists in the DB but is no longer written to. Create an Alembic migration to drop it when ready.

---

## Upgrade Priority Table

| # | Item | Severity | Effort | Business Impact |
|---|------|----------|--------|----------------|
| 1 | Git history scrub | CRITICAL | 2h | HIGH |
| 2 | Position CSV import | HIGH | 16h | HIGH |
| 3 | Wire hedge_accounting.py | HIGH | 24h | HIGH |
| 4 | Monte Carlo scenarios | HIGH | 32h | HIGH |
| 5 | Dashboard redesign | MEDIUM | 24h | HIGH |
| 6 | Guided calculation wizard | MEDIUM | 16h | MEDIUM |
| 7 | SSO/SAML | MEDIUM | 24h | HIGH |
| 8 | Market data adapter | HIGH | 32h | HIGH |
| 9 | Increase test coverage to 70% | MEDIUM | 24h | MEDIUM |
| 10 | WebSocket real-time | LOW | 16h | MEDIUM |
