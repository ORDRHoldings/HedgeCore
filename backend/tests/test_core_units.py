"""
Comprehensive unit tests for backend core modules.

Covers:
  - app.core.security  (password hashing, JWT creation/decode, API key parsing, session duration)
  - app.core.config     (Settings defaults, validators, CORS parsing, IP allowlist parsing)
  - app.core.ip_allowlist (IP matching, CIDR ranges, enforcement)
  - app.middleware.rate_limit (TokenBucket in-memory)
  - app.middleware.csrf  (token generation, disabled flag, exempt paths, double-submit logic)

All tests are pure unit tests -- no database or network required.
"""
from __future__ import annotations

import os
import sys
import time
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

# ---------------------------------------------------------------------------
# Environment defaults MUST be set before any app imports
# ---------------------------------------------------------------------------
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite://")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-ci-at-least-32-chars-long")

import pytest
from fastapi import HTTPException

# ---------------------------------------------------------------------------
# Module imports (after env setup)
# ---------------------------------------------------------------------------
from app.core.security import (
    HIGH_PRIVILEGE_ROLES,
    HIGH_PRIVILEGE_SESSION_MINUTES,
    _build_claims,
    _parse_api_key,
    _redact_key_id,
    create_access_token,
    create_refresh_token,
    create_token_pair,
    decode_and_validate,
    decode_token,
    get_session_duration_for_roles,
    hash_password,
    verify_password,
)
from app.core.config import Settings, settings
from app.core.ip_allowlist import check_ip_allowlist, enforce_execution_ip_allowlist, get_client_ip
from app.middleware.rate_limit import TokenBucket
from app.middleware.csrf import (
    _CSRF_COOKIE_NAME,
    _CSRF_EXEMPT_PREFIXES,
    _CSRF_HEADER_NAME,
    _MUTATING_METHODS,
    _is_disabled,
    generate_csrf_token,
)


# ===========================================================================
# 1. security.py -- Password Hashing
# ===========================================================================


class TestPasswordHashing:
    """Tests for hash_password() and verify_password()."""

    def test_hash_and_verify_valid_password(self):
        plain = "MySecurePassword123!"
        hashed = hash_password(plain)
        assert hashed != plain
        assert hashed.startswith("$2")
        assert verify_password(plain, hashed) is True

    def test_hash_rejects_short_password(self):
        with pytest.raises(ValueError, match="at least"):
            hash_password("short")

    def test_hash_allows_short_when_skip_flag(self):
        hashed = hash_password("ab", _skip_length_check=True)
        assert verify_password("ab", hashed) is True

    def test_verify_wrong_password(self):
        hashed = hash_password("CorrectPassword1")
        assert verify_password("WrongPassword99", hashed) is False

    def test_verify_corrupted_hash_returns_false(self):
        assert verify_password("anything", "not-a-valid-hash") is False

    def test_hash_produces_unique_salts(self):
        h1 = hash_password("SamePassword!!")
        h2 = hash_password("SamePassword!!")
        assert h1 != h2  # different salts

    def test_hash_exact_min_length_accepted(self):
        pwd = "x" * settings.PASSWORD_MIN_LENGTH
        hashed = hash_password(pwd)
        assert verify_password(pwd, hashed)

    def test_hash_one_below_min_length_rejected(self):
        pwd = "x" * (settings.PASSWORD_MIN_LENGTH - 1)
        with pytest.raises(ValueError):
            hash_password(pwd)


# ===========================================================================
# 2. security.py -- JWT Token Creation & Decoding
# ===========================================================================


