# Sprint 1 — Security Foundation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all live security risks before enterprise clients touch the system.

**Architecture:** The backend is a FastAPI/SQLAlchemy async application on Python 3.12 with a frozen middleware chain (`Audit -> Rate Limit -> Auth`). A new `IPAllowlistMiddleware` layer will be inserted *before* Audit to block unauthorized IPs before any audit events are written — this requires an ADR because it alters the canonical middleware order. The `engine_v1/` kernel is deterministic and frozen; mypy `--strict` will be enforced on it via a scoped CI step without touching kernel logic.

**Tech Stack:** Python 3.12, FastAPI, pytest, mypy, OWASP ZAP, GitHub Actions

---

## Chunk 1: Git History Scrub

**Closes risk R-001. Run before any secret rotation so rotated values are never committed.**

### Files
- **Modify:** `scripts/scrub-git-secrets.sh` — uncomment and fill secret patterns before running
- **No test file** — this is a destructive one-shot operational procedure, not application code

### Steps

- [ ] **1.1** Identify all secrets currently or previously in git history by running gitleaks locally:
  ```bash
  # From repo root
  pip install gitleaks  # or use docker
  gitleaks detect --source . --log-opts="--all" --report-path=gitleaks-history-report.json
  cat gitleaks-history-report.json | python3 -c "import json,sys; [print(r['Secret'][:6]+'...', r['File'], r['StartLine']) for r in json.load(sys.stdin)]"
  ```
  Expected output: list of leaked secret prefixes and their file locations in history.

- [ ] **1.2** Install `git-filter-repo` and verify:
  ```bash
  pip install git-filter-repo
  git filter-repo --version
  ```
  Expected: `git-filter-repo version 2.x.x`

- [ ] **1.3** Edit `scripts/scrub-git-secrets.sh` — uncomment the PATTERNS section and fill in actual secret values identified in step 1.1. Each line format: `ACTUAL_SECRET==>***REDACTED_LABEL***`. Example:
  ```
  sk-proj-ACTUALKEY1234==>***REDACTED_OPENAI_KEY***
  actual_jwt_dev_value==>***REDACTED_JWT_DEV_SECRET***
  ```

- [ ] **1.4** Run dry-run first to verify patterns match:
  ```bash
  cd /path/to/repo && bash scripts/scrub-git-secrets.sh --dry-run
  ```
  Expected output:
  ```
  DRY RUN: Would run: git filter-repo --replace-text <patterns>
  Active patterns:
    sk-proj-...==>***REDACTED_OPENAI_KEY***
  ```

- [ ] **1.5** Notify all contributors to stop work. Then run the actual scrub:
  ```bash
  bash scripts/scrub-git-secrets.sh
  # Type SCRUB when prompted
  ```
  Expected: `SCRUB COMPLETE` banner followed by post-scrub checklist.

- [ ] **1.6** Verify scrub is clean:
  ```bash
  git log --all -S 'sk-proj-' --oneline
  git log --all -S 'dev_secret_key' --oneline
  git log --all -S 'hedgecalc' --oneline
  ```
  Expected: no output (no matches in history).

- [ ] **1.7** Force-push all branches:
  ```bash
  git push origin --force --all
  git push origin --force --tags
  ```
  Expected: all remote branches updated to scrubbed history.

- [ ] **1.8** Instruct all contributors to re-clone:
  ```bash
  # Each contributor runs:
  git fetch --all && git reset --hard origin/master
  # OR fresh clone:
  git clone <repo-url>
  ```

- [ ] **1.9** Contact GitHub Support to purge cached commit views for any commits that contained secrets. File request at https://support.github.com referencing the commit SHAs.

---

## Chunk 2: Secret Rotation

**Closes risk S-01. Must occur AFTER git scrub (so rotated values are never at risk of being scrubbed incorrectly) or in parallel on external platforms while scrub runs.**

### Files
- **No code changes** — this is an operational procedure on external platforms
- **Test:** After rotation, verify backend boots and authenticates: `GET /api/health` returns 200

### Steps

- [ ] **2.1** Generate a new JWT_SECRET (64-char hex):
  ```bash
  python3 -c "import secrets; print(secrets.token_hex(64))"
  ```
  Copy the output. Do NOT commit it anywhere.

- [ ] **2.2** Rotate JWT_SECRET in Render dashboard:
  - Navigate to Render dashboard → `hedgecore` service → Environment
  - Update `JWT_SECRET` to the new value from step 2.1
  - Repeat for `hedgecore-preview` service
  - Click "Save Changes" — Render will trigger a redeploy

- [ ] **2.3** Rotate JWT_SECRET in Vercel dashboard:
  - Navigate to Vercel → Project Settings → Environment Variables
  - `JWT_SECRET` is backend-only so Vercel does not hold it — skip if not present
  - Update `NEXT_PUBLIC_API_URL` if backend URL changed during rotation

- [ ] **2.4** Rotate PostgreSQL password via Render dashboard:
  - Render dashboard → PostgreSQL instance → Settings → Reset Password
  - Copy new password
  - Update `DATABASE_URL` in `hedgecore` service environment with new credentials
  - Update `DATABASE_URL` in `hedgecore-preview` service environment

- [ ] **2.5** Rotate Finnhub API key:
  - Log into https://finnhub.io → API Keys → Regenerate
  - Update `FINNHUB_API_KEY` in Render `hedgecore` service environment

