"""
app/core/rate_limiter.py
Redis-backed rate limiter with in-memory fallback.

SEC-04: Distributed rate limiter that works across multiple processes/pods.
Falls back to in-memory (same as existing _calc_timestamps behavior) when
Redis is unavailable — zero regression risk.
"""

from __future__ import annotations

import logging
import time

_log = logging.getLogger(__name__)


class RateLimiter:
    """Token bucket rate limiter with Redis backend + in-memory fallback.

    Backward compatible: if Redis is unavailable, falls back to in-memory
    dict (same behavior as the existing _calc_timestamps pattern).
    """

    def __init__(
        self,
        redis_url: str | None = None,
        max_requests: int = 10,
        window_seconds: int = 60,
    ) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._local_store: dict[str, list[float]] = {}
        self._redis = None

        if redis_url:
            try:
                import redis  # type: ignore[import]

                self._redis = redis.from_url(redis_url, decode_responses=True)
                self._redis.ping()
                _log.info("RateLimiter: Redis backend active at %s", redis_url)
            except Exception as exc:
                _log.warning(
                    "RateLimiter: Redis unavailable (%s), falling back to in-memory", exc
                )
                self._redis = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def is_allowed(self, key: str) -> bool:
        """Return True if the request is within the rate limit."""
        if self._redis is not None:
            return self._check_redis(key)
        return self._check_local(key)

    # ------------------------------------------------------------------
    # Redis backend (sliding window via sorted set)
    # ------------------------------------------------------------------

    def _check_redis(self, key: str) -> bool:
        try:
            pipe = self._redis.pipeline()
            now = time.time()
            redis_key = f"ratelimit:{key}"
            cutoff = now - self.window_seconds
            pipe.zremrangebyscore(redis_key, 0, cutoff)
            pipe.zcard(redis_key)
            pipe.zadd(redis_key, {str(now): now})
            pipe.expire(redis_key, self.window_seconds + 1)
            results = pipe.execute()
            current_count: int = results[1]  # count BEFORE adding this request
            return current_count < self.max_requests
        except Exception as exc:
            _log.warning("RateLimiter: Redis error (%s), falling back to local", exc)
            return self._check_local(key)

    # ------------------------------------------------------------------
    # In-memory fallback (same semantics as existing _calc_timestamps)
    # ------------------------------------------------------------------

    def _check_local(self, key: str) -> bool:
        now = time.time()
        cutoff = now - self.window_seconds
        timestamps = [t for t in self._local_store.get(key, []) if t > cutoff]
        if len(timestamps) >= self.max_requests:
            self._local_store[key] = timestamps
            return False
        timestamps.append(now)
        self._local_store[key] = timestamps
        return True
