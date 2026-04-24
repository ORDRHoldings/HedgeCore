"""
app/core/redis_client.py

Async Redis client for ORDR Terminal market data cache.

Failure mode: FAIL-OPEN. If Redis is unavailable, all cache operations
are no-ops and the caller falls back to the live data provider.

Cache key format: market_data:{provider}:{pair}:{timeframe}
Cache TTL: 60 seconds (configurable via MARKET_DATA_CACHE_TTL_SECONDS env var)
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any

_log = logging.getLogger("hedgecalc.redis_cache")

# ---------------------------------------------------------------------------
# Module-level counters (process-local, reset on restart)
# ---------------------------------------------------------------------------
_cache_hits: int = 0
_cache_misses: int = 0

# ---------------------------------------------------------------------------
# Redis client singleton (None until initialised)
# ---------------------------------------------------------------------------
_redis_client = None

_CACHE_TTL_SECONDS = int(os.getenv("MARKET_DATA_CACHE_TTL_SECONDS", "60"))


def make_cache_key(provider: str, pair: str, timeframe: str) -> str:
    """Build the canonical cache key for a market data entry."""
    return f"market_data:{provider}:{pair}:{timeframe}"


def get_redis_client():
    """Return the module-level async Redis client (None if not configured or init failed)."""
    return _redis_client


def init_redis(redis_url: str | None) -> None:
    """Initialise the module-level Redis client from a URL.

    Called at app startup. If redis_url is None or connection fails,
    _redis_client remains None and all cache operations become no-ops.
    """
    global _redis_client
    if not redis_url:
        _log.info("redis_cache: no REDIS_URL configured — market data cache disabled")
        return
    try:
        import redis.asyncio as aioredis
        _redis_client = aioredis.from_url(redis_url, decode_responses=False)
        _log.info("redis_cache: Redis client initialised from %s", redis_url)
    except Exception as exc:
        _log.warning("redis_cache: failed to init Redis client: %s — cache disabled", exc)
        _redis_client = None


async def get_cached_market_data(
    provider: str,
    pair: str,
    timeframe: str,
) -> dict[str, Any] | None:
    """Fetch cached market data. Returns None on miss or Redis unavailable (fail-open)."""
    global _cache_hits, _cache_misses
    if _redis_client is None:
        _cache_misses += 1
        return None
    try:
        key = make_cache_key(provider, pair, timeframe)
        raw = await _redis_client.get(key)
        if raw is None:
            _cache_misses += 1
            return None
        _cache_hits += 1
        return json.loads(raw)
    except Exception as exc:
        _log.warning("redis_cache: get error for %s/%s/%s: %s", provider, pair, timeframe, exc)
        _cache_misses += 1
        return None


async def set_cached_market_data(
    provider: str,
    pair: str,
    timeframe: str,
    data: dict[str, Any],
    ttl: int = _CACHE_TTL_SECONDS,
) -> None:
    """Store market data in cache. No-op if Redis unavailable (fail-open)."""
    if _redis_client is None:
        return
    try:
        key = make_cache_key(provider, pair, timeframe)
        await _redis_client.setex(key, ttl, json.dumps(data, default=str))
    except Exception as exc:
        _log.warning("redis_cache: set error for %s/%s/%s: %s", provider, pair, timeframe, exc)


def get_cache_stats() -> dict[str, Any]:
    """Return cache hit/miss counters for health endpoint reporting."""
    total = _cache_hits + _cache_misses
    hit_rate = round((_cache_hits / total * 100), 1) if total > 0 else 0.0
    return {
        "cache_hits": _cache_hits,
        "cache_misses": _cache_misses,
        "hit_rate_pct": hit_rate,
    }


__all__ = [
    "init_redis",
    "make_cache_key",
    "get_cached_market_data",
    "set_cached_market_data",
    "get_cache_stats",
]