class TestJWTTokens:
    """Tests for create_access_token, create_refresh_token, decode_token, etc."""

    def test_create_and_decode_access_token(self):
        sub = str(uuid.uuid4())
        token = create_access_token(sub=sub, email="user@test.com")
        payload = decode_token(token, expected_type="access")
        assert payload["sub"] == sub
        assert payload["email"] == "user@test.com"
        assert payload["typ"] == "access"
        assert payload["type"] == "access"
        assert "jti" in payload
        assert "nbf" in payload
        assert "exp" in payload
        assert "iss" in payload
        assert "aud" in payload

    def test_create_access_token_with_uuid_object(self):
        uid = uuid.uuid4()
        token = create_access_token(sub=uid, email="u@t.com")
        payload = decode_token(token, expected_type="access")
        assert payload["sub"] == str(uid)

    def test_access_token_mfa_flag(self):
        token = create_access_token(sub="abc123-" * 5 + "ab", mfa_verified=True)
        payload = decode_token(token, expected_type="access")
        assert payload["mfa_verified"] is True

    def test_access_token_mfa_default_false(self):
        token = create_access_token(sub="abc123-" * 5 + "ab")
        payload = decode_token(token, expected_type="access")
        assert payload["mfa_verified"] is False

    def test_access_token_custom_expiry(self):
        token = create_access_token(sub="s", expires_minutes=5)
        payload = decode_token(token, expected_type="access")
        # The exp should be roughly 5 minutes from iat
        assert payload["exp"] - payload["iat"] == pytest.approx(5 * 60, abs=2)

    def test_access_token_version_included(self):
        token = create_access_token(sub="s", token_version=7)
        payload = decode_token(token, expected_type="access")
        assert payload["ver"] == 7

    def test_access_token_no_version_when_none(self):
        token = create_access_token(sub="s")
        payload = decode_token(token, expected_type="access")
        assert "ver" not in payload

    def test_create_and_decode_refresh_token(self):
        sub = str(uuid.uuid4())
        token, jti, exp = create_refresh_token(sub=sub, email="r@t.com", token_version=2)
        assert isinstance(token, str) and len(token) > 20
        assert isinstance(jti, str) and len(jti) == 32  # uuid4 hex
        assert isinstance(exp, datetime)
        payload = decode_token(token, expected_type="refresh")
        assert payload["sub"] == sub
        assert payload["typ"] == "refresh"
        assert payload["ver"] == 2

    def test_decode_wrong_type_raises_401(self):
        token = create_access_token(sub="s")
        with pytest.raises(HTTPException) as exc_info:
            decode_token(token, expected_type="refresh")
        assert exc_info.value.status_code == 401
        assert "type" in exc_info.value.detail.lower()

    def test_decode_expired_token_raises_401(self):
        token = create_access_token(sub="s", expires_minutes=-1)
        with pytest.raises(HTTPException) as exc_info:
            decode_token(token, expected_type="access")
        assert exc_info.value.status_code == 401

    def test_decode_garbage_token_raises_401(self):
        with pytest.raises(HTTPException) as exc_info:
            decode_token("not.a.jwt", expected_type="access")
        assert exc_info.value.status_code == 401

    def test_decode_empty_token_raises_401(self):
        with pytest.raises(HTTPException) as exc_info:
            decode_token("", expected_type="access")
        assert exc_info.value.status_code == 401

    def test_create_token_pair(self):
        sub = str(uuid.uuid4())
        access, refresh = create_token_pair(sub=sub, email="pair@t.com", token_version=3)
        a_payload = decode_token(access, expected_type="access")
        r_payload = decode_token(refresh, expected_type="refresh")
        assert a_payload["sub"] == sub
        assert r_payload["sub"] == sub
        assert a_payload["ver"] == 3
        assert r_payload["ver"] == 3

    def test_decode_and_validate_alias(self):
        token = create_access_token(sub="s")
        payload = decode_and_validate(token, expected_type="access")
        assert payload["sub"] == "s"


# ===========================================================================
# 3. security.py -- _build_claims helper
# ===========================================================================


