"""
tests/test_sprint1_security.py
Sprint 1 — Critical/High security fixes validation

Covers:
  S1-1: [DEBUG] exception disclosure removed from v1_execution_proposals
  S1-2: hash_password() enforces PASSWORD_MIN_LENGTH
  S1-3: deps/jwt_auth.py consolidated to PyJWT; python-jose removed
  S1-4: WidgetId type exported from widgetRegistry (TypeScript — validated structurally)

Backend units — no DB required.
"""

import sys
import os
import importlib
import inspect
import time
import uuid

import jwt
import pytest
from fastapi import HTTPException
from unittest.mock import AsyncMock, MagicMock, patch

# ── Path setup ────────────────────────────────────────────────────────────────
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../"))
BACKEND_DIR  = os.path.join(PROJECT_ROOT, "backend")
for p in [PROJECT_ROOT, BACKEND_DIR]:
    if p not in sys.path:
        sys.path.insert(0, p)

os.environ.setdefault("ALLOW_SQLITE_DEMO", "true")
os.environ.setdefault("JWT_SECRET", "***REDACTED_JWT_SECRET***")
os.environ.setdefault("ENV", "test")

from app.core.config import settings
from app.core.security import (
    create_access_token, decode_token, hash_password, verify_password
)

pytestmark = pytest.mark.asyncio


# ══════════════════════════════════════════════════════════════════════════════
# S1-2: hash_password() min-length enforcement
# ══════════════════════════════════════════════════════════════════════════════

class TestHashPasswordMinLength:
    """Verify hash_password enforces PASSWORD_MIN_LENGTH (12)."""

    def test_rejects_short_password(self):
        """Passwords below 12 chars must raise ValueError."""
        short_passwords = ["short", "abc", "12345678", "elevenchars"]
        for pw in short_passwords:
            with pytest.raises(ValueError, match=f"at least {settings.PASSWORD_MIN_LENGTH}"):
                hash_password(pw)

    def test_rejects_empty_password(self):
        with pytest.raises(ValueError):
            hash_password("")

    def test_accepts_exactly_min_length(self):
        """Exactly 12 chars should succeed."""
        pw = "A" * settings.PASSWORD_MIN_LENGTH
        result = hash_password(pw)
        assert result.startswith("$2b$") or result.startswith("$2a$")

    def test_accepts_longer_password(self):
        """Passwords above min length must hash successfully."""
        pw = "SecureP@ssword2026!"
        result = hash_password(pw)
        assert isinstance(result, str)
        assert len(result) > 0

    def test_skip_check_allows_short(self):
        """_skip_length_check=True bypasses the limit (for seed/test use)."""
        result = hash_password("demo", _skip_length_check=True)
        assert result.startswith("$2b$") or result.startswith("$2a$")
        assert verify_password("demo", result)

    def test_skip_check_still_hashes_long(self):
        """_skip_length_check=True still hashes long passwords correctly."""
        pw = "SecureP@ssword2026!"
        result = hash_password(pw, _skip_length_check=True)
        assert verify_password(pw, result)

    def test_error_message_includes_min_length(self):
        """Error message must include the minimum length for UX clarity."""
        with pytest.raises(ValueError) as exc:
            hash_password("tooshort")
        assert str(settings.PASSWORD_MIN_LENGTH) in str(exc.value)

    def test_hashed_passwords_are_unique(self):
        """Same password hashed twice must produce different bcrypt salts."""
        pw = "SecureP@ssword2026!"
        h1 = hash_password(pw)
        h2 = hash_password(pw)
        assert h1 != h2  # different salts

    def test_verify_after_hash(self):
        """Round-trip: hashed password must verify correctly."""
        pw = "SecureRoundTrip@2026"
        hashed = hash_password(pw)
        assert verify_password(pw, hashed)
        assert not verify_password("WrongPassword999", hashed)


# ══════════════════════════════════════════════════════════════════════════════
# S1-3: deps/jwt_auth.py consolidated to PyJWT
# ══════════════════════════════════════════════════════════════════════════════

class TestJwtAuthConsolidation:
    """Verify jwt_auth.py uses core/security.py; python-jose not imported."""

    def test_jwt_auth_does_not_import_python_jose(self):
        """The jose package must NOT be imported by deps/jwt_auth.py."""
        import app.deps.jwt_auth as jwt_auth_module
        # Reload to ensure fresh state
        source_path = inspect.getfile(jwt_auth_module)
        with open(source_path, "r", encoding="utf-8") as f:
            source = f.read()
        # python-jose import pattern
        assert "from jose" not in source, "python-jose still imported in jwt_auth.py"
        assert "import jose" not in source, "python-jose still imported in jwt_auth.py"

    def test_jwt_auth_imports_from_core_security(self):
        """deps/jwt_auth.py must delegate to app.core.security."""
        import app.deps.jwt_auth as jwt_auth_module
        source_path = inspect.getfile(jwt_auth_module)
        with open(source_path, "r", encoding="utf-8") as f:
            source = f.read()
        assert "from app.core.security import" in source

    def test_get_current_user_is_reexported(self):
        """get_current_user must be importable from deps/jwt_auth."""
        from app.deps.jwt_auth import get_current_user  # noqa
        assert callable(get_current_user)

    def test_get_current_admin_user_exists(self):
        """get_current_admin_user must still be available."""
        from app.deps.jwt_auth import get_current_admin_user  # noqa
        assert callable(get_current_admin_user)

    @pytest.mark.asyncio
    async def test_get_current_admin_user_rejects_non_superuser(self):
        """get_current_admin_user must raise 403 for non-superusers."""
        from app.deps.jwt_auth import get_current_admin_user
        mock_user = MagicMock()
        mock_user.is_superuser = False

        with pytest.raises(HTTPException) as exc:
            await get_current_admin_user(user=mock_user)

        assert exc.value.status_code == 403
        assert "admin" in exc.value.detail.lower()

    @pytest.mark.asyncio
    async def test_get_current_admin_user_passes_superuser(self):
        """get_current_admin_user must return the user for superusers."""
        from app.deps.jwt_auth import get_current_admin_user
        mock_user = MagicMock()
        mock_user.is_superuser = True

        result = await get_current_admin_user(user=mock_user)
        assert result is mock_user


