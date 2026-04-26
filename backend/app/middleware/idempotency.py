"""
app/middleware/idempotency.py

Idempotency-Key middleware (audit P0-2).

Mutating requests (POST/PUT/PATCH/DELETE) that include an `Idempotency-Key`
header get their response cached, scoped per-principal, for 24h. A retry of
the same request returns the cached response byte-for-byte — no double-create,
no double-approve, no double-charge.

Storage: Redis (preferred) with in-process LRU fallback. Fail-open: if both
backends are unavailable the middleware passes the request through with no
caching, matching the convention used elsewhere in the platform.

OpenAPI: the header is declared as a parameter on every mutating operation
via a custom_openapi hook (see app/main.py custom_openapi).
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from collections import OrderedDict
from typing import Any

from starlette.responses import Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

_log = logging.getLogger("hedgecalc.idempotency")

# Header names — accept both the RFC convention and the X-prefixed variant
# already echoed by AuditHeadersMiddleware.
_HEADERS = ("idempotency-key", "x-idempotency-key")

_MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# 24h TTL per the integration guide.
_TTL_SECONDS = 24 * 60 * 60

# Hard cap on cached payload size — avoids storing large file uploads.
_MAX_BODY_BYTES = 256 * 1024  # 256 KiB

# In-memory fallback bound — protects the worker from runaway growth when
# Redis is offline. Oldest entries evict first.
_FALLBACK_MAX_ENTRIES = 1024


class _InMemoryStore:
    """Bounded LRU with TTL — used only when Redis is unavailable."""

    def __init__(self, max_entries: int = _FALLBACK_MAX_ENTRIES) -> None:
        self._data: OrderedDict[str, tuple[float, bytes]] = OrderedDict()
        self._max = max_entries
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> bytes | None:
        async with self._lock:
            entry = self._data.get(key)
            if entry is None:
                return None
            expires_at, payload = entry
            if expires_at < time.time():
                del self._data[key]
                return None
            self._data.move_to_end(key)
            return payload

    async def set(self, key: str, value: bytes, ttl: int) -> None:
        async with self._lock:
            self._data[key] = (time.time() + ttl, value)
            self._data.move_to_end(key)
            while len(self._data) > self._max:
                self._data.popitem(last=False)


_fallback_store = _InMemoryStore()


def _principal_salt(scope: Scope) -> str:
    """Stable per-caller hash component.

    Uses the bearer token (or API key) directly — same caller, same token →
    same salt. We don't need to decode the JWT; the token bytes are already a
    stable identifier within their validity window.
    """
    headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}
    auth = headers.get("authorization") or headers.get("x-api-key") or ""
    if auth.lower().startswith("bearer "):
        auth = auth[7:]
    return hashlib.sha256(auth.encode("utf-8")).hexdigest()[:16] if auth else "anon"


def _cache_key(scope: Scope, header_value: str) -> str:
    """sha256(principal + method + path + idempotency-key) — collision-safe."""
    method = scope.get("method", "")
    path = scope.get("path", "")
    salt = _principal_salt(scope)
    return "idempotency:" + hashlib.sha256(
        f"{salt}|{method}|{path}|{header_value}".encode()
    ).hexdigest()


def _read_idempotency_header(scope: Scope) -> str | None:
    for k, v in scope.get("headers", []):
        name = k.decode("latin-1").lower()
        if name in _HEADERS:
            value = v.decode("latin-1").strip()
            if value:
                return value
    return None


class IdempotencyMiddleware:
    """ASGI middleware enforcing Idempotency-Key replay safety.

    Sits in the chain after auth so the principal is identifiable from the
    Authorization header (we use the token bytes directly — no DI needed).
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "")
        if method not in _MUTATING_METHODS:
            await self.app(scope, receive, send)
            return

        header_value = _read_idempotency_header(scope)
        if not header_value:
            await self.app(scope, receive, send)
            return

        cache_key = _cache_key(scope, header_value)
        cached = await _store_get(cache_key)
        if cached is not None:
            try:
                envelope = json.loads(cached)
                response = Response(
                    content=bytes.fromhex(envelope["body_hex"]),
                    status_code=envelope["status"],
                    headers={**envelope.get("headers", {}), "Idempotency-Replayed": "true"},
                    media_type=envelope.get("media_type"),
                )
                await response(scope, receive, send)
                return
            except Exception as exc:  # pragma: no cover — corrupt cache → fall through
                _log.warning("idempotency cache parse error: %s — falling through", exc)

        # Buffer the response so we can both forward it and cache it.
        buffer: dict[str, Any] = {"status": 200, "headers": [], "body": b"", "started": False}

        async def buffering_send(message: Message) -> None:
            if message["type"] == "http.response.start":
                buffer["status"] = message["status"]
                buffer["headers"] = list(message.get("headers", []))
                buffer["started"] = True
            elif message["type"] == "http.response.body":
                buffer["body"] += message.get("body", b"")
            await send(message)

        await self.app(scope, receive, buffering_send)

        if not buffer["started"] or buffer["status"] >= 500:
            return  # don't cache server errors — caller should retry naturally
        if len(buffer["body"]) > _MAX_BODY_BYTES:
            return

        headers_dict: dict[str, str] = {}
        media_type: str | None = None
        for k, v in buffer["headers"]:
            name = k.decode("latin-1").lower()
            value = v.decode("latin-1")
            if name == "content-type":
                media_type = value
            elif name in ("content-length", "content-encoding"):
                continue  # let Starlette recompute on replay
            else:
                headers_dict[name] = value

        envelope = {
            "status": buffer["status"],
            "headers": headers_dict,
            "media_type": media_type,
            "body_hex": buffer["body"].hex(),
        }
        await _store_set(cache_key, json.dumps(envelope).encode("utf-8"), _TTL_SECONDS)


async def _store_get(key: str) -> bytes | None:
    """Try Redis first (fail-open), then in-process fallback."""
    redis = _get_redis()
    if redis is not None:
        try:
            return await redis.get(key)
        except Exception as exc:
            _log.warning("idempotency redis get failed: %s — using fallback", exc)
    return await _fallback_store.get(key)


async def _store_set(key: str, value: bytes, ttl: int) -> None:
    redis = _get_redis()
    if redis is not None:
        try:
            await redis.setex(key, ttl, value)
            return
        except Exception as exc:
            _log.warning("idempotency redis set failed: %s — using fallback", exc)
    await _fallback_store.set(key, value, ttl)


def _get_redis():
    """Late-bound Redis lookup — module is initialised after middleware mounts."""
    try:
        from app.core.redis_client import get_redis_client
        return get_redis_client()
    except Exception:
        return None


__all__ = ["IdempotencyMiddleware"]