class TestBuildClaims:
    """Tests for the internal _build_claims helper."""

    def test_basic_access_claims(self):
        claims = _build_claims(sub="u1", email="e@t.com", token_type="access")
        assert claims["sub"] == "u1"
        assert claims["email"] == "e@t.com"
        assert claims["typ"] == "access"
        assert claims["type"] == "access"
        assert len(claims["jti"]) == 32

    def test_no_email_when_none(self):
        claims = _build_claims(sub="u1", email=None, token_type="refresh")
        assert "email" not in claims

    def test_version_included(self):
        claims = _build_claims(sub="u1", email=None, token_type="access", token_version=5)
        assert claims["ver"] == 5

    def test_version_absent_when_none(self):
        claims = _build_claims(sub="u1", email=None, token_type="access", token_version=None)
        assert "ver" not in claims


# ===========================================================================
# 4. security.py -- Session Duration for Roles
# ===========================================================================


class TestSessionDuration:
    """Tests for get_session_duration_for_roles()."""

    def test_regular_role_gets_default(self):
        result = get_session_duration_for_roles(["analyst", "trader"])
        assert result == settings.ACCESS_EXPIRE_MIN

    def test_high_privilege_role_gets_shortened(self):
        for role in HIGH_PRIVILEGE_ROLES:
            result = get_session_duration_for_roles([role])
            assert result == HIGH_PRIVILEGE_SESSION_MINUTES

    def test_mixed_roles_picks_shorter(self):
        result = get_session_duration_for_roles(["analyst", "cfo", "trader"])
        assert result == HIGH_PRIVILEGE_SESSION_MINUTES

    def test_empty_roles_gets_default(self):
        result = get_session_duration_for_roles([])
        assert result == settings.ACCESS_EXPIRE_MIN

    def test_case_insensitive(self):
        result = get_session_duration_for_roles(["CFO"])
        assert result == HIGH_PRIVILEGE_SESSION_MINUTES


# ===========================================================================
# 5. security.py -- API Key Parsing & Redaction
# ===========================================================================


class TestAPIKeyParsing:
    """Tests for _parse_api_key() and _redact_key_id()."""

    def test_parse_valid_key(self):
        key_id, secret = _parse_api_key("HK_live_abc123.mysecretvalue")
        assert key_id == "HK_live_abc123"
        assert secret == "mysecretvalue"

    def test_parse_missing_dot_raises(self):
        with pytest.raises(HTTPException) as exc_info:
            _parse_api_key("HK_live_nodot")
        assert exc_info.value.status_code == 401

    def test_parse_wrong_prefix_raises(self):
        with pytest.raises(HTTPException):
            _parse_api_key("WRONG_prefix.secret")

    def test_parse_empty_string_raises(self):
        with pytest.raises(HTTPException):
            _parse_api_key("")

    def test_parse_only_dot_raises(self):
        with pytest.raises(HTTPException):
            _parse_api_key("HK_live_.")  # empty secret after stripping

    def test_redact_short_key(self):
        assert _redact_key_id("ab") == "ab***"
        assert _redact_key_id("abcdefgh") == "ab***"

    def test_redact_long_key(self):
        r = _redact_key_id("HK_live_abcdef123456")
        assert r.startswith("HK_l")
        assert r.endswith("3456")
        assert "***" in r

    def test_redact_empty(self):
        assert _redact_key_id("") == "<empty>"


# ===========================================================================
# 6. config.py -- Settings Defaults & Validators
# ===========================================================================


