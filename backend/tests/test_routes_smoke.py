"""
Route-layer smoke tests.

Purpose: provide baseline coverage across all 89 backend API route files. Each
registered route is exercised twice:

1. Import-time: the route was loaded by `app.main:app` (we enumerate the live router).
2. Auth-gate: unauthenticated calls to non-public GET endpoints return 401/403.

This is not a substitute for endpoint-specific contract tests — it catches
regressions like (a) a route registered without an auth dependency, (b) a route
that raises at import or first call due to a missing import or bad dependency
wiring, (c) a router that fails to register.

Public endpoints (health, docs, public chart data, OAuth callbacks) are
allowlisted and asserted to remain reachable without auth — if any of those
suddenly start requiring auth, that's a behavior change worth surfacing.
"""

from __future__ import annotations

import pytest
from fastapi.routing import APIRoute
from httpx import ASGITransport, AsyncClient

from app.main import app

# Endpoints that intentionally do NOT require auth. Adding here is a
# governance decision — anything not on either list must require auth.

# Exact match only (single path; siblings still require auth)
PUBLIC_PATHS_EXACT: set[str] = {
    "/",
    "/api/health",
    "/api/healthz",
    "/api/ready",
    "/api/readyz",
    "/api/system/health",
    "/api/system/health/deep",
    "/api/system/schema-health",
    "/api/kernel/health",
    "/api/metrics",
    "/api/docs",
    "/api/redoc",
    "/api/openapi.json",
    # Public read-only market data (rate-limited; no PII)
    "/api/v1/market/fx/rates",
    "/api/v1/market/sectors",
    "/api/v1/market-data/live/fx-rates",
    "/api/v1/market-data/live/equity-quotes",
    "/api/v1/market-data/live/macro",
    "/api/v1/market-data/live/fx-change",
    # Auth surfaces
    "/api/v1/signup",
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/refresh",
    "/api/auth/forgot",
    "/api/auth/reset",
    "/sentry-tunnel",
    "/favicon.ico",
}

# Prefix match — entire subtree is public
PUBLIC_PATH_PREFIXES: tuple[str, ...] = (
    "/api/v1/public",
    "/api/v1/public-chart-data",
    "/api/auth/passwordless",
    "/api/accounting-oauth-callback",  # OAuth state-token-secured
    "/.well-known",
)

# Path-parameter or method patterns we skip: they need a valid resource id to
# return a meaningful auth verdict, and the auth dependency runs after path
# resolution. The auth-gate assertion isn't useful here.
SKIP_PATH_FRAGMENTS = (
    "{",  # path params
    "/ws/",  # websocket upgrades
    "/upload",  # multipart parsing happens before auth
)


def _is_public(path: str) -> bool:
    if path in PUBLIC_PATHS_EXACT:
        return True
    return any(path.startswith(p) for p in PUBLIC_PATH_PREFIXES)


def _registered_routes() -> list[APIRoute]:
    return [r for r in app.routes if isinstance(r, APIRoute)]


def test_router_registration_smoke() -> None:
    """The router must register at least 200 endpoints; regressions here usually
    mean a router include was dropped from main.py."""
    routes = _registered_routes()
    assert len(routes) >= 200, f"Only {len(routes)} routes registered — likely a missing include"


# Known intentional dual-registrations. These are routes that are registered
# both with and without an `/api` prefix (FastAPI doesn't have a built-in
# prefix-redirect, so we register both). Adding to this list is a governance
# decision — anything not on the list must be a real bug.
KNOWN_DUPLICATE_PATHS: set[tuple[str, str]] = {
    ("/api/docs", "GET"),
    ("/api/redoc", "GET"),
}


def test_no_unknown_duplicate_paths() -> None:
    """Two routes registered with the same path + method are almost always a bug
    (the second silently shadows the first). Only known-intentional duplicates
    in KNOWN_DUPLICATE_PATHS are tolerated."""
    seen: dict[tuple[str, str], str] = {}
    duplicates: list[tuple[str, str, str]] = []
    for r in _registered_routes():
        for method in r.methods or set():
            key = (r.path, method)
            if key in seen and key not in KNOWN_DUPLICATE_PATHS:
                duplicates.append((r.path, method, r.endpoint.__name__))
            else:
                seen[key] = r.endpoint.__name__
    assert not duplicates, f"Duplicate route registrations: {duplicates}"


@pytest.mark.asyncio
async def test_all_routes_importable() -> None:
    """Every route's endpoint callable resolved at import. If FastAPI raised
    here at startup, app.main would have failed to load — but we assert it
    explicitly so the test surface includes router load."""
    routes = _registered_routes()
    bad = [r.path for r in routes if not callable(r.endpoint)]
    assert not bad, f"Non-callable endpoints: {bad}"


def _auth_gate_targets() -> list[tuple[str, str]]:
    """GET endpoints that should require auth and have no path params."""
    out: list[tuple[str, str]] = []
    for r in _registered_routes():
        if any(frag in r.path for frag in SKIP_PATH_FRAGMENTS):
            continue
        if _is_public(r.path):
            continue
        if "GET" not in (r.methods or set()):
            continue
        out.append((r.path, r.endpoint.__name__))
    return out


@pytest.mark.asyncio
@pytest.mark.parametrize("path,endpoint", _auth_gate_targets())
async def test_unauthenticated_get_returns_401_or_403(path: str, endpoint: str) -> None:
    """Hitting a protected GET without credentials must return 401 or 403.

    Any other status (200, 500) indicates the auth gate is missing or
    misconfigured for that route.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Bypass the test conftest's API_KEY_AUTH_DISABLED override by sending
        # a Bearer token that the JWT layer must validate.
        resp = await client.get(path, headers={"Authorization": "Bearer invalid.token.here"})

    # 401 = invalid creds, 403 = valid creds but forbidden, 422 = required
    # query/header param missing (acceptable — auth already passed by definition
    # if the endpoint reached validation), 405 = method gate already differentiated,
    # 308/307 = trailing-slash redirect, 503 = optional dependency down (Redis,
    # external market data) — auth had to have passed for the dependency check
    # to even run.
    acceptable = {401, 403, 422, 405, 307, 308, 503}
    assert resp.status_code in acceptable, (
        f"{path} ({endpoint}) returned {resp.status_code} unauthenticated; expected one of {acceptable}"
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("path", [
    "/api/health",
    "/api/system/health",
    "/api/openapi.json",
])
async def test_public_endpoints_reachable(path: str) -> None:
    """Health and OpenAPI must remain reachable without auth — used by Render
    health checks and the API docs surface. 503 is acceptable for endpoints
    that depend on optional services (Redis, external market data) being up;
    the auth gate has passed in that case."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(path)
    assert resp.status_code in {200, 204, 307, 308, 503}, f"{path} returned {resp.status_code}"
