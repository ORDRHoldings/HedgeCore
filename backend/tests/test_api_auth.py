from __future__ import annotations

"""
tests/test_api_auth.py
HedgeCalc - Authentication API End-to-End Tests (Phase V, UUID-isolated)

Enhancements:
- Uses unique UUID-based emails per test run (no DB resets required)
- Preserves audit log integrity and avoids side effects between runs
- Tests full lifecycle: register -> login -> me -> refresh -> logout
"""

import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from uuid import UUID

from app.main import app
from app.models.user import User
from sqlalchemy import select

pytestmark = pytest.mark.asyncio


# -------------------------------------------------------------------
# ? Test Fixture Setup
# -------------------------------------------------------------------
@pytest.mark.asyncio
@pytest.fixture(scope="function")
async def async_client():
    """Provides a live ASGI test client with in-memory transport (function-scoped)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


async def _get_user_by_email(db_session, email: str) -> User | None:
    res = await db_session.execute(select(User).where(User.email == email))
    return res.scalars().first()


# -------------------------------------------------------------------
# ? Happy Path Lifecycle
# -------------------------------------------------------------------
async def test_auth_lifecycle(async_client):
    """Full lifecycle: register -> login -> me -> refresh -> logout."""
    # Generate unique test email to avoid cross-run collisions
    email = f"test_user_{uuid.uuid4().hex[:8]}@example.com"
    password = "StrongPassw0rd!"

    # --- Register ---
    r = await async_client.post("/auth/register", json={"email": email, "password": password})
    assert r.status_code == 201, r.text
    data = r.json()
    user_id = UUID(data["id"])

    # --- Login ---
    form = {"username": email, "password": password}
    r = await async_client.post("/auth/login", data=form)
    assert r.status_code == 200, r.text
    tokens = r.json()
    access_token = tokens["access_token"]
    refresh_token = tokens["refresh_token"]

    # --- /me ---
    headers = {"Authorization": f"Bearer {access_token}"}
    r = await async_client.get("/auth/me", headers=headers)
    assert r.status_code == 200, r.text
    me = r.json()
    assert me["email"] == email
    assert me["id"] == str(user_id)

    # --- Refresh ---
    r = await async_client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert r.status_code == 200, r.text
    new_pair = r.json()
    assert new_pair["access_token"] != access_token
    assert new_pair["refresh_token"] != refresh_token

    # --- Logout ---
    headers = {"Authorization": f"Bearer {new_pair['access_token']}"}
    r = await async_client.post("/auth/logout", headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["detail"] == "Logged out successfully"


# -------------------------------------------------------------------
# ?? Negative Tests
# -------------------------------------------------------------------
async def test_register_duplicate_email(async_client):
    """Duplicate registration must fail gracefully."""
    email = f"dup_{uuid.uuid4().hex[:6]}@example.com"
    password = "StrongPassw0rd!"

    r1 = await async_client.post("/auth/register", json={"email": email, "password": password})
    assert r1.status_code == 201, r1.text

    r2 = await async_client.post("/auth/register", json={"email": email, "password": password})
    assert r2.status_code == 400
    assert "already" in r2.json()["detail"].lower()


async def test_login_invalid_credentials(async_client):
    """Login with wrong password returns 401 without leaking reason."""
    email = f"nonexistent_{uuid.uuid4().hex[:6]}@example.com"
    password = "wrongpassword"
    form = {"username": email, "password": password}
    r = await async_client.post("/auth/login", data=form)
    assert r.status_code == 401
    assert "Invalid credentials" in r.json()["detail"]


async def test_me_invalid_token(async_client):
    """Accessing /me with an invalid token returns 401."""
    headers = {"Authorization": "Bearer invalid.token.value"}
    r = await async_client.get("/auth/me", headers=headers)
    assert r.status_code == 401


async def test_refresh_invalid_token(async_client):
    """Refreshing with invalid token returns 401."""
    r = await async_client.post("/auth/refresh", json={"refresh_token": "bad.token"})
    assert r.status_code == 401


async def test_logout_missing_token(async_client):
    """Logout without token must return 401."""
    r = await async_client.post("/auth/logout")
    assert r.status_code == 401


# -------------------------------------------------------------------
# ? Internal Consistency Checks
# -------------------------------------------------------------------
async def test_token_uuid_consistency(async_client):
    """Ensure JWT sub claim is a valid UUID string."""
    email = f"uuid_check_{uuid.uuid4().hex[:6]}@example.com"
    password = "StrongPassw0rd!"

    r = await async_client.post("/auth/register", json={"email": email, "password": password})
    assert r.status_code in (201, 400)

    form = {"username": email, "password": password}
    r = await async_client.post("/auth/login", data=form)
    assert r.status_code == 200
    data = r.json()
    access = data["access_token"]

    import jwt
    from app.core.config import settings

    payload = jwt.decode(access, settings.JWT_SECRET, algorithms=["HS256"], audience="users")
    assert "sub" in payload
    UUID(str(payload["sub"]))