class TestSettings:
    """Tests for Settings class defaults, validators, and properties."""

    def test_default_app_name(self):
        assert settings.APP_NAME == "ORDR Terminal API"

    def test_default_jwt_algorithm(self):
        assert settings.JWT_ALGORITHM == "HS256"

    def test_default_access_expire(self):
        assert settings.ACCESS_EXPIRE_MIN == 30

    def test_default_refresh_expire(self):
        assert settings.REFRESH_EXPIRE_MIN == 10080

    def test_password_min_length_default(self):
        assert settings.PASSWORD_MIN_LENGTH == 12

    def test_compatibility_aliases(self):
        assert settings.JWT_SECRET_KEY == settings.JWT_SECRET
        assert settings.JWT_AUDIENCE == settings.TOKEN_AUDIENCE
        assert settings.JWT_ISSUER == settings.TOKEN_ISSUER
        assert settings.JWT_ALG == settings.JWT_ALGORITHM
        assert settings.ACCESS_TOKEN_EXPIRE_MINUTES == settings.ACCESS_EXPIRE_MIN
        assert settings.REFRESH_TOKEN_EXPIRE_MINUTES == settings.REFRESH_EXPIRE_MIN

    def test_is_testing_property(self):
        # Our ENV is set to "dev" by default in test, but check the logic
        assert settings.is_testing == (settings.ENV in {"test", "testing", "ci"})

    def test_jwt_secret_too_short_raises(self):
        with pytest.raises(Exception):  # pydantic ValidationError
            Settings(JWT_SECRET="short")

    @patch.dict(os.environ, {"ENV": "production"})
    def test_jwt_secret_dev_default_in_production_raises(self):
        with pytest.raises(Exception):
            Settings(JWT_SECRET="dev_this_is_long_enough_32_chars_ok")

    def test_positive_duration_validator_zero(self):
        with pytest.raises(Exception):
            Settings(
                JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long",
                ACCESS_EXPIRE_MIN=0,
            )

    def test_positive_duration_validator_negative(self):
        with pytest.raises(Exception):
            Settings(
                JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long",
                REFRESH_EXPIRE_MIN=-5,
            )

    def test_cors_parse_json_array(self):
        result = Settings.parse_cors_origins('["http://a.com/", "http://b.com"]')
        assert result == ["http://a.com", "http://b.com"]

    def test_cors_parse_comma_separated(self):
        result = Settings.parse_cors_origins("http://a.com, http://b.com/")
        assert result == ["http://a.com", "http://b.com"]

    def test_cors_parse_list_passthrough(self):
        result = Settings.parse_cors_origins(["http://x.com/"])
        assert result == ["http://x.com"]

    def test_cors_parse_non_string_non_list(self):
        result = Settings.parse_cors_origins(123)
        assert result == []

    def test_ip_allowlist_parse_comma_string(self):
        result = Settings.parse_ip_allowlist("10.0.0.0/8, 192.168.1.1")
        assert result == ["10.0.0.0/8", "192.168.1.1"]

    def test_ip_allowlist_parse_empty(self):
        result = Settings.parse_ip_allowlist("")
        assert result == []

    def test_ip_allowlist_parse_list(self):
        result = Settings.parse_ip_allowlist(["10.0.0.0/8"])
        assert result == ["10.0.0.0/8"]

    def test_db_url_property_fallback(self):
        s = Settings(
            JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long",
            DATABASE_URL=None,
            ASYNC_DATABASE_URL=None,
        )
        assert "postgresql+asyncpg://" in s.db_url
        assert "postgresql+psycopg2://" in s.sync_db_url

    def test_db_url_property_explicit(self):
        s = Settings(
            JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long",
            ASYNC_DATABASE_URL="postgresql+asyncpg://custom/db",
        )
        assert s.db_url == "postgresql+asyncpg://custom/db"

    def test_apply_environment_overrides_testing(self):
        s = Settings(
            JWT_SECRET="test-secret-key-for-ci-at-least-32-chars-long",
            ENV="test",
        )
        s.apply_environment_overrides()
        assert s.RATE_LIMIT_ENABLED is False
        assert s.RATE_LIMIT_LOGIN_PER_MIN == 100_000


# ===========================================================================
# 7. ip_allowlist.py -- IP matching
# ===========================================================================


