# Sprint 2 — Infrastructure Upgrade Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove single points of failure and operational blind spots across backend, infra, and observability.

**Architecture:** The backend (FastAPI/Python 3.12) runs on Render.com with PostgreSQL and will gain a co-located Redis instance for rate limiting and cache. Sentry integrates at both the FastAPI middleware layer (backend) and Next.js instrumentation layer (frontend) with PII scrubbing. Backup cron jobs wire the existing `scripts/backup/` scripts to Render's cron service with Backblaze B2 offload via the AWS-compatible S3 API.

**Tech Stack:** Render.com, Redis, sentry-sdk[fastapi], @sentry/nextjs, BetterUptime, Backblaze B2, GitHub Actions

---

## Chunk 1: Render Paid Tier + Private Networking

Covers spec sections 2.1 and 2.2. These are pure IaC changes — no code changes required.

### Files

**Modify:**
- `render.yaml` — upgrade plan tiers, add Redis service, add internal DB URL references

### Steps

- [ ] **1.1 — Upgrade service plans to `starter`**

  Open `render.yaml`. Change `plan: free` to `plan: starter` for the three services that should not cold-start. The keepalive cron can remain free since it is a cron job (no cold-start concern there).

  Current state of relevant lines (lines 31, 76, 117):
  ```yaml
  # hedgecore service (line 31)
  plan: free

  # hedgecore-preview service (line 76)
  plan: free

  # hedgecore-keepalive cron (line 117) — keep free, crons have no cold-start
  plan: free

  # hedgecore-db (line 124) — upgrade to starter for private networking
  plan: free

  # hedgecore-preview-db (line 129) — upgrade to starter
  plan: free
  ```

  Apply these edits:
  ```yaml
  # hedgecore web service
  plan: starter

  # hedgecore-preview web service
  plan: starter

  # hedgecore-db database
  plan: starter

  # hedgecore-preview-db database
  plan: starter
  ```

  The keepalive cron at line 117 stays `plan: free`.

- [ ] **1.2 — Add `SENTRY_DSN` and `REDIS_URL` env var slots to `render.yaml`**

  Under the `hedgecore` service `envVars` block, add:
  ```yaml
      - key: REDIS_URL
        fromGroup: hedgecore-secrets
      - key: SENTRY_DSN
        fromGroup: hedgecore-secrets
  ```

  Under the `hedgecore-preview` service `envVars` block, add:
  ```yaml
      - key: REDIS_URL
        fromGroup: hedgecore-preview-secrets
      - key: SENTRY_DSN
        fromGroup: hedgecore-preview-secrets
  ```

  These keys will be populated in the Render dashboard env groups. They must be present in `render.yaml` so blueprint sync wires them; they do NOT need values in this file.

- [ ] **1.3 — Add private networking note for DATABASE_URL**

  Render Starter tier databases expose an internal hostname ending in `.render.com` on the private network (format: `dpg-<id>-a`). The internal connection string is available in the Render dashboard under the database's "Internal Database URL" field.

  Add a comment above the `DATABASE_URL` env var reference in `render.yaml` to document this:
  ```yaml
      # PRIVATE NETWORKING: use the internal database URL from the Render dashboard
      # (format: postgresql://user:pass@dpg-XXXX-a/db) — removes DB from public internet
      - key: DATABASE_URL
        fromGroup: hedgecore-secrets
  ```

  The actual URL rotation is a manual step performed in the Render dashboard (see step 1.4).

- [ ] **1.4 — Manual: Render dashboard actions (document as checklist)**

  These steps cannot be automated via IaC but must be performed once by a human operator:

  1. Go to Render Dashboard → Databases → `hedgecore-db` → copy "Internal Database URL"
  2. Go to Render Dashboard → Env Groups → `hedgecore-secrets` → update `DATABASE_URL` to the internal URL
  3. Update `ASYNC_DATABASE_URL` in the same env group to use `postgresql+asyncpg://` scheme with the same internal host
  4. Repeat for `hedgecore-preview-db` / `hedgecore-preview-secrets`
  5. Trigger a manual deploy of `hedgecore` to confirm the service connects via internal network
  6. Verify `/api/health` returns 200 after the redeploy

  Document the completed date in `.claude/state/CHANGELOG_AI.md`.

- [ ] **1.5 — Activate keepalive cron**

  The `hedgecore-keepalive` cron already exists in `render.yaml` (lines 103–117) but has never been synced to Render because it was added while on the free tier. After upgrading `hedgecore` to starter:

  1. Run Render Blueprint Sync from the Render dashboard (New → Blueprint → select this repo → sync)
  2. Confirm `hedgecore-keepalive` appears in the Render dashboard as an active cron
  3. Verify first execution completes with exit code 0

- [ ] **1.6 — Validate `render.yaml` schema**

  Run the existing validation script:
  ```bash
  cd D:/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/frontend
  npm run render:validate
  ```

  Expected output: no errors. If PowerShell is not available in CI, the YAML can be validated with:
  ```bash
  python -c "import yaml; yaml.safe_load(open('render.yaml'))" && echo "YAML valid"
  ```

  Expected output:
  ```
  YAML valid
  ```

---

## Chunk 2: Redis in Production

Covers spec section 2.3. Redis is already partially wired in code (`RateLimitMiddleware` accepts `redis_url`, `settings.REDIS_URL` exists in `config.py`). This chunk finalises the fail-closed contract for rate limiting and removes the silent swallow on startup.

### Files

**Modify:**
- `backend/app/middleware/rate_limit.py` — change `_RedisTokenBucket.consume` error path from fail-open to fail-closed
- `backend/app/core/config.py` — add `SENTRY_DSN` setting
- `render.yaml` — add Redis service block

**Create:**
- `backend/tests/test_rate_limit_failclosed.py` — TDD test for fail-closed contract

### Steps

