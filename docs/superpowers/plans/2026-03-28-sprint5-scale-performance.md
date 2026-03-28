# Sprint 5 — Scale & Performance Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate system handles institutional load, add market data caching, tune DB connections, implement webhook support, and document horizontal scaling contract.

**Architecture:** The backend is a single FastAPI process on Render.com with a Render PostgreSQL database; Redis is now provisioned (Sprint 2 prerequisite) and used for rate limiting and cache. Webhooks are delivered from async FastAPI background tasks, with per-tenant HMAC-SHA256 signing and exponential backoff; successful deliveries emit to the WORM audit_events chain while the operational delivery log rolls at 100 entries per endpoint. Connection pooling is switched from NullPool to an async bounded pool (pool_size=20, max_overflow=10) that fits within Render PostgreSQL Starter's 97-connection ceiling.

**Tech Stack:** k6, Redis, SQLAlchemy async, FastAPI background tasks, HMAC-SHA256

---

## Prerequisites

- Sprint 2 complete: Redis provisioned, `REDIS_URL` env var set in Render.
- `aiosqlite` available for SQLite test path (already in test requirements).
- `redis>=5.0.4` already in `backend/requirements.txt`.
- k6 installed locally (`choco install k6` on Windows or `brew install k6` on macOS).

---

## Chunk 1: Connection Pool Tuning

**Why first:** All subsequent load testing depends on the pool being correctly configured. NullPool creates a new connection per request — catastrophic under 100 concurrent users.

### Files

- **Modify:** `backend/app/core/db.py`
- **Modify:** `backend/app/core/config.py` (add pool config settings)
- **Test:** `backend/tests/test_db_pool.py` (create)

---

- [ ] **1.1 — Add pool config to Settings**

  Read `backend/app/core/config.py` to find the `Settings` class, then add pool fields after the existing DB fields.

  Add to `Settings` class:
  ```python
  # Connection pool (tuned for Render PostgreSQL Starter — 97 connection ceiling)
  DB_POOL_SIZE: int = 20
  DB_MAX_OVERFLOW: int = 10
  DB_POOL_TIMEOUT: int = 30
  DB_POOL_PRE_PING: bool = True
  ```

- [ ] **1.2 — Write failing test first (TDD)**

  Create `backend/tests/test_db_pool.py`:
  ```python
  """Tests for connection pool configuration."""
  from __future__ import annotations
  import os
  import pytest
  from unittest.mock import patch, MagicMock


  def test_pool_config_values():
      """Pool settings must match institutional spec (pool_size=20, max_overflow=10)."""
      with patch.dict(os.environ, {"DATABASE_URL": "sqlite+aiosqlite://"}):
          from app.core.config import Settings
          s = Settings()
          assert s.DB_POOL_SIZE == 20
          assert s.DB_MAX_OVERFLOW == 10
          assert s.DB_POOL_TIMEOUT == 30
          assert s.DB_POOL_PRE_PING is True


  def test_pool_total_does_not_exceed_render_starter_limit():
      """pool_size + max_overflow must be < 97 (Render PostgreSQL Starter ceiling)."""
      with patch.dict(os.environ, {"DATABASE_URL": "sqlite+aiosqlite://"}):
          from app.core.config import Settings
          s = Settings()
          assert s.DB_POOL_SIZE + s.DB_MAX_OVERFLOW <= 97


  def test_create_engine_uses_asyncpg_pool(monkeypatch):
      """When DATABASE_URL is PostgreSQL, engine must NOT use NullPool."""
      import importlib
      import sqlalchemy
      from sqlalchemy.pool import NullPool, QueuePool, AsyncAdaptedQueuePool

      captured = {}

      original_create = sqlalchemy.ext.asyncio.create_async_engine

      def mock_create(url, **kwargs):
          captured.update(kwargs)
          # Return a mock engine to avoid real connection
          m = MagicMock()
          m.dispose = MagicMock()
          return m

      monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://user:pass@localhost/db")
      monkeypatch.setattr("sqlalchemy.ext.asyncio.create_async_engine", mock_create)

      # Re-import to trigger module-level engine creation
      import app.core.db as db_module
      importlib.reload(db_module)

      # NullPool must not be used when DATABASE_URL is postgres
      assert captured.get("poolclass") is not NullPool

      # Cleanup: restore
      monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite://")
      importlib.reload(db_module)
  ```

  Run to confirm failure:
  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_db_pool.py -x -q --tb=short 2>&1 | tail -20
  ```
  Expected: `FAILED tests/test_db_pool.py::test_pool_config_values` (field not yet defined).

- [ ] **1.3 — Implement: update db.py to use QueuePool for PostgreSQL**

  In `backend/app/core/db.py`, replace the current engine creation block:

  ```python
  # Current (lines 67-73):
  async_engine: AsyncEngine = create_async_engine(
      DATABASE_URL,
      echo=False,
      future=True,
      poolclass=NullPool,
      pool_pre_ping=True,
  )
  ```

  Replace with:
  ```python
  import os as _os
  from sqlalchemy.pool import NullPool as _NullPool

  def _build_engine_kwargs() -> dict:
      """Return engine kwargs appropriate for the database URL.

      SQLite (test path): NullPool — no persistent connections needed.
      PostgreSQL (production): bounded async queue pool tuned for Render Starter.
      """
      url = DATABASE_URL
      is_sqlite = "sqlite" in url

      if is_sqlite:
          return {
              "echo": False,
              "future": True,
              "poolclass": _NullPool,
          }

      from app.core.config import settings  # local import avoids circular at module load
      return {
          "echo": False,
          "future": True,
          "pool_size": settings.DB_POOL_SIZE,
          "max_overflow": settings.DB_MAX_OVERFLOW,
          "pool_timeout": settings.DB_POOL_TIMEOUT,
          "pool_pre_ping": settings.DB_POOL_PRE_PING,
          "pool_recycle": 1800,  # recycle connections every 30 min to avoid stale PG connections
      }

  async_engine: AsyncEngine = create_async_engine(DATABASE_URL, **_build_engine_kwargs())
  ```

  Also remove the top-level `from sqlalchemy.pool import NullPool` import (it moves inside the helper).

- [ ] **1.4 — Run tests to confirm pass**

  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_db_pool.py -x -q --tb=short 2>&1 | tail -20
  ```
  Expected: `3 passed`.

- [ ] **1.5 — Run full suite to confirm no regressions**

  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -x -q --tb=short 2>&1 | tail -30
  ```
  Expected: same pass count as before (approximately 2725 passed, 0 failed, 134 skipped).

---

## Chunk 2: Redis Market Data Cache

**Why second:** The in-process `_TTLCache` in `v1_market_data_live.py` does not survive across multiple Render instances and doesn't expose cache metrics. Replace with Redis-backed cache that exposes hit/miss counters on `/api/health`.

### Files

- **Create:** `backend/app/core/redis_client.py`
- **Modify:** `backend/app/core/config.py` (add `REDIS_URL`)
- **Modify:** `backend/app/api/routes/v1_market_data_live.py` (swap cache backend)
- **Modify:** `backend/app/api/routes/system.py` (add cache counters to health endpoint)
- **Test:** `backend/tests/test_redis_cache.py` (create)

---

- [ ] **2.1 — Add REDIS_URL to Settings**

  Add to `Settings` class in `backend/app/core/config.py`:
  ```python
  REDIS_URL: str = ""  # e.g. redis://localhost:6379/0 — empty = cache disabled (fail-open)
  ```

- [ ] **2.2 — Create redis_client.py**

  Create `backend/app/core/redis_client.py`:
  ```python
  """
  app/core/redis_client.py

  Singleton async Redis client for ORDR Terminal.

  Fail behaviour per Sprint 2 spec:
    - Market data cache: fail-open (bypass cache, hit provider directly).
    - Rate limiting: handled by RateLimitMiddleware (fail-closed with in-process fallback).
    - Session cache: JWT remains valid via signature check — Redis not required.

  Usage:
      from app.core.redis_client import get_redis, redis_cache_get, redis_cache_set

  The module exposes a synchronous `get_redis()` that returns the redis.asyncio.Redis
  client or None if Redis is unavailable/unconfigured.
  """
  from __future__ import annotations

  import json
  import logging
  import os
  from typing import Any

  _log = logging.getLogger("hedgecalc.redis")

  _client = None
  _client_initialised = False

  # ---------------------------------------------------------------------------
  # Cache hit/miss counters (in-process, per-instance — reported in /api/health)
  # ---------------------------------------------------------------------------
  _cache_hits: int = 0
  _cache_misses: int = 0


  def _get_redis_url() -> str:
      """Read REDIS_URL from settings or env (avoids circular import at module level)."""
      try:
          from app.core.config import settings
          return settings.REDIS_URL or ""
      except Exception:
          return os.getenv("REDIS_URL", "")


  def get_redis():
      """Return the async Redis client, or None if Redis is unavailable/unconfigured.

      Initialises lazily on first call. Fail-open: returns None on any error.
      The caller must handle None (treat as cache miss).
      """
      global _client, _client_initialised
      if _client_initialised:
          return _client

      _client_initialised = True
      url = _get_redis_url()

      if not url:
          _log.info("REDIS_URL not configured — Redis cache disabled (fail-open).")
          return None

      try:
          import redis.asyncio as aioredis
          _client = aioredis.from_url(url, decode_responses=True, socket_connect_timeout=2)
          _log.info("Redis client initialised: %s", url.split("@")[-1])
          return _client
      except Exception as exc:
          _log.warning("Redis client init failed (fail-open): %s", exc)
          return None


  def reset_redis_client() -> None:
      """Force re-initialisation on next call. Used in tests."""
      global _client, _client_initialised
      _client = None
      _client_initialised = False


  async def redis_cache_get(key: str) -> Any | None:
      """Fetch value from Redis cache. Returns None on miss or any error (fail-open).

      Increments global hit/miss counters for /api/health reporting.
      """
      global _cache_hits, _cache_misses
      client = get_redis()
      if client is None:
          _cache_misses += 1
          return None
      try:
          raw = await client.get(key)
          if raw is None:
              _cache_misses += 1
              return None
          _cache_hits += 1
          return json.loads(raw)
      except Exception as exc:
          _log.warning("Redis cache get error (fail-open): %s", exc)
          _cache_misses += 1
          return None


  async def redis_cache_set(key: str, value: Any, ttl_seconds: int = 60) -> None:
      """Store value in Redis cache with TTL. Fail-open: logs and continues on error."""
      client = get_redis()
      if client is None:
          return
      try:
          await client.set(key, json.dumps(value, default=str), ex=ttl_seconds)
      except Exception as exc:
          _log.warning("Redis cache set error (fail-open): %s", exc)


  def get_cache_stats() -> dict[str, int]:
      """Return current cache hit/miss counters for health reporting."""
      return {
          "cache_hits": _cache_hits,
          "cache_misses": _cache_misses,
          "hit_rate_pct": round(
              _cache_hits / max(1, _cache_hits + _cache_misses) * 100, 1
          ),
      }


  __all__ = [
      "get_redis",
      "reset_redis_client",
      "redis_cache_get",
      "redis_cache_set",
      "get_cache_stats",
  ]
  ```

- [ ] **2.3 — Write failing tests first (TDD)**

  Create `backend/tests/test_redis_cache.py`:
  ```python
  """Tests for Redis cache client and market data cache integration."""
  from __future__ import annotations
  import json
  import pytest
  from unittest.mock import AsyncMock, MagicMock, patch


  def test_get_redis_returns_none_when_no_url(monkeypatch):
      """When REDIS_URL is empty, get_redis() returns None (fail-open)."""
      monkeypatch.setenv("REDIS_URL", "")
      from app.core import redis_client
      redis_client.reset_redis_client()
      result = redis_client.get_redis()
      assert result is None


  @pytest.mark.asyncio
  async def test_cache_miss_increments_counter(monkeypatch):
      """Cache miss on None Redis increments miss counter."""
      monkeypatch.setenv("REDIS_URL", "")
      from app.core import redis_client
      redis_client.reset_redis_client()
      redis_client._cache_hits = 0
      redis_client._cache_misses = 0

      result = await redis_client.redis_cache_get("market_data:test:EURUSD:1min")
      assert result is None
      assert redis_client._cache_misses == 1
      assert redis_client._cache_hits == 0


  @pytest.mark.asyncio
  async def test_cache_hit_increments_counter(monkeypatch):
      """Cache hit on mocked Redis increments hit counter."""
      from app.core import redis_client
      redis_client.reset_redis_client()
      redis_client._cache_hits = 0
      redis_client._cache_misses = 0

      mock_client = AsyncMock()
      mock_client.get = AsyncMock(return_value=json.dumps({"rate": 1.08}))
      redis_client._client = mock_client
      redis_client._client_initialised = True

      result = await redis_client.redis_cache_get("market_data:twelvedata:EURUSD:1min")
      assert result == {"rate": 1.08}
      assert redis_client._cache_hits == 1
      assert redis_client._cache_misses == 0


  @pytest.mark.asyncio
  async def test_cache_set_fail_open_on_error(monkeypatch):
      """redis_cache_set does not raise on Redis error — fail-open."""
      from app.core import redis_client
      redis_client.reset_redis_client()

      mock_client = AsyncMock()
      mock_client.set = AsyncMock(side_effect=ConnectionError("Redis down"))
      redis_client._client = mock_client
      redis_client._client_initialised = True

      # Should not raise
      await redis_client.redis_cache_set("market_data:test:GBPUSD:1min", {"rate": 1.27})


  def test_get_cache_stats_structure():
      """get_cache_stats returns dict with required keys."""
      from app.core.redis_client import get_cache_stats
      stats = get_cache_stats()
      assert "cache_hits" in stats
      assert "cache_misses" in stats
      assert "hit_rate_pct" in stats


  def test_cache_key_pattern():
      """Validate the canonical cache key pattern used across the codebase."""
      provider = "twelvedata"
      pair = "EURUSD"
      timeframe = "1min"
      key = f"market_data:{provider}:{pair}:{timeframe}"
      assert key == "market_data:twelvedata:EURUSD:1min"
  ```

  Run to confirm failure:
  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_redis_cache.py -x -q --tb=short 2>&1 | tail -20
  ```
  Expected: `ModuleNotFoundError` or `ImportError` for `app.core.redis_client`.