class TestIPAllowlist:
    """Tests for check_ip_allowlist() and get_client_ip()."""

    def test_empty_allowlist_allows_all(self):
        assert check_ip_allowlist("1.2.3.4", []) is True

    def test_exact_ip_match(self):
        assert check_ip_allowlist("192.168.1.100", ["192.168.1.100"]) is True

    def test_exact_ip_no_match(self):
        assert check_ip_allowlist("192.168.1.101", ["192.168.1.100"]) is False

    def test_cidr_match(self):
        assert check_ip_allowlist("10.0.5.7", ["10.0.0.0/8"]) is True

    def test_cidr_no_match(self):
        assert check_ip_allowlist("11.0.0.1", ["10.0.0.0/8"]) is False

    def test_multiple_entries_one_matches(self):
        assert check_ip_allowlist("172.16.0.5", ["10.0.0.0/8", "172.16.0.0/16"]) is True

    def test_invalid_client_ip_returns_false(self):
        assert check_ip_allowlist("not-an-ip", ["10.0.0.0/8"]) is False

    def test_invalid_entry_skipped_gracefully(self):
        # Invalid entry in allowlist is skipped; valid entry still matches
        assert check_ip_allowlist("10.0.0.1", ["garbage", "10.0.0.0/8"]) is True

    def test_ipv6_exact_match(self):
        assert check_ip_allowlist("::1", ["::1"]) is True

    def test_ipv6_cidr(self):
        assert check_ip_allowlist("fd00::1", ["fd00::/8"]) is True

    def test_unknown_client_ip(self):
        assert check_ip_allowlist("unknown", ["10.0.0.0/8"]) is False

    def test_get_client_ip_forwarded(self):
        req = MagicMock()
        req.headers = {"X-Forwarded-For": "203.0.113.50, 10.0.0.1"}
        result = get_client_ip(req)
        assert result == "203.0.113.50"

    def test_get_client_ip_direct(self):
        req = MagicMock()
        req.headers = {}
        req.client.host = "127.0.0.1"
        result = get_client_ip(req)
        assert result == "127.0.0.1"

    def test_get_client_ip_no_client(self):
        req = MagicMock()
        req.headers = {}
        req.client = None
        result = get_client_ip(req)
        assert result == "unknown"


class TestEnforceExecutionIPAllowlist:
    """Tests for enforce_execution_ip_allowlist()."""

    def _make_request(self, ip: str = "10.0.0.1") -> MagicMock:
        req = MagicMock()
        req.headers = {}
        req.client.host = ip
        return req

    def test_disabled_passes(self):
        s = MagicMock(EXECUTION_IP_ALLOWLIST_ENABLED=False)
        enforce_execution_ip_allowlist(self._make_request(), s)  # should not raise

    def test_enabled_empty_list_passes(self):
        s = MagicMock(EXECUTION_IP_ALLOWLIST_ENABLED=True, EXECUTION_IP_ALLOWLIST=[])
        enforce_execution_ip_allowlist(self._make_request(), s)

    def test_enabled_ip_in_list_passes(self):
        s = MagicMock(
            EXECUTION_IP_ALLOWLIST_ENABLED=True,
            EXECUTION_IP_ALLOWLIST=["10.0.0.0/8"],
        )
        enforce_execution_ip_allowlist(self._make_request("10.0.0.1"), s)

    def test_enabled_ip_not_in_list_raises_403(self):
        s = MagicMock(
            EXECUTION_IP_ALLOWLIST_ENABLED=True,
            EXECUTION_IP_ALLOWLIST=["192.168.0.0/16"],
        )
        with pytest.raises(HTTPException) as exc_info:
            enforce_execution_ip_allowlist(self._make_request("10.0.0.1"), s)
        assert exc_info.value.status_code == 403


# ===========================================================================
# 8. rate_limit.py -- TokenBucket
# ===========================================================================


