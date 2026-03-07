"""
Backend tests — DEV-FAULT-1 localhost-only safety belt

Tests:
  1.  is_dev_fault_allowed returns False when ALLOW_DEV_FAULT_INJECTION is unset
  2.  is_dev_fault_allowed returns False when env var is false (explicit)
  3.  is_dev_fault_allowed returns False when app ENV is production
  4.  is_dev_fault_allowed returns True for 127.0.0.1 client with all conditions met
  5.  is_dev_fault_allowed returns True for ::1 IPv6 loopback client
  6.  is_dev_fault_allowed returns True for localhost URL hostname
  7.  is_dev_fault_allowed returns False for non-local client IP (production)
  8.  is_dev_fault_allowed returns False for non-local URL hostname
  9.  TRUST_PROXY_HEADERS=false: XFF loopback does NOT enable injection
  10. TRUST_PROXY_HEADERS=true: XFF loopback DOES enable injection
  11. TRUST_PROXY_HEADERS=true but XFF is non-local: denied
  12. is_dev_fault_allowed returns False when request is None
  13. raise_if_dev_fault: raises HTTPException when guard passes
  14. raise_if_dev_fault: no-op when guard fails (wrong env)
  15. raise_if_dev_fault: no-op when code is None
  16. Guard with ::ffff:127.0.0.1 (IPv4-mapped loopback) is allowed
  17. Dev env check: 'testing' label is accepted as non-production
  18. Dev env check: 'ci' label is accepted as non-production
  19. Guard false when env=production even with loopback IP
"""
from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers — build minimal fake Request objects
# ---------------------------------------------------------------------------

def _make_request(
    client_host: str | None = None,
    url_hostname: str | None = None,
    xff: str | None = None,
) -> MagicMock:
    """Return a MagicMock that quacks like a FastAPI Request."""
    req = MagicMock()

    # request.client
    if client_host is not None:
        req.client = MagicMock()
        req.client.host = client_host
    else:
        req.client = None

    # request.url.hostname
    req.url = MagicMock()
    req.url.hostname = url_hostname or ""

    # request.headers  — behaves like a dict
    headers: dict[str, str] = {}
    if xff is not None:
        headers["x-forwarded-for"] = xff
    req.headers = headers

    return req


# ---------------------------------------------------------------------------
# Fixtures — set required env vars for each test via patches
# ---------------------------------------------------------------------------

def _env(**overrides):
    """Context-manager patcher: set specific env vars, remove unset ones."""
    # Start from a clean slate for the three keys we care about
    base = {
        "ALLOW_DEV_FAULT_INJECTION": "false",
        "ENV": "dev",
        "APP_ENV": "dev",
        "TRUST_PROXY_HEADERS": "false",
    }
    base.update(overrides)
    return patch.dict(os.environ, base, clear=False)


# ---------------------------------------------------------------------------
# 1-2. ALLOW_DEV_FAULT_INJECTION gate
# ---------------------------------------------------------------------------

class TestEnvVarGate:
    def test_denied_when_env_var_unset(self):
        """No ALLOW_DEV_FAULT_INJECTION → always denied."""
        from app.core.dev_fault import is_dev_fault_allowed
        req = _make_request(client_host="127.0.0.1")
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("ALLOW_DEV_FAULT_INJECTION", None)
            os.environ["ENV"] = "dev"
            result = is_dev_fault_allowed(req)
        assert result is False

    def test_denied_when_env_var_explicit_false(self):
        from app.core.dev_fault import is_dev_fault_allowed
        req = _make_request(client_host="127.0.0.1")
        with _env(ALLOW_DEV_FAULT_INJECTION="false"):
            result = is_dev_fault_allowed(req)
        assert result is False

    def test_denied_when_env_var_wrong_value(self):
        from app.core.dev_fault import is_dev_fault_allowed
        req = _make_request(client_host="127.0.0.1")
        with _env(ALLOW_DEV_FAULT_INJECTION="yes"):  # not "true"
            result = is_dev_fault_allowed(req)
        assert result is False


# ---------------------------------------------------------------------------
# 3. App-env gate
# ---------------------------------------------------------------------------

