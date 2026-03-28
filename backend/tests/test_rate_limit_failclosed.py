"""
Tests: RateLimitMiddleware Redis fail-closed contract.

When Redis is unavailable for rate limiting, the middleware must NOT
silently allow unlimited requests. It must fall back to the conservative
in-process TokenBucket (fail-closed), not grant every request (fail-open).

Spec 2.3: "Rate limiting: fail-closed — if Redis is unreachable, fall back
to a conservative in-process token bucket (not drop enforcement entirely)."
"""
from __future__ import annotations

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