- [ ] **2.6** Rotate Alpha Vantage API key:
  - Log into https://www.alphavantage.co/support/#api-key → Request new key
  - Update `ALPHA_VANTAGE_API_KEY` in Render `hedgecore` service environment

- [ ] **2.7** Rotate Twelve Data API key:
  - Log into https://twelvedata.com → Account → API Keys → Regenerate
  - Update `TWELVEDATA_API_KEY` in Render `hedgecore` service environment

- [ ] **2.8** Verify backend is healthy after all rotations:
  ```bash
  curl -s https://hedgecore.onrender.com/api/health | python3 -m json.tool
  ```
  Expected: `{"status": "ok", ...}` with HTTP 200. A failed JWT_SECRET or DATABASE_URL will produce 500.

- [ ] **2.9** Verify authentication still works end-to-end:
  ```bash
  curl -s -X POST https://hedgecore.onrender.com/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username": "demo", "password": "demo"}' | python3 -m json.tool
  ```
  Expected: `{"access_token": "...", "token_type": "bearer"}`

- [ ] **2.10** Invalidate all existing JWT sessions: because JWT_SECRET changed, all previously issued access tokens and refresh tokens are now invalid. Inform users they must log in again. No code change needed — this is automatic.

---

## Chunk 3: mypy Hard Gate on engine_v1/

**Closes gap C-04. Scoped strictly to `backend/app/engine_v1/` — the rest of the codebase is deferred.**

### Files
- **Modify:** `backend/mypy.ini` — add a strict `[mypy-app.engine_v1.*]` section
- **Modify:** `.github/workflows/ci.yml` — add a hard-gate mypy step scoped to engine_v1
- **Test:** `backend/tests/test_mypy_engine_v1.py` — subprocess-based test that runs mypy and asserts exit code 0

### Steps

- [ ] **3.1** Write the failing test first. Create `backend/tests/test_mypy_engine_v1.py`:
  ```python
  """
  tests/test_mypy_engine_v1.py

  Hard gate: mypy --strict must pass on backend/app/engine_v1/ with zero errors.
  This test is the CI enforcement mechanism — it fails the test suite if the
  engine_v1 kernel develops type regressions.
  """
  from __future__ import annotations

  import subprocess
  import sys
  from pathlib import Path

  import pytest


  ENGINE_V1_PATH = Path(__file__).parent.parent / "app" / "engine_v1"


  def test_engine_v1_mypy_strict() -> None:
      """mypy --strict must exit 0 on all engine_v1 modules."""
      result = subprocess.run(
          [
              sys.executable,
              "-m",
              "mypy",
              str(ENGINE_V1_PATH),
              "--config-file",
              str(Path(__file__).parent.parent / "mypy.ini"),
              "--strict",
              "--no-error-summary",
          ],
          capture_output=True,
          text=True,
      )
      if result.returncode != 0:
          pytest.fail(
              f"mypy --strict found errors in engine_v1/:\n{result.stdout}\n{result.stderr}"
          )
  ```

- [ ] **3.2** Run the test to confirm it fails (baseline state):
  ```bash
  cd D:/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/backend
  JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
    python -m pytest tests/test_mypy_engine_v1.py -v --tb=short
  ```
  Expected output: `FAILED tests/test_mypy_engine_v1.py::test_engine_v1_mypy_strict` with mypy error details.

- [ ] **3.3** Run mypy directly on engine_v1 to see the full error list:
  ```bash
  cd D:/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/backend
  python -m mypy app/engine_v1/ --strict --no-error-summary 2>&1 | head -80
  ```
  This output is the work list for step 3.4.

- [ ] **3.4** Add a `[mypy-app.engine_v1.*]` strict section to `backend/mypy.ini`. The global `[mypy]` section remains `strict = false` to avoid breaking the rest of the codebase. Append to the end of the file:
  ```ini
  # ── engine_v1 strict gate (Sprint 1 Security Foundation) ────────────────────
  # The frozen kernel must be fully type-safe. This section overrides the global
  # relaxed settings for engine_v1 only.
  [mypy-app.engine_v1.*]
  strict = true
  disallow_untyped_defs = true
  disallow_any_generics = true
  no_implicit_optional = true
  warn_return_any = true
  ```

