# HARDENING MANIFEST — ORDR Terminal Production Hardening v1
**Branch**: `hardening/production-v1`
**Date**: 2026-03-05
**Operator**: Claude Code

---

## Section 1 — Critical Security Fixes

| ID | Status | File | Change | Notes |
|----|--------|------|--------|-------|
| 1.1 | ✅ DONE | `backend/app/core/dependencies.py` | Added `selectinload(User.company/branch/department)` to `_load_active_user()` | Prevents `MissingGreenlet` → HTTP 500 on org hierarchy access |
| 1.2 | ✅ DONE | `frontend/src/lib/authContext.tsx` | `plan_tier` fallback changed `"enterprise"` → `"smb"` (most restrictive existing tier); added `"lite"` to `PlanTier` union | Feature gating now backend-driven |
| 1.3 | ✅ DONE | `backend/app/main.py`, `backend/app/api/routes/auth.py`, `frontend/src/lib/api/dashboardClient.ts` | CSRF middleware enabled; login sets `csrf_token` cookie; dashboardClient sends `X-CSRF-Token` header on mutations |
| 1.4 | ✅ DONE | `backend/app/core/config.py` | JWT_SECRET validator strengthened: ≥32 chars + rejects `dev_` prefix in production; `.env.example` updated |
| 1.5 | ⚠️ DEFERRED | `frontend/src/lib/authContext.tsx` | `js-cookie` is client-side by design with JWT Bearer auth model. Backend sends tokens in JSON body (not Set-Cookie). Migration to httpOnly server-set cookies requires full auth model change. Documented as TODO. |
| 1.6 | ✅ DONE | `frontend/src/app/fx-market/page.tsx` | `NEXT_PUBLIC_FINNHUB_API_KEY` usage moved — page now calls `/api/market/fx/rates` proxy route (already server-side). Env var renamed in `.env.example` |
| 1.7 | ✅ DONE | `backend/app/engine_v1/validator.py` | Added hard kill switch: `ENV=production` + `INDICATIVE_FALLBACK` raises `RuntimeError` unless `ALLOW_INDICATIVE_FALLBACK=true` |

## Section 2 — Code Quality Enforcement

| ID | Status | File | Change |
|----|--------|------|--------|
| 2.1 | ✅ DONE | 7 frontend files | All `console.log` removed; `frontend/src/lib/logger.ts` created as structured replacement |
| 2.2 | ✅ DONE | `frontend/next.config.js`, `frontend/eslint.config.mjs` | `ignoreDuringBuilds: false`; `no-console` rule added |
| 2.3 | ✅ DONE | `backend/ruff.toml` | Ruff configured; auto-fix applied to safe issues |
| 2.4 | ✅ DONE | `backend/mypy.ini` | mypy configured; type check run |

## Section 3 — CI/CD Pipeline

| ID | Status | File | Change |
|----|--------|------|--------|
| 3.1 | ✅ DONE | `.github/workflows/ci.yml` | Full CI pipeline: backend lint/typecheck/test, frontend typecheck/lint/build, Docker smoke test |
| 3.2 | ✅ DONE | `.pre-commit-config.yaml` | Pre-commit with ruff, trailing whitespace, private key detection, no-commit-to-main |
| 3.3 | ⚠️ DEFERRED | git history | `git-filter-repo` rewrites shared history — requires team coordination. **ACTION REQUIRED**: Rotate OpenAI key + JWT secret + DB password immediately. Secrets are already untracked but exist in prior commits. |

## Section 4 — Performance

| ID | Status | File | Change |
|----|--------|------|--------|
| 4.1 | ✅ DONE | `backend/app/api/routes/dashboard.py` | Added `GET /v1/dashboard/aggregate` — single call replaces 4+ parallel fetches |
| 4.2 | ✅ DONE | `backend/app/api/routes/market.py` | `Cache-Control: public, max-age=60, stale-while-revalidate=30` on FX rates endpoint |
| 4.3 | ✅ DONE | `backend/migrations/versions/` | New Alembic migration adding composite indexes on hot query paths |
| 4.4 | ✅ DONE | `frontend/next.config.js` | `@next/bundle-analyzer` added; `ANALYZE=true npm run build` for analysis |

## Section 5 — Testing Infrastructure

| ID | Status | File | Change |
|----|--------|------|--------|
| 5.1 | ✅ DONE | `backend/pytest.ini`, `backend/tests/` | Coverage gate configured; 3 new test files added |
| 5.2 | ✅ DONE | `frontend/src/__tests__/widgets/` | 5 widget tests added |
| 5.3 | ✅ DONE | `frontend/e2e/critical-path.spec.ts`, `frontend/playwright.config.ts` | Playwright E2E critical path configured |

## Section 6 — Infrastructure

| ID | Status | File | Change |
|----|--------|------|--------|
| 6.1 | ✅ DONE | `backend/Dockerfile` | Multi-stage build; non-root user confirmed |
| 6.2 | ✅ DONE | `docker-compose.prod.yml` | Production compose with resource limits, restart policies, health checks |
| 6.3 | ✅ DONE | `backend/app/core/logging_config.py` | Structured JSON logging for production; wired into main.py lifespan |

## Section 7 — Documentation

| ID | Status | File | Change |
|----|--------|------|--------|
| 7.1 | ✅ DONE | `README.md` | Root README with setup, test, deploy instructions |
| 7.2 | ✅ DONE | `docs/ops/runbook.md` | Operations runbook |

---

## DEFERRED ITEMS (must complete before go-live)

| Item | Risk | Action Required |
|------|------|-----------------|
| **Git history scrub** | HIGH | Run `git filter-repo` to scrub OpenAI key / JWT secret from commits before making repo public |
| **Secret rotation** | CRITICAL | Rotate OpenAI API key + generate new JWT_SECRET (≥64 chars) + change DB password |
| **httpOnly cookie migration** | MEDIUM | Refactor auth to use `Set-Cookie` from backend rather than JS-land `js-cookie` storage |

---
*All changes verified with `py_compile` and `tsc --noEmit` after each section.*
