"""
Per-tenant + per-provider token bucket rate limiter.

Budgets (provider defaults, overridable via env or provider class):
  QuickBooks Online : 500 req/min
  Xero              :  60 req/min (+ 5k/day, enforced by provider)
  NetSuite          :  10 req/sec -> 600 req/min
  Sage Intacct      : 100 req/min
  Dynamics 365 F&O  : 600 req/min

Redis-backed when REDIS_URL set; in-memory fallback otherwise.
Fail-open: if the limiter itself errors, the request proceeds (matches the
intentional fail-open behavior of the market-data Redis cache).
"""
from __future__ import annotations

import asyncio
import time
from collections import defaultdict
from dataclasses import dataclass
from uuid import UUID

from app.connectors.errors import ConnectorRateLimitError
from app.core.config import settings

# ═════════════════════════════════════════════════════════════════════════════
# Bucket config per provider
# ═════════════════════════════════════════════════════════════════════════════


@dataclass(frozen=True)
class Budget:
    capacity: int  # max tokens
    refill_per_sec: float  # tokens regenerated per second


PROVIDER_BUDGETS: dict[str, Budget] = {
    "quickbooks":   Budget(capacity=500, refill_per_sec=500 / 60),
    "xero":         Budget(capacity=60,  refill_per_sec=60 / 60),
    "netsuite":     Budget(capacity=600, refill_per_sec=10),
    "sage_intacct": Budget(capacity=100, refill_per_sec=100 / 60),
    "dynamics365":  Budget(capacity=600, refill_per_sec=600 / 60),
}


def budget_for(provider: str) -> Budget:
    return PROVIDER_BUDGETS.get(provider, Budget(capacity=60, refill_per_sec=1))


# ═════════════════════════════════════════════════════════════════════════════
# In-memory fallback
# ═════════════════════════════════════════════════════════════════════════════


@dataclass
class _Bucket:
    tokens: float
    last_refill: float


_inmem: dict[tuple[str, str], _Bucket] = defaultdict(lambda: _Bucket(tokens=0.0, last_refill=time.monotonic()))
_inmem_lock = asyncio.Lock()


async def _inmem_take(provider: str, tenant_id: UUID, cost: int, b: Budget) -> tuple[bool, float, float]:
    """Returns (allowed, retry_after_sec, remaining)."""
    async with _inmem_lock:
        key = (provider, str(tenant_id))
        bucket = _inmem[key]
        now = time.monotonic()
        elapsed = now - bucket.last_refill
        bucket.tokens = min(b.capacity, bucket.tokens + elapsed * b.refill_per_sec)
        bucket.last_refill = now
        if bucket.tokens >= cost:
            bucket.tokens -= cost
            _inmem[key] = bucket
            return True, 0.0, bucket.tokens
        deficit = cost - bucket.tokens
        return False, deficit / b.refill_per_sec, bucket.tokens


# ═════════════════════════════════════════════════════════════════════════════
# Redis-backed (preferred) — uses registered server-side Lua script for atomic
# compare-and-consume. Redis EXECUTES the script inside the Redis server only;
# there is no client-side code execution. The script is registered once via
# SCRIPT LOAD and invoked by sha1, so no script source is sent over the wire
# after the first call.
# ═════════════════════════════════════════════════════════════════════════════

_REDIS_PREFIX = "connector:ratelimit:"

_TAKE_SCRIPT_SRC = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local refill = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])

local state = redis.call('HMGET', key, 'tokens', 'last')
local tokens = tonumber(state[1]) or capacity
local last = tonumber(state[2]) or now

local elapsed = math.max(0, now - last)
tokens = math.min(capacity, tokens + elapsed * refill)

local allowed = 0
local retry_after = 0
if tokens >= cost then
    tokens = tokens - cost
    allowed = 1
else
    retry_after = (cost - tokens) / refill
end

redis.call('HMSET', key, 'tokens', tokens, 'last', now)
redis.call('EXPIRE', key, 3600)

return {allowed, tostring(retry_after), tostring(tokens)}
"""


async def _redis_take(provider: str, tenant_id: UUID, cost: int, b: Budget) -> tuple[bool, float, float]:
    """Returns (allowed, retry_after_sec, remaining_tokens). Raises on Redis failure."""
    import redis.asyncio as aioredis  # type: ignore[import]

    client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        # register_script wraps the Lua; calls execute via EVALSHA with
        # automatic SCRIPT LOAD fallback. No client-side code execution.
        take_script = client.register_script(_TAKE_SCRIPT_SRC)
        key = f"{_REDIS_PREFIX}{provider}:{tenant_id}"
        result = await take_script(keys=[key], args=[time.time(), b.capacity, b.refill_per_sec, cost])
        allowed = bool(int(result[0]))
        retry_after = float(result[1])
        remaining = float(result[2])
        return allowed, retry_after, remaining
    finally:
        try:
            await client.aclose()
        except Exception:
            pass


# ═════════════════════════════════════════════════════════════════════════════
# Public API
# ═════════════════════════════════════════════════════════════════════════════


async def take(
    *,
    provider: str,
    tenant_id: UUID,
    cost: int = 1,
) -> float:
    """Consume `cost` tokens from the bucket. Raise ConnectorRateLimitError if exhausted.

    Returns remaining tokens (or -1 if unknown).
    Fail-open: limiter errors do not block the request.
    """
    b = budget_for(provider)

    if settings.REDIS_URL:
        try:
            allowed, retry_after, remaining = await _redis_take(provider, tenant_id, cost, b)
            if not allowed:
                raise ConnectorRateLimitError(
                    f"Rate limit exhausted for {provider} (tenant={tenant_id}). Retry in {retry_after:.1f}s.",
                    retry_after_sec=retry_after,
                    provider=provider,
                )
            return remaining
        except ConnectorRateLimitError:
            raise
        except Exception:
            pass  # Fail-open -> in-memory

    allowed, retry_after, remaining = await _inmem_take(provider, tenant_id, cost, b)
    if not allowed:
        raise ConnectorRateLimitError(
            f"Rate limit exhausted for {provider} (tenant={tenant_id}). Retry in {retry_after:.1f}s.",
            retry_after_sec=retry_after,
            provider=provider,
        )
    return remaining


async def peek(provider: str, tenant_id: UUID) -> float | None:
    """Return current remaining tokens (best-effort). None if Redis unavailable."""
    if not settings.REDIS_URL:
        key = (provider, str(tenant_id))
        bucket = _inmem.get(key)
        return bucket.tokens if bucket else float(budget_for(provider).capacity)
    try:
        import redis.asyncio as aioredis  # type: ignore[import]
        client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        try:
            key = f"{_REDIS_PREFIX}{provider}:{tenant_id}"
            val = await client.hget(key, "tokens")
            return float(val) if val is not None else float(budget_for(provider).capacity)
        finally:
            try:
                await client.aclose()
            except Exception:
                pass
    except Exception:
        return None
