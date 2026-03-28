"""
Tests: sso_service.py — WorkOS token validation and user resolution.
All WorkOS SDK calls are mocked.
"""
import pytest
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.sso_service import (
    SSOUserProfile,
    resolve_or_create_sso_user,
    WorkOSNotConfiguredError,
)


def make_workos_profile(email="alice@acme.com", org_id="org_123", first="Alice", last="Smith"):
    profile = MagicMock()
    profile.email = email
    profile.organization_id = org_id
    profile.first_name = first
    profile.last_name = last
    profile.id = "sso_profile_abc"
    return profile


def test_sso_user_profile_dataclass():
    p = SSOUserProfile(
        email="alice@acme.com",
        full_name="Alice Smith",
        sso_profile_id="sso_profile_abc",
        organization_id="org_123",
    )
    assert p.email == "alice@acme.com"


@pytest.mark.asyncio
async def test_raises_when_workos_not_configured():
    with patch("app.services.sso_service.settings") as mock_settings:
        mock_settings.WORKOS_API_KEY = ""
        mock_settings.WORKOS_CLIENT_ID = ""
        with pytest.raises(WorkOSNotConfiguredError):
            await resolve_or_create_sso_user(
                db=AsyncMock(),
                code="auth_code_123",
            )


@pytest.mark.asyncio
async def test_resolve_sso_user_existing_user():
    """If user with matching email already exists, return them without creating new user."""
    existing_user = MagicMock()
    existing_user.id = uuid.uuid4()
    existing_user.email = "alice@acme.com"

    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = existing_user
    mock_db.execute.return_value = mock_result

    mock_profile = make_workos_profile()

    with patch("app.services.sso_service.settings") as mock_settings, \
         patch("app.services.sso_service.workos") as mock_wos:
        mock_settings.WORKOS_API_KEY = "sk_test_abc"
        mock_settings.WORKOS_CLIENT_ID = "client_123"
        mock_wos.user_management.authenticate_with_code.return_value = MagicMock(
            user=mock_profile,
            organization_id="org_123",
        )
        result = await resolve_or_create_sso_user(db=mock_db, code="auth_code_123")

    assert result == existing_user


@pytest.mark.asyncio
async def test_resolve_sso_user_new_user():
    """If no user with matching email exists, a new user is created with
    is_active=True and a sentinel password that cannot match any bcrypt hash."""
    mock_db = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalars.return_value.first.return_value = None
    mock_db.execute.return_value = mock_result
    mock_db.flush = AsyncMock()
    mock_db.refresh = AsyncMock()

    mock_profile = make_workos_profile(email="new@acme.com")

    with patch("app.services.sso_service.settings") as mock_settings, \
         patch("app.services.sso_service.workos") as mock_wos:
        mock_settings.WORKOS_API_KEY = "sk_test_abc"
        mock_settings.WORKOS_CLIENT_ID = "client_123"
        mock_wos.user_management.authenticate_with_code.return_value = MagicMock(
            user=mock_profile,
            organization_id="org_123",
        )
        result = await resolve_or_create_sso_user(db=mock_db, code="auth_code_new")

    assert mock_db.add.called
    added_user = mock_db.add.call_args[0][0]
    assert added_user.is_active is True
    assert added_user.hashed_password.startswith("!")
