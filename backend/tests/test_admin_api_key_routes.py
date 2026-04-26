"""
tests/test_admin_api_key_routes.py

Tests for C4 (admin.py secret_hash fix) and C5 (admin_api_keys.py privilege escalation fix).

Covers:
- C4: admin.py create_api_key now delegates to service layer (sets secret_hash, returns token)
- C5: All admin_api_keys.py endpoints require superuser, not just any API key holder
"""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.dependencies import get_current_user, require_superuser
from app.main import app


# ── Helpers ──────────────────────────────────────────────────────────────


def _make_superuser():
    user = MagicMock()
    user.id = uuid.UUID("aaaaaaaa-0000-0000-0000-000000000001")
    user.email = "admin@example.com"
    user.company_id = uuid.UUID("cccccccc-0000-0000-0000-000000000001")
    user.is_active = True
    user.is_superuser = True
    return user


def _make_regular_user():
    user = MagicMock()
    user.id = uuid.UUID("bbbbbbbb-0000-0000-0000-000000000002")
    user.email = "user@example.com"
    user.company_id = uuid.UUID("cccccccc-0000-0000-0000-000000000001")
    user.is_active = True
    user.is_superuser = False
    return user


_BEARER = {"Authorization": "Bearer fake-jwt-for-csrf-bypass"}


# ── C4 Tests: admin.py create endpoint delegates to service layer ────────


class TestAdminCreateApiKeySecretHash:
    """C4: The create_api_key route in admin.py must use the service layer."""

    def test_admin_route_imports_service_create(self):
        """admin.py must import svc_create_api_key from the service layer."""
        from app.api.routes.admin import svc_create_api_key

        assert callable(svc_create_api_key)

    def test_admin_route_response_model_is_secret_response(self):
        """admin.py POST /admin/api-keys must use ApiKeySecretResponse (not ApiKeyPublic)."""
        from app.api.routes import admin as admin_mod

        # Find the route in the router (path includes prefix)
        for route in admin_mod.router.routes:
            if hasattr(route, "path") and route.path == "/admin/api-keys" and "POST" in getattr(route, "methods", set()):
                from app.schemas.api_key import ApiKeySecretResponse
                assert route.response_model is ApiKeySecretResponse
                break
        else:
            pytest.fail("POST /admin/api-keys route not found in admin router")

    @pytest.mark.asyncio
    async def test_admin_create_delegates_to_service(self):
        """admin.py create_api_key must call svc_create_api_key (which sets secret_hash)."""
        from app.api.routes.admin import create_api_key as route_fn
        from app.schemas.api_key import ApiKeyCreateRequest

        fake_key = MagicMock()
        fake_key.key_id = "test_key_id"
        fake_key.expires_at = None

        payload = ApiKeyCreateRequest(name="Test", scopes=["read:data"])
        mock_db = AsyncMock()
        mock_user = _make_superuser()

        with patch(
            "app.api.routes.admin.svc_create_api_key",
            new_callable=AsyncMock,
            return_value=(fake_key, "HK_live_test_key_id.secret_abc_1234567890"),
        ) as mock_svc:
            result = await route_fn(payload=payload, db=mock_db, current_user=mock_user)

        mock_svc.assert_awaited_once()
        assert result.token == "HK_live_test_key_id.secret_abc_1234567890"
        assert result.key_id == "test_key_id"


# ── C5 Tests: admin_api_keys.py privilege escalation fix ──────────────────


class TestAdminApiKeysPrivilegeEscalation:
    """C5: All /api/admin/api-keys endpoints must require superuser, not just any API key."""

    def test_no_validate_api_key_import(self):
        """admin_api_keys.py must NOT import validate_api_key anymore."""
        import app.api.routes.admin_api_keys as mod
        assert not hasattr(mod, "validate_api_key"), (
            "validate_api_key should no longer be imported in admin_api_keys.py"
        )

    def test_imports_require_superuser(self):
        """admin_api_keys.py must import require_superuser."""
        import app.api.routes.admin_api_keys as mod
        assert hasattr(mod, "require_superuser"), (
            "require_superuser must be imported in admin_api_keys.py"
        )

    @pytest.mark.asyncio
    async def test_create_rejects_non_superuser(self):
        """POST /api/admin/api-keys must reject non-superuser with 403."""
        regular = _make_regular_user()
        app.dependency_overrides[get_current_user] = lambda: regular

        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/api/admin/api-keys",
                    json={"name": "Escalation Attempt"},
                    headers=_BEARER,
                )
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_list_rejects_non_superuser(self):
        """GET /api/admin/api-keys must reject non-superuser with 403."""
        regular = _make_regular_user()
        app.dependency_overrides[get_current_user] = lambda: regular

        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get(
                    "/api/admin/api-keys",
                    headers=_BEARER,
                )
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_revoke_rejects_non_superuser(self):
        """DELETE /api/admin/api-keys/{key_id} must reject non-superuser with 403."""
        regular = _make_regular_user()
        app.dependency_overrides[get_current_user] = lambda: regular

        try:
            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.delete(
                    "/api/admin/api-keys/some-key-id",
                    headers=_BEARER,
                )
            assert resp.status_code == 403
        finally:
            app.dependency_overrides.clear()

    @pytest.mark.asyncio
    async def test_create_rejects_unauthenticated(self):
        """POST /api/admin/api-keys must reject unauthenticated requests (401 or 403)."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/admin/api-keys",
                json={"name": "No Auth"},
            )
        # CSRF middleware may return 403 before auth dependency returns 401
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_list_rejects_unauthenticated(self):
        """GET /api/admin/api-keys must reject unauthenticated requests (401 or 403)."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/admin/api-keys")
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_revoke_rejects_unauthenticated(self):
        """DELETE /api/admin/api-keys/{key_id} must reject unauthenticated requests (401 or 403)."""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.delete("/api/admin/api-keys/some-key-id")
        assert resp.status_code in (401, 403)


# ── Service layer tests: secret_hash is computed ─────────────────────────


class TestServiceSecretHash:
    """Verify the service layer correctly computes secret_hash on creation."""

    def test_compute_secret_hash_returns_argon2_string(self):
        """compute_secret_hash must return a non-empty Argon2id hash."""
        from app.services.api_keys import compute_secret_hash

        h = compute_secret_hash("test_secret_value")
        assert isinstance(h, str)
        assert len(h) > 0
        assert "$argon2" in h

    def test_verify_secret_hash_roundtrip(self):
        """A secret hashed with compute_secret_hash must verify with verify_secret_hash."""
        from app.services.api_keys import compute_secret_hash, verify_secret_hash

        secret = "my_test_secret_abc123"
        hashed = compute_secret_hash(secret)
        assert verify_secret_hash(secret, hashed) is True

    def test_verify_secret_hash_rejects_wrong_secret(self):
        """verify_secret_hash must reject a wrong secret."""
        from app.services.api_keys import compute_secret_hash, verify_secret_hash

        hashed = compute_secret_hash("correct_secret")
        assert verify_secret_hash("wrong_secret", hashed) is False

    def test_generate_key_pair_format(self):
        """generate_key_pair must return two non-empty strings."""
        from app.services.api_keys import generate_key_pair

        key_id, secret = generate_key_pair()
        assert isinstance(key_id, str) and len(key_id) > 0
        assert isinstance(secret, str) and len(secret) > 0

    def test_format_api_token_format(self):
        """format_api_token must produce HK_live_{key_id}.{secret} format."""
        from app.services.api_keys import format_api_token

        token = format_api_token("mykey", "mysecret")
        assert token == "HK_live_mykey.mysecret"
