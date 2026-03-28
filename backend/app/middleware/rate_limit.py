# backend/app/middleware/rate_limit.py
from __future__ import annotations

import logging
import time
from collections.abc import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

try:
    import redis as _redis  # type: ignore[import]
except ImportError:  # pragma: no cover
    _redis = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)


class TokenBucket:
    """
    Deterministic token bucket (in-memory, single-process).

    NOTE:
      - This is intentionally simple and deterministic.
      - Suitable for MVP / single-node deployments.
      - For multi-node, use RateLimitMiddleware with REDIS_URL configured.
    """

    __slots__ = ("capacity", "tokens", "refill_rate_per_sec", "last_refill")

    def __init__(self, capacity: int, refill_rate_per_sec: float) -> None:
        self.capacity = float(capacity)
        self.tokens = float(capacity)
        self.refill_rate_per_sec = float(refill_rate_per_sec)
        self.last_refill = time.monotonic()

    def consume(self, amount: float = 1.0) -> bool:
        now = time.monotonic()
        elapsed = now - self.last_refill
        if elapsed > 0:
            refill = elapsed * self.refill_rate_per_sec
            self.tokens = min(self.capacity, self.tokens + refill)
            self.last_refill = now

        if self.tokens >= amount:
            self.tokens -= amount
            return True
        return False

    def snapshot(self) -> dict[str, float]:
        return {
            "capacity": self.capacity,
            "tokens": round(self.tokens, 6),
            "refill_rate_per_sec": self.refill_rate_per_sec,
        }


class _RedisTokenBucket:
    """
    Redis-backed token bucket for multi-node deployments.
    Uses a Lua script for atomic check-and-consume.
    Fail-CLOSED on Redis errors: returns (False, 0) to deny the request and preserve rate-limit integrity.
    """

    _LUA_CONSUME = """
    local key = KEYS[1]
    local capacity = tonumber(ARGV[1])
    local refill_rate = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])
    local amount = tonumber(ARGV[4])

    local data = redis.call('HMGET', key, 'tokens', 'last_refill')
    local tokens = tonumber(data[1]) or capacity
    local last_refill = tonumber(data[2]) or now

    local elapsed = now - last_refill
    if elapsed > 0 then
        tokens = math.min(capacity, tokens + elapsed * refill_rate)
    end

    local allowed = 0
    if tokens >= amount then
        tokens = tokens - amount
        allowed = 1
    end

    redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
    redis.call('EXPIRE', key, 120)
    return {allowed, math.floor(tokens)}
    """

    def __init__(self, redis_client, capacity: float, refill_rate: float) -> None:
        self._redis = redis_client
        self._capacity = capacity
        self._refill_rate = refill_rate
        try:
            self._script = redis_client.register_script(self._LUA_CONSUME)
        except Exception:
            self._script = None

    def consume(self, key: str, amount: float = 1.0):
        """Returns (allowed: bool, remaining: int). Fail-closed on Redis errors."""
        if self._script is None:
            logger.warning(
                "RateLimitMiddleware: Redis Lua script not registered (fail-CLOSED) — denying request"
            )
            return False, 0
        try:
            now = time.time()
            result = self._script(
                keys=[key],
                args=[self._capacity, self._refill_rate, now, amount],
            )
            allowed = bool(result[0])
            remaining = int(result[1])
            return allowed, remaining
        except Exception as exc:
            logger.warning(
                "RateLimitMiddleware: Redis error (fail-CLOSED) — "
                "denying request to preserve rate limit integrity. Error: %s",
                exc,
            )
            return False, 0


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Institutional-grade API rate limiting (Token Bucket).

    Supports two backends:
      - In-memory (default): single-process, suitable for single-node/Render free tier
      - Redis: multi-node safe, configured via redis_url parameter

    Characteristics:
      - Deterministic
      - No randomness
      - Explicit rejection (429)
      - Audit-visible headers
      - No background tasks

    Default Policy:
      - 60 requests / minute per key
      - Burst capacity = 60
      - Key precedence:
          1) X-API-Key
          2) X-Request-Id
          3) client.host
    """

    def __init__(
        self,
        app,
        *,
        requests_per_minute: int = 60,
        burst_capacity: int | None = None,
        header_api_key: str = "X-API-Key",
        header_request_id: str = "X-Request-Id",
        include_headers: bool = True,
        redis_url: str | None = None,
    ) -> None:
        super().__init__(app)
        self.capacity = float(burst_capacity or requests_per_minute)
        self.refill_rate = float(requests_per_minute) / 60.0
        self.header_api_key = header_api_key
        self.header_request_id = header_request_id
        self.include_headers = bool(include_headers)

        # Attempt to connect to Redis if URL provided
        self._redis_bucket: _RedisTokenBucket | None = None
        if redis_url:
            try:
                client = _redis.from_url(redis_url, socket_connect_timeout=2, socket_timeout=2)
                client.ping()
                self._redis_bucket = _RedisTokenBucket(client, self.capacity, self.refill_rate)
                logger.info("RateLimitMiddleware: using Redis backend (%s)", redis_url.split("@")[-1])
            except Exception as exc:
                logger.warning(
                    "RateLimitMiddleware: Redis unavailable (%s), falling back to in-memory", exc
                )

        # Emit startup observability for rate-limiting backend
        if redis_url and not self._redis_bucket:
            logger.warning(
                "⚠️  Rate limiter: REDIS_URL configured but Redis unreachable — "
                "falling back to IN-MEMORY token bucket. "
                "NOT safe for multi-node deployments."
            )
        elif not redis_url:
            logger.info(
                "Rate limiter: no REDIS_URL set — using IN-MEMORY token bucket "
                "(single-node only). Set REDIS_URL for multi-node rate limiting."
            )
        else:
            logger.info("✅ Rate limiter: Redis backend active (%s)", redis_url)

        # In-memory fallback buckets
        self._buckets: dict[str, TokenBucket] = {}

    def _resolve_key(self, request: Request) -> str:
        api_key = request.headers.get(self.header_api_key)
        if api_key:
            return f"api:{api_key}"

        req_id = request.headers.get(self.header_request_id)
        if req_id:
            return f"rid:{req_id}"

        client = request.client
        if client and client.host:
            return f"ip:{client.host}"

        return "anonymous"

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        key = self._resolve_key(request)

        if self._redis_bucket is not None:
            allowed, remaining_tokens = self._redis_bucket.consume(key)
            snap = {"capacity": self.capacity, "tokens": float(remaining_tokens), "refill_rate_per_sec": self.refill_rate}
        else:
            bucket = self._buckets.get(key)
            if bucket is None:
                bucket = TokenBucket(self.capacity, self.refill_rate)
                self._buckets[key] = bucket
            allowed = bucket.consume(1.0)
            snap = bucket.snapshot()

        if not allowed:
            headers = {}
            if self.include_headers:
                headers = {
                    "X-RateLimit-Limit": str(int(snap["capacity"])),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Refill-Per-Sec": str(snap["refill_rate_per_sec"]),
                }
            return JSONResponse(
                status_code=429,
                content={"error": "rate_limited", "detail": "Too many requests"},
                headers=headers,
            )

        response: Response = await call_next(request)

        if self.include_headers:
            response.headers["X-RateLimit-Limit"] = str(int(snap["capacity"]))
            response.headers["X-RateLimit-Remaining"] = str(int(snap["tokens"]))
            response.headers["X-RateLimit-Refill-Per-Sec"] = str(snap["refill_rate_per_sec"])

        return response


__all__ = ["RateLimitMiddleware"]
