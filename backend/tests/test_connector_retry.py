"""
tests/test_connector_retry.py

Unit tests for app/connectors/retry.py:
  - retry(): exponential backoff + jitter
  - _BreakerState.is_open(): cooldown logic
  - check_breaker / record_success / record_failure: state machine transitions
  - call_with_guard(): integration of retry + breaker

All tests run against the in-memory breaker store (REDIS_URL unset).
"""
from __future__ import annotations

import time
import uuid
from unittest.mock import AsyncMock, patch

import pytest

from app.connectors.errors import (
    ConnectorCircuitOpenError,
    ConnectorError,
    ConnectorRateLimitError,
    ConnectorServerError,
)
from app.connectors.retry import (
    _BreakerState,
    _inmem_breakers,
    call_with_guard,
    check_breaker,
    record_failure,
    record_success,
    retry,
)


_PROVIDER = "QUICKBOOKS"
_TENANT = uuid.uuid4()


def _clear_breaker(provider: str = _PROVIDER, tenant: uuid.UUID = _TENANT) -> None:
    _inmem_breakers.pop((provider, str(tenant)), None)


# ──────────────────────────────────────────────────────────────────────────────
# _BreakerState.is_open
# ──────────────────────────────────────────────────────────────────────────────

class TestBreakerStateIsOpen:
    def test_closed_when_no_opened_at(self):
        state = _BreakerState(failures=0, opened_at=None)
        open_, remaining = state.is_open(cooldown_sec=60)
        assert open_ is False
        assert remaining == 0.0

    def test_open_within_cooldown(self):
        state = _BreakerState(failures=5, opened_at=time.monotonic())
        open_, remaining = state.is_open(cooldown_sec=600)
        assert open_ is True
        assert remaining > 0

    def test_closed_after_cooldown_elapsed(self):
        # opened_at far in the past (cooldown already elapsed)
        state = _BreakerState(failures=5, opened_at=time.monotonic() - 700)
        open_, remaining = state.is_open(cooldown_sec=600)
        assert open_ is False
        assert remaining == 0.0


# ──────────────────────────────────────────────────────────────────────────────
# retry()
# ──────────────────────────────────────────────────────────────────────────────

class TestRetry:

    @pytest.mark.asyncio
    async def test_success_on_first_attempt(self):
        fn = AsyncMock(return_value=42)
        result = await retry(fn, max_attempts=3)
        assert result == 42
        assert fn.call_count == 1

    @pytest.mark.asyncio
    async def test_retries_on_server_error_then_succeeds(self):
        fn = AsyncMock(side_effect=[ConnectorServerError("5xx"), 99])
        with patch("app.connectors.retry.asyncio.sleep", new_callable=AsyncMock):
            result = await retry(fn, max_attempts=3)
        assert result == 99
        assert fn.call_count == 2

    @pytest.mark.asyncio
    async def test_raises_after_max_attempts(self):
        fn = AsyncMock(side_effect=ConnectorServerError("always fails"))
        with patch("app.connectors.retry.asyncio.sleep", new_callable=AsyncMock):
            with pytest.raises(ConnectorServerError):
                await retry(fn, max_attempts=3)
        assert fn.call_count == 3

    @pytest.mark.asyncio
    async def test_non_retryable_error_bubbles_immediately(self):
        fn = AsyncMock(side_effect=ConnectorRateLimitError("429", retry_after_sec=30))
        with pytest.raises(ConnectorRateLimitError):
            await retry(fn, max_attempts=4, retry_on=(ConnectorServerError,))
        assert fn.call_count == 1

    @pytest.mark.asyncio
    async def test_custom_retry_on(self):
        fn = AsyncMock(side_effect=[ValueError("transient"), "ok"])
        with patch("app.connectors.retry.asyncio.sleep", new_callable=AsyncMock):
            result = await retry(fn, max_attempts=3, retry_on=(ValueError,))
        assert result == "ok"


# ──────────────────────────────────────────────────────────────────────────────
# check_breaker / record_success / record_failure
# ──────────────────────────────────────────────────────────────────────────────

