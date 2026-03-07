"""
backend/tests/test_auth_cookies.py
httpOnly cookie auth flow — structural tests (no DB required).
"""

from __future__ import annotations

import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


class TestRtCookieSecurity:
    """Verify rt cookie security attributes are correct per environment."""

    def test_cookie_path_matches_refresh_endpoint(self):
        """rt cookie path must match the actual refresh endpoint path."""
        import importlib
        import app.api.routes.auth as auth_module
        importlib.reload(auth_module)
        # Path must be /api/auth/refresh (not /api/v1/auth/refresh)
        assert auth_module._RT_COOKIE_PATH == "/api/auth/refresh"

    def test_secure_false_in_dev(self, monkeypatch):
        """secure=False in dev/test so localhost HTTP works."""
        monkeypatch.setenv("ENV", "dev")
        import importlib
        import app.api.routes.auth as auth_module
        importlib.reload(auth_module)
        assert auth_module._RT_COOKIE_SECURE is False

    def test_secure_true_in_production(self, monkeypatch):
        """secure=True in production for HTTPS enforcement."""
        monkeypatch.setenv("ENV", "production")
        import importlib
        import app.api.routes.auth as auth_module
        importlib.reload(auth_module)
        assert auth_module._RT_COOKIE_SECURE is True

    def test_samesite_lax_in_dev(self, monkeypatch):
        """samesite=lax in dev for easier localhost cross-port testing."""
        monkeypatch.setenv("ENV", "dev")
        import importlib
        import app.api.routes.auth as auth_module
        importlib.reload(auth_module)
        assert auth_module._RT_COOKIE_SAMESITE == "lax"

    def test_samesite_strict_in_production(self, monkeypatch):
        """samesite=strict in production for CSRF protection."""
        monkeypatch.setenv("ENV", "production")
        import importlib
        import app.api.routes.auth as auth_module
        importlib.reload(auth_module)
        assert auth_module._RT_COOKIE_SAMESITE == "strict"


@pytest.mark.requires_postgres
class TestCorsConfig:
    """Verify CORS settings allow credentials with explicit origins."""

    def test_cors_allow_credentials_is_true(self):
        """allow_credentials must be True for httpOnly cookie flow."""
        import importlib
        import app.core.config as cfg_module
        importlib.reload(cfg_module)
        assert cfg_module.settings.CORS_ALLOW_CREDENTIALS is True

    def test_cors_no_wildcard_origin(self):
        """Wildcard '*' is incompatible with allow_credentials=True."""
        import importlib
        import app.core.config as cfg_module
        importlib.reload(cfg_module)
        assert "*" not in cfg_module.settings.CORS_ALLOW_ORIGINS, (
            "CORS_ALLOW_ORIGINS must not contain '*' when allow_credentials=True"
        )

    def test_cors_includes_localhost(self):
        """Dev origin must be in default CORS origins."""
        import importlib
        import app.core.config as cfg_module
        importlib.reload(cfg_module)
        origins = cfg_module.settings.CORS_ALLOW_ORIGINS
        assert any("localhost:3000" in o for o in origins), (
            "http://localhost:3000 must be in default CORS_ALLOW_ORIGINS"
        )

    def test_cors_allow_headers_explicit(self):
        """Headers must be explicit (not wildcard) for credentials."""
        import importlib
        import app.core.config as cfg_module
        importlib.reload(cfg_module)
        headers = cfg_module.settings.CORS_ALLOW_HEADERS
        assert "*" not in headers, (
            "CORS_ALLOW_HEADERS must not be '*' when allow_credentials=True"
        )
        assert "Authorization" in headers
        assert "Content-Type" in headers


class TestRefreshTokenBodyOptional:
    """Verify refresh endpoint accepts empty body (cookie-only flow)."""

    def test_token_refresh_request_allows_none(self):
        """refresh_token field must be optional (cookie-first flow)."""
        from app.schemas.auth import TokenRefreshRequest
        # Should not raise — refresh_token is optional
        req = TokenRefreshRequest()
        assert req.refresh_token is None

    def test_token_refresh_request_accepts_token(self):
        """Legacy body-based refresh still works."""
        from app.schemas.auth import TokenRefreshRequest
        req = TokenRefreshRequest(refresh_token="some.jwt.token")
        assert req.refresh_token == "some.jwt.token"