class TestAppEnvGate:
    def test_denied_when_env_is_production(self):
        """ENV=production → denied even with loopback IP and env var set."""
        from app.core.dev_fault import is_dev_fault_allowed
        req = _make_request(client_host="127.0.0.1")
        with _env(ALLOW_DEV_FAULT_INJECTION="true", ENV="production"):
            result = is_dev_fault_allowed(req)
        assert result is False

    def test_denied_when_env_is_staging(self):
        from app.core.dev_fault import is_dev_fault_allowed
        req = _make_request(client_host="127.0.0.1")
        with _env(ALLOW_DEV_FAULT_INJECTION="true", ENV="staging"):
            result = is_dev_fault_allowed(req)
        assert result is False

    def test_allowed_when_env_is_dev(self):
        from app.core.dev_fault import is_dev_fault_allowed
        req = _make_request(client_host="127.0.0.1")
        with _env(ALLOW_DEV_FAULT_INJECTION="true", ENV="dev"):
            result = is_dev_fault_allowed(req)
        assert result is True

    def test_allowed_when_env_is_development(self):
        from app.core.dev_fault import is_dev_fault_allowed
        req = _make_request(client_host="127.0.0.1")
        with _env(ALLOW_DEV_FAULT_INJECTION="true", ENV="development"):
            result = is_dev_fault_allowed(req)
        assert result is True

    def test_allowed_when_env_is_testing(self):
        """'testing' is a recognised dev env label."""
        from app.core.dev_fault import is_dev_fault_allowed
        req = _make_request(client_host="127.0.0.1")
        with _env(ALLOW_DEV_FAULT_INJECTION="true", ENV="testing"):
            result = is_dev_fault_allowed(req)
        assert result is True

    def test_allowed_when_env_is_ci(self):
        from app.core.dev_fault import is_dev_fault_allowed
        req = _make_request(client_host="127.0.0.1")
        with _env(ALLOW_DEV_FAULT_INJECTION="true", ENV="ci"):
            result = is_dev_fault_allowed(req)
        assert result is True


# ---------------------------------------------------------------------------
# 4-8. Locality gate
# ---------------------------------------------------------------------------

class TestLocalityGate:
    def test_allowed_for_127_0_0_1_client(self):
        """IPv4 loopback client IP → allowed."""
        from app.core.dev_fault import is_dev_fault_allowed
        req = _make_request(client_host="127.0.0.1")
        with _env(ALLOW_DEV_FAULT_INJECTION="true", ENV="dev"):
            assert is_dev_fault_allowed(req) is True

    def test_allowed_for_ipv6_loopback_client(self):
        """IPv6 ::1 loopback → allowed."""
        from app.core.dev_fault import is_dev_fault_allowed
        req = _make_request(client_host="::1")
        with _env(ALLOW_DEV_FAULT_INJECTION="true", ENV="dev"):
            assert is_dev_fault_allowed(req) is True

    def test_allowed_for_ipv4_mapped_loopback(self):
        """::ffff:127.0.0.1 → allowed."""
        from app.core.dev_fault import is_dev_fault_allowed
        req = _make_request(client_host="::ffff:127.0.0.1")
        with _env(ALLOW_DEV_FAULT_INJECTION="true", ENV="dev"):
            assert is_dev_fault_allowed(req) is True

    def test_allowed_for_localhost_url_hostname(self):
        """URL hostname is localhost (no client IP set) → allowed."""
        from app.core.dev_fault import is_dev_fault_allowed
        req = _make_request(client_host=None, url_hostname="localhost")
        with _env(ALLOW_DEV_FAULT_INJECTION="true", ENV="dev"):
            assert is_dev_fault_allowed(req) is True

    def test_denied_for_non_local_client_ip(self):
        """Real production IP → denied."""
        from app.core.dev_fault import is_dev_fault_allowed
        req = _make_request(client_host="54.210.123.45")
        with _env(ALLOW_DEV_FAULT_INJECTION="true", ENV="dev"):
            assert is_dev_fault_allowed(req) is False

    def test_denied_for_non_local_url_hostname(self):
        """Public hostname → denied."""
        from app.core.dev_fault import is_dev_fault_allowed
        req = _make_request(client_host="10.0.0.5", url_hostname="hedgecore.vercel.app")
        with _env(ALLOW_DEV_FAULT_INJECTION="true", ENV="dev"):
            assert is_dev_fault_allowed(req) is False

    def test_denied_when_request_is_none(self):
        """None request → denied (safe default)."""
        from app.core.dev_fault import is_dev_fault_allowed
        with _env(ALLOW_DEV_FAULT_INJECTION="true", ENV="dev"):
            assert is_dev_fault_allowed(None) is False


# ---------------------------------------------------------------------------
# 9-11. X-Forwarded-For / TRUST_PROXY_HEADERS
# ---------------------------------------------------------------------------

class TestProxyTrustGate:
    def test_xff_loopback_denied_when_trust_proxy_false(self):
        """
        TRUST_PROXY_HEADERS=false (default) — XFF cannot fake locality.
        client_host is a real IP; XFF claims loopback → still denied.
        """
        from app.core.dev_fault import is_dev_fault_allowed
        req = _make_request(
            client_host="54.210.123.45",
            xff="127.0.0.1",
        )
        with _env(ALLOW_DEV_FAULT_INJECTION="true", ENV="dev", TRUST_PROXY_HEADERS="false"):
            assert is_dev_fault_allowed(req) is False

    def test_xff_loopback_allowed_when_trust_proxy_true(self):
        """
        TRUST_PROXY_HEADERS=true — XFF loopback entry enables injection
        (used when running behind a local reverse proxy in dev).
        """
        from app.core.dev_fault import is_dev_fault_allowed
        req = _make_request(
            client_host="172.19.0.1",   # Docker bridge — not loopback
            xff="127.0.0.1",
        )
        with _env(ALLOW_DEV_FAULT_INJECTION="true", ENV="dev", TRUST_PROXY_HEADERS="true"):
            assert is_dev_fault_allowed(req) is True

    def test_xff_non_local_denied_even_with_trust_proxy_true(self):
        """XFF with a real IP → still denied even when proxy trust is on."""
        from app.core.dev_fault import is_dev_fault_allowed
        req = _make_request(
            client_host="172.19.0.1",
            xff="203.0.113.99",
        )
        with _env(ALLOW_DEV_FAULT_INJECTION="true", ENV="dev", TRUST_PROXY_HEADERS="true"):
            assert is_dev_fault_allowed(req) is False

    def test_xff_only_first_ip_is_checked(self):
        """XFF multi-hop: only the first (leftmost / client) IP is evaluated."""
        from app.core.dev_fault import is_dev_fault_allowed
        req = _make_request(
            client_host="172.19.0.1",
            xff="127.0.0.1, 10.0.0.1, 54.210.123.45",
        )
        with _env(ALLOW_DEV_FAULT_INJECTION="true", ENV="dev", TRUST_PROXY_HEADERS="true"):
            assert is_dev_fault_allowed(req) is True


