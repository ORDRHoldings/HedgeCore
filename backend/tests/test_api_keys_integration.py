"""
tests/test_api_keys_integration.py

HedgeCalc - Phase VII
Integration tests for Service API Keys & Integration Tokens.

Covers:
- Creation (returns full token once)
- Header verification (X-API-Key)
- Scope enforcement
- Revocation and rotation
- Expiration handling
- Admin-only access guards

Requires:
- Running test database (async)
- Admin user and JWT auth from Phase V
"""

import pytest
from datetime import UTC, datetime, timedelta
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.db import async_session_maker
from app.models.api_key import ApiKey, ApiKeyStatus
from app.services.api_keys import (
    create_api_key,
    verify_api_key_header,
    revoke_api_key,
    rotate_api_key,
)

# ---------------------------------------------------------------------
# ? Pytest configuration
# ---------------------------------------------------------------------
pytestmark = [pytest.mark.asyncio, pytest.mark.requires_postgres]


@pytest.fixture(scope="function")
async def async_client():
    """Provide async HTTP client bound to FastAPI app (httpx >= 0.28 safe).

    Uses ASGITransport instead of deprecated `app=` argument.
    Scope set to 'function' to align with pytest-asyncio loop scope.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


@pytest.fixture(scope="function")
async def db_session():
    """Provide a temporary AsyncSession for tests."""
    async with async_session_maker() as session:
        yield session


# ---------------------------------------------------------------------
# ? API Key Creation and Basic Verification
# ---------------------------------------------------------------------
async def test_create_api_key(db_session):
    """Ensure API key can be created and stored correctly."""
    api_key, token = await create_api_key(
        db_session,
        name="Test Key 1",
        scopes=["read:data"],
        owner_user_id=None,
        expires_at=datetime.now(UTC) + timedelta(days=7),
    )

    assert isinstance(token, str)
    assert token.startswith("HK_live_")
    assert api_key.status == ApiKeyStatus.ACTIVE
    assert "read:data" in api_key.scopes


# ---------------------------------------------------------------------
# ? Header Verification Flow
# ---------------------------------------------------------------------
async def test_verify_api_key_header_valid(db_session):
    """Valid X-API-Key should resolve to active ApiKey object."""
    api_key, token = await create_api_key(
        db_session,
        name="Verify Key",
        scopes=["read:quotes"],
        owner_user_id=None,
        expires_at=None,
    )

    verified = await verify_api_key_header(db_session, token, required_scopes=["read:quotes"])
    assert verified is not None
    assert verified.key_id == api_key.key_id
    assert verified.status == ApiKeyStatus.ACTIVE


async def test_verify_api_key_header_invalid_format(db_session):
    """Invalid key format should return None (graceful fail)."""
    verified = await verify_api_key_header(db_session, "badformatkey", required_scopes=[])
    assert verified is None


# ---------------------------------------------------------------------
# ? Revocation Behavior
# ---------------------------------------------------------------------
async def test_revoke_api_key_blocks_future_access(db_session):
    """Revoked keys should fail verification."""
    api_key, token = await create_api_key(
        db_session,
        name="Revocable Key",
        scopes=["read:orders"],
        owner_user_id=None,
        expires_at=None,
    )

    # revoke it
    await revoke_api_key(db_session, api_key.key_id)

    # attempt to verify
    verified = await verify_api_key_header(db_session, token, required_scopes=["read:orders"])
    assert verified is None


# ---------------------------------------------------------------------
# ? Rotation Behavior
# ---------------------------------------------------------------------
async def test_rotate_api_key_replaces_secret(db_session):
    """After rotation, old secret fails and new secret works."""
    api_key, token_old = await create_api_key(
        db_session,
        name="Rotatable Key",
        scopes=["read:data"],
        owner_user_id=None,
        expires_at=None,
    )

    rotated = await rotate_api_key(db_session, api_key.key_id)
    assert rotated is not None
    api_key_new, token_new = rotated

    # old token should now fail
    invalid = await verify_api_key_header(db_session, token_old, required_scopes=["read:data"])
    assert invalid is None

    # new token should succeed
    valid = await verify_api_key_header(db_session, token_new, required_scopes=["read:data"])
    assert valid is not None
    assert valid.key_id == api_key_new.key_id


# ---------------------------------------------------------------------
# ? Expiration Handling
# ---------------------------------------------------------------------
async def test_expired_key_fails_verification(db_session):
    """Keys past expiration timestamp should be invalid."""
    api_key, token = await create_api_key(
        db_session,
        name="Expired Key",
        scopes=["read:data"],
        owner_user_id=None,
        expires_at=datetime.now(UTC) - timedelta(seconds=5),
    )

    verified = await verify_api_key_header(db_session, token, required_scopes=["read:data"])
    assert verified is None


# ---------------------------------------------------------------------
# ? Admin Guard Integration (Smoke Test)
# ---------------------------------------------------------------------
async def test_admin_guard_requires_jwt(async_client):
    """Ensure admin-only endpoints return 401 when missing JWT."""
    resp = await async_client.get("/api/admin/api-keys")
    assert resp.status_code == 401
    assert "Unauthorized" in resp.text or "Missing" in resp.text