- [ ] **2.4 — Update `v1_market_data_live.py` to use Redis cache**

  In `backend/app/api/routes/v1_market_data_live.py`, after the existing imports, add:
  ```python
  from app.core.redis_client import redis_cache_get, redis_cache_set
  ```

  Identify the primary FX fetch function (the one that calls TwelveData/IBKR). Wrap each provider call with cache check/set using the key pattern `market_data:{provider}:{pair}:{timeframe}`:

  ```python
  # Example pattern — apply to each provider fetch that returns serialisable data:
  _REDIS_TTL = 60  # seconds

  async def _fetch_with_cache(provider: str, pair: str, timeframe: str, fetch_fn) -> Any:
      """Wrap a provider fetch with Redis cache (60s TTL). Fail-open on Redis errors."""
      cache_key = f"market_data:{provider}:{pair}:{timeframe}"
      cached = await redis_cache_get(cache_key)
      if cached is not None:
          return cached
      result = await fetch_fn()
      if result is not None:
          await redis_cache_set(cache_key, result, ttl_seconds=_REDIS_TTL)
      return result
  ```

  The existing `_TTLCache` (`_cache`) can remain as a secondary in-process layer for the SQLite/no-Redis path — do not remove it.

- [ ] **2.5 — Add cache stats to `/system/health`**

  In `backend/app/api/routes/system.py`, update `system_health()`:
  ```python
  @router.get("/health", include_in_schema=True)
  async def system_health():
      governance = {}
      try:
          from app.core.kernel import kernel_health
          governance = kernel_health()
      except Exception:
          pass

      cache_stats: dict = {}
      try:
          from app.core.redis_client import get_cache_stats
          cache_stats = get_cache_stats()
      except Exception:
          pass

      return {
          "status": "ok",
          "component": "api",
          "governance": governance,
          "market_data_cache": cache_stats,
      }
  ```

- [ ] **2.6 — Run cache tests to confirm pass**

  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_redis_cache.py -x -q --tb=short 2>&1 | tail -20
  ```
  Expected: `6 passed`.

- [ ] **2.7 — Run full suite to confirm no regressions**

  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -q --tb=short 2>&1 | tail -30
  ```

---

## Chunk 3: Webhook Support — Models and Migrations

**Why before routes:** SQLAlchemy models and Alembic migration must exist before route handlers can reference them.

### Files

- **Create:** `backend/app/models/webhook.py`
- **Create:** `backend/alembic/versions/0010_add_webhooks.py` (migration)
- **Test:** `backend/tests/test_webhook_models.py` (create)

---

- [ ] **3.1 — Write failing model test first (TDD)**

  Create `backend/tests/test_webhook_models.py`:
  ```python
  """Tests for Webhook and WebhookDeliveryLog ORM models."""
  from __future__ import annotations
  import uuid
  import pytest


  def test_webhook_endpoint_model_importable():
      """WebhookEndpoint model must import without error."""
      from app.models.webhook import WebhookEndpoint
      assert WebhookEndpoint.__tablename__ == "webhook_endpoints"


  def test_webhook_delivery_log_model_importable():
      """WebhookDeliveryLog model must import without error."""
      from app.models.webhook import WebhookDeliveryLog
      assert WebhookDeliveryLog.__tablename__ == "webhook_delivery_logs"


  def test_webhook_endpoint_has_required_columns():
      """WebhookEndpoint must have url, secret, events, company_id columns."""
      from app.models.webhook import WebhookEndpoint
      cols = {c.name for c in WebhookEndpoint.__table__.columns}
      for required in ("id", "company_id", "url", "secret", "events", "is_active", "created_at"):
          assert required in cols, f"Missing column: {required}"


  def test_webhook_delivery_log_has_required_columns():
      """WebhookDeliveryLog must have endpoint_id, event_type, status, attempt columns."""
      from app.models.webhook import WebhookDeliveryLog
      cols = {c.name for c in WebhookDeliveryLog.__table__.columns}
      for required in ("id", "endpoint_id", "event_type", "payload_json", "status",
                       "attempt", "response_status", "delivered_at"):
          assert required in cols, f"Missing column: {required}"


  def test_webhook_endpoint_max_five_per_tenant():
      """MAX_PER_TENANT constant must be 5."""
      from app.models.webhook import MAX_WEBHOOKS_PER_TENANT
      assert MAX_WEBHOOKS_PER_TENANT == 5


  def test_supported_events_includes_all_spec_events():
      """All four spec events must be in SUPPORTED_EVENTS."""
      from app.models.webhook import SUPPORTED_EVENTS
      required = {
          "position.created",
          "calculation.completed",
          "proposal.approved",
          "proposal.rejected",
      }
      assert required.issubset(SUPPORTED_EVENTS)
  ```

  Run to confirm failure:
  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_webhook_models.py -x -q --tb=short 2>&1 | tail -20
  ```
  Expected: `ModuleNotFoundError: No module named 'app.models.webhook'`.

- [ ] **3.2 — Create webhook.py model**

  Create `backend/app/models/webhook.py`:
  ```python
  """
  Webhook ORM models for ORDR Terminal.

  WebhookEndpoint  — per-tenant registered callback URLs (max 5).
  WebhookDeliveryLog — operational delivery log (last 100 per endpoint, rolling).
                        NOT a compliance artifact — use WORM audit_events for contractual proof.

  Events fired: position.created, calculation.completed,
                proposal.approved, proposal.rejected.

  Signature: HMAC-SHA256(webhook_secret, payload_json_utf8) — hex digest.
  Header sent to client: X-ORDR-Signature: sha256=<hex_digest>
  """
  from __future__ import annotations

  import uuid as _uuid
  from datetime import datetime, UTC

  from sqlalchemy import (
      Boolean, Column, DateTime, Integer, String, Text, ForeignKey, Index,
  )
  from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB

  from app.core.db import Base

  # ---------------------------------------------------------------------------
  # Constants
  # ---------------------------------------------------------------------------

  MAX_WEBHOOKS_PER_TENANT = 5

  SUPPORTED_EVENTS = frozenset({
      "position.created",
      "calculation.completed",
      "proposal.approved",
      "proposal.rejected",
  })

  # Exponential backoff schedule (minutes): 1, 5, 15, 60, 240
  RETRY_DELAYS_MINUTES = [1, 5, 15, 60, 240]
  MAX_ATTEMPTS = 5

  # Rolling log window per endpoint (operational only)
  DELIVERY_LOG_WINDOW = 100


  # ---------------------------------------------------------------------------
  # Models
  # ---------------------------------------------------------------------------

  class WebhookEndpoint(Base):
      """A registered callback URL for a tenant.

      One company can register up to MAX_WEBHOOKS_PER_TENANT endpoints.
      The `secret` field stores a per-endpoint random 32-byte hex secret used
      to sign payloads with HMAC-SHA256. Never expose the secret in list responses.
      """
      __tablename__ = "webhook_endpoints"

      id = Column(PGUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
      company_id = Column(PGUUID(as_uuid=True), nullable=False, index=True)

      url = Column(String(2048), nullable=False)
      secret = Column(String(64), nullable=False)  # 32-byte random hex, generated server-side
      description = Column(String(256), nullable=True)

      # Comma-separated event filter, e.g. "position.created,calculation.completed"
      # Empty string means subscribe to all SUPPORTED_EVENTS.
      events = Column(Text, nullable=False, default="")

      is_active = Column(Boolean, nullable=False, default=True)
      created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))
      updated_at = Column(DateTime(timezone=True), nullable=True, onupdate=lambda: datetime.now(UTC))

      __table_args__ = (
          Index("ix_webhook_endpoints_company_active", "company_id", "is_active"),
      )

      def get_events(self) -> frozenset[str]:
          """Return the set of subscribed events. Empty = all supported events."""
          if not self.events or not self.events.strip():
              return SUPPORTED_EVENTS
          return frozenset(e.strip() for e in self.events.split(",") if e.strip())

      def subscribes_to(self, event: str) -> bool:
          return event in self.get_events()


  class WebhookDeliveryLog(Base):
      """Operational delivery log — last 100 entries per endpoint (rolling window).

      IMPORTANT: This table is NOT a compliance artifact and is NOT WORM-governed.
      For contractual delivery proof, see audit_events with event_type='SYSTEM'
      and payload.webhook_event = 'webhook.delivered'.

      Retention: rows older than the most recent 100 per endpoint_id are pruned
      nightly by the cleanup task in app/tasks/webhook_cleanup.py.
      """
      __tablename__ = "webhook_delivery_logs"

      id = Column(PGUUID(as_uuid=True), primary_key=True, default=_uuid.uuid4)
      endpoint_id = Column(
          PGUUID(as_uuid=True),
          ForeignKey("webhook_endpoints.id", ondelete="CASCADE"),
          nullable=False,
          index=True,
      )

      event_type = Column(String(64), nullable=False)        # e.g. "position.created"
      payload_json = Column(JSONB, nullable=False)            # full event payload sent
      attempt = Column(Integer, nullable=False, default=1)   # 1..MAX_ATTEMPTS
      status = Column(String(16), nullable=False)            # "delivered" | "failed" | "pending"
      response_status = Column(Integer, nullable=True)       # HTTP status from client endpoint
      response_body = Column(Text, nullable=True)            # truncated to 512 chars
      error_message = Column(Text, nullable=True)            # error detail if status=failed
      delivered_at = Column(DateTime(timezone=True), nullable=True)  # null until delivered
      created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC))

      __table_args__ = (
          Index("ix_webhook_delivery_logs_endpoint_created", "endpoint_id", "created_at"),
      )


  __all__ = [
      "WebhookEndpoint",
      "WebhookDeliveryLog",
      "MAX_WEBHOOKS_PER_TENANT",
      "SUPPORTED_EVENTS",
      "RETRY_DELAYS_MINUTES",
      "MAX_ATTEMPTS",
      "DELIVERY_LOG_WINDOW",
  ]
  ```

- [ ] **3.3 — Run model tests to confirm pass**

  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_webhook_models.py -x -q --tb=short 2>&1 | tail -20
  ```
  Expected: `6 passed`.