- [ ] **2.1 — Write failing test: fail-closed rate limiting**

  Create `backend/tests/test_rate_limit_failclosed.py`:

  ```python
  """
  Tests: RateLimitMiddleware Redis fail-closed contract.

  When Redis is unavailable for rate limiting, the middleware must NOT
  silently allow unlimited requests. It must fall back to the conservative
  in-process TokenBucket (fail-closed), not grant every request (fail-open).

  Spec 2.3: "Rate limiting: fail-closed — if Redis is unreachable, fall back
  to a conservative in-process token bucket (not drop enforcement entirely)."
  """
  from __future__ import annotations

  import time
  from unittest.mock import MagicMock, patch

  import pytest

  from app.middleware.rate_limit import RateLimitMiddleware, TokenBucket, _RedisTokenBucket


  class TestRedisTokenBucketFailClosed:
      """_RedisTokenBucket must be fail-closed: Redis error -> deny, not allow."""

      def test_redis_error_returns_false_not_true(self):
          """When the Lua script raises, consume() must return (False, 0), not (True, capacity)."""
          mock_redis = MagicMock()
          mock_script = MagicMock(side_effect=Exception("Redis connection refused"))
          mock_redis.register_script.return_value = mock_script

          bucket = _RedisTokenBucket(mock_redis, capacity=10.0, refill_rate=1.0)
          allowed, remaining = bucket.consume("test-key")

          assert allowed is False, (
              "Redis error must be fail-CLOSED (deny), not fail-open (allow). "
              f"Got allowed={allowed}"
          )
          assert remaining == 0

      def test_redis_script_none_returns_false(self):
          """If script registration fails, consume() must also deny."""
          mock_redis = MagicMock()
          mock_redis.register_script.side_effect = Exception("cannot register script")

          bucket = _RedisTokenBucket(mock_redis, capacity=10.0, refill_rate=1.0)
          allowed, remaining = bucket.consume("test-key")

          assert allowed is False
          assert remaining == 0

      def test_local_fallback_still_enforces_limit(self):
          """In-memory TokenBucket fallback must still enforce capacity."""
          bucket = TokenBucket(capacity=2, refill_rate_per_sec=0.0)
          # Exhaust the bucket
          assert bucket.consume() is True
          assert bucket.consume() is True
          # Third request must be denied
          assert bucket.consume() is False


  class TestRateLimitMiddlewareRedisUnavailableFallback:
      """When Redis is configured but unreachable at startup, middleware uses in-memory bucket."""

      def test_falls_back_to_in_memory_on_redis_unavailable(self):
          """Middleware initialised with bad REDIS_URL must use in-memory bucket, not panic."""
          with patch("app.middleware.rate_limit._redis") as mock_redis_module:
              mock_client = MagicMock()
              mock_client.ping.side_effect = Exception("Connection refused")
              mock_redis_module.from_url.return_value = mock_client

              # Should not raise; should log warning and use in-memory
              app_mock = MagicMock()
              mw = RateLimitMiddleware(
                  app_mock,
                  requests_per_minute=60,
                  redis_url="redis://localhost:9999/0",
              )
              assert mw._redis_bucket is None, "Redis bucket must be None when Redis is unreachable"
              # In-memory buckets dict must be available as fallback
              assert isinstance(mw._buckets, dict)
  ```

  Run the test — it should FAIL because the current `_RedisTokenBucket.consume` returns `(True, capacity)` on error (fail-open):

  ```bash
  cd D:/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/backend
  JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
    python -m pytest tests/test_rate_limit_failclosed.py -x -q --tb=short
  ```

  Expected output (pre-fix):
  ```
  FAILED tests/test_rate_limit_failclosed.py::TestRedisTokenBucketFailClosed::test_redis_error_returns_false_not_true
  ```

- [ ] **2.2 — Fix `_RedisTokenBucket.consume` to be fail-closed**

  In `backend/app/middleware/rate_limit.py`, change the `except` block in `_RedisTokenBucket.consume`:

  Current code (lines 107–112):
  ```python
          except Exception as exc:
              logger.warning("Redis rate-limit error (fail-open): %s", exc)
              return True, int(self._capacity)
  ```

  Replace with fail-closed behaviour:
  ```python
          except Exception as exc:
              logger.warning(
                  "RateLimitMiddleware: Redis error (fail-CLOSED) — "
                  "denying request to preserve rate limit integrity. Error: %s",
                  exc,
              )
              return False, 0
  ```

  Also fix the case where `self._script is None` (line 99–100):

  Current code:
  ```python
          if self._script is None:
              return True, int(self._capacity)
  ```

  Replace:
  ```python
          if self._script is None:
              logger.warning(
                  "RateLimitMiddleware: Redis Lua script not registered (fail-CLOSED) — denying request"
              )
              return False, 0
  ```

- [ ] **2.3 — Run tests again to confirm pass**

  ```bash
  cd D:/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/backend
  JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
    python -m pytest tests/test_rate_limit_failclosed.py -x -q --tb=short
  ```

  Expected output:
  ```
  4 passed in 0.XXs
  ```

- [ ] **2.4 — Add Redis service block to `render.yaml`**

  Add after the `databases:` block:

  ```yaml
  # ── Redis (rate limiting + market data cache) ────────────────────────────────
  # Note: Render Redis on Starter plan — 25MB RAM, persistent, private network only
  - type: redis
    name: hedgecore-redis
    plan: starter
    maxmemoryPolicy: allkeys-lru

  - type: redis
    name: hedgecore-preview-redis
    plan: starter
    maxmemoryPolicy: allkeys-lru
  ```

  Then update the `hedgecore` service env vars to reference the Redis internal URL:
  ```yaml
      - key: REDIS_URL
        fromService:
          type: redis
          name: hedgecore-redis
          property: connectionString
  ```

  And for `hedgecore-preview`:
  ```yaml
      - key: REDIS_URL
        fromService:
          type: redis
          name: hedgecore-preview-redis
          property: connectionString
  ```

  Remove the `fromGroup: hedgecore-secrets` entries for `REDIS_URL` added in Chunk 1 step 1.2 — `fromService` takes precedence and is simpler.

- [ ] **2.5 — Log Redis startup status clearly**

  The `RateLimitMiddleware.__init__` already logs Redis connection state (lines 172–184 in `rate_limit.py`). Verify the log message is emitted at `INFO` level when Redis connects and `WARNING` when it falls back, then emit a Sentry alert on fallback (wired in Chunk 3 after Sentry is available).

  Add a note in `backend/app/core/config.py` under `REDIS_URL` that this setting is required in production:
  ```python
      # Required in production for distributed rate limiting and market data cache.
      # Provisioned via Render Redis — value injected via fromService in render.yaml.
      # Failure behaviour: rate limiting is fail-CLOSED (deny), cache is fail-open (bypass).
      REDIS_URL: str | None = None
  ```

- [ ] **2.6 — Run full backend test suite to confirm no regression**

  ```bash
  cd D:/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/backend
  JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
    python -m pytest tests/ -x -q --tb=short --cov=app --cov-report=term-missing
  ```

  Expected: all previously passing tests still pass, coverage does not drop below 60%.

