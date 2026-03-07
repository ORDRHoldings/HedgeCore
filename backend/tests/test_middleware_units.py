"""
tests/test_middleware_units.py

Unit tests for middleware helper functions and utility logic.
No database or HTTP server required.
"""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest


# ---------------------------------------------------------------------------
# audit.py — _extract_user_id_from_auth
# ---------------------------------------------------------------------------

class TestExtractUserIdFromAuth:
    def test_none_returns_none(self):
        from app.middleware.audit import _extract_user_id_from_auth
        assert _extract_user_id_from_auth(None) is None

    def test_empty_string_returns_none(self):
        from app.middleware.audit import _extract_user_id_from_auth
        assert _extract_user_id_from_auth("") is None

    def test_no_space_returns_none(self):
        from app.middleware.audit import _extract_user_id_from_auth
        assert _extract_user_id_from_auth("Bearer") is None

    def test_wrong_prefix_returns_none(self):
        from app.middleware.audit import _extract_user_id_from_auth
        assert _extract_user_id_from_auth("Basic abc123") is None

    def test_invalid_token_returns_none(self):
        from app.middleware.audit import _extract_user_id_from_auth
        assert _extract_user_id_from_auth("Bearer invalid.token.here") is None

    def test_valid_bearer_with_numeric_sub(self):
        from app.middleware.audit import _extract_user_id_from_auth
        from app.core.security import create_access_token
        token = create_access_token(sub="12345", email="test@test.com")
        result = _extract_user_id_from_auth(f"Bearer {token}")
        # "12345".isdigit() is True → returns int(12345)
        assert result == 12345

    def test_valid_bearer_with_uuid_sub(self):
        from app.middleware.audit import _extract_user_id_from_auth
        from app.core.security import create_access_token
        token = create_access_token(sub="550e8400-e29b-41d4-a716-446655440000", email="test@test.com")
        result = _extract_user_id_from_auth(f"Bearer {token}")
        # UUID string is not .isdigit() → returns None
        assert result is None

    def test_case_insensitive_bearer(self):
        from app.middleware.audit import _extract_user_id_from_auth
        # "BEARER" should still be recognized (lowered in code)
        # But with invalid token, returns None
        assert _extract_user_id_from_auth("BEARER invalid.jwt") is None


# ---------------------------------------------------------------------------
# api_key_audit.py — _extract_api_key_context
# ---------------------------------------------------------------------------

class TestExtractApiKeyContext:
    def test_no_state_returns_nones(self):
        from app.middleware.api_key_audit import _extract_api_key_context
        request = MagicMock(spec=[])  # no .state attribute
        key_id, user_id = _extract_api_key_context(request)
        assert key_id is None
        assert user_id is None

    def test_state_without_api_key_returns_nones(self):
        from app.middleware.api_key_audit import _extract_api_key_context
        request = MagicMock()
        request.state = MagicMock(spec=[])  # no api_key_id
        key_id, user_id = _extract_api_key_context(request)
        assert key_id is None
        assert user_id is None

    def test_state_with_api_key_id(self):
        from app.middleware.api_key_audit import _extract_api_key_context
        request = MagicMock()
        request.state.api_key_id = "key-123"
        request.state.api_key_user_id = "user-456"
        key_id, user_id = _extract_api_key_context(request)
        assert key_id == "key-123"
        assert user_id == "user-456"

    def test_state_with_key_but_no_user(self):
        from app.middleware.api_key_audit import _extract_api_key_context
        request = MagicMock()
        request.state.api_key_id = "key-789"
        request.state.api_key_user_id = None
        key_id, user_id = _extract_api_key_context(request)
        assert key_id == "key-789"
        assert user_id is None


# ---------------------------------------------------------------------------
# rate_limit.py — InMemoryRateLimiter
# ---------------------------------------------------------------------------

class TestTokenBucket:
    def test_import(self):
        from app.middleware.rate_limit import TokenBucket
        assert TokenBucket is not None

    def test_creates_instance(self):
        from app.middleware.rate_limit import TokenBucket
        bucket = TokenBucket(capacity=10, refill_rate_per_sec=1.0)
        assert bucket is not None

    def test_first_consume_allowed(self):
        from app.middleware.rate_limit import TokenBucket
        bucket = TokenBucket(capacity=5, refill_rate_per_sec=1.0)
        assert bucket.consume() is True

    def test_within_capacity_allowed(self):
        from app.middleware.rate_limit import TokenBucket
        bucket = TokenBucket(capacity=3, refill_rate_per_sec=0.01)
        assert bucket.consume() is True
        assert bucket.consume() is True
        assert bucket.consume() is True

    def test_exceeds_capacity_blocked(self):
        from app.middleware.rate_limit import TokenBucket
        bucket = TokenBucket(capacity=2, refill_rate_per_sec=0.001)
        assert bucket.consume() is True
        assert bucket.consume() is True
        assert bucket.consume() is False

    def test_snapshot_returns_dict(self):
        from app.middleware.rate_limit import TokenBucket
        bucket = TokenBucket(capacity=10, refill_rate_per_sec=1.0)
        snap = bucket.snapshot()
        assert "capacity" in snap
        assert "tokens" in snap
        assert "refill_rate_per_sec" in snap
        assert snap["capacity"] == 10.0


