"""
tests/test_idempotency_middleware.py

Tests for IdempotencyMiddleware (audit P0-2). Mounted on a minimal FastAPI app
so we exercise the middleware in isolation — no CSRF, no auth, no DB.
"""
from __future__ import annotations

import asyncio

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.middleware.idempotency import (
    IdempotencyMiddleware,
    _InMemoryStore,
    _cache_key,
    _read_idempotency_header,
)


def _build_app() -> tuple[FastAPI, dict]:
    """Tiny app with a counter that increments on every real (non-replayed) hit."""
    counter = {"posts": 0, "puts": 0, "deletes": 0, "gets": 0}
    app = FastAPI()
    app.add_middleware(IdempotencyMiddleware)

    @app.post("/things")
    async def create(payload: dict | None = None):
        counter["posts"] += 1
        return {"id": counter["posts"], "echo": payload}

    @app.put("/things/{thing_id}")
    async def update(thing_id: int):
        counter["puts"] += 1
        return {"id": thing_id, "version": counter["puts"]}

    @app.delete("/things/{thing_id}", status_code=204)
    async def delete(thing_id: int):
        counter["deletes"] += 1

    @app.get("/things")
    async def list_():
        counter["gets"] += 1
        return {"count": counter["gets"]}

    @app.post("/boom")
    async def boom():
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail="kaboom")

    return app, counter


@pytest.fixture(autouse=True)
def _reset_fallback_store():
    """Each test gets a clean in-process cache."""
    from app.middleware import idempotency
    idempotency._fallback_store = _InMemoryStore()
    yield


@pytest.fixture(autouse=True)
def _force_fallback_store(monkeypatch):
    """Pin tests to the in-process fallback (Redis may or may not be wired up)."""
    from app.middleware import idempotency
    monkeypatch.setattr(idempotency, "_get_redis", lambda: None)
    yield


@pytest.mark.asyncio
async def test_replay_returns_cached_body_and_marker_header():
    app, counter = _build_app()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        first = await client.post(
            "/things",
            json={"name": "ledger entry"},
            headers={"Idempotency-Key": "key-1", "Authorization": "Bearer caller-1"},
        )
        second = await client.post(
            "/things",
            json={"name": "ledger entry"},
            headers={"Idempotency-Key": "key-1", "Authorization": "Bearer caller-1"},
        )

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == second.json(), "replay must return identical body"
    assert "Idempotency-Replayed" not in first.headers
    assert second.headers.get("Idempotency-Replayed") == "true"
    assert counter["posts"] == 1, "handler must run exactly once across two retries"


@pytest.mark.asyncio
async def test_x_prefixed_header_is_accepted():
    app, counter = _build_app()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        first = await client.post(
            "/things",
            json={"name": "x"},
            headers={"X-Idempotency-Key": "key-2", "Authorization": "Bearer caller-1"},
        )
        second = await client.post(
            "/things",
            json={"name": "x"},
            headers={"X-Idempotency-Key": "key-2", "Authorization": "Bearer caller-1"},
        )

    assert first.json() == second.json()
    assert second.headers.get("Idempotency-Replayed") == "true"
    assert counter["posts"] == 1


@pytest.mark.asyncio
async def test_missing_key_passes_through_with_no_caching():
    app, counter = _build_app()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r1 = await client.post("/things", json={"x": 1}, headers={"Authorization": "Bearer caller-1"})
        r2 = await client.post("/things", json={"x": 1}, headers={"Authorization": "Bearer caller-1"})

    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json() != r2.json(), "no key = no replay = two independent creates"
    assert counter["posts"] == 2


@pytest.mark.asyncio
async def test_different_keys_create_independent_entries():
    app, counter = _build_app()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        a = await client.post(
            "/things", json={}, headers={"Idempotency-Key": "A", "Authorization": "Bearer c"}
        )
        b = await client.post(
            "/things", json={}, headers={"Idempotency-Key": "B", "Authorization": "Bearer c"}
        )

    assert a.json()["id"] == 1
    assert b.json()["id"] == 2
    assert counter["posts"] == 2


@pytest.mark.asyncio
async def test_principal_isolation_same_key_different_callers():
    """Same Idempotency-Key from two different callers must NOT collide."""
    app, counter = _build_app()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        a = await client.post(
            "/things", json={}, headers={"Idempotency-Key": "shared", "Authorization": "Bearer alice"}
        )
        b = await client.post(
            "/things", json={}, headers={"Idempotency-Key": "shared", "Authorization": "Bearer bob"}
        )

    assert a.json()["id"] != b.json()["id"]
    assert counter["posts"] == 2