---

## Chunk 3: Sentry Error Tracking

Covers spec section 2.4. Sentry must be no-op when `SENTRY_DSN` is unset (local dev), strip PII (email, name), and capture tenant_id + user_id on events.

### Files

**Modify:**
- `backend/requirements.txt` — add `sentry-sdk[fastapi]>=2.0.0`
- `backend/app/main.py` — initialise Sentry in lifespan with `before_send` PII scrubber
- `frontend/package.json` — add `@sentry/nextjs`

**Create:**
- `frontend/sentry.client.config.ts` — Sentry browser init
- `frontend/sentry.server.config.ts` — Sentry server init
- `frontend/sentry.edge.config.ts` — Sentry edge init
- `backend/tests/test_sentry_pii_scrub.py` — TDD test for PII scrubbing

### Steps

- [ ] **3.1 — Write failing test: Sentry PII scrubbing**

  Create `backend/tests/test_sentry_pii_scrub.py`:

  ```python
  """
  Tests: Sentry PII scrubbing in before_send hook.

  Spec 2.4: "PII scrubbing: strip email/name from Sentry payloads"
  """
  from __future__ import annotations


  def _get_scrubber():
      """Import the scrubber function from main without triggering full app init."""
      import importlib
      import sys
      # We test the scrubber function in isolation
      # The function will be defined in app.core.sentry_config
      from app.core.sentry_config import scrub_pii_before_send
      return scrub_pii_before_send


  def test_scrub_removes_email_from_user_context():
      scrub = _get_scrubber()
      event = {
          "user": {
              "id": "usr_123",
              "email": "cfo@megacorp.com",
              "username": "cfo@megacorp.com",
              "name": "John Smith",
          },
          "extra": {"tenant_id": "tenant_abc"},
      }
      result = scrub(event, {})
      user = result["user"]
      assert "email" not in user, f"email must be stripped, got: {user}"
      assert "name" not in user, f"name must be stripped, got: {user}"
      assert user["id"] == "usr_123", "id must be preserved"
      # tenant_id must survive in extra
      assert result["extra"]["tenant_id"] == "tenant_abc"


  def test_scrub_removes_email_from_request_data():
      scrub = _get_scrubber()
      event = {
          "request": {
              "url": "https://hedgecore.onrender.com/v1/auth/login",
              "data": {"email": "user@bank.com", "password": "secret123"},
          }
      }
      result = scrub(event, {})
      data = result["request"]["data"]
      assert "email" not in data, f"email must be stripped from request data, got: {data}"
      assert "password" not in data, f"password must be stripped from request data, got: {data}"


  def test_scrub_removes_pii_from_extra():
      scrub = _get_scrubber()
      event = {
          "extra": {
              "user_email": "analyst@fund.com",
              "user_name": "Jane Doe",
              "tenant_id": "t_001",
              "calculation_id": "calc_999",
          }
      }
      result = scrub(event, {})
      extra = result["extra"]
      assert "user_email" not in extra
      assert "user_name" not in extra
      assert extra["tenant_id"] == "t_001"
      assert extra["calculation_id"] == "calc_999"


  def test_scrub_is_noop_on_clean_event():
      scrub = _get_scrubber()
      event = {
          "extra": {"tenant_id": "t_002", "run_id": "run_abc"},
          "tags": {"env": "production"},
      }
      result = scrub(event, {})
      assert result["extra"]["tenant_id"] == "t_002"
      assert result["tags"]["env"] == "production"
  ```

  Run — expect FAIL because `app.core.sentry_config` does not exist yet:

  ```bash
  cd D:/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/backend
  JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
    python -m pytest tests/test_sentry_pii_scrub.py -x -q --tb=short
  ```

  Expected:
  ```
  ERROR tests/test_sentry_pii_scrub.py - ImportError: cannot import name 'scrub_pii_before_send'
  ```

- [ ] **3.2 — Add `sentry-sdk[fastapi]` to `backend/requirements.txt`**

  Add after the `redis>=5.0.4` line:
  ```
  sentry-sdk[fastapi]>=2.0.0
  ```

- [ ] **3.3 — Create `backend/app/core/sentry_config.py`**

  ```python
  """
  app/core/sentry_config.py

  Sentry SDK initialisation for ORDR Terminal backend.

  Design decisions:
  - No-op when SENTRY_DSN is unset (local dev / test env).
  - PII scrubbing: strip email, name, password from all events.
  - Capture tenant_id and user_id as tags (not as PII fields).
  - traces_sample_rate=0.1 (10% of transactions) — adjust upward when baseline established.
  """
  from __future__ import annotations

  import logging
  import os
  import re

  _log = logging.getLogger(__name__)

  # Fields to remove from event payloads to prevent PII leakage
  _PII_FIELDS = frozenset(
      {
          "email",
          "username",
          "name",
          "first_name",
          "last_name",
          "password",
          "token",
          "user_email",
          "user_name",
      }
  )

  # Regex to detect email-looking values in arbitrary strings
  _EMAIL_RE = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")


  def scrub_pii_before_send(event: dict, hint: dict) -> dict:  # type: ignore[type-arg]
      """Sentry before_send hook — strip PII from event payloads.

      Mutates and returns the event dict with PII fields removed from:
      - event["user"]
      - event["request"]["data"]
      - event["extra"]
      """
      # Scrub user context
      user = event.get("user")
      if isinstance(user, dict):
          for field in _PII_FIELDS:
              user.pop(field, None)

      # Scrub request body / form data
      request = event.get("request")
      if isinstance(request, dict):
          data = request.get("data")
          if isinstance(data, dict):
              for field in _PII_FIELDS:
                  data.pop(field, None)

      # Scrub extra context
      extra = event.get("extra")
      if isinstance(extra, dict):
          for field in list(extra.keys()):
              if field in _PII_FIELDS:
                  del extra[field]

      return event


  def init_sentry() -> bool:
      """Initialise Sentry SDK. Returns True if initialised, False if no-op.

      Designed to be called once at application startup (inside lifespan).
      Safe to call in test/dev environments where SENTRY_DSN is unset.
      """
      dsn = os.getenv("SENTRY_DSN", "").strip()

      if not dsn:
          _log.info("Sentry: SENTRY_DSN not set — error tracking disabled (no-op)")
          return False

      env = os.getenv("ENV", "dev")

      try:
          import sentry_sdk
          from sentry_sdk.integrations.fastapi import FastApiIntegration
          from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
          from sentry_sdk.integrations.logging import LoggingIntegration
          import logging as _logging

          sentry_sdk.init(
              dsn=dsn,
              environment=env,
              traces_sample_rate=0.1,
              before_send=scrub_pii_before_send,
              integrations=[
                  FastApiIntegration(transaction_style="url"),
                  SqlalchemyIntegration(),
                  LoggingIntegration(
                      level=_logging.WARNING,
                      event_level=_logging.ERROR,
                  ),
              ],
              # Do not send default PII (IP address, cookies, etc.)
              send_default_pii=False,
          )
          _log.info("Sentry: initialised (env=%s, dsn=...%s)", env, dsn[-8:])
          return True

      except ImportError:
          _log.warning(
              "Sentry: sentry-sdk not installed — pip install sentry-sdk[fastapi]"
          )
          return False
      except Exception as exc:
          _log.warning("Sentry: init failed (%s) — continuing without error tracking", exc)
          return False
  ```