# ---------------------------------------------------------------------------
# 12-15. raise_if_dev_fault convenience function
# ---------------------------------------------------------------------------

class TestRaiseIfDevFault:
    def test_raises_http_exception_when_guard_passes(self):
        """raise_if_dev_fault raises HTTPException(500) when all conditions met."""
        from fastapi import HTTPException
        from app.core.dev_fault import raise_if_dev_fault
        req = _make_request(client_host="127.0.0.1")
        with _env(ALLOW_DEV_FAULT_INJECTION="true", ENV="dev"):
            with pytest.raises(HTTPException) as exc_info:
                raise_if_dev_fault(req, 500)
        assert exc_info.value.status_code == 500
        assert "DEV FAULT INJECTION" in str(exc_info.value.detail)

    def test_noop_when_guard_fails_wrong_env(self):
        """raise_if_dev_fault is a no-op when ENV=production."""
        from app.core.dev_fault import raise_if_dev_fault
        req = _make_request(client_host="127.0.0.1")
        with _env(ALLOW_DEV_FAULT_INJECTION="true", ENV="production"):
            # No exception raised
            raise_if_dev_fault(req, 500)

    def test_noop_when_code_is_none(self):
        """raise_if_dev_fault is a no-op when code is None (no injection requested)."""
        from app.core.dev_fault import raise_if_dev_fault
        req = _make_request(client_host="127.0.0.1")
        with _env(ALLOW_DEV_FAULT_INJECTION="true", ENV="dev"):
            raise_if_dev_fault(req, None)  # must not raise

    def test_noop_when_env_var_unset(self):
        """raise_if_dev_fault is silent when ALLOW_DEV_FAULT_INJECTION unset."""
        from app.core.dev_fault import raise_if_dev_fault
        req = _make_request(client_host="127.0.0.1")
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("ALLOW_DEV_FAULT_INJECTION", None)
            os.environ["ENV"] = "dev"
            raise_if_dev_fault(req, 500)  # must not raise

    def test_raises_with_custom_code(self):
        """raise_if_dev_fault passes the status code through."""
        from fastapi import HTTPException
        from app.core.dev_fault import raise_if_dev_fault
        req = _make_request(client_host="127.0.0.1")
        with _env(ALLOW_DEV_FAULT_INJECTION="true", ENV="dev"):
            with pytest.raises(HTTPException) as exc_info:
                raise_if_dev_fault(req, 503)
        assert exc_info.value.status_code == 503


# ---------------------------------------------------------------------------
# 16. No other routes were given fault injection
# ---------------------------------------------------------------------------

class TestNoLeak:
    def test_only_list_templates_and_list_favorites_have_dev_fault_param(self):
        """
        Verify that __dev_fault appears ONLY in list_templates and list_favorites.
        All other policy route handlers must NOT have __dev_fault in their signature.
        """
        import inspect
        import app.api.routes.v1_policies as mod

        routes_with_fault = []
        routes_without_fault = []

        for name, fn in inspect.getmembers(mod, inspect.isfunction):
            sig = inspect.signature(fn)
            if "__dev_fault" in sig.parameters:
                routes_with_fault.append(name)
            elif name.startswith(("list_", "create_", "update_", "delete_",
                                   "get_", "activate_", "deactivate_",
                                   "import_", "export_", "add_", "remove_")):
                routes_without_fault.append(name)

        # Only list_templates and list_favorites must carry the param
        assert set(routes_with_fault) == {"list_templates", "list_favorites"}, (
            f"Unexpected fault injection in: {routes_with_fault}"
        )

    def test_no_dev_chain_fail_in_production_routes(self):
        """
        Verify __dev_chain_fail does NOT appear in any production route.
        It should have been removed during hardening.
        """
        import inspect
        import app.api.routes.v1_audit as mod

        routes_with_fail = [
            name for name, fn in inspect.getmembers(mod, inspect.isfunction)
            if "__dev_chain_fail" in inspect.signature(fn).parameters
        ]
        assert routes_with_fail == [], (
            f"Dev chain fail injection still present in: {routes_with_fail}"
        )
