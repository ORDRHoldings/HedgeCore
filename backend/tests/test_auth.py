"""
HedgeCalc - Authentication API Test Suite
Phase VII: Finalized JWT + Refresh Validation

Covers:
    ? POST /auth/register
    ? POST /auth/login
    ? POST /auth/refresh
    ? GET  /auth/me
    ? Single-session policy + error normalization

Execution:
    pytest -v --disable-warnings -s
"""

import pytest
from jose import jwt
from datetime import datetime, timezone
from sqlalchemy import select

from app.core.db import async_session_maker
from app.models.user import User
from app.models.refresh_token import RefreshToken
from app.core.config import settings


# ---------------------------------------------------------------------------
# FIXTURES
# ---------------------------------------------------------------------------

@pytest.fixture(scope="function", autouse=True)
async def cleanup_db():
    """Ensure a clean DB state before each test run."""
    async with async_session_maker() as session:
        await session.execute(RefreshToken.__table__.delete())
        await session.execute(User.__table__.delete())
        await session.commit()
    yield


# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------

async def _register_user(client, email="test@hedgecalc.ai", password="StrongPass123!"):
    """Helper for user registration (returns created user payload)."""
    res = await client.post("/auth/register", json={"email": email, "password": password})
    assert res.status_code == 201, res.text
    data = res.json()
    assert "email" in data and data["email"] == email
    assert "id" in data and "is_active" in data
    return data


async def _login_user(client, email="test@hedgecalc.ai", password="StrongPass123!"):
    """Helper for login (form-based OAuth2PasswordRequestForm)."""
    res = await client.post(
        "/auth/login",
        data={"username": email, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert "access_token" in data
    assert "refresh_token" in data
    return data


def _decode_token(token: str):
    """Decode JWT token and validate claims."""
    return jwt.decode(
        token,
        settings.JWT_SECRET,
        algorithms=[settings.JWT_ALGORITHM],
        audience=settings.JWT_AUDIENCE,
    )


# ---------------------------------------------------------------------------
# TESTS
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_register_creates_user_and_tokens(client):
    """Register creates user; subsequent login returns valid tokens."""
    await _register_user(client)
    tokens = await _login_user(client)
    claims = _decode_token(tokens["access_token"])
    assert claims["type"] == "access"
    assert claims["email"] == "test@hedgecalc.ai"

    async with async_session_maker() as session:
        res = await session.execute(select(User).where(User.email == "test@hedgecalc.ai"))
        user = res.scalar_one_or_none()
        assert user is not None
        assert user.is_active


@pytest.mark.asyncio
async def test_login_returns_new_token_pair(client):
    """Ensure /auth/login authenticates and returns tokens."""
    await _register_user(client)
    payload = await _login_user(client)
    access_claims = _decode_token(payload["access_token"])
    assert access_claims["type"] == "access"


@pytest.mark.asyncio
async def test_login_rejects_invalid_password(client):
    """Ensure invalid passwords are rejected."""
    await _register_user(client)
    res = await client.post(
        "/auth/login",
        data={"username": "test@hedgecalc.ai", "password": "WrongPass"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert res.status_code == 401
    assert res.json()["detail"] == "Invalid credentials"


@pytest.mark.asyncio
async def test_refresh_rotates_token_and_revokes_old(client):
    """Ensure refresh rotation revokes old tokens and issues new pair."""
    await _register_user(client)
    initial = await _login_user(client)
    old_refresh = initial["refresh_token"]

    res = await client.post("/auth/refresh", json={"refresh_token": old_refresh})
    assert res.status_code == 200, res.text
    new_tokens = res.json()
    assert new_tokens["refresh_token"] != old_refresh

    async with async_session_maker() as session:
        old_claims = _decode_token(old_refresh)
        res = await session.execute(
            select(RefreshToken).where(RefreshToken.jti == old_claims["jti"])
        )
        token_row = res.scalar_one_or_none()
        assert token_row is not None
        assert token_row.revoked is True


@pytest.mark.asyncio
async def test_refresh_rejects_invalid_token(client):
    """Ensure invalid refresh tokens are rejected (normalized message)."""
    bad_token = "this.is.not.a.valid.jwt"
    res = await client.post("/auth/refresh", json={"refresh_token": bad_token})
    assert res.status_code == 401
    # Normalize both legacy and new wording
    assert any(msg in res.text for msg in ["Invalid refresh token", "Invalid or malformed token"])


@pytest.mark.asyncio
async def test_me_endpoint_requires_access_token(client):
    """Ensure /auth/me requires valid access token."""
    res = await client.get("/auth/me")
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_me_endpoint_returns_user_profile(client):
    """Ensure /auth/me returns correct user profile."""
    await _register_user(client)
    tokens = await _login_user(client)
    access_token = tokens["access_token"]

    res = await client.get("/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert res.status_code == 200, res.text
    payload = res.json()
    assert payload["email"] == "test@hedgecalc.ai"
    assert "is_active" in payload


@pytest.mark.asyncio
async def test_access_token_expiry_claim_structure(client):
    """Check exp claim exists and is valid datetime or timestamp."""
    await _register_user(client)
    tokens = await _login_user(client)
    claims = _decode_token(tokens["access_token"])
    exp_val = claims["exp"]
    if isinstance(exp_val, datetime):
        exp = exp_val
    else:
        exp = datetime.fromtimestamp(float(exp_val), tz=timezone.utc)
    assert exp > datetime.now(timezone.utc)
    assert claims["iss"] == settings.JWT_ISSUER
    assert claims["aud"] == settings.JWT_AUDIENCE


@pytest.mark.asyncio
async def test_single_session_policy(client):
    """Verify only one refresh token remains active per user (rate-limit safe)."""
    # disable rate-limit explicitly for test
    settings.RATE_LIMIT_LOGIN_PER_MIN = 9999

    await _register_user(client)
    first_tokens = await _login_user(client)
    second = await client.post(
        "/auth/login",
        data={"username": "test@hedgecalc.ai", "password": "StrongPass123!"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert second.status_code in (200, 201), f"Unexpected login code {second.status_code}"
    new_refresh = second.json()["refresh_token"]

    async with async_session_maker() as session:
        old_claims = _decode_token(first_tokens["refresh_token"])
        res = await session.execute(
            select(RefreshToken).where(RefreshToken.jti == old_claims["jti"])
        )
        old_row = res.scalar_one_or_none()
        assert old_row is not None
        assert old_row.revoked is True

        new_claims = _decode_token(new_refresh)
        res = await session.execute(
            select(RefreshToken).where(RefreshToken.jti == new_claims["jti"])
        )
        new_row = res.scalar_one_or_none()
        assert new_row is not None
        assert new_row.revoked is False