class TestTokenBucket:
    """Tests for the in-memory TokenBucket."""

    def test_initial_capacity(self):
        tb = TokenBucket(capacity=10, refill_rate_per_sec=1.0)
        snap = tb.snapshot()
        assert snap["capacity"] == 10.0
        assert snap["tokens"] == 10.0

    def test_consume_decrements(self):
        tb = TokenBucket(capacity=5, refill_rate_per_sec=0)
        assert tb.consume(1.0) is True
        assert tb.snapshot()["tokens"] == pytest.approx(4.0, abs=0.1)

    def test_consume_fails_when_empty(self):
        tb = TokenBucket(capacity=1, refill_rate_per_sec=0)
        assert tb.consume(1.0) is True
        assert tb.consume(1.0) is False

    def test_refill_over_time(self):
        tb = TokenBucket(capacity=10, refill_rate_per_sec=100)
        # Drain all tokens
        for _ in range(10):
            tb.consume(1.0)
        # After a short sleep tokens should refill
        time.sleep(0.05)
        assert tb.consume(1.0) is True

    def test_refill_capped_at_capacity(self):
        tb = TokenBucket(capacity=5, refill_rate_per_sec=1000)
        time.sleep(0.05)
        tb.consume(0)  # trigger refill
        assert tb.snapshot()["tokens"] <= 5.0

    def test_consume_exact_amount(self):
        tb = TokenBucket(capacity=3, refill_rate_per_sec=0)
        assert tb.consume(3.0) is True
        assert tb.consume(0.1) is False

    def test_snapshot_keys(self):
        tb = TokenBucket(capacity=5, refill_rate_per_sec=2.0)
        snap = tb.snapshot()
        assert set(snap.keys()) == {"capacity", "tokens", "refill_rate_per_sec"}
        assert snap["refill_rate_per_sec"] == 2.0


# ===========================================================================
# 9. csrf.py -- CSRF helpers
# ===========================================================================


class TestCSRFHelpers:
    """Tests for CSRF token generation and helper functions."""

    def test_generate_csrf_token_length(self):
        token = generate_csrf_token()
        assert len(token) == 64  # 32 bytes -> 64 hex chars

    def test_generate_csrf_token_hex(self):
        token = generate_csrf_token()
        int(token, 16)  # should not raise

    def test_generate_csrf_token_unique(self):
        t1 = generate_csrf_token()
        t2 = generate_csrf_token()
        assert t1 != t2

    @patch.dict(os.environ, {"CSRF_DISABLED": "1"})
    def test_is_disabled_true_1(self):
        assert _is_disabled() is True

    @patch.dict(os.environ, {"CSRF_DISABLED": "true"})
    def test_is_disabled_true_word(self):
        assert _is_disabled() is True

    @patch.dict(os.environ, {"CSRF_DISABLED": "yes"})
    def test_is_disabled_yes(self):
        assert _is_disabled() is True

    @patch.dict(os.environ, {"CSRF_DISABLED": ""})
    def test_is_disabled_empty_is_false(self):
        assert _is_disabled() is False

    @patch.dict(os.environ, {"CSRF_DISABLED": "0"})
    def test_is_disabled_zero_is_false(self):
        assert _is_disabled() is False

    def test_mutating_methods_set(self):
        assert _MUTATING_METHODS == {"POST", "PUT", "PATCH", "DELETE"}
        assert "GET" not in _MUTATING_METHODS

    def test_exempt_prefixes_contain_auth(self):
        assert any("/auth/" in p for p in _CSRF_EXEMPT_PREFIXES)

    def test_exempt_prefixes_contain_health(self):
        assert any(p.startswith("/health") for p in _CSRF_EXEMPT_PREFIXES)

    def test_cookie_and_header_names(self):
        assert _CSRF_COOKIE_NAME == "csrf_token"
        assert _CSRF_HEADER_NAME == "X-CSRF-Token"


# ===========================================================================
# 10. config.py -- _resolve_secret
# ===========================================================================