- [ ] **3.4b** Create ADR-0008 at `docs/architecture/adr/0008-engine-v1-type-annotation-only-changes.md` to explicitly authorise the type annotation additions required by the mypy hard gate:
  ```markdown
  # ADR-0008: Type-Annotation-Only Modifications to engine_v1/ Frozen Files

  ## Status
  ACCEPTED

  ## Date
  2026-03-28

  ## Context
  The v1 architecture freeze classifies all files under `backend/app/engine_v1/` as
  frozen. Any modification requires an ADR. Sprint 1 introduces a mypy `--strict` hard
  gate on engine_v1/ (see Chunk 3). Passing mypy strict requires adding explicit type
  annotations to function signatures and variables — no logic changes are needed or
  permitted.

  The frozen-file constraint exists to prevent accidental logic drift in the deterministic
  hedge kernel. Type annotations do not alter runtime behaviour; they are compile-time
  metadata only.

  ## Decision
  Type-annotation-only changes to files under `backend/app/engine_v1/` are permitted
  without a new ADR per file, provided:
  1. Changes are limited to: function parameter type annotations, return type
     annotations, variable type annotations, `from __future__ import annotations`,
     and `# type: ignore[...]` comments for untyped third-party imports.
  2. No logic, algorithm, constant value, control flow, or data structure is modified.
  3. The full engine_v1 test suite passes before and after the annotation pass.
  4. A single commit message clearly states "annotation-only: add mypy strict types to
     engine_v1/" so the change is auditable.

  This ADR authorises the annotation pass as a single batch action. Any future
  engine_v1/ change that is not purely type-annotation must have its own ADR.

  ## Consequences
  - The kernel remains fully deterministic; frozen semantics are preserved.
  - mypy `--strict` becomes a permanent hard gate in CI, preventing type regressions.
  - Reviewers must verify that no logic changes are smuggled in under the annotation
    cover — the diff should contain only annotations and `# type: ignore` comments.
  - All other frozen-file constraints remain in force.

  ## References
  - Architecture freeze: `docs/architecture/architecture-freeze.md`
  - mypy hard gate CI step: `.github/workflows/ci.yml` (added in Chunk 3)
  - Sprint 1 spec: `docs/superpowers/specs/2026-03-28-enterprise-readiness-design.md` §1.3
  ```

- [ ] **3.5** Fix mypy errors in `backend/app/engine_v1/` modules. The kernel is frozen — only type annotations may be added. Do NOT change logic. Common fixes:
  - Add `-> None` return type to functions missing it
  - Add type annotations to function parameters that are untyped
  - Replace bare `list` / `dict` with `list[float]` / `dict[str, Any]` etc.
  - Add `from __future__ import annotations` at top of each file if not present
  - Add `# type: ignore[import-untyped]` for third-party imports that lack stubs (numpy, pandas)

  Run incrementally:
  ```bash
  python -m mypy app/engine_v1/kernel.py --strict --no-error-summary
  python -m mypy app/engine_v1/validator.py --strict --no-error-summary
  python -m mypy app/engine_v1/audit.py --strict --no-error-summary
  # continue for each module
  ```

- [ ] **3.6** Once all engine_v1 modules pass individually, run the full module:
  ```bash
  cd D:/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/backend
  python -m mypy app/engine_v1/ --strict --no-error-summary
  ```
  Expected: `Success: no issues found in N source files`

- [ ] **3.7** Run the test to confirm it now passes:
  ```bash
  JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
    python -m pytest tests/test_mypy_engine_v1.py -v --tb=short
  ```
  Expected: `PASSED tests/test_mypy_engine_v1.py::test_engine_v1_mypy_strict`

- [ ] **3.8** Add a hard-gate mypy CI step to `.github/workflows/ci.yml`. In the `backend` job, replace the existing mypy step (which has `continue-on-error: true`) with two separate steps:

  Replace:
  ```yaml
      - name: Mypy type check
        run: python -m mypy app/ --config-file mypy.ini
        continue-on-error: true   # mypy baseline — harden progressively
  ```

  With:
  ```yaml
      - name: Mypy type check (full codebase — advisory)
        run: python -m mypy app/ --config-file mypy.ini
        continue-on-error: true   # full codebase advisory — harden progressively

      - name: Mypy strict gate (engine_v1 only — HARD GATE)
        run: python -m mypy app/engine_v1/ --config-file mypy.ini --strict --no-error-summary
        # No continue-on-error — this blocks CI if engine_v1 develops type regressions
  ```

- [ ] **3.9** Run the full backend test suite to confirm no regressions:
  ```bash
  cd D:/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/backend
  JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
    python -m pytest tests/ -x -q --tb=short 2>&1 | tail -20
  ```
  Expected: all previously passing tests still pass; `test_mypy_engine_v1.py::test_engine_v1_mypy_strict` now in passing count.

---

## Chunk 4: Penetration Test Prep

**Creates evidence artifact for enterprise security questionnaires. Produces ADR 0006.**

### Files
- **Create:** `docs/architecture/adr/0006-pentest-prep-attack-surface.md`
- **Create:** `docs/security/attack-surface.md`
- **Create:** `docs/security/owasp-zap-baseline-report.md` (filled after ZAP scan)
- **No application code changes**
- **No test file** — documentation deliverable

### Steps

- [ ] **4.1** Create `docs/security/` directory if it does not exist:
  ```bash
  mkdir -p D:/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/docs/security
  ```

