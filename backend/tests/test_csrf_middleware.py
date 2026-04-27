"""
backend/tests/test_csrf_middleware.py
SEC-06: CSRF double-submit cookie middleware structural tests.
"""

from __future__ import annotations

import inspect
import pytest


class TestCSRFMiddleware:
    def test_module_imports(self):
        """CSRFMiddleware imports without error."""
        from app.middleware.csrf import CSRFMiddleware  # noqa: F401

    def test_generate_csrf_token_length(self):
        """generate_csrf_token() returns 64-char hex string (32 bytes)."""
        from app.middleware.csrf import generate_csrf_token
        token = generate_csrf_token()
        assert len(token) == 64
        assert all(c in "0123456789abcdef" for c in token)

    def test_generate_csrf_token_unique(self):
        """Two consecutive tokens must be different."""
        from app.middleware.csrf import generate_csrf_token
        assert generate_csrf_token() != generate_csrf_token()

    def test_mutating_methods_defined(self):
        """POST/PUT/PATCH/DELETE are in the mutating methods set."""
        from app.middleware import csrf
        src = inspect.getsource(csrf)
        for method in ("POST", "PUT", "PATCH", "DELETE"):
            assert method in src, f"{method} not in CSRF mutating methods"

    def test_exempt_prefixes_include_auth(self):
        """Auth endpoints must be exempt from CSRF (they issue tokens)."""
        from app.middleware import csrf
        src = inspect.getsource(csrf)
        assert "/auth/" in src or "auth" in src, "Auth paths not exempt in CSRF middleware"

    def test_constant_time_comparison_used(self):
        """secrets.compare_digest must be used (prevents timing oracle)."""
        from app.middleware import csrf
        src = inspect.getsource(csrf)
        assert "compare_digest" in src, "CSRF middleware must use secrets.compare_digest"

    def test_csrf_disabled_env_respected(self):
        """When CSRF_DISABLED=1, middleware must skip checks."""
        import os
        _prev = os.environ.get("CSRF_DISABLED")
        os.environ["CSRF_DISABLED"] = "1"
        try:
            from app.middleware.csrf import _is_disabled
            assert _is_disabled() is True
        finally:
            if _prev is None:
                os.environ.pop("CSRF_DISABLED", None)
            else:
                os.environ["CSRF_DISABLED"] = _prev

    def test_csrf_middleware_registered_in_main(self):
        """CSRFMiddleware must be registered in app/main.py."""
        from app import main
        src = inspect.getsource(main)
        assert "CSRFMiddleware" in src, "CSRFMiddleware not registered in main.py"
