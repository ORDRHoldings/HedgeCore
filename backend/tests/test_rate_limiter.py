"""
backend/tests/test_rate_limiter.py
SEC-04: Rate limiter unit tests.
No DB, no Redis required — tests in-memory fallback only.
"""

from __future__ import annotations

import time
import pytest
from app.core.rate_limiter import RateLimiter


class TestRateLimiterLocal:
    """In-memory fallback behavior (Redis unavailable)."""

    def test_allows_under_limit(self):
        limiter = RateLimiter(redis_url=None, max_requests=5, window_seconds=60)
        for _ in range(5):
            assert limiter.is_allowed("user_1") is True

    def test_blocks_over_limit(self):
        limiter = RateLimiter(redis_url=None, max_requests=3, window_seconds=60)
        for _ in range(3):
            limiter.is_allowed("user_2")
        assert limiter.is_allowed("user_2") is False

    def test_window_expiry_resets(self):
        limiter = RateLimiter(redis_url=None, max_requests=1, window_seconds=1)
        assert limiter.is_allowed("user_3") is True
        assert limiter.is_allowed("user_3") is False
        time.sleep(1.1)
        assert limiter.is_allowed("user_3") is True

    def test_different_keys_are_independent(self):
        limiter = RateLimiter(redis_url=None, max_requests=1, window_seconds=60)
        assert limiter.is_allowed("user_A") is True
        assert limiter.is_allowed("user_B") is True
        assert limiter.is_allowed("user_A") is False
        assert limiter.is_allowed("user_B") is False

    def test_invalid_redis_falls_back_to_local(self):
        """Bogus Redis URL must fall back silently — never raise."""
        limiter = RateLimiter(redis_url="redis://invalid-host-xyz:6379/0", max_requests=5, window_seconds=60)
        assert limiter.is_allowed("user_fallback") is True

    def test_zero_max_requests_always_blocks(self):
        limiter = RateLimiter(redis_url=None, max_requests=0, window_seconds=60)
        assert limiter.is_allowed("user_zero") is False