class TestBreakerStateTransitions:

    def setup_method(self):
        _clear_breaker()

    @pytest.mark.asyncio
    async def test_check_breaker_passes_when_closed(self):
        # Should not raise when no failures recorded
        await check_breaker(_PROVIDER, _TENANT)

    @pytest.mark.asyncio
    async def test_record_failure_increments_count(self):
        await record_failure(_PROVIDER, _TENANT)
        state = _inmem_breakers.get((_PROVIDER, str(_TENANT)))
        assert state is not None
        assert state.failures == 1

    @pytest.mark.asyncio
    async def test_record_success_clears_failures(self):
        await record_failure(_PROVIDER, _TENANT)
        await record_success(_PROVIDER, _TENANT)
        state = _inmem_breakers.get((_PROVIDER, str(_TENANT)))
        assert state is None or (state.failures == 0 and state.opened_at is None)

    @pytest.mark.asyncio
    async def test_breaker_trips_at_threshold(self):
        threshold = 5  # matches config default
        with patch("app.connectors.retry.settings") as mock_settings:
            mock_settings.CONNECTOR_CIRCUIT_BREAKER_THRESHOLD = threshold
            mock_settings.CONNECTOR_CIRCUIT_BREAKER_COOLDOWN_SEC = 600
            mock_settings.REDIS_URL = None
            for _ in range(threshold):
                await record_failure(_PROVIDER, _TENANT)

        state = _inmem_breakers.get((_PROVIDER, str(_TENANT)))
        assert state is not None
        assert state.opened_at is not None

    @pytest.mark.asyncio
    async def test_check_breaker_raises_when_open(self):
        # Manually set the breaker open
        _inmem_breakers[(_PROVIDER, str(_TENANT))] = _BreakerState(
            failures=5, opened_at=time.monotonic()
        )
        with patch("app.connectors.retry.settings") as mock_settings:
            mock_settings.REDIS_URL = None
            mock_settings.CONNECTOR_CIRCUIT_BREAKER_COOLDOWN_SEC = 600
            with pytest.raises(ConnectorCircuitOpenError):
                await check_breaker(_PROVIDER, _TENANT)


# ──────────────────────────────────────────────────────────────────────────────
# call_with_guard
# ──────────────────────────────────────────────────────────────────────────────

class TestCallWithGuard:

    def setup_method(self):
        _clear_breaker()

    @pytest.mark.asyncio
    async def test_success_passes_through(self):
        fn = AsyncMock(return_value="result")
        with patch("app.connectors.retry.asyncio.sleep", new_callable=AsyncMock):
            result = await call_with_guard(fn, provider=_PROVIDER, tenant_id=_TENANT)
        assert result == "result"

    @pytest.mark.asyncio
    async def test_server_error_records_failure(self):
        fn = AsyncMock(side_effect=ConnectorServerError("5xx"))
        with patch("app.connectors.retry.asyncio.sleep", new_callable=AsyncMock):
            with pytest.raises(ConnectorServerError):
                await call_with_guard(fn, provider=_PROVIDER, tenant_id=_TENANT)
        state = _inmem_breakers.get((_PROVIDER, str(_TENANT)))
        assert state is not None and state.failures >= 1

    @pytest.mark.asyncio
    async def test_rate_limit_does_not_record_failure(self):
        fn = AsyncMock(side_effect=ConnectorRateLimitError("429", retry_after_sec=10))
        with pytest.raises(ConnectorRateLimitError):
            await call_with_guard(fn, provider=_PROVIDER, tenant_id=_TENANT)
        state = _inmem_breakers.get((_PROVIDER, str(_TENANT)))
        # Rate limit should NOT increment the failure counter
        assert state is None or state.failures == 0

    @pytest.mark.asyncio
    async def test_open_breaker_raises_immediately(self):
        _inmem_breakers[(_PROVIDER, str(_TENANT))] = _BreakerState(
            failures=5, opened_at=time.monotonic()
        )
        fn = AsyncMock(return_value="unreachable")
        with patch("app.connectors.retry.settings") as mock_settings:
            mock_settings.REDIS_URL = None
            mock_settings.CONNECTOR_CIRCUIT_BREAKER_COOLDOWN_SEC = 600
            mock_settings.CONNECTOR_CIRCUIT_BREAKER_THRESHOLD = 5
            with pytest.raises(ConnectorCircuitOpenError):
                await call_with_guard(fn, provider=_PROVIDER, tenant_id=_TENANT)
        fn.assert_not_called()

    @pytest.mark.asyncio
    async def test_non_server_connector_error_does_not_record_failure(self):
        """Auth / validation errors bubble up without incrementing breaker."""
        fn = AsyncMock(side_effect=ConnectorError("auth failed"))
        with pytest.raises(ConnectorError):
            await call_with_guard(fn, provider=_PROVIDER, tenant_id=_TENANT)
        state = _inmem_breakers.get((_PROVIDER, str(_TENANT)))
        assert state is None or state.failures == 0
