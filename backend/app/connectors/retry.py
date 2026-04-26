"""
Retry / backoff / circuit breaker for connector outbound calls.

Three primitives, independent but composable:

1. `retry(...)`         — exponential backoff with jitter for transient errors.
2. `CircuitBreaker`     — per-tenant+provider state machine (closed/open/half-open).
3. `call_with_guard(...)` — high-level wrapper used by connector adapters: opens
                             the breaker after N consecutive 5xx, short-circuits
                             while open, emits a Sentry breadcrumb on trip.

Storage: Redis when REDIS_URL is set (durable across pods), else in-memory
(single-process, acceptable for dev). Fail-open on Redis errors — a broken
breaker store must never block traffic.

Rationale: the platform must remain deterministic under provider flapping.
A single 503 burst from QBO should not cascade into 1000 failed journal posts;
the breaker trips, callers get `ConnectorCircuitOpenError` fast, and the
scheduler retries after the cooldown window.
"""
from __future__ import annotations

import asyncio
import logging
import random
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import TypeVar
from uuid import UUID

from app.connectors.errors import (
    ConnectorCircuitOpenError,
    ConnectorError,
    ConnectorRateLimitError,
    ConnectorServerError,
)
from app.core.config import settings

log = logging.getLogger(__name__)

T = TypeVar("T")


# ═════════════════════════════════════════════════════════════════════════════
# Exponential backoff with jitter
# ═════════════════════════════════════════════════════════════════════════════


async def retry(  # noqa: UP047 — TypeVar style; PEP 695 requires 3.12 syntax not yet adopted project-wide
    fn: Callable[[], Awaitable[T]],
    *,
    max_attempts: int = 4,
    base_delay_sec: float = 0.25,
    max_delay_sec: float = 8.0,
    retry_on: tuple[type[BaseException], ...] = (ConnectorServerError,),
) -> T:
    """Run `fn` with exponential backoff + full jitter.

    Retries only on the specified exception types. Non-retryable errors
    (auth, validation) bubble up immediately. `ConnectorRateLimitError` is
    NOT retried here — the caller should honour `retry_after_sec` explicitly.
    """
    last_exc: BaseException | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            return await fn()
        except retry_on as exc:
            last_exc = exc
            if attempt == max_attempts:
                break
            # full jitter: sleep ∈ [0, min(cap, base * 2^(n-1))]
            cap = min(max_delay_sec, base_delay_sec * (2 ** (attempt - 1)))
            delay = random.uniform(0, cap)
            log.warning(
                "connector.retry attempt=%d/%d delay=%.2fs err=%s",
                attempt, max_attempts, delay, exc,
            )
            await asyncio.sleep(delay)
    assert last_exc is not None
    raise last_exc


# ═════════════════════════════════════════════════════════════════════════════
# Circuit breaker state
# ═════════════════════════════════════════════════════════════════════════════


@dataclass
class _BreakerState:
    failures: int = 0
    opened_at: float | None = None  # monotonic seconds when opened; None if closed

    def is_open(self, cooldown_sec: int) -> tuple[bool, float]:
        """Return (open, seconds_remaining). Transitions open→closed when cooldown elapses."""
        if self.opened_at is None:
            return False, 0.0
        remaining = cooldown_sec - (time.monotonic() - self.opened_at)
        if remaining <= 0:
            # Cooldown elapsed — let the next call through (half-open probe).
            return False, 0.0
        return True, remaining


# In-memory fallback (single process). Redis-backed below when available.
_inmem_breakers: dict[tuple[str, str], _BreakerState] = {}
_inmem_lock = asyncio.Lock()


_REDIS_PREFIX = "connector:breaker:"


def _breaker_key(provider: str, tenant_id: UUID) -> str:
    return f"{_REDIS_PREFIX}{provider}:{tenant_id}"


async def _load_state(provider: str, tenant_id: UUID) -> _BreakerState:
    """Read breaker state. Redis first, in-memory fallback. Never raises."""
    if settings.REDIS_URL:
        try:
            import redis.asyncio as aioredis  # type: ignore[import]
            client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            try:
                raw = await client.hgetall(_breaker_key(provider, tenant_id))
                if not raw:
                    return _BreakerState()
                opened_raw = raw.get("opened_at")
                return _BreakerState(
                    failures=int(raw.get("failures") or 0),
                    opened_at=float(opened_raw) if opened_raw else None,
                )
            finally:
                try:
                    await client.aclose()
                except Exception:
                    pass
        except Exception:
            pass  # fall through to in-memory

    async with _inmem_lock:
        return _inmem_breakers.get((provider, str(tenant_id)), _BreakerState())


