"""Tests for the RISK-AUTH-RLS-02 companion guard in app.core.dependencies.

The guard walks every APIRoute and asserts that each one either has
`get_current_user` or `get_api_key_principal` in its dependant tree, or is
explicitly listed in `NO_AUTH_ROUTE_ALLOWLIST`. This pins the structural
defense that would have caught the dashboard `_resolve_user` regression at
startup. See `.claude/state/OPEN_RISKS.md` RISK-AUTH-RLS-02.
"""
from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite://")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-ci-at-least-32-chars-long")

import pytest
from fastapi import Depends, FastAPI

from app.core.dependencies import (
    NO_AUTH_ROUTE_ALLOWLIST,
    assert_routes_have_canonical_auth,
    get_current_user,
)
from app.deps.api_key_auth import (
    ServicePrincipal,
    get_api_key_principal,
    require_api_key_scopes,
)


def _make_app():
    return FastAPI()


def test_empty_app_passes():
    app = _make_app()
    assert_routes_have_canonical_auth(app)


def test_route_with_get_current_user_passes():
    app = _make_app()

    @app.get("/protected")
    async def protected(user=Depends(get_current_user)):
        return {}

    assert_routes_have_canonical_auth(app)


def test_route_with_api_key_principal_passes():
    app = _make_app()

    @app.get("/api/system/whoami/api-key")
    async def whoami(_p: ServicePrincipal = Depends(get_api_key_principal)):
        return {}

    # API-key allowlist on the RLS-01 guard is orthogonal — this guard only
    # cares that *some* canonical auth dep is present.
    assert_routes_have_canonical_auth(app)


def test_route_with_scoped_api_key_passes():
    app = _make_app()
    scoped = require_api_key_scopes(["read:positions"])

    @app.get("/api/system/db-tables")
    async def db_tables(_p: ServicePrincipal = Depends(scoped)):
        return {}

    assert_routes_have_canonical_auth(app)


def test_unauthenticated_route_outside_allowlist_raises():
    app = _make_app()

    @app.get("/business/secrets")
    async def secrets():
        return {}

    with pytest.raises(RuntimeError) as excinfo:
        assert_routes_have_canonical_auth(app)
    msg = str(excinfo.value)
    assert "/business/secrets" in msg
    assert "RISK-AUTH-RLS-02" in msg
    assert "NO_AUTH_ROUTE_ALLOWLIST" in msg


def test_unauthenticated_route_in_explicit_allowlist_passes():
    app = _make_app()

    @app.get("/business/secrets")
    async def secrets():
        return {}

    custom = frozenset({"/business/secrets"})
    assert_routes_have_canonical_auth(app, allowlist=custom)


def test_violation_message_includes_methods():
    app = _make_app()

    @app.post("/orders/{oid}/cancel")
    async def cancel(oid: str):
        return {}

    with pytest.raises(RuntimeError) as excinfo:
        assert_routes_have_canonical_auth(app)
    msg = str(excinfo.value)
    assert "/orders/{oid}/cancel" in msg
    assert "POST" in msg


def test_canonical_paths_in_default_allowlist():
    """Pin a handful of canonical no-auth-needed paths so accidental renames
    in router definitions surface immediately."""
    expected = {
        "/",
        "/api/health",
        "/api/auth/login",
        "/api/v1/billing/webhook",
        "/api/v1/dashboard/summary",  # tracked as deferred refactor
    }
    assert expected.issubset(NO_AUTH_ROUTE_ALLOWLIST), (
        f"Missing canonical paths from NO_AUTH_ROUTE_ALLOWLIST: "
        f"{expected - NO_AUTH_ROUTE_ALLOWLIST}"
    )


def test_real_main_app_passes_guard():
    """End-to-end: the production FastAPI app must pass its own guard with
    the shipped allowlist — otherwise lifespan would refuse to start."""
    from app.main import app

    assert_routes_have_canonical_auth(app)
