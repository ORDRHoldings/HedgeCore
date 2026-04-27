"""
tests/test_connector_rate_limiter.py

Unit tests for app/connectors/rate_limiter.py (per-tenant token bucket).
Distinct from test_rate_limiter.py, which covers app.core.rate_limiter
(HTTP request rate limiter middleware).

All tests use the in-memory store (REDIS_URL patched to None).
"""
from __future__ import annotations

import time
import uuid
from unittest.mock import patch

import pytest

from app.connectors.errors import ConnectorRateLimitError
from app.connectors.rate_limiter import (
    Budget,
    PROVIDER_BUDGETS,
    _Bucket,
    _inmem,
    _inmem_take,
    budget_for,
    peek,
    take,
)

_TENANT = uuid.uuid4()
_PROV = "test_provider"


def _seed(provider: str, tokens: float, elapsed_sec: float = 0.0) -> None:
    """Pre-seed the in-memory bucket at a controlled state."""
    _inmem[(provider, str(_TENANT))] = _Bucket(
        tokens=tokens,
        last_refill=time.monotonic() - elapsed_sec,
    )


def _clear(provider: str = _PROV) -> None:
    _inmem.pop((provider, str(_TENANT)), None)


# ──────────────────────────────────────────────────────────────────────────────
# budget_for
# ──────────────────────────────────────────────────────────────────────────────

class TestBudgetFor:
    def test_known_providers_return_budgets(self):
        for p in ("quickbooks", "xero", "netsuite", "sage_intacct", "dynamics365"):
            b = budget_for(p)
            assert isinstance(b, Budget)
            assert b.capacity > 0
            assert b.refill_per_sec > 0

    def test_unknown_provider_returns_default(self):
        b = budget_for("unknown_erp")
        assert b.capacity == 60
        assert b.refill_per_sec == 1

    def test_all_five_providers_present(self):
        assert len(PROVIDER_BUDGETS) == 5

    def test_quickbooks_capacity(self):
        assert budget_for("quickbooks").capacity == 500

    def test_xero_capacity(self):
        assert budget_for("xero").capacity == 60


# ──────────────────────────────────────────────────────────────────────────────
# _inmem_take — token bucket math
# ──────────────────────────────────────────────────────────────────────────────

class TestInmemTake:

    def setup_method(self):
        _clear()

    @pytest.mark.asyncio
    async def test_allowed_when_tokens_available(self):
        b = Budget(capacity=100, refill_per_sec=10)
        _seed(_PROV, tokens=50.0)
        allowed, retry_after, remaining = await _inmem_take(_PROV, _TENANT, 1, b)
        assert allowed is True
        assert retry_after == 0.0
        assert remaining == pytest.approx(49.0, abs=0.5)

    @pytest.mark.asyncio
    async def test_not_allowed_when_empty(self):
        b = Budget(capacity=10, refill_per_sec=1)
        _seed(_PROV, tokens=0.0)
        allowed, retry_after, _ = await _inmem_take(_PROV, _TENANT, 5, b)
        assert allowed is False
        assert retry_after > 0

    @pytest.mark.asyncio
    async def test_tokens_refill_over_elapsed_time(self):
        b = Budget(capacity=100, refill_per_sec=10)
        _seed(_PROV, tokens=0.0, elapsed_sec=2.0)  # 2s elapsed → +20 tokens
        allowed, _, remaining = await _inmem_take(_PROV, _TENANT, 1, b)
        assert allowed is True
        assert remaining >= 17.0  # ~20 refilled - 1 consumed

    @pytest.mark.asyncio
    async def test_capacity_caps_refill(self):
        b = Budget(capacity=5, refill_per_sec=100)
        _seed(_PROV, tokens=0.0, elapsed_sec=10.0)  # would be 1000 tokens, capped at 5
        _, _, remaining = await _inmem_take(_PROV, _TENANT, 1, b)
        assert remaining <= b.capacity

    @pytest.mark.asyncio
    async def test_retry_after_reflects_deficit(self):
        b = Budget(capacity=10, refill_per_sec=1.0)
        _seed(_PROV, tokens=2.0)
        # cost=5, have=2, deficit=3, refill=1/s → retry_after≈3s
        _, retry_after, _ = await _inmem_take(_PROV, _TENANT, 5, b)
        assert 2.5 < retry_after < 3.5


# ──────────────────────────────────────────────────────────────────────────────
# take() — public API
# ──────────────────────────────────────────────────────────────────────────────