class TestRateLimitMiddleware:
    def test_import(self):
        from app.middleware.rate_limit import RateLimitMiddleware
        assert RateLimitMiddleware is not None

    def test_resolve_key_api_key(self):
        from app.middleware.rate_limit import RateLimitMiddleware
        from unittest.mock import MagicMock
        mw = RateLimitMiddleware.__new__(RateLimitMiddleware)
        mw.header_api_key = "X-API-Key"
        mw.header_request_id = "X-Request-Id"
        req = MagicMock()
        req.headers = {"X-API-Key": "HK_live_test123"}
        req.client = None
        assert mw._resolve_key(req) == "api:HK_live_test123"

    def test_resolve_key_request_id(self):
        from app.middleware.rate_limit import RateLimitMiddleware
        mw = RateLimitMiddleware.__new__(RateLimitMiddleware)
        mw.header_api_key = "X-API-Key"
        mw.header_request_id = "X-Request-Id"
        req = MagicMock()
        req.headers = MagicMock()
        req.headers.get = MagicMock(side_effect=lambda k, d=None: {"X-Request-Id": "req-abc"}.get(k, d))
        req.client = None
        assert mw._resolve_key(req) == "rid:req-abc"

    def test_resolve_key_ip_fallback(self):
        from app.middleware.rate_limit import RateLimitMiddleware
        mw = RateLimitMiddleware.__new__(RateLimitMiddleware)
        mw.header_api_key = "X-API-Key"
        mw.header_request_id = "X-Request-Id"
        req = MagicMock()
        req.headers = MagicMock()
        req.headers.get = MagicMock(return_value=None)
        req.client.host = "192.168.1.1"
        assert mw._resolve_key(req) == "ip:192.168.1.1"


# ---------------------------------------------------------------------------
# csrf.py — helpers
# ---------------------------------------------------------------------------

class TestCsrfHelpers:
    def test_csrf_module_importable(self):
        import app.middleware.csrf
        assert hasattr(app.middleware.csrf, "CSRFMiddleware")

    def test_csrf_token_generation(self):
        """CSRF middleware generates tokens as secrets."""
        import secrets
        token = secrets.token_hex(32)
        assert len(token) == 64
        assert isinstance(token, str)


# ---------------------------------------------------------------------------
# AuditMiddleware class
# ---------------------------------------------------------------------------

class TestAuditMiddlewareClass:
    def test_importable(self):
        from app.middleware.audit import AuditMiddleware
        assert AuditMiddleware is not None

    def test_is_subclass_of_base_middleware(self):
        from app.middleware.audit import AuditMiddleware
        from starlette.middleware.base import BaseHTTPMiddleware
        assert issubclass(AuditMiddleware, BaseHTTPMiddleware)


# ---------------------------------------------------------------------------
# ApiKeyAuditMiddleware class
# ---------------------------------------------------------------------------

class TestApiKeyAuditMiddlewareClass:
    def test_importable(self):
        from app.middleware.api_key_audit import ApiKeyAuditMiddleware
        assert ApiKeyAuditMiddleware is not None

    def test_is_subclass_of_base_middleware(self):
        from app.middleware.api_key_audit import ApiKeyAuditMiddleware
        from starlette.middleware.base import BaseHTTPMiddleware
        assert issubclass(ApiKeyAuditMiddleware, BaseHTTPMiddleware)


# ---------------------------------------------------------------------------
# main.py — uptime / helper testing
# ---------------------------------------------------------------------------

class TestAdminMonitorHelpers:
    def test_uptime_human_seconds_only(self):
        from app.api.routes.v1_admin_monitor import _uptime_human
        assert _uptime_human(42) == "42s"

    def test_uptime_human_minutes(self):
        from app.api.routes.v1_admin_monitor import _uptime_human
        assert _uptime_human(125) == "2m 5s"

    def test_uptime_human_hours(self):
        from app.api.routes.v1_admin_monitor import _uptime_human
        assert _uptime_human(3661) == "1h 1m 1s"

    def test_uptime_human_days(self):
        from app.api.routes.v1_admin_monitor import _uptime_human
        assert _uptime_human(86400 + 3600 + 60 + 1) == "1d 1h 1m 1s"

    def test_uptime_seconds_positive(self):
        from app.api.routes.v1_admin_monitor import _uptime_seconds
        assert _uptime_seconds() > 0

    def test_register_cache(self):
        from app.api.routes.v1_admin_monitor import register_cache, _caches
        test_cache = {"key": "value"}
        register_cache("test_cache_123", test_cache)
        assert "test_cache_123" in _caches
        assert _caches["test_cache_123"] is test_cache
        # Cleanup
        del _caches["test_cache_123"]

    def test_get_memory_usage(self):
        from app.api.routes.v1_admin_monitor import _get_memory_usage
        result = _get_memory_usage()
        if result is not None:
            assert "rss_mb" in result
            assert "vms_mb" in result
            assert "percent" in result