async def _save_state(provider: str, tenant_id: UUID, state: _BreakerState) -> None:
    """Write breaker state. Redis first, in-memory fallback. Never raises."""
    if settings.REDIS_URL:
        try:
            import redis.asyncio as aioredis  # type: ignore[import]
            client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            try:
                key = _breaker_key(provider, tenant_id)
                mapping = {"failures": str(state.failures)}
                if state.opened_at is not None:
                    mapping["opened_at"] = str(state.opened_at)
                else:
                    # remove opened_at if previously set
                    await client.hdel(key, "opened_at")
                await client.hset(key, mapping=mapping)
                await client.expire(key, 24 * 3600)
                return
            finally:
                try:
                    await client.aclose()
                except Exception:
                    pass
        except Exception:
            pass  # fall through to in-memory

    async with _inmem_lock:
        _inmem_breakers[(provider, str(tenant_id))] = state


# ═════════════════════════════════════════════════════════════════════════════
# Public API — call_with_guard
# ═════════════════════════════════════════════════════════════════════════════


async def check_breaker(provider: str, tenant_id: UUID) -> None:
    """Raise ConnectorCircuitOpenError if breaker is open. No state mutation."""
    state = await _load_state(provider, tenant_id)
    is_open, remaining = state.is_open(settings.CONNECTOR_CIRCUIT_BREAKER_COOLDOWN_SEC)
    if is_open:
        raise ConnectorCircuitOpenError(
            f"Circuit open for {provider} (tenant={tenant_id}). Retry in {remaining:.0f}s.",
            cooldown_remaining_sec=remaining,
            provider=provider,
        )


async def record_success(provider: str, tenant_id: UUID) -> None:
    """Reset failure counter and close breaker on successful call."""
    state = await _load_state(provider, tenant_id)
    if state.failures == 0 and state.opened_at is None:
        return  # nothing to update
    await _save_state(provider, tenant_id, _BreakerState(failures=0, opened_at=None))


async def record_failure(provider: str, tenant_id: UUID) -> None:
    """Increment failure counter. Trip the breaker at threshold."""
    state = await _load_state(provider, tenant_id)
    state.failures += 1
    threshold = settings.CONNECTOR_CIRCUIT_BREAKER_THRESHOLD
    if state.failures >= threshold and state.opened_at is None:
        state.opened_at = time.monotonic()
        log.error(
            "connector.circuit_open provider=%s tenant=%s failures=%d",
            provider, tenant_id, state.failures,
        )
        _emit_sentry_breaker_trip(provider, tenant_id, state.failures)
    await _save_state(provider, tenant_id, state)


async def call_with_guard(  # noqa: UP047 — TypeVar style; PEP 695 requires 3.12 syntax not yet adopted project-wide
    fn: Callable[[], Awaitable[T]],
    *,
    provider: str,
    tenant_id: UUID,
) -> T:
    """Wrap a provider call with breaker check + retry + failure counting.

    - Pre-check: raise ConnectorCircuitOpenError if breaker is open.
    - Execute with exponential backoff on ConnectorServerError (transient 5xx).
    - On success: reset failure counter (closes half-open breaker).
    - On ConnectorServerError after all retries: increment failure counter,
      which trips the breaker at the configured threshold.
    - On ConnectorRateLimitError: do NOT trip the breaker (429 ≠ outage).
    - On ConnectorAuthError / Validation / Webhook: bubble up, no breaker impact.
    """
    await check_breaker(provider, tenant_id)

    try:
        result = await retry(fn, retry_on=(ConnectorServerError,))
    except ConnectorServerError:
        await record_failure(provider, tenant_id)
        raise
    except ConnectorRateLimitError:
        raise  # rate limit ≠ outage
    except ConnectorError:
        raise  # non-retryable; do not count against breaker
    else:
        await record_success(provider, tenant_id)
        return result


# ═════════════════════════════════════════════════════════════════════════════
# Sentry integration (optional, best-effort)
# ═════════════════════════════════════════════════════════════════════════════


def _emit_sentry_breaker_trip(provider: str, tenant_id: UUID, failures: int) -> None:
    """Report breaker trip to Sentry if configured. Never raises."""
    try:
        import sentry_sdk  # type: ignore[import]
        sentry_sdk.capture_message(
            f"Connector circuit breaker tripped: {provider}",
            level="error",
            scope=None,
        )
        sentry_sdk.set_tag("connector.provider", provider)
        sentry_sdk.set_tag("connector.tenant_id", str(tenant_id))
        sentry_sdk.set_extra("consecutive_failures", failures)
    except Exception:
        pass