- [ ] **3.4 — Wire `init_sentry()` into `backend/app/main.py` lifespan**

  At the top of `main.py`, after the existing imports, add:
  ```python
  from app.core.sentry_config import init_sentry
  ```

  Inside the `lifespan` async context manager (or at module level before `app` is created), call:
  ```python
  # Sentry error tracking — no-op if SENTRY_DSN is unset
  init_sentry()
  ```

  Place this call immediately after `configure_logging()` is called (line 46 area), so errors during startup are also captured.

  Full placement:
  ```python
  configure_logging()
  logger = logging.getLogger(__name__)
  logger.info("HedgeCalc API booting")

  # Sentry — must init before app construction so startup errors are captured
  from app.core.sentry_config import init_sentry
  init_sentry()
  ```

- [ ] **3.5 — Run Sentry PII tests to confirm pass**

  ```bash
  cd D:/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/backend
  JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" \
    python -m pytest tests/test_sentry_pii_scrub.py -v --tb=short
  ```

  Expected output:
  ```
  tests/test_sentry_pii_scrub.py::test_scrub_removes_email_from_user_context PASSED
  tests/test_sentry_pii_scrub.py::test_scrub_removes_email_from_request_data PASSED
  tests/test_sentry_pii_scrub.py::test_scrub_removes_pii_from_extra PASSED
  tests/test_sentry_pii_scrub.py::test_scrub_is_noop_on_clean_event PASSED
  4 passed
  ```

- [ ] **3.6 — Add `@sentry/nextjs` to the frontend**

  ```bash
  cd D:/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/frontend
  npm install @sentry/nextjs
  ```

  This adds `@sentry/nextjs` to `dependencies` in `package.json`.

- [ ] **3.7 — Create `frontend/sentry.client.config.ts`**

  ```typescript
  // sentry.client.config.ts — browser-side Sentry init
  // No-op when NEXT_PUBLIC_SENTRY_DSN is unset (local dev)
  import * as Sentry from "@sentry/nextjs";

  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

  if (dsn) {
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_ENV ?? "dev",
      tracesSampleRate: 0.1,
      // Do not send PII: email addresses, user names
      sendDefaultPii: false,
      beforeSend(event) {
        // Strip user PII from browser events
        if (event.user) {
          delete event.user.email;
          delete event.user.username;
          delete event.user.name;
        }
        return event;
      },
    });
  }
  ```

- [ ] **3.8 — Create `frontend/sentry.server.config.ts`**

  ```typescript
  // sentry.server.config.ts — Next.js server-side Sentry init
  import * as Sentry from "@sentry/nextjs";

  const dsn = process.env.SENTRY_DSN;

  if (dsn) {
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_ENV ?? "dev",
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
      beforeSend(event) {
        if (event.user) {
          delete event.user.email;
          delete event.user.username;
          delete event.user.name;
        }
        return event;
      },
    });
  }
  ```

- [ ] **3.9 — Create `frontend/sentry.edge.config.ts`**

  ```typescript
  // sentry.edge.config.ts — Next.js Edge Runtime Sentry init
  import * as Sentry from "@sentry/nextjs";

  const dsn = process.env.SENTRY_DSN;

  if (dsn) {
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_ENV ?? "dev",
      tracesSampleRate: 0.05,
      sendDefaultPii: false,
    });
  }
  ```