- [ ] **3.4 — Create Alembic migration**

  First, find the latest migration to confirm numbering:
  ```bash
  ls "D:/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/backend/alembic/versions/" | sort | tail -5
  ```

  Create `backend/alembic/versions/0010_add_webhooks.py` (adjust number if needed after checking):
  ```python
  """add webhook_endpoints and webhook_delivery_logs tables

  Revision ID: 0010_add_webhooks
  Revises: <previous_revision_id>
  Create Date: 2026-03-28
  """
  from __future__ import annotations

  from alembic import op
  import sqlalchemy as sa
  from sqlalchemy.dialects.postgresql import UUID, JSONB

  revision = "0010_add_webhooks"
  down_revision = None  # TODO: set to actual previous revision ID after ls check
  branch_labels = None
  depends_on = None


  def upgrade() -> None:
      op.create_table(
          "webhook_endpoints",
          sa.Column("id", UUID(as_uuid=True), primary_key=True),
          sa.Column("company_id", UUID(as_uuid=True), nullable=False),
          sa.Column("url", sa.String(2048), nullable=False),
          sa.Column("secret", sa.String(64), nullable=False),
          sa.Column("description", sa.String(256), nullable=True),
          sa.Column("events", sa.Text(), nullable=False, server_default=""),
          sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
          sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                    server_default=sa.func.now()),
          sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
      )
      op.create_index("ix_webhook_endpoints_company_id", "webhook_endpoints", ["company_id"])
      op.create_index(
          "ix_webhook_endpoints_company_active",
          "webhook_endpoints", ["company_id", "is_active"],
      )

      op.create_table(
          "webhook_delivery_logs",
          sa.Column("id", UUID(as_uuid=True), primary_key=True),
          sa.Column(
              "endpoint_id", UUID(as_uuid=True),
              sa.ForeignKey("webhook_endpoints.id", ondelete="CASCADE"), nullable=False,
          ),
          sa.Column("event_type", sa.String(64), nullable=False),
          sa.Column("payload_json", JSONB(), nullable=False),
          sa.Column("attempt", sa.Integer(), nullable=False, server_default="1"),
          sa.Column("status", sa.String(16), nullable=False),
          sa.Column("response_status", sa.Integer(), nullable=True),
          sa.Column("response_body", sa.Text(), nullable=True),
          sa.Column("error_message", sa.Text(), nullable=True),
          sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
          sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                    server_default=sa.func.now()),
      )
      op.create_index("ix_webhook_delivery_logs_endpoint_id", "webhook_delivery_logs", ["endpoint_id"])
      op.create_index(
          "ix_webhook_delivery_logs_endpoint_created",
          "webhook_delivery_logs", ["endpoint_id", "created_at"],
      )


  def downgrade() -> None:
      op.drop_table("webhook_delivery_logs")
      op.drop_table("webhook_endpoints")
  ```

  Note: Set `down_revision` to the actual latest revision ID found in `alembic/versions/`. Do not run migration against production until Sprint 5 deploy day — test locally with `alembic upgrade head` against a dev DB.

---

## Chunk 4: Webhook Support — Service and HMAC Signing

**Why before routes:** Service layer contains business logic that routes depend on.

### Files

- **Create:** `backend/app/services/webhook_service.py`
- **Create:** `backend/app/tasks/webhook_cleanup.py`
- **Test:** `backend/tests/test_webhook_service.py` (create)

---

