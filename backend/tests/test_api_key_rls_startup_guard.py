"""Tests for the RISK-AUTH-RLS-01 startup guard in app.deps.api_key_auth.

The guard walks every APIRoute's dependant tree for `get_api_key_principal`
and raises RuntimeError if any occurrence appears on a path not in
API_KEY_AUTH_ALLOWLIST. See `.claude/state/OPEN_RISKS.md` RISK-AUTH-RLS-01.
"""
from __future__ import annotations

import pytest
from fastapi import Depends, FastAPI

from app.deps.api_key_auth import (
    API_KEY_AUTH_ALLOWLIST,
    ServicePrincipal,
    assert_api_key_routes_safe,
    get_api_key_principal,
    require_api_key_scopes,
)


def _make_app():
    return FastAPI()


def test_app_with_no_api_key_routes_passes():
    app = _make_app()

    @app.get("/public")
    async def public():
        return {}

    assert_api_key_routes_safe(app)


def test_direct_api_key_dep_on_unlisted_path_raises():
    app = _make_app()

    @app.get("/business/positions")
    async def business(_p: ServicePrincipal = Depends(get_api_key_principal)):
        return {}

    with pytest.raises(RuntimeError) as excinfo:
        assert_api_key_routes_safe(app)
    assert "/business/positions" in str(excinfo.value)
    assert "RISK-AUTH-RLS-01" in str(excinfo.value)


def test_scoped_api_key_dep_on_unlisted_path_raises():
    app = _make_app()
    scoped = require_api_key_scopes(["read:positions"])

    @app.get("/business/runs")
    async def business(_p: ServicePrincipal = Depends(scoped)):
        return {}

    with pytest.raises(RuntimeError) as excinfo:
        assert_api_key_routes_safe(app)
    assert "/business/runs" in str(excinfo.value)


def test_explicit_allowlist_extension_passes():
    app = _make_app()

    @app.get("/diagnostics/key")
    async def diag(_p: ServicePrincipal = Depends(get_api_key_principal)):
        return {}

    custom_allowlist = frozenset({"/diagnostics/key"})
    assert_api_key_routes_safe(app, allowlist=custom_allowlist)


def test_canonical_system_paths_in_default_allowlist():
    """Lock the canonical safe paths into a regression test so accidental
    renames in app/api/routes/system.py surface immediately."""
    assert "/api/system/whoami/api-key" in API_KEY_AUTH_ALLOWLIST
    assert "/api/system/db-tables" in API_KEY_AUTH_ALLOWLIST


def test_real_main_app_passes_guard():
    """End-to-end: the actual production FastAPI app must pass its own guard
    with the shipped allowlist — otherwise startup would fail closed."""
    from app.main import app

    assert_api_key_routes_safe(app)


def test_violation_message_includes_methods():
    app = _make_app()

    @app.post("/positions/{pid}/hedge")
    async def hedge(pid: str, _p: ServicePrincipal = Depends(get_api_key_principal)):
        return {}

    with pytest.raises(RuntimeError) as excinfo:
        assert_api_key_routes_safe(app)
    msg = str(excinfo.value)
    assert "/positions/{pid}/hedge" in msg
    assert "POST" in msg