- [ ] **3.10 — Wire Sentry into `next.config.js` / `next.config.ts`**

  Check if `frontend/next.config.ts` or `frontend/next.config.js` exists. Wrap the existing config with `withSentryConfig`:

  ```typescript
  import { withSentryConfig } from "@sentry/nextjs";
  import type { NextConfig } from "next";

  const nextConfig: NextConfig = {
    // ... existing config ...
  };

  export default withSentryConfig(nextConfig, {
    // Suppresses source map upload warnings in CI when SENTRY_AUTH_TOKEN is unset
    silent: !process.env.SENTRY_AUTH_TOKEN,
    // Disable source map upload unless SENTRY_AUTH_TOKEN is set
    disableSourceMapUpload: !process.env.SENTRY_AUTH_TOKEN,
    // Automatically tree-shake Sentry logger statements in production
    disableLogger: true,
  });
  ```

  If no `SENTRY_AUTH_TOKEN` is set (it's optional for error tracking), source maps are not uploaded and the build still succeeds.

- [ ] **3.11 — Add `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_DSN` to Vercel environment variables**

  These are manual steps in the Vercel dashboard. Document them:
  1. Vercel → hedgecore-frontend project → Settings → Environment Variables
  2. Add `NEXT_PUBLIC_SENTRY_DSN` (browser-visible) — Production + Preview
  3. Add `SENTRY_DSN` (server-side) — Production + Preview
  4. Both should use the same DSN value from the Sentry project "ORDR Terminal Frontend"

  Also add `SENTRY_DSN` to `render.yaml` under `hedgecore` envVars (backend) — already done in Chunk 1 step 1.2.

- [ ] **3.12 — Run frontend TypeScript check to confirm no build errors**

  ```bash
  cd D:/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/frontend
  npx tsc --noEmit
  ```

  Expected output: no errors.

  ```bash
  npx next build
  ```

  Expected output: build completes without error. If `NEXT_PUBLIC_SENTRY_DSN` is not set locally, Sentry is no-op and the build still succeeds.

---

## Chunk 4: External Uptime Monitoring

Covers spec section 2.5. This is configuration-only — no code changes.

### Files

**No code changes.** `/api/health` already exists and is configured as `healthCheckPath` in `render.yaml`.

**Create:**
- `docs/ops/uptime-monitoring.md` — runbook documenting the monitoring configuration

### Steps

- [ ] **4.1 — Register BetterUptime monitor**

  Manual steps (performed by operator, then documented):

  1. Go to https://betteruptime.com → New Monitor
  2. Monitor type: HTTPS
  3. URL: `https://hedgecore.onrender.com/api/health`
  4. Check frequency: every 3 minutes
  5. Alert contacts: ops email + Slack webhook (configure in BetterUptime integrations)
  6. Expected status: 200
  7. Timeout: 10s
  8. Enable: Public Status Page

  For the preview environment:
  1. URL: `https://hedgecore-preview.onrender.com/api/health`
  2. Check frequency: every 5 minutes
  3. Alert contacts: ops email only (no Slack for preview)
  4. Status page: private (not public-facing)

- [ ] **4.2 — Configure Slack alert integration**

  In BetterUptime:
  1. Go to Integrations → Slack
  2. Connect to `#ordr-alerts` Slack channel (create if not present)
  3. Enable alerts for: service down, service recovered, SSL expiry warning

- [ ] **4.3 — Create `docs/ops/uptime-monitoring.md`**

  ```markdown
  # Uptime Monitoring Runbook

  ## Production Monitor
  - Tool: BetterUptime
  - Endpoint: https://hedgecore.onrender.com/api/health
  - Frequency: every 3 minutes
  - Alert channels: ops email, #ordr-alerts Slack
  - Public status page: https://status.ordr-terminal.com (configure CNAME in DNS)

  ## Preview Monitor
  - Endpoint: https://hedgecore-preview.onrender.com/api/health
  - Frequency: every 5 minutes
  - Alert channels: ops email only

  ## Health Check Endpoint
  GET /api/health returns:
  - 200 OK with {"status": "ok", ...} when service is healthy
  - Non-200 if database is unreachable or app is in error state

  ## Escalation
  1. Alert fires → ops email + Slack notification (immediate)
  2. If unacknowledged after 10 minutes → phone call escalation (configure in BetterUptime on-call)
  3. Rollback procedure: Render dashboard → Deployments → select previous commit → redeploy

  ## SSL Certificate Monitoring
  BetterUptime auto-monitors SSL expiry. Alert fires 30 days before expiry.
  Render auto-renews Let's Encrypt certs; alert should never fire unless custom domain cert expires.
  ```

---

## Chunk 5: Automated Backup Scheduling

Covers spec section 2.6. The backup scripts (`scripts/backup/pg_backup.sh`, `scripts/backup/restore_verify.sh`) already exist. This chunk wires them to Render cron jobs and adds Backblaze B2 offload.

### Files

**Create:**
- `scripts/backup/b2_upload.sh` — Backblaze B2 upload via rclone
- `scripts/backup/backup_and_upload.sh` — orchestrator: backup + B2 upload + alert on failure
- `scripts/render/cron_backup.sh` — thin wrapper for Render cron context (sets env, calls orchestrator)

**Modify:**
- `render.yaml` — add daily backup cron job and monthly restore_verify cron job

### Steps

- [ ] **5.1 — Create `scripts/backup/b2_upload.sh`**

  Backblaze B2 exposes an S3-compatible API. We use `rclone` (available on Render's Ubuntu images) to sync the backup file to B2.

  ```bash
  #!/usr/bin/env bash
  # b2_upload.sh — Upload a backup file to Backblaze B2 via rclone S3-compatible API
  #
  # Required environment variables:
  #   B2_ACCOUNT_ID      — Backblaze B2 Application Key ID
  #   B2_APP_KEY         — Backblaze B2 Application Key (secret)
  #   B2_BUCKET          — Target bucket name (e.g. ordr-backups)
  #   BACKUP_FILE        — Local path to the .dump file to upload
  #
  # Exit codes:
  #   0  Success
  #   1  Missing required env var
  #   2  rclone not installed
  #   3  Upload failed

  set -euo pipefail

  B2_ACCOUNT_ID="${B2_ACCOUNT_ID:?ERROR: B2_ACCOUNT_ID is required}"
  B2_APP_KEY="${B2_APP_KEY:?ERROR: B2_APP_KEY is required}"
  B2_BUCKET="${B2_BUCKET:?ERROR: B2_BUCKET is required}"
  BACKUP_FILE="${BACKUP_FILE:?ERROR: BACKUP_FILE is required}"

  if ! command -v rclone &>/dev/null; then
      echo "[b2_upload] ERROR: rclone is not installed. Install with: curl https://rclone.org/install.sh | bash" >&2
      exit 2
  fi

  FILENAME=$(basename "$BACKUP_FILE")
  B2_ENDPOINT="https://s3.us-west-004.backblazeb2.com"  # adjust region to match your B2 bucket

  echo "[b2_upload] Uploading $FILENAME to B2 bucket: $B2_BUCKET"

  # Configure rclone env-based remote (no config file required)
  export RCLONE_S3_PROVIDER=Other
  export RCLONE_S3_ENV_AUTH=false
  export RCLONE_S3_ACCESS_KEY_ID="$B2_ACCOUNT_ID"
  export RCLONE_S3_SECRET_ACCESS_KEY="$B2_APP_KEY"
  export RCLONE_S3_ENDPOINT="$B2_ENDPOINT"
  export RCLONE_S3_ACL=private

  if ! rclone copyto "$BACKUP_FILE" ":s3:${B2_BUCKET}/db-backups/${FILENAME}" --progress; then
      echo "[b2_upload] ERROR: Upload to B2 failed" >&2
      exit 3
  fi

  echo "[b2_upload] SUCCESS: $FILENAME uploaded to B2://${B2_BUCKET}/db-backups/"
  ```

- [ ] **5.2 — Create `scripts/backup/backup_and_upload.sh`**

  ```bash
  #!/usr/bin/env bash
  # backup_and_upload.sh — Orchestrate: backup PostgreSQL + upload to B2 + alert on failure
  #
  # Required environment variables:
  #   DATABASE_URL       — PostgreSQL connection string (injected by Render)
  #   B2_ACCOUNT_ID      — Backblaze B2 key ID
  #   B2_APP_KEY         — Backblaze B2 secret key
  #   B2_BUCKET          — B2 bucket name
  #
  # Optional:
  #   BACKUP_DIR         — Where to write the dump (default: /tmp/backups)
  #   SENTRY_DSN         — If set, curl a Sentry error alert on failure
  #   RETAIN_DAYS        — Days to retain local copies (default: 7 — short on cron container)
  #
  # Exit codes:
  #   0  Full success (backup + upload)
  #   1  Backup step failed
  #   2  Upload step failed (backup succeeded but not offloaded)

  set -euo pipefail

  BACKUP_DIR="${BACKUP_DIR:-/tmp/backups}"
  RETAIN_DAYS="${RETAIN_DAYS:-7}"
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  _alert_sentry() {
      local message="$1"
      local dsn="${SENTRY_DSN:-}"
      if [ -z "$dsn" ]; then return; fi
      # Extract host from DSN (format: https://KEY@HOST/PROJECT_ID)
      local host
      host=$(echo "$dsn" | sed 's|https://[^@]*@\([^/]*\)/.*|\1|')
      local project_id
      project_id=$(echo "$dsn" | sed 's|.*/\([0-9]*\)$|\1|')
      local public_key
      public_key=$(echo "$dsn" | sed 's|https://\([^@]*\)@.*|\1|')
      curl -s -X POST "https://${host}/api/${project_id}/store/" \
          -H "Content-Type: application/json" \
          -H "X-Sentry-Auth: Sentry sentry_version=7, sentry_key=${public_key}" \
          -d "{\"message\": \"ORDR Backup Failure: ${message}\", \"level\": \"error\", \"logger\": \"backup\"}" \
          || true  # don't fail if Sentry itself is down
  }

  echo "[orchestrator] Backup + B2 upload started at $(date -u +%Y-%m-%dT%H:%M:%SZ)"

  # Step 1: PostgreSQL dump
  if ! BACKUP_DIR="$BACKUP_DIR" RETAIN_DAYS="$RETAIN_DAYS" bash "${SCRIPT_DIR}/pg_backup.sh"; then
      echo "[orchestrator] FAIL: pg_backup.sh failed" >&2
      _alert_sentry "pg_backup.sh failed — database backup did not complete"
      exit 1
  fi

  # Find the most recent dump file
  LATEST_DUMP=$(find "$BACKUP_DIR" -name "hedgecore_*.dump" -newer /tmp/.backup_sentinel 2>/dev/null | sort -t_ -k2,3 | tail -1)
  if [ -z "$LATEST_DUMP" ]; then
      # Fallback: just take the newest file
      LATEST_DUMP=$(find "$BACKUP_DIR" -name "hedgecore_*.dump" | sort | tail -1)
  fi

  if [ -z "$LATEST_DUMP" ]; then
      echo "[orchestrator] FAIL: no dump file found after backup" >&2
      _alert_sentry "pg_backup.sh completed but no dump file found"
      exit 1
  fi

  # Step 2: Upload to B2
  if ! BACKUP_FILE="$LATEST_DUMP" bash "${SCRIPT_DIR}/b2_upload.sh"; then
      echo "[orchestrator] FAIL: B2 upload failed for $LATEST_DUMP" >&2
      _alert_sentry "B2 upload failed for $(basename "$LATEST_DUMP") — backup not offsite"
      exit 2
  fi

  echo "[orchestrator] SUCCESS: backup complete and uploaded to B2"
  touch /tmp/.backup_sentinel
  ```

- [ ] **5.3 — Create `scripts/render/cron_backup.sh`**

  Render cron jobs run as simple shell commands. This thin wrapper sets the correct PATH for `pg_dump` and `rclone`.

  ```bash
  #!/usr/bin/env bash
  # cron_backup.sh — Render cron job entry point for daily PostgreSQL backup
  #
  # Render injects: DATABASE_URL, B2_ACCOUNT_ID, B2_APP_KEY, B2_BUCKET, SENTRY_DSN
  # via environment variables configured in the service's env group.

  set -euo pipefail

  # Ensure pg_dump is in PATH (Render Ubuntu images have PostgreSQL client tools)
  export PATH="/usr/lib/postgresql/14/bin:/usr/lib/postgresql/15/bin:$PATH"

  # Install rclone if not present (Render cron containers are ephemeral)
  if ! command -v rclone &>/dev/null; then
      echo "[cron_backup] Installing rclone..."
      curl -fsSL https://rclone.org/install.sh | bash
  fi

  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  bash "${SCRIPT_DIR}/../backup/backup_and_upload.sh"
  ```

- [ ] **5.4 — Create `scripts/render/cron_restore_verify.sh`**

  ```bash
  #!/usr/bin/env bash
  # cron_restore_verify.sh — Monthly restore integrity check
  #
  # Render injects: B2_ACCOUNT_ID, B2_APP_KEY, B2_BUCKET, VERIFY_DB_URL, SENTRY_DSN
  #
  # What it does:
  #   1. Downloads the most recent backup from B2
  #   2. Runs restore_verify.sh against a temporary verify database
  #   3. Reports PASS or FAIL; alerts Sentry on failure

  set -euo pipefail

  B2_ACCOUNT_ID="${B2_ACCOUNT_ID:?ERROR: B2_ACCOUNT_ID required}"
  B2_APP_KEY="${B2_APP_KEY:?ERROR: B2_APP_KEY required}"
  B2_BUCKET="${B2_BUCKET:?ERROR: B2_BUCKET required}"
  VERIFY_DB_URL="${VERIFY_DB_URL:?ERROR: VERIFY_DB_URL required}"
  B2_ENDPOINT="${B2_ENDPOINT:-https://s3.us-west-004.backblazeb2.com}"

  export PATH="/usr/lib/postgresql/14/bin:/usr/lib/postgresql/15/bin:$PATH"

  if ! command -v rclone &>/dev/null; then
      curl -fsSL https://rclone.org/install.sh | bash
  fi

  RESTORE_DIR="/tmp/restore_verify"
  mkdir -p "$RESTORE_DIR"

  export RCLONE_S3_PROVIDER=Other
  export RCLONE_S3_ENV_AUTH=false
  export RCLONE_S3_ACCESS_KEY_ID="$B2_ACCOUNT_ID"
  export RCLONE_S3_SECRET_ACCESS_KEY="$B2_APP_KEY"
  export RCLONE_S3_ENDPOINT="$B2_ENDPOINT"

  echo "[restore_verify] Listing most recent backup in B2..."
  LATEST=$(rclone lsf ":s3:${B2_BUCKET}/db-backups/" --format "tp" | sort -t';' -k1 | tail -1 | cut -d';' -f2 || true)

  if [ -z "$LATEST" ]; then
      echo "[restore_verify] FAIL: no backup found in B2 bucket $B2_BUCKET" >&2
      exit 1
  fi

  echo "[restore_verify] Downloading: $LATEST"
  rclone copyto ":s3:${B2_BUCKET}/db-backups/${LATEST}" "${RESTORE_DIR}/${LATEST}"

  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  DUMP_FILE="${RESTORE_DIR}/${LATEST}" VERIFY_DB_URL="$VERIFY_DB_URL" \
      bash "${SCRIPT_DIR}/../backup/restore_verify.sh"
  ```

- [ ] **5.5 — Add backup cron jobs to `render.yaml`**

  Add two new cron services inside the `services:` block:

  ```yaml
    # ── Daily backup cron (02:00 UTC) ────────────────────────────────────────────
    - type: cron
      name: hedgecore-backup-daily
      runtime: docker
      dockerfilePath: scripts/backup/Dockerfile.backup
      schedule: "0 2 * * *"
      plan: starter
      envVars:
        - key: DATABASE_URL
          fromGroup: hedgecore-secrets
        - key: B2_ACCOUNT_ID
          fromGroup: hedgecore-secrets
        - key: B2_APP_KEY
          fromGroup: hedgecore-secrets
        - key: B2_BUCKET
          fromGroup: hedgecore-secrets
        - key: SENTRY_DSN
          fromGroup: hedgecore-secrets

    # ── Monthly restore verification (01:00 UTC on 1st of month) ────────────────
    - type: cron
      name: hedgecore-restore-verify-monthly
      runtime: docker
      dockerfilePath: scripts/backup/Dockerfile.backup
      schedule: "0 1 1 * *"
      plan: starter
      envVars:
        - key: VERIFY_DB_URL
          fromGroup: hedgecore-secrets
        - key: B2_ACCOUNT_ID
          fromGroup: hedgecore-secrets
        - key: B2_APP_KEY
          fromGroup: hedgecore-secrets
        - key: B2_BUCKET
          fromGroup: hedgecore-secrets
        - key: SENTRY_DSN
          fromGroup: hedgecore-secrets
  ```

- [ ] **5.6 — Create `scripts/backup/Dockerfile.backup`**

  Render's `runtime: docker` crons need a Dockerfile. This one is minimal — Ubuntu with PostgreSQL client tools and rclone:

  ```dockerfile
  FROM ubuntu:22.04

  # Install PostgreSQL client (pg_dump, psql) and curl for rclone install
  RUN apt-get update && apt-get install -y --no-install-recommends \
      postgresql-client-14 \
      curl \
      ca-certificates \
      && rm -rf /var/lib/apt/lists/*

  # Install rclone
  RUN curl -fsSL https://rclone.org/install.sh | bash

  WORKDIR /app

  # Copy backup scripts
  COPY scripts/backup/ ./backup/
  COPY scripts/render/cron_backup.sh ./render/
  COPY scripts/render/cron_restore_verify.sh ./render/

  RUN chmod +x backup/*.sh render/*.sh

  # Default CMD: daily backup. Override via Render cron startCommand.
  CMD ["bash", "render/cron_backup.sh"]
  ```

  Note: The `dockerfilePath` in `render.yaml` must be relative to the repo root. `scripts/backup/Dockerfile.backup` is correct.

  However, the `COPY` paths in the Dockerfile are relative to the **Docker build context** (which Render sets to the repo root by default for blueprint-defined crons). So `COPY scripts/backup/` and `COPY scripts/render/` are valid.

- [ ] **5.7 — Add required secrets to env groups (manual, document as checklist)**

  In the Render dashboard, add to `hedgecore-secrets`:
  - `B2_ACCOUNT_ID` — Backblaze B2 Application Key ID
  - `B2_APP_KEY` — Backblaze B2 Application Key
  - `B2_BUCKET` — e.g. `ordr-terminal-backups`
  - `B2_ENDPOINT` — e.g. `https://s3.us-west-004.backblazeb2.com` (match bucket region)
  - `VERIFY_DB_URL` — connection string to a dedicated Render PostgreSQL instance for restore verification (can be a free-tier separate DB named `hedgecore-restore-verify`)

  In Backblaze B2 dashboard:
  1. Create bucket `ordr-terminal-backups` (private, lifecycle: 90 day delete)
  2. Create Application Key with read/write access to that bucket only
  3. Note the keyId and applicationKey

- [ ] **5.8 — Test scripts locally before deploying**

  On a machine with `pg_dump` and `rclone` available:

  ```bash
  # Test pg_backup.sh in isolation
  DATABASE_URL="postgresql://hedge_user:...@localhost/hedge" \
  BACKUP_DIR="/tmp/test_backups" \
    bash D:/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/scripts/backup/pg_backup.sh
  ```

  Expected output:
  ```
  [backup] Starting backup at ...
  [backup] Dump complete: XXXXXX bytes
  [backup] SUCCESS: /tmp/test_backups/hedgecore_YYYYMMDD_HHMMSS.dump
  ```

  ```bash
  # Test b2_upload.sh with a real B2 bucket
  B2_ACCOUNT_ID="..." B2_APP_KEY="..." B2_BUCKET="ordr-terminal-backups" \
  BACKUP_FILE="/tmp/test_backups/hedgecore_YYYYMMDD_HHMMSS.dump" \
    bash D:/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/scripts/backup/b2_upload.sh
  ```

  Expected output:
  ```
  [b2_upload] SUCCESS: hedgecore_YYYYMMDD_HHMMSS.dump uploaded to B2://ordr-terminal-backups/db-backups/
  ```

---

## Chunk 6: CI Updates + Final Verification

Ensure CI catches Sentry import errors and validates the new test files.

### Files

**Modify:**
- `.github/workflows/ci.yml` — add `SENTRY_DSN` env var (empty) to pytest step so the no-op path is exercised in CI

### Steps

- [ ] **6.1 — Add `SENTRY_DSN=""` to CI pytest env block**

  In `.github/workflows/ci.yml`, find the `Pytest with coverage` step env block and add:
  ```yaml
        env:
          DATABASE_URL: "sqlite+aiosqlite:///:memory:"
          JWT_SECRET: "ci-test-secret-32-chars-minimum-ok"
          ENV: "test"
          SENTRY_DSN: ""   # empty — exercises no-op path, not production DSN
  ```

  This ensures `init_sentry()` runs in CI (returns False gracefully) without ever sending events to a real Sentry project.

- [ ] **6.2 — Run full backend test suite with all new tests**

  ```bash
  cd D:/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/backend
  JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
  DATABASE_URL="sqlite+aiosqlite://" \
  SENTRY_DSN="" \
    python -m pytest tests/ -x -q --tb=short \
    --cov=app --cov-report=term-missing \
    --cov-fail-under=60
  ```

  Expected:
  ```
  .... (all previously passing tests) ....
  tests/test_rate_limit_failclosed.py ....
  tests/test_sentry_pii_scrub.py ....
  X passed, Y skipped
  Coverage: XX% >= 60% PASS
  ```

- [ ] **6.3 — Run frontend TypeScript + build checks**

  ```bash
  cd D:/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/frontend
  npx tsc --noEmit && echo "TypeScript: PASS"
  npx next build && echo "Build: PASS"
  ```

  Expected:
  ```
  TypeScript: PASS
  Build: PASS
  ```

- [ ] **6.4 — Update `CHANGELOG_AI.md`**

  Append to `.claude/state/CHANGELOG_AI.md`:

  ```markdown
  ## 2026-03-28 — Sprint 2: Infrastructure Upgrade

  ### Completed
  - render.yaml: upgraded hedgecore + hedgecore-preview to plan: starter (eliminates cold starts)
  - render.yaml: upgraded hedgecore-db + hedgecore-preview-db to plan: starter (private networking eligible)
  - render.yaml: added Redis service blocks (hedgecore-redis, hedgecore-preview-redis)
  - render.yaml: added daily backup cron (02:00 UTC) + monthly restore-verify cron
  - rate_limit.py: _RedisTokenBucket.consume changed from fail-open to fail-CLOSED (spec 2.3)
  - app/core/sentry_config.py: created PII-scrubbing Sentry init module
  - main.py: wired init_sentry() at startup (no-op when SENTRY_DSN unset)
  - requirements.txt: added sentry-sdk[fastapi]>=2.0.0
  - frontend: added @sentry/nextjs, sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts
  - scripts/backup/: added b2_upload.sh, backup_and_upload.sh, Dockerfile.backup
  - scripts/render/: added cron_backup.sh, cron_restore_verify.sh
  - docs/ops/uptime-monitoring.md: created uptime monitoring runbook
  - tests: added test_rate_limit_failclosed.py (4 tests) + test_sentry_pii_scrub.py (4 tests)
  - ci.yml: added SENTRY_DSN="" to pytest env for no-op path coverage

  ### Manual Steps Remaining (operator)
  - Render dashboard: update DATABASE_URL to internal hostname in hedgecore-secrets
  - Render dashboard: provision Backblaze B2 keys in hedgecore-secrets
  - Render dashboard: run Blueprint Sync to activate Redis + cron jobs
  - Vercel dashboard: add NEXT_PUBLIC_SENTRY_DSN + SENTRY_DSN env vars
  - BetterUptime: register /api/health monitor + configure Slack alerts
  - Sentry dashboard: create projects "ORDR Terminal Backend" and "ORDR Terminal Frontend"

  ### Risk Closures
  - RISK-INF-01: closed (starter tier + keepalive cron)
  ```

- [ ] **6.5 — Update `CURRENT_STATE.md`**

  Update the Sprint 2 status in `.claude/state/CURRENT_STATE.md` to reflect completion:

  ```markdown
  ## Sprint 2 — Infrastructure Upgrade
  Status: IMPLEMENTED (manual Render dashboard steps remaining)
  Completed: 2026-03-28

  - [x] Render paid tier (render.yaml updated)
  - [x] Private networking (DATABASE_URL comment + manual step documented)
  - [x] Redis service provisioned in render.yaml
  - [x] Redis rate limiting changed to fail-CLOSED
  - [x] Sentry backend: sentry_config.py + wired in main.py
  - [x] Sentry frontend: @sentry/nextjs + config files
  - [ ] Uptime monitoring (BetterUptime — manual)
  - [x] Backup cron jobs + B2 upload scripts + Dockerfile
  - [ ] Manual: Render dashboard secrets + Blueprint Sync
  - [ ] Manual: Vercel Sentry DSN env vars
  ```

---

## Summary of All File Changes

### Create (new files)
| File | Purpose |
|------|---------|
| `backend/app/core/sentry_config.py` | PII-scrubbing Sentry init module |
| `backend/tests/test_rate_limit_failclosed.py` | TDD: fail-closed rate limiting |
| `backend/tests/test_sentry_pii_scrub.py` | TDD: Sentry PII scrubbing |
| `frontend/sentry.client.config.ts` | Sentry browser init (no-op when DSN unset) |
| `frontend/sentry.server.config.ts` | Sentry server init |
| `frontend/sentry.edge.config.ts` | Sentry edge runtime init |
| `scripts/backup/b2_upload.sh` | Backblaze B2 upload via rclone |
| `scripts/backup/backup_and_upload.sh` | Orchestrator: backup + B2 + alert |
| `scripts/backup/Dockerfile.backup` | Docker image for backup cron jobs |
| `scripts/render/cron_backup.sh` | Render daily backup entry point |
| `scripts/render/cron_restore_verify.sh` | Render monthly restore-verify entry point |
| `docs/ops/uptime-monitoring.md` | Uptime monitoring runbook |

### Modify (existing files)
| File | Change |
|------|--------|
| `render.yaml` | Plans starter, Redis services, backup crons, SENTRY_DSN + REDIS_URL env var slots |
| `backend/requirements.txt` | Add `sentry-sdk[fastapi]>=2.0.0` |
| `backend/app/middleware/rate_limit.py` | `_RedisTokenBucket.consume` fail-closed (deny on Redis error) |
| `backend/app/main.py` | Wire `init_sentry()` at startup |
| `frontend/package.json` | Add `@sentry/nextjs` |
| `frontend/next.config.ts` | Wrap with `withSentryConfig` |
| `.github/workflows/ci.yml` | Add `SENTRY_DSN: ""` to pytest env |
| `.claude/state/CHANGELOG_AI.md` | Record sprint completion |
| `.claude/state/CURRENT_STATE.md` | Update sprint status |

### Architecture Freeze
No frozen files are modified. Changes are confined to:
- Middleware logic (`rate_limit.py`) — not a frozen file
- App startup (`main.py`) — not a frozen file (only adding Sentry init call)
- IaC (`render.yaml`) — infrastructure config, not engine logic

No ADR required.
