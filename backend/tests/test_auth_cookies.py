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

    def test_samesite_none_in_production(self, monkeypatch):
        """samesite=none in production so cross-origin Vercel→Render
        refresh cookie transmission works. CSRF protection is preserved
        by the double-submit cookie pattern (X-CSRF-Token header) and by
        Bearer-token auth on mutation routes; Secure=True is enforced
        alongside SameSite=None per spec.
        """
        monkeypatch.setenv("ENV", "production")
        import importlib
        import app.api.routes.auth as auth_module
        importlib.reload(auth_module)
        assert auth_module._RT_COOKIE_SAMESITE == "none"
        assert auth_module._RT_COOKIE_SECURE is True


@pytest.mark.requires_postgres
class TestCorsConfig:
    """Verify CORS settings allow credentials with explicit origins.

    These assert the CODE DEFAULTS in app/core/config.py — not the live
    cfg_module.settings instance, which is shared global state that may
    be mutated by other suites in the PG run (e.g. e2e suites that set
    ENV/DATABASE_URL at module-import time). Reading the class field
    defaults bypasses that contamination while still catching real
    regressions to the defaults themselves.
    """

    @staticmethod
    def _fresh_settings_class():
        """Reimport the Settings class with CORS env vars cleared.

        Snapshots and pops any CORS_* env vars so the reloaded Settings
        falls back to its declared class-level defaults, then restores
        the original env on return.

        Also guarantees a valid JWT_SECRET during reload: other suites
        (e.g. test_e2e_policy_lifecycle.py) set JWT_SECRET at module-
        import time to a redacted 25-char marker that fails the >=32
        validator. We swap in a >=32-char placeholder for the duration
        of the reload, then restore the original.
        """
        import importlib
        cors_keys = (
            "CORS_ALLOW_ORIGINS",
            "CORS_ALLOW_CREDENTIALS",
            "CORS_ALLOW_METHODS",
            "CORS_ALLOW_HEADERS",
            "CORS_EXPOSE_HEADERS",
            "CORS_ALLOW_VERCEL_PREVIEWS",
        )
        snapshot = {k: os.environ.pop(k) for k in cors_keys if k in os.environ}
        jwt_snapshot = os.environ.get("JWT_SECRET")
        os.environ["JWT_SECRET"] = "test-secret-key-for-ci-at-least-32-chars-long"
        try:
            import app.core.config as cfg_module
            importlib.reload(cfg_module)
            return cfg_module.Settings()
        finally:
            for k, v in snapshot.items():
                os.environ[k] = v
            if jwt_snapshot is None:
                os.environ.pop("JWT_SECRET", None)
            else:
                os.environ["JWT_SECRET"] = jwt_snapshot

    def test_cors_allow_credentials_is_true(self):
        """allow_credentials must be True for httpOnly cookie flow."""
        settings = self._fresh_settings_class()
        assert settings.CORS_ALLOW_CREDENTIALS is True

    def test_cors_no_wildcard_origin(self):
        """Wildcard '*' is incompatible with allow_credentials=True."""
        settings = self._fresh_settings_class()
        assert "*" not in settings.CORS_ALLOW_ORIGINS, (
            "CORS_ALLOW_ORIGINS must not contain '*' when allow_credentials=True"
        )

    def test_cors_includes_localhost(self):
        """Dev origin must be in default CORS origins."""
        settings = self._fresh_settings_class()
        origins = settings.CORS_ALLOW_ORIGINS
        assert any("localhost:3000" in o for o in origins), (
            "http://localhost:3000 must be in default CORS_ALLOW_ORIGINS"
        )

    def test_cors_allow_headers_explicit(self):
        """Headers must be explicit (not wildcard) for credentials."""
        settings = self._fresh_settings_class()
        headers = settings.CORS_ALLOW_HEADERS
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