class TestTake:

    def setup_method(self):
        _clear("quickbooks")
        _clear("xero")

    @pytest.mark.asyncio
    async def test_returns_remaining_on_success(self):
        _seed("quickbooks", tokens=100.0)
        with patch("app.connectors.rate_limiter.settings") as ms:
            ms.REDIS_URL = None
            remaining = await take(provider="quickbooks", tenant_id=_TENANT, cost=1)
        assert remaining == pytest.approx(99.0, abs=1.0)

    @pytest.mark.asyncio
    async def test_raises_rate_limit_when_exhausted(self):
        _seed("xero", tokens=0.0)
        with patch("app.connectors.rate_limiter.settings") as ms:
            ms.REDIS_URL = None
            with pytest.raises(ConnectorRateLimitError):
                await take(provider="xero", tenant_id=_TENANT, cost=10)

    @pytest.mark.asyncio
    async def test_error_includes_retry_after(self):
        _seed("xero", tokens=0.0)
        with patch("app.connectors.rate_limiter.settings") as ms:
            ms.REDIS_URL = None
            with pytest.raises(ConnectorRateLimitError) as exc_info:
                await take(provider="xero", tenant_id=_TENANT, cost=5)
        assert exc_info.value.retry_after_sec is not None
        assert exc_info.value.retry_after_sec > 0

    @pytest.mark.asyncio
    async def test_fail_open_on_redis_error(self):
        """Redis error → falls through to in-memory; request proceeds."""
        _seed("quickbooks", tokens=200.0)
        with patch("app.connectors.rate_limiter.settings") as ms:
            ms.REDIS_URL = "redis://unreachable"
            with patch(
                "app.connectors.rate_limiter._redis_take",
                side_effect=ConnectionError("Redis down"),
            ):
                remaining = await take(provider="quickbooks", tenant_id=_TENANT)
        assert remaining >= 0

    @pytest.mark.asyncio
    async def test_cost_default_is_one(self):
        _seed("quickbooks", tokens=50.0)
        with patch("app.connectors.rate_limiter.settings") as ms:
            ms.REDIS_URL = None
            r1 = await take(provider="quickbooks", tenant_id=_TENANT)
            r2 = await take(provider="quickbooks", tenant_id=_TENANT)
        assert r1 > r2  # each call consumed one token


# ──────────────────────────────────────────────────────────────────────────────
# peek()
# ──────────────────────────────────────────────────────────────────────────────

class TestPeek:

    def setup_method(self):
        _clear("netsuite")

    @pytest.mark.asyncio
    async def test_returns_capacity_when_bucket_absent(self):
        with patch("app.connectors.rate_limiter.settings") as ms:
            ms.REDIS_URL = None
            remaining = await peek("netsuite", _TENANT)
        assert remaining == pytest.approx(PROVIDER_BUDGETS["netsuite"].capacity)

    @pytest.mark.asyncio
    async def test_returns_current_tokens(self):
        _seed("netsuite", tokens=42.5)
        with patch("app.connectors.rate_limiter.settings") as ms:
            ms.REDIS_URL = None
            remaining = await peek("netsuite", _TENANT)
        assert remaining == pytest.approx(42.5)


# ──────────────────────────────────────────────────────────────────────────────
# webhook_cleanup (isolated import test — no DB needed)
# ──────────────────────────────────────────────────────────────────────────────

class TestWebhookCleanupTask:
    """Smoke test: function is importable and callable with mocked session."""

    @pytest.mark.asyncio
    async def test_cleanup_handles_empty_endpoint_list(self):
        from unittest.mock import AsyncMock, MagicMock
        from app.tasks.webhook_cleanup import cleanup_webhook_delivery_logs

        result_mock = MagicMock()
        result_mock.fetchall.return_value = []  # no endpoints needing pruning
        session_mock = AsyncMock()
        session_mock.execute.return_value = result_mock

        ctx_mock = AsyncMock()
        ctx_mock.__aenter__ = AsyncMock(return_value=session_mock)
        ctx_mock.__aexit__ = AsyncMock(return_value=False)

        # Deferred import inside function body — patch the source module
        with patch("app.core.db.async_session_maker", return_value=ctx_mock):
            await cleanup_webhook_delivery_logs()

    @pytest.mark.asyncio
    async def test_cleanup_logs_error_on_exception(self):
        from unittest.mock import AsyncMock, MagicMock
        from app.tasks.webhook_cleanup import cleanup_webhook_delivery_logs

        # Raise inside the session body (within the try/except block)
        session_mock = AsyncMock()
        session_mock.execute.side_effect = RuntimeError("execute failed")

        ctx_mock = AsyncMock()
        ctx_mock.__aenter__ = AsyncMock(return_value=session_mock)
        ctx_mock.__aexit__ = AsyncMock(return_value=False)

        with patch("app.core.db.async_session_maker", return_value=ctx_mock):
            # Should swallow the exception (caught by the inner try/except)
            await cleanup_webhook_delivery_logs()