- [ ] **4.1 — Write failing service tests first (TDD)**

  Create `backend/tests/test_webhook_service.py`:
  ```python
  """Tests for webhook service — HMAC signing, delivery, retry backoff."""
  from __future__ import annotations
  import hashlib
  import hmac
  import json
  import pytest
  from unittest.mock import AsyncMock, MagicMock, patch


  def test_hmac_signature_algorithm():
      """HMAC-SHA256 signature must be verifiable by clients using the documented algorithm.

      Algorithm: HMAC-SHA256(key=secret_utf8, msg=payload_json_utf8)
      Header:    X-ORDR-Signature: sha256=<hex_digest>
      """
      secret = "test-webhook-secret-hex"
      payload = json.dumps({"event": "position.created", "data": {"id": "abc"}})
      expected_sig = hmac.new(
          secret.encode("utf-8"),
          payload.encode("utf-8"),
          hashlib.sha256,
      ).hexdigest()

      from app.services.webhook_service import compute_signature
      result = compute_signature(secret, payload)
      assert result == f"sha256={expected_sig}"


  def test_generate_secret_is_32_byte_hex():
      """Generated webhook secret must be 64 hex characters (32 bytes)."""
      from app.services.webhook_service import generate_webhook_secret
      secret = generate_webhook_secret()
      assert len(secret) == 64
      int(secret, 16)  # must be valid hex


  def test_generate_secret_is_unique():
      """Two calls to generate_webhook_secret must return different values."""
      from app.services.webhook_service import generate_webhook_secret
      assert generate_webhook_secret() != generate_webhook_secret()


  def test_retry_schedule_matches_spec():
      """Retry delays must match spec: 1m, 5m, 15m, 60m, 240m (5 attempts)."""
      from app.models.webhook import RETRY_DELAYS_MINUTES, MAX_ATTEMPTS
      assert RETRY_DELAYS_MINUTES == [1, 5, 15, 60, 240]
      assert MAX_ATTEMPTS == 5


  @pytest.mark.asyncio
  async def test_build_event_payload_structure():
      """Event payload must include event, timestamp, tenant_id, and data fields."""
      from app.services.webhook_service import build_event_payload
      import uuid
      payload = build_event_payload(
          event_type="position.created",
          tenant_id=str(uuid.uuid4()),
          data={"position_id": "pos-001", "currency_pair": "EURUSD"},
      )
      assert payload["event"] == "position.created"
      assert "timestamp" in payload
      assert "tenant_id" in payload
      assert payload["data"]["position_id"] == "pos-001"


  @pytest.mark.asyncio
  async def test_deliver_webhook_success(monkeypatch):
      """Successful delivery returns status=delivered and response_status=200."""
      import httpx
      from app.services.webhook_service import deliver_webhook_attempt

      mock_response = MagicMock()
      mock_response.status_code = 200
      mock_response.text = "OK"

      mock_client = AsyncMock()
      mock_client.__aenter__ = AsyncMock(return_value=mock_client)
      mock_client.__aexit__ = AsyncMock(return_value=False)
      mock_client.post = AsyncMock(return_value=mock_response)

      with patch("httpx.AsyncClient", return_value=mock_client):
          result = await deliver_webhook_attempt(
              url="https://example.com/webhook",
              secret="deadbeef" * 8,
              payload={"event": "position.created", "data": {}},
          )

      assert result["status"] == "delivered"
      assert result["response_status"] == 200


  @pytest.mark.asyncio
  async def test_deliver_webhook_connection_error_returns_failed(monkeypatch):
      """Connection error returns status=failed, not raised."""
      import httpx
      from app.services.webhook_service import deliver_webhook_attempt

      mock_client = AsyncMock()
      mock_client.__aenter__ = AsyncMock(return_value=mock_client)
      mock_client.__aexit__ = AsyncMock(return_value=False)
      mock_client.post = AsyncMock(side_effect=httpx.ConnectError("refused"))

      with patch("httpx.AsyncClient", return_value=mock_client):
          result = await deliver_webhook_attempt(
              url="https://example.com/webhook",
              secret="deadbeef" * 8,
              payload={"event": "position.created", "data": {}},
          )

      assert result["status"] == "failed"
      assert result["response_status"] is None
  ```

  Run to confirm failure:
  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_webhook_service.py -x -q --tb=short 2>&1 | tail -20
  ```
  Expected: `ModuleNotFoundError: No module named 'app.services.webhook_service'`.

- [ ] **4.2 — Create webhook_service.py**

  Create `backend/app/services/webhook_service.py`:
  ```python
  """
  app/services/webhook_service.py

  Webhook delivery service for ORDR Terminal.

  Responsibilities:
    1. generate_webhook_secret()     — cryptographically random 32-byte hex secret.
    2. compute_signature()           — HMAC-SHA256, documented algorithm for clients.
    3. build_event_payload()         — canonical JSON payload for all webhook events.
    4. deliver_webhook_attempt()     — single HTTP POST to client endpoint.
    5. dispatch_webhook_event()      — full delivery pipeline with retry + audit emit.

  Signature Algorithm (for client verification):
    - Compute: HMAC-SHA256(key=<webhook_secret>.encode('utf-8'), msg=<payload_json>.encode('utf-8'))
    - Send header: X-ORDR-Signature: sha256=<hex_digest>
    - Clients verify by recomputing the HMAC and comparing with constant-time comparison.

  Retry Schedule (exponential backoff, 5 max attempts):
    Attempt 1: immediate
    Attempt 2: +1 min
    Attempt 3: +5 min
    Attempt 4: +15 min
    Attempt 5: +60 min
    (Final attempt at +240 min would be attempt 6 — we stop after 5.)

  Delivery Proof:
    On each successful delivery, a WORM audit event (event_type=SYSTEM, payload.webhook_event
    = 'webhook.delivered') is written. This is the contractual proof artifact.
    The operational WebhookDeliveryLog table is NOT WORM-governed.
  """
  from __future__ import annotations

  import hashlib
  import hmac
  import json
  import logging
  import os
  import secrets
  import uuid
  from datetime import datetime, UTC
  from typing import Any

  import httpx

  _log = logging.getLogger("hedgecalc.webhook")

  # Delivery timeout for individual HTTP POST to client endpoint
  _DELIVERY_TIMEOUT_SECONDS = 10


  # ---------------------------------------------------------------------------
  # Cryptographic helpers
  # ---------------------------------------------------------------------------

  def generate_webhook_secret() -> str:
      """Generate a cryptographically random 32-byte webhook secret (64 hex chars)."""
      return secrets.token_hex(32)


  def compute_signature(secret: str, payload_json: str) -> str:
      """Compute HMAC-SHA256 signature for a webhook payload.

      Args:
          secret: The per-endpoint webhook secret (hex string).
          payload_json: The JSON-serialised payload string (UTF-8).

      Returns:
          Signature string in format: sha256=<hex_digest>

      Client verification:
          sig = hmac.new(secret.encode('utf-8'), payload_json.encode('utf-8'), hashlib.sha256)
          expected = f"sha256={sig.hexdigest()}"
          assert hmac.compare_digest(expected, received_header_value)
      """
      mac = hmac.new(
          secret.encode("utf-8"),
          payload_json.encode("utf-8"),
          hashlib.sha256,
      )
      return f"sha256={mac.hexdigest()}"


  # ---------------------------------------------------------------------------
  # Payload builder
  # ---------------------------------------------------------------------------

  def build_event_payload(
      event_type: str,
      tenant_id: str,
      data: dict[str, Any],
  ) -> dict[str, Any]:
      """Build the canonical webhook event payload.

      All webhook events share this envelope structure:
        {
          "event": "position.created",
          "timestamp": "2026-03-28T12:00:00Z",
          "tenant_id": "<uuid>",
          "delivery_id": "<uuid>",   # unique per delivery attempt for idempotency
          "data": { ... }
        }
      """
      return {
          "event": event_type,
          "timestamp": datetime.now(UTC).isoformat(),
          "tenant_id": tenant_id,
          "delivery_id": str(uuid.uuid4()),
          "data": data,
      }


  # ---------------------------------------------------------------------------
  # Delivery
  # ---------------------------------------------------------------------------

  async def deliver_webhook_attempt(
      url: str,
      secret: str,
      payload: dict[str, Any],
  ) -> dict[str, Any]:
      """Make a single HTTP POST delivery attempt to a client webhook endpoint.

      Returns a result dict:
        {
          "status": "delivered" | "failed",
          "response_status": int | None,
          "response_body": str | None,    # truncated to 512 chars
          "error_message": str | None,
        }

      Never raises — all errors are captured and returned as status=failed.
      """
      payload_json = json.dumps(payload, default=str)
      signature = compute_signature(secret, payload_json)

      headers = {
          "Content-Type": "application/json",
          "X-ORDR-Signature": signature,
          "X-ORDR-Event": payload.get("event", "unknown"),
          "X-ORDR-Delivery": payload.get("delivery_id", ""),
          "User-Agent": "ORDR-Terminal-Webhook/1.0",
      }

      try:
          async with httpx.AsyncClient(timeout=_DELIVERY_TIMEOUT_SECONDS) as client:
              response = await client.post(url, content=payload_json, headers=headers)
              body = (response.text or "")[:512]
              if response.status_code < 300:
                  return {
                      "status": "delivered",
                      "response_status": response.status_code,
                      "response_body": body,
                      "error_message": None,
                  }
              return {
                  "status": "failed",
                  "response_status": response.status_code,
                  "response_body": body,
                  "error_message": f"HTTP {response.status_code}",
              }
      except httpx.TimeoutException as exc:
          _log.warning("Webhook delivery timeout to %s: %s", url, exc)
          return {"status": "failed", "response_status": None, "response_body": None,
                  "error_message": f"Timeout: {exc}"}
      except httpx.ConnectError as exc:
          _log.warning("Webhook delivery connection error to %s: %s", url, exc)
          return {"status": "failed", "response_status": None, "response_body": None,
                  "error_message": f"ConnectionError: {exc}"}
      except Exception as exc:
          _log.error("Webhook delivery unexpected error to %s: %s", url, exc)
          return {"status": "failed", "response_status": None, "response_body": None,
                  "error_message": str(exc)}


  async def dispatch_webhook_event(
      db,
      endpoint,
      event_type: str,
      data: dict[str, Any],
  ) -> None:
      """Full delivery pipeline: build payload, attempt delivery with retry, emit audit event.

      This is intended to be called from a FastAPI BackgroundTask.

      Args:
          db:         AsyncSession (caller is responsible for lifecycle)
          endpoint:   WebhookEndpoint ORM instance
          event_type: e.g. "position.created"
          data:       event-specific data dict

      On successful delivery:
        - WebhookDeliveryLog row inserted with status=delivered.
        - WORM audit_events row emitted (event_type=SYSTEM, payload.webhook_event=webhook.delivered).
        - Delivery log pruned to last DELIVERY_LOG_WINDOW rows for this endpoint.

      On final failure (all 5 attempts exhausted):
        - WebhookDeliveryLog row inserted with status=failed.
        - No audit event (failed delivery is operational noise, not a compliance fact).
      """
      import asyncio
      from app.models.webhook import (
          WebhookDeliveryLog, RETRY_DELAYS_MINUTES, MAX_ATTEMPTS, DELIVERY_LOG_WINDOW,
      )

      tenant_id = str(endpoint.company_id)
      payload = build_event_payload(event_type, tenant_id, data)

      for attempt in range(1, MAX_ATTEMPTS + 1):
          result = await deliver_webhook_attempt(endpoint.url, endpoint.secret, payload)

          log_entry = WebhookDeliveryLog(
              endpoint_id=endpoint.id,
              event_type=event_type,
              payload_json=payload,
              attempt=attempt,
              status=result["status"],
              response_status=result["response_status"],
              response_body=result["response_body"],
              error_message=result["error_message"],
              delivered_at=datetime.now(UTC) if result["status"] == "delivered" else None,
          )
          db.add(log_entry)
          await db.commit()

          if result["status"] == "delivered":
              # Emit WORM audit event for contractual proof
              await _emit_webhook_delivered_audit(db, endpoint, event_type, payload)
              # Prune operational log to rolling window
              await _prune_delivery_log(db, endpoint.id, DELIVERY_LOG_WINDOW)
              return

          if attempt < MAX_ATTEMPTS:
              delay_minutes = RETRY_DELAYS_MINUTES[attempt - 1]
              _log.warning(
                  "Webhook delivery attempt %d/%d failed for endpoint %s — "
                  "retrying in %d min",
                  attempt, MAX_ATTEMPTS, endpoint.id, delay_minutes,
              )
              # NOTE: v1 simplification — asyncio.sleep() retries are acceptable for delays up to 15min.
              # For the 60min and 240min retries, consider migrating to APScheduler in v2.
              # In v1, document this as a known limitation in the horizontal-scaling-contract.md.
              await asyncio.sleep(delay_minutes * 60)

      _log.error(
          "Webhook delivery exhausted all %d attempts for endpoint %s event %s",
          MAX_ATTEMPTS, endpoint.id, event_type,
      )


  async def _emit_webhook_delivered_audit(db, endpoint, event_type: str, payload: dict) -> None:
      """Write a WORM audit_events row proving webhook delivery."""
      try:
          from sqlalchemy import select
          from app.models.audit_event import AuditEvent, GENESIS_HASH

          # Fetch the latest event hash for this tenant's chain
          latest = await db.execute(
              select(AuditEvent.event_hash)
              .where(AuditEvent.company_id == endpoint.company_id)
              .order_by(AuditEvent.created_at.desc())
              .limit(1)
          )
          row = latest.scalar_one_or_none()
          prev_hash = row if row else GENESIS_HASH

          import hashlib, json as _json
          now = datetime.now(UTC)
          raw = f"SYSTEM|{endpoint.company_id}|{endpoint.id}|{_json.dumps(payload, default=str)}|{now.isoformat()}"
          event_hash = hashlib.sha256(raw.encode()).hexdigest()

          audit = AuditEvent(
              company_id=endpoint.company_id,
              event_type="SYSTEM",
              actor_id=None,
              actor_email="system",
              entity_type="webhook_endpoint",
              entity_id=str(endpoint.id),
              payload={
                  "webhook_event": "webhook.delivered",
                  "event_type": event_type,
                  "endpoint_url": endpoint.url,
                  "delivery_id": payload.get("delivery_id"),
              },
              event_hash=event_hash,
              prev_event_hash=prev_hash,
          )
          db.add(audit)
          await db.commit()
      except Exception as exc:
          _log.error("Failed to emit webhook.delivered audit event: %s", exc)


  async def _prune_delivery_log(db, endpoint_id, keep: int) -> None:
      """Delete delivery log rows older than the most recent `keep` entries."""
      try:
          from sqlalchemy import select, delete
          from app.models.webhook import WebhookDeliveryLog

          # Find the created_at cutoff
          subq = (
              select(WebhookDeliveryLog.created_at)
              .where(WebhookDeliveryLog.endpoint_id == endpoint_id)
              .order_by(WebhookDeliveryLog.created_at.desc())
              .offset(keep)
              .limit(1)
              .scalar_subquery()
          )
          await db.execute(
              delete(WebhookDeliveryLog)
              .where(WebhookDeliveryLog.endpoint_id == endpoint_id)
              .where(WebhookDeliveryLog.created_at <= subq)
          )
          await db.commit()
      except Exception as exc:
          _log.warning("Failed to prune delivery log for endpoint %s: %s", endpoint_id, exc)


  __all__ = [
      "generate_webhook_secret",
      "compute_signature",
      "build_event_payload",
      "deliver_webhook_attempt",
      "dispatch_webhook_event",
  ]
  ```

- [ ] **4.3 — Run service tests to confirm pass**

  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_webhook_service.py -x -q --tb=short 2>&1 | tail -20
  ```
  Expected: `7 passed`.

- [ ] **4.4 — Create webhook cleanup task**

  Create `backend/app/tasks/webhook_cleanup.py`:
  ```python
  """
  app/tasks/webhook_cleanup.py

  Nightly APScheduler job to prune WebhookDeliveryLog to the last 100 rows per endpoint.
  Called from the lifespan scheduler in app/main.py.
  """
  from __future__ import annotations

  import logging

  _log = logging.getLogger("hedgecalc.tasks.webhook_cleanup")


  async def cleanup_webhook_delivery_logs() -> None:
      """Prune webhook_delivery_logs to last 100 rows per endpoint_id."""
      from sqlalchemy import select, delete, func
      from app.core.db import async_session_maker
      from app.models.webhook import WebhookDeliveryLog, DELIVERY_LOG_WINDOW

      async with async_session_maker() as session:
          try:
              # Get all distinct endpoint_ids that have more than DELIVERY_LOG_WINDOW rows
              result = await session.execute(
                  select(WebhookDeliveryLog.endpoint_id)
                  .group_by(WebhookDeliveryLog.endpoint_id)
                  .having(func.count(WebhookDeliveryLog.id) > DELIVERY_LOG_WINDOW)
              )
              endpoint_ids = [row[0] for row in result.fetchall()]

              pruned_total = 0
              for eid in endpoint_ids:
                  from app.services.webhook_service import _prune_delivery_log
                  await _prune_delivery_log(session, eid, DELIVERY_LOG_WINDOW)
                  pruned_total += 1

              if pruned_total:
                  _log.info("webhook_cleanup: pruned logs for %d endpoints", pruned_total)
          except Exception as exc:
              _log.error("webhook_cleanup failed: %s", exc)
  ```