class TestResolveSecret:
    """Tests for the _resolve_secret() function."""

    @patch.dict(os.environ, {"MY_TEST_KEY": "found_value"}, clear=False)
    def test_env_fallback(self):
        from app.core.config import _resolve_secret
        assert _resolve_secret("MY_TEST_KEY") == "found_value"

    @patch.dict(os.environ, {"MY_MISSING": "", "ENV": "dev"}, clear=False)
    def test_empty_in_dev_returns_empty(self):
        from app.core.config import _resolve_secret
        result = _resolve_secret("MY_MISSING")
        assert result == ""

    @patch.dict(os.environ, {"ENV": "production"}, clear=False)
    def test_missing_in_production_raises(self):
        from app.core.config import _resolve_secret
        # Remove the key entirely
        env_key = "TOTALLY_MISSING_KEY_FOR_TEST_XXXX"
        os.environ.pop(env_key, None)
        with pytest.raises(RuntimeError, match="CRITICAL"):
            _resolve_secret(env_key)


# ===========================================================================
# 11. security.py -- get_mfa_verified dependency (sync-testable parts)
# ===========================================================================


class TestMFAVerified:
    """Test get_mfa_verified logic via token inspection."""

    def test_mfa_true_in_token(self):
        token = create_access_token(sub="u", mfa_verified=True)
        payload = decode_token(token, expected_type="access")
        assert payload["mfa_verified"] is True

    def test_mfa_false_in_token(self):
        token = create_access_token(sub="u", mfa_verified=False)
        payload = decode_token(token, expected_type="access")
        assert payload["mfa_verified"] is False


# ===========================================================================
# 12. security.py -- decode edge cases
# ===========================================================================


class TestDecodeEdgeCases:
    """Additional edge-case tests for JWT decode."""

    def test_tampered_signature(self):
        token = create_access_token(sub="u")
        tampered = token[:-5] + "XXXXX"
        with pytest.raises(HTTPException) as exc_info:
            decode_token(tampered, expected_type="access")
        assert exc_info.value.status_code == 401

    def test_none_algorithm_not_accepted(self):
        """Ensure tokens signed with 'none' algorithm are rejected."""
        import jwt as pyjwt
        payload = {
            "sub": "attacker",
            "typ": "access",
            "type": "access",
            "iss": settings.TOKEN_ISSUER,
            "aud": settings.TOKEN_AUDIENCE,
            "exp": int((datetime.now(UTC) + timedelta(hours=1)).timestamp()),
        }
        token = pyjwt.encode(payload, "", algorithm="none")
        with pytest.raises(HTTPException) as exc_info:
            decode_token(token, expected_type="access")
        assert exc_info.value.status_code == 401

    def test_wrong_issuer_rejected(self):
        import jwt as pyjwt
        payload = {
            "sub": "u",
            "typ": "access",
            "type": "access",
            "iss": "wrong-issuer",
            "aud": settings.TOKEN_AUDIENCE,
            "iat": int(datetime.now(UTC).timestamp()),
            "nbf": int(datetime.now(UTC).timestamp()),
            "exp": int((datetime.now(UTC) + timedelta(hours=1)).timestamp()),
        }
        token = pyjwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")
        with pytest.raises(HTTPException) as exc_info:
            decode_token(token, expected_type="access")
        assert exc_info.value.status_code == 401

    def test_wrong_audience_rejected(self):
        import jwt as pyjwt
        payload = {
            "sub": "u",
            "typ": "access",
            "type": "access",
            "iss": settings.TOKEN_ISSUER,
            "aud": "wrong-audience",
            "iat": int(datetime.now(UTC).timestamp()),
            "nbf": int(datetime.now(UTC).timestamp()),
            "exp": int((datetime.now(UTC) + timedelta(hours=1)).timestamp()),
        }
        token = pyjwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")
        with pytest.raises(HTTPException) as exc_info:
            decode_token(token, expected_type="access")
        assert exc_info.value.status_code == 401
