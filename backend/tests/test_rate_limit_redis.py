"""Tests for Redis-backed rate limiting in multi-instance context.

Verifies the contract:
  - RateLimitMiddleware accepts a redis_url param without raising
  - When Redis ping fails, falls back to in-process (_redis_bucket is None)
  - When no redis_url provided, uses in-process buckets (_buckets dict, _redis_bucket is None)
  - When Redis ping succeeds, _redis_bucket is a _RedisTokenBucket instance
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


def test_rate_limit_middleware_accepts_redis_url_with_ping_failure():
    """RateLimitMiddleware must accept redis_url and silently fall back when ping fails."""
    from app.middleware.rate_limit import RateLimitMiddleware
    from starlette.applications import Starlette

    app = Starlette()
    with patch("redis.from_url") as mock_from_url:
        mock_client = MagicMock()
        mock_client.ping.side_effect = ConnectionError("Connection refused")
        mock_from_url.return_value = mock_client

        mw = RateLimitMiddleware(app, redis_url="redis://localhost:6379/0")

    # Should not raise; fall back to in-process
    assert mw is not None
    # _redis_bucket must be None — Redis was unreachable
    assert mw._redis_bucket is None
    # In-process buckets dict must be present
    assert isinstance(mw._buckets, dict)


def test_rate_limit_middleware_fallback_when_no_redis_url():
    """Without redis_url, middleware initialises without error and uses in-process buckets."""
    from app.middleware.rate_limit import RateLimitMiddleware
    from starlette.applications import Starlette

    app = Starlette()
    mw = RateLimitMiddleware(app)  # no redis_url

    assert mw is not None
    assert mw._redis_bucket is None
    assert isinstance(mw._buckets, dict)


def test_rate_limit_middleware_redis_backend_active_when_reachable():
    """When Redis ping succeeds, _redis_bucket must be a _RedisTokenBucket instance."""
    from app.middleware.rate_limit import RateLimitMiddleware, _RedisTokenBucket
    from starlette.applications import Starlette

    app = Starlette()
    with patch("redis.from_url") as mock_from_url:
        mock_client = MagicMock()
        mock_client.ping.return_value = True
        mock_client.register_script.return_value = MagicMock()
        mock_from_url.return_value = mock_client

        mw = RateLimitMiddleware(app, redis_url="redis://localhost:6379/0")

    assert mw is not None
    assert isinstance(mw._redis_bucket, _RedisTokenBucket)


def test_rate_limit_middleware_settings_wired():
    """Settings must expose REDIS_URL attribute (may be None) for main.py wiring."""
    from app.core.config import settings

    # REDIS_URL must be present on the settings object (can be None in test env)
    assert hasattr(settings, "REDIS_URL")
    # In CI (no Redis), it must be None or a string — never a non-string non-None value
    assert settings.REDIS_URL is None or isinstance(settings.REDIS_URL, str)


def test_rate_limit_middleware_capacity_defaults():
    """Middleware capacity and refill_rate derive from requests_per_minute correctly."""
    from app.middleware.rate_limit import RateLimitMiddleware
    from starlette.applications import Starlette

    app = Starlette()
    mw = RateLimitMiddleware(app, requests_per_minute=60)

    assert mw.capacity == 60.0
    assert abs(mw.refill_rate - 1.0) < 1e-9  # 60 / 60 = 1.0 token/sec