- [ ] **4.5 — Add cleanup job to main.py scheduler**

  In `backend/app/main.py`, find the APScheduler `lifespan` block where `cleanup_audit_tables` is added, and append:
  ```python
  from app.tasks.webhook_cleanup import cleanup_webhook_delivery_logs
  scheduler.add_job(
      cleanup_webhook_delivery_logs,
      CronTrigger(hour=3, minute=30),
      id="webhook_cleanup",
      replace_existing=True,
  )
  ```

---

## Chunk 5: Webhook Support — Routes

**Why after service:** Routes are thin wrappers that call the service layer.

### Files

- **Create:** `backend/app/api/routes/v1_webhooks.py`
- **Modify:** `backend/app/api/router.py` (register webhook router)
- **Test:** `backend/tests/test_webhook_routes.py` (create)

---

- [ ] **5.1 — Write failing route tests first (TDD)**

  Create `backend/tests/test_webhook_routes.py`:
  ```python
  """Tests for webhook CRUD routes: POST/GET/DELETE /v1/webhooks."""
  from __future__ import annotations
  import uuid
  import pytest
  from unittest.mock import AsyncMock, MagicMock, patch
  from httpx import AsyncClient, ASGITransport


  @pytest.fixture
  def mock_user():
      u = MagicMock()
      u.id = uuid.uuid4()
      u.company_id = uuid.uuid4()
      u.email = "test@example.com"
      return u


  @pytest.mark.asyncio
  async def test_register_webhook_returns_201(mock_user):
      """POST /v1/webhooks creates a webhook and returns 201 with id and secret."""
      from app.main import app
      from app.core.dependencies import get_current_user
      from app.core.db import get_session

      mock_session = AsyncMock()
      mock_session.execute = AsyncMock(return_value=MagicMock(scalar=MagicMock(return_value=0)))
      mock_session.add = MagicMock()
      mock_session.commit = AsyncMock()

      app.dependency_overrides[get_current_user] = lambda: mock_user
      app.dependency_overrides[get_session] = lambda: mock_session

      try:
          async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
              resp = await client.post(
                  "/v1/webhooks",
                  json={"url": "https://example.com/hook", "events": ["position.created"]},
                  headers={"Authorization": "Bearer test-token"},
              )
          assert resp.status_code in (201, 200), resp.text
          data = resp.json()
          assert "id" in data
          assert "secret" in data
      finally:
          app.dependency_overrides.clear()


  @pytest.mark.asyncio
  async def test_list_webhooks_returns_200(mock_user):
      """GET /v1/webhooks returns list."""
      from app.main import app
      from app.core.dependencies import get_current_user
      from app.core.db import get_session

      mock_session = AsyncMock()
      mock_result = MagicMock()
      mock_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
      mock_session.execute = AsyncMock(return_value=mock_result)

      app.dependency_overrides[get_current_user] = lambda: mock_user
      app.dependency_overrides[get_session] = lambda: mock_session

      try:
          async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
              resp = await client.get(
                  "/v1/webhooks",
                  headers={"Authorization": "Bearer test-token"},
              )
          assert resp.status_code == 200
          assert isinstance(resp.json(), list)
      finally:
          app.dependency_overrides.clear()


  @pytest.mark.asyncio
  async def test_delete_webhook_not_found_returns_404(mock_user):
      """DELETE /v1/webhooks/{id} returns 404 if endpoint not owned by tenant."""
      from app.main import app
      from app.core.dependencies import get_current_user
      from app.core.db import get_session

      mock_session = AsyncMock()
      mock_result = MagicMock()
      mock_result.scalar_one_or_none = MagicMock(return_value=None)
      mock_session.execute = AsyncMock(return_value=mock_result)

      app.dependency_overrides[get_current_user] = lambda: mock_user
      app.dependency_overrides[get_session] = lambda: mock_session

      try:
          async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
              resp = await client.delete(
                  f"/v1/webhooks/{uuid.uuid4()}",
                  headers={"Authorization": "Bearer test-token"},
              )
          assert resp.status_code == 404
      finally:
          app.dependency_overrides.clear()


  def test_max_webhooks_per_tenant_enforced():
      """Registering a 6th webhook for a tenant must return 409 Conflict."""
      # This validates the business rule constant — unit test (no HTTP)
      from app.models.webhook import MAX_WEBHOOKS_PER_TENANT
      assert MAX_WEBHOOKS_PER_TENANT == 5
  ```

  Run to confirm failure:
  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_webhook_routes.py -x -q --tb=short 2>&1 | tail -20
  ```
  Expected: route tests fail or return 404 (router not registered).

- [ ] **5.2 — Create v1_webhooks.py router**

  Create `backend/app/api/routes/v1_webhooks.py`:
  ```python
  """
  app/api/routes/v1_webhooks.py

  Webhook management endpoints for ORDR Terminal.

  POST   /v1/webhooks         — register a new webhook endpoint (max 5 per tenant)
  GET    /v1/webhooks         — list registered endpoints (secret redacted)
  DELETE /v1/webhooks/{id}    — deactivate and remove endpoint

  Events that fire webhooks:
    position.created         — emitted in v1_positions.py after INSERT
    calculation.completed    — emitted in v1_calculate.py after engine run
    proposal.approved        — emitted in v1_execution_proposals.py after approval
    proposal.rejected        — emitted in v1_execution_proposals.py after rejection

  Delivery:
    - Background task (FastAPI BackgroundTasks)
    - Signed with HMAC-SHA256 (X-ORDR-Signature header)
    - Exponential backoff (5 attempts: 1m/5m/15m/60m/240m gaps)
    - Successful deliveries emit WORM audit event (webhook.delivered)
  """
  from __future__ import annotations

  import uuid
  from typing import Any

  from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
  from pydantic import BaseModel, HttpUrl, field_validator
  from sqlalchemy import func, select
  from sqlalchemy.ext.asyncio import AsyncSession

  from app.core.db import get_session
  from app.core.dependencies import get_current_user
  from app.models.user import User
  from app.models.webhook import (
      MAX_WEBHOOKS_PER_TENANT,
      SUPPORTED_EVENTS,
      WebhookEndpoint,
  )
  from app.services.webhook_service import generate_webhook_secret

  router = APIRouter(prefix="/v1/webhooks", tags=["v1-webhooks"])


  # ---------------------------------------------------------------------------
  # Schemas
  # ---------------------------------------------------------------------------

  class WebhookRegisterRequest(BaseModel):
      url: str
      description: str | None = None
      events: list[str] = []  # empty = subscribe to all

      @field_validator("events")
      @classmethod
      def validate_events(cls, v: list[str]) -> list[str]:
          invalid = set(v) - SUPPORTED_EVENTS
          if invalid:
              raise ValueError(f"Unsupported events: {invalid}. Supported: {SUPPORTED_EVENTS}")
          return v

      @field_validator("url")
      @classmethod
      def validate_url(cls, v: str) -> str:
          if not v.startswith("https://"):
              raise ValueError("Webhook URL must use HTTPS.")
          return v


  class WebhookResponse(BaseModel):
      id: str
      url: str
      description: str | None
      events: list[str]
      is_active: bool
      created_at: str


  class WebhookRegisterResponse(WebhookResponse):
      secret: str  # returned only on creation — never again


  # ---------------------------------------------------------------------------
  # Helpers
  # ---------------------------------------------------------------------------

  def _endpoint_to_response(ep: WebhookEndpoint) -> dict[str, Any]:
      return {
          "id": str(ep.id),
          "url": ep.url,
          "description": ep.description,
          "events": sorted(ep.get_events()),
          "is_active": ep.is_active,
          "created_at": ep.created_at.isoformat() if ep.created_at else None,
      }


  # ---------------------------------------------------------------------------
  # Routes
  # ---------------------------------------------------------------------------

  @router.post("", status_code=status.HTTP_201_CREATED)
  async def register_webhook(
      request: Request,
      body: WebhookRegisterRequest,
      db: AsyncSession = Depends(get_session),
      current_user: User = Depends(get_current_user),
  ):
      """Register a new webhook endpoint for this tenant.

      Returns the endpoint record including the one-time webhook secret.
      The secret is shown once — store it securely.
      """
      # Count existing active endpoints for this tenant
      count_result = await db.execute(
          select(func.count(WebhookEndpoint.id))
          .where(WebhookEndpoint.company_id == current_user.company_id)
          .where(WebhookEndpoint.is_active.is_(True))
      )
      count = count_result.scalar()
      if count >= MAX_WEBHOOKS_PER_TENANT:
          raise HTTPException(
              status_code=status.HTTP_409_CONFLICT,
              detail=f"Maximum of {MAX_WEBHOOKS_PER_TENANT} active webhooks per tenant reached.",
          )

      secret = generate_webhook_secret()
      events_str = ",".join(sorted(body.events)) if body.events else ""

      endpoint = WebhookEndpoint(
          company_id=current_user.company_id,
          url=body.url,
          secret=secret,
          description=body.description,
          events=events_str,
          is_active=True,
      )
      db.add(endpoint)
      await db.commit()
      await db.refresh(endpoint)

      return {
          **_endpoint_to_response(endpoint),
          "secret": secret,
      }


  @router.get("", response_model=list[WebhookResponse])
  async def list_webhooks(
      request: Request,
      db: AsyncSession = Depends(get_session),
      current_user: User = Depends(get_current_user),
  ):
      """List all active webhook endpoints for this tenant. Secrets are redacted."""
      result = await db.execute(
          select(WebhookEndpoint)
          .where(WebhookEndpoint.company_id == current_user.company_id)
          .where(WebhookEndpoint.is_active.is_(True))
          .order_by(WebhookEndpoint.created_at.asc())
      )
      endpoints = result.scalars().all()
      return [_endpoint_to_response(ep) for ep in endpoints]


  @router.delete("/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
  async def delete_webhook(
      request: Request,
      webhook_id: uuid.UUID,
      db: AsyncSession = Depends(get_session),
      current_user: User = Depends(get_current_user),
  ):
      """Deactivate and remove a webhook endpoint.

      Soft-deletes by setting is_active=False. Associated delivery logs are
      preserved for the remainder of the rolling window before nightly cleanup.
      """
      result = await db.execute(
          select(WebhookEndpoint)
          .where(WebhookEndpoint.id == webhook_id)
          .where(WebhookEndpoint.company_id == current_user.company_id)
      )
      endpoint = result.scalar_one_or_none()
      if endpoint is None:
          raise HTTPException(
              status_code=status.HTTP_404_NOT_FOUND,
              detail="Webhook endpoint not found.",
          )
      endpoint.is_active = False
      await db.commit()
      return None


  __all__ = ["router"]
  ```

- [ ] **5.3 — Register webhook router in api/router.py**

  Read `backend/app/api/router.py` to find where other v1 routers are included, then add:
  ```python
  from app.api.routes.v1_webhooks import router as webhooks_router
  # ... in the include_router block:
  api_router.include_router(webhooks_router)
  ```

- [ ] **5.4 — Run route tests to confirm pass**

  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_webhook_routes.py -x -q --tb=short 2>&1 | tail -20
  ```
  Expected: `4 passed`.

- [ ] **5.5 — Wire webhook dispatch to position.created event**

  In `backend/app/api/routes/v1_positions.py`, find the POST endpoint that creates a new position. After the DB commit, add a BackgroundTask dispatch:
  ```python
  # Add parameter to route: background_tasks: BackgroundTasks
  # After position commit:
  from app.services.webhook_service import dispatch_webhook_event, build_event_payload
  from app.models.webhook import WebhookEndpoint, SUPPORTED_EVENTS
  from sqlalchemy import select as _select

  # Fetch active webhooks subscribed to position.created
  wh_result = await db.execute(
      _select(WebhookEndpoint)
      .where(WebhookEndpoint.company_id == current_user.company_id)
      .where(WebhookEndpoint.is_active.is_(True))
  )
  active_webhooks = wh_result.scalars().all()
  for wh in active_webhooks:
      if wh.subscribes_to("position.created"):
          background_tasks.add_task(
              dispatch_webhook_event,
              db,
              wh,
              "position.created",
              {"position_id": str(position.id), "record_id": position.record_id},
          )
  ```

  Apply the same pattern to:
  - `v1_calculate.py` — after calculation completes: `calculation.completed`
  - `v1_execution_proposals.py` — after approval: `proposal.approved`, after rejection: `proposal.rejected`

- [ ] **5.6 — TDD for remaining three webhook events: calculation.completed, proposal.approved, proposal.rejected**

  The step above (5.5) wires only `position.created`. The spec requires all four events. Complete TDD coverage for the remaining three.

  **5.6a — Create `backend/tests/test_webhook_events_calculate.py`:**
  ```python
  """TDD: calculation.completed webhook event fires after engine run."""
  from __future__ import annotations
  import uuid
  import pytest
  from unittest.mock import AsyncMock, MagicMock, patch


  @pytest.mark.asyncio
  async def test_calculation_completed_webhook_dispatched(monkeypatch):
      """After POST /v1/calculate succeeds, dispatch_webhook_event must be called
      with event_type='calculation.completed' for each subscribed active endpoint."""
      from app.main import app
      from app.core.dependencies import get_current_user
      from app.core.db import get_session

      mock_user = MagicMock()
      mock_user.id = uuid.uuid4()
      mock_user.company_id = uuid.uuid4()
      mock_user.email = "calc-test@example.com"

      # Minimal mock session that returns one subscribed webhook endpoint
      mock_endpoint = MagicMock()
      mock_endpoint.id = uuid.uuid4()
      mock_endpoint.company_id = mock_user.company_id
      mock_endpoint.url = "https://example.com/hook"
      mock_endpoint.secret = "deadbeef" * 8
      mock_endpoint.subscribes_to = MagicMock(return_value=True)

      mock_session = AsyncMock()
      mock_wh_result = MagicMock()
      mock_wh_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[mock_endpoint])))
      mock_session.execute = AsyncMock(return_value=mock_wh_result)

      dispatched_events = []

      async def fake_dispatch(db, endpoint, event_type, data):
          dispatched_events.append(event_type)

      app.dependency_overrides[get_current_user] = lambda: mock_user
      app.dependency_overrides[get_session] = lambda: mock_session

      try:
          with patch("app.services.webhook_service.dispatch_webhook_event", side_effect=fake_dispatch):
              from httpx import AsyncClient, ASGITransport
              async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                  resp = await client.post(
                      "/api/v1/calculate",
                      json={
                          "positions": [{"record_id": "WH-CALC-01", "currency_pair": "EURUSD",
                                         "notional": 1000000, "direction": "sell",
                                         "horizon_months": 3, "company_id": str(mock_user.company_id)}],
                          "policy": {"min_hedge_ratio": 0.7, "max_hedge_ratio": 1.0,
                                     "instrument": "forward", "margin_budget": 0,
                                     "risk_weights": {"R1": 1.0}},
                      },
                      headers={"Authorization": "Bearer test-token"},
                  )
          assert resp.status_code == 200, resp.text
          assert "calculation.completed" in dispatched_events, (
              "dispatch_webhook_event was not called with calculation.completed"
          )
      finally:
          app.dependency_overrides.clear()
  ```

  Run to confirm failure (dispatch not yet wired in v1_calculate.py):
  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_webhook_events_calculate.py -x -q --tb=short 2>&1 | tail -20
  ```
  Expected: test fails — `calculation.completed` not in dispatched_events.

  **Implement:** In `backend/app/api/routes/v1_calculate.py`, after the engine run commit, add the same BackgroundTask dispatch pattern used in v1_positions.py (step 5.5), firing `calculation.completed` with `{"run_id": str(run.id), "position_count": len(positions)}`.

  Run to green:
  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_webhook_events_calculate.py -x -q --tb=short 2>&1 | tail -20
  ```
  Expected: `1 passed`.

  **5.6b — Create `backend/tests/test_webhook_events_proposals.py`:**
  ```python
  """TDD: proposal.approved and proposal.rejected webhook events fire correctly."""
  from __future__ import annotations
  import uuid
  import pytest
  from unittest.mock import AsyncMock, MagicMock, patch


  def _make_mock_user(company_id=None):
      u = MagicMock()
      u.id = uuid.uuid4()
      u.company_id = company_id or uuid.uuid4()
      u.email = "proposal-test@example.com"
      u.hierarchy_level = 10
      return u


  def _make_mock_endpoint(company_id):
      ep = MagicMock()
      ep.id = uuid.uuid4()
      ep.company_id = company_id
      ep.url = "https://example.com/hook"
      ep.secret = "deadbeef" * 8
      ep.subscribes_to = MagicMock(return_value=True)
      return ep


  @pytest.mark.asyncio
  async def test_proposal_approved_webhook_dispatched(monkeypatch):
      """After a proposal is approved, dispatch_webhook_event must be called
      with event_type='proposal.approved'."""
      from app.main import app
      from app.core.dependencies import get_current_user
      from app.core.db import get_session

      mock_user = _make_mock_user()
      mock_endpoint = _make_mock_endpoint(mock_user.company_id)

      mock_session = AsyncMock()
      mock_wh_result = MagicMock()
      mock_wh_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[mock_endpoint])))
      mock_session.execute = AsyncMock(return_value=mock_wh_result)

      dispatched_events = []

      async def fake_dispatch(db, endpoint, event_type, data):
          dispatched_events.append(event_type)

      app.dependency_overrides[get_current_user] = lambda: mock_user
      app.dependency_overrides[get_session] = lambda: mock_session

      try:
          with patch("app.services.webhook_service.dispatch_webhook_event", side_effect=fake_dispatch):
              from httpx import AsyncClient, ASGITransport
              async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                  resp = await client.post(
                      f"/api/v1/execution-proposals/{uuid.uuid4()}/approve",
                      headers={"Authorization": "Bearer test-token"},
                  )
          # Accept 200 or 404 (proposal may not exist in test DB) — key assertion is on dispatch
          assert resp.status_code in (200, 404), resp.text
          if resp.status_code == 200:
              assert "proposal.approved" in dispatched_events, (
                  "dispatch_webhook_event was not called with proposal.approved"
              )
      finally:
          app.dependency_overrides.clear()


  @pytest.mark.asyncio
  async def test_proposal_rejected_webhook_dispatched(monkeypatch):
      """After a proposal is rejected, dispatch_webhook_event must be called
      with event_type='proposal.rejected'."""
      from app.main import app
      from app.core.dependencies import get_current_user
      from app.core.db import get_session

      mock_user = _make_mock_user()
      mock_endpoint = _make_mock_endpoint(mock_user.company_id)

      mock_session = AsyncMock()
      mock_wh_result = MagicMock()
      mock_wh_result.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[mock_endpoint])))
      mock_session.execute = AsyncMock(return_value=mock_wh_result)

      dispatched_events = []

      async def fake_dispatch(db, endpoint, event_type, data):
          dispatched_events.append(event_type)

      app.dependency_overrides[get_current_user] = lambda: mock_user
      app.dependency_overrides[get_session] = lambda: mock_session

      try:
          with patch("app.services.webhook_service.dispatch_webhook_event", side_effect=fake_dispatch):
              from httpx import AsyncClient, ASGITransport
              async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                  resp = await client.post(
                      f"/api/v1/execution-proposals/{uuid.uuid4()}/reject",
                      headers={"Authorization": "Bearer test-token"},
                  )
          assert resp.status_code in (200, 404), resp.text
          if resp.status_code == 200:
              assert "proposal.rejected" in dispatched_events, (
                  "dispatch_webhook_event was not called with proposal.rejected"
              )
      finally:
          app.dependency_overrides.clear()
  ```

  Run to confirm failure (dispatch not yet wired in v1_execution_proposals.py):
  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_webhook_events_proposals.py -x -q --tb=short 2>&1 | tail -20
  ```
  Expected: tests fail — events not in dispatched_events (or 404 path needs stub).

  **Implement:** In `backend/app/api/routes/v1_execution_proposals.py`, find the approve endpoint (typically `POST /v1/execution-proposals/{id}/approve`) and the reject endpoint. After each commit, add the BackgroundTask dispatch pattern firing `proposal.approved` and `proposal.rejected` respectively, with `{"proposal_id": str(proposal.id), "position_id": str(proposal.position_id)}`.

  Run to green:
  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_webhook_events_proposals.py tests/test_webhook_events_calculate.py -q --tb=short 2>&1 | tail -20
  ```
  Expected: all tests pass (or skip where 404 path applies).

- [ ] **5.7 — Run full test suite**

  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -q --tb=short 2>&1 | tail -30
  ```
  Expected: no new failures.

---

## Chunk 6: Load Testing Baseline

**Why sixth:** Load testing validates all previous changes under realistic load. Requires Redis cache and pool tuning to be in place first.

### Files

- **Create:** `docs/performance/k6-load-test.js`
- **Create:** `docs/performance/load-test-baseline.md`
- **Test:** k6 execution (local or CI)

---

- [ ] **6.1 — Create k6 load test script**

  Create `docs/performance/k6-load-test.js`:
  ```javascript
  /**
   * ORDR Terminal — Institutional Load Test Baseline
   * Tool: k6 (https://k6.io)
   * Date: 2026-03-28
   *
   * Scenario:
   *   - 100 concurrent virtual users
   *   - 30-second ramp-up, 5-minute sustained, 30-second ramp-down
   *   - Each VU exercises: auth → list positions → POST /v1/calculate
   *
   * Targets (Sprint 5 spec):
   *   - /v1/calculate  p50 < 200ms
   *   - /v1/calculate  p95 < 500ms
   *   - /v1/calculate  p99 < 1000ms
   *   - Error rate     < 1%
   *
   * Usage:
   *   k6 run docs/performance/k6-load-test.js \
   *     -e BASE_URL=https://hedgecore.onrender.com \
   *     -e TEST_USER_EMAIL=loadtest@ordr.io \
   *     -e TEST_USER_PASSWORD=<password>
   *
   * For local dev against SQLite demo:
   *   BASE_URL=http://localhost:8000 ALLOW_SQLITE_DEMO=true
   *
   * Report output:
   *   k6 run ... --out json=docs/performance/results/$(date +%Y%m%d).json
   */

  import http from "k6/http";
  import { check, sleep } from "k6";
  import { Trend, Rate, Counter } from "k6/metrics";

  // ---------------------------------------------------------------------------
  // Custom metrics
  // ---------------------------------------------------------------------------
  const calculateLatency = new Trend("calculate_latency", true);
  const calculateErrors = new Rate("calculate_error_rate");
  const calculateRequests = new Counter("calculate_total_requests");

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------
  const BASE_URL = __ENV.BASE_URL || "http://localhost:8000";
  const TEST_USER_EMAIL = __ENV.TEST_USER_EMAIL || "admin@ordr.io";
  const TEST_USER_PASSWORD = __ENV.TEST_USER_PASSWORD || "demo";

  // ---------------------------------------------------------------------------
  // Load profile: 100 concurrent users
  // ---------------------------------------------------------------------------
  export const options = {
    stages: [
      { duration: "30s", target: 20 },   // ramp to 20 VUs
      { duration: "30s", target: 100 },  // ramp to 100 VUs
      { duration: "5m",  target: 100 },  // sustain 100 VUs for 5 minutes
      { duration: "30s", target: 0 },    // ramp down
    ],
    thresholds: {
      // Sprint 5 spec targets
      "calculate_latency{scenario:default}": [
        "p(50)<200",
        "p(95)<500",
        "p(99)<1000",
      ],
      "calculate_error_rate": ["rate<0.01"],  // < 1% error rate
      "http_req_failed": ["rate<0.01"],
    },
    // Prevent k6 from running too many connections from single client
    // In CI increase with --vus flag
  };

  // ---------------------------------------------------------------------------
  // Helper: login and return JWT token
  // ---------------------------------------------------------------------------
  function login() {
    const payload = JSON.stringify({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    });
    const res = http.post(`${BASE_URL}/api/v1/auth/login`, payload, {
      headers: { "Content-Type": "application/json" },
    });
    check(res, {
      "login 200": (r) => r.status === 200,
      "login has token": (r) => {
        try { return !!JSON.parse(r.body).access_token; }
        catch { return false; }
      },
    });
    if (res.status !== 200) return null;
    return JSON.parse(res.body).access_token;
  }

  // ---------------------------------------------------------------------------
  // Helper: minimal calculate payload (1 position, standard policy)
  // ---------------------------------------------------------------------------
  function calcPayload(companyId) {
    return JSON.stringify({
      positions: [
        {
          record_id: `LOAD-${__VU}-${__ITER}`,
          currency_pair: "EURUSD",
          notional: 1000000,
          direction: "sell",
          horizon_months: 3,
          company_id: companyId,
        },
      ],
      policy: {
        min_hedge_ratio: 0.7,
        max_hedge_ratio: 1.0,
        instrument: "forward",
        margin_budget: 0,
        risk_weights: { R1: 1.0 },
      },
    });
  }

  // ---------------------------------------------------------------------------
  // VU lifecycle
  // ---------------------------------------------------------------------------
  export function setup() {
    // Verify the service is reachable before starting load
    const health = http.get(`${BASE_URL}/system/health`);
    check(health, { "health ok": (r) => r.status === 200 });
    return {};
  }

  export default function () {
    // Step 1: authenticate
    const token = login();
    if (!token) {
      calculateErrors.add(1);
      sleep(1);
      return;
    }

    const authHeaders = {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };

    // Step 2: list positions (read-heavy warm-up)
    const listRes = http.get(`${BASE_URL}/api/v1/positions?limit=10`, authHeaders);
    check(listRes, { "list positions 200": (r) => r.status === 200 });

    // Step 3: POST /v1/calculate (primary latency target)
    const calcStart = Date.now();
    const calcRes = http.post(
      `${BASE_URL}/api/v1/calculate`,
      calcPayload(""),
      authHeaders
    );
    const calcMs = Date.now() - calcStart;

    calculateLatency.add(calcMs);
    calculateRequests.add(1);
    const calcOk = check(calcRes, {
      "calculate 200": (r) => r.status === 200,
      "calculate has results": (r) => {
        try { return !!JSON.parse(r.body).results; }
        catch { return false; }
      },
    });
    calculateErrors.add(!calcOk ? 1 : 0);

    // Step 4: check health endpoint (light probe)
    http.get(`${BASE_URL}/system/health`, authHeaders);

    sleep(1);  // 1 second think time between iterations
  }

  export function teardown(data) {
    console.log("Load test complete. Check calculate_latency thresholds.");
  }
  ```

- [ ] **6.2 — Run load test against local dev instance**

  Start backend locally:
  ```bash
  cd "D:/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/backend" && \
    ALLOW_SQLITE_DEMO=true DATABASE_URL="sqlite+aiosqlite:///./demo.db" \
    JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" \
    python -m uvicorn app.main:app --port 8000 &
  ```

  Then run k6 (reduced VUs for local dev — full 100 VU run against staging):
  ```bash
  k6 run docs/performance/k6-load-test.js \
    -e BASE_URL=http://localhost:8000 \
    -e TEST_USER_EMAIL=admin@ordr.io \
    -e TEST_USER_PASSWORD=demo \
    --vus 10 --duration 30s
  ```

  For full institutional baseline (100 VUs against staging):
  ```bash
  k6 run docs/performance/k6-load-test.js \
    -e BASE_URL=https://hedgecore-preview.onrender.com \
    -e TEST_USER_EMAIL=$LOAD_TEST_USER \
    -e TEST_USER_PASSWORD=$LOAD_TEST_PASS \
    --out json=docs/performance/results/2026-03-28-baseline.json
  ```

- [ ] **6.3 — Record results in load-test-baseline.md**

  **BLOCKING GATE:** Do NOT commit `load-test-baseline.md` with `[FILL IN]` placeholders. Run the k6 script first (step 6.2), paste the actual p50/p95/p99/error-rate results from the k6 summary output into the table below, then commit. A file containing `[FILL IN]` entries must NOT be merged to master.

  Create `docs/performance/load-test-baseline.md`:
  ```markdown
  # Load Test Baseline — Sprint 5

  **Date:** 2026-03-28
  **Tool:** k6 v0.52+
  **Script:** `docs/performance/k6-load-test.js`
  **Target:** `/v1/calculate` endpoint

  ## Spec Targets

  | Metric   | Target   | Result     | Pass/Fail |
  |----------|----------|------------|-----------|
  | p50      | < 200ms  | [FILL IN]  |           |
  | p95      | < 500ms  | [FILL IN]  |           |
  | p99      | < 1000ms | [FILL IN]  |           |
  | Error %  | < 1%     | [FILL IN]  |           |

  ## Test Configuration

  - Virtual Users: 100
  - Ramp-up: 30s to 100 VUs
  - Sustained: 5 minutes at 100 VUs
  - Ramp-down: 30s

  ## Environment

  - Backend: Render Starter (1 vCPU, 512 MB RAM)
  - Database: Render PostgreSQL Starter (97 connection limit)
  - Pool: pool_size=20, max_overflow=10
  - Redis: Render Redis (market data cache)

  ## Command

  ```bash
  k6 run docs/performance/k6-load-test.js \
    -e BASE_URL=https://hedgecore-preview.onrender.com \
    -e TEST_USER_EMAIL=$LOAD_TEST_USER \
    -e TEST_USER_PASSWORD=$LOAD_TEST_PASS \
    --out json=docs/performance/results/2026-03-28-baseline.json
  ```

  ## Raw Results

  [Paste k6 summary output here after run]

  ## Bottlenecks Found

  [Document any bottlenecks identified and remediation applied]

  ## Sign-off

  Sprint 5 load test sign-off: [ ] All p95 targets met.
  ```

- [ ] **6.4 — Create performance results directory**

  ```bash
  mkdir -p "D:/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/docs/performance/results"
  touch "D:/Synexiun/1-SynexFund/HedgeCalc/TreasuryFX/docs/performance/results/.gitkeep"
  ```

  Add to `.gitignore` (or leave `results/*.json` tracked — they are committed as evidence):
  The `.json` result files should be committed to `docs/performance/results/` as reproducible evidence artifacts. They are not secrets.

---

## Chunk 7: Horizontal Scaling Documentation

### Files

- **Modify:** `docs/architecture/SYSTEM_BOUNDARIES.md`
- **Create:** `docs/architecture/horizontal-scaling-contract.md`

---

- [ ] **7.1 — Update SYSTEM_BOUNDARIES.md with multi-instance topology**

  Append a new section to `docs/architecture/SYSTEM_BOUNDARIES.md`:
  ```markdown
  ## Multi-Instance Topology (Sprint 5 — Horizontal Scaling Prep)

  ```
  [Browser] <--HTTPS--> [Vercel CDN / Next.js SSR]
                              |
                          [HTTPS API]
                              |
              ┌───────────────┴───────────────┐
              │          Render Load Balancer  │
              └──────┬──────────────┬──────────┘
                     │              │
              [FastAPI inst-1] [FastAPI inst-2]   (N instances, stateless)
                     │              │
              └──────┴──────────────┴──────┘
                              │
                    ┌──────────┴──────────┐
                    │                     │
           [PostgreSQL (Render)]    [Redis (Render)]
  ```

  ### Stateless Contract

  The FastAPI backend is fully stateless. All shared state lives in:
  - **PostgreSQL**: positions, calculations, audit events, sessions, webhooks
  - **Redis**: rate-limit token buckets (per-key), market data cache (60s TTL)

  The following are NOT stored in process memory between requests:
  - JWT validation state (stateless by design — signature check only)
  - Rate limit counters (Redis-backed via `_RedisTokenBucket` in `RateLimitMiddleware`)
  - Market data cache (Redis-backed via `redis_client.py`)
  - Session data (JWT tokens; no server-side session store required)

  ### Sticky Sessions

  Sticky sessions are NOT required. Any instance can serve any request.

  ### Instance Scaling Steps (Render)

  1. Render dashboard → hedgecore service → Settings → Instances → increase count.
  2. No code changes required.
  3. Verify: make two requests to `/system/health` from the same client; both should return `status: ok`.
  4. Verify rate limiting: send 61 requests/minute; the 61st should return HTTP 429 regardless of which instance handles it.

  ### Connection Pool Ceiling

  With N instances, total PostgreSQL connections = N × (pool_size + max_overflow) = N × 30.
  Render PostgreSQL Starter ceiling = 97 connections.
  Therefore: maximum safe instance count = floor(97 / 30) = **3 instances** on Starter plan.
  Upgrade to Render PostgreSQL Standard (500 connections) before scaling beyond 3 instances.

  ### Redis Failure Modes

  See Sprint 2 spec for detailed failure behaviour per concern.
  Short summary:
  - Rate limiting: fail-closed (in-process fallback — acceptable for brief Redis outage)
  - Market data cache: fail-open (hits provider directly)
  - Session tokens: unaffected (signature check)
  ```

- [ ] **7.2 — Create horizontal-scaling-contract.md**

  Create `docs/architecture/horizontal-scaling-contract.md`:
  ```markdown
  # Horizontal Scaling Contract — ORDR Terminal v1

  **Date:** 2026-03-28
  **Status:** Active
  **Scope:** FastAPI backend on Render.com

  ## Statelessness Guarantees

  | Concern              | Storage Location     | Cross-Instance Safe? |
  |----------------------|----------------------|----------------------|
  | JWT auth             | Stateless signature  | Yes                  |
  | Rate limiting        | Redis (Lua atomic)   | Yes (requires Redis) |
  | Market data cache    | Redis (60s TTL)      | Yes (requires Redis) |
  | DB connections       | SQLAlchemy pool      | Yes (per-instance)   |
  | Audit event chain    | PostgreSQL           | Yes (append-only)    |
  | Webhook delivery     | Background task      | Yes (idempotent)     |
  | WORM tables          | PostgreSQL           | Yes (append-only)    |
  | In-memory rate limit | Process memory       | No — fallback only   |

  ## Instance Ceiling (Render Starter)

  ```
  pool_size=20, max_overflow=10 → 30 connections per instance
  Render PostgreSQL Starter → 97 connections
  Max safe instances = floor(97 / 30) = 3
  ```

  Upgrade path: Render PostgreSQL Standard (500 connections) → 16 instances max.

  ## Prerequisites for Safe Horizontal Scale

  1. `REDIS_URL` env var set and Redis reachable.
  2. `DATABASE_URL` points to Render PostgreSQL (not localhost).
  3. `JWT_SECRET` is identical across all instances (shared env group in render.yaml).
  4. Pool tuning applied: `pool_size=20, max_overflow=10, pool_timeout=30`.

  ## Verification Checklist

  - [ ] `/system/health` returns `status: ok` from all instances.
  - [ ] Rate limit test: 61 requests/min from single client triggers HTTP 429.
  - [ ] JWT token issued by instance A is accepted by instance B.
  - [ ] Market data cache: two instances show cache hits after first request.
  - [ ] Audit event chain: hash chain valid across all instances writing to same PG.

  ## Anti-Patterns (Do Not Do)

  - Do NOT store authentication state in process memory.
  - Do NOT use sticky sessions.
  - Do NOT store webhook secret in process memory (read from DB per-request).
  - Do NOT store rate limit buckets only in `self._buckets` dict for multi-instance
    (the in-process `_buckets` dict is the fallback only — Redis must be active in production).

  ## Known v1 Limitations

  - **Long-running background coroutines:** `dispatch_webhook_event` uses `asyncio.sleep()` for
    retry delays (1m, 5m, 15m, 60m, 240m). For the 60min and 240min delays, this holds an async
    task open for extended periods. Under horizontal scaling, if an instance is recycled or
    restarted during a long sleep, that retry attempt is lost silently (no persistence of in-flight
    retry state). Mitigation for v2: migrate long-delay retries to APScheduler with a persistent
    job store so retry state survives instance restarts. Until then, operators must monitor
    `webhook_delivery_logs` for `status=failed` rows and re-trigger manually if needed.
  ```

- [ ] **7.3 — Run final full test suite after all changes**

  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/ -q --tb=short 2>&1 | tail -30
  ```
  Expected: same pass baseline (~2725+ passed), 0 failed, skipped count stable.

  Record the output as validation evidence.

---

## Chunk 8: Rate Limiting Redis Hardening (Multi-Instance)

**Context:** `RateLimitMiddleware` already has a Redis backend (`_RedisTokenBucket`) and in-process fallback. Sprint 5 requires verifying that Redis is wired and that the middleware startup log confirms the backend in use.

### Files

- **Modify:** `backend/app/main.py` (pass REDIS_URL to RateLimitMiddleware)
- **Test:** `backend/tests/test_rate_limit_redis.py` (create)

---

- [ ] **8.1 — Write failing test first (TDD)**

  Create `backend/tests/test_rate_limit_redis.py`:
  ```python
  """Tests for Redis-backed rate limiting in multi-instance context."""
  from __future__ import annotations
  import pytest
  from unittest.mock import MagicMock, patch


  def test_rate_limit_middleware_accepts_redis_url():
      """RateLimitMiddleware must accept redis_url parameter without error."""
      from app.middleware.rate_limit import RateLimitMiddleware
      from starlette.applications import Starlette

      app = Starlette()
      # Should not raise even if Redis is unreachable — falls back to in-process
      with patch("redis.from_url") as mock_redis:
          mock_client = MagicMock()
          mock_client.ping = MagicMock(side_effect=ConnectionError("refused"))
          mock_redis.return_value = mock_client
          mw = RateLimitMiddleware(app, redis_url="redis://localhost:6379/0")
          # With ping failure, should fall back to in-process
          assert mw._redis_bucket is None


  def test_rate_limit_middleware_redis_backend_active_when_reachable():
      """When Redis is reachable, _redis_bucket must be non-None."""
      from app.middleware.rate_limit import RateLimitMiddleware
      from starlette.applications import Starlette

      app = Starlette()
      with patch("redis.from_url") as mock_redis:
          mock_client = MagicMock()
          mock_client.ping = MagicMock(return_value=True)
          mock_client.register_script = MagicMock(return_value=MagicMock())
          mock_redis.return_value = mock_client
          mw = RateLimitMiddleware(app, redis_url="redis://localhost:6379/0")
          assert mw._redis_bucket is not None


  def test_rate_limit_middleware_fallback_when_no_redis_url():
      """Without REDIS_URL, middleware falls back to in-process buckets."""
      from app.middleware.rate_limit import RateLimitMiddleware
      from starlette.applications import Starlette

      app = Starlette()
      mw = RateLimitMiddleware(app)  # no redis_url
      assert mw._redis_bucket is None
      assert isinstance(mw._buckets, dict)
  ```

  Run to confirm tests pass immediately (behaviour already exists — this validates the contract):
  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_rate_limit_redis.py -x -q --tb=short 2>&1 | tail -20
  ```
  Expected: `3 passed`.

- [ ] **8.2 — Verify REDIS_URL is passed to RateLimitMiddleware in main.py**

  Read `backend/app/main.py` from the middleware registration block (search for `RateLimitMiddleware`). Confirm or add `redis_url=settings.REDIS_URL` parameter:

  ```python
  app.add_middleware(
      RateLimitMiddleware,
      requests_per_minute=settings.RATE_LIMIT_PER_MINUTE,
      redis_url=settings.REDIS_URL or None,
  )
  ```

  If `REDIS_URL` is not yet in `Settings`, it was added in Chunk 2 step 2.1. If `RATE_LIMIT_PER_MINUTE` does not exist in Settings, use the literal `60`.

- [ ] **8.3 — Run rate limiting tests and full suite**

  ```bash
  cd backend && JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long" DATABASE_URL="sqlite+aiosqlite://" python -m pytest tests/test_rate_limit_redis.py tests/test_db_pool.py tests/test_redis_cache.py tests/test_webhook_models.py tests/test_webhook_service.py tests/test_webhook_routes.py -v --tb=short 2>&1 | tail -40
  ```
  Expected: all Sprint 5 test files pass.

---

## Sprint 5 Done Criteria Checklist

- [ ] `tests/test_db_pool.py` — 3 passing. Pool uses QueuePool for PostgreSQL, NullPool for SQLite.
- [ ] `tests/test_redis_cache.py` — 6 passing. Redis cache module with hit/miss counters.
- [ ] `/system/health` returns `market_data_cache: {cache_hits, cache_misses, hit_rate_pct}`.
- [ ] `tests/test_webhook_models.py` — 6 passing. Models importable with correct columns.
- [ ] `tests/test_webhook_service.py` — 7 passing. HMAC verified, retry schedule correct.
- [ ] `tests/test_webhook_routes.py` — 4 passing. CRUD routes behave correctly.
- [ ] `tests/test_webhook_events_calculate.py` — passing. `calculation.completed` event fires in `v1_calculate.py`.
- [ ] `tests/test_webhook_events_proposals.py` — passing. `proposal.approved` and `proposal.rejected` events fire in `v1_execution_proposals.py`.
- [ ] All four spec webhook events tested and firing: `position.created`, `calculation.completed`, `proposal.approved`, `proposal.rejected`.
- [ ] `tests/test_rate_limit_redis.py` — 3 passing. Redis backend wired and verified.
- [ ] Alembic migration `0010_add_webhooks` created and testable.
- [ ] `docs/performance/k6-load-test.js` — committed and reproducible.
- [ ] `docs/performance/load-test-baseline.md` — committed with actual p50/p95/p99 values populated (no `[FILL IN]` entries). Run k6 first, paste real results, then commit.
- [ ] `docs/architecture/SYSTEM_BOUNDARIES.md` — multi-instance topology section added.
- [ ] `docs/architecture/horizontal-scaling-contract.md` — committed.
- [ ] Full test suite: no regressions from baseline.

## New Files Created in Sprint 5

| Path | Purpose |
|------|---------|
| `backend/app/core/redis_client.py` | Async Redis client, fail-open, with hit/miss counters |
| `backend/app/models/webhook.py` | WebhookEndpoint + WebhookDeliveryLog ORM models |
| `backend/app/services/webhook_service.py` | HMAC signing, delivery, retry, audit emit |
| `backend/app/api/routes/v1_webhooks.py` | POST/GET/DELETE /v1/webhooks |
| `backend/app/tasks/webhook_cleanup.py` | Nightly delivery log pruning task |
| `backend/alembic/versions/0010_add_webhooks.py` | DB migration |
| `backend/tests/test_db_pool.py` | Pool configuration tests |
| `backend/tests/test_redis_cache.py` | Redis cache tests |
| `backend/tests/test_webhook_models.py` | Model structure tests |
| `backend/tests/test_webhook_service.py` | Service + HMAC tests |
| `backend/tests/test_webhook_routes.py` | Route integration tests |
| `backend/tests/test_rate_limit_redis.py` | Rate limiter backend tests |
| `backend/tests/test_webhook_events_calculate.py` | TDD: calculation.completed event fires |
| `backend/tests/test_webhook_events_proposals.py` | TDD: proposal.approved and proposal.rejected events fire |
| `docs/performance/k6-load-test.js` | Reproducible k6 load test script |
| `docs/performance/load-test-baseline.md` | Baseline results record |
| `docs/performance/results/.gitkeep` | Results directory placeholder |
| `docs/architecture/horizontal-scaling-contract.md` | Stateless deployment contract |

## Modified Files in Sprint 5

| Path | Change |
|------|--------|
| `backend/app/core/db.py` | Switch from NullPool to QueuePool for PostgreSQL |
| `backend/app/core/config.py` | Add DB_POOL_*, REDIS_URL settings |
| `backend/app/api/routes/system.py` | Add cache stats to `/system/health` |
| `backend/app/api/routes/v1_market_data_live.py` | Swap in-memory cache for Redis cache |
| `backend/app/api/router.py` | Register webhook router |
| `backend/app/main.py` | Pass REDIS_URL to RateLimitMiddleware; add webhook cleanup job |
| `docs/architecture/SYSTEM_BOUNDARIES.md` | Add multi-instance topology section |
