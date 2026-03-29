"""Tests for Redis market data cache module."""
from __future__ import annotations
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def test_redis_cache_module_importable():
    """redis_client module must be importable."""
    from app.core import redis_client
    assert hasattr(redis_client, "get_cached_market_data")
    assert hasattr(redis_client, "set_cached_market_data")
    assert hasattr(redis_client, "get_cache_stats")


def test_cache_key_format():
    """Cache key must follow market_data:{provider}:{pair}:{timeframe} format."""
    from app.core.redis_client import make_cache_key
    key = make_cache_key("finnhub", "EURUSD", "1min")
    assert key == "market_data:finnhub:EURUSD:1min"


@pytest.mark.asyncio
async def test_get_cached_market_data_returns_none_when_no_redis():
    """get_cached_market_data returns None (fail-open) when Redis is unavailable."""
    from app.core import redis_client
    # Force _redis_client to None to simulate no Redis configured
    original = redis_client._redis_client
    redis_client._redis_client = None
    try:
        result = await redis_client.get_cached_market_data("finnhub", "EURUSD", "1min")
        assert result is None
    finally:
        redis_client._redis_client = original


@pytest.mark.asyncio
async def test_set_cached_market_data_is_noop_when_no_redis():
    """set_cached_market_data is a no-op (fail-open) when Redis unavailable."""
    from app.core import redis_client
    original = redis_client._redis_client
    redis_client._redis_client = None
    try:
        # Should not raise
        await redis_client.set_cached_market_data("finnhub", "EURUSD", "1min", {"price": 1.1234})
    finally:
        redis_client._redis_client = original


def test_get_cache_stats_returns_dict():
    """get_cache_stats must return a dict with hits, misses, hit_rate_pct."""
    from app.core.redis_client import get_cache_stats
    stats = get_cache_stats()
    assert "cache_hits" in stats
    assert "cache_misses" in stats
    assert "hit_rate_pct" in stats


@pytest.mark.asyncio
async def test_cache_hit_increments_counter():
    """A successful cache hit increments the hit counter."""
    from app.core import redis_client

    # Reset counters
    redis_client._cache_hits = 0
    redis_client._cache_misses = 0

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=b'{"price": 1.1234}')

    with patch.object(redis_client, "_redis_client", mock_redis):
        result = await redis_client.get_cached_market_data("finnhub", "EURUSD", "1min")

    assert result == {"price": 1.1234}
    assert redis_client._cache_hits == 1
    assert redis_client._cache_misses == 0
