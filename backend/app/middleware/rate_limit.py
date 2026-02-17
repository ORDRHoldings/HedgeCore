# backend/app/middleware/rate_limit.py
from __future__ import annotations

import time
from typing import Callable, Dict, Optional, Tuple

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, JSONResponse


class TokenBucket:
    """
    Deterministic token bucket (in-memory, single-process).

    NOTE:
      - This is intentionally simple and deterministic.
      - Suitable for MVP / single-node deployments.
      - For multi-node, replace storage with Redis using same semantics.
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

    def snapshot(self) -> Dict[str, float]:
        return {
            "capacity": self.capacity,
            "tokens": round(self.tokens, 6),
            "refill_rate_per_sec": self.refill_rate_per_sec,
        }


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Institutional-grade API rate limiting (Token Bucket).

    Characteristics:
      - Deterministic
      - No randomness
      - Explicit rejection (429)
      - Audit-visible headers
      - No background tasks
      - No I/O

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
        burst_capacity: Optional[int] = None,
        header_api_key: str = "X-API-Key",
        header_request_id: str = "X-Request-Id",
        include_headers: bool = True,
    ) -> None:
        super().__init__(app)
        self.capacity = float(burst_capacity or requests_per_minute)
        self.refill_rate = float(requests_per_minute) / 60.0
        self.header_api_key = header_api_key
        self.header_request_id = header_request_id
        self.include_headers = bool(include_headers)

        # In-memory buckets: key -> TokenBucket
        self._buckets: Dict[str, TokenBucket] = {}

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

        bucket = self._buckets.get(key)
        if bucket is None:
            bucket = TokenBucket(self.capacity, self.refill_rate)
            self._buckets[key] = bucket

        allowed = bucket.consume(1.0)

        if not allowed:
            # Deterministic rejection
            headers = {}
            if self.include_headers:
                snap = bucket.snapshot()
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
            snap = bucket.snapshot()
            response.headers["X-RateLimit-Limit"] = str(int(snap["capacity"]))
            response.headers["X-RateLimit-Remaining"] = str(int(snap["tokens"]))
            response.headers["X-RateLimit-Refill-Per-Sec"] = str(snap["refill_rate_per_sec"])

        return response


__all__ = ["RateLimitMiddleware"]