- [ ] **4.2** Create the attack surface document at `docs/security/attack-surface.md`:
  ```markdown
  # ORDR Terminal — Attack Surface Document

  **Date:** 2026-03-28
  **Status:** Active
  **Owner:** Security Foundation Sprint 1

  ---

  ## 1. External Entry Points

  ### 1.1 REST API (HTTPS)
  - Base URL: `https://hedgecore.onrender.com/api`
  - Auth: JWT Bearer (30min expiry) + API Key (`HK_live_` prefix)
  - CORS: configured per environment, no wildcard in production

  | Endpoint Group | Auth Required | Rate Limited | Notes |
  |---------------|---------------|--------------|-------|
  | `POST /v1/auth/login` | No | 10/min (login) | Credential submission |
  | `POST /v1/auth/refresh` | Refresh token | 60/min | Token refresh |
  | `GET /api/health` | No | 60/min | Public health check |
  | `GET /v1/positions` | JWT or API Key | 60/min | Tenant-scoped |
  | `POST /v1/calculate` | JWT or API Key | 60/min | Engine entry point |
  | `POST /v1/proposals` | JWT | 60/min | Execution flow |
  | `PATCH /v1/proposals/{id}/approve` | JWT + 4-eyes | 60/min | Governance action |
  | `POST /v1/proposals/{id}/execute` | JWT + 4-eyes | 60/min | Execution trigger |
  | `GET /v1/audit-events` | JWT | 60/min | WORM audit read |
  | `POST /v1/users` | JWT + admin | 60/min | User provisioning |
  | `GET /v1/exports/*` | JWT | 60/min | Regulatory reports |
  | `GET /openapi.json` | No | 60/min | API schema |

  ### 1.2 WebSocket
  - `WS /api/v1/ws/market-data` — authenticated, requires JWT
  - `WS /api/v1/voice/realtime` — gated by `OPENAI_API_KEY` env var, 503 if unset

  ### 1.3 Frontend (HTTPS, Vercel)
  - Base URL: `https://ordr-terminal.vercel.app`
  - Next.js 15 App Router, SSR + client components
  - Auth state: JWT in memory + refresh token in httpOnly cookie (set by backend)

  ---

  ## 2. Authentication Flows

  ### 2.1 Password Auth
  1. `POST /v1/auth/login` with `{username, password}`
  2. Backend: bcrypt verify → issue JWT access (30min) + refresh (7d)
  3. Access token in Authorization header for subsequent requests
  4. CSRF token set as cookie on login, verified on mutations via `X-CSRF-Token` header

  ### 2.2 API Key Auth
  1. Client sends `X-API-Key: HK_live_<id>.<secret>` header
  2. Backend: split on `.`, lookup by id, bcrypt verify secret
  3. API key principal treated as service account (no CSRF required for Bearer-authenticated requests)

  ---

  ## 3. Trust Boundaries

  | Boundary | Controls |
  |----------|----------|
  | Internet → Render (backend) | HTTPS TLS, CORS, rate limiting |
  | Internet → Vercel (frontend) | HTTPS TLS |
  | Frontend → Backend API | JWT auth, CSRF |
  | Backend → PostgreSQL | Private credentials in env vars |
  | Backend → Market data providers | API keys in env vars |
  | Tenant A → Tenant B | RBAC tenant_id checks in every query |

  ---

  ## 4. Known Risk Areas (pentest focus)

  | Risk | Description | Existing Controls |
  |------|-------------|-------------------|
  | Tenant isolation | Cross-tenant data read via crafted position IDs | RBAC tenant_id check |
  | IDOR | Direct object reference on positions/proposals | RBAC + tenant scoping |
  | JWT abuse | Token replay after logout | Stateless JWT — no server-side revocation yet |
  | File upload | CSV import for positions | No current file upload endpoint |
  | SSRF | Market data provider URLs are hardcoded | No user-controlled URLs |
  | Audit log tampering | Attempting DELETE/UPDATE on WORM tables | DB-level append-only + hash chain |
  | Rate limit bypass | IP rotation to bypass 60/min limit | Per-user limit (not just IP) |
  | 4-eyes bypass | Single user approving own proposal | SoD check in `position_service.py` |

  ---

  ## 5. Remediation Tracking

  | Finding | Severity | Status |
  |---------|----------|--------|
  | Secrets in git history | Critical | Sprint 1 Chunk 1 |
  | No server-side JWT revocation | Medium | Deferred to Sprint 2 (Redis) |
  | No IP allowlisting at middleware level | Medium | Sprint 1 Chunk 5 |
  | mypy not enforced on kernel | Low | Sprint 1 Chunk 3 |
  ```

- [ ] **4.3** Install OWASP ZAP CLI (Docker is simplest):
  ```bash
  docker pull ghcr.io/zaproxy/zaproxy:stable
  ```
  Expected: image pulled successfully.

- [ ] **4.4** Run OWASP ZAP baseline scan against staging backend. The baseline scan is passive (no active attack) and suitable for CI:
  ```bash
  docker run --rm \
    -v $(pwd)/docs/security:/zap/wrk:rw \
    ghcr.io/zaproxy/zaproxy:stable \
    zap-baseline.py \
    -t https://hedgecore-preview.onrender.com/api \
    -r owasp-zap-baseline-report.html \
    -J owasp-zap-baseline-report.json \
    -I  # ignore WARN level, only fail on FAIL level
  ```
  This will write `docs/security/owasp-zap-baseline-report.html` and `.json`.

  Expected output ends with: `PASS: N WARN: M FAIL: 0` (or shows specific failures to remediate).

- [ ] **4.5** Convert the ZAP JSON report summary into `docs/security/owasp-zap-baseline-report.md`. Document:
  - Scan date and target URL
  - Summary counts: PASS / WARN / FAIL
  - Each FAIL item with: name, risk level, description, remediation action and owner
  - Each WARN item with: name, risk level, accepted or planned fix

  Template:
  ```markdown
  # OWASP ZAP Baseline Scan — ORDR Terminal

  **Scan Date:** 2026-03-28
  **Target:** https://hedgecore-preview.onrender.com/api
  **Tool:** OWASP ZAP stable (Docker)
  **Scan Type:** Passive baseline (no active attack)

  ## Summary
  | Level | Count |
  |-------|-------|
  | PASS  | N     |
  | WARN  | M     |
  | FAIL  | 0     |

  ## Findings

  ### FAIL Items
  (none — or list each finding)

  ### WARN Items
  | Alert | Risk | CWE | Resolution |
  |-------|------|-----|------------|
  | Missing Anti-CSRF Token | Medium | CWE-352 | Already implemented via X-CSRF-Token |
  | ... | ... | ... | ... |

  ## Sign-off
  Scan reviewed by: [name], [date]
  ```

- [ ] **4.6** Create ADR 0006 at `docs/architecture/adr/0006-pentest-prep-attack-surface.md`:
  ```markdown
  # ADR-0006: Penetration Test Preparation and Attack Surface Documentation

  ## Status
  ACCEPTED

  ## Date
  2026-03-28

  ## Context
  ORDR Terminal is approaching enterprise sales readiness. Enterprise clients and
  security questionnaires require evidence of penetration testing activity, attack
  surface awareness, and remediation tracking. No formal pentest or attack surface
  document existed prior to Sprint 1.

  The OWASP ZAP baseline scan provides a passive evidence artifact that can be
  included in security questionnaires without requiring access to production.

  ## Decision
  1. Maintain a living attack surface document at `docs/security/attack-surface.md`
     covering all external entry points, authentication flows, trust boundaries,
     and risk areas.
  2. Run OWASP ZAP passive baseline scan against the staging environment (`hedgecore-preview`)
     on each security sprint. Reports committed to `docs/security/`.
  3. ZAP active attack scans (authenticated, spidering) are deferred to a
     contracted third-party pentest engagement — not run in CI against production.
  4. All FAIL-level ZAP findings require a remediation ticket before sprint close.
  5. WARN-level findings are documented with an accept/fix decision.

  ## Consequences
  - Attack surface document must be kept up-to-date when new endpoints are added.
  - ZAP baseline scan should be re-run whenever significant auth or routing changes land.
  - This ADR does NOT commit to a full contracted pentest — that is a separate decision
    tracked in the enterprise sales roadmap.

  ## References
  - `docs/security/attack-surface.md`
  - `docs/security/owasp-zap-baseline-report.md`
  - Sprint 1 spec: `docs/superpowers/specs/2026-03-28-enterprise-readiness-design.md` §1.4
  ```

- [ ] **4.7** Verify docs are committed and ZAP report is present:
  ```bash
  ls D:/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/docs/security/
  ls D:/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/docs/architecture/adr/
  ```
  Expected: `attack-surface.md`, `owasp-zap-baseline-report.md`, `0006-pentest-prep-attack-surface.md` all present.

---

## Chunk 5: IP Allowlisting Middleware

**New `IPAllowlistMiddleware` added BEFORE Audit in the middleware chain. Requires ADR 0007 because it modifies the frozen middleware order. Default is open (empty `ALLOWED_IPS`) — no behaviour change when not configured.**

### Files
- **Create:** `backend/app/middleware/ip_allowlist_middleware.py` — the new ASGI middleware class
- **Modify:** `backend/app/core/config.py` — add `ALLOWED_IPS` env var
- **Modify:** `backend/app/main.py` — register `IPAllowlistMiddleware` first (outermost after CORS)
- **Create:** `docs/architecture/adr/0007-ip-allowlist-middleware-before-audit.md`
- **Test:** `backend/tests/test_ip_allowlist_middleware.py`

Note: `backend/app/core/ip_allowlist.py` already contains `get_client_ip()` and `check_ip_allowlist()` helper functions used for per-endpoint enforcement. The new middleware reuses these helpers but applies globally at the ASGI layer.

### Steps

- [ ] **5.1** Write the failing tests first. Create `backend/tests/test_ip_allowlist_middleware.py`:
  ```python
  """
  tests/test_ip_allowlist_middleware.py

  Tests for IPAllowlistMiddleware.
  Covers: open mode (empty allowlist), allowlisted IP passes, blocked IP returns 403,
  CIDR range matching, X-Forwarded-For header parsing, ENV bypass in test mode.
  """
  from __future__ import annotations

  import pytest
  from fastapi import FastAPI
  from fastapi.testclient import TestClient

  from app.middleware.ip_allowlist_middleware import IPAllowlistMiddleware


  def _make_app(allowed_ips: list[str]) -> FastAPI:
      app = FastAPI()

      @app.get("/probe")
      async def probe() -> dict[str, str]:
          return {"status": "ok"}

      app.add_middleware(IPAllowlistMiddleware, allowed_ips=allowed_ips)
      return app


  class TestIPAllowlistMiddlewareOpen:
      def test_empty_allowlist_allows_all(self) -> None:
          """Empty ALLOWED_IPS = open mode, all IPs pass."""
          client = TestClient(_make_app([]))
          resp = client.get("/probe")
          assert resp.status_code == 200

      def test_none_allowlist_allows_all(self) -> None:
          """None ALLOWED_IPS = open mode."""
          client = TestClient(_make_app(None))  # type: ignore[arg-type]
          resp = client.get("/probe")
          assert resp.status_code == 200


  class TestIPAllowlistMiddlewareBlocking:
      def test_allowlisted_exact_ip_passes(self) -> None:
          client = TestClient(_make_app(["127.0.0.1"]))
          resp = client.get("/probe")
          assert resp.status_code == 200

      def test_non_allowlisted_ip_blocked(self) -> None:
          """IP not in allowlist returns 403."""
          client = TestClient(_make_app(["10.0.0.1"]))
          # TestClient connects from 127.0.0.1 which is not 10.0.0.1
          resp = client.get("/probe")
          assert resp.status_code == 403
          assert "IP_NOT_ALLOWLISTED" in resp.json()["detail"]

      def test_cidr_range_allows_matching_ip(self) -> None:
          client = TestClient(_make_app(["127.0.0.0/8"]))
          resp = client.get("/probe")
          assert resp.status_code == 200

      def test_cidr_range_blocks_non_matching_ip(self) -> None:
          client = TestClient(_make_app(["192.168.0.0/16"]))
          resp = client.get("/probe")
          assert resp.status_code == 403

      def test_multiple_entries_first_match_passes(self) -> None:
          client = TestClient(_make_app(["10.0.0.1", "127.0.0.1"]))
          resp = client.get("/probe")
          assert resp.status_code == 200


  class TestIPAllowlistMiddlewareForwardedFor:
      def test_x_forwarded_for_used_when_present(self) -> None:
          """X-Forwarded-For overrides direct client IP."""
          client = TestClient(_make_app(["203.0.113.1"]))
          resp = client.get("/probe", headers={"X-Forwarded-For": "203.0.113.1"})
          assert resp.status_code == 200

      def test_x_forwarded_for_blocked_when_not_allowlisted(self) -> None:
          client = TestClient(_make_app(["10.0.0.1"]))
          resp = client.get("/probe", headers={"X-Forwarded-For": "203.0.113.99"})
          assert resp.status_code == 403

      def test_x_forwarded_for_first_ip_used_when_chain(self) -> None:
          """Only the first IP in X-Forwarded-For chain is used (client IP)."""
          client = TestClient(_make_app(["203.0.113.1"]))
          resp = client.get(
              "/probe",
              headers={"X-Forwarded-For": "203.0.113.1, 10.0.0.1, 172.16.0.1"},
          )
          assert resp.status_code == 200
  ```

- [ ] **5.2** Run the failing tests to confirm they fail (module does not exist yet):
  ```bash
  cd D:/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/backend
  JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
    python -m pytest tests/test_ip_allowlist_middleware.py -v --tb=short
  ```
  Expected: `ModuleNotFoundError: No module named 'app.middleware.ip_allowlist_middleware'`

- [ ] **5.3** Create ADR 0007 at `docs/architecture/adr/0007-ip-allowlist-middleware-before-audit.md`:
  ```markdown
  # ADR-0007: IPAllowlistMiddleware Inserted Before Audit in Middleware Chain

  ## Status
  ACCEPTED

  ## Date
  2026-03-28

  ## Context
  The v1 architecture freeze establishes a canonical middleware order:
  `Audit -> Rate Limit -> Auth` (in ASGI execution order: outermost to innermost).

  Enterprise clients require the ability to restrict API access to known CIDR ranges
  (e.g., their corporate network) without code changes — configured via `ALLOWED_IPS`
  env var. Blocked IPs must be rejected BEFORE the audit middleware runs, so that
  connection attempts from unauthorized networks do not pollute the immutable audit log
  with noise events.

  Inserting IPAllowlistMiddleware before (outside) AuditHeadersMiddleware changes the
  effective middleware execution order, which the architecture freeze classifies as a
  frozen change requiring an ADR.

  ## Decision
  Add `IPAllowlistMiddleware` as a new middleware layer registered between CORS and Audit
  in `app/main.py` (Starlette LIFO — last added = outermost = first executed).

  CORS remains the absolute outermost layer so that OPTIONS preflight responses are
  handled before any application middleware runs. IPAllowlist is second-outermost,
  meaning it executes immediately after CORS. As a consequence, CORS preflight (OPTIONS)
  responses will bypass the IP allowlist check — this is intentional and required for
  browser clients to negotiate CORS without being blocked.

  Updated canonical order (outermost to innermost, i.e., ASGI execution order):
  `CORS -> IPAllowlist -> CSRF -> APIKeyAuth -> RateLimit -> Audit -> Governance -> GZip`

  Configuration:
  - `ALLOWED_IPS`: comma-separated CIDRs or exact IPs (env var)
  - Default: empty string — open mode (no behaviour change when not set)
  - When set: requests from IPs not in the allowlist receive HTTP 403 before any
    other middleware processes the request (except CORS preflight)

  Implementation reuses `get_client_ip()` and `check_ip_allowlist()` from
  `app/core/ip_allowlist.py` for consistent IP extraction logic.

  ## Consequences
  - Default behaviour is unchanged (empty list = open mode).
  - When `ALLOWED_IPS` is set, ALL non-preflight endpoints are protected — including
    `/api/health`. Operators must include their monitoring probe IPs in the allowlist.
  - CORS OPTIONS preflight requests bypass the IP check by design; this cannot be
    avoided without breaking browser-based clients.
  - X-Forwarded-For header is trusted for IP extraction (required for Render.com proxy).
    This is a trust decision: if a client can spoof X-Forwarded-For, they can bypass
    the allowlist. Render's proxy infrastructure is trusted to set this header correctly.
  - The new middleware does NOT affect the frozen `Audit -> Rate Limit -> Auth` order
    among those three layers — it adds a new layer between CORS and Audit only.
  - This ADR supersedes the "no middleware order changes" freeze constraint for this
    specific addition. Future middleware additions still require ADRs.

  ## References
  - `backend/app/middleware/ip_allowlist_middleware.py`
  - `backend/app/core/ip_allowlist.py` (helper functions reused)
  - Architecture freeze: `docs/architecture/architecture-freeze.md`
  - Sprint 1 spec: `docs/superpowers/specs/2026-03-28-enterprise-readiness-design.md` §1.5
  ```

- [ ] **5.4** Create `backend/app/middleware/ip_allowlist_middleware.py`:
  ```python
  """
  app/middleware/ip_allowlist_middleware.py

  IPAllowlistMiddleware — global IP allowlist enforcement.

  Inserted BEFORE AuditHeadersMiddleware in the middleware chain (outermost layer)
  so that blocked IPs never reach the audit log. See ADR-0007.

  Configuration:
      ALLOWED_IPS env var: comma-separated CIDRs or exact IPs.
      Empty or unset = open mode (no filtering, all IPs pass).

  When active:
      Requests from IPs not in the allowlist receive HTTP 403 JSON response
      before any other middleware or route handler runs.
  """
  from __future__ import annotations

  import logging
  from collections.abc import Awaitable, Callable

  from starlette.middleware.base import BaseHTTPMiddleware
  from starlette.requests import Request
  from starlette.responses import JSONResponse, Response

  from app.core.ip_allowlist import check_ip_allowlist, get_client_ip

  logger = logging.getLogger(__name__)


  class IPAllowlistMiddleware(BaseHTTPMiddleware):
      """Block requests from IPs not in the configured allowlist.

      Args:
          app: The ASGI application to wrap.
          allowed_ips: List of CIDRs or exact IPs. Empty list = open mode.
      """

      def __init__(
          self,
          app: object,
          allowed_ips: list[str] | None = None,
      ) -> None:
          super().__init__(app)  # type: ignore[arg-type]
          self._allowed_ips: list[str] = allowed_ips or []
          if self._allowed_ips:
              logger.info(
                  "IPAllowlistMiddleware: active — %d allowlist entries",
                  len(self._allowed_ips),
              )
          else:
              logger.info("IPAllowlistMiddleware: open mode (no filtering)")

      async def dispatch(
          self,
          request: Request,
          call_next: Callable[[Request], Awaitable[Response]],
      ) -> Response:
          if not self._allowed_ips:
              # Open mode — pass through immediately
              return await call_next(request)

          client_ip = get_client_ip(request)

          if not check_ip_allowlist(client_ip, self._allowed_ips):
              logger.warning(
                  "IPAllowlistMiddleware: BLOCKED client_ip=%s path=%s",
                  client_ip,
                  request.url.path,
              )
              return JSONResponse(
                  status_code=403,
                  content={
                      "detail": f"IP_NOT_ALLOWLISTED: {client_ip} is not permitted",
                      "code": "IP_NOT_ALLOWLISTED",
                  },
              )

          logger.debug(
              "IPAllowlistMiddleware: PASSED client_ip=%s", client_ip
          )
          return await call_next(request)
  ```

- [ ] **5.5** Add `ALLOWED_IPS` to `backend/app/core/config.py`. In the `Settings` class, add after the existing `EXECUTION_IP_ALLOWLIST` block:
  ```python
      # ------------------------------------------------------------------
      # Global IP Allowlist (middleware-level, Sprint 1 Security Foundation)
      # Set ALLOWED_IPS to restrict all API access to specific CIDRs.
      # Empty = open mode (no filtering). See ADR-0007.
      # Example: ALLOWED_IPS=10.0.0.0/8,203.0.113.0/24
      # ------------------------------------------------------------------
      ALLOWED_IPS: list[str] = []

      @validator("ALLOWED_IPS", pre=True, always=True)
      @classmethod
      def parse_allowed_ips(cls, v: object) -> list[str]:
          """Accept comma-separated string or list."""
          if isinstance(v, list):
              return [str(e).strip() for e in v if str(e).strip()]
          if isinstance(v, str):
              v = v.strip()
              if not v:
                  return []
              return [e.strip() for e in v.split(",") if e.strip()]
          return []
  ```

- [ ] **5.6** Register the middleware in `backend/app/main.py`. Add the import near the other middleware imports at the top of the file:
  ```python
  from app.middleware.ip_allowlist_middleware import IPAllowlistMiddleware
  ```

  Then in the middleware registration block (around line 1860), add `IPAllowlistMiddleware` registration AFTER `AuditHeadersMiddleware` (Starlette LIFO: last added = outermost = first executed). The block should read:

  ```python
  # -------------------------------------------------------------------
  # Middleware (CANONICAL ORDER -- Starlette LIFO: last added = outermost)
  # Execution order (outermost→innermost):
  #   CORS -> IPAllowlist -> CSRF -> APIKeyAuth -> RateLimit -> Audit -> Governance -> GZip
  # CORS is outermost to handle OPTIONS preflight before any application middleware.
  # IPAllowlist is second-outermost; blocked IPs are rejected before reaching Audit.
  # See ADR-0007.
  # -------------------------------------------------------------------

  app.add_middleware(GZipMiddleware, minimum_size=512)

  from app.middleware.governance import GovernanceMiddleware
  app.add_middleware(GovernanceMiddleware)

  app.add_middleware(AuditHeadersMiddleware)

  app.add_middleware(
      RateLimitMiddleware,
      requests_per_minute=60,
      redis_url=settings.REDIS_URL,
  )

  app.add_middleware(APIKeyAuthMiddleware)

  app.add_middleware(CSRFMiddleware)

  # IPAllowlist: registered after Audit so it executes BEFORE Audit (LIFO). See ADR-0007.
  app.add_middleware(IPAllowlistMiddleware, allowed_ips=settings.ALLOWED_IPS)

  # CORS outermost -- added last so it runs first (intercepts OPTIONS preflight)
  app.add_middleware(
      CORSMiddleware,
      allow_origins=[str(o).rstrip("/") for o in settings.CORS_ALLOW_ORIGINS],
      allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
      allow_methods=settings.CORS_ALLOW_METHODS,
      allow_headers=settings.CORS_ALLOW_HEADERS,
      expose_headers=settings.CORS_EXPOSE_HEADERS,
  )
  ```

- [ ] **5.6b** Check `backend/app/middleware/__init__.py` for re-exports. The file exists but is empty (no re-exports). No update is needed — `IPAllowlistMiddleware` is imported directly in `main.py` by its full module path (`app.middleware.ip_allowlist_middleware`).

- [ ] **5.7** Run the tests to confirm they now pass:
  ```bash
  cd D:/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/backend
  JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
    python -m pytest tests/test_ip_allowlist_middleware.py -v --tb=short
  ```
  Expected output:
  ```
  tests/test_ip_allowlist_middleware.py::TestIPAllowlistMiddlewareOpen::test_empty_allowlist_allows_all PASSED
  tests/test_ip_allowlist_middleware.py::TestIPAllowlistMiddlewareOpen::test_none_allowlist_allows_all PASSED
  tests/test_ip_allowlist_middleware.py::TestIPAllowlistMiddlewareBlocking::test_allowlisted_exact_ip_passes PASSED
  tests/test_ip_allowlist_middleware.py::TestIPAllowlistMiddlewareBlocking::test_non_allowlisted_ip_blocked PASSED
  tests/test_ip_allowlist_middleware.py::TestIPAllowlistMiddlewareBlocking::test_cidr_range_allows_matching_ip PASSED
  tests/test_ip_allowlist_middleware.py::TestIPAllowlistMiddlewareBlocking::test_cidr_range_blocks_non_matching_ip PASSED
  tests/test_ip_allowlist_middleware.py::TestIPAllowlistMiddlewareBlocking::test_multiple_entries_first_match_passes PASSED
  tests/test_ip_allowlist_middleware.py::TestIPAllowlistMiddlewareForwardedFor::test_x_forwarded_for_used_when_present PASSED
  tests/test_ip_allowlist_middleware.py::TestIPAllowlistMiddlewareForwardedFor::test_x_forwarded_for_blocked_when_not_allowlisted PASSED
  tests/test_ip_allowlist_middleware.py::TestIPAllowlistMiddlewareForwardedFor::test_x_forwarded_for_first_ip_used_when_chain PASSED
  10 passed
  ```

- [ ] **5.8** Run the full backend test suite to confirm no regressions from the middleware addition:
  ```bash
  cd D:/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/backend
  JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
    python -m pytest tests/ -x -q --tb=short 2>&1 | tail -20
  ```
  Expected: all previously passing tests still pass; 10 new passing tests from ip_allowlist_middleware.

- [ ] **5.9** Verify the ADR files are in place:
  ```bash
  ls D:/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/docs/architecture/adr/
  ```
  Expected: `0001-fastapi-asgi-api.md`, `0002-deterministic-engine.md`, ..., `0006-pentest-prep-attack-surface.md`, `0007-ip-allowlist-middleware-before-audit.md`, `0008-engine-v1-type-annotation-only-changes.md`

---

## Sprint 1 Completion Checklist

- [ ] **Git scrub**: `git log --all -S 'sk-proj-' --oneline` returns no output
- [ ] **Secret rotation**: `GET https://hedgecore.onrender.com/api/health` returns 200 after rotation
- [ ] **mypy gate**: `python -m mypy app/engine_v1/ --strict --no-error-summary` exits 0
- [ ] **CI**: mypy strict step in `ci.yml` has no `continue-on-error`
- [ ] **ZAP report**: `docs/security/owasp-zap-baseline-report.md` committed with FAIL count = 0
- [ ] **ADR 0006**: `docs/architecture/adr/0006-pentest-prep-attack-surface.md` committed
- [ ] **ADR 0007**: `docs/architecture/adr/0007-ip-allowlist-middleware-before-audit.md` committed
- [ ] **ADR 0008**: `docs/architecture/adr/0008-engine-v1-type-annotation-only-changes.md` committed
- [ ] **IP middleware tests**: 10 tests passing in `test_ip_allowlist_middleware.py`
- [ ] **Full test suite**: previously passing count unchanged or higher
- [ ] **CHANGELOG_AI.md**: updated with Sprint 1 summary

**Done criteria from spec:** No known secrets in git history, all env vars rotated, mypy green on engine_v1/, OWASP ZAP baseline report committed to `docs/security/owasp-zap-baseline-report.md` and referenced from ADR-0006.