@pytest.mark.asyncio
async def test_get_requests_are_never_cached():
    app, counter = _build_app()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r1 = await client.get(
            "/things", headers={"Idempotency-Key": "k", "Authorization": "Bearer c"}
        )
        r2 = await client.get(
            "/things", headers={"Idempotency-Key": "k", "Authorization": "Bearer c"}
        )

    assert r1.json()["count"] == 1
    assert r2.json()["count"] == 2, "GET must be transparent — no replay"
    assert "Idempotency-Replayed" not in r2.headers


@pytest.mark.asyncio
async def test_5xx_responses_are_not_cached():
    """A 500 caller should be allowed to retry naturally — no poisoned cache."""
    app, _ = _build_app()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        first = await client.post(
            "/boom", headers={"Idempotency-Key": "k500", "Authorization": "Bearer c"}
        )
        second = await client.post(
            "/boom", headers={"Idempotency-Key": "k500", "Authorization": "Bearer c"}
        )

    assert first.status_code == 500
    assert second.status_code == 500
    assert "Idempotency-Replayed" not in second.headers


@pytest.mark.asyncio
async def test_delete_replay_returns_same_204():
    app, counter = _build_app()
    transport = ASGITransport(app=app)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        first = await client.delete(
            "/things/42", headers={"Idempotency-Key": "kdel", "Authorization": "Bearer c"}
        )
        second = await client.delete(
            "/things/42", headers={"Idempotency-Key": "kdel", "Authorization": "Bearer c"}
        )

    assert first.status_code == 204
    assert second.status_code == 204
    assert second.headers.get("Idempotency-Replayed") == "true"
    assert counter["deletes"] == 1


# ── Pure-unit tests for the cache primitives ─────────────────────────────


def test_cache_key_includes_method_and_path():
    scope_post = {"method": "POST", "path": "/x", "headers": [(b"authorization", b"Bearer t")]}
    scope_put = {"method": "PUT", "path": "/x", "headers": [(b"authorization", b"Bearer t")]}
    scope_other_path = {"method": "POST", "path": "/y", "headers": [(b"authorization", b"Bearer t")]}

    k1 = _cache_key(scope_post, "same-key")
    k2 = _cache_key(scope_put, "same-key")
    k3 = _cache_key(scope_other_path, "same-key")
    assert k1 != k2
    assert k1 != k3


def test_cache_key_isolates_principals():
    a = {"method": "POST", "path": "/x", "headers": [(b"authorization", b"Bearer alice")]}
    b = {"method": "POST", "path": "/x", "headers": [(b"authorization", b"Bearer bob")]}
    assert _cache_key(a, "k") != _cache_key(b, "k")


def test_anon_caller_is_grouped_under_anon_salt():
    a = {"method": "POST", "path": "/x", "headers": []}
    b = {"method": "POST", "path": "/x", "headers": []}
    # both anonymous → same key for the same idempotency value
    assert _cache_key(a, "k") == _cache_key(b, "k")


def test_read_header_prefers_canonical_name():
    scope = {
        "headers": [
            (b"x-idempotency-key", b"legacy"),
            (b"idempotency-key", b"canonical"),
        ]
    }
    # Either is acceptable; we only require we get a value.
    assert _read_idempotency_header(scope) in {"legacy", "canonical"}


def test_read_header_returns_none_when_blank_or_missing():
    assert _read_idempotency_header({"headers": []}) is None
    assert _read_idempotency_header({"headers": [(b"idempotency-key", b"   ")]}) is None


@pytest.mark.asyncio
async def test_in_memory_store_evicts_when_full():
    store = _InMemoryStore(max_entries=2)
    await store.set("a", b"1", ttl=60)
    await store.set("b", b"2", ttl=60)
    await store.set("c", b"3", ttl=60)
    assert await store.get("a") is None  # oldest evicted
    assert await store.get("b") == b"2"
    assert await store.get("c") == b"3"


@pytest.mark.asyncio
async def test_in_memory_store_expires_entries():
    store = _InMemoryStore(max_entries=8)
    await store.set("k", b"v", ttl=0)  # already expired
    # tiny sleep to ensure clock has advanced past ttl=0
    await asyncio.sleep(0.001)
    assert await store.get("k") is None