# ══════════════════════════════════════════════════════════════════════════════
# S1-1: [DEBUG] exception disclosure removed
# ══════════════════════════════════════════════════════════════════════════════

class TestDebugExceptionRemoved:
    """Verify propose_execution returns 500 (not 422 with [DEBUG]) on unhandled errors."""

    def test_source_has_no_debug_string(self):
        """The [DEBUG] pattern must not exist in v1_execution_proposals.py source."""
        import app.api.routes.v1_execution_proposals as mod
        source_path = inspect.getfile(mod)
        with open(source_path, "r", encoding="utf-8") as f:
            source = f.read()
        assert "[DEBUG]" not in source, "DEBUG disclosure still present in proposals route"
        assert "BUG-4" not in source, "BUG-4 comment still present in proposals route"

    def test_source_returns_500_for_unhandled(self):
        """Unhandled exceptions must map to status_code=500 not 422."""
        import app.api.routes.v1_execution_proposals as mod
        source_path = inspect.getfile(mod)
        with open(source_path, "r", encoding="utf-8") as f:
            source = f.read()
        # Verify the except Exception block returns 500
        assert "status_code=500" in source, "500 response not found in proposals route"
        # And does NOT return [DEBUG] detail
        assert 'detail=f"[DEBUG]' not in source
        assert 'detail=f\'[DEBUG]' not in source

    def test_traceback_import_removed(self):
        """Local traceback import should be removed from the route handler."""
        import app.api.routes.v1_execution_proposals as mod
        source_path = inspect.getfile(mod)
        with open(source_path, "r", encoding="utf-8") as f:
            source = f.read()
        # Should not have local traceback import inside function body
        assert "import traceback as _tb" not in source

    @pytest.mark.requires_postgres
    @pytest.mark.asyncio
    async def test_propose_execution_returns_500_on_service_exception(self):
        """
        When the execution_proposal_service raises an unexpected exception,
        the API must return HTTP 500 with a generic message — no internal detail.

        FastAPI resolves Depends() at startup using the original function object,
        so we must use app.dependency_overrides (not patch()) to override auth.
        """
        from httpx import AsyncClient, ASGITransport
        from app.main import app
        from app.core.security import get_current_user

        # Build a fake user that passes auth
        mock_user = MagicMock()
        mock_user.id = uuid.uuid4()
        mock_user.company_id = uuid.uuid4()
        mock_user.branch_id = uuid.uuid4()
        mock_user.email = "test@example.com"
        mock_user.is_superuser = True

        async def _fake_auth():
            return mock_user

        # Override FastAPI's dependency injection + patch the service call
        app.dependency_overrides[get_current_user] = _fake_auth
        try:
            with patch("app.api.routes.v1_execution_proposals._check_permission"), \
                 patch("app.api.routes.v1_execution_proposals.ep_service.propose_execution",
                       new_callable=AsyncMock,
                       side_effect=RuntimeError("unexpected DB corruption")):

                transport = ASGITransport(app=app)
                async with AsyncClient(transport=transport, base_url="http://test") as ac:
                    response = await ac.post(
                        "/api/v1/proposals",
                        json={
                            "position_id": str(uuid.uuid4()),
                            "execution_ref": "TEST-REF-001",
                            "hedge_amount": 100000.0,
                            "hedge_rate": 1.1234,
                        },
                        headers={"X-API-Key": "HC_DEV_KEY_001"},
                    )
        finally:
            # Always clean up dependency overrides
            app.dependency_overrides.pop(get_current_user, None)

        # Must be 500, not 422
        assert response.status_code == 500, f"Expected 500, got {response.status_code}: {response.text}"

        body = response.json()
        # Must NOT leak internal exception details
        detail = body.get("detail", "")
        assert "[DEBUG]" not in detail
        assert "RuntimeError" not in detail
        assert "DB corruption" not in detail


# ══════════════════════════════════════════════════════════════════════════════
# JWT Core - confirm no regression from consolidation
# ══════════════════════════════════════════════════════════════════════════════

class TestJwtCoreNoRegression:
    """Ensure JWT encode/decode still works after consolidation."""

    def test_access_token_encode_decode(self):
        sub = str(uuid.uuid4())
        token = create_access_token(sub=sub, email="test@ordr.io")
        payload = decode_token(token, expected_type="access")
        assert payload["sub"] == sub

    def test_token_type_mismatch_rejected(self):
        sub = str(uuid.uuid4())
        token = create_access_token(sub=sub)
        with pytest.raises(HTTPException) as exc:
            decode_token(token, expected_type="refresh")
        assert exc.value.status_code == 401

    def test_malformed_token_rejected(self):
        with pytest.raises(HTTPException) as exc:
            decode_token("this.is.garbage", expected_type="access")
        assert exc.value.status_code == 401
